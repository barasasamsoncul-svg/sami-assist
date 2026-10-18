import {
  NextResponse,
} from 'next/server';

import {
  getSalesOrderDetail,
} from '@/lib/apps/sales/service';

import {
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

import {
  renderSalesOrderPdf,
} from '@/lib/apps/sales/pdf';

import {
  queryControl,
} from '@/lib/db/control';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export async function GET(
  _request:
    Request,
  {
    params,
  }: {
    params:
      Promise<{
        orderId: string;
      }>;
  },
) {
  try {
    const {
      orderId,
    } =
      await params;

    const context =
      await requireSalesContext(
        SALES_PERMISSIONS
          .ORDER_VIEW,
      );

    const order =
      await getSalesOrderDetail(
        orderId,
      );

    if (
      !order
    ) {
      return new NextResponse(
        'Sales order not found.',
        {
          status:
            404,
        },
      );
    }

    const canViewMargin =
      context.permissions.isOwner ||
      context.permissions.permissionSet.has(
        SALES_PERMISSIONS.MARGIN_VIEW,
      ) ||
      context.permissions.permissionSet.has(
        SALES_PERMISSIONS.MARGIN_MANAGE,
      );

    const [
      companyResult,
      settingsResult,
      orderAssignmentResult,
      invoicingTableResult,
    ] =
      await Promise.all([
        context.pool.query(
          `
            SELECT
              name,
              email,
              phone,
              address,
              tax_id,
              registration_number
            FROM companies
            WHERE id = $1
            LIMIT 1
          `,
          [
            context.companyId,
          ],
        ),
        context.pool.query(
          `
            SELECT
              primary_color,
              secondary_color,
              footer_text
            FROM sales_settings
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
              salesperson_user_id
            FROM sales_orders_v2
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            orderId,
            context.companyId,
          ],
        ),
        context.pool.query(
          `
            SELECT
              to_regclass('public.invoicing_invoices')
                IS NOT NULL AS invoices_ready
          `,
        ),
      ]);

    const invoicingInvoicesReady =
      invoicingTableResult.rows[0]
        ?.invoices_ready === true;

    const invoiceStatusResult =
      invoicingInvoicesReady
        ? await context.pool.query(
            `
              SELECT EXISTS (
                SELECT 1
                FROM sales_order_invoice_batches batch
                INNER JOIN invoicing_invoices invoice
                  ON invoice.id = batch.invoice_id
                 AND invoice.company_id = batch.company_id
                WHERE batch.sales_order_id = $1
                  AND batch.company_id = $2
                  AND batch.status = 'created'
                  AND invoice.status IN (
                    'confirmed',
                    'sent',
                    'viewed',
                    'partially_paid',
                    'paid',
                    'overdue',
                    'written_off'
                  )
              ) AS has_confirmed_invoice
            `,
            [
              orderId,
              context.companyId,
            ],
          )
        : {
            rows: [
              {
                has_confirmed_invoice: false,
              },
            ],
          };

    const company =
      companyResult.rows[0] ||
      {};

    const settings =
      settingsResult.rows[0] ||
      {};

    const salespersonUserId =
      orderAssignmentResult.rows[0]
        ?.salesperson_user_id
        ? String(
            orderAssignmentResult.rows[0]
              .salesperson_user_id,
          )
        : null;

    const salespersonResult =
      salespersonUserId
        ? await queryControl(
            `
              SELECT
                COALESCE(
                  NULLIF(BTRIM(u.full_name), ''),
                  NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                  u.email
                ) AS salesperson_name
              FROM tenant_users tenant_user
              INNER JOIN users u
                ON u.id = tenant_user.user_id
              WHERE tenant_user.tenant_id = $1
                AND tenant_user.user_id = $2
                AND tenant_user.status = 'active'
                AND tenant_user.member_type = 'internal'
                AND tenant_user.deleted_at IS NULL
                AND u.deleted_at IS NULL
              LIMIT 1
            `,
            [
              context.tenantId,
              salespersonUserId,
            ],
          )
        : {
            rows: [],
          };

    const hasConfirmedInvoice =
      invoiceStatusResult.rows[0]
        ?.has_confirmed_invoice === true;

    const pdf =
      renderSalesOrderPdf(
        order,
        {
          documentTitle:
            hasConfirmedInvoice
              ? 'SALES ORDER'
              : 'PROFORMA INVOICE',
          maskCosts:
            !canViewMargin,
          salespersonName:
            salespersonResult.rows[0]
              ?.salesperson_name
              ? String(
                  salespersonResult.rows[0]
                    .salesperson_name,
                )
              : null,
          company: {
            name:
              String(
                company.name ||
                context.company
                  .currentCompany
                  .name,
              ),
            email:
              company.email
                ? String(
                    company.email,
                  )
                : null,
            phone:
              company.phone
                ? String(
                    company.phone,
                  )
                : null,
            address:
              company.address
                ? String(
                    company.address,
                  )
                : null,
            taxId:
              company.tax_id
                ? String(
                    company.tax_id,
                  )
                : null,
            registrationNumber:
              company.registration_number
                ? String(
                    company.registration_number,
                  )
                : null,
          },
          template: {
            primaryColor:
              String(
                settings.primary_color ||
                '#164a9f',
              ),
            secondaryColor:
              String(
                settings.secondary_color ||
                '#0f172a',
              ),
            footerText:
              settings.footer_text
                ? String(
                    settings.footer_text,
                  )
                : null,
          },
        },
      );

    return new NextResponse(
      pdf,
      {
        status:
          200,
        headers: {
          'Content-Type':
            'application/pdf',
          'Content-Disposition':
            'inline; filename="' +
            order.orderNumber
              .replace(
                /[^a-z0-9._-]+/gi,
                '-',
              ) +
            '.pdf"',
          'Cache-Control':
            'private, no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Sales] Order PDF render failed:',
      error,
    );

    return new NextResponse(
      'Sales order PDF could not be generated.',
      {
        status:
          500,
      },
    );
  }
}
