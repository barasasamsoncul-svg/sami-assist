import 'server-only';

import { dispatchBusinessAutomationEventSafely } from '@/lib/automation/business-events';
import type { SamiAutomationRuntimeContext } from '@/lib/automation/types';
import { assertSalesQuoteApprovalSatisfied } from '@/lib/apps/sales/approvals';
import { SALES_QUOTE_ELECTRONIC_SIGNATURE_CONSENT } from '@/lib/apps/sales/signature';

import {
  isSalesQuoteExpired,
  salesDateOnly,
} from '@/lib/apps/sales/date-utils';
import { expirePublicSalesQuoteWithAudit } from '@/lib/apps/sales/public-quote-expiry';

import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';
import { sendWorkspaceNotificationEmail } from '@/lib/services/email';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  money,
  nullableText,
  recordSalesActivity,
  SalesError,
  UUID_RE,
} from '@/lib/apps/sales/context';


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


function assertToken(
  token:
    string,
) {
  if (
    typeof token !==
      'string' ||
    token.length <
      32 ||
    token.length >
      200
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
    );
  }
}


function publicSalesAutomationRuntime(
  tenantId: string,
  companyId: string,
  userId: unknown,
): SamiAutomationRuntimeContext {
  return {
    userId: userId ?? null,
    sessionId: 'public-quote',
    tenantId,
    companyId,
    accessibleModuleKeys: ['sales'],
    permissionSet: new Set<string>(),
    isOwner: false,
  } as unknown as SamiAutomationRuntimeContext;
}


type PublicSalesQuotePageDependencies = {
  getTenantPoolByTenantId: typeof getTenantPoolByTenantId;
  expirePublicSalesQuoteWithAudit: typeof expirePublicSalesQuoteWithAudit;
  recordSalesActivity: typeof recordSalesActivity;
};

const defaultPublicSalesQuotePageDependencies: PublicSalesQuotePageDependencies = {
  getTenantPoolByTenantId,
  expirePublicSalesQuoteWithAudit,
  recordSalesActivity,
};


export async function getPublicSalesQuote(
  tenantId:
    string,
  token:
    string,
  options: {
    markViewed?: boolean;
  } = {},
  overrides: Partial<PublicSalesQuotePageDependencies> = {},
) {
  const dependencies: PublicSalesQuotePageDependencies = {
    ...defaultPublicSalesQuotePageDependencies,
    ...overrides,
  };

  assertToken(
    token,
  );

  const pool =
    await dependencies.getTenantPoolByTenantId(
      tenantId,
    );

  const tokenHash =
    sha256(
      token,
    );

  const result =
    await pool.query(
      `
        SELECT
          q.id,
          q.company_id,
          q.quote_number,
          q.status,
          q.quote_date,
          q.valid_until,
          q.currency,
          q.reference,
          q.customer_name,
          q.customer_email,
          q.customer_phone,
          q.customer_tax_id,
          q.billing_address,
          q.subtotal,
          q.discount_total,
          q.tax_total,
          q.shipping_total,
          q.total_amount,
          q.deposit_type,
          q.deposit_value,
          q.notes,
          q.terms,
          q.sales_order_id,
          q.latest_invoice_id,
          q.viewed_at,
          c.name
            AS company_name,
          c.email
            AS company_email,
          c.phone
            AS company_phone,
          c.address
            AS company_address,
          c.tax_id
            AS company_tax_id,
          c.registration_number
            AS company_registration_number,
          COALESCE(
            t.primary_color,
            s.primary_color,
            '#164a9f'
          )
            AS primary_color,
          COALESCE(
            t.secondary_color,
            s.secondary_color,
            '#0f172a'
          )
            AS secondary_color,
          COALESCE(
            t.footer_text,
            s.footer_text
          )
            AS footer_text,
          COALESCE(
            s.allow_online_acceptance,
            TRUE
          )
            AS allow_online_acceptance,
          COALESCE(
            s.allow_online_rejection,
            TRUE
          )
            AS allow_online_rejection
        FROM sales_quotes q
        INNER JOIN companies c
          ON c.id =
             q.company_id
        LEFT JOIN sales_quote_templates t
          ON t.id =
             q.template_id
         AND t.company_id =
             q.company_id
         AND t.deleted_at
             IS NULL
        LEFT JOIN sales_settings s
          ON s.company_id =
             q.company_id
        WHERE q.public_token_hash =
              $1
          AND q.public_enabled =
              TRUE
          AND q.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        tokenHash,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'QUOTE_NOT_FOUND',
      'Quote was not found.',
    );
  }

  const quote =
    result.rows[0];

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  let status =
    String(
      quote.status,
    );

  if (
    [
      'sent',
      'viewed',
    ].includes(
      status,
    ) &&
    isSalesQuoteExpired(
      quote.valid_until,
      today,
    )
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Re-read under a row lock. A customer acceptance/rejection may have
      // committed after the initial public-page SELECT.
      const currentResult = await client.query(
        `
          SELECT status, valid_until
          FROM sales_quotes
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [quote.id, quote.company_id],
      );

      if (currentResult.rows.length !== 1) {
        throw new SalesError(
          'QUOTE_NOT_FOUND',
          'Quote was not found.',
        );
      }

      const currentStatus = String(currentResult.rows[0].status);
      quote.valid_until = currentResult.rows[0].valid_until;
      if (
        ['sent', 'viewed'].includes(currentStatus) &&
        isSalesQuoteExpired(currentResult.rows[0].valid_until, today)
      ) {
        const expired = await dependencies.expirePublicSalesQuoteWithAudit(
          client,
          {
            quoteId: String(quote.id),
            companyId: String(quote.company_id),
            quoteNumber: String(quote.quote_number),
            fromStatus: currentStatus as 'sent' | 'viewed',
            source: 'public_quote_view',
          },
          dependencies.recordSalesActivity,
        );

        if (expired) {
          status = 'expired';
        } else {
          // The source status changed despite the lock/compare-and-set; show the
          // latest persisted status and never claim an expiry that did not occur.
          const latest = await client.query(
            `
              SELECT status
              FROM sales_quotes
              WHERE id = $1
                AND company_id = $2
            `,
            [quote.id, quote.company_id],
          );
          status = latest.rows[0] ? String(latest.rows[0].status) : currentStatus;
        }
      } else {
        // The state may have advanced to accepted/rejected while this request
        // was waiting for the lock; reflect the database state, not stale data.
        status = currentStatus;
      }

      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  } else if (
    options.markViewed !==
      false &&
    status ===
      'sent'
  ) {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const changed =
        await client.query(
          `
            UPDATE sales_quotes
            SET
              status = 'viewed',
              viewed_at =
                COALESCE(
                  viewed_at,
                  NOW()
                ),
              updated_at =
                NOW()
            WHERE id = $1
              AND company_id = $2
              AND status = 'sent'
            RETURNING id
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );

      if (
        changed.rows.length >
          0
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
              'sent',
              'viewed',
              'Viewed by customer',
              NULL
            )
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );

        await dependencies.recordSalesActivity(
          client,
          {
            companyId:
              String(
                quote.company_id,
              ),
            userId:
              null,
            quoteId:
              String(
                quote.id,
              ),
            type:
              'sales.quote.viewed',
            content:
              'Quote ' +
              String(
                quote.quote_number,
              ) +
              ' viewed by customer.',
          },
        );

        status =
          'viewed';
      }

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
  }

  const lines =
    await pool.query(
      `
        SELECT
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          discount_amount,
          tax_name_snapshot,
          tax_rate,
          tax_amount,
          subtotal,
          line_total
        FROM sales_quote_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quote.id,
        quote.company_id,
      ],
    );

  const optionalItems =
    await pool.query(
      `
        SELECT
          id,
          catalog_item_id,
          description,
          sku_snapshot,
          unit,
          quantity,
          unit_price,
          tax_name_snapshot,
          tax_rate,
          is_selected
        FROM sales_quote_optional_items
        WHERE quote_id = $1
          AND company_id = $2
        ORDER BY
          sort_order,
          id
      `,
      [
        quote.id,
        quote.company_id,
      ],
    );

  return {
    tenantId,
    token,
    id:
      String(
        quote.id,
      ),
    quoteNumber:
      String(
        quote.quote_number,
      ),
    status,
    quoteDate:
      salesDateOnly(quote.quote_date) ||
      String(quote.quote_date).slice(0, 10),
    validUntil:
      salesDateOnly(quote.valid_until),
    currency:
      String(
        quote.currency,
      ),
    reference:
      quote.reference
        ? String(
            quote.reference,
          )
        : null,
    subtotal:
      money(
        quote.subtotal,
      ),
    discountTotal:
      money(
        quote.discount_total,
      ),
    taxTotal:
      money(
        quote.tax_total,
      ),
    shippingTotal:
      money(
        quote.shipping_total,
      ),
    depositType:
      quote.deposit_type === 'percent'
        ? 'percent'
        : quote.deposit_type === 'fixed'
          ? 'fixed'
          : 'none',
    depositValue:
      money(quote.deposit_value),
    depositRequiredAmount:
      quote.deposit_type === 'percent'
        ? money(money(quote.total_amount) * money(quote.deposit_value) / 100)
        : quote.deposit_type === 'fixed'
          ? Math.min(money(quote.total_amount), money(quote.deposit_value))
          : 0,
    totalAmount:
      money(
        quote.total_amount,
      ),
    notes:
      quote.notes
        ? String(
            quote.notes,
          )
        : null,
    terms:
      quote.terms
        ? String(
            quote.terms,
          )
        : null,
    salesOrderId:
      quote.sales_order_id
        ? String(
            quote.sales_order_id,
          )
        : null,
    latestInvoiceId:
      quote.latest_invoice_id
        ? String(
            quote.latest_invoice_id,
          )
        : null,
    customer: {
      name:
        String(
          quote.customer_name,
        ),
      email:
        quote.customer_email
          ? String(
              quote.customer_email,
            )
          : null,
      phone:
        quote.customer_phone
          ? String(
              quote.customer_phone,
            )
          : null,
      taxId:
        quote.customer_tax_id
          ? String(
              quote.customer_tax_id,
            )
          : null,
      billingAddress:
        quote.billing_address
          ? String(
              quote.billing_address,
            )
          : null,
    },
    company: {
      name:
        String(
          quote.company_name,
        ),
      email:
        quote.company_email
          ? String(
              quote.company_email,
            )
          : null,
      phone:
        quote.company_phone
          ? String(
              quote.company_phone,
            )
          : null,
      address:
        quote.company_address
          ? String(
              quote.company_address,
            )
          : null,
      taxId:
        quote.company_tax_id
          ? String(
              quote.company_tax_id,
            )
          : null,
      registrationNumber:
        quote.company_registration_number
          ? String(
              quote.company_registration_number,
            )
          : null,
    },
    portal: {
      allowAcceptance:
        quote.allow_online_acceptance !==
        false,
      allowRejection:
        quote.allow_online_rejection !==
        false,
    },
    template: {
      primaryColor:
        String(
          quote.primary_color ||
          '#164a9f',
        ),
      secondaryColor:
        String(
          quote.secondary_color ||
          '#0f172a',
        ),
      footerText:
        quote.footer_text
          ? String(
              quote.footer_text,
            )
          : null,
    },
    lines:
      lines.rows.map(
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
            Number(
              line.quantity,
            ),
          unitPrice:
            money(
              line.unit_price,
            ),
          discountType:
            line.discount_type ===
              'fixed'
              ? 'fixed'
              : 'percent',
          discountValue:
            money(
              line.discount_value,
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
            Number(
              line.tax_rate,
            ),
          taxAmount:
            money(
              line.tax_amount,
            ),
          subtotal:
            money(
              line.subtotal,
            ),
          lineTotal:
            money(
              line.line_total,
            ),
        }),
      ),
    optionalItems:
      optionalItems.rows.map(
        item => ({
          id:
            String(
              item.id,
            ),
          catalogItemId:
            item.catalog_item_id
              ? String(
                  item.catalog_item_id,
                )
              : null,
          description:
            String(
              item.description,
            ),
          sku:
            item.sku_snapshot
              ? String(
                  item.sku_snapshot,
                )
              : null,
          unit:
            String(
              item.unit ||
              'unit',
            ),
          quantity:
            Number(
              item.quantity,
            ),
          unitPrice:
            money(
              item.unit_price,
            ),
          taxName:
            item.tax_name_snapshot
              ? String(
                  item.tax_name_snapshot,
                )
              : null,
          taxRate:
            Number(
              item.tax_rate ||
              0,
            ),
          isSelected:
            item.is_selected ===
              true,
        }),
      ),
  };
}


type PublicSalesQuoteResponseDependencies = {
  getTenantPoolByTenantId: typeof getTenantPoolByTenantId;
  assertSalesQuoteApprovalSatisfied: typeof assertSalesQuoteApprovalSatisfied;
  expirePublicSalesQuoteWithAudit: typeof expirePublicSalesQuoteWithAudit;
  recordSalesActivity: typeof recordSalesActivity;
};

const defaultPublicSalesQuoteResponseDependencies: PublicSalesQuoteResponseDependencies = {
  getTenantPoolByTenantId,
  assertSalesQuoteApprovalSatisfied,
  expirePublicSalesQuoteWithAudit,
  recordSalesActivity,
};


export async function respondToPublicSalesQuote(
  tenantId:
    string,
  token:
    string,
  input: {
    action:
      'accept' |
      'reject' |
      'request_revision';
    reason?:
      unknown;
    signerName?:
      unknown;
    signerEmail?:
      unknown;
    signatureConsent?:
      unknown;
    requesterName?:
      unknown;
    requesterEmail?:
      unknown;
    acceptanceNote?:
      unknown;
    selectedOptionalItemIds?:
      unknown;
  },
  overrides: Partial<PublicSalesQuoteResponseDependencies> = {},
) {
  const dependencies: PublicSalesQuoteResponseDependencies = {
    ...defaultPublicSalesQuoteResponseDependencies,
    ...overrides,
  };

  assertToken(
    token,
  );

  const pool =
    await dependencies.getTenantPoolByTenantId(
      tenantId,
    );

  const tokenHash =
    sha256(
      token,
    );

  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            q.id,
            q.company_id,
            q.quote_number,
            q.status,
            q.approval_status,
            q.approval_requested_by,
            q.valid_until,
            COALESCE(
              s.allow_online_acceptance,
              TRUE
            ) AS allow_online_acceptance,
            COALESCE(
              s.allow_online_rejection,
              TRUE
            ) AS allow_online_rejection
          FROM sales_quotes q
          LEFT JOIN sales_settings s
            ON s.company_id =
               q.company_id
          WHERE q.public_token_hash =
                $1
            AND q.public_enabled =
                TRUE
            AND q.deleted_at
                IS NULL
          FOR UPDATE OF q
        `,
        [
          tokenHash,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'QUOTE_NOT_FOUND',
        'Quote was not found.',
      );
    }

    const quote =
      result.rows[0];

    const current =
      String(
        quote.status,
      );

    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    if (
      ['sent', 'viewed'].includes(current) &&
      isSalesQuoteExpired(
        quote.valid_until,
        today,
      )
    ) {
      const expired = await dependencies.expirePublicSalesQuoteWithAudit(
        client,
        {
          quoteId: String(quote.id),
          companyId: String(quote.company_id),
          quoteNumber: String(quote.quote_number),
          fromStatus: current as 'sent' | 'viewed',
          source: 'public_quote_response',
          attemptedAction: input.action,
        },
        recordSalesActivity,
      );

      await client.query('COMMIT');

      if (!expired) {
        throw new SalesError(
          'QUOTE_STATE_INVALID',
          'This quote changed while you were responding. Reload the quotation page and try again.',
        );
      }

      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote has expired.',
      );
    }

    if (
      ![
        'sent',
        'viewed',
      ].includes(
        current,
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'This quote can no longer be changed from the customer page.',
      );
    }

    if (input.action === 'request_revision') {
      const revisionReason = nullableText(input.reason, 2000);
      const requesterName = nullableText(input.requesterName, 255);
      const requesterEmail = nullableText(input.requesterEmail, 320);
      if (!revisionReason || revisionReason.trim().length < 5) {
        throw new SalesError('INVALID_INPUT', 'Describe the changes you are requesting (at least 5 characters).');
      }
      if (!requesterName || requesterName.trim().length < 2) {
        throw new SalesError('INVALID_INPUT', 'Enter your name so the sales team knows who requested these changes.');
      }
      if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
        throw new SalesError('INVALID_INPUT', 'Enter a valid email address or leave the email field blank.');
      }
      await dependencies.recordSalesActivity(client, {
        companyId: String(quote.company_id),
        userId: null,
        quoteId: String(quote.id),
        type: 'sales.quote.customer_revision_requested',
        content: 'Customer requested changes to quotation ' + String(quote.quote_number) + '.',
        metadata: { requesterName: requesterName.trim(), requesterEmail: requesterEmail || null, reason: revisionReason.trim() },
      });
      try {
        const salespersonResult = await client.query(
          `SELECT salesperson_user_id
           FROM sales_quotes
           WHERE id=$1 AND company_id=$2
           LIMIT 1`,
          [quote.id, quote.company_id],
        );
        const salespersonUserId = salespersonResult.rows[0]?.salesperson_user_id;
        if (salespersonUserId) {
          const recipientResult = await queryControl(
            `SELECT u.email,
                    COALESCE(
                      NULLIF(BTRIM(COALESCE(u.full_name,'')),''),
                      NULLIF(BTRIM(CONCAT_WS(' ',u.first_name,u.last_name)),''),
                      u.email
                    ) AS name
             FROM tenant_users tu
             INNER JOIN users u ON u.id=tu.user_id
             WHERE tu.tenant_id=$1
               AND tu.user_id=$2
               AND tu.status='active'
               AND tu.member_type='internal'
               AND tu.deleted_at IS NULL
               AND u.deleted_at IS NULL
             LIMIT 1`,
            [tenantId, salespersonUserId],
          );
          const recipient = recipientResult.rows[0] as { email?: unknown; name?: unknown } | undefined;
          const recipientEmail = typeof recipient?.email === 'string' ? recipient.email.trim() : '';
          if (recipientEmail) {
            const emailResult = await sendWorkspaceNotificationEmail(
              recipientEmail,
              typeof recipient?.name === 'string' && recipient.name.trim()
                ? recipient.name.trim()
                : recipientEmail,
              {
                title: 'Customer requested a quotation revision',
                message: 'Quotation ' + String(quote.quote_number) + ' has a revision request from ' + requesterName.trim() + '. Reason: ' + revisionReason.trim(),
                actionHref: '/apps/sales/quotes/' + String(quote.id),
                actionLabel: 'Review quotation',
                audience: 'workspace',
              },
            );
            if (!emailResult.success) {
              console.warn('[SaMi Sales] Salesperson notification email was not delivered.', {
                quoteId: String(quote.id),
                salespersonUserId: String(salespersonUserId),
              });
            }
          }
        }
      } catch (error) {
        console.warn('[SaMi Sales] Could not email the salesperson about a customer quotation revision.', {
          quoteId: String(quote.id),
          error,
        });
      }
      await client.query('COMMIT');
      await dispatchBusinessAutomationEventSafely({
        runtime: publicSalesAutomationRuntime(tenantId, String(quote.company_id), quote.approval_requested_by ?? null),
        moduleKey: 'sales',
        triggerKey: 'sales.quote.revision_requested',
        recordType: 'quote',
        recordId: String(quote.id),
        payload: {
          quoteId: String(quote.id),
          quoteNumber: String(quote.quote_number),
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail || null,
          reason: revisionReason.trim(),
        },
        idempotencySeed: 'revision_requested:' + String(quote.id),
      });
      return { id: String(quote.id), status: current, response: 'revision_requested' };
    }

    if (
      input.action ===
        'accept' &&
      quote.allow_online_acceptance ===
        false
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Online quote acceptance is disabled for this company.',
      );
    }

    if (input.action === 'accept') {
      await dependencies.assertSalesQuoteApprovalSatisfied(client, String(quote.company_id), String(quote.id));
    }

    if (
      input.action === 'accept' &&
      ![
        'approved',
        'not_required',
      ].includes(
        String(
          quote.approval_status ||
          'not_required',
        ),
      )
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Complete internal quotation approval before accepting this quote.',
      );
    }

    if (
      input.action ===
        'reject' &&
      quote.allow_online_rejection ===
        false
    ) {
      throw new SalesError(
        'QUOTE_STATE_INVALID',
        'Online quote rejection is disabled for this company.',
      );
    }

    const signerName = input.action === 'accept' ? nullableText(input.signerName, 255) : null;
    const signerEmail = input.action === 'accept' ? nullableText(input.signerEmail, 320) : null;
    if (input.action === 'accept' && !signerName) {
      throw new SalesError('INVALID_INPUT', 'Enter the name of the person accepting this quotation.');
    }
    if (input.action === 'accept' && input.signatureConsent !== true) {
      throw new SalesError('INVALID_INPUT', 'Confirm the electronic signature statement before accepting this quotation.');
    }
    if (signerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
      throw new SalesError('INVALID_INPUT', 'Enter a valid email address or leave the email field blank.');
    }

    const next =
      input.action ===
        'accept'
        ? 'accepted'
        : 'rejected';

    const reason =
      input.action ===
        'reject'
        ? nullableText(
            input.reason,
            2000,
          )
        : null;

    if (input.action === 'reject' && !reason) {
      throw new SalesError('INVALID_INPUT', 'Enter a reason for declining this quotation.');
    }

    const acceptanceNote =
      input.action ===
        'accept'
        ? nullableText(
            input.acceptanceNote,
            2000,
          )
        : null;

    if (
      input.action ===
        'accept' &&
      input.selectedOptionalItemIds !==
        undefined &&
      !Array.isArray(
        input.selectedOptionalItemIds,
      )
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Optional product selections must be a list.',
      );
    }

    if (
      Array.isArray(
        input.selectedOptionalItemIds,
      ) &&
      input.selectedOptionalItemIds.length >
        100
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Select up to 100 optional products.',
      );
    }

    const selectedOptionalItemIds =
      input.action ===
        'accept' &&
      Array.isArray(
        input.selectedOptionalItemIds,
      )
        ? Array.from(
            new Set(
              input.selectedOptionalItemIds
                .filter(
                  value =>
                    typeof value ===
                      'string' &&
                    UUID_RE.test(
                      value,
                    ),
                ),
            ),
          )
        : [];

    if (
      Array.isArray(
        input.selectedOptionalItemIds,
      ) &&
      selectedOptionalItemIds.length !==
        input.selectedOptionalItemIds.length
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'One or more optional product selections are invalid.',
      );
    }

    if (
      input.action ===
        'accept' &&
      !signerName
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Enter the name of the person accepting this quotation.',
      );
    }

    if (
      input.action ===
        'accept'
    ) {
      const optionalRows =
        await client.query(
          `
            SELECT
              id
            FROM sales_quote_optional_items
            WHERE quote_id = $1
              AND company_id = $2
              AND id = ANY(
                $3::uuid[]
              )
            FOR UPDATE
          `,
          [
            quote.id,
            quote.company_id,
            selectedOptionalItemIds,
          ],
        );

      if (
        optionalRows.rows.length !==
          selectedOptionalItemIds.length
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'One or more selected optional products no longer belong to this quotation.',
        );
      }

      await client.query(
        `
          UPDATE sales_quote_optional_items
          SET
            is_selected =
              id = ANY(
                $3::uuid[]
              ),
            selected_at =
              CASE
                WHEN id = ANY(
                  $3::uuid[]
                )
                THEN NOW()
                ELSE NULL
              END,
            updated_at =
              NOW()
          WHERE quote_id = $1
            AND company_id = $2
        `,
        [
          quote.id,
          quote.company_id,
          selectedOptionalItemIds,
        ],
      );

      if (
        selectedOptionalItemIds.length >
          0
      ) {
        await client.query(
          `
            INSERT INTO sales_quote_items (
              quote_id,
              company_id,
              catalog_item_id,
              external_product_id,
              sort_order,
              description,
              sku_snapshot,
              unit,
              quantity,
              unit_price,
              unit_cost,
              cost_total,
              margin_amount,
              margin_percent,
              discount_type,
              discount_value,
              discount_amount,
              tax_name_snapshot,
              tax_rate,
              tax_amount,
              subtotal,
              line_total
            )
            SELECT
              optional.quote_id,
              optional.company_id,
              optional.catalog_item_id,
              optional.external_product_id,
              10000 +
                optional.sort_order,
              optional.description,
              optional.sku_snapshot,
              optional.unit,
              optional.quantity,
              optional.unit_price,
              optional.unit_cost,
              ROUND(
                optional.quantity *
                optional.unit_cost,
                2
              ),
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) -
                (
                  optional.quantity *
                  optional.unit_cost
                ),
                2
              ),
              CASE
                WHEN optional.quantity *
                     optional.unit_price >
                     0
                THEN ROUND(
                  (
                    (
                      optional.quantity *
                      optional.unit_price
                    ) -
                    (
                      optional.quantity *
                      optional.unit_cost
                    )
                  ) /
                  (
                    optional.quantity *
                    optional.unit_price
                  ) *
                  100,
                  4
                )
                ELSE 0
              END,
              'percent',
              0,
              0,
              optional.tax_name_snapshot,
              optional.tax_rate,
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) *
                optional.tax_rate /
                100,
                2
              ),
              ROUND(
                optional.quantity *
                optional.unit_price,
                2
              ),
              ROUND(
                (
                  optional.quantity *
                  optional.unit_price
                ) *
                (
                  1 +
                  optional.tax_rate /
                  100
                ),
                2
              )
            FROM sales_quote_optional_items optional
            WHERE optional.quote_id = $1
              AND optional.company_id = $2
              AND optional.is_selected =
                  TRUE
          `,
          [
            quote.id,
            quote.company_id,
          ],
        );
      }

      await client.query(
        `
          WITH totals AS (
            SELECT
              COALESCE(
                SUM(subtotal),
                0
              ) AS subtotal,
              COALESCE(
                SUM(discount_amount),
                0
              ) AS discount_total,
              COALESCE(
                SUM(tax_amount),
                0
              ) AS tax_total,
              COALESCE(
                SUM(cost_total),
                0
              ) AS cost_total
            FROM sales_quote_items
            WHERE quote_id = $1
              AND company_id = $2
          )
          UPDATE sales_quotes q
          SET
            subtotal =
              ROUND(
                totals.subtotal,
                2
              ),
            discount_total =
              ROUND(
                totals.discount_total,
                2
              ),
            tax_total =
              ROUND(
                totals.tax_total,
                2
              ),
            total_amount =
              ROUND(
                totals.subtotal -
                totals.discount_total +
                totals.tax_total +
                q.shipping_total,
                2
              ),
            base_total_amount =
              ROUND(
                (
                  totals.subtotal -
                  totals.discount_total +
                  totals.tax_total +
                  q.shipping_total
                ) * COALESCE(NULLIF(q.exchange_rate, 0), 1),
                2
              ),
            cost_total =
              ROUND(
                totals.cost_total,
                2
              ),
            margin_amount =
              ROUND(
                (
                  totals.subtotal -
                  totals.discount_total
                ) -
                totals.cost_total,
                2
              ),
            margin_percent =
              CASE
                WHEN totals.subtotal -
                     totals.discount_total >
                     0
                THEN ROUND(
                  (
                    (
                      totals.subtotal -
                      totals.discount_total
                    ) -
                    totals.cost_total
                  ) /
                  (
                    totals.subtotal -
                    totals.discount_total
                  ) *
                  100,
                  4
                )
                ELSE 0
              END,
            updated_at =
              NOW()
          FROM totals
          WHERE q.id = $1
            AND q.company_id = $2
        `,
        [
          quote.id,
          quote.company_id,
        ],
      );

      await client.query(
        `UPDATE sales_quote_approval_requests
         SET status='superseded', completed_at=NOW(), updated_at=NOW()
         WHERE company_id=$1 AND quote_id=$2 AND status='pending'`,
        [quote.company_id, quote.id],
      );
      await dependencies.assertSalesQuoteApprovalSatisfied(
        client,
        String(quote.company_id),
        String(quote.id),
      );

      await dependencies.recordSalesActivity(
        client,
        {
          companyId:
            String(
              quote.company_id,
            ),
          userId:
            null,
          quoteId:
            String(
              quote.id,
            ),
          type:
            'sales.quote.optional_products_selected',
          content:
            selectedOptionalItemIds.length >
              0
              ? 'Customer selected optional products before accepting the quotation.'
              : 'Customer accepted the quotation without optional products.',
          metadata: {
            selectedOptionalItemIds,
          },
        },
      );
    }

    await client.query(
      `
        UPDATE sales_quotes
        SET
          status = $3::varchar(30),
          accepted_at =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN NOW()
              ELSE accepted_at
            END,
          rejected_at =
            CASE
              WHEN $3::varchar(30) =
                   'rejected'
              THEN NOW()
              ELSE rejected_at
            END,
          accepted_by_name =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $4
              ELSE accepted_by_name
            END,
          accepted_by_email =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $5
              ELSE accepted_by_email
            END,
          acceptance_note =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $6
              ELSE acceptance_note
            END,
          acceptance_signature_consent_text =
            CASE
              WHEN $3::varchar(30) =
                   'accepted'
              THEN $7
              ELSE acceptance_signature_consent_text
            END,
          public_enabled =
            FALSE,
          updated_at =
            NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        quote.id,
        quote.company_id,
        next,
        signerName,
        signerEmail,
        acceptanceNote,
        input.action === 'accept' ? SALES_QUOTE_ELECTRONIC_SIGNATURE_CONSENT : null,
      ],
    );

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
          $1,$2,$3,$4,$5,NULL
        )
      `,
      [
        quote.id,
        quote.company_id,
        current,
        next,
        reason,
      ],
    );

    await dependencies.recordSalesActivity(
      client,
      {
        companyId:
          String(
            quote.company_id,
          ),
        userId:
          null,
        quoteId:
          String(
            quote.id,
          ),
        type:
          'sales.quote.customer_' +
          next,
        content:
          'Customer ' +
          next +
          ' quote ' +
          String(
            quote.quote_number,
          ) +
          '.',
        metadata: {
          reason,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    if (next === 'accepted') {
      await dispatchBusinessAutomationEventSafely({
        runtime: publicSalesAutomationRuntime(tenantId, String(quote.company_id), quote.approval_requested_by ?? null),
        moduleKey: 'sales',
        triggerKey: 'sales.quote.accepted',
        recordType: 'quote',
        recordId: String(quote.id),
        payload: {
          quoteId: String(quote.id),
          quoteNumber: String(quote.quote_number),
          acceptedByName: signerName,
          acceptedByEmail: signerEmail,
        },
        idempotencySeed: 'accepted:' + String(quote.id),
      });
    } else {
      await dispatchBusinessAutomationEventSafely({
        runtime: publicSalesAutomationRuntime(tenantId, String(quote.company_id), quote.approval_requested_by ?? null),
        moduleKey: 'sales',
        triggerKey: 'sales.quote.rejected',
        recordType: 'quote',
        recordId: String(quote.id),
        payload: {
          quoteId: String(quote.id),
          quoteNumber: String(quote.quote_number),
          reason,
        },
        idempotencySeed: 'rejected:' + String(quote.id),
      });
    }

    return {
      id:
        String(
          quote.id,
        ),
      status:
        next,
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
