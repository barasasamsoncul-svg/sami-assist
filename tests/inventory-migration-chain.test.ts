import test from 'node:test';
import assert from 'node:assert/strict';

import { getSamiModuleMigrationPlan } from '../lib/modules/migrations';

test('Inventory has one connected and unambiguous migration plan from 1.0.0 to 2.4.0', () => {
  const plan = getSamiModuleMigrationPlan('inventory', '1.0.0', '2.4.0');

  assert.deepEqual(
    plan.map((migration) => [migration.fromVersion, migration.toVersion]),
    [
      ['1.0.0', '2.0.0'],
      ['2.0.0', '2.1.0'],
      ['2.1.0', '2.2.0'],
      ['2.2.0', '2.3.0'],
      ['2.3.0', '2.4.0'],
    ],
  );

  assert.equal(
    new Set(plan.map((migration) => migration.fromVersion)).size,
    plan.length,
    'each module version must have at most one outgoing migration',
  );
});
