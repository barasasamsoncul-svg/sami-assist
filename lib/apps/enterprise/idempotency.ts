import 'server-only';

import crypto from 'node:crypto';

import type {
  PoolClient,
} from 'pg';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export class EnterpriseIdempotencyConflictError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'EnterpriseIdempotencyConflictError';
  }
}


export function normalizeEnterpriseIdempotencyKey(
  value:
    unknown,
) {
  const key =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';

  return UUID_RE.test(
    key,
  )
    ? key
    : null;
}


export function hashEnterpriseCreateRequest(
  moduleKey:
    string,
  table:
    string,
  values:
    Map<
      string,
      unknown
    >,
) {
  const payload =
    JSON.stringify({
      moduleKey,
      table,
      values:
        [
          ...values.entries(),
        ]
          .sort(
            (
              left,
              right,
            ) =>
              left[0]
                .localeCompare(
                  right[0],
                ),
          )
          .map(
            ([
              key,
              value,
            ]) => [
              key,
              value,
            ],
          ),
    });

  return crypto
    .createHash(
      'sha256',
    )
    .update(
      payload,
      'utf8',
    )
    .digest(
      'hex',
    );
}


export async function reserveEnterpriseCreateRequest(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    moduleKey:
      string;
    table:
      string;
    idempotencyKey:
      string;
    requestHash:
      string;
  },
): Promise<{
  replayed:
    boolean;
  response:
    Record<
      string,
      unknown
    > |
    null;
}> {
  await client.query(
    `
      DELETE FROM sami_enterprise_idempotency
      WHERE company_id = $1
        AND created_at <
            NOW() -
            INTERVAL '14 days'
    `,
    [
      input.companyId,
    ],
  );

  const reserved =
    await client.query(
      `
        INSERT INTO sami_enterprise_idempotency (
          company_id,
          idempotency_key,
          module_key,
          table_key,
          request_hash,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          NOW(),
          NOW()
        )
        ON CONFLICT (
          company_id,
          idempotency_key
        )
        DO NOTHING
        RETURNING
          idempotency_key
      `,
      [
        input.companyId,
        input.idempotencyKey,
        input.moduleKey,
        input.table,
        input.requestHash,
        input.userId,
      ],
    );

  if (
    reserved.rows.length ===
      1
  ) {
    return {
      replayed:
        false,
      response:
        null,
    };
  }

  const existing =
    await client.query(
      `
        SELECT
          module_key,
          table_key,
          request_hash,
          response_json
        FROM sami_enterprise_idempotency
        WHERE company_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [
        input.companyId,
        input.idempotencyKey,
      ],
    );

  if (
    existing.rows.length !==
      1
  ) {
    throw new EnterpriseIdempotencyConflictError(
      'SaMi could not resolve this create request safely.',
    );
  }

  const row =
    existing.rows[0];

  if (
    String(
      row.module_key,
    ) !==
      input.moduleKey ||
    String(
      row.table_key,
    ) !==
      input.table ||
    String(
      row.request_hash,
    ) !==
      input.requestHash
  ) {
    throw new EnterpriseIdempotencyConflictError(
      'This create request key was already used for different data.',
    );
  }

  if (
    !row.response_json ||
    typeof row.response_json !==
      'object' ||
    Array.isArray(
      row.response_json,
    )
  ) {
    throw new EnterpriseIdempotencyConflictError(
      'This create request is still being finalized. Retry the same request.',
    );
  }

  return {
    replayed:
      true,
    response:
      row.response_json as
        Record<
          string,
          unknown
        >,
  };
}


export async function completeEnterpriseCreateRequest(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    idempotencyKey:
      string;
    recordKey:
      string |
      null;
    response:
      Record<
        string,
        unknown
      >;
  },
) {
  const result =
    await client.query(
      `
        UPDATE sami_enterprise_idempotency
        SET
          record_key = $3,
          response_json = $4::jsonb,
          updated_at = NOW()
        WHERE company_id = $1
          AND idempotency_key = $2
        RETURNING
          idempotency_key
      `,
      [
        input.companyId,
        input.idempotencyKey,
        input.recordKey,
        JSON.stringify(
          input.response,
        ),
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new EnterpriseIdempotencyConflictError(
      'SaMi could not finalize this create request safely.',
    );
  }
}
