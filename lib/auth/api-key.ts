import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

export async function verifyApiKey(apiKey: string) {
  try {
    if (!apiKey) {
      return null;
    }

    // Remove "Bearer " prefix if present
    const key = apiKey.replace('Bearer ', '');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const result = await queryControl(
      `SELECT ak.*, u.id as user_id, u.email
       FROM api_keys ak
       INNER JOIN users u ON u.id = ak.user_id
       WHERE ak.key_hash = $1 
         AND ak.deleted_at IS NULL
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
         AND u.status = 'active'`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const apiKeyData = result.rows[0];

    // Update last_used
    await queryControl(
      `UPDATE api_keys SET last_used = NOW() WHERE id = $1`,
      [apiKeyData.id]
    );

    return {
      userId: apiKeyData.user_id,
      email: apiKeyData.email,
      permissions: apiKeyData.permissions || ['read'],
    };

  } catch (error) {
    console.error('API key verification error:', error);
    return null;
  }
}