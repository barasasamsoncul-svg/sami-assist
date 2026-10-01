import { AccountingInputError, accountingDate, accountingId, decimalAmount, minorUnits } from './validation';

export function paymentBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AccountingInputError('Enter valid payment details.');
  return input as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false) {
  if (value != null && typeof value !== 'string') throw new AccountingInputError('Text fields must contain text.');
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max) throw new AccountingInputError(`Enter ${required ? 'a reference of ' : ''}at most ${max} characters.`);
  return result;
}
export function validatePayment(input: unknown) {
  const body = paymentBody(input);
  const kind = body.kind;
  if (kind !== 'vendor_payment' && kind !== 'settlement') throw new AccountingInputError('Choose a payment batch or settlement.');
  const sourceAccountId = accountingId(body.sourceAccountId);
  const destinationAccountId = kind === 'settlement' ? accountingId(body.destinationAccountId) : null;
  if (destinationAccountId === sourceAccountId) throw new AccountingInputError('Choose different source and destination accounts.');
  let allocations: { billId: string; amount: string }[] = [];
  let gross: bigint;
  if (kind === 'vendor_payment') {
    if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > 90) throw new AccountingInputError('Choose between 1 and 90 bills.');
    allocations = body.allocations.map(value => {
      const a = paymentBody(value);
      const amount = minorUnits(a.amount);
      if (amount <= BigInt(0)) throw new AccountingInputError('Each bill payment must be greater than zero.');
      return { billId: accountingId(a.billId), amount: decimalAmount(amount) };
    }).sort((a,b) => a.billId.localeCompare(b.billId));
    if (new Set(allocations.map(a => a.billId)).size !== allocations.length) throw new AccountingInputError('A bill can appear only once in a batch.');
    gross = allocations.reduce((sum,a) => sum + minorUnits(a.amount),BigInt(0));
    if (minorUnits(body.feeAmount) !== BigInt(0) || body.destinationAccountId || body.feeAccountId) throw new AccountingInputError('Record vendor payments without settlement fees or a destination account.');
  } else {
    if (body.allocations != null && (!Array.isArray(body.allocations) || body.allocations.length)) throw new AccountingInputError('Settlements cannot contain vendor bills.');
    gross = minorUnits(body.grossAmount);
  }
  // Validate the combined amount against the ledger precision, too.
  minorUnits(decimalAmount(gross));
  const fee = kind === 'settlement' ? minorUnits(body.feeAmount) : BigInt(0);
  if (gross <= BigInt(0) || fee >= gross) throw new AccountingInputError('Gross amount must be positive and greater than fees.');
  const feeAccountId = fee > BigInt(0) ? accountingId(body.feeAccountId) : null;
  return {
    expectedCompanyId: accountingId(body.expectedCompanyId), requestKey: accountingId(body.requestKey),
    kind, paymentDate: accountingDate(body.paymentDate), sourceAccountId, destinationAccountId, feeAccountId,
    grossAmount: decimalAmount(gross), feeAmount: decimalAmount(fee), netAmount: decimalAmount(gross-fee),
    reference: text(body.reference,255,true), notes: text(body.notes,2000), allocations,
  };
}
export type PaymentInput = ReturnType<typeof validatePayment>;

export function settlementJournalLines(input: {
  sourceLedgerId: string; destinationLedgerId: string; feeAccountId: string | null;
  grossAmount: string; feeAmount: string; netAmount: string;
}) {
  const gross = minorUnits(input.grossAmount), fee = minorUnits(input.feeAmount), net = minorUnits(input.netAmount);
  if (gross <= BigInt(0) || net <= BigInt(0) || net + fee !== gross || input.sourceLedgerId === input.destinationLedgerId ||
    (fee > BigInt(0) && (!input.feeAccountId || [input.sourceLedgerId,input.destinationLedgerId].includes(input.feeAccountId)))) {
    throw new AccountingInputError('Settlement amounts and ledger accounts are inconsistent.');
  }
  return [
    { accountId: input.sourceLedgerId, debit: '0.00', credit: decimalAmount(gross) },
    { accountId: input.destinationLedgerId, debit: decimalAmount(net), credit: '0.00' },
    ...(fee > BigInt(0) ? [{ accountId: input.feeAccountId!, debit: decimalAmount(fee), credit: '0.00' }] : []),
  ];
}
