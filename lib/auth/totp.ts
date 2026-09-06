import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function getEncryptionKey(): Buffer {
  const secret =
    process.env.AUTH_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.POSTGRES_ADMIN_PASSWORD;

  if (!secret) {
    throw new Error(
      'AUTH_ENCRYPTION_KEY is missing. Add it to .env.local.'
    );
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptSecret(value: string): string {
  const [version, ivText, tagText, encryptedText] = value.split(':');

  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw new Error('Invalid encrypted secret format.');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const encrypted = Buffer.from(encryptedText, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

function base32Encode(buffer: Buffer): string {
  let bits = '';
  let output = '';

  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }

  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return output;
}

function base32Decode(value: string): Buffer {
  const clean = value
    .replace(/=+$/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();

  let bits = '';

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error('Invalid base32 character.');
    }

    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);

  buffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto
    .createHmac('sha1', key)
    .update(buffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0xf;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1
): boolean {
  const cleanCode = code.replace(/\D/g, '');

  if (cleanCode.length !== 6) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 30_000);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotpCode(secret, currentCounter + offset);

    if (
      crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(cleanCode)
      )
    ) {
      return true;
    }
  }

  return false;
}

export function createOtpAuthUrl(input: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${input.issuer}:${input.accountName}`;

  return `otpauth://totp/${encodeURIComponent(
    label
  )}?secret=${encodeURIComponent(
    input.secret
  )}&issuer=${encodeURIComponent(input.issuer)}&algorithm=SHA1&digits=6&period=30`;
}