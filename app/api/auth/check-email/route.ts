import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { queryControl } from '@/lib/db/control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH = 254;

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value: string
) {
  if (
    !value ||
    value.length >
      MAX_EMAIL_LENGTH
  ) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function json(
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

/* ============================================================
   GET
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  try {
    /* ========================================================
       INPUT
       ======================================================== */

    const rawEmail =
      request.nextUrl.searchParams.get(
        'email'
      );

    if (!rawEmail) {
      return json(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Email is required.',
        },
        400
      );
    }

    const email =
      normalizeEmail(
        rawEmail
      );

    /* ========================================================
       VALIDATION
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Please enter a valid email address.',
        },
        400
      );
    }

    /* ========================================================
       ACCOUNT LOOKUP
       ======================================================== */

    const result =
      await queryControl(
        `
          SELECT id
          FROM users
          WHERE email = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [email]
      );

    const exists =
      result.rows.length > 0;

    /* ========================================================
       RESPONSE

       Keep `exists` because the current Register client
       depends on it.
       ======================================================== */

    return json({
      success: true,

      code: exists
        ? 'EMAIL_ALREADY_EXISTS'
        : 'EMAIL_AVAILABLE',

      exists,
    });
  } catch (error) {
    console.error(
      '[Auth] Check email failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'CHECK_EMAIL_ERROR',

        error:
          'Could not check this email address.',
      },
      500
    );
  }
}