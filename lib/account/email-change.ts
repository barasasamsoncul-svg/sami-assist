import 'server-only';

import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getUserAccount,
  type UserAccount,
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH = 254;

const EMAIL_CHANGE_CODE_LENGTH = 6;

const EMAIL_CHANGE_EXPIRY_MINUTES = 15;

const EMAIL_CHANGE_COOLDOWN_SECONDS = 60;

/* ============================================================
   TYPES
   ============================================================ */

export type EmailChangeRequestResult = {
  requestId: string;
  email: string;

  /**
   * Raw verification code.
   *
   * IMPORTANT:
   * - returned only to the server caller
   * - must only be sent by email
   * - must never be logged
   * - must never be returned to the browser
   */
  code: string;

  expiresAt: string;
};

type CurrentUserRow = {
  id: string;
  email: string;
};

type OpenRequestRow = {
  id: string;
  new_email: string;
  created_at:
    | Date
    | string;
  expires_at:
    | Date
    | string;
};

type InsertedRequestRow = {
  id: string;
  new_email: string;
  expires_at:
    | Date
    | string;
};

type ExistingRequestRow = {
  id: string;
  new_email: string;
  expires_at:
    | Date
    | string;
  used_at:
    | Date
    | string
    | null;
  deleted_at:
    | Date
    | string
    | null;
};

/* ============================================================
   ERROR CODES
   ============================================================ */

export type EmailChangeErrorCode =
  | 'INVALID_NEW_EMAIL'
  | 'EMAIL_UNCHANGED'
  | 'EMAIL_UNAVAILABLE'
  | 'EMAIL_CHANGE_COOLDOWN'
  | 'INVALID_EMAIL_CHANGE_CODE'
  | 'EMAIL_CHANGE_EXPIRED'
  | 'EMAIL_CHANGE_FAILED';

/* ============================================================
   ERRORS
   ============================================================ */

export class EmailChangeError
  extends Error {
  readonly code:
    EmailChangeErrorCode;

  readonly retryAfterSeconds:
    number | null;

  constructor(
    code: EmailChangeErrorCode,
    message: string,
    retryAfterSeconds:
      number | null = null
  ) {
    super(message);

    this.name =
      'EmailChangeError';

    this.code =
      code;

    this.retryAfterSeconds =
      retryAfterSeconds;
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

/* ------------------------------------------------------------
   EMAIL VALIDATION
   ------------------------------------------------------------ */

function isValidEmail(
  value: string
): boolean {
  if (
    !value ||
    value.length >
      MAX_EMAIL_LENGTH
  ) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

/* ------------------------------------------------------------
   USER ID
   ------------------------------------------------------------ */

function assertUserId(
  userId: string
): string {
  const normalized =
    userId.trim();

  if (!normalized) {
    throw new UserAccountNotFoundError();
  }

  return normalized;
}

/* ------------------------------------------------------------
   CODE GENERATION
   ------------------------------------------------------------ */

function generateVerificationCode(): string {
  /*
   * crypto.randomInt upper bound is exclusive.
   *
   * Produces:
   * 100000 → 999999
   */

  return crypto
    .randomInt(
      100000,
      1000000
    )
    .toString();
}

/* ------------------------------------------------------------
   CODE HASHING
   ------------------------------------------------------------ */

function hashVerificationCode(
  code: string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      code,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ------------------------------------------------------------
   VERIFICATION CODE VALIDATION
   ------------------------------------------------------------ */

function normalizeVerificationCode(
  value: string
): string {
  return value.trim();
}

function isValidVerificationCode(
  value: string
): boolean {
  return new RegExp(
    `^\\d{${EMAIL_CHANGE_CODE_LENGTH}}$`
  ).test(
    value
  );
}

/* ------------------------------------------------------------
   DATE
   ------------------------------------------------------------ */

function toDate(
  value: Date | string
): Date {
  if (
    value instanceof Date
  ) {
    return value;
  }

  return new Date(
    value
  );
}

function toIsoString(
  value: Date | string
): string {
  return toDate(
    value
  ).toISOString();
}

/* ------------------------------------------------------------
   POSTGRES ERROR
   ------------------------------------------------------------ */

function getPostgresErrorCode(
  error: unknown
): string | null {
  if (
    !error ||
    typeof error !==
      'object'
  ) {
    return null;
  }

  const value =
    error as {
      code?: unknown;
    };

  return typeof value.code ===
    'string'
    ? value.code
    : null;
}

function isUniqueViolation(
  error: unknown
): boolean {
  return (
    getPostgresErrorCode(
      error
    ) === '23505'
  );
}

/* ============================================================
   CURRENT ACCOUNT
   ============================================================ */

async function getCurrentUser(
  userId: string
): Promise<CurrentUserRow> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        userId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new UserAccountNotFoundError();
  }

  return result
    .rows[0] as CurrentUserRow;
}

/* ============================================================
   EMAIL CONFLICT
   ============================================================ */

/**
 * IMPORTANT:
 *
 * We deliberately do NOT filter deleted_at.
 *
 * Category 01 established that a previously deleted SaMi
 * account still owns/reserves its email address.
 *
 * The users_email_lower_unique index also applies across the
 * users table.
 */

async function emailBelongsToAnotherAccount(
  userId: string,
  email: string
): Promise<boolean> {
  const result =
    await queryControl(
      `
        SELECT
          id

        FROM users

        WHERE LOWER(email) = $1
          AND id <> $2

        LIMIT 1
      `,
      [
        email,
        userId,
      ]
    );

  return (
    result.rows.length >
    0
  );
}

/* ============================================================
   OPEN REQUEST
   ============================================================ */

async function getOpenRequest(
  userId: string
): Promise<
  OpenRequestRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          new_email,
          created_at,
          expires_at

        FROM user_email_change_requests

        WHERE user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        userId,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  return result
    .rows[0] as OpenRequestRow;
}

/* ============================================================
   COOLDOWN
   ============================================================ */

function getCooldownRemainingSeconds(
  createdAt:
    | Date
    | string
): number {
  const created =
    toDate(
      createdAt
    ).getTime();

  const availableAt =
    created +
    EMAIL_CHANGE_COOLDOWN_SECONDS *
      1000;

  const remainingMs =
    availableAt -
    Date.now();

  if (
    remainingMs <= 0
  ) {
    return 0;
  }

  return Math.ceil(
    remainingMs /
      1000
  );
}

/* ============================================================
   REQUEST EMAIL CHANGE
   ============================================================ */

/**
 * Starts an email-change verification request.
 *
 * This function does NOT send email itself.
 *
 * It:
 *
 * 1. validates the account
 * 2. validates the requested email
 * 3. prevents changing to the current email
 * 4. prevents use of another SaMi account's email
 * 5. applies resend/request cooldown
 * 6. generates a secure six-digit code
 * 7. stores only SHA-256(code)
 * 8. invalidates an older pending request
 * 9. creates a fresh 15-minute request
 *
 * The caller receives the raw code only so the server-side
 * email service can deliver it.
 */

export async function requestEmailChange(
  userId: string,
  newEmail: string
): Promise<EmailChangeRequestResult> {
  const id =
    assertUserId(
      userId
    );

  const email =
    normalizeEmail(
      newEmail
    );

  /* ==========================================================
     VALIDATE EMAIL
     ========================================================== */

  if (
    !isValidEmail(
      email
    )
  ) {
    throw new EmailChangeError(
      'INVALID_NEW_EMAIL',
      'Enter a valid email address.'
    );
  }

  /* ==========================================================
     CURRENT ACCOUNT
     ========================================================== */

  const currentUser =
    await getCurrentUser(
      id
    );

  const currentEmail =
    normalizeEmail(
      currentUser.email
    );

  /* ==========================================================
     SAME EMAIL
     ========================================================== */

  if (
    currentEmail ===
    email
  ) {
    throw new EmailChangeError(
      'EMAIL_UNCHANGED',
      'This is already your current email address.'
    );
  }

  /* ==========================================================
     EMAIL OWNERSHIP
     ========================================================== */

  const unavailable =
    await emailBelongsToAnotherAccount(
      id,
      email
    );

  if (
    unavailable
  ) {
    throw new EmailChangeError(
      'EMAIL_UNAVAILABLE',
      'This email address cannot be used.'
    );
  }

  /* ==========================================================
     COOLDOWN
     ========================================================== */

  const openRequest =
    await getOpenRequest(
      id
    );

  if (
    openRequest
  ) {
    const retryAfterSeconds =
      getCooldownRemainingSeconds(
        openRequest.created_at
      );

    if (
      retryAfterSeconds >
      0
    ) {
      throw new EmailChangeError(
        'EMAIL_CHANGE_COOLDOWN',
        'Please wait before requesting another verification code.',
        retryAfterSeconds
      );
    }
  }

  /* ==========================================================
     GENERATE CODE
     ========================================================== */

  const code =
    generateVerificationCode();

  const codeHash =
    hashVerificationCode(
      code
    );

  /* ==========================================================
     CREATE REQUEST
     ========================================================== */

  try {
    /*
     * One SQL statement keeps invalidation + insertion atomic.
     *
     * If insertion fails, PostgreSQL rolls back the CTE updates
     * belonging to this statement as well.
     */

    const result =
      await queryControl(
        `
          WITH invalidated_requests AS (
            UPDATE user_email_change_requests

            SET
              deleted_at = NOW(),
              updated_at = NOW()

            WHERE user_id = $1
              AND used_at IS NULL
              AND deleted_at IS NULL

            RETURNING id
          ),

          inserted_request AS (
            INSERT INTO user_email_change_requests (
              user_id,
              new_email,
              code_hash,
              expires_at,
              created_at,
              updated_at
            )

            SELECT
              $1,
              $2,
              $3,
              NOW() + INTERVAL '15 minutes',
              NOW(),
              NOW()

            FROM users

            WHERE id = $1
              AND deleted_at IS NULL

            RETURNING
              id,
              new_email,
              expires_at
          )

          SELECT
            id,
            new_email,
            expires_at

          FROM inserted_request
        `,
        [
          id,
          email,
          codeHash,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      throw new UserAccountNotFoundError();
    }

    const request =
      result
        .rows[0] as InsertedRequestRow;

    return {
      requestId:
        request.id,

      email:
        request.new_email,

      code,

      expiresAt:
        toIsoString(
          request.expires_at
        ),
    };
  } catch (error) {
    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      throw error;
    }

    /*
     * Concurrent requests can both pass the preliminary cooldown
     * check before either insert finishes.
     *
     * The database's partial unique index ensures only one open
     * request survives.
     */

    if (
      isUniqueViolation(
        error
      )
    ) {
      throw new EmailChangeError(
        'EMAIL_CHANGE_COOLDOWN',
        'Please wait before requesting another verification code.',
        EMAIL_CHANGE_COOLDOWN_SECONDS
      );
    }

    throw error;
  }
}

/* ============================================================
   VERIFY EMAIL CHANGE
   ============================================================ */

/**
 * Confirms a pending email change.
 *
 * Successful confirmation:
 *
 * - validates the six-digit code
 * - verifies it belongs to this signed-in user
 * - requires it to be unused and unexpired
 * - checks the destination email is still available
 * - updates users.email
 * - marks the new email verified
 * - updates email_verified_at
 * - consumes the request
 *
 * Updating the user and consuming the request happen inside one
 * PostgreSQL statement.
 */

export async function verifyEmailChange(
  userId: string,
  verificationCode: string
): Promise<UserAccount> {
  const id =
    assertUserId(
      userId
    );

  const code =
    normalizeVerificationCode(
      verificationCode
    );

  /* ==========================================================
     CODE VALIDATION
     ========================================================== */

  if (
    !isValidVerificationCode(
      code
    )
  ) {
    throw new EmailChangeError(
      'INVALID_EMAIL_CHANGE_CODE',
      'Enter the complete 6-digit verification code.'
    );
  }

  const codeHash =
    hashVerificationCode(
      code
    );

  /* ==========================================================
     ATOMIC VERIFICATION
     ========================================================== */

  try {
    const result =
      await queryControl(
        `
          WITH candidate_request AS (
            SELECT
              r.id,
              r.new_email

            FROM user_email_change_requests r

            WHERE r.user_id = $1
              AND r.code_hash = $2
              AND r.used_at IS NULL
              AND r.deleted_at IS NULL
              AND r.expires_at > NOW()

            ORDER BY
              r.created_at DESC

            LIMIT 1

            FOR UPDATE
          ),

          updated_user AS (
            UPDATE users u

            SET
              email =
                candidate_request.new_email,

              email_verified =
                TRUE,

              email_verified_at =
                NOW(),

              updated_at =
                NOW()

            FROM candidate_request

            WHERE u.id = $1
              AND u.deleted_at IS NULL

              AND NOT EXISTS (
                SELECT 1

                FROM users conflict_user

                WHERE
                  LOWER(
                    conflict_user.email
                  ) =
                  LOWER(
                    candidate_request.new_email
                  )

                  AND conflict_user.id <>
                    u.id
              )

            RETURNING
              u.id
          ),

          consumed_request AS (
            UPDATE user_email_change_requests r

            SET
              used_at = NOW(),
              updated_at = NOW()

            WHERE r.id = (
              SELECT
                id

              FROM candidate_request

              LIMIT 1
            )

              AND EXISTS (
                SELECT 1
                FROM updated_user
              )

            RETURNING
              r.id
          )

          SELECT
            updated_user.id

          FROM updated_user

          WHERE EXISTS (
            SELECT 1
            FROM consumed_request
          )
        `,
        [
          id,
          codeHash,
        ]
      );

    if (
      result.rows.length >
      0
    ) {
      return getUserAccount(
        id
      );
    }
  } catch (error) {
    /*
     * Even with the conflict check above, a second account could
     * claim the destination email concurrently.
     *
     * users_email_lower_unique remains the final database-level
     * protection.
     */

    if (
      isUniqueViolation(
        error
      )
    ) {
      throw new EmailChangeError(
        'EMAIL_UNAVAILABLE',
        'This email address can no longer be used.'
      );
    }

    throw error;
  }

  /* ==========================================================
     DETERMINE FAILURE STATE
     ========================================================== */

  const currentUser =
    await getCurrentUser(
      id
    );

  const requestResult =
    await queryControl(
      `
        SELECT
          id,
          new_email,
          expires_at,
          used_at,
          deleted_at

        FROM user_email_change_requests

        WHERE user_id = $1
          AND code_hash = $2

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        id,
        codeHash,
      ]
    );

  if (
    requestResult.rows.length ===
    0
  ) {
    throw new EmailChangeError(
      'INVALID_EMAIL_CHANGE_CODE',
      'The verification code is invalid or has expired.'
    );
  }

  const request =
    requestResult
      .rows[0] as ExistingRequestRow;

  /* ==========================================================
     IDEMPOTENT SUCCESS

     If this exact code was already successfully consumed and
     the account already has that destination email, return the
     account instead of turning a successful operation into an
     error on browser replay.
     ========================================================== */

  if (
    request.used_at &&
    normalizeEmail(
      currentUser.email
    ) ===
      normalizeEmail(
        request.new_email
      )
  ) {
    return getUserAccount(
      id
    );
  }

  /* ==========================================================
     EXPIRED
     ========================================================== */

  if (
    !request.used_at &&
    !request.deleted_at &&
    toDate(
      request.expires_at
    ).getTime() <=
      Date.now()
  ) {
    throw new EmailChangeError(
      'EMAIL_CHANGE_EXPIRED',
      'This verification code has expired. Request a new code.'
    );
  }

  /* ==========================================================
     DESTINATION BECAME UNAVAILABLE
     ========================================================== */

  if (
    !request.used_at &&
    !request.deleted_at
  ) {
    const unavailable =
      await emailBelongsToAnotherAccount(
        id,
        normalizeEmail(
          request.new_email
        )
      );

    if (
      unavailable
    ) {
      throw new EmailChangeError(
        'EMAIL_UNAVAILABLE',
        'This email address can no longer be used.'
      );
    }
  }

  /* ==========================================================
     GENERIC INVALID / OLD / REPLACED CODE
     ========================================================== */

  throw new EmailChangeError(
    'INVALID_EMAIL_CHANGE_CODE',
    'The verification code is invalid or has expired.'
  );
}

/* ============================================================
   CANCEL EMAIL CHANGE
   ============================================================ */

/**
 * Cancels the current user's pending email-change request.
 *
 * It never changes users.email.
 */

export async function cancelEmailChange(
  userId: string
): Promise<void> {
  const id =
    assertUserId(
      userId
    );

  /*
   * Confirm that this is still a real active SaMi account before
   * mutating account-owned records.
   */

  await getCurrentUser(
    id
  );

  await queryControl(
    `
      UPDATE user_email_change_requests

      SET
        deleted_at = NOW(),
        updated_at = NOW()

      WHERE user_id = $1
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [
      id,
    ]
  );
}

/* ============================================================
   PENDING EMAIL CHANGE
   ============================================================ */

export type PendingEmailChange = {
  email: string;
  expiresAt: string;
  createdAt: string;
  canResendInSeconds: number;
};

/**
 * Used by Account Settings to restore a pending verification UI.
 *
 * The verification code/hash is NEVER returned.
 */

export async function getPendingEmailChange(
  userId: string
): Promise<
  PendingEmailChange | null
> {
  const id =
    assertUserId(
      userId
    );

  await getCurrentUser(
    id
  );

  const result =
    await queryControl(
      `
        SELECT
          new_email,
          created_at,
          expires_at

        FROM user_email_change_requests

        WHERE user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
          AND expires_at > NOW()

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        id,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  const row =
    result.rows[0] as {
      new_email: string;
      created_at:
        | Date
        | string;
      expires_at:
        | Date
        | string;
    };

  return {
    email:
      row.new_email,

    createdAt:
      toIsoString(
        row.created_at
      ),

    expiresAt:
      toIsoString(
        row.expires_at
      ),

    canResendInSeconds:
      getCooldownRemainingSeconds(
        row.created_at
      ),
  };
}