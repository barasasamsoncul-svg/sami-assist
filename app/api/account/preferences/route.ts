import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getUserPreferences,
  updateUserPreferences,
  UserAccountNotFoundError,
  UserAccountValidationError,
} from '@/lib/account/user-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type PreferencesRequestBody = {
  theme?: unknown;
  locale?: unknown;
  timezone?: unknown;
  dateFormat?: unknown;
  timeFormat?: unknown;
  firstDayOfWeek?: unknown;
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
   AUTHENTICATION
   ============================================================ */

async function requireAccountSession() {
  const session =
    await getSession();

  if (!session) {
    return null;
  }

  return session;
}

/* ============================================================
   GET
   /api/account/preferences

   Returns the current signed-in user's PERSONAL preferences.

   These are global SaMi account preferences.

   They are NOT:
   - tenant settings
   - company settings
   - team settings
   - module settings
   - workspace preferences belonging to another user
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await requireAccountSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to access your preferences.',
        },
        401
      );
    }

    /* ========================================================
       LOAD
       ======================================================== */

    const preferences =
      await getUserPreferences(
        session.user.id
      );

    /* ========================================================
       RESPONSE
       ======================================================== */

    return json({
      success: true,

      code:
        'ACCOUNT_PREFERENCES_LOADED',

      preferences,
    });
  } catch (error) {
    /* ========================================================
       ACCOUNT NOT FOUND
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
      '[Account] Load preferences failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'ACCOUNT_PREFERENCES_ERROR',

        error:
          'SaMi could not load your preferences.',
      },
      500
    );
  }
}

/* ============================================================
   PATCH
   /api/account/preferences

   Allows the current signed-in user to update their own:

   - theme
   - locale
   - timezone
   - date format
   - time format
   - first day of week

   Partial updates are supported.

   Example:

   {
     "theme": "dark",
     "timezone": "Africa/Nairobi"
   }

   This endpoint does NOT modify:
   - another user's preferences
   - workspace configuration
   - company configuration
   - roles
   - permissions
   - membership
   - subscription
   ============================================================ */

export async function PATCH(
  request: NextRequest
) {
  try {
    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await requireAccountSession();

    if (!session) {
      return json(
        {
          success: false,

          code:
            'UNAUTHENTICATED',

          error:
            'You must sign in to update your preferences.',
        },
        401
      );
    }

    /* ========================================================
       BODY
       ======================================================== */

    let body:
      PreferencesRequestBody;

    try {
      const parsed =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed
        )
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

      body =
        parsed as PreferencesRequestBody;
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

    /* ========================================================
       REQUIRE AT LEAST ONE SUPPORTED FIELD
       ======================================================== */

    const hasSupportedField =
      body.theme !== undefined ||
      body.locale !== undefined ||
      body.timezone !== undefined ||
      body.dateFormat !== undefined ||
      body.timeFormat !== undefined ||
      body.firstDayOfWeek !== undefined;

    if (
      !hasSupportedField
    ) {
      return json(
        {
          success: false,

          code:
            'NO_PREFERENCE_CHANGES',

          error:
            'No preference changes were provided.',
        },
        400
      );
    }

    /* ========================================================
       THEME
       ======================================================== */

    if (
      body.theme !== undefined &&
      typeof body.theme !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_THEME',

          error:
            'Choose a valid theme.',

          field:
            'theme',
        },
        400
      );
    }

    /* ========================================================
       LOCALE
       ======================================================== */

    if (
      body.locale !== undefined &&
      typeof body.locale !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_LOCALE',

          error:
            'Choose a valid language or locale.',

          field:
            'locale',
        },
        400
      );
    }

    /* ========================================================
       TIMEZONE
       ======================================================== */

    if (
      body.timezone !== undefined &&
      typeof body.timezone !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_TIMEZONE',

          error:
            'Choose a valid timezone.',

          field:
            'timezone',
        },
        400
      );
    }

    /* ========================================================
       DATE FORMAT
       ======================================================== */

    if (
      body.dateFormat !== undefined &&
      typeof body.dateFormat !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_DATE_FORMAT',

          error:
            'Choose a valid date format.',

          field:
            'dateFormat',
        },
        400
      );
    }

    /* ========================================================
       TIME FORMAT
       ======================================================== */

    if (
      body.timeFormat !== undefined &&
      typeof body.timeFormat !==
        'string'
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_TIME_FORMAT',

          error:
            'Choose a valid time format.',

          field:
            'timeFormat',
        },
        400
      );
    }

    /* ========================================================
       FIRST DAY OF WEEK
       ======================================================== */

    if (
      body.firstDayOfWeek !==
        undefined &&
      (
        typeof body.firstDayOfWeek !==
          'number' ||
        !Number.isInteger(
          body.firstDayOfWeek
        )
      )
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_FIRST_DAY_OF_WEEK',

          error:
            'Choose a valid first day of the week.',

          field:
            'firstDayOfWeek',
        },
        400
      );
    }

    /* ========================================================
       UPDATE
       ======================================================== */

    const preferences =
      await updateUserPreferences(
        session.user.id,
        {
          theme:
            body.theme as
              | 'system'
              | 'light'
              | 'dark'
              | undefined,

          locale:
            body.locale as
              | string
              | undefined,

          timezone:
            body.timezone as
              | string
              | undefined,

          dateFormat:
            body.dateFormat as
              | 'DD/MM/YYYY'
              | 'MM/DD/YYYY'
              | 'YYYY-MM-DD'
              | undefined,

          timeFormat:
            body.timeFormat as
              | '12h'
              | '24h'
              | undefined,

          firstDayOfWeek:
            body.firstDayOfWeek as
              | number
              | undefined,
        }
      );

    /* ========================================================
       SUCCESS
       ======================================================== */

    return json({
      success: true,

      code:
        'ACCOUNT_PREFERENCES_UPDATED',

      message:
        'Your preferences have been updated.',

      preferences,
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
       ACCOUNT NOT FOUND
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
      '[Account] Update preferences failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'ACCOUNT_PREFERENCES_UPDATE_ERROR',

        error:
          'SaMi could not update your preferences.',
      },
      500
    );
  }
}