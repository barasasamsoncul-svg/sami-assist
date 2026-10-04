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
    signal?:
      AbortSignal;
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
        input.signal
          ? {
              signal:
                input.signal,
            }
          : undefined,
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


export async function streamSamiAiChat(
  input: {
    messages:
      SamiAiProviderMessage[];
    tools:
      SamiAiProviderTool[];
    signal?:
      AbortSignal;
    onContentDelta:
      (
        delta: string,
      ) =>
        | void
        | Promise<void>;
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
      stream: true,
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

  let response:
    unknown;

  try {
    response =
      await client
        .chat
        .completions
        .create(
          request as never,
          input.signal
            ? {
                signal:
                  input.signal,
              }
            : undefined,
        );
  } catch (
    streamError
  ) {
    if (
      input.signal
        ?.aborted
    ) {
      throw streamError;
    }

    return completeSamiAiChat({
      messages:
        input.messages,
      tools:
        input.tools,
      signal:
        input.signal,
    });
  }

  const stream =
    response as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?:
            string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: {
              name?: string;
              arguments?: string;
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
    }>;

  let content =
    '';

  let inputTokens:
    number | null =
    null;

  let outputTokens:
    number | null =
    null;

  let totalTokens:
    number | null =
    null;

  const streamedToolCalls =
    new Map<
      number,
      {
        id: string;
        name: string;
        argumentsJson:
          string;
      }
    >();

  for await (
    const chunk
    of stream
  ) {
    if (
      input.signal
        ?.aborted
    ) {
      throw new Error(
        'AI request aborted by client.',
      );
    }

    if (
      chunk.usage
    ) {
      inputTokens =
        chunk.usage
          .prompt_tokens ??
        inputTokens;

      outputTokens =
        chunk.usage
          .completion_tokens ??
        outputTokens;

      totalTokens =
        chunk.usage
          .total_tokens ??
        totalTokens;
    }

    const delta =
      chunk.choices
        ?.[0]
        ?.delta;

    const textDelta =
      typeof delta
        ?.content ===
      'string'
        ? delta.content
        : '';

    if (
      textDelta
    ) {
      content +=
        textDelta;

      await input
        .onContentDelta(
          textDelta,
        );
    }

    for (
      const call
      of delta
        ?.tool_calls ||
      []
    ) {
      const index =
        Number.isInteger(
          call.index,
        )
          ? Number(
              call.index,
            )
          : 0;

      const current =
        streamedToolCalls.get(
          index,
        ) || {
          id: '',
          name: '',
          argumentsJson:
            '',
        };

      if (
        call.id
      ) {
        current.id =
          call.id;
      }

      if (
        call.function
          ?.name
      ) {
        current.name +=
          call.function
            .name;
      }

      if (
        call.function
          ?.arguments
      ) {
        current
          .argumentsJson +=
          call.function
            .arguments;
      }

      streamedToolCalls.set(
        index,
        current,
      );
    }
  }

  const toolCalls =
    [...streamedToolCalls
      .entries()]
      .sort(
        (
          [left],
          [right],
        ) =>
          left -
          right,
      )
      .map(
        (
          [
            index,
            call,
          ],
        ) => ({
          id:
            call.id ||
            `stream-tool-${index}`,
          name:
            call.name,
          argumentsJson:
            call.argumentsJson ||
            '{}',
        }),
      )
      .filter(
        call =>
          Boolean(
            call.name,
          ),
      );

  return {
    content:
      content.trim(),
    toolCalls,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
  };
}
