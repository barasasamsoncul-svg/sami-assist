import { NextRequest } from 'next/server';
import {
  getWorkspaceActivitySummary,
  listWorkspaceActivity,
} from '@/lib/services/workspace-activity';
import {
  activityJson,
  handleActivityApiError,
} from '@/lib/services/workspace-activity-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const [result, summary] = await Promise.all([
      listWorkspaceActivity({
        view: params.get('view'),
        limit: params.get('limit'),
        cursor: params.get('cursor'),
        search: params.get('search'),
        module: params.get('module'),
        result: params.get('result'),
        actorUserId: params.get('actorUserId'),
        from: params.get('from'),
        to: params.get('to'),
      }),
      getWorkspaceActivitySummary(),
    ]);

    return activityJson({
      success: true,
      ...result,
      summary,
    });
  } catch (error) {
    return handleActivityApiError(error);
  }
}
