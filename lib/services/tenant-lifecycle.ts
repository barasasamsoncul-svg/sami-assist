import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';

import {
  closeTenantPool,
} from '@/lib/db/tenant';


/* ================================================================
   SaMi TENANT DATABASE LIFECYCLE
   ================================================================

   This service controls logical lifecycle state for physical
   tenant databases.

   It does NOT:

   - DROP PostgreSQL databases
   - expose lifecycle operations to the browser
   - create Platform Admin APIs
   - authorize workspace users
   - replace Category 5 workspace lifecycle

   Category 5 controls the workspace.

   Category 6 mirrors the appropriate workspace lifecycle state
   onto the physical tenant database registry.
   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type TenantDatabaseLifecycleStatus =
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'suspended'
  | 'archived'
  | 'pending_deletion'
  | 'deleted';


export type TenantDatabaseLifecycleRecord = {
  id: string;

  tenantId: string;

  databaseName: string;

  status:
    TenantDatabaseLifecycleStatus;

  suspendedAt:
    Date | string | null;

  archivedAt:
    Date | string | null;

  deletionRequestedAt:
    Date | string | null;

  deletedAt:
    Date | string | null;
};


/* ================================================================
   ERROR
   ================================================================ */

export class TenantDatabaseLifecycleError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'TENANT_DATABASE_NOT_FOUND'
    | 'INVALID_DATABASE_TRANSITION';

  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'TENANT_DATABASE_NOT_FOUND'
      | 'INVALID_DATABASE_TRANSITION',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantDatabaseLifecycleError';

    this.code =
      code;
  }
}


/* ================================================================
   VALIDATION
   ================================================================ */

function requireTenantId(
  tenantId:
    string,
): string {
  if (
    typeof tenantId !==
      'string' ||
    !tenantId.trim()
  ) {
    throw new TenantDatabaseLifecycleError(
      'INVALID_TENANT_ID',
      'A valid tenant ID is required.',
    );
  }


  return tenantId.trim();
}


/* ================================================================
   NORMALIZE STATUS
   ================================================================ */

function normalizeStatus(
  value:
    unknown,
): TenantDatabaseLifecycleStatus {
  switch (
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : ''
  ) {
    case 'provisioning':
      return 'provisioning';

    case 'active':
      return 'active';

    case 'failed':
      return 'failed';

    case 'suspended':
      return 'suspended';

    case 'archived':
      return 'archived';

    case 'pending_deletion':
      return 'pending_deletion';

    case 'deleted':
      return 'deleted';

    default:
      throw new TenantDatabaseLifecycleError(
        'INVALID_DATABASE_TRANSITION',
        'The tenant database has an unsupported lifecycle state.',
      );
  }
}


/* ================================================================
   READ LIFECYCLE
   ================================================================ */

export async function getTenantDatabaseLifecycle(
  tenantId:
    string,
): Promise<TenantDatabaseLifecycleRecord> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          database_name,
          status,
          suspended_at,
          archived_at,
          deletion_requested_at,
          deleted_at

        FROM tenant_databases

        WHERE tenant_id = $1

        LIMIT 1
      `,
      [
        normalizedTenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new TenantDatabaseLifecycleError(
      'TENANT_DATABASE_NOT_FOUND',
      'No database is registered for this workspace.',
    );
  }


  const row =
    result.rows[0];


  return {
    id:
      String(
        row.id,
      ),

    tenantId:
      String(
        row.tenant_id,
      ),

    databaseName:
      String(
        row.database_name,
      ),

    status:
      normalizeStatus(
        row.status,
      ),

    suspendedAt:
      row.suspended_at ??
      null,

    archivedAt:
      row.archived_at ??
      null,

    deletionRequestedAt:
      row.deletion_requested_at ??
      null,

    deletedAt:
      row.deleted_at ??
      null,
  };
}


/* ================================================================
   WORKSPACE DELETION REQUEST
   ================================================================

   IMPORTANT:

   During the workspace grace period the database remains ACTIVE.

   We only mirror the deletion request timestamp.

   This means the owner can continue using the workspace and can
   cancel the closure before the grace period expires.
   ================================================================ */

export async function markTenantDatabaseDeletionRequested(
  client:
    PoolClient,

  tenantId:
    string,

  requestedAt?:
    Date | string | null,
): Promise<void> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  await client.query(
    `
      UPDATE tenant_databases

      SET
        deletion_requested_at =
          COALESCE(
            $2::timestamptz,
            deletion_requested_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE tenant_id = $1

        AND status NOT IN (
          'deleted',
          'archived'
        )
    `,
    [
      normalizedTenantId,
      requestedAt ?? null,
    ],
  );
}


/* ================================================================
   CANCEL WORKSPACE DELETION
   ================================================================ */

export async function cancelTenantDatabaseDeletionRequest(
  client:
    PoolClient,

  tenantId:
    string,
): Promise<void> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  await client.query(
    `
      UPDATE tenant_databases

      SET
        deletion_requested_at =
          NULL,

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND status <> 'deleted'
    `,
    [
      normalizedTenantId,
    ],
  );
}


/* ================================================================
   SUSPEND DATABASE
   ================================================================

   Suspension:

   - keeps all data
   - blocks normal tenant DB access
   - can later be reactivated

   There is deliberately no browser/API exposure here.
   ================================================================ */

export async function suspendTenantDatabase(
  tenantId:
    string,
): Promise<void> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  let databaseName:
    string | null =
    null;


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            SELECT
              database_name,
              status

            FROM tenant_databases

            WHERE tenant_id = $1

            LIMIT 1

            FOR UPDATE
          `,
          [
            normalizedTenantId,
          ],
        );


      if (
        result.rows.length ===
        0
      ) {
        throw new TenantDatabaseLifecycleError(
          'TENANT_DATABASE_NOT_FOUND',
          'No database is registered for this workspace.',
        );
      }


      const row =
        result.rows[0];


      const status =
        normalizeStatus(
          row.status,
        );


      databaseName =
        typeof row.database_name ===
          'string'
          ? row.database_name
          : null;


      if (
        status ===
          'suspended'
      ) {
        return;
      }


      if (
        status !==
          'active'
      ) {
        throw new TenantDatabaseLifecycleError(
          'INVALID_DATABASE_TRANSITION',
          `A database in "${status}" state cannot be suspended.`,
        );
      }


      await client.query(
        `
          UPDATE tenant_databases

          SET
            status =
              'suspended',

            suspended_at =
              NOW(),

            updated_at =
              NOW()

          WHERE tenant_id = $1
        `,
        [
          normalizedTenantId,
        ],
      );
    },
  );


  if (
    databaseName
  ) {
    try {
      await closeTenantPool(
        databaseName,
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Failed to close suspended tenant database pool:',
        error,
      );
    }
  }
}


/* ================================================================
   REACTIVATE SUSPENDED DATABASE
   ================================================================ */

export async function reactivateTenantDatabase(
  tenantId:
    string,
): Promise<void> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            SELECT
              status

            FROM tenant_databases

            WHERE tenant_id = $1

            LIMIT 1

            FOR UPDATE
          `,
          [
            normalizedTenantId,
          ],
        );


      if (
        result.rows.length ===
        0
      ) {
        throw new TenantDatabaseLifecycleError(
          'TENANT_DATABASE_NOT_FOUND',
          'No database is registered for this workspace.',
        );
      }


      const status =
        normalizeStatus(
          result.rows[0]
            .status,
        );


      if (
        status ===
          'active'
      ) {
        return;
      }


      if (
        status !==
          'suspended'
      ) {
        throw new TenantDatabaseLifecycleError(
          'INVALID_DATABASE_TRANSITION',
          `A database in "${status}" state cannot be reactivated.`,
        );
      }


      await client.query(
        `
          UPDATE tenant_databases

          SET
            status =
              'active',

            suspended_at =
              NULL,

            health_status =
              'unknown',

            failure_code =
              NULL,

            failure_message =
              NULL,

            updated_at =
              NOW()

          WHERE tenant_id = $1
        `,
        [
          normalizedTenantId,
        ],
      );
    },
  );
}


/* ================================================================
   ARCHIVE DATABASE
   ================================================================

   Archive is stronger than suspension.

   Data is retained, but normal workspace access is disabled.

   Archive does NOT physically delete the PostgreSQL database.
   ================================================================ */

export async function archiveTenantDatabase(
  tenantId:
    string,
): Promise<void> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  let databaseName:
    string | null =
    null;


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            SELECT
              database_name,
              status

            FROM tenant_databases

            WHERE tenant_id = $1

            LIMIT 1

            FOR UPDATE
          `,
          [
            normalizedTenantId,
          ],
        );


      if (
        result.rows.length ===
        0
      ) {
        throw new TenantDatabaseLifecycleError(
          'TENANT_DATABASE_NOT_FOUND',
          'No database is registered for this workspace.',
        );
      }


      const row =
        result.rows[0];


      const status =
        normalizeStatus(
          row.status,
        );


      databaseName =
        typeof row.database_name ===
          'string'
          ? row.database_name
          : null;


      if (
        status ===
          'archived'
      ) {
        return;
      }


      if (
        status !==
          'active' &&
        status !==
          'suspended'
      ) {
        throw new TenantDatabaseLifecycleError(
          'INVALID_DATABASE_TRANSITION',
          `A database in "${status}" state cannot be archived.`,
        );
      }


      await client.query(
        `
          UPDATE tenant_databases

          SET
            status =
              'archived',

            archived_at =
              NOW(),

            updated_at =
              NOW()

          WHERE tenant_id = $1
        `,
        [
          normalizedTenantId,
        ],
      );
    },
  );


  if (
    databaseName
  ) {
    try {
      await closeTenantPool(
        databaseName,
      );
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Failed to close archived tenant database pool:',
        error,
      );
    }
  }
}