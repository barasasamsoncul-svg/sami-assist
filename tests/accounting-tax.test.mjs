import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountingTaxes } from '../lib/apps/accounting/tax-engine.ts';
const rule=(overrides={})=>({id:'11111111-1111-4111-8111-111111111111',code:'VAT',name:'VAT',scope:'sale',behavior:'add',computation:'percent',rate:'16.0000',fixedAmount:'0.00',priceIncluded:false,includeBaseAmount:false,recoverablePercent:'0.0000',sequence:100,...overrides});
test('exclusive percentage tax',()=>{const r=calculateAccountingTaxes('1000.00',[rule()]);assert.equal(r.untaxedAmount,'1000.00');assert.equal(r.taxTotal,'160.00');assert.equal(r.totalAmount,'1160.00');});
test('price-included percentage tax',()=>{const r=calculateAccountingTaxes('1160.00',[rule({priceIncluded:true})]);assert.equal(r.untaxedAmount,'1000.00');assert.equal(r.taxTotal,'160.00');assert.equal(r.totalAmount,'1160.00');});
test('recoverable purchase tax split',()=>{const r=calculateAccountingTaxes('1000.00',[rule({scope:'purchase',recoverablePercent:'75.0000'})]);assert.equal(r.recoverableTotal,'120.00');assert.equal(r.nonrecoverableTotal,'40.00');});
test('withholding reduces settlement total',()=>{const r=calculateAccountingTaxes('1000.00',[rule({scope:'withholding',behavior:'withhold',rate:'5.0000'})]);assert.equal(r.taxTotal,'0.00');assert.equal(r.withholdingTotal,'50.00');assert.equal(r.totalAmount,'950.00');});
