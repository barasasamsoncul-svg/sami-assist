'use client';

import {
  Building2,
  CheckCircle2,
  Link2,
  RefreshCcw,
  RotateCcw,
  Save,
  WalletCards,
} from 'lucide-react';
import { useMemo,useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingPayrollWorkspace } from '@/lib/apps/accounting/payroll';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';

const card='rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 text-[var(--foreground)] shadow-sm';
const input='mt-1 min-h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-blue-500/30';
const button='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--sami-surface-strong)] disabled:cursor-not-allowed disabled:opacity-50';
const primary='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

function today() {
  return new Date().toISOString().slice(0,10);
}

export default function AccountingPayroll({
  data,
  canCreate,
  canEdit,
}:{
  data: AccountingPayrollWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router=useRouter();
  const {overlay,showSuccess,showError,closeOverlay}=useSaMiOverlay();
  const [busy,setBusy]=useState('');
  const s=data.settings as Record<string,unknown>;
  const [settings,setSettings]=useState({
    enabled:s.enabled !== false,
    salaryExpenseAccountId:String(s.salary_expense_account_id || ''),
    netPayableAccountId:String(s.net_payable_account_id || ''),
    deductionsPayableAccountId:String(s.deductions_payable_account_id || ''),
    employerCostExpenseAccountId:String(s.employer_cost_expense_account_id || ''),
    employerCostPayableAccountId:String(s.employer_cost_payable_account_id || ''),
    requireEmployeeDimensionMapping:s.require_employee_dimension_mapping === true,
  });
  const [postingDate,setPostingDate]=useState(today());

  const accountOptions=useMemo(
    ()=>data.accounts.map(row=>({
      id:String(row.id),
      label:String(row.code || '') + (row.code ? ' · ' : '') + String(row.name || ''),
      type:String(row.account_type || ''),
    })),
    [data.accounts],
  );

  const money=(value:unknown)=>formatAccountingAmount(String(value || '0.00'),data.currency);

  async function post(action:string,payload:Record<string,unknown>,success:string) {
    setBusy(action);
    try {
      const response=await fetch('/api/apps/accounting/payroll',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,...payload}),
      });
      const body=await response.json();
      if (!response.ok) throw new Error(body.error || 'The payroll accounting action could not be completed.');
      showSuccess(success,'Accounting has refreshed the active company payroll control view.');
      router.refresh();
      return body.result;
    } catch (error) {
      showError('Payroll Accounting action failed',error instanceof Error ? error.message : 'Retry the same action.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveSettings(event:FormEvent) {
    event.preventDefault();
    await post('save-settings',settings,'Payroll Accounting settings saved');
  }

  return (
    <div className="space-y-5 text-[var(--foreground)]">
      <section className="rounded-3xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Accounting · Payroll Integration
            </div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Payroll-to-ledger control center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">
              Payroll remains the source of approved pay-run calculations. Accounting posts reconciled salary expense, net-pay and deduction liabilities into the authoritative ledger, with optional department and project attribution.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold">
            {data.payrollAvailable
              ? <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 px-3 py-2 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={16}/>Payroll data available</span>
              : <span className="rounded-xl border border-amber-500/30 px-3 py-2 text-amber-600 dark:text-amber-400">Payroll is not installed in this tenant</span>}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={card}><span className="text-xs font-bold text-[var(--sami-muted)]">Approved, unposted</span><strong className="mt-2 block text-2xl">{data.metrics.unpostedApproved}</strong></div>
        <div className={card}><span className="text-xs font-bold text-[var(--sami-muted)]">Posted runs</span><strong className="mt-2 block text-2xl">{data.metrics.postedRuns}</strong></div>
        <div className={card}><span className="text-xs font-bold text-[var(--sami-muted)]">Reversed runs</span><strong className="mt-2 block text-2xl">{data.metrics.reversedRuns}</strong></div>
        <div className={card}><span className="text-xs font-bold text-[var(--sami-muted)]">Employees without dimensions</span><strong className="mt-2 block text-2xl">{data.metrics.unmappedEmployees}</strong></div>
      </section>

      <form onSubmit={saveSettings} className={card}>
        <div className="flex items-center gap-2"><WalletCards size={18}/><h3 className="font-black">Payroll control accounts</h3></div>
        <p className="mt-1 text-sm text-[var(--sami-muted)]">These accounts control the default payroll journal. Component-specific mapping is stored separately for deeper Payroll rules.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['salaryExpenseAccountId','Salary expense','expense'],
            ['netPayableAccountId','Net pay payable','liability'],
            ['deductionsPayableAccountId','Deductions/statutory payable','liability'],
            ['employerCostExpenseAccountId','Employer cost expense','expense'],
            ['employerCostPayableAccountId','Employer cost payable','liability'],
          ].map(([key,label,type])=>(
            <label key={key} className="text-xs font-bold">{label}
              <select
                className={input}
                value={settings[key as keyof typeof settings] as string}
                disabled={!canEdit}
                onChange={event=>setSettings(current=>({...current,[key]:event.target.value}))}
              >
                <option value="">Choose account</option>
                {accountOptions
                  .filter(option=>option.type.includes(type))
                  .map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={settings.enabled} disabled={!canEdit} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/>
            Enable Payroll Accounting
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={settings.requireEmployeeDimensionMapping} disabled={!canEdit} onChange={e=>setSettings({...settings,requireEmployeeDimensionMapping:e.target.checked})}/>
            Require employee dimension mapping before posting
          </label>
          <button className={primary} disabled={!canEdit || busy==='save-settings'}><Save size={16}/>{busy==='save-settings'?'Saving…':'Save settings'}</button>
        </div>
      </form>

      <section className={card}>
        <div className="flex items-center gap-2"><Building2 size={18}/><h3 className="font-black">Payroll employee dimensions</h3></div>
        <p className="mt-1 text-sm text-[var(--sami-muted)]">Map employees to a core Department and/or Accounting project. Salary expense is aggregated by these dimensions during posting; Payroll employee data is never rewritten.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-[var(--sami-muted)]"><tr><th className="pb-2 pr-4">Employee</th><th className="pb-2 pr-4">Department</th><th className="pb-2 pr-4">Project</th><th className="pb-2">Save</th></tr></thead>
            <tbody>
              {data.payrollEmployees.map(row=>(
                <EmployeeDimensionRow
                  key={String(row.payroll_employee_id)}
                  row={row}
                  departments={data.departments}
                  projects={data.projects}
                  disabled={!canEdit || busy==='save-employee-dimension'}
                  onSave={(payload)=>post('save-employee-dimension',payload,'Employee payroll dimension saved')}
                />
              ))}
              {!data.payrollEmployees.length && <tr><td colSpan={4} className="py-5 text-[var(--sami-muted)]">No payroll employees are available for this company.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Link2 size={18}/><h3 className="font-black">Approved payroll runs</h3></div>
            <p className="mt-1 text-sm text-[var(--sami-muted)]">Only approved runs can post. Gross must equal net pay plus deductions, and repeated requests reuse the same journal.</p>
          </div>
          <label className="text-xs font-bold">Posting / reversal date
            <input className={input} type="date" value={postingDate} onChange={e=>setPostingDate(e.target.value)}/>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-[var(--sami-muted)]"><tr><th className="pb-2 pr-4">Run</th><th className="pb-2 pr-4">Period</th><th className="pb-2 pr-4">Gross</th><th className="pb-2 pr-4">Deductions</th><th className="pb-2 pr-4">Net</th><th className="pb-2 pr-4">State</th><th className="pb-2">Control</th></tr></thead>
            <tbody>
              {data.payrollRuns.map(row=>{
                const posted=Boolean(row.posting_id);
                const approved=Boolean(row.approved_at);
                const reversed=row.accounting_status === 'reversed';
                return (
                  <tr key={String(row.id)} className="border-t border-[var(--sami-border)]">
                    <td className="py-3 pr-4 font-bold">{String(row.run_number || row.id)}</td>
                    <td className="py-3 pr-4">{String(row.period_name || '')}<div className="text-xs text-[var(--sami-muted)]">{String(row.period_start || '').slice(0,10)} → {String(row.period_end || '').slice(0,10)}</div></td>
                    <td className="py-3 pr-4">{money(row.total_gross)}</td>
                    <td className="py-3 pr-4">{money(row.total_deductions)}</td>
                    <td className="py-3 pr-4">{money(row.total_net)}</td>
                    <td className="py-3 pr-4">{reversed?'Reversed':posted?'Posted':approved?'Approved':'Not approved'}</td>
                    <td className="py-3">
                      {!posted && approved && (
                        <button
                          type="button"
                          className={primary}
                          disabled={!canCreate || busy==='post-run'}
                          onClick={()=>post('post-run',{payrollRunId:row.id,postingDate,requestKey:crypto.randomUUID()},'Payroll run posted')}
                        ><CheckCircle2 size={15}/>Post</button>
                      )}
                      {posted && !reversed && (
                        <button
                          type="button"
                          className={button}
                          disabled={!canEdit || busy==='reverse-run'}
                          onClick={()=>post('reverse-run',{payrollRunId:row.id,reversalDate:postingDate},'Payroll posting reversed')}
                        ><RotateCcw size={15}/>Reverse</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!data.payrollRuns.length && <tr><td colSpan={7} className="py-5 text-[var(--sami-muted)]">No payroll runs are available for this company.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center gap-2"><RefreshCcw size={18}/><h3 className="font-black">Accounting posting history</h3></div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-[var(--sami-muted)]"><tr><th className="pb-2 pr-4">Journal</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Gross</th><th className="pb-2 pr-4">Net</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {data.postings.map(row=>(
                <tr key={String(row.id)} className="border-t border-[var(--sami-border)]">
                  <td className="py-3 pr-4 font-bold">{String(row.journal_number || row.journal_id)}</td>
                  <td className="py-3 pr-4">{String(row.journal_date || '').slice(0,10)}</td>
                  <td className="py-3 pr-4">{money(row.total_gross)}</td>
                  <td className="py-3 pr-4">{money(row.total_net)}</td>
                  <td className="py-3 font-semibold">{String(row.status)}</td>
                </tr>
              ))}
              {!data.postings.length && <tr><td colSpan={5} className="py-5 text-[var(--sami-muted)]">No payroll journals have been posted yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}

function EmployeeDimensionRow({
  row,
  departments,
  projects,
  disabled,
  onSave,
}:{
  row: Record<string,unknown>;
  departments: Array<Record<string,unknown>>;
  projects: Array<Record<string,unknown>>;
  disabled: boolean;
  onSave: (payload:Record<string,unknown>)=>void;
}) {
  const [departmentId,setDepartmentId]=useState(String(row.department_id || ''));
  const [projectId,setProjectId]=useState(String(row.analytic_project_id || ''));
  return (
    <tr className="border-t border-[var(--sami-border)]">
      <td className="py-3 pr-4 font-bold">{String(row.full_name || row.payroll_number || row.payroll_employee_id)}<div className="text-xs font-normal text-[var(--sami-muted)]">{String(row.payroll_number || '')}</div></td>
      <td className="py-3 pr-4">
        <select className={input} value={departmentId} disabled={disabled} onChange={e=>setDepartmentId(e.target.value)}>
          <option value="">No department</option>
          {departments.filter(item=>item.is_active).map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}
        </select>
      </td>
      <td className="py-3 pr-4">
        <select className={input} value={projectId} disabled={disabled} onChange={e=>setProjectId(e.target.value)}>
          <option value="">No project</option>
          {projects.filter(item=>item.status==='open').map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}
        </select>
      </td>
      <td className="py-3">
        <button
          type="button"
          className={button}
          disabled={disabled || (!departmentId && !projectId)}
          onClick={()=>onSave({payrollEmployeeId:row.payroll_employee_id,departmentId:departmentId||null,projectId:projectId||null})}
        ><Save size={14}/>Save</button>
      </td>
    </tr>
  );
}
