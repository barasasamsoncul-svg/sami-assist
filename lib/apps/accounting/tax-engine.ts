import { AccountingInputError, decimalAmount, minorUnits } from './validation';

const SCALE=BigInt(1000000);
export type AccountingTaxRule={
  id:string;code:string;name:string;scope:'sale'|'purchase'|'both'|'withholding';
  behavior:'add'|'withhold';computation:'percent'|'fixed';rate:string;fixedAmount:string;
  priceIncluded:boolean;includeBaseAmount:boolean;recoverablePercent:string;sequence:number;
};
export type AccountingTaxComponent={
  taxCodeId:string;code:string;name:string;taxableAmount:string;taxAmount:string;
  recoverableAmount:string;nonrecoverableAmount:string;behavior:'add'|'withhold';priceIncluded:boolean;
};
function scaled(value:string,label:string){
  const raw=value.trim(); if(!/^\d+(?:\.\d{1,4})?$/.test(raw))throw new AccountingInputError(label+' is invalid.');
  const [w,f='']=raw.split('.'); return BigInt(w)*BigInt(10000)+BigInt(f.padEnd(4,'0'));
}
function roundDiv(n:bigint,d:bigint){if(d<=0n)throw new AccountingInputError('Tax calculation denominator is invalid.');return(n+d/2n)/d;}
function percent(base:bigint,rate:string){const r=scaled(rate,'Tax rate');if(r<0n||r>SCALE)throw new AccountingInputError('Tax rate must be between 0 and 100 percent.');return roundDiv(base*r,SCALE);}
function included(gross:bigint,rate:string){const r=scaled(rate,'Tax rate');if(r<0n||r>SCALE)throw new AccountingInputError('Tax rate must be between 0 and 100 percent.');return roundDiv(gross*r,SCALE+r);}
function recover(tax:bigint,pct:string){const p=scaled(pct,'Recoverable percent');if(p<0n||p>SCALE)throw new AccountingInputError('Recoverable percent must be between 0 and 100.');const a=roundDiv(tax*p,SCALE);return{recoverable:a,nonrecoverable:tax-a};}

export function calculateAccountingTaxes(amount:string,inputRules:AccountingTaxRule[]){
  const source=minorUnits(amount);if(source<0n)throw new AccountingInputError('Taxable amount cannot be negative.');
  if(inputRules.length>30)throw new AccountingInputError('A tax calculation can contain at most 30 taxes.');
  const rules=[...inputRules].sort((a,b)=>a.sequence-b.sequence||a.code.localeCompare(b.code));const ids=new Set<string>();
  for(const rule of rules){
    if(ids.has(rule.id))throw new AccountingInputError('A tax code can be applied only once.');ids.add(rule.id);
    if(rule.behavior==='withhold'&&rule.priceIncluded)throw new AccountingInputError('Withholding taxes cannot be price included.');
    if(rule.priceIncluded&&rule.computation!=='percent')throw new AccountingInputError('Only percentage taxes can be price included.');
    if(rule.priceIncluded&&rule.includeBaseAmount)throw new AccountingInputError('Price-included taxes cannot increase the base of later taxes.');
  }
  let untaxed=source,total=source,runningBase=source;const components:AccountingTaxComponent[]=[];
  for(const rule of rules.filter(r=>r.priceIncluded)){
    const tax=included(runningBase,rule.rate),rec=recover(tax,rule.recoverablePercent);untaxed-=tax;runningBase-=tax;
    components.push({taxCodeId:rule.id,code:rule.code,name:rule.name,taxableAmount:decimalAmount(runningBase),taxAmount:decimalAmount(tax),recoverableAmount:decimalAmount(rec.recoverable),nonrecoverableAmount:decimalAmount(rec.nonrecoverable),behavior:rule.behavior,priceIncluded:true});
  }
  runningBase=untaxed;
  for(const rule of rules.filter(r=>!r.priceIncluded)){
    const tax=rule.computation==='fixed'?minorUnits(rule.fixedAmount):percent(runningBase,rule.rate),rec=recover(tax,rule.recoverablePercent);
    components.push({taxCodeId:rule.id,code:rule.code,name:rule.name,taxableAmount:decimalAmount(runningBase),taxAmount:decimalAmount(tax),recoverableAmount:decimalAmount(rec.recoverable),nonrecoverableAmount:decimalAmount(rec.nonrecoverable),behavior:rule.behavior,priceIncluded:false});
    total+=rule.behavior==='withhold'?-tax:tax;if(rule.includeBaseAmount)runningBase+=tax;
  }
  const sum=(key:'taxAmount'|'recoverableAmount'|'nonrecoverableAmount',filter?:(c:AccountingTaxComponent)=>boolean)=>components.filter(filter||(()=>true)).reduce((n,c)=>n+minorUnits(c[key]),0n);
  return{inputAmount:decimalAmount(source),untaxedAmount:decimalAmount(untaxed),taxTotal:decimalAmount(sum('taxAmount',c=>c.behavior==='add')),withholdingTotal:decimalAmount(sum('taxAmount',c=>c.behavior==='withhold')),recoverableTotal:decimalAmount(sum('recoverableAmount')),nonrecoverableTotal:decimalAmount(sum('nonrecoverableAmount')),totalAmount:decimalAmount(total),components};
}
