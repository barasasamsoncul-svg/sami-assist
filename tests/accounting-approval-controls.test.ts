import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNTING_APPROVAL_CONTROLS_SQL } from '../lib/apps/accounting/approval-controls-schema';

test('Accounting approval-control schema is additive and evidence based',()=>{
  for (const table of [
    'accounting_approval_settings',
    'accounting_approval_policies',
    'accounting_approval_requests',
    'accounting_approval_decisions',
  ]) assert.match(ACCOUNTING_APPROVAL_CONTROLS_SQL,new RegExp(table));
  assert.match(ACCOUNTING_APPROVAL_CONTROLS_SQL,/specific_user/);
  assert.match(ACCOUNTING_APPROVAL_CONTROLS_SQL,/required_approvals BETWEEN 1 AND 3/);
  assert.doesNotMatch(ACCOUNTING_APPROVAL_CONTROLS_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
