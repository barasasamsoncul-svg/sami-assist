import crypto from 'crypto';

import type {
  NextRequest,
  NextResponse,
} from 'next/server';

import { queryControl } from '@/lib/db/control';

import {
  getAdminRequestIp,
  getAdminRequestUserAgent,
} from '@/lib/auth/admin-session';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_LOGIN_CHALLENGE_TOKEN_BYTES =
  64;

const ADMIN_LOGIN_CHALLENGE_TOKEN_MAX_LENGTH =
  512;

const ADMIN_LOGIN_CHALLENGE_EXPIRES_IN_MINUTES =
  10;

const ADMIN_LOGIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS =
  ADMIN_LOGIN_CHALLENGE_EXPIRES_IN_MINUTES *
  60;

/* ============================================================
   COOKIE
   ============================================================ */

export const ADMIN_LOGIN_CHALLENGE_COOKIE_NAME =
  process.env.NODE_ENV ===
  'production'
    ? '__Host-sami_admin_login_challenge'
    : 'sami_admin_login_challenge';

/* ============================================================
   TYPES
   ============================================================ */

export type AdminLoginChallenge = {
  id: string;

  adminId: string;

  tokenHash: string;

  rememberMe: boolean;

  ipAddress:
    string | null;

  userAgent:
    string | null;

  expiresAt: Date;

  usedAt:
    Date | null;

  createdAt: Date;
};

export type CreateAdminLoginChallengeInput = {
  adminId: string;

  request:
    NextRequest;

  rememberMe?:
    boolean;
};

export type CreateAdminLoginChallengeResult = {
  challengeToken:
    string;

  challenge:
    AdminLoginChallenge;
};

type AdminLoginChallengeRow = {
  id: string;

  admin_id: string;

  token_hash: string;

  remember_me: boolean;

  ip_address:
    string | null;

  user_agent:
    string | null;

  expires_at:
    Date | string;

  used_at:
    Date | string | null;

  created_at:
    Date | string;
};

/* ============================================================
   TOKEN
   ============================================================ */

function createRawChallengeToken():
  string {
  return crypto
    .randomBytes(
      ADMIN_LOGIN_CHALLENGE_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

function hashChallengeToken(
  token:
    string
): string {
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

function normalizeChallengeToken(
  token:
    string
): string {
  return token.trim();
}

/* ============================================================
   MAPPING
   ============================================================ */

function mapAdminLoginChallengeRow(
  row:
    AdminLoginChallengeRow
): AdminLoginChallenge {
  return {
    id:
      row.id,

    adminId:
      row.admin_id,

    tokenHash:
      row.token_hash,

    rememberMe:
      row.remember_me,

    ipAddress:
      row.ip_address,

    userAgent:
      row.user_agent,

    expiresAt:
      new Date(
        row.expires_at
      ),

    usedAt:
      row.used_at
        ? new Date(
            row.used_at
          )
        : null,

    createdAt:
      new Date(
        row.created_at
      ),
  };
}

/* ============================================================
   FORMAT VALIDATION
   ============================================================ */

export function isValidAdminLoginChallengeTokenFormat(
  token:
    unknown
): token is string {
  if (
    typeof token !==
    'string'
  ) {
    return false;
  }

  const normalized =
    normalizeChallengeToken(
      token
    );

  return (
    normalized.length >
      0 &&
    normalized.length <=
      ADMIN_LOGIN_CHALLENGE_TOKEN_MAX_LENGTH
  );
}

/* ============================================================
   COOKIE HELPERS
   ============================================================ */

export function setAdminLoginChallengeCookie(
  response:
    NextResponse,
  challengeToken:
    string
): void {
  response.cookies.set(
    ADMIN_LOGIN_CHALLENGE_COOKIE_NAME,
    challengeToken,
    {
      httpOnly:
        true,

      secure:
        process.env
          .NODE_ENV ===
        'production',

      sameSite:
        'strict',

      path:
        '/',

      maxAge:
        ADMIN_LOGIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
    }
  );
}

export function clearAdminLoginChallengeCookie(
  response:
    NextResponse
): void {
  response.cookies.set(
    ADMIN_LOGIN_CHALLENGE_COOKIE_NAME,
    '',
    {
      httpOnly:
        true,

      secure:
        process.env
          .NODE_ENV ===
        'production',

      sameSite:
        'strict',

      path:
        '/',

      maxAge:
        0,

      expires:
        new Date(
          0
        ),
    }
  );
}

export function getAdminLoginChallengeTokenFromRequest(
  request:
    NextRequest
): string | null {
  const token =
    request.cookies.get(
      ADMIN_LOGIN_CHALLENGE_COOKIE_NAME
    )?.value;

  if (
    !isValidAdminLoginChallengeTokenFormat(
      token
    )
  ) {
    return null;
  }

  return normalizeChallengeToken(
    token
  );
}

/* ============================================================
   CREATE
   ============================================================ */

export async function createAdminLoginChallenge(
  input:
    CreateAdminLoginChallengeInput
): Promise<CreateAdminLoginChallengeResult> {
  const challengeToken =
    createRawChallengeToken();

  const tokenHash =
    hashChallengeToken(
      challengeToken
    );

  const ipAddress =
    getAdminRequestIp(
      input.request
    );

  const userAgent =
    getAdminRequestUserAgent(
      input.request
    );

  const rememberMe =
    Boolean(
      input.rememberMe
    );

  await invalidateAdminLoginChallenges(
    input.adminId
  );

  const result =
    await queryControl(
      `
        INSERT INTO platform_admin_login_challenges (
          admin_id,
          token_hash,
          remember_me,
          ip_address,
          user_agent,
          expires_at
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          NOW() +
            (
              $6::text ||
              ' minutes'
            )::interval
        )

        RETURNING
          id,
          admin_id,
          token_hash,
          remember_me,
          ip_address,
          user_agent,
          expires_at,
          used_at,
          created_at
      `,
      [
        input.adminId,

        tokenHash,

        rememberMe,

        ipAddress,

        userAgent,

        ADMIN_LOGIN_CHALLENGE_EXPIRES_IN_MINUTES,
      ]
    );

  const row =
    result.rows[0] as
      AdminLoginChallengeRow;

  return {
    challengeToken,

    challenge:
      mapAdminLoginChallengeRow(
        row
      ),
  };
}

/* ============================================================
   GET VALID
   ============================================================ */

export async function getValidAdminLoginChallenge(
  challengeToken:
    string
): Promise<
  AdminLoginChallenge | null
> {
  if (
    !isValidAdminLoginChallengeTokenFormat(
      challengeToken
    )
  ) {
    return null;
  }

  const tokenHash =
    hashChallengeToken(
      normalizeChallengeToken(
        challengeToken
      )
    );

  const result =
    await queryControl(
      `
        SELECT
          id,
          admin_id,
          token_hash,
          remember_me,
          ip_address,
          user_agent,
          expires_at,
          used_at,
          created_at

        FROM platform_admin_login_challenges

        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()

        LIMIT 1
      `,
      [
        tokenHash,
      ]
    );

  const row =
    result.rows[0] as
      | AdminLoginChallengeRow
      | undefined;

  return row
    ? mapAdminLoginChallengeRow(
        row
      )
    : null;
}

/* ============================================================
   REQUEST MATCH
   ============================================================ */

export function adminLoginChallengeMatchesRequest(
  challenge:
    AdminLoginChallenge,
  request:
    NextRequest
): boolean {
  const currentUserAgent =
    getAdminRequestUserAgent(
      request
    );

  if (
    !challenge.userAgent ||
    !currentUserAgent
  ) {
    return true;
  }

  return (
    challenge.userAgent ===
    currentUserAgent
  );
}

/* ============================================================
   CONSUME
   ============================================================ */

export async function consumeAdminLoginChallenge(
  challengeId:
    string
): Promise<boolean> {
  const result =
    await queryControl(
      `
        UPDATE platform_admin_login_challenges

        SET
          used_at =
            NOW()

        WHERE id = $1
          AND used_at IS NULL
          AND expires_at > NOW()

        RETURNING id
      `,
      [
        challengeId,
      ]
    );

  return Boolean(
    result.rows[0]
  );
}

export async function consumeAdminLoginChallengeToken(
  challengeToken:
    string
): Promise<
  AdminLoginChallenge | null
> {
  const challenge =
    await getValidAdminLoginChallenge(
      challengeToken
    );

  if (
    !challenge
  ) {
    return null;
  }

  const consumed =
    await consumeAdminLoginChallenge(
      challenge.id
    );

  if (
    !consumed
  ) {
    return null;
  }

  return challenge;
}

/* ============================================================
   INVALIDATE
   ============================================================ */

export async function invalidateAdminLoginChallenges(
  adminId:
    string
): Promise<void> {
  await queryControl(
    `
      UPDATE platform_admin_login_challenges

      SET
        used_at =
          NOW()

      WHERE admin_id = $1
        AND used_at IS NULL
    `,
    [
      adminId,
    ]
  );
}

/* ============================================================
   DELETE
   ============================================================ */

export async function deleteAdminLoginChallenge(
  challengeToken:
    string
): Promise<void> {
  if (
    !isValidAdminLoginChallengeTokenFormat(
      challengeToken
    )
  ) {
    return;
  }

  const tokenHash =
    hashChallengeToken(
      normalizeChallengeToken(
        challengeToken
      )
    );

  await queryControl(
    `
      DELETE FROM platform_admin_login_challenges
      WHERE token_hash = $1
    `,
    [
      tokenHash,
    ]
  );
}

/* ============================================================
   CLEANUP
   ============================================================ */

export async function removeExpiredAdminLoginChallenges():
  Promise<number> {
  const result =
    await queryControl(
      `
        WITH deleted AS (
          DELETE FROM platform_admin_login_challenges

          WHERE expires_at <= NOW()
             OR used_at IS NOT NULL

          RETURNING id
        )

        SELECT
          COUNT(*)::text AS deleted_count

        FROM deleted
      `
    );

  return Number(
    result.rows[0]
      ?.deleted_count ??
      0
  );
}