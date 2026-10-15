import test from 'node:test';
import assert from 'node:assert/strict';

import {
  salesOrderDepositIdempotencyKey,
} from '../lib/apps/sales/deposit-rules';

test('Sales deposit retries use one canonical key per order', () => {
  const lower = '123e4567-e89b-12d3-a456-426614174000';
  const upper = lower.toUpperCase();

  assert.equal(
    salesOrderDepositIdempotencyKey(lower),
    salesOrderDepositIdempotencyKey(upper),
    'UUID case must not create a second deposit identity',
  );
  assert.equal(
    salesOrderDepositIdempotencyKey(lower),
    'sales-order-' + lower + '-deposit',
  );
  assert.notEqual(
    salesOrderDepositIdempotencyKey(lower),
    salesOrderDepositIdempotencyKey('123e4567-e89b-12d3-a456-426614174001'),
  );
});
