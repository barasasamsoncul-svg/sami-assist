import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  EnterpriseModuleError,
  createEnterpriseModuleRecord,
  deleteEnterpriseModuleRecord,
  getEnterpriseModuleRelationOptions,
  getEnterpriseModuleWorkspace,
  transitionEnterpriseModuleRecord,
  updateEnterpriseModuleRecord,
} from '@/lib/apps/enterprise/service';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  192 *
  1024;


function respond(
  body:
    Record<string, unknown>,
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


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    site ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


function handleError(
  error:
    unknown,
) {
  if (
    error instanceof
    EnterpriseModuleError
  ) {
    const status =
      error.code ===
        'MODULE_PERMISSION_REQUIRED'
        ? 403
        : error.code ===
            'WORKSPACE_SUSPENDED'
          ? 402
          : error.code ===
              'MODULE_NOT_INSTALLED' ||
            error.code ===
              'MODULE_NOT_SUPPORTED' ||
            error.code ===
              'RECORD_NOT_FOUND'
            ? 404
            : error.code ===
                'TABLE_NOT_READY' ||
              error.code ===
                'DELETE_NOT_SUPPORTED' ||
              error.code ===
                'WORKFLOW_NOT_SUPPORTED' ||
              error.code ===
                'WORKFLOW_TRANSITION_INVALID'
              ? 409
              : 400;

    return respond(
      {
        success:
          false,
        code:
          error.code,
        error:
          error.message,
        ...error.details,
      },
      status,
    );
  }

  console.error(
    '[SaMi Enterprise App] request failed:',
    error,
  );

  return respond(
    {
      success:
        false,
      code:
        'MODULE_REQUEST_FAILED',
      error:
        'SaMi could not complete this app request.',
    },
    500,
  );
}


export async function GET(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        appKey:
          string;
      }>;
  },
) {
  try {
    const {
      appKey,
    } =
      await params;

    if (
      request.nextUrl
        .searchParams
        .get(
          'mode',
        ) ===
        'relation'
    ) {
      return respond({
        success:
          true,
        relation:
          await getEnterpriseModuleRelationOptions(
            appKey,
            {
              table:
                request.nextUrl
                  .searchParams
                  .get(
                    'table',
                  ),
              field:
                request.nextUrl
                  .searchParams
                  .get(
                    'field',
                  ),
              query:
                request.nextUrl
                  .searchParams
                  .get(
                    'query',
                  ) ||
                '',
              selected:
                request.nextUrl
                  .searchParams
                  .get(
                    'selected',
                  ),
            },
          ),
      });
    }

    return respond({
      success:
        true,
      data:
        await getEnterpriseModuleWorkspace(
          appKey,
        ),
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}


export async function POST(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        appKey:
          string;
      }>;
  },
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return respond(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This request could not be verified.',
      },
      403,
    );
  }

  const length =
    Number(
      request.headers
        .get(
          'content-length',
        ) ||
      0,
    );

  if (
    Number.isFinite(
      length,
    ) &&
    length >
      MAX_BODY_BYTES
  ) {
    return respond(
      {
        success:
          false,
        code:
          'REQUEST_TOO_LARGE',
        error:
          'This app request is too large.',
      },
      413,
    );
  }

  try {
    const {
      appKey,
    } =
      await params;

    const body =
      await request.json();

    if (
      !body ||
      typeof body !==
        'object' ||
      Array.isArray(
        body,
      )
    ) {
      return respond(
        {
          success:
            false,
          error:
            'A valid JSON request body is required.',
        },
        400,
      );
    }

    const payload =
      body as
        Record<string, unknown>;

    const action =
      typeof payload.action ===
        'string'
        ? payload.action
            .trim()
            .toLowerCase()
        : '';

    const result =
      action ===
        'create'
        ? await createEnterpriseModuleRecord(
            appKey,
            payload,
          )
        : action ===
            'update'
          ? await updateEnterpriseModuleRecord(
              appKey,
              payload,
            )
          : action ===
              'delete'
            ? await deleteEnterpriseModuleRecord(
                appKey,
                payload,
              )
            : action ===
                'transition'
              ? await transitionEnterpriseModuleRecord(
                  appKey,
                  payload,
                )
              : null;

    if (
      !result
    ) {
      return respond(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Choose a valid app action.',
        },
        400,
      );
    }

    return respond({
      success:
        true,
      result:
        result as
          Record<string, unknown>,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
