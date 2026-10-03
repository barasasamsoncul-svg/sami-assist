import assert from 'node:assert/strict';
import test from 'node:test';

import { ACCOUNTING_AI_TOOLS } from '../lib/apps/accounting/ai-tools';
import {
  ACCOUNTING_AUTOMATION_ACTIONS,
  ACCOUNTING_AUTOMATION_TRIGGERS,
} from '../lib/apps/accounting/automation';

test('Accounting SaMi AI tools keep financial writes confirmation gated',()=>{
  const byKey=new Map(ACCOUNTING_AI_TOOLS.map(tool=>[tool.key,tool]));
  for(const key of [
    'accounting_financial_overview',
    'accounting_exception_register',
    'accounting_close_readiness',
    'accounting_approval_queue',
    'accounting_journal_detail',
  ]){
    const tool=byKey.get(key);
    assert.ok(tool,key+' should be registered');
    assert.equal(tool?.operation,'read');
    assert.equal(tool?.confirmationRequired,false);
  }
  const draft=byKey.get('accounting_create_draft_journal');
  assert.ok(draft);
  assert.equal(draft?.operation,'write');
  assert.equal(draft?.riskLevel,'high');
  assert.equal(draft?.confirmationRequired,true);
  assert.equal(
    ACCOUNTING_AI_TOOLS.some(tool=>/post|approve|reverse|close/i.test(tool.key) && tool.operation==='write'),
    false,
    'SaMi AI must not expose Accounting posting, approval, reversal or period-close write tools.',
  );
});

test('Accounting Automation offers lifecycle triggers but only approval-gated journal draft writes',()=>{
  const triggers=new Set(ACCOUNTING_AUTOMATION_TRIGGERS.map(row=>row.key));
  for(const key of [
    'accounting.journal.approved',
    'accounting.journal.posted',
    'accounting.journal.reversed',
    'accounting.approval.requested',
    'accounting.approval.approved',
    'accounting.approval.rejected',
    'accounting.period.closed',
    'accounting.period.reopened',
  ]) assert.ok(triggers.has(key),key+' should be available');

  assert.equal(ACCOUNTING_AUTOMATION_ACTIONS.length,1);
  assert.equal(ACCOUNTING_AUTOMATION_ACTIONS[0]?.key,'accounting.journal.create_draft');
  assert.equal(ACCOUNTING_AUTOMATION_ACTIONS[0]?.approvalPolicy,'always');
  assert.equal(ACCOUNTING_AUTOMATION_ACTIONS[0]?.operation,'write');
});
