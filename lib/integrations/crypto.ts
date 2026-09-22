import 'server-only';

import crypto from 'node:crypto';

const ALGORITHM =
  'aes-256-gcm';

const IV_BYTES =
  12;

function normalizeVersion(
  value:
    string | null | undefined,
) {
  const version =
    (
      value ||
      'v1'
    )
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9_-]{1,32}$/.test(
      version,
    )
  ) {
    throw new Error(
      'Invalid SaMi integration encryption-key version.',
    );
  }

  return version;
}

function parseKey(
  value:
    string,
) {
  const trimmed =
    value.trim();

  if (
    /^[0-9a-f]{64}$/i.test(
      trimmed,
    )
  ) {
    return Buffer.from(
      trimmed,
      'hex',
    );
  }

  const decoded =
    Buffer.from(
      trimmed,
      'base64',
    );

  if (
    decoded.length !==
      32
  ) {
    throw new Error(
      'SaMi integration encryption key must decode to exactly 32 bytes.',
    );
  }

  return decoded;
}

function keyForVersion(
  version:
    string,
) {
  const envName =
    'SAMI_INTEGRATION_ENCRYPTION_KEY_' +
    version.toUpperCase();

  const value =
    process.env[
      envName
    ]?.trim();

  if (
    !value
  ) {
    throw new Error(
      'SaMi integration encryption key is not configured.',
    );
  }

  return parseKey(
    value,
  );
}

export function currentIntegrationKeyVersion() {
  return normalizeVersion(
    process.env
      .SAMI_INTEGRATION_ENCRYPTION_KEY_VERSION,
  );
}

export function sealIntegrationSecret(
  value:
    unknown,
) {
  const version =
    currentIntegrationKeyVersion();

  const key =
    keyForVersion(
      version,
    );

  const iv =
    crypto.randomBytes(
      IV_BYTES,
    );

  const cipher =
    crypto.createCipheriv(
      ALGORITHM,
      key,
      iv,
    );

  const plaintext =
    Buffer.from(
      JSON.stringify(
        value,
      ),
      'utf8',
    );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        plaintext,
      ),
      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return {
    version,
    sealed:
      [
        version,
        iv.toString(
          'base64url',
        ),
        tag.toString(
          'base64url',
        ),
        ciphertext.toString(
          'base64url',
        ),
      ].join(
        '.',
      ),
  };
}

export function openIntegrationSecret<T>(
  sealed:
    string,
): T {
  const parts =
    sealed.split(
      '.',
    );

  if (
    parts.length !==
      4
  ) {
    throw new Error(
      'Invalid encrypted integration credential.',
    );
  }

  const [
    versionRaw,
    ivRaw,
    tagRaw,
    ciphertextRaw,
  ] =
    parts;

  const version =
    normalizeVersion(
      versionRaw,
    );

  const key =
    keyForVersion(
      version,
    );

  const decipher =
    crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(
        ivRaw,
        'base64url',
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      tagRaw,
      'base64url',
    ),
  );

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          ciphertextRaw,
          'base64url',
        ),
      ),
      decipher.final(),
    ]);

  return JSON.parse(
    plaintext.toString(
      'utf8',
    ),
  ) as T;
}

export function hashIntegrationToken(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}

export function generateIntegrationToken(
  bytes =
    32,
) {
  return crypto
    .randomBytes(
      bytes,
    )
    .toString(
      'base64url',
    );
}
