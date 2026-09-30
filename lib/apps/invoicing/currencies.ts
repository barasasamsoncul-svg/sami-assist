import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  INVOICING_PERMISSIONS,
  InvoicingError,
  isoDate,
  numberInput,
  requireInvoicingContext,
} from '@/lib/apps/invoicing/context';


export type InvoicingResolvedExchangeRate = {
  currency: string;
  baseCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string;
  sourceName: string | null;
  manualOverride: boolean;
};


export function normalizeInvoicingCurrencyCode(
  value: unknown,
  label = 'Currency',
) {
  const code =
    cleanText(
      value,
      3,
    )
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      code,
    )
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      label +
      ' must be a three-letter ISO currency code.',
    );
  }

  return code;
}


function roundedRate(
  value: unknown,
  label = 'Exchange rate',
) {
  const rate =
    numberInput(
      value,
      label,
      {
        min:
          0.00000001,
      },
    );

  return Math.round(
    rate *
    100000000,
  ) /
    100000000;
}


async function currencyExists(
  client: PoolClient,
  companyId: string,
  code: string,
) {
  const result =
    await client.query(
      `
        SELECT
          code,
          is_active
        FROM invoicing_currencies
        WHERE company_id = $1
          AND code = $2
        LIMIT 1
      `,
      [
        companyId,
        code,
      ],
    );

  return result.rows[0] ||
    null;
}


async function recordCurrencyActivity(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    recordId: string;
    type: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      INSERT INTO activities (
        company_id,
        user_id,
        model,
        record_id,
        type,
        content,
        metadata
      )
      VALUES (
        $1,$2,
        'invoicing.currency',
        $3,$4,$5,$6::jsonb
      )
    `,
    [
      input.companyId,
      input.userId,
      input.recordId,
      input.type,
      input.content,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}


export async function resolveInvoicingExchangeRate(
  client: PoolClient,
  input: {
    companyId: string;
    currency: unknown;
    baseCurrency: unknown;
    effectiveDate: unknown;
    manualRate?: unknown;
  },
): Promise<InvoicingResolvedExchangeRate> {
  const currency =
    normalizeInvoicingCurrencyCode(
      input.currency,
    );

  const baseCurrency =
    normalizeInvoicingCurrencyCode(
      input.baseCurrency,
      'Base currency',
    );

  const effectiveDate =
    isoDate(
      input.effectiveDate,
      new Date(),
    );

  const configuredCurrency =
    await currencyExists(
      client,
      input.companyId,
      currency,
    );

  if (
    !configuredCurrency ||
    configuredCurrency
      .is_active !==
      true
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Currency ' +
      currency +
      ' is not active in Currency Center.',
    );
  }

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
        null,
      manualOverride:
        false,
    };
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
        roundedRate(
          input.manualRate,
        ),
      effectiveDate,
      source:
        'manual_override',
      sourceName:
        'invoice/payment override',
      manualOverride:
        true,
    };
  }

  const rateResult =
    await client.query(
      `
        SELECT
          rate_to_base,
          effective_date,
          source_type,
          source_name
        FROM invoicing_exchange_rates
        WHERE company_id = $1
          AND currency = $2
          AND base_currency = $3
          AND effective_date <= $4::date
          AND is_active = TRUE
        ORDER BY
          effective_date DESC,
          updated_at DESC,
          id DESC
        LIMIT 1
      `,
      [
        input.companyId,
        currency,
        baseCurrency,
        effectiveDate,
      ],
    );

  if (
    rateResult.rows.length !==
      1
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'No exchange rate is available for ' +
      currency +
      ' to ' +
      baseCurrency +
      ' on or before ' +
      effectiveDate +
      '. Add a dated rate in Currency Center or enter a manual rate.',
      {
        currency,
        baseCurrency,
        effectiveDate,
      },
    );
  }

  const row =
    rateResult.rows[0];

  return {
    currency,
    baseCurrency,
    rate:
      roundedRate(
        row.rate_to_base,
      ),
    effectiveDate:
      String(
        row.effective_date,
      ),
    source:
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
    manualOverride:
      false,
  };
}


export async function saveInvoicingCurrency(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const code =
    normalizeInvoicingCurrencyCode(
      input.code,
    );

  const name =
    cleanText(
      input.name,
      120,
    );

  if (!name) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'Currency name is required.',
    );
  }

  const symbol =
    cleanText(
      input.symbol,
      16,
    ) ||
    code;

  const decimalPlaces =
    Math.trunc(
      numberInput(
        input.decimalPlaces ===
          undefined ||
        input.decimalPlaces ===
          null ||
        input.decimalPlaces ===
          ''
          ? 2
          : input.decimalPlaces,
        'Decimal places',
        {
          min:
            0,
          max:
            6,
        },
      ),
    );

  const isBase =
    input.isBase ===
      true ||
    input.isBase ===
      'true';

  const isActive =
    input.isActive ===
      false ||
    input.isActive ===
      'false'
      ? false
      : true;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (isBase) {
      await client.query(
        `
          UPDATE invoicing_currencies
          SET
            is_base = FALSE,
            updated_at = NOW(),
            updated_by = $2
          WHERE company_id = $1
            AND is_base = TRUE
        `,
        [
          context.companyId,
          context.userId,
        ],
      );
    }

    const saved =
      await client.query(
        `
          INSERT INTO invoicing_currencies (
            company_id,
            code,
            name,
            symbol,
            decimal_places,
            is_active,
            is_base,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$8
          )
          ON CONFLICT (
            company_id,
            code
          )
          DO UPDATE
          SET
            name =
              EXCLUDED.name,
            symbol =
              EXCLUDED.symbol,
            decimal_places =
              EXCLUDED.decimal_places,
            is_active =
              EXCLUDED.is_active,
            is_base =
              EXCLUDED.is_base,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
          RETURNING
            id,
            code,
            is_base
        `,
        [
          context.companyId,
          code,
          name,
          symbol,
          decimalPlaces,
          isActive,
          isBase,
          context.userId,
        ],
      );

    if (isBase) {
      await client.query(
        `
          UPDATE invoicing_settings
          SET
            base_currency =
              $2,
            updated_by =
              $3,
            updated_at =
              NOW()
          WHERE company_id =
                $1
        `,
        [
          context.companyId,
          code,
          context.userId,
        ],
      );
    }

    await recordCurrencyActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        recordId:
          String(
            saved.rows[0].id,
          ),
        type:
          'invoicing.currency_saved',
        content:
          'Currency ' +
          code +
          ' saved.',
        metadata: {
          code,
          isBase,
          isActive,
          decimalPlaces,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          saved.rows[0].id,
        ),
      code,
      isBase,
      isActive,
      decimalPlaces,
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


export async function saveInvoicingExchangeRate(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireInvoicingContext(
      INVOICING_PERMISSIONS
        .SETTINGS_MANAGE,
    );

  const settings =
    await context.pool.query(
      `
        SELECT
          COALESCE(
            base_currency,
            default_currency,
            $2
          ) AS base_currency
        FROM invoicing_settings
        WHERE company_id =
              $1
        LIMIT 1
      `,
      [
        context.companyId,
        context.company
          .currentCompany
          .currency ||
          'KES',
      ],
    );

  const baseCurrency =
    normalizeInvoicingCurrencyCode(
      settings.rows[0]
        ?.base_currency ||
      context.company
        .currentCompany
        .currency ||
      'KES',
      'Base currency',
    );

  const currency =
    normalizeInvoicingCurrencyCode(
      input.currency,
    );

  if (
    currency ===
    baseCurrency
  ) {
    throw new InvoicingError(
      'INVALID_INPUT',
      'The base currency always has an exchange rate of 1 and does not need a rate entry.',
    );
  }

  const rate =
    roundedRate(
      input.rate,
    );

  const effectiveDate =
    isoDate(
      input.effectiveDate,
      new Date(),
    );

  const sourceTypeRaw =
    cleanText(
      input.sourceType,
      30,
    ) ||
    'manual';

  const sourceType =
    [
      'manual',
      'provider',
      'import',
    ].includes(
      sourceTypeRaw,
    )
      ? sourceTypeRaw
      : 'manual';

  const sourceName =
    cleanText(
      input.sourceName,
      120,
    ) ||
    (
      sourceType ===
        'manual'
        ? 'SaMi manual rate'
        : null
    );

  const note =
    cleanText(
      input.note,
      1000,
    ) ||
    null;

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const configured =
      await currencyExists(
        client,
        context.companyId,
        currency,
      );

    if (
      !configured
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        'Add ' +
        currency +
        ' to Currency Center before saving an exchange rate.',
      );
    }

    if (
      configured.is_active !==
        true
    ) {
      throw new InvoicingError(
        'INVALID_INPUT',
        currency +
        ' is inactive in Currency Center.',
      );
    }

    const saved =
      await client.query(
        `
          INSERT INTO invoicing_exchange_rates (
            company_id,
            currency,
            base_currency,
            rate_to_base,
            effective_date,
            source_type,
            source_name,
            note,
            is_active,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            TRUE,
            $9,$9
          )
          ON CONFLICT (
            company_id,
            currency,
            base_currency,
            effective_date
          )
          DO UPDATE
          SET
            rate_to_base =
              EXCLUDED.rate_to_base,
            source_type =
              EXCLUDED.source_type,
            source_name =
              EXCLUDED.source_name,
            note =
              EXCLUDED.note,
            is_active =
              TRUE,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
          RETURNING
            id
        `,
        [
          context.companyId,
          currency,
          baseCurrency,
          rate,
          effectiveDate,
          sourceType,
          sourceName,
          note,
          context.userId,
        ],
      );

    await recordCurrencyActivity(
      client,
      {
        companyId:
          context.companyId,
        userId:
          context.userId,
        recordId:
          String(
            saved.rows[0].id,
          ),
        type:
          'invoicing.exchange_rate_saved',
        content:
          currency +
          '/' +
          baseCurrency +
          ' exchange rate saved.',
        metadata: {
          currency,
          baseCurrency,
          rate,
          effectiveDate,
          sourceType,
          sourceName,
        },
      },
    );

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          saved.rows[0].id,
        ),
      currency,
      baseCurrency,
      rate,
      effectiveDate,
      sourceType,
      sourceName,
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
