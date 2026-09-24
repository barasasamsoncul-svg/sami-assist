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
  getPublicSalesQuote,
} from '@/lib/apps/sales/public';

import {
  renderSalesQuotePdf,
} from '@/lib/apps/sales/pdf';

import {
  money,
  recordSalesActivity,
  SalesError,
} from '@/lib/apps/sales/context';


export type SalesQuoteDeliveryChannel =
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


function appUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(
    /\/+$/,
    '',
  );
}


export function normalizeSalesQuoteDeliveryChannels(
  input:
    unknown,
): SalesQuoteDeliveryChannel[] {
  const values =
    Array.isArray(
      input,
    )
      ? input
      : [
          'email',
        ];

  return [
    ...new Set(
      values
        .map(
          value =>
            String(
              value,
            )
              .trim()
              .toLowerCase(),
        )
        .filter(
          (
            value,
          ): value is
            SalesQuoteDeliveryChannel =>
            value ===
              'email' ||
            value ===
              'whatsapp' ||
            value ===
              'sms',
        ),
    ),
  ];
}


export async function deliverSalesQuote(
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
      string;
    quoteId:
      string;
    channels:
      SalesQuoteDeliveryChannel[];
  },
) {
  const result =
    await input.pool.query(
      `
        SELECT
          quote_number,
          status,
          approval_status,
          customer_name,
          customer_email,
          customer_phone,
          currency,
          total_amount
        FROM sales_quotes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.quoteId,
        input.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quotation was not found.',
    );
  }

  const quote =
    result.rows[0];

  if (
    ![
      'draft',
      'sent',
      'viewed',
    ].includes(
      String(
        quote.status,
      ),
    )
  ) {
    throw new SalesError(
      'QUOTE_STATE_INVALID',
      'This quotation cannot be sent in its current state.',
    );
  }

  if (
    [
      'draft',
      'pending',
      'rejected',
    ].includes(
      String(
        quote.approval_status ||
        'not_required',
      ),
    )
  ) {
    throw new SalesError(
      'QUOTE_STATE_INVALID',
      'Complete internal quotation approval before sending.',
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

  const publicPath =
    '/q/' +
    encodeURIComponent(
      input.tenantId,
    ) +
    '/' +
    encodeURIComponent(
      token,
    );

  const publicUrl =
    appUrl() +
    publicPath;

  const pdfUrl =
    publicUrl +
    '/pdf';

  await input.pool.query(
    `
      UPDATE sales_quotes
      SET
        public_token_hash = $3,
        public_enabled = TRUE,
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
    `,
    [
      input.quoteId,
      input.companyId,
      sha256(
        token,
      ),
      input.userId,
    ],
  );

  const publicQuote =
    await getPublicSalesQuote(
      input.tenantId,
      token,
      {
        markViewed:
          false,
      },
    );

  const pdf =
    renderSalesQuotePdf(
      publicQuote,
    );

  const filename =
    String(
      quote.quote_number,
    )
      .replace(
        /[^a-z0-9._-]+/gi,
        '-',
      ) +
    '.pdf';

  const message =
    input.companyName +
    ' sent quotation ' +
    String(
      quote.quote_number,
    ) +
    ' for ' +
    String(
      quote.currency,
    ) +
    ' ' +
    money(
      quote.total_amount,
    )
      .toLocaleString() +
    '. Review securely: ' +
    publicUrl;

  const channels =
    input.channels.length >
      0
      ? input.channels
      : [
          'email' as const,
        ];

  const deliveries:
    Array<{
      channel:
        SalesQuoteDeliveryChannel;
      success:
        boolean;
      provider:
        string | null;
      messageId:
        string | null;
      errorCode:
        string | null;
      fingerprint:
        string;
    }> =
      [];

  for (
    const channel
    of channels
  ) {
    if (
      channel ===
        'email'
    ) {
      const destination =
        String(
          quote.customer_email ||
          '',
        );

      if (
        !destination
      ) {
        deliveries.push({
          channel,
          success:
            false,
          provider:
            'smtp',
          messageId:
            null,
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
        const sent =
          await sendWorkspaceNotificationEmail(
            destination,
            String(
              quote.customer_name,
            ),
            {
              title:
                'Quotation ' +
                String(
                  quote.quote_number,
                ),
              message,
              actionHref:
                publicPath,
              actionLabel:
                'Review quotation',
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
          channel,
          success:
            sent.success,
          provider:
            'smtp',
          messageId:
            sent.messageId ||
            null,
          errorCode:
            sent.success
              ? null
              : 'EMAIL_DISABLED',
          fingerprint:
            sha256(
              destination,
            ),
        });
      } catch {
        deliveries.push({
          channel,
          success:
            false,
          provider:
            'smtp',
          messageId:
            null,
          errorCode:
            'EMAIL_DELIVERY_FAILED',
          fingerprint:
            sha256(
              destination,
            ),
        });
      }

      continue;
    }

    const phone =
      String(
        quote.customer_phone ||
        '',
      );

    if (
      channel ===
        'whatsapp'
    ) {
      const sent =
        await sendInvoiceWhatsApp(
          phone,
          {
            caption:
              message,
            documentUrl:
              pdfUrl,
            filename,
          },
        );

      deliveries.push({
        channel,
        success:
          sent.success,
        provider:
          sent.provider ||
          null,
        messageId:
          sent.messageId ||
          null,
        errorCode:
          sent.errorCode ||
          null,
        fingerprint:
          sha256(
            phone,
          ),
      });

      continue;
    }

    const sent =
      await sendWorkspaceNotificationSms(
        phone,
        {
          title:
            'Quotation ' +
            String(
              quote.quote_number,
            ),
          message:
            publicUrl,
        },
      );

    deliveries.push({
      channel,
      success:
        sent.success,
      provider:
        sent.provider ||
        null,
      messageId:
        sent.messageId ||
        null,
      errorCode:
        sent.errorCode ||
        null,
      fingerprint:
        sha256(
          phone,
        ),
    });
  }

  const successful =
    deliveries.filter(
      item =>
        item.success,
    );

  const client =
    await input.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    for (
      const delivery
      of deliveries
    ) {
      await client.query(
        `
          INSERT INTO sales_delivery_log (
            company_id,
            quote_id,
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
          input.quoteId,
          delivery.channel,
          delivery.fingerprint,
          delivery.provider,
          delivery.messageId,
          delivery.success
            ? 'sent'
            : 'failed',
          delivery.errorCode,
          input.userId,
        ],
      );
    }

    if (
      successful.length >
        0
    ) {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            status =
              CASE
                WHEN status = 'draft'
                THEN 'sent'
                ELSE status
              END,
            sent_at =
              COALESCE(
                sent_at,
                NOW()
              ),
            updated_by = $3,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          input.quoteId,
          input.companyId,
          input.userId,
        ],
      );

      if (
        String(
          quote.status,
        ) ===
          'draft'
      ) {
        await client.query(
          `
            INSERT INTO sales_quote_status_history (
              quote_id,
              company_id,
              from_status,
              to_status,
              reason,
              changed_by
            )
            VALUES (
              $1,$2,
              'draft',
              'sent',
              'Quotation delivered',
              $3
            )
          `,
          [
            input.quoteId,
            input.companyId,
            input.userId,
          ],
        );
      }
    } else {
      await client.query(
        `
          UPDATE sales_quotes
          SET
            public_enabled = FALSE,
            public_token_hash = NULL,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          input.quoteId,
          input.companyId,
        ],
      );
    }

    await recordSalesActivity(
      client,
      {
        companyId:
          input.companyId,
        userId:
          input.userId,
        quoteId:
          input.quoteId,
        type:
          successful.length >
            0
            ? 'sales.quote.sent'
            : 'sales.quote.delivery_failed',
        content:
          successful.length >
            0
            ? 'Quotation delivered to the customer.'
            : 'Quotation delivery failed.',
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

  const safe =
    deliveries.map(
      ({
        fingerprint:
          _fingerprint,
        ...item
      }) =>
        item,
    );

  if (
    successful.length ===
      0
  ) {
    throw new SalesError(
      'DELIVERY_FAILED',
      'Quotation delivery failed on every selected channel.',
      {
        deliveries:
          safe,
      },
    );
  }

  return {
    publicPath,
    pdfPath:
      publicPath +
      '/pdf',
    deliveries:
      safe,
  };
}
