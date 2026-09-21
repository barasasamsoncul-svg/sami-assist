import 'server-only';

import OpenAI from 'openai';

import {
  requireSamiAiProviderConfig,
} from '@/lib/ai/config';

import type {
  SamiAiProviderMessage,
  SamiAiProviderResult,
  SamiAiProviderTool,
} from '@/lib/ai/types';

function toProviderMessage(
  message:
    SamiAiProviderMessage,
): Record<string, unknown> {
  if (
    message.role ===
    'tool'
  ) {
    return {
      role: 'tool',
      tool_call_id:
        message.toolCallId ||
        '',
      content:
        message.content,
    };
  }

  if (
    message.role ===
    'assistant'
  ) {
    return {
      role:
        'assistant',
      content:
        message.content ||
        null,
      tool_calls:
        message.toolCalls
          ?.map(
            call => ({
              id:
                call.id,
              type:
                'function',
              function: {
                name:
                  call.name,
                arguments:
                  call.argumentsJson,
              },
            }),
          ),
    };
  }

  return {
    role:
      message.role,
    content:
      message.content,
  };
}

export async function completeSamiAiChat(
  input: {
    messages:
      SamiAiProviderMessage[];
    tools:
      SamiAiProviderTool[];
  },
): Promise<SamiAiProviderResult> {
  const config =
    requireSamiAiProviderConfig();

  const client =
    new OpenAI({
      apiKey:
        config.apiKey,
      baseURL:
        config.baseUrl,
    });

  const request:
    Record<string, unknown> =
    {
      model:
        config.model,
      messages:
        input.messages.map(
          toProviderMessage,
        ),
    };

  if (
    input.tools.length >
    0
  ) {
    request.tools =
      input.tools.map(
        tool => ({
          type:
            'function',
          function: {
            name:
              tool.name,
            description:
              tool.description,
            parameters:
              tool.inputSchema,
          },
        }),
      );

    request.tool_choice =
      'auto';
  }

  const response =
    await client
      .chat
      .completions
      .create(
        request as never,
      );

  const completion =
    response as unknown as {
      choices: Array<{
        message?: {
          content?:
            string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?:
          number;
        completion_tokens?:
          number;
        total_tokens?:
          number;
      };
    };

  const message =
    completion
      .choices[0]
      ?.message;

  if (!message) {
    throw new Error(
      'The AI provider returned no response message.',
    );
  }

  const toolCalls =
    Array.isArray(
      message.tool_calls,
    )
      ? message.tool_calls
          .filter(
            call =>
              call.type ===
              'function',
          )
          .map(
            call => ({
              id:
                String(
                  call.id,
                ),
              name:
                String(
                  call.function
                    .name,
                ),
              argumentsJson:
                typeof call
                  .function
                  .arguments ===
                'string'
                  ? call
                      .function
                      .arguments
                  : '{}',
            }),
          )
      : [];

  const content =
    typeof message
      .content ===
    'string'
      ? message
          .content
          .trim()
      : '';

  return {
    content,
    toolCalls,
    usage: {
      inputTokens:
        completion
          .usage
          ?.prompt_tokens ??
        null,
      outputTokens:
        completion
          .usage
          ?.completion_tokens ??
        null,
      totalTokens:
        completion
          .usage
          ?.total_tokens ??
        null,
    },
  };
}
