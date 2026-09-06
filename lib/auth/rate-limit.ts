import { queryControl } from '@/lib/db/control';

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

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function secondsUntil(value: Date | null): number | null {
  if (!value) {
    return null;
  }

  const ms = value.getTime() - Date.now();

  return Math.max(1, Math.ceil(ms / 1000));
}

export async function checkRateLimit(
  input: RateLimitInput
): Promise<RateLimitResult> {
  const identifier = normalizeIdentifier(input.identifier);
  const action = input.action.trim().toLowerCase();

  const now = new Date();
  const windowStartLimit = new Date(now.getTime() - input.windowMs);

  const existingResult = await queryControl(
    `
      SELECT
        id,
        attempts,
        window_start,
        blocked_until
      FROM auth_rate_limits
      WHERE identifier = $1
        AND action = $2
      LIMIT 1
    `,
    [identifier, action]
  );

  const existing = existingResult.rows[0];

  if (existing?.blocked_until) {
    const blockedUntil = new Date(existing.blocked_until);

    if (blockedUntil.getTime() > now.getTime()) {
      return {
        allowed: false,
        blocked: true,
        attempts: Number(existing.attempts || 0),
        remaining: 0,
        blockedUntil,
        retryAfterSeconds: secondsUntil(blockedUntil),
      };
    }
  }

  if (
    !existing ||
    new Date(existing.window_start).getTime() <
      windowStartLimit.getTime()
  ) {
    await queryControl(
      `
        INSERT INTO auth_rate_limits (
          identifier,
          action,
          attempts,
          window_start,
          blocked_until,
          updated_at
        )
        VALUES ($1, $2, 1, NOW(), NULL, NOW())
        ON CONFLICT (identifier, action)
        DO UPDATE SET
          attempts = 1,
          window_start = NOW(),
          blocked_until = NULL,
          updated_at = NOW()
      `,
      [identifier, action]
    );

    return {
      allowed: true,
      blocked: false,
      attempts: 1,
      remaining: Math.max(input.maxAttempts - 1, 0),
      blockedUntil: null,
      retryAfterSeconds: null,
    };
  }

  const nextAttempts = Number(existing.attempts || 0) + 1;

  if (nextAttempts > input.maxAttempts) {
    const blockedUntil = new Date(now.getTime() + input.blockMs);

    await queryControl(
      `
        UPDATE auth_rate_limits
        SET
          attempts = $3,
          blocked_until = $4,
          updated_at = NOW()
        WHERE identifier = $1
          AND action = $2
      `,
      [identifier, action, nextAttempts, blockedUntil]
    );

    return {
      allowed: false,
      blocked: true,
      attempts: nextAttempts,
      remaining: 0,
      blockedUntil,
      retryAfterSeconds: secondsUntil(blockedUntil),
    };
  }

  await queryControl(
    `
      UPDATE auth_rate_limits
      SET
        attempts = $3,
        blocked_until = NULL,
        updated_at = NOW()
      WHERE identifier = $1
        AND action = $2
    `,
    [identifier, action, nextAttempts]
  );

  return {
    allowed: true,
    blocked: false,
    attempts: nextAttempts,
    remaining: Math.max(input.maxAttempts - nextAttempts, 0),
    blockedUntil: null,
    retryAfterSeconds: null,
  };
}

export async function resetRateLimit(
  identifier: string,
  action: string
): Promise<void> {
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
      normalizeIdentifier(identifier),
      action.trim().toLowerCase(),
    ]
  );
}