import { queryControl } from '@/lib/db/control';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * SaMi Session Management
 *
 * Authentication architecture:
 *
 * Register
 *   ↓
 * Email verification
 *   ↓
 * Account active
 *   ↓
 * Login
 *   ↓
 * Password verification
 *   ↓
 * Authentication challenges (future)
 *   ↓
 * createSession()
 *   ↓
 * __Host-sami_session cookie
 *   ↓
 * getSession()
 *   ↓
 * Protected pages / APIs
 *
 * Security model:
 *
 * - Raw passwords are never handled here.
 * - Raw session tokens are NEVER stored in the database.
 * - Database stores only SHA-256(token).
 * - Browser receives the raw token only as an HttpOnly cookie.
 * - Cookie is Secure in production.
 * - Cookie uses SameSite=Lax.
 * - Cookie uses __Host- prefix.
 * - Database expiration is authoritative.
 * - Logout revokes the database session and deletes cookie.
 * - Session validation checks user state.
 * - Session activity is refreshed periodically.
 *
 * IMPORTANT:
 *
 * This file is server-only.
 * Never import it into Client Components.
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

export interface Session {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
}

export interface CreateSessionOptions {
  /**
   * When true, the session is allowed to live for the full
   * persistent-session lifetime.
   *
   * When false, the session uses the shorter browser-session
   * lifetime.
   *
   * NOTE:
   * The server-side database expiration remains authoritative.
   */
  rememberMe?: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * __Host- cookie requirements:
 *
 * - Secure
 * - Path=/
 * - No Domain attribute
 *
 * This gives the cookie stronger browser scoping.
 */
export const SESSION_COOKIE_NAME = '__Host-sami_session';

/**
 * Persistent session lifetime.
 *
 * Used when "Keep me signed in" is enabled.
 */
const REMEMBERED_SESSION_DAYS = 30;

/**
 * Normal browser-session lifetime.
 *
 * This is intentionally shorter than a remembered session.
 *
 * IMPORTANT:
 * A browser session cookie disappears when the browser closes,
 * but the database session also expires after this period.
 */
const NORMAL_SESSION_DAYS = 1;

/**
 * Refresh last_active_at at most once every 5 minutes.
 *
 * This prevents every protected request from generating a
 * database UPDATE.
 */
const ACTIVITY_REFRESH_MINUTES = 5;

// ============================================================
// TOKEN HELPERS
// ============================================================

/**
 * Generate a cryptographically secure opaque session token.
 *
 * 64 random bytes = 512 bits of entropy.
 *
 * The token contains no:
 * - user ID
 * - email
 * - role
 * - timestamps
 * - business information
 */
function generateSessionToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Hash the raw session token before storing/querying it.
 *
 * If the database is compromised, the attacker does not
 * immediately receive usable browser session tokens.
 */
function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

// ============================================================
// REQUEST METADATA
// ============================================================

function getClientIp(request: Request): string {
  /**
   * x-forwarded-for may contain:
   *
   * client, proxy1, proxy2
   *
   * We use the first value because it normally represents the
   * originating client IP behind a trusted reverse proxy.
   *
   * IMPORTANT:
   * Only trust this header when your deployment infrastructure
   * controls the proxy chain.
   */
  const forwardedFor = request.headers.get(
    'x-forwarded-for'
  );

  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(',')[0]
      ?.trim();

    if (firstIp) {
      return firstIp.slice(0, 255);
    }
  }

  const realIp = request.headers.get(
    'x-real-ip'
  );

  if (realIp) {
    return realIp
      .trim()
      .slice(0, 255);
  }

  return 'unknown';
}

function getUserAgent(request: Request): string {
  return (
    request.headers.get('user-agent') || ''
  ).slice(0, 1000);
}

function detectDeviceType(
  userAgent: string
): string {
  const ua = userAgent.toLowerCase();

  if (
    /tablet|ipad|playbook|silk/i.test(ua)
  ) {
    return 'tablet';
  }

  if (
    /mobile|iphone|ipod|android.*mobile|windows phone/i.test(
      ua
    )
  ) {
    return 'mobile';
  }

  return 'desktop';
}

function detectBrowser(
  userAgent: string
): string {
  const ua = userAgent.toLowerCase();

  if (ua.includes('edg/')) {
    return 'Edge';
  }

  if (
    ua.includes('opr/') ||
    ua.includes('opera')
  ) {
    return 'Opera';
  }

  if (
    ua.includes('chrome/') &&
    !ua.includes('edg/')
  ) {
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

  if (
    ua.includes('msie') ||
    ua.includes('trident/')
  ) {
    return 'Internet Explorer';
  }

  return 'Unknown';
}

function detectOperatingSystem(
  userAgent: string
): string {
  const ua = userAgent.toLowerCase();

  /**
   * Check iOS before macOS because iPad user agents can
   * contain Macintosh in newer Safari versions.
   */
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

// ============================================================
// SESSION EXPIRATION
// ============================================================

function getSessionLifetimeDays(
  rememberMe: boolean
): number {
  return rememberMe
    ? REMEMBERED_SESSION_DAYS
    : NORMAL_SESSION_DAYS;
}

function calculateSessionExpiration(
  rememberMe: boolean
): Date {
  const days =
    getSessionLifetimeDays(rememberMe);

  return new Date(
    Date.now() +
      days * 24 * 60 * 60 * 1000
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
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    expires: Date;
    maxAge?: number;
  } = {
    /**
     * Prevent JavaScript from reading the authentication
     * cookie.
     */
    httpOnly: true,

    /**
     * HTTPS only in production.
     *
     * Local development can therefore continue using:
     *
     * http://localhost:3000
     */
    secure: isProduction,

    /**
     * Good protection against cross-site request attacks while
     * preserving normal browser navigation.
     */
    sameSite: 'lax',

    /**
     * Required for __Host- cookies.
     */
    path: '/',

    /**
     * Match server-side expiration.
     */
    expires: expiresAt,
  };

  /**
   * Remembered sessions receive an explicit persistent
   * browser lifetime.
   *
   * Normal sessions intentionally omit maxAge so the browser
   * treats them as session cookies.
   */
  if (rememberMe) {
    options.maxAge = Math.max(
      0,
      Math.floor(
        (expiresAt.getTime() -
          Date.now()) /
          1000
      )
    );
  }

  return options;
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

  const rememberMe =
    options.rememberMe === true;

  /**
   * Generate the raw token.
   *
   * It exists only in server memory and the outgoing cookie.
   */
  const sessionToken =
    generateSessionToken();

  /**
   * Store only the hash in PostgreSQL.
   */
  const tokenHash =
    hashToken(sessionToken);

  const expiresAt =
    calculateSessionExpiration(
      rememberMe
    );

  const userAgent =
    getUserAgent(request);

  const ipAddress =
    getClientIp(request);

  const deviceType =
    detectDeviceType(userAgent);

  const browser =
    detectBrowser(userAgent);

  const operatingSystem =
    detectOperatingSystem(userAgent);

  // ==========================================================
  // REVOKE EXISTING CURRENT SESSION
  // ==========================================================

  /**
   * SaMi currently uses one current session per user.
   *
   * This is intentionally preserved from your existing
   * architecture so we do not unexpectedly change existing
   * account/security behavior.
   *
   * Later, SaMi can support multiple trusted devices by
   * removing this global revocation and adding session/device
   * management.
   */
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

  // ==========================================================
  // CREATE DATABASE SESSION
  // ==========================================================

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
      ipAddress,
      userAgent,
      deviceType,
      browser,
      operatingSystem,
      expiresAt,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error(
      'Failed to create session.'
    );
  }

  const sessionId =
    result.rows[0].id;

  const databaseExpiresAt =
    new Date(result.rows[0].expires_at);

  // ==========================================================
  // SET AUTHENTICATION COOKIE
  // ==========================================================

  /**
   * The raw token is placed directly into the HttpOnly cookie.
   *
   * It is NEVER returned to the client as JSON.
   */
  const cookieStore =
    await cookies();

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
  const cookieStore =
    await cookies();

  const sessionCookie =
    cookieStore.get(
      SESSION_COOKIE_NAME
    );

  const sessionToken =
    sessionCookie?.value;

  if (!sessionToken) {
    return null;
  }

  /**
   * Never query PostgreSQL using the raw browser token.
   */
  const tokenHash =
    hashToken(sessionToken);

  const result = await queryControl(
    `
      SELECT
        s.id AS session_id,
        s.expires_at,
        s.last_active_at,

        u.id,
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

  // ==========================================================
  // INVALID SESSION
  // ==========================================================

  /**
   * Covers:
   *
   * - invalid token
   * - expired session
   * - revoked session
   * - non-current session
   * - inactive account
   * - deleted account
   */
  if (result.rows.length === 0) {
    await clearSessionCookie();

    return null;
  }

  const row =
    result.rows[0];

  // ==========================================================
  // REFRESH ACTIVITY
  // ==========================================================

  const lastActiveAt =
    row.last_active_at
      ? new Date(
          row.last_active_at
        )
      : null;

  const shouldRefreshActivity =
    !lastActiveAt ||
    Date.now() -
      lastActiveAt.getTime() >
      ACTIVITY_REFRESH_MINUTES *
        60 *
        1000;

  if (shouldRefreshActivity) {
    await queryControl(
      `
        UPDATE sessions
        SET last_active_at = NOW()
        WHERE id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
      `,
      [row.session_id]
    );
  }

  return {
    sessionId:
      row.session_id,

    user: {
      id: row.id,

      email:
        row.email,

      fullName:
        row.full_name || '',

      firstName:
        row.first_name || '',

      lastName:
        row.last_name || '',

      avatarFileId:
        row.avatar_file_id || null,
    },

    expiresAt:
      new Date(row.expires_at),
  };
}

// ============================================================
// REQUIRE SESSION
// ============================================================

/**
 * Use this when authentication is mandatory.
 *
 * Example:
 *
 * const session = await requireSession();
 *
 * const userId = session.user.id;
 */
export async function requireSession(): Promise<Session> {
  const session =
    await getSession();

  if (!session) {
    throw new Error(
      'UNAUTHENTICATED'
    );
  }

  return session;
}

// ============================================================
// GET CURRENT USER
// ============================================================

/**
 * Returns the authenticated user or null.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session =
    await getSession();

  return session?.user ?? null;
}

/**
 * Returns the authenticated user or throws.
 */
export async function requireCurrentUser(): Promise<SessionUser> {
  const session =
    await requireSession();

  return session.user;
}

// ============================================================
// GET CURRENT USER ID
// ============================================================

export async function getCurrentUserId(): Promise<string | null> {
  const session =
    await getSession();

  return session?.user.id ?? null;
}

// ============================================================
// IS AUTHENTICATED
// ============================================================

export async function isAuthenticated(): Promise<boolean> {
  const session =
    await getSession();

  return session !== null;
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
    [
      sessionId,
      userId,
    ]
  );
}

// ============================================================
// LOGOUT
// ============================================================

/**
 * Logout the current browser session.
 *
 * Steps:
 *
 * 1. Read HttpOnly cookie server-side.
 * 2. Hash token.
 * 3. Revoke matching database session.
 * 4. Delete browser cookie.
 */
export async function logout(): Promise<void> {
  const cookieStore =
    await cookies();

  const sessionCookie =
    cookieStore.get(
      SESSION_COOKIE_NAME
    );

  const sessionToken =
    sessionCookie?.value;

  if (sessionToken) {
    const tokenHash =
      hashToken(sessionToken);

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
        is_current = false,
        revoked_at = NOW()
      WHERE user_id = $1
        AND id != $2
        AND revoked_at IS NULL
    `,
    [
      userId,
      currentSessionId,
    ]
  );
}

// ============================================================
// REVOKE ALL SESSIONS
// ============================================================

/**
 * Useful after:
 *
 * - password change
 * - email change
 * - account compromise
 * - security incident
 * - administrator forced logout
 * - MFA reset
 * - identity recovery
 */
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

  /**
   * Also remove the current browser cookie if this function
   * is being called from the current authenticated request.
   */
  await clearSessionCookie();
}

// ============================================================
// SESSION ROTATION
// ============================================================

/**
 * Rotate the current authenticated session.
 *
 * Useful after sensitive authentication events:
 *
 * - password change
 * - email change
 * - MFA activation
 * - privilege elevation
 * - account recovery
 */
export async function rotateSession(
  request: Request,
  options: CreateSessionOptions = {}
): Promise<{
  sessionId: string;
  expiresAt: Date;
} | null> {
  const session =
    await getSession();

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
    options
  );
}

// ============================================================
// CLEAR COOKIE
// ============================================================

export async function clearSessionCookie(): Promise<void> {
  const cookieStore =
    await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    '',
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        'production',

      sameSite: 'lax',

      path: '/',

      maxAge: 0,

      expires: new Date(0),
    }
  );
}