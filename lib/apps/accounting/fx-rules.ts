export class AccountingFxError extends Error {}

export function normalizeFxRate(value:unknown){
  const raw=String(value??'').trim();
  if(!/^\d{1,9}(?:\.\d{1,8})?$/.test(raw))throw new AccountingFxError('Exchange rate must be a positive number with at most eight decimal places.');
  const [whole,fraction='']=raw.split('.');
  const units=BigInt(whole)*BigInt(100000000)+BigInt(fraction.padEnd(8,'0'));
  if(units<=BigInt(0))throw new AccountingFxError('Exchange rate must be greater than zero.');
  return {text:whole+'.'+fraction.padEnd(8,'0'),units};
}

export function fxMoney(value:unknown){
  const raw=String(value??'').trim();
  const negative=raw.startsWith('-'),unsigned=negative?raw.slice(1):raw;
  if(!/^\d{1,18}(?:\.\d{1,8})?$/.test(unsigned))throw new AccountingFxError('FX amount is invalid.');
  const [whole,fraction='']=unsigned.split('.');
  const padded=fraction.padEnd(3,'0');
  let cents=BigInt(whole||'0')*BigInt(100)+BigInt(padded.slice(0,2)||'0');
  if(Number(padded[2]||'0')>=5)cents+=BigInt(1);
  return negative?-cents:cents;
}

export function fxForeignUnits(value:unknown){
  const raw=String(value??'').trim();
  const negative=raw.startsWith('-'),unsigned=negative?raw.slice(1):raw;
  if(!/^\d{1,18}(?:\.\d{1,4})?$/.test(unsigned))throw new AccountingFxError('Foreign-currency amount is invalid.');
  const [whole,fraction='']=unsigned.split('.');
  const units=BigInt(whole||'0')*BigInt(10000)+BigInt(fraction.padEnd(4,'0'));
  return negative?-units:units;
}

export function foreignDecimal(units:bigint){
  const negative=units<BigInt(0),v=negative?-units:units;
  return (negative?'-':'')+String(v/BigInt(10000))+'.'+String(v%BigInt(10000)).padStart(4,'0');
}

export function centsDecimal(cents:bigint){
  const negative=cents<BigInt(0),v=negative?-cents:cents;
  return (negative?'-':'')+String(v/BigInt(100))+'.'+String(v%BigInt(100)).padStart(2,'0');
}

export function convertForeignToBase(amount:unknown,rate:unknown){
  const foreign=fxForeignUnits(amount),r=normalizeFxRate(rate).units;
  const sign=foreign<BigInt(0)?BigInt(-1):BigInt(1),abs=foreign<BigInt(0)?-foreign:foreign;
  const numerator=abs*r;
  const baseCents=(numerator+BigInt(5000000000))/BigInt(10000000000);
  return centsDecimal(baseCents*sign);
}

export function calculateRealizedFx(input:{
  paymentAmount:unknown;
  paymentRate:unknown;
  billAmount:unknown;
  billRate:unknown;
}){
  const paymentBase=fxMoney(convertForeignToBase(input.paymentAmount,input.paymentRate));
  const billBase=fxMoney(convertForeignToBase(input.billAmount,input.billRate));
  return {
    paymentBase:centsDecimal(paymentBase),
    billBase:centsDecimal(billBase),
    realized:centsDecimal(paymentBase-billBase),
  };
}

export function calculateRevaluation(input:{
  foreignBalance:unknown;
  historicalBaseBalance:unknown;
  closingRate:unknown;
}){
  const revalued=fxMoney(convertForeignToBase(input.foreignBalance,input.closingRate));
  const historical=fxMoney(input.historicalBaseBalance);
  return {
    revaluedBase:centsDecimal(revalued),
    adjustment:centsDecimal(revalued-historical),
  };
}

export function crossCurrencyTransfer(input:{
  sourceAmount:unknown;
  sourceRate:unknown;
  destinationAmount:unknown;
  destinationRate:unknown;
}){
  const sourceBase=fxMoney(convertForeignToBase(input.sourceAmount,input.sourceRate));
  const destinationBase=fxMoney(convertForeignToBase(input.destinationAmount,input.destinationRate));
  return {
    sourceBase:centsDecimal(sourceBase),
    destinationBase:centsDecimal(destinationBase),
    realized:centsDecimal(sourceBase-destinationBase),
  };
}
