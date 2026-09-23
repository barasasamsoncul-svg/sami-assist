import {
  queryControl,
} from '@/lib/db/control';

import {
  getRuntimePlatformSettings,
  type PlatformSettings,
} from '@/lib/admin/platform-settings';

import {
  touchMembershipActivity,
} from '@/lib/services/membership';

import {
  cookies,
} from 'next/headers';

import crypto from 'crypto';


/* ============================================================
   TYPES
   ============================================================ */

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
}


export interface SessionDevice {
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  lastActiveAt: Date | null;
}


export interface Session {
  sessionId: string;

  user: SessionUser;

  device: SessionDevice;

  currentTenantId:
    string | null;

  currentCompanyId:
    string | null;

  selectedCompanyIds:
    string[];

  expiresAt: Date;
}


export interface CreateSessionOptions {
  rememberMe?: boolean;

  revokeExistingSessions?: boolean;

  currentTenantId?:
    string | null;
}


export interface SessionRequestMetadata {
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
}


export interface UserSessionListItem {
  sessionId: string;

  ipAddress: string;
  userAgent: string;

  deviceType: string;
  browser: string;
  operatingSystem: string;

  currentTenantId:
    string | null;

  currentCompanyId:
    string | null;

  selectedCompanyIds:
    string[];

  isCurrent: boolean;

  lastActiveAt:
    Date | null;

  expiresAt:
    Date;

  createdAt:
    Date | null;
}


/* ============================================================
   CONSTANTS
   ============================================================ */

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV ===
  'production'
    ? '__Host-sami_session'
    : 'sami_session';




const ACTIVITY_REFRESH_MINUTES =
  5;


const SESSION_TOKEN_BYTES =
  64;




/* ============================================================
   TOKEN
   ============================================================ */

function generateSessionToken():
  string {
  return crypto
    .randomBytes(
      SESSION_TOKEN_BYTES,
    )
    .toString(
      'base64url',
    );
}


function hashToken(
  token:
    string,
): string {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      token,
      'utf8',
    )
    .digest(
      'hex',
    );
}


function isValidSessionToken(
  token:
    unknown,
): token is string {
  return (
    typeof token ===
      'string' &&
    token.length >=
      80 &&
    token.length <=
      200
  );
}


/* ============================================================
   ARRAY NORMALIZATION
   ============================================================ */

function normalizeUuidArray(
  value:
    unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            'string',
        )
        .map(
          item =>
            item.trim(),
        )
        .filter(
          Boolean,
        ),
    ),
  ];
}


/* ============================================================
   REQUEST METADATA
   ============================================================ */

function cleanHeaderValue(
  value:
    string | null,

  maxLength:
    number,
): string {
  return (
    value ||
    ''
  )
    .trim()
    .slice(
      0,
      maxLength,
    );
}


function getClientIp(
  request:
    Request,
): string {
  const cloudflareIp =
    cleanHeaderValue(
      request.headers.get(
        'cf-connecting-ip',
      ),
      45,
    );


  if (
    cloudflareIp
  ) {
    return cloudflareIp;
  }


  const forwardedFor =
    request.headers.get(
      'x-forwarded-for',
    );


  if (
    forwardedFor
  ) {
    const firstIp =
      forwardedFor
        .split(
          ',',
        )[0]
        ?.trim()
        .slice(
          0,
          45,
        );


    if (
      firstIp
    ) {
      return firstIp;
    }
  }


  const realIp =
    cleanHeaderValue(
      request.headers.get(
        'x-real-ip',
      ),
      45,
    );


  if (
    realIp
  ) {
    return realIp;
  }


  return 'unknown';
}


function getUserAgent(
  request:
    Request,
): string {
  return cleanHeaderValue(
    request.headers.get(
      'user-agent',
    ),
    1000,
  );
}


function detectDeviceType(
  userAgent:
    string,
): string {
  const ua =
    userAgent.toLowerCase();


  if (
    /tablet|ipad|playbook|silk/i.test(
      ua,
    )
  ) {
    return 'tablet';
  }


  if (
    /mobile|iphone|ipod|android.*mobile|windows phone/i.test(
      ua,
    )
  ) {
    return 'mobile';
  }


  return 'desktop';
}


function detectBrowser(
  userAgent:
    string,
): string {
  const ua =
    userAgent.toLowerCase();


  if (
    ua.includes(
      'edg/',
    )
  ) {
    return 'Edge';
  }


  if (
    ua.includes(
      'opr/',
    ) ||
    ua.includes(
      'opera',
    )
  ) {
    return 'Opera';
  }


  if (
    ua.includes(
      'chrome/',
    ) &&
    !ua.includes(
      'edg/',
    )
  ) {
    return 'Chrome';
  }


  if (
    ua.includes(
      'firefox/',
    )
  ) {
    return 'Firefox';
  }


  if (
    ua.includes(
      'safari/',
    ) &&
    !ua.includes(
      'chrome/',
    ) &&
    !ua.includes(
      'android',
    )
  ) {
    return 'Safari';
  }


  if (
    ua.includes(
      'msie',
    ) ||
    ua.includes(
      'trident/',
    )
  ) {
    return 'Internet Explorer';
  }


  return 'Unknown';
}


function detectOperatingSystem(
  userAgent:
    string,
): string {
  const ua =
    userAgent.toLowerCase();


  if (
    ua.includes(
      'iphone',
    ) ||
    ua.includes(
      'ipad',
    ) ||
    ua.includes(
      'ipod',
    )
  ) {
    return 'iOS';
  }


  if (
    ua.includes(
      'windows',
    )
  ) {
    return 'Windows';
  }


  if (
    ua.includes(
      'android',
    )
  ) {
    return 'Android';
  }


  if (
    ua.includes(
      'mac os',
    ) ||
    ua.includes(
      'macintosh',
    )
  ) {
    return 'macOS';
  }


  if (
    ua.includes(
      'cros',
    )
  ) {
    return 'ChromeOS';
  }


  if (
    ua.includes(
      'linux',
    )
  ) {
    return 'Linux';
  }


  return 'Unknown';
}


export function getSessionRequestMetadata(
  request:
    Request,
): SessionRequestMetadata {
  const userAgent =
    getUserAgent(
      request,
    );


  return {
    ipAddress:
      getClientIp(
        request,
      ),

    userAgent,

    deviceType:
      detectDeviceType(
        userAgent,
      ),

    browser:
      detectBrowser(
        userAgent,
      ),

    operatingSystem:
      detectOperatingSystem(
        userAgent,
      ),
  };
}


/* ============================================================
   EXPIRATION
   ============================================================ */

function calculateSessionExpiration(
  rememberMe:
    boolean,
  settings:
    PlatformSettings,
): Date {
  const durationMs =
    rememberMe
      ? settings.security.rememberMeDays *
        24 *
        60 *
        60 *
        1000
      : settings.security.normalSessionHours *
        60 *
        60 *
        1000;

  return new Date(
    Date.now() +
      durationMs,
  );
}


/* ============================================================
   COOKIE
   ============================================================ */

function getSessionCookieOptions(
  expiresAt:
    Date,

  rememberMe:
    boolean,
) {
  const isProduction =
    process.env.NODE_ENV ===
    'production';


  const options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    expires?: Date;
    maxAge?: number;
  } = {
    httpOnly:
      true,

    secure:
      isProduction,

    sameSite:
      'lax',

    path:
      '/',
  };


  if (
    rememberMe
  ) {
    options.expires =
      expiresAt;

    options.maxAge =
      Math.max(
        0,

        Math.floor(
          (
            expiresAt.getTime() -
            Date.now()
          ) /
            1000,
        ),
      );
  }


  return options;
}


function getClearCookieOptions() {
  return {
    httpOnly:
      true as const,

    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path:
      '/',

    maxAge:
      0,

    expires:
      new Date(
        0,
      ),
  };
}


/* ============================================================
   SESSION COOKIE TOKEN
   ============================================================ */

async function getRawSessionTokenFromCookie():
  Promise<string | null> {
  const cookieStore =
    await cookies();


  const sessionCookie =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    );


  const sessionToken =
    sessionCookie?.value;


  if (
    !isValidSessionToken(
      sessionToken,
    )
  ) {
    return null;
  }


  return sessionToken;
}


async function getSessionTokenHashFromCookie():
  Promise<string | null> {
  const sessionToken =
    await getRawSessionTokenFromCookie();


  if (
    !sessionToken
  ) {
    return null;
  }


  return hashToken(
    sessionToken,
  );
}


/* ============================================================
   DEFAULT INTERNAL WORKSPACE
   ============================================================ */

async function resolveDefaultTenantId(
  userId:
    string,

  preferredTenantId?:
    string | null,
): Promise<string | null> {
  if (
    preferredTenantId
  ) {
    const preferred =
      await queryControl(
        `
          SELECT
            t.id

          FROM tenant_users tu

          INNER JOIN tenants t
            ON t.id =
               tu.tenant_id

          WHERE tu.user_id = $1
            AND tu.tenant_id = $2

            AND LOWER(
              COALESCE(
                tu.status,
                ''
              )
            ) = 'active'

            AND LOWER(
              COALESCE(
                tu.member_type,
                ''
              )
            ) = 'internal'

            AND tu.deleted_at
                IS NULL

            AND t.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) = 'active'

          LIMIT 1
        `,
        [
          userId,
          preferredTenantId,
        ],
      );


    if (
      preferred.rows.length >
      0
    ) {
      return preferred.rows[0]
        .id;
    }
  }


  const result =
    await queryControl(
      `
        SELECT
          t.id

        FROM tenant_users tu

        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id

        WHERE tu.user_id = $1

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) = 'internal'

          AND tu.deleted_at
              IS NULL

          AND t.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) = 'active'

        ORDER BY
          /*
           * Structural ownership is the only special-case priority.
           *
           * Do not infer authority from role names such as "Admin".
           * Category 8 permissions govern authorization; this query
           * only chooses a deterministic default workspace.
           */
          CASE
            WHEN tu.is_owner =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          tu.created_at ASC,
          t.id ASC

        LIMIT 1
      `,
      [
        userId,
      ],
    );


  return result.rows[0]
    ?.id ||
    null;
}


/* ============================================================
   CREATE SESSION
   ============================================================ */

export async function createSession(
  userId:
    string,

  request:
    Request,

  options:
    CreateSessionOptions = {},
): Promise<{
  sessionId: string;
  expiresAt: Date;
  currentTenantId: string | null;
}> {
  if (
    !userId
  ) {
    throw new Error(
      'User ID is required to create a session.',
    );
  }


  const rememberMe =
    options.rememberMe ===
    true;

  const platformSettings =
    await getRuntimePlatformSettings();

  const revokeExistingSessions =
    options
      .revokeExistingSessions ??
    !platformSettings
      .security
      .allowMultipleActiveSessions;


  const currentTenantId =
    await resolveDefaultTenantId(
      userId,
      options.currentTenantId,
    );


  const sessionToken =
    generateSessionToken();


  const tokenHash =
    hashToken(
      sessionToken,
    );


  const expiresAt =
    calculateSessionExpiration(
      rememberMe,
      platformSettings,
    );


  const metadata =
    getSessionRequestMetadata(
      request,
    );


  if (
    revokeExistingSessions
  ) {
    await queryControl(
      `
        UPDATE sessions

        SET
          is_current =
            FALSE,

          revoked_at =
            NOW(),

          updated_at =
            NOW()

        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [
        userId,
      ],
    );
  }


  const result =
    await queryControl(
      `
        INSERT INTO sessions (
          user_id,
          session_token_hash,

          current_tenant_id,
          current_company_id,
          selected_company_ids,

          ip_address,
          user_agent,
          device_type,
          browser,
          operating_system,

          is_current,
          last_active_at,
          expires_at
        )

        VALUES (
          $1,
          $2,

          $3,
          NULL,
          '{}'::UUID[],

          $4,
          $5,
          $6,
          $7,
          $8,

          TRUE,
          NOW(),
          $9
        )

        RETURNING
          id,
          current_tenant_id,
          expires_at
      `,
      [
        userId,
        tokenHash,
        currentTenantId,

        metadata.ipAddress,
        metadata.userAgent,
        metadata.deviceType,
        metadata.browser,
        metadata.operatingSystem,

        expiresAt,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      'Failed to create session.',
    );
  }


  const sessionId =
    result.rows[0]
      .id;


  const databaseExpiresAt =
    new Date(
      result.rows[0]
        .expires_at,
    );


  const databaseTenantId =
    result.rows[0]
      .current_tenant_id ||
    null;


  if (
    databaseTenantId
  ) {
    try {
      await touchMembershipActivity(
        databaseTenantId,
        userId,
      );
    } catch (
      error
    ) {
      console.error(
        '[Session] Failed to synchronize membership activity during session creation:',
        error,
      );
    }
  }


  const cookieStore =
    await cookies();


  cookieStore.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions(
      databaseExpiresAt,
      rememberMe,
    ),
  );


  return {
    sessionId,

    expiresAt:
      databaseExpiresAt,

    currentTenantId:
      databaseTenantId,
  };
}


/* ============================================================
   REPAIR CURRENT INTERNAL WORKSPACE
   ============================================================ */

async function repairSessionTenant(
  sessionId:
    string,

  userId:
    string,

  currentTenantId:
    string | null,

  currentTenantValid:
    boolean,
): Promise<string | null> {
  if (
    currentTenantId &&
    currentTenantValid
  ) {
    return currentTenantId;
  }


  const resolvedTenantId =
    await resolveDefaultTenantId(
      userId,
    );


  if (
    resolvedTenantId ===
    currentTenantId
  ) {
    return resolvedTenantId;
  }


  await queryControl(
    `
      UPDATE sessions

      SET
        current_tenant_id =
          $3,

        current_company_id =
          NULL,

        selected_company_ids =
          '{}'::UUID[],

        updated_at =
          NOW()

      WHERE id = $1
        AND user_id = $2

        AND is_current =
            TRUE

        AND revoked_at
            IS NULL

        AND expires_at >
            NOW()
    `,
    [
      sessionId,
      userId,
      resolvedTenantId,
    ],
  );


  return resolvedTenantId;
}


/* ============================================================
   GET CURRENT SESSION
   ============================================================ */

export async function getSession():
  Promise<Session | null> {
  const tokenHash =
    await getSessionTokenHashFromCookie();


  if (
    !tokenHash
  ) {
    return null;
  }


  const result =
    await queryControl(
      `
        SELECT
          s.id
            AS session_id,

          s.current_tenant_id,
          s.current_company_id,
          s.selected_company_ids,

          s.expires_at,
          s.last_active_at,
          s.ip_address,
          s.user_agent,
          s.device_type,
          s.browser,
          s.operating_system,

          u.id
            AS user_id,

          u.email,
          u.full_name,
          u.first_name,
          u.last_name,
          u.avatar_file_id,
          u.status,

          CASE
            WHEN s.current_tenant_id
                 IS NULL
            THEN FALSE

            WHEN EXISTS (
              SELECT 1

              FROM tenant_users tu

              INNER JOIN tenants t
                ON t.id =
                   tu.tenant_id

              WHERE tu.user_id =
                    s.user_id

                AND tu.tenant_id =
                    s.current_tenant_id

                AND LOWER(
                  COALESCE(
                    tu.status,
                    ''
                  )
                ) = 'active'

                AND LOWER(
                  COALESCE(
                    tu.member_type,
                    ''
                  )
                ) = 'internal'

                AND tu.deleted_at
                    IS NULL

                AND t.deleted_at
                    IS NULL

                AND LOWER(
                  COALESCE(
                    t.status,
                    ''
                  )
                ) = 'active'
            )
            THEN TRUE

            ELSE FALSE
          END
            AS current_tenant_valid

        FROM sessions s

        INNER JOIN users u
          ON u.id =
             s.user_id

        WHERE s.session_token_hash = $1

          AND s.is_current =
              TRUE

          AND s.revoked_at
              IS NULL

          AND s.expires_at >
              NOW()

          AND LOWER(
            COALESCE(
              u.status,
              ''
            )
          ) = 'active'

          AND u.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tokenHash,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  const originalTenantId =
    row.current_tenant_id ||
    null;


  const currentTenantId =
    await repairSessionTenant(
      row.session_id,
      row.user_id,

      originalTenantId,

      row.current_tenant_valid ===
        true,
    );


  const tenantChanged =
    currentTenantId !==
    originalTenantId;


  const activityRefreshed =
    await refreshSessionActivityIfNeeded(
      row.session_id,
      row.last_active_at,
    );


  if (
    activityRefreshed &&
    currentTenantId
  ) {
    try {
      await touchMembershipActivity(
        currentTenantId,
        row.user_id,
      );
    } catch (
      error
    ) {
      console.error(
        '[Session] Failed to synchronize workspace membership activity:',
        error,
      );
    }
  }


  return {
    sessionId:
      row.session_id,

    currentTenantId,

    currentCompanyId:
      tenantChanged
        ? null
        : typeof row.current_company_id ===
            'string'
          ? row.current_company_id
          : null,

    selectedCompanyIds:
      tenantChanged
        ? []
        : normalizeUuidArray(
            row.selected_company_ids,
          ),

    user: {
      id:
        row.user_id,

      email:
        row.email,

      fullName:
        row.full_name ||
        '',

      firstName:
        row.first_name ||
        '',

      lastName:
        row.last_name ||
        '',

      avatarFileId:
        row.avatar_file_id ||
        null,
    },

    device: {
      ipAddress:
        row.ip_address ||
        'unknown',

      userAgent:
        row.user_agent ||
        '',

      deviceType:
        row.device_type ||
        'desktop',

      browser:
        row.browser ||
        'Unknown',

      operatingSystem:
        row.operating_system ||
        'Unknown',

      lastActiveAt:
        row.last_active_at
          ? new Date(
              row.last_active_at,
            )
          : null,
    },

    expiresAt:
      new Date(
        row.expires_at,
      ),
  };
}


/* ============================================================
   ACTIVITY
   ============================================================ */

async function refreshSessionActivityIfNeeded(
  sessionId:
    string,

  lastActiveAtValue:
    unknown,
): Promise<boolean> {
  const lastActiveAt =
    lastActiveAtValue
      ? new Date(
          String(
            lastActiveAtValue,
          ),
        )
      : null;


  const shouldRefreshActivity =
    !lastActiveAt ||
    (
      Date.now() -
      lastActiveAt.getTime()
    ) >
      (
        ACTIVITY_REFRESH_MINUTES *
        60 *
        1000
      );


  if (
    !shouldRefreshActivity
  ) {
    return false;
  }


  try {
    await queryControl(
      `
        UPDATE sessions

        SET
          last_active_at =
            NOW(),

          updated_at =
            NOW()

        WHERE id = $1

          AND is_current =
              TRUE

          AND revoked_at
              IS NULL

          AND expires_at >
              NOW()
      `,
      [
        sessionId,
      ],
    );


    return true;
  } catch (
    error
  ) {
    console.error(
      '[Session] Failed to refresh session activity:',
      error,
    );


    return false;
  }
}


/* ============================================================
   REQUIRE SESSION
   ============================================================ */

export async function requireSession():
  Promise<Session> {
  const session =
    await getSession();


  if (
    !session
  ) {
    throw new Error(
      'UNAUTHENTICATED',
    );
  }


  return session;
}


/* ============================================================
   CURRENT INTERNAL WORKSPACE
   ============================================================ */

export async function setCurrentTenantForSession(
  sessionId:
    string,

  userId:
    string,

  tenantId:
    string,
): Promise<boolean> {
  if (
    !sessionId ||
    !userId ||
    !tenantId
  ) {
    return false;
  }


  const result =
    await queryControl(
      `
        UPDATE sessions s

        SET
          current_company_id =
            CASE
              WHEN s.current_tenant_id
                   IS DISTINCT FROM $3
              THEN NULL

              ELSE
                s.current_company_id
            END,

          selected_company_ids =
            CASE
              WHEN s.current_tenant_id
                   IS DISTINCT FROM $3
              THEN '{}'::UUID[]

              ELSE
                s.selected_company_ids
            END,

          current_tenant_id =
            $3,

          updated_at =
            NOW()

        WHERE s.id = $1
          AND s.user_id = $2

          AND s.is_current =
              TRUE

          AND s.revoked_at
              IS NULL

          AND s.expires_at >
              NOW()

          AND EXISTS (
            SELECT 1

            FROM tenant_users tu

            INNER JOIN tenants t
              ON t.id =
                 tu.tenant_id

            WHERE tu.user_id =
                  s.user_id

              AND tu.tenant_id =
                  $3

              AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) = 'active'

              AND LOWER(
                COALESCE(
                  tu.member_type,
                  ''
                )
              ) = 'internal'

              AND tu.deleted_at
                  IS NULL

              AND t.deleted_at
                  IS NULL

              AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) = 'active'
          )

        RETURNING
          s.current_tenant_id
      `,
      [
        sessionId,
        userId,
        tenantId,
      ],
    );


  const changed =
    result.rows.length ===
    1;


  if (
    changed
  ) {
    try {
      await touchMembershipActivity(
        tenantId,
        userId,
      );
    } catch (
      error
    ) {
      console.error(
        '[Session] Failed to synchronize workspace membership activity after workspace switch:',
        error,
      );
    }
  }


  return changed;
}


export async function clearCurrentTenantForSession(
  sessionId:
    string,

  userId:
    string,
): Promise<void> {
  if (
    !sessionId ||
    !userId
  ) {
    return;
  }


  await queryControl(
    `
      UPDATE sessions

      SET
        current_tenant_id =
          NULL,

        current_company_id =
          NULL,

        selected_company_ids =
          '{}'::UUID[],

        updated_at =
          NOW()

      WHERE id = $1
        AND user_id = $2

        AND is_current =
            TRUE

        AND revoked_at
            IS NULL
    `,
    [
      sessionId,
      userId,
    ],
  );
}


/* ============================================================
   CURRENT USER
   ============================================================ */

export async function getCurrentUser():
  Promise<SessionUser | null> {
  const session =
    await getSession();


  return session?.user ??
    null;
}


export async function requireCurrentUser():
  Promise<SessionUser> {
  const session =
    await requireSession();


  return session.user;
}


export async function getCurrentUserId():
  Promise<string | null> {
  const session =
    await getSession();


  return session?.user.id ??
    null;
}


export async function isAuthenticated():
  Promise<boolean> {
  const session =
    await getSession();


  return session !==
    null;
}


export const getAuthenticatedUser =
  getCurrentUser;


export const requireAuthenticatedUser =
  requireCurrentUser;


/* ============================================================
   ACTIVE SESSIONS
   ============================================================ */

export async function listActiveSessions(
  userId:
    string,
): Promise<UserSessionListItem[]> {
  if (
    !userId
  ) {
    return [];
  }


  const currentTokenHash =
    await getSessionTokenHashFromCookie();


  const result =
    await queryControl(
      `
        SELECT
          id,

          current_tenant_id,
          current_company_id,
          selected_company_ids,

          ip_address,
          user_agent,
          device_type,
          browser,
          operating_system,

          last_active_at,
          expires_at,
          created_at,

          COALESCE(
            session_token_hash =
              $2::text,
            FALSE
          )
            AS is_current_browser

        FROM sessions

        WHERE user_id = $1

          AND is_current =
              TRUE

          AND revoked_at
              IS NULL

          AND expires_at >
              NOW()

        ORDER BY
          last_active_at DESC
            NULLS LAST,

          created_at DESC
      `,
      [
        userId,
        currentTokenHash,
      ],
    );


  return result.rows.map(
    (
      row:
        Record<string, unknown>,
    ) => ({
      sessionId:
        String(
          row.id ||
          '',
        ),

      ipAddress:
        typeof row.ip_address ===
          'string'
          ? row.ip_address
          : 'unknown',

      userAgent:
        typeof row.user_agent ===
          'string'
          ? row.user_agent
          : '',

      deviceType:
        typeof row.device_type ===
          'string'
          ? row.device_type
          : 'desktop',

      browser:
        typeof row.browser ===
          'string'
          ? row.browser
          : 'Unknown',

      operatingSystem:
        typeof row.operating_system ===
          'string'
          ? row.operating_system
          : 'Unknown',

      currentTenantId:
        typeof row.current_tenant_id ===
          'string'
          ? row.current_tenant_id
          : null,

      currentCompanyId:
        typeof row.current_company_id ===
          'string'
          ? row.current_company_id
          : null,

      selectedCompanyIds:
        normalizeUuidArray(
          row.selected_company_ids,
        ),

      isCurrent:
        row.is_current_browser ===
        true,

      lastActiveAt:
        row.last_active_at
          ? new Date(
              String(
                row.last_active_at,
              ),
            )
          : null,

      expiresAt:
        new Date(
          String(
            row.expires_at,
          ),
        ),

      createdAt:
        row.created_at
          ? new Date(
              String(
                row.created_at,
              ),
            )
          : null,
    }),
  );
}


/* ============================================================
   REVOKE ONE SESSION
   ============================================================ */

export async function revokeSession(
  sessionId:
    string,

  userId:
    string,
): Promise<void> {
  if (
    !sessionId ||
    !userId
  ) {
    return;
  }


  await queryControl(
    `
      UPDATE sessions

      SET
        is_current =
          FALSE,

        revoked_at =
          NOW(),

        updated_at =
          NOW()

      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
    `,
    [
      sessionId,
      userId,
    ],
  );
}


/* ============================================================
   LOGOUT
   ============================================================ */

export async function logout():
  Promise<void> {
  const tokenHash =
    await getSessionTokenHashFromCookie();


  if (
    tokenHash
  ) {
    await queryControl(
      `
        UPDATE sessions

        SET
          is_current =
            FALSE,

          revoked_at =
            NOW(),

          updated_at =
            NOW()

        WHERE session_token_hash =
              $1

          AND revoked_at
              IS NULL
      `,
      [
        tokenHash,
      ],
    );
  }


  await clearSessionCookie();
}


/* ============================================================
   REVOKE OTHER SESSIONS
   ============================================================ */

export async function revokeAllOtherSessions(
  userId:
    string,

  currentSessionId:
    string,
): Promise<void> {
  if (
    !userId ||
    !currentSessionId
  ) {
    return;
  }


  await queryControl(
    `
      UPDATE sessions

      SET
        is_current =
          FALSE,

        revoked_at =
          NOW(),

        updated_at =
          NOW()

      WHERE user_id = $1

        AND id != $2

        AND revoked_at
            IS NULL
    `,
    [
      userId,
      currentSessionId,
    ],
  );
}


/* ============================================================
   REVOKE ALL SESSIONS
   ============================================================ */

export async function revokeAllSessions(
  userId:
    string,
): Promise<void> {
  if (
    !userId
  ) {
    return;
  }


  await queryControl(
    `
      UPDATE sessions

      SET
        is_current =
          FALSE,

        revoked_at =
          NOW(),

        updated_at =
          NOW()

      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [
      userId,
    ],
  );


  await clearSessionCookie();
}


/* ============================================================
   ROTATE SESSION
   ============================================================ */

export async function rotateSession(
  request:
    Request,

  options:
    CreateSessionOptions = {},
): Promise<{
  sessionId: string;
  expiresAt: Date;
  currentTenantId: string | null;
} | null> {
  const session =
    await getSession();


  if (
    !session
  ) {
    return null;
  }


  await revokeSession(
    session.sessionId,
    session.user.id,
  );


  return createSession(
    session.user.id,
    request,
    {
      ...options,

      currentTenantId:
        options.currentTenantId ??
        session.currentTenantId,

      revokeExistingSessions:
        options.revokeExistingSessions ??
        false,
    },
  );
}


/* ============================================================
   CLEAR COOKIE
   ============================================================ */

export async function clearSessionCookie():
  Promise<void> {
  const cookieStore =
    await cookies();


  cookieStore.set(
    SESSION_COOKIE_NAME,
    '',
    getClearCookieOptions(),
  );
}