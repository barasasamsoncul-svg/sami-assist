export type LocalizationEntry = {
  taxCodeId:string;
  direction:'sale'|'purchase'|'withholding';
  entryEffect:number;
  taxableAmount:string;
  taxAmount:string;
  recoverableAmount:string;
  nonrecoverableAmount:string;
};

export type LocalizationRule = {
  boxId:string;
  taxCodeId:string;
  direction:'sale'|'purchase'|'withholding'|'any';
  amountField:'taxable'|'tax'|'recoverable'|'nonrecoverable';
  multiplier:string|number;
};

export class LocalizationRuleError extends Error {}

function cents(value:string|number){
  const raw=String(value??'0').trim();
  const negative=raw.startsWith('-');
  const unsigned=negative?raw.slice(1):raw;
  if(!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned))throw new LocalizationRuleError('Localization amount is invalid.');
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let amount=BigInt(whole||'0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if(Number(padded[2]||'0')>=5)amount+=BigInt(1);
  return negative?-amount:amount;
}
function multiplierUnits(value:string|number){
  const raw=String(value).trim();
  if(!/^-?\d{1,4}(?:\.\d{1,4})?$/.test(raw))throw new LocalizationRuleError('Localization multiplier is invalid.');
  const negative=raw.startsWith('-'),unsigned=negative?raw.slice(1):raw;
  const [whole,fraction='']=unsigned.split('.');
  const units=BigInt(whole)*BigInt(10000)+BigInt(fraction.padEnd(4,'0'));
  if(units===BigInt(0))throw new LocalizationRuleError('Localization multiplier cannot be zero.');
  return negative?-units:units;
}
function decimal(value:bigint){
  const negative=value<BigInt(0),amount=negative?-value:value;
  return (negative?'-':'')+String(amount/BigInt(100))+'.'+String(amount%BigInt(100)).padStart(2,'0');
}
function amountFor(entry:LocalizationEntry,field:LocalizationRule['amountField']){
  if(field==='taxable')return cents(entry.taxableAmount);
  if(field==='tax')return cents(entry.taxAmount);
  if(field==='recoverable')return cents(entry.recoverableAmount);
  return cents(entry.nonrecoverableAmount);
}

export function calculateLocalizationBoxes(entries:LocalizationEntry[],rules:LocalizationRule[]){
  const totals=new Map<string,bigint>();
  for(const rule of rules){
    const multiplier=multiplierUnits(rule.multiplier);
    for(const entry of entries){
      if(entry.taxCodeId!==rule.taxCodeId)continue;
      if(rule.direction!=='any'&&entry.direction!==rule.direction)continue;
      const effect=entry.entryEffect===-1?BigInt(-1):BigInt(1);
      const raw=amountFor(entry,rule.amountField);
      const weighted=(raw*multiplier+BigInt(multiplier>=0?5000:-5000))/BigInt(10000);
      totals.set(rule.boxId,(totals.get(rule.boxId)||BigInt(0))+weighted*effect);
    }
  }
  return Object.fromEntries([...totals.entries()].map(([boxId,value])=>[boxId,decimal(value)]));
}

export function nextLocalizationDueDate(input:{
  periodEnd:string;
  filingFrequency:'monthly'|'quarterly'|'annual'|'custom';
  filingDay:number;
}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd))throw new LocalizationRuleError('Period end date is invalid.');
  if(!['monthly','quarterly','annual','custom'].includes(input.filingFrequency))throw new LocalizationRuleError('Filing frequency is invalid.');
  const day=Math.max(1,Math.min(28,Math.trunc(input.filingDay)));
  const [year,month]=input.periodEnd.split('-').map(Number);
  const d=new Date(Date.UTC(year,month,day));
  return d.toISOString().slice(0,10);
}
