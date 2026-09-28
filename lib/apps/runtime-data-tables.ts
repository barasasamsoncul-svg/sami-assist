import 'server-only';

const APP_ADDITIONAL_DATA_TABLES:
  Readonly<
    Record<
      string,
      readonly string[]
    >
  > = {
    invoicing: [
      'invoicing_payment_terms',
      'invoicing_tax_rates',
      'invoicing_customers',
      'invoicing_catalog_items',
      'invoicing_templates',
      'invoicing_sequences',
      'invoicing_settings',
      'invoicing_invoices',
      'invoicing_invoice_items',
      'invoicing_status_history',
      'invoicing_payments',
      'invoicing_payment_allocations',
      'invoicing_credit_notes',
      'invoicing_credit_note_items',
      'invoicing_recurring_templates',
      'invoicing_reminders',
      'invoicing_delivery_log',
      'invoicing_events',
    ],
    sales: [
      'sales_settings',
      'sales_sequences',
      'sales_quote_templates',
      'sales_quotes',
      'sales_quote_items',
      'sales_orders_v2',
      'sales_order_items_v2',
      'sales_order_invoice_batches',
      'sales_quote_approval_history',
      'sales_quote_status_history',
      'sales_order_status_history',
      'sales_delivery_log',
    ],
  };

export function getAdditionalModuleDataTables(
  moduleKey:
    string,
) {
  const key =
    moduleKey
      .trim()
      .toLowerCase();

  return [
    ...(
      APP_ADDITIONAL_DATA_TABLES[
        key
      ] ||
      []
    ),
  ];
}

export const APP_RUNTIME_ADDITIONAL_DATA_TABLES =
  APP_ADDITIONAL_DATA_TABLES;
