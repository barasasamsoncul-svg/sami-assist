export type AccrualFrequency =
  | 'monthly'
  | 'quarterly'
  | 'annual';

export type AccrualAllocationMethod =
  | 'equal_periods'
  | 'actual_days';

export type AccrualPeriod = {
  sequence:
    number;
  periodStart:
    string;
  periodEnd:
    string;
  postingDate:
    string;
  amount:
    string;
};

export function accrualMoneyCents(
  value:
    unknown,
  label =
    'Amount',
) {
  const text =
    String(
      value ?? '',
    ).trim();

  if (
    !/^\d{1,13}(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    throw new Error(
      label +
      ' must be a positive amount with at most two decimal places.',
    );
  }

  const [
    whole,
    fraction =
      '',
  ] =
    text.split(
      '.',
    );

  const amount =
    BigInt(
      whole,
    ) *
      BigInt(
        100,
      ) +
    BigInt(
      fraction.padEnd(
        2,
        '0',
      ),
    );

  if (
    amount <=
    BigInt(
      0,
    )
  ) {
    throw new Error(
      label +
      ' must be greater than zero.',
    );
  }

  return amount;
}

export function accrualMoneyDecimal(
  cents:
    bigint,
) {
  const negative =
    cents <
    BigInt(
      0,
    );
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
      BigInt(
        100,
      ),
    ) +
    '.' +
    String(
      amount %
      BigInt(
        100,
      ),
    ).padStart(
      2,
      '0',
    )
  );
}

function parseDate(
  value:
    string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      'Accrual dates must use YYYY-MM-DD.',
    );
  }

  const date =
    new Date(
      value +
      'T00:00:00.000Z',
    );

  if (
    Number.isNaN(
      date.getTime(),
    ) ||
    date
      .toISOString()
      .slice(
        0,
        10,
      ) !==
      value
  ) {
    throw new Error(
      'Accrual date is invalid.',
    );
  }

  return date;
}

function iso(
  date:
    Date,
) {
  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function addDays(
  value:
    string,
  days:
    number,
) {
  const date =
    parseDate(
      value,
    );

  date.setUTCDate(
    date.getUTCDate() +
      days,
  );

  return iso(
    date,
  );
}

function lastDay(
  year:
    number,
  month:
    number,
) {
  return new Date(
    Date.UTC(
      year,
      month,
      0,
    ),
  ).getUTCDate();
}

function addMonthsClamped(
  value:
    string,
  months:
    number,
) {
  const date =
    parseDate(
      value,
    );
  const year =
    date.getUTCFullYear();
  const monthIndex =
    date.getUTCMonth() +
    months;
  const targetYear =
    year +
    Math.floor(
      monthIndex /
      12,
    );
  const normalizedMonth =
    (
      (
        monthIndex %
        12
      ) +
      12
    ) %
    12;
  const day =
    Math.min(
      date.getUTCDate(),
      lastDay(
        targetYear,
        normalizedMonth +
          1,
      ),
    );

  return iso(
    new Date(
      Date.UTC(
        targetYear,
        normalizedMonth,
        day,
      ),
    ),
  );
}

function daysInclusive(
  start:
    string,
  end:
    string,
) {
  const startTime =
    parseDate(
      start,
    ).getTime();
  const endTime =
    parseDate(
      end,
    ).getTime();

  if (
    endTime <
    startTime
  ) {
    throw new Error(
      'Accrual end date cannot be before its start date.',
    );
  }

  return Math.floor(
    (
      endTime -
      startTime
    ) /
      86_400_000,
  ) +
    1;
}

function frequencyMonths(
  value:
    AccrualFrequency,
) {
  if (
    value ===
      'monthly'
  ) {
    return 1;
  }

  if (
    value ===
      'quarterly'
  ) {
    return 3;
  }

  return 12;
}

export function buildAccrualPeriods(
  input: {
    startDate:
      string;
    endDate:
      string;
    frequency:
      AccrualFrequency;
    allocationMethod:
      AccrualAllocationMethod;
    totalAmount:
      unknown;
  },
):
  AccrualPeriod[] {
  const startDate =
    iso(
      parseDate(
        input.startDate,
      ),
    );
  const endDate =
    iso(
      parseDate(
        input.endDate,
      ),
    );

  if (
    endDate <
    startDate
  ) {
    throw new Error(
      'Accrual end date cannot be before its start date.',
    );
  }

  const total =
    accrualMoneyCents(
      input.totalAmount,
      'Schedule total',
    );
  const step =
    frequencyMonths(
      input.frequency,
    );
  const windows:
    Array<{
      start:
        string;
      end:
        string;
      days:
        number;
    }> = [];

  let current =
    startDate;

  while (
    current <=
    endDate
  ) {
    const next =
      addMonthsClamped(
        current,
        step,
      );
    const candidateEnd =
      addDays(
        next,
        -1,
      );
    const periodEnd =
      candidateEnd <
        endDate
        ? candidateEnd
        : endDate;

    windows.push({
      start:
        current,
      end:
        periodEnd,
      days:
        daysInclusive(
          current,
          periodEnd,
        ),
    });

    current =
      addDays(
        periodEnd,
        1,
      );

    if (
      windows.length >
      600
    ) {
      throw new Error(
        'Accrual schedule is too long.',
      );
    }
  }

  const weights =
    input.allocationMethod ===
      'actual_days'
      ? windows.map(
          window =>
            BigInt(
              window.days,
            ),
        )
      : windows.map(
          () =>
            BigInt(
              1,
            ),
        );

  const totalWeight =
    weights.reduce(
      (
        sum,
        weight,
      ) =>
        sum +
        weight,
      BigInt(
        0,
      ),
    );

  const amounts =
    weights.map(
      weight =>
        total *
        weight /
        totalWeight,
    );

  let allocated =
    amounts.reduce(
      (
        sum,
        amount,
      ) =>
        sum +
        amount,
      BigInt(
        0,
      ),
    );
  let remainder =
    total -
    allocated;
  let index =
    0;

  while (
    remainder >
    BigInt(
      0,
    )
  ) {
    amounts[
      index %
      amounts.length
    ] +=
      BigInt(
        1,
      );
    remainder -=
      BigInt(
        1,
      );
    allocated +=
      BigInt(
        1,
      );
    index +=
      1;
  }

  return windows.map(
    (
      window,
      periodIndex,
    ) => ({
      sequence:
        periodIndex +
        1,
      periodStart:
        window.start,
      periodEnd:
        window.end,
      postingDate:
        window.end,
      amount:
        accrualMoneyDecimal(
          amounts[
            periodIndex
          ],
        ),
    }),
  );
}

export function accrualAutoReversalDate(
  periodEnd:
    string,
) {
  return addDays(
    periodEnd,
    1,
  );
}
