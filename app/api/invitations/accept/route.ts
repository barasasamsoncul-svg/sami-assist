import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  acceptWorkspaceInvitation,
  InvitationAcceptanceError,
} from '@/lib/services/invitation-acceptance';

import {
  createSession,
  getSession,
  setCurrentTenantForSession,
} from '@/lib/auth/session';


export const runtime =
  'nodejs';


export const dynamic =
  'force-dynamic';


/* ================================================================
   RESPONSE
   ================================================================ */

function json(
  body:
    Record<
      string,
      unknown
    >,

  status =
    200,
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
    },
  );
}


/* ================================================================
   AUDIT
   ================================================================ */

function getAuditContext(
  request:
    NextRequest,
) {
  const forwarded =
    request.headers
      .get(
        'x-forwarded-for',
      )
      ?.split(
        ',',
      )[0]
      ?.trim();


  return {
    ipAddress:
      forwarded ||
      request.headers.get(
        'x-real-ip',
      ) ||
      null,

    userAgent:
      request.headers.get(
        'user-agent',
      ),

    correlationId:
      request.headers.get(
        'x-request-id',
      ),
  };
}


/* ================================================================
   ERROR
   ================================================================ */

function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      InvitationAcceptanceError
  ) {
    switch (
      error.code
    ) {
      case 'SIGN_IN_REQUIRED':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          401,
        );


      case 'ACCOUNT_MISMATCH':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          403,
        );


      case 'INVITATION_NOT_FOUND':
      case 'INVALID_TOKEN':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          404,
        );


      case 'INVITATION_NOT_PENDING':
      case 'INVITATION_EXPIRED':
      case 'MEMBER_ALREADY_EXISTS':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          409,
        );


      case 'WORKSPACE_UNAVAILABLE':
      case 'ACCOUNT_UNAVAILABLE':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          403,
        );


      default:
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              error.message,
          },

          400,
        );
    }
  }


  console.error(
    '[SaMi] Invitation acceptance API failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'INVITATION_ACCEPTANCE_FAILED',

      error:
        'SaMi could not accept this invitation.',
    },

    500,
  );
}


/* ================================================================
   POST /api/invitations/accept
   ================================================================ */

export async function POST(
  request:
    NextRequest,
) {
  try {
    let body:
      Record<
        string,
        unknown
      >;


    try {
      const parsed =
        await request.json();


      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed,
        )
      ) {
        return json(
          {
            success:
              false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid invitation request.',
          },

          400,
        );
      }


      body =
        parsed as Record<
          string,
          unknown
        >;
    } catch {
      return json(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid invitation request.',
        },

        400,
      );
    }


    const token =
      typeof body.token ===
        'string'
        ? body.token
        : '';


    const session =
      await getSession();


    const result =
      await acceptWorkspaceInvitation({
        token,

        authenticatedUserId:
          session?.user.id ||
          null,

        firstName:
          typeof body.firstName ===
            'string'
            ? body.firstName
            : '',

        lastName:
          typeof body.lastName ===
            'string'
            ? body.lastName
            : '',

        phone:
          typeof body.phone ===
            'string'
            ? body.phone
            : null,

        password:
          typeof body.password ===
            'string'
            ? body.password
            : '',

        audit:
          getAuditContext(
            request,
          ),
      });


    const rememberMe =
      body.rememberMe ===
      true;


    /* ==========================================================
       INTERNAL USER SESSION
       ========================================================== */

    if (
      result.memberType ===
        'internal'
    ) {
      if (
        session &&
        session.user.id ===
          result.userId
      ) {
        const switched =
          await setCurrentTenantForSession(
            session.sessionId,
            result.userId,
            result.tenantId,
          );


        if (
          !switched
        ) {
          throw new Error(
            'The active SaMi session could not switch to the invited workspace.',
          );
        }
      } else if (
        result.accountCreated
      ) {
        await createSession(
          result.userId,
          request,
          {
            rememberMe,

            currentTenantId:
              result.tenantId,
          },
        );
      }


      return json({
        success:
          true,

        code:
          'INVITATION_ACCEPTED',

        message:
          `You have joined ${result.workspaceName}.`,

        result,

        next:
          '/dashboard',
      });
    }


    /* ==========================================================
       PORTAL MEMBERSHIP

       Portal membership is deliberately not switched into the
       internal workspace shell.

       Category 7 already enforces this boundary.
       ========================================================== */

    return json({
      success:
        true,

      code:
        'PORTAL_INVITATION_ACCEPTED',

      message:
        `Your access to ${result.workspaceName} has been created.`,

      result,

      next:
        null,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}