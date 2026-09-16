import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 1000;

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
  createdAt: string;
  source: ActivitySource;
  id: string;
};

type ActivityItem = {
  id: string;
  source: ActivitySource;
  eventType: string;
  title: string;
  description: string;
  category: ActivityCategory;
  status: ActivityStatus;
  ipAddress: string | null;
  userAgent: string | null;
  device: {
    type: string;
    browser: string;
    operatingSystem: string;
  };
  createdAt: string;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control':
        'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options':
        'nosniff',
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  error: string
) {
  return jsonResponse(
    {
      success: false,
      code,
      error,
    },
    status
  );
}

function parseLimit(
  value: string | null
) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.floor(parsed),
    MAX_LIMIT
  );
}

function normalizeActivityFilter(
  value: string | null
): ActivityFilter {
  if (
    value === 'sign_ins' ||
    value === 'security_changes'
  ) {
    return value;
  }

  return 'all';
}

function normalizeStatusFilter(
  value: string | null
): StatusFilter {
  if (
    value === 'success' ||
    value === 'failed' ||
    value === 'blocked'
  ) {
    return value;
  }

  return 'all';
}

function safeString(
  value: unknown
) {
  if (
    typeof value !== 'string'
  ) {
    return null;
  }

  const clean = value.trim();

  return clean || null;
}

function safeDate(
  value: unknown
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(String(value));

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function encodeCursor(
  value: ActivityCursor
) {
  return Buffer.from(
    JSON.stringify(value),
    'utf8'
  ).toString('base64url');
}

function decodeCursor(
  value: string | null
): ActivityCursor | null {
  if (
    !value ||
    value.length >
      MAX_CURSOR_LENGTH
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(
        value,
        'base64url'
      ).toString('utf8')
    ) as Partial<ActivityCursor>;

    if (
      typeof parsed.createdAt !==
        'string' ||
      typeof parsed.id !==
        'string' ||
      (
        parsed.source !== 'audit' &&
        parsed.source !== 'login'
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

function detectDeviceType(
  userAgent: string | null
) {
  const value =
    (userAgent || '')
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

  if (value) {
    return 'desktop';
  }

  return 'unknown';
}

function detectBrowser(
  userAgent: string | null
) {
  const value =
    userAgent || '';

  if (/Edg\//i.test(value)) {
    return 'Microsoft Edge';
  }

  if (/OPR\//i.test(value)) {
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
    /CriOS\//i.test(value) ||
    /Chrome\//i.test(value)
  ) {
    return 'Chrome';
  }

  if (
    /FxiOS\//i.test(value) ||
    /Firefox\//i.test(value)
  ) {
    return 'Firefox';
  }

  if (
    /Safari\//i.test(value) &&
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
  userAgent: string | null
) {
  const value =
    userAgent || '';

  if (
    /Windows/i.test(value)
  ) {
    return 'Windows';
  }

  if (
    /Android/i.test(value)
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
    /Linux/i.test(value)
  ) {
    return 'Linux';
  }

  return value
    ? 'Other'
    : 'Unknown';
}

function categoryFor(
  eventType: string,
  source: ActivitySource
): ActivityCategory {
  const event =
    eventType.toLowerCase();

  if (
    source === 'login' ||
    event.includes('login') ||
    event.includes('logout') ||
    event.includes('sign_in') ||
    event.includes('sign-in')
  ) {
    return 'login';
  }

  if (
    event.includes('password')
  ) {
    return 'password';
  }

  if (
    event.includes(
      'two_factor'
    ) ||
    event.includes(
      'authenticator'
    ) ||
    event.includes(
      'recovery'
    )
  ) {
    return 'two_factor';
  }

  if (
    event.includes('session')
  ) {
    return 'session';
  }

  if (
    event.includes('email')
  ) {
    return 'email';
  }

  if (
    event.includes('account') ||
    event.includes('profile')
  ) {
    return 'account';
  }

  return 'security';
}

function statusFor(
  successful: boolean,
  failureReason: string | null
): ActivityStatus {
  if (successful) {
    return 'success';
  }

  const reason =
    (
      failureReason ||
      ''
    ).toLowerCase();

  if (
    reason.includes('blocked') ||
    reason.includes('locked') ||
    reason.includes(
      'rate_limit'
    ) ||
    reason.includes(
      'too_many'
    )
  ) {
    return 'blocked';
  }

  return 'failed';
}

function titleFor(
  eventType: string,
  source: ActivitySource,
  successful: boolean
) {
  if (source === 'login') {
    return successful
      ? 'Administrator sign-in'
      : 'Failed administrator sign-in';
  }

  const labels:
    Record<string, string> = {
      'admin.password.changed':
        'Password changed',

      'admin.two_factor.account_enabled':
        'Two-factor authentication enabled',

      'admin.two_factor.account_disabled':
        'Two-factor authentication disabled',

      'admin.two_factor.recovery_codes_regenerated':
        'Recovery codes replaced',

      'admin.sessions.others_revoked':
        'Other sessions signed out',

      'admin.session.revoked':
        'Session signed out',

      'admin.avatar.updated':
        'Profile photo changed',

      'admin.avatar.removed':
        'Profile photo removed',
    };

  if (labels[eventType]) {
    return labels[eventType];
  }

  return (
    eventType
      .replace(/^admin[._-]/i, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      ) ||
    'Security activity'
  );
}

function descriptionFor(
  category: ActivityCategory,
  successful: boolean,
  failureReason: string | null
) {
  if (!successful) {
    if (failureReason) {
      return 'This security action was not completed.';
    }

    return 'The security action was unsuccessful.';
  }

  switch (category) {
    case 'login':
      return 'Your administrator account was signed in.';

    case 'password':
      return 'Your administrator account password was updated.';

    case 'two_factor':
      return 'Two-factor authentication settings were changed.';

    case 'session':
      return 'An administrator session was changed.';

    case 'email':
      return 'Your account email security settings were changed.';

    case 'account':
      return 'Your administrator account information was changed.';

    default:
      return 'A security-related account action was completed.';
  }
}

function matchesFilter(
  item: ActivityItem,
  activityFilter:
    ActivityFilter,
  statusFilter:
    StatusFilter
) {
  if (
    activityFilter ===
      'sign_ins' &&
    item.category !==
      'login'
  ) {
    return false;
  }

  if (
    activityFilter ===
      'security_changes' &&
    item.category ===
      'login'
  ) {
    return false;
  }

  if (
    statusFilter !== 'all' &&
    item.status !==
      statusFilter
  ) {
    return false;
  }

  return true;
}

export async function GET(
  request: NextRequest
) {
  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    console.error(
      '[Admin Security Activity] Session error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_SESSION_ERROR',
      'SaMi could not verify your administrator session.'
    );
  }

  const limit =
    parseLimit(
      request.nextUrl
        .searchParams
        .get('limit')
    );

  const activityFilter =
    normalizeActivityFilter(
      request.nextUrl
        .searchParams
        .get('filter')
    );

  const statusFilter =
    normalizeStatusFilter(
      request.nextUrl
        .searchParams
        .get('status')
    );

  const cursorValue =
    request.nextUrl
      .searchParams
      .get('cursor');

  const cursor =
    decodeCursor(cursorValue);

  if (
    cursorValue &&
    !cursor
  ) {
    return errorResponse(
      400,
      'INVALID_CURSOR',
      'The security activity position is invalid.'
    );
  }

  try {
    const queryLimit =
      Math.min(
        MAX_LIMIT * 2,
        limit * 3 + 1
      );

    const cursorDate =
      cursor?.createdAt ??
      null;

    const [
      auditResult,
      loginResult,
    ] = await Promise.all([
      queryControl(
        `
          SELECT
            id,
            event_type,
            action,
            successful,
            failure_reason,
            ip_address,
            user_agent,
            created_at
          FROM
            platform_admin_audit_logs
          WHERE
            admin_id = $1
            AND (
              $2::timestamptz
                IS NULL
              OR created_at <
                $2::timestamptz
            )
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT $3
        `,
        [
          session.adminId,
          cursorDate,
          queryLimit,
        ]
      ),

      queryControl(
        `
          SELECT
            id,
            successful,
            failure_reason,
            ip_address,
            user_agent,
            device_type,
            browser,
            operating_system,
            created_at
          FROM
            platform_admin_login_history
          WHERE
            admin_id = $1
            AND (
              $2::timestamptz
                IS NULL
              OR created_at <
                $2::timestamptz
            )
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT $3
        `,
        [
          session.adminId,
          cursorDate,
          queryLimit,
        ]
      ),
    ]);

    const auditActivity =
  auditResult.rows.reduce<ActivityItem[]>(
    (items, row) => {
      const createdAt =
        safeDate(row.created_at);

      if (!createdAt) {
        return items;
      }

      const eventType =
        safeString(row.event_type) ||
        'admin.security.activity';

      const successful =
        row.successful !== false;

      const failureReason =
        safeString(
          row.failure_reason
        );

      const userAgent =
        safeString(
          row.user_agent
        );

      const category =
        categoryFor(
          eventType,
          'audit'
        );

      items.push({
        id: String(row.id),

        source: 'audit',

        eventType,

        title: titleFor(
          eventType,
          'audit',
          successful
        ),

        description:
          descriptionFor(
            category,
            successful,
            failureReason
          ),

        category,

        status: statusFor(
          successful,
          failureReason
        ),

        ipAddress:
          safeString(
            row.ip_address
          ),

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

        createdAt,
      });

      return items;
    },
    []
  );

  const loginActivity =
  loginResult.rows.reduce<ActivityItem[]>(
    (items, row) => {
      const createdAt =
        safeDate(row.created_at);

      if (!createdAt) {
        return items;
      }

      const successful =
        row.successful === true;

      const failureReason =
        safeString(
          row.failure_reason
        );

      const userAgent =
        safeString(
          row.user_agent
        );

      const eventType =
        successful
          ? 'admin.login.success'
          : 'admin.login.failed';

      items.push({
        id: String(row.id),

        source: 'login',

        eventType,

        title: titleFor(
          eventType,
          'login',
          successful
        ),

        description:
          successful
            ? 'Your administrator account was signed in.'
            : 'A sign-in attempt to your administrator account was unsuccessful.',

        category: 'login',

        status: statusFor(
          successful,
          failureReason
        ),

        ipAddress:
          safeString(
            row.ip_address
          ),

        userAgent,

        device: {
          type:
            safeString(
              row.device_type
            ) ||
            detectDeviceType(
              userAgent
            ),

          browser:
            safeString(
              row.browser
            ) ||
            detectBrowser(
              userAgent
            ),

          operatingSystem:
            safeString(
              row.operating_system
            ) ||
            detectOperatingSystem(
              userAgent
            ),
        },

        createdAt,
      });

      return items;
    },
    []
  );

    const combined = [
      ...auditActivity,
      ...loginActivity,
    ]
      .filter(item =>
        matchesFilter(
          item,
          activityFilter,
          statusFilter
        )
      )
      .sort(
        (first, second) => {
          const dateDifference =
            new Date(
              second.createdAt
            ).getTime() -
            new Date(
              first.createdAt
            ).getTime();

          if (
            dateDifference !== 0
          ) {
            return dateDifference;
          }

          if (
            first.source !==
            second.source
          ) {
            return first.source ===
              'audit'
              ? -1
              : 1;
          }

          return second.id.localeCompare(
            first.id
          );
        }
      );

    const page =
      combined.slice(
        0,
        limit
      );

    const hasMore =
      combined.length >
      limit;

    const lastItem =
      page[
        page.length - 1
      ];

    const nextCursor =
      hasMore &&
      lastItem
        ? encodeCursor({
            createdAt:
              lastItem.createdAt,

            source:
              lastItem.source,

            id:
              lastItem.id,
          })
        : null;

    return jsonResponse({
      success: true,

      code:
        'ADMIN_SECURITY_ACTIVITY_LOADED',

      activity: page,

      pagination: {
        limit,
        hasMore,
        nextCursor,
      },

      filters: {
        activity:
          activityFilter,

        status:
          statusFilter,
      },
    });
  } catch (error) {
    console.error(
      '[Admin Security Activity] Load error:',
      error
    );

    return errorResponse(
      500,
      'ADMIN_SECURITY_ACTIVITY_LOAD_FAILED',
      'SaMi could not load your security activity.'
    );
  }
}