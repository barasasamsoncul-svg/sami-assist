import type {
  SamiModuleMigration,
} from '@/lib/modules/migrations';


export const SALES_3_2_0_TO_3_3_0:
  SamiModuleMigration = {
    moduleKey:
      'sales',
    fromVersion:
      '3.2.0',
    toVersion:
      '3.3.0',
    migrationKey:
      'sales-3.2.0-to-3.3.0',
    description:
      'Lock Sales quotation and order exchange rates and base-currency totals for roadmap Part 10 multi-currency.',
    statements: [
      `
        ALTER TABLE public.sales_quotes
          ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
          ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8),
          ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
          ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(120),
          ADD COLUMN IF NOT EXISTS base_total_amount NUMERIC(18,2)
      `,
      `
        UPDATE public.sales_quotes quote
        SET
          base_currency =
            COALESCE(
              (
                SELECT UPPER(settings.default_currency)
                FROM public.sales_settings settings
                WHERE settings.company_id = quote.company_id
                LIMIT 1
              ),
              UPPER(quote.currency)
            ),
          exchange_rate =
            COALESCE(
              quote.exchange_rate,
              1
            ),
          exchange_rate_date =
            COALESCE(
              quote.exchange_rate_date,
              quote.quote_date
            ),
          exchange_rate_source =
            COALESCE(
              quote.exchange_rate_source,
              'legacy_backfill'
            ),
          base_total_amount =
            COALESCE(
              quote.base_total_amount,
              quote.total_amount
            )
        WHERE
          quote.base_currency IS NULL
          OR quote.exchange_rate IS NULL
          OR quote.exchange_rate_date IS NULL
          OR quote.exchange_rate_source IS NULL
          OR quote.base_total_amount IS NULL
      `,
      `
        ALTER TABLE public.sales_quotes
          ALTER COLUMN base_currency SET DEFAULT 'KES',
          ALTER COLUMN base_currency SET NOT NULL,
          ALTER COLUMN exchange_rate SET DEFAULT 1,
          ALTER COLUMN exchange_rate SET NOT NULL,
          ALTER COLUMN exchange_rate_date SET DEFAULT CURRENT_DATE,
          ALTER COLUMN exchange_rate_date SET NOT NULL,
          ALTER COLUMN exchange_rate_source SET DEFAULT 'base',
          ALTER COLUMN exchange_rate_source SET NOT NULL,
          ALTER COLUMN base_total_amount SET DEFAULT 0,
          ALTER COLUMN base_total_amount SET NOT NULL
      `,
      `
        ALTER TABLE public.sales_quotes
          DROP CONSTRAINT IF EXISTS sales_quotes_base_currency_check,
          ADD CONSTRAINT sales_quotes_base_currency_check
            CHECK (base_currency ~ '^[A-Z]{3}$'),
          DROP CONSTRAINT IF EXISTS sales_quotes_exchange_rate_check,
          ADD CONSTRAINT sales_quotes_exchange_rate_check
            CHECK (exchange_rate > 0),
          DROP CONSTRAINT IF EXISTS sales_quotes_base_total_check,
          ADD CONSTRAINT sales_quotes_base_total_check
            CHECK (base_total_amount >= 0)
      `,
      `
        ALTER TABLE public.sales_orders_v2
          ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
          ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8),
          ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
          ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(120),
          ADD COLUMN IF NOT EXISTS base_total_amount NUMERIC(18,2)
      `,
      `
        UPDATE public.sales_orders_v2 sales_order
        SET
          base_currency =
            COALESCE(
              (
                SELECT UPPER(settings.default_currency)
                FROM public.sales_settings settings
                WHERE settings.company_id = sales_order.company_id
                LIMIT 1
              ),
              UPPER(sales_order.currency)
            ),
          exchange_rate =
            COALESCE(
              sales_order.exchange_rate,
              1
            ),
          exchange_rate_date =
            COALESCE(
              sales_order.exchange_rate_date,
              sales_order.order_date
            ),
          exchange_rate_source =
            COALESCE(
              sales_order.exchange_rate_source,
              'legacy_backfill'
            ),
          base_total_amount =
            COALESCE(
              sales_order.base_total_amount,
              sales_order.total_amount
            )
        WHERE
          sales_order.base_currency IS NULL
          OR sales_order.exchange_rate IS NULL
          OR sales_order.exchange_rate_date IS NULL
          OR sales_order.exchange_rate_source IS NULL
          OR sales_order.base_total_amount IS NULL
      `,
      `
        ALTER TABLE public.sales_orders_v2
          ALTER COLUMN base_currency SET DEFAULT 'KES',
          ALTER COLUMN base_currency SET NOT NULL,
          ALTER COLUMN exchange_rate SET DEFAULT 1,
          ALTER COLUMN exchange_rate SET NOT NULL,
          ALTER COLUMN exchange_rate_date SET DEFAULT CURRENT_DATE,
          ALTER COLUMN exchange_rate_date SET NOT NULL,
          ALTER COLUMN exchange_rate_source SET DEFAULT 'base',
          ALTER COLUMN exchange_rate_source SET NOT NULL,
          ALTER COLUMN base_total_amount SET DEFAULT 0,
          ALTER COLUMN base_total_amount SET NOT NULL
      `,
      `
        ALTER TABLE public.sales_orders_v2
          DROP CONSTRAINT IF EXISTS sales_orders_v2_base_currency_check,
          ADD CONSTRAINT sales_orders_v2_base_currency_check
            CHECK (base_currency ~ '^[A-Z]{3}$'),
          DROP CONSTRAINT IF EXISTS sales_orders_v2_exchange_rate_check,
          ADD CONSTRAINT sales_orders_v2_exchange_rate_check
            CHECK (exchange_rate > 0),
          DROP CONSTRAINT IF EXISTS sales_orders_v2_base_total_check,
          ADD CONSTRAINT sales_orders_v2_base_total_check
            CHECK (base_total_amount >= 0)
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_sales_quotes_currency_date
          ON public.sales_quotes(company_id, currency, quote_date DESC)
          WHERE deleted_at IS NULL
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_sales_orders_currency_date
          ON public.sales_orders_v2(company_id, currency, order_date DESC)
          WHERE deleted_at IS NULL
      `,
    ],
  };
