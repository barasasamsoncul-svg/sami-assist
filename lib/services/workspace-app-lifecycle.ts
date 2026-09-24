import 'server-only';

import fs from 'fs/promises';
import path from 'path';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
} from '@/lib/db/control';

import {
  getTenantDatabaseName,
} from '@/lib/db/registry';

import {
  getTenantPool,
} from '@/lib/db/tenant';

import {
  getCanonicalAppKey,
} from '@/lib/apps/navigation-registry';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';

import {
  appendEnterpriseSchemaHardening,
} from '@/lib/apps/enterprise/hardening';

import {
  runSamiModuleMigrations,
  SamiModuleMigrationError,
} from '@/lib/modules/migrations';

import {
  resolveRequiredDependencyPlan,
} from '@/lib/modules/dependency-plan';

import {
  getPermissionContext,
  permissionContextHas,
  type PermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  synchronizeModulePermissions,
} from '@/lib/auth/module-permissions';

import {
  getWorkspaceSubscriptionAccessStateWithClient,
} from '@/lib/billing/access';


export type WorkspaceAppAuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
};


export type WorkspaceAppLifecycleCode =
  | 'INVALID_APP'
  | 'APP_NOT_FOUND'
  | 'APP_UNAVAILABLE'
  | 'APPS_MANAGE_REQUIRED'
  | 'WORKSPACE_NOT_READY'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'APP_CHANGE_IN_PROGRESS'
  | 'APP_CORE_PROTECTED'
  | 'APP_NOT_INSTALLED'
  | 'APP_DEPENDENCY_BLOCKED'
  | 'APP_DEPENDENCY_CYCLE'
  | 'APP_NOT_INSTALLABLE'
  | 'APP_SUBSCRIPTION_REQUIRED'
  | 'APP_PLAN_UPGRADE_REQUIRED'
  | 'APP_SCHEMA_MISSING'
  | 'APP_SCHEMA_UNSAFE'
  | 'APP_SCHEMA_FAILED'
  | 'APP_MIGRATION_MISSING'
  | 'APP_MIGRATION_UNSAFE'
  | 'APP_MIGRATION_FAILED'
  | 'APP_PERMISSION_SYNC_FAILED'
  | 'APP_DOWNGRADE_UNSUPPORTED';


export class WorkspaceAppLifecycleError
  extends Error {
  readonly code:
    WorkspaceAppLifecycleCode;

  readonly details:
    Record<string, unknown>;

  constructor(
    code:
      WorkspaceAppLifecycleCode,
    message:
      string,
    details:
      Record<string, unknown> = {},
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceAppLifecycleError';

    this.code =
      code;

    this.details =
      details;
  }
}


type ModuleRow = {
  id: string;
  key: string;
  name: string;
  version: string;
  status: string;
  is_core: boolean;
  dependencies: unknown;
};


type TenantModuleRow = {
  id: string;
  status: string;
  version: string | null;
  installed_at:
    Date | string | null;
};


type LifecycleAction =
  | 'install'
  | 'enable';


const ACTIVE_STATUSES =
  new Set([
    'installed',
    'active',
    'enabled',
  ]);


function normalizeKey(
  value:
    unknown,
): string {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}


function normalizeDependencies(
  value:
    unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          item =>
            normalizeKey(
              item,
            ),
        )
        .filter(
          Boolean,
        ),
    ),
  ];
}


function assertManagePermission(
  context:
    PermissionContext,
) {
  if (
    context.isOwner ||
    permissionContextHas(
      context,
      SAMI_PERMISSIONS
        .APPS_MANAGE,
    )
  ) {
    return;
  }

  throw new WorkspaceAppLifecycleError(
    'APPS_MANAGE_REQUIRED',
    'You do not have permission to manage workspace apps.',
  );
}


async function assertContextStillCurrent(
  original:
    PermissionContext,
): Promise<PermissionContext> {
  const current =
    await getPermissionContext();

  if (
    current.userId !==
      original.userId ||
    current.sessionId !==
      original.sessionId ||
    current.tenantId !==
      original.tenantId
  ) {
    throw new WorkspaceAppLifecycleError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  assertManagePermission(
    current,
  );

  return current;
}


async function assertWorkspaceReady(
  client:
    PoolClient,
  tenantId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          status

        FROM tenants

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );

  const status =
    normalizeKey(
      result.rows[0]
        ?.status,
    );

  if (
    status !==
      'active'
  ) {
    throw new WorkspaceAppLifecycleError(
      'WORKSPACE_NOT_READY',
      'This workspace is not ready for app changes.',
    );
  }
}


async function getModule(
  client:
    PoolClient,
  moduleKey:
    string,
): Promise<ModuleRow> {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest ||
    !manifest.installable
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_NOT_FOUND',
      'This app is not registered in the SaMi module runtime.',
    );
  }

  const result =
    await client.query(
      `
        SELECT
          id,
          key,
          name,
          version,
          status,
          COALESCE(
            is_core,
            FALSE
          )
            AS is_core,
          COALESCE(
            dependencies,
            '[]'::jsonb
          )
            AS dependencies

        FROM modules

        WHERE LOWER(
          key
        ) =
        LOWER(
          $1
        )

          AND deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        moduleKey,
      ],
    );

  if (
    result.rows.length ===
      0
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_NOT_FOUND',
      'This app is not registered in SaMi.',
    );
  }

  const row =
    result.rows[0];

  if (
    normalizeKey(
      row.status,
    ) !==
      'active'
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_UNAVAILABLE',
      'This app is currently unavailable.',
    );
  }

  return {
    id:
      String(
        row.id,
      ),
    key:
      normalizeKey(
        row.key,
      ),
    name:
      typeof row.name ===
        'string'
        ? row.name
        : moduleKey,
    /*
     * Runtime target version comes from the code-owned manifest.
     * The Control DB catalog remains descriptive metadata and may
     * temporarily lag during a deploy before control migrations run.
     */
    version:
      manifest.version,
    status:
      normalizeKey(
        row.status,
      ),
    is_core:
      row.is_core ===
      true,
    dependencies:
      [
        ...new Set([
          ...normalizeDependencies(
            row.dependencies,
          ),
          ...manifest.depends.map(
            normalizeKey,
          ),
        ]),
      ],
  };
}


async function synchronizeRuntimeModulePermissions(
  moduleKey:
    string,
) {
  const manifest =
    getSamiModuleManifest(
      moduleKey,
    );

  if (
    !manifest
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_PERMISSION_SYNC_FAILED',
      `SaMi could not resolve the permission contract for module "${moduleKey}".`,
    );
  }

  try {
    await synchronizeModulePermissions({
      moduleKey:
        manifest.key,
      permissions:
        manifest.security
          .permissions,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Module permission synchronization failed:',
      {
        moduleKey,
        error,
      },
    );

    throw new WorkspaceAppLifecycleError(
      'APP_PERMISSION_SYNC_FAILED',
      `${manifest.name} permissions could not be synchronized safely.`,
    );
  }
}


async function getTenantModule(
  client:
    PoolClient,
  tenantId:
    string,
  moduleId:
    string,
): Promise<TenantModuleRow | null> {
  const result =
    await client.query(
      `
        SELECT
          id,
          status,
          version,
          installed_at

        FROM tenant_modules

        WHERE tenant_id = $1
          AND module_id = $2

        LIMIT 1
      `,
      [
        tenantId,
        moduleId,
      ],
    );

  if (
    result.rows.length ===
      0
  ) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    id:
      String(
        row.id,
      ),
    status:
      normalizeKey(
        row.status,
      ),
    version:
      typeof row.version ===
        'string'
        ? row.version
        : null,
    installed_at:
      row.installed_at ??
      null,
  };
}


async function readAppSchema(
  appKey:
    string,
): Promise<string> {
  const manifest =
    getSamiModuleManifest(
      appKey,
    );

  if (
    !manifest ||
    !manifest.schemaPath
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_MISSING',
      'This app manifest does not declare an install schema.',
    );
  }

  const normalizedManifestPath =
    manifest.schemaPath
      .replace(
        /\\/g,
        '/',
      )
      .replace(
        /^\.\//,
        '',
      );

  const expectedPrefix =
    `lib/apps/${manifest.key}/`;

  if (
    !normalizedManifestPath.startsWith(
      expectedPrefix,
    ) ||
    normalizedManifestPath.includes(
      '..',
    )
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_UNSAFE',
      'This app manifest points outside its registered module directory.',
    );
  }

  const schemaFileName =
    path.posix.basename(
      normalizedManifestPath,
    );

  if (
    !schemaFileName ||
    !schemaFileName.endsWith(
      '.sql',
    )
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_MISSING',
      'This app manifest does not declare a valid SQL install schema.',
    );
  }

  /*
   * Keep the filesystem trace statically scoped to lib/apps/<module>.
   *
   * A fully dynamic path.join(process.cwd(), ...manifestPathSegments)
   * makes Turbopack/NFT conservatively trace the whole project. The
   * manifest remains the canonical declaration, but code-owned module
   * identity constrains where the file may be read from.
   */
  const schemaPath =
    path.join(
      process.cwd(),
      'lib',
      'apps',
      manifest.key,
      schemaFileName,
    );

  try {
    const schema =
      await fs.readFile(
        schemaPath,
        'utf8',
      );

    if (
      !schema.trim()
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_SCHEMA_MISSING',
        'This app is not ready to install.',
      );
    }

    return schema;
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceAppLifecycleError
    ) {
      throw error;
    }

    const nodeError =
      error as
        NodeJS.ErrnoException;

    if (
      nodeError.code ===
        'ENOENT'
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_SCHEMA_MISSING',
        'This app is not ready to install.',
      );
    }

    throw error;
  }
}


const INVOICING_MANAGED_TABLES = [
  'invoice_events',
  'payment_allocations',
  'invoice_status_history',
  'invoice_activity_log',
  'invoice_reminders',
  'recurring_invoices',
  'credit_notes',
  'payments',
  'invoice_items',
  'invoices_archive',
  'invoices',
  'invoice_settings',
  'invoice_templates',
  'products',
  'tax_rates',
  'payment_terms',
  'customers',
] as const;


async function prepareInstallSchema(
  appKey:
    string,
  schema:
    string,
  databaseName:
    string,
): Promise<string> {
  const destructiveTopLevel =
    /^\s*(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE\b)/gim;

  if (
    !destructiveTopLevel.test(
      schema,
    )
  ) {
    return appendEnterpriseSchemaHardening(
      appKey,
      schema,
    );
  }

  /*
   * The current Invoicing v3 schema was authored as a replacement
   * script and starts by dropping its own tables. That is NOT safe
   * for normal workspace installation.
   *
   * For a true first install we verify that none of the managed
   * tables already exists, then remove only those legacy DROP TABLE
   * statements before execution. Any unexpected pre-existing table
   * causes a hard stop rather than risking business data.
   */
  if (
    appKey !==
      'invoicing'
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_UNSAFE',
      'This app install package contains destructive database operations and cannot be installed from Workspace Apps.',
    );
  }

  const tenantPool =
    getTenantPool(
      databaseName,
    );

  const existing =
    await tenantPool.query(
      `
        SELECT
          table_name

        FROM information_schema.tables

        WHERE table_schema =
              'public'

          AND table_name =
              ANY(
                $1::text[]
              )
      `,
      [
        [
          ...INVOICING_MANAGED_TABLES,
        ],
      ],
    );

  if (
    existing.rows.length >
      0
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_UNSAFE',
      'Invoicing data already exists in this workspace, so SaMi will not run the legacy replacement installer.',
      {
        existingTables:
          existing.rows.map(
            row =>
              String(
                row.table_name,
              ),
          ),
      },
    );
  }

  const managedTableSet =
    new Set<string>(
      INVOICING_MANAGED_TABLES,
    );

  const sanitized =
    schema.replace(
      /^\s*DROP\s+TABLE\s+IF\s+EXISTS\s+public\.([a-z0-9_]+)\s+CASCADE\s*;\s*$/gim,
      (
        statement,
        tableName:
          string,
      ) =>
        managedTableSet.has(
          tableName,
        )
          ? ''
          : statement,
    );

  if (
    /^\s*(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE\b)/im.test(
      sanitized,
    )
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SCHEMA_UNSAFE',
      'The Invoicing install package still contains an unsafe database operation.',
    );
  }

  return sanitized;
}


async function resolveInstallPlan(
  client:
    PoolClient,
  rootKey:
    string,
): Promise<ModuleRow[]> {
  try {
    return await resolveRequiredDependencyPlan({
      rootKeys: [
        rootKey,
      ],
      load:
        key =>
          getModule(
            client,
            key,
          ),
      dependencies:
        module => {
          const manifest =
            getSamiModuleManifest(
              module.key,
            );

          return [
            ...new Set([
              ...normalizeDependencies(
                module.dependencies,
              ),
              ...(
                manifest
                  ?.depends ||
                []
              )
                .map(
                  normalizeKey,
                )
                .filter(
                  Boolean,
                ),
            ]),
          ];
        },
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceAppLifecycleError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.message.includes(
        'dependency cycle',
      )
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_DEPENDENCY_CYCLE',
        'SaMi detected an invalid app dependency cycle.',
      );
    }

    throw error;
  }
}

async function assertInstallPlanEntitled(
  client:
    PoolClient,
  tenantId:
    string,
  installPlan:
    ModuleRow[],
) {
  const access =
    await getWorkspaceSubscriptionAccessStateWithClient(
      client,
      tenantId,
    );

  const policy =
    access.policy;

  if (
    !policy ||
    !access.entitled
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_SUBSCRIPTION_REQUIRED',
      'An active SaMi subscription is required before workspace apps can be changed.',
      {
        billingHref:
          '/settings?tab=billing',
      },
    );
  }

  const appLimits =
    [
      policy.apps
        .maxInstalledBusinessApps,
      access.scheduledPolicy
        ?.apps
        .maxInstalledBusinessApps ??
        null,
    ]
      .filter(
        (
          value,
        ): value is number =>
          value !==
          null,
      );

  const limit =
    appLimits.length >
      0
      ? Math.min(
          ...appLimits,
        )
      : null;

  if (
    limit ===
      null
  ) {
    return;
  }

  const active =
    await client.query(
      `
        SELECT
          LOWER(
            m.key
          )
            AS key
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.deleted_at
              IS NULL
          AND m.deleted_at
              IS NULL
          AND COALESCE(
                m.is_core,
                FALSE
              ) =
              FALSE
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
      `,
      [
        tenantId,
      ],
    );

  const prospective =
    new Set(
      active.rows
        .map(
          item =>
            normalizeKey(
              item.key,
            ),
        )
        .filter(
          Boolean,
        ),
    );

  for (
    const module
    of installPlan
  ) {
    if (
      !module.is_core
    ) {
      prospective.add(
        module.key,
      );
    }
  }

  if (
    prospective.size >
      limit
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_PLAN_UPGRADE_REQUIRED',
      'This app and its required dependencies exceed the Free plan app allowance. Upgrade to Standard or Custom to install all required business apps.',
      {
        currentPlan:
          policy.key,
        scheduledPlan:
          access.scheduledPlanKey,
        maxInstalledBusinessApps:
          limit,
        prospectiveBusinessApps:
          prospective.size,
        requiredApps:
          installPlan
            .filter(
              module =>
                !module.is_core,
            )
            .map(
              module => ({
                key:
                  module.key,
                name:
                  module.name,
              }),
            ),
        requiredPlan:
          'standard',
        billingHref:
          '/settings?tab=billing',
      },
    );
  }
}


async function getActiveDependents(
  client:
    PoolClient,
  tenantId:
    string,
  moduleKey:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          m.key,
          m.name,
          COALESCE(
            m.dependencies,
            '[]'::jsonb
          )
            AS dependencies

        FROM tenant_modules tm

        INNER JOIN modules m
          ON m.id =
             tm.module_id

        WHERE tm.tenant_id =
              $1

          AND tm.deleted_at
              IS NULL

          AND m.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              m.status,
              ''
            )
          ) =
          'active'

          AND LOWER(
            COALESCE(
              tm.status,
              ''
            )
          ) IN (
            'installed',
            'active',
            'enabled'
          )

        ORDER BY
          LOWER(
            m.name
          )
      `,
      [
        tenantId,
      ],
    );

  const dependencyKey =
    normalizeKey(
      moduleKey,
    );

  return result.rows
    .filter(
      row => {
        const key =
          normalizeKey(
            row.key,
          );

        const manifest =
          getSamiModuleManifest(
            key,
          );

        const dependencies =
          new Set([
            ...normalizeDependencies(
              row.dependencies,
            ),
            ...(
              manifest
                ?.depends ||
              []
            ).map(
              normalizeKey,
            ),
          ]);

        return dependencies.has(
          dependencyKey,
        );
      },
    )
    .map(
      row => ({
        key:
          normalizeKey(
            row.key,
          ),
        name:
          typeof row.name ===
            'string'
            ? row.name
            : normalizeKey(
                row.key,
              ),
      }),
    );
}

async function recordAudit(
  client:
    PoolClient,
  params: {
    tenantId: string;
    userId: string;
    eventType: string;
    moduleId: string;
    metadata?: Record<string, unknown>;
    audit?: WorkspaceAppAuditContext;
  },
) {
  const moduleKey =
    typeof params.metadata
      ?.appKey ===
      'string'
      ? params.metadata
          .appKey
      : null;

  try {
    await client.query(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          module,
          result,
          metadata,
          ip_address,
          user_agent,
          event_type,
          entity_type,
          entity_id,
          created_at
        )

        VALUES (
          $1,
          $2,
          'human',
          $3,
          'module',
          $4,
          $5,
          'success',
          $6,
          $7,
          $8,
          $3,
          'module',
          $4,
          NOW()
        )
      `,
      [
        params.tenantId,
        params.userId,
        params.eventType,
        params.moduleId,
        moduleKey,
        JSON.stringify({
          correlationId:
            params.audit
              ?.correlationId ||
            null,
          ...(
            params.metadata ||
            {}
          ),
        }),
        params.audit
          ?.ipAddress ||
        null,
        params.audit
          ?.userAgent ||
        null,
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Workspace app audit write failed:',
      error,
    );
  }
}

async function activateWorkspaceApp(
  appKey:
    string,
  action:
    LifecycleAction,
  audit?:
    WorkspaceAppAuditContext,
) {
  const canonicalKey =
    getCanonicalAppKey(
      appKey,
    );

  const requestedManifest =
    canonicalKey
      ? getSamiModuleManifest(
          canonicalKey,
        )
      : null;

  if (
    !canonicalKey ||
    !requestedManifest
  ) {
    throw new WorkspaceAppLifecycleError(
      'INVALID_APP',
      'Choose a valid SaMi app.',
    );
  }

  if (
    !requestedManifest
      .installable
  ) {
    throw new WorkspaceAppLifecycleError(
      'APP_NOT_INSTALLABLE',
      'This SaMi app is in the catalog but is not available to install yet.',
      {
        appKey:
          canonicalKey,
      },
    );
  }

  const initialContext =
    await getPermissionContext();

  assertManagePermission(
    initialContext,
  );

  const controlClient =
    await getControlPool()
      .connect();

  const lockKey =
    `sami:workspace-apps:${initialContext.tenantId}`;

  let locked =
    false;

  try {
    const lockResult =
      await controlClient.query(
        `
          SELECT
            pg_try_advisory_lock(
              hashtext(
                $1
              )
            )
              AS locked
        `,
        [
          lockKey,
        ],
      );

    locked =
      lockResult.rows[0]
        ?.locked ===
      true;

    if (
      !locked
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_CHANGE_IN_PROGRESS',
        'Another app change is already in progress. Please try again.',
      );
    }

    const context =
      await assertContextStillCurrent(
        initialContext,
      );

    await assertWorkspaceReady(
      controlClient,
      context.tenantId,
    );

    const databaseName =
      await getTenantDatabaseName(
        context.tenantId,
      );

    if (
      !databaseName
    ) {
      throw new WorkspaceAppLifecycleError(
        'WORKSPACE_NOT_READY',
        'This workspace database is not ready for app installation.',
      );
    }

    const plan =
      await resolveInstallPlan(
        controlClient,
        canonicalKey,
      );

    await assertInstallPlanEntitled(
      controlClient,
      context.tenantId,
      plan,
    );

    const root =
      plan[
        plan.length -
        1
      ];

    if (
      !root
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_NOT_FOUND',
        'This app could not be resolved.',
      );
    }

    if (
      root.is_core
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_CORE_PROTECTED',
        'Core SaMi platform components cannot be installed from Workspace Apps.',
      );
    }

    const tenantPool =
      getTenantPool(
        databaseName,
      );

    const installedDependencies:
      string[] = [];

    for (
      const module
      of plan
    ) {
      const existing =
        await getTenantModule(
          controlClient,
          context.tenantId,
          module.id,
        );

      if (
        existing &&
        ACTIVE_STATUSES.has(
          existing.status,
        )
      ) {
        if (
          existing.version &&
          existing.version !==
            module.version
        ) {
          try {
            await runSamiModuleMigrations({
              tenantPool,
              moduleKey:
                module.key,
              currentVersion:
                existing.version,
              targetVersion:
                module.version,
            });

            await controlClient.query(
              `
                UPDATE tenant_modules
                SET
                  version = $3,
                  updated_at = NOW()
                WHERE tenant_id = $1
                  AND module_id = $2
              `,
              [
                context.tenantId,
                module.id,
                module.version,
              ],
            );
          } catch (
            error
          ) {
            if (
              error instanceof
                SamiModuleMigrationError
            ) {
              if (
                error.code ===
                  'MODULE_MIGRATION_PATH_MISSING'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_MIGRATION_MISSING',
                  error.message,
                );
              }

              if (
                error.code ===
                  'MODULE_MIGRATION_UNSAFE' ||
                error.code ===
                  'MODULE_MIGRATION_REGISTRY_INVALID'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_MIGRATION_UNSAFE',
                  error.message,
                );
              }

              if (
                error.code ===
                  'MODULE_DOWNGRADE_UNSUPPORTED'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_DOWNGRADE_UNSUPPORTED',
                  error.message,
                );
              }

              throw new WorkspaceAppLifecycleError(
                'APP_MIGRATION_FAILED',
                error.message,
              );
            }

            throw error;
          }
        }

        await synchronizeRuntimeModulePermissions(
          module.key,
        );

        continue;
      }

      const previousVersion =
        existing
          ?.version ||
        module.version;

      const hadSuccessfulInstall =
        Boolean(
          existing
            ?.installed_at,
        ) &&
        existing
          ?.status !==
          'failed';

      await controlClient.query(
        `
          INSERT INTO tenant_modules (
            tenant_id,
            module_id,
            version,
            status,
            installed_at,
            uninstalled_at,
            deleted_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,
            'pending',
            NULL,
            NULL,
            NULL,
            NOW()
          )

          ON CONFLICT (
            tenant_id,
            module_id
          )

          DO UPDATE SET
            version =
              COALESCE(
                tenant_modules.version,
                EXCLUDED.version
              ),
            status =
              'pending',
            uninstalled_at =
              NULL,
            deleted_at =
              NULL,
            updated_at =
              NOW()
        `,
        [
          context.tenantId,
          module.id,
          module.version,
        ],
      );

      try {
        if (
          !hadSuccessfulInstall
        ) {
          const rawSchema =
            await readAppSchema(
              module.key,
            );

          const schema =
            await prepareInstallSchema(
              module.key,
              rawSchema,
              databaseName,
            );

          const schemaClient =
            await tenantPool.connect();

          try {
            await schemaClient.query(
              'BEGIN',
            );

            await schemaClient.query(
              schema,
            );

            await schemaClient.query(
              'COMMIT',
            );
          } catch (
            error
          ) {
            try {
              await schemaClient.query(
                'ROLLBACK',
              );
            } catch {
              // Preserve the original schema error.
            }

            throw error;
          } finally {
            schemaClient.release();
          }
        } else if (
          previousVersion !==
            module.version
        ) {
          try {
            await runSamiModuleMigrations({
              tenantPool,
              moduleKey:
                module.key,
              currentVersion:
                previousVersion,
              targetVersion:
                module.version,
            });
          } catch (
            error
          ) {
            if (
              error instanceof
                SamiModuleMigrationError
            ) {
              if (
                error.code ===
                  'MODULE_MIGRATION_PATH_MISSING'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_MIGRATION_MISSING',
                  error.message,
                );
              }

              if (
                error.code ===
                  'MODULE_MIGRATION_UNSAFE' ||
                error.code ===
                  'MODULE_MIGRATION_REGISTRY_INVALID'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_MIGRATION_UNSAFE',
                  error.message,
                );
              }

              if (
                error.code ===
                  'MODULE_DOWNGRADE_UNSUPPORTED'
              ) {
                throw new WorkspaceAppLifecycleError(
                  'APP_DOWNGRADE_UNSUPPORTED',
                  error.message,
                );
              }

              throw new WorkspaceAppLifecycleError(
                'APP_MIGRATION_FAILED',
                error.message,
              );
            }

            throw error;
          }
        }

        await controlClient.query(
          `
            UPDATE tenant_modules

            SET
              version =
                $3,
              status =
                'installed',
              installed_at =
                COALESCE(
                  installed_at,
                  NOW()
                ),
              uninstalled_at =
                NULL,
              deleted_at =
                NULL,
              updated_at =
                NOW()

            WHERE tenant_id =
                  $1

              AND module_id =
                  $2
          `,
          [
            context.tenantId,
            module.id,
            module.version,
          ],
        );

        await synchronizeRuntimeModulePermissions(
          module.key,
        );
      } catch (
        error
      ) {
        await controlClient.query(
          `
            UPDATE tenant_modules

            SET
              status =
                'failed',
              updated_at =
                NOW()

            WHERE tenant_id =
                  $1

              AND module_id =
                  $2
          `,
          [
            context.tenantId,
            module.id,
          ],
        );

        console.error(
          '[SaMi] Workspace app schema installation failed:',
          {
            tenantId:
              context.tenantId,
            moduleKey:
              module.key,
            error,
          },
        );

        if (
          error instanceof
            WorkspaceAppLifecycleError
        ) {
          throw error;
        }

        throw new WorkspaceAppLifecycleError(
          'APP_SCHEMA_FAILED',
          `${module.name} could not be installed. No existing app data was deleted.`,
        );
      }

      if (
        module.key !==
          root.key
      ) {
        installedDependencies.push(
          module.key,
        );
      }
    }

    await recordAudit(
      controlClient,
      {
        tenantId:
          context.tenantId,
        userId:
          context.userId,
        eventType:
          action ===
            'enable'
            ? 'workspace_app.enabled'
            : 'workspace_app.installed',
        moduleId:
          root.id,
        metadata: {
          appKey:
            root.key,
          dependenciesInstalled:
            installedDependencies,
        },
        audit,
      },
    );

    return {
      key:
        root.key,
      name:
        root.name,
      version:
        root.version,
      status:
        'installed',
      dependenciesInstalled:
        installedDependencies,
      message:
        action ===
          'enable'
          ? `${root.name} is enabled.`
          : installedDependencies.length >
              0
            ? `${root.name} is installed with its required apps.`
            : `${root.name} is installed.`,
    };
  } finally {
    if (
      locked
    ) {
      try {
        await controlClient.query(
          `
            SELECT
              pg_advisory_unlock(
                hashtext(
                  $1
                )
              )
          `,
          [
            lockKey,
          ],
        );
      } catch {
        // Connection release also releases session advisory locks.
      }
    }

    controlClient.release();
  }
}


async function deactivateWorkspaceApp(
  appKey:
    string,
  action:
    'disable' | 'uninstall',
  audit?:
    WorkspaceAppAuditContext,
) {
  const canonicalKey =
    getCanonicalAppKey(
      appKey,
    );

  if (
    !canonicalKey ||
    !getSamiModuleManifest(
      canonicalKey,
    )
  ) {
    throw new WorkspaceAppLifecycleError(
      'INVALID_APP',
      'Choose a valid SaMi app.',
    );
  }

  const initialContext =
    await getPermissionContext();

  assertManagePermission(
    initialContext,
  );

  const controlClient =
    await getControlPool()
      .connect();

  const lockKey =
    `sami:workspace-apps:${initialContext.tenantId}`;

  let locked =
    false;

  try {
    const lockResult =
      await controlClient.query(
        `
          SELECT
            pg_try_advisory_lock(
              hashtext(
                $1
              )
            )
              AS locked
        `,
        [
          lockKey,
        ],
      );

    locked =
      lockResult.rows[0]
        ?.locked ===
      true;

    if (
      !locked
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_CHANGE_IN_PROGRESS',
        'Another app change is already in progress. Please try again.',
      );
    }

    const context =
      await assertContextStillCurrent(
        initialContext,
      );

    await assertWorkspaceReady(
      controlClient,
      context.tenantId,
    );

    const module =
      await getModule(
        controlClient,
        canonicalKey,
      );

    if (
      module.is_core
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_CORE_PROTECTED',
        'Core SaMi platform components cannot be removed from Workspace Apps.',
      );
    }

    const current =
      await getTenantModule(
        controlClient,
        context.tenantId,
        module.id,
      );

    if (
      !current ||
      (
        current.status ===
          'uninstalled' &&
        action ===
          'uninstall'
      )
    ) {
      return {
        key:
          module.key,
        name:
          module.name,
        status:
          'uninstalled',
        message:
          `${module.name} is not installed.`,
      };
    }

    if (
      action ===
        'disable' &&
      !ACTIVE_STATUSES.has(
        current.status,
      )
    ) {
      if (
        current.status ===
          'disabled'
      ) {
        return {
          key:
            module.key,
          name:
            module.name,
          status:
            'disabled',
          message:
            `${module.name} is already disabled.`,
        };
      }

      throw new WorkspaceAppLifecycleError(
        'APP_NOT_INSTALLED',
        `${module.name} must be installed before it can be disabled.`,
      );
    }

    const dependents =
      await getActiveDependents(
        controlClient,
        context.tenantId,
        module.key,
      );

    if (
      dependents.length >
      0
    ) {
      throw new WorkspaceAppLifecycleError(
        'APP_DEPENDENCY_BLOCKED',
        `${module.name} is required by another installed app.`,
        {
          blockers:
            dependents,
        },
      );
    }

    const nextStatus =
      action ===
        'disable'
        ? 'disabled'
        : 'uninstalled';

    await controlClient.query(
      `
        UPDATE tenant_modules

        SET
          status =
            $3::varchar,
          uninstalled_at =
            CASE
              WHEN $4::boolean
              THEN NOW()
              ELSE uninstalled_at
            END,
          updated_at =
            NOW()

        WHERE tenant_id =
              $1

          AND module_id =
              $2
      `,
      [
        context.tenantId,
        module.id,
        nextStatus,
        action ===
          'uninstall',
      ],
    );

    await recordAudit(
      controlClient,
      {
        tenantId:
          context.tenantId,
        userId:
          context.userId,
        eventType:
          action ===
            'disable'
            ? 'workspace_app.disabled'
            : 'workspace_app.uninstalled',
        moduleId:
          module.id,
        metadata: {
          appKey:
            module.key,
          dataRetained:
            true,
        },
        audit,
      },
    );

    return {
      key:
        module.key,
      name:
        module.name,
      version:
        module.version,
      status:
        nextStatus,
      dataRetained:
        true,
      message:
        action ===
          'disable'
          ? `${module.name} is disabled. Its data is retained.`
          : `${module.name} is uninstalled. Its data is retained for a future reinstall.`,
    };
  } finally {
    if (
      locked
    ) {
      try {
        await controlClient.query(
          `
            SELECT
              pg_advisory_unlock(
                hashtext(
                  $1
                )
              )
          `,
          [
            lockKey,
          ],
        );
      } catch {
        // Connection release also releases session advisory locks.
      }
    }

    controlClient.release();
  }
}


export async function installWorkspaceApp(
  appKey:
    string,
  audit?:
    WorkspaceAppAuditContext,
) {
  return activateWorkspaceApp(
    appKey,
    'install',
    audit,
  );
}


export async function enableWorkspaceApp(
  appKey:
    string,
  audit?:
    WorkspaceAppAuditContext,
) {
  return activateWorkspaceApp(
    appKey,
    'enable',
    audit,
  );
}


export async function disableWorkspaceApp(
  appKey:
    string,
  audit?:
    WorkspaceAppAuditContext,
) {
  return deactivateWorkspaceApp(
    appKey,
    'disable',
    audit,
  );
}


export async function uninstallWorkspaceApp(
  appKey:
    string,
  audit?:
    WorkspaceAppAuditContext,
) {
  return deactivateWorkspaceApp(
    appKey,
    'uninstall',
    audit,
  );
}
