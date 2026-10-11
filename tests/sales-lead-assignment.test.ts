import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseBalancedSalesLeadAssignee } from '../lib/apps/sales/lead-assignment';

test('Sales auto-assignment chooses the team member with the fewest open leads', () => {
  const selected = chooseBalancedSalesLeadAssignee([
    { userId: 'b', name: 'Bea', activeLeadCount: 4, lastAssignedAt: '2026-10-01T08:00:00.000Z' },
    { userId: 'a', name: 'Ada', activeLeadCount: 2, lastAssignedAt: '2026-10-05T08:00:00.000Z' },
    { userId: 'c', name: 'Cam', activeLeadCount: 3, lastAssignedAt: null },
  ]);

  assert.equal(selected?.userId, 'a');
});

test('Sales auto-assignment breaks equal workload ties using the oldest assignment then name', () => {
  const selected = chooseBalancedSalesLeadAssignee([
    { userId: 'z', name: 'Zoe', activeLeadCount: 2, lastAssignedAt: '2026-10-10T08:00:00.000Z' },
    { userId: 'b', name: 'Bea', activeLeadCount: 2, lastAssignedAt: '2026-10-08T08:00:00.000Z' },
    { userId: 'a', name: 'Ada', activeLeadCount: 2, lastAssignedAt: '2026-10-08T08:00:00.000Z' },
  ]);

  assert.equal(selected?.userId, 'a');
});

test('Sales auto-assignment gives never-assigned eligible members first consideration and handles empty teams', () => {
  const selected = chooseBalancedSalesLeadAssignee([
    { userId: 'b', name: 'Bea', activeLeadCount: 0, lastAssignedAt: '2026-10-10T08:00:00.000Z' },
    { userId: 'a', name: 'Ada', activeLeadCount: 0, lastAssignedAt: null },
  ]);

  assert.equal(selected?.userId, 'a');
  assert.equal(chooseBalancedSalesLeadAssignee([]), null);
});
