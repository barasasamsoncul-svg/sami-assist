import {
  NextRequest,
} from 'next/server';

import {
  sendWorkspaceAiMessage,
} from '@/lib/services/workspace-ai';

import {
  aiJson,
  handleAiApiError,
  rejectAiCrossOrigin,
} from '@/lib/services/workspace-ai-api';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

async function streamErrorMessage(
  error: unknown,
) {
  try {
    const response =
      handleAiApiError(
        error,
      );

    const payload =
      await response.json() as {
        error?: unknown;
      };

    if (
      typeof payload
        .error ===
      'string' &&
      payload.error
    ) {
      return payload.error;
    }
  } catch {
    // Fall through to the stable public message.
  }

  return 'SaMi AI could not complete that request. Please try again.';
}

export async function POST(
  request:
    NextRequest,
) {
  try {
    const originError =
      rejectAiCrossOrigin(
        request,
      );

    if (originError) {
      return originError;
    }

    const body =
      await request.json();

    const input = {
      conversationId:
        body?.conversationId,
      message:
        body?.message,
      mode:
        body?.mode,
      targetMessageId:
        body?.targetMessageId,
      attachmentIds:
        body?.attachmentIds,
      moduleContext:
        body?.moduleContext,
    };

    const acceptsStream =
      request.headers
        .get(
          'accept',
        )
        ?.includes(
          'application/x-ndjson',
        ) ??
      false;

    if (
      !acceptsStream
    ) {
      const result =
        await sendWorkspaceAiMessage({
          ...input,
          signal:
            request.signal,
        });

      return aiJson({
        success: true,
        ...result,
      });
    }

    const encoder =
      new TextEncoder();

    const generationController =
      new AbortController();

    const abortGeneration =
      () => {
        generationController
          .abort();
      };

    if (
      request.signal
        .aborted
    ) {
      generationController
        .abort();
    } else {
      request.signal
        .addEventListener(
          'abort',
          abortGeneration,
          {
            once: true,
          },
        );
    }

    let cancelled =
      false;

    const stream =
      new ReadableStream<Uint8Array>({
        start(
          controller,
        ) {
          const emit =
            (
              value:
                Record<string, unknown>,
            ) => {
              if (
                cancelled
              ) {
                return;
              }

              try {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify(
                      value,
                    ) +
                      '\n',
                  ),
                );
              } catch {
                cancelled =
                  true;

                generationController
                  .abort();
              }
            };

          void (async () => {
            try {
              const result =
                await sendWorkspaceAiMessage({
                  ...input,
                  signal:
                    generationController
                      .signal,
                  onContentDelta:
                    delta => {
                      emit({
                        type:
                          'delta',
                        delta,
                      });
                    },
                  onContentReset:
                    () => {
                      emit({
                        type:
                          'reset',
                      });
                    },
                });

              emit({
                type:
                  'done',
                result,
              });
            } catch (
              error
            ) {
              if (
                !generationController
                  .signal
                  .aborted
              ) {
                emit({
                  type:
                    'error',
                  error:
                    await streamErrorMessage(
                      error,
                    ),
                });
              }
            } finally {
              request.signal
                .removeEventListener(
                  'abort',
                  abortGeneration,
                );

              if (
                !cancelled
              ) {
                try {
                  controller
                    .close();
                } catch {
                  // The browser may already have closed the stream.
                }
              }
            }
          })();
        },
        cancel() {
          cancelled =
            true;

          generationController
            .abort();

          request.signal
            .removeEventListener(
              'abort',
              abortGeneration,
            );
        },
      });

    return new Response(
      stream,
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/x-ndjson; charset=utf-8',
          'Cache-Control':
            'no-cache, no-store, no-transform',
          'X-Accel-Buffering':
            'no',
        },
      },
    );
  } catch (
    error
  ) {
    return handleAiApiError(
      error,
    );
  }
}
