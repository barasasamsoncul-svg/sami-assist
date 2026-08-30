
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import crypto from 'crypto';

/*
 * ============================================================
 * VERIFY EMAIL
 * ============================================================
 *
 * SaMi uses a 6-digit email verification code.
 *
 * Flow:
 *
 * 1. Validate email + code
 * 2. Normalize email
 * 3. Validate 6-digit format
 * 4. Hash code
 * 5. Atomically find + consume valid code
 * 6. Mark user email as verified
 * 7. Invalidate remaining codes
 * 8. Return success
 *
 * ============================================================
 */

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

    const rawEmail =
      typeof (body as { email?: unknown })?.email === 'string'
        ? (body as { email: string }).email
        : '';

    const rawCode =
      typeof (body as { code?: unknown })?.code === 'string'
        ? (body as { code: string }).code
        : '';

    /*
     * ========================================================
     * Normalize input
     * ========================================================
     */

    const email =
      rawEmail
        .trim()
        .toLowerCase();

    const code =
      rawCode
        .trim();

    /*
     * ========================================================
     * Validate required fields
     * ========================================================
     */

    if (!email || !code) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Email and verification code required',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================================
     * Validate verification code
     * ========================================================
     *
     * SaMi verification codes are exactly six digits.
     */

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Verification code must be 6 digits',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================================
     * Validate email format
     * ========================================================
     */

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please enter a valid email address',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================================
     * Hash code
     * ========================================================
     *
     * The database never stores the plain verification code.
     */

    const hashedCode =
      crypto
        .createHash('sha256')
        .update(code)
        .digest('hex');

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
            email_verified_at,
            status
          FROM users
          WHERE email = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [email]
      );

    if (
      userResult.rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid or expired verification code',
        },
        {
          status: 400,
        }
      );
    }

    const user =
      userResult.rows[0];

    /*
     * ========================================================
     * Already verified
     * ========================================================
     */

    if (
      user.email_verified_at
    ) {
      return NextResponse.json(
        {
          success: true,
          alreadyVerified: true,
          verified: true,
          message:
            'Email is already verified',
        },
        {
          status: 200,
        }
      );
    }

    /*
     * ========================================================
     * Atomically consume verification code
     * ========================================================
     *
     * This is important.
     *
     * Instead of:
     *
     * SELECT code
     * UPDATE code
     *
     * we perform the consumption in one UPDATE.
     *
     * That makes it much harder for two simultaneous requests
     * to successfully use the same code.
     */

    const verificationResult =
      await queryControl(
        `
          UPDATE email_verifications
          SET used_at = NOW()
          WHERE id = (
            SELECT id
            FROM email_verifications
            WHERE email = $1
              AND code_hash = $2
              AND expires_at > NOW()
              AND used_at IS NULL
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id
        `,
        [
          email,
          hashedCode,
        ]
      );

    /*
     * No valid code.
     */

    if (
      verificationResult.rows.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid or expired verification code',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ========================================================
     * Mark email as verified
     * ========================================================
     */

    const updateResult =
      await queryControl(
        `
          UPDATE users
          SET
            email_verified_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
            AND email_verified_at IS NULL
          RETURNING
            id,
            email,
            email_verified_at
        `,
        [user.id]
      );

    /*
     * Safety check.
     */

    if (
      updateResult.rows.length === 0
    ) {
      /*
       * The code has already been consumed, but the user could
       * have been verified/deleted between operations.
       *
       * We don't expose internal state.
       */

      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to verify email. Please try again.',
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ========================================================
     * Invalidate all remaining verification codes
     * ========================================================
     *
     * Once the email is verified, no previous code should
     * remain usable.
     */

    await queryControl(
      `
        UPDATE email_verifications
        SET deleted_at = NOW()
        WHERE email = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [email]
    );

    /*
     * ========================================================
     * Success
     * ========================================================
     */

    return NextResponse.json(
      {
        success: true,
        verified: true,
        message:
          'Email verified successfully',
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
      'Email verification error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Failed to verify email. Please try again.',
      },
      {
        status: 500,
      }
    );
  }
}