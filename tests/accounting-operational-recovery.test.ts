import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCOUNTING_OPERATIONAL_RECOVERY_SQL } from '../lib/apps/accounting/operational-recovery-schema';

test('Accounting 2.33 recovery schema is additive and evidence preserving',()=>{
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/CREATE TABLE IF NOT EXISTS public\.accounting_recovery_runs/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/request_key UUID NOT NULL/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/before_json JSONB/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/after_json JSONB/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/capture_diagnostics/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/initialize_core_settings/);
  assert.match(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/sync_lock_forward/);
  assert.doesNotMatch(ACCOUNTING_OPERATIONAL_RECOVERY_SQL,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
