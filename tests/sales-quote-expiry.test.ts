import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSalesQuoteExpired,
  salesDateOnly,
  shouldExpireSalesQuoteBeforeAcceptance,
} from '../lib/apps/sales/date-utils';

test('Sales date normalization preserves PostgreSQL DATE values and ISO date strings', () => {
  assert.equal(salesDateOnly(new Date(2026, 9, 14)), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14'), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14T18:30:00.000Z'), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14 00:00:00+03'), '2026-10-14');
});

test('Sales date normalization rejects invalid and unsupported date values', () => {
  assert.equal(salesDateOnly('2026-02-31'), null);
  assert.equal(salesDateOnly('not a date'), null);
  assert.equal(salesDateOnly(null), null);
  assert.equal(salesDateOnly(Number.NaN), null);
  assert.equal(salesDateOnly(new Date(Number.NaN)), null);
});

test('Sales quote expiry uses date-only calendar comparisons', () => {
  assert.equal(isSalesQuoteExpired(new Date(2026, 9, 14), '2026-10-15'), true);
  assert.equal(isSalesQuoteExpired('2026-10-15', '2026-10-15'), false);
  assert.equal(isSalesQuoteExpired('2026-10-16', '2026-10-15'), false);
  assert.equal(isSalesQuoteExpired(null, '2026-10-15'), false);
});

test('Sales quote acceptance expires stale quotes but does not block rejection or cancellation', () => {
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'draft', 'accepted', '2026-10-15'),
    true,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance(new Date(2026, 9, 14), 'sent', 'accepted', '2026-10-15'),
    true,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'viewed', 'rejected', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'viewed', 'cancelled', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-15', 'sent', 'accepted', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-16', 'draft', 'accepted', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'accepted', 'accepted', '2026-10-15'),
    false,
  );
});
