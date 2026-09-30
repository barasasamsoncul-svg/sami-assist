import 'server-only';

import {
  createHash,
  randomUUID,
} from 'node:crypto';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  isIntegrationEncryptionConfigured,
  openIntegrationSecret,
  sealIntegrationSecret,
} from '@/lib/integrations/crypto';

import {
  cleanText,
  hasInvoicingPermission,
  INVOICING_PERMISSIONS,
  InvoicingError,
  money,
  optionalUuid,
  requireInvoicingContext,
  requireUuid,
} from '@/lib/apps/invoicing/context';


export const PEPPOL_BIS_BILLING_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';

export const PEPPOL_BIS_BILLING_PROCESS_ID =
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';


type EInvoiceNetwork =
  | 'peppol'
  | 'custom_edi';

type EInvoiceEnvironment =
  | 'sandbox'
  | 'production';

type EInvoiceDocumentKind =
  | 'invoice'
  | 'credit_note';

type EInvoiceProfileRow = {
  id: string;
  company_id: string;
  name: string;
  network_key: EInvoiceNetwork;
  provider_key: string;
  environment: EInvoiceEnvironment;
  status: string;
  syntax_key: 'ubl-2.1';
  supplier_country_code: string;
  supplier_endpoint_scheme: string;
  supplier_endpoint_id: string;
  customization_id: string;
  process_id: string;
  provider_account_id: string | null;
  credential_sealed: string | null;
  credential_version: string | null;
  is_default: boolean;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

type EInvoiceParticipantRow = {
  id: string;
  company_id: string;
  customer_id: string;
  network_key: EInvoiceNetwork;
  participant_scheme: string;
  participant_id: string;
  country_code: string;
  buyer_reference: string | null;
  is_active: boolean;
};

type EInvoiceDocumentRow = {
  id: string;
  company_id: string;
  profile_id: string;
  participant_id: string;
  invoice_id: string | null;
  credit_note_id: string | null;
  document_kind: EInvoiceDocumentKind;
  network_key: EInvoiceNetwork;
  syntax_key: string;
  specification_id: string;
  process_id: string;
  source_key: string;
  source_hash: string;
  document_uuid: string;
  xml_payload: string;
  xml_sha256: string;
  validation_status: 'valid' | 'invalid';
  validation_errors: unknown;
  transmission_status: string;
  provider_message_id: string | null;
  provider_status: string | null;
  provider_response: unknown;
  attempt_count: number;
  last_attempt_at: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

type EInvoiceValidationError = {
  code: string;
  message: string;
  field?: string;
};

type DocumentLine = {
  id: string;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxName: string | null;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  lineTotal: number;
};

type DocumentSource = {
  kind: EInvoiceDocumentKind;
  sourceId: string;
  sourceKey: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  reference: string | null;
  purchaseOrderNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  taxCalculation: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  roundingAdjustment: number;
  totalAmount: number;
  originalInvoiceNumber: string | null;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  companyName: string;
  companyTaxId: string | null;
  companyAddress: string | null;
  lines: DocumentLine[];
};


export type FiscalProviderRequest = {
  documentId: string;
  documentUuid: string;
  network: EInvoiceNetwork;
  environment: EInvoiceEnvironment;
  syntax: string;
  specificationId: string;
  processId: string;
  sender: {
    scheme: string;
    id: string;
  };
  recipient: {
    scheme: string;
    id: string;
  };
  documentKind: EInvoiceDocumentKind;
  documentNumber: string;
  xml: string;
};

export type FiscalProviderResult = {
  status:
    | 'accepted'
    | 'queued'
    | 'rejected'
    | 'failed';
  httpStatus: number | null;
  providerMessageId: string | null;
  providerStatus: string | null;
  body: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type FiscalProviderAdapter = {
  key: string;
  network: EInvoiceNetwork;
  transmit:
    (
      profile:
        EInvoiceProfileRow,
      participant:
        EInvoiceParticipantRow,
      request:
        FiscalProviderRequest,
    ) =>
      Promise<FiscalProviderResult>;
};


const UNIT_CODES:
  Record<string, string> = {
    unit:
      'C62',
    units:
      'C62',
    each:
      'C62',
    ea:
      'C62',
    piece:
      'C62',
    pieces:
      'C62',
    pc:
      'C62',
    pcs:
      'C62',
    hour:
      'HUR',
    hours:
      'HUR',
    hr:
      'HUR',
    day:
      'DAY',
    days:
      'DAY',
    kg:
      'KGM',
    kilogram:
      'KGM',
    kilograms:
      'KGM',
    gram:
      'GRM',
    grams:
      'GRM',
    g:
      'GRM',
    metre:
      'MTR',
    meter:
      'MTR',
    metres:
      'MTR',
    meters:
      'MTR',
    m:
      'MTR',
    litre:
      'LTR',
    liter:
      'LTR',
    litres:
      'LTR',
    liters:
      'LTR',
    l:
      'LTR',
    box:
      'BX',
    boxes:
      'BX',
    pack:
      'PK',
    packs:
      'PK',
  };


function bool(
  value:
    unknown,
) {
  return value ===
    true ||
    value ===
      'true' ||
    value ===
      '1' ||
    value ===
      1;
}


function jsonObject(
  value:
    unknown,
):
  Record<string, unknown> {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<string, unknown>
    : {};
}


function jsonArray(
  value:
    unknown,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}


function sha256(
  value:
    string,
) {
  return createHash(
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


function countryCode(
  value:
    unknown,
  field:
    string,
) {
  const code =
    cleanText(
      value,
      2,
    ).toUpperCase();

  if (
    !/^[A-Z]{2}$/
      .test(
        code,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      field +
      ' must be a two-letter ISO country code.',
    );
  }

  return code;
}


function networkKey(
  value:
    unknown,
):
  EInvoiceNetwork {
  const key =
    cleanText(
      value,
      40,
    ).toLowerCase();

  if (
    key !==
      'peppol' &&
    key !==
      'custom_edi'
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a supported e-invoicing network.',
    );
  }

  return key;
}


function providerKey(
  value:
    unknown,
  fallback =
    'peppol_gateway',
) {
  const key =
    (
      cleanText(
        value,
        80,
      ) ||
      fallback
    )
      .toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{1,79}$/
      .test(
        key,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The e-invoicing provider key is invalid.',
    );
  }

  return key;
}


function environmentValue(
  value:
    unknown,
):
  EInvoiceEnvironment {
  const environment =
    cleanText(
      value,
      12,
    ).toLowerCase();

  if (
    environment !==
      'sandbox' &&
    environment !==
      'production'
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose sandbox or production for the e-invoicing environment.',
    );
  }

  return environment;
}


function endpointIdentifier(
  value:
    unknown,
  field:
    string,
  maxLength =
    180,
) {
  const identifier =
    cleanText(
      value,
      maxLength,
    );

  if (
    !identifier
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      field +
      ' is required.',
    );
  }

  return identifier;
}


function moneyText(
  value:
    number,
) {
  const numeric =
    Number.isFinite(
      value,
    )
      ? value
      : 0;

  return (
    Math.round(
      numeric *
      100,
    ) /
    100
  ).toFixed(
    2,
  );
}


function xmlEscape(
  value:
    unknown,
) {
  return String(
    value ??
    '',
  )
    .replaceAll(
      '&',
      '&amp;',
    )
    .replaceAll(
      '<',
      '&lt;',
    )
    .replaceAll(
      '>',
      '&gt;',
    )
    .replaceAll(
      '"',
      '&quot;',
    )
    .replaceAll(
      "'",
      '&apos;',
    );
}


function xmlNode(
  name:
    string,
  value:
    unknown,
  attributes:
    Record<string, string> = {},
) {
  const text =
    String(
      value ??
      '',
    );

  if (!text) {
    return '';
  }

  const attrs =
    Object.entries(
      attributes,
    )
      .map(
        (
          [
            key,
            item,
          ],
        ) =>
          ' ' +
          key +
          '="' +
          xmlEscape(
            item,
          ) +
          '"',
      )
      .join(
        '',
      );

  return (
    '<' +
    name +
    attrs +
    '>' +
    xmlEscape(
      text,
    ) +
    '</' +
    name +
    '>'
  );
}


function unitCode(
  unit:
    string,
) {
  const normalized =
    cleanText(
      unit,
      40,
    )
      .toLowerCase();

  if (
    /^[A-Z0-9]{2,3}$/
      .test(
        cleanText(
          unit,
          3,
        ),
      )
  ) {
    return cleanText(
      unit,
      3,
    ).toUpperCase();
  }

  return (
    UNIT_CODES[
      normalized
    ] ||
    null
  );
}


function taxCategory(
  line:
    DocumentLine,
) {
  if (
    line.taxRate >
      0
  ) {
    return 'S';
  }

  const name =
    (
      line.taxName ||
      ''
    )
      .toLowerCase();

  if (
    name.includes(
      'exempt',
    )
  ) {
    return 'E';
  }

  return 'Z';
}


function providerEnvironmentKey(
  profile:
    Pick<
      EInvoiceProfileRow,
      'provider_key' |
      'environment'
    >,
) {
  return [
    'SAMI_EINVOICE_PROVIDER',
    profile
      .provider_key
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        '_',
      ),
    profile
      .environment
      .toUpperCase(),
    'BASE_URL',
  ].join(
    '_',
  );
}


function providerBaseUrl(
  profile:
    EInvoiceProfileRow,
) {
  if (
    profile.provider_key ===
      'file_export'
  ) {
    return null;
  }

  const key =
    providerEnvironmentKey(
      profile,
    );

  const raw =
    cleanText(
      process.env[
        key
      ],
      2000,
    );

  if (!raw) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'The selected international e-invoicing gateway is not configured on the SaMi server.',
      {
        environmentVariable:
          key,
      },
    );
  }

  let parsed:
    URL;

  try {
    parsed =
      new URL(
        raw,
      );
  } catch {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'The configured international e-invoicing gateway URL is invalid.',
    );
  }

  if (
    parsed.protocol !==
      'https:' &&
    !(
      profile.environment ===
        'sandbox' &&
      parsed.protocol ===
        'http:'
    )
  ) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      profile.environment ===
        'production'
        ? 'Production e-invoicing gateways must use HTTPS.'
        : 'The configured e-invoicing gateway must use HTTP or HTTPS.',
    );
  }

  return raw.replace(
    /\/+$/,
    '',
  );
}


function providerCredential(
  profile:
    EInvoiceProfileRow,
) {
  if (
    !profile
      .credential_sealed
  ) {
    return null;
  }

  try {
    const secret =
      openIntegrationSecret<
        {
          token?:
            string;
        }
      >(
        profile
          .credential_sealed,
      );

    return cleanText(
      secret.token,
      4000,
    ) ||
      null;
  } catch {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'SaMi could not open the e-invoicing provider credential. Check the platform integration encryption key.',
    );
  }
}


function requestTimeoutMs() {
  const numeric =
    Number(
      process.env
        .SAMI_EINVOICE_REQUEST_TIMEOUT_MS ||
      20000,
    );

  return Number.isFinite(
    numeric,
  )
    ? Math.max(
        3000,
        Math.min(
          numeric,
          120000,
        ),
      )
    : 20000;
}


function providerStatus(
  body:
    Record<string, unknown>,
) {
  const candidates = [
    body.status,
    body.state,
    body.deliveryStatus,
    body.result,
  ];

  for (
    const candidate
    of candidates
  ) {
    const value =
      cleanText(
        candidate,
        120,
      )
        .toLowerCase();

    if (value) {
      return value;
    }
  }

  return '';
}


function providerMessageId(
  body:
    Record<string, unknown>,
) {
  for (
    const key
    of [
      'messageId',
      'message_id',
      'id',
      'transmissionId',
      'transmission_id',
    ]
  ) {
    const value =
      cleanText(
        body[
          key
        ],
        255,
      );

    if (value) {
      return value;
    }
  }

  return null;
}


async function transmitGateway(
  profile:
    EInvoiceProfileRow,
  participant:
    EInvoiceParticipantRow,
  request:
    FiscalProviderRequest,
):
  Promise<FiscalProviderResult> {
  const baseUrl =
    providerBaseUrl(
      profile,
    );

  if (!baseUrl) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'File-export profiles do not submit documents to a remote network.',
    );
  }

  const token =
    providerCredential(
      profile,
    );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      requestTimeoutMs(),
    );

  const payload = {
    adapterContract:
      'sami-fiscal-provider-v1',
    documentId:
      request.documentId,
    documentUuid:
      request.documentUuid,
    network:
      request.network,
    environment:
      request.environment,
    syntax:
      request.syntax,
    specificationId:
      request.specificationId,
    processId:
      request.processId,
    sender:
      request.sender,
    recipient:
      request.recipient,
    documentKind:
      request.documentKind,
    documentNumber:
      request.documentNumber,
    accountId:
      profile
        .provider_account_id,
    xml:
      request.xml,
  };

  try {
    const response =
      await fetch(
        baseUrl +
        '/documents',
        {
          method:
            'POST',
          cache:
            'no-store',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/json',
            'Idempotency-Key':
              request.documentUuid,
            ...(
              token
                ? {
                    Authorization:
                      'Bearer ' +
                      token,
                  }
                : {}
            ),
          },
          body:
            JSON.stringify(
              payload,
            ),
          signal:
            controller.signal,
        },
      );

    const raw =
      await response.text();

    if (
      raw.length >
      2_000_000
    ) {
      throw new InvoicingError(
        'EINVOICE_PROVIDER_UNAVAILABLE',
        'The e-invoicing gateway returned an unexpectedly large response.',
      );
    }

    let body:
      Record<string, unknown> =
        {};

    if (raw) {
      try {
        body =
          jsonObject(
            JSON.parse(
              raw,
            ),
          );
      } catch {
        body = {
          message:
            raw.slice(
              0,
              4000,
            ),
        };
      }
    }

    const status =
      providerStatus(
        body,
      );

    const normalized:
      FiscalProviderResult['status'] =
        [
          'accepted',
          'delivered',
          'success',
          'succeeded',
          'completed',
        ].includes(
          status,
        )
          ? 'accepted'
          : [
              'queued',
              'pending',
              'processing',
              'submitted',
            ].includes(
              status,
            )
            ? 'queued'
            : [
                'rejected',
                'declined',
                'invalid',
              ].includes(
                status,
              )
              ? 'rejected'
              : response.ok
                ? 'queued'
                : 'failed';

    return {
      status:
        normalized,
      httpStatus:
        response.status,
      providerMessageId:
        providerMessageId(
          body,
        ),
      providerStatus:
        status ||
        (
          response.ok
            ? 'submitted'
            : 'http_error'
        ),
      body,
      errorCode:
        response.ok
          ? null
          : 'HTTP_' +
            response.status,
      errorMessage:
        response.ok
          ? null
          : cleanText(
              body.message,
              2000,
            ) ||
            'The e-invoicing provider rejected the request.',
    };
  } catch (
    error
  ) {
    if (
      error instanceof
      InvoicingError
    ) {
      throw error;
    }

    const aborted =
      error instanceof Error &&
      error.name ===
        'AbortError';

    throw new InvoicingError(
      'EINVOICE_PROVIDER_UNAVAILABLE',
      aborted
        ? 'The international e-invoicing gateway request timed out.'
        : 'SaMi could not reach the international e-invoicing gateway.',
      {
        retryable:
          true,
      },
    );
  } finally {
    clearTimeout(
      timer,
    );
  }
}


const FISCAL_PROVIDER_ADAPTERS:
  Record<
    string,
    FiscalProviderAdapter
  > = {
    peppol_gateway: {
      key:
        'peppol_gateway',
      network:
        'peppol',
      transmit:
        transmitGateway,
    },
    custom_edi_gateway: {
      key:
        'custom_edi_gateway',
      network:
        'custom_edi',
      transmit:
        transmitGateway,
    },
  };


export function getFiscalProviderAdapter(
  key:
    string,
):
  FiscalProviderAdapter | null {
  return (
    FISCAL_PROVIDER_ADAPTERS[
      key
    ] ||
    null
  );
}


async function profileById(
  queryable:
    Pool |
    PoolClient,
  companyId:
    string,
  profileId:
    string,
) {
  const result =
    await queryable.query(
      `
        SELECT *
        FROM invoicing_einvoice_profiles
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        profileId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'The e-invoicing profile was not found.',
    );
  }

  return result
    .rows[0] as
      EInvoiceProfileRow;
}


async function defaultProfile(
  queryable:
    Pool |
    PoolClient,
  companyId:
    string,
) {
  const result =
    await queryable.query(
      `
        SELECT *
        FROM invoicing_einvoice_profiles
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND status <> 'disabled'
        ORDER BY
          is_default DESC,
          created_at,
          id
        LIMIT 1
      `,
      [
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'Configure an international e-invoicing profile first.',
    );
  }

  return result
    .rows[0] as
      EInvoiceProfileRow;
}


async function participantForCustomer(
  queryable:
    Pool |
    PoolClient,
  companyId:
    string,
  customerId:
    string,
  network:
    EInvoiceNetwork,
) {
  const result =
    await queryable.query(
      `
        SELECT *
        FROM invoicing_einvoice_participants
        WHERE company_id = $1
          AND customer_id = $2
          AND network_key = $3
          AND is_active = TRUE
        LIMIT 1
      `,
      [
        companyId,
        customerId,
        network,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'EINVOICE_VALIDATION_FAILED',
      'The customer does not have an active electronic invoicing participant identity for this network.',
      {
        customerId,
        network,
      },
    );
  }

  return result
    .rows[0] as
      EInvoiceParticipantRow;
}


async function loadInvoiceSource(
  client:
    PoolClient,
  companyId:
    string,
  invoiceId:
    string,
):
  Promise<DocumentSource> {
  const header =
    await client.query(
      `
        SELECT
          invoice.id,
          invoice.invoice_number,
          invoice.status,
          invoice.invoice_date,
          invoice.due_date,
          invoice.currency,
          invoice.reference,
          invoice.purchase_order_number,
          invoice.payment_terms_name_snapshot,
          invoice.notes,
          invoice.tax_calculation,
          invoice.subtotal,
          invoice.discount_total,
          invoice.tax_total,
          invoice.shipping_total,
          invoice.rounding_adjustment,
          invoice.total_amount,
          customer.id AS customer_id,
          COALESCE(
            invoice.bill_to_name,
            customer.legal_name,
            customer.name
          ) AS customer_name,
          COALESCE(
            invoice.bill_to_tax_id,
            customer.tax_id
          ) AS customer_tax_id,
          COALESCE(
            invoice.bill_to_address,
            customer.billing_address
          ) AS customer_address,
          COALESCE(
            company.legal_name,
            company.name
          ) AS company_name,
          company.tax_id AS company_tax_id,
          COALESCE(
            NULLIF(
              CONCAT_WS(
                ', ',
                company.address_line1,
                company.address_line2,
                company.city,
                company.state,
                company.postal_code,
                company.country
              ),
              ''
            ),
            company.address
          ) AS company_address
        FROM invoicing_invoices invoice
        INNER JOIN invoicing_customers customer
          ON customer.id = invoice.customer_id
         AND customer.company_id = invoice.company_id
        INNER JOIN companies company
          ON company.id = invoice.company_id
        WHERE invoice.id = $1
          AND invoice.company_id = $2
          AND invoice.deleted_at IS NULL
        LIMIT 1
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    header.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const row =
    header.rows[0];

  if (
    [
      'draft',
      'pending_approval',
      'rejected',
      'cancelled',
      'void',
    ].includes(
      String(
        row.status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Confirm the invoice before generating an international electronic invoice.',
    );
  }

  const lines =
    await client.query(
      `
        SELECT
          id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        FROM invoicing_invoice_items
        WHERE invoice_id = $1
          AND company_id = $2
        ORDER BY sort_order, id
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  return {
    kind:
      'invoice',
    sourceId:
      String(
        row.id,
      ),
    sourceKey:
      'invoice:' +
      String(
        row.id,
      ),
    number:
      String(
        row.invoice_number,
      ),
    status:
      String(
        row.status,
      ),
    issueDate:
      String(
        row.invoice_date,
      ).slice(
        0,
        10,
      ),
    dueDate:
      row.due_date
        ? String(
            row.due_date,
          ).slice(
            0,
            10,
          )
        : null,
    currency:
      String(
        row.currency,
      ).toUpperCase(),
    reference:
      row.reference
        ? String(
            row.reference,
          )
        : null,
    purchaseOrderNumber:
      row.purchase_order_number
        ? String(
            row.purchase_order_number,
          )
        : null,
    paymentTerms:
      row.payment_terms_name_snapshot
        ? String(
            row.payment_terms_name_snapshot,
          )
        : null,
    notes:
      row.notes
        ? String(
            row.notes,
          )
        : null,
    taxCalculation:
      String(
        row.tax_calculation,
      ),
    subtotal:
      money(
        row.subtotal,
      ),
    discountTotal:
      money(
        row.discount_total,
      ),
    taxTotal:
      money(
        row.tax_total,
      ),
    shippingTotal:
      money(
        row.shipping_total,
      ),
    roundingAdjustment:
      money(
        row.rounding_adjustment,
      ),
    totalAmount:
      money(
        row.total_amount,
      ),
    originalInvoiceNumber:
      null,
    customerId:
      String(
        row.customer_id,
      ),
    customerName:
      String(
        row.customer_name,
      ),
    customerTaxId:
      row.customer_tax_id
        ? String(
            row.customer_tax_id,
          )
        : null,
    customerAddress:
      row.customer_address
        ? String(
            row.customer_address,
          )
        : null,
    companyName:
      String(
        row.company_name,
      ),
    companyTaxId:
      row.company_tax_id
        ? String(
            row.company_tax_id,
          )
        : null,
    companyAddress:
      row.company_address
        ? String(
            row.company_address,
          )
        : null,
    lines:
      lines.rows.map(
        line => {
          const quantity =
            money(
              line.quantity,
            );

          const discount =
            money(
              line.discount_amount,
            );

          const taxAmount =
            money(
              line.tax_amount,
            );

          const netAmount =
            String(
              row.tax_calculation,
            ) ===
              'inclusive'
              ? Math.max(
                  money(
                    line.line_total,
                  ) -
                  taxAmount,
                  0,
                )
              : Math.max(
                  money(
                    line.subtotal,
                  ) -
                  discount,
                  0,
                );

          return {
            id:
              String(
                line.id,
              ),
            description:
              String(
                line.description,
              ),
            sku:
              line.sku_snapshot
                ? String(
                    line.sku_snapshot,
                  )
                : null,
            unit:
              String(
                line.unit ||
                'unit',
              ),
            quantity,
            unitPrice:
              money(
                line.unit_price,
              ),
            discountAmount:
              discount,
            taxName:
              line.tax_name_snapshot
                ? String(
                    line.tax_name_snapshot,
                  )
                : null,
            taxRate:
              money(
                line.tax_rate,
              ),
            taxAmount,
            netAmount,
            lineTotal:
              money(
                line.line_total,
              ),
          };
        },
      ),
  };
}


async function loadCreditNoteSource(
  client:
    PoolClient,
  companyId:
    string,
  creditNoteId:
    string,
):
  Promise<DocumentSource> {
  const header =
    await client.query(
      `
        SELECT
          credit.id,
          credit.credit_note_number,
          credit.status,
          credit.issue_date,
          credit.currency,
          credit.subtotal,
          credit.discount_total,
          credit.tax_total,
          credit.total_amount,
          credit.reason,
          credit.invoice_id,
          source.invoice_number AS source_invoice_number,
          source.reference,
          source.purchase_order_number,
          source.payment_terms_name_snapshot,
          source.tax_calculation,
          source.customer_id,
          COALESCE(
            source.bill_to_name,
            customer.legal_name,
            customer.name
          ) AS customer_name,
          COALESCE(
            source.bill_to_tax_id,
            customer.tax_id
          ) AS customer_tax_id,
          COALESCE(
            source.bill_to_address,
            customer.billing_address
          ) AS customer_address,
          COALESCE(
            company.legal_name,
            company.name
          ) AS company_name,
          company.tax_id AS company_tax_id,
          COALESCE(
            NULLIF(
              CONCAT_WS(
                ', ',
                company.address_line1,
                company.address_line2,
                company.city,
                company.state,
                company.postal_code,
                company.country
              ),
              ''
            ),
            company.address
          ) AS company_address
        FROM invoicing_credit_notes credit
        INNER JOIN invoicing_invoices source
          ON source.id = credit.invoice_id
         AND source.company_id = credit.company_id
        INNER JOIN invoicing_customers customer
          ON customer.id = credit.customer_id
         AND customer.company_id = credit.company_id
        INNER JOIN companies company
          ON company.id = credit.company_id
        WHERE credit.id = $1
          AND credit.company_id = $2
          AND credit.deleted_at IS NULL
        LIMIT 1
      `,
      [
        creditNoteId,
        companyId,
      ],
    );

  if (
    header.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'CREDIT_NOTE_NOT_FOUND',
      'Credit note was not found.',
    );
  }

  const row =
    header.rows[0];

  if (
    [
      'draft',
      'cancelled',
    ].includes(
      String(
        row.status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Issue the credit note before generating an international electronic credit note.',
    );
  }

  const lines =
    await client.query(
      `
        SELECT
          id,
          description,
          quantity,
          unit_price,
          discount_amount,
          tax_amount,
          subtotal,
          line_total,
          invoice_item_id
        FROM invoicing_credit_note_items
        WHERE credit_note_id = $1
          AND company_id = $2
        ORDER BY created_at, id
      `,
      [
        creditNoteId,
        companyId,
      ],
    );

  const sourceLineIds =
    lines.rows
      .map(
        line =>
          line.invoice_item_id
            ? String(
                line.invoice_item_id,
              )
            : null,
      )
      .filter(
        (
          value,
        ): value is
          string =>
          Boolean(
            value,
          ),
      );

  const sourceLines =
    sourceLineIds.length
      ? await client.query(
          `
            SELECT
              id,
              sku_snapshot,
              unit,
              tax_name_snapshot,
              tax_rate
            FROM invoicing_invoice_items
            WHERE company_id = $1
              AND id = ANY($2::uuid[])
          `,
          [
            companyId,
            sourceLineIds,
          ],
        )
      : {
          rows: [],
        };

  const sourceMap =
    new Map(
      sourceLines.rows.map(
        line => [
          String(
            line.id,
          ),
          line,
        ],
      ),
    );

  return {
    kind:
      'credit_note',
    sourceId:
      String(
        row.id,
      ),
    sourceKey:
      'credit_note:' +
      String(
        row.id,
      ),
    number:
      String(
        row.credit_note_number,
      ),
    status:
      String(
        row.status,
      ),
    issueDate:
      String(
        row.issue_date,
      ).slice(
        0,
        10,
      ),
    dueDate:
      null,
    currency:
      String(
        row.currency,
      ).toUpperCase(),
    reference:
      row.reference
        ? String(
            row.reference,
          )
        : null,
    purchaseOrderNumber:
      row.purchase_order_number
        ? String(
            row.purchase_order_number,
          )
        : null,
    paymentTerms:
      row.payment_terms_name_snapshot
        ? String(
            row.payment_terms_name_snapshot,
          )
        : null,
    notes:
      row.reason
        ? String(
            row.reason,
          )
        : null,
    taxCalculation:
      String(
        row.tax_calculation,
      ),
    subtotal:
      money(
        row.subtotal,
      ),
    discountTotal:
      money(
        row.discount_total,
      ),
    taxTotal:
      money(
        row.tax_total,
      ),
    shippingTotal:
      0,
    roundingAdjustment:
      0,
    totalAmount:
      money(
        row.total_amount,
      ),
    originalInvoiceNumber:
      String(
        row.source_invoice_number,
      ),
    customerId:
      String(
        row.customer_id,
      ),
    customerName:
      String(
        row.customer_name,
      ),
    customerTaxId:
      row.customer_tax_id
        ? String(
            row.customer_tax_id,
          )
        : null,
    customerAddress:
      row.customer_address
        ? String(
            row.customer_address,
          )
        : null,
    companyName:
      String(
        row.company_name,
      ),
    companyTaxId:
      row.company_tax_id
        ? String(
            row.company_tax_id,
          )
        : null,
    companyAddress:
      row.company_address
        ? String(
            row.company_address,
          )
        : null,
    lines:
      lines.rows.map(
        line => {
          const invoiceLine =
            line.invoice_item_id
              ? sourceMap.get(
                  String(
                    line.invoice_item_id,
                  ),
                )
              : null;

          const quantity =
            money(
              line.quantity,
            );

          const discount =
            money(
              line.discount_amount,
            );

          const taxAmount =
            money(
              line.tax_amount,
            );

          const netAmount =
            String(
              row.tax_calculation,
            ) ===
              'inclusive'
              ? Math.max(
                  money(
                    line.line_total,
                  ) -
                  taxAmount,
                  0,
                )
              : Math.max(
                  money(
                    line.subtotal,
                  ) -
                  discount,
                  0,
                );

          return {
            id:
              String(
                line.id,
              ),
            description:
              String(
                line.description,
              ),
            sku:
              invoiceLine
                ?.sku_snapshot
                ? String(
                    invoiceLine
                      .sku_snapshot,
                  )
                : null,
            unit:
              invoiceLine
                ?.unit
                ? String(
                    invoiceLine.unit,
                  )
                : 'unit',
            quantity,
            unitPrice:
              money(
                line.unit_price,
              ),
            discountAmount:
              discount,
            taxName:
              invoiceLine
                ?.tax_name_snapshot
                ? String(
                    invoiceLine
                      .tax_name_snapshot,
                  )
                : null,
            taxRate:
              money(
                invoiceLine
                  ?.tax_rate,
              ),
            taxAmount,
            netAmount,
            lineTotal:
              money(
                line.line_total,
              ),
          };
        },
      ),
  };
}


function validateDocument(
  source:
    DocumentSource,
  profile:
    EInvoiceProfileRow,
  participant:
    EInvoiceParticipantRow,
) {
  const errors:
    EInvoiceValidationError[] =
      [];

  const add = (
    code:
      string,
    message:
      string,
    field?:
      string,
  ) => {
    errors.push({
      code,
      message,
      ...(
        field
          ? {
              field,
            }
          : {}
      ),
    });
  };

  if (
    profile.syntax_key !==
      'ubl-2.1'
  ) {
    add(
      'SYNTAX_UNSUPPORTED',
      'Part 17 currently renders UBL 2.1 documents.',
      'syntax',
    );
  }

  if (
    profile.network_key ===
      'peppol'
  ) {
    if (
      !profile
        .customization_id
        .startsWith(
          PEPPOL_BIS_BILLING_CUSTOMIZATION_ID,
        )
    ) {
      add(
        'PEPPOL_SPECIFICATION_INVALID',
        'Peppol BIS Billing documents must use the approved Billing 3.0 specification identifier.',
        'customizationId',
      );
    }

    if (
      !profile
        .process_id
    ) {
      add(
        'PEPPOL_PROCESS_REQUIRED',
        'Peppol requires a business process identifier.',
        'processId',
      );
    }
  }

  if (
    !source
      .companyName
  ) {
    add(
      'SELLER_NAME_REQUIRED',
      'Seller name is required.',
      'seller.name',
    );
  }

  if (
    !source
      .companyAddress
  ) {
    add(
      'SELLER_ADDRESS_REQUIRED',
      'Seller postal address is required.',
      'seller.address',
    );
  }

  if (
    !profile
      .supplier_endpoint_id ||
    !profile
      .supplier_endpoint_scheme
  ) {
    add(
      'SELLER_ENDPOINT_REQUIRED',
      'Seller electronic address and scheme are required.',
      'seller.endpoint',
    );
  }

  if (
    !source
      .customerName
  ) {
    add(
      'BUYER_NAME_REQUIRED',
      'Buyer name is required.',
      'buyer.name',
    );
  }

  if (
    !source
      .customerAddress
  ) {
    add(
      'BUYER_ADDRESS_REQUIRED',
      'Buyer postal address is required.',
      'buyer.address',
    );
  }

  if (
    !participant
      .participant_id ||
    !participant
      .participant_scheme
  ) {
    add(
      'BUYER_ENDPOINT_REQUIRED',
      'Buyer electronic address and scheme are required.',
      'buyer.endpoint',
    );
  }

  if (
    source.kind ===
      'invoice' &&
    !source
      .purchaseOrderNumber &&
    !source
      .reference &&
    !participant
      .buyer_reference
  ) {
    add(
      'BUYER_REFERENCE_REQUIRED',
      'Peppol billing requires a buyer reference or purchase-order reference.',
      'buyerReference',
    );
  }

  if (
    !/^[A-Z]{3}$/
      .test(
        source.currency,
      )
  ) {
    add(
      'CURRENCY_INVALID',
      'Invoice currency must be a three-letter ISO currency code.',
      'currency',
    );
  }

  if (
    source.lines.length <
      1
  ) {
    add(
      'LINES_REQUIRED',
      'The document must contain at least one line.',
      'lines',
    );
  }

  if (
    Math.abs(
      source.shippingTotal,
    ) >
      0.0001
  ) {
    add(
      'DOCUMENT_CHARGE_MAPPING_REQUIRED',
      'Shipping charges require an explicit tax-category mapping before international e-invoice transmission.',
      'shippingTotal',
    );
  }

  for (
    const [
      index,
      line,
    ]
    of source
      .lines
      .entries()
  ) {
    if (
      !unitCode(
        line.unit,
      )
    ) {
      add(
        'UNIT_CODE_REQUIRED',
        'Map line ' +
        (
          index +
          1
        ) +
        ' to a UNECE unit code before transmission.',
        'lines.' +
        index +
        '.unit',
      );
    }

    if (
      line.quantity <=
        0
    ) {
      add(
        'QUANTITY_INVALID',
        'Line quantities must be greater than zero.',
        'lines.' +
        index +
        '.quantity',
      );
    }

    if (
      line.netAmount <
        -0.0001
    ) {
      add(
        'LINE_NET_INVALID',
        'Invoice line net amounts cannot be negative.',
        'lines.' +
        index +
        '.netAmount',
      );
    }
  }

  return errors;
}


function taxSummary(
  source:
    DocumentSource,
) {
  const summary =
    new Map<
      string,
      {
        category: string;
        rate: number;
        taxable: number;
        tax: number;
        exemptionReason: string | null;
      }
    >();

  for (
    const line
    of source.lines
  ) {
    const category =
      taxCategory(
        line,
      );

    const key =
      category +
      ':' +
      moneyText(
        line.taxRate,
      );

    const existing =
      summary.get(
        key,
      ) || {
        category,
        rate:
          line.taxRate,
        taxable:
          0,
        tax:
          0,
        exemptionReason:
          category ===
            'E'
            ? 'Exempt from VAT'
            : null,
      };

    existing.taxable +=
      line.netAmount;

    existing.tax +=
      line.taxAmount;

    summary.set(
      key,
      existing,
    );
  }

  return [
    ...summary.values(),
  ];
}


function partyXml(
  role:
    'supplier' |
    'customer',
  input: {
    name: string;
    address: string | null;
    countryCode: string;
    endpointScheme: string;
    endpointId: string;
    taxId: string | null;
  },
) {
  const partyName =
    xmlNode(
      'cbc:Name',
      input.name,
    );

  const tax =
    input.taxId
      ? (
          '<cac:PartyTaxScheme>' +
          xmlNode(
            'cbc:CompanyID',
            input.taxId,
          ) +
          '<cac:TaxScheme>' +
          xmlNode(
            'cbc:ID',
            'VAT',
          ) +
          '</cac:TaxScheme>' +
          '</cac:PartyTaxScheme>'
        )
      : '';

  return (
    '<cac:' +
    (
      role ===
        'supplier'
        ? 'AccountingSupplierParty'
        : 'AccountingCustomerParty'
    ) +
    '>' +
    '<cac:Party>' +
    xmlNode(
      'cbc:EndpointID',
      input.endpointId,
      {
        schemeID:
          input.endpointScheme,
      },
    ) +
    '<cac:PartyName>' +
    partyName +
    '</cac:PartyName>' +
    '<cac:PostalAddress>' +
    (
      input.address
        ? (
            '<cac:AddressLine>' +
            xmlNode(
              'cbc:Line',
              input.address,
            ) +
            '</cac:AddressLine>'
          )
        : ''
    ) +
    '<cac:Country>' +
    xmlNode(
      'cbc:IdentificationCode',
      input.countryCode,
    ) +
    '</cac:Country>' +
    '</cac:PostalAddress>' +
    tax +
    '<cac:PartyLegalEntity>' +
    xmlNode(
      'cbc:RegistrationName',
      input.name,
    ) +
    '</cac:PartyLegalEntity>' +
    '</cac:Party>' +
    '</cac:' +
    (
      role ===
        'supplier'
        ? 'AccountingSupplierParty'
        : 'AccountingCustomerParty'
    ) +
    '>'
  );
}


function taxXml(
  source:
    DocumentSource,
) {
  const currency =
    source.currency;

  const subtotals =
    taxSummary(
      source,
    )
      .map(
        item =>
          '<cac:TaxSubtotal>' +
          xmlNode(
            'cbc:TaxableAmount',
            moneyText(
              item.taxable,
            ),
            {
              currencyID:
                currency,
            },
          ) +
          xmlNode(
            'cbc:TaxAmount',
            moneyText(
              item.tax,
            ),
            {
              currencyID:
                currency,
            },
          ) +
          '<cac:TaxCategory>' +
          xmlNode(
            'cbc:ID',
            item.category,
          ) +
          xmlNode(
            'cbc:Percent',
            moneyText(
              item.rate,
            ),
          ) +
          (
            item.exemptionReason
              ? xmlNode(
                  'cbc:TaxExemptionReason',
                  item.exemptionReason,
                )
              : ''
          ) +
          '<cac:TaxScheme>' +
          xmlNode(
            'cbc:ID',
            'VAT',
          ) +
          '</cac:TaxScheme>' +
          '</cac:TaxCategory>' +
          '</cac:TaxSubtotal>',
      )
      .join(
        '',
      );

  return (
    '<cac:TaxTotal>' +
    xmlNode(
      'cbc:TaxAmount',
      moneyText(
        source.taxTotal,
      ),
      {
        currencyID:
          currency,
      },
    ) +
    subtotals +
    '</cac:TaxTotal>'
  );
}


function lineXml(
  source:
    DocumentSource,
  line:
    DocumentLine,
  index:
    number,
) {
  const currency =
    source.currency;

  const code =
    unitCode(
      line.unit,
    ) ||
    'C62';

  const quantity =
    Math.max(
      line.quantity,
      0,
    );

  const priceBeforeDiscount =
    quantity >
      0
      ? (
          line.netAmount +
          line.discountAmount
        ) /
        quantity
      : 0;

  const category =
    taxCategory(
      line,
    );

  const allowance =
    line.discountAmount >
      0.0001
      ? (
          '<cac:AllowanceCharge>' +
          xmlNode(
            'cbc:ChargeIndicator',
            'false',
          ) +
          xmlNode(
            'cbc:Amount',
            moneyText(
              line.discountAmount,
            ),
            {
              currencyID:
                currency,
            },
          ) +
          '</cac:AllowanceCharge>'
        )
      : '';

  const root =
    source.kind ===
      'invoice'
      ? 'InvoiceLine'
      : 'CreditNoteLine';

  const quantityNode =
    source.kind ===
      'invoice'
      ? 'InvoicedQuantity'
      : 'CreditedQuantity';

  return (
    '<cac:' +
    root +
    '>' +
    xmlNode(
      'cbc:ID',
      String(
        index +
        1,
      ),
    ) +
    xmlNode(
      'cbc:' +
      quantityNode,
      moneyText(
        quantity,
      ),
      {
        unitCode:
          code,
      },
    ) +
    xmlNode(
      'cbc:LineExtensionAmount',
      moneyText(
        line.netAmount,
      ),
      {
        currencyID:
          currency,
      },
    ) +
    allowance +
    '<cac:Item>' +
    xmlNode(
      'cbc:Description',
      line.description,
    ) +
    xmlNode(
      'cbc:Name',
      line.description,
    ) +
    (
      line.sku
        ? (
            '<cac:SellersItemIdentification>' +
            xmlNode(
              'cbc:ID',
              line.sku,
            ) +
            '</cac:SellersItemIdentification>'
          )
        : ''
    ) +
    '<cac:ClassifiedTaxCategory>' +
    xmlNode(
      'cbc:ID',
      category,
    ) +
    xmlNode(
      'cbc:Percent',
      moneyText(
        line.taxRate,
      ),
    ) +
    (
      category ===
        'E'
        ? xmlNode(
            'cbc:TaxExemptionReason',
            'Exempt from VAT',
          )
        : ''
    ) +
    '<cac:TaxScheme>' +
    xmlNode(
      'cbc:ID',
      'VAT',
    ) +
    '</cac:TaxScheme>' +
    '</cac:ClassifiedTaxCategory>' +
    '</cac:Item>' +
    '<cac:Price>' +
    xmlNode(
      'cbc:PriceAmount',
      moneyText(
        priceBeforeDiscount,
      ),
      {
        currencyID:
          currency,
      },
    ) +
    xmlNode(
      'cbc:BaseQuantity',
      '1',
      {
        unitCode:
          code,
      },
    ) +
    '</cac:Price>' +
    '</cac:' +
    root +
    '>'
  );
}


function buildUblDocument(
  source:
    DocumentSource,
  profile:
    EInvoiceProfileRow,
  participant:
    EInvoiceParticipantRow,
  documentUuid:
    string,
) {
  const invoice =
    source.kind ===
      'invoice';

  const root =
    invoice
      ? 'Invoice'
      : 'CreditNote';

  const namespace =
    'urn:oasis:names:specification:ubl:schema:xsd:' +
    root +
    '-2';

  const buyerReference =
    source.reference ||
    participant
      .buyer_reference;

  const orderReference =
    source
      .purchaseOrderNumber
      ? (
          '<cac:OrderReference>' +
          xmlNode(
            'cbc:ID',
            source
              .purchaseOrderNumber,
          ) +
          '</cac:OrderReference>'
        )
      : '';

  const billingReference =
    !invoice &&
    source
      .originalInvoiceNumber
      ? (
          '<cac:BillingReference>' +
          '<cac:InvoiceDocumentReference>' +
          xmlNode(
            'cbc:ID',
            source
              .originalInvoiceNumber,
          ) +
          '</cac:InvoiceDocumentReference>' +
          '</cac:BillingReference>'
        )
      : '';

  const lineExtension =
    source.lines.reduce(
      (
        total,
        line,
      ) =>
        total +
        line.netAmount,
      0,
    );

  const taxExclusive =
    lineExtension +
    source.shippingTotal;

  const taxInclusive =
    taxExclusive +
    source.taxTotal;

  const legalTotals =
    '<cac:LegalMonetaryTotal>' +
    xmlNode(
      'cbc:LineExtensionAmount',
      moneyText(
        lineExtension,
      ),
      {
        currencyID:
          source.currency,
      },
    ) +
    (
      source.shippingTotal >
        0.0001
        ? xmlNode(
            'cbc:ChargeTotalAmount',
            moneyText(
              source.shippingTotal,
            ),
            {
              currencyID:
                source.currency,
            },
          )
        : ''
    ) +
    xmlNode(
      'cbc:TaxExclusiveAmount',
      moneyText(
        taxExclusive,
      ),
      {
        currencyID:
          source.currency,
      },
    ) +
    xmlNode(
      'cbc:TaxInclusiveAmount',
      moneyText(
        taxInclusive,
      ),
      {
        currencyID:
          source.currency,
      },
    ) +
    (
      Math.abs(
        source.roundingAdjustment,
      ) >
        0.0001
        ? xmlNode(
            'cbc:PayableRoundingAmount',
            moneyText(
              source.roundingAdjustment,
            ),
            {
              currencyID:
                source.currency,
            },
          )
        : ''
    ) +
    xmlNode(
      'cbc:PayableAmount',
      moneyText(
        source.totalAmount,
      ),
      {
        currencyID:
          source.currency,
      },
    ) +
    '</cac:LegalMonetaryTotal>';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<' +
    root +
    ' xmlns="' +
    namespace +
    '" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">' +
    xmlNode(
      'cbc:UBLVersionID',
      '2.1',
    ) +
    xmlNode(
      'cbc:CustomizationID',
      profile
        .customization_id,
    ) +
    xmlNode(
      'cbc:ProfileID',
      profile
        .process_id,
    ) +
    xmlNode(
      'cbc:ID',
      source.number,
    ) +
    xmlNode(
      'cbc:UUID',
      documentUuid,
    ) +
    xmlNode(
      'cbc:IssueDate',
      source.issueDate,
    ) +
    (
      invoice &&
      source.dueDate
        ? xmlNode(
            'cbc:DueDate',
            source.dueDate,
          )
        : ''
    ) +
    xmlNode(
      invoice
        ? 'cbc:InvoiceTypeCode'
        : 'cbc:CreditNoteTypeCode',
      invoice
        ? '380'
        : '381',
    ) +
    (
      source.notes
        ? xmlNode(
            'cbc:Note',
            source.notes,
          )
        : ''
    ) +
    xmlNode(
      'cbc:DocumentCurrencyCode',
      source.currency,
    ) +
    (
      buyerReference
        ? xmlNode(
            'cbc:BuyerReference',
            buyerReference,
          )
        : ''
    ) +
    orderReference +
    billingReference +
    partyXml(
      'supplier',
      {
        name:
          source.companyName,
        address:
          source.companyAddress,
        countryCode:
          profile
            .supplier_country_code,
        endpointScheme:
          profile
            .supplier_endpoint_scheme,
        endpointId:
          profile
            .supplier_endpoint_id,
        taxId:
          source.companyTaxId,
      },
    ) +
    partyXml(
      'customer',
      {
        name:
          source.customerName,
        address:
          source.customerAddress,
        countryCode:
          participant
            .country_code,
        endpointScheme:
          participant
            .participant_scheme,
        endpointId:
          participant
            .participant_id,
        taxId:
          source.customerTaxId,
      },
    ) +
    (
      invoice &&
      source.paymentTerms
        ? (
            '<cac:PaymentTerms>' +
            xmlNode(
              'cbc:Note',
              source.paymentTerms,
            ) +
            '</cac:PaymentTerms>'
          )
        : ''
    ) +
    taxXml(
      source,
    ) +
    legalTotals +
    source.lines
      .map(
        (
          line,
          index,
        ) =>
          lineXml(
            source,
            line,
            index,
          ),
      )
      .join(
        '',
      ) +
    '</' +
    root +
    '>'
  );
}


function documentRecord(
  row:
    EInvoiceDocumentRow,
) {
  return {
    id:
      String(
        row.id,
      ),
    profileId:
      String(
        row.profile_id,
      ),
    participantId:
      String(
        row.participant_id,
      ),
    invoiceId:
      row.invoice_id
        ? String(
            row.invoice_id,
          )
        : null,
    creditNoteId:
      row.credit_note_id
        ? String(
            row.credit_note_id,
          )
        : null,
    documentKind:
      row.document_kind,
    network:
      row.network_key,
    syntax:
      row.syntax_key,
    specificationId:
      row.specification_id,
    processId:
      row.process_id,
    documentUuid:
      String(
        row.document_uuid,
      ),
    xmlSha256:
      row.xml_sha256,
    validationStatus:
      row.validation_status,
    validationErrors:
      jsonArray(
        row.validation_errors,
      ),
    transmissionStatus:
      row.transmission_status,
    providerMessageId:
      row.provider_message_id,
    providerStatus:
      row.provider_status,
    attemptCount:
      Number(
        row.attempt_count ||
        0,
      ),
    lastAttemptAt:
      row.last_attempt_at,
    submittedAt:
      row.submitted_at,
    acceptedAt:
      row.accepted_at,
    rejectedAt:
      row.rejected_at,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}


export async function saveEInvoiceProfile(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const id =
    optionalUuid(
      input.id,
    );

  const network =
    networkKey(
      input.networkKey ||
      'peppol',
    );

  const provider =
    providerKey(
      input.providerKey,
      network ===
        'peppol'
        ? 'peppol_gateway'
        : 'custom_edi_gateway',
    );

  if (
    provider ===
      'peppol_gateway' &&
    network !==
      'peppol'
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The Peppol gateway adapter can only be used with the Peppol network.',
    );
  }

  if (
    provider ===
      'custom_edi_gateway' &&
    network !==
      'custom_edi'
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The custom EDI gateway adapter can only be used with the custom EDI network.',
    );
  }

  const environment =
    environmentValue(
      input.environment ||
      'sandbox',
    );

  const name =
    endpointIdentifier(
      input.name,
      'Profile name',
      140,
    );

  const supplierCountry =
    countryCode(
      input.supplierCountryCode,
      'Supplier country',
    );

  const supplierScheme =
    endpointIdentifier(
      input.supplierEndpointScheme,
      'Supplier endpoint scheme',
      32,
    );

  const supplierId =
    endpointIdentifier(
      input.supplierEndpointId,
      'Supplier endpoint ID',
      160,
    );

  const customizationId =
    endpointIdentifier(
      input.customizationId ||
      (
        network ===
          'peppol'
          ? PEPPOL_BIS_BILLING_CUSTOMIZATION_ID
          : 'urn:sami:custom-edi:billing:1'
      ),
      'Specification identifier',
      320,
    );

  const processId =
    endpointIdentifier(
      input.processId ||
      (
        network ===
          'peppol'
          ? PEPPOL_BIS_BILLING_PROCESS_ID
          : 'urn:sami:custom-edi:billing'
      ),
      'Business process identifier',
      320,
    );

  const status =
    cleanText(
      input.status,
      20,
    ) ||
    'configured';

  if (
    ![
      'disabled',
      'configured',
      'active',
    ].includes(
      status,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose configured, active or disabled for the e-invoicing profile.',
    );
  }

  const isDefault =
    bool(
      input.isDefault,
    );

  const credential =
    cleanText(
      input.credential,
      4000,
    );

  if (
    credential &&
    !isIntegrationEncryptionConfigured()
  ) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'Configure SaMi integration encryption before storing an e-invoicing provider credential.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      isDefault
    ) {
      await client.query(
        `
          UPDATE invoicing_einvoice_profiles
          SET
            is_default = FALSE,
            updated_at = NOW(),
            updated_by = $2
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND is_default = TRUE
            AND (
              $3::uuid IS NULL
              OR id <> $3::uuid
            )
        `,
        [
          context.companyId,
          context.userId,
          id,
        ],
      );
    }

    let previous:
      EInvoiceProfileRow |
      null =
        null;

    if (id) {
      const existing =
        await client.query(
          `
            SELECT *
            FROM invoicing_einvoice_profiles
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            FOR UPDATE
          `,
          [
            id,
            context.companyId,
          ],
        );

      if (
        existing.rows.length !==
          1
      ) {
        throw new InvoicingError(
          'EINVOICE_NOT_CONFIGURED',
          'The e-invoicing profile was not found.',
        );
      }

      previous =
        existing
          .rows[0] as
            EInvoiceProfileRow;
    }

    const identityChanged =
      Boolean(
        previous &&
        (
          previous.network_key !==
            network ||
          previous.provider_key !==
            provider ||
          previous.environment !==
            environment ||
          previous.supplier_endpoint_scheme !==
            supplierScheme ||
          previous.supplier_endpoint_id !==
            supplierId
        ),
      );

    const sealed =
      credential
        ? sealIntegrationSecret({
            token:
              credential,
          })
        : identityChanged
          ? null
          : previous
            ?.credential_sealed ||
            null;

    const credentialVersion =
      sealed
        ? 'v1'
        : null;

    const result =
      id
        ? await client.query(
            `
              UPDATE invoicing_einvoice_profiles
              SET
                name = $3,
                network_key = $4,
                provider_key = $5,
                environment = $6,
                status = $7,
                syntax_key = 'ubl-2.1',
                supplier_country_code = $8,
                supplier_endpoint_scheme = $9,
                supplier_endpoint_id = $10,
                customization_id = $11,
                process_id = $12,
                provider_account_id = $13,
                credential_sealed = $14,
                credential_version = $15,
                is_default = $16,
                last_error_at =
                  CASE
                    WHEN $17::boolean
                    THEN NULL
                    ELSE last_error_at
                  END,
                last_error_code =
                  CASE
                    WHEN $17::boolean
                    THEN NULL
                    ELSE last_error_code
                  END,
                last_error_message =
                  CASE
                    WHEN $17::boolean
                    THEN NULL
                    ELSE last_error_message
                  END,
                updated_by = $2,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $18
                AND deleted_at IS NULL
              RETURNING *
            `,
            [
              id,
              context.userId,
              name,
              network,
              provider,
              environment,
              identityChanged &&
              status ===
                'active'
                ? 'configured'
                : status,
              supplierCountry,
              supplierScheme,
              supplierId,
              customizationId,
              processId,
              cleanText(
                input.providerAccountId,
                180,
              ) ||
              null,
              sealed,
              credentialVersion,
              isDefault,
              identityChanged,
              context.companyId,
            ],
          )
        : await client.query(
            `
              INSERT INTO invoicing_einvoice_profiles (
                company_id,
                name,
                network_key,
                provider_key,
                environment,
                status,
                syntax_key,
                supplier_country_code,
                supplier_endpoint_scheme,
                supplier_endpoint_id,
                customization_id,
                process_id,
                provider_account_id,
                credential_sealed,
                credential_version,
                is_default,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,
                'ubl-2.1',
                $7,$8,$9,$10,$11,$12,
                $13,$14,$15,$16,$16
              )
              RETURNING *
            `,
            [
              context.companyId,
              name,
              network,
              provider,
              environment,
              status,
              supplierCountry,
              supplierScheme,
              supplierId,
              customizationId,
              processId,
              cleanText(
                input.providerAccountId,
                180,
              ) ||
              null,
              sealed,
              credentialVersion,
              isDefault,
              context.userId,
            ],
          );

    await client.query(
      'COMMIT',
    );

    const row =
      result
        .rows[0] as
          EInvoiceProfileRow;

    return {
      id:
        row.id,
      name:
        row.name,
      network:
        row.network_key,
      providerKey:
        row.provider_key,
      environment:
        row.environment,
      status:
        row.status,
      supplierCountryCode:
        row.supplier_country_code,
      supplierEndpointScheme:
        row.supplier_endpoint_scheme,
      supplierEndpointId:
        row.supplier_endpoint_id,
      customizationId:
        row.customization_id,
      processId:
        row.process_id,
      providerAccountId:
        row.provider_account_id,
      credentialConfigured:
        Boolean(
          row
            .credential_sealed,
        ),
      isDefault:
        row.is_default,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function saveEInvoiceParticipant(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const customerId =
    requireUuid(
      input.customerId,
      'Customer',
    );

  const network =
    networkKey(
      input.networkKey ||
      'peppol',
    );

  const scheme =
    endpointIdentifier(
      input.participantScheme,
      'Participant scheme',
      32,
    );

  const participantId =
    endpointIdentifier(
      input.participantId,
      'Participant ID',
      180,
    );

  const country =
    countryCode(
      input.countryCode,
      'Buyer country',
    );

  const customer =
    await context.pool.query(
      `
        SELECT 1
        FROM invoicing_customers
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        customerId,
        context.companyId,
      ],
    );

  if (
    customer.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'CUSTOMER_NOT_FOUND',
      'Customer was not found.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_einvoice_participants (
          company_id,
          customer_id,
          network_key,
          participant_scheme,
          participant_id,
          country_code,
          buyer_reference,
          is_active,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
        )
        ON CONFLICT (
          company_id,
          customer_id,
          network_key
        )
        DO UPDATE SET
          participant_scheme =
            EXCLUDED.participant_scheme,
          participant_id =
            EXCLUDED.participant_id,
          country_code =
            EXCLUDED.country_code,
          buyer_reference =
            EXCLUDED.buyer_reference,
          is_active =
            EXCLUDED.is_active,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING *
      `,
      [
        context.companyId,
        customerId,
        network,
        scheme,
        participantId,
        country,
        cleanText(
          input.buyerReference,
          180,
        ) ||
        null,
        input.isActive ===
          undefined
          ? true
          : bool(
              input.isActive,
            ),
        context.userId,
      ],
    );

  const row =
    result
      .rows[0] as
        EInvoiceParticipantRow;

  return {
    id:
      row.id,
    customerId:
      row.customer_id,
    network:
      row.network_key,
    participantScheme:
      row.participant_scheme,
    participantId:
      row.participant_id,
    countryCode:
      row.country_code,
    buyerReference:
      row.buyer_reference,
    isActive:
      row.is_active,
  };
}


export async function generateEInvoiceDocument(
  input:
    Record<string, unknown>,
) {
  const kind =
    cleanText(
      input.documentKind,
      20,
    ) ===
      'credit_note'
      ? 'credit_note'
      : 'invoice';

  const requiredPermission =
    kind ===
      'credit_note'
      ? INVOICING_PERMISSIONS
          .CREDIT_NOTE_MANAGE
      : INVOICING_PERMISSIONS
          .INVOICE_SEND;

  const context =
    await requireInvoicingContext(
      requiredPermission,
    );

  const sourceId =
    requireUuid(
      input.sourceId,
      kind ===
        'credit_note'
        ? 'Credit note'
        : 'Invoice',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const profile =
      optionalUuid(
        input.profileId,
      )
        ? await profileById(
            client,
            context.companyId,
            requireUuid(
              input.profileId,
              'E-invoicing profile',
            ),
          )
        : await defaultProfile(
            client,
            context.companyId,
          );

    const source =
      kind ===
        'credit_note'
        ? await loadCreditNoteSource(
            client,
            context.companyId,
            sourceId,
          )
        : await loadInvoiceSource(
            client,
            context.companyId,
            sourceId,
          );

    const participant =
      await participantForCustomer(
        client,
        context.companyId,
        source.customerId,
        profile.network_key,
      );

    const documentUuid =
      randomUUID();

    const validationErrors =
      validateDocument(
        source,
        profile,
        participant,
      );

    const xml =
      buildUblDocument(
        source,
        profile,
        participant,
        documentUuid,
      );

    const sourceHash =
      sha256(
        JSON.stringify({
          source,
          profile: {
            id:
              profile.id,
            network:
              profile.network_key,
            provider:
              profile.provider_key,
            environment:
              profile.environment,
            supplierCountry:
              profile.supplier_country_code,
            supplierEndpointScheme:
              profile.supplier_endpoint_scheme,
            supplierEndpointId:
              profile.supplier_endpoint_id,
            customizationId:
              profile.customization_id,
            processId:
              profile.process_id,
          },
          participant: {
            id:
              participant.id,
            scheme:
              participant.participant_scheme,
            participantId:
              participant.participant_id,
            country:
              participant.country_code,
            buyerReference:
              participant.buyer_reference,
          },
        }),
      );

    const existing =
      await client.query(
        `
          SELECT *
          FROM invoicing_einvoice_documents
          WHERE company_id = $1
            AND profile_id = $2
            AND source_key = $3
            AND source_hash = $4
          LIMIT 1
        `,
        [
          context.companyId,
          profile.id,
          source.sourceKey,
          sourceHash,
        ],
      );

    if (
      existing.rows.length ===
        1
    ) {
      await client.query(
        'COMMIT',
      );

      return documentRecord(
        existing
          .rows[0] as
            EInvoiceDocumentRow,
      );
    }

    const valid =
      validationErrors.length ===
        0;

    const inserted =
      await client.query(
        `
          INSERT INTO invoicing_einvoice_documents (
            company_id,
            profile_id,
            participant_id,
            invoice_id,
            credit_note_id,
            document_kind,
            network_key,
            syntax_key,
            specification_id,
            process_id,
            source_key,
            source_hash,
            document_uuid,
            xml_payload,
            xml_sha256,
            validation_status,
            validation_errors,
            transmission_status,
            generated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,'ubl-2.1',
            $8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18
          )
          RETURNING *
        `,
        [
          context.companyId,
          profile.id,
          participant.id,
          kind ===
            'invoice'
            ? sourceId
            : null,
          kind ===
            'credit_note'
            ? sourceId
            : null,
          kind,
          profile.network_key,
          profile.customization_id,
          profile.process_id,
          source.sourceKey,
          sourceHash,
          documentUuid,
          xml,
          sha256(
            xml,
          ),
          valid
            ? 'valid'
            : 'invalid',
          JSON.stringify(
            validationErrors,
          ),
          valid
            ? 'ready'
            : 'draft',
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    return documentRecord(
      inserted
        .rows[0] as
          EInvoiceDocumentRow,
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}


export async function submitEInvoiceDocument(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const documentId =
    requireUuid(
      input.documentId,
      'Electronic invoice document',
    );

  const client =
    await context.pool.connect();

  let document:
    EInvoiceDocumentRow;

  let profile:
    EInvoiceProfileRow;

  let participant:
    EInvoiceParticipantRow;

  let attemptNo =
    0;

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT *
          FROM invoicing_einvoice_documents
          WHERE id = $1
            AND company_id = $2
          FOR UPDATE
        `,
        [
          documentId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'EINVOICE_VALIDATION_FAILED',
        'The electronic invoice document was not found.',
      );
    }

    document =
      result
        .rows[0] as
          EInvoiceDocumentRow;

    if (
      document
        .validation_status !==
        'valid'
    ) {
      throw new InvoicingError(
        'EINVOICE_VALIDATION_FAILED',
        'Resolve the electronic invoice validation errors before transmission.',
        {
          validationErrors:
            jsonArray(
              document
                .validation_errors,
            ),
        },
      );
    }

    if (
      document
        .transmission_status ===
        'accepted'
    ) {
      await client.query(
        'COMMIT',
      );

      return documentRecord(
        document,
      );
    }

    profile =
      await profileById(
        client,
        context.companyId,
        document.profile_id,
      );

    if (
      profile.status !==
        'active'
    ) {
      throw new InvoicingError(
        'EINVOICE_NOT_CONFIGURED',
        'Activate the e-invoicing profile before transmission.',
      );
    }

    participant =
      await participantForCustomer(
        client,
        context.companyId,
        (
          await client.query(
            document.document_kind ===
              'invoice'
              ? `
                  SELECT customer_id
                  FROM invoicing_invoices
                  WHERE id = $1
                    AND company_id = $2
                  LIMIT 1
                `
              : `
                  SELECT customer_id
                  FROM invoicing_credit_notes
                  WHERE id = $1
                    AND company_id = $2
                  LIMIT 1
                `,
            [
              document.document_kind ===
                'invoice'
                ? document.invoice_id
                : document.credit_note_id,
              context.companyId,
            ],
          )
        ).rows[0]
          ?.customer_id,
        profile.network_key,
      );

    if (
      profile.provider_key ===
        'file_export'
    ) {
      throw new InvoicingError(
        'EINVOICE_NOT_CONFIGURED',
        'This profile is configured for XML export only. Choose a gateway provider to transmit electronically.',
      );
    }

    const adapter =
      getFiscalProviderAdapter(
        profile.provider_key,
      );

    if (
      !adapter ||
      adapter.network !==
        profile.network_key
    ) {
      throw new InvoicingError(
        'EINVOICE_NOT_CONFIGURED',
        'The selected fiscal provider adapter is not registered for this network.',
      );
    }

    attemptNo =
      Number(
        document.attempt_count ||
        0,
      ) +
      1;

    await client.query(
      `
        INSERT INTO invoicing_einvoice_attempts (
          company_id,
          document_id,
          attempt_no,
          adapter_key,
          request_payload
        )
        VALUES (
          $1,$2,$3,$4,
          jsonb_build_object(
            'documentUuid',
            $5::text,
            'network',
            $6::text,
            'environment',
            $7::text,
            'syntax',
            $8::text
          )
        )
      `,
      [
        context.companyId,
        document.id,
        attemptNo,
        adapter.key,
        document.document_uuid,
        document.network_key,
        profile.environment,
        document.syntax_key,
      ],
    );

    await client.query(
      `
        UPDATE invoicing_einvoice_documents
        SET
          attempt_count = $3,
          last_attempt_at = NOW(),
          transmission_status = 'queued',
          submitted_by = $4,
          submitted_at = COALESCE(submitted_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        document.id,
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

  client.release();

  const adapter =
    getFiscalProviderAdapter(
      profile!
        .provider_key,
    );

  if (!adapter) {
    throw new InvoicingError(
      'EINVOICE_NOT_CONFIGURED',
      'The fiscal provider adapter is not registered.',
    );
  }

  let providerResult:
    FiscalProviderResult;

  try {
    providerResult =
      await adapter.transmit(
        profile!,
        participant!,
        {
          documentId:
            document!.id,
          documentUuid:
            document!
              .document_uuid,
          network:
            document!
              .network_key,
          environment:
            profile!
              .environment,
          syntax:
            document!
              .syntax_key,
          specificationId:
            document!
              .specification_id,
          processId:
            document!
              .process_id,
          sender: {
            scheme:
              profile!
                .supplier_endpoint_scheme,
            id:
              profile!
                .supplier_endpoint_id,
          },
          recipient: {
            scheme:
              participant!
                .participant_scheme,
            id:
              participant!
                .participant_id,
          },
          documentKind:
            document!
              .document_kind,
          documentNumber:
            document!
              .source_key,
          xml:
            document!
              .xml_payload,
        },
      );
  } catch (
    error
  ) {
    const message =
      error instanceof
        Error
        ? error.message
        : 'The e-invoicing provider request failed.';

    await context.pool.query(
      `
        UPDATE invoicing_einvoice_attempts
        SET
          completed_at = NOW(),
          error_code = $4,
          error_message = $5
        WHERE company_id = $1
          AND document_id = $2
          AND attempt_no = $3
      `,
      [
        context.companyId,
        document!.id,
        attemptNo,
        error instanceof
          InvoicingError
          ? error.code
          : 'EINVOICE_PROVIDER_UNAVAILABLE',
        message,
      ],
    );

    await context.pool.query(
      `
        UPDATE invoicing_einvoice_documents
        SET
          transmission_status = 'failed',
          provider_status = 'transport_error',
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        document!.id,
        context.companyId,
      ],
    );

    throw error;
  }

  const nextStatus =
    providerResult.status;

  await context.pool.query(
    `
      UPDATE invoicing_einvoice_attempts
      SET
        completed_at = NOW(),
        http_status = $4,
        provider_status = $5,
        response_payload = $6::jsonb,
        error_code = $7,
        error_message = $8
      WHERE company_id = $1
        AND document_id = $2
        AND attempt_no = $3
    `,
    [
      context.companyId,
      document!.id,
      attemptNo,
      providerResult
        .httpStatus,
      providerResult
        .providerStatus,
      JSON.stringify(
        providerResult.body,
      ),
      providerResult
        .errorCode ||
      null,
      providerResult
        .errorMessage ||
      null,
    ],
  );

  const updated =
    await context.pool.query(
      `
        UPDATE invoicing_einvoice_documents
        SET
          transmission_status = $3,
          provider_message_id = $4,
          provider_status = $5,
          provider_response = $6::jsonb,
          accepted_at =
            CASE
              WHEN $3 = 'accepted'
              THEN NOW()
              ELSE accepted_at
            END,
          rejected_at =
            CASE
              WHEN $3 = 'rejected'
              THEN NOW()
              ELSE rejected_at
            END,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
        RETURNING *
      `,
      [
        document!.id,
        context.companyId,
        nextStatus,
        providerResult
          .providerMessageId,
        providerResult
          .providerStatus,
        JSON.stringify(
          providerResult.body,
        ),
      ],
    );

  if (
    nextStatus ===
      'accepted'
  ) {
    await context.pool.query(
      `
        UPDATE invoicing_einvoice_profiles
        SET
          last_success_at = NOW(),
          last_error_at = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        profile!.id,
        context.companyId,
      ],
    );
  } else if (
    nextStatus ===
      'failed' ||
    nextStatus ===
      'rejected'
  ) {
    await context.pool.query(
      `
        UPDATE invoicing_einvoice_profiles
        SET
          last_error_at = NOW(),
          last_error_code = $3,
          last_error_message = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        profile!.id,
        context.companyId,
        providerResult
          .errorCode ||
        providerResult
          .providerStatus ||
        nextStatus,
        providerResult
          .errorMessage ||
        'Provider status: ' +
        (
          providerResult
            .providerStatus ||
          nextStatus
        ),
      ],
    );
  }

  return documentRecord(
    updated
      .rows[0] as
        EInvoiceDocumentRow,
  );
}


export async function markEInvoiceDocumentExported(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const documentId =
    requireUuid(
      input.documentId,
      'Electronic invoice document',
    );

  const result =
    await context.pool.query(
      `
        UPDATE invoicing_einvoice_documents
        SET
          transmission_status =
            CASE
              WHEN transmission_status IN ('draft','ready')
              THEN 'exported'
              ELSE transmission_status
            END,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
        RETURNING *
      `,
      [
        documentId,
        context.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'EINVOICE_VALIDATION_FAILED',
      'The electronic invoice document was not found.',
    );
  }

  return documentRecord(
    result
      .rows[0] as
        EInvoiceDocumentRow,
  );
}


export async function getEInvoiceDocumentXml(
  documentId:
    string,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const id =
    requireUuid(
      documentId,
      'Electronic invoice document',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          id,
          document_kind,
          source_key,
          xml_payload,
          xml_sha256,
          validation_status,
          transmission_status
        FROM invoicing_einvoice_documents
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [
        id,
        context.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'EINVOICE_VALIDATION_FAILED',
      'The electronic invoice document was not found.',
    );
  }

  const row =
    result.rows[0];

  return {
    id:
      String(
        row.id,
      ),
    filename:
      String(
        row.source_key,
      )
        .replace(
          /[^a-zA-Z0-9._-]+/g,
          '-',
        ) +
      '.xml',
    documentKind:
      String(
        row.document_kind,
      ),
    xml:
      String(
        row.xml_payload,
      ),
    xmlSha256:
      String(
        row.xml_sha256,
      ),
    validationStatus:
      String(
        row.validation_status,
      ),
    transmissionStatus:
      String(
        row.transmission_status,
      ),
  };
}


export async function getEInvoiceWorkspaceData() {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const canConfigure =
    hasInvoicingPermission(
      context
        .permissions
        .isOwner,
      context
        .permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const canManageParticipants =
    hasInvoicingPermission(
      context
        .permissions
        .isOwner,
      context
        .permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .CUSTOMER_MANAGE,
    );

  const canSubmit =
    hasInvoicingPermission(
      context
        .permissions
        .isOwner,
      context
        .permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const [
    profiles,
    participants,
    documents,
    invoices,
    creditNotes,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT *
          FROM invoicing_einvoice_profiles
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            is_default DESC,
            name,
            id
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            participant.*,
            customer.name AS customer_name
          FROM invoicing_einvoice_participants participant
          INNER JOIN invoicing_customers customer
            ON customer.id = participant.customer_id
           AND customer.company_id = participant.company_id
          WHERE participant.company_id = $1
          ORDER BY
            customer.name,
            participant.network_key
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            document.*,
            profile.name AS profile_name,
            profile.provider_key,
            customer.name AS customer_name,
            COALESCE(
              invoice.invoice_number,
              credit.credit_note_number
            ) AS document_number
          FROM invoicing_einvoice_documents document
          INNER JOIN invoicing_einvoice_profiles profile
            ON profile.id = document.profile_id
           AND profile.company_id = document.company_id
          LEFT JOIN invoicing_invoices invoice
            ON invoice.id = document.invoice_id
           AND invoice.company_id = document.company_id
          LEFT JOIN invoicing_credit_notes credit
            ON credit.id = document.credit_note_id
           AND credit.company_id = document.company_id
          LEFT JOIN invoicing_customers customer
            ON customer.id = COALESCE(
              invoice.customer_id,
              credit.customer_id
            )
           AND customer.company_id = document.company_id
          WHERE document.company_id = $1
          ORDER BY
            document.created_at DESC,
            document.id DESC
          LIMIT 100
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            invoice.id,
            invoice.invoice_number,
            invoice.invoice_date,
            invoice.status,
            invoice.currency,
            invoice.total_amount,
            invoice.reference,
            invoice.purchase_order_number,
            customer.id AS customer_id,
            customer.name AS customer_name
          FROM invoicing_invoices invoice
          INNER JOIN invoicing_customers customer
            ON customer.id = invoice.customer_id
           AND customer.company_id = invoice.company_id
          WHERE invoice.company_id = $1
            AND invoice.deleted_at IS NULL
            AND invoice.status NOT IN (
              'draft',
              'pending_approval',
              'rejected',
              'cancelled',
              'void'
            )
          ORDER BY
            invoice.invoice_date DESC,
            invoice.created_at DESC
          LIMIT 100
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            credit.id,
            credit.credit_note_number,
            credit.issue_date,
            credit.status,
            credit.currency,
            credit.total_amount,
            credit.customer_id,
            customer.name AS customer_name,
            invoice.invoice_number AS source_invoice_number
          FROM invoicing_credit_notes credit
          INNER JOIN invoicing_customers customer
            ON customer.id = credit.customer_id
           AND customer.company_id = credit.company_id
          INNER JOIN invoicing_invoices invoice
            ON invoice.id = credit.invoice_id
           AND invoice.company_id = credit.company_id
          WHERE credit.company_id = $1
            AND credit.deleted_at IS NULL
            AND credit.status <> 'cancelled'
          ORDER BY
            credit.issue_date DESC,
            credit.created_at DESC
          LIMIT 100
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  return {
    company: {
      id:
        context.companyId,
      name:
        context
          .company
          .currentCompanyName,
    },
    capabilities: {
      canConfigure,
      canManageParticipants,
      canSubmit,
    },
    standards: {
      syntax:
        'UBL 2.1',
      peppolSpecification:
        PEPPOL_BIS_BILLING_CUSTOMIZATION_ID,
      peppolProcess:
        PEPPOL_BIS_BILLING_PROCESS_ID,
      architecture:
        'Invoice → FiscalDocument → FiscalProviderAdapter',
    },
    profiles:
      profiles.rows.map(
        row => {
          const profile =
            row as
              EInvoiceProfileRow;

          let endpointConfigured =
            profile.provider_key ===
              'file_export';

          if (
            !endpointConfigured
          ) {
            try {
              endpointConfigured =
                Boolean(
                  providerBaseUrl(
                    profile,
                  ),
                );
            } catch {
              endpointConfigured =
                false;
            }
          }

          return {
            id:
              profile.id,
            name:
              profile.name,
            network:
              profile.network_key,
            providerKey:
              profile.provider_key,
            environment:
              profile.environment,
            status:
              profile.status,
            syntax:
              profile.syntax_key,
            supplierCountryCode:
              profile.supplier_country_code,
            supplierEndpointScheme:
              profile.supplier_endpoint_scheme,
            supplierEndpointId:
              profile.supplier_endpoint_id,
            customizationId:
              profile.customization_id,
            processId:
              profile.process_id,
            providerAccountId:
              profile.provider_account_id,
            credentialConfigured:
              Boolean(
                profile
                  .credential_sealed,
              ),
            endpointConfigured,
            isDefault:
              profile.is_default,
            lastSuccessAt:
              profile.last_success_at,
            lastErrorAt:
              profile.last_error_at,
            lastErrorCode:
              profile.last_error_code,
            lastErrorMessage:
              profile.last_error_message,
          };
        },
      ),
    participants:
      participants.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          customerId:
            String(
              row.customer_id,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          network:
            String(
              row.network_key,
            ),
          participantScheme:
            String(
              row.participant_scheme,
            ),
          participantId:
            String(
              row.participant_id,
            ),
          countryCode:
            String(
              row.country_code,
            ),
          buyerReference:
            row.buyer_reference
              ? String(
                  row.buyer_reference,
                )
              : null,
          isActive:
            row.is_active ===
              true,
        }),
      ),
    documents:
      documents.rows.map(
        row => ({
          ...documentRecord(
            row as
              EInvoiceDocumentRow,
          ),
          profileName:
            String(
              row.profile_name,
            ),
          providerKey:
            String(
              row.provider_key,
            ),
          customerName:
            row.customer_name
              ? String(
                  row.customer_name,
                )
              : '',
          documentNumber:
            row.document_number
              ? String(
                  row.document_number,
                )
              : '',
        }),
      ),
    invoices:
      invoices.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          invoiceNumber:
            String(
              row.invoice_number,
            ),
          invoiceDate:
            String(
              row.invoice_date,
            ).slice(
              0,
              10,
            ),
          status:
            String(
              row.status,
            ),
          currency:
            String(
              row.currency,
            ),
          totalAmount:
            money(
              row.total_amount,
            ),
          customerId:
            String(
              row.customer_id,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          buyerReference:
            row.reference
              ? String(
                  row.reference,
                )
              : null,
          purchaseOrderNumber:
            row.purchase_order_number
              ? String(
                  row.purchase_order_number,
                )
              : null,
        }),
      ),
    creditNotes:
      creditNotes.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          creditNoteNumber:
            String(
              row.credit_note_number,
            ),
          issueDate:
            String(
              row.issue_date,
            ).slice(
              0,
              10,
            ),
          status:
            String(
              row.status,
            ),
          currency:
            String(
              row.currency,
            ),
          totalAmount:
            money(
              row.total_amount,
            ),
          customerId:
            String(
              row.customer_id,
            ),
          customerName:
            String(
              row.customer_name,
            ),
          sourceInvoiceNumber:
            String(
              row.source_invoice_number,
            ),
        }),
      ),
  };
}
