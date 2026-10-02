import {
  decimalAmount,
} from './validation';
import type {
  FinancingDirection,
} from './financing-helpers';

type LedgerLine = {
  accountId:
    string;
  description:
    string;
  debit:
    string;
  credit:
    string;
};

export function buildFinancingRepaymentJournalLines(
  input: {
    direction:
      FinancingDirection;
    financialLedgerAccountId:
      string;
    principalAccountId:
      string;
    currentPrincipalAccountId:
      string |
      null;
    accruedInterestAccountId:
      string;
    feeAccountId:
      string |
      null;
    fxGainAccountId:
      string |
      null;
    fxLossAccountId:
      string |
      null;
    currentPrincipalCarryingCents:
      bigint;
    noncurrentPrincipalCarryingCents:
      bigint;
    interestCarryingCents:
      bigint;
    feeSettlementCents:
      bigint;
    totalSettlementCents:
      bigint;
    realizedFxCents:
      bigint;
  },
):
  LedgerLine[] {
  const lines:
    LedgerLine[] = [];
  const currentPrincipal =
    decimalAmount(
      input.currentPrincipalCarryingCents,
    );
  const noncurrentPrincipal =
    decimalAmount(
      input.noncurrentPrincipalCarryingCents,
    );
  const interest =
    decimalAmount(
      input.interestCarryingCents,
    );
  const fee =
    decimalAmount(
      input.feeSettlementCents,
    );
  const total =
    decimalAmount(
      input.totalSettlementCents,
    );
  const realizedAbs =
    input.realizedFxCents <
      BigInt(
        0,
      )
      ? -input.realizedFxCents
      : input.realizedFxCents;
  const realized =
    decimalAmount(
      realizedAbs,
    );

  if (
    input.direction ===
      'borrowing'
  ) {
    if (
      input.currentPrincipalCarryingCents >
        BigInt(
          0,
        ) &&
      input.currentPrincipalAccountId
    ) {
      lines.push({
        accountId:
          input.currentPrincipalAccountId,
        description:
          'Current borrowing principal repaid',
        debit:
          currentPrincipal,
        credit:
          '0.00',
      });
    }

    if (
      input.noncurrentPrincipalCarryingCents >
      BigInt(
        0,
      )
    ) {
      lines.push({
        accountId:
          input.principalAccountId,
        description:
          'Non-current borrowing principal repaid',
        debit:
          noncurrentPrincipal,
        credit:
          '0.00',
      });
    }

    if (
      input.interestCarryingCents >
      BigInt(
        0,
      )
    ) {
      lines.push({
        accountId:
          input.accruedInterestAccountId,
        description:
          'Accrued financing interest paid',
        debit:
          interest,
        credit:
          '0.00',
      });
    }

    if (
      input.feeSettlementCents >
        BigInt(
          0,
        ) &&
      input.feeAccountId
    ) {
      lines.push({
        accountId:
          input.feeAccountId,
        description:
          'Financing fee paid',
        debit:
          fee,
        credit:
          '0.00',
      });
    }

    if (
      input.realizedFxCents >
        BigInt(
          0,
        ) &&
      input.fxLossAccountId
    ) {
      lines.push({
        accountId:
          input.fxLossAccountId,
        description:
          'Realized foreign exchange loss',
        debit:
          realized,
        credit:
          '0.00',
      });
    } else if (
      input.realizedFxCents <
        BigInt(
          0,
        ) &&
      input.fxGainAccountId
    ) {
      lines.push({
        accountId:
          input.fxGainAccountId,
        description:
          'Realized foreign exchange gain',
        debit:
          '0.00',
        credit:
          realized,
      });
    }

    lines.push({
      accountId:
        input.financialLedgerAccountId,
      description:
        'Financing payment',
      debit:
        '0.00',
      credit:
        total,
    });

    return lines;
  }

  lines.push({
    accountId:
      input.financialLedgerAccountId,
    description:
      'Loan repayment received',
    debit:
      total,
    credit:
      '0.00',
  });

  if (
    input.currentPrincipalCarryingCents >
      BigInt(
        0,
      ) &&
    input.currentPrincipalAccountId
  ) {
    lines.push({
      accountId:
        input.currentPrincipalAccountId,
      description:
        'Current loan principal recovered',
      debit:
        '0.00',
      credit:
        currentPrincipal,
    });
  }

  if (
    input.noncurrentPrincipalCarryingCents >
    BigInt(
      0,
    )
  ) {
    lines.push({
      accountId:
        input.principalAccountId,
      description:
        'Non-current loan principal recovered',
      debit:
        '0.00',
      credit:
        noncurrentPrincipal,
    });
  }

  if (
    input.interestCarryingCents >
    BigInt(
      0,
    )
  ) {
    lines.push({
      accountId:
        input.accruedInterestAccountId,
      description:
        'Accrued financing interest collected',
      debit:
        '0.00',
      credit:
        interest,
    });
  }

  if (
    input.feeSettlementCents >
      BigInt(
        0,
      ) &&
    input.feeAccountId
  ) {
    lines.push({
      accountId:
        input.feeAccountId,
      description:
        'Financing fee income',
      debit:
        '0.00',
      credit:
        fee,
    });
  }

  if (
    input.realizedFxCents >
      BigInt(
        0,
      ) &&
    input.fxLossAccountId
  ) {
    lines.push({
      accountId:
        input.fxLossAccountId,
      description:
        'Realized foreign exchange loss',
      debit:
        realized,
      credit:
        '0.00',
    });
  } else if (
    input.realizedFxCents <
      BigInt(
        0,
      ) &&
    input.fxGainAccountId
  ) {
    lines.push({
      accountId:
        input.fxGainAccountId,
      description:
        'Realized foreign exchange gain',
      debit:
        '0.00',
      credit:
        realized,
    });
  }

  return lines;
}
