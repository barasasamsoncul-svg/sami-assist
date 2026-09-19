import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';


/* ================================================================
   SaMi MODULE PERMISSION REGISTRY
   ================================================================

   Category 8.9

   PURPOSE

   Business apps register their own permissions without hardcoding
   those permissions into SaMi core.

   Examples:

       invoicing.invoice.view
       invoicing.invoice.create
       invoicing.invoice.update
       invoicing.invoice.delete

       crm.lead.view
       crm.lead.create
       crm.lead.manage

       inventory.stock.view
       inventory.stock.adjust


   CORE PRINCIPLE

       SaMi Core
           owns authorization infrastructure

       SaMi Modules
           own their business permissions


   permissions.module_key links a permission to its module.

   A module permission only becomes EFFECTIVE in a workspace when
   that module is actually installed/enabled for that workspace.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type ModulePermissionScope =
  | 'workspace'
  | 'company'
  | 'module'
  | 'record';


export type ModuleSystemRoleKey =
  | 'admin'
  | 'member';


export interface ModulePermissionDefinition {
  key:
    string;

  name:
    string;

  description?:
    string | null;

  resource:
    string;

  action:
    string;

  scope?:
    ModulePermissionScope;

  /*
   * Admin is always granted automatically.
   *
   * Add "member" when the permission should form part of the
   * default Member role for the module.
   */
  defaultSystemRoles?:
    ModuleSystemRoleKey[];
}


export interface RegisterModulePermissionsInput {
  moduleKey:
    string;

  permissions:
    ModulePermissionDefinition[];
}


export interface ModulePermissionRecord {
  id:
    string;

  moduleKey:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  resource:
    string;

  action:
    string;

  scope:
    ModulePermissionScope;

  status:
    'active'
    | 'disabled';

  isSystem:
    boolean;
}


export interface ModulePermissionRegistrationResult {
  moduleKey:
    string;

  registered:
    ModulePermissionRecord[];

  registeredCount:
    number;
}


export interface ModulePermissionSynchronizationResult
  extends ModulePermissionRegistrationResult {
  disabledKeys:
    string[];
}


/* ================================================================
   INTERNAL TYPES
   ================================================================ */

interface ModuleRow {
  id:
    unknown;

  key:
    unknown;

  name:
    unknown;

  status:
    unknown;
}


interface PermissionRow {
  id:
    unknown;

  module_key:
    unknown;

  key:
    unknown;

  name:
    unknown;

  description:
    unknown;

  resource:
    unknown;

  action:
    unknown;

  scope:
    unknown;

  status:
    unknown;

  is_system:
    unknown;
}


/* ================================================================
   ERROR
   ================================================================ */

export class ModulePermissionRegistryError
  extends Error {
  readonly code:
    | 'INVALID_MODULE_KEY'
    | 'MODULE_NOT_FOUND'
    | 'MODULE_NOT_ACTIVE'
    | 'INVALID_PERMISSION_DEFINITION'
    | 'INVALID_PERMISSION_KEY'
    | 'INVALID_PERMISSION_PREFIX'
    | 'DUPLICATE_PERMISSION_KEY'
    | 'PERMISSION_OWNED_BY_ANOTHER_MODULE'
    | 'SYSTEM_ROLE_NOT_FOUND';


  constructor(
    code:
      | 'INVALID_MODULE_KEY'
      | 'MODULE_NOT_FOUND'
      | 'MODULE_NOT_ACTIVE'
      | 'INVALID_PERMISSION_DEFINITION'
      | 'INVALID_PERMISSION_KEY'
      | 'INVALID_PERMISSION_PREFIX'
      | 'DUPLICATE_PERMISSION_KEY'
      | 'PERMISSION_OWNED_BY_ANOTHER_MODULE'
      | 'SYSTEM_ROLE_NOT_FOUND',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'ModulePermissionRegistryError';

    this.code =
      code;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const MODULE_KEY_PATTERN =
  /^[a-z][a-z0-9_]*$/;


const PERMISSION_KEY_PATTERN =
  /^[a-z][a-z0-9_]*(?:\.[a-z0-9][a-z0-9_-]*)+$/;


const MAX_MODULE_KEY_LENGTH =
  100;


const MAX_PERMISSION_KEY_LENGTH =
  160;


const MAX_PERMISSION_NAME_LENGTH =
  160;


const MAX_RESOURCE_LENGTH =
  100;


const MAX_ACTION_LENGTH =
  60;


const MAX_DESCRIPTION_LENGTH =
  1000;


const MAX_PERMISSIONS_PER_MODULE =
  500;


/* ================================================================
   NORMALIZATION
   ================================================================ */

function normalizeModuleKey(
  value:
    unknown,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_MODULE_KEY',
      'A valid module key is required.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !normalized ||
    normalized.length >
      MAX_MODULE_KEY_LENGTH ||
    !MODULE_KEY_PATTERN.test(
      normalized,
    )
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_MODULE_KEY',
      `Invalid SaMi module key "${normalized || 'empty'}".`,
    );
  }


  return normalized;
}


function normalizePermissionKey(
  moduleKey:
    string,

  value:
    unknown,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_KEY',
      'A valid permission key is required.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !normalized ||
    normalized.length >
      MAX_PERMISSION_KEY_LENGTH ||
    !PERMISSION_KEY_PATTERN.test(
      normalized,
    )
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_KEY',
      `Invalid permission key "${normalized || 'empty'}".`,
    );
  }


  /*
   * Every business-app permission must be namespaced.
   *
   * invoicing.invoice.view        ✓
   * crm.lead.manage               ✓
   *
   * invoice.view                  ✗ for invoicing
   * users.manage                  ✗ for invoicing
   */
  if (
    !normalized.startsWith(
      `${moduleKey}.`,
    )
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_PREFIX',
      `Permission "${normalized}" must begin with "${moduleKey}.".`,
    );
  }


  return normalized;
}


function normalizeText(
  value:
    unknown,

  field:
    'name'
    | 'resource'
    | 'action',

  maxLength:
    number,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      `Permission ${field} must be text.`,
    );
  }


  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        ' ',
      );


  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      `Permission ${field} is invalid.`,
    );
  }


  return normalized;
}


function normalizeDescription(
  value:
    unknown,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  if (
    typeof value !==
      'string'
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      'Permission description must be text.',
    );
  }


  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        ' ',
      );


  if (
    !normalized
  ) {
    return null;
  }


  if (
    normalized.length >
      MAX_DESCRIPTION_LENGTH
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      `Permission descriptions cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }


  return normalized;
}


function normalizeScope(
  value:
    unknown,
): ModulePermissionScope {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
  ) {
    /*
     * Most business application records belong to a company.
     */
    return 'company';
  }


  const normalized =
    String(
      value,
    )
      .trim()
      .toLowerCase();


  if (
    normalized ===
      'workspace' ||
    normalized ===
      'company' ||
    normalized ===
      'module' ||
    normalized ===
      'record'
  ) {
    return normalized;
  }


  throw new ModulePermissionRegistryError(
    'INVALID_PERMISSION_DEFINITION',
    `Unsupported permission scope "${normalized}".`,
  );
}


function normalizeSystemRoles(
  value:
    unknown,
): ModuleSystemRoleKey[] {
  /*
   * Every installed application permission belongs to the
   * protected system Admin role by default.
   */
  const roles =
    new Set<ModuleSystemRoleKey>([
      'admin',
    ]);


  if (
    Array.isArray(
      value,
    )
  ) {
    for (
      const item
      of value
    ) {
      if (
        item ===
          'member'
      ) {
        roles.add(
          'member',
        );
      }


      if (
        item ===
          'admin'
      ) {
        roles.add(
          'admin',
        );
      }
    }
  }


  return [
    ...roles,
  ];
}


/* ================================================================
   NORMALIZED DEFINITION
   ================================================================ */

interface NormalizedModulePermission {
  key:
    string;

  name:
    string;

  description:
    string | null;

  resource:
    string;

  action:
    string;

  scope:
    ModulePermissionScope;

  defaultSystemRoles:
    ModuleSystemRoleKey[];
}


function normalizeDefinitions(
  moduleKey:
    string,

  definitions:
    ModulePermissionDefinition[],
): NormalizedModulePermission[] {
  if (
    !Array.isArray(
      definitions,
    )
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      'Module permissions must be supplied as an array.',
    );
  }


  if (
    definitions.length >
      MAX_PERMISSIONS_PER_MODULE
  ) {
    throw new ModulePermissionRegistryError(
      'INVALID_PERMISSION_DEFINITION',
      `A module cannot register more than ${MAX_PERMISSIONS_PER_MODULE} permissions.`,
    );
  }


  const seen =
    new Set<string>();


  const result:
    NormalizedModulePermission[] =
    [];


  for (
    const definition
    of definitions
  ) {
    if (
      !definition ||
      typeof definition !==
        'object'
    ) {
      throw new ModulePermissionRegistryError(
        'INVALID_PERMISSION_DEFINITION',
        'Invalid module permission definition.',
      );
    }


    const key =
      normalizePermissionKey(
        moduleKey,
        definition.key,
      );


    if (
      seen.has(
        key,
      )
    ) {
      throw new ModulePermissionRegistryError(
        'DUPLICATE_PERMISSION_KEY',
        `Permission "${key}" was declared more than once.`,
      );
    }


    seen.add(
      key,
    );


    result.push({
      key,

      name:
        normalizeText(
          definition.name,
          'name',
          MAX_PERMISSION_NAME_LENGTH,
        ),

      description:
        normalizeDescription(
          definition.description,
        ),

      resource:
        normalizeText(
          definition.resource,
          'resource',
          MAX_RESOURCE_LENGTH,
        )
          .toLowerCase()
          .replace(
            /\s+/g,
            '_',
          ),

      action:
        normalizeText(
          definition.action,
          'action',
          MAX_ACTION_LENGTH,
        )
          .toLowerCase()
          .replace(
            /\s+/g,
            '_',
          ),

      scope:
        normalizeScope(
          definition.scope,
        ),

      defaultSystemRoles:
        normalizeSystemRoles(
          definition.defaultSystemRoles,
        ),
    });
  }


  return result;
}


/* ================================================================
   MAP
   ================================================================ */

function mapPermission(
  row:
    PermissionRow,
): ModulePermissionRecord {
  const rawScope =
    typeof row.scope ===
      'string'
      ? row.scope
          .trim()
          .toLowerCase()
      : 'company';


  const scope:
    ModulePermissionScope =
    rawScope ===
      'workspace' ||
    rawScope ===
      'module' ||
    rawScope ===
      'record'
      ? rawScope
      : 'company';


  return {
    id:
      String(
        row.id,
      ),

    moduleKey:
      typeof row.module_key ===
        'string'
        ? row.module_key
        : '',

    key:
      typeof row.key ===
        'string'
        ? row.key
        : '',

    name:
      typeof row.name ===
        'string'
        ? row.name
        : '',

    description:
      typeof row.description ===
        'string'
        ? row.description
        : null,

    resource:
      typeof row.resource ===
        'string'
        ? row.resource
        : '',

    action:
      typeof row.action ===
        'string'
        ? row.action
        : '',

    scope,

    status:
      String(
        row.status ||
        '',
      )
        .trim()
        .toLowerCase() ===
        'disabled'
        ? 'disabled'
        : 'active',

    isSystem:
      row.is_system ===
        true,
  };
}


/* ================================================================
   MODULE
   ================================================================ */

async function requireActiveModule(
  client:
    PoolClient,

  moduleKey:
    string,
): Promise<ModuleRow> {
  const result =
    await client.query(
      `
        SELECT
          id,
          key,
          name,
          status

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

        FOR UPDATE
      `,
      [
        moduleKey,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new ModulePermissionRegistryError(
      'MODULE_NOT_FOUND',
      `SaMi module "${moduleKey}" is not registered.`,
    );
  }


  const module =
    result.rows[0] as ModuleRow;


  if (
    String(
      module.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new ModulePermissionRegistryError(
      'MODULE_NOT_ACTIVE',
      `SaMi module "${moduleKey}" is not active.`,
    );
  }


  return module;
}


/* ================================================================
   LOCK
   ================================================================ */

async function lockModulePermissions(
  client:
    PoolClient,

  moduleKey:
    string,
): Promise<void> {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext(
            $1
          )
        )
    `,
    [
      `sami:module-permissions:${moduleKey}`,
    ],
  );
}


/* ================================================================
   SYSTEM ROLE
   ================================================================ */

async function getSystemRoleId(
  client:
    PoolClient,

  roleKey:
    ModuleSystemRoleKey,
): Promise<string> {
  const result =
    await client.query(
      `
        SELECT
          id

        FROM roles

        WHERE is_system =
              TRUE

          AND tenant_id
              IS NULL

          AND deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              status,
              'active'
            )
          ) =
          'active'

          AND LOWER(
            COALESCE(
              key,
              ''
            )
          ) =
          $1

        LIMIT 1
      `,
      [
        roleKey,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new ModulePermissionRegistryError(
      'SYSTEM_ROLE_NOT_FOUND',
      `Protected SaMi system role "${roleKey}" is not configured.`,
    );
  }


  return String(
    result.rows[0].id,
  );
}


/* ================================================================
   EXISTING PERMISSION
   ================================================================ */

async function findPermissionByKey(
  client:
    PoolClient,

  permissionKey:
    string,
): Promise<PermissionRow | null> {
  /*
   * Include soft-deleted historical rows so the same permission
   * identity can be restored rather than duplicated.
   */
  const result =
    await client.query(
      `
        SELECT
          id,
          module_key,
          key,
          name,
          description,
          resource,
          action,
          scope,
          status,
          is_system,
          deleted_at

        FROM permissions

        WHERE LOWER(
          key
        ) =
        LOWER(
          $1
        )

        ORDER BY
          CASE
            WHEN deleted_at
                 IS NULL
            THEN 0

            ELSE 1
          END ASC,

          created_at ASC,

          id ASC

        LIMIT 1

        FOR UPDATE
      `,
      [
        permissionKey,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    return null;
  }


  return result.rows[0] as PermissionRow;
}


/* ================================================================
   UPSERT ONE PERMISSION
   ================================================================ */

async function upsertModulePermission(
  client:
    PoolClient,

  moduleKey:
    string,

  definition:
    NormalizedModulePermission,
): Promise<ModulePermissionRecord> {
  const existing =
    await findPermissionByKey(
      client,
      definition.key,
    );


  let permissionId:
    string;


  if (
    existing
  ) {
    const existingModuleKey =
      typeof existing.module_key ===
        'string'
        ? existing.module_key
            .trim()
            .toLowerCase()
        : null;


    /*
     * Core permission or another app is not allowed to be
     * silently taken over by this module.
     */
    if (
      existingModuleKey !==
      null &&
      existingModuleKey !==
        moduleKey
    ) {
      throw new ModulePermissionRegistryError(
        'PERMISSION_OWNED_BY_ANOTHER_MODULE',
        `Permission "${definition.key}" already belongs to module "${existingModuleKey}".`,
      );
    }


    /*
     * A core permission has module_key = NULL.
     *
     * Because module keys are namespaced, a module should never
     * reuse a core permission identity.
     */
    if (
      existingModuleKey ===
        null
    ) {
      throw new ModulePermissionRegistryError(
        'PERMISSION_OWNED_BY_ANOTHER_MODULE',
        `Permission "${definition.key}" already exists as a SaMi core permission.`,
      );
    }


    const updated =
      await client.query(
        `
          UPDATE permissions

          SET
            module_key =
              $2,

            name =
              $3,

            description =
              $4,

            resource =
              $5,

            action =
              $6,

            scope =
              $7,

            is_system =
              TRUE,

            status =
              'active',

            deleted_at =
              NULL,

            updated_at =
              NOW()

          WHERE id =
                $1

          RETURNING
            id,
            module_key,
            key,
            name,
            description,
            resource,
            action,
            scope,
            status,
            is_system
        `,
        [
          existing.id,
          moduleKey,
          definition.name,
          definition.description,
          definition.resource,
          definition.action,
          definition.scope,
        ],
      );


    permissionId =
      String(
        updated.rows[0].id,
      );
  } else {
    const inserted =
      await client.query(
        `
          INSERT INTO permissions (
            module_key,
            key,
            name,
            description,
            resource,
            action,
            scope,
            is_system,
            status,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            TRUE,
            'active',
            NOW(),
            NOW()
          )

          RETURNING
            id,
            module_key,
            key,
            name,
            description,
            resource,
            action,
            scope,
            status,
            is_system
        `,
        [
          moduleKey,
          definition.key,
          definition.name,
          definition.description,
          definition.resource,
          definition.action,
          definition.scope,
        ],
      );


    permissionId =
      String(
        inserted.rows[0].id,
      );
  }


  /*
   * Admin always receives the module permission.
   *
   * Member receives it only when explicitly declared by the
   * module permission definition.
   */
  const intendedRoles =
    new Set<ModuleSystemRoleKey>(
      definition.defaultSystemRoles,
    );


  intendedRoles.add(
    'admin',
  );


  for (
    const roleKey
    of [
      'admin',
      'member',
    ] as ModuleSystemRoleKey[]
  ) {
    const roleId =
      await getSystemRoleId(
        client,
        roleKey,
      );


    if (
      intendedRoles.has(
        roleKey,
      )
    ) {
      await client.query(
        `
          INSERT INTO role_permissions (
            role_id,
            permission_id,
            granted_by,
            created_at,
            updated_at,
            deleted_at
          )

          VALUES (
            $1,
            $2,
            NULL,
            NOW(),
            NOW(),
            NULL
          )

          ON CONFLICT (
            role_id,
            permission_id
          )

          DO UPDATE

          SET
            deleted_at =
              NULL,

            updated_at =
              NOW()
        `,
        [
          roleId,
          permissionId,
        ],
      );
    } else {
      /*
       * System Member defaults are declarative.
       *
       * If a module removes "member" from defaultSystemRoles,
       * remove that default relationship.
       *
       * System roles are protected from workspace editing, so
       * this cannot erase a legitimate workspace override.
       */
      await client.query(
        `
          UPDATE role_permissions

          SET
            deleted_at =
              NOW(),

            updated_at =
              NOW()

          WHERE role_id =
                $1

            AND permission_id =
                $2

            AND deleted_at
                IS NULL
        `,
        [
          roleId,
          permissionId,
        ],
      );
    }
  }


  const loaded =
    await client.query(
      `
        SELECT
          id,
          module_key,
          key,
          name,
          description,
          resource,
          action,
          scope,
          status,
          is_system

        FROM permissions

        WHERE id =
              $1

        LIMIT 1
      `,
      [
        permissionId,
      ],
    );


  return mapPermission(
    loaded.rows[0] as PermissionRow,
  );
}


/* ================================================================
   REGISTER MODULE PERMISSIONS
   ================================================================

   Adds or updates supplied definitions.

   Permissions belonging to the module but absent from this call
   are left unchanged.

   Useful for incremental registration.

   ================================================================ */

export async function registerModulePermissions(
  input:
    RegisterModulePermissionsInput,
): Promise<ModulePermissionRegistrationResult> {
  const moduleKey =
    normalizeModuleKey(
      input.moduleKey,
    );


  const definitions =
    normalizeDefinitions(
      moduleKey,
      input.permissions,
    );


  return withControlTransaction(
    async client => {
      await lockModulePermissions(
        client,
        moduleKey,
      );


      await requireActiveModule(
        client,
        moduleKey,
      );


      const registered:
        ModulePermissionRecord[] =
        [];


      for (
        const definition
        of definitions
      ) {
        const permission =
          await upsertModulePermission(
            client,
            moduleKey,
            definition,
          );


        registered.push(
          permission,
        );
      }


      return {
        moduleKey,

        registered,

        registeredCount:
          registered.length,
      };
    },
  );
}


/* ================================================================
   SYNCHRONIZE MODULE PERMISSIONS
   ================================================================

   This should become the normal module-manifest operation.

   Supplied permission definitions become authoritative.

   Any previously registered permission for the module that is no
   longer present is DISABLED rather than physically deleted.

   This preserves:
       IDs
       auditability
       historic role links
       future restoration

   ================================================================ */

export async function synchronizeModulePermissions(
  input:
    RegisterModulePermissionsInput,
): Promise<ModulePermissionSynchronizationResult> {
  const moduleKey =
    normalizeModuleKey(
      input.moduleKey,
    );


  const definitions =
    normalizeDefinitions(
      moduleKey,
      input.permissions,
    );


  return withControlTransaction(
    async client => {
      await lockModulePermissions(
        client,
        moduleKey,
      );


      await requireActiveModule(
        client,
        moduleKey,
      );


      const registered:
        ModulePermissionRecord[] =
        [];


      for (
        const definition
        of definitions
      ) {
        registered.push(
          await upsertModulePermission(
            client,
            moduleKey,
            definition,
          ),
        );
      }


      const activeKeys =
        definitions.map(
          permission =>
            permission.key,
        );


      const stale =
        await client.query(
          `
            UPDATE permissions

            SET
              status =
                'disabled',

              updated_at =
                NOW()

            WHERE LOWER(
              COALESCE(
                module_key,
                ''
              )
            ) =
            $1

              AND deleted_at
                  IS NULL

              AND LOWER(
                COALESCE(
                  status,
                  'active'
                )
              ) =
              'active'

              AND NOT (
                LOWER(
                  key
                ) =
                ANY(
                  $2::text[]
                )
              )

            RETURNING
              LOWER(
                key
              ) AS key
          `,
          [
            moduleKey,
            activeKeys,
          ],
        );


      const disabledKeys =
        stale.rows
          .map(
            row =>
              typeof row.key ===
                'string'
                ? row.key
                : '',
          )
          .filter(
            Boolean,
          );


      return {
        moduleKey,

        registered,

        registeredCount:
          registered.length,

        disabledKeys,
      };
    },
  );
}


/* ================================================================
   LIST MODULE PERMISSIONS
   ================================================================ */

export async function listModulePermissions(
  moduleKeyInput:
    string,

  options?: {
    includeDisabled?:
      boolean;
  },
): Promise<ModulePermissionRecord[]> {
  const moduleKey =
    normalizeModuleKey(
      moduleKeyInput,
    );


  const result =
    await queryControl(
      `
        SELECT
          id,
          module_key,
          key,
          name,
          description,
          resource,
          action,
          scope,
          status,
          is_system

        FROM permissions

        WHERE LOWER(
          COALESCE(
            module_key,
            ''
          )
        ) =
        $1

          AND deleted_at
              IS NULL

          AND (
            $2::boolean =
              TRUE

            OR

            LOWER(
              COALESCE(
                status,
                'active'
              )
            ) =
            'active'
          )

        ORDER BY
          LOWER(
            resource
          ) ASC,

          LOWER(
            action
          ) ASC,

          LOWER(
            key
          ) ASC
      `,
      [
        moduleKey,
        options?.includeDisabled ===
          true,
      ],
    );


  return (
    result.rows as PermissionRow[]
  ).map(
    mapPermission,
  );
}


/* ================================================================
   DISABLE ALL PERMISSIONS FOR MODULE
   ================================================================

   Intended for a module that becomes globally unavailable.

   Workspace uninstalling does NOT require this.

   Workspace uninstall is enforced dynamically by permission-context.

   ================================================================ */

export async function disableModulePermissions(
  moduleKeyInput:
    string,
): Promise<{
  moduleKey:
    string;

  disabledKeys:
    string[];
}> {
  const moduleKey =
    normalizeModuleKey(
      moduleKeyInput,
    );


  return withControlTransaction(
    async client => {
      await lockModulePermissions(
        client,
        moduleKey,
      );


      const result =
        await client.query(
          `
            UPDATE permissions

            SET
              status =
                'disabled',

              updated_at =
                NOW()

            WHERE LOWER(
              COALESCE(
                module_key,
                ''
              )
            ) =
            $1

              AND deleted_at
                  IS NULL

              AND LOWER(
                COALESCE(
                  status,
                  'active'
                )
              ) =
              'active'

            RETURNING
              LOWER(
                key
              ) AS key
          `,
          [
            moduleKey,
          ],
        );


      return {
        moduleKey,

        disabledKeys:
          result.rows
            .map(
              row =>
                typeof row.key ===
                  'string'
                  ? row.key
                  : '',
            )
            .filter(
              Boolean,
            ),
      };
    },
  );
}