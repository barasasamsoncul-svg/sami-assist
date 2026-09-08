import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

export type CreateLoginChallengeInput = {
  userId: string;
  email: string;
  rememberMe: boolean;
};

export type CreateLoginChallengeResult = {
  challengeToken: string;
  expiresAt: Date;
};

export type ValidLoginChallenge = {
  id: string;
  user_id: string;
  expires_at: Date | string;
  metadata: unknown;
  email: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const LOGIN_CHALLENGE_BYTES =
  32;

const DEFAULT_CHALLENGE_MINUTES =
  10;

const MAX_CHALLENGE_MINUTES =
  30;

const MIN_CHALLENGE_TOKEN_LENGTH =
  40;

const MAX_CHALLENGE_TOKEN_LENGTH =
  100;

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function requireUserId(
  value: string
): string {
  const userId =
    value.trim();

  if (!userId) {
    throw new Error(
      'User ID is required.'
    );
  }

  return userId;
}

/* ============================================================
   CHALLENGE EXPIRY
   ============================================================ */

function getChallengeLifetimeMinutes():
  number {
  const raw =
    process.env
      .AUTH_LOGIN_CHALLENGE_MINUTES;

  if (!raw) {
    return DEFAULT_CHALLENGE_MINUTES;
  }

  const minutes =
    Number(raw);

  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes >
      MAX_CHALLENGE_MINUTES
  ) {
    throw new Error(
      'AUTH_LOGIN_CHALLENGE_MINUTES must be between 1 and 30.'
    );
  }

  return minutes;
}

/* ============================================================
   TOKEN
   ============================================================ */

function createChallengeToken():
  string {
  return crypto
    .randomBytes(
      LOGIN_CHALLENGE_BYTES
    )
    .toString(
      'base64url'
    );
}

function normalizeChallengeToken(
  value: string
): string {
  return value.trim();
}

function isValidChallengeTokenFormat(
  value: string
): boolean {
  return (
    value.length >=
      MIN_CHALLENGE_TOKEN_LENGTH &&
    value.length <=
      MAX_CHALLENGE_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(
      value
    )
  );
}

function hashChallengeToken(
  token: string
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

/* ============================================================
   CREATE LOGIN CHALLENGE

   Password authentication has already succeeded before this
   helper is called.

   The raw challenge token is returned to the browser.

   Only SHA-256(token) is stored in the database.
   ============================================================ */

export async function createLoginChallenge(
  input:
    CreateLoginChallengeInput
): Promise<CreateLoginChallengeResult> {
  const userId =
    requireUserId(
      input.userId
    );

  const email =
    normalizeEmail(
      input.email
    );

  if (!email) {
    throw new Error(
      'Email is required for login challenge.'
    );
  }

  const challengeToken =
    createChallengeToken();

  const challengeTokenHash =
    hashChallengeToken(
      challengeToken
    );

  const lifetimeMinutes =
    getChallengeLifetimeMinutes();

  const expiresAt =
    new Date(
      Date.now() +
        lifetimeMinutes *
          60 *
          1000
    );

  /*
   * Expire stale pending challenges first.
   */
  await queryControl(
    `
      UPDATE login_challenges

      SET
        status = 'expired'

      WHERE user_id = $1
        AND type = 'two_factor'
        AND status = 'pending'
        AND used_at IS NULL
        AND expires_at <= NOW()
    `,
    [
      userId,
    ]
  );

  /*
   * A new successful password authentication replaces older
   * unfinished 2FA challenges for this user.
   */
  await queryControl(
    `
      UPDATE login_challenges

      SET
        status = 'revoked'

      WHERE user_id = $1
        AND type = 'two_factor'
        AND status = 'pending'
        AND used_at IS NULL
        AND expires_at > NOW()
    `,
    [
      userId,
    ]
  );

  const result =
    await queryControl(
      `
        INSERT INTO login_challenges (
          user_id,
          challenge_token_hash,
          type,
          status,
          expires_at,
          metadata
        )

        VALUES (
          $1,
          $2,
          'two_factor',
          'pending',
          $3,
          $4
        )

        RETURNING
          id,
          expires_at
      `,
      [
        userId,

        challengeTokenHash,

        expiresAt,

        JSON.stringify({
          email,

          rememberMe:
            input.rememberMe ===
            true,
        }),
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      'Login challenge could not be created.'
    );
  }

  const databaseExpiresAt =
    new Date(
      result.rows[0]
        .expires_at
    );

  if (
    Number.isNaN(
      databaseExpiresAt.getTime()
    )
  ) {
    throw new Error(
      'Login challenge has an invalid expiration time.'
    );
  }

  return {
    challengeToken,

    expiresAt:
      databaseExpiresAt,
  };
}

/* ============================================================
   GET VALID LOGIN CHALLENGE
   ============================================================ */

export async function getValidLoginChallenge(
  input: {
    email: string;
    challengeToken: string;
  }
): Promise<ValidLoginChallenge | null> {
  const email =
    normalizeEmail(
      input.email
    );

  const challengeToken =
    normalizeChallengeToken(
      input.challengeToken
    );

  if (
    !email ||
    !isValidChallengeTokenFormat(
      challengeToken
    )
  ) {
    return null;
  }

  const challengeTokenHash =
    hashChallengeToken(
      challengeToken
    );

  const result =
    await queryControl(
      `
        SELECT
          lc.id,
          lc.user_id,
          lc.expires_at,
          lc.metadata,

          u.email

        FROM login_challenges lc

        INNER JOIN users u
          ON u.id = lc.user_id

        WHERE lc.challenge_token_hash = $1

          AND LOWER(u.email) = $2

          AND lc.type = 'two_factor'

          AND lc.status = 'pending'

          AND lc.used_at IS NULL

          AND lc.expires_at > NOW()

          AND u.status = 'active'

          AND u.two_factor_enabled = TRUE

          AND u.deleted_at IS NULL

        LIMIT 1
      `,
      [
        challengeTokenHash,
        email,
      ]
    );

  return (
    result.rows[0] ||
    null
  ) as
    | ValidLoginChallenge
    | null;
}

/* ============================================================
   MARK LOGIN CHALLENGE USED

   IMPORTANT:

   This is the one-time-consumption boundary.

   The UPDATE itself verifies that the challenge is still:

   - two_factor
   - pending
   - unused
   - unexpired

   Two concurrent requests therefore cannot both consume the
   same challenge successfully.
   ============================================================ */

export async function markLoginChallengeUsed(
  challengeId: string
): Promise<void> {
  const normalizedChallengeId =
    challengeId.trim();

  if (
    !normalizedChallengeId
  ) {
    throw new Error(
      'LOGIN_CHALLENGE_UNAVAILABLE'
    );
  }

  /*
   * First mark this specific challenge expired when necessary.
   *
   * This keeps its stored status accurate.
   */
  await queryControl(
    `
      UPDATE login_challenges

      SET
        status = 'expired'

      WHERE id = $1
        AND type = 'two_factor'
        AND status = 'pending'
        AND used_at IS NULL
        AND expires_at <= NOW()
    `,
    [
      normalizedChallengeId,
    ]
  );

  /*
   * Atomic one-time consumption.
   */
  const result =
    await queryControl(
      `
        UPDATE login_challenges

        SET
          status = 'used',
          used_at = NOW()

        WHERE id = $1
          AND type = 'two_factor'
          AND status = 'pending'
          AND used_at IS NULL
          AND expires_at > NOW()

        RETURNING id
      `,
      [
        normalizedChallengeId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    /*
     * This can mean:
     *
     * - expired
     * - already used
     * - revoked
     * - invalid challenge ID
     * - concurrent request already consumed it
     *
     * Do not reveal which one.
     */
    throw new Error(
      'LOGIN_CHALLENGE_UNAVAILABLE'
    );
  }
}