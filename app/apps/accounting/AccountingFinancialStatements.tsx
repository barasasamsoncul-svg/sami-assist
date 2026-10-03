'use client';

import { CheckCircle2,FileCheck2,RefreshCcw,Scale,TrendingUp,WalletCards } from 'lucide-react';
import Link from 'next/link';
import { useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingFinancialStatementsWorkspace,FinancialStatementLine } from '@/lib/apps/accounting/financial-statements';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

type Tab='profit_loss'|'balance_sheet'|'cash_flow'|'changes_equity';

function StatementRows({
  lines,
  currency,
  from,
  to,
}:{
  lines:FinancialStatementLine[];
  currency:string;
  from:string;
  to:string;
}) {
  return (
    <tbody>
      {lines.map(line=>(
        <tr key={line.key}>
          <td>
            {line.accountId ? (
              <Link href={'/apps/accounting/general-ledger?'+new URLSearchParams({from,to,accountId:line.accountId}).toString()}>
                {line.label}
              </Link>
            ) : (
              <span>{line.label}</span>
            )}
          </td>
          <td className={styles.number}><strong={line.emphasis==='total'}>{formatAccountingAmount(line.current,currency)}</strong></td>
          <td className={styles.number}><strong={line.emphasis==='total'}>{formatAccountingAmount(line.comparative,currency)}</strong></td>
        </tr>
      ))}
    </tbody>
  );
}

export default function AccountingFinancialStatements({
  data,
  canCreate,
  canEdit,
}:{
  data:AccountingFinancialStatementsWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [tab,setTab]=useState<Tab>('profit_loss');
  const [busy,setBusy]=useState('');
  const {filters,currency}=data;

  const money=(value:string)=>formatAccountingAmount(value,currency);

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/financial-statements',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Financial statement action failed.');
    return payload.result as Record<string,unknown>;
  }

  async function generateSnapshot() {
    setBusy('generate');
    try {
      await post({
        action:'generate-snapshot',
        requestKey:crypto.randomUUID(),
        from:filters.from,
        to:filters.to,
        compareFrom:filters.compareFrom,
        compareTo:filters.compareTo,
      });
      showSuccess('Statement snapshot generated','The current comparative statements were captured as immutable reporting evidence.');
      router.refresh();
    } catch (error) {
      showError('Snapshot failed',error instanceof Error?error.message:'Retry the snapshot.');
    } finally {
      setBusy('');
    }
  }

  function finalizeSnapshot(snapshotId:unknown) {
    confirmAction({
      title:'Finalize this financial statement snapshot?',
      message:'Finalization locks this generated snapshot as reporting evidence. A later period should be captured as a new snapshot.',
      confirmLabel:'Finalize snapshot',
      onConfirm:()=>{
        void (async()=>{
          setBusy('finalize');
          try {
            await post({action:'finalize-snapshot',snapshotId});
            showSuccess('Snapshot finalized','The financial statement snapshot is now locked.');
            router.refresh();
          } catch (error) {
            showError('Finalization failed',error instanceof Error?error.message:'Retry the finalization.');
          } finally {
            setBusy('');
          }
        })();
      },
    });
  }

  const pnl=data.profitLoss;
  const bs=data.balanceSheet;
  const pAndLLines:FinancialStatementLine[]=[];
  for (const section of pnl.sections) {
    pAndLLines.push(...section.lines);
    pAndLLines.push({
      key:section.key+':total',
      label:'Total '+section.label,
      current:section.current,
      comparative:section.comparative,
      emphasis:'subtotal',
    });
  }
  pAndLLines.push(
    {key:'gross_profit',label:'Gross profit',current:pnl.grossProfit.current,comparative:pnl.grossProfit.comparative,emphasis:'subtotal'},
    {key:'operating_profit',label:'Operating profit',current:pnl.operatingProfit.current,comparative:pnl.operatingProfit.comparative,emphasis:'subtotal'},
    {key:'net_profit',label:'Net profit / (loss)',current:pnl.netProfit.current,comparative:pnl.netProfit.comparative,emphasis:'total'},
  );

  const balanceLines:FinancialStatementLine[]=[];
  for (const section of [...bs.assetSections,...bs.liabilitySections,...bs.equitySections]) {
    balanceLines.push(...section.lines);
    balanceLines.push({
      key:section.key+':total',
      label:'Total '+section.label,
      current:section.current,
      comparative:section.comparative,
      emphasis:'subtotal',
    });
  }
  balanceLines.push(
    {key:'current_earnings',label:'Current earnings',current:bs.currentEarnings.current,comparative:bs.currentEarnings.comparative},
    {key:'total_assets',label:'Total assets',current:bs.totalAssets.current,comparative:bs.totalAssets.comparative,emphasis:'total'},
    {key:'total_liabilities',label:'Total liabilities',current:bs.totalLiabilities.current,comparative:bs.totalLiabilities.comparative,emphasis:'total'},
    {key:'total_equity',label:'Total equity',current:bs.totalEquity.current,comparative:bs.totalEquity.comparative,emphasis:'total'},
  );

  const tabLines:Record<Tab,FinancialStatementLine[]>={
    profit_loss:pAndLLines,
    balance_sheet:balanceLines,
    cash_flow:data.cashFlow.lines,
    changes_equity:data.changesInEquity.lines,
  };

  const titles:Record<Tab,string>={
    profit_loss:'Profit & Loss',
    balance_sheet:'Balance Sheet',
    cash_flow:'Cash Flow',
    changes_equity:'Changes in Equity',
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Financial Statements</div>
          <h2>Financial statements</h2>
          <p>
            Posted-ledger statements for the selected company, with a prior-period comparison and direct drill-down to the General Ledger.
          </p>
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={!canCreate||busy==='generate'} onClick={()=>void generateSnapshot()}>
            <FileCheck2 size={16}/>{busy==='generate'?'Generating…':'Capture snapshot'}
          </button>
        </div>
      </div>

      <form method="get" className={styles.filters}>
        <label>Current from<input type="date" name="from" defaultValue={filters.from} required/></label>
        <label>Current to<input type="date" name="to" defaultValue={filters.to} required/></label>
        <label>Compare from<input type="date" name="compareFrom" defaultValue={filters.compareFrom}/></label>
        <label>Compare to<input type="date" name="compareTo" defaultValue={filters.compareTo}/></label>
        <button className={styles.button}><RefreshCcw size={15}/>Apply periods</button>
      </form>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}><span>Net profit / loss</span><strong>{money(pnl.netProfit.current)}</strong><small>{filters.from} → {filters.to}</small></div>
        <div className={styles.financeCard}><span>Total assets</span><strong>{money(bs.totalAssets.current)}</strong><small>As at {filters.to}</small></div>
        <div className={styles.financeCard}><span>Total liabilities</span><strong>{money(bs.totalLiabilities.current)}</strong><small>As at {filters.to}</small></div>
        <div className={styles.financeCard}><span>Total equity</span><strong>{money(bs.totalEquity.current)}</strong><small>Includes current earnings</small></div>
      </section>

      <section className={styles.healthGrid}>
        <div><span>Balance Sheet check</span><strong>{bs.balanceCheck.current==='0.00'?'Balanced':'Review'}</strong><small>Difference {money(bs.balanceCheck.current)}</small></div>
        <div><span>Cash Flow check</span><strong>{data.cashFlow.reconciled.current?'Reconciled':'Review'}</strong><small>Opening cash + movement = closing cash</small></div>
        <div><span>Comparison</span><strong>{filters.compareFrom}</strong><small>to {filters.compareTo}</small></div>
        <div><span>Method</span><strong>Indirect cash flow</strong><small>Working-capital and financing movements</small></div>
      </section>

      <div className={styles.actions}>
        {(Object.keys(titles) as Tab[]).map(key=>(
          <button key={key} type="button" className={tab===key?styles.primary:styles.button} onClick={()=>setTab(key)}>
            {key==='profit_loss'?<TrendingUp size={15}/>:key==='balance_sheet'?<Scale size={15}/>:key==='cash_flow'?<WalletCards size={15}/>:<CheckCircle2 size={15}/>}
            {titles[key]}
          </button>
        ))}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><span className={styles.eyebrow}>Comparative statement</span><h3>{titles[tab]}</h3></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Line</th><th className={styles.number}>{filters.from} → {filters.to}</th><th className={styles.number}>{filters.compareFrom} → {filters.compareTo}</th></tr></thead>
            <StatementRows lines={tabLines[tab]} currency={currency} from={filters.from} to={filters.to}/>
          </table>
        </div>
        {tab==='cash_flow' ? (
          <p className={styles.muted}>
            The indirect Cash Flow reconciles ledger cash movement. The “Other cash / non-cash classification adjustment” line makes unmapped non-cash effects visible instead of hiding them.
          </p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Audit evidence</span><h3>Saved statement snapshots</h3></div></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Period</th><th>Comparison</th><th>Currency</th><th>Status</th><th>Control</th></tr></thead>
            <tbody>
              {data.snapshots.map(row=>(
                <tr key={String(row.id)}>
                  <td>{String(row.period_start)} → {String(row.period_end)}</td>
                  <td>{String(row.comparative_start||'—')} → {String(row.comparative_end||'—')}</td>
                  <td>{String(row.currency)}</td>
                  <td><span className={styles.badge}>{String(row.status)}</span></td>
                  <td>{row.status==='generated' ? <button type="button" className={styles.button} disabled={!canEdit||busy==='finalize'} onClick={()=>finalizeSnapshot(row.id)}>Finalize</button> : 'Locked'}</td>
                </tr>
              ))}
              {!data.snapshots.length ? <tr><td colSpan={5}>No saved financial statement snapshots yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
