export class AccountingInventoryValuationError extends Error {}

function decimalParts(value:unknown,scale:number,label:string){
  const raw=String(value??'0').trim();
  const negative=raw.startsWith('-');
  const unsigned=negative?raw.slice(1):raw;
  const re=scale===4?/^\d{1,18}(?:\.\d{1,4})?$/:/^\d{1,18}(?:\.\d{1,2})?$/;
  if(!re.test(unsigned))throw new AccountingInventoryValuationError(label+' is invalid.');
  const [whole,fraction='']=unsigned.split('.');
  const base=BigInt(10)**BigInt(scale);
  const units=BigInt(whole||'0')*base+BigInt(fraction.padEnd(scale,'0'));
  return negative?-units:units;
}
export function inventoryQuantityUnits(value:unknown){return decimalParts(value,4,'Inventory quantity');}
export function inventoryMoneyCents(value:unknown){return decimalParts(value,2,'Inventory amount');}
export function quantityDecimal(value:bigint){
  const neg=value<BigInt(0),v=neg?-value:value;
  return (neg?'-':'')+String(v/BigInt(10000))+'.'+String(v%BigInt(10000)).padStart(4,'0');
}
export function moneyDecimal(value:bigint){
  const neg=value<BigInt(0),v=neg?-value:value;
  return (neg?'-':'')+String(v/BigInt(100))+'.'+String(v%BigInt(100)).padStart(2,'0');
}
export function standardCostValue(quantity:unknown,unitCost:unknown){
  const q=inventoryQuantityUnits(quantity);
  const cost=inventoryQuantityUnits(unitCost);
  const abs=q<BigInt(0)?-q:q;
  const cents=(abs*cost+BigInt(500000))/BigInt(1000000);
  return moneyDecimal(cents);
}
export function classifyInventoryEvent(input:{movementType:string;quantityEffect:unknown;}){
  const q=inventoryQuantityUnits(input.quantityEffect);
  if(input.movementType==='sales_delivery'&&q<0)return 'cogs_issue' as const;
  if(input.movementType==='sales_return'&&q>0)return 'cogs_return' as const;
  if(input.movementType==='inventory_adjustment_gain'&&q>0)return 'adjustment_gain' as const;
  if(input.movementType==='inventory_adjustment_loss'&&q<0)return 'adjustment_loss' as const;
  return 'review' as const;
}
