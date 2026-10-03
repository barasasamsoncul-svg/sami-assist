import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { ACCOUNTING_OPERATIONAL_RECOVERY_SQL } from '../lib/apps/accounting/operational-recovery-schema';
import { ENTERPRISE_MODULE_TABLES } from '../lib/apps/enterprise/catalog';

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


test('Accounting enterprise catalog covers every dedicated Accounting service table boundary', async () => {
  const accountingDir = path.join(process.cwd(),'lib','apps','accounting');
  const files = (await readdir(accountingDir))
    .filter(file => file.endsWith('.ts'));

  const required = new Set<string>();

  for (const file of files) {
    const source = await readFile(path.join(accountingDir,file),'utf8');
    for (const match of source.matchAll(
      /requireEnterpriseModuleTableContext\s*\(\s*['"]accounting['"]\s*,\s*['"]([^'"]+)['"]/g,
    )) {
      required.add(match[1]);
    }
  }

  const allowed = new Set<string>([
    ...ENTERPRISE_MODULE_TABLES.accounting,
  ]);
  const missing = [...required].filter(table => !allowed.has(table));

  assert.deepEqual(
    missing,
    [],
    'Every Accounting service table boundary must be present in the enterprise catalog.',
  );

  for (const table of [
    'accounting_payroll_run_postings',
    'accounting_recovery_runs',
    'accounting_management_report_snapshots',
    'accounting_document_extractions',
    'accounting_custom_reports',
  ]) {
    assert.ok(
      allowed.has(table),
      table + ' must remain available to the Accounting 2.34 runtime.',
    );
  }
});
