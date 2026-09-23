import 'server-only';

import crypto from 'node:crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  notifyPlatformAdminsOfIncident,
} from '@/lib/admin/platform-alerts';


export type PlatformIncidentSeverity =
  | 'info'
  | 'warning'
  | 'error'
  | 'critical';

export type PlatformIncidentInput = {
  source:
    string;
  provider?:
    string | null;
  category:
    string;
  title:
    string;
  severity?:
    PlatformIncidentSeverity;
  route?:
    string | null;
  method?:
    string | null;
  operation?:
    string | null;
  statusCode?:
    number | null;
  tenantId?:
    string | null;
  userId?:
    string | null;
  adminId?:
    string | null;
  correlationId?:
    string | null;
  requestId?:
    string | null;
  error?:
    unknown;
  metadata?:
    Record<
      string,
      unknown
    >;
};


const SENSITIVE_KEY_RE =
  /(password|passwd|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret|private[_-]?key|credential|database[_-]?url|connection[_-]?string)/i;

const URL_CREDENTIAL_RE =
  /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi;

const BEARER_RE =
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

const KEY_VALUE_SECRET_RE =
  /\b(password|passwd|secret|token|api[_-]?key|authorization|client[_-]?secret)\b\s*[:=]\s*([^\s,;]+)/gi;

const MAX_MESSAGE_CHARS =
  6_000;

const MAX_STACK_CHARS =
  20_000;

const MAX_METADATA_BYTES =
  32 *
  1024;


function cleanText(
  value:
    unknown,
  max:
    number,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const redacted =
    value
      .replace(
        URL_CREDENTIAL_RE,
        '$1[redacted]:[redacted]@',
      )
      .replace(
        BEARER_RE,
        'Bearer [redacted]',
      )
      .replace(
        KEY_VALUE_SECRET_RE,
        '$1=[redacted]',
      )
      .replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
        ' ',
      )
      .trim();

  return redacted
    ? redacted.slice(
        0,
        max,
      )
    : null;
}


function cleanKey(
  value:
    unknown,
  max:
    number,
) {
  return cleanText(
    value,
    max,
  )
    ?.toLowerCase()
    .replace(
      /[^a-z0-9._:-]+/g,
      '_',
    ) ||
    null;
}


function redactMetadata(
  value:
    unknown,
  depth =
    0,
): unknown {
  if (
    depth >
      6
  ) {
    return '[truncated]';
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value
      .slice(
        0,
        100,
      )
      .map(
        item =>
          redactMetadata(
            item,
            depth +
              1,
          ),
      );
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    const output:
      Record<
        string,
        unknown
      > =
      {};

    for (
      const [
        key,
        nested,
      ]
      of Object.entries(
        value,
      ).slice(
        0,
        150,
      )
    ) {
      output[
        key
      ] =
        SENSITIVE_KEY_RE.test(
          key,
        )
          ? '[redacted]'
          : redactMetadata(
              nested,
              depth +
                1,
            );
    }

    return output;
  }

  if (
    typeof value ===
      'string'
  ) {
    return cleanText(
      value,
      4_000,
    );
  }

  if (
    typeof value ===
      'number' ||
    typeof value ===
      'boolean' ||
    value ===
      null
  ) {
    return value;
  }

  return undefined;
}


function safeMetadata(
  value:
    Record<
      string,
      unknown
    > |
    undefined,
) {
  const redacted =
    redactMetadata(
      value ||
      {},
    );

  try {
    const serialized =
      JSON.stringify(
        redacted,
      );

    if (
      Buffer.byteLength(
        serialized,
        'utf8',
      ) >
        MAX_METADATA_BYTES
    ) {
      return {
        truncated:
          true,
      };
    }

    return redacted as
      Record<
        string,
        unknown
      >;
  } catch {
    return {
      serializationFailed:
        true,
    };
  }
}


function errorDetails(
  error:
    unknown,
) {
  if (
    error instanceof
      Error
  ) {
    const candidate =
      error as
        Error & {
          code?:
            unknown;
          detail?:
            unknown;
          hint?:
            unknown;
          position?:
            unknown;
          schema?:
            unknown;
          table?:
            unknown;
          column?:
            unknown;
          constraint?:
            unknown;
          routine?:
            unknown;
          digest?:
            unknown;
        };

    return {
      name:
        cleanText(
          error.name,
          160,
        ),
      code:
        cleanText(
          candidate.code,
          120,
        ),
      message:
        cleanText(
          error.message,
          MAX_MESSAGE_CHARS,
        ),
      stack:
        cleanText(
          error.stack,
          MAX_STACK_CHARS,
        ),
      metadata:
        safeMetadata({
          detail:
            candidate.detail,
          hint:
            candidate.hint,
          position:
            candidate.position,
          schema:
            candidate.schema,
          table:
            candidate.table,
          column:
            candidate.column,
          constraint:
            candidate.constraint,
          routine:
            candidate.routine,
          digest:
            candidate.digest,
        }),
    };
  }

  if (
    error &&
    typeof error ===
      'object'
  ) {
    const candidate =
      error as
        Record<
          string,
          unknown
        >;

    return {
      name:
        cleanText(
          candidate.name,
          160,
        ),
      code:
        cleanText(
          candidate.code,
          120,
        ),
      message:
        cleanText(
          candidate.message,
          MAX_MESSAGE_CHARS,
        ) ||
        'Unknown error',
      stack:
        cleanText(
          candidate.stack,
          MAX_STACK_CHARS,
        ),
      metadata:
        safeMetadata(
          candidate,
        ),
    };
  }

  return {
    name:
      null,
    code:
      null,
    message:
      cleanText(
        String(
          error ||
          'Unknown error',
        ),
        MAX_MESSAGE_CHARS,
      ),
    stack:
      null,
    metadata:
      {},
  };
}


function uuidOrNull(
  value:
    string |
    null |
    undefined,
) {
  if (
    !value
  ) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}


function fingerprintFor(
  input:
    PlatformIncidentInput,
  details:
    ReturnType<
      typeof errorDetails
    >,
) {
  const material =
    [
      cleanKey(
        input.source,
        64,
      ),
      cleanKey(
        input.provider,
        64,
      ),
      cleanKey(
        input.category,
        80,
      ),
      cleanText(
        details.name,
        160,
      ),
      cleanText(
        details.code,
        120,
      ),
      cleanText(
        input.route,
        500,
      ),
      cleanText(
        input.operation,
        180,
      ),
      cleanText(
        details.message,
        500,
      ),
    ].join(
      '|',
    );

  return crypto
    .createHash(
      'sha256',
    )
    .update(
      material,
      'utf8',
    )
    .digest(
      'hex',
    );
}


function environmentName() {
  return (
    process.env
      .VERCEL_ENV ||
    process.env
      .NODE_ENV ||
    'unknown'
  )
    .trim()
    .slice(
      0,
      40,
    );
}


export async function recordPlatformIncident(
  input:
    PlatformIncidentInput,
) {
  const details =
    errorDetails(
      input.error,
    );

  const metadata =
    safeMetadata({
      ...input.metadata,
      error:
        details.metadata,
    });

  const correlationId =
    uuidOrNull(
      input.correlationId,
    ) ||
    crypto
      .randomUUID();

  const fingerprint =
    fingerprintFor(
      input,
      details,
    );

  const source =
    cleanKey(
      input.source,
      64,
    ) ||
    'application';

  const provider =
    cleanKey(
      input.provider,
      64,
    );

  const category =
    cleanKey(
      input.category,
      80,
    ) ||
    'application_error';

  const title =
    cleanText(
      input.title,
      255,
    ) ||
    'SaMi platform incident';

  const route =
    cleanText(
      input.route,
      500,
    );

  const operation =
    cleanText(
      input.operation,
      180,
    );

  const requestId =
    cleanText(
      input.requestId,
      255,
    );

  const statusCode =
    Number.isInteger(
      input.statusCode,
    )
      ? Number(
          input.statusCode,
        )
      : null;

  const severity:
    PlatformIncidentSeverity =
    input.severity ===
        'info' ||
      input.severity ===
        'warning' ||
      input.severity ===
        'critical'
      ? input.severity
      : 'error';

  const tenantId =
    uuidOrNull(
      input.tenantId,
    );

  const userId =
    uuidOrNull(
      input.userId,
    );

  const adminId =
    uuidOrNull(
      input.adminId,
    );

  const incident =
    await queryControl(
      `
        INSERT INTO platform_incidents (
          fingerprint,
          status,
          severity,
          source,
          provider,
          category,
          title,
          error_name,
          error_code,
          route,
          operation,
          tenant_id,
          user_id,
          admin_id,
          occurrence_count,
          first_seen_at,
          last_seen_at,
          latest_correlation_id,
          latest_request_id,
          latest_status_code,
          latest_message,
          latest_stack,
          latest_metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          'open',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          1,
          NOW(),
          NOW(),
          $14,
          $15,
          $16,
          $17,
          $18,
          $19::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (
          fingerprint
        )
        WHERE status IN (
          'open',
          'acknowledged'
        )
        DO UPDATE SET
          severity =
            CASE
              WHEN platform_incidents.severity =
                   'critical'
              THEN 'critical'
              WHEN EXCLUDED.severity =
                   'critical'
              THEN 'critical'
              WHEN platform_incidents.severity =
                   'error'
              THEN 'error'
              WHEN EXCLUDED.severity =
                   'error'
              THEN 'error'
              WHEN platform_incidents.severity =
                   'warning'
              THEN 'warning'
              ELSE EXCLUDED.severity
            END,
          provider =
            COALESCE(
              EXCLUDED.provider,
              platform_incidents.provider
            ),
          title =
            EXCLUDED.title,
          error_name =
            COALESCE(
              EXCLUDED.error_name,
              platform_incidents.error_name
            ),
          error_code =
            COALESCE(
              EXCLUDED.error_code,
              platform_incidents.error_code
            ),
          route =
            COALESCE(
              EXCLUDED.route,
              platform_incidents.route
            ),
          operation =
            COALESCE(
              EXCLUDED.operation,
              platform_incidents.operation
            ),
          tenant_id =
            COALESCE(
              EXCLUDED.tenant_id,
              platform_incidents.tenant_id
            ),
          user_id =
            COALESCE(
              EXCLUDED.user_id,
              platform_incidents.user_id
            ),
          occurrence_count =
            platform_incidents.occurrence_count +
            1,
          last_seen_at =
            NOW(),
          latest_correlation_id =
            EXCLUDED.latest_correlation_id,
          latest_request_id =
            EXCLUDED.latest_request_id,
          latest_status_code =
            EXCLUDED.latest_status_code,
          latest_message =
            EXCLUDED.latest_message,
          latest_stack =
            EXCLUDED.latest_stack,
          latest_metadata =
            EXCLUDED.latest_metadata,
          updated_at =
            NOW()
        RETURNING
          id,
          fingerprint,
          status,
          occurrence_count,
          last_seen_at
      `,
      [
        fingerprint,
        severity,
        source,
        provider,
        category,
        title,
        details.name,
        details.code,
        route,
        operation,
        tenantId,
        userId,
        adminId,
        correlationId,
        requestId,
        statusCode,
        details.message,
        details.stack,
        JSON.stringify(
          metadata,
        ),
      ],
    );

  const incidentRow =
    incident.rows[0];

  if (
    !incidentRow
  ) {
    throw new Error(
      'Platform incident could not be recorded.',
    );
  }

  await queryControl(
    `
      INSERT INTO platform_incident_occurrences (
        incident_id,
        correlation_id,
        request_id,
        environment,
        source,
        provider,
        category,
        route,
        method,
        operation,
        status_code,
        tenant_id,
        user_id,
        admin_id,
        error_name,
        error_code,
        message,
        stack,
        metadata,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19::jsonb,
        NOW()
      )
    `,
    [
      incidentRow.id,
      correlationId,
      requestId,
      environmentName(),
      source,
      provider,
      category,
      route,
      cleanText(
        input.method,
        16,
      )
        ?.toUpperCase() ||
      null,
      operation,
      statusCode,
      tenantId,
      userId,
      adminId,
      details.name,
      details.code,
      details.message,
      details.stack,
      JSON.stringify(
        metadata,
      ),
    ],
  );

  const incidentId =
    String(
      incidentRow.id,
    );

  const occurrenceCount =
    Number(
      incidentRow.occurrence_count ||
      1,
    );

  /*
   * Notify once per incident. The delivery ledger also enforces
   * per-admin/per-channel deduplication, so repeated occurrences
   * remain visible in Platform Admin without creating alert spam.
   */
  if (
    occurrenceCount ===
      1 &&
    (
      severity ===
        'error' ||
      severity ===
        'critical'
    )
  ) {
    await notifyPlatformAdminsOfIncident({
      incidentId,
      severity,
      title,
      message:
        details.message ||
        `${category.replace(
          /_/g,
          ' ',
        )} was detected in SaMi.`,
    });
  }

  return {
    incidentId,
    fingerprint:
      String(
        incidentRow.fingerprint,
      ),
    correlationId,
    status:
      String(
        incidentRow.status,
      ),
    occurrenceCount,
  };
}


export async function capturePlatformIncident(
  input:
    PlatformIncidentInput,
) {
  try {
    return await recordPlatformIncident(
      input,
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Observability] Incident capture failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown observability failure',
    );

    return null;
  }
}


export async function recordProviderCheck(
  input: {
    provider:
      string;
    component:
      string;
    status:
      | 'healthy'
      | 'degraded'
      | 'unavailable'
      | 'not_configured'
      | 'unknown';
    latencyMs?:
      number | null;
    statusCode?:
      number | null;
    code?:
      string | null;
    message?:
      string | null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  const result =
    await queryControl(
      `
        INSERT INTO platform_provider_checks (
          provider,
          component,
          status,
          latency_ms,
          status_code,
          code,
          message,
          metadata,
          checked_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          NOW(),
          NOW()
        )
        RETURNING id
      `,
      [
        cleanKey(
          input.provider,
          64,
        ) ||
        'unknown',
        cleanKey(
          input.component,
          120,
        ) ||
        'default',
        input.status,
        Number.isInteger(
          input.latencyMs,
        )
          ? input.latencyMs
          : null,
        Number.isInteger(
          input.statusCode,
        )
          ? input.statusCode
          : null,
        cleanText(
          input.code,
          120,
        ),
        cleanText(
          input.message,
          2_000,
        ),
        JSON.stringify(
          safeMetadata(
            input.metadata,
          ),
        ),
      ],
    );

  return result.rows[0]
    ?.id
    ? String(
        result.rows[0]
          .id,
      )
    : null;
}
