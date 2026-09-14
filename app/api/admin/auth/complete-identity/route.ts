import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  completeAdminIdentity,
} from '@/lib/auth/admin-identity-setup';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

type CompleteIdentityBody = {
  token?:
    unknown;

  password?:
    unknown;

  confirmPassword?:
    unknown;
};

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200
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

export async function POST(
  request:
    NextRequest
) {
  try {
    let body:
      CompleteIdentityBody;

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
            success:
              false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as
          CompleteIdentityBody;
    } catch {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    const result =
      await completeAdminIdentity({
        request,

        token:
          body.token,

        password:
          body.password,

        confirmPassword:
          body.confirmPassword,
      });

    if (
      !result.success
    ) {
      switch (
        result.code
      ) {
        case 'INVALID_TOKEN':
        case 'INVALID_PASSWORD':
        case 'PASSWORD_MISMATCH':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.error,
            },
            400
          );

        case 'SETUP_TOKEN_EXPIRED':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.error,
            },
            410
          );

        case 'ADMIN_NOT_ELIGIBLE':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.error,
            },
            403
          );

        default:
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.error,
            },
            500
          );
      }
    }

    return jsonResponse({
      success:
        true,

      code:
        result.code,

      message:
        'Your SaMi administrator identity is ready.',

      admin:
        result.admin,

      next:
        result.next,
    });
  } catch (
    error
  ) {
    console.error(
      '[Admin Complete Identity API]',
      error instanceof
        Error
        ? error.message
        : 'Unknown error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'SERVICE_TEMPORARILY_UNAVAILABLE',

        error:
          'SaMi is temporarily unable to complete administrator setup. Please try again.',
      },
      503
    );
  }
}