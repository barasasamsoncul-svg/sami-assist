import test from 'node:test';
import assert from 'node:assert/strict';

import { selectSalesLeadAssignmentRule } from '../lib/apps/sales/lead-assignment';

const createdAt = '2026-10-11T10:00:00.000Z';

test('Sales routing rules use the lowest numeric priority among matching source rules', () => {
  const selected = selectSalesLeadAssignmentRule([
    { id: 'high-number', salesTeamId: 'team-c', sourceMatch: 'website', priority: 100, createdAt },
    { id: 'low-number', salesTeamId: 'team-a', sourceMatch: 'website', priority: 10, createdAt },
  ], 'Website enquiry');

  assert.equal(selected?.id, 'low-number');
  assert.equal(selectSalesLeadAssignmentRule([], 'Website enquiry'), null);
});

test('Sales routing rules prefer a more specific source match when priority ties', () => {
  const selected = selectSalesLeadAssignmentRule([
    { id: 'general', salesTeamId: 'team-a', sourceMatch: 'website', priority: 10, createdAt },
    { id: 'specific', salesTeamId: 'team-b', sourceMatch: 'website demo', priority: 10, createdAt },
  ], 'Website Demo Request');

  assert.equal(selected?.id, 'specific');
});

test('Sales routing fallback matches blank source criteria but loses to an earlier matching priority', () => {
  const fallback = { id: 'fallback', salesTeamId: 'team-default', sourceMatch: null, priority: 1000, createdAt };
  assert.equal(selectSalesLeadAssignmentRule([fallback], 'Trade show')?.id, 'fallback');
  assert.equal(selectSalesLeadAssignmentRule([fallback], '')?.id, 'fallback');

  const matched = selectSalesLeadAssignmentRule([
    fallback,
    { id: 'trade-show', salesTeamId: 'team-events', sourceMatch: 'trade show', priority: 20, createdAt },
  ], 'Trade Show 2026');
  assert.equal(matched?.id, 'trade-show');
});
