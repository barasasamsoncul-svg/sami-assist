/**
 * Shared quote-approval threshold semantics.
 *
 * The legacy company-wide threshold is denominated in the company's base
 * currency. Advanced policies with an explicit currency filter use the quote
 * currency; unscoped monetary policy thresholds use the snapshotted base value.
 */
function finiteAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function salesQuoteRequiresLegacyApproval(
  enabled: unknown,
  threshold: unknown,
  baseTotalAmount: unknown,
): boolean {
  return enabled === true &&
    finiteAmount(baseTotalAmount) >= finiteAmount(threshold);
}

export function salesQuoteApprovalPolicyMatches(
  policy: Record<string, unknown>,
  quote: Record<string, unknown>,
): boolean {
  const policyCurrency = String(policy.currency_code ?? '').trim().toUpperCase();
  const quoteCurrency = String(quote.currency ?? '').trim().toUpperCase();

  if (policyCurrency && policyCurrency !== quoteCurrency) return false;

  // A currency-scoped policy states its monetary unit explicitly. Without a
  // currency scope, compare against the immutable company-base snapshot.
  const quoteTotal = finiteAmount(
    policyCurrency ? quote.total_amount : quote.base_total_amount,
  );
  const subtotal = finiteAmount(quote.subtotal);
  const discountPercent = subtotal > 0
    ? finiteAmount(quote.discount_total) / subtotal * 100
    : 0;
  const marginPercent = quote.margin_percent == null
    ? null
    : finiteAmount(quote.margin_percent);
  const triggers: boolean[] = [];

  if (policy.min_quote_total != null) {
    triggers.push(quoteTotal >= finiteAmount(policy.min_quote_total));
  }
  if (policy.max_discount_percent != null) {
    triggers.push(discountPercent > finiteAmount(policy.max_discount_percent));
  }
  if (policy.min_margin_percent != null) {
    triggers.push(marginPercent == null || marginPercent < finiteAmount(policy.min_margin_percent));
  }

  return triggers.some(Boolean);
}
