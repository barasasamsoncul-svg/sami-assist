import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { expirePublicSalesQuoteWithAudit } from '../lib/apps/sales/public-quote-expiry';

import {
  isSalesQuoteExpired,
  salesDateOnly,
  shouldExpireSalesQuoteBeforeAcceptance,
} from '../lib/apps/sales/date-utils';

test('Sales date normalization preserves PostgreSQL DATE values and ISO date strings', () => {
  assert.equal(salesDateOnly(new Date(2026, 9, 14)), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14'), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14T18:30:00.000Z'), '2026-10-14');
  assert.equal(salesDateOnly('2026-10-14 00:00:00+03'), '2026-10-14');
});

test('Sales date normalization rejects invalid and unsupported date values', () => {
  assert.equal(salesDateOnly('2026-02-31'), null);
  assert.equal(salesDateOnly('not a date'), null);
  assert.equal(salesDateOnly(null), null);
  assert.equal(salesDateOnly(Number.NaN), null);
  assert.equal(salesDateOnly(new Date(Number.NaN)), null);
});

test('Sales quote expiry uses date-only calendar comparisons', () => {
  assert.equal(isSalesQuoteExpired(new Date(2026, 9, 14), '2026-10-15'), true);
  assert.equal(isSalesQuoteExpired('2026-10-15', '2026-10-15'), false);
  assert.equal(isSalesQuoteExpired('2026-10-16', '2026-10-15'), false);
  assert.equal(isSalesQuoteExpired(null, '2026-10-15'), false);
});

test('Sales quote acceptance expires stale quotes but does not block rejection or cancellation', () => {
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'draft', 'accepted', '2026-10-15'),
    true,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance(new Date(2026, 9, 14), 'sent', 'accepted', '2026-10-15'),
    true,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'viewed', 'rejected', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'viewed', 'cancelled', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-15', 'sent', 'accepted', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-16', 'draft', 'accepted', '2026-10-15'),
    false,
  );
  assert.equal(
    shouldExpireSalesQuoteBeforeAcceptance('2026-10-14', 'accepted', 'accepted', '2026-10-15'),
    false,
  );
});


type FakeQueryResult = { rows: Array<Record<string, unknown>> };

function createFakeExpiryClient(
  results: FakeQueryResult[],
  failAtCall = -1,
) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let nextCall = 0;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      const callIndex = nextCall++;
      calls.push({
        sql: sql.replace(/\s+/g, ' ').trim(),
        values,
      });
      if (callIndex === failAtCall) {
        throw new Error('simulated database failure');
      }
      return results[callIndex] ?? { rows: [] };
    },
  } as unknown as PoolClient;

  return { client, calls };
}

test('public Sales quote expiry writes state, history and activity only when the compare-and-set succeeds', async () => {
  const quoteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const companyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const { client, calls } = createFakeExpiryClient([
    { rows: [{ id: quoteId }] },
    { rows: [] },
  ]);
  const recordedActivities: Array<Record<string, unknown>> = [];

  const expired = await expirePublicSalesQuoteWithAudit(
    client,
    {
      quoteId,
      companyId,
      quoteNumber: 'Q-2026-0042',
      fromStatus: 'viewed',
      source: 'public_quote_response',
      attemptedAction: 'accept',
    },
    async (_client, activity) => {
      recordedActivities.push(activity as unknown as Record<string, unknown>);
    },
  );

  assert.equal(expired, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE sales_quotes/);
  assert.match(calls[0].sql, /company_id = \\$2/);
  assert.match(calls[0].sql, /status = \\$3::varchar\\(30\\)/);
  assert.match(calls[0].sql, /RETURNING id/);
  assert.deepEqual(calls[0].values, [quoteId, companyId, 'viewed']);

  assert.match(calls[1].sql, /INSERT INTO sales_quote_status_history/);
  assert.deepEqual(calls[1].values, [
    quoteId,
    companyId,
    'viewed',
    'Quotation expired before customer action.',
  ]);

  assert.deepEqual(recordedActivities, [{
    companyId,
    userId: null,
    quoteId,
    type: 'sales.quote.expired',
    content: 'Quote Q-2026-0042 expired before customer action.',
    metadata: {
      reason: 'validity_expired',
      source: 'public_quote_response',
      attemptedAction: 'accept',
    },
  }]);
});

test('public Sales quote expiry records no history or activity when the source status changed', async () => {
  const { client, calls } = createFakeExpiryClient([
    { rows: [] },
  ]);
  let activityCount = 0;

  const expired = await expirePublicSalesQuoteWithAudit(
    client,
    {
      quoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      quoteNumber: 'Q-2026-0042',
      fromStatus: 'sent',
      source: 'public_quote_view',
    },
    async () => {
      activityCount += 1;
    },
  );

  assert.equal(expired, false);
  assert.equal(calls.length, 1);
  assert.equal(activityCount, 0);
});

test('public Sales quote expiry propagates audit failures so the caller can roll back', async () => {
  const { client, calls } = createFakeExpiryClient([
    { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }] },
  ], 1);
  let activityCount = 0;

  await assert.rejects(
    expirePublicSalesQuoteWithAudit(
      client,
      {
        quoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        companyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        quoteNumber: 'Q-2026-0042',
        fromStatus: 'sent',
        source: 'public_quote_view',
      },
      async () => {
        activityCount += 1;
      },
    ),
    /simulated database failure/,
  );

  assert.equal(calls.length, 2);
  assert.equal(activityCount, 0);
});
