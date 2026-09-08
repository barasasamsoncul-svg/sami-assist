import crypto from 'crypto';

/* ============================================================
   CONSTANTS
   ============================================================ */

const BASE32_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const TOTP_SECRET_BYTES =
  20;

const TOTP_DIGITS =
  6;

const TOTP_PERIOD_SECONDS =
  30;

const DEFAULT_TOTP_WINDOW =
  1;

const MAX_TOTP_WINDOW =
  5;

const AES_GCM_IV_BYTES =
  12;

const AES_GCM_TAG_BYTES =
  16;

const ENCRYPTION_VERSION =
  'v1';

/* ============================================================
   ENCRYPTION KEY

   IMPORTANT:

   AUTH_ENCRYPTION_KEY is intentionally the ONLY accepted key
   source.

   Do not fall back to:
   - database passwords
   - session secrets
   - OAuth secrets
   - NEXTAUTH_SECRET

   TOTP secrets must remain decryptable for the lifetime of the
   authenticator, so this key must be stable.
   ============================================================ */

function getEncryptionKey(): Buffer {
  const secret =
    process.env
      .AUTH_ENCRYPTION_KEY
      ?.trim();

  if (!secret) {
    throw new Error(
      'AUTH_ENCRYPTION_KEY is missing. Add a stable encryption key to .env.local.'
    );
  }

  /*
   * Preserve the original SaMi derivation method:
   *
   * SHA-256(environment secret) -> 32-byte AES-256 key.
   *
   * This keeps existing ciphertext compatible when it was
   * encrypted with AUTH_ENCRYPTION_KEY.
   */
  return crypto
    .createHash('sha256')
    .update(
      secret,
      'utf8'
    )
    .digest();
}

/* ============================================================
   RANDOM TOTP SECRET
   ============================================================ */

export function generateTotpSecret():
  string {
  return base32Encode(
    crypto.randomBytes(
      TOTP_SECRET_BYTES
    )
  );
}

/* ============================================================
   SECRET ENCRYPTION

   AES-256-GCM provides:
   - confidentiality
   - integrity/authentication

   Stored format:

   v1:<iv>:<authentication-tag>:<ciphertext>
   ============================================================ */

export function encryptSecret(
  value: string
): string {
  const normalized =
    value
      .trim()
      .toUpperCase();

  if (!normalized) {
    throw new Error(
      'TOTP secret cannot be empty.'
    );
  }

  /*
   * Validate the secret before encrypting it.
   */
  base32Decode(
    normalized
  );

  const iv =
    crypto.randomBytes(
      AES_GCM_IV_BYTES
    );

  const key =
    getEncryptionKey();

  const cipher =
    crypto.createCipheriv(
      'aes-256-gcm',
      key,
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        normalized,
        'utf8'
      ),

      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,

    iv.toString(
      'base64url'
    ),

    tag.toString(
      'base64url'
    ),

    encrypted.toString(
      'base64url'
    ),
  ].join(':');
}

/* ============================================================
   SECRET DECRYPTION
   ============================================================ */

export function decryptSecret(
  value: string
): string {
  if (
    typeof value !==
      'string' ||
    !value
  ) {
    throw new Error(
      'Encrypted secret is invalid.'
    );
  }

  const parts =
    value.split(':');

  if (
    parts.length !==
    4
  ) {
    throw new Error(
      'Invalid encrypted secret format.'
    );
  }

  const [
    version,
    ivText,
    tagText,
    encryptedText,
  ] = parts;

  if (
    version !==
      ENCRYPTION_VERSION ||
    !ivText ||
    !tagText ||
    !encryptedText
  ) {
    throw new Error(
      'Invalid encrypted secret format.'
    );
  }

  let iv:
    Buffer;

  let tag:
    Buffer;

  let encrypted:
    Buffer;

  try {
    iv =
      Buffer.from(
        ivText,
        'base64url'
      );

    tag =
      Buffer.from(
        tagText,
        'base64url'
      );

    encrypted =
      Buffer.from(
        encryptedText,
        'base64url'
      );
  } catch {
    throw new Error(
      'Encrypted secret encoding is invalid.'
    );
  }

  if (
    iv.length !==
    AES_GCM_IV_BYTES
  ) {
    throw new Error(
      'Encrypted secret IV is invalid.'
    );
  }

  if (
    tag.length !==
    AES_GCM_TAG_BYTES
  ) {
    throw new Error(
      'Encrypted secret authentication tag is invalid.'
    );
  }

  if (
    encrypted.length ===
    0
  ) {
    throw new Error(
      'Encrypted secret payload is empty.'
    );
  }

  const key =
    getEncryptionKey();

  try {
    const decipher =
      crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        iv
      );

    decipher.setAuthTag(
      tag
    );

    const decrypted =
      Buffer.concat([
        decipher.update(
          encrypted
        ),

        decipher.final(),
      ])
        .toString('utf8')
        .trim()
        .toUpperCase();

    if (!decrypted) {
      throw new Error(
        'Decrypted secret is empty.'
      );
    }

    /*
     * Confirm the decrypted value is still a legitimate
     * base32 TOTP secret.
     */
    base32Decode(
      decrypted
    );

    return decrypted;
  } catch {
    /*
     * Do not expose whether failure came from:
     * - wrong key
     * - corrupted ciphertext
     * - invalid authentication tag
     */
    throw new Error(
      'TOTP secret could not be decrypted.'
    );
  }
}

/* ============================================================
   BASE32 ENCODE
   ============================================================ */

function base32Encode(
  buffer: Buffer
): string {
  if (
    buffer.length ===
    0
  ) {
    return '';
  }

  let bits = '';

  let output = '';

  for (
    const byte of buffer
  ) {
    bits +=
      byte
        .toString(2)
        .padStart(
          8,
          '0'
        );
  }

  for (
    let index = 0;
    index < bits.length;
    index += 5
  ) {
    const chunk =
      bits
        .slice(
          index,
          index + 5
        )
        .padEnd(
          5,
          '0'
        );

    const alphabetIndex =
      Number.parseInt(
        chunk,
        2
      );

    output +=
      BASE32_ALPHABET[
        alphabetIndex
      ];
  }

  return output;
}

/* ============================================================
   BASE32 DECODE
   ============================================================ */

function base32Decode(
  value: string
): Buffer {
  const clean =
    value
      .trim()
      .replace(
        /=+$/g,
        ''
      )
      .replace(
        /\s+/g,
        ''
      )
      .toUpperCase();

  if (!clean) {
    throw new Error(
      'Base32 secret is empty.'
    );
  }

  /*
   * Reject invalid characters explicitly rather than silently
   * transforming them.
   */
  if (
    !/^[A-Z2-7]+$/.test(
      clean
    )
  ) {
    throw new Error(
      'Invalid base32 secret.'
    );
  }

  let bits = '';

  for (
    const char of clean
  ) {
    const alphabetIndex =
      BASE32_ALPHABET.indexOf(
        char
      );

    if (
      alphabetIndex <
      0
    ) {
      throw new Error(
        'Invalid base32 character.'
      );
    }

    bits +=
      alphabetIndex
        .toString(2)
        .padStart(
          5,
          '0'
        );
  }

  const bytes:
    number[] = [];

  for (
    let index = 0;
    index + 8 <=
      bits.length;
    index += 8
  ) {
    bytes.push(
      Number.parseInt(
        bits.slice(
          index,
          index + 8
        ),
        2
      )
    );
  }

  if (
    bytes.length ===
    0
  ) {
    throw new Error(
      'Decoded TOTP secret is empty.'
    );
  }

  return Buffer.from(
    bytes
  );
}

/* ============================================================
   HOTP/TOTP CODE
   ============================================================ */

function generateTotpCode(
  secret: string,
  counter: number
): string {
  if (
    !Number.isSafeInteger(
      counter
    ) ||
    counter < 0
  ) {
    throw new Error(
      'Invalid TOTP counter.'
    );
  }

  const key =
    base32Decode(
      secret
    );

  const counterBuffer =
    Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(
    BigInt(
      counter
    )
  );

  /*
   * TOTP compatibility:
   *
   * HMAC-SHA1
   * 6 digits
   * 30-second period
   *
   * This is the widely supported authenticator-app format.
   */
  const hmac =
    crypto
      .createHmac(
        'sha1',
        key
      )
      .update(
        counterBuffer
      )
      .digest();

  const offset =
    hmac[
      hmac.length - 1
    ] &
    0x0f;

  const binary =
    (
      (
        hmac[offset] &
        0x7f
      ) <<
      24
    ) |
    (
      (
        hmac[offset + 1] &
        0xff
      ) <<
      16
    ) |
    (
      (
        hmac[offset + 2] &
        0xff
      ) <<
      8
    ) |
    (
      hmac[offset + 3] &
      0xff
    );

  return String(
    binary %
      10 **
        TOTP_DIGITS
  ).padStart(
    TOTP_DIGITS,
    '0'
  );
}

/* ============================================================
   VERIFY TOTP

   Default window = 1

   This permits:
     previous 30-second period
     current 30-second period
     next 30-second period

   That provides modest clock-skew tolerance without making the
   acceptance window unnecessarily large.
   ============================================================ */

export function verifyTotpCode(
  secret: string,
  code: string,
  window =
    DEFAULT_TOTP_WINDOW
): boolean {
  const cleanCode =
    code.trim();

  /*
   * Be strict here.

   * Do NOT turn:
   *
   *   abc123456
   *   12-34-56
   *
   * into a valid TOTP.
   */
  if (
    !/^\d{6}$/.test(
      cleanCode
    )
  ) {
    return false;
  }

  if (
    !Number.isInteger(
      window
    ) ||
    window < 0 ||
    window >
      MAX_TOTP_WINDOW
  ) {
    return false;
  }

  const currentCounter =
    Math.floor(
      Date.now() /
        (
          TOTP_PERIOD_SECONDS *
          1000
        )
    );

  try {
    for (
      let offset =
        -window;
      offset <=
      window;
      offset += 1
    ) {
      const counter =
        currentCounter +
        offset;

      if (
        counter < 0
      ) {
        continue;
      }

      const expected =
        generateTotpCode(
          secret,
          counter
        );

      /*
       * Both values are exactly six ASCII digits, therefore
       * timingSafeEqual receives equal-length buffers.
       */
      const expectedBuffer =
        Buffer.from(
          expected,
          'ascii'
        );

      const providedBuffer =
        Buffer.from(
          cleanCode,
          'ascii'
        );

      if (
        crypto.timingSafeEqual(
          expectedBuffer,
          providedBuffer
        )
      ) {
        return true;
      }
    }
  } catch (error) {
    /*
     * A damaged/invalid stored secret should be treated as an
     * invalid authenticator, not as a server crash.
     */
    console.error(
      '[SaMi] TOTP verification failed because the authenticator secret is invalid:',
      error
    );

    return false;
  }

  return false;
}

/* ============================================================
   OTpauth URI

   Compatible with common authenticator applications.
   ============================================================ */

export function createOtpAuthUrl(
  input: {
    issuer: string;
    accountName: string;
    secret: string;
  }
): string {
  const issuer =
    input.issuer
      .trim();

  const accountName =
    input.accountName
      .trim();

  const secret =
    input.secret
      .trim()
      .replace(
        /\s+/g,
        ''
      )
      .toUpperCase();

  if (!issuer) {
    throw new Error(
      'TOTP issuer is required.'
    );
  }

  if (!accountName) {
    throw new Error(
      'TOTP account name is required.'
    );
  }

  /*
   * Validate before giving it to an authenticator application.
   */
  base32Decode(
    secret
  );

  const label =
    `${issuer}:${accountName}`;

  const params =
    new URLSearchParams({
      secret,

      issuer,

      algorithm:
        'SHA1',

      digits:
        String(
          TOTP_DIGITS
        ),

      period:
        String(
          TOTP_PERIOD_SECONDS
        ),
    });

  return (
    `otpauth://totp/` +
    `${encodeURIComponent(
      label
    )}?${params.toString()}`
  );
}