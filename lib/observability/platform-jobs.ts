import 'server-only';

import crypto from 'node:crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  capturePlatformIncident,
} from '@/lib/observability/platform-incidents';


export type PlatformJobHandle = {
  id:
    string;
  correlationId:
    string;
  startedAt:
    number;
  jobKey:
    string;
  provider:
    string | null;
  tenantId:
    string | null;
};


function clean(
  value:
    string |
    null |
    undefined,
  max:
    number,
) {
  const normalized =
    value
      ?.trim()
      .slice(
        0,
        max,
      ) ||
    '';

  return normalized ||
    null;
}


function uuidOrNull(
  value:
    string |
    null |
    undefined,
) {
  return (
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    ? value
    : null;
}


function errorCode(
  error:
    unknown,
) {
  if (
    error &&
    typeof error ===
      'object' &&
    'code' in
      error
  ) {
    return clean(
      String(
        (
          error as {
            code?:
              unknown;
          }
        ).code ||
        '',
      ),
      120,
    );
  }

  return null;
}


function errorMessage(
  error:
    unknown,
) {
  const value =
    error instanceof
      Error
      ? error.message
      : String(
          error ||
          'Unknown job error',
        );

  return value
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
      '$1[redacted]:[redacted]@',
    )
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
      'Bearer [redacted]',
    )
    .slice(
      0,
      4_000,
    );
}


export async function startPlatformJob(
  input: {
    jobKey:
      string;
    triggerType?:
      string |
      null;
    provider?:
      string |
      null;
    tenantId?:
      string |
      null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
): Promise<
  PlatformJobHandle |
  null
> {
  const correlationId =
    crypto.randomUUID();

  const startedAt =
    Date.now();

  try {
    const result =
      await queryControl(
        `
          INSERT INTO platform_job_runs (
            job_key,
            status,
            correlation_id,
            trigger_type,
            provider,
            tenant_id,
            started_at,
            metadata,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'running',
            $2,
            $3,
            $4,
            $5,
            NOW(),
            $6::jsonb,
            NOW(),
            NOW()
          )
          RETURNING id
        `,
        [
          clean(
            input.jobKey,
            160,
          ) ||
          'unknown',
          correlationId,
          clean(
            input.triggerType,
            40,
          ),
          clean(
            input.provider,
            64,
          ),
          uuidOrNull(
            input.tenantId,
          ),
          JSON.stringify(
            input.metadata ||
            {},
          ),
        ],
      );

    const row =
      result.rows[0];

    if (
      !row?.id
    ) {
      return null;
    }

    return {
      id:
        String(
          row.id,
        ),
      correlationId,
      startedAt,
      jobKey:
        clean(
          input.jobKey,
          160,
        ) ||
        'unknown',
      provider:
        clean(
          input.provider,
          64,
        ),
      tenantId:
        uuidOrNull(
          input.tenantId,
        ),
    };
  } catch (
    error
  ) {
    /*
     * Category 24 observability is never allowed to break the
     * underlying worker. This also keeps stacked previews safe
     * before migration 004 is applied.
     */
    console.error(
      '[SaMi Observability] Job tracking start skipped:',
      error instanceof
        Error
        ? error.message
        : 'Unknown tracking error',
    );

    return null;
  }
}


export async function completePlatformJob(
  handle:
    PlatformJobHandle |
    null,
  metadata?:
    Record<
      string,
      unknown
    >,
) {
  if (
    !handle
  ) {
    return;
  }

  try {
    await queryControl(
      `
        UPDATE platform_job_runs
        SET
          status =
            'succeeded',
          finished_at =
            NOW(),
          duration_ms =
            $2,
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            $3::jsonb,
          updated_at =
            NOW()
        WHERE id = $1
          AND status =
              'running'
      `,
      [
        handle.id,
        Math.max(
          0,
          Date.now() -
          handle.startedAt,
        ),
        JSON.stringify(
          metadata ||
          {},
        ),
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Observability] Job completion tracking skipped:',
      error instanceof
        Error
        ? error.message
        : 'Unknown tracking error',
    );
  }
}


export async function failPlatformJob(
  handle:
    PlatformJobHandle |
    null,
  error:
    unknown,
  input: {
    source:
      string;
    category:
      string;
    route?:
      string |
      null;
    operation?:
      string |
      null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  const code =
    errorCode(
      error,
    );

  const message =
    errorMessage(
      error,
    );

  if (
    handle
  ) {
    try {
      await queryControl(
        `
          UPDATE platform_job_runs
          SET
            status =
              'failed',
            finished_at =
              NOW(),
            duration_ms =
              $2,
            error_code =
              $3,
            error_message =
              $4,
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) ||
              $5::jsonb,
            updated_at =
              NOW()
          WHERE id = $1
            AND status =
                'running'
        `,
        [
          handle.id,
          Math.max(
            0,
            Date.now() -
            handle.startedAt,
          ),
          code,
          message,
          JSON.stringify(
            input.metadata ||
            {},
          ),
        ],
      );
    } catch (
      trackingError
    ) {
      console.error(
        '[SaMi Observability] Job failure tracking skipped:',
        trackingError instanceof
          Error
          ? trackingError.message
          : 'Unknown tracking error',
      );
    }
  }

  await capturePlatformIncident({
    source:
      input.source,
    provider:
      handle?.provider ||
      null,
    category:
      input.category,
    title:
      `${handle?.jobKey || input.operation || 'Platform job'} failed`,
    severity:
      'error',
    route:
      input.route ||
      null,
    operation:
      input.operation ||
      handle?.jobKey ||
      null,
    tenantId:
      handle?.tenantId ||
      null,
    correlationId:
      handle?.correlationId ||
      null,
    error,
    metadata:
      input.metadata,
  });
}


export async function runTrackedPlatformJob<T>(
  input: {
    jobKey:
      string;
    triggerType?:
      string |
      null;
    provider?:
      string |
      null;
    tenantId?:
      string |
      null;
    source:
      string;
    category:
      string;
    route?:
      string |
      null;
    operation?:
      string |
      null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
  run:
    () =>
      Promise<T>,
): Promise<T> {
  const handle =
    await startPlatformJob(
      input,
    );

  try {
    const result =
      await run();

    await completePlatformJob(
      handle,
      {
        completed:
          true,
      },
    );

    return result;
  } catch (
    error
  ) {
    await failPlatformJob(
      handle,
      error,
      input,
    );

    throw error;
  }
}
