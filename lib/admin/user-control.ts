import 'server-only';

import {
  withControlTransaction,
} from '@/lib/db/control';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export type PlatformUserControlAction =
  | 'lock'
  | 'unlock'
  | 'suspend'
  | 'reactivate'
  | 'revoke_sessions';


export class PlatformUserControlError
  extends Error {
  readonly code:
    | 'INVALID_USER'
    | 'USER_NOT_FOUND'
    | 'INVALID_ACTION'
    | 'REASON_REQUIRED'
    | 'INVALID_STATE'
    | 'INVALID_LOCK_DURATION';

  constructor(
    code:
      PlatformUserControlError['code'],
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'PlatformUserControlError';

    this.code =
      code;
  }
}


function requireUserId(
  userId:
    string,
) {
  if (
    !UUID_RE.test(
      userId,
    )
  ) {
    throw new PlatformUserControlError(
      'INVALID_USER',
      'The SaMi user could not be identified.',
    );
  }

  return userId;
}


function normalizeReason(
  value:
    unknown,
  required:
    boolean,
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    if (
      required
    ) {
      throw new PlatformUserControlError(
        'REASON_REQUIRED',
        'An administrative reason is required.',
      );
    }

    return null;
  }

  if (
    typeof value !==
      'string'
  ) {
    throw new PlatformUserControlError(
      'REASON_REQUIRED',
      'Administrative reason must be text.',
    );
  }

  const reason =
    value
      .trim()
      .slice(
        0,
        1_000,
      );

  if (
    required &&
    !reason
  ) {
    throw new PlatformUserControlError(
      'REASON_REQUIRED',
      'An administrative reason is required.',
    );
  }

  return reason ||
    null;
}


function normalizeLockMinutes(
  value:
    unknown,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <
      5 ||
    parsed >
      7 *
      24 *
      60
  ) {
    throw new PlatformUserControlError(
      'INVALID_LOCK_DURATION',
      'Account lock duration must be between 5 minutes and 7 days.',
    );
  }

  return Math.floor(
    parsed,
  );
}


async function loadUserForUpdate(
  client:
    Parameters<
      Parameters<
        typeof withControlTransaction
      >[0]
    >[0],
  userId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          id,
          email,
          full_name,
          first_name,
          last_name,
          status,
          locked_until,
          failed_login_attempts,
          email_verified,
          email_verified_at,
          deleted_at
        FROM users
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [
        userId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    row.deleted_at
  ) {
    throw new PlatformUserControlError(
      'USER_NOT_FOUND',
      'The SaMi user could not be found.',
    );
  }

  return row;
}


async function revokeUserSessions(
  client:
    Parameters<
      Parameters<
        typeof withControlTransaction
      >[0]
    >[0],
  userId:
    string,
) {
  const result =
    await client.query(
      `
        UPDATE sessions
        SET
          is_current =
            FALSE,
          revoked_at =
            COALESCE(
              revoked_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE user_id = $1
          AND revoked_at
              IS NULL
        RETURNING id
      `,
      [
        userId,
      ],
    );

  return result.rows.length;
}


export async function controlPlatformUser(
  input: {
    userId:
      string;
    action:
      PlatformUserControlAction;
    reason?:
      unknown;
    lockMinutes?:
      unknown;
  },
) {
  const userId =
    requireUserId(
      input.userId,
    );

  return withControlTransaction(
    async client => {
      const user =
        await loadUserForUpdate(
          client,
          userId,
        );

      const currentStatus =
        String(
          user.status ||
          'unknown',
        )
          .trim()
          .toLowerCase();

      let sessionsRevoked =
        0;

      switch (
        input.action
      ) {
        case 'lock': {
          const reason =
            normalizeReason(
              input.reason,
              true,
            );

          const minutes =
            normalizeLockMinutes(
              input.lockMinutes ??
              60,
            );

          const result =
            await client.query(
              `
                UPDATE users
                SET
                  locked_until =
                    NOW() +
                    (
                      $2::integer *
                      INTERVAL '1 minute'
                    ),
                  failed_login_attempts =
                    GREATEST(
                      COALESCE(
                        failed_login_attempts,
                        0
                      ),
                      1
                    ),
                  updated_at =
                    NOW()
                WHERE id = $1
                  AND deleted_at
                      IS NULL
                RETURNING
                  status,
                  locked_until
              `,
              [
                userId,
                minutes,
              ],
            );

          sessionsRevoked =
            await revokeUserSessions(
              client,
              userId,
            );

          return {
            userId,
            action:
              input.action,
            changed:
              true,
            status:
              String(
                result.rows[0]
                  ?.status ||
                currentStatus,
              ),
            lockedUntil:
              result.rows[0]
                ?.locked_until ||
              null,
            sessionsRevoked,
            reason,
          };
        }

        case 'unlock': {
          const result =
            await client.query(
              `
                UPDATE users
                SET
                  locked_until =
                    NULL,
                  failed_login_attempts =
                    0,
                  status =
                    CASE
                      WHEN LOWER(
                        COALESCE(
                          status,
                          ''
                        )
                      ) =
                      'locked'
                      THEN 'active'
                      ELSE status
                    END,
                  updated_at =
                    NOW()
                WHERE id = $1
                  AND deleted_at
                      IS NULL
                RETURNING
                  status,
                  locked_until
              `,
              [
                userId,
              ],
            );

          return {
            userId,
            action:
              input.action,
            changed:
              true,
            status:
              String(
                result.rows[0]
                  ?.status ||
                currentStatus,
              ),
            lockedUntil:
              null,
            sessionsRevoked:
              0,
            reason:
              normalizeReason(
                input.reason,
                false,
              ),
          };
        }

        case 'suspend': {
          const reason =
            normalizeReason(
              input.reason,
              true,
            );

          if (
            currentStatus ===
              'suspended'
          ) {
            return {
              userId,
              action:
                input.action,
              changed:
                false,
              status:
                currentStatus,
              lockedUntil:
                user.locked_until ||
                null,
              sessionsRevoked:
                0,
              reason,
            };
          }

          if (
            currentStatus !==
              'active' &&
            currentStatus !==
              'pending_verification' &&
            currentStatus !==
              'locked'
          ) {
            throw new PlatformUserControlError(
              'INVALID_STATE',
              `A user in "${currentStatus}" state cannot be suspended through Platform Administration.`,
            );
          }

          const result =
            await client.query(
              `
                UPDATE users
                SET
                  status =
                    'suspended',
                  updated_at =
                    NOW()
                WHERE id = $1
                  AND deleted_at
                      IS NULL
                RETURNING
                  status,
                  locked_until
              `,
              [
                userId,
              ],
            );

          sessionsRevoked =
            await revokeUserSessions(
              client,
              userId,
            );

          return {
            userId,
            action:
              input.action,
            changed:
              true,
            status:
              String(
                result.rows[0]
                  ?.status ||
                'suspended',
              ),
            lockedUntil:
              result.rows[0]
                ?.locked_until ||
              null,
            sessionsRevoked,
            reason,
          };
        }

        case 'reactivate': {
          const reason =
            normalizeReason(
              input.reason,
              true,
            );

          if (
            currentStatus ===
              'active'
          ) {
            return {
              userId,
              action:
                input.action,
              changed:
                false,
              status:
                currentStatus,
              lockedUntil:
                user.locked_until ||
                null,
              sessionsRevoked:
                0,
              reason,
            };
          }

          if (
            currentStatus !==
              'suspended'
          ) {
            throw new PlatformUserControlError(
              'INVALID_STATE',
              `Only a suspended user can be reactivated here; current state is "${currentStatus}".`,
            );
          }

          const verified =
            user.email_verified ===
              true ||
            Boolean(
              user.email_verified_at,
            );

          const result =
            await client.query(
              `
                UPDATE users
                SET
                  status =
                    $2,
                  locked_until =
                    NULL,
                  failed_login_attempts =
                    0,
                  updated_at =
                    NOW()
                WHERE id = $1
                  AND deleted_at
                      IS NULL
                RETURNING
                  status,
                  locked_until
              `,
              [
                userId,
                verified
                  ? 'active'
                  : 'pending_verification',
              ],
            );

          return {
            userId,
            action:
              input.action,
            changed:
              true,
            status:
              String(
                result.rows[0]
                  ?.status ||
                (
                  verified
                    ? 'active'
                    : 'pending_verification'
                ),
              ),
            lockedUntil:
              null,
            sessionsRevoked:
              0,
            reason,
          };
        }

        case 'revoke_sessions': {
          const reason =
            normalizeReason(
              input.reason,
              true,
            );

          sessionsRevoked =
            await revokeUserSessions(
              client,
              userId,
            );

          return {
            userId,
            action:
              input.action,
            changed:
              sessionsRevoked >
              0,
            status:
              currentStatus,
            lockedUntil:
              user.locked_until ||
              null,
            sessionsRevoked,
            reason,
          };
        }

        default:
          throw new PlatformUserControlError(
            'INVALID_ACTION',
            'Unsupported platform user action.',
          );
      }
    },
  );
}
