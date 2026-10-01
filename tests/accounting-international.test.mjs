import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  calculateLocalizationBoxes,
  nextLocalizationDueDate,
} from '../lib/apps/accounting/international-rules.ts';

test('international localization box engine applies direction, entry effect and signed multipliers',()=>{
  const totals=calculateLocalizationBoxes([
    {taxCodeId:'sale-vat',direction:'sale',entryEffect:1,taxableAmount:'1000.00',taxAmount:'160.00',recoverableAmount:'0.00',nonrecoverableAmount:'160.00'},
    {taxCodeId:'sale-vat',direction:'sale',entryEffect:-1,taxableAmount:'100.00',taxAmount:'16.00',recoverableAmount:'0.00',nonrecoverableAmount:'16.00'},
    {taxCodeId:'purchase-vat',direction:'purchase',entryEffect:1,taxableAmount:'500.00',taxAmount:'80.00',recoverableAmount:'60.00',nonrecoverableAmount:'20.00'},
  ],[
    {boxId:'sales',taxCodeId:'sale-vat',direction:'sale',amountField:'taxable',multiplier:1},
    {boxId:'output',taxCodeId:'sale-vat',direction:'sale',amountField:'tax',multiplier:1},
    {boxId:'recoverable',taxCodeId:'purchase-vat',direction:'purchase',amountField:'recoverable',multiplier:1},
    {boxId:'net-due',taxCodeId:'sale-vat',direction:'sale',amountField:'tax',multiplier:1},
    {boxId:'net-due',taxCodeId:'purchase-vat',direction:'purchase',amountField:'recoverable',multiplier:-1},
  ]);
  assert.equal(totals.sales,'900.00');
  assert.equal(totals.output,'144.00');
  assert.equal(totals.recoverable,'60.00');
  assert.equal(totals['net-due'],'84.00');
});

test('international localization filing due date follows the configured post-period day',()=>{
  assert.equal(nextLocalizationDueDate({periodEnd:'2026-09-30',filingFrequency:'monthly',filingDay:20}),'2026-10-20');
  assert.equal(nextLocalizationDueDate({periodEnd:'2026-12-31',filingFrequency:'annual',filingDay:15}),'2027-01-15');
});

test('international localization reuses Invoicing e-invoice evidence without importing provider credentials',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/international.ts',import.meta.url),'utf8');
  assert.match(source,/invoicing_einvoice_profiles/);
  assert.match(source,/invoicing_einvoice_participants/);
  assert.match(source,/invoicing_einvoice_documents/);
  assert.match(source,/accepted.*exported|accepted','exported/);
  assert.doesNotMatch(source,/credential_sealed/);
  assert.doesNotMatch(source,/openIntegrationSecret/);
  assert.doesNotMatch(source,/sealIntegrationSecret/);
});

test('generic localization pack is rate-neutral and derives reporting from existing tax codes',async()=>{
  const source=await fs.readFile(new URL('../lib/apps/accounting/international.ts',import.meta.url),'utf8');
  assert.match(source,/Generic international VAT reporting pack installed/);
  assert.match(source,/FROM accounting_tax_codes/);
  assert.match(source,/RECOVERABLE_INPUT/);
  assert.match(source,/NET_TAX_DUE/);
  assert.doesNotMatch(source,/rate\s*:\s*16|rate\s*=\s*16|20\.0000|19\.0000|21\.0000/);
});
