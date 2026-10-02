export type FinancingDayCount =
  | 'actual_365'
  | 'actual_360'
  | 'thirty_360';

export type FinancingFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'bullet'
  | 'custom';

export type FinancingRepaymentStructure =
  | 'annuity'
  | 'equal_principal'
  | 'interest_only'
  | 'bullet'
  | 'custom';

export type FinancingSchedulePeriod = {
  sequence:
    number;
  periodStart:
    string;
  periodEnd:
    string;
  dueDate:
    string;
  openingPrincipal:
    string;
  scheduledPrincipal:
    string;
  scheduledInterest:
    string;
  closingPrincipal:
    string;
  annualRate:
    string;
  dayCountDays:
    number;
};

const FOREIGN_SCALE =
  BigInt(
    10_000,
  );
const RATE_SCALE =
  BigInt(
    100_000_000,
  );

function roundDivide(
  numerator:
    bigint,
  denominator:
    bigint,
) {
  if (
    denominator <=
    BigInt(
      0,
    )
  ) {
    throw new Error(
      'Financing calculation denominator must be positive.',
    );
  }

  if (
    numerator <
    BigInt(
      0,
    )
  ) {
    return -roundDivide(
      -numerator,
      denominator,
    );
  }

  return (
    numerator +
    denominator /
      BigInt(
        2,
      )
  ) /
    denominator;
}

export function financingForeignUnits(
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
    !/^\d{1,15}(?:\.\d{1,4})?$/.test(
      text,
    )
  ) {
    throw new Error(
      label +
      ' must be a positive amount with at most four decimal places.',
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

  const units =
    BigInt(
      whole,
    ) *
      FOREIGN_SCALE +
    BigInt(
      fraction.padEnd(
        4,
        '0',
      ),
    );

  if (
    units <=
    BigInt(
      0,
    )
  ) {
    throw new Error(
      label +
      ' must be greater than zero.',
    );
  }

  return units;
}

export function financingForeignDecimal(
  units:
    bigint,
) {
  const negative =
    units <
    BigInt(
      0,
    );
  const value =
    negative
      ? -units
      : units;

  return (
    (
      negative
        ? '-'
        : ''
    ) +
    String(
      value /
      FOREIGN_SCALE,
    ) +
    '.' +
    String(
      value %
      FOREIGN_SCALE,
    ).padStart(
      4,
      '0',
    )
  );
}

export function financingRateScaled(
  value:
    unknown,
  label =
    'Annual rate',
) {
  const text =
    String(
      value ?? '',
    ).trim();

  if (
    !/^\d{1,3}(?:\.\d{1,8})?$/.test(
      text,
    )
  ) {
    throw new Error(
      label +
      ' must be a percentage with at most eight decimal places.',
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
  const scaled =
    BigInt(
      whole,
    ) *
      RATE_SCALE +
    BigInt(
      fraction.padEnd(
        8,
        '0',
      ),
    );

  if (
    scaled <
      BigInt(
        0,
      ) ||
    scaled >
      BigInt(
        1000,
      ) *
        RATE_SCALE
  ) {
    throw new Error(
      label +
      ' is outside the supported range.',
    );
  }

  return scaled;
}

export function financingRateDecimal(
  scaled:
    bigint,
) {
  return (
    String(
      scaled /
      RATE_SCALE,
    ) +
    '.' +
    String(
      scaled %
      RATE_SCALE,
    ).padStart(
      8,
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
      'Financing dates must use YYYY-MM-DD.',
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
      'Financing date is invalid.',
    );
  }

  return date;
}

function isoDate(
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

function daysInMonth(
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
  const monthIndex =
    date.getUTCMonth() +
    months;
  const targetYear =
    date.getUTCFullYear() +
    Math.floor(
      monthIndex /
      12,
    );
  const targetMonth =
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
      daysInMonth(
        targetYear,
        targetMonth +
          1,
      ),
    );

  return isoDate(
    new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
      ),
    ),
  );
}

export function financingDayCountDays(
  start:
    string,
  end:
    string,
  convention:
    FinancingDayCount,
) {
  const startDate =
    parseDate(
      start,
    );
  const endDate =
    parseDate(
      end,
    );

  if (
    endDate <
    startDate
  ) {
    throw new Error(
      'Financing period end cannot be before its start.',
    );
  }

  if (
    convention ===
      'thirty_360'
  ) {
    const y1 =
      startDate.getUTCFullYear();
    const y2 =
      endDate.getUTCFullYear();
    const m1 =
      startDate.getUTCMonth() +
      1;
    const m2 =
      endDate.getUTCMonth() +
      1;
    const d1 =
      Math.min(
        startDate.getUTCDate(),
        30,
      );
    const d2 =
      d1 ===
        30
        ? Math.min(
            endDate.getUTCDate(),
            30,
          )
        : endDate.getUTCDate();

    return (
      (
        y2 -
        y1
      ) *
        360 +
      (
        m2 -
        m1
      ) *
        30 +
      (
        d2 -
        d1
      )
    );
  }

  return Math.max(
    1,
    Math.round(
      (
        endDate.getTime() -
        startDate.getTime()
      ) /
        86_400_000,
    ),
  );
}

export function financingInterestUnits(
  input: {
    principalUnits:
      bigint;
    annualRate:
      unknown;
    startDate:
      string;
    endDate:
      string;
    dayCount:
      FinancingDayCount;
  },
) {
  if (
    input.principalUnits <=
    BigInt(
      0,
    )
  ) {
    return BigInt(
      0,
    );
  }

  const rate =
    financingRateScaled(
      input.annualRate,
    );
  const days =
    financingDayCountDays(
      input.startDate,
      input.endDate,
      input.dayCount,
    );
  const basis =
    input.dayCount ===
      'actual_365'
      ? 365
      : 360;

  return roundDivide(
    input.principalUnits *
      rate *
      BigInt(
        days,
      ),
    RATE_SCALE *
      BigInt(
        100,
      ) *
      BigInt(
        basis,
      ),
  );
}

export function financingBaseCents(
  foreignUnits:
    bigint,
  exchangeRate:
    unknown,
) {
  const text =
    String(
      exchangeRate ?? '',
    ).trim();

  if (
    !/^\d{1,8}(?:\.\d{1,10})?$/.test(
      text,
    )
  ) {
    throw new Error(
      'Exchange rate must be positive with at most ten decimal places.',
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
  const rateScale =
    BigInt(
      10_000_000_000,
    );
  const rate =
    BigInt(
      whole,
    ) *
      rateScale +
    BigInt(
      fraction.padEnd(
        10,
        '0',
      ),
    );

  if (
    rate <=
    BigInt(
      0,
    )
  ) {
    throw new Error(
      'Exchange rate must be greater than zero.',
    );
  }

  return roundDivide(
    foreignUnits *
      rate *
      BigInt(
        100,
      ),
    FOREIGN_SCALE *
      rateScale,
  );
}

export function financingCentsDecimal(
  cents:
    bigint,
) {
  const negative =
    cents <
    BigInt(
      0,
    );
  const value =
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
      value /
      BigInt(
        100,
      ),
    ) +
    '.' +
    String(
      value %
      BigInt(
        100,
      ),
    ).padStart(
      2,
      '0',
    )
  );
}

function frequencyMonths(
  frequency:
    FinancingFrequency,
) {
  if (
    frequency ===
      'monthly'
  ) {
    return 1;
  }

  if (
    frequency ===
      'quarterly'
  ) {
    return 3;
  }

  if (
    frequency ===
      'semiannual'
  ) {
    return 6;
  }

  if (
    frequency ===
      'annual'
  ) {
    return 12;
  }

  return 0;
}

function periodWindows(
  startDate:
    string,
  maturityDate:
    string,
  frequency:
    FinancingFrequency,
) {
  parseDate(
    startDate,
  );
  parseDate(
    maturityDate,
  );

  if (
    maturityDate <
    startDate
  ) {
    throw new Error(
      'Facility maturity cannot be before its start date.',
    );
  }

  if (
    frequency ===
      'bullet'
  ) {
    return [
      {
        start:
          startDate,
        end:
          maturityDate,
      },
    ];
  }

  const months =
    frequencyMonths(
      frequency,
    );

  if (
    months <=
    0
  ) {
    return [];
  }

  const windows:
    Array<{
      start:
        string;
      end:
        string;
    }> = [];
  let current =
    startDate;

  while (
    current <
    maturityDate
  ) {
    const next =
      addMonthsClamped(
        current,
        months,
      );
    const end =
      next <
        maturityDate
        ? next
        : maturityDate;

    windows.push({
      start:
        current,
      end,
    });

    if (
      end ===
      maturityDate
    ) {
      break;
    }

    current =
      end;

    if (
      windows.length >
      600
    ) {
      throw new Error(
        'Financing schedule is too long.',
      );
    }
  }

  return windows;
}

export function buildFinancingSchedule(
  input: {
    principal:
      unknown;
    startDate:
      string;
    maturityDate:
      string;
    annualRate:
      unknown;
    dayCount:
      FinancingDayCount;
    frequency:
      FinancingFrequency;
    structure:
      FinancingRepaymentStructure;
  },
):
  FinancingSchedulePeriod[] {
  const principal =
    financingForeignUnits(
      input.principal,
      'Principal',
    );
  const rate =
    financingRateScaled(
      input.annualRate,
    );
  const windows =
    periodWindows(
      input.startDate,
      input.maturityDate,
      input.frequency,
    );

  if (
    input.structure ===
      'custom' ||
    input.frequency ===
      'custom'
  ) {
    return [];
  }

  if (
    windows.length ===
      0
  ) {
    throw new Error(
      'The financing schedule has no repayment periods.',
    );
  }

  const equalPrincipalBase =
    principal /
    BigInt(
      windows.length,
    );
  let equalPrincipalRemainder =
    principal -
    equalPrincipalBase *
      BigInt(
        windows.length,
      );

  let annuityPayment =
    BigInt(
      0,
    );

  if (
    input.structure ===
      'annuity'
  ) {
    const annualPercent =
      Number(
        financingRateDecimal(
          rate,
        ),
      );
    const months =
      frequencyMonths(
        input.frequency,
      );
    const periodsPerYear =
      months >
        0
        ? 12 /
          months
        : 1;
    const periodicRate =
      annualPercent /
      100 /
      periodsPerYear;

    if (
      periodicRate ===
        0
    ) {
      annuityPayment =
        roundDivide(
          principal,
          BigInt(
            windows.length,
          ),
        );
    } else {
      const payment =
        Number(
          principal,
        ) *
        periodicRate /
        (
          1 -
          Math.pow(
            1 +
              periodicRate,
            -windows.length,
          )
        );

      annuityPayment =
        BigInt(
          Math.max(
            0,
            Math.round(
              payment,
            ),
          ),
        );
    }
  }

  const result:
    FinancingSchedulePeriod[] = [];
  let opening =
    principal;

  for (
    let index =
      0;
    index <
      windows.length;
    index +=
      1
  ) {
    const window =
      windows[
        index
      ];
    const last =
      index ===
      windows.length -
        1;
    const interest =
      financingInterestUnits({
        principalUnits:
          opening,
        annualRate:
          financingRateDecimal(
            rate,
          ),
        startDate:
          window.start,
        endDate:
          window.end,
        dayCount:
          input.dayCount,
      });

    let principalDue =
      BigInt(
        0,
      );

    if (
      input.structure ===
        'equal_principal'
    ) {
      principalDue =
        equalPrincipalBase;

      if (
        equalPrincipalRemainder >
        BigInt(
          0,
        )
      ) {
        principalDue +=
          BigInt(
            1,
          );
        equalPrincipalRemainder -=
          BigInt(
            1,
          );
      }
    } else if (
      input.structure ===
        'annuity'
    ) {
      principalDue =
        annuityPayment >
        interest
          ? annuityPayment -
            interest
          : BigInt(
              0,
            );
    } else if (
      input.structure ===
        'interest_only' ||
      input.structure ===
        'bullet'
    ) {
      principalDue =
        last
          ? opening
          : BigInt(
              0,
            );
    }

    if (
      last ||
      principalDue >
        opening
    ) {
      principalDue =
        opening;
    }

    const closing =
      opening -
      principalDue;

    result.push({
      sequence:
        index +
        1,
      periodStart:
        window.start,
      periodEnd:
        window.end,
      dueDate:
        window.end,
      openingPrincipal:
        financingForeignDecimal(
          opening,
        ),
      scheduledPrincipal:
        financingForeignDecimal(
          principalDue,
        ),
      scheduledInterest:
        financingForeignDecimal(
          interest,
        ),
      closingPrincipal:
        financingForeignDecimal(
          closing,
        ),
      annualRate:
        financingRateDecimal(
          rate,
        ),
      dayCountDays:
        financingDayCountDays(
          window.start,
          window.end,
          input.dayCount,
        ),
    });

    opening =
      closing;
  }

  return result;
}
