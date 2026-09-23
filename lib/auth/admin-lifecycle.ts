import 'server-only';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import type {
  PlatformAdminRole,
  PlatformAdminStatus,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_ROLES:
  readonly PlatformAdminRole[] = [
    'super_admin',
    'security_admin',
    'support_admin',
    'billing_admin',
    'operations_admin',
    'developer_admin',
    'read_only_admin',
  ];

const MUTABLE_ADMIN_STATUSES:
  readonly PlatformAdminStatus[] = [
    'active',
    'suspended',
    'disabled',
  ];

/*
 * Used only to serialize operations that could remove an active
 * Super Administrator.
 *
 * Every last-super-admin-sensitive mutation passes through the
 * same PostgreSQL advisory lock.
 */
const SUPER_ADMIN_LIFECYCLE_LOCK_KEY =
  726431;

/* ============================================================
   TYPES
   ============================================================ */

export type AdminLifecycleAdministrator = {
  id:
    string;

  firstName:
    string;

  lastName:
    string;

  fullName:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  status:
    PlatformAdminStatus;

  emailVerified:
    boolean;

  twoFactorRequired:
    boolean;

  twoFactorEnabled:
    boolean;

  failedLoginAttempts:
    number;

  lockedUntil:
    string | Date | null;

  updatedAt:
    string | Date;
};

export type ChangeAdminRoleInput = {
  request:
    NextRequest;

  actorAdminId:
    string;

  targetAdminId:
    string;

  role:
    unknown;
};

export type ChangeAdminStatusInput = {
  request:
    NextRequest;

  actorAdminId:
    string;

  targetAdminId:
    string;

  status:
    unknown;
};

export type UnlockAdminInput = {
  request:
    NextRequest;

  actorAdminId:
    string;

  targetAdminId:
    string;
};

export type AdminLifecycleResult =
  | {
      success:
        true;

      code:
        | 'ADMIN_ROLE_CHANGED'
        | 'ADMIN_STATUS_CHANGED'
        | 'ADMIN_UNLOCKED';

      message:
        string;

      admin:
        AdminLifecycleAdministrator;

      sessionsRevoked:
        number;

      challengesInvalidated:
        number;
    }
  | {
      success:
        false;

      code:
        | 'FORBIDDEN'
        | 'INVALID_TARGET_ADMIN'
        | 'INVALID_ROLE'
        | 'INVALID_STATUS'
        | 'SELF_MODIFICATION_NOT_ALLOWED'
        | 'LAST_SUPER_ADMIN_PROTECTED'
        | 'ADMIN_STATE_CONFLICT'
        | 'ADMIN_NOT_LOCKED'
        | 'LIFECYCLE_UPDATE_FAILED';

      message:
        string;
    };

type LifecycleRow = {
  id:
    string;

  first_name:
    string;

  last_name:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  status:
    PlatformAdminStatus;

  email_verified:
    boolean;

  two_factor_required:
    boolean;

  two_factor_enabled:
    boolean;

  failed_login_attempts:
    number;

  locked_until:
    Date | string | null;

  updated_at:
    Date | string;

  sessions_revoked:
    number | string | null;

  challenges_invalidated:
    number | string | null;
};

/* ============================================================
   VALIDATION
   ============================================================ */

function normalizeId(
  value:
    unknown
): string {
  return typeof value ===
    'string'
    ? value.trim()
    : '';
}

function normalizeRole(
  value:
    unknown
): PlatformAdminRole | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const role =
    value
      .trim()
      .toLowerCase() as
        PlatformAdminRole;

  return ADMIN_ROLES.includes(
    role
  )
    ? role
    : null;
}

function normalizeMutableStatus(
  value:
    unknown
): PlatformAdminStatus | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const status =
    value
      .trim()
      .toLowerCase() as
        PlatformAdminStatus;

  return MUTABLE_ADMIN_STATUSES.includes(
    status
  )
    ? status
    : null;
}

/* ============================================================
   SERIALIZATION
   ============================================================ */

function serializeAdministrator(
  row:
    LifecycleRow
): AdminLifecycleAdministrator {
  const firstName =
    row.first_name ||
    '';

  const lastName =
    row.last_name ||
    '';

  return {
    id:
      row.id,

    firstName,

    lastName,

    fullName:
      `${firstName} ${lastName}`
        .trim(),

    email:
      row.email,

    role:
      row.role,

    status:
      row.status,

    emailVerified:
      Boolean(
        row.email_verified
      ),

    twoFactorRequired:
      Boolean(
        row.two_factor_required
      ),

    twoFactorEnabled:
      Boolean(
        row.two_factor_enabled
      ),

    failedLoginAttempts:
      Number(
        row.failed_login_attempts ||
          0
      ),

    lockedUntil:
      row.locked_until,

    updatedAt:
      row.updated_at,
  };
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAudit(
  input:
    Parameters<
      typeof recordAdminAuditEvent
    >[0]
): Promise<void> {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (
    error
  ) {
    /*
     * The primary security mutation must not be rolled back
     * because audit persistence temporarily failed.
     */
    console.error(
      '[Admin Lifecycle] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   ACTOR VALIDATION

   Do not trust the route session alone for lifecycle mutations.

   The actor must still exist in platform_admins as:
   - active
   - verified
   - super_admin
   - not deleted

   This protects against a stale session after a concurrent
   privilege/state change.
   ============================================================ */

async function actorCanManageAdministrators(
  actorAdminId:
    string
): Promise<boolean> {
  if (
    !actorAdminId
  ) {
    return false;
  }

  const result =
    await queryControl(
      `
        SELECT
          role,
          status,
          email_verified

        FROM
          platform_admins

        WHERE
          id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        actorAdminId,
      ]
    );

  const row =
    result.rows[0];

  if (
    !row ||
    String(
      row.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active' ||
    row.email_verified !==
      true
  ) {
    return false;
  }

  return hasAdminCapability(
    String(
      row.role ||
      '',
    ) as
      PlatformAdminRole,
    'administrators.manage',
  );
}

/* ============================================================
   CHANGE ROLE
   ============================================================ */

export async function changePlatformAdminRole(
  input:
    ChangeAdminRoleInput
): Promise<
  AdminLifecycleResult
> {
  const actorAdminId =
    normalizeId(
      input.actorAdminId
    );

  const targetAdminId =
    normalizeId(
      input.targetAdminId
    );

  const nextRole =
    normalizeRole(
      input.role
    );

  if (
    !actorAdminId ||
    !targetAdminId
  ) {
    return {
      success:
        false,

      code:
        'INVALID_TARGET_ADMIN',

      message:
        'The Platform Administrator could not be identified.',
    };
  }

  if (
    actorAdminId ===
    targetAdminId
  ) {
    /*
     * Deliberately blocked.
     *
     * Self-demotion can invalidate the authority of the same
     * request/session performing the mutation and makes recovery
     * substantially harder.
     *
     * A future explicit ownership-transfer workflow may relax
     * this with stronger confirmation/step-up authentication.
     */
    return {
      success:
        false,

      code:
        'SELF_MODIFICATION_NOT_ALLOWED',

      message:
        'You cannot change your own Platform Administrator role.',
    };
  }

  if (
    !nextRole
  ) {
    return {
      success:
        false,

      code:
        'INVALID_ROLE',

      message:
        'Select a valid Platform Administrator role.',
    };
  }

  if (
    !(await actorCanManageAdministrators(
      actorAdminId
    ))
  ) {
    return {
      success:
        false,

      code:
        'FORBIDDEN',

      message:
        'You do not have permission to change Platform Administrator roles.',
    };
  }

  let result;

  try {
    /*
     * Everything happens in ONE PostgreSQL statement.
     *
     * lock_gate serializes role/status operations that could
     * otherwise concurrently remove multiple Super Admins.
     *
     * Example prevented:
     *
     * Super A demotes Super B at the same time
     * Super B demotes Super A.
     *
     * Without serialization, both requests could independently
     * observe two Super Admins and both succeed.
     */
    result =
      await queryControl(
        `
          WITH lock_gate AS (
            SELECT
              pg_advisory_xact_lock(
                $3
              ) AS locked
          ),

          target AS (
            SELECT
              a.id,
              a.role,
              a.status

            FROM
              platform_admins a

            CROSS JOIN
              lock_gate

            WHERE
              a.id = $1
              AND a.deleted_at IS NULL

            LIMIT 1
          ),

          active_super_admin_count AS (
            SELECT
              COUNT(*)::int AS total

            FROM
              platform_admins a

            CROSS JOIN
              lock_gate

            WHERE
              a.role = 'super_admin'
              AND a.status = 'active'
              AND a.deleted_at IS NULL
          ),

          eligible_target AS (
            SELECT
              t.id

            FROM
              target t

            CROSS JOIN
              active_super_admin_count c

            WHERE
              t.role <> $2

              AND NOT (
                t.role = 'super_admin'
                AND t.status = 'active'
                AND $2 <> 'super_admin'
                AND c.total <= 1
              )
          ),

          updated_admin AS (
            UPDATE
              platform_admins a

            SET
              role = $2,
              updated_by = $4,
              updated_at = NOW()

            FROM
              eligible_target e

            WHERE
              a.id = e.id

            RETURNING
              a.id,
              a.first_name,
              a.last_name,
              a.email,
              a.role,
              a.status,
              a.email_verified,
              a.two_factor_required,
              a.two_factor_enabled,
              a.failed_login_attempts,
              a.locked_until,
              a.updated_at
          ),

          revoked_sessions AS (
            UPDATE
              platform_admin_sessions s

            SET
              revoked_at =
                COALESCE(
                  s.revoked_at,
                  NOW()
                ),

              revocation_reason =
                COALESCE(
                  s.revocation_reason,
                  'admin_role_changed'
                )

            WHERE
              s.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND s.revoked_at IS NULL

            RETURNING
              s.id
          ),

          invalidated_challenges AS (
            UPDATE
              platform_admin_login_challenges c

            SET
              used_at =
                COALESCE(
                  c.used_at,
                  NOW()
                )

            WHERE
              c.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND c.used_at IS NULL

            RETURNING
              c.id
          )

          SELECT
            u.*,

            (
              SELECT
                COUNT(*)::int
              FROM
                revoked_sessions
            ) AS sessions_revoked,

            (
              SELECT
                COUNT(*)::int
              FROM
                invalidated_challenges
            ) AS challenges_invalidated

          FROM
            updated_admin u
        `,
        [
          targetAdminId,
          nextRole,
          SUPER_ADMIN_LIFECYCLE_LOCK_KEY,
          actorAdminId,
        ]
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin Lifecycle] Role change failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown role change error'
    );

    return {
      success:
        false,

      code:
        'LIFECYCLE_UPDATE_FAILED',

      message:
        'SaMi could not update this Platform Administrator.',
    };
  }

  if (
    result.rows.length ===
    0
  ) {
    /*
     * Determine the safe business reason without exposing
     * sensitive implementation details to the caller.
     */
    const targetResult =
      await queryControl(
        `
          SELECT
            role,
            status

          FROM
            platform_admins

          WHERE
            id = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          targetAdminId,
        ]
      );

    if (
      targetResult.rows.length ===
      0
    ) {
      return {
        success:
          false,

        code:
          'INVALID_TARGET_ADMIN',

        message:
          'The Platform Administrator does not exist.',
      };
    }

    const target =
      targetResult.rows[0];

    if (
      target.role ===
        nextRole
    ) {
      return {
        success:
          false,

        code:
          'ADMIN_STATE_CONFLICT',

        message:
          'This Platform Administrator already has that role.',
      };
    }

    if (
      target.role ===
        'super_admin' &&
      target.status ===
        'active' &&
      nextRole !==
        'super_admin'
    ) {
      return {
        success:
          false,

        code:
          'LAST_SUPER_ADMIN_PROTECTED',

        message:
          'SaMi must always have at least one active Super Administrator.',
      };
    }

    return {
      success:
        false,

      code:
        'ADMIN_STATE_CONFLICT',

      message:
        'The Platform Administrator changed while this request was being processed.',
    };
  }

  const row =
    result.rows[0] as
      LifecycleRow;

  await safeRecordAudit({
    request:
      input.request,

    adminId:
      actorAdminId,

    eventType:
      'admin.identity.role_changed',

    action:
      'change_platform_admin_role',

    targetType:
      'platform_admin',

    targetId:
      targetAdminId,

    successful:
      true,

    metadata: {
      newRole:
        nextRole,

      sessionsRevoked:
        Number(
          row.sessions_revoked ||
            0
        ),

      challengesInvalidated:
        Number(
          row.challenges_invalidated ||
            0
        ),
    },
  });

  return {
    success:
      true,

    code:
      'ADMIN_ROLE_CHANGED',

    message:
      'Platform Administrator role updated successfully.',

    admin:
      serializeAdministrator(
        row
      ),

    sessionsRevoked:
      Number(
        row.sessions_revoked ||
          0
      ),

    challengesInvalidated:
      Number(
        row.challenges_invalidated ||
          0
      ),
  };
}

/* ============================================================
   CHANGE STATUS

   Supported deliberate lifecycle states:
   - active
   - suspended
   - disabled

   "invited" is entered only by provisioning.
   "locked" is entered only by authentication/security controls.

   Unlocking is therefore handled separately.
   ============================================================ */

export async function changePlatformAdminStatus(
  input:
    ChangeAdminStatusInput
): Promise<
  AdminLifecycleResult
> {
  const actorAdminId =
    normalizeId(
      input.actorAdminId
    );

  const targetAdminId =
    normalizeId(
      input.targetAdminId
    );

  const nextStatus =
    normalizeMutableStatus(
      input.status
    );

  if (
    !actorAdminId ||
    !targetAdminId
  ) {
    return {
      success:
        false,

      code:
        'INVALID_TARGET_ADMIN',

      message:
        'The Platform Administrator could not be identified.',
    };
  }

  if (
    actorAdminId ===
    targetAdminId
  ) {
    return {
      success:
        false,

      code:
        'SELF_MODIFICATION_NOT_ALLOWED',

      message:
        'You cannot change your own Platform Administrator status.',
    };
  }

  if (
    !nextStatus
  ) {
    return {
      success:
        false,

      code:
        'INVALID_STATUS',

      message:
        'Select a valid Platform Administrator status.',
    };
  }

  if (
    !(await actorCanManageAdministrators(
      actorAdminId
    ))
  ) {
    return {
      success:
        false,

      code:
        'FORBIDDEN',

      message:
        'You do not have permission to change Platform Administrator status.',
    };
  }

  let result;

  try {
    result =
      await queryControl(
        `
          WITH lock_gate AS (
            SELECT
              pg_advisory_xact_lock(
                $3
              ) AS locked
          ),

          target AS (
            SELECT
              a.id,
              a.role,
              a.status

            FROM
              platform_admins a

            CROSS JOIN
              lock_gate

            WHERE
              a.id = $1
              AND a.deleted_at IS NULL

            LIMIT 1
          ),

          active_super_admin_count AS (
            SELECT
              COUNT(*)::int AS total

            FROM
              platform_admins a

            CROSS JOIN
              lock_gate

            WHERE
              a.role = 'super_admin'
              AND a.status = 'active'
              AND a.deleted_at IS NULL
          ),

          eligible_target AS (
            SELECT
              t.id

            FROM
              target t

            CROSS JOIN
              active_super_admin_count c

            WHERE
              t.status <> $2

              AND NOT (
                t.role = 'super_admin'
                AND t.status = 'active'
                AND $2 <> 'active'
                AND c.total <= 1
              )

              /*
               * An invited administrator must complete the
               * identity setup flow instead of being manually
               * activated through this lifecycle endpoint.
               */
              AND NOT (
                t.status = 'invited'
              )
          ),

          updated_admin AS (
            UPDATE
              platform_admins a

            SET
              status = $2,

              failed_login_attempts =
                CASE
                  WHEN $2 = 'active'
                  THEN 0
                  ELSE a.failed_login_attempts
                END,

              locked_until =
                CASE
                  WHEN $2 = 'active'
                  THEN NULL
                  ELSE a.locked_until
                END,

              updated_by = $4,
              updated_at = NOW()

            FROM
              eligible_target e

            WHERE
              a.id = e.id

            RETURNING
              a.id,
              a.first_name,
              a.last_name,
              a.email,
              a.role,
              a.status,
              a.email_verified,
              a.two_factor_required,
              a.two_factor_enabled,
              a.failed_login_attempts,
              a.locked_until,
              a.updated_at
          ),

          revoked_sessions AS (
            UPDATE
              platform_admin_sessions s

            SET
              revoked_at =
                COALESCE(
                  s.revoked_at,
                  NOW()
                ),

              revocation_reason =
                COALESCE(
                  s.revocation_reason,
                  CASE
                    WHEN $2 = 'suspended'
                    THEN 'admin_suspended'

                    WHEN $2 = 'disabled'
                    THEN 'admin_disabled'

                    ELSE 'admin_status_changed'
                  END
                )

            WHERE
              s.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND s.revoked_at IS NULL

            RETURNING
              s.id
          ),

          invalidated_challenges AS (
            UPDATE
              platform_admin_login_challenges c

            SET
              used_at =
                COALESCE(
                  c.used_at,
                  NOW()
                )

            WHERE
              c.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND c.used_at IS NULL

            RETURNING
              c.id
          )

          SELECT
            u.*,

            (
              SELECT
                COUNT(*)::int
              FROM
                revoked_sessions
            ) AS sessions_revoked,

            (
              SELECT
                COUNT(*)::int
              FROM
                invalidated_challenges
            ) AS challenges_invalidated

          FROM
            updated_admin u
        `,
        [
          targetAdminId,
          nextStatus,
          SUPER_ADMIN_LIFECYCLE_LOCK_KEY,
          actorAdminId,
        ]
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin Lifecycle] Status change failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown status change error'
    );

    return {
      success:
        false,

      code:
        'LIFECYCLE_UPDATE_FAILED',

      message:
        'SaMi could not update this Platform Administrator.',
    };
  }

  if (
    result.rows.length ===
    0
  ) {
    const targetResult =
      await queryControl(
        `
          SELECT
            role,
            status

          FROM
            platform_admins

          WHERE
            id = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          targetAdminId,
        ]
      );

    if (
      targetResult.rows.length ===
      0
    ) {
      return {
        success:
          false,

        code:
          'INVALID_TARGET_ADMIN',

        message:
          'The Platform Administrator does not exist.',
      };
    }

    const target =
      targetResult.rows[0];

    if (
      target.status ===
        nextStatus
    ) {
      return {
        success:
          false,

        code:
          'ADMIN_STATE_CONFLICT',

        message:
          'This Platform Administrator already has that status.',
      };
    }

    if (
      target.status ===
        'invited'
    ) {
      return {
        success:
          false,

        code:
          'ADMIN_STATE_CONFLICT',

        message:
          'Invited administrators must complete identity setup before their account can become active.',
      };
    }

    if (
      target.role ===
        'super_admin' &&
      target.status ===
        'active' &&
      nextStatus !==
        'active'
    ) {
      return {
        success:
          false,

        code:
          'LAST_SUPER_ADMIN_PROTECTED',

        message:
          'SaMi must always have at least one active Super Administrator.',
      };
    }

    return {
      success:
        false,

      code:
        'ADMIN_STATE_CONFLICT',

      message:
        'The Platform Administrator changed while this request was being processed.',
    };
  }

  const row =
    result.rows[0] as
      LifecycleRow;

  await safeRecordAudit({
    request:
      input.request,

    adminId:
      actorAdminId,

    eventType:
      'admin.identity.status_changed',

    action:
      'change_platform_admin_status',

    targetType:
      'platform_admin',

    targetId:
      targetAdminId,

    successful:
      true,

    metadata: {
      newStatus:
        nextStatus,

      sessionsRevoked:
        Number(
          row.sessions_revoked ||
            0
        ),

      challengesInvalidated:
        Number(
          row.challenges_invalidated ||
            0
        ),
    },
  });

  return {
    success:
      true,

    code:
      'ADMIN_STATUS_CHANGED',

    message:
      'Platform Administrator status updated successfully.',

    admin:
      serializeAdministrator(
        row
      ),

    sessionsRevoked:
      Number(
        row.sessions_revoked ||
          0
      ),

    challengesInvalidated:
      Number(
        row.challenges_invalidated ||
          0
      ),
  };
}

/* ============================================================
   UNLOCK ADMINISTRATOR

   Only handles status='locked'.

   This deliberately does NOT reactivate:
   - suspended
   - disabled
   - invited

   Those states have separate meanings.
   ============================================================ */

export async function unlockPlatformAdmin(
  input:
    UnlockAdminInput
): Promise<
  AdminLifecycleResult
> {
  const actorAdminId =
    normalizeId(
      input.actorAdminId
    );

  const targetAdminId =
    normalizeId(
      input.targetAdminId
    );

  if (
    !actorAdminId ||
    !targetAdminId
  ) {
    return {
      success:
        false,

      code:
        'INVALID_TARGET_ADMIN',

      message:
        'The Platform Administrator could not be identified.',
    };
  }

  if (
    actorAdminId ===
    targetAdminId
  ) {
    return {
      success:
        false,

      code:
        'SELF_MODIFICATION_NOT_ALLOWED',

      message:
        'You cannot unlock your own Platform Administrator account through administrator management.',
    };
  }

  if (
    !(await actorCanManageAdministrators(
      actorAdminId
    ))
  ) {
    return {
      success:
        false,

      code:
        'FORBIDDEN',

      message:
        'You do not have permission to unlock Platform Administrators.',
    };
  }

  let result;

  try {
    result =
      await queryControl(
        `
          WITH updated_admin AS (
            UPDATE
              platform_admins

            SET
              status = 'active',
              failed_login_attempts = 0,
              locked_until = NULL,
              updated_by = $2,
              updated_at = NOW()

            WHERE
              id = $1
              AND status = 'locked'
              AND deleted_at IS NULL

            RETURNING
              id,
              first_name,
              last_name,
              email,
              role,
              status,
              email_verified,
              two_factor_required,
              two_factor_enabled,
              failed_login_attempts,
              locked_until,
              updated_at
          ),

          revoked_sessions AS (
            UPDATE
              platform_admin_sessions s

            SET
              revoked_at =
                COALESCE(
                  s.revoked_at,
                  NOW()
                ),

              revocation_reason =
                COALESCE(
                  s.revocation_reason,
                  'admin_unlocked'
                )

            WHERE
              s.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND s.revoked_at IS NULL

            RETURNING
              s.id
          ),

          invalidated_challenges AS (
            UPDATE
              platform_admin_login_challenges c

            SET
              used_at =
                COALESCE(
                  c.used_at,
                  NOW()
                )

            WHERE
              c.admin_id IN (
                SELECT id
                FROM updated_admin
              )

              AND c.used_at IS NULL

            RETURNING
              c.id
          )

          SELECT
            u.*,

            (
              SELECT
                COUNT(*)::int
              FROM
                revoked_sessions
            ) AS sessions_revoked,

            (
              SELECT
                COUNT(*)::int
              FROM
                invalidated_challenges
            ) AS challenges_invalidated

          FROM
            updated_admin u
        `,
        [
          targetAdminId,
          actorAdminId,
        ]
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin Lifecycle] Unlock failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown unlock error'
    );

    return {
      success:
        false,

      code:
        'LIFECYCLE_UPDATE_FAILED',

      message:
        'SaMi could not unlock this Platform Administrator.',
    };
  }

  if (
    result.rows.length ===
    0
  ) {
    const targetResult =
      await queryControl(
        `
          SELECT
            status

          FROM
            platform_admins

          WHERE
            id = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          targetAdminId,
        ]
      );

    if (
      targetResult.rows.length ===
      0
    ) {
      return {
        success:
          false,

        code:
          'INVALID_TARGET_ADMIN',

        message:
          'The Platform Administrator does not exist.',
      };
    }

    return {
      success:
        false,

      code:
        'ADMIN_NOT_LOCKED',

      message:
        'This Platform Administrator is not locked.',
    };
  }

  const row =
    result.rows[0] as
      LifecycleRow;

  await safeRecordAudit({
    request:
      input.request,

    adminId:
      actorAdminId,

    eventType:
      'admin.identity.unlocked',

    action:
      'unlock_platform_admin',

    targetType:
      'platform_admin',

    targetId:
      targetAdminId,

    successful:
      true,

    metadata: {
      sessionsRevoked:
        Number(
          row.sessions_revoked ||
            0
        ),

      challengesInvalidated:
        Number(
          row.challenges_invalidated ||
            0
        ),
    },
  });

  return {
    success:
      true,

    code:
      'ADMIN_UNLOCKED',

    message:
      'Platform Administrator unlocked successfully.',

    admin:
      serializeAdministrator(
        row
      ),

    sessionsRevoked:
      Number(
        row.sessions_revoked ||
          0
      ),

    challengesInvalidated:
      Number(
        row.challenges_invalidated ||
          0
      ),
  };
}