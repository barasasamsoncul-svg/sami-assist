'use client';

import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  FileCheck2,
  RefreshCcw,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type {
  AccountingManagementReportsWorkspace,
} from '@/lib/apps/accounting/management-reporting';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';
import styles from './AccountingFoundation.module.css';

function percent(value:string|null) {
  if (value===null) return '—';
  const number=Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})+'%'
    : '—';
}

function varianceLabel(value:string|null) {
  if (value===null) return 'No comparable base';
  const number=Number(value);
  if (!Number.isFinite(number)) return 'No comparable base';
  return (number>0?'+':'')+percent(value)+' vs comparison';
}

export default function AccountingManagementReports({
  data,
  canCreate,
  canEdit,
}:{
  data:AccountingManagementReportsWorkspace;
  canCreate:boolean;
  canEdit:boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,confirmAction,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const {filters,currency,kpis}=data;
  const money=(value:string)=>formatAccountingAmount(value,currency);

  async function post(body:Record<string,unknown>) {
    const response=await fetch('/api/apps/accounting/management-reporting',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error||'Management reporting action failed.');
    return payload.result as Record<string,unknown>;
  }

  async function captureSnapshot() {
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
      showSuccess(
        'Management report captured',
        'KPIs, trend data and active exceptions were saved as immutable reporting evidence.',
      );
      router.refresh();
    } catch (error) {
      showError(
        'Snapshot failed',
        error instanceof Error?error.message:'Retry the management report snapshot.',
      );
    } finally {
      setBusy('');
    }
  }

  function finalizeSnapshot(snapshotId:unknown) {
    confirmAction({
      title:'Finalize this management report snapshot?',
      message:'Finalization locks this reporting evidence. Later changes should be captured in a new snapshot.',
      confirmLabel:'Finalize snapshot',
      onConfirm:()=>{
        void (async()=>{
          setBusy('finalize');
          try {
            await post({action:'finalize-snapshot',snapshotId});
            showSuccess('Snapshot finalized','The management report snapshot is now locked.');
            router.refresh();
          } catch (error) {
            showError(
              'Finalization failed',
              error instanceof Error?error.message:'Retry the finalization.',
            );
          } finally {
            setBusy('');
          }
        })();
      },
    });
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Management Reporting</div>
          <h2>Management & exception reporting</h2>
          <p>
            Executive financial performance, 12-month movement and the accounting items that need attention now.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={!canCreate||busy==='generate'}
            onClick={()=>void captureSnapshot()}
          >
            <FileCheck2 size={16}/>
            {busy==='generate'?'Capturing…':'Capture report'}
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
        <div className={styles.financeCard}>
          <span>Revenue</span>
          <strong>{money(kpis.revenue.current)}</strong>
          <small>{varianceLabel(kpis.revenue.variancePercent)}</small>
        </div>
        <div className={styles.financeCard}>
          <span>Gross profit</span>
          <strong>{money(kpis.grossProfit.current)}</strong>
          <small>Margin {percent(kpis.grossProfit.marginPercent)}</small>
        </div>
        <div className={styles.financeCard}>
          <span>Net profit / loss</span>
          <strong>{money(kpis.netProfit.current)}</strong>
          <small>Margin {percent(kpis.netProfit.marginPercent)}</small>
        </div>
        <div className={styles.financeCard}>
          <span>Cash available</span>
          <strong>{money(kpis.cash.current)}</strong>
          <small>{varianceLabel(kpis.cash.variancePercent)}</small>
        </div>
      </section>

      <section className={styles.healthGrid}>
        <div>
          <span>Customers owe you</span>
          <strong>{money(kpis.receivables.outstanding)}</strong>
          <small>
            {kpis.receivables.overdueInvoiceCount} overdue · DSO {kpis.receivables.dsoDays??'—'} days
          </small>
        </div>
        <div>
          <span>You owe suppliers</span>
          <strong>{money(kpis.payables.outstanding)}</strong>
          <small>{kpis.payables.overdueBillCount} overdue bills</small>
        </div>
        <div>
          <span>Active exceptions</span>
          <strong>{data.exceptionSummary.total}</strong>
          <small>
            {data.exceptionSummary.high} high · {data.exceptionSummary.medium} medium · {data.exceptionSummary.low} low
          </small>
        </div>
        <div>
          <span>Bank items not reconciled</span>
          <strong>{kpis.controls.unreconciledBankLines}</strong>
          <small>{kpis.controls.budgetVarianceAlerts} budget variance alerts</small>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Performance trend</span>
            <h3>Revenue, expenses and profit · last 12 months</h3>
          </div>
          <BarChart3 size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Month</th>
                <th className={styles.number}>Revenue</th>
                <th className={styles.number}>Expenses</th>
                <th className={styles.number}>Profit / loss</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map(row=>(
                <tr key={row.period}>
                  <td>{row.period}</td>
                  <td className={styles.number}>{money(row.revenue)}</td>
                  <td className={styles.number}>{money(row.expenses)}</td>
                  <td className={styles.number}><strong>{money(row.profit)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Exception control</span>
            <h3>Items that need attention</h3>
          </div>
          <AlertTriangle size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Issue</th>
                <th className={styles.number}>Items</th>
                <th className={styles.number}>Exposure</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.exceptions.map(row=>(
                <tr key={row.key}>
                  <td>
                    <span className={styles.badge}>
                      {row.resolved?'resolved':row.severity}
                    </span>
                  </td>
                  <td>
                    <strong>{row.title}</strong>
                    <div className={styles.muted}>{row.description}</div>
                  </td>
                  <td className={styles.number}>{row.itemCount}</td>
                  <td className={styles.number}>
                    {row.amount&&row.currency?money(row.amount):'—'}
                  </td>
                  <td>
                    <Link className={styles.button} href={row.href}>
                      Review <ArrowUpRight size={14}/>
                    </Link>
                  </td>
                </tr>
              ))}
              {!data.exceptions.length ? (
                <tr>
                  <td colSpan={5}>
                    No active management-report exceptions for the current company.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Reporting evidence</span>
            <h3>Saved management reports</h3>
          </div>
          <TrendingUp size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Period</th>
                <th>Comparison</th>
                <th>Status</th>
                <th>Exceptions</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {data.snapshots.map(row=>{
                const summary=(row.exception_summary_json||{}) as Record<string,unknown>;
                return (
                  <tr key={String(row.id)}>
                    <td>{String(row.period_start)} → {String(row.period_end)}</td>
                    <td>{String(row.comparative_start)} → {String(row.comparative_end)}</td>
                    <td><span className={styles.badge}>{String(row.status)}</span></td>
                    <td>{Number(summary.total||0)}</td>
                    <td>
                      {row.status==='generated' ? (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={!canEdit||busy==='finalize'}
                          onClick={()=>finalizeSnapshot(row.id)}
                        >
                          Finalize
                        </button>
                      ) : 'Locked'}
                    </td>
                  </tr>
                );
              })}
              {!data.snapshots.length ? (
                <tr><td colSpan={5}>No saved management-report snapshots yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Source controls</span>
            <h3>How this report is grounded</h3>
          </div>
          <WalletCards size={20}/>
        </div>
        <p className={styles.muted}>
          KPIs read posted ledger activity and the authoritative receivables, payables, bank reconciliation and planning controls. This page does not rewrite source transactions.
        </p>
        <div className={styles.actions}>
          <Link className={styles.button} href="/apps/accounting/financial-statements">Financial statements</Link>
          <Link className={styles.button} href="/apps/accounting/reconciliation">Reconciliation</Link>
          <Link className={styles.button} href="/apps/accounting/budgets-forecasts">Budgets & forecasts</Link>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
