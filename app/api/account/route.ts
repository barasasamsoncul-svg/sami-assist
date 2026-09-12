import {
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getUserAccountWithPreferences,
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

import {
  getPendingEmailChange,
} from '@/lib/account/email-change';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
   GET
   /api/account

   Main bootstrap endpoint for:

   Settings
      ↓
   My Account

   This endpoint represents the signed-in person's GLOBAL
   SaMi account.

   It applies equally to:
   - workspace owners
   - workspace admins
   - managers
   - invited team members
   - users belonging to multiple workspaces

   It does NOT represent membership inside a particular tenant.

   Workspace-specific:
   - membership
   - role
   - permissions
   - department
   - job title
   - employment state

   belong to later workspace/membership categories.
   ============================================================ */

export async function GET() {
  try {
    /* ========================================================
       1. SESSION
       ======================================================== */

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

    /* ========================================================
       2. ACCOUNT CONTEXT

       Loads:

       - global personal account
       - personal preferences
       - pending email-change state

       The user ID always comes from the authenticated session.

       The client can never request another user's account by
       supplying a user ID.
       ======================================================== */

    const [
      accountContext,
      pendingEmailChange,
    ] =
      await Promise.all([
        getUserAccountWithPreferences(
          session.user.id
        ),

        getPendingEmailChange(
          session.user.id
        ),
      ]);

    /* ========================================================
       3. RESPONSE
       ======================================================== */

    return json({
      success: true,

      code:
        'ACCOUNT_LOADED',

      account:
        accountContext.account,

      preferences:
        accountContext.preferences,

      emailChange: {
        pending:
          pendingEmailChange,
      },
    });
  } catch (error) {
    /* ========================================================
       ACCOUNT DOES NOT EXIST

       Normally getSession() already protects against an invalid
       or deleted account.

       This remains an explicit defensive boundary because the
       account may disappear between session validation and the
       account query.
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
      '[Account] Account bootstrap failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'ACCOUNT_LOAD_ERROR',

        error:
          'SaMi could not load your account.',
      },
      500
    );
  }
}