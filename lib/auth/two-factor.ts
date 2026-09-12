import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  createOtpAuthUrl,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  verifyTotpCode,
} from '@/lib/auth/totp';

import {
  consumeRecoveryCode,
  countActiveRecoveryCodes,
  createRecoveryCodes,
  createRecoveryCodesWithClient,
} from '@/lib/auth/recovery-codes';

/* ============================================================
   TYPES
   ============================================================ */

export type TwoFactorStatus = {
  enabled: boolean;
  authenticatorCount: number;
  recoveryCodeCount: number;
};

export type TwoFactorSetupResult = {
  authenticatorId: string;
  secret: string;
  otpAuthUrl: string;
};

export type TwoFactorConfirmationResult = {
  success: boolean;
  recoveryCodes: string[];
};

/* ============================================================
   USER ID
   ============================================================ */

function requireUserId(
  value: string
): string {
  const userId =
    value.trim();

  if (!userId) {
    throw new Error(
      'User ID is required.'
    );
  }

  return userId;
}

/* ============================================================
   TRANSACTION ROLLBACK
   ============================================================ */

async function rollbackTransaction(
  client:
    PoolClient
) {
  try {
    await client.query(
      'ROLLBACK'
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Failed to rollback 2FA transaction:',
      error
    );
  }
}

/* ============================================================
   STATUS
   ============================================================ */

export async function getTwoFactorStatus(
  userId: string
): Promise<TwoFactorStatus> {
  const normalizedUserId =
    requireUserId(
      userId
    );

  const [
    userResult,
    factorResult,
    recoveryCodeCount,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            two_factor_enabled

          FROM users

          WHERE id = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          normalizedUserId,
        ]
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int AS count

          FROM user_authenticators

          WHERE user_id = $1
            AND type = 'totp'
            AND status = 'active'
            AND revoked_at IS NULL
            AND deleted_at IS NULL
        `,
        [
          normalizedUserId,
        ]
      ),

      countActiveRecoveryCodes(
        normalizedUserId
      ),
    ]);

  const authenticatorCount =
    Number(
      factorResult.rows[0]
        ?.count ||
        0
    );

  return {
    enabled:
      Boolean(
        userResult.rows[0]
          ?.two_factor_enabled
      ),

    authenticatorCount:
      Number.isFinite(
        authenticatorCount
      )
        ? authenticatorCount
        : 0,

    recoveryCodeCount:
      Number.isFinite(
        recoveryCodeCount
      )
        ? recoveryCodeCount
        : 0,
  };
}

/* ============================================================
   CREATE TOTP SETUP

   Only one unfinished/pending setup should exist for a user.

   Existing ACTIVE authenticators are intentionally preserved.

   This allows SaMi to support another authenticator later
   without breaking the authenticator already protecting the
   account.
   ============================================================ */

export async function createTwoFactorSetup(
  input: {
    userId: string;
    email: string;
  }
): Promise<TwoFactorSetupResult> {
  const userId =
    requireUserId(
      input.userId
    );

  const email =
    input.email
      .trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      'Email is required for authenticator setup.'
    );
  }

  const secret =
    generateTotpSecret();

  /*
   * Encrypt before modifying the database.
   *
   * If encryption/configuration fails, no pending authenticator
   * is created.
   */
  const secretCiphertext =
    encryptSecret(
      secret
    );

  /*
   * Revoke the previous unfinished setup and create the new
   * pending authenticator in one PostgreSQL statement.
   *
   * Existing ACTIVE authenticators are not touched.
   */
  const result =
    await queryControl(
      `
        WITH revoked_pending AS (
          UPDATE user_authenticators

          SET
            status = 'revoked',
            revoked_at = NOW(),
            updated_at = NOW()

          WHERE user_id = $1
            AND type = 'totp'
            AND status = 'pending'
            AND revoked_at IS NULL
            AND deleted_at IS NULL

          RETURNING id
        )

        INSERT INTO user_authenticators (
          user_id,
          type,
          label,
          secret_ciphertext,
          status,
          metadata
        )

        SELECT
          $1,
          'totp',
          'Authenticator app',
          $2,
          'pending',
          $3::jsonb

        RETURNING id
      `,
      [
        userId,
        secretCiphertext,

        JSON.stringify({
          issuer:
            'SaMi',

          email,
        }),
      ]
    );

  const authenticatorId =
    result.rows[0]?.id;

  if (
    typeof authenticatorId !==
      'string' ||
    !authenticatorId
  ) {
    throw new Error(
      'Authenticator setup could not be created.'
    );
  }

  return {
    authenticatorId,

    secret,

    otpAuthUrl:
      createOtpAuthUrl({
        issuer:
          'SaMi',

        accountName:
          email,

        secret,
      }),
  };
}

/* ============================================================
   CONFIRM TOTP SETUP

   SECURITY GUARANTEE

   These operations now occur inside ONE transaction:

   1. lock pending authenticator
   2. verify TOTP
   3. activate authenticator
   4. enable users.two_factor_enabled
   5. replace recovery-code set
   6. commit

   If recovery-code generation fails, authenticator activation
   is rolled back.

   If authenticator activation fails, recovery-code changes are
   rolled back.

   The user cannot be left with newly-enabled 2FA but without
   the recovery codes that should have been presented to them.
   ============================================================ */

export async function confirmTwoFactorSetup(
  input: {
    userId: string;
    authenticatorId: string;
    code: string;
  }
): Promise<TwoFactorConfirmationResult> {
  const userId =
    requireUserId(
      input.userId
    );

  const authenticatorId =
    input.authenticatorId
      .trim();

  const cleanCode =
    input.code
      .trim();

  if (
    !authenticatorId ||
    !/^\d{6}$/.test(
      cleanCode
    )
  ) {
    return {
      success:
        false,

      recoveryCodes:
        [],
    };
  }

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  let transactionOpen =
    false;

  try {
    await client.query(
      'BEGIN'
    );

    transactionOpen =
      true;

    /* ========================================================
       1. LOCK PENDING AUTHENTICATOR

       FOR UPDATE ensures two concurrent confirmation requests
       cannot both confirm the same pending factor.
       ======================================================== */

    const result =
      await client.query(
        `
          SELECT
            id,
            secret_ciphertext

          FROM user_authenticators

          WHERE id = $1
            AND user_id = $2
            AND type = 'totp'
            AND status = 'pending'
            AND revoked_at IS NULL
            AND deleted_at IS NULL

          LIMIT 1

          FOR UPDATE
        `,
        [
          authenticatorId,
          userId,
        ]
      );

    const authenticator =
      result.rows[0];

    if (
      !authenticator
        ?.secret_ciphertext
    ) {
      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      return {
        success:
          false,

        recoveryCodes:
          [],
      };
    }

    /* ========================================================
       2. DECRYPT TOTP SECRET
       ======================================================== */

    let secret:
      string;

    try {
      secret =
        decryptSecret(
          authenticator
            .secret_ciphertext
        );
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Unable to decrypt pending TOTP authenticator:',
        error
      );

      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      return {
        success:
          false,

        recoveryCodes:
          [],
      };
    }

    /* ========================================================
       3. VERIFY TOTP CODE
       ======================================================== */

    const valid =
      verifyTotpCode(
        secret,
        cleanCode
      );

    if (!valid) {
      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      return {
        success:
          false,

        recoveryCodes:
          [],
      };
    }

    /* ========================================================
       4. ACTIVATE AUTHENTICATOR + USER 2FA STATE

       The pending-state condition remains part of the UPDATE
       even though the row is already locked.

       This provides additional defensive protection against an
       unexpected state change.
       ======================================================== */

    const activationResult =
      await client.query(
        `
          WITH activated AS (
            UPDATE user_authenticators

            SET
              status = 'active',
              confirmed_at = NOW(),
              updated_at = NOW()

            WHERE id = $1
              AND user_id = $2
              AND type = 'totp'
              AND status = 'pending'
              AND revoked_at IS NULL
              AND deleted_at IS NULL

            RETURNING user_id
          )

          UPDATE users

          SET
            two_factor_enabled = TRUE,

            two_factor_enabled_at =
              COALESCE(
                two_factor_enabled_at,
                NOW()
              ),

            failed_two_factor_attempts = 0,

            updated_at = NOW()

          WHERE id = $2
            AND deleted_at IS NULL

            AND EXISTS (
              SELECT 1
              FROM activated
            )

          RETURNING id
        `,
        [
          authenticatorId,
          userId,
        ]
      );

    if (
      activationResult
        .rows.length ===
      0
    ) {
      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      return {
        success:
          false,

        recoveryCodes:
          [],
      };
    }

    /* ========================================================
       5. CREATE FRESH RECOVERY CODES

       IMPORTANT:

       This uses the SAME PoolClient and therefore the SAME
       PostgreSQL transaction.

       Existing unused recovery codes are replaced.

       This applies both when:
       - enabling 2FA for the first time
       - adding another authenticator later
       ======================================================== */

    const recoveryCodes =
      await createRecoveryCodesWithClient(
        client,
        userId
      );

    /* ========================================================
       6. COMMIT
       ======================================================== */

    await client.query(
      'COMMIT'
    );

    transactionOpen =
      false;

    /*
     * Plaintext recovery codes leave the server only through the
     * caller that explicitly handles successful setup.
     *
     * They are never persisted as plaintext.
     */
    return {
      success:
        true,

      recoveryCodes,
    };
  } catch (
    error
  ) {
    if (
      transactionOpen
    ) {
      await rollbackTransaction(
        client
      );

      transactionOpen =
        false;
    }

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   VERIFY USER 2FA CODE

   Supports:

   - 6-digit TOTP
   - SaMi recovery code

   Existing boolean return contract is intentionally preserved
   so the current login/2FA route remains compatible.
   ============================================================ */

export async function verifyUserTwoFactorCode(
  input: {
    userId: string;
    code: string;
  }
): Promise<boolean> {
  const userId =
    requireUserId(
      input.userId
    );

  const cleanCode =
    input.code
      .trim();

  if (!cleanCode) {
    return false;
  }

  /* ==========================================================
     1. TOTP

     TOTP input must be exactly six digits.

     Do not treat strings such as:

       12-34-56
       abc123456

     as authenticator codes.
     ========================================================== */

  if (
    /^\d{6}$/.test(
      cleanCode
    )
  ) {
    const result =
      await queryControl(
        `
          SELECT
            id,
            secret_ciphertext

          FROM user_authenticators

          WHERE user_id = $1
            AND type = 'totp'
            AND status = 'active'
            AND revoked_at IS NULL
            AND deleted_at IS NULL

          ORDER BY
            confirmed_at DESC
            NULLS LAST
        `,
        [
          userId,
        ]
      );

    for (
      const row of
      result.rows
    ) {
      if (
        !row.secret_ciphertext
      ) {
        continue;
      }

      let secret:
        string;

      try {
        secret =
          decryptSecret(
            row.secret_ciphertext
          );
      } catch (
        error
      ) {
        /*
         * One damaged authenticator must not prevent another
         * working authenticator or recovery code from being
         * accepted.
         */
        console.error(
          '[SaMi] Unable to decrypt an active TOTP authenticator:',
          error
        );

        continue;
      }

      if (
        !verifyTotpCode(
          secret,
          cleanCode
        )
      ) {
        continue;
      }

      /* ======================================================
         SUCCESSFUL TOTP
         ====================================================== */

      await queryControl(
        `
          WITH used_authenticator AS (
            UPDATE user_authenticators

            SET
              last_used_at = NOW(),
              updated_at = NOW()

            WHERE id = $1
              AND user_id = $2
              AND type = 'totp'
              AND status = 'active'
              AND revoked_at IS NULL
              AND deleted_at IS NULL

            RETURNING id
          )

          UPDATE users

          SET
            failed_two_factor_attempts = 0,
            updated_at = NOW()

          WHERE id = $2
            AND deleted_at IS NULL

            AND EXISTS (
              SELECT 1
              FROM used_authenticator
            )
        `,
        [
          row.id,
          userId,
        ]
      );

      return true;
    }
  }

  /* ==========================================================
     2. RECOVERY CODE

     Recovery-code normalization, hashing and one-time
     consumption remain owned by recovery-codes.ts.
     ========================================================== */

  const recoveryValid =
    await consumeRecoveryCode(
      userId,
      cleanCode
    );

  if (
    recoveryValid
  ) {
    await queryControl(
      `
        UPDATE users

        SET
          failed_two_factor_attempts = 0,
          updated_at = NOW()

        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [
        userId,
      ]
    );

    return true;
  }

  /* ==========================================================
     3. FAILED ATTEMPT

     The login/2FA route remains responsible for enforcement of
     challenge-level rate limiting and blocking.

     This counter records the user-level failure state.
     ========================================================== */

  await queryControl(
    `
      UPDATE users

      SET
        failed_two_factor_attempts =
          COALESCE(
            failed_two_factor_attempts,
            0
          ) + 1,

        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      userId,
    ]
  );

  return false;
}

/* ============================================================
   REGENERATE RECOVERY CODES

   Used by the authenticated Security settings flow.

   Requirements:

   - user must exist
   - 2FA must currently be enabled
   - at least one active TOTP authenticator must exist

   A fresh set invalidates all still-unused previous codes.
   ============================================================ */

export async function regenerateTwoFactorRecoveryCodes(
  userId: string
): Promise<string[]> {
  const normalizedUserId =
    requireUserId(
      userId
    );

  const pool =
    getControlPool();

  const client =
    await pool.connect();

  let transactionOpen =
    false;

  try {
    await client.query(
      'BEGIN'
    );

    transactionOpen =
      true;

    /* ========================================================
       LOCK USER SECURITY STATE
       ======================================================== */

    const userResult =
      await client.query(
        `
          SELECT
            id,
            two_factor_enabled

          FROM users

          WHERE id = $1
            AND deleted_at IS NULL

          LIMIT 1

          FOR UPDATE
        `,
        [
          normalizedUserId,
        ]
      );

    const user =
      userResult.rows[0];

    if (
      !user ||
      user.two_factor_enabled !==
        true
    ) {
      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      throw new Error(
        'Two-factor authentication is not enabled.'
      );
    }

    /* ========================================================
       REQUIRE ACTIVE AUTHENTICATOR
       ======================================================== */

    const authenticatorResult =
      await client.query(
        `
          SELECT
            id

          FROM user_authenticators

          WHERE user_id = $1
            AND type = 'totp'
            AND status = 'active'
            AND revoked_at IS NULL
            AND deleted_at IS NULL

          ORDER BY
            confirmed_at DESC
            NULLS LAST

          LIMIT 1
        `,
        [
          normalizedUserId,
        ]
      );

    if (
      authenticatorResult
        .rows.length ===
      0
    ) {
      await client.query(
        'ROLLBACK'
      );

      transactionOpen =
        false;

      throw new Error(
        'No active authenticator is available.'
      );
    }

    /* ========================================================
       REPLACE RECOVERY CODES
       ======================================================== */

    const recoveryCodes =
      await createRecoveryCodesWithClient(
        client,
        normalizedUserId
      );

    await client.query(
      'COMMIT'
    );

    transactionOpen =
      false;

    return recoveryCodes;
  } catch (
    error
  ) {
    if (
      transactionOpen
    ) {
      await rollbackTransaction(
        client
      );

      transactionOpen =
        false;
    }

    throw error;
  } finally {
    client.release();
  }
}

/* ============================================================
   DISABLE 2FA
   ============================================================ */

export async function disableTwoFactor(
  userId: string
): Promise<void> {
  const normalizedUserId =
    requireUserId(
      userId
    );

  /*
   * TOTP authenticators, recovery codes and the user-level 2FA
   * state are changed by ONE PostgreSQL statement.
   *
   * We intentionally restrict authenticators to type='totp'.
   *
   * Future authenticator types must not accidentally be revoked
   * merely because TOTP 2FA was disabled.
   */
  await queryControl(
    `
      WITH revoked_authenticators AS (
        UPDATE user_authenticators

        SET
          status = 'revoked',

          revoked_at =
            COALESCE(
              revoked_at,
              NOW()
            ),

          updated_at = NOW()

        WHERE user_id = $1
          AND type = 'totp'
          AND revoked_at IS NULL
          AND deleted_at IS NULL

        RETURNING id
      ),

      revoked_recovery_codes AS (
        UPDATE user_recovery_codes

        SET
          revoked_at = NOW()

        WHERE user_id = $1
          AND used_at IS NULL
          AND revoked_at IS NULL

        RETURNING id
      )

      UPDATE users

      SET
        two_factor_enabled = FALSE,
        two_factor_enabled_at = NULL,
        failed_two_factor_attempts = 0,
        updated_at = NOW()

      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [
      normalizedUserId,
    ]
  );
}