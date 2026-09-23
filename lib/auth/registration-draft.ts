import 'server-only';

import crypto from 'crypto';


export const REGISTRATION_DRAFT_COOKIE_NAME =
  process.env.NODE_ENV ===
  'production'
    ? '__Host-sami_registration_draft'
    : 'sami_registration_draft';


export const REGISTRATION_DRAFT_TTL_SECONDS =
  30 *
  60;


export type RegistrationDraftMode =
  | 'email'
  | 'google'
  | 'existing';


export type RegistrationDraft = {
  version:
    1;

  mode:
    RegistrationDraftMode;

  email:
    string;

  firstName:
    string;

  lastName:
    string;

  phone:
    string | null;

  businessName:
    string;

  passwordHash:
    string | null;

  userId:
    string | null;

  googleStateHash:
    string | null;

  createdAt:
    string;

  expiresAt:
    string;

  nonce:
    string;
};


function requiredSecret() {
  const value =
    process.env
      .SAMI_REGISTRATION_DRAFT_SECRET
      ?.trim();

  if (
    !value ||
    value.length <
      32
  ) {
    throw new Error(
      'SAMI_REGISTRATION_DRAFT_SECRET must be configured with at least 32 characters.',
    );
  }

  return value;
}


function encryptionKey() {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      requiredSecret(),
      'utf8',
    )
    .digest();
}


function encode(
  value:
    Buffer,
) {
  return value
    .toString(
      'base64url',
    );
}


function decode(
  value:
    string,
) {
  return Buffer.from(
    value,
    'base64url',
  );
}


export function createRegistrationDraft(
  input: Omit<
    RegistrationDraft,
    | 'version'
    | 'createdAt'
    | 'expiresAt'
    | 'nonce'
  >,
) {
  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
      REGISTRATION_DRAFT_TTL_SECONDS *
        1000,
    );

  const draft:
    RegistrationDraft = {
      version:
        1,

      ...input,

      createdAt:
        now.toISOString(),

      expiresAt:
        expiresAt
          .toISOString(),

      nonce:
        crypto
          .randomUUID(),
    };

  const iv =
    crypto
      .randomBytes(
        12,
      );

  const cipher =
    crypto
      .createCipheriv(
        'aes-256-gcm',
        encryptionKey(),
        iv,
      );

  cipher.setAAD(
    Buffer.from(
      'sami-registration-draft-v1',
      'utf8',
    ),
  );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        JSON.stringify(
          draft,
        ),
        'utf8',
      ),

      cipher.final(),
    ]);

  const tag =
    cipher
      .getAuthTag();

  return [
    'v1',
    encode(
      iv,
    ),
    encode(
      tag,
    ),
    encode(
      ciphertext,
    ),
  ].join(
    '.',
  );
}


export function readRegistrationDraft(
  value:
    string | null | undefined,
): RegistrationDraft | null {
  if (
    !value
  ) {
    return null;
  }

  const parts =
    value.split(
      '.',
    );

  if (
    parts.length !==
      4 ||
    parts[0] !==
      'v1'
  ) {
    return null;
  }

  try {
    const iv =
      decode(
        parts[1],
      );

    const tag =
      decode(
        parts[2],
      );

    const ciphertext =
      decode(
        parts[3],
      );

    const decipher =
      crypto
        .createDecipheriv(
          'aes-256-gcm',
          encryptionKey(),
          iv,
        );

    decipher.setAAD(
      Buffer.from(
        'sami-registration-draft-v1',
        'utf8',
      ),
    );

    decipher.setAuthTag(
      tag,
    );

    const plaintext =
      Buffer.concat([
        decipher.update(
          ciphertext,
        ),

        decipher.final(),
      ])
        .toString(
          'utf8',
        );

    const parsed =
      JSON.parse(
        plaintext,
      ) as
        Partial<
          RegistrationDraft
        >;

    if (
      parsed.version !==
        1 ||
      ![
        'email',
        'google',
        'existing',
      ].includes(
        String(
          parsed.mode ||
          '',
        ),
      ) ||
      typeof parsed.email !==
        'string' ||
      typeof parsed.businessName !==
        'string' ||
      typeof parsed.expiresAt !==
        'string'
    ) {
      return null;
    }

    const expiresAt =
      new Date(
        parsed.expiresAt,
      );

    if (
      Number.isNaN(
        expiresAt
          .getTime(),
      ) ||
      expiresAt.getTime() <=
        Date.now()
    ) {
      return null;
    }

    return parsed as
      RegistrationDraft;
  } catch {
    return null;
  }
}


export function registrationDraftCookieOptions(
  maxAge =
    REGISTRATION_DRAFT_TTL_SECONDS,
) {
  return {
    httpOnly:
      true,

    secure:
      process.env.NODE_ENV ===
      'production',

    sameSite:
      'lax' as const,

    path:
      '/',

    maxAge,
  };
}


export function clearRegistrationDraftCookieOptions() {
  return registrationDraftCookieOptions(
    0,
  );
}
