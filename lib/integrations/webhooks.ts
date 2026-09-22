import 'server-only';

import crypto from 'node:crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  hashIntegrationToken,
} from '@/lib/integrations/crypto';

import {
  loadActiveAutomationWorkflow,
  startAutomationRun,
} from '@/lib/automation/execution-engine';

import {
  resolveAutomationWorkerRuntime,
} from '@/lib/automation/worker-context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ENDPOINT_KEY_RE =
  /^wh_[A-Za-z0-9_-]{20,80}$/;

const EVENT_KEY_RE =
  /^[a-z0-9_.:-]{1,200}$/;

const MAX_WEBHOOK_BYTES =
  256 *
  1024;

const MAX_DELIVERIES_PER_MINUTE =
  120;

export class IntegrationWebhookError
  extends Error {
  constructor(
    public readonly status:
      number,
    public readonly code:
      string,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'IntegrationWebhookError';
  }
}

function bearerToken(
  authorization:
    string | null,
) {
  const value =
    authorization
      ?.trim() ||
    '';

  const match =
    value.match(
      /^Bearer\s+(.+)$/i,
    );

  return match
    ? match[1]
        .trim()
    : '';
}

function timingSafeHashMatch(
  expectedHex:
    string,
  token:
    string,
) {
  const actualHex =
    hashIntegrationToken(
      token,
    );

  const expected =
    Buffer.from(
      expectedHex,
      'hex',
    );

  const actual =
    Buffer.from(
      actualHex,
      'hex',
    );

  return (
    expected.length ===
      actual.length &&
    crypto.timingSafeEqual(
      expected,
      actual,
    )
  );
}

function safeEventKey(
  header:
    string | null,
  payload:
    unknown,
) {
  const fromHeader =
    header
      ?.trim()
      .toLowerCase() ||
    '';

  if (
    fromHeader
  ) {
    if (
      !EVENT_KEY_RE.test(
        fromHeader,
      )
    ) {
      throw new IntegrationWebhookError(
        400,
        'INVALID_EVENT_KEY',
        'Webhook event key is invalid.',
      );
    }

    return fromHeader;
  }

  if (
    payload &&
    typeof payload ===
      'object' &&
    !Array.isArray(
      payload,
    )
  ) {
    const object =
      payload as
        Record<
          string,
          unknown
        >;

    for (
      const candidate
      of [
        object.event,
        object.type,
        object.eventKey,
      ]
    ) {
      if (
        typeof candidate ===
          'string'
      ) {
        const normalized =
          candidate
            .trim()
            .toLowerCase()
            .slice(
              0,
              200,
            );

        if (
          EVENT_KEY_RE.test(
            normalized,
          )
        ) {
          return normalized;
        }
      }
    }
  }

  return 'webhook.received';
}

function safeExternalEventId(
  value:
    string | null,
) {
  const id =
    value
      ?.replace(
        /[\u0000-\u001f\u007f]/g,
        '',
      )
      .trim()
      .slice(
        0,
        255,
      ) ||
    '';

  return id ||
    null;
}

function parsePayload(
  rawBody:
    string,
) {
  if (
    Buffer.byteLength(
      rawBody,
      'utf8',
    ) >
    MAX_WEBHOOK_BYTES
  ) {
    throw new IntegrationWebhookError(
      413,
      'WEBHOOK_TOO_LARGE',
      'Webhook payload is too large.',
    );
  }

  if (
    !rawBody.trim()
  ) {
    return {};
  }

  try {
    return JSON.parse(
      rawBody,
    ) as unknown;
  } catch {
    throw new IntegrationWebhookError(
      400,
      'INVALID_JSON',
      'Webhook payload must be valid JSON.',
    );
  }
}

export async function receiveIntegrationWebhook(
  input: {
    tenantId:
      string;
    endpointKey:
      string;
    authorization:
      string | null;
    eventKeyHeader:
      string | null;
    externalEventId:
      string | null;
    rawBody:
      string;
  },
) {
  if (
    !UUID_RE.test(
      input.tenantId,
    ) ||
    !ENDPOINT_KEY_RE.test(
      input.endpointKey,
    )
  ) {
    throw new IntegrationWebhookError(
      404,
      'WEBHOOK_NOT_FOUND',
      'Webhook endpoint could not be found.',
    );
  }

  const token =
    bearerToken(
      input.authorization,
    );

  if (
    !token
  ) {
    throw new IntegrationWebhookError(
      401,
      'WEBHOOK_UNAUTHORIZED',
      'Webhook authorization is required.',
    );
  }

  const payload =
    parsePayload(
      input.rawBody,
    );

  const eventKey =
    safeEventKey(
      input.eventKeyHeader,
      payload,
    );

  const externalEventId =
    safeExternalEventId(
      input.externalEventId,
    );

  const payloadBytes =
    Buffer.byteLength(
      input.rawBody,
      'utf8',
    );

  const payloadDigest =
    crypto
      .createHash(
        'sha256',
      )
      .update(
        input.rawBody,
        'utf8',
      )
      .digest(
        'hex',
      );

  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  const endpointResult =
    await pool.query(
      `
        SELECT
          e.id,
          e.company_id,
          e.connection_id,
          e.provider_key,
          e.secret_hash,
          e.event_keys,
          c.status
            AS connection_status
        FROM integration_webhook_endpoints e
        LEFT JOIN integration_connections c
          ON c.id =
             e.connection_id
        WHERE e.endpoint_key = $1
          AND e.status =
              'active'
          AND e.archived_at
              IS NULL
        LIMIT 1
      `,
      [
        input.endpointKey,
      ],
    );

  if (
    endpointResult.rows.length !==
      1
  ) {
    throw new IntegrationWebhookError(
      404,
      'WEBHOOK_NOT_FOUND',
      'Webhook endpoint could not be found.',
    );
  }

  const endpoint =
    endpointResult.rows[0];

  if (
    endpoint.connection_id &&
    endpoint.connection_status !==
      'connected'
  ) {
    throw new IntegrationWebhookError(
      409,
      'WEBHOOK_CONNECTION_INACTIVE',
      'Webhook connection is not active.',
    );
  }

  if (
    !timingSafeHashMatch(
      String(
        endpoint.secret_hash,
      ),
      token,
    )
  ) {
    throw new IntegrationWebhookError(
      401,
      'WEBHOOK_UNAUTHORIZED',
      'Webhook authorization is invalid.',
    );
  }

  const allowedEvents =
    Array.isArray(
      endpoint.event_keys,
    )
      ? endpoint.event_keys
          .filter(
            (
              value:
                unknown,
            ) =>
              typeof value ===
                'string',
          )
          .map(
            (
              value:
                string,
            ) =>
              value
                .trim()
                .toLowerCase(),
          )
          .filter(
            Boolean,
          )
      : [];

  if (
    allowedEvents.length >
      0 &&
    !allowedEvents.includes(
      eventKey,
    )
  ) {
    throw new IntegrationWebhookError(
      422,
      'WEBHOOK_EVENT_NOT_ALLOWED',
      'This event is not allowed for the webhook endpoint.',
    );
  }

  const rate =
    await pool.query(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM integration_webhook_deliveries
        WHERE endpoint_id = $1
          AND received_at >=
              NOW() -
              INTERVAL '1 minute'
      `,
      [
        endpoint.id,
      ],
    );

  if (
    Number(
      rate.rows[0]
        ?.count ||
      0,
    ) >=
    MAX_DELIVERIES_PER_MINUTE
  ) {
    throw new IntegrationWebhookError(
      429,
      'WEBHOOK_RATE_LIMITED',
      'Webhook endpoint is receiving too many requests.',
    );
  }

  if (
    externalEventId
  ) {
    const existing =
      await pool.query(
        `
          SELECT
            id,
            status
          FROM integration_webhook_deliveries
          WHERE endpoint_id = $1
            AND external_event_id = $2
          LIMIT 1
        `,
        [
          endpoint.id,
          externalEventId,
        ],
      );

    if (
      existing.rows.length >
        0
    ) {
      return {
        accepted:
          true,
        duplicate:
          true,
        deliveryId:
          String(
            existing.rows[0]
              .id,
          ),
        dispatched:
          0,
      };
    }
  }

  const deliveryId =
    crypto.randomUUID();

  const integrationEventId =
    crypto.randomUUID();

  const correlationId =
    crypto.randomUUID();

  const companyId =
    String(
      endpoint.company_id,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await client.query(
      `
        INSERT INTO integration_webhook_deliveries (
          id,
          endpoint_id,
          company_id,
          direction,
          external_event_id,
          payload_digest,
          payload_bytes,
          signature_valid,
          status,
          correlation_id,
          received_at,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'inbound',
          $4,
          $5,
          $6,
          TRUE,
          'received',
          $7,
          NOW(),
          NOW()
        )
      `,
      [
        deliveryId,
        endpoint.id,
        companyId,
        externalEventId,
        payloadDigest,
        payloadBytes,
        correlationId,
      ],
    );

    await client.query(
      `
        INSERT INTO integration_events (
          id,
          company_id,
          connection_id,
          delivery_id,
          provider_key,
          event_key,
          external_event_id,
          payload,
          status,
          occurred_at,
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
          'pending',
          NOW(),
          NOW()
        )
      `,
      [
        integrationEventId,
        companyId,
        endpoint.connection_id ||
          null,
        deliveryId,
        endpoint.provider_key,
        eventKey,
        externalEventId,
        JSON.stringify(
          payload,
        ),
      ],
    );

    await client.query(
      `
        UPDATE integration_webhook_endpoints
        SET
          last_received_at =
            NOW(),
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        endpoint.id,
      ],
    );

    if (
      endpoint.connection_id
    ) {
      await client.query(
        `
          UPDATE integration_connections
          SET
            health_status =
              'healthy',
            last_health_check_at =
              NOW(),
            updated_at =
              NOW()
          WHERE id = $1
        `,
        [
          endpoint.connection_id,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    );

    throw error;
  } finally {
    client.release();
  }

  const workflows =
    await pool.query(
      `
        SELECT
          w.id,
          w.run_as_user_id,
          v.definition
        FROM automation_workflows w
        INNER JOIN automation_workflow_versions v
          ON v.workflow_id =
             w.id
         AND v.version =
             w.active_version
        WHERE w.company_id = $1
          AND w.status =
              'active'
          AND w.archived_at
              IS NULL
          AND w.run_as_user_id
              IS NOT NULL
          AND v.trigger_key =
              'integrations.webhook.received'
          AND v.definition #>>
              '{trigger,config,endpointId}' =
              $2
        ORDER BY
          w.id
        LIMIT 100
      `,
      [
        companyId,
        String(
          endpoint.id,
        ),
      ],
    );

  let dispatched =
    0;

  let failed =
    0;

  for (
    const row
    of workflows.rows
  ) {
    const definition =
      row.definition &&
      typeof row.definition ===
        'object'
        ? row.definition as
            Record<
              string,
              unknown
            >
        : {};

    const trigger =
      definition.trigger &&
      typeof definition.trigger ===
        'object' &&
      !Array.isArray(
        definition.trigger,
      )
        ? definition.trigger as
            Record<
              string,
              unknown
            >
        : {};

    const config =
      trigger.config &&
      typeof trigger.config ===
        'object' &&
      !Array.isArray(
        trigger.config,
      )
        ? trigger.config as
            Record<
              string,
              unknown
            >
        : {};

    const requiredEvent =
      typeof config.eventKey ===
        'string'
        ? config.eventKey
            .trim()
            .toLowerCase()
        : '';

    if (
      requiredEvent &&
      requiredEvent !==
        eventKey
    ) {
      continue;
    }

    try {
      const runAsUserId =
        String(
          row.run_as_user_id,
        );

      const runtime =
        await resolveAutomationWorkerRuntime({
          tenantId:
            input.tenantId,
          userId:
            runAsUserId,
          companyId,
        });

      const active =
        await loadActiveAutomationWorkflow({
          runtime,
          workflowId:
            String(
              row.id,
            ),
          expectedTrigger:
            'integrations.webhook.received',
        });

      await startAutomationRun({
        runtime,
        workflowId:
          active.workflowId,
        workflowName:
          active.workflowName,
        workflowVersionId:
          active.workflowVersionId,
        definition:
          active.definition,
        sourceType:
          'webhook',
        triggerKey:
          'integrations.webhook.received',
        payload: {
          providerKey:
            String(
              endpoint.provider_key,
            ),
          endpointId:
            String(
              endpoint.id,
            ),
          eventKey,
          externalEventId,
          data:
            payload,
        },
        idempotencyKey:
          `integration:${integrationEventId}:${String(
            row.id,
          )}`,
        initiatedBy:
          runAsUserId,
      });

      dispatched +=
        1;
    } catch (
      error
    ) {
      failed +=
        1;

      console.error(
        '[SaMi Integrations] Webhook automation dispatch failed:',
        error,
      );
    }
  }

  const eventStatus =
    failed >
      0
      ? 'failed'
      : 'processed';

  await pool.query(
    `
      UPDATE integration_events
      SET
        status = $2,
        processed_at =
          NOW()
      WHERE id = $1
    `,
    [
      integrationEventId,
      eventStatus,
    ],
  );

  await pool.query(
    `
      UPDATE integration_webhook_deliveries
      SET
        status = $2,
        processed_at =
          NOW()
      WHERE id = $1
    `,
    [
      deliveryId,
      eventStatus,
    ],
  );

  return {
    accepted:
      true,
    duplicate:
      false,
    deliveryId,
    eventId:
      integrationEventId,
    eventKey,
    dispatched,
    failed,
  };
}
