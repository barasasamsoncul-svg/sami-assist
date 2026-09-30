import 'server-only';

import crypto from 'crypto';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  cleanText,
  INVOICING_PERMISSIONS,
  InvoicingError,
  money,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


type EtimsProviderResponse = {
  accepted: boolean;
  providerRequestId: string | null;
  scuId: string | null;
  scuReceiptNumber: string | null;
  cuInvoiceNumber: string | null;
  receiptCounter: string | null;
  totalReceiptCounter: string | null;
  internalData: string | null;
  receiptSignature: string | null;
  qrPayload: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  raw: Record<string, unknown>;
};


function sha256(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}


function envText(
  key:
    string,
) {
  return String(
    process.env[
      key
    ] ||
    '',
  )
    .trim();
}


function providerRuntime() {
  const provider =
    envText(
      'SAMI_ETIMS_PROVIDER',
    ) ||
    'disabled';

  const environment =
    envText(
      'SAMI_ETIMS_ENV',
    ) ||
    'sandbox';

  const apiUrl =
    envText(
      'SAMI_ETIMS_API_URL',
    );

  const apiToken =
    envText(
      'SAMI_ETIMS_API_TOKEN',
    );

  const apiKey =
    envText(
      'SAMI_ETIMS_API_KEY',
    );

  const apiKeyHeader =
    envText(
      'SAMI_ETIMS_API_KEY_HEADER',
    ) ||
    'x-api-key';

  const rawTimeout =
    Number(
      envText(
        'SAMI_ETIMS_TIMEOUT_MS',
      ) ||
      15000,
    );

  const timeoutMs =
    Number.isFinite(
      rawTimeout,
    )
      ? Math.min(
          60000,
          Math.max(
            3000,
            Math.trunc(
              rawTimeout,
            ),
          ),
        )
      : 15000;

  return {
    provider,
    environment,
    apiUrl,
    apiToken,
    apiKey,
    apiKeyHeader,
    timeoutMs,
    configured:
      provider !==
        'disabled' &&
      Boolean(
        apiUrl,
      ) &&
      Boolean(
        apiToken ||
        apiKey,
      ),
  };
}


export function getEtimsProviderRuntimeStatus() {
  const runtime =
    providerRuntime();

  let endpointHost:
    string | null =
      null;

  try {
    endpointHost =
      runtime.apiUrl
        ? new URL(
            runtime.apiUrl,
          ).host
        : null;
  } catch {}

  return {
    provider:
      runtime.provider,
    environment:
      runtime.environment,
    configured:
      runtime.configured,
    endpointHost,
  };
}


function normalizeResponse(
  rawValue:
    unknown,
): EtimsProviderResponse {
  const raw =
    rawValue &&
    typeof rawValue ===
      'object' &&
    !Array.isArray(
      rawValue,
    )
      ? rawValue as
          Record<
            string,
            unknown
          >
      : {};

  const nested =
    raw.data &&
    typeof raw.data ===
      'object' &&
    !Array.isArray(
      raw.data,
    )
      ? raw.data as
          Record<
            string,
            unknown
          >
      : {};

  const pick = (
    ...keys:
      string[]
  ) => {
    for (
      const key
      of keys
    ) {
      const value =
        raw[
          key
        ] ??
        nested[
          key
        ];

      if (
        value !==
          undefined &&
        value !==
          null &&
        String(
          value,
        )
          .trim()
      ) {
        return String(
          value,
        ).trim();
      }
    }

    return null;
  };

  const explicitSuccess =
    raw.success ===
      true ||
    nested.success ===
      true ||
    String(
      raw.status ||
      nested.status ||
      '',
    )
      .toLowerCase() ===
      'accepted' ||
    String(
      raw.status ||
      nested.status ||
      '',
    )
      .toLowerCase() ===
      'success';

  const explicitFailure =
    raw.success ===
      false ||
    nested.success ===
      false ||
    [
      'rejected',
      'failed',
      'error',
    ].includes(
      String(
        raw.status ||
        nested.status ||
        '',
      )
        .toLowerCase(),
    );

  const scuId =
    pick(
      'scuId',
      'cuId',
      'scu_id',
      'cu_id',
    );

  const receiptSignature =
    pick(
      'receiptSignature',
      'signature',
      'rcptSignature',
      'receipt_signature',
    );

  const cuInvoiceNumber =
    pick(
      'cuInvoiceNumber',
      'cuInvoiceNo',
      'fiscalInvoiceNumber',
      'cu_invoice_number',
    );

  const accepted =
    !explicitFailure &&
    (
      explicitSuccess ||
      Boolean(
        scuId &&
        receiptSignature &&
        cuInvoiceNumber,
      )
    );

  return {
    accepted,
    providerRequestId:
      pick(
        'requestId',
        'providerRequestId',
        'transactionId',
        'request_id',
      ),
    scuId,
    scuReceiptNumber:
      pick(
        'scuReceiptNumber',
        'receiptNumber',
        'rctNo',
        'scu_receipt_number',
      ),
    cuInvoiceNumber,
    receiptCounter:
      pick(
        'receiptCounter',
        'rcptCounter',
        'receipt_counter',
      ),
    totalReceiptCounter:
      pick(
        'totalReceiptCounter',
        'totalCounter',
        'total_receipt_counter',
      ),
    internalData:
      pick(
        'internalData',
        'internal_data',
      ),
    receiptSignature,
    qrPayload:
      pick(
        'qrPayload',
        'qrCode',
        'qrUrl',
        'qr_payload',
      ),
    responseCode:
      pick(
        'responseCode',
        'code',
        'resultCode',
        'response_code',
      ),
    responseMessage:
      pick(
        'responseMessage',
        'message',
        'resultMessage',
        'response_message',
      ),
    raw,
  };
}


async function buildInvoicePayload(
  client:
    PoolClient,
  companyId:
    string,
  invoiceId:
    string,
) {
  const invoiceResult =
    await client.query(
      `
        SELECT
          invoice.id,
          invoice.invoice_number,
          invoice.status,
          invoice.invoice_date,
          invoice.created_at,
          invoice.currency,
          invoice.exchange_rate,
          invoice.total_amount,
          invoice.subtotal,
          invoice.discount_total,
          invoice.tax_total,
          invoice.shipping_total,
          invoice.rounding_adjustment,
          invoice.bill_to_name,
          invoice.bill_to_tax_id,
          invoice.customer_id,
          customer.name
            AS customer_name,
          customer.tax_id
            AS customer_tax_id,
          customer.country_code,
          setting.taxpayer_pin,
          setting.branch_id,
          setting.device_serial,
          setting.control_unit_type,
          setting.environment,
          setting.enabled,
          company.name
            AS company_name,
          company.currency
            AS company_currency
        FROM invoicing_invoices invoice
        INNER JOIN invoicing_customers customer
          ON customer.id =
             invoice.customer_id
         AND customer.company_id =
             invoice.company_id
        INNER JOIN companies company
          ON company.id =
             invoice.company_id
        LEFT JOIN invoicing_etims_settings setting
          ON setting.company_id =
             invoice.company_id
        WHERE invoice.id = $1
          AND invoice.company_id = $2
          AND invoice.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE OF invoice
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    invoiceResult.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const invoice =
    invoiceResult.rows[0];

  if (
    ![
      'confirmed',
      'sent',
      'viewed',
      'partially_paid',
      'paid',
      'overdue',
    ].includes(
      String(
        invoice.status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Only a confirmed or later invoice can be fiscalized through eTIMS.',
    );
  }

  if (
    invoice.enabled !==
      true
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'eTIMS is not enabled for this company.',
    );
  }

  const taxpayerPin =
    cleanText(
      invoice.taxpayer_pin,
      20,
    )
      .toUpperCase();

  if (
    !taxpayerPin
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Configure the company KRA PIN before fiscalizing invoices.',
    );
  }

  const itemsResult =
    await client.query(
      `
        SELECT
          item.id,
          item.description,
          item.sku_snapshot,
          item.unit,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.tax_name_snapshot,
          item.tax_rate,
          item.tax_amount,
          item.subtotal,
          item.line_total,
          item.tax_components
        FROM invoicing_invoice_items item
        WHERE item.company_id = $1
          AND item.invoice_id = $2
        ORDER BY
          item.sort_order,
          item.id
      `,
      [
        companyId,
        invoiceId,
      ],
    );

  if (
    itemsResult.rows.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The invoice has no line items to submit to eTIMS.',
    );
  }

  const taxTotals =
    new Map<
      string,
      {
        label: string;
        rate: number;
        taxableAmount: number;
        taxAmount: number;
      }
    >();

  for (
    const row
    of itemsResult.rows
  ) {
    const components =
      Array.isArray(
        row.tax_components,
      )
        ? row.tax_components
        : [];

    if (
      components.length >
        0
    ) {
      for (
        const component
        of components
      ) {
        if (
          !component ||
          typeof component !==
            'object' ||
          Array.isArray(
            component,
          )
        ) {
          continue;
        }

        const value =
          component as
            Record<
              string,
              unknown
            >;

        const label =
          cleanText(
            value.name ||
            value.label ||
            value.code ||
            'Tax',
            120,
          ) ||
          'Tax';

        const rate =
          Number(
            value.rate ||
            0,
          );

        const key =
          label +
          ':' +
          rate;

        const current =
          taxTotals.get(
            key,
          ) || {
            label,
            rate,
            taxableAmount:
              0,
            taxAmount:
              0,
          };

        current.taxableAmount =
          money(
            current.taxableAmount +
            Number(
              value.taxableAmount ||
              row.subtotal ||
              0,
            ),
          );

        current.taxAmount =
          money(
            current.taxAmount +
            Number(
              value.amount ||
              value.taxAmount ||
              0,
            ),
          );

        taxTotals.set(
          key,
          current,
        );
      }
    } else {
      const label =
        cleanText(
          row.tax_name_snapshot,
          120,
        ) ||
        (
          Number(
            row.tax_rate ||
            0,
          ) ===
            0
            ? 'Zero/Exempt'
            : 'VAT'
        );

      const rate =
        Number(
          row.tax_rate ||
          0,
        );

      const key =
        label +
        ':' +
        rate;

      const current =
        taxTotals.get(
          key,
        ) || {
          label,
          rate,
          taxableAmount:
            0,
          taxAmount:
            0,
        };

      current.taxableAmount =
        money(
          current.taxableAmount +
          Number(
            row.subtotal ||
            0,
          ),
        );

      current.taxAmount =
        money(
          current.taxAmount +
          Number(
            row.tax_amount ||
            0,
          ),
        );

      taxTotals.set(
        key,
        current,
      );
    }
  }

  return {
    schemaVersion:
      'sami-etims-tis-1',
    documentKind:
      'invoice',
    receiptType:
      'NORMAL',
    transactionType:
      'SALE',
    receiptLabel:
      'NS',
    taxpayer: {
      pin:
        taxpayerPin,
      name:
        String(
          invoice.company_name,
        ),
      branchId:
        invoice.branch_id
          ? String(
              invoice.branch_id,
            )
          : null,
      deviceSerial:
        invoice.device_serial
          ? String(
              invoice.device_serial,
            )
          : null,
      controlUnitType:
        String(
          invoice.control_unit_type ||
          'oscu',
        )
          .toUpperCase(),
      environment:
        String(
          invoice.environment ||
          'sandbox',
        ),
    },
    buyer: {
      name:
        String(
          invoice.bill_to_name ||
          invoice.customer_name ||
          '',
        ),
      pin:
        invoice.bill_to_tax_id ||
        invoice.customer_tax_id
          ? String(
              invoice.bill_to_tax_id ||
              invoice.customer_tax_id,
            )
              .trim()
              .toUpperCase()
          : null,
      countryCode:
        invoice.country_code
          ? String(
              invoice.country_code,
            )
              .trim()
              .toUpperCase()
          : null,
    },
    receipt: {
      tisInvoiceNumber:
        String(
          invoice.invoice_number,
        ),
      invoiceDate:
        String(
          invoice.invoice_date,
        ),
      tisTimestamp:
        new Date(
          invoice.created_at,
        )
          .toISOString(),
      currency:
        String(
          invoice.currency,
        ),
      exchangeRate:
        Number(
          invoice.exchange_rate ||
          1,
        ),
      subtotal:
        money(
          invoice.subtotal,
        ),
      discountTotal:
        money(
          invoice.discount_total,
        ),
      taxTotal:
        money(
          invoice.tax_total,
        ),
      shippingTotal:
        money(
          invoice.shipping_total,
        ),
      roundingAdjustment:
        money(
          invoice.rounding_adjustment,
        ),
      totalAmount:
        money(
          invoice.total_amount,
        ),
      paymentMethods: [
        'OTHER',
      ],
    },
    items:
      itemsResult.rows.map(
        (
          row,
          index,
        ) => ({
          sequence:
            index +
            1,
          sku:
            row.sku_snapshot
              ? String(
                  row.sku_snapshot,
                )
              : null,
          description:
            String(
              row.description,
            ),
          unit:
            String(
              row.unit ||
              'unit',
            ),
          quantity:
            Number(
              row.quantity ||
              0,
            ),
          unitPrice:
            money(
              row.unit_price,
            ),
          discountAmount:
            money(
              row.discount_amount,
            ),
          taxableAmount:
            money(
              row.subtotal,
            ),
          taxLabel:
            row.tax_name_snapshot
              ? String(
                  row.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              row.tax_rate ||
              0,
            ),
          taxAmount:
            money(
              row.tax_amount,
            ),
          lineTotal:
            money(
              row.line_total,
            ),
        }),
      ),
    taxSummary: [
      ...taxTotals.values(),
    ],
  };
}


async function callProvider(
  payload:
    Record<string, unknown>,
) {
  const runtime =
    providerRuntime();

  if (
    !runtime.configured
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The eTIMS transport is not configured. Set SAMI_ETIMS_PROVIDER, SAMI_ETIMS_API_URL and the required server credential before submitting.',
    );
  }

  const headers:
    Record<
      string,
      string
    > = {
      'content-type':
        'application/json',
      accept:
        'application/json',
      'x-sami-etims-provider':
        runtime.provider,
      'x-sami-etims-environment':
        runtime.environment,
    };

  if (
    runtime.apiToken
  ) {
    headers.authorization =
      'Bearer ' +
      runtime.apiToken;
  }

  if (
    runtime.apiKey
  ) {
    headers[
      runtime.apiKeyHeader
    ] =
      runtime.apiKey;
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      runtime.timeoutMs,
    );

  const started =
    Date.now();

  try {
    const response =
      await fetch(
        runtime.apiUrl,
        {
          method:
            'POST',
          headers,
          body:
            JSON.stringify(
              payload,
            ),
          signal:
            controller.signal,
          cache:
            'no-store',
        },
      );

    const text =
      await response.text();

    let raw:
      unknown = {};

    try {
      raw =
        text
          ? JSON.parse(
              text,
            )
          : {};
    } catch {
      raw = {
        message:
          text.slice(
            0,
            4000,
          ),
      };
    }

    const normalized =
      normalizeResponse(
        raw,
      );

    if (
      !response.ok &&
      !normalized
        .accepted
    ) {
      normalized.responseCode =
        normalized.responseCode ||
        String(
          response.status,
        );

      normalized.responseMessage =
        normalized.responseMessage ||
        response.statusText ||
        'eTIMS provider rejected the request.';
    }

    return {
      normalized,
      durationMs:
        Date.now() -
        started,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        Error &&
      error.name ===
        'AbortError'
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'The eTIMS provider timed out before returning a fiscalization response.',
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}


export async function saveEtimsSettings(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const enabled =
    input.enabled ===
      true;

  const environment =
    input.environment ===
      'production'
      ? 'production'
      : 'sandbox';

  const controlUnitType =
    input.controlUnitType ===
      'vscu'
      ? 'vscu'
      : 'oscu';

  const taxpayerPin =
    cleanText(
      input.taxpayerPin,
      20,
    )
      .toUpperCase() ||
    null;

  const branchId =
    cleanText(
      input.branchId,
      40,
    ) ||
    null;

  const deviceSerial =
    cleanText(
      input.deviceSerial,
      120,
    ) ||
    null;

  if (
    enabled &&
    !taxpayerPin
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'KRA PIN is required when eTIMS is enabled.',
    );
  }

  await context.pool.query(
    `
      INSERT INTO invoicing_etims_settings (
        company_id,
        enabled,
        environment,
        control_unit_type,
        taxpayer_pin,
        branch_id,
        device_serial,
        require_fiscalization_before_delivery,
        auto_queue_on_confirmation,
        created_by,
        updated_by
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
      )
      ON CONFLICT (
        company_id
      )
      DO UPDATE
      SET
        enabled =
          EXCLUDED.enabled,
        environment =
          EXCLUDED.environment,
        control_unit_type =
          EXCLUDED.control_unit_type,
        taxpayer_pin =
          EXCLUDED.taxpayer_pin,
        branch_id =
          EXCLUDED.branch_id,
        device_serial =
          EXCLUDED.device_serial,
        require_fiscalization_before_delivery =
          EXCLUDED.require_fiscalization_before_delivery,
        auto_queue_on_confirmation =
          EXCLUDED.auto_queue_on_confirmation,
        updated_by =
          EXCLUDED.updated_by,
        updated_at =
          NOW()
    `,
    [
      context.companyId,
      enabled,
      environment,
      controlUnitType,
      taxpayerPin,
      branchId,
      deviceSerial,
      input.requireFiscalizationBeforeDelivery !==
        false,
      input.autoQueueOnConfirmation !==
        false,
      context.userId,
    ],
  );

  return {
    updated:
      true,
    enabled,
    environment,
    controlUnitType,
    runtime:
      getEtimsProviderRuntimeStatus(),
  };
}


export async function queueInvoiceForEtims(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    invoiceId: string;
  },
) {
  const payload =
    await buildInvoicePayload(
      client,
      input.companyId,
      input.invoiceId,
    );

  const serialized =
    JSON.stringify(
      payload,
    );

  const requestHash =
    sha256(
      serialized,
    );

  const existing =
    await client.query(
      `
        SELECT
          id,
          status,
          request_sha256
        FROM invoicing_etims_documents
        WHERE company_id = $1
          AND invoice_id = $2
          AND status <> 'cancelled'
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.companyId,
        input.invoiceId,
      ],
    );

  if (
    existing.rows.length >
      0
  ) {
    const row =
      existing.rows[0];

    if (
      String(
        row.status,
      ) ===
        'accepted'
    ) {
      return {
        documentId:
          String(
            row.id,
          ),
        status:
          'accepted',
        reused:
          true,
      };
    }

    await client.query(
      `
        UPDATE invoicing_etims_documents
        SET
          request_payload =
            $3::jsonb,
          request_sha256 =
            $4,
          status =
            'queued',
          response_code =
            NULL,
          response_message =
            NULL,
          next_retry_at =
            NULL,
          updated_by =
            $5,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        row.id,
        input.companyId,
        serialized,
        requestHash,
        input.userId,
      ],
    );

    return {
      documentId:
        String(
          row.id,
        ),
      status:
        'queued',
      reused:
        true,
    };
  }

  const created =
    await client.query(
      `
        INSERT INTO invoicing_etims_documents (
          company_id,
          invoice_id,
          document_kind,
          receipt_type,
          transaction_type,
          receipt_label,
          status,
          request_payload,
          request_sha256,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,
          'invoice',
          'NORMAL',
          'SALE',
          'NS',
          'queued',
          $3::jsonb,
          $4,$5,$5
        )
        RETURNING id
      `,
      [
        input.companyId,
        input.invoiceId,
        serialized,
        requestHash,
        input.userId,
      ],
    );

  return {
    documentId:
      String(
        created.rows[0].id,
      ),
    status:
      'queued',
    reused:
      false,
  };
}


export async function queueInvoiceForEtimsIfEnabled(
  client:
    PoolClient,
  input: {
    companyId: string;
    userId: string;
    invoiceId: string;
  },
) {
  const setting =
    await client.query(
      `
        SELECT
          enabled,
          auto_queue_on_confirmation
        FROM invoicing_etims_settings
        WHERE company_id = $1
        LIMIT 1
      `,
      [
        input.companyId,
      ],
    );

  if (
    setting.rows[0]
      ?.enabled !==
        true ||
    setting.rows[0]
      ?.auto_queue_on_confirmation ===
        false
  ) {
    return null;
  }

  return queueInvoiceForEtims(
    client,
    input,
  );
}


export async function fiscalizeInvoiceWithEtims(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_CONFIRM,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const client =
    await context.pool.connect();

  let documentId =
    '';

  let requestPayload:
    Record<
      string,
      unknown
    > = {};

  let requestHash =
    '';

  let attemptNo =
    0;

  try {
    await client.query(
      'BEGIN',
    );

    const queued =
      await queueInvoiceForEtims(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          invoiceId,
        },
      );

    documentId =
      queued.documentId;

    const locked =
      await client.query(
        `
          SELECT
            request_payload,
            request_sha256,
            status,
            attempt_count
          FROM invoicing_etims_documents
          WHERE id = $1
            AND company_id = $2
          FOR UPDATE
        `,
        [
          documentId,
          context.companyId,
        ],
      );

    const row =
      locked.rows[0];

    if (
      String(
        row.status,
      ) ===
        'accepted'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        documentId,
        status:
          'accepted',
        reused:
          true,
      };
    }

    requestPayload =
      (
        row.request_payload &&
        typeof row.request_payload ===
          'object' &&
        !Array.isArray(
          row.request_payload,
        )
      )
        ? row.request_payload as
            Record<
              string,
              unknown
            >
        : {};

    requestHash =
      String(
        row.request_sha256,
      );

    attemptNo =
      Number(
        row.attempt_count ||
        0,
      ) +
      1;

    await client.query(
      `
        UPDATE invoicing_etims_documents
        SET
          status =
            'submitting',
          attempt_count =
            $3,
          last_attempt_at =
            NOW(),
          submitted_by =
            $4,
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        documentId,
        context.companyId,
        attemptNo,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    client.release();

    throw error;
  }

  const runtime =
    providerRuntime();

  try {
    const {
      normalized,
      durationMs,
    } =
      await callProvider(
        requestPayload,
      );

    const responseSerialized =
      JSON.stringify(
        normalized.raw,
      );

    const responseHash =
      sha256(
        responseSerialized,
      );

    await client.query(
      'BEGIN',
    );

    const status =
      normalized.accepted
        ? 'accepted'
        : 'rejected';

    await client.query(
      `
        INSERT INTO invoicing_etims_attempts (
          company_id,
          etims_document_id,
          attempt_no,
          status,
          request_sha256,
          response_sha256,
          provider,
          response_code,
          response_message,
          duration_ms,
          response_payload,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12
        )
      `,
      [
        context.companyId,
        documentId,
        attemptNo,
        normalized.accepted
          ? 'accepted'
          : 'rejected',
        requestHash,
        responseHash,
        runtime.provider,
        normalized.responseCode,
        normalized.responseMessage,
        durationMs,
        responseSerialized,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE invoicing_etims_documents
        SET
          status =
            $3,
          provider =
            $4,
          provider_request_id =
            $5,
          scu_id =
            $6,
          scu_receipt_number =
            $7,
          cu_invoice_number =
            $8,
          receipt_counter =
            $9,
          total_receipt_counter =
            $10,
          internal_data =
            $11,
          receipt_signature =
            $12,
          qr_payload =
            $13,
          response_code =
            $14,
          response_message =
            $15,
          response_payload =
            $16::jsonb,
          fiscalized_at =
            CASE
              WHEN $3 =
                   'accepted'
              THEN NOW()
              ELSE NULL
            END,
          next_retry_at =
            CASE
              WHEN $3 =
                   'accepted'
              THEN NULL
              ELSE NOW() +
                   INTERVAL '5 minutes'
            END,
          updated_by =
            $17,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        documentId,
        context.companyId,
        status,
        runtime.provider,
        normalized.providerRequestId,
        normalized.scuId,
        normalized.scuReceiptNumber,
        normalized.cuInvoiceNumber,
        normalized.receiptCounter,
        normalized.totalReceiptCounter,
        normalized.internalData,
        normalized.receiptSignature,
        normalized.qrPayload,
        normalized.responseCode,
        normalized.responseMessage,
        responseSerialized,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    return {
      documentId,
      status,
      accepted:
        normalized.accepted,
      scuId:
        normalized.scuId,
      cuInvoiceNumber:
        normalized.cuInvoiceNumber,
      receiptSignature:
        normalized.receiptSignature,
      responseCode:
        normalized.responseCode,
      responseMessage:
        normalized.responseMessage,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'BEGIN',
      );

      const message =
        error instanceof
          Error
          ? error.message
          : 'eTIMS submission failed.';

      await client.query(
        `
          INSERT INTO invoicing_etims_attempts (
            company_id,
            etims_document_id,
            attempt_no,
            status,
            request_sha256,
            provider,
            response_message,
            created_by
          )
          VALUES (
            $1,$2,$3,
            'failed',
            $4,$5,$6,$7
          )
          ON CONFLICT (
            etims_document_id,
            attempt_no
          )
          DO NOTHING
        `,
        [
          context.companyId,
          documentId,
          attemptNo,
          requestHash,
          runtime.provider,
          message.slice(
            0,
            4000,
          ),
          context.userId,
        ],
      );

      await client.query(
        `
          UPDATE invoicing_etims_documents
          SET
            status =
              'failed',
            provider =
              $3,
            response_message =
              $4,
            next_retry_at =
              NOW() +
              INTERVAL '5 minutes',
            updated_by =
              $5,
            updated_at =
              NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          documentId,
          context.companyId,
          runtime.provider,
          message.slice(
            0,
            4000,
          ),
          context.userId,
        ],
      );

      await client.query(
        'COMMIT',
      );
    } catch {
      try {
        await client.query(
          'ROLLBACK',
        );
      } catch {}
    }

    throw error;
  } finally {
    client.release();
  }
}


export async function assertEtimsDeliveryReady(
  client:
    Pool |
    PoolClient,
  input: {
    companyId: string;
    invoiceId: string;
  },
) {
  const result =
    await client.query(
      `
        SELECT
          setting.enabled,
          setting.require_fiscalization_before_delivery,
          document.status,
          document.cu_invoice_number
        FROM invoicing_etims_settings setting
        LEFT JOIN invoicing_etims_documents document
          ON document.company_id =
             setting.company_id
         AND document.invoice_id =
             $2
         AND document.status <>
             'cancelled'
        WHERE setting.company_id =
              $1
        LIMIT 1
      `,
      [
        input.companyId,
        input.invoiceId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    row.enabled !==
      true ||
    row.require_fiscalization_before_delivery !==
      true
  ) {
    return;
  }

  if (
    String(
      row.status ||
      '',
    ) !==
      'accepted'
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This invoice cannot be delivered as an official receipt until eTIMS fiscalization is accepted.',
      {
        etimsStatus:
          row.status ||
          'not_submitted',
      },
    );
  }
}
