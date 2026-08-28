import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    const currentMonth = new Date().toISOString().slice(0, 7);

    const usageResult = await queryControl(
      `SELECT * FROM ai_usage WHERE tenant_id = $1 AND month = $2`,
      [activeTenantId, currentMonth]
    );

    const historyResult = await queryControl(
      `SELECT month, SUM(query_count) as total_queries, SUM(tokens_input + tokens_output) as total_tokens
       FROM ai_usage WHERE tenant_id = $1 GROUP BY month ORDER BY month DESC LIMIT 6`,
      [activeTenantId]
    );

    return NextResponse.json({
      success: true,
      currentUsage: usageResult.rows[0] || { query_count: 0, tokens_input: 0, tokens_output: 0 },
      history: historyResult.rows,
    });

  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}