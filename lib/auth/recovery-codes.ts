import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';

function normalizeRecoveryCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hashRecoveryCode(code: string): string {
  const pepper =
    process.env.AUTH_RECOVERY_CODE_PEPPER ||
    process.env.AUTH_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    '';

  return crypto
    .createHash('sha256')
    .update(`${normalizeRecoveryCode(code)}:${pepper}`)
    .digest('hex');
}

function createPlainRecoveryCode(): string {
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();

  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export async function createRecoveryCodes(
  userId: string,
  count = 10
): Promise<string[]> {
  const codes = Array.from({ length: count }, () =>
    createPlainRecoveryCode()
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

  for (const code of codes) {
    await queryControl(
      `
        INSERT INTO user_recovery_codes (
          user_id,
          code_hash
        )
        VALUES ($1, $2)
      `,
      [userId, hashRecoveryCode(code)]
    );
  }

  return codes;
}

export async function countActiveRecoveryCodes(
  userId: string
): Promise<number> {
  const result = await queryControl(
    `
      SELECT COUNT(*)::int AS count
      FROM user_recovery_codes
      WHERE user_id = $1
        AND used_at IS NULL
        AND revoked_at IS NULL
    `,
    [userId]
  );

  return Number(result.rows[0]?.count || 0);
}

export async function consumeRecoveryCode(
  userId: string,
  code: string
): Promise<boolean> {
  const codeHash = hashRecoveryCode(code);

  const result = await queryControl(
    `
      UPDATE user_recovery_codes
      SET used_at = NOW()
      WHERE id = (
        SELECT id
        FROM user_recovery_codes
        WHERE user_id = $1
          AND code_hash = $2
          AND used_at IS NULL
          AND revoked_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING id
    `,
    [userId, codeHash]
  );

  return result.rows.length > 0;
}