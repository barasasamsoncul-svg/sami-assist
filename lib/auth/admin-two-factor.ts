import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';

import {
  decryptSecret,
  encryptSecret,
} from '@/lib/auth/totp';

/* ============================================================
   CONSTANTS
   ============================================================ */

const ADMIN_TOTP_ISSUER =
  'SaMi Admin';

const ADMIN_TOTP_SECRET_BYTES =
  20;

const ADMIN_TOTP_STEP_SECONDS =
  30;

const ADMIN_TOTP_DIGITS =
  6;

const ADMIN_TOTP_WINDOW =
  1;

const ADMIN_RECOVERY_CODE_COUNT =
  10;

const ADMIN_RECOVERY_CODE_BYTES =
  8;

/* ============================================================
   TYPES
   ============================================================ */

export type AdminTwoFactorMethod =
  | 'authenticator'
  | 'email';

export type AdminTwoFactor = {
  id: string;

  adminId: string;

  method:
    AdminTwoFactorMethod;

  enabled:
    boolean;

  verifiedAt:
    Date | null;

  lastUsedAt:
    Date | null;

  createdAt:
    Date;

  updatedAt:
    Date;
};

export type AdminRecoveryCode = {
  id: string;

  adminId: string;

  codeHash: string;

  usedAt: Date | null;

  createdAt: Date;
};

export type AdminTwoFactorSetup = {
  secret: string;

  otpauthUrl: string;
};

type AdminTwoFactorRow = {
  id: string;

  admin_id: string;

  method:
    AdminTwoFactorMethod;

  secret_encrypted:
    string | null;

  pending_secret_encrypted:
    string | null;

  enabled:
    boolean;

  verified_at:
    Date | string | null;

  last_used_at:
    Date | string | null;

  created_at:
    Date | string;

  updated_at:
    Date | string;
};

type AdminRecoveryCodeRow = {
  id: string;

  admin_id: string;

  code_hash: string;

  used_at:
    Date | string | null;

  created_at:
    Date | string;
};

/* ============================================================
   BASE32
   ============================================================ */

const BASE32_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(
  buffer:
    Buffer
): string {
  let bits =
    '';

  let output =
    '';

  for (
    const byte of
    buffer
  ) {
    bits +=
      byte
        .toString(
          2
        )
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

    output +=
      BASE32_ALPHABET[
        parseInt(
          chunk,
          2
        )
      ];
  }

  return output;
}

function base32Decode(
  value:
    string
): Buffer {
  const clean =
    value
      .replace(
        /=+$/g,
        ''
      )
      .replace(
        /\s+/g,
        ''
      )
      .toUpperCase();

  let bits =
    '';

  for (
    const char of
    clean
  ) {
    const index =
      BASE32_ALPHABET.indexOf(
        char
      );

    if (
      index === -1
    ) {
      throw new Error(
        'Invalid base32 secret.'
      );
    }

    bits +=
      index
        .toString(
          2
        )
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
      parseInt(
        bits.slice(
          index,
          index + 8
        ),
        2
      )
    );
  }

  return Buffer.from(
    bytes
  );
}

/* ============================================================
   TOTP
   ============================================================ */

function createTotpSecret():
  string {
  return base32Encode(
    crypto.randomBytes(
      ADMIN_TOTP_SECRET_BYTES
    )
  );
}

function createTotpCode(
  secret:
    string,
  timeStep:
    number
): string {
  const key =
    base32Decode(
      secret
    );

  const counter =
    Buffer.alloc(
      8
    );

  counter.writeBigUInt64BE(
    BigInt(
      timeStep
    )
  );

  const hmac =
    crypto
      .createHmac(
        'sha1',
        key
      )
      .update(
        counter
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
        hmac[
          offset
        ] &
        0x7f
      ) <<
      24
    ) |
    (
      (
        hmac[
          offset + 1
        ] &
        0xff
      ) <<
      16
    ) |
    (
      (
        hmac[
          offset + 2
        ] &
        0xff
      ) <<
      8
    ) |
    (
      hmac[
        offset + 3
      ] &
      0xff
    );

  const token =
    binary %
    10 **
      ADMIN_TOTP_DIGITS;

  return token
    .toString()
    .padStart(
      ADMIN_TOTP_DIGITS,
      '0'
    );
}

function timingSafeEqualString(
  left:
    string,
  right:
    string
): boolean {
  const leftBuffer =
    Buffer.from(
      left
    );

  const rightBuffer =
    Buffer.from(
      right
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return crypto
    .timingSafeEqual(
      leftBuffer,
      rightBuffer
    );
}

function normalizeTotpCode(
  code:
    string
): string {
  return code
    .replace(
      /\s+/g,
      ''
    )
    .trim();
}

export function verifyAdminTotpCode(
  input: {
    secret: string;
    code: string;
    now?: Date;
  }
): boolean {
  const code =
    normalizeTotpCode(
      input.code
    );

  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    return false;
  }

  const now =
    input.now ??
    new Date();

  const currentStep =
    Math.floor(
      now.getTime() /
        1000 /
        ADMIN_TOTP_STEP_SECONDS
    );

  for (
    let offset =
      -ADMIN_TOTP_WINDOW;

    offset <=
    ADMIN_TOTP_WINDOW;

    offset += 1
  ) {
    const expected =
      createTotpCode(
        input.secret,
        currentStep +
          offset
      );

    if (
      timingSafeEqualString(
        expected,
        code
      )
    ) {
      return true;
    }
  }

  return false;
}

/* ============================================================
   OTPAUTH URL
   ============================================================ */

function createOtpAuthUrl(
  input: {
    email: string;
    secret: string;
  }
): string {
  const label =
    encodeURIComponent(
      `${ADMIN_TOTP_ISSUER}:${input.email}`
    );

  const issuer =
    encodeURIComponent(
      ADMIN_TOTP_ISSUER
    );

  return (
    `otpauth://totp/${label}` +
    `?secret=${input.secret}` +
    `&issuer=${issuer}` +
    `&algorithm=SHA1` +
    `&digits=${ADMIN_TOTP_DIGITS}` +
    `&period=${ADMIN_TOTP_STEP_SECONDS}`
  );
}

/* ============================================================
   ROW MAPPING
   ============================================================ */

function mapAdminTwoFactorRow(
  row:
    AdminTwoFactorRow
): AdminTwoFactor {
  return {
    id:
      row.id,

    adminId:
      row.admin_id,

    method:
      row.method,

    enabled:
      row.enabled,

    verifiedAt:
      row.verified_at
        ? new Date(
            row.verified_at
          )
        : null,

    lastUsedAt:
      row.last_used_at
        ? new Date(
            row.last_used_at
          )
        : null,

    createdAt:
      new Date(
        row.created_at
      ),

    updatedAt:
      new Date(
        row.updated_at
      ),
  };
}

function mapAdminRecoveryCodeRow(
  row:
    AdminRecoveryCodeRow
): AdminRecoveryCode {
  return {
    id:
      row.id,

    adminId:
      row.admin_id,

    codeHash:
      row.code_hash,

    usedAt:
      row.used_at
        ? new Date(
            row.used_at
          )
        : null,

    createdAt:
      new Date(
        row.created_at
      ),
  };
}

/* ============================================================
   GET FACTOR
   ============================================================ */

export async function getAdminTwoFactor(
  adminId:
    string
): Promise<
  AdminTwoFactor | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          admin_id,
          method,
          secret_encrypted,
          pending_secret_encrypted,
          enabled,
          verified_at,
          last_used_at,
          created_at,
          updated_at
        FROM platform_admin_two_factor
        WHERE admin_id = $1
          AND method = 'authenticator'
        LIMIT 1
      `,
      [
        adminId,
      ]
    );

  const row =
    result.rows[0] as
      | AdminTwoFactorRow
      | undefined;

  return row
    ? mapAdminTwoFactorRow(
        row
      )
    : null;
}

/* ============================================================
   ENABLED CHECK
   ============================================================ */

export async function adminHasEnabledTwoFactor(
  adminId:
    string
): Promise<boolean> {
  const result =
    await queryControl(
      `
        SELECT
          id
        FROM platform_admin_two_factor
        WHERE admin_id = $1
          AND method = 'authenticator'
          AND enabled = TRUE
          AND verified_at IS NOT NULL
          AND secret_encrypted IS NOT NULL
        LIMIT 1
      `,
      [
        adminId,
      ]
    );

  return Boolean(
    result.rows[0]
  );
}

/* ============================================================
   CREATE SETUP
   ============================================================ */

export async function createAdminTwoFactorSetup(
  input: {
    adminId: string;
    email: string;
  }
): Promise<AdminTwoFactorSetup> {
  const secret =
    createTotpSecret();

  const encryptedSecret =
    encryptSecret(
      secret
    );

  await queryControl(
    `
      INSERT INTO platform_admin_two_factor (
        admin_id,
        method,
        secret_encrypted,
        pending_secret_encrypted,
        enabled,
        verified_at,
        last_used_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'authenticator',
        NULL,
        $2,
        FALSE,
        NULL,
        NULL,
        NOW(),
        NOW()
      )

      ON CONFLICT (
        admin_id,
        method
      )

      DO UPDATE SET
        pending_secret_encrypted =
          EXCLUDED.pending_secret_encrypted,

        enabled = FALSE,

        verified_at = NULL,

        updated_at = NOW()
    `,
    [
      input.adminId,
      encryptedSecret,
    ]
  );

  return {
    secret,

    otpauthUrl:
      createOtpAuthUrl({
        email:
          input.email,

        secret,
      }),
  };
}

/* ============================================================
   CONFIRM SETUP
   ============================================================ */

export async function confirmAdminTwoFactorSetup(
  input: {
    adminId: string;
    code: string;
  }
): Promise<{
  enabled: boolean;
  recoveryCodes: string[];
}> {
  const result =
    await queryControl(
      `
        SELECT
          pending_secret_encrypted
        FROM platform_admin_two_factor
        WHERE admin_id = $1
          AND method = 'authenticator'
          AND enabled = FALSE
          AND pending_secret_encrypted IS NOT NULL
        LIMIT 1
      `,
      [
        input.adminId,
      ]
    );

  const encryptedSecret =
    result.rows[0]
      ?.pending_secret_encrypted as
      | string
      | undefined;

  if (
    !encryptedSecret
  ) {
    return {
      enabled:
        false,

      recoveryCodes:
        [],
    };
  }

  let secret:
    string;

  try {
    secret =
      decryptSecret(
        encryptedSecret
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin 2FA] Failed to decrypt pending authenticator secret:',
      error
    );

    return {
      enabled:
        false,

      recoveryCodes:
        [],
    };
  }

  const valid =
    verifyAdminTotpCode({
      secret,

      code:
        input.code,
    });

  if (
    !valid
  ) {
    return {
      enabled:
        false,

      recoveryCodes:
        [],
    };
  }

  const activation =
    await queryControl(
      `
        UPDATE platform_admin_two_factor
        SET
          secret_encrypted =
            pending_secret_encrypted,

          pending_secret_encrypted =
            NULL,

          enabled =
            TRUE,

          verified_at =
            NOW(),

          last_used_at =
            NOW(),

          updated_at =
            NOW()

        WHERE admin_id = $1
          AND method = 'authenticator'
          AND enabled = FALSE
          AND pending_secret_encrypted IS NOT NULL

        RETURNING id
      `,
      [
        input.adminId,
      ]
    );

  if (
    !activation.rows[0]
  ) {
    return {
      enabled:
        false,

      recoveryCodes:
        [],
    };
  }

  await queryControl(
    `
      UPDATE platform_admins
      SET
        two_factor_enabled =
          TRUE,

        updated_at =
          NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      input.adminId,
    ]
  );

  const recoveryCodes =
    await regenerateAdminRecoveryCodes(
      input.adminId
    );

  return {
    enabled:
      true,

    recoveryCodes,
  };
}

/* ============================================================
   DISABLE
   ============================================================ */

export async function disableAdminTwoFactor(
  adminId:
    string
): Promise<void> {
  await queryControl(
    `
      UPDATE platform_admin_two_factor
      SET
        secret_encrypted =
          NULL,

        pending_secret_encrypted =
          NULL,

        enabled =
          FALSE,

        verified_at =
          NULL,

        last_used_at =
          NULL,

        updated_at =
          NOW()

      WHERE admin_id = $1
    `,
    [
      adminId,
    ]
  );

  await queryControl(
    `
      DELETE FROM platform_admin_recovery_codes
      WHERE admin_id = $1
    `,
    [
      adminId,
    ]
  );

  await queryControl(
    `
      UPDATE platform_admins
      SET
        two_factor_enabled =
          FALSE,

        updated_at =
          NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      adminId,
    ]
  );
}

/* ============================================================
   VERIFY AUTHENTICATOR
   ============================================================ */

export async function verifyAdminTwoFactorCode(
  input: {
    adminId: string;
    code: string;
  }
): Promise<boolean> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          secret_encrypted
        FROM platform_admin_two_factor
        WHERE admin_id = $1
          AND method = 'authenticator'
          AND enabled = TRUE
          AND verified_at IS NOT NULL
          AND secret_encrypted IS NOT NULL
        LIMIT 1
      `,
      [
        input.adminId,
      ]
    );

  const row =
    result.rows[0] as
      | {
          id:
            string;

          secret_encrypted:
            string;
        }
      | undefined;

  if (
    !row
  ) {
    return false;
  }

  let secret:
    string;

  try {
    secret =
      decryptSecret(
        row.secret_encrypted
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin 2FA] Failed to decrypt authenticator secret:',
      error
    );

    return false;
  }

  const valid =
    verifyAdminTotpCode({
      secret,

      code:
        input.code,
    });

  if (
    !valid
  ) {
    return false;
  }

  await queryControl(
    `
      UPDATE platform_admin_two_factor
      SET
        last_used_at =
          NOW(),

        updated_at =
          NOW()

      WHERE id = $1
        AND admin_id = $2
        AND enabled = TRUE
    `,
    [
      row.id,
      input.adminId,
    ]
  );

  return true;
}

/* ============================================================
   RECOVERY CODES
   ============================================================ */

function normalizeRecoveryCode(
  code:
    string
): string {
  return code
    .trim()
    .replace(
      /\s+/g,
      ''
    )
    .replace(
      /-/g,
      ''
    )
    .toUpperCase();
}

function hashRecoveryCode(
  code:
    string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      normalizeRecoveryCode(
        code
      )
    )
    .digest(
      'hex'
    );
}

function createRecoveryCode():
  string {
  const raw =
    crypto
      .randomBytes(
        ADMIN_RECOVERY_CODE_BYTES
      )
      .toString(
        'hex'
      )
      .toUpperCase();

  return [
    raw.slice(
      0,
      4
    ),

    raw.slice(
      4,
      8
    ),

    raw.slice(
      8,
      12
    ),

    raw.slice(
      12,
      16
    ),
  ].join(
    '-'
  );
}

export async function listAdminRecoveryCodes(
  adminId:
    string
): Promise<
  AdminRecoveryCode[]
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          admin_id,
          code_hash,
          used_at,
          created_at
        FROM platform_admin_recovery_codes
        WHERE admin_id = $1
        ORDER BY created_at ASC
      `,
      [
        adminId,
      ]
    );

  return (
    result.rows as
      AdminRecoveryCodeRow[]
  ).map(
    mapAdminRecoveryCodeRow
  );
}

export async function countUnusedAdminRecoveryCodes(
  adminId:
    string
): Promise<number> {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*)::text AS count
        FROM platform_admin_recovery_codes
        WHERE admin_id = $1
          AND used_at IS NULL
      `,
      [
        adminId,
      ]
    );

  return Number(
    result.rows[0]
      ?.count ??
      0
  );
}

export async function regenerateAdminRecoveryCodes(
  adminId:
    string
): Promise<
  string[]
> {
  const recoveryCodes =
    Array.from(
      {
        length:
          ADMIN_RECOVERY_CODE_COUNT,
      },
      () =>
        createRecoveryCode()
    );

  await queryControl(
    `
      DELETE FROM platform_admin_recovery_codes
      WHERE admin_id = $1
    `,
    [
      adminId,
    ]
  );

  for (
    const code of
    recoveryCodes
  ) {
    await queryControl(
      `
        INSERT INTO platform_admin_recovery_codes (
          admin_id,
          code_hash,
          used_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          NULL,
          NOW()
        )
      `,
      [
        adminId,

        hashRecoveryCode(
          code
        ),
      ]
    );
  }

  return recoveryCodes;
}

export async function useAdminRecoveryCode(
  input: {
    adminId: string;
    code: string;
  }
): Promise<boolean> {
  const codeHash =
    hashRecoveryCode(
      input.code
    );

  const result =
    await queryControl(
      `
        UPDATE platform_admin_recovery_codes

        SET
          used_at =
            NOW()

        WHERE id = (
          SELECT id
          FROM platform_admin_recovery_codes
          WHERE admin_id = $1
            AND code_hash = $2
            AND used_at IS NULL
          LIMIT 1
        )

        RETURNING id
      `,
      [
        input.adminId,
        codeHash,
      ]
    );

  return Boolean(
    result.rows[0]
  );
}

/* ============================================================
   VERIFY SECOND FACTOR
   ============================================================ */

export async function verifyAdminSecondFactor(
  input: {
    adminId: string;
    code: string;
  }
): Promise<{
  valid: boolean;

  method:
    | 'totp'
    | 'recovery_code'
    | null;
}> {
  const cleanCode =
    input.code
      .trim();

  if (
    !cleanCode
  ) {
    return {
      valid:
        false,

      method:
        null,
    };
  }

  if (
    /^\d{6}$/.test(
      cleanCode
    )
  ) {
    const totpValid =
      await verifyAdminTwoFactorCode({
        adminId:
          input.adminId,

        code:
          cleanCode,
      });

    if (
      totpValid
    ) {
      return {
        valid:
          true,

        method:
          'totp',
      };
    }
  }

  const recoveryValid =
    await useAdminRecoveryCode({
      adminId:
        input.adminId,

      code:
        cleanCode,
    });

  if (
    recoveryValid
  ) {
    return {
      valid:
        true,

      method:
        'recovery_code',
    };
  }

  return {
    valid:
      false,

    method:
      null,
  };
}