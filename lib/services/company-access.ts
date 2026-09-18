import 'server-only';

import crypto from 'node:crypto';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


/* ================================================================
   SaMi COMPANY ACCESS SERVICE
   ================================================================

   Category 7.5 — Multi-Company Access

   Odoo-inspired model:

       Workspace
           ↓
       Tenant Database
           ↓
       Companies
           ↓
       company_users
           ↓
       Allowed companies for each internal user

   IMPORTANT DISTINCTION

   tenant_users
       = can the user belong to / enter this workspace?

   company_users
       = which companies inside this workspace may the user use?

   roles / permissions
       = what may the user do?
         Category 8

   current/default company
       = which allowed company is currently selected?
         Category 7.6

   This service does NOT trust company IDs supplied by a browser.
   A caller must already have trusted workspace identity.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type CompanyAccessStatus =
  | 'active';


export interface WorkspaceCompany {
  id:
    string;

  name:
    string;

  legalName:
    string | null;

  logoUrl:
    string | null;

  currency:
    string;

  timezone:
    string;

  country:
    string | null;

  isActive:
    boolean;

  archivedAt:
    string | null;
}


export interface AllowedCompany
  extends WorkspaceCompany {
  accessId:
    string;

  userId:
    string;

  accessStatus:
    CompanyAccessStatus;

  isDefault:
    boolean;

  grantedAt:
    string | null;
}


export interface CompanyAccessResult {
  tenantId:
    string;

  userId:
    string;

  companyId:
    string;

  changed:
    boolean;

  isDefault:
    boolean;
}


export interface GrantCompanyAccessInput {
  tenantId:
    string;

  actorUserId:
    string;

  targetUserId:
    string;

  companyId:
    string;
}


export interface RevokeCompanyAccessInput {
  tenantId:
    string;

  actorUserId:
    string;

  targetUserId:
    string;

  companyId:
    string;
}


export interface BootstrapCompanyAccessResult {
  tenantId:
    string;

  ownerUserId:
    string;

  company:
    WorkspaceCompany;

  companyCreated:
    boolean;

  accessCreated:
    boolean;
}


/* ================================================================
   ERRORS
   ================================================================ */

export class CompanyAccessError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'INVALID_ACTOR_USER_ID'
    | 'INVALID_TARGET_USER_ID'
    | 'INVALID_COMPANY_ID'
    | 'WORKSPACE_NOT_FOUND'
    | 'WORKSPACE_NOT_ACTIVE'
    | 'ACTOR_ACCESS_DENIED'
    | 'OWNER_REQUIRED'
    | 'TARGET_MEMBERSHIP_NOT_FOUND'
    | 'TARGET_MEMBERSHIP_NOT_ACTIVE'
    | 'PORTAL_COMPANY_ACCESS_DENIED'
    | 'COMPANY_NOT_FOUND'
    | 'COMPANY_NOT_ACTIVE'
    | 'COMPANY_ACCESS_NOT_FOUND'
    | 'LAST_COMPANY_REQUIRED';


  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'INVALID_ACTOR_USER_ID'
      | 'INVALID_TARGET_USER_ID'
      | 'INVALID_COMPANY_ID'
      | 'WORKSPACE_NOT_FOUND'
      | 'WORKSPACE_NOT_ACTIVE'
      | 'ACTOR_ACCESS_DENIED'
      | 'OWNER_REQUIRED'
      | 'TARGET_MEMBERSHIP_NOT_FOUND'
      | 'TARGET_MEMBERSHIP_NOT_ACTIVE'
      | 'PORTAL_COMPANY_ACCESS_DENIED'
      | 'COMPANY_NOT_FOUND'
      | 'COMPANY_NOT_ACTIVE'
      | 'COMPANY_ACCESS_NOT_FOUND'
      | 'LAST_COMPANY_REQUIRED',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'CompanyAccessError';

    this.code =
      code;
  }
}


/* ================================================================
   UUID
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function requireUuid(
  value:
    string,

  field:
    'tenant'
    | 'actor'
    | 'target'
    | 'company',
): string {
  if (
    typeof value !==
      'string'
  ) {
    throwUuidError(
      field,
    );
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throwUuidError(
      field,
    );
  }


  return normalized;
}


function throwUuidError(
  field:
    'tenant'
    | 'actor'
    | 'target'
    | 'company',
): never {
  switch (
    field
  ) {
    case 'tenant':
      throw new CompanyAccessError(
        'INVALID_TENANT_ID',
        'A valid workspace ID is required.',
      );

    case 'actor':
      throw new CompanyAccessError(
        'INVALID_ACTOR_USER_ID',
        'A valid acting user ID is required.',
      );

    case 'target':
      throw new CompanyAccessError(
        'INVALID_TARGET_USER_ID',
        'A valid target user ID is required.',
      );

    case 'company':
      throw new CompanyAccessError(
        'INVALID_COMPANY_ID',
        'A valid company ID is required.',
      );
  }
}


/* ================================================================
   ISO DATE
   ================================================================ */

function toIso(
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


  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }


  return date.toISOString();
}


/* ================================================================
   MAP COMPANY
   ================================================================ */

function mapCompany(
  row:
    Record<
      string,
      unknown
    >,
): WorkspaceCompany {
  return {
    id:
      String(
        row.id ||
        '',
      ),

    name:
      typeof row.name ===
        'string'
        ? row.name
        : '',

    legalName:
      typeof row.legal_name ===
        'string'
        ? row.legal_name
        : null,

    logoUrl:
      typeof row.logo_url ===
        'string'
        ? row.logo_url
        : null,

    currency:
      typeof row.currency ===
        'string'
        ? row.currency
        : 'KES',

    timezone:
      typeof row.timezone ===
        'string'
        ? row.timezone
        : 'Africa/Nairobi',

    country:
      typeof row.country ===
        'string'
        ? row.country
        : null,

    isActive:
      row.is_active ===
      true,

    archivedAt:
      toIso(
        row.archived_at,
      ),
  };
}


/* ================================================================
   MAP ALLOWED COMPANY
   ================================================================ */

function mapAllowedCompany(
  row:
    Record<
      string,
      unknown
    >,
): AllowedCompany {
  return {
    ...mapCompany(
      row,
    ),

    accessId:
      String(
        row.access_id ||
        '',
      ),

    userId:
      String(
        row.user_id ||
        '',
      ),

    accessStatus:
      'active',

    isDefault:
      row.is_default ===
      true,

    grantedAt:
      toIso(
        row.access_created_at,
      ),
  };
}


/* ================================================================
   REQUIRE WORKSPACE
   ================================================================ */

async function requireWorkspace(
  tenantId:
    string,
): Promise<{
  tenantId: string;
  name: string;
}> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          name,
          status,
          deleted_at

        FROM tenants

        WHERE id = $1

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'WORKSPACE_NOT_FOUND',
      'The workspace could not be found.',
    );
  }


  const row =
    result.rows[0];


  if (
    row.deleted_at ||
    String(
      row.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new CompanyAccessError(
      'WORKSPACE_NOT_ACTIVE',
      'The workspace is not currently active.',
    );
  }


  return {
    tenantId:
      String(
        row.id,
      ),

    name:
      typeof row.name ===
        'string'
        ? row.name
        : 'SaMi Workspace',
  };
}


/* ================================================================
   REQUIRE ACTING OWNER
   ================================================================

   Category 8 will later replace this temporary owner-only rule
   with a detailed permission such as:

       users.manage_company_access

   Until Category 8 exists, owner-only is the safer boundary.

   ================================================================ */

async function requireActingOwner(
  tenantId:
    string,

  actorUserId:
    string,
): Promise<void> {
  const result =
    await queryControl(
      `
        SELECT
          tu.id

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2

          AND tu.is_owner =
              TRUE

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) = 'internal'

          AND tu.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              u.status,
              ''
            )
          ) = 'active'

          AND u.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) = 'active'

          AND t.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tenantId,
        actorUserId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'OWNER_REQUIRED',
      'Only the workspace owner can currently manage company access.',
    );
  }
}


/* ================================================================
   REQUIRE TARGET INTERNAL MEMBERSHIP
   ================================================================ */

async function requireTargetInternalMembership(
  tenantId:
    string,

  targetUserId:
    string,
): Promise<{
  isOwner: boolean;
}> {
  const result =
    await queryControl(
      `
        SELECT
          tu.status,
          tu.member_type,
          tu.is_owner,
          tu.deleted_at,

          u.status
            AS user_status,

          u.deleted_at
            AS user_deleted_at

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2

        LIMIT 1
      `,
      [
        tenantId,
        targetUserId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'TARGET_MEMBERSHIP_NOT_FOUND',
      'The user does not belong to this workspace.',
    );
  }


  const row =
    result.rows[0];


  if (
    row.deleted_at ||
    row.user_deleted_at
  ) {
    throw new CompanyAccessError(
      'TARGET_MEMBERSHIP_NOT_ACTIVE',
      'The user does not have an active workspace membership.',
    );
  }


  if (
    String(
      row.member_type ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'internal'
  ) {
    throw new CompanyAccessError(
      'PORTAL_COMPANY_ACCESS_DENIED',
      'Portal members cannot be assigned internal company access.',
    );
  }


  if (
    String(
      row.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new CompanyAccessError(
      'TARGET_MEMBERSHIP_NOT_ACTIVE',
      'The workspace membership is not active.',
    );
  }


  if (
    String(
      row.user_status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new CompanyAccessError(
      'TARGET_MEMBERSHIP_NOT_ACTIVE',
      'The SaMi account is not active.',
    );
  }


  return {
    isOwner:
      row.is_owner ===
      true,
  };
}


/* ================================================================
   COMPANY LOOKUP
   ================================================================ */

async function requireActiveCompany(
  client:
    PoolClient,

  companyId:
    string,
): Promise<WorkspaceCompany> {
  const result =
    await client.query(
      `
        SELECT
          id,
          name,
          legal_name,
          logo_url,
          currency,
          timezone,
          country,
          is_active,
          archived_at

        FROM companies

        WHERE id = $1

        LIMIT 1

        FOR UPDATE
      `,
      [
        companyId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'COMPANY_NOT_FOUND',
      'The company could not be found in this workspace.',
    );
  }


  const company =
    mapCompany(
      result.rows[0],
    );


  if (
    !company.isActive ||
    company.archivedAt
  ) {
    throw new CompanyAccessError(
      'COMPANY_NOT_ACTIVE',
      'The company is not currently active.',
    );
  }


  return company;
}


/* ================================================================
   AUDIT
   ================================================================

   Company access lives in the tenant database while SaMi's
   platform audit log currently lives in the Control DB.

   PostgreSQL cannot make this a single transaction across two
   different physical databases.

   Therefore the access mutation remains authoritative and the
   audit write is best-effort until Category 16 adds the durable
   cross-database audit/event pipeline.

   ================================================================ */

async function writeCompanyAccessAudit(
  input: {
    tenantId:
      string;

    actorUserId:
      string;

    targetUserId:
      string;

    companyId:
      string;

    action:
      string;

    eventType:
      string;

    metadata?:
      Record<
        string,
        unknown
      >;
  },
): Promise<void> {
  try {
    await queryControl(
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

          correlation_id,

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

          'company_access',
          $4,

          'workspace',

          'success',

          $5::jsonb,

          $6,

          $7,

          'company',
          $4,

          NOW()
        )
      `,
      [
        input.tenantId,
        input.actorUserId,

        input.action,

        input.companyId,

        JSON.stringify({
          targetUserId:
            input.targetUserId,

          ...(
            input.metadata ||
            {}
          ),
        }),

        crypto.randomUUID(),

        input.eventType,
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Failed to write company access audit event:',
      error,
    );
  }
}


/* ================================================================
   LIST WORKSPACE COMPANIES
   ================================================================ */

export async function listWorkspaceCompanies(
  tenantId:
    string,

  options?: {
    includeArchived?:
      boolean;
  },
): Promise<WorkspaceCompany[]> {
  const normalizedTenantId =
    requireUuid(
      tenantId,
      'tenant',
    );


  await requireWorkspace(
    normalizedTenantId,
  );


  const pool =
    await getTenantPoolByTenantId(
      normalizedTenantId,
    );


  const includeArchived =
    options?.includeArchived ===
    true;


  const result =
    await pool.query(
      `
        SELECT
          id,
          name,
          legal_name,
          logo_url,
          currency,
          timezone,
          country,
          is_active,
          archived_at

        FROM companies

        WHERE (
          $1::boolean = TRUE

          OR

          (
            is_active =
              TRUE

            AND archived_at
                IS NULL
          )
        )

        ORDER BY
          CASE
            WHEN is_active =
                 TRUE
              AND archived_at
                  IS NULL
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            name
          ) ASC,

          created_at ASC
      `,
      [
        includeArchived,
      ],
    );


  return result.rows.map(
    row =>
      mapCompany(
        row,
      ),
  );
}


/* ================================================================
   LIST ALLOWED COMPANIES
   ================================================================

   Equivalent conceptually to Odoo's user.company_ids.

   ================================================================ */

export async function listAllowedCompanies(
  tenantId:
    string,

  userId:
    string,
): Promise<AllowedCompany[]> {
  const normalizedTenantId =
    requireUuid(
      tenantId,
      'tenant',
    );


  const normalizedUserId =
    requireUuid(
      userId,
      'target',
    );


  await requireWorkspace(
    normalizedTenantId,
  );


  await requireTargetInternalMembership(
    normalizedTenantId,
    normalizedUserId,
  );


  const pool =
    await getTenantPoolByTenantId(
      normalizedTenantId,
    );


  const result =
    await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.legal_name,
          c.logo_url,
          c.currency,
          c.timezone,
          c.country,
          c.is_active,
          c.archived_at,

          cu.id
            AS access_id,

          cu.user_id,

          cu.status
            AS access_status,

          cu.is_default,

          cu.created_at
            AS access_created_at

        FROM company_users cu

        INNER JOIN companies c
          ON c.id =
             cu.company_id

        WHERE cu.user_id = $1

          AND LOWER(
            COALESCE(
              cu.status,
              ''
            )
          ) = 'active'

          AND c.is_active =
              TRUE

          AND c.archived_at
              IS NULL

        ORDER BY
          CASE
            WHEN cu.is_default =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            c.name
          ) ASC,

          c.created_at ASC
      `,
      [
        normalizedUserId,
      ],
    );


  return result.rows.map(
    row =>
      mapAllowedCompany(
        row,
      ),
  );
}


/* ================================================================
   HAS COMPANY ACCESS
   ================================================================ */

export async function hasCompanyAccess(
  tenantId:
    string,

  userId:
    string,

  companyId:
    string,
): Promise<boolean> {
  const normalizedTenantId =
    requireUuid(
      tenantId,
      'tenant',
    );


  const normalizedUserId =
    requireUuid(
      userId,
      'target',
    );


  const normalizedCompanyId =
    requireUuid(
      companyId,
      'company',
    );


  const pool =
    await getTenantPoolByTenantId(
      normalizedTenantId,
    );


  const result =
    await pool.query(
      `
        SELECT
          1

        FROM company_users cu

        INNER JOIN companies c
          ON c.id =
             cu.company_id

        WHERE cu.user_id = $1
          AND cu.company_id = $2

          AND LOWER(
            COALESCE(
              cu.status,
              ''
            )
          ) = 'active'

          AND c.is_active =
              TRUE

          AND c.archived_at
              IS NULL

        LIMIT 1
      `,
      [
        normalizedUserId,
        normalizedCompanyId,
      ],
    );


  return result.rows.length ===
    1;
}


/* ================================================================
   REQUIRE COMPANY ACCESS
   ================================================================ */

export async function requireCompanyAccess(
  tenantId:
    string,

  userId:
    string,

  companyId:
    string,
): Promise<AllowedCompany> {
  const normalizedTenantId =
    requireUuid(
      tenantId,
      'tenant',
    );


  const normalizedUserId =
    requireUuid(
      userId,
      'target',
    );


  const normalizedCompanyId =
    requireUuid(
      companyId,
      'company',
    );


  await requireTargetInternalMembership(
    normalizedTenantId,
    normalizedUserId,
  );


  const pool =
    await getTenantPoolByTenantId(
      normalizedTenantId,
    );


  const result =
    await pool.query(
      `
        SELECT
          c.id,
          c.name,
          c.legal_name,
          c.logo_url,
          c.currency,
          c.timezone,
          c.country,
          c.is_active,
          c.archived_at,

          cu.id
            AS access_id,

          cu.user_id,

          cu.status
            AS access_status,

          cu.is_default,

          cu.created_at
            AS access_created_at

        FROM company_users cu

        INNER JOIN companies c
          ON c.id =
             cu.company_id

        WHERE cu.user_id = $1
          AND cu.company_id = $2

          AND LOWER(
            COALESCE(
              cu.status,
              ''
            )
          ) = 'active'

          AND c.is_active =
              TRUE

          AND c.archived_at
              IS NULL

        LIMIT 1
      `,
      [
        normalizedUserId,
        normalizedCompanyId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'COMPANY_ACCESS_NOT_FOUND',
      'You do not have access to this company.',
    );
  }


  return mapAllowedCompany(
    result.rows[0],
  );
}


/* ================================================================
   GRANT COMPANY ACCESS
   ================================================================ */

export async function grantCompanyAccess(
  input:
    GrantCompanyAccessInput,
): Promise<CompanyAccessResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const companyId =
    requireUuid(
      input.companyId,
      'company',
    );


  await requireWorkspace(
    tenantId,
  );


  await requireActingOwner(
    tenantId,
    actorUserId,
  );


  await requireTargetInternalMembership(
    tenantId,
    targetUserId,
  );


  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );


  const client =
    await pool.connect();


  let changed =
    false;


  let isDefault =
    false;


  try {
    await client.query(
      'BEGIN',
    );


    await requireActiveCompany(
      client,
      companyId,
    );


    const existing =
      await client.query(
        `
          SELECT
            id,
            status,
            is_default

          FROM company_users

          WHERE company_id = $1
            AND user_id = $2

          LIMIT 1

          FOR UPDATE
        `,
        [
          companyId,
          targetUserId,
        ],
      );


    if (
      existing.rows.length >
      0
    ) {
      const currentStatus =
        String(
          existing.rows[0]
            .status ||
          '',
        )
          .trim()
          .toLowerCase();


      if (
        currentStatus ===
          'active'
      ) {
        isDefault =
          existing.rows[0]
            .is_default ===
          true;


        await client.query(
          'COMMIT',
        );


        return {
          tenantId,
          userId:
            targetUserId,

          companyId,

          changed:
            false,

          isDefault,
        };
      }


      await client.query(
        `
          UPDATE company_users

          SET
            status =
              'active',

            updated_at =
              NOW()

          WHERE company_id = $1
            AND user_id = $2
        `,
        [
          companyId,
          targetUserId,
        ],
      );


      changed =
        true;
    } else {
      const activeAccess =
        await client.query(
          `
            SELECT
              1

            FROM company_users cu

            INNER JOIN companies c
              ON c.id =
                 cu.company_id

            WHERE cu.user_id = $1

              AND LOWER(
                COALESCE(
                  cu.status,
                  ''
                )
              ) = 'active'

              AND c.is_active =
                  TRUE

              AND c.archived_at
                  IS NULL

            LIMIT 1
          `,
          [
            targetUserId,
          ],
        );


      const firstCompany =
        activeAccess.rows.length ===
        0;


      await client.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,
            is_default,
            status,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,
            'active',
            NOW(),
            NOW()
          )
        `,
        [
          companyId,
          targetUserId,
          firstCompany,
        ],
      );


      isDefault =
        firstCompany;


      changed =
        true;
    }


    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original error.
    }


    throw error;
  } finally {
    client.release();
  }


  /**
   * If this is the user's first allowed company, make the
   * Control DB pointer consistent.
   *
   * Category 7.6 will fully own default/current company context.
   */
  if (
    isDefault
  ) {
    try {
      await queryControl(
        `
          UPDATE tenant_users

          SET
            default_company_id =
              $3,

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND user_id = $2

            AND deleted_at
                IS NULL
        `,
        [
          tenantId,
          targetUserId,
          companyId,
        ],
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Company access was granted but default company pointer could not be synchronized:',
        error,
      );
    }
  }


  if (
    changed
  ) {
    await writeCompanyAccessAudit({
      tenantId,
      actorUserId,
      targetUserId,
      companyId,

      action:
        'workspace.company_access.granted',

      eventType:
        'workspace.company_access.granted',

      metadata: {
        automaticallyDefault:
          isDefault,
      },
    });
  }


  return {
    tenantId,

    userId:
      targetUserId,

    companyId,

    changed,

    isDefault,
  };
}


/* ================================================================
   REVOKE COMPANY ACCESS
   ================================================================ */

export async function revokeCompanyAccess(
  input:
    RevokeCompanyAccessInput,
): Promise<CompanyAccessResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const companyId =
    requireUuid(
      input.companyId,
      'company',
    );


  await requireWorkspace(
    tenantId,
  );


  await requireActingOwner(
    tenantId,
    actorUserId,
  );


  await requireTargetInternalMembership(
    tenantId,
    targetUserId,
  );


  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );


  const client =
    await pool.connect();


  let replacementDefaultCompanyId:
    string | null =
    null;


  let wasDefault =
    false;


  try {
    await client.query(
      'BEGIN',
    );


    const access =
      await client.query(
        `
          SELECT
            cu.id,
            cu.is_default

          FROM company_users cu

          INNER JOIN companies c
            ON c.id =
               cu.company_id

          WHERE cu.user_id = $1
            AND cu.company_id = $2

            AND LOWER(
              COALESCE(
                cu.status,
                ''
              )
            ) = 'active'

          LIMIT 1

          FOR UPDATE OF cu
        `,
        [
          targetUserId,
          companyId,
        ],
      );


    if (
      access.rows.length ===
      0
    ) {
      await client.query(
        'COMMIT',
      );


      return {
        tenantId,

        userId:
          targetUserId,

        companyId,

        changed:
          false,

        isDefault:
          false,
      };
    }


    const allAccess =
      await client.query(
        `
          SELECT
            cu.company_id,
            cu.is_default,

            c.name

          FROM company_users cu

          INNER JOIN companies c
            ON c.id =
               cu.company_id

          WHERE cu.user_id = $1

            AND LOWER(
              COALESCE(
                cu.status,
                ''
              )
            ) = 'active'

            AND c.is_active =
                TRUE

            AND c.archived_at
                IS NULL

          ORDER BY
            CASE
              WHEN cu.is_default =
                   TRUE
              THEN 0

              ELSE 1
            END ASC,

            LOWER(
              c.name
            ) ASC,

            cu.created_at ASC

          FOR UPDATE OF cu
        `,
        [
          targetUserId,
        ],
      );


    if (
      allAccess.rows.length <=
      1
    ) {
      throw new CompanyAccessError(
        'LAST_COMPANY_REQUIRED',
        'An active internal workspace member must retain access to at least one company.',
      );
    }


    wasDefault =
      access.rows[0]
        .is_default ===
      true;


    /**
     * company_users represents current allowed-company membership.
     *
     * Removing the relation matches the normal many-to-many
     * semantics of an allowed-company list.
     *
     * Historical changes remain in audit_logs.
     */
    await client.query(
      `
        DELETE FROM company_users

        WHERE user_id = $1
          AND company_id = $2
      `,
      [
        targetUserId,
        companyId,
      ],
    );


    if (
      wasDefault
    ) {
      const replacement =
        allAccess.rows.find(
          row =>
            String(
              row.company_id,
            ) !==
            companyId,
        );


      if (
        !replacement
      ) {
        throw new CompanyAccessError(
          'LAST_COMPANY_REQUIRED',
          'A replacement company could not be selected.',
        );
      }


      replacementDefaultCompanyId =
        String(
          replacement.company_id,
        );


      await client.query(
        `
          UPDATE company_users

          SET
            is_default =
              FALSE,

            updated_at =
              NOW()

          WHERE user_id = $1
        `,
        [
          targetUserId,
        ],
      );


      await client.query(
        `
          UPDATE company_users

          SET
            is_default =
              TRUE,

            updated_at =
              NOW()

          WHERE user_id = $1
            AND company_id = $2
        `,
        [
          targetUserId,
          replacementDefaultCompanyId,
        ],
      );
    }


    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original error.
    }


    throw error;
  } finally {
    client.release();
  }


  /**
   * Keep the Control DB's default_company_id from pointing to
   * company access that has just been removed.
   *
   * Category 7.6 will formalize this relationship.
   */
  try {
    if (
      replacementDefaultCompanyId
    ) {
      await queryControl(
        `
          UPDATE tenant_users

          SET
            default_company_id =
              $4,

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND user_id = $2

            AND (
              default_company_id =
                $3

              OR

              default_company_id
                IS NULL
            )

            AND deleted_at
                IS NULL
        `,
        [
          tenantId,
          targetUserId,
          companyId,
          replacementDefaultCompanyId,
        ],
      );
    } else {
      await queryControl(
        `
          UPDATE tenant_users

          SET
            default_company_id =
              NULL,

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND user_id = $2
            AND default_company_id = $3

            AND deleted_at
                IS NULL
        `,
        [
          tenantId,
          targetUserId,
          companyId,
        ],
      );
    }
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Company access was revoked but default company pointer could not be synchronized:',
      error,
    );
  }


  await writeCompanyAccessAudit({
    tenantId,
    actorUserId,
    targetUserId,
    companyId,

    action:
      'workspace.company_access.revoked',

    eventType:
      'workspace.company_access.revoked',

    metadata: {
      wasDefault,

      replacementDefaultCompanyId,
    },
  });


  return {
    tenantId,

    userId:
      targetUserId,

    companyId,

    changed:
      true,

    isDefault:
      false,
  };
}


/* ================================================================
   BOOTSTRAP PRIMARY WORKSPACE COMPANY
   ================================================================

   There is currently a historical gap in provisioning:

   tenant-core.sql creates:

       companies
       company_users

   but provisioning does not yet seed the original company or
   link the workspace owner.

   This idempotent function safely repairs that gap.

   It:

   1. finds the active workspace owner
   2. reuses the first active company if one already exists
   3. otherwise creates the initial company from the workspace name
   4. grants the owner access
   5. makes that company the owner's initial default
   6. synchronizes tenant_users.default_company_id

   Category 10 will later own full company creation/editing.

   ================================================================ */

export async function bootstrapPrimaryCompanyAccess(
  tenantId:
    string,
): Promise<BootstrapCompanyAccessResult> {
  const normalizedTenantId =
    requireUuid(
      tenantId,
      'tenant',
    );


  const workspace =
    await requireWorkspace(
      normalizedTenantId,
    );


  const ownerResult =
    await queryControl(
      `
        SELECT
          tu.user_id

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        WHERE tu.tenant_id = $1

          AND tu.is_owner =
              TRUE

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) = 'internal'

          AND tu.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              u.status,
              ''
            )
          ) = 'active'

          AND u.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        normalizedTenantId,
      ],
    );


  if (
    ownerResult.rows.length ===
      0
  ) {
    throw new CompanyAccessError(
      'TARGET_MEMBERSHIP_NOT_FOUND',
      'The workspace does not have an active internal owner.',
    );
  }


  const ownerUserId =
    String(
      ownerResult.rows[0]
        .user_id,
    );


  const pool =
    await getTenantPoolByTenantId(
      normalizedTenantId,
    );


  const client =
    await pool.connect();


  let company:
    WorkspaceCompany;


  let companyCreated =
    false;


  let accessCreated =
    false;


  try {
    await client.query(
      'BEGIN',
    );


    const companyResult =
      await client.query(
        `
          SELECT
            id,
            name,
            legal_name,
            logo_url,
            currency,
            timezone,
            country,
            is_active,
            archived_at

          FROM companies

          WHERE is_active =
                TRUE

            AND archived_at
                IS NULL

          ORDER BY
            created_at ASC,
            id ASC

          LIMIT 1

          FOR UPDATE
        `,
      );


    if (
      companyResult.rows.length >
      0
    ) {
      company =
        mapCompany(
          companyResult.rows[0],
        );
    } else {
      const created =
        await client.query(
          `
            INSERT INTO companies (
              name,
              legal_name,
              is_active,
              created_at,
              updated_at
            )

            VALUES (
              $1,
              $1,
              TRUE,
              NOW(),
              NOW()
            )

            RETURNING
              id,
              name,
              legal_name,
              logo_url,
              currency,
              timezone,
              country,
              is_active,
              archived_at
          `,
          [
            workspace.name,
          ],
        );


      company =
        mapCompany(
          created.rows[0],
        );


      companyCreated =
        true;
    }


    const existingAccess =
      await client.query(
        `
          SELECT
            id,
            is_default,
            status

          FROM company_users

          WHERE company_id = $1
            AND user_id = $2

          LIMIT 1

          FOR UPDATE
        `,
        [
          company.id,
          ownerUserId,
        ],
      );


    await client.query(
      `
        UPDATE company_users

        SET
          is_default =
            FALSE,

          updated_at =
            NOW()

        WHERE user_id = $1
      `,
      [
        ownerUserId,
      ],
    );


    if (
      existingAccess.rows.length ===
      0
    ) {
      await client.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,
            is_default,
            status,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            TRUE,
            'active',
            NOW(),
            NOW()
          )
        `,
        [
          company.id,
          ownerUserId,
        ],
      );


      accessCreated =
        true;
    } else {
      await client.query(
        `
          UPDATE company_users

          SET
            is_default =
              TRUE,

            status =
              'active',

            updated_at =
              NOW()

          WHERE company_id = $1
            AND user_id = $2
        `,
        [
          company.id,
          ownerUserId,
        ],
      );
    }


    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original error.
    }


    throw error;
  } finally {
    client.release();
  }


  try {
    await queryControl(
      `
        UPDATE tenant_users

        SET
          default_company_id =
            $3,

          updated_at =
            NOW()

        WHERE tenant_id = $1
          AND user_id = $2

          AND deleted_at
              IS NULL
      `,
      [
        normalizedTenantId,
        ownerUserId,
        company.id,
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Primary company was bootstrapped but Control DB default company pointer could not be synchronized:',
      error,
    );
  }


  if (
    companyCreated ||
    accessCreated
  ) {
    await writeCompanyAccessAudit({
      tenantId:
        normalizedTenantId,

      actorUserId:
        ownerUserId,

      targetUserId:
        ownerUserId,

      companyId:
        company.id,

      action:
        'workspace.company_access.bootstrapped',

      eventType:
        'workspace.company_access.bootstrapped',

      metadata: {
        companyCreated,
        accessCreated,
      },
    });
  }


  return {
    tenantId:
      normalizedTenantId,

    ownerUserId,

    company,

    companyCreated,

    accessCreated,
  };
}