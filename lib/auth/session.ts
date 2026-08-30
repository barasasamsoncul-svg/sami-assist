
import { queryControl } from '@/lib/db/control';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * SaMi Session Management
 *
 * Flow:
 *
 * Register
 *   ↓
 * Email verification code
 *   ↓
 * Account becomes active
 *   ↓
 * Login
 *   ↓
 * createSession()
 *   ↓
 * __Host-sami_session cookie
 *   ↓
 * getSession()
 *   ↓
 * Dashboard / Settings / Protected APIs
 *
 * Security model:
 * - Raw session token is NEVER stored in the database.
 * - Database stores only SHA-256(token).
 * - Browser receives the raw token only as an HttpOnly cookie.
 * - Cookie is Secure in production.
 * - Cookie uses SameSite=Lax.
 * - Session expires server-side.
 * - Logout revokes the database session AND deletes the cookie.
 *
 * IMPORTANT:
 * This file is server-only.
 * Do not import it into Client Components.
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

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Use a __Host- cookie when possible.
 *
 * Requirements for __Host-:
 * - Secure
 * - Path=/
 * - No Domain attribute
 *
 * This gives the browser stronger cookie scoping.
 */
export const SESSION_COOKIE_NAME = '__Host-sami_session';

/**
 * Default session lifetime.
 *
 * 30 days is appropriate for a normal "keep me signed in"
 * SaaS session.
 *
 * The database expiration remains authoritative.
 */
const SESSION_DAYS = 30;

/**
 * Refresh the database activity timestamp at most once every
 * 5 minutes rather than writing to Postgres on every request.
 */
const ACTIVITY_REFRESH_MINUTES = 5;

// ============================================================
// TOKEN HELPERS
// ============================================================

/**
 * Generate a cryptographically secure opaque session token.
 *
 * 64 random bytes = 512 bits of randomness.
 *
 * The token contains no:
 * - user ID
 * - email
 * - role
 * - account information
 * - timestamps
 */
function generateSessionToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Hash the raw session token before storing/querying it.
 *
 * Database compromise therefore does not immediately reveal
 * usable browser session tokens.
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
   * x-forwarded-for can contain:
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
  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();

    if (firstIp) {
      return firstIp.slice(0, 255);
    }
  }

  const realIp = request.headers.get('x-real-ip');

  if (realIp) {
    return realIp.trim().slice(0, 255);
  }

  return 'unknown';
}

function getUserAgent(request: Request): string {
  return (request.headers.get('user-agent') || '')
    .slice(0, 1000);
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

  if (ua.includes('windows')) {
    return 'Windows';
  }

  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return 'iOS';
  }

  if (ua.includes('android')) {
    return 'Android';
  }

  if (ua.includes('mac os') || ua.includes('macintosh')) {
    return 'macOS';
  }

  if (ua.includes('linux')) {
    return 'Linux';
  }

  if (ua.includes('cros')) {
    return 'ChromeOS';
  }

  return 'Unknown';
}

// ============================================================
// COOKIE OPTIONS
// ============================================================

function getSessionCookieOptions(expiresAt: Date) {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    /**
     * Prevent JavaScript from reading the authentication cookie.
     */
    httpOnly: true,

    /**
     * HTTPS only in production.
     *
     * Keeping this false locally allows:
     * http://localhost:3000
     */
    secure: isProduction,

    /**
     * Lax provides a good balance between security and normal
     * browser navigation.
     */
    sameSite: 'lax' as const,

    /**
     * Entire SaMi application.
     */
    path: '/',

    /**
     * Match server-side session expiry.
     */
    expires: expiresAt,

    /**
     * Browser-side expiration in seconds.
     */
    maxAge: Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    ),

    /**
     * No Domain attribute.
     *
     * Required for __Host- cookies.
     */
  };
}

// ============================================================
// CREATE SESSION
// ============================================================

export async function createSession(
  userId: string,
  request: Request
): Promise<{
  sessionToken: string;
  sessionId: string;
  expiresAt: Date;
}> {
  if (!userId) {
    throw new Error('User ID is required to create a session.');
  }

  const sessionToken = generateSessionToken();
  const tokenHash = hashToken(sessionToken);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  const userAgent = getUserAgent(request);
  const ipAddress = getClientIp(request);
  const deviceType = detectDeviceType(userAgent);
  const browser = detectBrowser(userAgent);
  const operatingSystem = detectOperatingSystem(userAgent);

  /**
   * SaMi currently uses one current session per user.
   *
   * If you later want true multi-device sessions, remove this
   * revocation step and allow multiple current sessions.
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
      RETURNING id, expires_at
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
    throw new Error('Failed to create session.');
  }

  const sessionId = result.rows[0].id;

  /**
   * Set the authentication cookie.
   *
   * This MUST execute inside a Route Handler or Server Action.
   */
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions(expiresAt)
  );

  return {
    sessionToken,
    sessionId,
    expiresAt,
  };
}

// ============================================================
// GET CURRENT SESSION
// ============================================================

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(
    SESSION_COOKIE_NAME
  );

  const sessionToken = sessionCookie?.value;

  if (!sessionToken) {
    return null;
  }

  /**
   * Never query the database using the raw browser token.
   */
  const tokenHash = hashToken(sessionToken);

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

  /**
   * Invalid, expired, revoked, or deleted-user session.
   */
  if (result.rows.length === 0) {
    /**
     * Clean up the browser cookie as well.
     */
    await clearSessionCookie();

    return null;
  }

  const row = result.rows[0];

  /**
   * Refresh activity only occasionally.
   *
   * This prevents every page/API request from causing a
   * database UPDATE.
   */
  const lastActiveAt = row.last_active_at
    ? new Date(row.last_active_at)
    : null;

  const shouldRefreshActivity =
    !lastActiveAt ||
    Date.now() - lastActiveAt.getTime() >
      ACTIVITY_REFRESH_MINUTES * 60 * 1000;

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
    sessionId: row.session_id,

    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatarFileId: row.avatar_file_id || null,
    },

    expiresAt: new Date(row.expires_at),
  };
}

// ============================================================
// REQUIRE SESSION
// ============================================================

/**
 * Use this when a protected server operation MUST have a
 * logged-in user.
 *
 * Example:
 *
 * const session = await requireSession();
 *
 * const userId = session.user.id;
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();

  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }

  return session;
}

// ============================================================
// GET SESSION USER
// ============================================================

/**
 * Convenient helper for protected pages/API routes that only
 * need the authenticated user.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();

  return session?.user ?? null;
}

/**
 * Same as getCurrentUser(), but throws if not authenticated.
 */
export async function requireCurrentUser(): Promise<SessionUser> {
  const session = await requireSession();

  return session.user;
}

// ============================================================
// LOGOUT / REVOKE CURRENT SESSION
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

/**
 * Logout the currently authenticated browser session.
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get(
    SESSION_COOKIE_NAME
  );

  const sessionToken = sessionCookie?.value;

  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);

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

/**
 * Useful for:
 *
 * - password changes
 * - account security events
 * - compromised account
 * - admin forced logout
 * - email change
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
}

// ============================================================
// SESSION ROTATION
// ============================================================

/**
 * Rotate the current session.
 *
 * Useful after sensitive authentication events.
 *
 * Example:
 *
 * - password change
 * - email change
 * - MFA activation
 * - privilege elevation
 *
 * The old session is revoked and a fresh session is created.
 */
export async function rotateSession(
  request: Request
): Promise<{
  sessionToken: string;
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
    request
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
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    }
  );
}

// ============================================================
// SESSION VALIDATION
// ============================================================

/**
 * Returns true when a session is still valid.
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();

  return session !== null;
}

/**
 * Returns the current authenticated user's ID.
 *
 * Useful in API handlers where you only need the ID.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();

  return session?.user.id ?? null;
}