
import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  getControlPool,
} from '@/lib/db/control';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

import {
  sendVerificationEmail,
} from '@/lib/services/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const CODE_EXPIRY_MINUTES =
  15;

const RESEND_COOLDOWN_SECONDS =
  60;

const MAX_EMAIL_LENGTH =
  254;

/* ============================================================
   TYPES
   ============================================================ */

type RequestBody = {
  email?: unknown;
};

type VerificationUserRow = {
  id: string;

  email: string;

  first_name:
    | string
    | null;

  status: string;

  email_verified_at:
    | Date
    | string
    | null;
};

type VerificationRow = {
  created_at:
    | Date
    | string;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value: unknown
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

function isValidEmail(
  email: string
): boolean {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

/* ============================================================
   VERIFICATION CODE
   ============================================================ */

function createVerificationCode():
  string {
  return crypto
    .randomInt(
      100000,
      1000000
    )
    .toString();
}

function hashCode(
  code: string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(code)
    .digest('hex');
}

/* ============================================================
   APP URL
   ============================================================ */

function getAppBaseUrl(
  request: NextRequest
): string {
  /*
   * Prefer a server-controlled application URL.
   *
   * Do not construct verification links directly from
   * x-forwarded-host / Host because those headers can be
   * unsafe when proxy configuration is incorrect.
   */
  const configured =
    process.env.APP_URL;

  if (configured) {
    try {
      const url =
        new URL(
          configured
        );

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return url.origin;
      }
    } catch {
      console.error(
        '[Auth] Invalid APP_URL.'
      );
    }
  }

  return request
    .nextUrl
    .origin;
}

/* ============================================================
   RESPONSES
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

/*
 * Public resend endpoints should not reveal:
 *
 * - whether the email exists
 * - whether it is already verified
 * - whether its workspace is still provisioning
 * - whether a resend was rate limited
 */
function successResponse() {
  return jsonResponse({
    success: true,

    code:
      'VERIFICATION_RESEND_ACCEPTED',

    message:
      'If this email needs verification, a new code has been sent.',
  });
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAuthEvent(
  input: Parameters<
    typeof recordAuthEvent
  >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (error) {
    console.error(
      '[Auth] Failed to record verification resend event:',
      error
    );
  }
}

/* ============================================================
   COOLDOWN
   ============================================================ */

function isWithinCooldown(
  createdAt:
    | Date
    | string
): boolean {
  const date =
    createdAt instanceof Date
      ? createdAt
      : new Date(
          createdAt
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  return (
    Date.now() -
      date.getTime() <
    RESEND_COOLDOWN_SECONDS *
      1000
  );
}

/* ============================================================
   POST /api/auth/resend-verification
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let email =
    '';

  try {
    /* ========================================================
       1. REQUEST
       ======================================================== */

    let body:
      RequestBody;

    try {
      const parsed:
        unknown =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed
        )
      ) {
        return jsonResponse(
          {
            success: false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as RequestBody;
    } catch {
      return jsonResponse(
        {
          success: false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    /* ========================================================
       2. EMAIL
       ======================================================== */

    email =
      normalizeEmail(
        body.email
      );

    if (
      !isValidEmail(
        email
      )
    ) {
      return jsonResponse(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Enter a valid email address.',
        },
        400
      );
    }

    /* ========================================================
       3. SERIALIZE RESENDS FOR THIS EMAIL

       This prevents two simultaneous requests from creating
       multiple live verification codes.
       ======================================================== */

    const client =
      await getControlPool()
        .connect();

    let user:
      VerificationUserRow | null =
      null;

    let code =
      '';

    let shouldSend =
      false;

    try {
      await client.query(
        'BEGIN'
      );

      await client.query(
        `
          SELECT
            pg_advisory_xact_lock(
              hashtext($1)::bigint
            )
        `,
        [
          `sami:email-verification:${email}`,
        ]
      );

      /* ======================================================
         4. ACCOUNT

         Email verification is independent of billing.

         Free, Standard and Custom registrations may verify
         immediately. Paid plans no longer wait for a PesaPal
         setup step before email verification.
       ====================================================== */

      const userResult =
        await client.query(
          `
            SELECT
              u.id,
              u.email,
              u.first_name,
              u.status,
              u.email_verified_at

            FROM users u

            WHERE LOWER(u.email) = $1
              AND u.deleted_at IS NULL

            LIMIT 1
          `,
          [
            email,
          ]
        );

      /*
       * Anti-enumeration:
       *
       * Unknown email returns exactly the same response
       * as a valid resend request.
       */
      if (
        userResult.rows.length ===
        0
      ) {
        await client.query(
          'COMMIT'
        );

        return successResponse();
      }

      user =
        userResult
          .rows[0] as VerificationUserRow;

      /* ======================================================
         5. ALREADY VERIFIED
       ====================================================== */

      if (
        user.email_verified_at
      ) {
        await client.query(
          'COMMIT'
        );

        return successResponse();
      }

      /* ======================================================
         6. CORRECT ACCOUNT STATE
       ====================================================== */

      const userStatus =
        String(
          user.status ||
            ''
        )
          .trim()
          .toLowerCase();

      if (
        userStatus !==
          'pending_verification' &&
        userStatus !==
          'pending'
      ) {
        await client.query(
          'COMMIT'
        );

        return successResponse();
      }

      /* ======================================================
         7. RESEND COOLDOWN
       ====================================================== */

      const recentResult =
        await client.query(
          `
            SELECT
              created_at

            FROM email_verifications

            WHERE LOWER(email) = $1
              AND used_at IS NULL
              AND deleted_at IS NULL

            ORDER BY
              created_at DESC

            LIMIT 1
          `,
          [
            email,
          ]
        );

      if (
        recentResult.rows.length >
        0
      ) {
        const latest =
          recentResult
            .rows[0] as VerificationRow;

        if (
          isWithinCooldown(
            latest.created_at
          )
        ) {
          await client.query(
            'COMMIT'
          );

          return successResponse();
        }
      }

      /* ======================================================
         8. GENERATE NEW CODE
       ====================================================== */

      code =
        createVerificationCode();

      const codeHash =
        hashCode(
          code
        );

      const expiresAt =
        new Date(
          Date.now() +
            CODE_EXPIRY_MINUTES *
              60 *
              1000
        );

      /* ======================================================
         9. INVALIDATE PREVIOUS CODES

         We use used_at instead of deleting rows so verification
         history remains available for security/audit purposes.
       ====================================================== */

      await client.query(
        `
          UPDATE email_verifications

          SET
            used_at = NOW()

          WHERE LOWER(email) = $1
            AND used_at IS NULL
            AND deleted_at IS NULL
        `,
        [
          email,
        ]
      );

      /* ======================================================
         10. STORE NEW CODE
       ====================================================== */

      await client.query(
        `
          INSERT INTO email_verifications (
            email,
            code_hash,
            expires_at,
            created_at
          )

          VALUES (
            $1,
            $2,
            $3,
            NOW()
          )
        `,
        [
          email,
          codeHash,
          expiresAt,
        ]
      );

      await client.query(
        'COMMIT'
      );

      shouldSend =
        true;
    } catch (error) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch {
        // Ignore rollback failure.
      }

      throw error;
    } finally {
      client.release();
    }

    /* ========================================================
       11. EMAIL
       ======================================================== */

    if (
      shouldSend &&
      user &&
      code
    ) {
      const verifyUrl =
        `${getAppBaseUrl(
          request
        )}/verify-email?email=${encodeURIComponent(
          email
        )}`;

      try {
        const delivery =
          await sendVerificationEmail(
            email,
            code,
            user.first_name ||
              '',
            {
              expiresInMinutes:
                CODE_EXPIRY_MINUTES,

              verifyUrl,
            }
          );

        if (
          !delivery.success
        ) {
          throw new Error(
            'Verification email delivery was unavailable.'
          );
        }

        await safeRecordAuthEvent({
          request,

          userId:
            user.id,

          eventType:
            'EMAIL_VERIFICATION_RESENT',

          entityType:
            'user',

          entityId:
            user.id,

          metadata: {
            email,
          },
        });
      } catch (error) {
        /*
         * Keep the public response generic.
         *
         * Returning a different response only when a real
         * account's email provider fails would create an
         * account-enumeration side channel.
         */
        console.error(
          '[Auth] Failed to resend verification email:',
          error
        );

        await safeRecordAuthEvent({
          request,

          userId:
            user.id,

          eventType:
            'EMAIL_VERIFICATION_RESEND_FAILED',

          entityType:
            'user',

          entityId:
            user.id,

          metadata: {
            email,
          },
        });
      }
    }

    /* ========================================================
       12. GENERIC SUCCESS
       ======================================================== */

    return successResponse();
  } catch (error) {
    console.error(
      '[Auth] Resend verification failed:',
      error
    );

    return jsonResponse(
      {
        success: false,

        code:
          'RESEND_VERIFICATION_ERROR',

        error:
          'Could not resend the verification code. Please try again.',
      },
      500
    );
  }
}