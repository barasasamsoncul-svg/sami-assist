import test from 'node:test';
import assert from 'node:assert/strict';

import {
  terminalSalesOpportunityProbability,
} from '../lib/apps/sales/pipeline-stage-rules';

test('won and lost opportunity stages enforce canonical probabilities', () => {
  assert.equal(terminalSalesOpportunityProbability('won'), 100);
  assert.equal(terminalSalesOpportunityProbability('lost'), 0);
  assert.equal(terminalSalesOpportunityProbability('WON'), 100);
  assert.equal(terminalSalesOpportunityProbability(' Lost '), 0);
});

test('open and unknown stages leave probability selection to normal validation', () => {
  assert.equal(terminalSalesOpportunityProbability('open'), null);
  assert.equal(terminalSalesOpportunityProbability('qualification'), null);
  assert.equal(terminalSalesOpportunityProbability(null), null);
  assert.equal(terminalSalesOpportunityProbability(undefined), null);
});
