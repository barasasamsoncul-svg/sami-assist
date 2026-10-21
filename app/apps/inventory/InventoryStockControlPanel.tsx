'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Overview = {
  summary: { productCount: number; warehouseCount: number; stockBalanceCount: number; onHandQuantity: string; lowStockCount: number };
  products: Array<{ id: string; name: string; sku: string | null; unitOfMeasure: string }>;
  warehouses: Array<{ id: string; name: string; code: string; isDefault: boolean }>;
  balances: Array<{ productId: string; productName: string; sku: string | null; warehouseId: string; warehouseName: string; quantity: string; reservedQuantity: string; availableQuantity: string; reorderLevel: string; lowStock: boolean }>;
  recentMovements: Array<{ id: string; productName: string; warehouseName: string; movementType: string; quantity: string; reference: string | null; createdAt: string }>;
  transferOrders: Array<{
    id: string; transferNumber: string; status: string; sourceWarehouseId: string;
    sourceWarehouseName: string; destinationWarehouseId: string; destinationWarehouseName: string;
    requestedAt: string; shippedAt: string | null; receivedAt: string | null;
    lines: Array<{ id: string; productId: string; productName: string; requestedQuantity: string; shippedQuantity: string; receivedQuantity: string }>;
  }>;
  cycleCounts: Array<{
    id: string; warehouseId: string; warehouseName: string; productId: string; productName: string;
    dueOn: string; status: string; systemQuantity: string | null; countedQuantity: string | null; countedAt: string | null;
  }>;
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
  const [transferSourceId,setTransferSourceId] = useState('');
  const [transferDestinationId,setTransferDestinationId] = useState('');
  const [transferProductId,setTransferProductId] = useState('');
  const [transferQuantity,setTransferQuantity] = useState('');
  const [cycleWarehouseId,setCycleWarehouseId] = useState('');
  const [cycleProductId,setCycleProductId] = useState('');
  const [cycleDueOn,setCycleDueOn] = useState('');
  const [countValues,setCountValues] = useState<Record<string,string>>({});
  const keyRef = useRef('');
  const payloadFingerprintRef = useRef('');
  const transferKeyRef = useRef('');
  const transferFingerprintRef = useRef('');
  const cycleKeyRef = useRef('');
  const cycleFingerprintRef = useRef('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/inventory',{cache:'no-store',headers:{Accept:'application/json'}});
      const payload = await response.json().catch(()=>null);
      if(!response.ok||payload?.success!==true) throw new Error(payload?.error||'Inventory data could not be loaded.');
      const value = payload.result as Overview;
      setData(value);
      setProductId(v=>value.products.some(p=>p.id===v)?v:(value.products[0]?.id||''));
      setWarehouseId(v=>value.warehouses.some(w=>w.id===v)?v:(value.warehouses[0]?.id||''));
      setTransferProductId(v=>value.products.some(p=>p.id===v)?v:(value.products[0]?.id||''));
      setCycleProductId(v=>value.products.some(p=>p.id===v)?v:(value.products[0]?.id||''));
      setTransferSourceId(v=>value.warehouses.some(w=>w.id===v)?v:(value.warehouses[0]?.id||''));
      setTransferDestinationId(v=>value.warehouses.some(w=>w.id===v && w.id!==transferSourceId)?v:(value.warehouses.find(w=>w.id!==value.warehouses[0]?.id)?.id||''));
      setCycleWarehouseId(v=>value.warehouses.some(w=>w.id===v)?v:(value.warehouses[0]?.id||''));
      setError(null);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Inventory data could not be loaded.');
    } finally { setLoading(false); }
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  async function performWorkflowAction(payload: Record<string,unknown>, successMessage: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/inventory', {
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify(payload),
      });
      const result = await response.json().catch(()=>null);
      if(!response.ok || result?.success!==true) throw new Error(result?.error||'Inventory workflow action failed.');
      setNotice(successMessage);
      await refresh();
      return true;
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Inventory workflow action failed.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      action:'create-transfer',
      sourceWarehouseId:transferSourceId,
      destinationWarehouseId:transferDestinationId,
      lines:[{productId:transferProductId,quantity:transferQuantity}],
    };
    const fingerprint = JSON.stringify(payload);
    if(!transferKeyRef.current || transferFingerprintRef.current!==fingerprint) {
      transferKeyRef.current=crypto.randomUUID();
      transferFingerprintRef.current=fingerprint;
    }
    const saved = await performWorkflowAction({...payload,idempotencyKey:transferKeyRef.current},'Transfer draft created.');
    if(saved) {
      transferKeyRef.current='';
      transferFingerprintRef.current='';
      setTransferQuantity('');
    }
  }

  async function submitCycleCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {action:'create-cycle-count',warehouseId:cycleWarehouseId,productId:cycleProductId,dueOn:cycleDueOn};
    const fingerprint = JSON.stringify(payload);
    if(!cycleKeyRef.current || cycleFingerprintRef.current!==fingerprint) {
      cycleKeyRef.current=crypto.randomUUID();
      cycleFingerprintRef.current=fingerprint;
    }
    const saved = await performWorkflowAction({...payload,idempotencyKey:cycleKeyRef.current},'Cycle count scheduled.');
    if(saved) {
      cycleKeyRef.current='';
      cycleFingerprintRef.current='';
      setCycleDueOn('');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    const movementPayload = { action:'record-movement',productId,warehouseId,movementType,quantity,reference };
    const fingerprint = JSON.stringify(movementPayload);
    if(!keyRef.current || payloadFingerprintRef.current !== fingerprint) {
      keyRef.current=crypto.randomUUID();
      payloadFingerprintRef.current=fingerprint;
    }
    try {
      const response=await fetch('/api/apps/inventory',{
        method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({...movementPayload,idempotencyKey:keyRef.current}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||payload?.success!==true) throw new Error(payload?.error||'Stock movement was not recorded.');
      keyRef.current='';payloadFingerprintRef.current='';setQuantity('');setReference('');
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

    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <section className={card} aria-labelledby="inventory-transfers-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="inventory-transfers-heading" className="text-base font-semibold text-slate-950 dark:text-white">Warehouse transfers</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">{data?.transferOrders.length ?? 0} recent</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Transfers reduce source stock on shipment and increase destination stock on receipt.</p>
        <form onSubmit={submitTransfer} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">From
              <select required value={transferSourceId} onChange={e=>setTransferSourceId(e.target.value)} className={field}>
                {(data?.warehouses||[]).map(w=><option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">To
              <select required value={transferDestinationId} onChange={e=>setTransferDestinationId(e.target.value)} className={field}>
                {(data?.warehouses||[]).map(w=><option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Product
              <select required value={transferProductId} onChange={e=>setTransferProductId(e.target.value)} className={field} disabled={!data?.products.length}>
                {(data?.products||[]).map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' · '+p.sku:''}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Quantity
              <input required inputMode="decimal" pattern="\d+(\.\d{1,4})?" value={transferQuantity} onChange={e=>setTransferQuantity(e.target.value)} placeholder="Quantity to move" className={field}/>
            </label>
          </div>
          <button type="submit" disabled={saving||loading||!transferSourceId||!transferDestinationId||transferSourceId===transferDestinationId||!transferProductId||!transferQuantity||!data?.warehouses || data.warehouses.length<2} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">Create transfer</button>
        </form>
        <div className="mt-4 space-y-3">
          {(data?.transferOrders||[]).map(order=><div key={order.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-semibold text-slate-950 dark:text-white">{order.transferNumber}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{order.sourceWarehouseName} → {order.destinationWarehouseName}</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{order.status.replaceAll('_',' ')}</span>
            </div>
            <div className="mt-2 space-y-1">{order.lines.map(line=><p key={line.id} className="text-xs text-slate-700 dark:text-slate-300">{line.productName}: {line.requestedQuantity} requested · {line.shippedQuantity} shipped · {line.receivedQuantity} received</p>)}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {order.status==='draft'?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'approve-transfer',transferId:order.id},'Transfer approved.')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">Approve</button>:null}
              {order.status==='approved'?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'ship-transfer',transferId:order.id},'Transfer shipped; source stock has been reduced.')} className="min-h-9 rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">Ship transfer</button>:null}
              {order.status==='in_transit'?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'receive-transfer',transferId:order.id},'Transfer received; destination stock has been updated.')} className="min-h-9 rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">Receive transfer</button>:null}
              {order.status==='draft'||order.status==='approved'?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'cancel-transfer',transferId:order.id},'Transfer cancelled.')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40">Cancel</button>:null}
            </div>
          </div>)}
          {!loading&&!data?.transferOrders.length?<p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No warehouse transfers yet.</p>:null}
        </div>
      </section>

      <section className={card} aria-labelledby="inventory-cycle-counts-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="inventory-cycle-counts-heading" className="text-base font-semibold text-slate-950 dark:text-white">Cycle counts</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">{data?.cycleCounts.length ?? 0} recent</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Record a physical quantity, then post its variance as a controlled stock adjustment.</p>
        <form onSubmit={submitCycleCount} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">Warehouse
              <select required value={cycleWarehouseId} onChange={e=>setCycleWarehouseId(e.target.value)} className={field}>{(data?.warehouses||[]).map(w=><option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}</select>
            </label>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">Product
              <select required value={cycleProductId} onChange={e=>setCycleProductId(e.target.value)} className={field}>{(data?.products||[]).map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' · '+p.sku:''}</option>)}</select>
            </label>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100 sm:col-span-2">Due date
              <input required type="date" value={cycleDueOn} onChange={e=>setCycleDueOn(e.target.value)} className={field}/>
            </label>
          </div>
          <button type="submit" disabled={saving||loading||!cycleWarehouseId||!cycleProductId||!cycleDueOn} className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">Schedule cycle count</button>
        </form>
        <div className="mt-4 space-y-3">
          {(data?.cycleCounts||[]).map(count=><div key={count.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-950 dark:text-white">{count.productName}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{count.warehouseName} · due {count.dueOn}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{count.status.replaceAll('_',' ')}</span></div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">System quantity: {count.systemQuantity??'Not recorded'} · Physical count: {count.countedQuantity??'Not counted'}</p>
            {count.status==='pending'||count.status==='in_progress'?<form onSubmit={event=>{event.preventDefault();void performWorkflowAction({action:'record-cycle-count',cycleCountId:count.id,countedQuantity:countValues[count.id]??''},'Physical count recorded. Review and post the variance when ready.');}} className="mt-3 flex flex-wrap gap-2">
              <input required inputMode="decimal" pattern="\d+(\.\d{1,4})?" value={countValues[count.id]??''} onChange={e=>setCountValues(current=>({...current,[count.id]:e.target.value}))} placeholder="Physical quantity" className={field+' min-w-[150px] flex-1'}/>
              <button type="submit" disabled={saving} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">Record count</button>
            </form>:null}
            <div className="mt-3 flex flex-wrap gap-2">
              {count.status==='counted'?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'post-cycle-count',cycleCountId:count.id},'Cycle-count variance posted to the stock ledger.')} className="min-h-9 rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400">Post variance</button>:null}
              {['pending','in_progress','counted'].includes(count.status)?<button type="button" disabled={saving} onClick={()=>void performWorkflowAction({action:'cancel-cycle-count',cycleCountId:count.id},'Cycle count cancelled.')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40">Cancel count</button>:null}
            </div>
          </div>)}
          {!loading&&!data?.cycleCounts.length?<p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No cycle counts scheduled yet.</p>:null}
        </div>
      </section>
    </div>

  </section>;
}
