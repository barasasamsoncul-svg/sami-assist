import 'server-only';

import crypto from 'crypto';

import type {
  Pool,
} from 'pg';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';

import {
  sendWorkspaceNotificationSms,
} from '@/lib/services/sms';

import {
  sendInvoiceWhatsApp,
} from '@/lib/services/whatsapp';

import {
  getPublicInvoice,
} from '@/lib/apps/invoicing/public';

import {
  renderInvoicePdf,
} from '@/lib/apps/invoicing/pdf';

import {
  InvoicingError,
  money,
  recordInvoicingActivity,
} from '@/lib/apps/invoicing/context';


export type InvoiceDeliveryChannel =
  | 'email'
  | 'whatsapp'
  | 'sms';


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
    )
    .digest(
      'hex',
    );
}


function publicBaseUrl() {
  const raw =
    process.env.APP_URL ||
    process.env
      .NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  return raw
    .replace(
      /\/+$/,
      '',
    );
}


export function normalizeInvoiceDeliveryChannels(
  input:
    unknown,
): InvoiceDeliveryChannel[] {
  const raw =
    Array.isArray(
      input,
    )
      ? input
      : [
          'email',
        ];

  const channels:
    InvoiceDeliveryChannel[] =
      [];

  for (
    const value
    of raw
  ) {
    const channel =
      String(
        value,
      )
        .trim()
        .toLowerCase();

    if (
      (
        channel ===
          'email' ||
        channel ===
          'whatsapp' ||
        channel ===
          'sms'
      ) &&
      !channels.includes(
        channel,
      )
    ) {
      channels.push(
        channel,
      );
    }
  }

  return channels;
}


export async function deliverInvoice(
  input: {
    pool:
      Pool;
    tenantId:
      string;
    companyId:
      string;
    companyName:
      string;
    userId:
      string |
      null;
    invoiceId:
      string;
    channels:
      InvoiceDeliveryChannel[];
    purpose?:
      'send' |
      'reminder' |
      'recurring';
  },
) {
  if (
    input.channels.length ===
      0
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Choose email, WhatsApp or SMS as an invoice delivery channel.',
    );
  }

  const result =
    await input.pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.total_amount,
          i.currency,
          COALESCE(
            i.bill_to_name,
            c.name
          )
            AS customer_name,
          COALESCE(
            i.bill_to_email,
            c.email
          )
            AS email,
          COALESCE(
            i.bill_to_phone,
            c.phone
          )
            AS phone
        FROM invoicing_invoices i
        INNER JOIN invoicing_customers c
          ON c.id =
             i.customer_id
        WHERE i.id =
              $1
          AND i.company_id =
              $2
          AND i.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        input.invoiceId,
        input.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVOICE_NOT_FOUND',
      'Invoice was not found.',
    );
  }

  const invoice =
    result.rows[0];

  if (
    [
      'paid',
      'cancelled',
      'void',
      'written_off',
    ].includes(
      String(
        invoice.status,
      ),
    )
  ) {
    throw new InvoicingError(
      'INVOICE_STATE_INVALID',
      'This invoice cannot be sent in its current state.',
    );
  }

  const token =
    crypto
      .randomBytes(
        32,
      )
      .toString(
        'base64url',
      );

  const tokenHash =
    sha256(
      token,
    );

  const publicPath =
    '/i/' +
    input.tenantId +
    '/' +
    token;

  const pdfPath =
    publicPath +
    '/pdf';

  const publicUrl =
    publicBaseUrl() +
    publicPath;

  const pdfUrl =
    publicBaseUrl() +
    pdfPath;

  await input.pool.query(
    `
      UPDATE invoicing_invoices
      SET
        public_token_hash =
          $3,
        public_enabled =
          TRUE,
        updated_by =
          $4,
        updated_at =
          NOW()
      WHERE id =
            $1
        AND company_id =
            $2
    `,
    [
      input.invoiceId,
      input.companyId,
      tokenHash,
      input.userId,
    ],
  );

  let pdf:
    Buffer;

  try {
    const publicInvoice =
      await getPublicInvoice(
        input.tenantId,
        token,
        {
          markViewed:
            false,
        },
      );

    pdf =
      renderInvoicePdf(
        publicInvoice,
      );
  } catch (
    error
  ) {
    await input.pool.query(
      `
        UPDATE invoicing_invoices
        SET
          public_token_hash =
            NULL,
          public_enabled =
            FALSE,
          updated_at =
            NOW()
        WHERE id =
              $1
          AND company_id =
              $2
          AND public_token_hash =
              $3
      `,
      [
        input.invoiceId,
        input.companyId,
        tokenHash,
      ],
    );

    throw error;
  }

  const caption =
    input.companyName +
    ' sent invoice ' +
    String(
      invoice.invoice_number,
    ) +
    ' for ' +
    String(
      invoice.currency,
    ) +
    ' ' +
    money(
      invoice.total_amount,
    ).toLocaleString() +
    '. View securely: ' +
    publicUrl;

  const filename =
    String(
      invoice.invoice_number,
    )
      .replace(
        /[^a-z0-9._-]+/gi,
        '-',
      )
      .slice(
        0,
        110,
      ) +
    '.pdf';

  const deliveries:
    Array<{
      channel:
        InvoiceDeliveryChannel;
      success:
        boolean;
      provider?:
        string;
      messageId?:
        string;
      errorCode?:
        string;
      fingerprint:
        string;
    }> =
      [];

  for (
    const channel
    of input.channels
  ) {
    if (
      channel ===
        'email'
    ) {
      if (
        !invoice.email
      ) {
        deliveries.push({
          channel:
            'email',
          success:
            false,
          errorCode:
            'EMAIL_MISSING',
          fingerprint:
            sha256(
              '',
            ),
        });

        continue;
      }

      try {
        const delivery =
          await sendWorkspaceNotificationEmail(
            String(
              invoice.email,
            ),
            String(
              invoice.customer_name,
            ),
            {
              title:
                'Invoice ' +
                String(
                  invoice.invoice_number,
                ),
              message:
                caption,
              actionHref:
                publicPath,
              actionLabel:
                'View invoice',
              attachments: [
                {
                  filename,
                  content:
                    pdf,
                  contentType:
                    'application/pdf',
                },
              ],
            },
          );

        deliveries.push({
          channel:
            'email',
          success:
            delivery.success,
          provider:
            'smtp',
          messageId:
            delivery.messageId,
          errorCode:
            delivery.success
              ? undefined
              : 'EMAIL_DISABLED',
          fingerprint:
            sha256(
              String(
                invoice.email,
              ),
            ),
        });
      } catch {
        deliveries.push({
          channel:
            'email',
          success:
            false,
          provider:
            'smtp',
          errorCode:
            'EMAIL_DELIVERY_FAILED',
          fingerprint:
            sha256(
              String(
                invoice.email,
              ),
            ),
        });
      }

      continue;
    }

    if (
      channel ===
        'whatsapp'
    ) {
      const delivery =
        await sendInvoiceWhatsApp(
          invoice.phone
            ? String(
                invoice.phone,
              )
            : null,
          {
            caption,
            documentUrl:
              pdfUrl,
            filename,
          },
        );

      deliveries.push({
        channel:
          'whatsapp',
        success:
          delivery.success,
        provider:
          delivery.provider,
        messageId:
          delivery.messageId,
        errorCode:
          delivery.errorCode,
        fingerprint:
          sha256(
            String(
              invoice.phone ||
              '',
            ),
          ),
      });

      continue;
    }

    const delivery =
      await sendWorkspaceNotificationSms(
        invoice.phone
          ? String(
              invoice.phone,
            )
          : null,
        {
          title:
            'Invoice ' +
            String(
              invoice.invoice_number,
            ),
          message:
            'View: ' +
            publicUrl,
        },
      );

    deliveries.push({
      channel:
        'sms',
      success:
        delivery.success,
      provider:
        delivery.provider,
      messageId:
        delivery.messageId,
      errorCode:
        delivery.errorCode,
      fingerprint:
        sha256(
          String(
            invoice.phone ||
            '',
          ),
        ),
    });
  }

  const successful =
    deliveries.filter(
      delivery =>
        delivery.success,
    );

  const client =
    await input.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const oldStatus =
      String(
        invoice.status,
      );

    if (
      successful.length >
        0
    ) {
      await client.query(
        `
          UPDATE invoicing_invoices
          SET
            status =
              CASE
                WHEN status IN (
                  'draft',
                  'confirmed'
                )
                THEN 'sent'
                ELSE status
              END,
            confirmed_at =
              COALESCE(
                confirmed_at,
                NOW()
              ),
            sent_at =
              COALESCE(
                sent_at,
                NOW()
              ),
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE id =
                $1
            AND company_id =
                $2
        `,
        [
          input.invoiceId,
          input.companyId,
          input.userId,
        ],
      );
    } else {
      await client.query(
        `
          UPDATE invoicing_invoices
          SET
            public_token_hash =
              NULL,
            public_enabled =
              FALSE,
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE id =
                $1
            AND company_id =
                $2
        `,
        [
          input.invoiceId,
          input.companyId,
          input.userId,
        ],
      );
    }

    if (
      successful.length >
        0 &&
      [
        'draft',
        'confirmed',
      ].includes(
        oldStatus,
      )
    ) {
      await client.query(
        `
          INSERT INTO invoicing_status_history (
            invoice_id,
            company_id,
            from_status,
            to_status,
            reason,
            changed_by
          )
          VALUES (
            $1,$2,$3,
            'sent',
            'Invoice delivered to customer',
            $4
          )
        `,
        [
          input.invoiceId,
          input.companyId,
          oldStatus,
          input.userId,
        ],
      );
    }

    for (
      const delivery
      of deliveries
    ) {
      await client.query(
        `
          INSERT INTO invoicing_delivery_log (
            company_id,
            invoice_id,
            channel,
            destination_fingerprint,
            provider,
            provider_message_id,
            status,
            error_code,
            created_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9
          )
        `,
        [
          input.companyId,
          input.invoiceId,
          delivery.channel,
          delivery.fingerprint,
          delivery.provider ||
          null,
          delivery.messageId ||
          null,
          delivery.success
            ? 'sent'
            : 'failed',
          delivery.errorCode ||
          null,
          input.userId,
        ],
      );
    }

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
          successful.length >
            0
            ? input.purpose ===
                'reminder'
              ? 'invoice.reminder_sent'
              : input.purpose ===
                  'recurring'
                ? 'invoice.recurring_sent'
                : 'invoice.sent'
            : input.purpose ===
                'reminder'
              ? 'invoice.reminder_failed'
              : 'invoice.delivery_failed',
        content:
          successful.length >
            0
            ? (
                input.purpose ===
                  'reminder'
                  ? (
                      'Payment reminder for invoice ' +
                      String(
                        invoice.invoice_number,
                      ) +
                      ' delivered to the customer.'
                    )
                  : (
                      'Invoice ' +
                      String(
                        invoice.invoice_number,
                      ) +
                      ' delivered to the customer.'
                    )
              )
            : (
                'Invoice ' +
                String(
                  invoice.invoice_number,
                ) +
                ' delivery failed.'
              ),
        metadata: {
          requestedChannels:
            input.channels,
          successfulChannels:
            successful.map(
              delivery =>
                delivery.channel,
            ),
        },
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

  const safeDeliveries =
    deliveries.map(
      ({
        fingerprint:
          _fingerprint,
        ...delivery
      }) =>
        delivery,
    );

  if (
    successful.length ===
      0
  ) {
    throw new InvoicingError(
      'DELIVERY_FAILED',
      'Invoice delivery failed on every selected channel.',
      {
        deliveries:
          safeDeliveries,
      },
    );
  }

  return {
    invoiceId:
      input.invoiceId,
    publicPath,
    pdfPath,
    deliveries:
      safeDeliveries,
  };
}
