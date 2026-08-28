import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export async function generateAIResponse(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string = 'mixtral-8x7b-32768'
): Promise<{ content: string; usage: any }> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      model,
      temperature: 0.7,
      max_tokens: 4096,
    });

    return {
      content: completion.choices[0]?.message?.content || 'No response generated',
      usage: completion.usage,
    };
  } catch (error) {
    console.error('AI generation error:', error);
    throw error;
  }
}

export function buildSystemPrompt(schemaContext: string, memoryContext: string): string {
  return `You are SaMi AI, an intelligent business assistant.

Database schema:
${schemaContext}

${memoryContext ? `Business context:\n${memoryContext}\n` : ''}

Guidelines:
- Be concise and helpful
- Use business terminology
- Format responses clearly
- Respect data privacy
- If you don't have enough information, ask clarifying questions`;
}