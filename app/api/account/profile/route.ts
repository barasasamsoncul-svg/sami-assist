import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getUserAccount,
  updateUserProfile,
  UserAccountNotFoundError,
  UserAccountValidationError,
} from '@/lib/account/user-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type UpdateProfileBody = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
};

/* ============================================================
   RESPONSE HELPER
   ============================================================ */

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
   /api/account/profile

   Returns the signed-in user's own global SaMi account.

   This applies to:
   - workspace owner
   - administrator
   - invited team member
   - any other authenticated SaMi user

   It does NOT return workspace roles or permissions.
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to access your account.',
        },
        401
      );
    }

    const account =
      await getUserAccount(
        session.user.id
      );

    return json({
      success: true,

      code:
        'ACCOUNT_PROFILE_LOADED',

      account,
    });
  } catch (error) {
    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success: false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    console.error(
      '[Account] Load profile failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'ACCOUNT_PROFILE_ERROR',

        error:
          'SaMi could not load your account profile.',
      },
      500
    );
  }
}

/* ============================================================
   PATCH
   /api/account/profile

   Allows the signed-in user to update ONLY their own:

   - first name
   - last name
   - phone

   full_name is generated server-side.

   This endpoint deliberately cannot modify:

   - email
   - password
   - avatar
   - account status
   - 2FA
   - login security
   - workspace membership
   - workspace roles
   - workspace permissions
   ============================================================ */

export async function PATCH(
  request: NextRequest
) {
  try {
    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to update your account.',
        },
        401
      );
    }

    /* ========================================================
       BODY
       ======================================================== */

    let body:
      UpdateProfileBody;

    try {
      body =
        (await request.json()) as UpdateProfileBody;
    } catch {
      return json(
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

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(body)
    ) {
      return json(
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
       FIRST NAME
       ======================================================== */

    if (
      typeof body.firstName !==
      'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_FIRST_NAME',

          error:
            'Enter your first name.',

          field:
            'firstName',
        },
        400
      );
    }

    /* ========================================================
       LAST NAME
       ======================================================== */

    if (
      typeof body.lastName !==
      'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_LAST_NAME',

          error:
            'Enter your last name.',

          field:
            'lastName',
        },
        400
      );
    }

    /* ========================================================
       PHONE
       ======================================================== */

    if (
      body.phone !== undefined &&
      body.phone !== null &&
      typeof body.phone !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_PHONE',

          error:
            'Enter a valid phone number.',

          field:
            'phone',
        },
        400
      );
    }

    /* ========================================================
       UPDATE
       ======================================================== */

    const account =
      await updateUserProfile(
        session.user.id,
        {
          firstName:
            body.firstName,

          lastName:
            body.lastName,

          phone:
            body.phone ===
              undefined
              ? null
              : body.phone,
        }
      );

    return json({
      success: true,

      code:
        'ACCOUNT_PROFILE_UPDATED',

      message:
        'Your profile has been updated.',

      account,
    });
  } catch (error) {
    /* ========================================================
       VALIDATION
       ======================================================== */

    if (
      error instanceof
      UserAccountValidationError
    ) {
      return json(
        {
          success: false,

          code:
            error.code,

          error:
            error.message,

          field:
            error.field,
        },
        400
      );
    }

    /* ========================================================
       ACCOUNT MISSING
       ======================================================== */

    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success: false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    /* ========================================================
       INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Account] Update profile failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'ACCOUNT_PROFILE_UPDATE_ERROR',

        error:
          'SaMi could not update your profile.',
      },
      500
    );
  }
}