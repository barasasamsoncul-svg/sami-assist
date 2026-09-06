import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';

function hashChallengeToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

export async function createLoginChallenge(input: {
  userId: string;
  email: string;
  rememberMe: boolean;
}) {
  const challengeToken = crypto.randomBytes(32).toString('base64url');
  const challengeTokenHash = hashChallengeToken(challengeToken);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await queryControl(
    `
      UPDATE login_challenges
      SET status = 'expired'
      WHERE user_id = $1
        AND status = 'pending'
        AND expires_at < NOW()
    `,
    [input.userId]
  );

  await queryControl(
    `
      UPDATE login_challenges
      SET status = 'revoked'
      WHERE user_id = $1
        AND type = 'two_factor'
        AND status = 'pending'
    `,
    [input.userId]
  );

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
      VALUES ($1, $2, 'two_factor', 'pending', $3, $4)
    `,
    [
      input.userId,
      challengeTokenHash,
      expiresAt,
      JSON.stringify({
        email: input.email,
        rememberMe: input.rememberMe,
      }),
    ]
  );

  return {
    challengeToken,
    expiresAt,
  };
}

export async function getValidLoginChallenge(input: {
  email: string;
  challengeToken: string;
}) {
  const challengeTokenHash = hashChallengeToken(input.challengeToken);

  const result = await queryControl(
    `
      SELECT
        lc.id,
        lc.user_id,
        lc.expires_at,
        lc.metadata,
        u.email
      FROM login_challenges lc
      INNER JOIN users u ON u.id = lc.user_id
      WHERE lc.challenge_token_hash = $1
        AND LOWER(u.email) = LOWER($2)
        AND lc.type = 'two_factor'
        AND lc.status = 'pending'
        AND lc.used_at IS NULL
        AND lc.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1
    `,
    [challengeTokenHash, input.email]
  );

  return result.rows[0] || null;
}

export async function markLoginChallengeUsed(
  challengeId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE login_challenges
      SET
        status = 'used',
        used_at = NOW()
      WHERE id = $1
    `,
    [challengeId]
  );
}