import { queryControl } from '@/lib/db/control';
import {
  createOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  verifyTotpCode,
} from '@/lib/auth/totp';
import {
  consumeRecoveryCode,
  countActiveRecoveryCodes,
  createRecoveryCodes,
} from '@/lib/auth/recovery-codes';

export async function getTwoFactorStatus(userId: string) {
  const userResult = await queryControl(
    `
      SELECT two_factor_enabled
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [userId]
  );

  const factorResult = await queryControl(
    `
      SELECT COUNT(*)::int AS count
      FROM user_authenticators
      WHERE user_id = $1
        AND type = 'totp'
        AND status = 'active'
        AND revoked_at IS NULL
        AND deleted_at IS NULL
    `,
    [userId]
  );

  const recoveryCodeCount = await countActiveRecoveryCodes(userId);

  return {
    enabled: Boolean(userResult.rows[0]?.two_factor_enabled),
    authenticatorCount: Number(factorResult.rows[0]?.count || 0),
    recoveryCodeCount,
  };
}

export async function createTwoFactorSetup(input: {
  userId: string;
  email: string;
}) {
  const secret = generateTotpSecret();
  const secretCiphertext = encryptSecret(secret);

  await queryControl(
    `
      UPDATE user_authenticators
      SET
        status = 'revoked',
        revoked_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
        AND type = 'totp'
        AND status = 'pending'
        AND revoked_at IS NULL
        AND deleted_at IS NULL
    `,
    [input.userId]
  );

  const result = await queryControl(
    `
      INSERT INTO user_authenticators (
        user_id,
        type,
        label,
        secret_ciphertext,
        status,
        metadata
      )
      VALUES ($1, 'totp', 'Authenticator app', $2, 'pending', $3)
      RETURNING id
    `,
    [
      input.userId,
      secretCiphertext,
      JSON.stringify({
        issuer: 'SaMi',
        email: input.email,
      }),
    ]
  );

  return {
    authenticatorId: result.rows[0].id as string,
    secret,
    otpAuthUrl: createOtpAuthUrl({
      issuer: 'SaMi',
      accountName: input.email,
      secret,
    }),
  };
}

export async function confirmTwoFactorSetup(input: {
  userId: string;
  authenticatorId: string;
  code: string;
}) {
  const result = await queryControl(
    `
      SELECT id, secret_ciphertext
      FROM user_authenticators
      WHERE id = $1
        AND user_id = $2
        AND type = 'totp'
        AND status = 'pending'
        AND revoked_at IS NULL
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.authenticatorId, input.userId]
  );

  const authenticator = result.rows[0];

  if (!authenticator?.secret_ciphertext) {
    return {
      success: false,
      recoveryCodes: [] as string[],
    };
  }

  const secret = decryptSecret(authenticator.secret_ciphertext);
  const valid = verifyTotpCode(secret, input.code);

  if (!valid) {
    return {
      success: false,
      recoveryCodes: [] as string[],
    };
  }

  await queryControl(
    `
      UPDATE user_authenticators
      SET
        status = 'active',
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
    `,
    [input.authenticatorId, input.userId]
  );

  await queryControl(
    `
      UPDATE users
      SET
        two_factor_enabled = TRUE,
        two_factor_enabled_at = NOW(),
        failed_two_factor_attempts = 0,
        updated_at = NOW()
      WHERE id = $1
    `,
    [input.userId]
  );

  const recoveryCodes = await createRecoveryCodes(input.userId);

  return {
    success: true,
    recoveryCodes,
  };
}

export async function verifyUserTwoFactorCode(input: {
  userId: string;
  code: string;
}) {
  const cleanCode = input.code.trim();

  if (!cleanCode) {
    return false;
  }

  if (cleanCode.replace(/\D/g, '').length === 6) {
    const result = await queryControl(
      `
        SELECT id, secret_ciphertext
        FROM user_authenticators
        WHERE user_id = $1
          AND type = 'totp'
          AND status = 'active'
          AND revoked_at IS NULL
          AND deleted_at IS NULL
        ORDER BY confirmed_at DESC NULLS LAST
      `,
      [input.userId]
    );

    for (const row of result.rows) {
      if (!row.secret_ciphertext) continue;

      const secret = decryptSecret(row.secret_ciphertext);

      if (verifyTotpCode(secret, cleanCode)) {
        await queryControl(
          `
            UPDATE user_authenticators
            SET
              last_used_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `,
          [row.id]
        );

        await queryControl(
          `
            UPDATE users
            SET
              failed_two_factor_attempts = 0,
              updated_at = NOW()
            WHERE id = $1
          `,
          [input.userId]
        );

        return true;
      }
    }
  }

  const recoveryValid = await consumeRecoveryCode(
    input.userId,
    cleanCode
  );

  if (recoveryValid) {
    await queryControl(
      `
        UPDATE users
        SET
          failed_two_factor_attempts = 0,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.userId]
    );

    return true;
  }

  await queryControl(
    `
      UPDATE users
      SET
        failed_two_factor_attempts = failed_two_factor_attempts + 1,
        updated_at = NOW()
      WHERE id = $1
    `,
    [input.userId]
  );

  return false;
}

export async function disableTwoFactor(userId: string) {
  await queryControl(
    `
      UPDATE user_authenticators
      SET
        status = 'revoked',
        revoked_at = NOW(),
        updated_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND deleted_at IS NULL
    `,
    [userId]
  );

  await queryControl(
    `
      UPDATE user_recovery_codes
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
        AND revoked_at IS NULL
    `,
    [userId]
  );

  await queryControl(
    `
      UPDATE users
      SET
        two_factor_enabled = FALSE,
        two_factor_enabled_at = NULL,
        failed_two_factor_attempts = 0,
        updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );
}