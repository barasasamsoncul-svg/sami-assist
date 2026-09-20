import {
  NextRequest,
} from 'next/server';

import {
  searchWorkspace,
} from '@/lib/search/workspace-search';

import {
  handleSearchApiError,
  searchJson,
} from '@/lib/search/workspace-search-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export async function GET(
  request:
    NextRequest,
) {
  try {
    const result =
      await searchWorkspace({
        query:
          request.nextUrl
            .searchParams
            .get(
              'q',
            ),
        limit:
          request.nextUrl
            .searchParams
            .get(
              'limit',
            ),
      });

    return searchJson({
      success:
        true,
      ...result,
    });
  } catch (
    error
  ) {
    return handleSearchApiError(
      error,
    );
  }
}
