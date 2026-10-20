/**
 * Date normalization for Sales business dates returned from PostgreSQL.
 *
 * The pg driver commonly materializes DATE fields as JavaScript Date
 * instances. Comparing String(date) with an ISO YYYY-MM-DD string is not a
 * calendar-date comparison, so normalize before applying quote validity rules.
 */

/**
 * Normalizes any Postgres-returned DATE/timestamp/text value to a
 * `YYYY-MM-DD` calendar string.
 *
 * Returns `null` when the input cannot be interpreted as a real calendar date
 * (invalid `Date`, malformed strings, out-of-range months/days, etc.).
 */
export function salesDateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;

    // node-postgres represents PostgreSQL DATE values at local midnight.
    // Local calendar parts preserve the stored calendar date regardless of
    // the server's UTC offset.
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value !== 'string') return null;

  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/.exec(text);
  if (!match) return null;

  const dateOnly = match[1];
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateOnly
  ) {
    return null;
  }

  return dateOnly;
}

/**
 * Returns true when `validUntil` is strictly before `today`.
 * Any unparsable input yields `false` — an unreadable date must never trigger
 * destructive expiry logic.
 */
export function isSalesQuoteExpired(
  validUntil: unknown,
  today: unknown = new Date().toISOString().slice(0, 10),
): boolean {
  const expiryDate = salesDateOnly(validUntil);
  const todayDate = salesDateOnly(today);

  return Boolean(expiryDate && todayDate && expiryDate < todayDate);
}

/**
 * Applies the acceptance-time expiry guard:
 *   accept only when the quote is not past its validity date.
 *
 * Returns true when the caller should force-expire the quote *before* the
 * acceptance transition instead of recording an accepted status on an
 * already-expired quotation.
 */
export function shouldExpireSalesQuoteBeforeAcceptance(
  validUntil: unknown,
  currentStatus: unknown,
  nextStatus: unknown,
  today: unknown = new Date().toISOString().slice(0, 10),
): boolean {
  return (
    nextStatus === 'accepted' &&
    ['draft', 'sent', 'viewed'].includes(String(currentStatus)) &&
    isSalesQuoteExpired(validUntil, today)
  );
}