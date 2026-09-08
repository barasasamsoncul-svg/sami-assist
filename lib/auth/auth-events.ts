import { isIP } from 'node:net';

import { NextRequest } from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

export type AuthEventInput = {
  request: NextRequest;

  userId?: string | null;

  tenantId?: string | null;

  eventType: string;

  entityType?: string;

  entityId?: string | null;

  metadata?: Record<
    string,
    unknown
  >;
};

export type LoginHistoryInput = {
  request: NextRequest;

  userId?: string | null;

  sessionId?: string | null;

  successful: boolean;

  failureReason?: string | null;

  metadata?: Record<
    string,
    unknown
  >;
};

/* ============================================================
   LIMITS
   ============================================================ */

const MAX_IP_LENGTH =
  255;

const MAX_USER_AGENT_LENGTH =
  1000;

const MAX_EVENT_TYPE_LENGTH =
  120;

const MAX_ENTITY_TYPE_LENGTH =
  120;

const MAX_ENTITY_ID_LENGTH =
  255;

const MAX_FAILURE_REASON_LENGTH =
  255;

const MAX_METADATA_STRING_LENGTH =
  2000;

const MAX_METADATA_DEPTH =
  6;

const MAX_METADATA_OBJECT_KEYS =
  60;

const MAX_METADATA_ARRAY_ITEMS =
  60;

/* ============================================================
   TEXT
   ============================================================ */

function cleanText(
  value: unknown,
  maxLength: number
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value
      .replace(
        /[\r\n]+/g,
        ' '
      )
      .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

/* ============================================================
   IP ADDRESS
   ============================================================ */

/**
 * Validates an individual IP candidate.
 *
 * Supports:
 *
 *   192.168.1.10
 *   2001:db8::1
 *   ::ffff:192.168.1.10
 *
 * Also tolerates:
 *
 *   192.168.1.10:12345
 *
 * which can occasionally appear in proxy headers.
 */
function normalizeIpCandidate(
  value:
    | string
    | null
    | undefined
): string | null {
  const raw =
    cleanText(
      value,
      MAX_IP_LENGTH
    );

  if (!raw) {
    return null;
  }

  let candidate =
    raw;

  /*
   * [IPv6]:port
   */
  if (
    candidate.startsWith(
      '['
    )
  ) {
    const closingBracket =
      candidate.indexOf(
        ']'
      );

    if (
      closingBracket >
      1
    ) {
      const ipv6 =
        candidate.slice(
          1,
          closingBracket
        );

      if (
        isIP(ipv6) > 0
      ) {
        return ipv6;
      }
    }
  }

  /*
   * Normal IPv4 / IPv6.
   */
  if (
    isIP(candidate) >
    0
  ) {
    return candidate;
  }

  /*
   * IPv4:port
   */
  const ipv4WithPort =
    candidate.match(
      /^(.+):(\d{1,5})$/
    );

  if (
    ipv4WithPort &&
    isIP(
      ipv4WithPort[1]
    ) === 4
  ) {
    return ipv4WithPort[1];
  }

  return null;
}

/**
 * Resolve the client IP from the proxy headers already used by
 * SaMi.
 *
 * x-forwarded-for can contain:
 *
 *   client, proxy1, proxy2
 *
 * so only the first value is used.
 *
 * IMPORTANT:
 *
 * Production must run behind the trusted hosting/reverse-proxy
 * layer that controls these headers. Application code cannot
 * independently prove that a forwarded header was created by
 * a trusted proxy.
 */
export function getClientIp(
  request: NextRequest
): string | null {
  const forwardedFor =
    request.headers.get(
      'x-forwarded-for'
    );

  if (
    forwardedFor
  ) {
    const firstCandidate =
      forwardedFor
        .split(',')[0]
        ?.trim();

    const forwardedIp =
      normalizeIpCandidate(
        firstCandidate
      );

    if (
      forwardedIp
    ) {
      return forwardedIp;
    }
  }

  const realIp =
    normalizeIpCandidate(
      request.headers.get(
        'x-real-ip'
      )
    );

  if (
    realIp
  ) {
    return realIp;
  }

  return null;
}

/* ============================================================
   USER AGENT
   ============================================================ */

export function getClientUserAgent(
  request: NextRequest
): string | null {
  return cleanText(
    request.headers.get(
      'user-agent'
    ),
    MAX_USER_AGENT_LENGTH
  );
}

/* ============================================================
   METADATA SECURITY
   ============================================================ */

/**
 * Audit metadata must never accidentally become another place
 * where authentication credentials are stored.
 */
function isSensitiveMetadataKey(
  key: string
): boolean {
  const normalized =
    key
      .replace(
        /([a-z0-9])([A-Z])/g,
        '$1_$2'
      )
      .replace(
        /[^a-zA-Z0-9]+/g,
        '_'
      )
      .toLowerCase();

  return (
    normalized ===
      'password' ||

    normalized.includes(
      'password'
    ) ||

    normalized.includes(
      'passphrase'
    ) ||

    normalized.includes(
      'secret'
    ) ||

    normalized.includes(
      'token'
    ) ||

    normalized.includes(
      'authorization'
    ) ||

    normalized.includes(
      'cookie'
    ) ||

    normalized ===
      'otp' ||

    normalized.includes(
      'totp'
    ) ||

    normalized.includes(
      'recovery_code'
    ) ||

    normalized.includes(
      'verification_code'
    ) ||

    normalized.includes(
      'two_factor_code'
    ) ||

    normalized.includes(
      'mfa_code'
    )
  );
}

/* ============================================================
   SAFE METADATA SERIALIZATION
   ============================================================ */

function sanitizeMetadataValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    'string'
  ) {
    return value.slice(
      0,
      MAX_METADATA_STRING_LENGTH
    );
  }

  if (
    typeof value ===
    'boolean'
  ) {
    return value;
  }

  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : String(value);
  }

  if (
    typeof value ===
    'bigint'
  ) {
    return value.toString();
  }

  if (
    typeof value ===
      'function' ||
    typeof value ===
      'symbol'
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return Number.isNaN(
      value.getTime()
    )
      ? null
      : value.toISOString();
  }

  if (
    value instanceof Error
  ) {
    return {
      name:
        value.name,

      message:
        value.message.slice(
          0,
          MAX_METADATA_STRING_LENGTH
        ),
    };
  }

  if (
    depth >=
    MAX_METADATA_DEPTH
  ) {
    return '[Max depth reached]';
  }

  if (
    typeof value ===
    'object'
  ) {
    if (
      seen.has(value)
    ) {
      return '[Circular]';
    }

    seen.add(value);

    try {
      if (
        Array.isArray(
          value
        )
      ) {
        return value
          .slice(
            0,
            MAX_METADATA_ARRAY_ITEMS
          )
          .map(
            (item) =>
              sanitizeMetadataValue(
                item,
                depth + 1,
                seen
              )
          );
      }

      const source =
        value as Record<
          string,
          unknown
        >;

      const sanitized:
        Record<
          string,
          unknown
        > = {};

      const entries =
        Object.entries(
          source
        ).slice(
          0,
          MAX_METADATA_OBJECT_KEYS
        );

      for (
        const [
          key,
          nestedValue,
        ] of entries
      ) {
        if (
          isSensitiveMetadataKey(
            key
          )
        ) {
          sanitized[key] =
            '[REDACTED]';

          continue;
        }

        sanitized[key] =
          sanitizeMetadataValue(
            nestedValue,
            depth + 1,
            seen
          );
      }

      return sanitized;
    } finally {
      seen.delete(value);
    }
  }

  return String(
    value
  ).slice(
    0,
    MAX_METADATA_STRING_LENGTH
  );
}

function sanitizeMetadata(
  metadata?:
    Record<
      string,
      unknown
    >
): Record<
  string,
  unknown
> {
  if (
    !metadata ||
    typeof metadata !==
      'object' ||
    Array.isArray(metadata)
  ) {
    return {};
  }

  const value =
    sanitizeMetadataValue(
      metadata,
      0,
      new WeakSet<object>()
    );

  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<
    string,
    unknown
  >;
}

function serializeMetadata(
  metadata?:
    Record<
      string,
      unknown
    >
): string {
  try {
    return JSON.stringify(
      sanitizeMetadata(
        metadata
      )
    );
  } catch {
    /*
     * Audit logging must never break authentication merely
     * because optional metadata was malformed.
     */
    return '{}';
  }
}

/* ============================================================
   AUTH EVENT
   ============================================================ */

/**
 * Authentication events are best-effort security/audit records.
 *
 * Failure to write an audit record must NOT:
 *
 * - fail login
 * - fail logout
 * - fail registration
 * - fail 2FA
 * - fail password recovery
 *
 * The server error is still logged for operational visibility.
 */
export async function recordAuthEvent(
  input: AuthEventInput
): Promise<void> {
  try {
    const eventType =
      cleanText(
        input.eventType,
        MAX_EVENT_TYPE_LENGTH
      );

    if (
      !eventType
    ) {
      console.warn(
        '[SaMi Auth] Audit event skipped because eventType was empty.'
      );

      return;
    }

    const entityType =
      cleanText(
        input.entityType,
        MAX_ENTITY_TYPE_LENGTH
      ) ||
      'auth';

    const userId =
      cleanText(
        input.userId,
        MAX_ENTITY_ID_LENGTH
      );

    const tenantId =
      cleanText(
        input.tenantId,
        MAX_ENTITY_ID_LENGTH
      );

    const entityId =
      cleanText(
        input.entityId,
        MAX_ENTITY_ID_LENGTH
      );

    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          event_type,
          entity_type,
          entity_id,
          ip_address,
          user_agent,
          metadata
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
      `,
      [
        tenantId,

        userId,

        eventType,

        entityType,

        entityId,

        getClientIp(
          input.request
        ),

        getClientUserAgent(
          input.request
        ),

        serializeMetadata(
          input.metadata
        ),
      ]
    );
  } catch (error) {
    console.error(
      '[SaMi Auth] Failed to record authentication event:',
      error
    );
  }
}

/* ============================================================
   LOGIN HISTORY
   ============================================================ */

export async function recordLoginHistory(
  input:
    LoginHistoryInput
): Promise<void> {
  try {
    const userId =
      cleanText(
        input.userId,
        MAX_ENTITY_ID_LENGTH
      );

    const sessionId =
      cleanText(
        input.sessionId,
        MAX_ENTITY_ID_LENGTH
      );

    /*
     * A successful login should never be stored with a failure
     * reason even if a caller accidentally passes one.
     */
    const failureReason =
      input.successful
        ? null
        : cleanText(
            input.failureReason,
            MAX_FAILURE_REASON_LENGTH
          );

    await queryControl(
      `
        INSERT INTO login_history (
          user_id,
          session_id,
          ip_address,
          user_agent,
          successful,
          failure_reason,
          metadata
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [
        userId,

        sessionId,

        getClientIp(
          input.request
        ),

        getClientUserAgent(
          input.request
        ),

        input.successful ===
          true,

        failureReason,

        serializeMetadata(
          input.metadata
        ),
      ]
    );
  } catch (error) {
    console.error(
      '[SaMi Auth] Failed to record login history:',
      error
    );
  }
}