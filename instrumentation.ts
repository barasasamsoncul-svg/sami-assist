import type {
  Instrumentation,
} from 'next';


function cleanHeader(
  value:
    string |
    string[] |
    undefined,
  max =
    500,
) {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value
      .join(
        ', ',
      )
      .slice(
        0,
        max,
      );
  }

  return typeof value ===
    'string'
    ? value.slice(
        0,
        max,
      )
    : null;
}


function requestId(
  headers:
    Record<
      string,
      string |
      string[]
    >,
) {
  return (
    cleanHeader(
      headers[
        'x-vercel-id'
      ],
      255,
    ) ||
    cleanHeader(
      headers[
        'x-request-id'
      ],
      255,
    ) ||
    cleanHeader(
      headers[
        'traceparent'
      ],
      255,
    )
  );
}


export async function register() {
  /*
   * Reserved for future OTel registration.
   *
   * Keep startup intentionally empty today. Category 24 uses the
   * native Next.js error hook below and does not make SaMi startup
   * depend on an external observability SDK.
   */
}


export const onRequestError:
  Instrumentation.onRequestError =
  async (
    error,
    request,
    context,
  ) => {
    /*
     * Control DB observability uses Node-only modules and must not be
     * pulled into an Edge bundle.
     */
    if (
      process.env
        .NEXT_RUNTIME !==
      'nodejs'
    ) {
      return;
    }

    try {
      const {
        capturePlatformIncident,
      } =
        await import(
          '@/lib/observability/platform-incidents'
        );

      await capturePlatformIncident({
        source:
          'nextjs_server',
        provider:
          process.env
            .VERCEL ===
            '1'
            ? 'vercel'
            : 'node',
        category:
          'unhandled_server_request_error',
        title:
          `Unhandled ${context.routeType} error`,
        severity:
          'error',
        route:
          request.path ||
          context.routePath ||
          null,
        method:
          request.method ||
          null,
        operation:
          context.routePath ||
          context.routeType,
        requestId:
          requestId(
            request.headers,
          ),
        error,
        metadata: {
          digest:
            error.digest ||
            null,
          routerKind:
            context.routerKind,
          routePath:
            context.routePath,
          routeType:
            context.routeType,
          renderSource:
            context.renderSource,
          revalidateReason:
            context.revalidateReason ||
            null,
          renderType:
            context.renderType,
          userAgent:
            cleanHeader(
              request.headers[
                'user-agent'
              ],
              500,
            ),
          vercelRegion:
            cleanHeader(
              request.headers[
                'x-vercel-id'
              ],
              255,
            ),
        },
      });
    } catch (
      captureError
    ) {
      /*
       * Global telemetry must never replace or mask the original
       * application failure.
       */
      console.error(
        '[SaMi Observability] Next.js request error capture failed:',
        captureError instanceof
          Error
          ? captureError.message
          : 'Unknown instrumentation failure',
      );
    }
  };
