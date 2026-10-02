export type BudgetScenario =
  | 'base'
  | 'upside'
  | 'downside'
  | 'custom';

export function budgetMoneyCents(
  value: unknown,
  label = 'Amount',
) {
  const text =
    String(
      value ?? '',
    ).trim();

  if (
    !/^-?\d{1,13}(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    throw new Error(
      label +
        ' must be a decimal with at most two decimal places.',
    );
  }

  const negative =
    text.startsWith(
      '-',
    );
  const unsigned =
    negative
      ? text.slice(
          1,
        )
      : text;
  const [
    whole,
    fraction = '',
  ] =
    unsigned.split(
      '.',
    );
  const cents =
    BigInt(
      whole,
    ) *
      BigInt(100) +
    BigInt(
      fraction.padEnd(
        2,
        '0',
      ),
    );

  return negative
    ? -cents
    : cents;
}

export function budgetMoneyDecimal(
  cents: bigint,
) {
  const negative =
    cents <
    BigInt(0);
  const amount =
    negative
      ? -cents
      : cents;

  return (
    (
      negative
        ? '-'
        : ''
    ) +
    String(
      amount /
        BigInt(100),
    ) +
    '.' +
    String(
      amount %
        BigInt(100),
    ).padStart(
      2,
      '0',
    )
  );
}

function iso(
  date: Date,
) {
  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

export function isMonthStart(
  value: string,
) {
  return value.endsWith(
    '-01',
  );
}

export function isMonthEnd(
  value: string,
) {
  const date =
    new Date(
      value +
        'T00:00:00.000Z',
    );
  const next =
    new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() +
          1,
        1,
      ),
    );
  next.setUTCDate(
    0,
  );

  return (
    iso(
      next,
    ) ===
    value
  );
}

export function buildBudgetMonths(
  startDate: string,
  endDate: string,
) {
  if (
    !isMonthStart(
      startDate,
    )
  ) {
    throw new Error(
      'Budget start date must be the first day of a month.',
    );
  }

  if (
    !isMonthEnd(
      endDate,
    )
  ) {
    throw new Error(
      'Budget end date must be the final day of a month.',
    );
  }

  const start =
    new Date(
      startDate +
        'T00:00:00.000Z',
    );
  const end =
    new Date(
      endDate +
        'T00:00:00.000Z',
    );
  const months: Array<{
    periodStart: string;
    periodEnd: string;
  }> = [];

  const cursor =
    new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        1,
      ),
    );

  while (
    cursor <=
    end
  ) {
    const periodStart =
      iso(
        cursor,
      );
    const monthEnd =
      new Date(
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth() +
            1,
          0,
        ),
      );

    months.push({
      periodStart,
      periodEnd:
        iso(
          monthEnd,
        ),
    });

    cursor.setUTCMonth(
      cursor.getUTCMonth() +
        1,
    );

    if (
      months.length >
      60
    ) {
      throw new Error(
        'Budget horizon cannot exceed 60 months.',
      );
    }
  }

  return months;
}

export function parseGrowthPercentScaled(
  value: unknown,
) {
  const text =
    String(
      value ?? '0',
    ).trim();

  if (
    !/^-?\d{1,3}(?:\.\d{1,4})?$/.test(
      text,
    )
  ) {
    throw new Error(
      'Growth percent must have at most four decimal places.',
    );
  }

  const negative =
    text.startsWith(
      '-',
    );
  const unsigned =
    negative
      ? text.slice(
          1,
        )
      : text;
  const [
    whole,
    fraction = '',
  ] =
    unsigned.split(
      '.',
    );
  const scaled =
    BigInt(
      whole,
    ) *
      BigInt(10000) +
    BigInt(
      fraction.padEnd(
        4,
        '0',
      ),
    );
  const signed =
    negative
      ? -scaled
      : scaled;

  if (
    signed <
      -BigInt(1000000) ||
    signed >
      BigInt(10000000)
  ) {
    throw new Error(
      'Growth percent must be between -100% and 1000%.',
    );
  }

  return signed;
}

export function applyBudgetGrowth(
  cents: bigint,
  growthPercentScaled: bigint,
) {
  const denominator =
    BigInt(1000000);
  const numerator =
    denominator +
    growthPercentScaled;
  const raw =
    cents *
    numerator;

  if (
    raw >=
    BigInt(0)
  ) {
    return (
      raw +
      denominator /
        BigInt(2)
    ) /
      denominator;
  }

  return -(
    (
      -raw +
      denominator /
        BigInt(2)
    ) /
    denominator
  );
}

export function budgetVariance(
  accountType: string,
  planned: bigint,
  actual: bigint,
) {
  const amount =
    actual -
    planned;
  const favorable =
    accountType ===
        'income' ||
      accountType.startsWith(
        'income_',
      )
      ? amount >=
        BigInt(0)
      : accountType ===
          'expense' ||
        accountType.startsWith(
          'expense_',
        )
        ? amount <=
          BigInt(0)
        : null;

  return {
    amount,
    favorable,
  };
}

export function variancePercent(
  planned: bigint,
  variance: bigint,
) {
  if (
    planned ===
    BigInt(0)
  ) {
    return null;
  }

  const abs =
    planned <
      BigInt(0)
      ? -planned
      : planned;

  return Number(
    (
      variance *
      BigInt(1000000)
    ) /
      abs,
  ) /
    10000;
}
