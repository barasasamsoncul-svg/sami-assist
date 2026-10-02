import type {
  PoolClient,
} from 'pg';

import {
  AccountingInputError,
  accountingDate,
  accountingId,
  decimalAmount,
} from './validation';
import {
  buildFinancingSchedule,
  financingBaseCents,
  financingForeignDecimal,
  financingForeignUnits,
  financingInterestUnits,
  financingRateDecimal,
  financingRateScaled,
  type FinancingDayCount,
  type FinancingFrequency,
  type FinancingRepaymentStructure,
} from './financing-rules';

export type FinancingDirection =
  | 'borrowing'
  | 'lending';

export type FinancingFacilityRow =
  Record<
    string,
    unknown
  >;

export function financingBody(
  input:
    unknown,
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Enter valid loans and financing data.',
    );
  }

  return input as
    Record<
      string,
      unknown
    >;
}

export function financingText(
  value:
    unknown,
  max:
    number,
  label:
    string,
  required =
    false,
) {
  if (
    value != null &&
    typeof value !==
      'string'
  ) {
    throw new AccountingInputError(
      label +
      ' must contain text.',
    );
  }

  const result =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    required &&
    !result
  ) {
    throw new AccountingInputError(
      label +
      ' is required.',
    );
  }

  if (
    result.length >
    max
  ) {
    throw new AccountingInputError(
      label +
      ' must not exceed ' +
      max +
      ' characters.',
    );
  }

  return result;
}

export function financingBool(
  value:
    unknown,
  fallback =
    false,
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }

  if (
    value ===
      true ||
    value ===
      false
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose a valid enabled or disabled value.',
  );
}

export function financingOptionalId(
  value:
    unknown,
) {
  return value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
    ? null
    : accountingId(
        value,
      );
}

export function financingCurrency(
  value:
    unknown,
) {
  const result =
    financingText(
      value,
      3,
      'Currency',
      true,
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      result,
    )
  ) {
    throw new AccountingInputError(
      'Currency must use a three-letter ISO code.',
    );
  }

  return result;
}

export function financingDirection(
  value:
    unknown,
):
  FinancingDirection {
  if (
    value ===
      'borrowing' ||
    value ===
      'lending'
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose borrowing or lending.',
  );
}

export function financingChoice<
  T extends
    string,
>(
  value:
    unknown,
  allowed:
    readonly T[],
  label:
    string,
):
  T {
  if (
    typeof value !==
      'string' ||
    !allowed.includes(
      value as T,
    )
  ) {
    throw new AccountingInputError(
      'Choose a valid ' +
      label +
      '.',
    );
  }

  return value as
    T;
}

export function financingPositiveUnits(
  value:
    unknown,
  label:
    string,
) {
  try {
    return financingForeignUnits(
      value,
      label,
    );
  } catch (
    error
  ) {
    throw new AccountingInputError(
      error instanceof
        Error
        ? error.message
        : label +
          ' is invalid.',
    );
  }
}

export function financingRate(
  value:
    unknown,
  label =
    'Annual rate',
) {
  try {
    return financingRateDecimal(
      financingRateScaled(
        value,
        label,
      ),
    );
  } catch (
    error
  ) {
    throw new AccountingInputError(
      error instanceof
        Error
        ? error.message
        : label +
          ' is invalid.',
    );
  }
}

export function signedLedgerCents(
  value:
    unknown,
) {
  const raw =
    String(
      value ?? '0',
    ).trim();
  const negative =
    raw.startsWith(
      '-',
    );
  const unsigned =
    negative
      ? raw.slice(
          1,
        )
      : raw;

  if (
    !/^\d{1,18}(?:\.\d{1,8})?$/.test(
      unsigned,
    )
  ) {
    throw new AccountingInputError(
      'Financial balance is not a valid decimal value.',
    );
  }

  const [
    whole,
    fraction =
      '',
  ] =
    unsigned.split(
      '.',
    );
  const padded =
    fraction.padEnd(
      3,
      '0',
    );
  let amount =
    BigInt(
      whole ||
      '0',
    ) *
      BigInt(
        100,
      ) +
    BigInt(
      padded.slice(
        0,
        2,
      ) ||
      '0',
    );

  if (
    Number(
      padded[2] ||
      '0',
    ) >=
    5
  ) {
    amount +=
      BigInt(
        1,
      );
  }

  return negative
    ? -amount
    : amount;
}

export function signedForeignUnits(
  value:
    unknown,
) {
  const raw =
    String(
      value ?? '0',
    ).trim();
  const negative =
    raw.startsWith(
      '-',
    );
  const unsigned =
    negative
      ? raw.slice(
          1,
        )
      : raw;

  if (
    !/^\d{1,15}(?:\.\d{1,4})?$/.test(
      unsigned,
    )
  ) {
    throw new AccountingInputError(
      'Foreign balance is not a valid decimal value.',
    );
  }

  if (
    /^0(?:\.0{1,4})?$/.test(
      unsigned,
    )
  ) {
    return BigInt(
      0,
    );
  }

  const units =
    financingForeignUnits(
      unsigned,
    );

  return negative
    ? -units
    : units;
}

export async function financingAccount(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  companyId:
    string,
  accountId:
    string,
  label:
    string,
  expected:
    'asset' |
    'liability' |
    'expense' |
    'income',
) {
  const result =
    await client.query(
      `
        SELECT
          id::text,
          code,
          name,
          account_type,
          is_active
        FROM accounts
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
        LIMIT 1
        FOR SHARE
      `,
      [
        companyId,
        accountId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    row.is_active !==
      true
  ) {
    throw new AccountingInputError(
      label +
      ' must be an active account in this company.',
    );
  }

  const type =
    String(
      row.account_type ||
      '',
    );

  if (
    type !==
      expected &&
    !type.startsWith(
      expected +
      '_',
    )
  ) {
    throw new AccountingInputError(
      label +
      ' must use an ' +
      expected +
      ' account.',
    );
  }

  return row;
}

export async function financingRateToBase(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  input: {
    companyId:
      string;
    foreignCurrency:
      string;
    baseCurrency:
      string;
    date:
      string;
    rateType?:
      'spot' |
      'closing' |
      'average';
  },
) {
  if (
    input.foreignCurrency ===
    input.baseCurrency
  ) {
    return {
      rate:
        '1.0000000000',
      sourceType:
        'base',
      sourceName:
        'Base currency',
      effectiveDate:
        input.date,
      rateType:
        'spot',
    };
  }

  const requested =
    input.rateType ||
    'spot';
  const result =
    await client.query(
      `
        SELECT
          rate_to_base::text,
          source_type,
          source_name,
          effective_date::text,
          rate_type
        FROM accounting_exchange_rates
        WHERE company_id =
              $1
          AND currency =
              $2
          AND base_currency =
              $3
          AND is_active =
              TRUE
          AND deleted_at
              IS NULL
          AND effective_date <=
              $4
          AND rate_type IN (
            $5,
            'spot'
          )
        ORDER BY
          CASE
            WHEN rate_type =
                 $5
            THEN 0
            ELSE 1
          END,
          effective_date DESC,
          CASE source_type
            WHEN 'manual'
              THEN 0
            WHEN 'provider'
              THEN 1
            WHEN 'invoicing'
              THEN 2
            ELSE 3
          END,
          id DESC
        LIMIT 1
      `,
      [
        input.companyId,
        input.foreignCurrency,
        input.baseCurrency,
        input.date,
        requested,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new AccountingInputError(
      'No ' +
      requested +
      ' exchange rate is available for ' +
      input.foreignCurrency +
      '/' +
      input.baseCurrency +
      ' on or before ' +
      input.date +
      '. Add a rate in Accounting → Foreign Currency first.',
    );
  }

  const row =
    result.rows[0];

  return {
    rate:
      String(
        row.rate_to_base,
      ),
    sourceType:
      String(
        row.source_type,
      ),
    sourceName:
      String(
        row.source_name ||
        row.source_type,
      ),
    effectiveDate:
      String(
        row.effective_date,
      ).slice(
        0,
        10,
      ),
    rateType:
      String(
        row.rate_type,
      ),
  };
}

export async function financingFinancialAccountForUpdate(
  client:
    PoolClient,
  companyId:
    string,
  accountId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          bank.id::text,
          bank.name,
          bank.account_type,
          bank.ledger_account_id::text,
          bank.currency,
          bank.allow_overdraft,
          bank.overdraft_limit::text,
          bank.status,
          COALESCE(
            balance.book_balance,
            0
          )::text
            AS book_balance,
          COALESCE(
            balance.foreign_balance,
            0
          )::text
            AS foreign_balance
        FROM accounting_bank_accounts bank
        LEFT JOIN accounting_financial_account_balances balance
          ON balance.company_id =
             bank.company_id
         AND balance.bank_account_id =
             bank.id
        WHERE bank.company_id =
              $1
          AND bank.id =
              $2
          AND bank.deleted_at
              IS NULL
        LIMIT 1
        FOR UPDATE OF bank
      `,
      [
        companyId,
        accountId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    row.status !==
      'active'
  ) {
    throw new AccountingInputError(
      'Choose an active Accounting financial account.',
    );
  }

  if (
    !row.ledger_account_id
  ) {
    throw new AccountingInputError(
      'The selected financial account has no ledger mapping.',
    );
  }

  return row;
}

export function assertFinancingSettlementCurrency(
  financialAccount:
    Record<
      string,
      unknown
    >,
  facilityCurrency:
    string,
  baseCurrency:
    string,
) {
  const accountCurrency =
    String(
      financialAccount.currency,
    ).toUpperCase();

  if (
    accountCurrency !==
      facilityCurrency &&
    accountCurrency !==
      baseCurrency
  ) {
    throw new AccountingInputError(
      'The financial account currency must match either the financing facility currency or the company base currency. Use a controlled FX transfer first for a third currency.',
    );
  }
}

export function assertFinancingFunds(
  financialAccount:
    Record<
      string,
      unknown
    >,
  input: {
    foreignAmount:
      bigint;
    baseAmount:
      bigint;
    facilityCurrency:
      string;
    baseCurrency:
      string;
  },
) {
  const accountCurrency =
    String(
      financialAccount.currency,
    ).toUpperCase();
  const requested =
    accountCurrency ===
      input.baseCurrency
      ? input.baseAmount
      : input.foreignAmount;
  const balance =
    accountCurrency ===
      input.baseCurrency
      ? signedLedgerCents(
          financialAccount
            .book_balance,
        )
      : signedForeignUnits(
          financialAccount
            .foreign_balance,
        );
  const overdraft =
    financialAccount
      .allow_overdraft ===
      true
      ? accountCurrency ===
          input.baseCurrency
        ? signedLedgerCents(
            financialAccount
              .overdraft_limit ||
            '0',
          )
        : signedForeignUnits(
            financialAccount
              .overdraft_limit ||
            '0',
          )
      : BigInt(
          0,
        );

  if (
    balance -
      requested <
    -overdraft
  ) {
    throw new AccountingInputError(
      'This financing payment exceeds the available financial-account balance and overdraft limit.',
    );
  }
}

export async function recordFinancingFxMovement(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  input: {
    companyId:
      string;
    userId:
      string;
    bankAccountId:
      string;
    baseCurrency:
      string;
    accountCurrency:
      string;
    sourceType:
      string;
    sourceId:
      string;
    eventKey:
      string;
    date:
      string;
    foreignAmountUnits:
      bigint;
    baseAmountCents:
      bigint;
    rate:
      string;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  if (
    input.accountCurrency ===
    input.baseCurrency
  ) {
    return;
  }

  if (
    input.foreignAmountUnits ===
      BigInt(
        0,
      ) ||
    input.baseAmountCents ===
      BigInt(
        0,
      )
  ) {
    return;
  }

  await client.query(
    `
      INSERT INTO accounting_fx_financial_movements (
        company_id,
        bank_account_id,
        source_type,
        source_id,
        source_event_key,
        movement_date,
        currency,
        foreign_amount,
        base_amount,
        rate_to_base,
        status,
        created_by,
        metadata
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        'posted',$11,$12::jsonb
      )
      ON CONFLICT (
        company_id,
        bank_account_id,
        source_event_key
      )
      DO NOTHING
    `,
    [
      input.companyId,
      input.bankAccountId,
      input.sourceType,
      input.sourceId,
      input.eventKey,
      input.date,
      input.accountCurrency,
      financingForeignDecimal(
        input.foreignAmountUnits,
      ),
      decimalAmount(
        input.baseAmountCents,
      ),
      input.rate,
      input.userId,
      JSON.stringify(
        input.metadata ||
        {},
      ),
    ],
  );
}

export async function financingFacilityForUpdate(
  client:
    PoolClient,
  companyId:
    string,
  facilityId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM accounting_financing_facilities
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        companyId,
        facilityId,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new AccountingInputError(
      'Financing facility not found.',
    );
  }

  return result.rows[0] as
    FinancingFacilityRow;
}

export async function financingOutstandingPrincipalUnits(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  companyId:
    string,
  facilityId:
    string,
  asOf?:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN transaction_type =
                     'drawdown'
                THEN principal_foreign
                WHEN transaction_type =
                     'principal_repayment'
                THEN -principal_foreign
                ELSE 0
              END
            ),
            0
          )::numeric(19,4)::text
            AS outstanding
        FROM accounting_financing_transactions
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND deleted_at
              IS NULL
          AND status =
              'posted'
          AND (
            $3::date IS NULL
            OR transaction_date <=
               $3::date
          )
      `,
      [
        companyId,
        facilityId,
        asOf ||
          null,
      ],
    );

  return signedForeignUnits(
    result.rows[0]
      ?.outstanding ||
    '0',
  );
}

export async function financingOutstandingInterestUnits(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  companyId:
    string,
  facilityId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          (
            COALESCE(
              (
                SELECT SUM(
                  foreign_interest_amount
                )
                FROM accounting_financing_interest_accruals
                WHERE company_id =
                      $1
                  AND facility_id =
                      $2
                  AND deleted_at
                      IS NULL
                  AND status =
                      'posted'
              ),
              0
            )
            -
            COALESCE(
              (
                SELECT SUM(
                  interest_foreign
                )
                FROM accounting_financing_transactions
                WHERE company_id =
                      $1
                  AND facility_id =
                      $2
                  AND deleted_at
                      IS NULL
                  AND status =
                      'posted'
              ),
              0
            )
          )::numeric(19,4)::text
            AS outstanding
      `,
      [
        companyId,
        facilityId,
      ],
    );

  const units =
    signedForeignUnits(
      result.rows[0]
        ?.outstanding ||
      '0',
    );

  return units >
      BigInt(
        0,
      )
    ? units
    : BigInt(
        0,
      );
}

export async function financingEffectiveRate(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  facility:
    FinancingFacilityRow,
  date:
    string,
) {
  if (
    facility.rate_type ===
      'fixed'
  ) {
    if (
      facility.annual_rate ==
      null
    ) {
      throw new AccountingInputError(
        'The fixed-rate facility has no annual rate.',
      );
    }

    return financingRate(
      facility.annual_rate,
    );
  }

  const result =
    await client.query(
      `
        SELECT
          effective_annual_rate::text
        FROM accounting_financing_rate_periods
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND deleted_at
              IS NULL
          AND status =
              'active'
          AND effective_date <=
              $3::date
        ORDER BY
          effective_date DESC,
          created_at DESC,
          id DESC
        LIMIT 1
      `,
      [
        facility.company_id,
        facility.id,
        date,
      ],
    );

  if (
    !result.rows[0]
  ) {
    throw new AccountingInputError(
      'Add a variable-rate period effective on or before ' +
      date +
      ' before calculating this facility.',
    );
  }

  return financingRate(
    result.rows[0]
      .effective_annual_rate,
  );
}

export async function rebuildFinancingSchedule(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    facility:
      FinancingFacilityRow;
    principalUnits:
      bigint;
    startDate:
      string;
  },
) {
  const currentRevision =
    Number(
      input.facility
        .schedule_revision ||
      1,
    );
  const existing =
    await client.query(
      `
        SELECT COUNT(*)::int
          AS count
        FROM accounting_financing_schedule_lines
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND revision =
              $3
          AND deleted_at
              IS NULL
      `,
      [
        input.companyId,
        input.facility.id,
        currentRevision,
      ],
    );
  const revision =
    Number(
      existing.rows[0]
        ?.count ||
      0,
    ) >
      0
      ? currentRevision +
        1
      : currentRevision;

  if (
    revision !==
    currentRevision
  ) {
    await client.query(
      `
        UPDATE accounting_financing_schedule_lines
        SET
          status =
            'superseded',
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND revision =
              $3
          AND deleted_at
              IS NULL
          AND status IN (
            'projected',
            'due'
          )
      `,
      [
        input.companyId,
        input.facility.id,
        currentRevision,
        input.userId,
      ],
    );
  }

  await client.query(
    `
      UPDATE accounting_financing_facilities
      SET
        schedule_revision =
          $3,
        updated_by =
          $4,
        updated_at =
          NOW()
      WHERE company_id =
            $1
        AND id =
            $2
    `,
    [
      input.companyId,
      input.facility.id,
      revision,
      input.userId,
    ],
  );

  if (
    input.principalUnits <=
      BigInt(
        0,
      ) ||
    input.startDate >=
      String(
        input.facility
          .maturity_date,
      ).slice(
        0,
        10,
      )
  ) {
    return {
      revision,
      periods:
        0,
    };
  }

  const rate =
    await financingEffectiveRate(
      client,
      input.facility,
      input.startDate,
    );

  let schedule:
    ReturnType<
      typeof buildFinancingSchedule
    >;

  try {
    schedule =
      buildFinancingSchedule({
        principal:
          financingForeignDecimal(
            input.principalUnits,
          ),
        startDate:
          input.startDate,
        maturityDate:
          String(
            input.facility
              .maturity_date,
          ).slice(
            0,
            10,
          ),
        annualRate:
          rate,
        dayCount:
          String(
            input.facility
              .day_count,
          ) as
            FinancingDayCount,
        frequency:
          String(
            input.facility
              .payment_frequency,
          ) as
            FinancingFrequency,
        structure:
          String(
            input.facility
              .repayment_structure,
          ) as
            FinancingRepaymentStructure,
      });
  } catch (
    error
  ) {
    throw new AccountingInputError(
      error instanceof
        Error
        ? error.message
        : 'The financing schedule could not be calculated.',
    );
  }

  for (
    const line
    of schedule
  ) {
    await client.query(
      `
        INSERT INTO accounting_financing_schedule_lines (
          company_id,
          facility_id,
          revision,
          sequence,
          period_start,
          period_end,
          due_date,
          opening_principal,
          scheduled_principal,
          scheduled_interest,
          scheduled_fee,
          closing_principal,
          annual_rate,
          day_count_days,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          0,$11,$12,$13,'projected',$14,$14
        )
      `,
      [
        input.companyId,
        input.facility.id,
        revision,
        line.sequence,
        line.periodStart,
        line.periodEnd,
        line.dueDate,
        line.openingPrincipal,
        line.scheduledPrincipal,
        line.scheduledInterest,
        line.closingPrincipal,
        line.annualRate,
        line.dayCountDays,
        input.userId,
      ],
    );
  }

  return {
    revision,
    periods:
      schedule.length,
  };
}

export async function calculateFinancingInterest(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  input: {
    companyId:
      string;
    facility:
      FinancingFacilityRow;
    startDate:
      string;
    endDate:
      string;
  },
) {
  const startDate =
    accountingDate(
      input.startDate,
    );
  const endDate =
    accountingDate(
      input.endDate,
    );

  if (
    endDate <=
    startDate
  ) {
    return {
      principalUnits:
        BigInt(
          0,
        ),
      interestUnits:
        BigInt(
          0,
        ),
      endRate:
        await financingEffectiveRate(
          client,
          input.facility,
          endDate,
        ),
      segments:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
    };
  }

  let principal =
    await financingOutstandingPrincipalUnits(
      client,
      input.companyId,
      String(
        input.facility.id,
      ),
      startDate,
    );
  const initialPrincipal =
    principal;

  const transactionEvents =
    await client.query(
      `
        SELECT
          transaction_date::text
            AS event_date,
          transaction_type,
          principal_foreign::text
        FROM accounting_financing_transactions
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND deleted_at
              IS NULL
          AND status =
              'posted'
          AND transaction_date >
              $3::date
          AND transaction_date <=
              $4::date
          AND transaction_type IN (
            'drawdown',
            'principal_repayment'
          )
        ORDER BY
          transaction_date,
          created_at,
          id
      `,
      [
        input.companyId,
        input.facility.id,
        startDate,
        endDate,
      ],
    );

  const rateEvents =
    input.facility
      .rate_type ===
      'variable'
      ? await client.query(
          `
            SELECT
              effective_date::text
                AS event_date,
              effective_annual_rate::text
                AS rate
            FROM accounting_financing_rate_periods
            WHERE company_id =
                  $1
              AND facility_id =
                  $2
              AND deleted_at
                  IS NULL
              AND status =
                  'active'
              AND effective_date >
                  $3::date
              AND effective_date <=
                  $4::date
            ORDER BY
              effective_date,
              created_at,
              id
          `,
          [
            input.companyId,
            input.facility.id,
            startDate,
            endDate,
          ],
        )
      : {
          rows:
            [] as Array<
              Record<
                string,
                unknown
              >
            >,
        };

  const dates =
    new Set<
      string
    >();

  for (
    const row
    of transactionEvents.rows
  ) {
    dates.add(
      String(
        row.event_date,
      ).slice(
        0,
        10,
      ),
    );
  }

  for (
    const row
    of rateEvents.rows
  ) {
    dates.add(
      String(
        row.event_date,
      ).slice(
        0,
        10,
      ),
    );
  }

  dates.add(
    endDate,
  );

  const ordered =
    [
      ...dates,
    ].sort();

  let cursor =
    startDate;
  let rate =
    await financingEffectiveRate(
      client,
      input.facility,
      cursor,
    );
  let total =
    BigInt(
      0,
    );
  const segments:
    Array<
      Record<
        string,
        unknown
      >
    > = [];

  for (
    const eventDate
    of ordered
  ) {
    if (
      eventDate >
      cursor &&
      principal >
      BigInt(
        0,
      )
    ) {
      const interest =
        financingInterestUnits({
          principalUnits:
            principal,
          annualRate:
            rate,
          startDate:
            cursor,
          endDate:
            eventDate,
          dayCount:
            String(
              input.facility
                .day_count,
            ) as
              FinancingDayCount,
        });

      total +=
        interest;

      segments.push({
        startDate:
          cursor,
        endDate:
          eventDate,
        principal:
          financingForeignDecimal(
            principal,
          ),
        annualRate:
          rate,
        interest:
          financingForeignDecimal(
            interest,
          ),
      });
    }

    for (
      const row
      of transactionEvents.rows
    ) {
      if (
        String(
          row.event_date,
        ).slice(
          0,
          10,
        ) !==
        eventDate
      ) {
        continue;
      }

      const units =
        financingPositiveUnits(
          row.principal_foreign,
          'Principal movement',
        );

      principal +=
        row.transaction_type ===
          'drawdown'
          ? units
          : -units;

      if (
        principal <
        BigInt(
          0,
        )
      ) {
        principal =
          BigInt(
            0,
          );
      }
    }

    const rateOnDate =
      rateEvents.rows
        .filter(
          row =>
            String(
              row.event_date,
            ).slice(
              0,
              10,
            ) ===
            eventDate,
        )
        .at(
          -1,
        );

    if (
      rateOnDate
    ) {
      rate =
        financingRate(
          rateOnDate.rate,
        );
    }

    cursor =
      eventDate;
  }

  return {
    principalUnits:
      initialPrincipal,
    closingPrincipalUnits:
      principal,
    interestUnits:
      total,
    endRate:
      rate,
    segments,
  };
}

export function financingBaseAmount(
  foreignUnits:
    bigint,
  rate:
    string,
) {
  try {
    return financingBaseCents(
      foreignUnits,
      rate,
    );
  } catch (
    error
  ) {
    throw new AccountingInputError(
      error instanceof
        Error
        ? error.message
        : 'The base-currency amount could not be calculated.',
    );
  }
}
