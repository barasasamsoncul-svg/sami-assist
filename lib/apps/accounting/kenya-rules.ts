export type KenyaEtimsTaxType='A'|'B'|'C'|'D'|'E';

export const KENYA_ETIMS_TAX_TYPES:Record<KenyaEtimsTaxType,{
  label:string;
  rate:number;
  current:boolean;
  legacyEndsOn:string|null;
}> = {
  A:{label:'Exempt',rate:0,current:true,legacyEndsOn:null},
  B:{label:'VAT 16%',rate:16,current:true,legacyEndsOn:null},
  C:{label:'Zero-rated 0%',rate:0,current:true,legacyEndsOn:null},
  D:{label:'Non-VAT',rate:0,current:true,legacyEndsOn:null},
  E:{label:'Legacy VAT 8%',rate:8,current:false,legacyEndsOn:'2023-06-30'},
};

export class KenyaTaxRuleError extends Error {}

export function validateKenyaEtimsTaxMapping(input:{
  taxType:KenyaEtimsTaxType;
  rate:number;
  effectiveTo?:string|null;
}) {
  const rule=KENYA_ETIMS_TAX_TYPES[input.taxType];
  if(!rule) throw new KenyaTaxRuleError('Choose a supported KRA eTIMS tax type.');
  if(Math.abs(input.rate-rule.rate)>0.0001) {
    throw new KenyaTaxRuleError(
      'The Accounting tax rate does not match the selected KRA eTIMS tax type.',
    );
  }
  if(!rule.current) {
    if(!input.effectiveTo || input.effectiveTo>String(rule.legacyEndsOn)) {
      throw new KenyaTaxRuleError(
        'KRA eTIMS tax type E is legacy. Its Accounting tax code must end on or before 2023-06-30.',
      );
    }
  }
  return rule;
}

function cents(value:string) {
  const raw=String(value||'0').trim();
  const negative=raw.startsWith('-');
  const unsigned=negative?raw.slice(1):raw;
  if(!/^\d+(?:\.\d{1,4})?$/.test(unsigned)) throw new KenyaTaxRuleError('Tax summary amount is invalid.');
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let result=BigInt(whole||'0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if(Number(padded[2]||'0')>=5)result+=BigInt(1);
  return negative?-result:result;
}
function decimal(value:bigint) {
  const negative=value<BigInt(0),amount=negative?-value:value;
  return (negative?'-':'')+String(amount/BigInt(100))+'.'+String(amount%BigInt(100)).padStart(2,'0');
}

export function summarizeKenyaVat(entries:Array<{
  direction:'sale'|'purchase'|'withholding';
  entryEffect:number;
  taxableAmount:string;
  taxAmount:string;
  recoverableAmount:string;
}>) {
  let salesTaxable=BigInt(0),outputTax=BigInt(0),salesCreditTax=BigInt(0);
  let purchaseTaxable=BigInt(0),inputTax=BigInt(0),recoverableInputTax=BigInt(0);
  for(const row of entries) {
    const effect=row.entryEffect===-1?BigInt(-1):BigInt(1);
    if(row.direction==='sale') {
      salesTaxable+=cents(row.taxableAmount)*effect;
      if(effect<BigInt(0))salesCreditTax+=cents(row.taxAmount);
      outputTax+=cents(row.taxAmount)*effect;
    }
    if(row.direction==='purchase') {
      purchaseTaxable+=cents(row.taxableAmount)*effect;
      inputTax+=cents(row.taxAmount)*effect;
      recoverableInputTax+=cents(row.recoverableAmount)*effect;
    }
  }
  return {
    salesTaxable:decimal(salesTaxable),
    outputTax:decimal(outputTax),
    salesCreditTax:decimal(salesCreditTax),
    purchaseTaxable:decimal(purchaseTaxable),
    inputTax:decimal(inputTax),
    recoverableInputTax:decimal(recoverableInputTax),
    vatPayable:decimal(outputTax-recoverableInputTax),
  };
}
