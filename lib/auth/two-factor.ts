import { queryControl } from '@/lib/db/control';

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
   STATUS
   ============================================================ */

export async function getTwoFactorStatus(
  userId: string
): Promise<TwoFactorStatus> {
  const [
    userResult,
    factorResult,
    recoveryCodeCount,
  ] = await Promise.all([
    queryControl(
      `
        SELECT
          two_factor_enabled

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [userId]
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
      [userId]
    ),

    countActiveRecoveryCodes(
      userId
    ),
  ]);

  const authenticatorCount =
    Number(
      factorResult.rows[0]?.count ||
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
   This allows SaMi to support multiple authenticators later
   without destroying an already working 2FA configuration.
   ============================================================ */

export async function createTwoFactorSetup(
  input: {
    userId: string;
    email: string;
  }
): Promise<TwoFactorSetupResult> {
  const email =
    input.email
      .trim()
      .toLowerCase();

  if (!input.userId.trim()) {
    throw new Error(
      'User ID is required.'
    );
  }

  if (!email) {
    throw new Error(
      'Email is required for authenticator setup.'
    );
  }

  const secret =
    generateTotpSecret();

  const secretCiphertext =
    encryptSecret(
      secret
    );

  /*
   * Revoke an unfinished setup and create the new pending
   * authenticator in one database statement.
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
        input.userId,
        secretCiphertext,
        JSON.stringify({
          issuer: 'SaMi',
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
        issuer: 'SaMi',

        accountName:
          email,

        secret,
      }),
  };
}

/* ============================================================
   CONFIRM TOTP SETUP
   ============================================================ */

export async function confirmTwoFactorSetup(
  input: {
    userId: string;
    authenticatorId: string;
    code: string;
  }
): Promise<TwoFactorConfirmationResult> {
  const cleanCode =
    input.code.trim();

  if (
    !/^\d{6}$/.test(
      cleanCode
    )
  ) {
    return {
      success: false,
      recoveryCodes: [],
    };
  }

  /* ==========================================================
     1. LOAD PENDING AUTHENTICATOR
     ========================================================== */

  const result =
    await queryControl(
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
      `,
      [
        input.authenticatorId,
        input.userId,
      ]
    );

  const authenticator =
    result.rows[0];

  if (
    !authenticator
      ?.secret_ciphertext
  ) {
    return {
      success: false,
      recoveryCodes: [],
    };
  }

  /* ==========================================================
     2. VERIFY TOTP
     ========================================================== */

  let secret:
    string;

  try {
    secret =
      decryptSecret(
        authenticator
          .secret_ciphertext
      );
  } catch (error) {
    console.error(
      '[SaMi] Unable to decrypt pending TOTP authenticator:',
      error
    );

    return {
      success: false,
      recoveryCodes: [],
    };
  }

  const valid =
    verifyTotpCode(
      secret,
      cleanCode
    );

  if (!valid) {
    return {
      success: false,
      recoveryCodes: [],
    };
  }

  /* ==========================================================
     3. ACTIVATE

     The authenticator and users.two_factor_enabled flag are
     changed in the SAME SQL statement.

     status='pending' in the UPDATE also prevents two concurrent
     confirmation requests from both succeeding.
     ========================================================== */

  const activationResult =
    await queryControl(
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
        input.authenticatorId,
        input.userId,
      ]
    );

  if (
    activationResult.rows
      .length === 0
  ) {
    /*
     * Usually means another request already consumed/confirmed
     * this pending authenticator.
     */
    return {
      success: false,
      recoveryCodes: [],
    };
  }

  /* ==========================================================
     4. RECOVERY CODES

     Recovery codes are shown once to the user after successful
     authenticator confirmation.
     ========================================================== */

  const recoveryCodes =
    await createRecoveryCodes(
      input.userId
    );

  return {
    success: true,
    recoveryCodes,
  };
}

/* ============================================================
   VERIFY USER 2FA CODE

   Supports:
   - 6-digit TOTP
   - SaMi recovery code

   Existing return contract remains boolean so current login
   routes are not broken.
   ============================================================ */

export async function verifyUserTwoFactorCode(
  input: {
    userId: string;
    code: string;
  }
): Promise<boolean> {
  const cleanCode =
    input.code.trim();

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
          input.userId,
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
      } catch (error) {
        /*
         * One damaged authenticator must not prevent another
         * valid authenticator or recovery code from working.
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
          input.userId,
        ]
      );

      return true;
    }
  }

  /* ==========================================================
     2. RECOVERY CODE

     Recovery-code normalization/hashing/one-time consumption
     remains owned by lib/auth/recovery-codes.
     ========================================================== */

  const recoveryValid =
    await consumeRecoveryCode(
      input.userId,
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
        input.userId,
      ]
    );

    return true;
  }

  /* ==========================================================
     3. FAILED ATTEMPT

     COALESCE prevents a legacy/null counter from remaining NULL.
     The login/2FA route remains responsible for enforcing the
     actual challenge lock/rate-limit policy.
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
      input.userId,
    ]
  );

  return false;
}

/* ============================================================
   DISABLE 2FA
   ============================================================ */

export async function disableTwoFactor(
  userId: string
): Promise<void> {
  /*
   * TOTP authenticators, recovery codes and the user-level 2FA
   * state are updated together in one database statement.
   *
   * We intentionally restrict authenticators to type='totp'.
   * A future SaMi authenticator type must not accidentally be
   * revoked merely because TOTP 2FA was disabled.
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
      userId,
    ]
  );
}