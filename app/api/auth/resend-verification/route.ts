
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';

/*
 * ============================================================
 * RESEND EMAIL VERIFICATION CODE
 * ============================================================
 *
 * Flow:
 *
 * 1. Receive email
 * 2. Normalize email
 * 3. Find account
 * 4. Check resend cooldown
 * 5. Invalidate previous codes
 * 6. Generate secure 6-digit code
 * 7. Hash code
 * 8. Store verification record
 * 9. Send email
 * 10. Return success
 *
 * No verification tokens are used.
 * SaMi uses a 6-digit email verification code.
 *
 * ============================================================
 */

const CODE_EXPIRY_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * ========================================================
     * Parse request
     * ========================================================
     */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        {
          status: 400,
        }
      );
    }

    const email =
      typeof (body as { email?: unknown })?.email === 'string'
        ? (body as { email: string }).email
            .trim()
            .toLowerCase()
        : '';

    /*
     * ========================================================
     * Validate email
     * ========================================================
     */

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email required',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Basic email validation.
     *
     * This isn't intended to replace full email validation.
     * It simply prevents obviously invalid input.
     */

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================================
     * Find user
     * ========================================================
     */

    const userResult =
      await queryControl(
        `
          SELECT
            id,
            first_name,
            email_verified_at,
            status
          FROM users
          WHERE email = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [email]
      );

    /*
     * Don't expose unnecessary account information.
     *
     * For the actual verification screen, a missing account
     * can still return "Unable to send..." rather than exposing
     * whether an email is registered.
     */

    if (
      userResult.rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to send a verification code. Please check your email address.',
        },
        {
          status: 404,
        }
      );
    }

    const user =
      userResult.rows[0];

    /*
     * ========================================================
     * Already verified?
     * ========================================================
     */

    if (
      user.email_verified_at
    ) {
      return NextResponse.json(
        {
          success: false,
          alreadyVerified: true,
          error:
            'This email address is already verified.',
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ========================================================
     * Prevent verification-code spam
     * ========================================================
     *
     * Check the most recent verification record.
     */

    const recentCodeResult =
      await queryControl(
        `
          SELECT
            id,
            created_at
          FROM email_verifications
          WHERE email = $1
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [email]
      );

    if (
      recentCodeResult.rows.length > 0
    ) {
      const recentCode =
        recentCodeResult.rows[0];

      const createdAt =
        new Date(
          recentCode.created_at
        );

      const secondsSinceLastCode =
        Math.floor(
          (
            Date.now() -
            createdAt.getTime()
          ) / 1000
        );

      if (
        secondsSinceLastCode <
        RESEND_COOLDOWN_SECONDS
      ) {
        const retryAfter =
          Math.max(
            1,
            RESEND_COOLDOWN_SECONDS -
              secondsSinceLastCode
          );

        return NextResponse.json(
          {
            success: false,
            error:
              `Please wait ${retryAfter} seconds before requesting another code.`,
            retryAfter,
          },
          {
            status: 429,
            headers: {
              'Retry-After':
                retryAfter.toString(),
            },
          }
        );
      }
    }

    /*
     * ========================================================
     * Invalidate old verification codes
     * ========================================================
     */

    await queryControl(
      `
        UPDATE email_verifications
        SET deleted_at = NOW()
        WHERE email = $1
          AND deleted_at IS NULL
      `,
      [email]
    );

    /*
     * ========================================================
     * Generate secure 6-digit code
     * ========================================================
     *
     * crypto.randomInt() is preferable to Math.random()
     * for authentication codes.
     */

    const code =
      crypto
        .randomInt(
          100000,
          1000000
        )
        .toString();

    /*
     * ========================================================
     * Hash verification code
     * ========================================================
     *
     * The plain code is only sent to the user's email.
     * The database stores only the SHA-256 hash.
     */

    const hashedCode =
      crypto
        .createHash('sha256')
        .update(code)
        .digest('hex');

    /*
     * ========================================================
     * Code expiration
     * ========================================================
     */

    const expiresAt =
      new Date(
        Date.now() +
          CODE_EXPIRY_MINUTES *
            60 *
            1000
      );

    /*
     * ========================================================
     * Store verification code
     * ========================================================
     */

    const verificationResult =
      await queryControl(
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
          RETURNING id
        `,
        [
          email,
          hashedCode,
          expiresAt,
        ]
      );

    const verificationId =
      verificationResult.rows[0]?.id;

    /*
     * ========================================================
     * Send verification email
     * ========================================================
     */

    try {
      await sendVerificationEmail(
        email,
        code,
        user.first_name || 'there'
      );
    } catch (emailError) {
      /*
       * The email was not sent.
       *
       * Do NOT leave a valid verification code in the
       * database if the user never received it.
       */

      console.error(
        'Verification email send error:',
        emailError
      );

      if (verificationId) {
        await queryControl(
          `
            UPDATE email_verifications
            SET deleted_at = NOW()
            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [verificationId]
        );
      }

      return NextResponse.json(
        {
          success: false,
          error:
            'We could not send the verification email. Please try again.',
        },
        {
          status: 503,
        }
      );
    }

    /*
     * ========================================================
     * Success
     * ========================================================
     */

    return NextResponse.json(
      {
        success: true,
        message:
          'Verification code sent successfully.',
        expiresIn:
          CODE_EXPIRY_MINUTES * 60,
        cooldown:
          RESEND_COOLDOWN_SECONDS,
      },
      {
        status: 200,
      }
    );

  } catch (error) {
    /*
     * ========================================================
     * Unexpected error
     * ========================================================
     */

    console.error(
      'Resend verification error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to send verification code. Please try again.',
      },
      {
        status: 500,
      }
    );
  }
}