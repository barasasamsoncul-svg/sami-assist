import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserTenants } from '@/lib/auth/session';
import { queryControl } from '@/lib/db/control';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { queryTenant } from '@/lib/db/tenant';
import { generateAIResponse, buildSystemPrompt } from '@/lib/services/ai';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { message, conversationId } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const tenants = await getUserTenants(session.user.id);
    const activeTenantId = request.cookies.get('sami_tenant_id')?.value || tenants[0]?.id;

    if (!activeTenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    // Check subscription and AI limits
    const subResult = await queryControl(
      `SELECT p.ai_queries_limit, s.status
       FROM subscriptions s
       INNER JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1 AND s.status IN ('trialing', 'active')
       ORDER BY s.created_at DESC LIMIT 1`,
      [activeTenantId]
    );

    if (subResult.rows.length === 0) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 403 });
    }

    const aiLimit = subResult.rows[0].ai_queries_limit;

    // Get current month usage
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usageResult = await queryControl(
      `SELECT COALESCE(SUM(query_count), 0) as total
       FROM ai_usage WHERE tenant_id = $1 AND month = $2`,
      [activeTenantId, currentMonth]
    );
    const usedQueries = parseInt(usageResult.rows[0].total);

    if (aiLimit !== -1 && usedQueries >= aiLimit) {
      return NextResponse.json({ error: 'AI query limit reached. Upgrade your plan.' }, { status: 429 });
    }

    // Get tenant database
    const databaseName = await getTenantDatabaseName(activeTenantId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Get or create conversation
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      const conversationResult = await queryTenant(
        databaseName,
        `INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
        [session.user.id, message.substring(0, 100)]
      );
      activeConversationId = conversationResult.rows[0].id;
    }

    // Save user message
    await queryTenant(
      databaseName,
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
      [activeConversationId, message]
    );

    // Get conversation history
    const historyResult = await queryTenant(
      databaseName,
      `SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20`,
      [activeConversationId]
    );
    const history = historyResult.rows.map((row: any) => ({ role: row.role, content: row.content }));

    // Get schema
    const schemaResult = await queryTenant(
      databaseName,
      `SELECT table_name, column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
    );

    const tables: Record<string, string[]> = {};
    schemaResult.rows.forEach((row: any) => {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
    });

    const schemaContext = Object.entries(tables)
      .map(([table, cols]) => `Table ${table}: ${cols.join(', ')}`)
      .join('\n');

    // Get AI memory
    const memoryResult = await queryTenant(
      databaseName,
      `SELECT content FROM ai_memory WHERE importance >= 7 ORDER BY importance DESC LIMIT 10`
    );
    const memoryContext = memoryResult.rows.map((row: any) => `- ${row.content}`).join('\n');

    // Generate AI response
    const systemPrompt = buildSystemPrompt(schemaContext, memoryContext);
    const aiResult = await generateAIResponse(history, systemPrompt);

    // Save assistant message
    await queryTenant(
      databaseName,
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [activeConversationId, aiResult.content]
    );

    // Track usage
    await queryControl(
      `INSERT INTO ai_usage (tenant_id, user_id, query_count, tokens_input, tokens_output, month)
       VALUES ($1, $2, 1, $3, $4, $5)
       ON CONFLICT (tenant_id, user_id, model_id, month) 
       DO UPDATE SET query_count = ai_usage.query_count + 1, 
                     tokens_input = ai_usage.tokens_input + $3,
                     tokens_output = ai_usage.tokens_output + $4,
                     updated_at = NOW()`,
      [activeTenantId, session.user.id, aiResult.usage?.prompt_tokens || 0, aiResult.usage?.completion_tokens || 0, currentMonth]
    );

    return NextResponse.json({
      success: true,
      response: aiResult.content,
      conversationId: activeConversationId,
      usage: {
        used: usedQueries + 1,
        limit: aiLimit,
        remaining: aiLimit === -1 ? 'Unlimited' : Math.max(0, aiLimit - usedQueries - 1),
      },
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
  }
}