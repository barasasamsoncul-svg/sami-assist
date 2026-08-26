import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { queryTenant } from '@/lib/db/tenant';
import { queryControl } from '@/lib/db/control';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

    // Get active business
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json({ error: 'No business found' }, { status: 403 });
    }

    // Check subscription and AI limits
    const subResult = await queryControl(
      `SELECT plan, status, ai_queries_used, ai_queries_limit 
       FROM subscriptions WHERE business_id = $1`,
      [activeBusinessId]
    );
    const subscription = subResult.rows[0];

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 403 });
    }

    // Check if subscription is active or trialing
    if (!['active', 'trialing'].includes(subscription.status)) {
      return NextResponse.json({ error: 'Your subscription is not active. Please update your payment method.' }, { status: 403 });
    }

    // Check AI query limit
    const limit = subscription.ai_queries_limit || 100;
    const used = subscription.ai_queries_used || 0;

    if (limit !== -1 && used >= limit) {
      return NextResponse.json({ 
        error: 'AI query limit reached. Please upgrade your plan for more queries.' 
      }, { status: 429 });
    }

    // Get tenant database name
    const databaseName = await getTenantDatabaseName(activeBusinessId);
    if (!databaseName) {
      return NextResponse.json({ error: 'Database not ready' }, { status: 503 });
    }

    // Get or create conversation
    let activeConversationId = conversationId;

    if (!activeConversationId) {
      const conversationResult = await queryTenant(
        databaseName,
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [session.user.id, message.substring(0, 100)]
      );
      activeConversationId = conversationResult.rows[0].id;
    }

    // Save user message
    await queryTenant(
      databaseName,
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)`,
      [activeConversationId, message]
    );

    // Get conversation history
    const historyResult = await queryTenant(
      databaseName,
      `SELECT role, content FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC
       LIMIT 20`,
      [activeConversationId]
    );

    const history = historyResult.rows.map(row => ({
      role: row.role,
      content: row.content,
    }));

    // Get database schema
    const schemaResult = await queryTenant(
      databaseName,
      `SELECT table_name, column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );

    const tables: Record<string, Array<{ column: string; type: string }>> = {};
    schemaResult.rows.forEach(row => {
      if (!tables[row.table_name]) {
        tables[row.table_name] = [];
      }
      tables[row.table_name].push({
        column: row.column_name,
        type: row.data_type,
      });
    });

    const schemaContext = Object.entries(tables)
      .map(([table, columns]) => {
        const columnList = columns.map(c => `${c.column} (${c.type})`).join(', ');
        return `Table ${table}: ${columnList}`;
      })
      .join('\n');

    // Get AI memory
    const memoryResult = await queryTenant(
      databaseName,
      `SELECT content, source_type, importance 
       FROM ai_memory 
       WHERE importance >= 7
       ORDER BY importance DESC, created_at DESC
       LIMIT 10`
    );

    const memoryContext = memoryResult.rows
      .map(row => `- ${row.content}`)
      .join('\n');

    const systemPrompt = `You are SaMi AI, an intelligent business assistant.

Database schema:
${schemaContext}

${memoryContext ? `Business context:\n${memoryContext}\n` : ''}

Be concise and helpful. Use business terminology. Format responses clearly.`;

    // Call Groq AI
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
      model: 'mixtral-8x7b-32768',
      temperature: 0.7,
      max_tokens: 4096,
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Save assistant message
    await queryTenant(
      databaseName,
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [activeConversationId, aiResponse]
    );

    // Increment AI usage counter
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    await queryControl(
      `UPDATE subscriptions SET ai_queries_used = ai_queries_used + 1, updated_at = NOW()
       WHERE business_id = $1`,
      [activeBusinessId]
    );

    // Upsert ai_usage
    await queryControl(
      `INSERT INTO ai_usage (business_id, user_id, query_count, tokens_used, month)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (business_id, user_id, month) 
       DO UPDATE SET query_count = ai_usage.query_count + 1, 
                     tokens_used = ai_usage.tokens_used + $3,
                     updated_at = NOW()`,
      [activeBusinessId, session.user.id, completion.usage?.total_tokens || 0, currentMonth]
    );

    // Check if 80% limit reached and warn
    const newUsed = used + 1;
    if (limit !== -1) {
      const percentage = (newUsed / limit) * 100;
      if (percentage >= 80 && percentage < 100) {
        // Warn user
        console.log(`AI usage at ${percentage}% for business ${activeBusinessId}`);
      }
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      conversationId: activeConversationId,
      usage: {
        used: newUsed,
        limit,
        remaining: limit === -1 ? 'Unlimited' : Math.max(0, limit - newUsed),
      },
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    return NextResponse.json({ error: 'AI request failed. Please try again.' }, { status: 500 });
  }
}