import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  countActiveRecoveryCodes,
} from '@/lib/auth/recovery-codes';

/* ============================================================
   TYPES
   ============================================================ */

export type TwoFactorMethod =
  | 'authenticator'
  | 'email';

export type TwoFactorMethodStatus = {
  enabled: boolean;

  preferredMethod:
    | TwoFactorMethod
    | null;

  availableMethods:
    TwoFactorMethod[];

  authenticator: {
    enabled: boolean;
    count: number;
  };

  email: {
    enabled: boolean;
    verified: boolean;

    address:
      | string
      | null;

    maskedAddress:
      | string
      | null;

    enabledAt:
      | string
      | null;
  };

  recovery: {
    count: number;
    available: boolean;
  };
};

export type TwoFactorStateErrorCode =
  | 'ACCOUNT_NOT_AVAILABLE'
  | 'EMAIL_NOT_VERIFIED'
  | 'METHOD_NOT_ENABLED'
  | 'INVALID_TWO_FACTOR_METHOD';

type SecurityStateRow = {
  id: string;
  email: string;

  status:
    | string
    | null;

  email_verified:
    | boolean
    | null;

  email_verified_at:
    | Date
    | string
    | null;

  two_factor_enabled:
    | boolean
    | null;

  two_factor_enabled_at:
    | Date
    | string
    | null;

  email_two_factor_enabled:
    | boolean
    | null;

  email_two_factor_enabled_at:
    | Date
    | string
    | null;

  preferred_two_factor_method:
    | string
    | null;

  authenticator_count:
    | number
    | string
    | null;
};

type TransactionState = {
  userId: string;
  email: string;
  accountStatus: string;
  emailVerified: boolean;

  authenticatorEnabled:
    boolean;

  emailEnabled:
    boolean;

  preferredMethod:
    | TwoFactorMethod
    | null;
};

/* ============================================================
   ERROR
   ============================================================ */

export class TwoFactorStateError
  extends Error
{
  readonly code:
    TwoFactorStateErrorCode;

  constructor(
    code:
      TwoFactorStateErrorCode,
    message: string
  ) {
    super(
      message
    );

    this.name =
      'TwoFactorStateError';

    this.code =
      code;
  }
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function isTwoFactorMethod(
  value: unknown
): value is TwoFactorMethod {
  return (
    value ===
      'authenticator' ||
    value ===
      'email'
  );
}

function normalizePreferredMethod(
  value: unknown
):
  | TwoFactorMethod
  | null {
  return isTwoFactorMethod(
    value
  )
    ? value
    : null;
}

function toSafeCount(
  value: unknown
): number {
  const count =
    Number(
      value
    );

  if (
    !Number.isFinite(
      count
    ) ||
    count < 0
  ) {
    return 0;
  }

  return Math.floor(
    count
  );
}

function toIsoString(
  value:
    | Date
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

/* ============================================================
   EMAIL MASKING
   ============================================================ */

export function maskSecurityEmail(
  value:
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  const email =
    value
      .trim()
      .toLowerCase();

  const separator =
    email.lastIndexOf(
      '@'
    );

  if (
    separator <= 0 ||
    separator >=
      email.length - 1
  ) {
    return null;
  }

  const local =
    email.slice(
      0,
      separator
    );

  const domain =
    email.slice(
      separator + 1
    );

  if (!domain) {
    return null;
  }

  if (
    local.length === 1
  ) {
    return `${local[0]}***@${domain}`;
  }

  if (
    local.length === 2
  ) {
    return `${local[0]}***${local[1]}@${domain}`;
  }

  return `${local[0]}${'*'.repeat(
    Math.min(
      Math.max(
        local.length - 2,
        3
      ),
      8
    )
  )}${local[
    local.length - 1
  ]}@${domain}`;
}

/* ============================================================
   SECURITY SETTINGS ROW
   ============================================================ */

async function ensureSecuritySettings(
  userId: string
) {
  await queryControl(
    `
      INSERT INTO user_security_settings (
        user_id,
        email_two_factor_enabled,
        email_two_factor_enabled_at,
        preferred_two_factor_method,
        created_at,
        updated_at
      )

      SELECT
        u.id,
        FALSE,
        NULL,

        CASE
          WHEN EXISTS (
            SELECT 1

            FROM user_authenticators ua

            WHERE ua.user_id = u.id
              AND ua.type = 'totp'
              AND ua.status = 'active'
              AND ua.revoked_at IS NULL
              AND ua.deleted_at IS NULL
          )

          THEN 'authenticator'

          ELSE NULL
        END,

        NOW(),
        NOW()

      FROM users u

      WHERE u.id = $1
        AND u.deleted_at IS NULL

      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [
      userId,
    ]
  );
}

async function ensureSecuritySettingsWithClient(
  client: PoolClient,
  userId: string
) {
  await client.query(
    `
      INSERT INTO user_security_settings (
        user_id,
        email_two_factor_enabled,
        email_two_factor_enabled_at,
        preferred_two_factor_method,
        created_at,
        updated_at
      )

      SELECT
        u.id,
        FALSE,
        NULL,

        CASE
          WHEN EXISTS (
            SELECT 1

            FROM user_authenticators ua

            WHERE ua.user_id = u.id
              AND ua.type = 'totp'
              AND ua.status = 'active'
              AND ua.revoked_at IS NULL
              AND ua.deleted_at IS NULL
          )

          THEN 'authenticator'

          ELSE NULL
        END,

        NOW(),
        NOW()

      FROM users u

      WHERE u.id = $1
        AND u.deleted_at IS NULL

      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [
      userId,
    ]
  );
}

/* ============================================================
   LOAD CURRENT STATUS
   ============================================================ */

export async function getTwoFactorMethodStatus(
  userId: string
): Promise<TwoFactorMethodStatus> {
  const cleanUserId =
    userId.trim();

  if (!cleanUserId) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  await ensureSecuritySettings(
    cleanUserId
  );

  const [
    stateResult,
    recoveryCodeCount,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            u.id,
            u.email,
            u.status,
            u.email_verified,
            u.email_verified_at,
            u.two_factor_enabled,
            u.two_factor_enabled_at,

            uss.email_two_factor_enabled,
            uss.email_two_factor_enabled_at,
            uss.preferred_two_factor_method,

            (
              SELECT
                COUNT(*)::int

              FROM user_authenticators ua

              WHERE ua.user_id = u.id
                AND ua.type = 'totp'
                AND ua.status = 'active'
                AND ua.revoked_at IS NULL
                AND ua.deleted_at IS NULL
            ) AS authenticator_count

          FROM users u

          INNER JOIN user_security_settings uss
            ON uss.user_id = u.id

          WHERE u.id = $1
            AND u.deleted_at IS NULL

          LIMIT 1
        `,
        [
          cleanUserId,
        ]
      ),

      countActiveRecoveryCodes(
        cleanUserId
      ),
    ]);

  const row =
    stateResult
      .rows[0] as
        | SecurityStateRow
        | undefined;

  if (!row) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  const authenticatorCount =
    toSafeCount(
      row.authenticator_count
    );

  const authenticatorEnabled =
    authenticatorCount >
    0;

  const emailEnabled =
    row.email_two_factor_enabled ===
    true;

  const emailVerified =
    row.email_verified ===
      true ||
    Boolean(
      row.email_verified_at
    );

  const preferred =
    normalizePreferredMethod(
      row.preferred_two_factor_method
    );

  const enabled =
    authenticatorEnabled ||
    emailEnabled;

  const availableMethods:
    TwoFactorMethod[] =
      [];

  if (
    authenticatorEnabled
  ) {
    availableMethods.push(
      'authenticator'
    );
  }

  if (
    emailEnabled
  ) {
    availableMethods.push(
      'email'
    );
  }

  /*
   * Put the user's preferred method first.
   *
   * This does not remove the other enabled method.
   * It only controls the default login experience.
   */
  if (
    preferred &&
    availableMethods.includes(
      preferred
    )
  ) {
    const index =
      availableMethods.indexOf(
        preferred
      );

    if (
      index >
      0
    ) {
      availableMethods.splice(
        index,
        1
      );

      availableMethods.unshift(
        preferred
      );
    }
  }

  const safePreferred =
    preferred &&
    availableMethods.includes(
      preferred
    )
      ? preferred
      : (
          availableMethods[0] ??
          null
        );

  const recoveryCount =
    toSafeCount(
      recoveryCodeCount
    );

  return {
    enabled,

    preferredMethod:
      safePreferred,

    availableMethods,

    authenticator: {
      enabled:
        authenticatorEnabled,

      count:
        authenticatorCount,
    },

    email: {
      enabled:
        emailEnabled,

      verified:
        emailVerified,

      address:
        row.email ||
        null,

      maskedAddress:
        maskSecurityEmail(
          row.email
        ),

      enabledAt:
        toIsoString(
          row.email_two_factor_enabled_at
        ),
    },

    recovery: {
      count:
        recoveryCount,

      available:
        recoveryCount >
        0,
    },
  };
}

/* ============================================================
   TRANSACTION STATE
   ============================================================ */

async function getTransactionState(
  client: PoolClient,
  userId: string
): Promise<TransactionState> {
  await ensureSecuritySettingsWithClient(
    client,
    userId
  );

  /*
   * Lock the account and security settings row while a security
   * method is being changed.
   */
  const result =
    await client.query(
      `
        SELECT
          u.id,
          u.email,
          u.status,
          u.email_verified,
          u.email_verified_at,

          uss.email_two_factor_enabled,
          uss.preferred_two_factor_method,

          EXISTS (
            SELECT 1

            FROM user_authenticators ua

            WHERE ua.user_id = u.id
              AND ua.type = 'totp'
              AND ua.status = 'active'
              AND ua.revoked_at IS NULL
              AND ua.deleted_at IS NULL
          ) AS authenticator_enabled

        FROM users u

        INNER JOIN user_security_settings uss
          ON uss.user_id = u.id

        WHERE u.id = $1
          AND u.deleted_at IS NULL

        FOR UPDATE OF u, uss
      `,
      [
        userId,
      ]
    );

  const row =
    result.rows[0];

  if (!row) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  return {
    userId:
      row.id,

    email:
      String(
        row.email ||
        ''
      )
        .trim()
        .toLowerCase(),

    accountStatus:
      String(
        row.status ||
        ''
      )
        .trim()
        .toLowerCase(),

    emailVerified:
      row.email_verified ===
        true ||
      Boolean(
        row.email_verified_at
      ),

    authenticatorEnabled:
      row.authenticator_enabled ===
      true,

    emailEnabled:
      row.email_two_factor_enabled ===
      true,

    preferredMethod:
      normalizePreferredMethod(
        row.preferred_two_factor_method
      ),
  };
}

/* ============================================================
   PREFERRED METHOD RESOLUTION
   ============================================================ */

function resolvePreferredMethod(
  input: {
    current:
      | TwoFactorMethod
      | null;

    authenticatorEnabled:
      boolean;

    emailEnabled:
      boolean;
  }
):
  | TwoFactorMethod
  | null {
  if (
    input.current ===
      'authenticator' &&
    input.authenticatorEnabled
  ) {
    return 'authenticator';
  }

  if (
    input.current ===
      'email' &&
    input.emailEnabled
  ) {
    return 'email';
  }

  if (
    input.authenticatorEnabled
  ) {
    return 'authenticator';
  }

  if (
    input.emailEnabled
  ) {
    return 'email';
  }

  return null;
}

/* ============================================================
   RECONCILE GLOBAL 2FA STATE
   ============================================================ */

async function reconcileWithClient(
  client: PoolClient,
  userId: string
) {
  const state =
    await getTransactionState(
      client,
      userId
    );

  const enabled =
    state
      .authenticatorEnabled ||
    state.emailEnabled;

  const preferred =
    resolvePreferredMethod({
      current:
        state.preferredMethod,

      authenticatorEnabled:
        state.authenticatorEnabled,

      emailEnabled:
        state.emailEnabled,
    });

  await client.query(
    `
      UPDATE user_security_settings

      SET
        preferred_two_factor_method = $2,
        updated_at = NOW()

      WHERE user_id = $1
    `,
    [
      userId,
      preferred,
    ]
  );

  await client.query(
    `
      UPDATE users

      SET
        two_factor_enabled = $2,

        two_factor_enabled_at =
          CASE
            WHEN $2 = TRUE
            THEN COALESCE(
              two_factor_enabled_at,
              NOW()
            )

            ELSE NULL
          END,

        failed_two_factor_attempts =
          CASE
            WHEN $2 = TRUE
            THEN failed_two_factor_attempts

            ELSE 0
          END,

        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      userId,
      enabled,
    ]
  );

  return {
    enabled,
    preferredMethod:
      preferred,
  };
}

/* ============================================================
   PUBLIC RECONCILIATION
   ============================================================ */

/**
 * Recalculate the account-level two_factor_enabled flag from
 * the actual enabled methods.
 *
 * Use this after authenticator or email method changes.
 *
 * This is important because users.two_factor_enabled now means:
 *
 *   "at least one active 2FA method exists"
 *
 * and NOT:
 *
 *   "a TOTP authenticator exists"
 */
export async function reconcileUserTwoFactorState(
  userId: string
): Promise<TwoFactorMethodStatus> {
  const cleanUserId =
    userId.trim();

  if (!cleanUserId) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    await reconcileWithClient(
      client,
      cleanUserId
    );

    await client.query(
      'COMMIT'
    );
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }

  return getTwoFactorMethodStatus(
    cleanUserId
  );
}

/* ============================================================
   ENABLE EMAIL 2FA
   ============================================================ */

/**
 * LOW-LEVEL SECURITY MUTATION.
 *
 * Call this ONLY after SaMi has:
 *
 * 1. authenticated the current session,
 * 2. completed the required step-up verification,
 * 3. sent an email_2fa_setup OTP,
 * 4. successfully verified that OTP.
 *
 * This function deliberately does not send or verify an OTP.
 * OTP ownership belongs to the email security-code service.
 */
export async function enableEmailTwoFactorMethod(
  userId: string
): Promise<TwoFactorMethodStatus> {
  const cleanUserId =
    userId.trim();

  if (!cleanUserId) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    const state =
      await getTransactionState(
        client,
        cleanUserId
      );

    if (
      state.accountStatus !==
      'active'
    ) {
      throw new TwoFactorStateError(
        'ACCOUNT_NOT_AVAILABLE',
        'This SaMi account is not available for security changes.'
      );
    }

    if (
      !state.email ||
      !state.emailVerified
    ) {
      throw new TwoFactorStateError(
        'EMAIL_NOT_VERIFIED',
        'Verify your SaMi email address before enabling email login verification.'
      );
    }

    await client.query(
      `
        UPDATE user_security_settings

        SET
          email_two_factor_enabled = TRUE,

          email_two_factor_enabled_at =
            COALESCE(
              email_two_factor_enabled_at,
              NOW()
            ),

          preferred_two_factor_method =
            COALESCE(
              preferred_two_factor_method,
              'email'
            ),

          updated_at = NOW()

        WHERE user_id = $1
      `,
      [
        cleanUserId,
      ]
    );

    /*
     * Any unused setup OTP for this account should no longer
     * remain usable after Email 2FA has been activated.
     */
    await client.query(
      `
        UPDATE user_email_security_codes

        SET
          invalidated_at = NOW(),
          updated_at = NOW()

        WHERE user_id = $1
          AND purpose = 'email_2fa_setup'
          AND used_at IS NULL
          AND invalidated_at IS NULL
      `,
      [
        cleanUserId,
      ]
    );

    await reconcileWithClient(
      client,
      cleanUserId
    );

    await client.query(
      'COMMIT'
    );
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }

  return getTwoFactorMethodStatus(
    cleanUserId
  );
}

/* ============================================================
   DISABLE EMAIL 2FA
   ============================================================ */

/**
 * LOW-LEVEL SECURITY MUTATION.
 *
 * The calling route must perform the required security
 * step-up before invoking this function.
 */
export async function disableEmailTwoFactorMethod(
  userId: string
): Promise<TwoFactorMethodStatus> {
  const cleanUserId =
    userId.trim();

  if (!cleanUserId) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    await getTransactionState(
      client,
      cleanUserId
    );

    await client.query(
      `
        UPDATE user_security_settings

        SET
          email_two_factor_enabled = FALSE,
          email_two_factor_enabled_at = NULL,
          updated_at = NOW()

        WHERE user_id = $1
      `,
      [
        cleanUserId,
      ]
    );

    /*
     * Email-based security codes are no longer valid when the
     * email method has been disabled.
     *
     * Authenticator/recovery data is intentionally untouched.
     */
    await client.query(
      `
        UPDATE user_email_security_codes

        SET
          invalidated_at = NOW(),
          updated_at = NOW()

        WHERE user_id = $1
          AND used_at IS NULL
          AND invalidated_at IS NULL
          AND purpose IN (
            'email_2fa_setup',
            'login_2fa',
            'security_step_up'
          )
      `,
      [
        cleanUserId,
      ]
    );

    await reconcileWithClient(
      client,
      cleanUserId
    );

    await client.query(
      'COMMIT'
    );
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }

  return getTwoFactorMethodStatus(
    cleanUserId
  );
}

/* ============================================================
   SET PREFERRED 2FA METHOD
   ============================================================ */

/**
 * A user may only select an already-enabled method as their
 * preferred login verification method.
 */
export async function setPreferredTwoFactorMethod(
  userId: string,
  method: TwoFactorMethod
): Promise<TwoFactorMethodStatus> {
  const cleanUserId =
    userId.trim();

  if (!cleanUserId) {
    throw new TwoFactorStateError(
      'ACCOUNT_NOT_AVAILABLE',
      'The SaMi account could not be located.'
    );
  }

  if (
    !isTwoFactorMethod(
      method
    )
  ) {
    throw new TwoFactorStateError(
      'INVALID_TWO_FACTOR_METHOD',
      'The selected verification method is not supported.'
    );
  }

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN'
    );

    const state =
      await getTransactionState(
        client,
        cleanUserId
      );

    const methodEnabled =
      method ===
      'authenticator'
        ? state
            .authenticatorEnabled
        : state
            .emailEnabled;

    if (
      !methodEnabled
    ) {
      throw new TwoFactorStateError(
        'METHOD_NOT_ENABLED',
        'Enable this verification method before making it your preferred method.'
      );
    }

    await client.query(
      `
        UPDATE user_security_settings

        SET
          preferred_two_factor_method = $2,
          updated_at = NOW()

        WHERE user_id = $1
      `,
      [
        cleanUserId,
        method,
      ]
    );

    /*
     * Reconciliation keeps the global users.two_factor_enabled
     * flag aligned with the actual method configuration.
     */
    await reconcileWithClient(
      client,
      cleanUserId
    );

    await client.query(
      'COMMIT'
    );
  } catch (error) {
    await client
      .query(
        'ROLLBACK'
      )
      .catch(
        () => undefined
      );

    throw error;
  } finally {
    client.release();
  }

  return getTwoFactorMethodStatus(
    cleanUserId
  );
}

/* ============================================================
   LOGIN METHOD RESOLUTION
   ============================================================ */

/**
 * Login routes should use this instead of assuming that
 * users.two_factor_enabled means "ask for an authenticator".
 *
 * Recovery codes are deliberately not included in methods.
 * They remain an emergency fallback.
 */
export async function getLoginTwoFactorMethods(
  userId: string
): Promise<{
  required: boolean;

  preferredMethod:
    | TwoFactorMethod
    | null;

  methods:
    TwoFactorMethod[];

  maskedEmail:
    | string
    | null;

  recoveryAvailable:
    boolean;
}> {
  const status =
    await getTwoFactorMethodStatus(
      userId
    );

  return {
    required:
      status.enabled,

    preferredMethod:
      status.preferredMethod,

    methods:
      status.availableMethods,

    maskedEmail:
      status.email.enabled
        ? status.email
            .maskedAddress
        : null,

    recoveryAvailable:
      status.recovery
        .available,
  };
}