import {
  NextResponse,
} from 'next/server';

import {
  CompanyContextError,
  getCompanySelectorState,
  setCurrentCompany,
  setDefaultCompany,
  setSelectedCompanies,
} from '@/lib/auth/company-context';

import {
  TenantContextError,
} from '@/lib/auth/tenant-context';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type CompanyMutationBody = {
  action?:
    | 'set_current'
    | 'set_selected'
    | 'set_default';

  companyId?:
    string;

  companyIds?:
    string[];
};


/* ============================================================
   RESPONSE
   ============================================================ */

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
          'no-store',
      },
    },
  );
}


/* ============================================================
   ERROR HANDLING
   ============================================================ */

function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
      CompanyContextError
  ) {
    switch (
      error.code
    ) {
      case 'UNAUTHENTICATED':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              'Authentication is required.',
          },
          401,
        );


      case 'INVALID_COMPANY_ID':
      case 'EMPTY_COMPANY_SELECTION':
      case 'TOO_MANY_COMPANIES':
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


      case 'COMPANY_ACCESS_DENIED':
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


      case 'NO_WORKSPACE_SELECTED':
      case 'NO_COMPANY_ACCESS':
      case 'SESSION_UPDATE_FAILED':
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
    }
  }


  if (
    error instanceof
      TenantContextError
  ) {
    switch (
      error.code
    ) {
      case 'UNAUTHENTICATED':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              'Authentication is required.',
          },
          401,
        );


      case 'NO_WORKSPACE_SELECTED':
      case 'WORKSPACE_ACCESS_DENIED':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              'The current workspace is not available.',
          },
          403,
        );


      case 'WORKSPACE_DATABASE_UNAVAILABLE':
        return json(
          {
            success:
              false,

            code:
              error.code,

            error:
              'The current workspace is not ready.',
          },
          409,
        );
    }
  }


  console.error(
    '[SaMi] Company context request failed:',
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'COMPANY_CONTEXT_FAILED',

      error:
        'SaMi could not update the company context.',
    },
    500,
  );
}


/* ============================================================
   GET SELECTOR STATE
   ============================================================ */

export async function GET() {
  try {
    const selector =
      await getCompanySelectorState();


    return json({
      success:
        true,

      selector,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


/* ============================================================
   UPDATE SELECTOR STATE
   ============================================================ */

export async function PATCH(
  request:
    Request,
) {
  try {
    let body:
      CompanyMutationBody;


    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'A valid JSON request body is required.',
        },
        400,
      );
    }


    switch (
      body.action
    ) {
      case 'set_current': {
        if (
          typeof body.companyId !==
          'string'
        ) {
          return json(
            {
              success:
                false,

              code:
                'COMPANY_ID_REQUIRED',

              error:
                'A company ID is required.',
            },
            400,
          );
        }


        await setCurrentCompany(
          body.companyId,
        );


        break;
      }


      case 'set_selected': {
        if (
          !Array.isArray(
            body.companyIds,
          )
        ) {
          return json(
            {
              success:
                false,

              code:
                'COMPANY_SELECTION_REQUIRED',

              error:
                'Selected companies are required.',
            },
            400,
          );
        }


        await setSelectedCompanies(
          body.companyIds,
        );


        break;
      }


      case 'set_default': {
        if (
          typeof body.companyId !==
          'string'
        ) {
          return json(
            {
              success:
                false,

              code:
                'COMPANY_ID_REQUIRED',

              error:
                'A company ID is required.',
            },
            400,
          );
        }


        await setDefaultCompany(
          body.companyId,
        );


        break;
      }


      default:
        return json(
          {
            success:
              false,

            code:
              'INVALID_ACTION',

            error:
              'The requested company action is not supported.',
          },
          400,
        );
    }


    /*
     * Always return the canonical state after mutation.
     *
     * The browser never constructs authoritative company state.
     */
    const selector =
      await getCompanySelectorState();


    return json({
      success:
        true,

      selector,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}