/** Accounting currently uses the existing NUMERIC(15,2) ledger. Never round input silently. */
export class AccountingInputError extends Error {}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function accountingId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new AccountingInputError(
      "Choose a valid account or request identifier.",
    );
  return value.toLowerCase();
}
export function accountingDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > "9999-12-31"
  )
    throw new AccountingInputError("Enter a valid accounting date.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new AccountingInputError("Enter a valid accounting date.");
  return value;
}
export function minorUnits(value: unknown): bigint {
  const text = value === "" || value == null ? "0" : String(value);
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(text))
    throw new AccountingInputError(
      "Amounts must be positive decimals with at most two decimal places.",
    );
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function decimalAmount(value: bigint): string {
  const negative = value < BigInt(0);
  const amount = negative ? -value : value;
  return `${negative ? "-" : ""}${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}
export function formatAccountingAmount(value: string, currency = ""): string {
  const [whole, fraction = "00"] = value.split(".");
  return `${currency ? currency + " " : ""}${whole === "-0" ? "-0" : BigInt(whole || "0").toLocaleString("en-KE")}.${fraction.padEnd(2, "0")}`;
}
function shortText(value: unknown, max: number, required = false): string {
  if (value != null && typeof value !== "string")
    throw new AccountingInputError("Text fields must contain text.");
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > max)
    throw new AccountingInputError(
      `Enter ${required ? "a description of " : ""}at most ${max} characters.`,
    );
  return text;
}
export function validateJournal(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AccountingInputError("Enter a journal.");
  const body = input as Record<string, unknown>;
  if (
    !Array.isArray(body.lines) ||
    body.lines.length < 2 ||
    body.lines.length > 100
  )
    throw new AccountingInputError("A journal needs between 2 and 100 lines.");
  let debit = BigInt(0),
    credit = BigInt(0);
  const lines = body.lines.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new AccountingInputError("Enter a valid journal line.");
    const line = value as Record<string, unknown>;
    const dr = minorUnits(line.debit),
      cr = minorUnits(line.credit);
    if (dr > BigInt(0) === cr > BigInt(0))
      throw new AccountingInputError(
        "Each line needs either a debit or a credit, never both.",
      );
    debit += dr;
    credit += cr;
    return {
      accountId: accountingId(line.accountId),
      description: shortText(line.description, 500),
      debit: decimalAmount(dr),
      credit: decimalAmount(cr),
    };
  });
  if (debit !== credit)
    throw new AccountingInputError(
      "Total debits must exactly equal total credits.",
    );
  return {
    idempotencyKey: accountingId(body.idempotencyKey),
    journalDate: accountingDate(body.journalDate),
    description: shortText(body.description, 1000, true),
    reference: shortText(body.reference, 255),
    lines,
  };
}
export type JournalInput = ReturnType<typeof validateJournal>;
export function reportFilters(input: {
  from?: string;
  to?: string;
  accountId?: string;
  page?: string;
}) {
  const to = accountingDate(input.to || new Date().toISOString().slice(0, 10));
  const from = accountingDate(input.from || to.slice(0, 4) + "-01-01");
  if (from > to)
    throw new AccountingInputError(
      "The start date must not be after the end date.",
    );
  if (input.page && !/^[1-9]\d{0,5}$/.test(input.page))
    throw new AccountingInputError("Choose a valid page.");
  return {
    from,
    to,
    accountId: input.accountId ? accountingId(input.accountId) : null,
    page: Number(input.page || 1),
  };
}
