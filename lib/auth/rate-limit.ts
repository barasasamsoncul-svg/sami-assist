import { queryControl } from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

type RateLimitInput = {
  identifier: string;
  action: string;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  blocked: boolean;
  attempts: number;
  remaining: number;
  blockedUntil: Date | null;
  retryAfterSeconds: number | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeIdentifier(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizeAction(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

/* ============================================================
   VALIDATION
   ============================================================ */

function requirePositiveInteger(
  value: number,
  name: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer.`
    );
  }

  return value;
}

function validateRateLimitInput(
  input: RateLimitInput
): {
  identifier: string;
  action: string;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
} {
  const identifier =
    normalizeIdentifier(
      input.identifier
    );

  const action =
    normalizeAction(
      input.action
    );

  if (!identifier) {
    throw new Error(
      'Rate-limit identifier is required.'
    );
  }

  if (!action) {
    throw new Error(
      'Rate-limit action is required.'
    );
  }

  return {
    identifier,

    action,

    maxAttempts:
      requirePositiveInteger(
        input.maxAttempts,
        'maxAttempts'
      ),

    windowMs:
      requirePositiveInteger(
        input.windowMs,
        'windowMs'
      ),

    blockMs:
      requirePositiveInteger(
        input.blockMs,
        'blockMs'
      ),
  };
}

/* ============================================================
   DATE
   ============================================================ */

function normalizeDatabaseDate(
  value: unknown
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          String(value)
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function secondsUntil(
  value: Date | null
): number | null {
  if (!value) {
    return null;
  }

  const milliseconds =
    value.getTime() -
    Date.now();

  return Math.max(
    1,
    Math.ceil(
      milliseconds /
      1000
    )
  );
}

/* ============================================================
   CHECK RATE LIMIT

   Fixed-window rate limiter with temporary blocking.

   IMPORTANT:

   The entire counter mutation happens inside ONE PostgreSQL
   UPSERT.

   This avoids the race condition caused by:

     SELECT attempts
       ↓
     calculate in JavaScript
       ↓
     UPDATE attempts

   Two concurrent login requests can therefore no longer
   overwrite each other's counter increments.
   ============================================================ */

export async function checkRateLimit(
  input: RateLimitInput
): Promise<RateLimitResult> {
  const {
    identifier,
    action,
    maxAttempts,
    windowMs,
    blockMs,
  } =
    validateRateLimitInput(
      input
    );

  const now =
    new Date();

  const windowStartLimit =
    new Date(
      now.getTime() -
      windowMs
    );

  const newBlockedUntil =
    new Date(
      now.getTime() +
      blockMs
    );

  if (
    Number.isNaN(
      windowStartLimit.getTime()
    ) ||
    Number.isNaN(
      newBlockedUntil.getTime()
    )
  ) {
    throw new Error(
      'Invalid rate-limit time configuration.'
    );
  }

  /*
   * Semantics:
   *
   * maxAttempts = 8
   *
   * attempts 1..8:
   *   allowed
   *
   * attempt 9:
   *   blocked
   *
   * Requests made while actively blocked do NOT continue
   * increasing the counter or extend blocked_until.
   *
   * Once the fixed window expires, the next request begins a
   * fresh window with attempts = 1.
   */

  const result =
    await queryControl(
      `
        INSERT INTO auth_rate_limits AS rate_limit (
          identifier,
          action,
          attempts,
          window_start,
          blocked_until,
          updated_at
        )

        VALUES (
          $1,
          $2,
          1,
          $3,
          NULL,
          $3
        )

        ON CONFLICT (
          identifier,
          action
        )

        DO UPDATE SET

          attempts =
            CASE

              /*
               * Already blocked.
               *
               * Do not increase attempts while the block is
               * still active.
               */
              WHEN
                rate_limit.blocked_until IS NOT NULL
                AND rate_limit.blocked_until > $3
              THEN
                COALESCE(
                  rate_limit.attempts,
                  0
                )

              /*
               * Previous rate-limit window expired.
               *
               * This request becomes attempt #1 of a fresh
               * window.
               */
              WHEN
                rate_limit.window_start IS NULL
                OR rate_limit.window_start < $4
              THEN
                1

              /*
               * Active window.
               */
              ELSE
                COALESCE(
                  rate_limit.attempts,
                  0
                ) + 1

            END,

          window_start =
            CASE

              /*
               * Preserve the original window while actively
               * blocked.
               */
              WHEN
                rate_limit.blocked_until IS NOT NULL
                AND rate_limit.blocked_until > $3
              THEN
                rate_limit.window_start

              /*
               * Start a fresh fixed window.
               */
              WHEN
                rate_limit.window_start IS NULL
                OR rate_limit.window_start < $4
              THEN
                $3

              ELSE
                rate_limit.window_start

            END,

          blocked_until =
            CASE

              /*
               * Existing block remains authoritative.
               *
               * Repeated blocked requests must not extend it.
               */
              WHEN
                rate_limit.blocked_until IS NOT NULL
                AND rate_limit.blocked_until > $3
              THEN
                rate_limit.blocked_until

              /*
               * New window starts unlocked.
               */
              WHEN
                rate_limit.window_start IS NULL
                OR rate_limit.window_start < $4
              THEN
                NULL

              /*
               * Block only AFTER maxAttempts allowed attempts
               * have been consumed.
               */
              WHEN
                COALESCE(
                  rate_limit.attempts,
                  0
                ) + 1 > $5
              THEN
                $6

              ELSE
                NULL

            END,

          updated_at =
            CASE

              /*
               * Do not make blocked traffic look like successful
               * rate-limit activity.
               */
              WHEN
                rate_limit.blocked_until IS NOT NULL
                AND rate_limit.blocked_until > $3
              THEN
                rate_limit.updated_at

              ELSE
                $3

            END

        RETURNING
          attempts,
          window_start,
          blocked_until
      `,
      [
        identifier,
        action,
        now,
        windowStartLimit,
        maxAttempts,
        newBlockedUntil,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      'Rate-limit state could not be updated.'
    );
  }

  const row =
    result.rows[0];

  const attempts =
    Number(
      row.attempts ??
      0
    );

  if (
    !Number.isFinite(
      attempts
    ) ||
    attempts < 0
  ) {
    throw new Error(
      'Invalid rate-limit attempt count returned from database.'
    );
  }

  const blockedUntil =
    normalizeDatabaseDate(
      row.blocked_until
    );

  const blocked =
    Boolean(
      blockedUntil &&
      blockedUntil.getTime() >
        Date.now()
    );

  return {
    allowed:
      !blocked,

    blocked,

    attempts,

    remaining:
      blocked
        ? 0
        : Math.max(
            maxAttempts -
              attempts,
            0
          ),

    blockedUntil:
      blocked
        ? blockedUntil
        : null,

    retryAfterSeconds:
      blocked
        ? secondsUntil(
            blockedUntil
          )
        : null,
  };
}

/* ============================================================
   RESET RATE LIMIT
   ============================================================ */

/**
 * Used after a successful authentication flow.
 *
 * We preserve the existing row rather than deleting it.
 */
export async function resetRateLimit(
  identifier: string,
  action: string
): Promise<void> {
  const normalizedIdentifier =
    normalizeIdentifier(
      identifier
    );

  const normalizedAction =
    normalizeAction(
      action
    );

  if (!normalizedIdentifier) {
    throw new Error(
      'Rate-limit identifier is required.'
    );
  }

  if (!normalizedAction) {
    throw new Error(
      'Rate-limit action is required.'
    );
  }

  await queryControl(
    `
      UPDATE auth_rate_limits

      SET
        attempts = 0,
        blocked_until = NULL,
        window_start = NOW(),
        updated_at = NOW()

      WHERE identifier = $1
        AND action = $2
    `,
    [
      normalizedIdentifier,
      normalizedAction,
    ]
  );
}