import test from 'node:test';
import assert from 'node:assert/strict';
import { getSamiModuleMigrationPlan } from '../lib/modules/migrations';

test('Demand Planning has one connected migration path from 1.0.0 to 1.1.0', () => {
  const plan = getSamiModuleMigrationPlan('demand_planning', '1.0.0', '1.1.0');

  assert.deepEqual(
    plan.map((migration) => [migration.fromVersion, migration.toVersion]),
    [['1.0.0', '1.1.0']],
  );
  assert.equal(
    new Set(plan.map((migration) => migration.fromVersion)).size,
    plan.length,
    'each module version must have at most one outgoing migration',
  );
});
