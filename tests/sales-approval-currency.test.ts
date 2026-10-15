import test from 'node:test';
import assert from 'node:assert/strict';

import {
  salesQuoteApprovalPolicyMatches,
  salesQuoteRequiresLegacyApproval,
} from '../lib/apps/sales/approval-policy';

test('legacy quotation approval thresholds use the company-base-currency snapshot', () => {
  const foreignCurrencyQuote = {
    currency: 'USD',
    total_amount: 2_000,
    base_currency: 'KES',
    base_total_amount: 156_000,
  };

  assert.equal(
    salesQuoteRequiresLegacyApproval(true, 150_000, foreignCurrencyQuote.base_total_amount),
    true,
    'a USD quotation worth KES 156,000 must meet the KES 150,000 threshold',
  );
  assert.equal(
    salesQuoteRequiresLegacyApproval(true, 150_000, foreignCurrencyQuote.total_amount),
    false,
    'the USD amount must not be compared directly with a KES threshold',
  );
  assert.equal(
    salesQuoteRequiresLegacyApproval(false, 150_000, foreignCurrencyQuote.base_total_amount),
    false,
    'a disabled legacy approval rule must not require approval',
  );
});

test('unscoped advanced policy monetary thresholds use base currency while scoped policies use quote currency', () => {
  const quote = {
    currency: 'USD',
    total_amount: 2_000,
    base_total_amount: 156_000,
    subtotal: 2_000,
    discount_total: 100,
    margin_percent: 22,
  };

  assert.equal(
    salesQuoteApprovalPolicyMatches({ min_quote_total: 150_000 }, quote),
    true,
    'unscoped KES-denominated threshold compares against the base total',
  );
  assert.equal(
    salesQuoteApprovalPolicyMatches({ currency_code: 'USD', min_quote_total: 1_500 }, quote),
    true,
    'an explicitly USD-scoped threshold compares against the quote total',
  );
  assert.equal(
    salesQuoteApprovalPolicyMatches({ currency_code: 'USD', min_quote_total: 150_000 }, quote),
    false,
    'a USD-scoped threshold must not use the KES base total',
  );
  assert.equal(
    salesQuoteApprovalPolicyMatches({ currency_code: 'EUR', min_quote_total: 1_500 }, quote),
    false,
    'a currency-scoped policy must not match a quotation in another currency',
  );
});

test('discount and margin approval triggers remain active when no monetary threshold is configured', () => {
  const quote = {
    currency: 'USD',
    total_amount: 200,
    base_total_amount: 15_600,
    subtotal: 200,
    discount_total: 50,
    margin_percent: 12,
  };

  assert.equal(
    salesQuoteApprovalPolicyMatches({ max_discount_percent: 20 }, quote),
    true,
  );
  assert.equal(
    salesQuoteApprovalPolicyMatches({ min_margin_percent: 15 }, quote),
    true,
  );
});
