import {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getAdminRequestIp,
  getAdminRequestUserAgent,
} from '@/lib/auth/admin-session';

/* ============================================================
   TYPES
   ============================================================ */

export type AdminAuditEventInput = {
  request:
    NextRequest;

  adminId?:
    string | null;

  sessionId?:
    string | null;

  eventType:
    string;

  action:
    string;

  targetType?:
    string | null;

  targetId?:
    string | null;

  targetUserId?:
    string | null;

  targetTenantId?:
    string | null;

  successful?:
    boolean;

  failureReason?:
    string | null;

  requestId?:
    string | null;

  metadata?:
    Record<
      string,
      unknown
    >;
};

export type AdminLoginHistoryInput = {
  request:
    NextRequest;

  adminId?:
    string | null;

  attemptedEmail?:
    string | null;

  sessionId?:
    string | null;

  successful:
    boolean;

  failureReason?:
    string | null;

  metadata?:
    Record<
      string,
      unknown
    >;
};

/* ============================================================
   LIMITS
   ============================================================ */

const MAX_EVENT_TYPE_LENGTH =
  150;

const MAX_ACTION_LENGTH =
  150;

const MAX_TARGET_TYPE_LENGTH =
  100;

const MAX_TARGET_ID_LENGTH =
  255;

const MAX_FAILURE_REASON_LENGTH =
  255;

const MAX_REQUEST_ID_LENGTH =
  255;

const MAX_EMAIL_LENGTH =
  254;

const MAX_METADATA_DEPTH =
  6;

const MAX_METADATA_KEYS =
  60;

const MAX_METADATA_ITEMS =
  60;

const MAX_METADATA_STRING_LENGTH =
  2000;

/* ============================================================
   TEXT
   ============================================================ */

function cleanText(
  value:
    unknown,
  maximumLength:
    number
) {
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

  if (
    !normalized
  ) {
    return null;
  }

  return normalized.slice(
    0,
    maximumLength
  );
}

function normalizeEmail(
  value:
    unknown
) {
  const email =
    cleanText(
      value,
      MAX_EMAIL_LENGTH
    );

  return email
    ? email.toLowerCase()
    : null;
}

/* ============================================================
   SENSITIVE METADATA
   ============================================================ */

function normalizeMetadataKey(
  key:
    string
) {
  return key
    .replace(
      /([a-z0-9])([A-Z])/g,
      '$1_$2'
    )
    .replace(
      /[^a-zA-Z0-9]+/g,
      '_'
    )
    .toLowerCase();
}

function isSensitiveMetadataKey(
  key:
    string
) {
  const normalized =
    normalizeMetadataKey(
      key
    );

  return (
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
    ) ||
    normalized.includes(
      'card_number'
    ) ||
    normalized.includes(
      'cvv'
    )
  );
}

/* ============================================================
   METADATA SANITIZATION
   ============================================================ */

function sanitizeMetadataValue(
  value:
    unknown,
  depth:
    number,
  seen:
    WeakSet<object>
): unknown {
  if (
    value ===
      null ||
    value ===
      undefined
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
      : String(
          value
        );
  }

  if (
    typeof value ===
      'bigint'
  ) {
    return value.toString();
  }

  if (
    value instanceof
      Date
  ) {
    return value.toISOString();
  }

  if (
    depth >=
    MAX_METADATA_DEPTH
  ) {
    return '[Maximum depth reached]';
  }

  if (
    Array.isArray(
      value
    )
  ) {
    if (
      seen.has(
        value
      )
    ) {
      return '[Circular value]';
    }

    seen.add(
      value
    );

    const sanitized =
      value
        .slice(
          0,
          MAX_METADATA_ITEMS
        )
        .map(
          (
            item
          ) =>
            sanitizeMetadataValue(
              item,
              depth + 1,
              seen
            )
        );

    seen.delete(
      value
    );

    return sanitized;
  }

  if (
    typeof value ===
    'object'
  ) {
    const object =
      value as
        Record<
          string,
          unknown
        >;

    if (
      seen.has(
        object
      )
    ) {
      return '[Circular value]';
    }

    seen.add(
      object
    );

    const sanitized:
      Record<
        string,
        unknown
      > = {};

    const entries =
      Object.entries(
        object
      ).slice(
        0,
        MAX_METADATA_KEYS
      );

    for (
      const [
        key,
        entryValue,
      ] of entries
    ) {
      const safeKey =
        cleanText(
          key,
          150
        );

      if (
        !safeKey
      ) {
        continue;
      }

      if (
        isSensitiveMetadataKey(
          safeKey
        )
      ) {
        sanitized[
          safeKey
        ] =
          '[REDACTED]';

        continue;
      }

      sanitized[
        safeKey
      ] =
        sanitizeMetadataValue(
          entryValue,
          depth + 1,
          seen
        );
    }

    seen.delete(
      object
    );

    return sanitized;
  }

  return String(
    value
  ).slice(
    0,
    MAX_METADATA_STRING_LENGTH
  );
}

function sanitizeMetadata(
  metadata:
    Record<
      string,
      unknown
    > | undefined
) {
  if (
    !metadata
  ) {
    return {};
  }

  const value =
    sanitizeMetadataValue(
      metadata,
      0,
      new WeakSet()
    );

  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }

  return value as
    Record<
      string,
      unknown
    >;
}

/* ============================================================
   DEVICE INFORMATION
   ============================================================ */

function detectDeviceType(
  userAgent:
    string | null
) {
  if (
    !userAgent
  ) {
    return null;
  }

  if (
    /ipad|tablet|kindle|silk/i.test(
      userAgent
    )
  ) {
    return 'Tablet';
  }

  if (
    /mobile|iphone|ipod|android/i.test(
      userAgent
    )
  ) {
    return 'Mobile';
  }

  return 'Desktop';
}

function detectBrowser(
  userAgent:
    string | null
) {
  if (
    !userAgent
  ) {
    return null;
  }

  if (
    /edg\//i.test(
      userAgent
    )
  ) {
    return 'Microsoft Edge';
  }

  if (
    /opr\/|opera/i.test(
      userAgent
    )
  ) {
    return 'Opera';
  }

  if (
    /firefox\//i.test(
      userAgent
    )
  ) {
    return 'Firefox';
  }

  if (
    /chrome\//i.test(
      userAgent
    )
  ) {
    return 'Chrome';
  }

  if (
    /safari\//i.test(
      userAgent
    )
  ) {
    return 'Safari';
  }

  return 'Unknown browser';
}

function detectOperatingSystem(
  userAgent:
    string | null
) {
  if (
    !userAgent
  ) {
    return null;
  }

  if (
    /windows nt/i.test(
      userAgent
    )
  ) {
    return 'Windows';
  }

  if (
    /iphone|ipad|ipod/i.test(
      userAgent
    )
  ) {
    return 'iOS';
  }

  if (
    /android/i.test(
      userAgent
    )
  ) {
    return 'Android';
  }

  if (
    /mac os x|macintosh/i.test(
      userAgent
    )
  ) {
    return 'macOS';
  }

  if (
    /linux/i.test(
      userAgent
    )
  ) {
    return 'Linux';
  }

  return 'Unknown operating system';
}

/* ============================================================
   RECORD ADMIN AUDIT EVENT
   ============================================================ */

export async function recordAdminAuditEvent({
  request,
  adminId =
    null,
  sessionId =
    null,
  eventType,
  action,
  targetType =
    null,
  targetId =
    null,
  targetUserId =
    null,
  targetTenantId =
    null,
  successful =
    true,
  failureReason =
    null,
  requestId =
    null,
  metadata,
}: AdminAuditEventInput) {
  const normalizedEventType =
    cleanText(
      eventType,
      MAX_EVENT_TYPE_LENGTH
    );

  const normalizedAction =
    cleanText(
      action,
      MAX_ACTION_LENGTH
    );

  if (
    !normalizedEventType ||
    !normalizedAction
  ) {
    return false;
  }

  const normalizedFailureReason =
    successful
      ? null
      : cleanText(
          failureReason,
          MAX_FAILURE_REASON_LENGTH
        );

  try {
    await queryControl(
      `
        INSERT INTO platform_admin_audit_logs (
          admin_id,
          session_id,
          event_type,
          action,
          target_type,
          target_id,
          target_user_id,
          target_tenant_id,
          successful,
          failure_reason,
          ip_address,
          user_agent,
          request_id,
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
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::jsonb
        )
      `,
      [
        adminId,
        sessionId,
        normalizedEventType,
        normalizedAction,
        cleanText(
          targetType,
          MAX_TARGET_TYPE_LENGTH
        ),
        cleanText(
          targetId,
          MAX_TARGET_ID_LENGTH
        ),
        targetUserId,
        targetTenantId,
        successful,
        normalizedFailureReason,
        getAdminRequestIp(
          request
        ),
        getAdminRequestUserAgent(
          request
        ),
        cleanText(
          requestId,
          MAX_REQUEST_ID_LENGTH
        ),
        JSON.stringify(
          sanitizeMetadata(
            metadata
          )
        ),
      ]
    );

    return true;
  } catch (
    error
  ) {
    console.error(
      'Failed to record platform admin audit event:',
      error
    );

    return false;
  }
}

/* ============================================================
   RECORD ADMIN LOGIN HISTORY
   ============================================================ */

export async function recordAdminLoginHistory({
  request,
  adminId =
    null,
  attemptedEmail =
    null,
  sessionId =
    null,
  successful,
  failureReason =
    null,
  metadata,
}: AdminLoginHistoryInput) {
  const userAgent =
    getAdminRequestUserAgent(
      request
    );

  try {
    await queryControl(
      `
        INSERT INTO platform_admin_login_history (
          admin_id,
          attempted_email,
          session_id,
          successful,
          failure_reason,
          ip_address,
          user_agent,
          device_type,
          browser,
          operating_system,
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
          $8,
          $9,
          $10,
          $11::jsonb
        )
      `,
      [
        adminId,
        normalizeEmail(
          attemptedEmail
        ),
        sessionId,
        successful,
        successful
          ? null
          : cleanText(
              failureReason,
              MAX_FAILURE_REASON_LENGTH
            ),
        getAdminRequestIp(
          request
        ),
        userAgent,
        detectDeviceType(
          userAgent
        ),
        detectBrowser(
          userAgent
        ),
        detectOperatingSystem(
          userAgent
        ),
        JSON.stringify(
          sanitizeMetadata(
            metadata
          )
        ),
      ]
    );

    return true;
  } catch (
    error
  ) {
    console.error(
      'Failed to record platform admin login history:',
      error
    );

    return false;
  }
}

/* ============================================================
   ADMIN EVENT HELPERS
   ============================================================ */

export async function recordAdminLoginSuccess({
  request,
  adminId,
  sessionId,
  attemptedEmail,
  metadata,
}: {
  request:
    NextRequest;

  adminId:
    string;

  sessionId:
    string;

  attemptedEmail:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {
  await Promise.all([
    recordAdminLoginHistory({
      request,
      adminId,
      attemptedEmail,
      sessionId,
      successful:
        true,
      metadata,
    }),

    recordAdminAuditEvent({
      request,
      adminId,
      sessionId,
      eventType:
        'admin.login.success',
      action:
        'admin_login',
      targetType:
        'platform_admin',
      targetId:
        adminId,
      successful:
        true,
      metadata,
    }),
  ]);
}

export async function recordAdminLoginFailure({
  request,
  adminId =
    null,
  attemptedEmail,
  failureReason,
  metadata,
}: {
  request:
    NextRequest;

  adminId?:
    string | null;

  attemptedEmail:
    string;

  failureReason:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {
  await Promise.all([
    recordAdminLoginHistory({
      request,
      adminId,
      attemptedEmail,
      successful:
        false,
      failureReason,
      metadata,
    }),

    recordAdminAuditEvent({
      request,
      adminId,
      eventType:
        'admin.login.failed',
      action:
        'admin_login',
      targetType:
        'platform_admin',
      targetId:
        adminId,
      successful:
        false,
      failureReason,
      metadata: {
        attemptedEmail:
          normalizeEmail(
            attemptedEmail
          ),

        ...metadata,
      },
    }),
  ]);
}

export async function recordAdminLogout({
  request,
  adminId,
  sessionId,
}: {
  request:
    NextRequest;

  adminId:
    string;

  sessionId:
    string;
}) {
  return recordAdminAuditEvent({
    request,
    adminId,
    sessionId,
    eventType:
      'admin.logout',
    action:
      'admin_logout',
    targetType:
      'platform_admin',
    targetId:
      adminId,
    successful:
      true,
  });
}

export async function recordAdminAccessDenied({
  request,
  adminId,
  sessionId,
  permission,
  resource,
}: {
  request:
    NextRequest;

  adminId:
    string;

  sessionId:
    string;

  permission:
    string;

  resource:
    string;
}) {
  return recordAdminAuditEvent({
    request,
    adminId,
    sessionId,
    eventType:
      'admin.access.denied',
    action:
      'access_protected_resource',
    targetType:
      'admin_resource',
    targetId:
      resource,
    successful:
      false,
    failureReason:
      'permission_denied',
    metadata: {
      permission,
      resource,
    },
  });
}