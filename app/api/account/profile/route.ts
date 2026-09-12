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

/* ============================================================
   CONFIG
   ============================================================ */

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ProfilePatchBody = {
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
};

/* ============================================================
   RESPONSE
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
   HELPERS
   ============================================================ */

function isObject(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}

/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success:
            false,

          code:
            'UNAUTHORIZED',

          error:
            'You must be signed in to view your account.',
        },
        401
      );
    }

    const account =
      await getUserAccount(
        session.user.id
      );

    return json({
      success:
        true,

      code:
        'PROFILE_LOADED',

      account,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success:
            false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    console.error(
      '[Account Profile GET]',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'PROFILE_LOAD_FAILED',

        error:
          'SaMi could not load your profile.',
      },
      500
    );
  }
}

/* ============================================================
   PATCH
   ============================================================ */

export async function PATCH(
  request:
    NextRequest
) {
  try {
    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return json(
        {
          success:
            false,

          code:
            'UNAUTHORIZED',

          error:
            'You must be signed in to update your account.',
        },
        401
      );
    }

    /* ========================================================
       BODY
       ======================================================== */

    let body:
      ProfilePatchBody;

    try {
      const parsed =
        await request.json();

      if (
        !isObject(
          parsed
        )
      ) {
        return json(
          {
            success:
              false,

            code:
              'INVALID_REQUEST_BODY',

            error:
              'The profile update request is invalid.',
          },
          400
        );
      }

      body =
        parsed;
    } catch {
      return json(
        {
          success:
            false,

          code:
            'INVALID_JSON',

          error:
            'The profile update request contains invalid JSON.',
        },
        400
      );
    }

    /* ========================================================
       SUPPORTED FIELDS ONLY

       Category 02 profile fields:

       - firstName
       - lastName
       - phone

       NOT accepted here:
       - email
       - password
       - avatar
       - status
       - roles
       - permissions
       - 2FA
       - memberships
       ======================================================== */

    const hasFirstName =
      Object.prototype
        .hasOwnProperty.call(
          body,
          'firstName'
        );

    const hasLastName =
      Object.prototype
        .hasOwnProperty.call(
          body,
          'lastName'
        );

    const hasPhone =
      Object.prototype
        .hasOwnProperty.call(
          body,
          'phone'
        );

    if (
      !hasFirstName &&
      !hasLastName &&
      !hasPhone
    ) {
      return json(
        {
          success:
            false,

          code:
            'NO_PROFILE_CHANGES',

          error:
            'No supported profile changes were provided.',
        },
        400
      );
    }

    /* ========================================================
       CURRENT ACCOUNT

       PATCH means an omitted field must remain unchanged.

       Example:

       {
         "firstName": "Samson"
       }

       must NOT erase:
       - lastName
       - phone
       ======================================================== */

    const current =
      await getUserAccount(
        session.user.id
      );

    /* ========================================================
       FIRST NAME
       ======================================================== */

    let firstName =
      current.firstName;

    if (
      hasFirstName
    ) {
      if (
        typeof body.firstName !==
        'string'
      ) {
        return json(
          {
            success:
              false,

            code:
              'INVALID_FIRST_NAME',

            error:
              'First name must be text.',
          },
          400
        );
      }

      firstName =
        body.firstName;
    }

    /* ========================================================
       LAST NAME
       ======================================================== */

    let lastName =
      current.lastName;

    if (
      hasLastName
    ) {
      if (
        typeof body.lastName !==
        'string'
      ) {
        return json(
          {
            success:
              false,

            code:
              'INVALID_LAST_NAME',

            error:
              'Last name must be text.',
          },
          400
        );
      }

      lastName =
        body.lastName;
    }

    /* ========================================================
       PHONE

       Semantics:

       omitted
       → preserve current phone

       null
       → clear phone

       ""
       → service normalizes to null

       string
       → update phone
       ======================================================== */

    let phone:
      string | null =
      current.phone;

    if (
      hasPhone
    ) {
      if (
        body.phone !==
          null &&
        typeof body.phone !==
          'string'
      ) {
        return json(
          {
            success:
              false,

            code:
              'INVALID_PHONE',

            error:
              'Phone must be text or null.',
          },
          400
        );
      }

      phone =
        body.phone as
          | string
          | null;
    }

    /* ========================================================
       UPDATE
       ======================================================== */

    const account =
      await updateUserProfile(
        session.user.id,
        {
          firstName,
          lastName,
          phone,
        }
      );

    return json({
      success:
        true,

      code:
        'PROFILE_UPDATED',

      message:
        'Your profile has been updated.',

      account,
    });
  } catch (
    error
  ) {
    /* ========================================================
       ACCOUNT NOT FOUND
       ======================================================== */

    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success:
            false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    /* ========================================================
       DOMAIN VALIDATION
       ======================================================== */

    if (
      error instanceof
      UserAccountValidationError
    ) {
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,

          field:
            error.field ??
            null,
        },
        400
      );
    }

    /* ========================================================
       INTERNAL FAILURE
       ======================================================== */

    console.error(
      '[Account Profile PATCH]',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'PROFILE_UPDATE_FAILED',

        error:
          'SaMi could not update your profile.',
      },
      500
    );
  }
}