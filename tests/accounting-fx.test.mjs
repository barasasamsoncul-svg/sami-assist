import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  calculateRealizedFx,
  calculateRevaluation,
  convertForeignToBase,
  crossCurrencyTransfer,
} from '../lib/apps/accounting/fx-rules.ts';

test('FX conversion uses exact 8-decimal rates and two-decimal base rounding',()=>{
  assert.equal(convertForeignToBase('100.0000','130.00000000'),'13000.00');
  assert.equal(convertForeignToBase('-12.3456','129.87654321'),'-1603.40');
});

test('vendor settlement calculates realized FX from payment and historical bill rates',()=>{
  const result=calculateRealizedFx({
    paymentAmount:'100.0000',
    paymentRate:'130.00000000',
    billAmount:'100.0000',
    billRate:'125.00000000',
  });
  assert.equal(result.paymentBase,'13000.00');
  assert.equal(result.billBase,'12500.00');
  assert.equal(result.realized,'500.00');
});

test('cross-currency transfer exposes base conversion difference',()=>{
  const result=crossCurrencyTransfer({
    sourceAmount:'100.0000',
    sourceRate:'130.00000000',
    destinationAmount:'90.0000',
    destinationRate:'140.00000000',
  });
  assert.equal(result.sourceBase,'13000.00');
  assert.equal(result.destinationBase,'12600.00');
  assert.equal(result.realized,'400.00');
});

test('closing revaluation compares foreign closing value with historical base carrying value',()=>{
  const result=calculateRevaluation({
    foreignBalance:'100.0000',
    historicalBaseBalance:'12500.00',
    closingRate:'130.00000000',
  });
  assert.equal(result.revaluedBase,'13000.00');
  assert.equal(result.adjustment,'500.00');
});

test('Accounting FX owns AP/bank FX but does not repost Invoicing customer FX',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/fx.ts',import.meta.url),'utf8');
  assert.match(source,/accounting_vendor_document_balances/);
  assert.match(source,/invoicing_aging/);
  assert.match(source,/postBalancedLedgerJournal/);
  assert.match(source,/reversePostedLedgerJournal/);
  assert.match(source,/accounting_fx_financial_movements/);
  assert.doesNotMatch(source,/INSERT INTO invoicing_payment_allocations/);
  assert.doesNotMatch(source,/UPDATE invoicing_invoices/);
});

test('foreign statement reconciliation translates to base and preserves FX subledger adjustments',async()=>{
  const [statements,reconciliation]=await Promise.all([
    fs.readFile(new URL('../lib/apps/accounting/statements.ts',import.meta.url),'utf8'),
    fs.readFile(new URL('../lib/apps/accounting/reconciliation.ts',import.meta.url),'utf8'),
  ]);
  assert.match(statements,/accounting_exchange_rates/);
  assert.match(statements,/base_amount/);
  assert.match(statements,/convertForeignToBase/);
  assert.match(reconciliation,/statementLedgerAmount/);
  assert.match(reconciliation,/accounting_fx_financial_movements/);
  assert.match(reconciliation,/statement_foreign_amount/);
});

test('manual journal posting cannot bypass a foreign financial-account subledger',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/ledger-engine.ts',import.meta.url),'utf8');
  assert.match(source,/foreign_financial_account/);
  assert.match(source,/Manual journals cannot post directly to a foreign-currency financial account/);
});
