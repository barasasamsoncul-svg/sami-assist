'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Overview = {
  summary: { productCount: number; warehouseCount: number; stockBalanceCount: number; onHandQuantity: string; lowStockCount: number };
  products: Array<{ id: string; name: string; sku: string | null; unitOfMeasure: string }>;
  warehouses: Array<{ id: string; name: string; code: string; isDefault: boolean }>;
  balances: Array<{ productId: string; productName: string; sku: string | null; warehouseId: string; warehouseName: string; quantity: string; reservedQuantity: string; availableQuantity: string; reorderLevel: string; lowStock: boolean }>;
  recentMovements: Array<{ id: string; productName: string; warehouseName: string; movementType: string; quantity: string; reference: string | null; createdAt: string }>;
};
const MOVEMENTS = [
  { value: 'receipt', label: 'Stock receipt' }, { value: 'purchase_receipt', label: 'Purchase receipt' },
  { value: 'opening_balance', label: 'Opening balance' }, { value: 'return_in', label: 'Customer return' },
  { value: 'adjustment_in', label: 'Positive adjustment' }, { value: 'issue', label: 'Stock issue' },
  { value: 'sale', label: 'Sale / issue' }, { value: 'return_out', label: 'Return to supplier' },
  { value: 'adjustment_out', label: 'Negative adjustment' },
] as const;
const field = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-950';
const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900';
function fmtDate(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function movementLabel(value: string) { return MOVEMENTS.find((x) => x.value === value)?.label || value.replaceAll('_', ' '); }

export default function InventoryStockControlPanel() {
  const [data,setData] = useState<Overview|null>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const [productId,setProductId] = useState('');
  const [warehouseId,setWarehouseId] = useState('');
  const [movementType,setMovementType] = useState('receipt');
  const [quantity,setQuantity] = useState('');
  const [reference,setReference] = useState('');
  const keyRef = useRef('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/inventory',{cache:'no-store',headers:{Accept:'application/json'}});
      const payload = await response.json().catch(()=>null);
      if(!response.ok||payload?.success!==true) throw new Error(payload?.error||'Inventory data could not be loaded.');
      const value = payload.result as Overview;
      setData(value);
      setProductId(v=>v||value.products[0]?.id||'');
      setWarehouseId(v=>v||value.warehouses[0]?.id||'');
      setError(null);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Inventory data could not be loaded.');
    } finally { setLoading(false); }
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    if(!keyRef.current) keyRef.current=crypto.randomUUID();
    try {
      const response=await fetch('/api/apps/inventory',{
        method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({action:'record-movement',productId,warehouseId,movementType,quantity,reference,idempotencyKey:keyRef.current}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||payload?.success!==true) throw new Error(payload?.error||'Stock movement was not recorded.');
      keyRef.current='';setQuantity('');setReference('');
      setNotice('Movement recorded and stock balance updated.');
      await refresh();
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Stock movement was not recorded.');
    } finally { setSaving(false); }
  }
  const s=data?.summary;
  return <section className="mb-6 min-w-0 space-y-5" aria-labelledby="inventory-stock-control-heading">
    <div className="flex flex-wrap items-end justify-between gap-3"><div>
      <h2 id="inventory-stock-control-heading" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Stock control</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Receipts and issues update stock and movement history together. Direct balance edits are restricted to preserve the ledger.</p>
    </div><button type="button" onClick={()=>void refresh()} disabled={loading||saving} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">Refresh stock</button></div>
    {error?<div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">{error}</div>:null}
    {notice?<div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</div>:null}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      {label:'Stock-tracked products',value:s?.productCount??'—'},
      {label:'Active warehouses',value:s?.warehouseCount??'—'},
      {label:'Units on hand',value:s?.onHandQuantity??'—'},
      {label:'Low-stock balances',value:s?.lowStockCount??'—'},
    ].map(item=><div key={item.label} className={card}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{item.value}</p></div>)}</div>
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <form onSubmit={submit} className={card}>
        <h3 className="text-base font-semibold text-slate-950 dark:text-white">Record stock movement</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Issues fail if the stock balance cannot cover the quantity.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100">Movement<select required value={movementType} onChange={e=>setMovementType(e.target.value)} className={field}>{MOVEMENTS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          <label className="block min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100">Quantity<input required inputMode="decimal" pattern="\d+(\.\d{1,4})?" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="e.g. 12.5000" className={field}/></label>
          <label className="block min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Product<select required value={productId} onChange={e=>setProductId(e.target.value)} disabled={!data?.products.length} className={field}>{(data?.products||[]).map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' · '+p.sku:''}</option>)}</select></label>
          <label className="block min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Warehouse<select required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} disabled={!data?.warehouses.length} className={field}>{(data?.warehouses||[]).map(w=><option key={w.id} value={w.id}>{w.name} ({w.code}){w.isDefault?' · Default':''}</option>)}</select></label>
          <label className="block min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Reference (optional)<input maxLength={255} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Delivery note or internal reference" className={field}/></label>
        </div>
        {!loading&&(!data?.products.length||!data?.warehouses.length)?<p className="mt-3 text-sm text-amber-800 dark:text-amber-200">Add an active stock-tracked product and warehouse before recording movements.</p>:null}
        <button type="submit" disabled={saving||loading||!productId||!warehouseId||!quantity} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">{saving?'Recording movement…':'Record movement'}</button>
      </form>
      <div className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-slate-950 dark:text-white">Recent movements</h3><span className="text-xs text-slate-500 dark:text-slate-400">{data?.recentMovements.length??0} recent</span></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400"><th className="py-2 pr-3 font-semibold">Movement</th><th className="py-2 pr-3 font-semibold">Product / warehouse</th><th className="py-2 pr-3 text-right font-semibold">Qty</th><th className="py-2 font-semibold">Date</th></tr></thead>
        <tbody>{(data?.recentMovements||[]).map(m=><tr key={m.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"><td className="py-3 pr-3 align-top"><span className="font-medium capitalize text-slate-900 dark:text-slate-100">{movementLabel(m.movementType)}</span>{m.reference?<span className="mt-1 block max-w-[180px] truncate text-xs text-slate-500 dark:text-slate-400">{m.reference}</span>:null}</td><td className="py-3 pr-3 align-top"><span className="block font-medium text-slate-900 dark:text-slate-100">{m.productName}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{m.warehouseName}</span></td><td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{m.quantity}</td><td className="py-3 text-xs text-slate-600 dark:text-slate-300">{fmtDate(m.createdAt)}</td></tr>)}{!loading&&!data?.recentMovements.length?<tr><td colSpan={4} className="py-8 text-center text-slate-500 dark:text-slate-400">No movements recorded yet.</td></tr>:null}</tbody></table></div>
      </div>
    </div>
    <div className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-slate-950 dark:text-white">Stock by warehouse</h3><span className="text-xs text-slate-500 dark:text-slate-400">{data?.balances.length??0} balances shown</span></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[590px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400"><th className="py-2 pr-3 font-semibold">Product</th><th className="py-2 pr-3 font-semibold">Warehouse</th><th className="py-2 pr-3 text-right font-semibold">On hand</th><th className="py-2 pr-3 text-right font-semibold">Reserved</th><th className="py-2 pr-3 text-right font-semibold">Available</th><th className="py-2 text-right font-semibold">Reorder at</th></tr></thead>
      <tbody>{(data?.balances||[]).map(b=><tr key={b.productId+':'+b.warehouseId} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"><td className="py-3 pr-3 text-slate-900 dark:text-slate-100"><span className="block font-medium">{b.productName}</span>{b.sku?<span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{b.sku}</span>:null}</td><td className="py-3 pr-3 text-slate-700 dark:text-slate-300">{b.warehouseName}</td><td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{b.quantity}</td><td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">{b.reservedQuantity}</td><td className={'py-3 pr-3 text-right font-mono tabular-nums '+(b.lowStock?'font-semibold text-rose-700 dark:text-rose-300':'text-slate-900 dark:text-slate-100')}>{b.availableQuantity}</td><td className="py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{b.reorderLevel}</td></tr>)}{!loading&&!data?.balances.length?<tr><td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">No stock balances recorded yet.</td></tr>:null}</tbody></table></div>
    </div>
  </section>;
}
