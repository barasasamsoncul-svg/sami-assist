export function assetMoneyCents(
  value:
    string | number | bigint,
  label =
    'Asset amount',
) {
  const raw =
    String(
      value,
    ).trim();

  if (
    !/^-?\d+(?:\.\d{1,4})?$/.test(
      raw,
    )
  ) {
    throw new Error(
      label +
      ' is invalid.',
    );
  }

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
  const [
    whole,
    fraction =
      '',
  ] =
    unsigned.split(
      '.',
    );
  const four =
    (
      fraction +
      '0000'
    ).slice(
      0,
      4,
    );
  const tenThousandths =
    BigInt(
      whole,
    ) *
      BigInt(
        10000,
      ) +
    BigInt(
      four,
    );
  const roundedCents =
    (
      tenThousandths +
      BigInt(
        50,
      )
    ) /
    BigInt(
      100,
    );

  return negative
    ? -roundedCents
    : roundedCents;
}

export function assetMoneyDecimal(
  cents:
    bigint,
) {
  const negative =
    cents <
    BigInt(
      0,
    );
  const absolute =
    negative
      ? -cents
      : cents;
  const whole =
    absolute /
    BigInt(
      100,
    );
  const fraction =
    String(
      absolute %
        BigInt(
          100,
        ),
    ).padStart(
      2,
      '0',
    );

  return (
    negative
      ? '-'
      : ''
  ) +
    whole.toString() +
    '.' +
    fraction;
}

export function assetCarryingValueCents(
  input: {
    acquisitionCost:
      string | number;
    accumulatedDepreciation?:
      string | number;
    accumulatedImpairment?:
      string | number;
    revaluationAdjustment?:
      string | number;
  },
) {
  const value =
    assetMoneyCents(
      input.acquisitionCost,
      'Acquisition cost',
    ) +
    assetMoneyCents(
      input.revaluationAdjustment ||
      0,
      'Revaluation adjustment',
    ) -
    assetMoneyCents(
      input.accumulatedDepreciation ||
      0,
      'Accumulated depreciation',
    ) -
    assetMoneyCents(
      input.accumulatedImpairment ||
      0,
      'Accumulated impairment',
    );

  return value >
    BigInt(
      0,
    )
    ? value
    : BigInt(
        0,
      );
}

function roundedDivide(
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
      'Depreciation divisor must be positive.',
    );
  }

  if (
    numerator <=
    BigInt(
      0,
    )
  ) {
    return BigInt(
      0,
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

export function straightLineDepreciationCents(
  input: {
    carryingValue:
      bigint;
    salvageValue:
      bigint;
    remainingPeriods:
      number;
  },
) {
  const floor =
    input.salvageValue >
      BigInt(
        0,
      )
      ? input.salvageValue
      : BigInt(
          0,
        );
  const remaining =
    input.carryingValue -
    floor;

  if (
    remaining <=
      BigInt(
        0,
      ) ||
    !Number.isInteger(
      input.remainingPeriods,
    ) ||
    input.remainingPeriods <=
      0
  ) {
    return BigInt(
      0,
    );
  }

  const amount =
    roundedDivide(
      remaining,
      BigInt(
        input.remainingPeriods,
      ),
    );

  return amount >
    remaining
    ? remaining
    : amount;
}

function percentageUnits(
  value:
    string | number,
) {
  const raw =
    String(
      value,
    ).trim();

  if (
    !/^\d+(?:\.\d{1,4})?$/.test(
      raw,
    )
  ) {
    throw new Error(
      'Declining-balance rate is invalid.',
    );
  }

  const [
    whole,
    fraction =
      '',
  ] =
    raw.split(
      '.',
    );
  const units =
    BigInt(
      whole,
    ) *
      BigInt(
        10000,
      ) +
    BigInt(
      (
        fraction +
        '0000'
      ).slice(
        0,
        4,
      ),
    );

  if (
    units <=
      BigInt(
        0,
      ) ||
    units >
      BigInt(
        1000000,
      )
  ) {
    throw new Error(
      'Declining-balance rate must be above 0 and at most 100 percent.',
    );
  }

  return units;
}

export function decliningBalanceDepreciationCents(
  input: {
    carryingValue:
      bigint;
    salvageValue:
      bigint;
    annualRate:
      string | number;
  },
) {
  const floor =
    input.salvageValue >
      BigInt(
        0,
      )
      ? input.salvageValue
      : BigInt(
          0,
        );
  const available =
    input.carryingValue -
    floor;

  if (
    available <=
    BigInt(
      0,
    )
  ) {
    return BigInt(
      0,
    );
  }

  const rate =
    percentageUnits(
      input.annualRate,
    );
  const denominator =
    BigInt(
      1000000,
    ) *
    BigInt(
      12,
    );
  const amount =
    roundedDivide(
      input.carryingValue *
      rate,
      denominator,
    );

  return amount >
    available
    ? available
    : amount;
}

function dayNumber(
  value:
    string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    throw new Error(
      'Asset date is invalid.',
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
    )
  ) {
    throw new Error(
      'Asset date is invalid.',
    );
  }

  return Math.floor(
    date.getTime() /
    86400000,
  );
}

export function prorateDepreciationCents(
  amount:
    bigint,
  input: {
    periodStart:
      string;
    periodEnd:
      string;
    inServiceDate:
      string;
    convention:
      'daily' |
      'full_month' |
      'none';
  },
) {
  if (
    amount <=
    BigInt(
      0,
    )
  ) {
    return BigInt(
      0,
    );
  }

  const start =
    dayNumber(
      input.periodStart,
    );
  const end =
    dayNumber(
      input.periodEnd,
    );
  const service =
    dayNumber(
      input.inServiceDate,
    );

  if (
    end <
    start
  ) {
    throw new Error(
      'Depreciation period end cannot be before its start.',
    );
  }

  if (
    service >
    end
  ) {
    return BigInt(
      0,
    );
  }

  if (
    input.convention !==
      'daily' ||
    service <=
      start
  ) {
    return amount;
  }

  const totalDays =
    BigInt(
      end -
      start +
      1,
    );
  const activeDays =
    BigInt(
      end -
      service +
      1,
    );

  return roundedDivide(
    amount *
      activeDays,
    totalDays,
  );
}
