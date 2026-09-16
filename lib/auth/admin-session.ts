import crypto from 'crypto';

import {
  cookies,
} from 'next/headers';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

/* ============================================================
   RUNTIME
   ============================================================ */

export const runtime =
  'nodejs';

/* ============================================================
   TYPES
   ============================================================ */

export type PlatformAdminRole =
  | 'super_admin'
  | 'security_admin'
  | 'support_admin'
  | 'billing_admin'
  | 'operations_admin'
  | 'developer_admin'
  | 'read_only_admin';

export type PlatformAdminStatus =
  | 'invited'
  | 'active'
  | 'suspended'
  | 'locked'
  | 'disabled';

export type AdminSession = {
  sessionId:
    string;

  adminId:
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

  ipAddress:
    string | null;

  userAgent:
    string | null;

  deviceType:
    string | null;

  browser:
    string | null;

  operatingSystem:
    string | null;

  createdAt:
    Date;

  lastActivityAt:
    Date;

  expiresAt:
    Date;
};

export type CreateAdminSessionInput = {
  adminId:
    string;

  request:
    NextRequest;

  rememberMe?:
    boolean;
};

type AdminSessionRow = {
  session_id:
    string;

  admin_id:
    string;

  first_name:
    string;

  last_name:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  admin_status:
    PlatformAdminStatus;

  email_verified:
    boolean;

  two_factor_required:
    boolean;

  two_factor_enabled:
    boolean;

  ip_address:
    string | null;

  user_agent:
    string | null;

  device_type:
    string | null;

  browser:
    string | null;

  operating_system:
    string | null;

  created_at:
    Date | string;

  last_activity_at:
    Date | string;

  expires_at:
    Date | string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_SESSION_TOKEN_BYTES =
  64;

const ADMIN_SESSION_TOKEN_MAX_LENGTH =
  512;

const ADMIN_SESSION_ACTIVITY_UPDATE_MS =
  5 * 60 * 1000;

const ADMIN_SESSION_DEFAULT_DURATION_MS =
  getPositiveIntegerEnvironmentValue(
    'ADMIN_SESSION_DURATION_MS',
    12 * 60 * 60 * 1000
  );

const ADMIN_SESSION_REMEMBER_DURATION_MS =
  getPositiveIntegerEnvironmentValue(
    'ADMIN_SESSION_REMEMBER_DURATION_MS',
    7 * 24 * 60 * 60 * 1000
  );

const ADMIN_SESSION_COOKIE_NAME =
  process.env.NODE_ENV ===
  'production'
    ? '__Host-sami_admin_session'
    : 'sami_admin_session';

/* ============================================================
   ENVIRONMENT
   ============================================================ */

function getPositiveIntegerEnvironmentValue(
  name:
    string,
  fallback:
    number
) {
  const value =
    Number(
      process.env[name]
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value <=
      0
  ) {
    return fallback;
  }

  return Math.floor(
    value
  );
}

/* ============================================================
   TOKEN
   ============================================================ */

function createSessionToken() {
  return crypto
    .randomBytes(
      ADMIN_SESSION_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

function hashSessionToken(
  token:
    string
) {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      token,
      'utf8'
    )
    .digest(
      'hex'
    );
}

function isValidSessionToken(
  value:
    unknown
): value is string {
  if (
    typeof value !==
    'string'
  ) {
    return false;
  }

  if (
    value.length <
      32 ||
    value.length >
      ADMIN_SESSION_TOKEN_MAX_LENGTH
  ) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(
    value
  );
}

/* ============================================================
   TEXT
   ============================================================ */

function cleanText(
  value:
    string | null,
  maximumLength:
    number
) {
  if (
    !value
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

/* ============================================================
   REQUEST INFORMATION
   ============================================================ */

function normalizeIpAddress(
  value:
    string | null
) {
  if (
    !value
  ) {
    return null;
  }

  const normalized =
    cleanText(
      value,
      255
    );

  if (
    !normalized
  ) {
    return null;
  }

  if (
    normalized.startsWith(
      '::ffff:'
    )
  ) {
    return normalized
      .slice(
        7
      )
      .slice(
        0,
        255
      );
  }

  return normalized;
}

export function getAdminRequestIp(
  request:
    NextRequest
) {
  const forwardedFor =
    request.headers.get(
      'x-forwarded-for'
    );

  if (
    forwardedFor
  ) {
    const firstAddress =
      forwardedFor
        .split(
          ','
        )[0]
        ?.trim();

    if (
      firstAddress
    ) {
      return normalizeIpAddress(
        firstAddress
      );
    }
  }

  return normalizeIpAddress(
    request.headers.get(
      'x-real-ip'
    )
  );
}

export function getAdminRequestUserAgent(
  request:
    NextRequest
) {
  return cleanText(
    request.headers.get(
      'user-agent'
    ),
    1000
  );
}

/* ============================================================
   DEVICE DETECTION
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
   COOKIE
   ============================================================ */

function getAdminCookieOptions(
  expiresAt:
    Date
) {
  return {
    httpOnly:
      true,

    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'strict' as const,

    path:
      '/',

    expires:
      expiresAt,
  };
}

async function setAdminSessionCookie(
  token:
    string,
  expiresAt:
    Date
) {
  const cookieStore =
    await cookies();

  cookieStore.set(
    ADMIN_SESSION_COOKIE_NAME,
    token,
    getAdminCookieOptions(
      expiresAt
    )
  );
}

export async function clearAdminSessionCookie() {
  const cookieStore =
    await cookies();

  cookieStore.set(
    ADMIN_SESSION_COOKIE_NAME,
    '',
    {
      httpOnly:
        true,

      secure:
        process.env.NODE_ENV ===
        'production',

      sameSite:
        'strict',

      path:
        '/',

      expires:
        new Date(
          0
        ),
    }
  );
}

/* ============================================================
   SESSION MAPPING
   ============================================================ */

function mapAdminSession(
  row:
    AdminSessionRow
): AdminSession {
  const firstName =
    row.first_name ||
    '';

  const lastName =
    row.last_name ||
    '';

  return {
    sessionId:
      row.session_id,

    adminId:
      row.admin_id,

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
      row.admin_status,

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

    ipAddress:
      row.ip_address,

    userAgent:
      row.user_agent,

    deviceType:
      row.device_type,

    browser:
      row.browser,

    operatingSystem:
      row.operating_system,

    createdAt:
      new Date(
        row.created_at
      ),

    lastActivityAt:
      new Date(
        row.last_activity_at
      ),

    expiresAt:
      new Date(
        row.expires_at
      ),
  };
}

/* ============================================================
   CREATE SESSION
   ============================================================ */

export async function createAdminSession({
  adminId,
  request,
  rememberMe =
    false,
}: CreateAdminSessionInput) {
  const token =
    createSessionToken();

  const tokenHash =
    hashSessionToken(
      token
    );

  const now =
    new Date();

  const duration =
    rememberMe
      ? ADMIN_SESSION_REMEMBER_DURATION_MS
      : ADMIN_SESSION_DEFAULT_DURATION_MS;

  const expiresAt =
    new Date(
      now.getTime() +
        duration
    );

  const ipAddress =
    getAdminRequestIp(
      request
    );

  const userAgent =
    getAdminRequestUserAgent(
      request
    );

  const deviceType =
    detectDeviceType(
      userAgent
    );

  const browser =
    detectBrowser(
      userAgent
    );

  const operatingSystem =
    detectOperatingSystem(
      userAgent
    );

  const result =
    await queryControl(
      `
        INSERT INTO platform_admin_sessions (
          admin_id,
          token_hash,
          ip_address,
          user_agent,
          device_type,
          browser,
          operating_system,
          last_activity_at,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          NOW(),
          $8
        )
        RETURNING id
      `,
      [
        adminId,
        tokenHash,
        ipAddress,
        userAgent,
        deviceType,
        browser,
        operatingSystem,
        expiresAt,
      ]
    );

  const sessionId =
    result.rows[0]
      ?.id as
      | string
      | undefined;

  if (
    !sessionId
  ) {
    throw new Error(
      'ADMIN_SESSION_NOT_CREATED'
    );
  }

  await setAdminSessionCookie(
    token,
    expiresAt
  );

  return {
    sessionId,
    token,
    expiresAt,
  };
}

/* ============================================================
   READ TOKEN
   ============================================================ */

async function getAdminSessionTokenFromCookie() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      ADMIN_SESSION_COOKIE_NAME
    )?.value;

  if (
    !isValidSessionToken(
      token
    )
  ) {
    return null;
  }

  return token;
}

/* ============================================================
   GET SESSION
   ============================================================ */

export async function getAdminSession():
  Promise<
    AdminSession | null
  > {
  const token =
    await getAdminSessionTokenFromCookie();

  if (
    !token
  ) {
    return null;
  }

  const tokenHash =
    hashSessionToken(
      token
    );

  const result =
    await queryControl(
      `
        SELECT
          s.id AS session_id,
          s.admin_id,
          s.ip_address,
          s.user_agent,
          s.device_type,
          s.browser,
          s.operating_system,
          s.created_at,
          s.last_activity_at,
          s.expires_at,

          a.first_name,
          a.last_name,
          a.email,
          a.role,
          a.status AS admin_status,
          a.email_verified,
          a.two_factor_required,
          a.two_factor_enabled

        FROM platform_admin_sessions s

        INNER JOIN platform_admins a
          ON a.id = s.admin_id

        WHERE
          s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND a.deleted_at IS NULL
          AND a.status = 'active'

        LIMIT 1
      `,
      [
        tokenHash,
      ]
    );

  const row =
    result.rows[0] as
      | AdminSessionRow
      | undefined;

  if (
    !row
  ) {
    await clearAdminSessionCookie();

    return null;
  }

  const session =
    mapAdminSession(
      row
    );

  const timeSinceActivity =
    Date.now() -
    session.lastActivityAt
      .getTime();

  if (
    timeSinceActivity >=
    ADMIN_SESSION_ACTIVITY_UPDATE_MS
  ) {
    await queryControl(
      `
        UPDATE platform_admin_sessions
        SET last_activity_at = NOW()
        WHERE
          id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `,
      [
        session.sessionId,
      ]
    );

    session.lastActivityAt =
      new Date();
  }

  return session;
}

/* ============================================================
   REQUIRE SESSION
   ============================================================ */

export async function requireAdminSession():
  Promise<
    AdminSession
  > {
  const session =
    await getAdminSession();

  if (
    !session
  ) {
    throw new Error(
      'ADMIN_UNAUTHENTICATED'
    );
  }

  return session;
}

/* ============================================================
   ROLE ACCESS
   ============================================================ */

export function adminHasRole(
  session:
    AdminSession,
  allowedRoles:
    readonly PlatformAdminRole[]
) {
  if (
    session.role ===
    'super_admin'
  ) {
    return true;
  }

  return allowedRoles.includes(
    session.role
  );
}

export async function requireAdminRole(
  allowedRoles:
    readonly PlatformAdminRole[]
) {
  const session =
    await requireAdminSession();

  if (
    !adminHasRole(
      session,
      allowedRoles
    )
  ) {
    throw new Error(
      'ADMIN_FORBIDDEN'
    );
  }

  return session;
}

/* ============================================================
   PERMISSION ACCESS
   ============================================================ */

export async function adminHasPermission(
  session:
    AdminSession,
  permissionKey:
    string
) {
  if (
    session.role ===
    'super_admin'
  ) {
    return true;
  }

  const normalizedPermission =
    permissionKey
      .trim()
      .toLowerCase();

  if (
    !normalizedPermission
  ) {
    return false;
  }

  const result =
    await queryControl(
      `
        SELECT allowed
        FROM platform_admin_permissions
        WHERE
          admin_id = $1
          AND permission_key = $2
        LIMIT 1
      `,
      [
        session.adminId,
        normalizedPermission,
      ]
    );

  if (
    result.rows.length >
    0
  ) {
    return Boolean(
      result.rows[0]
        .allowed
    );
  }

  return false;
}

export async function requireAdminPermission(
  permissionKey:
    string
) {
  const session =
    await requireAdminSession();

  const allowed =
    await adminHasPermission(
      session,
      permissionKey
    );

  if (
    !allowed
  ) {
    throw new Error(
      'ADMIN_FORBIDDEN'
    );
  }

  return session;
}

/* ============================================================
   REVOKE CURRENT SESSION
   ============================================================ */

export async function revokeCurrentAdminSession(
  reason =
    'admin_logout'
) {
  const token =
    await getAdminSessionTokenFromCookie();

  if (
    token
  ) {
    const tokenHash =
      hashSessionToken(
        token
      );

    await queryControl(
      `
        UPDATE platform_admin_sessions
        SET
          revoked_at = COALESCE(
            revoked_at,
            NOW()
          ),
          revocation_reason = COALESCE(
            revocation_reason,
            $2
          )
        WHERE token_hash = $1
      `,
      [
        tokenHash,
        reason.slice(
          0,
          255
        ),
      ]
    );
  }

  await clearAdminSessionCookie();
}

/* ============================================================
   REVOKE ONE SESSION
   ============================================================ */

export async function revokeAdminSession(
  sessionId:
    string,
  revokedBy:
    string,
  reason =
    'revoked_by_admin'
) {
  const result =
    await queryControl(
      `
        UPDATE platform_admin_sessions
        SET
          revoked_at = COALESCE(
            revoked_at,
            NOW()
          ),
          revoked_by = COALESCE(
            revoked_by,
            $2
          ),
          revocation_reason = COALESCE(
            revocation_reason,
            $3
          )
        WHERE
          id = $1
          AND revoked_at IS NULL
        RETURNING id
      `,
      [
        sessionId,
        revokedBy,
        reason.slice(
          0,
          255
        ),
      ]
    );

  return (
    result.rows.length >
    0
  );
}

/* ============================================================
   REVOKE ALL ADMIN SESSIONS
   ============================================================ */

export async function revokeAllAdminSessions(
  adminId:
    string,
  revokedBy:
    string | null,
  reason =
    'all_sessions_revoked'
) {
  const result =
    await queryControl(
      `
        UPDATE platform_admin_sessions
        SET
          revoked_at = NOW(),
          revoked_by = $2,
          revocation_reason = $3
        WHERE
          admin_id = $1
          AND revoked_at IS NULL
        RETURNING id
      `,
      [
        adminId,
        revokedBy,
        reason.slice(
          0,
          255
        ),
      ]
    );

  return result.rows.length;
}

/* ============================================================
   REVOKE OTHER ADMIN SESSIONS

   Used for security-sensitive account changes such as
   password changes.

   The currently authenticated session remains active.
   ============================================================ */

export async function revokeOtherAdminSessions(
  adminId:
    string,
  currentSessionId:
    string,
  revokedBy:
    string | null,
  reason =
    'password_changed'
) {
  const result =
    await queryControl(
      `
        UPDATE platform_admin_sessions
        SET
          revoked_at = NOW(),
          revoked_by = $3,
          revocation_reason = $4
        WHERE
          admin_id = $1
          AND id <> $2
          AND revoked_at IS NULL
        RETURNING id
      `,
      [
        adminId,
        currentSessionId,
        revokedBy,
        reason.slice(
          0,
          255
        ),
      ]
    );

  return result.rows.length;
}

/* ============================================================
   CLEAN EXPIRED SESSIONS
   ============================================================ */

export async function removeExpiredAdminSessions() {
  const result =
    await queryControl(
      `
        DELETE FROM platform_admin_sessions
        WHERE
          expires_at <
            NOW() - INTERVAL '30 days'
          OR (
            revoked_at IS NOT NULL
            AND revoked_at <
              NOW() - INTERVAL '30 days'
          )
        RETURNING id
      `
    );

  return result.rows.length;
}

/* ============================================================
   AUTHENTICATION CHECK
   ============================================================ */

export async function isAdminAuthenticated() {
  const session =
    await getAdminSession();

  return Boolean(
    session
  );
}

/* ============================================================
   API ERROR RESPONSE
   ============================================================ */

export function adminAuthenticationErrorResponse(
  error:
    unknown
) {
  const message =
    error instanceof Error
      ? error.message
      : '';

  if (
    message ===
    'ADMIN_UNAUTHENTICATED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        code:
          'ADMIN_UNAUTHENTICATED',

        error:
          'Administrator authentication is required.',
      },
      {
        status:
          401,
      }
    );
  }

  if (
    message ===
    'ADMIN_FORBIDDEN'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        code:
          'ADMIN_FORBIDDEN',

        error:
          'You do not have permission to perform this administrator action.',
      },
      {
        status:
          403,
      }
    );
  }

  return NextResponse.json(
    {
      success:
        false,

      code:
        'ADMIN_AUTHENTICATION_ERROR',

      error:
        'SaMi could not verify the administrator session.',
    },
    {
      status:
        500,
    }
  );
}