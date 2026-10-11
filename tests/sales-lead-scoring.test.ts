import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreSalesLead } from '../lib/apps/sales/lead-scoring';

const now = new Date('2026-10-11T12:00:00.000Z');

test('Sales lead scoring is explainable, capped at 100, and classifies priority bands', () => {
  const empty = scoreSalesLead({}, now);
  assert.equal(empty.score, 0);
  assert.equal(empty.band, 'low');
  assert.deepEqual(empty.factors, []);

  const medium = scoreSalesLead({
    company_name: 'Example Ltd',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    source: 'Direct',
  }, now);
  assert.equal(medium.score, 45);
  assert.equal(medium.band, 'medium');
  assert.ok(medium.factors.some(factor => factor.key === 'company' && factor.points === 15));
  assert.ok(medium.factors.some(factor => factor.key === 'source' && factor.points === 5));

  const high = scoreSalesLead({
    company_name: 'Example Ltd',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+254700000000',
    source: 'Website demo request',
    notes: 'Needs a sales quotation this month.',
    completed_engagement_count: 8,
    last_completed_engagement_at: '2026-10-08T09:00:00.000Z',
  }, now);
  assert.equal(high.score, 100);
  assert.equal(high.band, 'high');
  assert.ok(high.factors.some(factor => factor.key === 'recent_engagement' && factor.points === 10));
  assert.equal(high.factors.reduce((total, factor) => total + factor.points, 0), high.score);
});

test('Sales lead scoring does not reward future or stale engagement recency', () => {
  const base = {
    company_name: 'Example Ltd',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+254700000000',
    source: 'Referral',
    notes: 'Budget confirmed.',
    completed_engagement_count: 3,
  };
  const stale = scoreSalesLead({ ...base, last_completed_engagement_at: '2026-08-01T09:00:00.000Z' }, now);
  const future = scoreSalesLead({ ...base, last_completed_engagement_at: '2026-10-12T09:00:00.000Z' }, now);

  assert.equal(stale.score, 90);
  assert.equal(future.score, 90);
  assert.equal(stale.factors.some(factor => factor.key === 'recent_engagement'), false);
  assert.equal(future.factors.some(factor => factor.key === 'recent_engagement'), false);
});

test('Sales lead engagement scoring caps completed customer conversations at three', () => {
  const lead = { email: 'a@example.com', completed_engagement_count: 3 };
  const three = scoreSalesLead(lead, now);
  const many = scoreSalesLead({ ...lead, completed_engagement_count: 50 }, now);

  assert.equal(three.score, 30);
  assert.equal(many.score, 30);
  assert.equal(many.factors.find(factor => factor.key === 'completed_engagement')?.points, 15);
});
