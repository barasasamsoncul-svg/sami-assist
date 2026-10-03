import assert from 'node:assert/strict';
import test from 'node:test';
import { ACCOUNTING_COLLABORATION_SQL } from '../lib/apps/accounting/collaboration-schema';

test('Accounting collaboration schema is additive and preserves comment revisions',()=>{
  for (const table of [
    'accounting_collaboration_comments',
    'accounting_collaboration_comment_revisions',
    'accounting_record_followers',
  ]) assert.match(ACCOUNTING_COLLABORATION_SQL,new RegExp(table));
  assert.match(ACCOUNTING_COLLABORATION_SQL,/mentioned_user_ids UUID\[\]/);
  assert.match(ACCOUNTING_COLLABORATION_SQL,/prior_body TEXT NOT NULL/);
  assert.match(ACCOUNTING_COLLABORATION_SQL,/uq_accounting_record_follower_active/);
  assert.doesNotMatch(ACCOUNTING_COLLABORATION_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});
