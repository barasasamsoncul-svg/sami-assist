import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  resolveInvoicingExchangeRate,
  saveInvoicingCurrency,
  saveInvoicingExchangeRate,
} from '@/lib/apps/invoicing/currencies';

import {
  requireSalesContext,
  SALES_PERMISSIONS,
  SalesError,
} from '@/lib/apps/sales/context';


function code(
  value:
    unknown,
  label:
    string,
) {
  const result =
    typeof value ===
      'string'
      ? value
          .trim()
          .toUpperCase()
      : '';

  if (
    !/^[A-Z]{3}$/.test(
      result,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      label +
      ' must be a three-letter ISO currency code.',
    );
  }

  return result;
}


function positiveRate(
  value:
    unknown,
) {
  const rate =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      rate,
    ) ||
    rate <=
      0
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Exchange rate must be greater than zero.',
    );
  }

  return Math.round(
    rate *
    100_000_000,
  ) /
  100_000_000;
}


export function salesBaseAmount(
  amount:
    number,
  rate:
    number,
) {
  return Math.round(
    amount *
    rate *
    100,
  ) /
  100;
}


export async function resolveSalesExchangeRate(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    currency:
      unknown;
    baseCurrency:
      unknown;
    effectiveDate:
      unknown;
    manualRate?:
      unknown;
  },
) {
  const currency =
    code(
      input.currency,
      'Currency',
    );

  const baseCurrency =
    code(
      input.baseCurrency,
      'Base currency',
    );

  const effectiveDate =
    typeof input.effectiveDate ===
      'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      input.effectiveDate,
    )
      ? input.effectiveDate
      : new Date()
          .toISOString()
          .slice(
            0,
            10,
          );

  if (
    currency ===
      baseCurrency
  ) {
    return {
      currency,
      baseCurrency,
      rate:
        1,
      effectiveDate,
      source:
        'base',
      sourceName:
        'Company base currency',
      manualOverride:
        false,
    };
  }

  const ready =
    await client.query(
      `
        SELECT
          to_regclass(
            'public.invoicing_currencies'
          ) IS NOT NULL
            AS currencies_ready,
          to_regclass(
            'public.invoicing_exchange_rates'
          ) IS NOT NULL
            AS rates_ready
      `,
    );

  const currencyCenterReady =
    ready.rows[0]
      ?.currencies_ready ===
      true &&
    ready.rows[0]
      ?.rates_ready ===
      true;

  if (
    currencyCenterReady
  ) {
    try {
      return await resolveInvoicingExchangeRate(
        client,
        {
          companyId:
            input.companyId,
          currency,
          baseCurrency,
          effectiveDate,
          manualRate:
            input.manualRate,
        },
      );
    } catch (
      error
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not resolve the Sales exchange rate.',
      );
    }
  }

  if (
    input.manualRate !==
      undefined &&
    input.manualRate !==
      null &&
    input.manualRate !==
      ''
  ) {
    return {
      currency,
      baseCurrency,
      rate:
        positiveRate(
          input.manualRate,
        ),
      effectiveDate,
      source:
        'manual_override',
      sourceName:
        'Sales manual rate',
      manualOverride:
        true,
    };
  }

  throw new SalesError(
    'INVALID_INPUT',
    'No shared Currency Center is installed for ' +
      currency +
      '/' +
      baseCurrency +
      '. Configure Currency Center or enter a manual exchange rate.',
  );
}


function translateCurrencyError(
  error:
    unknown,
): never {
  const source =
    error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

  if (
    source?.code ===
      'INVOICING_PERMISSION_REQUIRED'
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Currency-management access is required for this Sales action.',
    );
  }

  throw new SalesError(
    'INVALID_INPUT',
    typeof source?.message ===
      'string'
      ? source.message
      : 'SaMi could not update Currency Center.',
    source?.details &&
    typeof source.details ===
      'object'
      ? source.details as
          Record<
            string,
            unknown
          >
      : undefined,
  );
}


export async function saveSalesCurrency(
  input:
    Record<
      string,
      unknown
    >,
) {
  await requireSalesContext(
    SALES_PERMISSIONS
      .PRICING_MANAGE,
  );

  try {
    return await saveInvoicingCurrency(
      input,
    );
  } catch (
    error
  ) {
    return translateCurrencyError(
      error,
    );
  }
}


export async function saveSalesExchangeRate(
  input:
    Record<
      string,
      unknown
    >,
) {
  await requireSalesContext(
    SALES_PERMISSIONS
      .PRICING_MANAGE,
  );

  try {
    return await saveInvoicingExchangeRate(
      input,
    );
  } catch (
    error
  ) {
    return translateCurrencyError(
      error,
    );
  }
}


export async function getSalesCurrencyData() {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .QUOTE_VIEW,
    );

  const baseCurrency =
    code(
      context.company
        .currentCompany
        .currency ||
      'KES',
      'Base currency',
    );

  const ready =
    await context.pool.query(
      `
        SELECT
          to_regclass(
            'public.invoicing_currencies'
          ) IS NOT NULL
            AS currencies_ready,
          to_regclass(
            'public.invoicing_exchange_rates'
          ) IS NOT NULL
            AS rates_ready
      `,
    );

  const currencyCenterReady =
    ready.rows[0]
      ?.currencies_ready ===
      true &&
    ready.rows[0]
      ?.rates_ready ===
      true;

  const [
    currencies,
    rates,
    quoteExposure,
    orderExposure,
  ] =
    await Promise.all([
      currencyCenterReady
        ? context.pool.query(
            `
              SELECT
                id,
                code,
                name,
                symbol,
                decimal_places,
                is_base,
                is_active
              FROM invoicing_currencies
              WHERE company_id = $1
              ORDER BY
                is_base DESC,
                is_active DESC,
                code
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [
              {
                id:
                  null,
                code:
                  baseCurrency,
                name:
                  baseCurrency,
                symbol:
                  null,
                decimal_places:
                  2,
                is_base:
                  true,
                is_active:
                  true,
              },
            ],
          }),
      currencyCenterReady
        ? context.pool.query(
            `
              SELECT
                id,
                currency,
                base_currency,
                rate_to_base,
                effective_date,
                source_type,
                source_name,
                is_active
              FROM invoicing_exchange_rates
              WHERE company_id = $1
              ORDER BY
                effective_date DESC,
                currency,
                updated_at DESC
              LIMIT 250
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows: [],
          }),
      context.pool.query(
        `
          SELECT
            currency,
            COUNT(*)::int
              AS document_count,
            COALESCE(
              SUM(total_amount),
              0
            ) AS transaction_total,
            COALESCE(
              SUM(base_total_amount),
              0
            ) AS base_total
          FROM sales_quotes
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status IN (
              'draft',
              'sent',
              'viewed',
              'accepted'
            )
          GROUP BY currency
          ORDER BY currency
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            currency,
            COUNT(*)::int
              AS document_count,
            COALESCE(
              SUM(total_amount),
              0
            ) AS transaction_total,
            COALESCE(
              SUM(base_total_amount),
              0
            ) AS base_total
          FROM sales_orders_v2
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status <> 'cancelled'
          GROUP BY currency
          ORDER BY currency
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  return {
    baseCurrency,
    currencyCenterReady,
    currencies:
      currencies.rows.map(
        row => ({
          id:
            row.id
              ? String(
                  row.id,
                )
              : null,
          code:
            String(
              row.code,
            ),
          name:
            String(
              row.name ||
              row.code,
            ),
          symbol:
            row.symbol
              ? String(
                  row.symbol,
                )
              : null,
          decimalPlaces:
            Number(
              row.decimal_places ??
              2,
            ),
          isBase:
            row.is_base ===
              true,
          isActive:
            row.is_active !==
              false,
        }),
      ),
    rates:
      rates.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          currency:
            String(
              row.currency,
            ),
          baseCurrency:
            String(
              row.base_currency,
            ),
          rate:
            Number(
              row.rate_to_base,
            ),
          effectiveDate:
            String(
              row.effective_date,
            ).slice(
              0,
              10,
            ),
          sourceType:
            String(
              row.source_type ||
              'manual',
            ),
          sourceName:
            row.source_name
              ? String(
                  row.source_name,
                )
              : null,
          isActive:
            row.is_active !==
              false,
        }),
      ),
    quoteExposure:
      quoteExposure.rows.map(
        row => ({
          currency:
            String(
              row.currency,
            ),
          documentCount:
            Number(
              row.document_count ||
              0,
            ),
          transactionTotal:
            Number(
              row.transaction_total ||
              0,
            ),
          baseTotal:
            Number(
              row.base_total ||
              0,
            ),
        }),
      ),
    orderExposure:
      orderExposure.rows.map(
        row => ({
          currency:
            String(
              row.currency,
            ),
          documentCount:
            Number(
              row.document_count ||
              0,
            ),
          transactionTotal:
            Number(
              row.transaction_total ||
              0,
            ),
          baseTotal:
            Number(
              row.base_total ||
              0,
            ),
        }),
      ),
  };
}
