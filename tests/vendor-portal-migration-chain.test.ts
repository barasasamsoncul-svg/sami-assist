import test from 'node:test';
import assert from 'node:assert/strict';
import { getSamiModuleMigrationPlan } from '../lib/modules/migrations';

test('Vendor Portal has one connected migration path from 1.0.0 to 2.4.0', () => {
  const plan = getSamiModuleMigrationPlan('vendor_portal', '1.0.0', '2.4.0');
  assert.deepEqual(
    plan.map((migration) => [migration.fromVersion, migration.toVersion]),
    [['1.0.0', '2.0.0'], ['2.0.0', '2.1.0'], ['2.1.0', '2.2.0'], ['2.2.0', '2.3.0'], ['2.3.0', '2.4.0']],
  );
  assert.equal(new Set(plan.map((migration) => migration.fromVersion)).size, plan.length);
});
