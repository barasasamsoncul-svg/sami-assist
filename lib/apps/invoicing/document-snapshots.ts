import 'server-only';

import crypto from 'crypto';

import type {
  Pool,
  PoolClient,
} from 'pg';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  InvoicingError,
  money,
  recordInvoicingActivity,
} from '@/lib/apps/invoicing/context';

import {
  INVOICE_PDF_RENDERER_VERSION,
  renderInvoicePdf,
  type PdfInvoice,
} from '@/lib/apps/invoicing/pdf';


export type InvoiceSnapshotReason =
  | 'confirmed'
  | 'delivery'
  | 'legacy_backfill'
  | 'manual';


export type InvoiceDocumentSnapshot = {
  id: string;
  invoiceId: string;
  versionNo: number;
  isPrimary: boolean;
  reason: InvoiceSnapshotReason;
  sourceStatus: string;
  rendererVersion: string;
  payloadSha256: string;
  pdfSha256: string;
  pdfSizeBytes: number;
  createdAt: string;
  createdBy: string | null;
  pdf: Buffer;
  payload: PdfInvoice;
};


type Queryable =
  Pick<
    Pool,
    'query'
  > |
  Pick<
    PoolClient,
    'query'
  >;


function sha256(
  value:
    Buffer |
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
    )
    .digest(
      'hex',
    );
}


function dateOnly(
  value:
    unknown,
) {
  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  return String(
    value ||
    '',
  )
    .slice(
      0,
      10,
    );
}


function snapshotFromRow(
  row:
    Record<
      string,
      unknown
    >,
):
  InvoiceDocumentSnapshot {
  const rawPayload =
    row.payload;

  const payload =
    (
      rawPayload &&
      typeof rawPayload ===
        'object' &&
      !Array.isArray(
        rawPayload,
      )
    )
      ? rawPayload as
          PdfInvoice
      : JSON.parse(
          String(
            rawPayload ||
            '{}',
          ),
        ) as PdfInvoice;

  const pdf =
    Buffer.isBuffer(
      row.pdf_bytes,
    )
      ? row.pdf_bytes
      : Buffer.from(
          row.pdf_bytes as
            Uint8Array,
        );

  return {
    id:
      String(
        row.id,
      ),
    invoiceId:
      String(
        row.invoice_id,
      ),
    versionNo:
      Number(
        row.version_no,
      ),
    isPrimary:
      row.is_primary ===
      true,
    reason:
      String(
        row.snapshot_reason,
      ) as
        InvoiceSnapshotReason,
    sourceStatus:
      String(
        row.invoice_status,
      ),
    rendererVersion:
      String(
        row.renderer_version,
      ),
    payloadSha256:
      String(
        row.payload_sha256,
      ),
    pdfSha256:
      String(
        row.pdf_sha256,
      ),
    pdfSizeBytes:
      Number(
        row.pdf_size_bytes,
      ),
    createdAt:
      new Date(
        String(
          row.created_at,
        ),
      )
        .toISOString(),
    createdBy:
      row.created_by
        ? String(
            row.created_by,
          )
        : null,
    pdf,
    payload,
  };
}


async function loadIssuedInvoicePayload(
  queryable:
    Queryable,
  companyId:
    string,
  invoiceId:
    string,
) {
  const invoiceResult =
    await queryable.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.invoice_date,
          i.due_date,
          i.service_date,
          i.currency,
          i.reference,
          i.purchase_order_number,
          i.payment_terms_name_snapshot,
          i.tax_calculation,
          i.subtotal,
          i.discount_total,
          i.tax_total,
          i.shipping_total,
          i.rounding_adjustment,
          i.total_amount,
          i.notes,
          i.terms,
          i.payment_instructions,
          i.confirmed_at,
          COALESCE(
            i.bill_to_name,
            customer.name
          )
            AS customer_name,
          COALESCE(
            i.bill_to_email,
            customer.email
          )
            AS customer_email,
          COALESCE(
            i.bill_to_phone,
            customer.phone
          )
            AS customer_phone,
          COALESCE(
            i.bill_to_tax_id,
            customer.tax_id
          )
            AS customer_tax_id,
          COALESCE(
            i.bill_to_address,
            customer.billing_address
          )
            AS billing_address,
          COALESCE(
            i.ship_to_address,
            customer.shipping_address
          )
            AS shipping_address,
          COALESCE(
            company.legal_name,
            company.name
          )
            AS company_name,
          company.email
            AS company_email,
          company.phone
            AS company_phone,
          COALESCE(
            NULLIF(
              CONCAT_WS(
                ', ',
                company.address_line1,
                company.address_line2,
                company.city,
                company.country
              ),
              ''
            ),
            company.address
          )
            AS company_address,
          company.tax_id
            AS company_tax_id,
          company.registration_number
            AS company_registration_number,
          COALESCE(
            template.layout,
            'modern'
          )
            AS template_layout,
          COALESCE(
            template.primary_color,
            '#164a9f'
          )
            AS primary_color,
          COALESCE(
            template.secondary_color,
            '#0f172a'
          )
            AS secondary_color,
          COALESCE(
            template.font_family,
            'Inter'
          )
            AS font_family,
          COALESCE(
            template.design_version,
            1
          )
            AS design_version,
          COALESCE(
            template.density,
            'comfortable'
          )
            AS density,
          COALESCE(
            template.header_style,
            'band'
          )
            AS header_style,
          COALESCE(
            template.document_title,
            'Invoice'
          )
            AS document_title,
          COALESCE(
            template.from_label,
            'From'
          )
            AS from_label,
          COALESCE(
            template.bill_to_label,
            'Bill to'
          )
            AS bill_to_label,
          COALESCE(
            template.notes_label,
            'Notes'
          )
            AS notes_label,
          COALESCE(
            template.terms_label,
            'Terms'
          )
            AS terms_label,
          COALESCE(
            template.payment_label,
            'Payment instructions'
          )
            AS payment_label,
          COALESCE(
            template.footer_alignment,
            'left'
          )
            AS footer_alignment,
          COALESCE(
            template.show_status,
            TRUE
          )
            AS show_status,
          COALESCE(
            template.show_page_numbers,
            TRUE
          )
            AS show_page_numbers,
          COALESCE(
            template.show_sku,
            TRUE
          )
            AS show_sku,
          COALESCE(
            template.show_unit,
            TRUE
          )
            AS show_unit,
          COALESCE(
            template.show_quantity,
            TRUE
          )
            AS show_quantity,
          COALESCE(
            template.show_unit_price,
            TRUE
          )
            AS show_unit_price,
          COALESCE(
            template.show_line_tax,
            TRUE
          )
            AS show_line_tax,
          COALESCE(
            template.show_line_discount,
            TRUE
          )
            AS show_line_discount,
          COALESCE(
            template.show_company_address,
            TRUE
          )
            AS show_company_address,
          COALESCE(
            template.show_company_contact,
            TRUE
          )
            AS show_company_contact,
          COALESCE(
            template.show_tax_id,
            TRUE
          )
            AS show_tax_id,
          COALESCE(
            template.show_payment_instructions,
            TRUE
          )
            AS show_payment_instructions,
          COALESCE(
            template.show_tax_breakdown,
            TRUE
          )
            AS show_tax_breakdown,
          COALESCE(
            template.show_discount,
            TRUE
          )
            AS show_discount,
          template.footer_text,
          template.terms_text,
          etims.status
            AS etims_status,
          etims.solution_type
            AS etims_solution_type,
          etims.environment
            AS etims_environment,
          etims.transaction_invoice_no
            AS etims_transaction_invoice_no,
          etims.receipt_no
            AS etims_receipt_no,
          etims.total_receipt_no
            AS etims_total_receipt_no,
          etims.sdc_id
            AS etims_sdc_id,
          etims.mrc_no
            AS etims_mrc_no,
          etims.internal_data
            AS etims_internal_data,
          etims.receipt_signature
            AS etims_receipt_signature,
          etims.verification_url
            AS etims_verification_url,
          etims.kra_result_code
            AS etims_result_code,
          etims.succeeded_at
            AS etims_succeeded_at
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers customer
          ON customer.id =
             i.customer_id
         AND customer.company_id =
             i.company_id
        INNER JOIN companies company
          ON company.id =
             i.company_id
        LEFT JOIN invoicing_templates template
          ON template.id =
             i.template_id
         AND template.company_id =
             i.company_id
         AND template.deleted_at
             IS NULL
        LEFT JOIN invoicing_etims_submissions etims
          ON etims.company_id =
             i.company_id
         AND etims.invoice_id =
             i.id
         AND etims.submission_type =
             'sale'
         AND etims.status =
             'succeeded'
        WHERE i.id =
              $1
          AND i.company_id =
              $2
          AND i.deleted_at
              IS NULL
        LIMIT 1
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

  const row =
    invoiceResult.rows[0];

  const sourceStatus =
    String(
      row.status,
    );

  if (
    [
      'draft',
      'pending_approval',
      'rejected',
    ].includes(
      sourceStatus,
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'Only an issued invoice can be archived as an immutable document snapshot.',
    );
  }

  const linesResult =
    await queryable.query(
      `
        SELECT
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          line_total
        FROM invoicing_invoice_items
        WHERE invoice_id =
              $1
          AND company_id =
              $2
        ORDER BY
          sort_order ASC,
          id ASC
      `,
      [
        invoiceId,
        companyId,
      ],
    );

  const totalAmount =
    money(
      row.total_amount,
    );

  const payload:
    PdfInvoice = {
      invoiceNumber:
        String(
          row.invoice_number,
        ),
      status:
        'issued',
      invoiceDate:
        dateOnly(
          row.invoice_date,
        ),
      dueDate:
        dateOnly(
          row.due_date,
        ),
      serviceDate:
        row.service_date
          ? dateOnly(
              row.service_date,
            )
          : null,
      currency:
        String(
          row.currency,
        ),
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
      paymentTermsName:
        row.payment_terms_name_snapshot
          ? String(
              row.payment_terms_name_snapshot,
            )
          : null,
      taxCalculation:
        row.tax_calculation ===
          'inclusive'
          ? 'inclusive'
          : 'exclusive',
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
      totalAmount,
      paidAmount:
        0,
      creditedAmount:
        0,
      balanceDue:
        totalAmount,
      notes:
        row.notes
          ? String(
              row.notes,
            )
          : null,
      terms:
        row.terms
          ? String(
              row.terms,
            )
          : null,
      paymentInstructions:
        row.payment_instructions
          ? String(
              row.payment_instructions,
            )
          : null,
      etims:
        row.etims_status ===
          'succeeded'
          ? {
              status:
                'succeeded',
              solutionType:
                row.etims_solution_type ===
                  'vscu'
                  ? 'vscu'
                  : 'oscu',
              environment:
                row.etims_environment ===
                  'production'
                  ? 'production'
                  : 'sandbox',
              transactionInvoiceNo:
                Number(
                  row.etims_transaction_invoice_no,
                ),
              receiptNo:
                row.etims_receipt_no
                  ? Number(
                      row.etims_receipt_no,
                    )
                  : null,
              totalReceiptNo:
                row.etims_total_receipt_no
                  ? Number(
                      row.etims_total_receipt_no,
                    )
                  : null,
              sdcId:
                row.etims_sdc_id
                  ? String(
                      row.etims_sdc_id,
                    )
                  : null,
              mrcNo:
                row.etims_mrc_no
                  ? String(
                      row.etims_mrc_no,
                    )
                  : null,
              internalData:
                row.etims_internal_data
                  ? String(
                      row.etims_internal_data,
                    )
                  : null,
              receiptSignature:
                row.etims_receipt_signature
                  ? String(
                      row.etims_receipt_signature,
                    )
                  : null,
              verificationUrl:
                row.etims_verification_url
                  ? String(
                      row.etims_verification_url,
                    )
                  : null,
              resultCode:
                row.etims_result_code
                  ? String(
                      row.etims_result_code,
                    )
                  : null,
              succeededAt:
                row.etims_succeeded_at
                  ? new Date(
                      row.etims_succeeded_at,
                    )
                      .toISOString()
                  : null,
            }
          : null,
      template: {
        layout:
          String(
            row.template_layout,
          ),
        primaryColor:
          String(
            row.primary_color,
          ),
        secondaryColor:
          String(
            row.secondary_color,
          ),
        fontFamily:
          String(
            row.font_family,
          ),
        designVersion:
          Number(
            row.design_version ||
            1,
          ),
        density:
          String(
            row.density ||
            'comfortable',
          ),
        headerStyle:
          String(
            row.header_style ||
            'band',
          ),
        documentTitle:
          String(
            row.document_title ||
            'Invoice',
          ),
        fromLabel:
          String(
            row.from_label ||
            'From',
          ),
        billToLabel:
          String(
            row.bill_to_label ||
            'Bill to',
          ),
        notesLabel:
          String(
            row.notes_label ||
            'Notes',
          ),
        termsLabel:
          String(
            row.terms_label ||
            'Terms',
          ),
        paymentLabel:
          String(
            row.payment_label ||
            'Payment instructions',
          ),
        footerAlignment:
          String(
            row.footer_alignment ||
            'left',
          ),
        showStatus:
          row.show_status !==
          false,
        showPageNumbers:
          row.show_page_numbers !==
          false,
        showSku:
          row.show_sku !==
          false,
        showUnit:
          row.show_unit !==
          false,
        showQuantity:
          row.show_quantity !==
          false,
        showUnitPrice:
          row.show_unit_price !==
          false,
        showLineTax:
          row.show_line_tax !==
          false,
        showLineDiscount:
          row.show_line_discount !==
          false,
        showCompanyAddress:
          row.show_company_address !==
          false,
        showCompanyContact:
          row.show_company_contact !==
          false,
        showTaxId:
          row.show_tax_id !==
          false,
        showPaymentInstructions:
          row.show_payment_instructions !==
          false,
        showTaxBreakdown:
          row.show_tax_breakdown !==
          false,
        showDiscount:
          row.show_discount !==
          false,
        footerText:
          row.footer_text
            ? String(
                row.footer_text,
              )
            : null,
        termsText:
          row.terms_text
            ? String(
                row.terms_text,
              )
            : null,
      },
      customer: {
        name:
          String(
            row.customer_name,
          ),
        email:
          row.customer_email
            ? String(
                row.customer_email,
              )
            : null,
        phone:
          row.customer_phone
            ? String(
                row.customer_phone,
              )
            : null,
        taxId:
          row.customer_tax_id
            ? String(
                row.customer_tax_id,
              )
            : null,
        billingAddress:
          row.billing_address
            ? String(
                row.billing_address,
              )
            : null,
        shippingAddress:
          row.shipping_address
            ? String(
                row.shipping_address,
              )
            : null,
      },
      company: {
        name:
          String(
            row.company_name,
          ),
        email:
          row.company_email
            ? String(
                row.company_email,
              )
            : null,
        phone:
          row.company_phone
            ? String(
                row.company_phone,
              )
            : null,
        address:
          row.company_address
            ? String(
                row.company_address,
              )
            : null,
        taxId:
          row.company_tax_id
            ? String(
                row.company_tax_id,
              )
            : null,
        registrationNumber:
          row.company_registration_number
            ? String(
                row.company_registration_number,
              )
            : null,
      },
      lines:
        linesResult.rows.map(
          line => ({
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
            quantity:
              money(
                line.quantity,
              ),
            unitPrice:
              money(
                line.unit_price,
              ),
            discountAmount:
              money(
                line.discount_amount,
              ),
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
            taxAmount:
              money(
                line.tax_amount,
              ),
            lineTotal:
              money(
                line.line_total,
              ),
          }),
        ),
    };

  return {
    payload,
    sourceStatus,
    confirmedAt:
      row.confirmed_at
        ? new Date(
            row.confirmed_at,
          )
            .toISOString()
        : null,
  };
}


async function existingPrimarySnapshot(
  queryable:
    Queryable,
  companyId:
    string,
  invoiceId:
    string,
) {
  const result =
    await queryable.query(
      `
        SELECT
          id,
          invoice_id,
          version_no,
          is_primary,
          snapshot_reason,
          invoice_status,
          renderer_version,
          payload,
          payload_sha256,
          pdf_bytes,
          pdf_sha256,
          pdf_size_bytes,
          created_by,
          created_at
        FROM invoicing_document_snapshots
        WHERE company_id =
              $1
          AND invoice_id =
              $2
          AND is_primary =
              TRUE
        LIMIT 1
      `,
      [
        companyId,
        invoiceId,
      ],
    );

  return result.rows[0]
    ? snapshotFromRow(
        result.rows[0],
      )
    : null;
}


export async function createPrimaryInvoiceDocumentSnapshot(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    invoiceId:
      string;
    userId:
      string |
      null;
    reason:
      InvoiceSnapshotReason;
    replacePrimary?:
      boolean;
  },
) {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext(
            $1
          )
        )
    `,
    [
      'invoicing-document-snapshot:' +
      input.invoiceId,
    ],
  );

  const existing =
    await existingPrimarySnapshot(
      client,
      input.companyId,
      input.invoiceId,
    );

  if (
    existing &&
    !input.replacePrimary
  ) {
    return existing;
  }

  const source =
    await loadIssuedInvoicePayload(
      client,
      input.companyId,
      input.invoiceId,
    );

  const payloadJson =
    JSON.stringify(
      source.payload,
    );

  const payloadSha256 =
    sha256(
      payloadJson,
    );

  const pdf =
    renderInvoicePdf(
      source.payload,
    );

  if (
    pdf.length >
      20 *
      1024 *
      1024
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Invoice PDF exceeds the 20 MB immutable snapshot limit.',
    );
  }

  const pdfSha256 =
    sha256(
      pdf,
    );

  const versionResult =
    await client.query(
      `
        SELECT
          COALESCE(
            MAX(version_no),
            0
          ) + 1
            AS next_version
        FROM invoicing_document_snapshots
        WHERE company_id =
              $1
          AND invoice_id =
              $2
      `,
      [
        input.companyId,
        input.invoiceId,
      ],
    );

  const versionNo =
    Number(
      versionResult.rows[0]
        ?.next_version ||
      1,
    );

  if (
    existing &&
    input.replacePrimary &&
    existing.pdfSha256 ===
      pdfSha256
  ) {
    return existing;
  }

  if (
    existing &&
    input.replacePrimary
  ) {
    await client.query(
      `
        UPDATE invoicing_document_snapshots
        SET is_primary = FALSE
        WHERE company_id = $1
          AND invoice_id = $2
          AND is_primary = TRUE
      `,
      [
        input.companyId,
        input.invoiceId,
      ],
    );
  }

  const inserted =
    await client.query(
      `
        INSERT INTO invoicing_document_snapshots (
          company_id,
          invoice_id,
          document_type,
          version_no,
          is_primary,
          snapshot_reason,
          invoice_status,
          renderer_version,
          payload,
          payload_sha256,
          pdf_bytes,
          pdf_sha256,
          pdf_size_bytes,
          created_by,
          metadata
        )
        VALUES (
          $1,$2,
          'invoice',
          $3,
          TRUE,
          $4,$5,$6,
          $7::jsonb,
          $8,$9,$10,$11,$12,
          jsonb_build_object(
            'immutable',
            TRUE,
            'confirmedAt',
            $13::text
          )
        )
        RETURNING
          id,
          invoice_id,
          version_no,
          is_primary,
          snapshot_reason,
          invoice_status,
          renderer_version,
          payload,
          payload_sha256,
          pdf_bytes,
          pdf_sha256,
          pdf_size_bytes,
          created_by,
          created_at
      `,
      [
        input.companyId,
        input.invoiceId,
        versionNo,
        input.reason,
        source.sourceStatus,
        INVOICE_PDF_RENDERER_VERSION,
        payloadJson,
        payloadSha256,
        pdf,
        pdfSha256,
        pdf.length,
        input.userId,
        source.confirmedAt,
      ],
    );

  const snapshot =
    snapshotFromRow(
      inserted.rows[0],
    );

  await recordInvoicingActivity(
    client,
    {
      companyId:
        input.companyId,
      userId:
        input.userId,
      invoiceId:
        input.invoiceId,
      type:
        'invoice.document_snapshot_created',
      content:
        'Immutable invoice document snapshot v' +
        snapshot.versionNo +
        ' created.',
      metadata: {
        snapshotId:
          snapshot.id,
        reason:
          snapshot.reason,
        pdfSha256:
          snapshot.pdfSha256,
        payloadSha256:
          snapshot.payloadSha256,
        rendererVersion:
          snapshot.rendererVersion,
        pdfSizeBytes:
          snapshot.pdfSizeBytes,
      },
    },
  );

  return snapshot;
}


export async function ensurePrimaryInvoiceDocumentSnapshot(
  pool:
    Pool,
  input: {
    companyId:
      string;
    invoiceId:
      string;
    userId:
      string |
      null;
    reason:
      InvoiceSnapshotReason;
  },
) {
  const existing =
    await existingPrimarySnapshot(
      pool,
      input.companyId,
      input.invoiceId,
    );

  if (
    existing
  ) {
    return existing;
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const snapshot =
      await createPrimaryInvoiceDocumentSnapshot(
        client,
        input,
      );

    await client.query(
      'COMMIT',
    );

    return snapshot;
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


export async function getInvoiceDocumentSnapshot(
  pool:
    Pool,
  input: {
    companyId:
      string;
    invoiceId:
      string;
    snapshotId?:
      string |
      null;
  },
) {
  const result =
    await pool.query(
      `
        SELECT
          id,
          invoice_id,
          version_no,
          is_primary,
          snapshot_reason,
          invoice_status,
          renderer_version,
          payload,
          payload_sha256,
          pdf_bytes,
          pdf_sha256,
          pdf_size_bytes,
          created_by,
          created_at
        FROM invoicing_document_snapshots
        WHERE company_id =
              $1
          AND invoice_id =
              $2
          AND (
            $3::uuid
              IS NULL
            OR id =
               $3::uuid
          )
        ORDER BY
          CASE
            WHEN is_primary =
                 TRUE
            THEN 0
            ELSE 1
          END,
          version_no DESC
        LIMIT 1
      `,
      [
        input.companyId,
        input.invoiceId,
        input.snapshotId ||
        null,
      ],
    );

  return result.rows[0]
    ? snapshotFromRow(
        result.rows[0],
      )
    : null;
}



export async function ensureFiscalizedInvoiceDocumentSnapshot(
  pool:
    Pool,
  input: {
    companyId:
      string;
    invoiceId:
      string;
    userId:
      string |
      null;
  },
) {
  const existing =
    await existingPrimarySnapshot(
      pool,
      input.companyId,
      input.invoiceId,
    );

  const etims =
    existing?.payload &&
    typeof existing.payload ===
      'object' &&
    !Array.isArray(
      existing.payload,
    )
      ? (
          existing.payload as
            Record<string, unknown>
        ).etims
      : null;

  if (
    etims &&
    typeof etims ===
      'object' &&
    !Array.isArray(
      etims,
    ) &&
    (
      etims as
        Record<string, unknown>
    ).status ===
      'succeeded'
  ) {
    return existing!;
  }

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const snapshot =
      await createPrimaryInvoiceDocumentSnapshot(
        client,
        {
          ...input,
          reason:
            'manual',
          replacePrimary:
            true,
        },
      );

    await client.query(
      'COMMIT',
    );

    return snapshot;
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


export async function ensureTenantInvoiceDocumentSnapshot(
  input: {
    tenantId:
      string;
    invoiceId:
      string;
    userId:
      string |
      null;
    reason:
      InvoiceSnapshotReason;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  const invoice =
    await pool.query(
      `
        SELECT
          company_id
        FROM invoicing_invoices
        WHERE id =
              $1
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
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

  return ensurePrimaryInvoiceDocumentSnapshot(
    pool,
    {
      companyId:
        String(
          invoice.rows[0]
            .company_id,
        ),
      invoiceId:
        input.invoiceId,
      userId:
        input.userId,
      reason:
        input.reason,
    },
  );
}
