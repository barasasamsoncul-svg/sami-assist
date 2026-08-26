import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // Get current month usage
    const currentMonth = new Date().toISOString().slice(0, 7);

    const usageResult = await queryControl(
      `SELECT * FROM ai_usage WHERE business_id = $1 AND month = $2`,
      [activeBusinessId, currentMonth]
    );

    // Get history (last 6 months)
    const historyResult = await queryControl(
      `SELECT month, SUM(query_count) as total_queries, SUM(tokens_used) as total_tokens
       FROM ai_usage 
       WHERE business_id = $1 
       GROUP BY month 
       ORDER BY month DESC 
       LIMIT 6`,
      [activeBusinessId]
    );

    // Get subscription limits
    const subResult = await queryControl(
      `SELECT ai_queries_used, ai_queries_limit FROM subscriptions WHERE business_id = $1`,
      [activeBusinessId]
    );

    return NextResponse.json({
      success: true,
      currentUsage: usageResult.rows[0] || { query_count: 0, tokens_used: 0 },
      history: historyResult.rows,
      subscription: subResult.rows[0] || { ai_queries_used: 0, ai_queries_limit: 100 },
    });

  } catch (error) {
    console.error('AI usage API error:', error);
    return NextResponse.json({ error: 'Failed to load AI usage' }, { status: 500 });
  }
}