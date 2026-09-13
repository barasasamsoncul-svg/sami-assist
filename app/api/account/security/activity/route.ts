import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_LIMIT =
  20;

const MAX_LIMIT =
  50;

const MAX_CURSOR_LENGTH =
  1000;

const SECURITY_EVENT_PATTERNS = [
  'LOGIN%',
  'LOGOUT%',
  'PASSWORD%',
  'TWO_FACTOR%',
  'AUTHENTICATOR%',
  'EMAIL_TWO_FACTOR%',
  'RECOVERY%',
  'ACCOUNT_LOCKED%',
  'SESSION%',
  'SECURITY%',
  'EMAIL_CHANGE%',
  'EMAIL_CHANGED%',
] as const;

/* ============================================================
   TYPES
   ============================================================ */

type ActivitySource =
  | 'audit'
  | 'login';

type ActivityCategory =
  | 'login'
  | 'password'
  | 'two_factor'
  | 'session'
  | 'email'
  | 'account'
  | 'security';

type ActivityStatus =
  | 'success'
  | 'failed'
  | 'blocked'
  | 'info';

type ActivityFilter =
  | 'all'
  | 'sign_ins'
  | 'security_changes';

type StatusFilter =
  | 'all'
  | 'success'
  | 'failed'
  | 'blocked';

type ActivityCursor = {
  createdAt:
    string;

  source:
    ActivitySource;

  id:
    string;
};

type ActivityRow = {
  id:
    string;

  source:
    ActivitySource;

  event_type:
    string;

  entity_type:
    string | null;

  entity_id:
    string | null;

  ip_address:
    string | null;

  user_agent:
    string | null;

  metadata:
    unknown;

  successful:
    boolean | null;

  failure_reason:
    string | null;

  created_at:
    Date | string;
};

type SecurityActivityItem = {
  id:
    string;

  source:
    ActivitySource;

  eventType:
    string;

  title:
    string;

  description:
    string;

  category:
    ActivityCategory;

  status:
    ActivityStatus;

  ipAddress:
    string | null;

  userAgent:
    string | null;

  device: {
    type:
      string;

    browser:
      string;

    operatingSystem:
      string;
  };

  metadata:
    Record<
      string,
      unknown
    >;

  createdAt:
    string;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
  headers:
    Record<
      string,
      string
    > = {}
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',

        ...headers,
      },
    }
  );
}

function errorResponse(
  status:
    number,
  code:
    string,
  error:
    string
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,
    },
    status
  );
}

/* ============================================================
   NUMBER
   ============================================================ */

function parsePositiveInteger(
  value:
    string | null,
  fallback:
    number,
  maximum:
    number
) {
  if (
    !value
  ) {
    return fallback;
  }

  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(
      parsed
    ),
    maximum
  );
}

/* ============================================================
   FILTERS
   ============================================================ */

function normalizeActivityFilter(
  value:
    string | null
): ActivityFilter {
  if (
    value ===
      'sign_ins' ||
    value ===
      'security_changes'
  ) {
    return value;
  }

  return 'all';
}

function normalizeStatusFilter(
  value:
    string | null
): StatusFilter {
  if (
    value ===
      'success' ||
    value ===
      'failed' ||
    value ===
      'blocked'
  ) {
    return value;
  }

  return 'all';
}

/* ============================================================
   CURSOR
   ============================================================ */

function encodeCursor(
  value:
    ActivityCursor
) {
  return Buffer
    .from(
      JSON.stringify(
        value
      ),
      'utf8'
    )
    .toString(
      'base64url'
    );
}

function decodeCursor(
  value:
    string | null
): ActivityCursor | null {
  if (
    !value ||
    value.length >
      MAX_CURSOR_LENGTH
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        Buffer
          .from(
            value,
            'base64url'
          )
          .toString(
            'utf8'
          )
      ) as Partial<
        ActivityCursor
      >;

    if (
      typeof parsed.createdAt !==
        'string' ||
      typeof parsed.id !==
        'string' ||
      (
        parsed.source !==
          'audit' &&
        parsed.source !==
          'login'
      )
    ) {
      return null;
    }

    const createdAt =
      new Date(
        parsed.createdAt
      );

    if (
      Number.isNaN(
        createdAt.getTime()
      )
    ) {
      return null;
    }

    return {
      createdAt:
        createdAt.toISOString(),

      source:
        parsed.source,

      id:
        parsed.id,
    };
  } catch {
    return null;
  }
}

/* ============================================================
   DATE
   ============================================================ */

function toIsoDate(
  value:
    Date | string
) {
  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return new Date()
      .toISOString();
  }

  return date
    .toISOString();
}

/* ============================================================
   METADATA
   ============================================================ */

function parseMetadata(
  value:
    unknown
): Record<
  string,
  unknown
> {
  if (
    !value
  ) {
    return {};
  }

  if (
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
  ) {
    return sanitizeMetadata(
      value as Record<
        string,
        unknown
      >
    );
  }

  if (
    typeof value ===
    'string'
  ) {
    try {
      const parsed:
        unknown =
        JSON.parse(
          value
        );

      if (
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(
          parsed
        )
      ) {
        return sanitizeMetadata(
          parsed as Record<
            string,
            unknown
          >
        );
      }
    } catch {
      return {};
    }
  }

  return {};
}

function isSensitiveKey(
  key:
    string
) {
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
    normalized.includes(
      'password'
    ) ||
    normalized.includes(
      'secret'
    ) ||
    normalized.includes(
      'token'
    ) ||
    normalized.includes(
      'cookie'
    ) ||
    normalized.includes(
      'authorization'
    ) ||
    normalized ===
      'otp' ||
    normalized.includes(
      'totp'
    ) ||
    normalized.includes(
      'verification_code'
    ) ||
    normalized.includes(
      'recovery_code'
    ) ||
    normalized.includes(
      'two_factor_code'
    )
  );
}

function sanitizeMetadataValue(
  value:
    unknown,
  depth =
    0
): unknown {
  if (
    depth >
    5
  ) {
    return undefined;
  }

  if (
    value ===
      null ||
    typeof value ===
      'boolean' ||
    typeof value ===
      'number'
  ) {
    return value;
  }

  if (
    typeof value ===
    'string'
  ) {
    return value.slice(
      0,
      1000
    );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .slice(
        0,
        40
      )
      .map(
        (
          item
        ) =>
          sanitizeMetadataValue(
            item,
            depth +
              1
          )
      )
      .filter(
        (
          item
        ) =>
          item !==
          undefined
      );
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    const result:
      Record<
        string,
        unknown
      > = {};

    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(
        value
      ).slice(
        0,
        50
      )
    ) {
      if (
        isSensitiveKey(
          key
        )
      ) {
        continue;
      }

      const sanitized =
        sanitizeMetadataValue(
          nestedValue,
          depth +
            1
        );

      if (
        sanitized !==
        undefined
      ) {
        result[key] =
          sanitized;
      }
    }

    return result;
  }

  return undefined;
}

function sanitizeMetadata(
  metadata:
    Record<
      string,
      unknown
    >
) {
  const sanitized =
    sanitizeMetadataValue(
      metadata
    );

  if (
    !sanitized ||
    typeof sanitized !==
      'object' ||
    Array.isArray(
      sanitized
    )
  ) {
    return {};
  }

  return sanitized as
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
  const value =
    (
      userAgent ||
      ''
    )
      .toLowerCase();

  if (
    /ipad|tablet|kindle|silk/.test(
      value
    )
  ) {
    return 'tablet';
  }

  if (
    /mobile|android|iphone|ipod/.test(
      value
    )
  ) {
    return 'mobile';
  }

  if (
    value
  ) {
    return 'desktop';
  }

  return 'unknown';
}

function detectBrowser(
  userAgent:
    string | null
) {
  const value =
    userAgent ||
    '';

  if (
    /Edg\//i.test(
      value
    )
  ) {
    return 'Microsoft Edge';
  }

  if (
    /OPR\//i.test(
      value
    )
  ) {
    return 'Opera';
  }

  if (
    /SamsungBrowser\//i.test(
      value
    )
  ) {
    return 'Samsung Internet';
  }

  if (
    /CriOS\//i.test(
      value
    )
  ) {
    return 'Chrome';
  }

  if (
    /Chrome\//i.test(
      value
    )
  ) {
    return 'Chrome';
  }

  if (
    /FxiOS\//i.test(
      value
    ) ||
    /Firefox\//i.test(
      value
    )
  ) {
    return 'Firefox';
  }

  if (
    /Safari\//i.test(
      value
    ) &&
    !/Chrome|Chromium|CriOS|Edg|OPR/i.test(
      value
    )
  ) {
    return 'Safari';
  }

  return value
    ? 'Other'
    : 'Unknown';
}

function detectOperatingSystem(
  userAgent:
    string | null
) {
  const value =
    userAgent ||
    '';

  if (
    /Windows NT 10\.0/i.test(
      value
    )
  ) {
    return 'Windows';
  }

  if (
    /Windows/i.test(
      value
    )
  ) {
    return 'Windows';
  }

  if (
    /Android/i.test(
      value
    )
  ) {
    return 'Android';
  }

  if (
    /iPhone|iPad|iPod/i.test(
      value
    )
  ) {
    return 'iOS';
  }

  if (
    /Mac OS X|Macintosh/i.test(
      value
    )
  ) {
    return 'macOS';
  }

  if (
    /Linux/i.test(
      value
    )
  ) {
    return 'Linux';
  }

  return value
    ? 'Other'
    : 'Unknown';
}

/* ============================================================
   CATEGORY
   ============================================================ */

function getActivityCategory(
  eventType:
    string,
  source:
    ActivitySource
): ActivityCategory {
  const event =
    eventType
      .toUpperCase();

  if (
    source ===
      'login' ||
    event.includes(
      'LOGIN'
    ) ||
    event.includes(
      'LOGOUT'
    )
  ) {
    return 'login';
  }

  if (
    event.includes(
      'PASSWORD'
    )
  ) {
    return 'password';
  }

  if (
    event.includes(
      'TWO_FACTOR'
    ) ||
    event.includes(
      'AUTHENTICATOR'
    ) ||
    event.includes(
      'RECOVERY'
    )
  ) {
    return 'two_factor';
  }

  if (
    event.includes(
      'SESSION'
    )
  ) {
    return 'session';
  }

  if (
    event.includes(
      'EMAIL'
    )
  ) {
    return 'email';
  }

  if (
    event.includes(
      'ACCOUNT'
    )
  ) {
    return 'account';
  }

  return 'security';
}

/* ============================================================
   STATUS
   ============================================================ */

function getActivityStatus(
  row:
    ActivityRow
): ActivityStatus {
  if (
    row.source ===
    'login'
  ) {
    return row.successful ===
      true
      ? 'success'
      : 'failed';
  }

  const event =
    row.event_type
      .toUpperCase();

  if (
    event.includes(
      'BLOCKED'
    ) ||
    event.includes(
      'LOCKED'
    ) ||
    event.includes(
      'RATE_LIMITED'
    )
  ) {
    return 'blocked';
  }

  if (
    event.includes(
      'FAILED'
    ) ||
    event.includes(
      'ERROR'
    ) ||
    event.includes(
      'INVALID'
    ) ||
    event.includes(
      'DELIVERY_FAILED'
    )
  ) {
    return 'failed';
  }

  if (
    event.includes(
      'SUCCESS'
    ) ||
    event.includes(
      'VERIFIED'
    ) ||
    event.includes(
      'ENABLED'
    ) ||
    event.includes(
      'DISABLED'
    ) ||
    event.includes(
      'CHANGED'
    ) ||
    event.includes(
      'CREATED'
    ) ||
    event.includes(
      'REVOKED'
    ) ||
    event.includes(
      'SENT'
    )
  ) {
    return 'success';
  }

  return 'info';
}

/* ============================================================
   TITLE
   ============================================================ */

function humanizeEventType(
  value:
    string
) {
  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      );

  if (
    !normalized
  ) {
    return 'Security activity';
  }

  return (
    normalized
      .charAt(0)
      .toUpperCase() +
    normalized.slice(
      1
    )
  );
}

function getActivityTitle(
  row:
    ActivityRow
) {
  if (
    row.source ===
    'login'
  ) {
    return row.successful ===
      true
      ? 'Successful sign-in'
      : 'Unsuccessful sign-in';
  }

  const event =
    row.event_type
      .toUpperCase();

  const knownTitles:
    Record<
      string,
      string
    > = {
      LOGIN_SUCCESS:
        'Successful sign-in',

      LOGIN_FAILED:
        'Unsuccessful sign-in',

      LOGIN_BLOCKED:
        'Sign-in blocked',

      LOGIN_BLOCKED_ACCOUNT_LOCKED:
        'Sign-in blocked',

      TWO_FACTOR_LOGIN_SUCCESS:
        'Two-factor sign-in completed',

      TWO_FACTOR_FAILED:
        'Two-factor verification failed',

      TWO_FACTOR_REQUIRED:
        'Two-factor verification requested',

      TWO_FACTOR_ENABLED:
        'Authenticator enabled',

      TWO_FACTOR_DISABLED:
        'Authenticator disabled',

      EMAIL_TWO_FACTOR_ENABLED:
        'Email verification enabled',

      EMAIL_TWO_FACTOR_DISABLED:
        'Email verification disabled',

      EMAIL_TWO_FACTOR_PREFERRED:
        'Preferred verification method changed',

      EMAIL_TWO_FACTOR_LOGIN_CODE_SENT:
        'Email login code sent',

      EMAIL_TWO_FACTOR_CODE_SENT:
        'Email verification code sent',

      PASSWORD_CHANGED:
        'Password changed',

      PASSWORD_RESET:
        'Password reset',

      PASSWORD_RESET_COMPLETED:
        'Password reset completed',

      RECOVERY_CODES_REGENERATED:
        'Recovery codes regenerated',

      SESSION_REVOKED:
        'Session revoked',

      ALL_SESSIONS_REVOKED:
        'All sessions revoked',

      ACCOUNT_LOCKED:
        'Account temporarily locked',

      EMAIL_CHANGED:
        'Account email changed',
    };

  return (
    knownTitles[event] ||
    humanizeEventType(
      row.event_type
    )
  );
}

/* ============================================================
   DESCRIPTION
   ============================================================ */

function getActivityDescription(
  row:
    ActivityRow,
  metadata:
    Record<
      string,
      unknown
    >
) {
  if (
    row.source ===
    'login'
  ) {
    if (
      row.successful ===
      true
    ) {
      return 'Your SaMi account was signed in successfully.';
    }

    if (
      row.failure_reason
    ) {
      return `A sign-in attempt was unsuccessful: ${humanizeEventType(
        row.failure_reason
      ).toLowerCase()}.`;
    }

    return 'A sign-in attempt to your SaMi account was unsuccessful.';
  }

  const event =
    row.event_type
      .toUpperCase();

  if (
    event.includes(
      'PASSWORD'
    )
  ) {
    return 'A password security action was recorded for your account.';
  }

  if (
    event.includes(
      'EMAIL_TWO_FACTOR'
    )
  ) {
    return 'An Email two-factor authentication action was recorded.';
  }

  if (
    event.includes(
      'TWO_FACTOR'
    ) ||
    event.includes(
      'AUTHENTICATOR'
    )
  ) {
    return 'An authenticator security action was recorded.';
  }

  if (
    event.includes(
      'RECOVERY'
    )
  ) {
    return 'A recovery-code security action was recorded.';
  }

  if (
    event.includes(
      'SESSION'
    ) ||
    event.includes(
      'LOGOUT'
    )
  ) {
    return 'A SaMi session security action was recorded.';
  }

  if (
    typeof metadata.reason ===
      'string' &&
    metadata.reason
  ) {
    return `Reason: ${humanizeEventType(
      metadata.reason
    )}.`;
  }

  return 'A security-sensitive account action was recorded.';
}

/* ============================================================
   MAP ROW
   ============================================================ */

function mapActivityRow(
  row:
    ActivityRow
): SecurityActivityItem {
  const metadata =
    parseMetadata(
      row.metadata
    );

  const userAgent =
    row.user_agent ||
    null;

  return {
    id:
      `${row.source}:${row.id}`,

    source:
      row.source,

    eventType:
      row.event_type,

    title:
      getActivityTitle(
        row
      ),

    description:
      getActivityDescription(
        row,
        metadata
      ),

    category:
      getActivityCategory(
        row.event_type,
        row.source
      ),

    status:
      getActivityStatus(
        row
      ),

    ipAddress:
      row.ip_address ||
      null,

    userAgent,

    device: {
      type:
        detectDeviceType(
          userAgent
        ),

      browser:
        detectBrowser(
          userAgent
        ),

      operatingSystem:
        detectOperatingSystem(
          userAgent
        ),
    },

    metadata,

    createdAt:
      toIsoDate(
        row.created_at
      ),
  };
}

/* ============================================================
   STATUS FILTER
   ============================================================ */

function matchesStatusFilter(
  item:
    SecurityActivityItem,
  filter:
    StatusFilter
) {
  if (
    filter ===
    'all'
  ) {
    return true;
  }

  if (
    filter ===
    'success'
  ) {
    return (
      item.status ===
      'success'
    );
  }

  if (
    filter ===
    'blocked'
  ) {
    return (
      item.status ===
      'blocked'
    );
  }

  return (
    item.status ===
      'failed' ||
    item.status ===
      'blocked'
  );
}

/* ============================================================
   GET
   /api/account/security/activity
   ============================================================ */

export async function GET(
  request:
    NextRequest
) {
  try {
    /* ========================================================
       1. SESSION
       ======================================================== */

    const session =
      await getSession();

    if (
      !session
    ) {
      return errorResponse(
        401,
        'UNAUTHENTICATED',
        'Your SaMi session has expired. Sign in again to continue.'
      );
    }

    const userId =
      session.user.id;

    /* ========================================================
       2. QUERY PARAMETERS
       ======================================================== */

    const searchParams =
      request.nextUrl
        .searchParams;

    const limit =
      parsePositiveInteger(
        searchParams.get(
          'limit'
        ),
        DEFAULT_LIMIT,
        MAX_LIMIT
      );

    const activityFilter =
      normalizeActivityFilter(
        searchParams.get(
          'filter'
        )
      );

    const statusFilter =
      normalizeStatusFilter(
        searchParams.get(
          'status'
        )
      );

    const rawCursor =
      searchParams.get(
        'cursor'
      );

    const cursor =
      decodeCursor(
        rawCursor
      );

    if (
      rawCursor &&
      !cursor
    ) {
      return errorResponse(
        400,
        'INVALID_ACTIVITY_CURSOR',
        'The security activity cursor is invalid.'
      );
    }

    /* ========================================================
       3. EVENT SELECTION

       We retrieve extra rows because status filtering is
       performed after each row is safely normalized.
       ======================================================== */

    const queryLimit =
      Math.min(
        MAX_LIMIT *
          4,
        Math.max(
          limit *
            3,
          limit +
            1
        )
      );

    const patterns =
      [...SECURITY_EVENT_PATTERNS];

    /*
     * Cursor order:
     *
     * created_at DESC
     * source_order DESC
     * id DESC
     *
     * audit rows use source_order 2
     * login rows use source_order 1
     */
    const cursorCreatedAt =
      cursor
        ?.createdAt ||
      null;

    const cursorSourceOrder =
      cursor
        ? (
            cursor.source ===
              'audit'
              ? 2
              : 1
          )
        : null;

    const cursorId =
      cursor
        ?.id ||
      null;

    const includeAudit =
      activityFilter !==
      'sign_ins';

    const includeLogin =
      activityFilter !==
      'security_changes';

    /* ========================================================
       4. QUERY ACTIVITY
       ======================================================== */

    const result =
      await queryControl(
        `
          WITH combined_activity AS (
            SELECT
              al.id::text
                AS id,

              'audit'::text
                AS source,

              2::integer
                AS source_order,

              al.event_type
                AS event_type,

              al.entity_type
                AS entity_type,

              al.entity_id::text
                AS entity_id,

              al.ip_address
                AS ip_address,

              al.user_agent
                AS user_agent,

              al.metadata
                AS metadata,

              NULL::boolean
                AS successful,

              NULL::text
                AS failure_reason,

              al.created_at
                AS created_at

            FROM audit_logs al

            WHERE al.user_id = $1
              AND $2::boolean = TRUE
              AND al.event_type ILIKE ANY(
                $3::text[]
              )

            UNION ALL

            SELECT
              lh.id::text
                AS id,

              'login'::text
                AS source,

              1::integer
                AS source_order,

              CASE
                WHEN lh.successful = TRUE
                  THEN 'LOGIN_SUCCESS'
                ELSE 'LOGIN_FAILED'
              END
                AS event_type,

              'session'::text
                AS entity_type,

              lh.session_id::text
                AS entity_id,

              lh.ip_address
                AS ip_address,

              lh.user_agent
                AS user_agent,

              lh.metadata
                AS metadata,

              lh.successful
                AS successful,

              lh.failure_reason
                AS failure_reason,

              lh.created_at
                AS created_at

            FROM login_history lh

            WHERE lh.user_id = $1
              AND $4::boolean = TRUE
          )

          SELECT
            id,
            source,
            event_type,
            entity_type,
            entity_id,
            ip_address,
            user_agent,
            metadata,
            successful,
            failure_reason,
            created_at

          FROM combined_activity

          WHERE (
            $5::timestamptz IS NULL

            OR created_at <
              $5::timestamptz

            OR (
              created_at =
                $5::timestamptz

              AND source_order <
                $6::integer
            )

            OR (
              created_at =
                $5::timestamptz

              AND source_order =
                $6::integer

              AND id <
                $7::text
            )
          )

          ORDER BY
            created_at DESC,
            source_order DESC,
            id DESC

          LIMIT $8
        `,
        [
          userId,
          includeAudit,
          patterns,
          includeLogin,
          cursorCreatedAt,
          cursorSourceOrder,
          cursorId,
          queryLimit,
        ]
      );

    /* ========================================================
       5. NORMALIZE
       ======================================================== */

    const normalized =
      (
        result.rows as
          ActivityRow[]
      )
        .map(
          mapActivityRow
        )
        .filter(
          (
            item
          ) =>
            matchesStatusFilter(
              item,
              statusFilter
            )
        );

    const hasMore =
      normalized.length >
        limit ||
      result.rows.length ===
        queryLimit;

    const items =
      normalized.slice(
        0,
        limit
      );

    const lastItem =
      items[
        items.length -
          1
      ];

    let nextCursor:
      string | null =
      null;

    if (
      hasMore &&
      lastItem
    ) {
      const sourceId =
        lastItem.id.replace(
          /^(audit|login):/,
          ''
        );

      nextCursor =
        encodeCursor({
          createdAt:
            lastItem.createdAt,

          source:
            lastItem.source,

          id:
            sourceId,
        });
    }

    /* ========================================================
       6. SUMMARY

       Summary describes all available user security history,
       not only the current page.
       ======================================================== */

    const summaryResult =
      await queryControl(
        `
          SELECT
            (
              SELECT COUNT(*)::integer

              FROM login_history

              WHERE user_id = $1
            )
              AS total_sign_ins,

            (
              SELECT COUNT(*)::integer

              FROM login_history

              WHERE user_id = $1
                AND successful = TRUE
            )
              AS successful_sign_ins,

            (
              SELECT COUNT(*)::integer

              FROM login_history

              WHERE user_id = $1
                AND successful = FALSE
            )
              AS unsuccessful_sign_ins,

            (
              SELECT COUNT(*)::integer

              FROM audit_logs

              WHERE user_id = $1
                AND event_type ILIKE ANY(
                  $2::text[]
                )
            )
              AS security_events,

            (
              SELECT MAX(created_at)

              FROM login_history

              WHERE user_id = $1
                AND successful = TRUE
            )
              AS last_successful_sign_in,

            (
              SELECT MAX(created_at)

              FROM login_history

              WHERE user_id = $1
                AND successful = FALSE
            )
              AS last_unsuccessful_sign_in
        `,
        [
          userId,
          patterns,
        ]
      );

    const summary =
      summaryResult
        .rows[0] ||
      {};

    /* ========================================================
       7. RESPONSE
       ======================================================== */

    return jsonResponse({
      success:
        true,

      activity: {
        items,

        pagination: {
          limit,

          hasMore,

          nextCursor,
        },

        filters: {
          selected:
            activityFilter,

          status:
            statusFilter,

          available: [
            'all',
            'sign_ins',
            'security_changes',
          ],

          statuses: [
            'all',
            'success',
            'failed',
            'blocked',
          ],
        },

        summary: {
          totalSignIns:
            Number(
              summary
                .total_sign_ins ||
              0
            ),

          successfulSignIns:
            Number(
              summary
                .successful_sign_ins ||
              0
            ),

          unsuccessfulSignIns:
            Number(
              summary
                .unsuccessful_sign_ins ||
              0
            ),

          securityEvents:
            Number(
              summary
                .security_events ||
              0
            ),

          lastSuccessfulSignIn:
            summary
              .last_successful_sign_in
              ? toIsoDate(
                  summary
                    .last_successful_sign_in
                )
              : null,

          lastUnsuccessfulSignIn:
            summary
              .last_unsuccessful_sign_in
              ? toIsoDate(
                  summary
                    .last_unsuccessful_sign_in
                )
              : null,
        },
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Security] Failed to load account security activity:',
      error
    );

    return errorResponse(
      500,
      'SECURITY_ACTIVITY_ERROR',
      'SaMi could not load your security activity.'
    );
  }
}