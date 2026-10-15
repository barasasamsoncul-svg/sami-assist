import test from 'node:test';
import assert from 'node:assert/strict';

import {
  legacySalesReturnRefundIdempotencyKey,
  salesReturnRefundIdempotencyKey,
} from '../lib/apps/sales/return-credit-rules';

const returnCreditId = '7fd83cf8-a2a5-49e2-8d9d-fef901b6aabc';

test('return refund idempotency keys distinguish caller keys beyond legacy truncation', () => {
  const prefix = 'x'.repeat(56);
  const callerKeyA = prefix + 'a'.repeat(24);
  const callerKeyB = prefix + 'b'.repeat(24);

  assert.equal(callerKeyA.length, 80);
  assert.equal(callerKeyB.length, 80);

  const keyA = salesReturnRefundIdempotencyKey(returnCreditId, callerKeyA);
  const keyB = salesReturnRefundIdempotencyKey(returnCreditId, callerKeyB);

  assert.notEqual(keyA, keyB, 'different full caller keys must not collapse to one idempotency key');
  assert.equal(keyA, salesReturnRefundIdempotencyKey(returnCreditId, callerKeyA), 'the same caller key must be stable');
  assert.equal(keyA.length, 106, 'leave room for Invoicing’s 14-character prefix');
  assert.equal(keyB.length, 106);
});

test('legacy refund key helper preserves pre-fix lookup compatibility', () => {
  const prefix = 'x'.repeat(56);
  const callerKeyA = prefix + 'a'.repeat(24);
  const callerKeyB = prefix + 'b'.repeat(24);

  // This collision is why the legacy key may be looked up for recovery, but
  // must not be used to create new refund records.
  assert.equal(
    legacySalesReturnRefundIdempotencyKey(returnCreditId, callerKeyA),
    legacySalesReturnRefundIdempotencyKey(returnCreditId, callerKeyB),
  );
  assert.equal(legacySalesReturnRefundIdempotencyKey(returnCreditId, callerKeyA).length, 120);
});
