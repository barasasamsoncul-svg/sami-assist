import {
  after,
  test,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  readFile,
} from 'node:fs/promises';

import path from 'node:path';

import dotenv from 'dotenv';

import {
  Pool,
} from 'pg';


dotenv.config({
  path:
    '.env.local',
});

dotenv.config();


/* ================================================================
   SaMi CATEGORY 8 — AUTHORIZATION SECURITY TESTS
   ================================================================

   READ-ONLY TEST SUITE

   These tests DO NOT:

   - create users
   - create roles
   - assign roles
   - remove roles
   - change permissions
   - change memberships
   - modify companies
   - modify sessions


   THEY VERIFY:

   1. Permission trust chain wiring
   2. Category 8 database schema
   3. Core permission catalog
   4. Canonical system roles
   5. Tenant-scoped custom roles
   6. Cross-workspace role isolation
   7. Duplicate assignment protection
   8. Role-permission relationship integrity
   9. Owner authorization override
   10. Disabled/deleted authorization isolation
   11. Multiple-role permission union
   12. Module permission registration
   13. Installed-module permission enforcement
   14. Company-aware authorization
   15. Privilege-escalation protection
   16. API tenant-trust boundaries
   17. Owner role-assignment protection
   18. Admin-name heuristic removal

   ================================================================ */


/* ================================================================
   DATABASE CONFIG
   ================================================================ */

function shouldUseSsl(
  host:
    string,
): boolean {
  const explicit =
    process.env.POSTGRES_SSL
      ?.trim()
      .toLowerCase();


  if (
    explicit ===
      'true'
  ) {
    return true;
  }


  if (
    explicit ===
      'false'
  ) {
    return false;
  }


  const normalized =
    host
      .trim()
      .toLowerCase();


  return (
    normalized.includes(
      'neon.tech',
    ) ||
    normalized.includes(
      'neon.build',
    ) ||
    normalized.includes(
      'amazonaws.com',
    ) ||
    normalized.includes(
      'render.com',
    ) ||
    normalized.includes(
      'railway.app',
    )
  );
}


const host =
  process.env.POSTGRES_HOST;


const user =
  process.env.POSTGRES_ADMIN_USER;


const password =
  process.env.POSTGRES_ADMIN_PASSWORD;


assert.ok(
  host,
  'POSTGRES_HOST must be configured.',
);


assert.ok(
  user,
  'POSTGRES_ADMIN_USER must be configured.',
);


assert.ok(
  password,
  'POSTGRES_ADMIN_PASSWORD must be configured.',
);


const port =
  Number.parseInt(
    process.env.POSTGRES_PORT ||
      '5432',
    10,
  );


const ssl =
  shouldUseSsl(
    host,
  )
    ? {
        rejectUnauthorized:
          false,
      }
    : undefined;


const control =
  new Pool({
    host,

    port,

    user,

    password,

    database:
      process.env.POSTGRES_DB ||
      'sami_control',

    ssl,

    max:
      5,
  });


after(
  async () => {
    await control.end();
  },
);


/* ================================================================
   SOURCE HELPERS
   ================================================================ */

async function source(
  relativePath:
    string,
): Promise<string> {
  return readFile(
    path.join(
      process.cwd(),
      relativePath,
    ),
    'utf8',
  );
}


function compact(
  value:
    string,
): string {
  return value.replace(
    /\s+/g,
    ' ',
  );
}


/*
 * Security source tests should evaluate implementation rather than
 * explanatory comments.
 *
 * Example:
 *
 * A source comment may document that SaMi does NOT use:
 *
 *     LIKE '%admin%'
 *
 * Searching the raw file would incorrectly interpret that comment
 * as executable fuzzy authorization logic.
 */
function stripComments(
  value:
    string,
): string {
  return value
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ' ',
    )
    .replace(
      /\/\/.*$/gm,
      ' ',
    );
}


/* ================================================================
   EXPECTED SaMi CORE PERMISSIONS
   ================================================================ */

const CORE_PERMISSIONS = [
  'workspace.view',
  'workspace.manage',

  'users.view',
  'users.manage',

  'roles.view',
  'roles.manage',

  'invitations.view',
  'invitations.manage',

  'organization.view',
  'organization.manage',

  'companies.view',
  'companies.manage',

  'apps.view',
  'apps.manage',

  'files.view',
  'files.manage',

  'notifications.view',
  'notifications.manage',

  'audit.view',

  'search.use',

  'ai.use',
  'ai.manage',

  'automation.view',
  'automation.manage',

  'integrations.view',
  'integrations.manage',

  'api.view',
  'api.manage',

  'billing.view',
  'billing.manage',

  'usage.view',

  'settings.view',
  'settings.manage',
] as const;


/* ================================================================
   1. AUTHORIZATION TRUST CHAIN
   ================================================================ */

test(
  'Category 8 authorization trust chain is wired through trusted tenant context',
  async () => {
    const [
      permissionContext,
      permissionGuards,
      tenantContext,
    ] =
      await Promise.all([
        source(
          'lib/auth/permission-context.ts',
        ),

        source(
          'lib/auth/permission-guards.ts',
        ),

        source(
          'lib/auth/tenant-context.ts',
        ),
      ]);


    const permissionContextSource =
      compact(
        permissionContext,
      );


    const guardSource =
      compact(
        permissionGuards,
      );


    const tenantSource =
      compact(
        tenantContext,
      );


    assert.match(
      permissionContextSource,
      /requireTenantContext/,
      'PermissionContext must originate from trusted TenantContext.',
    );


    assert.match(
      permissionContextSource,
      /tenantContext\.tenantId/,
      'Permission resolution must use the server-resolved tenant ID.',
    );


    assert.match(
      permissionContextSource,
      /tenantContext\.userId/,
      'Permission resolution must use the trusted current user ID.',
    );


    assert.match(
      guardSource,
      /getPermissionContext/,
      'Permission guards must resolve the trusted permission context.',
    );


    assert.match(
      guardSource,
      /permissionContextHas/,
      'Permission guards must test effective permissions.',
    );


    assert.match(
      tenantSource,
      /member_type/,
      'Tenant context must validate membership type.',
    );


    assert.match(
      tenantSource,
      /internal/,
      'Normal workspace authorization must require internal membership.',
    );
  },
);


/* ================================================================
   2. CATEGORY 8 DATABASE SCHEMA
   ================================================================ */

test(
  'Category 8 authorization tables contain required columns',
  async () => {
    const required:
      Record<
        string,
        string[]
      > = {
      roles: [
        'id',
        'tenant_id',
        'key',
        'name',
        'description',
        'is_system',
        'status',
        'created_at',
        'updated_at',
        'deleted_at',
      ],

      permissions: [
        'id',
        'key',
        'name',
        'description',
        'resource',
        'action',
        'module_key',
        'scope',
        'is_system',
        'status',
        'created_at',
        'updated_at',
        'deleted_at',
      ],

      role_permissions: [
        'id',
        'role_id',
        'permission_id',
        'granted_by',
        'created_at',
        'updated_at',
        'deleted_at',
      ],

      user_roles: [
        'id',
        'tenant_id',
        'user_id',
        'role_id',
        'created_at',
        'updated_at',
        'deleted_at',
      ],
    };


    for (
      const [
        table,
        columns,
      ]
      of Object.entries(
        required,
      )
    ) {
      const result =
        await control.query(
          `
            SELECT
              column_name

            FROM information_schema.columns

            WHERE table_schema =
                  'public'

              AND table_name =
                  $1
          `,
          [
            table,
          ],
        );


      const existing =
        new Set(
          result.rows.map(
            row =>
              String(
                row.column_name,
              ),
          ),
        );


      for (
        const column
        of columns
      ) {
        assert.ok(
          existing.has(
            column,
          ),

          `${table} is missing required Category 8 column "${column}".`,
        );
      }
    }
  },
);


/* ================================================================
   3. CORE PERMISSION CATALOG
   ================================================================ */

test(
  'all SaMi core permissions are registered and active',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            LOWER(
              key
            )
              AS key,

            module_key,

            status,

            deleted_at

          FROM permissions

          WHERE LOWER(
            key
          ) =
          ANY(
            $1::text[]
          )
        `,
        [
          CORE_PERMISSIONS,
        ],
      );


    const byKey =
      new Map(
        result.rows.map(
          row => [
            String(
              row.key,
            ),

            row,
          ],
        ),
      );


    for (
      const key
      of CORE_PERMISSIONS
    ) {
      const permission =
        byKey.get(
          key,
        );


      assert.ok(
        permission,
        `Missing core permission "${key}".`,
      );


      assert.equal(
        permission.deleted_at,
        null,
        `Core permission "${key}" is soft-deleted.`,
      );


      assert.equal(
        String(
          permission.status,
        )
          .toLowerCase(),
        'active',

        `Core permission "${key}" is not active.`,
      );


      assert.equal(
        permission.module_key,
        null,
        `Core permission "${key}" must not belong to a business module.`,
      );
    }
  },
);


/* ================================================================
   4. ACTIVE PERMISSION KEY UNIQUENESS
   ================================================================ */

test(
  'active permission keys are globally unique',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            LOWER(
              key
            )
              AS key,

            COUNT(*)::integer
              AS count

          FROM permissions

          WHERE deleted_at
                IS NULL

          GROUP BY
            LOWER(
              key
            )

          HAVING COUNT(*) >
                 1
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      result.rows.length ===
        0
        ? undefined
        : `Duplicate active permission keys found: ${JSON.stringify(
            result.rows,
          )}`,
    );
  },
);


/* ================================================================
   5. CANONICAL SYSTEM ROLES
   ================================================================ */

test(
  'Admin and Member are canonical global SaMi system roles',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            id,
            key,
            name,
            tenant_id,
            is_system,
            status,
            deleted_at

          FROM roles

          WHERE LOWER(
            COALESCE(
              key,
              ''
            )
          ) IN (
            'admin',
            'member'
          )

            AND deleted_at
                IS NULL
        `,
      );


    const byKey =
      new Map(
        result.rows.map(
          row => [
            String(
              row.key,
            )
              .trim()
              .toLowerCase(),

            row,
          ],
        ),
      );


    for (
      const key
      of [
        'admin',
        'member',
      ]
    ) {
      const role =
        byKey.get(
          key,
        );


      assert.ok(
        role,
        `Missing protected "${key}" system role.`,
      );


      assert.equal(
        role.is_system,
        true,
        `${key} must be a system role.`,
      );


      assert.equal(
        role.tenant_id,
        null,
        `${key} must be global rather than tenant-scoped.`,
      );


      assert.equal(
        String(
          role.status,
        )
          .trim()
          .toLowerCase(),
        'active',

        `${key} system role must be active.`,
      );
    }
  },
);


/* ================================================================
   6. ROLE SCOPE INTEGRITY
   ================================================================ */

test(
  'system roles are global and custom roles are tenant-scoped',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE is_system =
                    TRUE

                AND tenant_id
                    IS NOT NULL

                AND deleted_at
                    IS NULL
            )::integer
              AS invalid_system_roles,

            COUNT(*) FILTER (
              WHERE is_system =
                    FALSE

                AND tenant_id
                    IS NULL

                AND deleted_at
                    IS NULL
            )::integer
              AS invalid_custom_roles

          FROM roles
        `,
      );


    assert.equal(
      Number(
        result.rows[0]
          .invalid_system_roles,
      ),
      0,
      'A system role is incorrectly tenant-scoped.',
    );


    assert.equal(
      Number(
        result.rows[0]
          .invalid_custom_roles,
      ),
      0,
      'A custom role exists without tenant ownership.',
    );
  },
);


/* ================================================================
   7. CUSTOM ROLE KEY UNIQUENESS
   ================================================================ */

test(
  'active custom role keys are unique inside each workspace',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            tenant_id,

            LOWER(
              key
            )
              AS key,

            COUNT(*)::integer
              AS count

          FROM roles

          WHERE is_system =
                FALSE

            AND tenant_id
                IS NOT NULL

            AND deleted_at
                IS NULL

          GROUP BY
            tenant_id,

            LOWER(
              key
            )

          HAVING COUNT(*) >
                 1
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      result.rows.length ===
        0
        ? undefined
        : `Duplicate custom role keys exist: ${JSON.stringify(
            result.rows,
          )}`,
    );
  },
);


/* ================================================================
   8. CROSS-WORKSPACE ROLE ISOLATION
   ================================================================ */

test(
  'active role assignments cannot reference another workspace custom role',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            ur.id,

            ur.tenant_id
              AS assignment_tenant_id,

            r.id
              AS role_id,

            r.tenant_id
              AS role_tenant_id,

            r.is_system

          FROM user_roles ur

          INNER JOIN roles r
            ON r.id =
               ur.role_id

          WHERE ur.deleted_at
                IS NULL

            AND r.deleted_at
                IS NULL

            AND (
              (
                r.is_system =
                  TRUE

                AND r.tenant_id
                    IS NOT NULL
              )

              OR

              (
                r.is_system =
                  FALSE

                AND (
                  r.tenant_id
                    IS NULL

                  OR

                  r.tenant_id <>
                    ur.tenant_id
                )
              )
            )
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      result.rows.length ===
        0
        ? undefined
        : `Cross-workspace role assignments found: ${JSON.stringify(
            result.rows,
          )}`,
    );
  },
);


/* ================================================================
   9. ACTIVE USER ROLE DUPLICATES
   ================================================================ */

test(
  'a user cannot hold the same active role twice in one workspace',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            tenant_id,
            user_id,
            role_id,

            COUNT(*)::integer
              AS count

          FROM user_roles

          WHERE deleted_at
                IS NULL

          GROUP BY
            tenant_id,
            user_id,
            role_id

          HAVING COUNT(*) >
                 1
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      'Duplicate active user-role assignments exist.',
    );
  },
);


/* ================================================================
   10. ACTIVE ROLE PERMISSION DUPLICATES
   ================================================================ */

test(
  'a role cannot hold the same active permission twice',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            role_id,
            permission_id,

            COUNT(*)::integer
              AS count

          FROM role_permissions

          WHERE deleted_at
                IS NULL

          GROUP BY
            role_id,
            permission_id

          HAVING COUNT(*) >
                 1
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      'Duplicate active role-permission relationships exist.',
    );
  },
);


/* ================================================================
   11. DELETED ROLE ASSIGNMENTS
   ================================================================ */

test(
  'deleted roles have no active user assignments',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM user_roles ur

          INNER JOIN roles r
            ON r.id =
               ur.role_id

          WHERE ur.deleted_at
                IS NULL

            AND r.deleted_at
                IS NOT NULL
        `,
      );


    assert.equal(
      Number(
        result.rows[0]
          .count,
      ),
      0,
      'A deleted role still has an active user assignment.',
    );
  },
);


/* ================================================================
   12. DISABLED / DELETED ROLE FILTERING
   ================================================================ */

test(
  'permission resolver excludes disabled and deleted authorization records',
  async () => {
    const permissionContext =
      compact(
        stripComments(
          await source(
            'lib/auth/permission-context.ts',
          ),
        ),
      );


    assert.match(
      permissionContext,
      /r\.deleted_at\s+IS NULL/i,
      'Deleted roles must be excluded from permission resolution.',
    );


    assert.match(
      permissionContext,
      /r\.status[\s\S]*active/i,
      'Disabled roles must be excluded from permission resolution.',
    );


    assert.match(
      permissionContext,
      /ur\.deleted_at\s+IS NULL/i,
      'Deleted role assignments must be excluded.',
    );


    assert.match(
      permissionContext,
      /rp\.deleted_at\s+IS NULL/i,
      'Deleted role-permission grants must be excluded.',
    );


    assert.match(
      permissionContext,
      /p\.deleted_at\s+IS NULL/i,
      'Deleted permissions must be excluded.',
    );


    assert.match(
      permissionContext,
      /p\.status[\s\S]*active/i,
      'Disabled permissions must be excluded.',
    );
  },
);


/* ================================================================
   13. OWNER OVERRIDE
   ================================================================ */

test(
  'workspace owner authorization comes from structural ownership',
  async () => {
    const permissionContext =
      compact(
        stripComments(
          await source(
            'lib/auth/permission-context.ts',
          ),
        ),
      );


    assert.match(
      permissionContext,
      /tenantContext\.isOwner/,
      'Permission resolver must use structural ownership.',
    );


    assert.match(
      permissionContext,
      /loadOwnerPermissions/,
      'Owner authorization override is missing.',
    );


    assert.match(
      permissionContext,
      /tenantContext\.isOwner[\s\S]*loadOwnerPermissions/,
      'Owner permissions must resolve independently from ordinary role assignments.',
    );
  },
);


/* ================================================================
   14. MULTIPLE ROLES ARE ADDITIVE
   ================================================================ */

test(
  'multiple active roles resolve as an additive permission union',
  async () => {
    const permissionContext =
      compact(
        stripComments(
          await source(
            'lib/auth/permission-context.ts',
          ),
        ),
      );


    assert.match(
      permissionContext,
      /FROM user_roles ur/i,
      'Permission resolution must read user role assignments.',
    );


    assert.match(
      permissionContext,
      /INNER JOIN role_permissions rp/i,
      'Permission resolution must traverse role permissions.',
    );


    assert.match(
      permissionContext,
      /SELECT DISTINCT/i,
      'Permissions granted through multiple roles must be deduplicated.',
    );


    assert.match(
      permissionContext,
      /uniquePermissions/,
      'Application-level permission deduplication must remain in place.',
    );


    const multiRoleUsers =
      await control.query(
        `
          SELECT
            ur.tenant_id,
            ur.user_id,

            COUNT(
              DISTINCT ur.role_id
            )::integer
              AS role_count

          FROM user_roles ur

          INNER JOIN roles r
            ON r.id =
               ur.role_id

          WHERE ur.deleted_at
                IS NULL

            AND r.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                r.status,
                'active'
              )
            ) =
            'active'

          GROUP BY
            ur.tenant_id,
            ur.user_id

          HAVING COUNT(
            DISTINCT ur.role_id
          ) >
          1

          LIMIT 1
        `,
      );


    if (
      multiRoleUsers.rows.length ===
      0
    ) {
      return;
    }


    assert.ok(
      Number(
        multiRoleUsers.rows[0]
          .role_count,
      ) >
      1,
      'Expected a multi-role assignment.',
    );
  },
);


/* ================================================================
   15. MODULE PERMISSION NAMESPACE
   ================================================================ */

test(
  'module permissions are namespaced and reference registered modules',
  async t => {
    const result =
      await control.query(
        `
          SELECT
            p.id,
            p.key,
            p.module_key,

            m.id
              AS module_id

          FROM permissions p

          LEFT JOIN modules m
            ON LOWER(
                 m.key
               ) =
               LOWER(
                 p.module_key
               )

            AND m.deleted_at
                IS NULL

          WHERE p.module_key
                IS NOT NULL

            AND p.deleted_at
                IS NULL
        `,
      );


    if (
      result.rows.length ===
      0
    ) {
      t.skip(
        'No module-specific permissions have been registered yet.',
      );

      return;
    }


    for (
      const row
      of result.rows
    ) {
      const key =
        String(
          row.key,
        )
          .trim()
          .toLowerCase();


      const moduleKey =
        String(
          row.module_key,
        )
          .trim()
          .toLowerCase();


      assert.ok(
        key.startsWith(
          `${moduleKey}.`,
        ),

        `Module permission "${key}" is not namespaced with "${moduleKey}.".`,
      );


      assert.ok(
        row.module_id,
        `Permission "${key}" references unknown module "${moduleKey}".`,
      );
    }
  },
);


/* ================================================================
   16. INSTALLED MODULE ENFORCEMENT
   ================================================================ */

test(
  'module permissions only become effective for installed workspace modules',
  async () => {
    const [
      permissionContext,
      rolePermissions,
      modulePermissions,
    ] =
      await Promise.all([
        source(
          'lib/auth/permission-context.ts',
        ),

        source(
          'lib/services/role-permissions.ts',
        ),

        source(
          'lib/auth/module-permissions.ts',
        ),
      ]);


    const resolver =
      compact(
        stripComments(
          permissionContext,
        ),
      );


    const rolePermissionService =
      compact(
        stripComments(
          rolePermissions,
        ),
      );


    const moduleRegistry =
      compact(
        stripComments(
          modulePermissions,
        ),
      );


    assert.match(
      resolver,
      /tenant_modules/,
      'Permission resolver must check tenant module installation.',
    );


    assert.match(
      resolver,
      /tm\.tenant_id/,
      'Module availability must be bound to the current workspace.',
    );


    assert.match(
      resolver,
      /p\.module_key/,
      'Permission module ownership must participate in resolution.',
    );


    assert.match(
      resolver,
      /installed/,
      'Installed module status is not checked.',
    );


    assert.match(
      rolePermissionService,
      /PERMISSION_UNAVAILABLE/,
      'Role permission service must reject permissions from unavailable apps.',
    );


    assert.match(
      rolePermissionService,
      /tenant_modules/,
      'Role permission mutation must validate installed modules.',
    );


    assert.match(
      moduleRegistry,
      /module_key/,
      'Module permission registry must persist module ownership.',
    );


    assert.match(
      moduleRegistry,
      /startsWith/,
      'Module permissions must enforce namespacing.',
    );
  },
);


/* ================================================================
   17. COMPANY-AWARE AUTHORIZATION
   ================================================================ */

test(
  'company authorization requires both permission and company access',
  async () => {
    const companyGuards =
      compact(
        stripComments(
          await source(
            'lib/auth/company-permission-guards.ts',
          ),
        ),
      );


    assert.match(
      companyGuards,
      /getPermissionContext/,
      'Company authorization must resolve permissions.',
    );


    assert.match(
      companyGuards,
      /requireCompanyContext/,
      'Company authorization must resolve trusted company context.',
    );


    assert.match(
      companyGuards,
      /assertCompanyPermission/,
      'Company operations must check permission.',
    );


    assert.match(
      companyGuards,
      /assertAllowedCompany/,
      'Company operations must check allowed-company access.',
    );


    assert.match(
      companyGuards,
      /selectedCompanyIds/,
      'Multi-company operations must use validated selected companies.',
    );


    assert.match(
      companyGuards,
      /allowedCompanyIds/,
      'Allowed-company boundary must be retained.',
    );


    assert.match(
      companyGuards,
      /CONTEXT_MISMATCH/,
      'Permission and company contexts must belong to the same authenticated request identity.',
    );
  },
);


/* ================================================================
   18. PRIVILEGE ESCALATION PROTECTION
   ================================================================ */

test(
  'non-owner role managers cannot assign permissions above their own authority',
  async () => {
    const userRoles =
      compact(
        stripComments(
          await source(
            'lib/services/user-roles.ts',
          ),
        ),
      );


    assert.match(
      userRoles,
      /assertActorCanManageRoles/,
      'User-role service is missing privilege-escalation validation.',
    );


    assert.match(
      userRoles,
      /PRIVILEGE_ESCALATION_BLOCKED/,
      'Role assignment must fail closed on privilege escalation.',
    );


    assert.match(
      userRoles,
      /context\.permissionSet\.has/,
      'Assignable roles must be restricted to the actor effective permission set.',
    );


    assert.match(
      userRoles,
      /actor\.permissions\.has/,
      'Role mutation must revalidate actor permissions inside the transaction.',
    );
  },
);


/* ================================================================
   19. OWNER ROLE ASSIGNMENT PROTECTION
   ================================================================ */

test(
  'workspace owner role assignments cannot be changed through ordinary role management',
  async () => {
    const userRoles =
      compact(
        stripComments(
          await source(
            'lib/services/user-roles.ts',
          ),
        ),
      );


    assert.match(
      userRoles,
      /protectWorkspaceOwner/,
      'Workspace owner assignments must have explicit protection.',
    );


    assert.match(
      userRoles,
      /OWNER_ROLE_ASSIGNMENTS_PROTECTED/,
      'Owner assignment mutation must fail with a protected-owner error.',
    );


    assert.match(
      userRoles,
      /membership\.is_owner/,
      'Owner protection must rely on structural ownership.',
    );
  },
);


/* ================================================================
   20. SYSTEM ROLE MUTATION PROTECTION
   ================================================================ */

test(
  'protected SaMi system roles cannot be mutated as custom roles',
  async () => {
    const [
      roles,
      rolePermissions,
    ] =
      await Promise.all([
        source(
          'lib/services/roles.ts',
        ),

        source(
          'lib/services/role-permissions.ts',
        ),
      ]);


    const rolesSource =
      compact(
        stripComments(
          roles,
        ),
      );


    const permissionsSource =
      compact(
        stripComments(
          rolePermissions,
        ),
      );


    assert.match(
      rolesSource,
      /SYSTEM_ROLE_PROTECTED/,
      'Role service must protect system roles.',
    );


    assert.match(
      permissionsSource,
      /SYSTEM_ROLE_PROTECTED/,
      'System role permission matrices must be protected from workspace mutation.',
    );
  },
);


/* ================================================================
   21. NO FUZZY ADMIN OR OWNER HEURISTICS
   ================================================================ */

test(
  'authorization no longer relies on fuzzy Admin or owner role names',
  async () => {
    const [
      accountContext,
      tenantContext,
    ] =
      await Promise.all([
        source(
          'lib/auth/account-context.ts',
        ),

        source(
          'lib/auth/tenant-context.ts',
        ),
      ]);


    /*
     * Strip comments before security inspection.
     *
     * Both files intentionally contain documentation showing
     * forbidden examples such as:
     *
     * LIKE '%admin%'
     *
     * Those examples must not be mistaken for executable logic.
     */
    const account =
      compact(
        stripComments(
          accountContext,
        ),
      );


    const tenant =
      compact(
        stripComments(
          tenantContext,
        ),
      );


    /* ----------------------------------------------------------
       No fuzzy SQL Admin detection
       ---------------------------------------------------------- */

    assert.doesNotMatch(
      account,
      /LIKE\s*['"]%admin%['"]/i,
      'Account context still contains fuzzy Admin SQL matching.',
    );


    assert.doesNotMatch(
      tenant,
      /LIKE\s*['"]%admin%['"]/i,
      'Tenant context still contains fuzzy Admin SQL matching.',
    );


    /* ----------------------------------------------------------
       No text contains/includes Admin detection
       ---------------------------------------------------------- */

    assert.doesNotMatch(
      account,
      /\.includes\(\s*['"]admin['"]\s*\)/i,
      'Account context still infers Admin from role text.',
    );


    assert.doesNotMatch(
      tenant,
      /\.includes\(\s*['"]admin['"]\s*\)/i,
      'Tenant context still infers Admin from role text.',
    );


    /* ----------------------------------------------------------
       Ownership must not be inferred from role labels
       ---------------------------------------------------------- */

    for (
      const forbidden
      of [
        'business_owner',
        'workspace_owner',
        'founder',
      ]
    ) {
      assert.equal(
        account.includes(
          forbidden,
        ),
        false,
        `Account context still guesses structural ownership using "${forbidden}".`,
      );


      assert.equal(
        tenant.includes(
          forbidden,
        ),
        false,
        `Tenant context still guesses structural ownership using "${forbidden}".`,
      );
    }


    /* ----------------------------------------------------------
       Account context must distinguish role identity correctly
       ---------------------------------------------------------- */

    assert.match(
      account,
      /isSystem/,
      'Account role context must distinguish protected system roles.',
    );


    assert.match(
      account,
      /tenantId/,
      'Account role context must distinguish global vs workspace roles.',
    );


    /* ----------------------------------------------------------
       Tenant context must use exact protected Admin identity
       ---------------------------------------------------------- */

    assert.match(
      tenant,
      /r\.is_system\s*=\s*TRUE/i,
      'Tenant context must require the protected system-role flag.',
    );


    assert.match(
      tenant,
      /r\.tenant_id\s+IS NULL/i,
      'Tenant context must require the protected Admin role to be global.',
    );


    assert.match(
      tenant,
      /r\.key[\s\S]{0,200}['"]admin['"]/i,
      'Tenant context must use the exact Admin role key.',
    );


    assert.match(
      tenant,
      /isOwner/,
      'Structural workspace ownership must remain independent from Admin role identity.',
    );
  },
);


/* ================================================================
   22. SYSTEM ADMIN IDENTITY IS EXACT
   ================================================================ */

test(
  'compatibility Admin detection uses the exact protected global Admin role',
  async () => {
    const [
      accountContext,
      tenantContext,
    ] =
      await Promise.all([
        source(
          'lib/auth/account-context.ts',
        ),

        source(
          'lib/auth/tenant-context.ts',
        ),
      ]);


    const combined =
      compact(
        stripComments(
          `${accountContext}\n${tenantContext}`,
        ),
      );


    assert.match(
      combined,
      /is_system\s*=\s*TRUE/i,
      'Admin compatibility detection must require a system role.',
    );


    assert.match(
      combined,
      /tenant_id\s+IS NULL/i,
      'Admin compatibility detection must require a global role.',
    );


    assert.match(
      combined,
      /admin/i,
      'Canonical Admin key check is missing.',
    );


    assert.match(
      combined,
      /isOwner/,
      'Structural ownership must remain independent of Admin role identity.',
    );
  },
);


/* ================================================================
   23. API TENANT TRUST BOUNDARY
   ================================================================ */

test(
  'role-management APIs never accept a browser-supplied tenant ID',
  async () => {
    const [
      rolesRoute,
      permissionsRoute,
      memberRolesRoute,
    ] =
      await Promise.all([
        source(
          'app/api/workspace/roles/route.ts',
        ),

        source(
          'app/api/workspace/roles/permissions/route.ts',
        ),

        source(
          'app/api/workspace/member-roles/route.ts',
        ),
      ]);


    for (
      const [
        routeName,
        rawRouteSource,
      ]
      of [
        [
          'roles',
          rolesRoute,
        ],

        [
          'role permissions',
          permissionsRoute,
        ],

        [
          'member roles',
          memberRolesRoute,
        ],
      ] as const
    ) {
      const routeSource =
        stripComments(
          rawRouteSource,
        );


      assert.doesNotMatch(
        routeSource,
        /body\s*\??\.\s*tenantId/,
        `${routeName} API accepts tenantId from request body.`,
      );


      assert.doesNotMatch(
        routeSource,
        /searchParams[\s\S]{0,120}tenantId/,
        `${routeName} API accepts tenantId from query parameters.`,
      );
    }
  },
);


/* ================================================================
   24. ROLE API USES TRUSTED SERVICES
   ================================================================ */

test(
  'authorization APIs delegate to trusted role services',
  async () => {
    const [
      rolesRoute,
      permissionsRoute,
      memberRolesRoute,
    ] =
      await Promise.all([
        source(
          'app/api/workspace/roles/route.ts',
        ),

        source(
          'app/api/workspace/roles/permissions/route.ts',
        ),

        source(
          'app/api/workspace/member-roles/route.ts',
        ),
      ]);


    const rolesSource =
      stripComments(
        rolesRoute,
      );


    const permissionSource =
      stripComments(
        permissionsRoute,
      );


    const memberSource =
      stripComments(
        memberRolesRoute,
      );


    assert.match(
      rolesSource,
      /listWorkspaceRoles/,
    );


    assert.match(
      rolesSource,
      /createWorkspaceRole/,
    );


    assert.match(
      permissionSource,
      /getRolePermissionMatrix/,
    );


    assert.match(
      permissionSource,
      /replaceWorkspaceRolePermissions/,
    );


    assert.match(
      memberSource,
      /getWorkspaceMemberRoles/,
    );


    assert.match(
      memberSource,
      /replaceWorkspaceMemberRoles/,
    );


    assert.match(
      memberSource,
      /listAssignableWorkspaceRoles/,
    );
  },
);


/* ================================================================
   25. LIVE ROLE DATA REFERENCES VALID ROLES
   ================================================================ */

test(
  'active user-role assignments never reference missing role records',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM user_roles ur

          LEFT JOIN roles r
            ON r.id =
               ur.role_id

          WHERE ur.deleted_at
                IS NULL

            AND r.id
                IS NULL
        `,
      );


    assert.equal(
      Number(
        result.rows[0]
          .count,
      ),
      0,
      'An active user-role assignment references a missing role.',
    );
  },
);


/* ================================================================
   26. LIVE ROLE PERMISSIONS REFERENCE VALID RECORDS
   ================================================================ */

test(
  'active role-permission assignments reference valid roles and permissions',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            COUNT(*)::integer
              AS count

          FROM role_permissions rp

          LEFT JOIN roles r
            ON r.id =
               rp.role_id

          LEFT JOIN permissions p
            ON p.id =
               rp.permission_id

          WHERE rp.deleted_at
                IS NULL

            AND (
              r.id
                IS NULL

              OR

              p.id
                IS NULL
            )
        `,
      );


    assert.equal(
      Number(
        result.rows[0]
          .count,
      ),
      0,
      'An active role-permission assignment references a missing role or permission.',
    );
  },
);


/* ================================================================
   27. PERMISSION KEYS ARE NORMALIZED
   ================================================================ */

test(
  'active permission keys are normalized lowercase identifiers',
  async () => {
    const result =
      await control.query(
        `
          SELECT
            id,
            key

          FROM permissions

          WHERE deleted_at
                IS NULL

            AND (
              key <>
                LOWER(
                  key
                )

              OR

              key <>
                BTRIM(
                  key
                )

              OR

              key !~
                '^[a-z][a-z0-9_]*(\\.[a-z0-9][a-z0-9_-]*)+$'
            )
        `,
      );


    assert.equal(
      result.rows.length,
      0,
      result.rows.length ===
        0
        ? undefined
        : `Invalid permission keys found: ${JSON.stringify(
            result.rows,
          )}`,
    );
  },
);