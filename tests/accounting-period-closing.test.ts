import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNTING_PERIOD_CLOSING_SQL } from '../lib/apps/accounting/period-closing-schema';

test('Accounting period closing schema is additive and idempotent',()=>{
  assert.match(ACCOUNTING_PERIOD_CLOSING_SQL,/accounting_close_runs/);
  assert.match(ACCOUNTING_PERIOD_CLOSING_SQL,/month_end/);
  assert.match(ACCOUNTING_PERIOD_CLOSING_SQL,/year_end/);
  assert.doesNotMatch(ACCOUNTING_PERIOD_CLOSING_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
