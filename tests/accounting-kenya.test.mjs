import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  KENYA_ETIMS_TAX_TYPES,
  KenyaTaxRuleError,
  summarizeKenyaVat,
  validateKenyaEtimsTaxMapping,
} from '../lib/apps/accounting/kenya-rules.ts';

test('Kenya eTIMS mapping accepts current KRA VAT classifications',()=>{
  assert.equal(validateKenyaEtimsTaxMapping({taxType:'B',rate:16}).current,true);
  assert.equal(validateKenyaEtimsTaxMapping({taxType:'A',rate:0}).rate,0);
  assert.equal(validateKenyaEtimsTaxMapping({taxType:'C',rate:0}).current,true);
  assert.equal(validateKenyaEtimsTaxMapping({taxType:'D',rate:0}).current,true);
});

test('Kenya eTIMS type E stays historical and cannot be used as an open-ended current tax',()=>{
  assert.equal(KENYA_ETIMS_TAX_TYPES.E.current,false);
  assert.throws(
    ()=>validateKenyaEtimsTaxMapping({taxType:'E',rate:8}),
    KenyaTaxRuleError,
  );
  assert.equal(
    validateKenyaEtimsTaxMapping({taxType:'E',rate:8,effectiveTo:'2023-06-30'}).legacyEndsOn,
    '2023-06-30',
  );
});

test('Kenya VAT summary nets sales credits and recoverable purchase tax',()=>{
  const result=summarizeKenyaVat([
    {direction:'sale',entryEffect:1,taxableAmount:'1000.00',taxAmount:'160.00',recoverableAmount:'0.00'},
    {direction:'sale',entryEffect:-1,taxableAmount:'100.00',taxAmount:'16.00',recoverableAmount:'0.00'},
    {direction:'purchase',entryEffect:1,taxableAmount:'500.00',taxAmount:'80.00',recoverableAmount:'60.00'},
  ]);
  assert.equal(result.salesTaxable,'900.00');
  assert.equal(result.outputTax,'144.00');
  assert.equal(result.salesCreditTax,'16.00');
  assert.equal(result.recoverableInputTax,'60.00');
  assert.equal(result.vatPayable,'84.00');
});

test('Accounting Kenya reuses Invoicing eTIMS authority instead of duplicating connector credentials',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/kenya.ts',import.meta.url),'utf8');
  assert.match(source,/invoicing_etims_profiles/);
  assert.match(source,/invoicing_etims_submissions/);
  assert.match(source,/invoicing_etims_tax_mappings/);
  assert.doesNotMatch(source,/SAMI_ETIMS_[A-Z_]+_BASE_URL/);
  assert.doesNotMatch(source,/communication_key_sealed/);
});

test('Payables posts recoverable purchase tax separately and reverses tax-register effects',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/payables.ts',import.meta.url),'utf8');
  assert.match(source,/recoverable_tax_amount/);
  assert.match(source,/recoverable_account_id/);
  assert.match(source,/accounting:vendor-tax:/);
  assert.match(source,/entry_effect \* -1/);
});
