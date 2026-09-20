import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getOrganizationLogo,
  removeCurrentOrganizationLogo,
  uploadCurrentOrganizationLogo,
} from '@/lib/services/organization-logo';

import {
  handleOrganizationApiError,
  organizationJson,
} from '@/lib/services/organization-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LOGO_BYTES =
  2 * 1024 * 1024;

function sameOrigin(
  request: NextRequest,
) {
  const fetchSite =
    request.headers
      .get('sec-fetch-site')
      ?.toLowerCase();

  if (
    fetchSite ===
    'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get('origin');

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin)
        .origin ===
      request.nextUrl
        .origin
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
) {
  try {
    const logo =
      await getOrganizationLogo(
        request.nextUrl
          .searchParams
          .get('companyId'),
      );

    return new NextResponse(
      new Uint8Array(
        logo.bytes,
      ),
      {
        status:
          200,
        headers: {
          'Content-Type':
            logo.mimeType,
          'Content-Length':
            String(
              logo.bytes.length,
            ),
          'Cache-Control':
            'private, max-age=300',
          'X-Content-Type-Options':
            'nosniff',
        },
      },
    );
  } catch (error) {
    return handleOrganizationApiError(
      error,
    );
  }
}

export async function PUT(
  request: NextRequest,
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return organizationJson(
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
        .get('content-length') ||
      0,
    );

  if (
    Number.isFinite(
      length,
    ) &&
    length >
      MAX_LOGO_BYTES
  ) {
    return organizationJson(
      {
        success:
          false,
        code:
          'INVALID_FIELD',
        error:
          'Organization logo must be 2 MB or smaller.',
      },
      413,
    );
  }

  try {
    const bytes =
      Buffer.from(
        await request
          .arrayBuffer(),
      );

    const result =
      await uploadCurrentOrganizationLogo({
        bytes,
        mimeType:
          request.headers
            .get('content-type') ||
          '',
        fileName:
          request.headers
            .get(
              'x-sami-file-name',
            ),
      });

    return organizationJson({
      success:
        true,
      message:
        'Organization logo updated.',
      ...result,
    });
  } catch (error) {
    return handleOrganizationApiError(
      error,
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return organizationJson(
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

  try {
    const result =
      await removeCurrentOrganizationLogo();

    return organizationJson({
      success:
        true,
      message:
        'Organization logo removed.',
      ...result,
    });
  } catch (error) {
    return handleOrganizationApiError(
      error,
    );
  }
}
