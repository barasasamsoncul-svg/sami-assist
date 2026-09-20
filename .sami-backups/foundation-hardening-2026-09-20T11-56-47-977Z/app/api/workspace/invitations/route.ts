import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createWorkspaceInvitation,
  getWorkspaceInvitation,
  listWorkspaceInvitations,
  markWorkspaceInvitationSent,
  prepareWorkspaceInvitationResend,
  revokeWorkspaceInvitation,
  InvitationServiceError,
  type WorkspaceInvitationMemberType,
  type WorkspaceInvitationStatus,
} from '@/lib/services/invitations';

import {
  sendWorkspaceInvitationEmail,
} from '@/lib/services/invitation-email';

import {
  PermissionGuardError,
} from '@/lib/auth/permission-guards';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';

import {
  CompanyContextError,
} from '@/lib/auth/company-context';


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
   AUDIT CONTEXT
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
   STRING ARRAY
   ================================================================ */

function stringArray(
  value:
    unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }


  return value.filter(
    (
      item,
    ): item is string =>
      typeof item ===
      'string',
  );
}


/* ================================================================
   MEMBER TYPE
   ================================================================ */

function memberType(
  value:
    unknown,
):
  WorkspaceInvitationMemberType
  | undefined {
  if (
    value ===
      'internal' ||
    value ===
      'portal'
  ) {
    return value;
  }


  return undefined;
}


/* ================================================================
   STATUS
   ================================================================ */

function invitationStatus(
  value:
    string | null,
):
  WorkspaceInvitationStatus
  | 'all' {
  switch (
    value
  ) {
    case 'pending':
    case 'accepted':
    case 'revoked':
    case 'expired':
      return value;

    default:
      return 'all';
  }
}


/* ================================================================
   INTEGER
   ================================================================ */

function integerQuery(
  value:
    string | null,

  fallback:
    number,
): number {
  if (
    !value
  ) {
    return fallback;
  }


  const parsed =
    Number.parseInt(
      value,
      10,
    );


  return Number.isFinite(
    parsed,
  )
    ? parsed
    : fallback;
}


/* ================================================================
   ERROR HANDLING
   ================================================================ */

function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      InvitationServiceError
  ) {
    switch (
      error.code
    ) {
      case 'ROLE_ACCESS_DENIED':
      case 'PRIVILEGE_ESCALATION_BLOCKED':
      case 'COMPANY_ACCESS_DENIED':
      case 'CONTEXT_MISMATCH':
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
      case 'ROLE_NOT_FOUND':
      case 'COMPANY_NOT_FOUND':
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


      case 'MEMBER_ALREADY_EXISTS':
      case 'INVITATION_ALREADY_PENDING':
      case 'INVITATION_NOT_PENDING':
      case 'INVITATION_EXPIRED':
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


  if (
    error instanceof
      PermissionGuardError
  ) {
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
  }


  if (
    error instanceof
      TenantContextError
  ) {
    return json(
      {
        success:
          false,

        code:
          error.code,

        error:
          error.message,
      },

      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : 403,
    );
  }


  if (
    error instanceof
      CompanyContextError
  ) {
    return json(
      {
        success:
          false,

        code:
          error.code,

        error:
          error.message,
      },

      error.code ===
        'UNAUTHENTICATED'
        ? 401
        : 403,
    );
  }


  console.error(
    '[SaMi] Invitations API failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'INVITATIONS_REQUEST_FAILED',

      error:
        'SaMi could not complete the invitation request.',
    },

    500,
  );
}


/* ================================================================
   GET /api/workspace/invitations

   Supports:

   /api/workspace/invitations
   /api/workspace/invitations?status=pending
   /api/workspace/invitations?search=user@example.com
   /api/workspace/invitations?invitationId=<uuid>

   ================================================================ */

export async function GET(
  request:
    NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl
        .searchParams;


    const invitationId =
      searchParams.get(
        'invitationId',
      );


    /*
     * Record form / detail view.
     */
    if (
      invitationId
    ) {
      const invitation =
        await getWorkspaceInvitation(
          invitationId,
        );


      return json({
        success:
          true,

        invitation,
      });
    }


    /*
     * Odoo-style list view.
     */
    const invitations =
      await listWorkspaceInvitations({
        status:
          invitationStatus(
            searchParams.get(
              'status',
            ),
          ),

        search:
          searchParams.get(
            'search',
          ) ||
          undefined,

        limit:
          integerQuery(
            searchParams.get(
              'limit',
            ),
            100,
          ),

        offset:
          integerQuery(
            searchParams.get(
              'offset',
            ),
            0,
          ),
      });


    return json({
      success:
        true,

      invitations,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   POST /api/workspace/invitations

   CREATE + DELIVER

   Browser sends:

   {
     email,
     memberType,
     roleIds,
     companyIds,
     defaultCompanyId,
     message,
     expiresInDays
   }

   Browser NEVER supplies tenantId.

   ================================================================ */

export async function POST(
  request:
    NextRequest,
) {
  /*
   * Compatibility entry point only.
   *
   * 307 preserves method and request body while routing ALL invitation
   * creation through the canonical Role → Apps → Companies endpoint.
   * The original implementation remains below intentionally so this
   * hardening release does not delete working lifecycle code.
   */
  return NextResponse.redirect(
    new URL(
      '/api/workspace/invitations/create-with-access',
      request.url,
    ),
    307,
  );

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


    /*
     * Service creates the invitation and returns the ONE raw token.
     *
     * The token is never returned to the browser.
     */
    const created =
      await createWorkspaceInvitation({
        email:
          typeof body.email ===
            'string'
            ? body.email
            : '',

        memberType:
          memberType(
            body.memberType,
          ),

        roleIds:
          stringArray(
            body.roleIds,
          ),

        companyIds:
          stringArray(
            body.companyIds,
          ),

        defaultCompanyId:
          typeof body.defaultCompanyId ===
            'string'
            ? body.defaultCompanyId
            : null,

        message:
          typeof body.message ===
            'string'
            ? body.message
            : null,

        expiresInDays:
          typeof body.expiresInDays ===
            'number'
            ? body.expiresInDays
            : undefined,

        audit:
          getAuditContext(
            request,
          ),
      });


    /*
     * Email is delivered after the DB transaction.
     *
     * The raw token exists only here and inside the mailer call.
     */
    let delivery;


    try {
      delivery =
        await sendWorkspaceInvitationEmail({
          invitation:
            created.invitation,

          token:
            created.token,
        });
    } catch (
      error
    ) {
      console.error(
        '[SaMi] Invitation was created but email delivery failed:',
        error,
      );


      return json(
        {
          success:
            false,

          code:
            'INVITATION_EMAIL_FAILED',

          error:
            'The invitation was created, but the email could not be delivered. You can resend it from Invitations.',

          invitation:
            created.invitation,

          emailSent:
            false,
        },

        502,
      );
    }


    /*
     * Development without SMTP may intentionally return
     * delivery.success=false.
     */
    if (
      !delivery.success
    ) {
      return json(
        {
          success:
            true,

          code:
            'INVITATION_CREATED_EMAIL_NOT_SENT',

          message:
            'The invitation was created. Email delivery is not configured in this environment.',

          invitation:
            created.invitation,

          emailSent:
            false,
        },

        201,
      );
    }


    const invitation =
      await markWorkspaceInvitationSent({
        invitationId:
          created.invitation.id,

        audit:
          getAuditContext(
            request,
          ),
      });


    return json(
      {
        success:
          true,

        code:
          'INVITATION_CREATED',

        message:
          'Invitation sent successfully.',

        invitation,

        emailSent:
          true,
      },

      201,
    );
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ================================================================
   PATCH /api/workspace/invitations

   Supported actions:

   {
     action: "resend",
     invitationId: "..."
   }

   {
     action: "revoke",
     invitationId: "..."
   }

   ================================================================ */

export async function PATCH(
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


    const invitationId =
      typeof body.invitationId ===
        'string'
        ? body.invitationId
        : '';


    const action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';


    const audit =
      getAuditContext(
        request,
      );


    /* ==========================================================
       RESEND
       ========================================================== */

    if (
      action ===
        'resend'
    ) {
      const prepared =
        await prepareWorkspaceInvitationResend({
          invitationId,

          expiresInDays:
            typeof body.expiresInDays ===
              'number'
              ? body.expiresInDays
              : undefined,

          audit,
        });


      let delivery;


      try {
        delivery =
          await sendWorkspaceInvitationEmail({
            invitation:
              prepared.invitation,

            token:
              prepared.token,
          });
      } catch (
        error
      ) {
        console.error(
          '[SaMi] Invitation resend delivery failed:',
          error,
        );


        return json(
          {
            success:
              false,

            code:
              'INVITATION_EMAIL_FAILED',

            error:
              'The invitation was refreshed, but the email could not be delivered. Try sending it again.',

            invitation:
              prepared.invitation,

            emailSent:
              false,
          },

          502,
        );
      }


      if (
        !delivery.success
      ) {
        return json({
          success:
            true,

          code:
            'INVITATION_RESEND_EMAIL_NOT_SENT',

          message:
            'The invitation was refreshed. Email delivery is not configured in this environment.',

          invitation:
            prepared.invitation,

          emailSent:
            false,
        });
      }


      const invitation =
        await markWorkspaceInvitationSent({
          invitationId:
            prepared.invitation.id,

          audit,
        });


      return json({
        success:
          true,

        code:
          'INVITATION_RESENT',

        message:
          'Invitation resent successfully.',

        invitation,

        emailSent:
          true,
      });
    }


    /* ==========================================================
       REVOKE
       ========================================================== */

    if (
      action ===
        'revoke'
    ) {
      const invitation =
        await revokeWorkspaceInvitation({
          invitationId,

          audit,
        });


      return json({
        success:
          true,

        code:
          'INVITATION_REVOKED',

        message:
          'Invitation revoked.',

        invitation,
      });
    }


    return json(
      {
        success:
          false,

        code:
          'INVALID_INVITATION_ACTION',

        error:
          'Unsupported invitation action.',
      },

      400,
    );
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}