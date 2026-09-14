import 'server-only';

import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

import type {
  PlatformAdminRole,
  PlatformAdminStatus,
} from '@/lib/auth/admin-session';

/* ============================================================
   TYPES
   ============================================================ */

export type PlatformAdminAccount = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: PlatformAdminRole;
  status: PlatformAdminStatus;
  emailVerified: boolean;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date;
  createdAt: Date;
};

export type AdminAuthenticationResult =
  | {
      success: true;
      admin: PlatformAdminAccount;
      requiresTwoFactor: boolean;
    }
  | {
      success: false;
      code: AdminAuthenticationErrorCode;
      message: string;
      adminId?: string;
      lockedUntil?: Date;
    };

export type AdminAuthenticationErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_INVITED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'TWO_FACTOR_SETUP_REQUIRED';

type PlatformAdminRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  role: PlatformAdminRole;
  status: PlatformAdminStatus;
  email_verified: boolean;
  two_factor_required: boolean;
  two_factor_enabled: boolean;
  failed_login_attempts: number;
  locked_until: Date | string | null;
  last_login_at: Date | string | null;
  password_changed_at: Date | string;
  created_at: Date | string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH =
  254;

export const MIN_ADMIN_PASSWORD_LENGTH =
  12;

export const MAX_ADMIN_PASSWORD_LENGTH =
  128;

const ADMIN_MAX_FAILED_LOGIN_ATTEMPTS =
  getPositiveIntegerEnvironmentValue(
    'ADMIN_MAX_FAILED_LOGIN_ATTEMPTS',
    5
  );

const ADMIN_ACCOUNT_LOCK_DURATION_MS =
  getPositiveIntegerEnvironmentValue(
    'ADMIN_ACCOUNT_LOCK_DURATION_MS',
    30 * 60 * 1000
  );

const SCRYPT_KEY_LENGTH =
  64;

const SCRYPT_COST =
  16384;

const SCRYPT_BLOCK_SIZE =
  8;

const SCRYPT_PARALLELIZATION =
  1;

const SCRYPT_MAX_MEMORY =
  64 * 1024 * 1024;

const PASSWORD_HASH_PREFIX =
  'scrypt';

const INVALID_CREDENTIALS_MESSAGE =
  'The email or password is incorrect.';

/* ============================================================
   SCRYPT
   ============================================================ */

type ScryptOptions = {
  N: number;
  r: number;
  p: number;
  maxmem: number;
};

function deriveScryptKey(
  password: string,
  salt: string,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      crypto.scrypt(
        password,
        salt,
        keyLength,
        options,
        (
          error,
          derivedKey
        ) => {
          if (
            error
          ) {
            reject(
              error
            );

            return;
          }

          resolve(
            derivedKey
          );
        }
      );
    }
  );
}

/* ============================================================
   ENVIRONMENT
   ============================================================ */

function getPositiveIntegerEnvironmentValue(
  name: string,
  fallback: number
) {
  const value =
    Number(
      process.env[name]
    );

  if (
    !Number.isFinite(
      value
    ) ||
    value <= 0
  ) {
    return fallback;
  }

  return Math.floor(
    value
  );
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function normalizeAdminEmail(
  value: unknown
) {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .slice(
      0,
      MAX_EMAIL_LENGTH
    );
}

export function isValidAdminEmail(
  value: string
) {
  return (
    value.length >
      0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    )
  );
}

/* ============================================================
   PASSWORD POLICY

   This is the single authoritative Platform Admin password
   policy.

   All admin flows should reuse this function:
   - bootstrap
   - identity completion
   - reset password
   - change password
   - future settings
   ============================================================ */

export function getAdminPasswordRequirements(
  password: string
) {
  return {
    length:
      password.length >=
        MIN_ADMIN_PASSWORD_LENGTH &&
      password.length <=
        MAX_ADMIN_PASSWORD_LENGTH,

    uppercase:
      /[A-Z]/.test(
        password
      ),

    lowercase:
      /[a-z]/.test(
        password
      ),

    number:
      /\d/.test(
        password
      ),

    symbol:
      /[^A-Za-z0-9]/.test(
        password
      ),

    noWhitespace:
      !/\s/.test(
        password
      ),
  };
}

export function isValidAdminPassword(
  password: string
) {
  if (
    typeof password !==
    'string'
  ) {
    return false;
  }

  const requirements =
    getAdminPasswordRequirements(
      password
    );

  return (
    requirements.length &&
    requirements.uppercase &&
    requirements.lowercase &&
    requirements.number &&
    requirements.symbol &&
    requirements.noWhitespace
  );
}

/* ============================================================
   PASSWORD HASHING

   Stored format:
   scrypt$cost$blockSize$parallelization$salt$derivedKey
   ============================================================ */

export async function hashAdminPassword(
  password: string
) {
  if (
    !isValidAdminPassword(
      password
    )
  ) {
    throw new Error(
      'ADMIN_PASSWORD_POLICY_NOT_MET'
    );
  }

  const salt =
    crypto
      .randomBytes(
        32
      )
      .toString(
        'base64url'
      );

  const derivedKey =
    await deriveScryptKey(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N:
          SCRYPT_COST,

        r:
          SCRYPT_BLOCK_SIZE,

        p:
          SCRYPT_PARALLELIZATION,

        maxmem:
          SCRYPT_MAX_MEMORY,
      }
    );

  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt,
    derivedKey.toString(
      'base64url'
    ),
  ].join(
    '$'
  );
}

/* ============================================================
   PASSWORD VERIFICATION
   ============================================================ */

export async function verifyAdminPassword(
  password: string,
  storedHash: string
) {
  try {
    if (
      typeof password !==
        'string' ||
      typeof storedHash !==
        'string' ||
      !storedHash
    ) {
      return false;
    }

    const parts =
      storedHash.split(
        '$'
      );

    if (
      parts.length !==
      6
    ) {
      return false;
    }

    const [
      prefix,
      costText,
      blockSizeText,
      parallelizationText,
      salt,
      expectedKeyText,
    ] =
      parts;

    if (
      prefix !==
        PASSWORD_HASH_PREFIX ||
      !salt ||
      !expectedKeyText
    ) {
      return false;
    }

    const cost =
      Number(
        costText
      );

    const blockSize =
      Number(
        blockSizeText
      );

    const parallelization =
      Number(
        parallelizationText
      );

    /*
     * Do not allow malformed or unexpectedly expensive values
     * from a corrupted hash to drive crypto resource usage.
     */
    if (
      !Number.isInteger(
        cost
      ) ||
      !Number.isInteger(
        blockSize
      ) ||
      !Number.isInteger(
        parallelization
      ) ||
      cost < 2 ||
      cost >
        SCRYPT_COST ||
      blockSize < 1 ||
      blockSize >
        SCRYPT_BLOCK_SIZE ||
      parallelization < 1 ||
      parallelization >
        SCRYPT_PARALLELIZATION
    ) {
      return false;
    }

    const expectedKey =
      Buffer.from(
        expectedKeyText,
        'base64url'
      );

    if (
      expectedKey.length !==
      SCRYPT_KEY_LENGTH
    ) {
      return false;
    }

    const actualKey =
      await deriveScryptKey(
        password,
        salt,
        expectedKey.length,
        {
          N:
            cost,

          r:
            blockSize,

          p:
            parallelization,

          maxmem:
            SCRYPT_MAX_MEMORY,
        }
      );

    if (
      actualKey.length !==
      expectedKey.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      actualKey,
      expectedKey
    );
  } catch {
    return false;
  }
}

/* ============================================================
   DUMMY PASSWORD VERIFICATION

   Reduces timing differences when an email does not exist.
   ============================================================ */

let dummyPasswordHash:
  string | null =
  null;

async function performDummyPasswordVerification(
  password: string
) {
  if (
    !dummyPasswordHash
  ) {
    dummyPasswordHash =
      await hashAdminPassword(
        'SaMi-Dummy-Admin-Password-2026!'
      );
  }

  await verifyAdminPassword(
    password,
    dummyPasswordHash
  );
}

/* ============================================================
   ADMIN MAPPING
   ============================================================ */

function mapPlatformAdmin(
  row: PlatformAdminRow
): PlatformAdminAccount {
  const firstName =
    row.first_name ||
    '';

  const lastName =
    row.last_name ||
    '';

  return {
    id:
      row.id,

    firstName,

    lastName,

    fullName:
      `${firstName} ${lastName}`
        .trim(),

    email:
      row.email,

    passwordHash:
      row.password_hash,

    role:
      row.role,

    status:
      row.status,

    emailVerified:
      Boolean(
        row.email_verified
      ),

    twoFactorRequired:
      Boolean(
        row.two_factor_required
      ),

    twoFactorEnabled:
      Boolean(
        row.two_factor_enabled
      ),

    failedLoginAttempts:
      Number(
        row.failed_login_attempts
      ) || 0,

    lockedUntil:
      row.locked_until
        ? new Date(
            row.locked_until
          )
        : null,

    lastLoginAt:
      row.last_login_at
        ? new Date(
            row.last_login_at
          )
        : null,

    passwordChangedAt:
      new Date(
        row.password_changed_at
      ),

    createdAt:
      new Date(
        row.created_at
      ),
  };
}

/* ============================================================
   FIND ADMIN
   ============================================================ */

export async function findPlatformAdminByEmail(
  email: string
) {
  const normalizedEmail =
    normalizeAdminEmail(
      email
    );

  if (
    !isValidAdminEmail(
      normalizedEmail
    )
  ) {
    return null;
  }

  const result =
    await queryControl(
      `
        SELECT
          id,
          first_name,
          last_name,
          email,
          password_hash,
          role,
          status,
          email_verified,
          two_factor_required,
          two_factor_enabled,
          failed_login_attempts,
          locked_until,
          last_login_at,
          password_changed_at,
          created_at

        FROM
          platform_admins

        WHERE
          LOWER(email) = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        normalizedEmail,
      ]
    );

  const row =
    result.rows[0] as
      | PlatformAdminRow
      | undefined;

  return row
    ? mapPlatformAdmin(
        row
      )
    : null;
}

export async function findPlatformAdminById(
  adminId: string
) {
  if (
    !adminId ||
    typeof adminId !==
      'string'
  ) {
    return null;
  }

  const result =
    await queryControl(
      `
        SELECT
          id,
          first_name,
          last_name,
          email,
          password_hash,
          role,
          status,
          email_verified,
          two_factor_required,
          two_factor_enabled,
          failed_login_attempts,
          locked_until,
          last_login_at,
          password_changed_at,
          created_at

        FROM
          platform_admins

        WHERE
          id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        adminId,
      ]
    );

  const row =
    result.rows[0] as
      | PlatformAdminRow
      | undefined;

  return row
    ? mapPlatformAdmin(
        row
      )
    : null;
}

/* ============================================================
   LOCK STATE
   ============================================================ */

export function isPlatformAdminLocked(
  admin: PlatformAdminAccount
) {
  if (
    admin.lockedUntil &&
    admin.lockedUntil.getTime() >
      Date.now()
  ) {
    return true;
  }

  /*
   * A locked status without locked_until is treated as a
   * deliberate/manual lock and therefore remains locked.
   */
  if (
    admin.status ===
      'locked' &&
    !admin.lockedUntil
  ) {
    return true;
  }

  return false;
}

/* ============================================================
   CLEAR EXPIRED TEMPORARY LOCK

   Previous implementation could leave:
     status = 'locked'
     locked_until = expired

   That caused validateAdminAccountStatus() to reject the admin
   indefinitely even though the temporary lock period had ended.

   This function restores expired temporary locks to active.
   Manual locks with locked_until = NULL remain locked.
   ============================================================ */

async function clearExpiredAdminLock(
  admin: PlatformAdminAccount
): Promise<
  PlatformAdminAccount
> {
  if (
    admin.status !==
      'locked' ||
    !admin.lockedUntil ||
    admin.lockedUntil.getTime() >
      Date.now()
  ) {
    return admin;
  }

  const result =
    await queryControl(
      `
        UPDATE
          platform_admins

        SET
          status = 'active',
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = NOW()

        WHERE
          id = $1
          AND status = 'locked'
          AND locked_until IS NOT NULL
          AND locked_until <= NOW()
          AND deleted_at IS NULL

        RETURNING
          id,
          first_name,
          last_name,
          email,
          password_hash,
          role,
          status,
          email_verified,
          two_factor_required,
          two_factor_enabled,
          failed_login_attempts,
          locked_until,
          last_login_at,
          password_changed_at,
          created_at
      `,
      [
        admin.id,
      ]
    );

  const row =
    result.rows[0] as
      | PlatformAdminRow
      | undefined;

  if (
    !row
  ) {
    return admin;
  }

  return mapPlatformAdmin(
    row
  );
}

/* ============================================================
   FAILED LOGIN

   Atomic increment + lock transition.
   ============================================================ */

export async function registerAdminFailedLogin(
  adminId: string
) {
  const result =
    await queryControl(
      `
        UPDATE
          platform_admins

        SET
          failed_login_attempts =
            failed_login_attempts + 1,

          locked_until =
            CASE
              WHEN
                failed_login_attempts + 1 >= $2
              THEN
                NOW() +
                (
                  $3::bigint *
                  INTERVAL '1 millisecond'
                )
              ELSE
                locked_until
            END,

          status =
            CASE
              WHEN
                failed_login_attempts + 1 >= $2
              THEN
                'locked'
              ELSE
                status
            END,

          updated_at =
            NOW()

        WHERE
          id = $1
          AND deleted_at IS NULL
          AND status IN (
            'active',
            'locked'
          )

        RETURNING
          failed_login_attempts,
          locked_until,
          status
      `,
      [
        adminId,
        ADMIN_MAX_FAILED_LOGIN_ATTEMPTS,
        ADMIN_ACCOUNT_LOCK_DURATION_MS,
      ]
    );

  const row =
    result.rows[0] as
      | {
          failed_login_attempts:
            number;

          locked_until:
            Date | string | null;

          status:
            PlatformAdminStatus;
        }
      | undefined;

  return {
    failedLoginAttempts:
      Number(
        row?.failed_login_attempts
      ) || 0,

    lockedUntil:
      row?.locked_until
        ? new Date(
            row.locked_until
          )
        : null,

    status:
      row?.status,
  };
}

/* ============================================================
   RESET FAILED LOGIN

   Only clears temporary locks.

   A manually locked account with locked_until = NULL must not
   be silently reactivated here.
   ============================================================ */

export async function resetAdminFailedLogins(
  adminId: string
) {
  await queryControl(
    `
      UPDATE
        platform_admins

      SET
        failed_login_attempts = 0,

        locked_until =
          CASE
            WHEN
              locked_until IS NOT NULL
            THEN
              NULL
            ELSE
              locked_until
          END,

        status =
          CASE
            WHEN
              status = 'locked'
              AND locked_until IS NOT NULL
            THEN
              'active'
            ELSE
              status
          END,

        updated_at =
          NOW()

      WHERE
        id = $1
        AND deleted_at IS NULL
    `,
    [
      adminId,
    ]
  );
}

/* ============================================================
   RECORD SUCCESSFUL LOGIN
   ============================================================ */

export async function updateAdminSuccessfulLogin(
  adminId: string,
  ipAddress: string | null
) {
  await queryControl(
    `
      UPDATE
        platform_admins

      SET
        failed_login_attempts = 0,

        locked_until =
          CASE
            WHEN
              locked_until IS NOT NULL
            THEN
              NULL
            ELSE
              locked_until
          END,

        status =
          CASE
            WHEN
              status = 'locked'
              AND locked_until IS NOT NULL
            THEN
              'active'
            ELSE
              status
          END,

        last_login_at =
          NOW(),

        last_login_ip =
          $2,

        updated_at =
          NOW()

      WHERE
        id = $1
        AND deleted_at IS NULL
    `,
    [
      adminId,
      ipAddress,
    ]
  );
}

/* ============================================================
   STATUS VALIDATION
   ============================================================ */

function validateAdminAccountStatus(
  admin: PlatformAdminAccount
): AdminAuthenticationResult | null {
  if (
    isPlatformAdminLocked(
      admin
    )
  ) {
    return {
      success:
        false,

      code:
        'ACCOUNT_LOCKED',

      message:
        admin.lockedUntil
          ? 'This administrator account is temporarily locked.'
          : 'This administrator account is locked.',

      adminId:
        admin.id,

      lockedUntil:
        admin.lockedUntil ||
        undefined,
    };
  }

  switch (
    admin.status
  ) {
    case 'invited':
      return {
        success:
          false,

        code:
          'ACCOUNT_INVITED',

        message:
          'This administrator invitation has not been completed.',

        adminId:
          admin.id,
      };

    case 'suspended':
      return {
        success:
          false,

        code:
          'ACCOUNT_SUSPENDED',

        message:
          'This administrator account has been suspended.',

        adminId:
          admin.id,
      };

    case 'disabled':
      return {
        success:
          false,

        code:
          'ACCOUNT_DISABLED',

        message:
          'This administrator account has been disabled.',

        adminId:
          admin.id,
      };

    case 'locked':
      /*
       * If status is still locked here, it is a manual lock
       * because expired temporary locks are cleared before this
       * function is called.
       */
      return {
        success:
          false,

        code:
          'ACCOUNT_LOCKED',

        message:
          'This administrator account is locked.',

        adminId:
          admin.id,

        lockedUntil:
          admin.lockedUntil ||
          undefined,
      };

    case 'active':
      return null;

    default:
      return {
        success:
          false,

        code:
          'ACCOUNT_DISABLED',

        message:
          'This administrator account cannot sign in.',

        adminId:
          admin.id,
      };
  }
}

/* ============================================================
   AUTHENTICATE ADMINISTRATOR
   ============================================================ */

export async function authenticatePlatformAdmin(
  email: unknown,
  password: unknown
): Promise<
  AdminAuthenticationResult
> {
  const normalizedEmail =
    normalizeAdminEmail(
      email
    );

  const normalizedPassword =
    typeof password ===
      'string'
      ? password
      : '';

  if (
    !isValidAdminEmail(
      normalizedEmail
    ) ||
    normalizedPassword.length ===
      0 ||
    normalizedPassword.length >
      MAX_ADMIN_PASSWORD_LENGTH
  ) {
    await performDummyPasswordVerification(
      normalizedPassword ||
      'invalid'
    );

    return {
      success:
        false,

      code:
        'INVALID_CREDENTIALS',

      message:
        INVALID_CREDENTIALS_MESSAGE,
    };
  }

  let admin =
    await findPlatformAdminByEmail(
      normalizedEmail
    );

  if (
    !admin
  ) {
    await performDummyPasswordVerification(
      normalizedPassword
    );

    return {
      success:
        false,

      code:
        'INVALID_CREDENTIALS',

      message:
        INVALID_CREDENTIALS_MESSAGE,
    };
  }

  /*
   * Automatically clear only expired temporary locks.
   * Manual locks remain locked.
   */
  admin =
    await clearExpiredAdminLock(
      admin
    );

  /*
   * Verify the password BEFORE exposing specific account state.
   *
   * This prevents somebody who only knows an email address from
   * learning whether the account is invited, suspended,
   * disabled or locked.
   */
  const passwordCorrect =
    await verifyAdminPassword(
      normalizedPassword,
      admin.passwordHash
    );

  if (
    !passwordCorrect
  ) {
    /*
     * Only active or temporarily locked identities participate
     * in automatic failed-login locking.
     *
     * Suspended/disabled/invited accounts are not mutated by
     * unauthenticated password guessing.
     */
    if (
      admin.status ===
        'active' ||
      (
        admin.status ===
          'locked' &&
        admin.lockedUntil
      )
    ) {
      const failure =
        await registerAdminFailedLogin(
          admin.id
        );

      if (
        failure.lockedUntil &&
        failure.lockedUntil.getTime() >
          Date.now()
      ) {
        return {
          success:
            false,

          code:
            'ACCOUNT_LOCKED',

          message:
            'This administrator account has been temporarily locked after repeated unsuccessful sign-in attempts.',

          adminId:
            admin.id,

          lockedUntil:
            failure.lockedUntil,
        };
      }
    }

    return {
      success:
        false,

      code:
        'INVALID_CREDENTIALS',

      message:
        INVALID_CREDENTIALS_MESSAGE,

      adminId:
        admin.id,
    };
  }

  /*
   * Only after proving knowledge of the password do we reveal
   * the account's specific state to that administrator.
   */
  const statusFailure =
    validateAdminAccountStatus(
      admin
    );

  if (
    statusFailure
  ) {
    return statusFailure;
  }

  if (
    !admin.emailVerified
  ) {
    return {
      success:
        false,

      code:
        'EMAIL_NOT_VERIFIED',

      message:
        'The administrator email address has not been verified.',

      adminId:
        admin.id,
    };
  }

  if (
    admin.twoFactorRequired &&
    !admin.twoFactorEnabled
  ) {
    return {
      success:
        false,

      code:
        'TWO_FACTOR_SETUP_REQUIRED',

      message:
        'Two-factor authentication must be configured before this administrator can access the SaMi Admin Panel.',

      adminId:
        admin.id,
    };
  }

  return {
    success:
      true,

    admin,

    requiresTwoFactor:
      admin.twoFactorRequired ||
      admin.twoFactorEnabled,
  };
}

/* ============================================================
   SAFE PUBLIC ADMIN
   ============================================================ */

export function getSafePlatformAdmin(
  admin: PlatformAdminAccount
) {
  return {
    id:
      admin.id,

    firstName:
      admin.firstName,

    lastName:
      admin.lastName,

    fullName:
      admin.fullName,

    email:
      admin.email,

    role:
      admin.role,

    status:
      admin.status,

    emailVerified:
      admin.emailVerified,

    twoFactorRequired:
      admin.twoFactorRequired,

    twoFactorEnabled:
      admin.twoFactorEnabled,

    lastLoginAt:
      admin.lastLoginAt,

    passwordChangedAt:
      admin.passwordChangedAt,

    createdAt:
      admin.createdAt,
  };
}