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
      'invoicing_tax_groups',
      'invoicing_tax_group_members',
      'invoicing_fiscal_positions',
      'invoicing_fiscal_position_mappings',
      'invoicing_tax_rules',
      'invoicing_tax_exemptions',
      'invoicing_tax_localizations',
      'invoicing_customers',
      'invoicing_catalog_items',
      'invoicing_templates',
      'invoicing_sequences',
      'invoicing_settings',
      'invoicing_currencies',
      'invoicing_exchange_rates',
      'invoicing_invoices',
      'invoicing_invoice_items',
      'invoicing_document_snapshots',
      'invoicing_status_history',
      'invoicing_payments',
      'invoicing_payment_allocations',
      'invoicing_payment_refunds',
      'invoicing_retainers',
      'invoicing_payment_plans',
      'invoicing_payment_plan_installments',
      'invoicing_credit_notes',
      'invoicing_credit_note_items',
      'invoicing_credit_note_applications',
      'invoicing_credit_note_refunds',
      'invoicing_recurring_templates',
      'invoicing_recurring_runs',
      'invoicing_dunning_policies',
      'invoicing_dunning_stages',
      'invoicing_reminders',
      'invoicing_delivery_log',
      'invoicing_portal_access',
      'invoicing_portal_messages',
      'invoicing_portal_events',
      'invoicing_events',
      'invoicing_accounting_links',
      'invoicing_etims_profiles',
      'invoicing_etims_item_mappings',
      'invoicing_etims_tax_mappings',
      'invoicing_etims_reference_cache',
      'invoicing_etims_submissions',
      'invoicing_etims_submission_attempts',
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
