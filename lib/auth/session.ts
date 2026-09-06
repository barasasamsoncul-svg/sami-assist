import { queryControl } from '@/lib/db/control';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * SaMi Session Management
 *
 * Server-only authentication foundation.
 *
 * Supports:
 * - Secure opaque session tokens
 * - SHA-256 token hashing
 * - HttpOnly cookies
 * - Production __Host- cookie
 * - Local development cookie compatibility
 * - Session revocation
 * - Session rotation
 * - Activity refresh
 * - Device metadata stored on sessions
 * - Settings-compatible active session listing
 */

// ============================================================
// TYPES
// ============================================================

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
  expiresAt: Date;
}

export interface CreateSessionOptions {
  /**
   * true = longer persistent session.
   * false = shorter server-side session.
   */
  rememberMe?: boolean;

  /**
   * When true, all existing active sessions for the user are revoked
   * before creating the new session.
   *
   * Default:
   * - true, unless SAMI_ALLOW_MULTIPLE_ACTIVE_SESSIONS=true
   *
   * This keeps your current one-current-session behavior by default,
   * while allowing Settings > Devices / Sessions later.
   */
  revokeExistingSessions?: boolean;
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
  isCurrent: boolean;
  lastActiveAt: Date | null;
  expiresAt: Date;
  createdAt: Date | null;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Important:
 *
 * __Host- cookies must be Secure.
 * In production we use the stronger __Host- cookie.
 * In local development we use a normal cookie so localhost works reliably.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-sami_session'
    : 'sami_session';

const REMEMBERED_SESSION_DAYS = 30;

const NORMAL_SESSION_DAYS = 1;

const ACTIVITY_REFRESH_MINUTES = 5;

const SESSION_TOKEN_BYTES = 64;

const ALLOW_MULTIPLE_ACTIVE_SESSIONS =
  process.env.SAMI_ALLOW_MULTIPLE_ACTIVE_SESSIONS === 'true';

// ============================================================
// TOKEN HELPERS
// ============================================================

function generateSessionToken(): string {
  return crypto
    .randomBytes(SESSION_TOKEN_BYTES)
    .toString('base64url');
}

function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

function isValidSessionToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length >= 80 &&
    token.length <= 200
  );
}

// ============================================================
// REQUEST METADATA
// ============================================================

function cleanHeaderValue(value: string | null, maxLength: number): string {
  return (value || '').trim().slice(0, maxLength);
}

function getClientIp(request: Request): string {
  const cloudflareIp = cleanHeaderValue(
    request.headers.get('cf-connecting-ip'),
    255
  );

  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(',')[0]
      ?.trim()
      .slice(0, 255);

    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = cleanHeaderValue(
    request.headers.get('x-real-ip'),
    255
  );

  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function getUserAgent(request: Request): string {
  return cleanHeaderValue(
    request.headers.get('user-agent'),
    1000
  );
}

function detectDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }

  if (
    /mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)
  ) {
    return 'mobile';
  }

  return 'desktop';
}

function detectBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (ua.includes('edg/')) {
    return 'Edge';
  }

  if (ua.includes('opr/') || ua.includes('opera')) {
    return 'Opera';
  }

  if (ua.includes('chrome/') && !ua.includes('edg/')) {
    return 'Chrome';
  }

  if (ua.includes('firefox/')) {
    return 'Firefox';
  }

  if (
    ua.includes('safari/') &&
    !ua.includes('chrome/') &&
    !ua.includes('android')
  ) {
    return 'Safari';
  }

  if (ua.includes('msie') || ua.includes('trident/')) {
    return 'Internet Explorer';
  }

  return 'Unknown';
}

function detectOperatingSystem(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod')
  ) {
    return 'iOS';
  }

  if (ua.includes('windows')) {
    return 'Windows';
  }

  if (ua.includes('android')) {
    return 'Android';
  }

  if (
    ua.includes('mac os') ||
    ua.includes('macintosh')
  ) {
    return 'macOS';
  }

  if (ua.includes('cros')) {
    return 'ChromeOS';
  }

  if (ua.includes('linux')) {
    return 'Linux';
  }

  return 'Unknown';
}

export function getSessionRequestMetadata(
  request: Request
): SessionRequestMetadata {
  const userAgent = getUserAgent(request);

  return {
    ipAddress: getClientIp(request),
    userAgent,
    deviceType: detectDeviceType(userAgent),
    browser: detectBrowser(userAgent),
    operatingSystem: detectOperatingSystem(userAgent),
  };
}

// ============================================================
// SESSION EXPIRATION
// ============================================================

function getSessionLifetimeDays(rememberMe: boolean): number {
  return rememberMe
    ? REMEMBERED_SESSION_DAYS
    : NORMAL_SESSION_DAYS;
}

function calculateSessionExpiration(rememberMe: boolean): Date {
  const days = getSessionLifetimeDays(rememberMe);

  return new Date(
    Date.now() + days * 24 * 60 * 60 * 1000
  );
}

// ============================================================
// COOKIE OPTIONS
// ============================================================

function getSessionCookieOptions(
  expiresAt: Date,
  rememberMe: boolean
) {
  const isProduction =
    process.env.NODE_ENV === 'production';

  const options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    expires?: Date;
    maxAge?: number;
  } = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };

  /**
   * Remembered sessions are persistent browser cookies.
   *
   * Normal sessions do not receive maxAge/expires, so the browser
   * treats them like session cookies. The database expiry still remains
   * authoritative.
   */
  if (rememberMe) {
    options.expires = expiresAt;
    options.maxAge = Math.max(
      0,
      Math.floor(
        (expiresAt.getTime() - Date.now()) / 1000
      )
    );
  }

  return options;
}

function getClearCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };
}

// ============================================================
// COOKIE TOKEN READER
// ============================================================

async function getRawSessionTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(
    SESSION_COOKIE_NAME
  );

  const sessionToken = sessionCookie?.value;

  if (!isValidSessionToken(sessionToken)) {
    return null;
  }

  return sessionToken;
}

async function getSessionTokenHashFromCookie(): Promise<string | null> {
  const sessionToken = await getRawSessionTokenFromCookie();

  if (!sessionToken) {
    return null;
  }

  return hashToken(sessionToken);
}

// ============================================================
// CREATE SESSION
// ============================================================

export async function createSession(
  userId: string,
  request: Request,
  options: CreateSessionOptions = {}
): Promise<{
  sessionId: string;
  expiresAt: Date;
}> {
  if (!userId) {
    throw new Error(
      'User ID is required to create a session.'
    );
  }

  const rememberMe = options.rememberMe === true;

  const revokeExistingSessions =
    options.revokeExistingSessions ??
    !ALLOW_MULTIPLE_ACTIVE_SESSIONS;

  const sessionToken = generateSessionToken();

  const tokenHash = hashToken(sessionToken);

  const expiresAt = calculateSessionExpiration(rememberMe);

  const metadata = getSessionRequestMetadata(request);

  if (revokeExistingSessions) {
    await queryControl(
      `
        UPDATE sessions
        SET
          is_current = false,
          revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL
      `,
      [userId]
    );
  }

  const result = await queryControl(
    `
      INSERT INTO sessions (
        user_id,
        session_token_hash,
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
        $4,
        $5,
        $6,
        $7,
        true,
        NOW(),
        $8
      )
      RETURNING
        id,
        expires_at
    `,
    [
      userId,
      tokenHash,
      metadata.ipAddress,
      metadata.userAgent,
      metadata.deviceType,
      metadata.browser,
      metadata.operatingSystem,
      expiresAt,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create session.');
  }

  const sessionId = result.rows[0].id;

  const databaseExpiresAt = new Date(
    result.rows[0].expires_at
  );

  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions(
      databaseExpiresAt,
      rememberMe
    )
  );

  return {
    sessionId,
    expiresAt: databaseExpiresAt,
  };
}

// ============================================================
// GET CURRENT SESSION
// ============================================================

export async function getSession(): Promise<Session | null> {
  const tokenHash =
    await getSessionTokenHashFromCookie();

  if (!tokenHash) {
    await clearSessionCookie();
    return null;
  }

  const result = await queryControl(
    `
      SELECT
        s.id AS session_id,
        s.expires_at,
        s.last_active_at,
        s.ip_address,
        s.user_agent,
        s.device_type,
        s.browser,
        s.operating_system,

        u.id AS user_id,
        u.email,
        u.full_name,
        u.first_name,
        u.last_name,
        u.avatar_file_id,
        u.status

      FROM sessions s

      INNER JOIN users u
        ON u.id = s.user_id

      WHERE s.session_token_hash = $1
        AND s.is_current = true
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.status = 'active'
        AND u.deleted_at IS NULL

      LIMIT 1
    `,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    await clearSessionCookie();
    return null;
  }

  const row = result.rows[0];

  await refreshSessionActivityIfNeeded(
    row.session_id,
    row.last_active_at
  );

  return {
    sessionId: row.session_id,

    user: {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatarFileId: row.avatar_file_id || null,
    },

    device: {
      ipAddress: row.ip_address || 'unknown',
      userAgent: row.user_agent || '',
      deviceType: row.device_type || 'desktop',
      browser: row.browser || 'Unknown',
      operatingSystem:
        row.operating_system || 'Unknown',
      lastActiveAt: row.last_active_at
        ? new Date(row.last_active_at)
        : null,
    },

    expiresAt: new Date(row.expires_at),
  };
}

async function refreshSessionActivityIfNeeded(
  sessionId: string,
  lastActiveAtValue: unknown
): Promise<void> {
  const lastActiveAt = lastActiveAtValue
    ? new Date(String(lastActiveAtValue))
    : null;

  const shouldRefreshActivity =
    !lastActiveAt ||
    Date.now() - lastActiveAt.getTime() >
      ACTIVITY_REFRESH_MINUTES * 60 * 1000;

  if (!shouldRefreshActivity) {
    return;
  }

  try {
    await queryControl(
      `
        UPDATE sessions
        SET last_active_at = NOW()
        WHERE id = $1
          AND is_current = true
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `,
      [sessionId]
    );
  } catch (error) {
    console.error(
      '[Session] Failed to refresh session activity:',
      error
    );
  }
}

// ============================================================
// REQUIRE SESSION
// ============================================================

export async function requireSession(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }

  return session;
}

// ============================================================
// CURRENT USER HELPERS
// ============================================================

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();

  return session?.user ?? null;
}

export async function requireCurrentUser(): Promise<SessionUser> {
  const session = await requireSession();

  return session.user;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();

  return session?.user.id ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();

  return session !== null;
}

/**
 * Compatibility aliases for routes that already use these names.
 */
export const getAuthenticatedUser = getCurrentUser;

export const requireAuthenticatedUser = requireCurrentUser;

// ============================================================
// SESSION SETTINGS HELPERS
// ============================================================

export async function listActiveSessions(
  userId: string
): Promise<UserSessionListItem[]> {
  if (!userId) {
    return [];
  }

  const result = await queryControl(
    `
      SELECT
        id,
        ip_address,
        user_agent,
        device_type,
        browser,
        operating_system,
        is_current,
        last_active_at,
        expires_at,
        created_at
      FROM sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY last_active_at DESC NULLS LAST, created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row: any) => ({
    sessionId: row.id,
    ipAddress: row.ip_address || 'unknown',
    userAgent: row.user_agent || '',
    deviceType: row.device_type || 'desktop',
    browser: row.browser || 'Unknown',
    operatingSystem:
      row.operating_system || 'Unknown',
    isCurrent: row.is_current === true,
    lastActiveAt: row.last_active_at
      ? new Date(row.last_active_at)
      : null,
    expiresAt: new Date(row.expires_at),
    createdAt: row.created_at
      ? new Date(row.created_at)
      : null,
  }));
}

// ============================================================
// REVOKE ONE SESSION
// ============================================================

export async function revokeSession(
  sessionId: string,
  userId: string
): Promise<void> {
  if (!sessionId || !userId) {
    return;
  }

  await queryControl(
    `
      UPDATE sessions
      SET
        is_current = false,
        revoked_at = NOW()
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
    `,
    [sessionId, userId]
  );
}

// ============================================================
// LOGOUT CURRENT BROWSER SESSION
// ============================================================

export async function logout(): Promise<void> {
  const tokenHash =
    await getSessionTokenHashFromCookie();

  if (tokenHash) {
    await queryControl(
      `
        UPDATE sessions
        SET
          is_current = false,
          revoked_at = NOW()
        WHERE session_token_hash = $1
          AND revoked_at IS NULL
      `,
      [tokenHash]
    );
  }

  await clearSessionCookie();
}

// ============================================================
// REVOKE ALL OTHER SESSIONS
// ============================================================

export async function revokeAllOtherSessions(
  userId: string,
  currentSessionId: string
): Promise<void> {
  if (!userId || !currentSessionId) {
    return;
  }

  await queryControl(
    `
      UPDATE sessions
      SET
        is_current = false,
        revoked_at = NOW()
      WHERE user_id = $1
        AND id != $2
        AND revoked_at IS NULL
    `,
    [userId, currentSessionId]
  );
}

// ============================================================
// REVOKE ALL SESSIONS
// ============================================================

export async function revokeAllSessions(
  userId: string
): Promise<void> {
  if (!userId) {
    return;
  }

  await queryControl(
    `
      UPDATE sessions
      SET
        is_current = false,
        revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );

  await clearSessionCookie();
}

// ============================================================
// SESSION ROTATION
// ============================================================

export async function rotateSession(
  request: Request,
  options: CreateSessionOptions = {}
): Promise<{
  sessionId: string;
  expiresAt: Date;
} | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  await revokeSession(
    session.sessionId,
    session.user.id
  );

  return createSession(
    session.user.id,
    request,
    {
      ...options,

      /**
       * Rotation should replace the current session.
       * It should not automatically destroy every other device unless
       * the caller explicitly requests it.
       */
      revokeExistingSessions:
        options.revokeExistingSessions ?? false,
    }
  );
}

// ============================================================
// CLEAR COOKIE
// ============================================================

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    '',
    getClearCookieOptions()
  );
}