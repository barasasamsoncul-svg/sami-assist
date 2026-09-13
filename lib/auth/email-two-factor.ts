import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
} from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

export type EmailTwoFactorCodePurpose =
  | 'email_2fa_setup'
  | 'login_2fa'
  | 'security_step_up';

export type EmailTwoFactorErrorCode =
  | 'ACCOUNT_NOT_AVAILABLE'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_TWO_FACTOR_NOT_ENABLED'
  | 'EMAIL_CODE_COOLDOWN'
  | 'INVALID_EMAIL_CODE_PURPOSE'
  | 'INVALID_EMAIL_CODE_CONTEXT'
  | 'INVALID_EMAIL_ADDRESS';

export type EmailTwoFactorVerificationReason =
  | 'verified'
  | 'invalid'
  | 'expired'
  | 'attempts_exhausted'
  | 'not_found'
  | 'email_changed'
  | 'method_disabled'
  | 'account_unavailable';

export type IssuedEmailTwoFactorCode = {
  codeId: string;

  /**
   * Plaintext OTP.
   *
   * This value exists only so the caller can deliver it by
   * email. It is NEVER stored in the database.
   */
  code: string;

  email: string;

  maskedEmail: string;

  purpose:
    EmailTwoFactorCodePurpose;

  expiresAt: string;

  expiresInSeconds: number;

  resendCooldownSeconds: number;
};

export type EmailTwoFactorVerificationResult = {
  success: boolean;

  reason:
    EmailTwoFactorVerificationReason;

  attemptsRemaining:
    number | null;
};

type AccountSecurityRow = {
  id: string;

  email: string;

  status:
    | string
    | null;

  email_verified:
    | boolean
    | null;

  email_verified_at:
    | Date
    | string
    | null;

  email_two_factor_enabled:
    | boolean
    | null;
};

type SecurityCodeRow = {
  id: string;

  user_id: string;

  purpose:
    EmailTwoFactorCodePurpose;

  context_hash: string;

  code_hash: string;

  email: string;

  attempt_count:
    | number
    | string
    | null;

  max_attempts:
    | number
    | string
    | null;

  expires_at:
    | Date
    | string;

  used_at:
    | Date
    | string
    | null;

  invalidated_at:
    | Date
    | string
    | null;

  created_at:
    | Date
    | string;
};

/* ============================================================
   ERROR
   ============================================================ */

export class EmailTwoFactorError
  extends Error
{
  readonly code:
    EmailTwoFactorErrorCode;

  readonly retryAfterSeconds:
    number | null;

  constructor(
    code:
      EmailTwoFactorErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?:
        number | null;
    }
  ) {
    super(
      message
    );

    this.name =
      'EmailTwoFactorError';

    this.code =
      code;

    this.retryAfterSeconds =
      options
        ?.retryAfterSeconds ??
      null;
  }
}

/* ============================================================
   CONFIGURATION
   ============================================================ */

function getPositiveIntegerEnv(
  name: string,
  fallback: number,
  options?: {
    minimum?: number;
    maximum?: number;
  }
) {
  const raw =
    Number(
      process.env[name]
    );

  let value =
    Number.isFinite(
      raw
    ) &&
    raw > 0
      ? Math.floor(
          raw
        )
      : fallback;

  if (
    typeof options
      ?.minimum ===
      'number'
  ) {
    value =
      Math.max(
        options.minimum,
        value
      );
  }

  if (
    typeof options
      ?.maximum ===
      'number'
  ) {
    value =
      Math.min(
        options.maximum,
        value
      );
  }

  return value;
}

const CODE_EXPIRY_MINUTES =
  getPositiveIntegerEnv(
    'AUTH_EMAIL_OTP_EXPIRY_MINUTES',
    10,
    {
      minimum: 1,
      maximum: 30,
    }
  );

const RESEND_COOLDOWN_SECONDS =
  getPositiveIntegerEnv(
    'AUTH_EMAIL_OTP_RESEND_COOLDOWN_SECONDS',
    60,
    {
      minimum: 15,
      maximum: 600,
    }
  );

const MAX_CODE_ATTEMPTS =
  getPositiveIntegerEnv(
    'AUTH_EMAIL_OTP_MAX_ATTEMPTS',
    5,
    {
      minimum: 1,
      maximum: 20,
    }
  );

const MAX_CONTEXT_LENGTH =
  1024;

const MAX_USER_ID_LENGTH =
  128;

const MAX_EMAIL_LENGTH =
  254;

/* ============================================================
   PEPPER
   ============================================================ */

function getEmailOtpPepper() {
  const pepper =
    process.env
      .AUTH_EMAIL_OTP_PEPPER;

  if (
    !pepper ||
    pepper.length < 32
  ) {
    throw new Error(
      'AUTH_EMAIL_OTP_PEPPER is missing or too short. Add a stable secret of at least 32 characters.'
    );
  }

  return pepper;
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeUserId(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .slice(
      0,
      MAX_USER_ID_LENGTH
    );
}

function normalizeEmail(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeContext(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  const context =
    value.trim();

  if (
    context.length === 0 ||
    context.length >
      MAX_CONTEXT_LENGTH
  ) {
    return '';
  }

  return context;
}

function normalizeCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function isValidEmail(
  email: string
) {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

export function isEmailTwoFactorCodePurpose(
  value: unknown
): value is EmailTwoFactorCodePurpose {
  return (
    value ===
      'email_2fa_setup' ||
    value ===
      'login_2fa' ||
    value ===
      'security_step_up'
  );
}

/* ============================================================
   DATE
   ============================================================ */

function toDate(
  value:
    | Date
    | string
): Date {
  return value instanceof Date
    ? value
    : new Date(
        value
      );
}

function getSecondsUntil(
  value:
    | Date
    | string
) {
  const date =
    toDate(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (
        date.getTime() -
        Date.now()
      ) /
        1000
    )
  );
}

/* ============================================================
   MASK EMAIL
   ============================================================ */

export function maskEmailForSecurity(
  value: string
) {
  const email =
    normalizeEmail(
      value
    );

  const atIndex =
    email.lastIndexOf(
      '@'
    );

  if (
    atIndex <= 0 ||
    atIndex >=
      email.length - 1
  ) {
    return email;
  }

  const local =
    email.slice(
      0,
      atIndex
    );

  const domain =
    email.slice(
      atIndex + 1
    );

  if (
    local.length === 1
  ) {
    return `${local[0]}***@${domain}`;
  }

  if (
    local.length === 2
  ) {
    return `${local[0]}***${local[1]}@${domain}`;
  }

  const hiddenLength =
    Math.min(
      Math.max(
        local.length - 2,
        3
      ),
      8
    );

  return `${local[0]}${'*'.repeat(
    hiddenLength
  )}${local[
    local.length - 1
  ]}@${domain}`;
}

/* ============================================================
   CONTEXT TOKEN
   ============================================================ */

/**
 * Routes that need a fresh security context may use this.
 *
 * Examples:
 *
 * - Email 2FA setup
 * - security step-up
 *
 * Login already has its own high-entropy login challenge token,
 * so login routes can bind the OTP directly to that challenge.
 */
export function createEmailTwoFactorContextToken() {
  return crypto
    .randomBytes(
      32
    )
    .toString(
      'base64url'
    );
}

/* ============================================================
   CONTEXT HASH
   ============================================================ */

export function hashEmailTwoFactorContext(
  context: string
) {
  const cleanContext =
    normalizeContext(
      context
    );

  if (
    !cleanContext
  ) {
    throw new EmailTwoFactorError(
      'INVALID_EMAIL_CODE_CONTEXT',
      'The security verification context is invalid.'
    );
  }

  return crypto
    .createHash(
      'sha256'
    )
    .update(
      cleanContext,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   CODE
   ============================================================ */

function generateEmailSecurityCode() {
  return crypto
    .randomInt(
      100000,
      1000000
    )
    .toString();
}

/* ============================================================
   CODE HASH
   ============================================================ */

/**
 * The database does not store SHA256(code).
 *
 * Six-digit codes have a very small search space, so a database
 * leak would make plain unsalted SHA-256 OTP hashes trivial to
 * brute force.
 *
 * SaMi instead uses an application-held HMAC secret.
 *
 * The HMAC also binds the code to:
 *
 * - user
 * - purpose
 * - exact security context
 */
function hashEmailSecurityCode(
  input: {
    userId: string;

    purpose:
      EmailTwoFactorCodePurpose;

    contextHash:
      string;

    code:
      string;
  }
) {
  return crypto
    .createHmac(
      'sha256',
      getEmailOtpPepper()
    )
    .update(
      [
        'sami-email-otp-v1',
        input.userId,
        input.purpose,
        input.contextHash,
        input.code,
      ].join(
        ':'
      ),
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   CONSTANT-TIME HASH COMPARISON
   ============================================================ */

function safeHashEquals(
  expected:
    string,
  actual:
    string
) {
  if (
    !/^[a-f0-9]{64}$/i.test(
      expected
    ) ||
    !/^[a-f0-9]{64}$/i.test(
      actual
    )
  ) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(
      expected,
      'hex'
    );

  const actualBuffer =
    Buffer.from(
      actual,
      'hex'
    );

  if (
    expectedBuffer.length !==
    actualBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      expectedBuffer,
      actualBuffer
    );
}

/* ============================================================
   SECURITY SETTINGS ROW
   ============================================================ */

async function ensureSecuritySettingsWithClient(
  client:
    PoolClient,
  userId:
    string
) {
  await client.query(
    `
      INSERT INTO user_security_settings (
        user_id,
        email_two_factor_enabled,
        email_two_factor_enabled_at,
        preferred_two_factor_method,
        created_at,
        updated_at
      )

      SELECT
        u.id,
        FALSE,
        NULL,

        CASE
          WHEN EXISTS (
            SELECT 1

            FROM user_authenticators ua

            WHERE ua.user_id = u.id
              AND ua.type = 'totp'
              AND ua.status = 'active'
              AND ua.revoked_at IS NULL
              AND ua.deleted_at IS NULL
          )

          THEN 'authenticator'

          ELSE NULL
        END,

        NOW(),
        NOW()

      FROM users u

      WHERE u.id = $1
        AND u.deleted_at IS NULL

      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [
      userId,
    ]
  );
}

/* ============================================================
   ACCOUNT SECURITY STATE
   ============================================================ */

async function getAccountSecurityStateWithClient(
  client:
    PoolClient,
  userId:
    string
): Promise<AccountSecurityRow> {
  await ensureSecuritySettingsWithClient(
    client,
    userId
  );

  const result =
    await client.query(
      `
        SELECT
          u.id,
          u.email,
          u.status,
          u.email_verified,
          u.email_verified_at,

          uss.email_two_factor_enabled

        FROM users u

        INNER JOIN user_security_settings uss
          ON uss.user_id = u.id

        WHERE u.id = $1
          AND u.deleted_at IS NULL

        FOR UPDATE OF u, uss
      `,
      [
        userId,
      ]
    );

  const row =
    result.rows[0] as
      | AccountSecurityRow
      | undefined;

  if (!row) {
    throw new EmailTwoFactorError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  return row;
}

/* ============================================================
   ACCOUNT VALIDATION
   ============================================================ */

function validateAccountForPurpose(
  row:
    AccountSecurityRow,
  purpose:
    EmailTwoFactorCodePurpose
) {
  const status =
    String(
      row.status ||
      ''
    )
      .trim()
      .toLowerCase();

  if (
    status !==
    'active'
  ) {
    throw new EmailTwoFactorError(
      'ACCOUNT_NOT_AVAILABLE',
      'This SaMi account is not available for email verification.'
    );
  }

  const verified =
    row.email_verified ===
      true ||
    Boolean(
      row.email_verified_at
    );

  if (!verified) {
    throw new EmailTwoFactorError(
      'EMAIL_NOT_VERIFIED',
      'Verify your SaMi email address before using email as a security method.'
    );
  }

  if (
    (
      purpose ===
        'login_2fa' ||
      purpose ===
        'security_step_up'
    ) &&
    row.email_two_factor_enabled !==
      true
  ) {
    throw new EmailTwoFactorError(
      'EMAIL_TWO_FACTOR_NOT_ENABLED',
      'Email login verification is not enabled for this account.'
    );
  }
}

/* ============================================================
   ISSUE EMAIL SECURITY CODE
   ============================================================ */

/**
 * Create one new email security code.
 *
 * SECURITY:
 *
 * - plaintext code is returned once
 * - database stores only HMAC
 * - bound to user + purpose + context
 * - previous unused code for the same context is invalidated
 * - resend cooldown is enforced server-side
 * - caller must send the code and then discard plaintext
 */
export async function issueEmailTwoFactorCode(
  input: {
    userId: string;

    purpose:
      EmailTwoFactorCodePurpose;

    context: string;

    email?: string;
  }
): Promise<IssuedEmailTwoFactorCode> {
  const userId =
    normalizeUserId(
      input.userId
    );

  if (!userId) {
    throw new EmailTwoFactorError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  if (
    !isEmailTwoFactorCodePurpose(
      input.purpose
    )
  ) {
    throw new EmailTwoFactorError(
      'INVALID_EMAIL_CODE_PURPOSE',
      'The requested email security operation is not supported.'
    );
  }

  const context =
    normalizeContext(
      input.context
    );

  if (!context) {
    throw new EmailTwoFactorError(
      'INVALID_EMAIL_CODE_CONTEXT',
      'The security verification context is invalid.'
    );
  }

  const contextHash =
    hashEmailTwoFactorContext(
      context
    );

  /*
   * Trigger configuration validation before opening the
   * transaction.
   */
  getEmailOtpPepper();

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    const account =
      await getAccountSecurityStateWithClient(
        client,
        userId
      );

    validateAccountForPurpose(
      account,
      input.purpose
    );

    const accountEmail =
      normalizeEmail(
        account.email
      );

    if (
      !isValidEmail(
        accountEmail
      )
    ) {
      throw new EmailTwoFactorError(
        'INVALID_EMAIL_ADDRESS',
        'The verified SaMi email address is invalid.'
      );
    }

    /*
     * If the caller supplied an expected email, it must still
     * match the current account email.
     *
     * This prevents an email-change race from delivering a
     * security code to stale account data.
     */
    if (
      input.email !==
        undefined
    ) {
      const expectedEmail =
        normalizeEmail(
          input.email
        );

      if (
        !expectedEmail ||
        expectedEmail !==
          accountEmail
      ) {
        throw new EmailTwoFactorError(
          'INVALID_EMAIL_ADDRESS',
          'The account email changed before the security code could be issued.'
        );
      }
    }

    /* ========================================================
       RESEND COOLDOWN
       ======================================================== */

    const recentResult =
      await client.query(
        `
          SELECT
            created_at

          FROM user_email_security_codes

          WHERE user_id = $1
            AND purpose = $2
            AND context_hash = $3

          ORDER BY
            created_at DESC

          LIMIT 1
        `,
        [
          userId,
          input.purpose,
          contextHash,
        ]
      );

    const recentCreatedAt =
      recentResult
        .rows[0]
        ?.created_at as
        | Date
        | string
        | undefined;

    if (
      recentCreatedAt
    ) {
      const createdAt =
        toDate(
          recentCreatedAt
        );

      if (
        !Number.isNaN(
          createdAt.getTime()
        )
      ) {
        const availableAt =
          new Date(
            createdAt.getTime() +
              RESEND_COOLDOWN_SECONDS *
                1000
          );

        const retryAfterSeconds =
          getSecondsUntil(
            availableAt
          );

        if (
          retryAfterSeconds >
          0
        ) {
          throw new EmailTwoFactorError(
            'EMAIL_CODE_COOLDOWN',
            'A security code was sent recently. Wait before requesting another code.',
            {
              retryAfterSeconds,
            }
          );
        }
      }
    }

    /* ========================================================
       INVALIDATE PREVIOUS CURRENT CODE
       ======================================================== */

    await client.query(
      `
        UPDATE user_email_security_codes

        SET
          invalidated_at = NOW(),
          updated_at = NOW()

        WHERE user_id = $1
          AND purpose = $2
          AND context_hash = $3
          AND used_at IS NULL
          AND invalidated_at IS NULL
      `,
      [
        userId,
        input.purpose,
        contextHash,
      ]
    );

    /* ========================================================
       CREATE NEW CODE
       ======================================================== */

    const code =
      generateEmailSecurityCode();

    const codeHash =
      hashEmailSecurityCode({
        userId,

        purpose:
          input.purpose,

        contextHash,

        code,
      });

    const expiresAt =
      new Date(
        Date.now() +
          CODE_EXPIRY_MINUTES *
            60 *
            1000
      );

    const insertResult =
      await client.query(
        `
          INSERT INTO user_email_security_codes (
            user_id,
            purpose,
            context_hash,
            code_hash,
            email,
            attempt_count,
            max_attempts,
            expires_at,
            used_at,
            invalidated_at,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            0,
            $6,
            $7,
            NULL,
            NULL,
            NOW(),
            NOW()
          )

          RETURNING
            id
        `,
        [
          userId,
          input.purpose,
          contextHash,
          codeHash,
          accountEmail,
          MAX_CODE_ATTEMPTS,
          expiresAt,
        ]
      );

    const codeId =
      String(
        insertResult
          .rows[0]
          ?.id ||
        ''
      );

    if (!codeId) {
      throw new Error(
        'SaMi could not create the email security code.'
      );
    }

    await client.query(
      'COMMIT'
    );

    return {
      codeId,

      code,

      email:
        accountEmail,

      maskedEmail:
        maskEmailForSecurity(
          accountEmail
        ),

      purpose:
        input.purpose,

      expiresAt:
        expiresAt.toISOString(),

      expiresInSeconds:
        CODE_EXPIRY_MINUTES *
        60,

      resendCooldownSeconds:
        RESEND_COOLDOWN_SECONDS,
    };
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   VERIFY EMAIL SECURITY CODE
   ============================================================ */

/**
 * Atomically verify and consume an email security code.
 *
 * Successful codes are one-time use.
 *
 * Failed valid-format attempts increase attempt_count.
 *
 * When the attempt limit is reached the code is invalidated.
 */
export async function verifyEmailTwoFactorCode(
  input: {
    userId: string;

    purpose:
      EmailTwoFactorCodePurpose;

    context: string;

    code: string;
  }
): Promise<EmailTwoFactorVerificationResult> {
  const userId =
    normalizeUserId(
      input.userId
    );

  if (!userId) {
    return {
      success: false,
      reason:
        'account_unavailable',
      attemptsRemaining:
        null,
    };
  }

  if (
    !isEmailTwoFactorCodePurpose(
      input.purpose
    )
  ) {
    return {
      success: false,
      reason:
        'not_found',
      attemptsRemaining:
        null,
    };
  }

  const context =
    normalizeContext(
      input.context
    );

  if (!context) {
    return {
      success: false,
      reason:
        'not_found',
      attemptsRemaining:
        null,
    };
  }

  const code =
    normalizeCode(
      input.code
    );

  /*
   * Email OTPs are exactly six decimal digits.
   *
   * Do not silently strip arbitrary characters because that can
   * turn malformed attacker input into a valid candidate.
   */
  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    return {
      success: false,
      reason:
        'invalid',
      attemptsRemaining:
        null,
    };
  }

  const contextHash =
    hashEmailTwoFactorContext(
      context
    );

  getEmailOtpPepper();

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    let account:
      AccountSecurityRow;

    try {
      account =
        await getAccountSecurityStateWithClient(
          client,
          userId
        );
    } catch (
      error
    ) {
      if (
        error instanceof
          EmailTwoFactorError &&
        error.code ===
          'ACCOUNT_NOT_AVAILABLE'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return {
          success: false,

          reason:
            'account_unavailable',

          attemptsRemaining:
            null,
        };
      }

      throw error;
    }

    const accountStatus =
      String(
        account.status ||
        ''
      )
        .trim()
        .toLowerCase();

    if (
      accountStatus !==
      'active'
    ) {
      await client.query(
        'ROLLBACK'
      );

      return {
        success: false,

        reason:
          'account_unavailable',

        attemptsRemaining:
          null,
      };
    }

    const verifiedEmail =
      account.email_verified ===
        true ||
      Boolean(
        account.email_verified_at
      );

    if (
      !verifiedEmail
    ) {
      await client.query(
        'ROLLBACK'
      );

      return {
        success: false,

        reason:
          'account_unavailable',

        attemptsRemaining:
          null,
      };
    }

    if (
      (
        input.purpose ===
          'login_2fa' ||
        input.purpose ===
          'security_step_up'
      ) &&
      account.email_two_factor_enabled !==
        true
    ) {
      await client.query(
        'ROLLBACK'
      );

      return {
        success: false,

        reason:
          'method_disabled',

        attemptsRemaining:
          null,
      };
    }

    /* ========================================================
       LOAD CURRENT CODE
       ======================================================== */

    const result =
      await client.query(
        `
          SELECT
            id,
            user_id,
            purpose,
            context_hash,
            code_hash,
            email,
            attempt_count,
            max_attempts,
            expires_at,
            used_at,
            invalidated_at,
            created_at

          FROM user_email_security_codes

          WHERE user_id = $1
            AND purpose = $2
            AND context_hash = $3
            AND used_at IS NULL
            AND invalidated_at IS NULL

          ORDER BY
            created_at DESC

          LIMIT 1

          FOR UPDATE
        `,
        [
          userId,
          input.purpose,
          contextHash,
        ]
      );

    const row =
      result.rows[0] as
        | SecurityCodeRow
        | undefined;

    if (!row) {
      await client.query(
        'ROLLBACK'
      );

      return {
        success: false,

        reason:
          'not_found',

        attemptsRemaining:
          null,
      };
    }

    /* ========================================================
       ACCOUNT EMAIL CHANGED
       ======================================================== */

    const currentEmail =
      normalizeEmail(
        account.email
      );

    const codeEmail =
      normalizeEmail(
        row.email
      );

    if (
      !currentEmail ||
      currentEmail !==
        codeEmail
    ) {
      await client.query(
        `
          UPDATE user_email_security_codes

          SET
            invalidated_at = NOW(),
            updated_at = NOW()

          WHERE id = $1
        `,
        [
          row.id,
        ]
      );

      await client.query(
        'COMMIT'
      );

      return {
        success: false,

        reason:
          'email_changed',

        attemptsRemaining:
          null,
      };
    }

    /* ========================================================
       EXPIRY
       ======================================================== */

    const expiresAt =
      toDate(
        row.expires_at
      );

    if (
      Number.isNaN(
        expiresAt.getTime()
      ) ||
      expiresAt.getTime() <=
        Date.now()
    ) {
      await client.query(
        `
          UPDATE user_email_security_codes

          SET
            invalidated_at =
              COALESCE(
                invalidated_at,
                NOW()
              ),

            updated_at = NOW()

          WHERE id = $1
        `,
        [
          row.id,
        ]
      );

      await client.query(
        'COMMIT'
      );

      return {
        success: false,

        reason:
          'expired',

        attemptsRemaining:
          0,
      };
    }

    /* ========================================================
       ATTEMPT LIMIT
       ======================================================== */

    const attemptCount =
      Math.max(
        0,
        Number(
          row.attempt_count ||
          0
        )
      );

    const maxAttempts =
      Math.max(
        1,
        Number(
          row.max_attempts ||
          MAX_CODE_ATTEMPTS
        )
      );

    if (
      attemptCount >=
      maxAttempts
    ) {
      await client.query(
        `
          UPDATE user_email_security_codes

          SET
            invalidated_at =
              COALESCE(
                invalidated_at,
                NOW()
              ),

            updated_at = NOW()

          WHERE id = $1
        `,
        [
          row.id,
        ]
      );

      await client.query(
        'COMMIT'
      );

      return {
        success: false,

        reason:
          'attempts_exhausted',

        attemptsRemaining:
          0,
      };
    }

    /* ========================================================
       VERIFY HMAC
       ======================================================== */

    const candidateHash =
      hashEmailSecurityCode({
        userId,

        purpose:
          input.purpose,

        contextHash,

        code,
      });

    const valid =
      safeHashEquals(
        row.code_hash,
        candidateHash
      );

    /* ========================================================
       INVALID CODE
       ======================================================== */

    if (!valid) {
      const nextAttemptCount =
        attemptCount +
        1;

      const exhausted =
        nextAttemptCount >=
        maxAttempts;

      await client.query(
        `
          UPDATE user_email_security_codes

          SET
            attempt_count =
              $2,

            invalidated_at =
              CASE
                WHEN $3 = TRUE
                THEN NOW()

                ELSE
                  invalidated_at
              END,

            updated_at =
              NOW()

          WHERE id = $1
        `,
        [
          row.id,
          nextAttemptCount,
          exhausted,
        ]
      );

      await client.query(
        'COMMIT'
      );

      return {
        success: false,

        reason:
          exhausted
            ? 'attempts_exhausted'
            : 'invalid',

        attemptsRemaining:
          Math.max(
            0,
            maxAttempts -
              nextAttemptCount
          ),
      };
    }

    /* ========================================================
       SUCCESS — ONE TIME CONSUMPTION
       ======================================================== */

    const consumeResult =
      await client.query(
        `
          UPDATE user_email_security_codes

          SET
            used_at = NOW(),
            updated_at = NOW()

          WHERE id = $1
            AND used_at IS NULL
            AND invalidated_at IS NULL
            AND expires_at > NOW()

          RETURNING id
        `,
        [
          row.id,
        ]
      );

    if (
      consumeResult
        .rows.length ===
      0
    ) {
      await client.query(
        'ROLLBACK'
      );

      return {
        success: false,

        reason:
          'not_found',

        attemptsRemaining:
          null,
      };
    }

    await client.query(
      'COMMIT'
    );

    return {
      success: true,

      reason:
        'verified',

      attemptsRemaining:
        Math.max(
          0,
          maxAttempts -
            attemptCount
        ),
    };
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   INVALIDATE ONE ISSUED CODE
   ============================================================ */

/**
 * Use this when the database successfully created an OTP but
 * email delivery failed.
 *
 * The caller passes the exact returned codeId.
 */
export async function invalidateIssuedEmailTwoFactorCode(
  input: {
    userId: string;

    codeId: string;
  }
) {
  const userId =
    normalizeUserId(
      input.userId
    );

  const codeId =
    typeof input.codeId ===
      'string'
      ? input.codeId.trim()
      : '';

  if (
    !userId ||
    !codeId
  ) {
    return;
  }

  const pool =
    getControlPool();

  await pool.query(
    `
      UPDATE user_email_security_codes

      SET
        invalidated_at =
          COALESCE(
            invalidated_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE id = $1
        AND user_id = $2
        AND used_at IS NULL
    `,
    [
      codeId,
      userId,
    ]
  );
}

/* ============================================================
   INVALIDATE USER EMAIL SECURITY CODES
   ============================================================ */

/**
 * Useful when:
 *
 * - account email changes
 * - Email 2FA is disabled
 * - a security reset occurs
 *
 * This does not delete history.
 */
export async function invalidateEmailTwoFactorCodesForUser(
  input: {
    userId: string;

    purposes?:
      EmailTwoFactorCodePurpose[];
  }
) {
  const userId =
    normalizeUserId(
      input.userId
    );

  if (!userId) {
    return;
  }

  const purposes =
    Array.isArray(
      input.purposes
    )
      ? Array.from(
          new Set(
            input.purposes.filter(
              isEmailTwoFactorCodePurpose
            )
          )
        )
      : [];

  const pool =
    getControlPool();

  if (
    purposes.length ===
    0
  ) {
    await pool.query(
      `
        UPDATE user_email_security_codes

        SET
          invalidated_at =
            COALESCE(
              invalidated_at,
              NOW()
            ),

          updated_at =
            NOW()

        WHERE user_id = $1
          AND used_at IS NULL
          AND invalidated_at IS NULL
      `,
      [
        userId,
      ]
    );

    return;
  }

  await pool.query(
    `
      UPDATE user_email_security_codes

      SET
        invalidated_at =
          COALESCE(
            invalidated_at,
            NOW()
          ),

        updated_at =
          NOW()

      WHERE user_id = $1
        AND purpose = ANY(
          $2::varchar[]
        )
        AND used_at IS NULL
        AND invalidated_at IS NULL
    `,
    [
      userId,
      purposes,
    ]
  );
}