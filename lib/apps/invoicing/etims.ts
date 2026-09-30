import 'server-only';

import {
  createHash,
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
  ensureFiscalizedInvoiceDocumentSnapshot,
} from '@/lib/apps/invoicing/document-snapshots';

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


type EtimsSolution =
  | 'oscu'
  | 'vscu';

type EtimsEnvironment =
  | 'sandbox'
  | 'production';

type EtimsProfileRow = {
  id: string;
  company_id: string;
  solution_type: EtimsSolution;
  environment: EtimsEnvironment;
  taxpayer_pin: string;
  branch_id: string;
  device_serial_number: string;
  status: string;
  default_payment_type_code: string;
  kra_sdc_id: string | null;
  kra_mrc_no: string | null;
  communication_key_sealed: string | null;
  communication_key_version: string | null;
  initialization_payload: unknown;
  last_device_init_at: string | null;
  last_reference_sync_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
};

type EtimsRemoteResult = {
  httpStatus:
    number;
  body:
    Record<string, unknown>;
};

type EtimsTaxCode =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E';


const TAX_RATES:
  Record<
    EtimsTaxCode,
    number
  > = {
    A: 0,
    B: 16,
    C: 0,
    D: 0,
    E: 8,
  };

const PAYMENT_CODES =
  new Set([
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
  ]);

const CREDIT_REASON_CODES =
  new Set(
    Array.from(
      {
        length: 13,
      },
      (
        _,
        index,
      ) =>
        String(
          index +
          1,
        ).padStart(
          2,
          '0',
        ),
    ),
  );

const REFERENCE_OPERATIONS = [
  'codes',
  'item_classes',
  'branches',
  'notices',
] as const;

type EtimsOperation =
  | 'initialize'
  | 'item_save'
  | 'sales'
  | typeof REFERENCE_OPERATIONS[number];


function operationPath(
  profile:
    Pick<
      EtimsProfileRow,
      'solution_type'
    >,
  operation:
    EtimsOperation,
) {
  if (
    profile.solution_type ===
      'oscu'
  ) {
    const paths:
      Record<
        EtimsOperation,
        string
      > = {
        initialize:
          '/selectInitOsdcInfo',
        codes:
          '/selectCodeList',
        item_classes:
          '/selectItemClsList',
        branches:
          '/selectBhfList',
        notices:
          '/selectNoticeList',
        item_save:
          '/saveItem',
        sales:
          '/saveTrnsSalesOsdc',
      };

    return paths[
      operation
    ];
  }

  const paths:
    Record<
      EtimsOperation,
      string
    > = {
      initialize:
        '/initializer/selectInitInfo',
      codes:
        '/code/selectCodes',
      item_classes:
        '/itemClass/selectItemsClass',
      branches:
        '/branches/selectBranches',
      notices:
        '/notices/selectNotices',
      item_save:
        '/items/saveItems',
      sales:
        '/trnsSales/saveSales',
    };

  return paths[
    operation
  ];
}


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


function compactDateTime(
  date =
    new Date(),
) {
  const iso =
    date
      .toISOString();

  return (
    iso
      .slice(
        0,
        10,
      )
      .replaceAll(
        '-',
        '',
      ) +
    iso
      .slice(
        11,
        19,
      )
      .replaceAll(
        ':',
        '',
      )
  );
}


function compactDate(
  date:
    unknown,
) {
  const value =
    cleanText(
      date,
      10,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(
        value,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'A valid transaction date is required for eTIMS.',
    );
  }

  return value.replaceAll(
    '-',
    '',
  );
}


function sha256(
  value:
    unknown,
) {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        value,
      ),
      'utf8',
    )
    .digest(
      'hex',
    );
}


function normalizedPin(
  value:
    unknown,
  field =
    'KRA PIN',
) {
  const pin =
    cleanText(
      value,
      20,
    ).toUpperCase();

  if (
    !/^[A-Z0-9]{11}$/
      .test(
        pin,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      field +
      ' must be an 11-character KRA PIN.',
    );
  }

  return pin;
}


function optionalPin(
  value:
    unknown,
) {
  const raw =
    cleanText(
      value,
      20,
    ).toUpperCase();

  if (!raw) {
    return '';
  }

  return normalizedPin(
    raw,
    'Customer KRA PIN',
  );
}


function paymentCode(
  value:
    unknown,
  fallback =
    '02',
) {
  const code =
    cleanText(
      value,
      4,
    ) ||
    fallback;

  if (
    !PAYMENT_CODES.has(
      code,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid eTIMS payment type.',
    );
  }

  return code;
}


function creditReasonCode(
  value:
    unknown,
) {
  const code =
    cleanText(
      value,
      4,
    );

  if (
    !CREDIT_REASON_CODES
      .has(
        code,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid KRA credit-note reason.',
    );
  }

  return code;
}


function profileBaseUrl(
  profile:
    Pick<
      EtimsProfileRow,
      'solution_type' |
      'environment'
    >,
) {
  const key =
    [
      'SAMI_ETIMS',
      profile
        .solution_type
        .toUpperCase(),
      profile
        .environment
        .toUpperCase(),
      'BASE_URL',
    ].join(
      '_',
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
      'ETIMS_NOT_CONFIGURED',
      'The ' +
      profile.environment +
      ' ' +
      profile
        .solution_type
        .toUpperCase() +
      ' endpoint is not configured on the SaMi server.',
      {
        environmentVariable:
          key,
      },
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(
        raw,
      );
  } catch {
    throw new InvoicingError(
      'ETIMS_NOT_CONFIGURED',
      'The configured eTIMS endpoint is invalid.',
    );
  }

  if (
    ![
      'https:',
      'http:',
    ].includes(
      url.protocol,
    )
  ) {
    throw new InvoicingError(
      'ETIMS_NOT_CONFIGURED',
      'The configured eTIMS endpoint must use HTTP or HTTPS.',
    );
  }

  return raw.replace(
    /\/+$/,
    '',
  );
}


function requestTimeoutMs() {
  const value =
    Number(
      process.env
        .SAMI_ETIMS_REQUEST_TIMEOUT_MS ||
      20000,
    );

  return Number.isFinite(
    value,
  )
    ? Math.max(
        3000,
        Math.min(
          value,
          120000,
        ),
      )
    : 20000;
}


function findStringDeep(
  value:
    unknown,
  keys:
    ReadonlySet<string>,
):
  string |
  null {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    for (
      const item
      of value
    ) {
      const found =
        findStringDeep(
          item,
          keys,
        );

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (
    const [
      key,
      item,
    ]
    of Object.entries(
      value as
        Record<
          string,
          unknown
        >,
    )
  ) {
    if (
      keys.has(
        key.toLowerCase(),
      ) &&
      typeof item ===
        'string' &&
      item.trim()
    ) {
      return item.trim();
    }

    const nested =
      findStringDeep(
        item,
        keys,
      );

    if (nested) {
      return nested;
    }
  }

  return null;
}


function communicationKey(
  profile:
    EtimsProfileRow,
) {
  if (
    profile.solution_type !==
      'oscu'
  ) {
    return null;
  }

  if (
    !profile
      .communication_key_sealed
  ) {
    throw new InvoicingError(
      'ETIMS_NOT_ACTIVATED',
      'The OSCU communication key is missing. Initialize the device again.',
    );
  }

  try {
    const opened =
      openIntegrationSecret<
        {
          communicationKey?:
            string;
        }
      >(
        profile
          .communication_key_sealed,
      );

    const key =
      cleanText(
        opened
          .communicationKey,
        255,
      );

    if (!key) {
      throw new Error(
        'Empty key.',
      );
    }

    return key;
  } catch {
    throw new InvoicingError(
      'ETIMS_NOT_ACTIVATED',
      'SaMi could not open the OSCU communication key. Check the platform integration encryption key.',
    );
  }
}


function providerPayload(
  profile:
    EtimsProfileRow,
  operation:
    EtimsOperation,
  payload:
    Record<string, unknown>,
) {
  if (
    profile.solution_type !==
      'oscu' ||
    operation ===
      'initialize'
  ) {
    return payload;
  }

  return {
    ...payload,
    cmcKey:
      communicationKey(
        profile,
      ),
  };
}


async function etimsPost(
  profile:
    EtimsProfileRow,
  operation:
    EtimsOperation,
  payload:
    Record<string, unknown>,
):
  Promise<EtimsRemoteResult> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      requestTimeoutMs(),
    );

  try {
    const response =
      await fetch(
        profileBaseUrl(
          profile,
        ) +
        operationPath(
          profile,
          operation,
        ),
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
          },
          body:
            JSON.stringify(
              providerPayload(
                profile,
                operation,
                payload,
              ),
            ),
          signal:
            controller.signal,
        },
      );

    const text =
      await response.text();

    if (
      text.length >
      2_000_000
    ) {
      throw new InvoicingError(
        'ETIMS_ENDPOINT_UNAVAILABLE',
        'The eTIMS endpoint returned an unexpectedly large response.',
      );
    }

    let body:
      Record<string, unknown> =
        {};

    try {
      body =
        text
          ? jsonObject(
              JSON.parse(
                text,
              ),
            )
          : {};
    } catch {
      throw new InvoicingError(
        'ETIMS_ENDPOINT_UNAVAILABLE',
        'The eTIMS endpoint returned an unreadable response.',
        {
          httpStatus:
            response.status,
        },
      );
    }

    return {
      httpStatus:
        response.status,
      body,
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
      'ETIMS_ENDPOINT_UNAVAILABLE',
      aborted
        ? 'The eTIMS request timed out.'
        : 'SaMi could not reach the configured eTIMS endpoint.',
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


function remoteCode(
  body:
    Record<string, unknown>,
) {
  return cleanText(
    body.resultCd,
    120,
  );
}


function remoteMessage(
  body:
    Record<string, unknown>,
) {
  return (
    cleanText(
      body.resultMsg,
      2000,
    ) ||
    cleanText(
      body.message,
      2000,
    ) ||
    'eTIMS rejected the request.'
  );
}


function assertRemoteSuccess(
  result:
    EtimsRemoteResult,
) {
  const code =
    remoteCode(
      result.body,
    );

  if (
    !(
      result.httpStatus >=
        200 &&
      result.httpStatus <
        300
    ) ||
    code !==
      '000'
  ) {
    throw new InvoicingError(
      'ETIMS_SUBMISSION_FAILED',
      remoteMessage(
        result.body,
      ),
      {
        kraResultCode:
          code ||
          null,
        httpStatus:
          result.httpStatus,
        retryable:
          result.httpStatus >=
            500,
        response:
          result.body,
      },
    );
  }
}


async function loadProfile(
  client:
    PoolClient,
  companyId:
    string,
  forUpdate =
    false,
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM invoicing_etims_profiles
        WHERE company_id = $1
        LIMIT 1
        ${forUpdate
          ? 'FOR UPDATE'
          : ''}
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
      'ETIMS_NOT_CONFIGURED',
      'Configure Kenya eTIMS before using fiscalization.',
    );
  }

  return result
    .rows[0] as
      EtimsProfileRow;
}


function assertActivated(
  profile:
    EtimsProfileRow,
) {
  if (
    profile.status !==
      'activated'
  ) {
    throw new InvoicingError(
      'ETIMS_NOT_ACTIVATED',
      'Initialize and activate this eTIMS device before sending fiscal documents.',
    );
  }
}


async function reserveTransactionNumber(
  client:
    PoolClient,
  profile:
    EtimsProfileRow,
  userId:
    string,
) {
  await client.query(
    `
      INSERT INTO invoicing_etims_sequences (
        company_id,
        solution_type,
        environment,
        branch_id,
        next_invoice_no,
        updated_by
      )
      VALUES (
        $1,$2,$3,$4,1,$5
      )
      ON CONFLICT (
        company_id,
        solution_type,
        environment,
        branch_id
      )
      DO NOTHING
    `,
    [
      profile.company_id,
      profile.solution_type,
      profile.environment,
      profile.branch_id,
      userId,
    ],
  );

  const result =
    await client.query(
      `
        UPDATE invoicing_etims_sequences
        SET
          next_invoice_no =
            next_invoice_no + 1,
          updated_by = $5,
          updated_at = NOW()
        WHERE company_id = $1
          AND solution_type = $2
          AND environment = $3
          AND branch_id = $4
        RETURNING
          next_invoice_no - 1
            AS transaction_invoice_no
      `,
      [
        profile.company_id,
        profile.solution_type,
        profile.environment,
        profile.branch_id,
        userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'ETIMS_NOT_CONFIGURED',
      'SaMi could not reserve the next eTIMS invoice number.',
    );
  }

  return Number(
    result.rows[0]
      .transaction_invoice_no,
  );
}


function mappedTaxableAmount(
  line:
    Record<string, unknown>,
) {
  const componentCount =
    Number(
      line.tax_component_count ??
      (
        Array.isArray(
          line.tax_components,
        )
          ? line.tax_components.length
          : 0
      ),
    );

  if (
    componentCount >
      1
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'A multi-component tax line cannot be represented by one KRA tax type. Split or remap the line before fiscalization.',
      {
        invoiceItemId:
          String(
            line.id,
          ),
      },
    );
  }

  if (
    line.taxable_amount_override !==
      undefined &&
    line.taxable_amount_override !==
      null
  ) {
    return money(
      line.taxable_amount_override,
    );
  }

  const components =
    Array.isArray(
      line.tax_components,
    )
      ? line.tax_components
          .map(
            jsonObject,
          )
      : [];

  if (
    components.length ===
      1
  ) {
    return money(
      components[0]
        .taxableAmount,
    );
  }

  return money(
    Math.max(
      0,
      money(
        line.subtotal,
      ) -
      money(
        line.discount_amount,
      ),
    ),
  );
}


function buildItemPayload(
  line:
    Record<string, unknown>,
  index:
    number,
) {
  if (
    !line.catalog_item_id
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'Every fiscalized eTIMS line must use a catalog item with an eTIMS item mapping.',
      {
        invoiceItemId:
          String(
            line.id,
          ),
      },
    );
  }

  if (
    !line.item_code ||
    !line.item_classification_code ||
    !line.packaging_unit_code ||
    !line.quantity_unit_code
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'An invoice item is missing its KRA item mapping.',
      {
        catalogItemId:
          String(
            line.catalog_item_id,
          ),
        invoiceItemId:
          String(
            line.id,
          ),
      },
    );
  }

  if (
    String(
      line.kra_sync_status ||
      ''
    ) !==
      'synced'
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'The mapped catalog item must be registered with KRA before this document can be fiscalized.',
      {
        catalogItemId:
          String(
            line.catalog_item_id,
          ),
        invoiceItemId:
          String(
            line.id,
          ),
      },
    );
  }

  const taxCode =
    cleanText(
      line.tax_type_code,
      1,
    ) as
      EtimsTaxCode;

  if (
    !Object.prototype
      .hasOwnProperty.call(
        TAX_RATES,
        taxCode,
      )
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'An invoice tax is missing its KRA A-E tax mapping.',
      {
        invoiceItemId:
          String(
            line.id,
          ),
      },
    );
  }

  const taxable =
    mappedTaxableAmount(
      line,
    );

  const expectedTax =
    money(
      taxable *
      TAX_RATES[
        taxCode
      ] /
      100,
    );

  if (
    Math.abs(
      expectedTax -
      money(
        line.tax_amount,
      ),
    ) >
    0.05
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'The KRA tax mapping does not match the tax amount frozen on this invoice line.',
      {
        invoiceItemId:
          String(
            line.id,
          ),
        kraTaxType:
          taxCode,
        expectedTax,
        invoiceTax:
          money(
            line.tax_amount,
          ),
      },
    );
  }

  const qty =
    money(
      line.quantity,
    );

  const unitPrice =
    money(
      line.unit_price,
    );

  const discountAmount =
    money(
      line.discount_amount,
    );

  const gross =
    money(
      qty *
      unitPrice,
    );

  const discountRate =
    gross >
      0
      ? money(
          discountAmount /
          gross *
          100,
        )
      : 0;

  return {
    itemSeq:
      index +
      1,
    itemClsCd:
      String(
        line.item_classification_code,
      ),
    itemCd:
      String(
        line.item_code,
      ),
    itemNm:
      cleanText(
        line.description,
        500,
      ),
    bcd:
      null,
    pkgUnitCd:
      String(
        line.packaging_unit_code,
      ),
    pkg:
      qty,
    qtyUnitCd:
      String(
        line.quantity_unit_code,
      ),
    qty,
    prc:
      unitPrice,
    splyAmt:
      gross,
    dcRt:
      discountRate,
    dcAmt:
      discountAmount,
    taxTyCd:
      taxCode,
    taxblAmt:
      taxable,
    taxAmt:
      money(
        line.tax_amount,
      ),
    totAmt:
      money(
        line.line_total,
      ),
  };
}


function taxTotals(
  items:
    Array<
      Record<string, unknown>
    >,
) {
  const result:
    Record<string, number> =
      {};

  for (
    const code
    of [
      'A',
      'B',
      'C',
      'D',
      'E',
    ] as
      EtimsTaxCode[]
  ) {
    const rows =
      items.filter(
        item =>
          item.taxTyCd ===
            code,
      );

    result[
      'taxblAmt' +
      code
    ] =
      money(
        rows.reduce(
          (
            total,
            item,
          ) =>
            total +
            money(
              item.taxblAmt,
            ),
          0,
        ),
      );

    result[
      'taxAmt' +
      code
    ] =
      money(
        rows.reduce(
          (
            total,
            item,
          ) =>
            total +
            money(
              item.taxAmt,
            ),
          0,
        ),
      );

    result[
      'taxRt' +
      code
    ] =
      TAX_RATES[
        code
      ];
  }

  return result;
}


function baseSalesPayload(
  input: {
    profile:
      EtimsProfileRow;
    transactionInvoiceNo:
      number;
    traderInvoiceNumber:
      string;
    customerPin:
      string;
    customerName:
      string;
    transactionDate:
      string;
    paymentTypeCode:
      string;
    receiptTypeCode:
      'S' |
      'R';
    originalInvoiceNo:
      number;
    remark:
      string;
    items:
      Array<
        Record<string, unknown>
      >;
    refundReasonCode?:
      string |
      null;
    refundDate?:
      string |
      null;
    userId:
      string;
  },
) {
  const totals =
    taxTotals(
      input.items,
    );

  const totalTaxable =
    money(
      input.items.reduce(
        (
          total,
          item,
        ) =>
          total +
          money(
            item.taxblAmt,
          ),
        0,
      ),
    );

  const totalTax =
    money(
      input.items.reduce(
        (
          total,
          item,
        ) =>
          total +
          money(
            item.taxAmt,
          ),
        0,
      ),
    );

  const totalAmount =
    money(
      input.items.reduce(
        (
          total,
          item,
        ) =>
          total +
          money(
            item.totAmt,
          ),
        0,
      ),
    );

  return {
    tin:
      input.profile
        .taxpayer_pin,
    bhfId:
      input.profile
        .branch_id,
    trdInvcNo:
      cleanText(
        input
          .traderInvoiceNumber,
        50,
      ),
    invcNo:
      input
        .transactionInvoiceNo,
    orgInvcNo:
      input
        .originalInvoiceNo,
    custTin:
      input.customerPin,
    custNm:
      input.customerName,
    salesTyCd:
      'N',
    rcptTyCd:
      input
        .receiptTypeCode,
    pmtTyCd:
      input
        .paymentTypeCode,
    salesSttsCd:
      '02',
    cfmDt:
      compactDateTime(),
    salesDt:
      compactDate(
        input.transactionDate,
      ),
    stockRlsDt:
      null,
    cnclReqDt:
      null,
    cnclDt:
      null,
    rfdDt:
      input.refundDate
        ? compactDate(
            input.refundDate,
          )
        : null,
    rfdRsnCd:
      input.refundReasonCode ||
      null,
    totItemCnt:
      input.items.length,
    ...totals,
    totTaxblAmt:
      totalTaxable,
    totTaxAmt:
      totalTax,
    totAmt:
      totalAmount,
    prchrAcptcYn:
      'N',
    remark:
      input.remark,
    regrId:
      input.userId,
    regrNm:
      'SaMi',
    modrId:
      input.userId,
    modrNm:
      'SaMi',
    itemList:
      input.items,
  };
}


async function upsertSubmission(
  client:
    PoolClient,
  input: {
    companyId: string;
    invoiceId?: string | null;
    creditNoteId?: string | null;
    sourceKey: string;
    submissionType:
      'sale' |
      'credit_note';
    profile:
      EtimsProfileRow;
    payload:
      Record<string, unknown>;
    userId:
      string;
    transactionInvoiceNo?:
      number |
      null;
  },
) {
  const existing =
    await client.query(
      `
        SELECT *
        FROM invoicing_etims_submissions
        WHERE company_id = $1
          AND source_key = $2
        LIMIT 1
        FOR UPDATE
      `,
      [
        input.companyId,
        input.sourceKey,
      ],
    );

  if (
    existing.rows[0]
      ?.status ===
      'succeeded'
  ) {
    throw new InvoicingError(
      'ETIMS_ALREADY_SUBMITTED',
      'This document was already fiscalized successfully with eTIMS.',
      {
        submissionId:
          String(
            existing.rows[0]
              .id,
          ),
      },
    );
  }

  const transactionInvoiceNo =
    existing.rows.length >
      0
      ? Number(
          existing.rows[0]
            .transaction_invoice_no,
        )
      : input
          .transactionInvoiceNo ||
        await reserveTransactionNumber(
          client,
          input.profile,
          input.userId,
        );

  const existingPayload =
    existing.rows.length >
      0
      ? jsonObject(
          existing.rows[0]
            .request_payload,
        )
      : {};

  const payloadWithNumber = {
    ...input.payload,
    cfmDt:
      cleanText(
        existingPayload
          .cfmDt,
        14,
      ) ||
      input.payload
        .cfmDt,
    invcNo:
      transactionInvoiceNo,
  };

  const sourceHash =
    sha256(
      payloadWithNumber,
    );

  if (
    existing.rows.length >
      0
  ) {
    const result =
      await client.query(
        `
          UPDATE invoicing_etims_submissions
          SET
            source_hash = $3,
            request_payload = $4::jsonb,
            response_payload = '{}'::jsonb,
            solution_type = $5,
            environment = $6,
            status = 'submitting',
            last_attempt_at = NOW(),
            next_retry_at = NULL,
            kra_result_code = NULL,
            kra_result_message = NULL,
            submitted_by = $7,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
          RETURNING *
        `,
        [
          existing.rows[0]
            .id,
          input.companyId,
          sourceHash,
          JSON.stringify(
            payloadWithNumber,
          ),
          input.profile
            .solution_type,
          input.profile
            .environment,
          input.userId,
        ],
      );

    return {
      row:
        result.rows[0],
      payload:
        payloadWithNumber,
    };
  }

  const result =
    await client.query(
      `
        INSERT INTO invoicing_etims_submissions (
          company_id,
          invoice_id,
          credit_note_id,
          source_key,
          submission_type,
          solution_type,
          environment,
          transaction_invoice_no,
          source_hash,
          request_payload,
          status,
          last_attempt_at,
          submitted_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,
          'submitting',
          NOW(),
          $11
        )
        RETURNING *
      `,
      [
        input.companyId,
        input.invoiceId ||
        null,
        input.creditNoteId ||
        null,
        input.sourceKey,
        input.submissionType,
        input.profile
          .solution_type,
        input.profile
          .environment,
        transactionInvoiceNo,
        sourceHash,
        JSON.stringify(
          payloadWithNumber,
        ),
        input.userId,
      ],
    );

  return {
    row:
      result.rows[0],
    payload:
      payloadWithNumber,
  };
}


async function transmitSubmission(
  context:
    Awaited<
      ReturnType<
        typeof requireInvoicingContext
      >
    >,
  profile:
    EtimsProfileRow,
  submission:
    Record<string, unknown>,
  payload:
    Record<string, unknown>,
) {
  const submissionId =
    String(
      submission.id,
    );

  const attemptNo =
    Number(
      submission.attempt_count ||
      0,
    ) +
    1;

  await context.pool.query(
    `
      INSERT INTO invoicing_etims_submission_attempts (
        company_id,
        submission_id,
        attempt_no,
        request_payload
      )
      VALUES ($1,$2,$3,$4::jsonb)
    `,
    [
      context.companyId,
      submissionId,
      attemptNo,
      JSON.stringify(
        payload,
      ),
    ],
  );

  try {
    const remote =
      await etimsPost(
        profile,
        'sales',
        payload,
      );

    assertRemoteSuccess(
      remote,
    );

    const data =
      jsonObject(
        remote.body.data,
      );

    const receipt =
      jsonObject(
        data.rcptInfo ||
        data,
      );

    await context.pool.query(
      `
        UPDATE invoicing_etims_submissions
        SET
          status = 'succeeded',
          attempt_count = $3,
          last_attempt_at = NOW(),
          response_payload = $4::jsonb,
          kra_result_code = $5,
          kra_result_message = $6,
          kra_result_date = $7,
          receipt_no = $8,
          total_receipt_no = $9,
          sdc_id = $10,
          mrc_no = $11,
          receipt_publication_date = $12,
          internal_data = $13,
          receipt_signature = $14,
          succeeded_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        submissionId,
        context.companyId,
        attemptNo,
        JSON.stringify(
          remote.body,
        ),
        remoteCode(
          remote.body,
        ),
        remoteMessage(
          remote.body,
        ),
        cleanText(
          remote.body.resultDt,
          80,
        ) ||
        null,
        Number(
          receipt.rcptNo ||
          0,
        ) ||
        null,
        Number(
          receipt.totRcptNo ||
          0,
        ) ||
        null,
        cleanText(
          receipt.sdcId,
          120,
        ) ||
        null,
        cleanText(
          receipt.mrcNo,
          120,
        ) ||
        null,
        cleanText(
          receipt.rcptPbctDt,
          80,
        ) ||
        null,
        cleanText(
          receipt.intrlData,
          10000,
        ) ||
        null,
        cleanText(
          receipt.rcptSign,
          10000,
        ) ||
        null,
      ],
    );

    await context.pool.query(
      `
        UPDATE invoicing_etims_submission_attempts
        SET
          response_payload = $4::jsonb,
          http_status = $5,
          kra_result_code = $6,
          completed_at = NOW()
        WHERE company_id = $1
          AND submission_id = $2
          AND attempt_no = $3
      `,
      [
        context.companyId,
        submissionId,
        attemptNo,
        JSON.stringify(
          remote.body,
        ),
        remote.httpStatus,
        remoteCode(
          remote.body,
        ),
      ],
    );

    await context.pool.query(
      `
        UPDATE invoicing_etims_profiles
        SET
          last_success_at = NOW(),
          last_error_at = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          kra_sdc_id = COALESCE($2, kra_sdc_id),
          kra_mrc_no = COALESCE($3, kra_mrc_no),
          updated_at = NOW()
        WHERE company_id = $1
      `,
      [
        context.companyId,
        cleanText(
          receipt.sdcId,
          120,
        ) ||
        null,
        cleanText(
          receipt.mrcNo,
          120,
        ) ||
        null,
      ],
    );

    return {
      submissionId,
      status:
        'succeeded',
      resultCode:
        remoteCode(
          remote.body,
        ),
      receiptNo:
        Number(
          receipt.rcptNo ||
          0,
        ) ||
        null,
      sdcId:
        cleanText(
          receipt.sdcId,
          120,
        ) ||
        null,
      receiptSignature:
        cleanText(
          receipt.rcptSign,
          10000,
        ) ||
        null,
    };
  } catch (
    error
  ) {
    const invoicingError =
      error instanceof
        InvoicingError
        ? error
        : new InvoicingError(
            'ETIMS_ENDPOINT_UNAVAILABLE',
            'SaMi could not complete the eTIMS request.',
            {
              retryable:
                true,
            },
          );

    const response =
      jsonObject(
        invoicingError
          .details
          .response,
      );

    const httpStatus =
      Number(
        invoicingError
          .details
          .httpStatus ||
        0,
      ) ||
      null;

    const retryable =
      bool(
        invoicingError
          .details
          .retryable,
      );

    await context.pool.query(
      `
        UPDATE invoicing_etims_submissions
        SET
          status = $3,
          attempt_count = $4,
          last_attempt_at = NOW(),
          next_retry_at =
            CASE
              WHEN $3 = 'retryable'
              THEN NOW() + INTERVAL '15 minutes'
              ELSE NULL
            END,
          response_payload = $5::jsonb,
          kra_result_code = $6,
          kra_result_message = $7,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        submissionId,
        context.companyId,
        retryable
          ? 'retryable'
          : 'failed',
        attemptNo,
        JSON.stringify(
          response,
        ),
        cleanText(
          invoicingError
            .details
            .kraResultCode,
          120,
        ) ||
        null,
        invoicingError
          .message,
      ],
    );

    await context.pool.query(
      `
        UPDATE invoicing_etims_submission_attempts
        SET
          response_payload = $4::jsonb,
          http_status = $5,
          kra_result_code = $6,
          error_code = $7,
          error_message = $8,
          completed_at = NOW()
        WHERE company_id = $1
          AND submission_id = $2
          AND attempt_no = $3
      `,
      [
        context.companyId,
        submissionId,
        attemptNo,
        JSON.stringify(
          response,
        ),
        httpStatus,
        cleanText(
          invoicingError
            .details
            .kraResultCode,
          120,
        ) ||
        null,
        invoicingError
          .code,
        invoicingError
          .message,
      ],
    );

    await context.pool.query(
      `
        UPDATE invoicing_etims_profiles
        SET
          last_error_at = NOW(),
          last_error_code = $2,
          last_error_message = $3,
          updated_at = NOW()
        WHERE company_id = $1
      `,
      [
        context.companyId,
        invoicingError
          .code,
        invoicingError
          .message,
      ],
    );

    throw invoicingError;
  }
}


export async function getEtimsWorkspaceData() {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_VIEW,
    );

  const canConfigure =
    hasInvoicingPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const canSubmit =
    hasInvoicingPermission(
      context.permissions
        .isOwner,
      context.permissions
        .permissionSet,
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const [
    profileResult,
    itemMappings,
    taxMappings,
    referenceCache,
    submissions,
    invoices,
    creditNotes,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT *
          FROM invoicing_etims_profiles
          WHERE company_id = $1
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            mapping.id,
            mapping.catalog_item_id,
            item.name AS item_name,
            item.sku,
            mapping.item_classification_code,
            mapping.item_code,
            mapping.item_type_code,
            mapping.origin_country_code,
            mapping.packaging_unit_code,
            mapping.quantity_unit_code,
            mapping.is_active,
            mapping.kra_sync_status,
            mapping.kra_last_sync_at,
            mapping.kra_result_code,
            mapping.kra_result_message,
            mapping.updated_at
          FROM invoicing_etims_item_mappings mapping
          INNER JOIN invoicing_catalog_items item
            ON item.id = mapping.catalog_item_id
           AND item.company_id = mapping.company_id
          WHERE mapping.company_id = $1
          ORDER BY item.name, mapping.id
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            mapping.id,
            mapping.tax_rate_id,
            mapping.tax_group_id,
            COALESCE(rate.name, grp.name) AS source_name,
            mapping.tax_type_code,
            mapping.kra_rate,
            mapping.is_active,
            mapping.updated_at
          FROM invoicing_etims_tax_mappings mapping
          LEFT JOIN invoicing_tax_rates rate
            ON rate.id = mapping.tax_rate_id
           AND rate.company_id = mapping.company_id
          LEFT JOIN invoicing_tax_groups grp
            ON grp.id = mapping.tax_group_id
           AND grp.company_id = mapping.company_id
          WHERE mapping.company_id = $1
          ORDER BY source_name, mapping.id
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            reference_type,
            external_key,
            payload,
            source_updated_at,
            synced_at
          FROM invoicing_etims_reference_cache
          WHERE company_id = $1
          ORDER BY reference_type, external_key
        `,
        [
          context.companyId,
        ],
      ),

      context.pool.query(
        `
          SELECT
            submission.id,
            submission.invoice_id,
            submission.credit_note_id,
            submission.submission_type,
            submission.solution_type,
            submission.environment,
            submission.transaction_invoice_no,
            submission.status,
            submission.attempt_count,
            submission.last_attempt_at,
            submission.next_retry_at,
            submission.kra_result_code,
            submission.kra_result_message,
            submission.receipt_no,
            submission.sdc_id,
            submission.mrc_no,
            submission.receipt_publication_date,
            submission.receipt_signature,
            submission.succeeded_at,
            submission.created_at,
            invoice.invoice_number,
            credit.credit_note_number
          FROM invoicing_etims_submissions submission
          LEFT JOIN invoicing_invoices invoice
            ON invoice.id = submission.invoice_id
           AND invoice.company_id = submission.company_id
          LEFT JOIN invoicing_credit_notes credit
            ON credit.id = submission.credit_note_id
           AND credit.company_id = submission.company_id
          WHERE submission.company_id = $1
          ORDER BY submission.created_at DESC
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
            customer.name AS customer_name,
            customer.tax_id,
            successful.id AS etims_submission_id,
            successful.status AS etims_status
          FROM invoicing_invoices invoice
          INNER JOIN invoicing_customers customer
            ON customer.id = invoice.customer_id
           AND customer.company_id = invoice.company_id
          LEFT JOIN invoicing_etims_submissions successful
            ON successful.company_id = invoice.company_id
           AND successful.invoice_id = invoice.id
           AND successful.submission_type = 'sale'
          WHERE invoice.company_id = $1
            AND invoice.deleted_at IS NULL
            AND invoice.status NOT IN (
              'draft',
              'pending_approval',
              'rejected',
              'cancelled',
              'void'
            )
          ORDER BY invoice.invoice_date DESC, invoice.created_at DESC
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
            credit.invoice_id,
            invoice.invoice_number,
            successful.id AS etims_submission_id,
            successful.status AS etims_status
          FROM invoicing_credit_notes credit
          INNER JOIN invoicing_invoices invoice
            ON invoice.id = credit.invoice_id
           AND invoice.company_id = credit.company_id
          LEFT JOIN invoicing_etims_submissions successful
            ON successful.company_id = credit.company_id
           AND successful.credit_note_id = credit.id
           AND successful.submission_type = 'credit_note'
          WHERE credit.company_id = $1
            AND credit.deleted_at IS NULL
            AND credit.status <> 'cancelled'
          ORDER BY credit.issue_date DESC, credit.created_at DESC
          LIMIT 100
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  const profile =
    profileResult.rows[0] ||
    null;

  const endpointConfigured =
    profile
      ? (() => {
          try {
            profileBaseUrl(
              profile as
                EtimsProfileRow,
            );
            return true;
          } catch {
            return false;
          }
        })()
      : false;

  return {
    company: {
      id:
        context.companyId,
      name:
        context.company
          .currentCompany
          .name,
    },
    capabilities: {
      canConfigure,
      canSubmit,
    },
    endpointConfigured,
    productionNotice:
      'Production eTIMS use requires KRA approval/certification and an activated device. SaMi does not treat a saved production profile as KRA certification.',
    profile:
      profile
        ? {
            solutionType:
              String(
                profile.solution_type,
              ),
            environment:
              String(
                profile.environment,
              ),
            taxpayerPin:
              String(
                profile.taxpayer_pin,
              ),
            branchId:
              String(
                profile.branch_id,
              ),
            deviceSerialNumber:
              String(
                profile.device_serial_number,
              ),
            status:
              String(
                profile.status,
              ),
            defaultPaymentTypeCode:
              String(
                profile.default_payment_type_code,
              ),
            kraSdcId:
              profile.kra_sdc_id
                ? String(
                    profile.kra_sdc_id,
                  )
                : null,
            kraMrcNo:
              profile.kra_mrc_no
                ? String(
                    profile.kra_mrc_no,
                  )
                : null,
            lastDeviceInitAt:
              profile.last_device_init_at,
            lastReferenceSyncAt:
              profile.last_reference_sync_at,
            lastSuccessAt:
              profile.last_success_at,
            lastErrorAt:
              profile.last_error_at,
            lastErrorCode:
              profile.last_error_code,
            lastErrorMessage:
              profile.last_error_message,
          }
        : null,
    readiness: {
      profileConfigured:
        Boolean(
          profile,
        ),
      endpointConfigured,
      deviceActivated:
        profile
          ?.status ===
        'activated',
      itemMappings:
        itemMappings.rows.length,
      taxMappings:
        taxMappings.rows.length,
      referencesSynced:
        referenceCache.rows.length >
        0,
    },
    itemMappings:
      itemMappings.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          catalogItemId:
            String(
              row.catalog_item_id,
            ),
          itemName:
            String(
              row.item_name,
            ),
          sku:
            row.sku
              ? String(
                  row.sku,
                )
              : null,
          itemClassificationCode:
            String(
              row.item_classification_code,
            ),
          itemCode:
            String(
              row.item_code,
            ),
          itemTypeCode:
            String(
              row.item_type_code,
            ),
          originCountryCode:
            String(
              row.origin_country_code,
            ),
          packagingUnitCode:
            String(
              row.packaging_unit_code,
            ),
          quantityUnitCode:
            String(
              row.quantity_unit_code,
            ),
          isActive:
            row.is_active !==
            false,
          kraSyncStatus:
            String(
              row.kra_sync_status ||
              'not_synced',
            ),
          kraLastSyncAt:
            row.kra_last_sync_at,
          kraResultCode:
            row.kra_result_code
              ? String(
                  row.kra_result_code,
                )
              : null,
          kraResultMessage:
            row.kra_result_message
              ? String(
                  row.kra_result_message,
                )
              : null,
          updatedAt:
            row.updated_at,
        }),
      ),
    taxMappings:
      taxMappings.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          taxRateId:
            row.tax_rate_id
              ? String(
                  row.tax_rate_id,
                )
              : null,
          taxGroupId:
            row.tax_group_id
              ? String(
                  row.tax_group_id,
                )
              : null,
          sourceName:
            String(
              row.source_name ||
              'Tax',
            ),
          taxTypeCode:
            String(
              row.tax_type_code,
            ),
          kraRate:
            money(
              row.kra_rate,
            ),
          isActive:
            row.is_active !==
            false,
          updatedAt:
            row.updated_at,
        }),
      ),
    referenceCache:
      referenceCache.rows.map(
        row => ({
          referenceType:
            String(
              row.reference_type,
            ),
          externalKey:
            String(
              row.external_key,
            ),
          payload:
            row.payload,
          sourceUpdatedAt:
            row.source_updated_at,
          syncedAt:
            row.synced_at,
        }),
      ),
    submissions:
      submissions.rows.map(
        row => ({
          id:
            String(
              row.id,
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
          documentNumber:
            row.invoice_number
              ? String(
                  row.invoice_number,
                )
              : row.credit_note_number
                ? String(
                    row.credit_note_number,
                  )
                : 'Document',
          submissionType:
            String(
              row.submission_type,
            ),
          solutionType:
            String(
              row.solution_type,
            ),
          environment:
            String(
              row.environment,
            ),
          transactionInvoiceNo:
            Number(
              row.transaction_invoice_no,
            ),
          status:
            String(
              row.status,
            ),
          attemptCount:
            Number(
              row.attempt_count ||
              0,
            ),
          lastAttemptAt:
            row.last_attempt_at,
          nextRetryAt:
            row.next_retry_at,
          resultCode:
            row.kra_result_code
              ? String(
                  row.kra_result_code,
                )
              : null,
          resultMessage:
            row.kra_result_message
              ? String(
                  row.kra_result_message,
                )
              : null,
          receiptNo:
            row.receipt_no
              ? Number(
                  row.receipt_no,
                )
              : null,
          sdcId:
            row.sdc_id
              ? String(
                  row.sdc_id,
                )
              : null,
          mrcNo:
            row.mrc_no
              ? String(
                  row.mrc_no,
                )
              : null,
          receiptPublicationDate:
            row.receipt_publication_date,
          receiptSignature:
            row.receipt_signature,
          succeededAt:
            row.succeeded_at,
          createdAt:
            row.created_at,
        }),
      ),
    eligibleInvoices:
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
          customerName:
            String(
              row.customer_name,
            ),
          customerPin:
            row.tax_id
              ? String(
                  row.tax_id,
                )
              : null,
          etimsStatus:
            row.etims_status
              ? String(
                  row.etims_status,
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
          invoiceId:
            String(
              row.invoice_id,
            ),
          invoiceNumber:
            String(
              row.invoice_number,
            ),
          etimsStatus:
            row.etims_status
              ? String(
                  row.etims_status,
                )
              : null,
        }),
      ),
  };
}


export async function saveEtimsProfile(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const solutionType =
    cleanText(
      input.solutionType,
      10,
    ).toLowerCase();

  if (
    ![
      'oscu',
      'vscu',
    ].includes(
      solutionType,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose OSCU or VSCU.',
    );
  }

  const environment =
    cleanText(
      input.environment,
      12,
    ).toLowerCase();

  if (
    ![
      'sandbox',
      'production',
    ].includes(
      environment,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose sandbox or production eTIMS.',
    );
  }

  const taxpayerPin =
    normalizedPin(
      input.taxpayerPin,
    );

  const branchId =
    cleanText(
      input.branchId,
      20,
    ) ||
    '00';

  if (
    !/^[A-Z0-9]{1,20}$/i
      .test(
        branchId,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The eTIMS branch ID is invalid.',
    );
  }

  const deviceSerialNumber =
    cleanText(
      input.deviceSerialNumber,
      120,
    );

  if (
    deviceSerialNumber.length <
      2
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Device serial number is required.',
    );
  }

  const defaultPaymentTypeCode =
    paymentCode(
      input.defaultPaymentTypeCode,
    );

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_etims_profiles (
          company_id,
          solution_type,
          environment,
          taxpayer_pin,
          branch_id,
          device_serial_number,
          status,
          default_payment_type_code,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          'configured',
          $7,$8,$8
        )
        ON CONFLICT (company_id)
        DO UPDATE SET
          solution_type =
            EXCLUDED.solution_type,
          environment =
            EXCLUDED.environment,
          taxpayer_pin =
            EXCLUDED.taxpayer_pin,
          branch_id =
            EXCLUDED.branch_id,
          device_serial_number =
            EXCLUDED.device_serial_number,
          default_payment_type_code =
            EXCLUDED.default_payment_type_code,
          status =
            CASE
              WHEN invoicing_etims_profiles.solution_type = EXCLUDED.solution_type
               AND invoicing_etims_profiles.environment = EXCLUDED.environment
               AND invoicing_etims_profiles.taxpayer_pin = EXCLUDED.taxpayer_pin
               AND invoicing_etims_profiles.branch_id = EXCLUDED.branch_id
               AND invoicing_etims_profiles.device_serial_number = EXCLUDED.device_serial_number
              THEN invoicing_etims_profiles.status
              ELSE 'configured'
            END,
          initialization_payload =
            CASE
              WHEN invoicing_etims_profiles.solution_type = EXCLUDED.solution_type
               AND invoicing_etims_profiles.environment = EXCLUDED.environment
               AND invoicing_etims_profiles.taxpayer_pin = EXCLUDED.taxpayer_pin
               AND invoicing_etims_profiles.branch_id = EXCLUDED.branch_id
               AND invoicing_etims_profiles.device_serial_number = EXCLUDED.device_serial_number
              THEN invoicing_etims_profiles.initialization_payload
              ELSE '{}'::jsonb
            END,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING
          id,
          status
      `,
      [
        context.companyId,
        solutionType,
        environment,
        taxpayerPin,
        branchId.toUpperCase(),
        deviceSerialNumber,
        defaultPaymentTypeCode,
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
    status:
      String(
        result.rows[0].status,
      ),
  };
}


export async function saveEtimsItemMapping(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const catalogItemId =
    requireUuid(
      input.catalogItemId,
      'Catalog item',
    );

  const itemClassCode =
    cleanText(
      input.itemClassificationCode,
      10,
    );

  const itemCode =
    cleanText(
      input.itemCode,
      20,
    );

  const itemTypeCode =
    cleanText(
      input.itemTypeCode,
      1,
    ) ||
    '3';

  if (
    ![
      '1',
      '2',
      '3',
    ].includes(
      itemTypeCode,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid KRA item type: raw material, finished product or service.',
    );
  }

  const originCountryCode =
    cleanText(
      input.originCountryCode,
      3,
    ).toUpperCase() ||
    'KE';

  const packagingUnitCode =
    cleanText(
      input.packagingUnitCode,
      5,
    ).toUpperCase();

  const quantityUnitCode =
    cleanText(
      input.quantityUnitCode,
      5,
    ).toUpperCase();

  if (
    !itemClassCode ||
    !itemCode ||
    !packagingUnitCode ||
    !quantityUnitCode
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'KRA item class, item code, packaging unit and quantity unit are required.',
    );
  }

  const exists =
    await context.pool.query(
      `
        SELECT id
        FROM invoicing_catalog_items
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        catalogItemId,
        context.companyId,
      ],
    );

  if (
    exists.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid Invoicing catalog item.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_etims_item_mappings (
          company_id,
          catalog_item_id,
          item_classification_code,
          item_code,
          item_type_code,
          origin_country_code,
          packaging_unit_code,
          quantity_unit_code,
          is_active,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
        )
        ON CONFLICT (company_id, catalog_item_id)
        DO UPDATE SET
          item_classification_code =
            EXCLUDED.item_classification_code,
          item_code =
            EXCLUDED.item_code,
          item_type_code =
            EXCLUDED.item_type_code,
          origin_country_code =
            EXCLUDED.origin_country_code,
          packaging_unit_code =
            EXCLUDED.packaging_unit_code,
          quantity_unit_code =
            EXCLUDED.quantity_unit_code,
          is_active =
            EXCLUDED.is_active,
          kra_sync_status =
            CASE
              WHEN invoicing_etims_item_mappings.item_classification_code = EXCLUDED.item_classification_code
               AND invoicing_etims_item_mappings.item_code = EXCLUDED.item_code
               AND invoicing_etims_item_mappings.item_type_code = EXCLUDED.item_type_code
               AND invoicing_etims_item_mappings.origin_country_code = EXCLUDED.origin_country_code
               AND invoicing_etims_item_mappings.packaging_unit_code = EXCLUDED.packaging_unit_code
               AND invoicing_etims_item_mappings.quantity_unit_code = EXCLUDED.quantity_unit_code
              THEN invoicing_etims_item_mappings.kra_sync_status
              ELSE 'not_synced'
            END,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING id
      `,
      [
        context.companyId,
        catalogItemId,
        itemClassCode,
        itemCode,
        itemTypeCode,
        originCountryCode,
        packagingUnitCode,
        quantityUnitCode,
        input.isActive ===
          undefined
          ? true
          : bool(
              input.isActive,
            ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}



export async function syncEtimsItem(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const mappingId =
    requireUuid(
      input.mappingId,
      'eTIMS item mapping',
    );

  const client =
    await context.pool.connect();

  let profile:
    EtimsProfileRow;

  let row:
    Record<string, unknown>;

  try {
    profile =
      await loadProfile(
        client,
        context.companyId,
      );

    assertActivated(
      profile,
    );

    const result =
      await client.query(
        `
          SELECT
            mapping.id,
            mapping.item_classification_code,
            mapping.item_code,
            mapping.item_type_code,
            mapping.origin_country_code,
            mapping.packaging_unit_code,
            mapping.quantity_unit_code,
            item.id AS catalog_item_id,
            item.name,
            item.sku,
            item.unit_price,
            item.default_tax_rate_id,
            item.default_tax_group_id,
            taxmap.tax_type_code,
            COALESCE(
              (
                SELECT COUNT(*)
                FROM invoicing_tax_group_members member
                WHERE member.company_id = item.company_id
                  AND member.group_id = item.default_tax_group_id
              ),
              0
            )::int AS group_component_count
          FROM invoicing_etims_item_mappings mapping
          INNER JOIN invoicing_catalog_items item
            ON item.id = mapping.catalog_item_id
           AND item.company_id = mapping.company_id
           AND item.deleted_at IS NULL
          LEFT JOIN invoicing_etims_tax_mappings taxmap
            ON taxmap.company_id = item.company_id
           AND taxmap.is_active = TRUE
           AND (
             (
               item.default_tax_rate_id IS NOT NULL
               AND taxmap.tax_rate_id = item.default_tax_rate_id
             )
             OR
             (
               item.default_tax_group_id IS NOT NULL
               AND taxmap.tax_group_id = item.default_tax_group_id
             )
           )
          WHERE mapping.id = $1
            AND mapping.company_id = $2
            AND mapping.is_active = TRUE
          LIMIT 1
        `,
        [
          mappingId,
          context.companyId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'The eTIMS item mapping was not found.',
      );
    }

    row =
      result.rows[0];

    if (
      !row.tax_type_code
    ) {
      throw new InvoicingError(
        'ETIMS_MAPPING_REQUIRED',
        'Map this item default tax to a KRA tax type before registering the item.',
      );
    }

    if (
      Number(
        row.group_component_count ||
        0,
      ) >
      1
    ) {
      throw new InvoicingError(
        'ETIMS_MAPPING_REQUIRED',
        'KRA item registration accepts one tax type. This item uses a multi-component tax group.',
      );
    }
  } finally {
    client.release();
  }

  const payload = {
    tin:
      profile!.taxpayer_pin,
    bhfId:
      profile!.branch_id,
    itemClsCd:
      String(
        row!.item_classification_code,
      ),
    itemCd:
      String(
        row!.item_code,
      ),
    itemTyCd:
      String(
        row!.item_type_code,
      ),
    itemNm:
      cleanText(
        row!.name,
        200,
      ),
    itemStdNm:
      null,
    orgnNatCd:
      String(
        row!.origin_country_code,
      ),
    pkgUnitCd:
      String(
        row!.packaging_unit_code,
      ),
    qtyUnitCd:
      String(
        row!.quantity_unit_code,
      ),
    taxTyCd:
      String(
        row!.tax_type_code,
      ),
    btchNo:
      null,
    bcd:
      cleanText(
        row!.sku,
        20,
      ) ||
      null,
    dftPrc:
      money(
        row!.unit_price,
      ),
    grpPrcL1:
      null,
    grpPrcL2:
      null,
    grpPrcL3:
      null,
    grpPrcL4:
      null,
    grpPrcL5:
      null,
    addInfo:
      null,
    sftyQty:
      0,
    isrcAplcbYn:
      'N',
    useYn:
      'Y',
    regrId:
      context.userId,
    regrNm:
      'SaMi',
    modrId:
      context.userId,
    modrNm:
      'SaMi',
  };

  try {
    const remote =
      await etimsPost(
        profile!,
        'item_save',
        payload,
      );

    assertRemoteSuccess(
      remote,
    );

    await context.pool.query(
      `
        UPDATE invoicing_etims_item_mappings
        SET
          kra_sync_status = 'synced',
          kra_last_sync_at = NOW(),
          kra_result_code = $3,
          kra_result_message = $4,
          kra_response = $5::jsonb,
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        mappingId,
        context.companyId,
        remoteCode(
          remote.body,
        ),
        remoteMessage(
          remote.body,
        ),
        JSON.stringify(
          remote.body,
        ),
        context.userId,
      ],
    );

    return {
      mappingId,
      status:
        'synced',
      resultCode:
        remoteCode(
          remote.body,
        ),
    };
  } catch (
    error
  ) {
    const message =
      error instanceof
        Error
        ? error.message
        : 'KRA item registration failed.';

    const code =
      error instanceof
        InvoicingError
        ? error.code
        : 'ETIMS_SUBMISSION_FAILED';

    const details =
      error instanceof
        InvoicingError
        ? jsonObject(
            error
              .details
              .response,
          )
        : {};

    await context.pool.query(
      `
        UPDATE invoicing_etims_item_mappings
        SET
          kra_sync_status = 'failed',
          kra_last_sync_at = NOW(),
          kra_result_code = $3,
          kra_result_message = $4,
          kra_response = $5::jsonb,
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        mappingId,
        context.companyId,
        error instanceof
          InvoicingError
          ? cleanText(
              error
                .details
                .kraResultCode,
              120,
            ) ||
            code
          : code,
        message,
        JSON.stringify(
          details,
        ),
        context.userId,
      ],
    );

    throw error;
  }
}


export async function saveEtimsTaxMapping(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const taxRateId =
    optionalUuid(
      input.taxRateId,
    );

  const taxGroupId =
    optionalUuid(
      input.taxGroupId,
    );

  if (
    Boolean(
      taxRateId,
    ) ===
    Boolean(
      taxGroupId,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose exactly one SaMi tax rate or tax group.',
    );
  }

  const taxTypeCode =
    cleanText(
      input.taxTypeCode,
      1,
    ).toUpperCase() as
      EtimsTaxCode;

  if (
    !Object.prototype
      .hasOwnProperty.call(
        TAX_RATES,
        taxTypeCode,
      )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose KRA tax type A, B, C, D or E.',
    );
  }

  const source =
    taxRateId
      ? await context.pool.query(
          `
            SELECT
              id,
              rate,
              1::int AS component_count
            FROM invoicing_tax_rates
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            taxRateId,
            context.companyId,
          ],
        )
      : await context.pool.query(
          `
            SELECT
              grp.id,
              COUNT(member.id)::int
                AS component_count,
              MAX(rate.rate)
                AS rate
            FROM invoicing_tax_groups grp
            LEFT JOIN invoicing_tax_group_members member
              ON member.group_id = grp.id
             AND member.company_id = grp.company_id
            LEFT JOIN invoicing_tax_rates rate
              ON rate.id = member.tax_rate_id
             AND rate.company_id = member.company_id
             AND rate.deleted_at IS NULL
            WHERE grp.id = $1
              AND grp.company_id = $2
              AND grp.deleted_at IS NULL
            GROUP BY grp.id
            LIMIT 1
          `,
          [
            taxGroupId,
            context.companyId,
          ],
        );

  if (
    source.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose a valid tax source.',
    );
  }

  if (
    Number(
      source.rows[0]
        .component_count ||
      0,
    ) !==
      1
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'KRA eTIMS accepts one A-E tax type per invoice item. Map a single tax rate or a one-component tax group.',
    );
  }

  const sourceRate =
    money(
      source.rows[0]
        .rate,
    );

  if (
    Math.abs(
      sourceRate -
      TAX_RATES[
        taxTypeCode
      ],
    ) >
      0.0001
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'The selected SaMi tax rate does not match the KRA tax type rate.',
      {
        samiRate:
          sourceRate,
        kraRate:
          TAX_RATES[
            taxTypeCode
          ],
        taxTypeCode,
      },
    );
  }

  const existing =
    taxRateId
      ? await context.pool.query(
          `
            SELECT id
            FROM invoicing_etims_tax_mappings
            WHERE company_id = $1
              AND tax_rate_id = $2
            LIMIT 1
          `,
          [
            context.companyId,
            taxRateId,
          ],
        )
      : await context.pool.query(
          `
            SELECT id
            FROM invoicing_etims_tax_mappings
            WHERE company_id = $1
              AND tax_group_id = $2
            LIMIT 1
          `,
          [
            context.companyId,
            taxGroupId,
          ],
        );

  if (
    existing.rows.length >
      0
  ) {
    await context.pool.query(
      `
        UPDATE invoicing_etims_tax_mappings
        SET
          tax_type_code = $3,
          kra_rate = $4,
          is_active = $5,
          updated_by = $6,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        existing.rows[0].id,
        context.companyId,
        taxTypeCode,
        TAX_RATES[
          taxTypeCode
        ],
        input.isActive ===
          undefined
          ? true
          : bool(
              input.isActive,
            ),
        context.userId,
      ],
    );

    return {
      id:
        String(
          existing.rows[0].id,
        ),
    };
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO invoicing_etims_tax_mappings (
          company_id,
          tax_rate_id,
          tax_group_id,
          tax_type_code,
          kra_rate,
          is_active,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$7
        )
        RETURNING id
      `,
      [
        context.companyId,
        taxRateId,
        taxGroupId,
        taxTypeCode,
        TAX_RATES[
          taxTypeCode
        ],
        input.isActive ===
          undefined
          ? true
          : bool(
              input.isActive,
            ),
        context.userId,
      ],
    );

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}


export async function initializeEtimsDevice() {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const client =
    await context.pool.connect();

  let profile:
    EtimsProfileRow;

  try {
    profile =
      await loadProfile(
        client,
        context.companyId,
      );
  } finally {
    client.release();
  }

  if (
    profile.solution_type ===
      'oscu' &&
    !isIntegrationEncryptionConfigured()
  ) {
    throw new InvoicingError(
      'ETIMS_NOT_CONFIGURED',
      'OSCU activation requires the SaMi integration encryption key so the KRA communication key can be stored securely.',
    );
  }

  const remote =
    await etimsPost(
      profile,
      'initialize',
      {
        tin:
          profile.taxpayer_pin,
        bhfId:
          profile.branch_id,
        dvcSrlNo:
          profile
            .device_serial_number,
      },
    );

  assertRemoteSuccess(
    remote,
  );

  const data =
    jsonObject(
      remote.body.data,
    );

  const sdcId =
    cleanText(
      data.sdcId,
      120,
    ) ||
    findStringDeep(
      remote.body,
      new Set([
        'sdcid',
      ]),
    ) ||
    null;

  const mrcNo =
    cleanText(
      data.mrcNo,
      120,
    ) ||
    findStringDeep(
      remote.body,
      new Set([
        'mrcno',
      ]),
    ) ||
    null;

  const rawCommunicationKey =
    profile.solution_type ===
      'oscu'
      ? findStringDeep(
          remote.body,
          new Set([
            'cmckey',
            'communicationkey',
            'commkey',
          ]),
        )
      : null;

  const sealedCommunicationKey =
    rawCommunicationKey
      ? sealIntegrationSecret({
          communicationKey:
            rawCommunicationKey,
        })
      : null;

  if (
    profile.solution_type ===
      'oscu' &&
    !sealedCommunicationKey
  ) {
    throw new InvoicingError(
      'ETIMS_SUBMISSION_FAILED',
      'KRA approved the OSCU initialization but did not return a communication key.',
    );
  }

  await context.pool.query(
    `
      UPDATE invoicing_etims_profiles
      SET
        status = 'activated',
        initialization_payload = $2::jsonb,
        kra_sdc_id = COALESCE($3, kra_sdc_id),
        kra_mrc_no = COALESCE($4, kra_mrc_no),
        communication_key_sealed =
          COALESCE(
            $5,
            communication_key_sealed
          ),
        communication_key_version =
          COALESCE(
            $6,
            communication_key_version
          ),
        last_device_init_at = NOW(),
        last_error_at = NULL,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_by = $7,
        updated_at = NOW()
      WHERE company_id = $1
    `,
    [
      context.companyId,
      JSON.stringify(
        remote.body,
      ),
      sdcId,
      mrcNo,
      sealedCommunicationKey
        ?.sealed ||
      null,
      sealedCommunicationKey
        ?.version ||
      null,
      context.userId,
    ],
  );

  return {
    status:
      'activated',
    resultCode:
      remoteCode(
        remote.body,
      ),
    sdcId,
    mrcNo,
  };
}


export async function syncEtimsReferenceData() {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const client =
    await context.pool.connect();

  let profile:
    EtimsProfileRow;

  try {
    profile =
      await loadProfile(
        client,
        context.companyId,
      );
  } finally {
    client.release();
  }

  assertActivated(
    profile,
  );

  const synced:
    Array<{
      type: string;
      resultCode: string;
    }> =
      [];

  for (
    const operation
    of REFERENCE_OPERATIONS
  ) {
    const remote =
      await etimsPost(
        profile,
        operation,
        {
          tin:
            profile.taxpayer_pin,
          bhfId:
            profile.branch_id,
          lastReqDt:
            '19700101000000',
        },
      );

    assertRemoteSuccess(
      remote,
    );

    await context.pool.query(
      `
        INSERT INTO invoicing_etims_reference_cache (
          company_id,
          reference_type,
          external_key,
          payload,
          source_updated_at,
          synced_at,
          updated_by
        )
        VALUES (
          $1,$2,'snapshot',$3::jsonb,NOW(),NOW(),$4
        )
        ON CONFLICT (
          company_id,
          reference_type,
          external_key
        )
        DO UPDATE SET
          payload = EXCLUDED.payload,
          source_updated_at = EXCLUDED.source_updated_at,
          synced_at = NOW(),
          updated_by = EXCLUDED.updated_by
      `,
      [
        context.companyId,
        operation,
        JSON.stringify(
          remote.body,
        ),
        context.userId,
      ],
    );

    synced.push({
      type:
        operation,
      resultCode:
        remoteCode(
          remote.body,
        ),
    });
  }

  await context.pool.query(
    `
      UPDATE invoicing_etims_profiles
      SET
        last_reference_sync_at = NOW(),
        last_error_at = NULL,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_by = $2,
        updated_at = NOW()
      WHERE company_id = $1
    `,
    [
      context.companyId,
      context.userId,
    ],
  );

  return {
    synced,
  };
}


async function invoiceFiscalizationSource(
  client:
    PoolClient,
  companyId:
    string,
  invoiceId:
    string,
) {
  const invoice =
    await client.query(
      `
        SELECT
          invoice.id,
          invoice.invoice_number,
          invoice.invoice_date,
          invoice.status,
          invoice.currency,
          invoice.total_amount,
          invoice.customer_id,
          customer.name AS customer_name,
          customer.tax_id AS customer_tax_id
        FROM invoicing_invoices invoice
        INNER JOIN invoicing_customers customer
          ON customer.id = invoice.customer_id
         AND customer.company_id = invoice.company_id
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
    invoice.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const row =
    invoice.rows[0];

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
      'Only confirmed or later invoices can be fiscalized.',
    );
  }

  if (
    String(
      row.currency,
    ) !==
      'KES'
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'This eTIMS connector currently fiscalizes KES documents only because the selected KRA sales payload does not carry an invoice currency. Convert or issue the fiscal document in KES.',
    );
  }

  const lines =
    await client.query(
      `
        SELECT
          item.id,
          item.catalog_item_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.tax_rate_id,
          item.tax_group_id,
          item.tax_amount,
          item.tax_components,
          item.subtotal,
          item.line_total,
          map.item_classification_code,
          map.item_code,
          map.origin_country_code,
          map.packaging_unit_code,
          map.quantity_unit_code,
          map.kra_sync_status,
          taxmap.tax_type_code,
          taxmap.kra_rate
        FROM invoicing_invoice_items item
        LEFT JOIN invoicing_etims_item_mappings map
          ON map.company_id = item.company_id
         AND map.catalog_item_id = item.catalog_item_id
         AND map.is_active = TRUE
        LEFT JOIN invoicing_etims_tax_mappings taxmap
          ON taxmap.company_id = item.company_id
         AND taxmap.is_active = TRUE
         AND (
           (
             item.tax_rate_id IS NOT NULL
             AND taxmap.tax_rate_id = item.tax_rate_id
           )
           OR
           (
             item.tax_group_id IS NOT NULL
             AND taxmap.tax_group_id = item.tax_group_id
           )
         )
        WHERE item.invoice_id = $1
          AND item.company_id = $2
        ORDER BY item.sort_order, item.id
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  if (
    lines.rows.length <
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The invoice has no lines to fiscalize.',
    );
  }

  return {
    invoice:
      row,
    lines:
      lines.rows,
  };
}


export async function submitInvoiceToEtims(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .INVOICE_SEND,
    );

  const invoiceId =
    requireUuid(
      input.invoiceId,
      'Invoice',
    );

  const client =
    await context.pool.connect();

  let profile:
    EtimsProfileRow;

  let prepared:
    Awaited<
      ReturnType<
        typeof invoiceFiscalizationSource
      >
    >;

  let submission:
    {
      row:
        Record<string, unknown>;
      payload:
        Record<string, unknown>;
    };

  try {
    await client.query(
      'BEGIN',
    );

    profile =
      await loadProfile(
        client,
        context.companyId,
        true,
      );

    assertActivated(
      profile,
    );

    prepared =
      await invoiceFiscalizationSource(
        client,
        context.companyId,
        invoiceId,
      );

    const items =
      prepared.lines.map(
        (
          line,
          index,
        ) =>
          buildItemPayload(
            line,
            index,
          ),
      );

    const payload =
      baseSalesPayload({
        profile,
        transactionInvoiceNo:
          1,
        traderInvoiceNumber:
          String(
            prepared
              .invoice
              .invoice_number,
          ),
        customerPin:
          optionalPin(
            prepared
              .invoice
              .customer_tax_id,
          ),
        customerName:
          cleanText(
            prepared
              .invoice
              .customer_name,
            200,
          ),
        transactionDate:
          String(
            prepared
              .invoice
              .invoice_date,
          ),
        paymentTypeCode:
          paymentCode(
            input.paymentTypeCode,
            profile
              .default_payment_type_code,
          ),
        receiptTypeCode:
          'S',
        originalInvoiceNo:
          0,
        remark:
          'SaMi invoice ' +
          String(
            prepared
              .invoice
              .invoice_number,
          ),
        items,
        userId:
          context.userId,
      });

    submission =
      await upsertSubmission(
        client,
        {
          companyId:
            context.companyId,
          invoiceId,
          sourceKey:
            'sale:' +
            invoiceId,
          submissionType:
            'sale',
          profile,
          payload,
          userId:
            context.userId,
        },
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

    throw error;
  } finally {
    client.release();
  }

  const result =
    await transmitSubmission(
      context,
      profile!,
      submission!.row,
      submission!.payload,
    );

  let documentSnapshotReady =
    false;

  if (
    result.status ===
      'succeeded'
  ) {
    try {
      await ensureFiscalizedInvoiceDocumentSnapshot(
        context.pool,
        {
          companyId:
            context.companyId,
          invoiceId,
          userId:
            context.userId,
        },
      );

      documentSnapshotReady =
        true;
    } catch {
      // KRA already accepted the sale. Do not convert an authority success
      // into a failed/retryable fiscal submission because PDF rendering failed.
      // Official delivery retries snapshot promotion before sending.
    }
  }

  return {
    ...result,
    documentSnapshotReady,
  };
}


async function creditFiscalizationSource(
  client:
    PoolClient,
  companyId:
    string,
  creditNoteId:
    string,
) {
  const credit =
    await client.query(
      `
        SELECT
          credit.id,
          credit.credit_note_number,
          credit.issue_date,
          credit.status,
          credit.currency,
          credit.total_amount,
          credit.invoice_id,
          credit.reason,
          customer.name AS customer_name,
          customer.tax_id AS customer_tax_id,
          original.transaction_invoice_no
            AS original_transaction_invoice_no,
          original.solution_type
            AS original_solution_type,
          original.environment
            AS original_environment,
          original.request_payload ->> 'bhfId'
            AS original_branch_id,
          original.request_payload ->> 'tin'
            AS original_taxpayer_pin
        FROM invoicing_credit_notes credit
        INNER JOIN invoicing_customers customer
          ON customer.id = credit.customer_id
         AND customer.company_id = credit.company_id
        INNER JOIN invoicing_etims_submissions original
          ON original.company_id = credit.company_id
         AND original.invoice_id = credit.invoice_id
         AND original.submission_type = 'sale'
         AND original.status = 'succeeded'
        WHERE credit.id = $1
          AND credit.company_id = $2
          AND credit.deleted_at IS NULL
          AND credit.status <> 'cancelled'
        LIMIT 1
      `,
      [
        creditNoteId,
        companyId,
      ],
    );

  if (
    credit.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'The credit note must belong to an invoice that was successfully fiscalized in eTIMS.',
    );
  }

  const row =
    credit.rows[0];

  if (
    String(
      row.currency,
    ) !==
      'KES'
  ) {
    throw new InvoicingError(
      'ETIMS_MAPPING_REQUIRED',
      'This eTIMS connector currently fiscalizes KES credit notes only.',
    );
  }

  const lines =
    await client.query(
      `
        SELECT
          credit_item.id,
          invoice_item.catalog_item_id,
          credit_item.description,
          credit_item.quantity,
          credit_item.unit_price,
          credit_item.discount_amount,
          invoice_item.tax_rate_id,
          invoice_item.tax_group_id,
          credit_item.tax_amount,
          invoice_item.tax_components,
          JSONB_ARRAY_LENGTH(
            COALESCE(
              invoice_item.tax_components,
              '[]'::jsonb
            )
          ) AS tax_component_count,
          CASE
            WHEN source_invoice.tax_calculation = 'inclusive'
            THEN GREATEST(
              credit_item.line_total - credit_item.tax_amount,
              0
            )
            ELSE GREATEST(
              credit_item.subtotal - credit_item.discount_amount,
              0
            )
          END AS taxable_amount_override,
          credit_item.subtotal,
          credit_item.line_total,
          map.item_classification_code,
          map.item_code,
          map.origin_country_code,
          map.packaging_unit_code,
          map.quantity_unit_code,
          map.kra_sync_status,
          taxmap.tax_type_code,
          taxmap.kra_rate
        FROM invoicing_credit_note_items credit_item
        INNER JOIN invoicing_credit_notes credit_doc
          ON credit_doc.id = credit_item.credit_note_id
         AND credit_doc.company_id = credit_item.company_id
        INNER JOIN invoicing_invoices source_invoice
          ON source_invoice.id = credit_doc.invoice_id
         AND source_invoice.company_id = credit_item.company_id
        LEFT JOIN invoicing_invoice_items invoice_item
          ON invoice_item.id = credit_item.invoice_item_id
         AND invoice_item.company_id = credit_item.company_id
        LEFT JOIN invoicing_etims_item_mappings map
          ON map.company_id = credit_item.company_id
         AND map.catalog_item_id = invoice_item.catalog_item_id
         AND map.is_active = TRUE
        LEFT JOIN invoicing_etims_tax_mappings taxmap
          ON taxmap.company_id = credit_item.company_id
         AND taxmap.is_active = TRUE
         AND (
           (
             invoice_item.tax_rate_id IS NOT NULL
             AND taxmap.tax_rate_id = invoice_item.tax_rate_id
           )
           OR
           (
             invoice_item.tax_group_id IS NOT NULL
             AND taxmap.tax_group_id = invoice_item.tax_group_id
           )
         )
        WHERE credit_item.credit_note_id = $1
          AND credit_item.company_id = $2
        ORDER BY credit_item.created_at, credit_item.id
      `,
      [
        creditNoteId,
        companyId,
      ],
    );

  if (
    lines.rows.length <
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The credit note has no lines to fiscalize.',
    );
  }

  return {
    credit:
      row,
    lines:
      lines.rows,
  };
}


export async function submitCreditNoteToEtims(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .CREDIT_NOTE_MANAGE,
    );

  const creditNoteId =
    requireUuid(
      input.creditNoteId,
      'Credit note',
    );

  const reasonCode =
    creditReasonCode(
      input.reasonCode,
    );

  const client =
    await context.pool.connect();

  let profile:
    EtimsProfileRow;

  let submission:
    {
      row:
        Record<string, unknown>;
      payload:
        Record<string, unknown>;
    };

  try {
    await client.query(
      'BEGIN',
    );

    profile =
      await loadProfile(
        client,
        context.companyId,
        true,
      );

    assertActivated(
      profile,
    );

    const prepared =
      await creditFiscalizationSource(
        client,
        context.companyId,
        creditNoteId,
      );

    if (
      String(
        prepared
          .credit
          .original_solution_type,
      ) !==
        profile.solution_type ||
      String(
        prepared
          .credit
          .original_environment,
      ) !==
        profile.environment ||
      String(
        prepared
          .credit
          .original_branch_id ||
        '',
      ) !==
        profile.branch_id ||
      String(
        prepared
          .credit
          .original_taxpayer_pin ||
        '',
      ) !==
        profile.taxpayer_pin
    ) {
      throw new InvoicingError(
        'ETIMS_MAPPING_REQUIRED',
        'The credit note must be fiscalized using the same eTIMS solution, environment, taxpayer PIN and branch as the original invoice.',
      );
    }

    const items =
      prepared.lines.map(
        (
          line,
          index,
        ) =>
          buildItemPayload(
            line,
            index,
          ),
      );

    const payload =
      baseSalesPayload({
        profile,
        transactionInvoiceNo:
          1,
        traderInvoiceNumber:
          String(
            prepared
              .credit
              .credit_note_number,
          ),
        customerPin:
          optionalPin(
            prepared
              .credit
              .customer_tax_id,
          ),
        customerName:
          cleanText(
            prepared
              .credit
              .customer_name,
            200,
          ),
        transactionDate:
          String(
            prepared
              .credit
              .issue_date,
          ),
        paymentTypeCode:
          paymentCode(
            input.paymentTypeCode,
            profile
              .default_payment_type_code,
          ),
        receiptTypeCode:
          'R',
        originalInvoiceNo:
          Number(
            prepared
              .credit
              .original_transaction_invoice_no,
          ),
        remark:
          cleanText(
            prepared
              .credit
              .reason,
            400,
          ) ||
          'SaMi credit note ' +
          String(
            prepared
              .credit
              .credit_note_number,
          ),
        items,
        refundReasonCode:
          reasonCode,
        refundDate:
          String(
            prepared
              .credit
              .issue_date,
          ),
        userId:
          context.userId,
      });

    submission =
      await upsertSubmission(
        client,
        {
          companyId:
            context.companyId,
          creditNoteId,
          sourceKey:
            'credit_note:' +
            creditNoteId,
          submissionType:
            'credit_note',
          profile,
          payload,
          userId:
            context.userId,
        },
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

    throw error;
  } finally {
    client.release();
  }

  return transmitSubmission(
    context,
    profile!,
    submission!.row,
    submission!.payload,
  );
}

export async function assertEtimsDeliveryReady(
  queryable:
    Pool |
    PoolClient,
  input: {
    companyId:
      string;
    invoiceId:
      string;
  },
) {
  const result =
    await queryable.query(
      `
        SELECT
          profile.status
            AS profile_status,
          profile.environment,
          profile.solution_type,
          submission.status
            AS submission_status,
          submission.transaction_invoice_no,
          submission.kra_result_code,
          submission.receipt_no,
          submission.total_receipt_no,
          submission.sdc_id,
          submission.mrc_no,
          submission.receipt_signature,
          submission.succeeded_at
        FROM invoicing_etims_profiles profile
        LEFT JOIN invoicing_etims_submissions submission
          ON submission.company_id =
             profile.company_id
         AND submission.invoice_id =
             $2
         AND submission.submission_type =
             'sale'
        WHERE profile.company_id =
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
    String(
      row.environment ||
      '',
    ) !==
      'production'
  ) {
    return null;
  }

  if (
    String(
      row.profile_status ||
      '',
    ) !==
      'activated'
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Production eTIMS is configured for this company. Activate the KRA device before delivering official invoices.',
      {
        etimsStatus:
          row.profile_status ||
          'configured',
      },
    );
  }

  const accepted =
    String(
      row.submission_status ||
      '',
    ) ===
      'succeeded' &&
    String(
      row.kra_result_code ||
      '',
    ) ===
      '000' &&
    Number(
      row.transaction_invoice_no ||
      0,
    ) >
      0 &&
    Number(
      row.receipt_no ||
      0,
    ) >
      0 &&
    Boolean(
      cleanText(
        row.receipt_signature,
        10000,
      ),
    );

  if (!accepted) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This invoice cannot be delivered as an official receipt until KRA eTIMS returns a successful fiscal receipt.',
      {
        etimsStatus:
          row.submission_status ||
          'not_submitted',
        kraResultCode:
          row.kra_result_code ||
          null,
      },
    );
  }

  return {
    solutionType:
      String(
        row.solution_type,
      ),
    environment:
      'production' as const,
    transactionInvoiceNo:
      Number(
        row.transaction_invoice_no,
      ),
    receiptNo:
      Number(
        row.receipt_no,
      ),
    totalReceiptNo:
      row.total_receipt_no
        ? Number(
            row.total_receipt_no,
          )
        : null,
    sdcId:
      row.sdc_id
        ? String(
            row.sdc_id,
          )
        : null,
    mrcNo:
      row.mrc_no
        ? String(
            row.mrc_no,
          )
        : null,
    receiptSignature:
      String(
        row.receipt_signature,
      ),
    succeededAt:
      row.succeeded_at ||
      null,
  };
}

