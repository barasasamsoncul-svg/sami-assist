import 'server-only';

import crypto from 'node:crypto';

const PUBLIC_ID_BYTES =
  16;

const SECRET_BYTES =
  32;

export function generateDeveloperPublicId() {
  return crypto
    .randomBytes(
      PUBLIC_ID_BYTES,
    )
    .toString(
      'base64url',
    );
}

export function generateDeveloperSecret() {
  return crypto
    .randomBytes(
      SECRET_BYTES,
    )
    .toString(
      'base64url',
    );
}

export function hashDeveloperSecret(
  secret:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      secret,
      'utf8',
    )
    .digest(
      'hex',
    );
}

export function developerSecretMatches(
  secret:
    string,
  storedHash:
    string,
) {
  const candidate =
    Buffer.from(
      hashDeveloperSecret(
        secret,
      ),
      'hex',
    );

  const stored =
    Buffer.from(
      storedHash,
      'hex',
    );

  return (
    candidate.length ===
      stored.length &&
    crypto.timingSafeEqual(
      candidate,
      stored,
    )
  );
}

export function formatDeveloperApiKey(
  tenantId:
    string,
  publicId:
    string,
  secret:
    string,
) {
  return [
    'sami',
    'live',
    tenantId,
    publicId,
    secret,
  ].join(
    '_',
  );
}

export function developerKeyHint(
  secret:
    string,
) {
  return secret.slice(
    -4,
  );
}
