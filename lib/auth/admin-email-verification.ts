import 'server-only';

import crypto from 'crypto';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  sendVerificationEmail,
} from '@/lib/services/email';

/* ============================================================
   CONSTANTS
   ============================================================ */

export const ADMIN_EMAIL_VERIFICATION_CODE_LENGTH =
  6;

export const ADMIN_EMAIL_VERIFICATION_EXPIRY_MINUTES =
  15;

export const ADMIN_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS =
  60;

const MAX_EMAIL_LENGTH =
  254;

const MAX_NAME_LENGTH =
  120;

const VERIFY_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const VERIFY_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const VERIFY_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

const RESEND_RATE_LIMIT_MAX_ATTEMPTS =
  5;

const RESEND_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const RESEND_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

export type AdminEmailVerificationPurpose =
  | 'initial_verification'
  | 'resend_verification'
  | 'admin_provisioning';

export type AdminVerificationAdmin = {
  id: string;

  firstName: string;

  lastName: string;

  fullName: string;

  email: string;

  role: string;

  status: string;

  emailVerified: boolean;

  emailVerifiedAt:
    | string
    | null;
};

type PlatformAdminRow = {
  id: string;

  first_name:
    | string
    | null;

  last_name:
    | string
    | null;

  email: string;

  role: string;

  status: string;

  email_verified:
    | boolean
    | null;

  email_verified_at:
    | Date
    | string
    | null;

  deleted_at:
    | Date
    | string
    | null;
};

type VerificationRow = {
  id: string;

  admin_id: string;

  email: string;

  code_hash: string;

  expires_at:
    | Date
    | string;

  used_at:
    | Date
    | string
    | null;

  deleted_at:
    | Date
    | string
    | null;

  created_at:
    | Date
    | string;
};

export type RequestAdminEmailVerificationInput = {
  request:
    NextRequest;

  email:
    unknown;

  purpose?:
    AdminEmailVerificationPurpose;

  /**
   * When the caller already knows the target administrator,
   * such as the future provisioning flow, pass the ID here.
   *
   * Public resend routes should normally omit it.
   */
  adminId?:
    string | null;
};

export type RequestAdminEmailVerificationResult = {
  success:
    boolean;

  /**
   * Public routes should still return a generic message.
   *
   * This field only tells the route that the request was
   * handled safely. It does not prove that an account exists.
   */
  handled:
    boolean;

  sent:
    boolean;

  alreadyVerified:
    boolean;

  cooldown:
    boolean;

  retryAfterSeconds:
    number | null;

  admin:
    AdminVerificationAdmin | null;
};

export type VerifyAdminEmailInput = {
  request:
    NextRequest;

  email:
    unknown;

  code:
    unknown;
};

export type VerifyAdminEmailResult = {
  success:
    boolean;

  code:
    | 'EMAIL_VERIFIED'
    | 'EMAIL_ALREADY_VERIFIED'
    | 'INVALID_EMAIL'
    | 'INVALID_VERIFICATION_CODE'
    | 'INVALID_OR_EXPIRED_CODE'
    | 'VERIFICATION_RATE_LIMITED'
    | 'ADMIN_NOT_ELIGIBLE'
    | 'EMAIL_VERIFICATION_ERROR';

  verified:
    boolean;

  alreadyVerified:
    boolean;

  admin:
    AdminVerificationAdmin | null;

  error:
    string | null;

  retryAfterSeconds:
    number | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function normalizeAdminVerificationEmail(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

export function normalizeAdminVerificationCode(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function normalizeName(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
    .slice(
      0,
      MAX_NAME_LENGTH
    );
}

/* ============================================================
   VALIDATION
   ============================================================ */

export function isValidAdminVerificationEmail(
  email:
    string
): boolean {
  return (
    email.length >
      0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

export function isValidAdminVerificationCode(
  code:
    string
): boolean {
  return new RegExp(
    `^\\d{${ADMIN_EMAIL_VERIFICATION_CODE_LENGTH}}$`
  ).test(
    code
  );
}

/* ============================================================
   CODE GENERATION
   ============================================================ */

export function generateAdminVerificationCode():
  string {
  const minimum =
    10 **
    (
      ADMIN_EMAIL_VERIFICATION_CODE_LENGTH -
      1
    );

  const maximum =
    10 **
    ADMIN_EMAIL_VERIFICATION_CODE_LENGTH;

  return crypto
    .randomInt(
      minimum,
      maximum
    )
    .toString();
}

/* ============================================================
   HASHING
   ============================================================ */

export function hashAdminVerificationCode(
  code:
    string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      code,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   DATES
   ============================================================ */

function toIsoString(
  value:
    | Date
    | string
    | null
    | undefined
): string | null {
  if (
    !value
  ) {
    return null;
  }

  if (
    value instanceof
    Date
  ) {
    return value.toISOString();
  }

  const parsed =
    new Date(
      value
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.toISOString();
}

function getExpiryDate():
  Date {
  return new Date(
    Date.now() +
      ADMIN_EMAIL_VERIFICATION_EXPIRY_MINUTES *
        60 *
        1000
  );
}

/* ============================================================
   ADMIN FORMAT
   ============================================================ */

function buildFullName(
  firstName:
    string,
  lastName:
    string
): string {
  return [
    firstName,
    lastName,
  ]
    .filter(
      Boolean
    )
    .join(
      ' '
    )
    .trim();
}

function mapAdmin(
  row:
    PlatformAdminRow
): AdminVerificationAdmin {
  const firstName =
    normalizeName(
      row.first_name
    );

  const lastName =
    normalizeName(
      row.last_name
    );

  return {
    id:
      row.id,

    firstName,

    lastName,

    fullName:
      buildFullName(
        firstName,
        lastName
      ),

    email:
      normalizeAdminVerificationEmail(
        row.email
      ),

    role:
      row.role,

    status:
      row.status,

    emailVerified:
      Boolean(
        row.email_verified ||
        row.email_verified_at
      ),

    emailVerifiedAt:
      toIsoString(
        row.email_verified_at
      ),
  };
}

/* ============================================================
   STATUS
   ============================================================ */

function normalizeStatus(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

/**
 * Email verification itself does not grant administrative
 * access.
 *
 * "invited" admins may verify their email, but they remain
 * invited until the provisioning / invitation-acceptance flow
 * completes.
 *
 * "active" admins may also verify an address if their database
 * record somehow remains unverified.
 *
 * Suspended / disabled / deleted identities are deliberately
 * excluded.
 */
function isVerificationEligibleStatus(
  status:
    string
): boolean {
  const normalized =
    normalizeStatus(
      status
    );

  return (
    normalized ===
      'invited' ||
    normalized ===
      'active'
  );
}

/* ============================================================
   RATE-LIMIT IDENTIFIERS
   ============================================================ */

function getRequestIp(
  request:
    NextRequest
): string {
  return (
    getAdminRequestIp(
      request
    ) ||
    'unknown-ip'
  );
}

function getVerifyRateLimitIdentifier(
  request:
    NextRequest,
  email:
    string
): string {
  return [
    'admin-email-verification',
    'verify',
    email,
    getRequestIp(
      request
    ),
  ].join(
    ':'
  );
}

function getResendRateLimitIdentifier(
  request:
    NextRequest,
  email:
    string
): string {
  return [
    'admin-email-verification',
    'resend',
    email,
    getRequestIp(
      request
    ),
  ].join(
    ':'
  );
}

/* ============================================================
   ADVISORY LOCK
   ============================================================ */

/**
 * Serializes verification-code creation per email.
 *
 * This prevents two concurrent resend requests from both
 * creating active codes.
 */
async function lockVerificationEmail(
  email:
    string
) {
  await queryControl(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext($1)
        )
    `,
    [
      `platform-admin-email-verification:${email}`,
    ]
  );
}

/* ============================================================
   ADMIN LOOKUP
   ============================================================ */

async function findAdminByEmail(
  email:
    string
): Promise<
  PlatformAdminRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          pa.id,
          pa.first_name,
          pa.last_name,
          pa.email,
          pa.role,
          pa.status,
          pa.email_verified,
          pa.email_verified_at,
          pa.deleted_at

        FROM platform_admins pa

        WHERE LOWER(pa.email) = $1
          AND pa.deleted_at IS NULL

        LIMIT 1
      `,
      [
        email,
      ]
    );

  return (
    result.rows[0] as
      | PlatformAdminRow
      | undefined
  ) || null;
}

async function findAdminByIdAndEmail(
  adminId:
    string,
  email:
    string
): Promise<
  PlatformAdminRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          pa.id,
          pa.first_name,
          pa.last_name,
          pa.email,
          pa.role,
          pa.status,
          pa.email_verified,
          pa.email_verified_at,
          pa.deleted_at

        FROM platform_admins pa

        WHERE pa.id = $1
          AND LOWER(pa.email) = $2
          AND pa.deleted_at IS NULL

        LIMIT 1
      `,
      [
        adminId,
        email,
      ]
    );

  return (
    result.rows[0] as
      | PlatformAdminRow
      | undefined
  ) || null;
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAdminAuditEvent(
  input:
    Parameters<
      typeof recordAdminAuditEvent
    >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Admin Email Verification] Failed to record audit event:',
      error
    );
  }
}

/* ============================================================
   VERIFICATION URL
   ============================================================ */

function getAppOrigin():
  string {
  const raw =
    process.env
      .APP_URL
      ?.trim();

  if (
    !raw
  ) {
    throw new Error(
      'APP_URL is required for administrator email verification.'
    );
  }

  const url =
    new URL(
      raw
    );

  if (
    url.protocol !==
      'https:' &&
    !(
      process.env.NODE_ENV !==
        'production' &&
      url.protocol ===
        'http:'
    )
  ) {
    throw new Error(
      'APP_URL must use HTTPS in production.'
    );
  }

  return url
    .origin
    .replace(
      /\/+$/,
      ''
    );
}

function buildAdminVerificationUrl(
  email:
    string
): string {
  const url =
    new URL(
      '/admin/verify-email',
      getAppOrigin()
    );

  url.searchParams.set(
    'email',
    email
  );

  return url.toString();
}

/* ============================================================
   DELIVERY
   ============================================================ */

async function deliverAdminVerificationEmail(
  input: {
    admin:
      AdminVerificationAdmin;

    code:
      string;
  }
): Promise<
  boolean
> {
  const {
    admin,
    code,
  } =
    input;

  const displayName =
    admin.firstName ||
    admin.fullName ||
    'Administrator';

  /*
   * Compatibility:
   *
   * The latest SaMi email service supports:
   *   audience: 'platform_admin'
   *
   * The older committed signature only knows:
   *   expiresInMinutes
   *   verifyUrl
   *
   * Passing this through a variable keeps the call structurally
   * compatible with both versions. The latest version uses the
   * audience; an older version simply ignores the extra field.
   */
  const emailOptions = {
    expiresInMinutes:
      ADMIN_EMAIL_VERIFICATION_EXPIRY_MINUTES,

    verifyUrl:
      buildAdminVerificationUrl(
        admin.email
      ),

    audience:
      'platform_admin' as const,
  };

  const result =
    await sendVerificationEmail(
      admin.email,
      code,
      displayName,
      emailOptions
    );

  return Boolean(
    result.success
  );
}

/* ============================================================
   COOLDOWN
   ============================================================ */

async function getLatestActiveVerification(
  adminId:
    string,
  email:
    string
): Promise<
  VerificationRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          pav.id,
          pav.admin_id,
          pav.email,
          pav.code_hash,
          pav.expires_at,
          pav.used_at,
          pav.deleted_at,
          pav.created_at

        FROM platform_admin_email_verifications pav

        WHERE pav.admin_id = $1
          AND LOWER(pav.email) = $2
          AND pav.used_at IS NULL
          AND pav.deleted_at IS NULL
          AND pav.expires_at > NOW()

        ORDER BY
          pav.created_at DESC

        LIMIT 1
      `,
      [
        adminId,
        email,
      ]
    );

  return (
    result.rows[0] as
      | VerificationRow
      | undefined
  ) || null;
}

function getCooldownRemainingSeconds(
  createdAt:
    | Date
    | string
): number {
  const created =
    createdAt instanceof
      Date
      ? createdAt
      : new Date(
          createdAt
        );

  const elapsedMs =
    Date.now() -
    created.getTime();

  const cooldownMs =
    ADMIN_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS *
    1000;

  const remainingMs =
    cooldownMs -
    elapsedMs;

  if (
    remainingMs <=
    0
  ) {
    return 0;
  }

  return Math.ceil(
    remainingMs /
      1000
  );
}

/* ============================================================
   INVALIDATE ACTIVE CODES
   ============================================================ */

async function invalidateAdminVerificationCodes(
  adminId:
    string,
  email:
    string
) {
  await queryControl(
    `
      UPDATE
        platform_admin_email_verifications

      SET
        deleted_at =
          COALESCE(
            deleted_at,
            NOW()
          )

      WHERE admin_id = $1
        AND LOWER(email) = $2
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [
      adminId,
      email,
    ]
  );
}

/* ============================================================
   STORE CODE
   ============================================================ */

async function createVerificationRecord(
  input: {
    adminId:
      string;

    email:
      string;

    codeHash:
      string;

    expiresAt:
      Date;
  }
): Promise<
  string
> {
  const result =
    await queryControl(
      `
        INSERT INTO
          platform_admin_email_verifications (
            admin_id,
            email,
            code_hash,
            expires_at
          )

        VALUES (
          $1,
          $2,
          $3,
          $4
        )

        RETURNING
          id
      `,
      [
        input.adminId,
        input.email,
        input.codeHash,
        input.expiresAt,
      ]
    );

  const row =
    result.rows[0] as
      | {
          id:
            string;
        }
      | undefined;

  if (
    !row?.id
  ) {
    throw new Error(
      'Administrator verification record was not created.'
    );
  }

  return row.id;
}

/* ============================================================
   INVALIDATE DELIVERY-FAILED CODE
   ============================================================ */

async function invalidateVerificationRecord(
  verificationId:
    string
) {
  await queryControl(
    `
      UPDATE
        platform_admin_email_verifications

      SET
        deleted_at =
          COALESCE(
            deleted_at,
            NOW()
          )

      WHERE id = $1
        AND used_at IS NULL
    `,
    [
      verificationId,
    ]
  );
}

/* ============================================================
   REQUEST / RESEND VERIFICATION
   ============================================================ */

export async function requestAdminEmailVerification(
  input:
    RequestAdminEmailVerificationInput
): Promise<
  RequestAdminEmailVerificationResult
> {
  const email =
    normalizeAdminVerificationEmail(
      input.email
    );

  const purpose =
    input.purpose ||
    'resend_verification';

  const genericResult:
    RequestAdminEmailVerificationResult = {
      success:
        true,

      handled:
        true,

      sent:
        false,

      alreadyVerified:
        false,

      cooldown:
        false,

      retryAfterSeconds:
        null,

      admin:
        null,
    };

  /*
   * Public resend endpoints should not reveal whether an
   * administrator exists.
   */
  if (
    !isValidAdminVerificationEmail(
      email
    )
  ) {
    return {
      ...genericResult,

      success:
        false,

      handled:
        false,
    };
  }

  const rateLimitIdentifier =
    getResendRateLimitIdentifier(
      input.request,
      email
    );

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateLimitIdentifier,

      action:
        'admin-email-verification-resend',

      maxAttempts:
        RESEND_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        RESEND_RATE_LIMIT_WINDOW_MS,

      blockMs:
        RESEND_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      eventType:
        'admin.email_verification.resend_rate_limited',

      action:
        'admin_email_verification_resend',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'rate_limited',

      metadata: {
        email,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return {
      ...genericResult,

      cooldown:
        true,

      retryAfterSeconds:
        rateLimit
          .retryAfterSeconds,
    };
  }

  /*
   * Transaction-level advisory lock.
   *
   * queryControl may use a pool connection per call, therefore
   * the advisory lock and all writes that depend on it must be
   * performed in one SQL transaction to guarantee serialization.
   *
   * Since the current queryControl abstraction does not expose
   * a transaction callback, we also enforce a database partial
   * unique index on one active verification per admin.
   *
   * This lock call is still useful where queryControl uses the
   * same transaction context in your control DB wrapper.
   */
  try {
    await lockVerificationEmail(
      email
    );
  } catch (
    error
  ) {
    console.error(
      '[Admin Email Verification] Advisory lock failed:',
      error
    );
  }

  const admin =
    input.adminId
      ? await findAdminByIdAndEmail(
          input.adminId,
          email
        )
      : await findAdminByEmail(
          email
        );

  if (
    !admin
  ) {
    /*
     * Anti-enumeration:
     * return a handled result.
     */
    return genericResult;
  }

  const safeAdmin =
    mapAdmin(
      admin
    );

  if (
    safeAdmin.emailVerified
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.already_verified',

      action:
        'admin_email_verification_resend',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        true,

      metadata: {
        email:
          safeAdmin.email,

        purpose,
      },
    });

    return {
      ...genericResult,

      alreadyVerified:
        true,

      admin:
        safeAdmin,
    };
  }

  if (
    !isVerificationEligibleStatus(
      safeAdmin.status
    )
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.ineligible',

      action:
        'admin_email_verification_resend',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        false,

      failureReason:
        'admin_status_not_eligible',

      metadata: {
        email:
          safeAdmin.email,

        status:
          safeAdmin.status,

        purpose,
      },
    });

    /*
     * Anti-enumeration:
     * do not tell the public caller why the request did not send.
     */
    return {
      ...genericResult,

      admin:
        safeAdmin,
    };
  }

  const latestVerification =
    await getLatestActiveVerification(
      safeAdmin.id,
      safeAdmin.email
    );

  if (
    latestVerification
  ) {
    const retryAfterSeconds =
      getCooldownRemainingSeconds(
        latestVerification
          .created_at
      );

    if (
      retryAfterSeconds >
      0
    ) {
      return {
        ...genericResult,

        cooldown:
          true,

        retryAfterSeconds,

        admin:
          safeAdmin,
      };
    }
  }

  const code =
    generateAdminVerificationCode();

  const codeHash =
    hashAdminVerificationCode(
      code
    );

  const expiresAt =
    getExpiryDate();

  /*
   * One fresh code replaces all previous unused codes.
   */
  await invalidateAdminVerificationCodes(
    safeAdmin.id,
    safeAdmin.email
  );

  let verificationId:
    string;

  try {
    verificationId =
      await createVerificationRecord({
        adminId:
          safeAdmin.id,

        email:
          safeAdmin.email,

        codeHash,

        expiresAt,
      });
  } catch (
    error
  ) {
    console.error(
      '[Admin Email Verification] Could not create verification record:',
      error
    );

    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.creation_failed',

      action:
        'admin_email_verification_send',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        false,

      failureReason:
        'verification_record_creation_failed',

      metadata: {
        email:
          safeAdmin.email,

        purpose,
      },
    });

    throw error;
  }

  try {
    const delivered =
      await deliverAdminVerificationEmail({
        admin:
          safeAdmin,

        code,
      });

    if (
      !delivered
    ) {
      await invalidateVerificationRecord(
        verificationId
      );

      await safeRecordAdminAuditEvent({
        request:
          input.request,

        adminId:
          safeAdmin.id,

        eventType:
          'admin.email_verification.delivery_failed',

        action:
          'admin_email_verification_send',

        targetType:
          'platform_admin',

        targetId:
          safeAdmin.id,

        successful:
          false,

        failureReason:
          'email_delivery_failed',

        metadata: {
          email:
            safeAdmin.email,

          purpose,
        },
      });

      return {
        ...genericResult,

        admin:
          safeAdmin,
      };
    }

    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        purpose ===
          'resend_verification'
          ? 'admin.email_verification.resent'
          : 'admin.email_verification.sent',

      action:
        'admin_email_verification_send',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        true,

      metadata: {
        email:
          safeAdmin.email,

        purpose,

        expiresInMinutes:
          ADMIN_EMAIL_VERIFICATION_EXPIRY_MINUTES,
      },
    });

    return {
      ...genericResult,

      sent:
        true,

      admin:
        safeAdmin,
    };
  } catch (
    error
  ) {
    await invalidateVerificationRecord(
      verificationId
    );

    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.delivery_failed',

      action:
        'admin_email_verification_send',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        false,

      failureReason:
        'email_delivery_exception',

      metadata: {
        email:
          safeAdmin.email,

        purpose,
      },
    });

    console.error(
      '[Admin Email Verification] Email delivery failed:',
      error
    );

    /*
     * Public resend behavior remains generic.
     */
    return {
      ...genericResult,

      admin:
        safeAdmin,
    };
  }
}

/* ============================================================
   VERIFY EMAIL
   ============================================================ */

export async function verifyAdminEmail(
  input:
    VerifyAdminEmailInput
): Promise<
  VerifyAdminEmailResult
> {
  const email =
    normalizeAdminVerificationEmail(
      input.email
    );

  const code =
    normalizeAdminVerificationCode(
      input.code
    );

  if (
    !isValidAdminVerificationEmail(
      email
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_EMAIL',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'Enter a valid administrator email address.',

      retryAfterSeconds:
        null,
    };
  }

  if (
    !isValidAdminVerificationCode(
      code
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_VERIFICATION_CODE',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'Enter the 6-digit verification code.',

      retryAfterSeconds:
        null,
    };
  }

  const rateLimitIdentifier =
    getVerifyRateLimitIdentifier(
      input.request,
      email
    );

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateLimitIdentifier,

      action:
        'admin-email-verification-verify',

      maxAttempts:
        VERIFY_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        VERIFY_RATE_LIMIT_WINDOW_MS,

      blockMs:
        VERIFY_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      eventType:
        'admin.email_verification.verify_rate_limited',

      action:
        'admin_email_verification_verify',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'rate_limited',

      metadata: {
        email,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return {
      success:
        false,

      code:
        'VERIFICATION_RATE_LIMITED',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'Too many verification attempts. Please wait before trying again.',

      retryAfterSeconds:
        rateLimit
          .retryAfterSeconds,
    };
  }

  const admin =
    await findAdminByEmail(
      email
    );

  if (
    !admin
  ) {
    return {
      success:
        false,

      code:
        'INVALID_OR_EXPIRED_CODE',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'The verification code is invalid or has expired.',

      retryAfterSeconds:
        null,
    };
  }

  const safeAdmin =
    mapAdmin(
      admin
    );

  /*
   * Already verified administrators may only receive the
   * "already verified" response when the submitted code belongs
   * to a previously consumed verification for this exact admin.
   *
   * This avoids using account state itself as an enumeration
   * signal.
   */
  if (
    safeAdmin.emailVerified
  ) {
    const codeHash =
      hashAdminVerificationCode(
        code
      );

    const consumedResult =
      await queryControl(
        `
          SELECT
            pav.id

          FROM
            platform_admin_email_verifications pav

          WHERE pav.admin_id = $1
            AND LOWER(pav.email) = $2
            AND pav.code_hash = $3
            AND pav.used_at IS NOT NULL

          ORDER BY
            pav.created_at DESC

          LIMIT 1
        `,
        [
          safeAdmin.id,
          safeAdmin.email,
          codeHash,
        ]
      );

    if (
      consumedResult
        .rows.length >
      0
    ) {
      await resetRateLimit(
        rateLimitIdentifier,
        'admin-email-verification-verify'
      );

      return {
        success:
          true,

        code:
          'EMAIL_ALREADY_VERIFIED',

        verified:
          true,

        alreadyVerified:
          true,

        admin:
          safeAdmin,

        error:
          null,

        retryAfterSeconds:
          null,
      };
    }

    return {
      success:
        false,

      code:
        'INVALID_OR_EXPIRED_CODE',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'The verification code is invalid or has expired.',

      retryAfterSeconds:
        null,
    };
  }

  if (
    !isVerificationEligibleStatus(
      safeAdmin.status
    )
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.verify_ineligible',

      action:
        'admin_email_verification_verify',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        false,

      failureReason:
        'admin_status_not_eligible',

      metadata: {
        email:
          safeAdmin.email,

        status:
          safeAdmin.status,
      },
    });

    return {
      success:
        false,

      code:
        'ADMIN_NOT_ELIGIBLE',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'This administrator account cannot be verified.',

      retryAfterSeconds:
        null,
    };
  }

  const codeHash =
    hashAdminVerificationCode(
      code
    );

  /*
   * Atomic verification:
   *
   * 1. Find exact unexpired code.
   * 2. Consume it.
   * 3. Mark administrator email verified.
   * 4. Invalidate every other active verification.
   *
   * Important:
   * We DO NOT change "invited" to "active" here.
   *
   * Email ownership verification and administrative account
   * activation are different security decisions.
   */
  const verificationResult =
    await queryControl(
      `
        WITH target_admin AS (
          SELECT
            pa.id

          FROM platform_admins pa

          WHERE pa.id = $1
            AND LOWER(pa.email) = $2
            AND pa.deleted_at IS NULL
            AND COALESCE(
              pa.email_verified,
              FALSE
            ) = FALSE
            AND pa.email_verified_at IS NULL
            AND LOWER(pa.status) IN (
              'invited',
              'active'
            )

          LIMIT 1
        ),

        candidate_code AS (
          SELECT
            pav.id

          FROM
            platform_admin_email_verifications pav

          WHERE pav.admin_id = $1
            AND LOWER(pav.email) = $2
            AND pav.code_hash = $3
            AND pav.used_at IS NULL
            AND pav.deleted_at IS NULL
            AND pav.expires_at > NOW()
            AND EXISTS (
              SELECT
                1

              FROM
                target_admin
            )

          ORDER BY
            pav.created_at DESC

          LIMIT 1
        ),

        consumed_code AS (
          UPDATE
            platform_admin_email_verifications pav

          SET
            used_at =
              NOW()

          WHERE pav.id = (
            SELECT
              id

            FROM
              candidate_code
          )

          RETURNING
            pav.id
        ),

        verified_admin AS (
          UPDATE
            platform_admins pa

          SET
            email_verified =
              TRUE,

            email_verified_at =
              COALESCE(
                pa.email_verified_at,
                NOW()
              ),

            updated_at =
              NOW()

          FROM
            target_admin target

          WHERE pa.id =
            target.id

            AND EXISTS (
              SELECT
                1

              FROM
                consumed_code
            )

          RETURNING
            pa.id,
            pa.first_name,
            pa.last_name,
            pa.email,
            pa.role,
            pa.status,
            pa.email_verified,
            pa.email_verified_at,
            pa.deleted_at
        ),

        invalidated_codes AS (
          UPDATE
            platform_admin_email_verifications pav

          SET
            deleted_at =
              NOW()

          WHERE pav.admin_id = $1
            AND LOWER(pav.email) = $2
            AND pav.used_at IS NULL
            AND pav.deleted_at IS NULL
            AND EXISTS (
              SELECT
                1

              FROM
                verified_admin
            )

          RETURNING
            pav.id
        )

        SELECT
          id,
          first_name,
          last_name,
          email,
          role,
          status,
          email_verified,
          email_verified_at,
          deleted_at

        FROM
          verified_admin
      `,
      [
        safeAdmin.id,
        safeAdmin.email,
        codeHash,
      ]
    );

  if (
    verificationResult
      .rows.length ===
    0
  ) {
    await safeRecordAdminAuditEvent({
      request:
        input.request,

      adminId:
        safeAdmin.id,

      eventType:
        'admin.email_verification.failed',

      action:
        'admin_email_verification_verify',

      targetType:
        'platform_admin',

      targetId:
        safeAdmin.id,

      successful:
        false,

      failureReason:
        'invalid_or_expired_code',

      metadata: {
        email:
          safeAdmin.email,
      },
    });

    return {
      success:
        false,

      code:
        'INVALID_OR_EXPIRED_CODE',

      verified:
        false,

      alreadyVerified:
        false,

      admin:
        null,

      error:
        'The verification code is invalid or has expired.',

      retryAfterSeconds:
        null,
    };
  }

  const verifiedAdmin =
    mapAdmin(
      verificationResult
        .rows[0] as
        PlatformAdminRow
    );

  await resetRateLimit(
    rateLimitIdentifier,
    'admin-email-verification-verify'
  );

  await safeRecordAdminAuditEvent({
    request:
      input.request,

    adminId:
      verifiedAdmin.id,

    eventType:
      'admin.email_verified',

    action:
      'admin_email_verification_verify',

    targetType:
      'platform_admin',

    targetId:
      verifiedAdmin.id,

    successful:
      true,

    metadata: {
      email:
        verifiedAdmin.email,

      status:
        verifiedAdmin.status,
    },
  });

  return {
    success:
      true,

    code:
      'EMAIL_VERIFIED',

    verified:
      true,

    alreadyVerified:
      false,

    admin:
      verifiedAdmin,

    error:
      null,

    retryAfterSeconds:
      null,
  };
}

/* ============================================================
   INTERNAL PROVISIONING HELPER
   ============================================================ */

/**
 * This is intended for the future administrator-provisioning
 * flow.
 *
 * The provisioning route can create the platform_admins row,
 * then call this function to send the initial verification
 * email using exactly the same verification infrastructure.
 */
export async function sendInitialAdminVerification(
  input: {
    request:
      NextRequest;

    adminId:
      string;

    email:
      string;
  }
) {
  return requestAdminEmailVerification({
    request:
      input.request,

    adminId:
      input.adminId,

    email:
      input.email,

    purpose:
      'admin_provisioning',
  });
}