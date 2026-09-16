import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

const CODE_DIGITS =
  6;

const CODE_EXPIRY_MINUTES =
  10;

const MAX_ATTEMPTS =
  6;

const RESEND_COOLDOWN_SECONDS =
  60;

export type AdminEmailTwoFactorPurpose =
  | 'email_2fa_setup'
  | 'email_2fa_disable'
  | 'security_step_up'
  | 'login_2fa';

export type AdminEmailCodeIssueResult = {
  id: string;
  code: string;
  expiresAt: Date;
  expiresInMinutes: number;
};

export type AdminEmailCodeVerificationResult = {
  verified: boolean;

  reason:
    | 'verified'
    | 'invalid'
    | 'expired'
    | 'attempts_exhausted'
    | 'not_found'
    | 'email_changed'
    | 'account_unavailable';

  attemptsRemaining:
    number | null;
};

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizeCode(
  value: string
): string {
  return value
    .replace(
      /\s+/g,
      ''
    )
    .trim();
}

function hashValue(
  value: string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      value,
      'utf8'
    )
    .digest('hex');
}

function createCode():
  string {
  const max =
    10 **
    CODE_DIGITS;

  const value =
    crypto.randomInt(
      0,
      max
    );

  return value
    .toString()
    .padStart(
      CODE_DIGITS,
      '0'
    );
}

export function createAdminEmailTwoFactorContextToken():
  string {
  return crypto
    .randomBytes(32)
    .toString(
      'base64url'
    );
}

export function hashAdminEmailTwoFactorContext(
  value: string
): string {
  return hashValue(
    value.trim()
  );
}

export async function invalidateAdminEmailTwoFactorCodes(
  input: {
    adminId: string;
    purpose?:
      AdminEmailTwoFactorPurpose;
  }
): Promise<void> {
  const parameters:
    unknown[] = [
      input.adminId,
    ];

  let purposeFilter =
    '';

  if (input.purpose) {
    parameters.push(
      input.purpose
    );

    purposeFilter =
      `AND purpose = $${parameters.length}`;
  }

  await queryControl(
    `
      UPDATE platform_admin_email_two_factor_codes
      SET
        invalidated_at = NOW()
      WHERE admin_id = $1
        ${purposeFilter}
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
    `,
    parameters
  );
}

export async function issueAdminEmailTwoFactorCode(
  input: {
    adminId: string;
    sessionId:
      | string
      | null;
    email: string;
    purpose:
      AdminEmailTwoFactorPurpose;
    context?: string | null;
  }
): Promise<AdminEmailCodeIssueResult> {
  const email =
    normalizeEmail(
      input.email
    );

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new Error(
      'INVALID_EMAIL_ADDRESS'
    );
  }

  const recent =
    await queryControl(
      `
        SELECT
          created_at
        FROM platform_admin_email_two_factor_codes
        WHERE admin_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        input.adminId,
        input.purpose,
      ]
    );

  const createdAt =
    recent.rows[0]
      ?.created_at
      ? new Date(
          recent.rows[0]
            .created_at
        )
      : null;

  if (createdAt) {
    const elapsedSeconds =
      Math.floor(
        (
          Date.now() -
          createdAt.getTime()
        ) / 1000
      );

    if (
      elapsedSeconds <
      RESEND_COOLDOWN_SECONDS
    ) {
      const retryAfter =
        RESEND_COOLDOWN_SECONDS -
        elapsedSeconds;

      throw new Error(
        `EMAIL_CODE_COOLDOWN:${retryAfter}`
      );
    }
  }

  await invalidateAdminEmailTwoFactorCodes({
    adminId:
      input.adminId,

    purpose:
      input.purpose,
  });

  const code =
    createCode();

  const codeHash =
    hashValue(code);

  const expiresAt =
    new Date(
      Date.now() +
        CODE_EXPIRY_MINUTES *
          60 *
          1000
    );

  const contextHash =
    input.context
      ? hashValue(
          input.context
        )
      : null;

  const result =
    await queryControl(
      `
        INSERT INTO platform_admin_email_two_factor_codes (
          admin_id,
          session_id,
          purpose,
          code_hash,
          context_hash,
          email,
          attempts,
          max_attempts,
          expires_at,
          consumed_at,
          invalidated_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          0,
          $7,
          $8,
          NULL,
          NULL,
          NOW()
        )
        RETURNING id
      `,
      [
        input.adminId,
        input.sessionId,
        input.purpose,
        codeHash,
        contextHash,
        email,
        MAX_ATTEMPTS,
        expiresAt,
      ]
    );

  return {
    id:
      String(
        result.rows[0].id
      ),

    code,

    expiresAt,

    expiresInMinutes:
      CODE_EXPIRY_MINUTES,
  };
}

export async function verifyAdminEmailTwoFactorCode(
  input: {
    adminId: string;
    sessionId:
      | string
      | null;
    email: string;
    purpose:
      AdminEmailTwoFactorPurpose;
    code: string;
    context?: string | null;
  }
): Promise<AdminEmailCodeVerificationResult> {
  const email =
    normalizeEmail(
      input.email
    );

  const code =
    normalizeCode(
      input.code
    );

  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    return {
      verified: false,
      reason: 'invalid',
      attemptsRemaining:
        null,
    };
  }

  const result =
    await queryControl(
      `
        SELECT
          id,
          code_hash,
          context_hash,
          email,
          attempts,
          max_attempts,
          expires_at
        FROM platform_admin_email_two_factor_codes
        WHERE admin_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND (
            session_id = $3
            OR (
              session_id IS NULL
              AND $3::uuid IS NULL
            )
          )
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        input.adminId,
        input.purpose,
        input.sessionId,
      ]
    );

  const row =
    result.rows[0];

  if (!row) {
    return {
      verified: false,
      reason:
        'not_found',
      attemptsRemaining:
        null,
    };
  }

  if (
    normalizeEmail(
      String(row.email)
    ) !== email
  ) {
    await queryControl(
      `
        UPDATE platform_admin_email_two_factor_codes
        SET
          invalidated_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );

    return {
      verified: false,
      reason:
        'email_changed',
      attemptsRemaining:
        null,
    };
  }

  const expiresAt =
    new Date(
      row.expires_at
    );

  if (
    expiresAt.getTime() <=
    Date.now()
  ) {
    await queryControl(
      `
        UPDATE platform_admin_email_two_factor_codes
        SET
          invalidated_at = NOW()
        WHERE id = $1
      `,
      [row.id]
    );

    return {
      verified: false,
      reason:
        'expired',
      attemptsRemaining:
        0,
    };
  }

  const attempts =
    Number(
      row.attempts ?? 0
    );

  const maxAttempts =
    Number(
      row.max_attempts ??
        MAX_ATTEMPTS
    );

  if (
    attempts >=
    maxAttempts
  ) {
    return {
      verified: false,
      reason:
        'attempts_exhausted',
      attemptsRemaining:
        0,
    };
  }

  if (
    input.context
  ) {
    const expectedContext =
      hashValue(
        input.context
      );

    if (
      !row.context_hash ||
      !timingSafeHashEqual(
        String(
          row.context_hash
        ),
        expectedContext
      )
    ) {
      return {
        verified: false,
        reason:
          'not_found',
        attemptsRemaining:
          null,
      };
    }
  }

  const expectedCodeHash =
    hashValue(code);

  if (
    !timingSafeHashEqual(
      String(
        row.code_hash
      ),
      expectedCodeHash
    )
  ) {
    const update =
      await queryControl(
        `
          UPDATE platform_admin_email_two_factor_codes
          SET
            attempts =
              attempts + 1,
            invalidated_at =
              CASE
                WHEN attempts + 1 >=
                  max_attempts
                THEN NOW()
                ELSE invalidated_at
              END
          WHERE id = $1
            AND consumed_at IS NULL
            AND invalidated_at IS NULL
          RETURNING
            attempts,
            max_attempts
        `,
        [row.id]
      );

    const nextAttempts =
      Number(
        update.rows[0]
          ?.attempts ??
          attempts + 1
      );

    const remaining =
      Math.max(
        0,
        maxAttempts -
          nextAttempts
      );

    return {
      verified: false,

      reason:
        remaining === 0
          ? 'attempts_exhausted'
          : 'invalid',

      attemptsRemaining:
        remaining,
    };
  }

  const consumed =
    await queryControl(
      `
        UPDATE platform_admin_email_two_factor_codes
        SET
          consumed_at = NOW()
        WHERE id = $1
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `,
      [row.id]
    );

  if (
    !consumed.rows[0]
  ) {
    return {
      verified: false,
      reason:
        'not_found',
      attemptsRemaining:
        null,
    };
  }

  return {
    verified: true,
    reason: 'verified',
    attemptsRemaining:
      Math.max(
        0,
        maxAttempts -
          attempts
      ),
  };
}

function timingSafeHashEqual(
  left: string,
  right: string
): boolean {
  const leftBuffer =
    Buffer.from(
      left,
      'utf8'
    );

  const rightBuffer =
    Buffer.from(
      right,
      'utf8'
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    leftBuffer,
    rightBuffer
  );
}