import test from 'node:test';
import assert from 'node:assert/strict';
import { getSamiModuleMigrationPlan } from '../lib/modules/migrations';

const EXPECTED_CHAIN = [
  ['1.0.0', '2.0.0'],
  ['2.0.0', '2.1.0'],
  ['2.1.0', '2.2.0'],
  ['2.2.0', '2.3.0'],
  ['2.3.0', '2.4.0'],
];

test('Barcode, Warehouse and Shipping have one connected 1.0.0-to-2.4.0 migration path', () => {
  for (const moduleKey of ['barcode', 'warehouse', 'shipping']) {
    const plan = getSamiModuleMigrationPlan(moduleKey, '1.0.0', '2.4.0');
    assert.deepEqual(
      plan.map((migration) => [migration.fromVersion, migration.toVersion]),
      EXPECTED_CHAIN,
      moduleKey + ' migration chain',
    );
    assert.equal(
      new Set(plan.map((migration) => migration.fromVersion)).size,
      plan.length,
      moduleKey + ' must have only one outgoing migration from each version',
    );
  }
});
