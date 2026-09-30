import 'server-only';

import crypto from 'node:crypto';

import type {
  PoolClient,
} from 'pg';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';


const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;


function canonicalize(
  value:
    unknown,
): unknown {
  if (
    value ===
      null ||
    typeof value ===
      'string' ||
    typeof value ===
      'boolean'
  ) {
    return value;
  }

  if (
    typeof value ===
      'number'
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : String(
          value,
        );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value &&
    typeof value ===
      'object'
  ) {
    const record =
      value as
        Record<
          string,
          unknown
        >;

    return Object.fromEntries(
      Object.keys(
        record,
      )
        .filter(
          key =>
            record[key] !==
              undefined &&
            key !==
              'idempotencyKey' &&
            key !==
              'action',
        )
        .sort()
        .map(
          key => [
            key,
            canonicalize(
              record[key],
            ),
          ],
        ),
    );
  }

  return String(
    value,
  );
}


export function normalizeInvoicingIdempotencyKey(
  value:
    unknown,
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
  ) {
    return null;
  }

  const key =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    !IDEMPOTENCY_KEY_PATTERN.test(
      key,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Idempotency key must be 8-160 safe characters.',
    );
  }

  return key;
}


export function hashInvoicingMutationRequest(
  action:
    string,
  payload:
    Record<
      string,
      unknown
    >,
) {
  const serialized =
    JSON.stringify(
      canonicalize({
        action,
        payload,
      }),
    );

  return crypto
    .createHash(
      'sha256',
    )
    .update(
      serialized,
      'utf8',
    )
    .digest(
      'hex',
    );
}


export async function reserveInvoicingMutation(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    action: string;
    idempotencyKey: string;
    requestHash: string;
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
  const inserted =
    await client.query(
      `
        INSERT INTO invoicing_idempotency_requests (
          company_id,
          idempotency_key,
          action,
          request_hash,
          created_by,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,
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
        input.action,
        input.requestHash,
        input.userId,
      ],
    );

  if (
    inserted.rows.length ===
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
          action,
          request_hash,
          response_json
        FROM invoicing_idempotency_requests
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
    throw new InvoicingError(
      'IDEMPOTENCY_CONFLICT',
      'SaMi could not resolve this retry safely. Retry the same request.',
    );
  }

  const row =
    existing.rows[0];

  if (
    String(
      row.action,
    ) !==
      input.action ||
    String(
      row.request_hash,
    ) !==
      input.requestHash
  ) {
    throw new InvoicingError(
      'IDEMPOTENCY_CONFLICT',
      'This request key was already used for different invoice data.',
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
    throw new InvoicingError(
      'IDEMPOTENCY_IN_PROGRESS',
      'This invoice request is still being finalized. Retry the same request.',
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


export async function completeInvoicingMutation(
  client:
    PoolClient,
  input: {
    companyId: string;
    idempotencyKey: string;
    recordId: string | null;
    response:
      Record<
        string,
        unknown
      >;
  },
) {
  const completed =
    await client.query(
      `
        UPDATE invoicing_idempotency_requests
        SET
          record_id = $3,
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
        input.recordId,
        JSON.stringify(
          input.response,
        ),
      ],
    );

  if (
    completed.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'IDEMPOTENCY_CONFLICT',
      'SaMi could not finalize the retry-safe invoice request.',
    );
  }
}
