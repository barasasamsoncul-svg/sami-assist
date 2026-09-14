import 'server-only';

import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';

import {
  getUserAccount,
  type UserAccount,
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH = 254;
const EMAIL_CHANGE_CODE_LENGTH = 6;
const EMAIL_CHANGE_EXPIRY_MINUTES = 15;
const EMAIL_CHANGE_COOLDOWN_SECONDS = 60;

/* ============================================================
   IDENTITY DOMAINS

   Workspace users and Platform Admins intentionally use separate
   identity tables and request tables, but share the same secure
   SaMi email-change engine.
   ============================================================ */

export type EmailChangeIdentityType =
  | 'user'
  | 'platform_admin';

type IdentityConfig = {
  identityTable: 'users' | 'platform_admins';
  requestTable:
    | 'user_email_change_requests'
    | 'platform_admin_email_change_requests';
  foreignKey: 'user_id' | 'admin_id';
};

const IDENTITY_CONFIG: Record<
  EmailChangeIdentityType,
  IdentityConfig
> = {
  user: {
    identityTable: 'users',
    requestTable: 'user_email_change_requests',
    foreignKey: 'user_id',
  },

  platform_admin: {
    identityTable: 'platform_admins',
    requestTable: 'platform_admin_email_change_requests',
    foreignKey: 'admin_id',
  },
};

/* ============================================================
   PUBLIC TYPES
   ============================================================ */

export type EmailChangeRequestResult = {
  requestId: string;
  email: string;

  /**
   * Raw verification code.
   *
   * SERVER ONLY.
   *
   * Never:
   * - log it
   * - return it to the browser
   * - persist it unhashed
   */
  code: string;

  expiresAt: string;
};

export type PendingEmailChange = {
  email: string;
  expiresAt: string;
  createdAt: string;
  canResendInSeconds: number;
};

export type PlatformAdminEmailChangeAccount = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
};

/* ============================================================
   INTERNAL ROW TYPES
   ============================================================ */

type CurrentIdentityRow = {
  id: string;
  email: string;
};

type OpenRequestRow = {
  id: string;
  new_email: string;
  created_at: Date | string;
  expires_at: Date | string;
};

type InsertedRequestRow = {
  id: string;
  new_email: string;
  expires_at: Date | string;
};

type ExistingRequestRow = {
  id: string;
  new_email: string;
  expires_at: Date | string;
  used_at: Date | string | null;
  deleted_at: Date | string | null;
};

type PlatformAdminAccountRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
  email_verified_at: Date | string | null;
};

/* ============================================================
   ERROR CODES
   ============================================================ */

export type EmailChangeErrorCode =
  | 'INVALID_NEW_EMAIL'
  | 'EMAIL_UNCHANGED'
  | 'EMAIL_UNAVAILABLE'
  | 'EMAIL_CHANGE_COOLDOWN'
  | 'INVALID_EMAIL_CHANGE_CODE'
  | 'EMAIL_CHANGE_EXPIRED'
  | 'EMAIL_CHANGE_FAILED'
  | 'IDENTITY_NOT_FOUND'
  | 'IDENTITY_UNAVAILABLE';

/* ============================================================
   ERROR
   ============================================================ */

export class EmailChangeError extends Error {
  readonly code: EmailChangeErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: EmailChangeErrorCode,
    message: string,
    retryAfterSeconds: number | null = null
  ) {
    super(message);

    this.name = 'EmailChangeError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/* ============================================================
   EMAIL
   ============================================================ */

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return (
    Boolean(value) &&
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/* ============================================================
   IDENTITY ID
   ============================================================ */

function assertIdentityId(
  identityId: string,
  identityType: EmailChangeIdentityType
): string {
  const normalized = identityId.trim();

  if (!normalized) {
    if (identityType === 'user') {
      throw new UserAccountNotFoundError();
    }

    throw new EmailChangeError(
      'IDENTITY_NOT_FOUND',
      'The platform administrator account could not be found.'
    );
  }

  return normalized;
}

/* ============================================================
   VERIFICATION CODE
   ============================================================ */

function generateVerificationCode(): string {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

function hashVerificationCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code, 'utf8')
    .digest('hex');
}

function normalizeVerificationCode(value: string): string {
  return value.trim();
}

function isValidVerificationCode(value: string): boolean {
  return new RegExp(
    `^\\d{${EMAIL_CHANGE_CODE_LENGTH}}$`
  ).test(value);
}

/* ============================================================
   DATE
   ============================================================ */

function toDate(value: Date | string): Date {
  return value instanceof Date
    ? value
    : new Date(value);
}

function toIsoString(value: Date | string): string {
  return toDate(value).toISOString();
}

function toNullableIsoString(
  value: Date | string | null
): string | null {
  return value
    ? toIsoString(value)
    : null;
}

/* ============================================================
   POSTGRES
   ============================================================ */

function getPostgresErrorCode(
  error: unknown
): string | null {
  if (
    !error ||
    typeof error !== 'object'
  ) {
    return null;
  }

  const value = error as {
    code?: unknown;
  };

  return typeof value.code === 'string'
    ? value.code
    : null;
}

function isUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505';
}

/* ============================================================
   CURRENT IDENTITY
   ============================================================ */

async function getCurrentIdentity(
  identityType: EmailChangeIdentityType,
  identityId: string
): Promise<CurrentIdentityRow> {
  const config =
    IDENTITY_CONFIG[identityType];

  /*
   * Table/column identifiers are not user input. They come only
   * from the closed IDENTITY_CONFIG above.
   */
  const result = await queryControl(
    `
      SELECT
        id,
        email

      FROM ${config.identityTable}

      WHERE id = $1
        AND deleted_at IS NULL

      LIMIT 1
    `,
    [identityId]
  );

  if (result.rows.length === 0) {
    if (identityType === 'user') {
      throw new UserAccountNotFoundError();
    }

    throw new EmailChangeError(
      'IDENTITY_NOT_FOUND',
      'The platform administrator account could not be found.'
    );
  }

  return result.rows[0] as CurrentIdentityRow;
}

/* ============================================================
   PLATFORM ADMIN ACCOUNT
   ============================================================ */

export async function getPlatformAdminEmailAccount(
  adminId: string
): Promise<PlatformAdminEmailChangeAccount> {
  const id =
    assertIdentityId(
      adminId,
      'platform_admin'
    );

  const result = await queryControl(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        role,
        status,
        email_verified,
        email_verified_at

      FROM platform_admins

      WHERE id = $1
        AND deleted_at IS NULL

      LIMIT 1
    `,
    [id]
  );

  if (result.rows.length === 0) {
    throw new EmailChangeError(
      'IDENTITY_NOT_FOUND',
      'The platform administrator account could not be found.'
    );
  }

  const row =
    result.rows[0] as PlatformAdminAccountRow;

  const firstName =
    row.first_name?.trim() || '';

  const lastName =
    row.last_name?.trim() || '';

  return {
    id: row.id,
    firstName,
    lastName,
    fullName:
      [firstName, lastName]
        .filter(Boolean)
        .join(' ') || 'Platform Administrator',
    email: row.email,
    role: row.role,
    status: row.status,
    emailVerified:
      Boolean(row.email_verified),
    emailVerifiedAt:
      toNullableIsoString(
        row.email_verified_at
      ),
  };
}

/* ============================================================
   EMAIL OWNERSHIP

   Email uniqueness is global across SaMi identities.

   A customer email must not silently become a platform-admin
   identity and a platform-admin email must not silently become
   a customer identity.

   Deleted identities deliberately remain reserved, matching the
   existing workspace behavior.
   ============================================================ */

async function emailBelongsToAnotherIdentity(
  identityType: EmailChangeIdentityType,
  identityId: string,
  email: string
): Promise<boolean> {
  const ownTable =
    IDENTITY_CONFIG[identityType]
      .identityTable;

  const otherTable =
    identityType === 'user'
      ? 'platform_admins'
      : 'users';

  const result = await queryControl(
    `
      SELECT
        1

      WHERE EXISTS (
        SELECT
          1

        FROM ${ownTable}

        WHERE LOWER(email) = $1
          AND id <> $2
      )

      OR EXISTS (
        SELECT
          1

        FROM ${otherTable}

        WHERE LOWER(email) = $1
      )

      LIMIT 1
    `,
    [
      email,
      identityId,
    ]
  );

  return result.rows.length > 0;
}

/* ============================================================
   OPEN REQUEST
   ============================================================ */

async function getOpenRequest(
  identityType: EmailChangeIdentityType,
  identityId: string
): Promise<OpenRequestRow | null> {
  const config =
    IDENTITY_CONFIG[identityType];

  const result = await queryControl(
    `
      SELECT
        id,
        new_email,
        created_at,
        expires_at

      FROM ${config.requestTable}

      WHERE ${config.foreignKey} = $1
        AND used_at IS NULL
        AND deleted_at IS NULL

      ORDER BY
        created_at DESC

      LIMIT 1
    `,
    [identityId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as OpenRequestRow;
}

/* ============================================================
   COOLDOWN
   ============================================================ */

function getCooldownRemainingSeconds(
  createdAt: Date | string
): number {
  const availableAt =
    toDate(createdAt).getTime() +
    EMAIL_CHANGE_COOLDOWN_SECONDS * 1000;

  const remainingMs =
    availableAt - Date.now();

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(
    remainingMs / 1000
  );
}

/* ============================================================
   SHARED REQUEST ENGINE
   ============================================================ */

async function requestIdentityEmailChange(
  identityType: EmailChangeIdentityType,
  identityId: string,
  newEmail: string
): Promise<EmailChangeRequestResult> {
  const id =
    assertIdentityId(
      identityId,
      identityType
    );

  const email =
    normalizeEmail(newEmail);

  if (!isValidEmail(email)) {
    throw new EmailChangeError(
      'INVALID_NEW_EMAIL',
      'Enter a valid email address.'
    );
  }

  const currentIdentity =
    await getCurrentIdentity(
      identityType,
      id
    );

  const currentEmail =
    normalizeEmail(
      currentIdentity.email
    );

  if (currentEmail === email) {
    throw new EmailChangeError(
      'EMAIL_UNCHANGED',
      'This is already your current email address.'
    );
  }

  const unavailable =
    await emailBelongsToAnotherIdentity(
      identityType,
      id,
      email
    );

  if (unavailable) {
    throw new EmailChangeError(
      'EMAIL_UNAVAILABLE',
      'This email address cannot be used.'
    );
  }

  const openRequest =
    await getOpenRequest(
      identityType,
      id
    );

  if (openRequest) {
    const retryAfterSeconds =
      getCooldownRemainingSeconds(
        openRequest.created_at
      );

    if (retryAfterSeconds > 0) {
      throw new EmailChangeError(
        'EMAIL_CHANGE_COOLDOWN',
        'Please wait before requesting another verification code.',
        retryAfterSeconds
      );
    }
  }

  const code =
    generateVerificationCode();

  const codeHash =
    hashVerificationCode(code);

  const config =
    IDENTITY_CONFIG[identityType];

  try {
    const result =
      await queryControl(
        `
          WITH invalidated_requests AS (
            UPDATE ${config.requestTable}

            SET
              deleted_at = NOW(),
              updated_at = NOW()

            WHERE ${config.foreignKey} = $1
              AND used_at IS NULL
              AND deleted_at IS NULL

            RETURNING
              id
          ),

          inserted_request AS (
            INSERT INTO ${config.requestTable} (
              ${config.foreignKey},
              new_email,
              code_hash,
              expires_at,
              created_at,
              updated_at
            )

            SELECT
              $1,
              $2,
              $3,
              NOW() + INTERVAL '${EMAIL_CHANGE_EXPIRY_MINUTES} minutes',
              NOW(),
              NOW()

            FROM ${config.identityTable}

            WHERE id = $1
              AND deleted_at IS NULL

            RETURNING
              id,
              new_email,
              expires_at
          )

          SELECT
            id,
            new_email,
            expires_at

          FROM inserted_request
        `,
        [
          id,
          email,
          codeHash,
        ]
      );

    if (result.rows.length === 0) {
      if (identityType === 'user') {
        throw new UserAccountNotFoundError();
      }

      throw new EmailChangeError(
        'IDENTITY_NOT_FOUND',
        'The platform administrator account could not be found.'
      );
    }

    const request =
      result.rows[0] as InsertedRequestRow;

    return {
      requestId:
        request.id,

      email:
        request.new_email,

      code,

      expiresAt:
        toIsoString(
          request.expires_at
        ),
    };
  } catch (error) {
    if (
      error instanceof
        UserAccountNotFoundError ||
      error instanceof
        EmailChangeError
    ) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      throw new EmailChangeError(
        'EMAIL_CHANGE_COOLDOWN',
        'Please wait before requesting another verification code.',
        EMAIL_CHANGE_COOLDOWN_SECONDS
      );
    }

    throw error;
  }
}

/* ============================================================
   SHARED VERIFY ENGINE
   ============================================================ */

async function verifyIdentityEmailChange(
  identityType: EmailChangeIdentityType,
  identityId: string,
  verificationCode: string
): Promise<void> {
  const id =
    assertIdentityId(
      identityId,
      identityType
    );

  const code =
    normalizeVerificationCode(
      verificationCode
    );

  if (!isValidVerificationCode(code)) {
    throw new EmailChangeError(
      'INVALID_EMAIL_CHANGE_CODE',
      'Enter the complete 6-digit verification code.'
    );
  }

  const codeHash =
    hashVerificationCode(code);

  const config =
    IDENTITY_CONFIG[identityType];

  const otherIdentityTable =
    identityType === 'user'
      ? 'platform_admins'
      : 'users';

  try {
    const result =
      await queryControl(
        `
          WITH candidate_request AS (
            SELECT
              r.id,
              r.new_email

            FROM ${config.requestTable} r

            WHERE r.${config.foreignKey} = $1
              AND r.code_hash = $2
              AND r.used_at IS NULL
              AND r.deleted_at IS NULL
              AND r.expires_at > NOW()

            ORDER BY
              r.created_at DESC

            LIMIT 1

            FOR UPDATE
          ),

          updated_identity AS (
            UPDATE ${config.identityTable} i

            SET
              email =
                candidate_request.new_email,

              email_verified =
                TRUE,

              email_verified_at =
                NOW(),

              updated_at =
                NOW()

            FROM candidate_request

            WHERE i.id = $1
              AND i.deleted_at IS NULL

              AND NOT EXISTS (
                SELECT
                  1

                FROM ${config.identityTable} conflict_identity

                WHERE LOWER(
                  conflict_identity.email
                ) = LOWER(
                  candidate_request.new_email
                )

                AND conflict_identity.id <> i.id
              )

              AND NOT EXISTS (
                SELECT
                  1

                FROM ${otherIdentityTable} other_identity

                WHERE LOWER(
                  other_identity.email
                ) = LOWER(
                  candidate_request.new_email
                )
              )

            RETURNING
              i.id
          ),

          consumed_request AS (
            UPDATE ${config.requestTable} r

            SET
              used_at = NOW(),
              updated_at = NOW()

            WHERE r.id = (
              SELECT
                id

              FROM candidate_request

              LIMIT 1
            )

            AND EXISTS (
              SELECT
                1

              FROM updated_identity
            )

            RETURNING
              r.id
          )

          SELECT
            updated_identity.id

          FROM updated_identity

          WHERE EXISTS (
            SELECT
              1

            FROM consumed_request
          )
        `,
        [
          id,
          codeHash,
        ]
      );

    if (result.rows.length > 0) {
      return;
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailChangeError(
        'EMAIL_UNAVAILABLE',
        'This email address can no longer be used.'
      );
    }

    throw error;
  }

  const currentIdentity =
    await getCurrentIdentity(
      identityType,
      id
    );

  const requestResult =
    await queryControl(
      `
        SELECT
          id,
          new_email,
          expires_at,
          used_at,
          deleted_at

        FROM ${config.requestTable}

        WHERE ${config.foreignKey} = $1
          AND code_hash = $2

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        id,
        codeHash,
      ]
    );

  if (requestResult.rows.length === 0) {
    throw new EmailChangeError(
      'INVALID_EMAIL_CHANGE_CODE',
      'The verification code is invalid or has expired.'
    );
  }

  const request =
    requestResult
      .rows[0] as ExistingRequestRow;

  /*
   * Idempotent success:
   * a browser replay after successful verification still succeeds.
   */
  if (
    request.used_at &&
    normalizeEmail(
      currentIdentity.email
    ) ===
      normalizeEmail(
        request.new_email
      )
  ) {
    return;
  }

  if (
    !request.used_at &&
    !request.deleted_at &&
    toDate(
      request.expires_at
    ).getTime() <= Date.now()
  ) {
    throw new EmailChangeError(
      'EMAIL_CHANGE_EXPIRED',
      'This verification code has expired. Request a new code.'
    );
  }

  if (
    !request.used_at &&
    !request.deleted_at
  ) {
    const unavailable =
      await emailBelongsToAnotherIdentity(
        identityType,
        id,
        normalizeEmail(
          request.new_email
        )
      );

    if (unavailable) {
      throw new EmailChangeError(
        'EMAIL_UNAVAILABLE',
        'This email address can no longer be used.'
      );
    }
  }

  throw new EmailChangeError(
    'INVALID_EMAIL_CHANGE_CODE',
    'The verification code is invalid or has expired.'
  );
}

/* ============================================================
   SHARED TARGETED CANCELLATION
   ============================================================ */

async function cancelIdentityEmailChangeRequest(
  identityType: EmailChangeIdentityType,
  identityId: string,
  requestId: string
): Promise<void> {
  const id =
    assertIdentityId(
      identityId,
      identityType
    );

  const normalizedRequestId =
    requestId.trim();

  /*
   * Never fall back to broad cancellation if the exact request ID
   * is unavailable. A no-op is safer than cancelling a newer
   * valid request.
   */
  if (!normalizedRequestId) {
    return;
  }

  await getCurrentIdentity(
    identityType,
    id
  );

  const config =
    IDENTITY_CONFIG[identityType];

  await queryControl(
    `
      UPDATE ${config.requestTable}

      SET
        deleted_at = NOW(),
        updated_at = NOW()

      WHERE ${config.foreignKey} = $1
        AND id = $2
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [
      id,
      normalizedRequestId,
    ]
  );
}

/* ============================================================
   SHARED USER-WIDE / ADMIN-WIDE CANCELLATION
   ============================================================ */

async function cancelIdentityEmailChange(
  identityType: EmailChangeIdentityType,
  identityId: string
): Promise<void> {
  const id =
    assertIdentityId(
      identityId,
      identityType
    );

  await getCurrentIdentity(
    identityType,
    id
  );

  const config =
    IDENTITY_CONFIG[identityType];

  await queryControl(
    `
      UPDATE ${config.requestTable}

      SET
        deleted_at = NOW(),
        updated_at = NOW()

      WHERE ${config.foreignKey} = $1
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [id]
  );
}

/* ============================================================
   SHARED PENDING STATE
   ============================================================ */

async function getPendingIdentityEmailChange(
  identityType: EmailChangeIdentityType,
  identityId: string
): Promise<PendingEmailChange | null> {
  const id =
    assertIdentityId(
      identityId,
      identityType
    );

  await getCurrentIdentity(
    identityType,
    id
  );

  const config =
    IDENTITY_CONFIG[identityType];

  const result =
    await queryControl(
      `
        SELECT
          new_email,
          created_at,
          expires_at

        FROM ${config.requestTable}

        WHERE ${config.foreignKey} = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
          AND expires_at > NOW()

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [id]
    );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0] as {
      new_email: string;
      created_at: Date | string;
      expires_at: Date | string;
    };

  return {
    email:
      row.new_email,

    createdAt:
      toIsoString(
        row.created_at
      ),

    expiresAt:
      toIsoString(
        row.expires_at
      ),

    canResendInSeconds:
      getCooldownRemainingSeconds(
        row.created_at
      ),
  };
}

/* ============================================================
   WORKSPACE PUBLIC API

   Existing signatures are intentionally preserved so current
   workspace routes continue to work without changes.
   ============================================================ */

export async function requestEmailChange(
  userId: string,
  newEmail: string
): Promise<EmailChangeRequestResult> {
  return requestIdentityEmailChange(
    'user',
    userId,
    newEmail
  );
}

export async function verifyEmailChange(
  userId: string,
  verificationCode: string
): Promise<UserAccount> {
  const id =
    assertIdentityId(
      userId,
      'user'
    );

  await verifyIdentityEmailChange(
    'user',
    id,
    verificationCode
  );

  return getUserAccount(id);
}

export async function cancelEmailChangeRequest(
  userId: string,
  requestId: string
): Promise<void> {
  return cancelIdentityEmailChangeRequest(
    'user',
    userId,
    requestId
  );
}

export async function cancelEmailChange(
  userId: string
): Promise<void> {
  return cancelIdentityEmailChange(
    'user',
    userId
  );
}

export async function getPendingEmailChange(
  userId: string
): Promise<PendingEmailChange | null> {
  return getPendingIdentityEmailChange(
    'user',
    userId
  );
}

/* ============================================================
   PLATFORM ADMIN PUBLIC API

   Platform Admin now uses the SAME SaMi email-change engine while
   retaining a completely separate admin identity/session boundary.
   ============================================================ */

export async function requestPlatformAdminEmailChange(
  adminId: string,
  newEmail: string
): Promise<EmailChangeRequestResult> {
  return requestIdentityEmailChange(
    'platform_admin',
    adminId,
    newEmail
  );
}

export async function verifyPlatformAdminEmailChange(
  adminId: string,
  verificationCode: string
): Promise<PlatformAdminEmailChangeAccount> {
  const id =
    assertIdentityId(
      adminId,
      'platform_admin'
    );

  await verifyIdentityEmailChange(
    'platform_admin',
    id,
    verificationCode
  );

  return getPlatformAdminEmailAccount(id);
}

export async function cancelPlatformAdminEmailChangeRequest(
  adminId: string,
  requestId: string
): Promise<void> {
  return cancelIdentityEmailChangeRequest(
    'platform_admin',
    adminId,
    requestId
  );
}

export async function cancelPlatformAdminEmailChange(
  adminId: string
): Promise<void> {
  return cancelIdentityEmailChange(
    'platform_admin',
    adminId
  );
}

export async function getPendingPlatformAdminEmailChange(
  adminId: string
): Promise<PendingEmailChange | null> {
  return getPendingIdentityEmailChange(
    'platform_admin',
    adminId
  );
}
