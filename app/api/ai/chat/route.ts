import { NextRequest, NextResponse } from 'next/server';
import { getSession, getUserBusinesses } from '@/lib/auth/session';
import { getTenantDatabaseName } from '@/lib/db/registry';
import { queryTenant } from '@/lib/db/tenant';
import { queryControl } from '@/lib/db/control';
import Groq from 'groq-sdk';

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { message, conversationId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get active business
    const businesses = await getUserBusinesses(session.user.id);
    const activeBusinessId = request.cookies.get('sami_business_id')?.value || businesses[0]?.id;

    if (!activeBusinessId) {
      return NextResponse.json(
        { error: 'No business found' },
        { status: 403 }
      );
    }

    // Get tenant database name
    const databaseName = await getTenantDatabaseName(activeBusinessId);

    if (!databaseName) {
      return NextResponse.json(
        { error: 'Database not ready. Please wait for provisioning to complete.' },
        { status: 503 }
      );
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

    // Get database schema information
    const schemaResult = await queryTenant(
      databaseName,
      `SELECT table_name, column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );

    // Build schema context for AI
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

    // Get AI memory (relevant context)
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

    // Build system prompt
    const systemPrompt = `You are SaMi AI, an intelligent business assistant integrated into a B2B SaaS platform.

You have access to the tenant's database with the following schema:

${schemaContext}

${memoryContext ? `Relevant business context:\n${memoryContext}\n` : ''}

Your capabilities:
1. Read and analyze business data from the database
2. Execute tasks and actions
3. Provide insights and recommendations
4. Help users understand their business better

Guidelines:
- Be concise and helpful
- Use business terminology appropriately
- If you need to query data, explain what you're looking for
- Format responses clearly with bullet points when listing items
- Always maintain data privacy and security
- If you don't have enough information, ask clarifying questions

Current conversation context is provided in the messages.`;

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

    return NextResponse.json({
      success: true,
      response: aiResponse,
      conversationId: activeConversationId,
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    return NextResponse.json(
      { error: 'AI request failed. Please try again.' },
      { status: 500 }
    );
  }
}