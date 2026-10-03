'use client';

import {
  Building2,
  FolderKanban,
  GitBranch,
  Plus,
  RefreshCcw,
  Save,
  Scale,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingDimensionsWorkspace } from '@/lib/apps/accounting/dimensions';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';

type AllocationRow = {
  id: number;
  departmentId: string;
  projectId: string;
  percent: string;
};

const card =
  'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 text-[var(--foreground)] shadow-sm';
const input =
  'mt-1 min-h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-blue-500/30';
const button =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-4 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--sami-surface-strong)] disabled:cursor-not-allowed disabled:opacity-50';
const primary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

function numberText(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
}

export default function AccountingDimensions({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingDimensionsWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { overlay, showSuccess, showError, closeOverlay } = useSaMiOverlay();
  const [busy,setBusy] = useState('');
  const settings = data.settings as Record<string, unknown>;
  const [settingsForm,setSettingsForm] = useState({
    enabled: settings.enabled !== false,
    requireDepartmentOnExpense: settings.require_department_on_expense === true,
    requireProjectOnIncome: settings.require_project_on_income === true,
    autoApplyRules: settings.auto_apply_rules !== false,
  });
  const [project,setProject] = useState({
    name: '',
    code: '',
    description: '',
    startsOn: '',
    endsOn: '',
  });
  const [rule,setRule] = useState({
    name: '',
    accountId: '',
    sourceModule: '',
    departmentId: '',
    projectId: '',
    percent: '100',
    priority: '100',
  });
  const [selectedLineId,setSelectedLineId] = useState(
    String(data.recentLines[0]?.journal_line_id || ''),
  );
  const [allocationRows,setAllocationRows] = useState<AllocationRow[]>([
    { id: 1,departmentId:'',projectId:'',percent:'100' },
  ]);
  const [nextAllocationId,setNextAllocationId] = useState(2);
  const [budget,setBudget] = useState({
    versionId: '',
    accountId: '',
    periodStart: '',
    departmentId: '',
    projectId: '',
    amount: '',
    notes: '',
  });

  const selectedLine = useMemo(
    () => data.recentLines.find(row => String(row.journal_line_id) === selectedLineId),
    [data.recentLines,selectedLineId],
  );

  async function post(action: string, payload: Record<string, unknown>, success: string) {
    setBusy(action);
    try {
      const response = await fetch('/api/apps/accounting/dimensions',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,...payload}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The Accounting action could not be completed.');
      showSuccess(success,'The change was saved to the active company and the Accounting view will refresh.');
      router.refresh();
      return body.result;
    } catch (error) {
      showError('Accounting action failed',error instanceof Error ? error.message : 'Retry the same action.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    await post('save-settings',{
      expectedCompanyId:data.companyId,
      ...settingsForm,
    },'Analytic settings saved');
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const result = await post('create-project',project,'Project dimension created');
    if (result) setProject({name:'',code:'',description:'',startsOn:'',endsOn:''});
  }

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    const result = await post('save-rule',{
      ...rule,
      basisPoints: Math.round(Number(rule.percent) * 100),
      priority: Number(rule.priority),
    },'Allocation rule created');
    if (result) setRule({name:'',accountId:'',sourceModule:'',departmentId:'',projectId:'',percent:'100',priority:'100'});
  }

  async function saveAllocation(event: FormEvent) {
    event.preventDefault();
    const allocations = allocationRows.map(row => ({
      departmentId: row.departmentId || null,
      projectId: row.projectId || null,
      basisPoints: Math.round(Number(row.percent) * 100),
    }));
    await post('save-allocation',{
      journalLineId:selectedLineId,
      allocations,
    },'Analytic allocation revised');
  }

  async function saveBudget(event: FormEvent) {
    event.preventDefault();
    const result = await post('save-budget-line',{
      ...budget,
      departmentId: budget.departmentId || null,
      projectId: budget.projectId || null,
    },'Dimensional budget saved');
    if (result) setBudget(current => ({...current,amount:'',notes:''}));
  }

  const allocationTotal = allocationRows.reduce((sum,row) => sum + Number(row.percent || 0),0);
  const money = (value: unknown) => formatAccountingAmount(numberText(value),data.currency);

  return (
    <div className="space-y-5 text-[var(--foreground)]">
      <section className="rounded-3xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Accounting · Project & Departmental
            </div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Analytic accounting control center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">
              Allocate posted income and costs to departments and projects without changing debit/credit integrity. Revisions preserve history, rules can classify future postings automatically, and reports reconcile to the authoritative ledger.
            </p>
          </div>
          <form method="get" className="grid grid-cols-2 gap-2 sm:flex">
            <label className="text-xs font-bold">
              From
              <input className={input} type="date" name="from" defaultValue={data.filters.from}/>
            </label>
            <label className="text-xs font-bold">
              To
              <input className={input} type="date" name="to" defaultValue={data.filters.to}/>
            </label>
            <button className={button} type="submit"><RefreshCcw size={15}/>Apply</button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={card}>
          <span className="text-xs font-bold text-[var(--sami-muted)]">Departments</span>
          <strong className="mt-2 block text-2xl">{data.departments.filter(row => row.is_active).length}</strong>
        </div>
        <div className={card}>
          <span className="text-xs font-bold text-[var(--sami-muted)]">Open projects</span>
          <strong className="mt-2 block text-2xl">{data.projects.filter(row => row.status === 'open').length}</strong>
        </div>
        <div className={card}>
          <span className="text-xs font-bold text-[var(--sami-muted)]">Auto-allocation rules</span>
          <strong className="mt-2 block text-2xl">{data.rules.filter(row => row.enabled).length}</strong>
        </div>
        <div className={card}>
          <span className="text-xs font-bold text-[var(--sami-muted)]">Unassigned P&L</span>
          <strong className="mt-2 block text-xl">{money(data.unassigned.unassigned_amount)}</strong>
          <small className="text-[var(--sami-muted)]">{data.unassigned.line_count} lines need classification</small>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveSettings} className={card}>
          <div className="flex items-center gap-2"><Scale size={18}/><h3 className="font-black">Dimension policy</h3></div>
          <div className="mt-4 grid gap-3">
            {[
              ['enabled','Enable project and departmental accounting'],
              ['autoApplyRules','Apply matching rules to new journal lines'],
              ['requireDepartmentOnExpense','Flag expense lines without a department'],
              ['requireProjectOnIncome','Flag income lines without a project'],
            ].map(([key,label]) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--sami-border)] p-3 text-sm font-semibold">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(settingsForm[key as keyof typeof settingsForm])}
                  disabled={!canEdit}
                  onChange={event => setSettingsForm(current => ({...current,[key]:event.target.checked}))}
                />
              </label>
            ))}
          </div>
          <button className={primary + ' mt-4'} disabled={!canEdit || busy==='save-settings'}>
            <Save size={16}/>{busy==='save-settings'?'Saving…':'Save policy'}
          </button>
        </form>

        <form onSubmit={createProject} className={card}>
          <div className="flex items-center gap-2"><FolderKanban size={18}/><h3 className="font-black">Accounting project</h3></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Name
              <input className={input} required maxLength={255} value={project.name} onChange={e=>setProject({...project,name:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Code
              <input className={input} maxLength={50} value={project.code} onChange={e=>setProject({...project,code:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Start
              <input className={input} type="date" value={project.startsOn} onChange={e=>setProject({...project,startsOn:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">End
              <input className={input} type="date" value={project.endsOn} onChange={e=>setProject({...project,endsOn:e.target.value})}/>
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold">Description
            <textarea className={input} rows={3} maxLength={4000} value={project.description} onChange={e=>setProject({...project,description:e.target.value})}/>
          </label>
          <button className={primary + ' mt-4'} disabled={!canCreate || busy==='create-project'}>
            <Plus size={16}/>{busy==='create-project'?'Creating…':'Create project'}
          </button>
          <p className="mt-3 text-xs leading-5 text-[var(--sami-muted)]">{data.projectsIntegration.message}</p>
          {data.projectsIntegration.status === 'ready' && data.projectsIntegration.available.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.projectsIntegration.available.slice(0,8).map(row => (
                <button
                  key={String(row.id)}
                  type="button"
                  className={button}
                  disabled={!canCreate || busy==='import-project'}
                  onClick={() => post('import-project',{sourceProjectId:row.id},'Projects record linked')}
                >
                  <GitBranch size={14}/>Import {String(row.name)}
                </button>
              ))}
            </div>
          )}
        </form>
      </section>

      <section className={card}>
        <div className="flex items-center gap-2"><GitBranch size={18}/><h3 className="font-black">Journal-line allocation</h3></div>
        <p className="mt-1 text-sm text-[var(--sami-muted)]">
          Split one journal line across up to 20 department/project combinations. The percentages must total exactly 100%.
        </p>
        <form onSubmit={saveAllocation} className="mt-4 space-y-3">
          <label className="block text-xs font-bold">Journal line
            <select className={input} required value={selectedLineId} onChange={e=>setSelectedLineId(e.target.value)}>
              <option value="">Choose a journal line</option>
              {data.recentLines.map(row => (
                <option key={String(row.journal_line_id)} value={String(row.journal_line_id)}>
                  {String(row.journal_date).slice(0,10)} · {row.journal_number} · {row.account_code} {row.account_name} · D {row.debit} / C {row.credit}
                </option>
              ))}
            </select>
          </label>
          {selectedLine && (
            <div className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-muted)] p-3 text-xs">
              Current allocation: {Number(selectedLine.allocated_basis_points || 0)/100}% · {String(selectedLine.status)} · {String(selectedLine.source_module || 'manual')}
            </div>
          )}
          {allocationRows.map((row,index) => (
            <div key={row.id} className="grid gap-2 rounded-xl border border-[var(--sami-border)] p-3 md:grid-cols-[1fr_1fr_140px_auto]">
              <label className="text-xs font-bold">Department
                <select className={input} value={row.departmentId} onChange={e=>setAllocationRows(current=>current.map(item=>item.id===row.id?{...item,departmentId:e.target.value}:item))}>
                  <option value="">No department</option>
                  {data.departments.filter(item=>item.is_active).map(item=><option key={String(item.id)} value={String(item.id)}>{item.code ? String(item.code)+' · ' : ''}{String(item.name)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">Project
                <select className={input} value={row.projectId} onChange={e=>setAllocationRows(current=>current.map(item=>item.id===row.id?{...item,projectId:e.target.value}:item))}>
                  <option value="">No project</option>
                  {data.projects.filter(item=>item.status==='open').map(item=><option key={String(item.id)} value={String(item.id)}>{item.code ? String(item.code)+' · ' : ''}{String(item.name)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold">Percent
                <input className={input} type="number" min="0.01" max="100" step="0.01" required value={row.percent} onChange={e=>setAllocationRows(current=>current.map(item=>item.id===row.id?{...item,percent:e.target.value}:item))}/>
              </label>
              <button type="button" className={button + ' self-end'} disabled={allocationRows.length===1} onClick={()=>setAllocationRows(current=>current.filter(item=>item.id!==row.id))}>
                <Trash2 size={15}/><span className="md:hidden">Remove</span>
              </button>
              <div className="text-xs text-[var(--sami-muted)] md:col-span-4">Allocation {index+1}</div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              disabled={allocationRows.length>=20}
              onClick={()=>{
                setAllocationRows(current=>[...current,{id:nextAllocationId,departmentId:'',projectId:'',percent:'0'}]);
                setNextAllocationId(value=>value+1);
              }}
            ><Plus size={15}/>Add split</button>
            <span className={'text-sm font-black ' + (Math.abs(allocationTotal-100)<0.0001?'text-emerald-600 dark:text-emerald-400':'text-amber-700 dark:text-amber-300')}>
              Total {allocationTotal.toFixed(2)}%
            </span>
            <button className={primary} disabled={!canEdit || !selectedLineId || Math.abs(allocationTotal-100)>=0.0001 || busy==='save-allocation'}>
              <Save size={15}/>{busy==='save-allocation'?'Saving…':'Save allocation revision'}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveRule} className={card}>
          <h3 className="font-black">Automatic allocation rule</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Rule name
              <input className={input} required maxLength={255} value={rule.name} onChange={e=>setRule({...rule,name:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Account
              <select className={input} value={rule.accountId} onChange={e=>setRule({...rule,accountId:e.target.value})}>
                <option value="">Any P&L account</option>
                {data.accounts.map(row=><option key={String(row.id)} value={String(row.id)}>{row.code} · {row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Source module
              <input className={input} maxLength={80} placeholder="Any source, or invoicing / expenses…" value={rule.sourceModule} onChange={e=>setRule({...rule,sourceModule:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Department
              <select className={input} value={rule.departmentId} onChange={e=>setRule({...rule,departmentId:e.target.value})}>
                <option value="">No department</option>
                {data.departments.filter(row=>row.is_active).map(row=><option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Project
              <select className={input} value={rule.projectId} onChange={e=>setRule({...rule,projectId:e.target.value})}>
                <option value="">No project</option>
                {data.projects.filter(row=>row.status==='open').map(row=><option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Allocation %
              <input className={input} type="number" min="0.01" max="100" step="0.01" value={rule.percent} onChange={e=>setRule({...rule,percent:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Priority
              <input className={input} type="number" min="1" max="100000" value={rule.priority} onChange={e=>setRule({...rule,priority:e.target.value})}/>
            </label>
          </div>
          <button className={primary + ' mt-4'} disabled={!canCreate || busy==='save-rule'}><Save size={15}/>Save rule</button>
        </form>

        <form onSubmit={saveBudget} className={card}>
          <h3 className="font-black">Dimension-specific budget</h3>
          <p className="mt-1 text-sm text-[var(--sami-muted)]">Add a project/department slice to an editable Part 22 budget or forecast.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">Draft version
              <select className={input} required value={budget.versionId} onChange={e=>setBudget({...budget,versionId:e.target.value})}>
                <option value="">Choose version</option>
                {data.budgetVersions.filter(row=>row.status==='draft').map(row=><option key={String(row.id)} value={String(row.id)}>{row.plan_name} · {row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Account
              <select className={input} required value={budget.accountId} onChange={e=>setBudget({...budget,accountId:e.target.value})}>
                <option value="">Choose account</option>
                {data.accounts.map(row=><option key={String(row.id)} value={String(row.id)}>{row.code} · {row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Month
              <input className={input} type="date" required value={budget.periodStart} onChange={e=>setBudget({...budget,periodStart:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Amount
              <input className={input} inputMode="decimal" required value={budget.amount} onChange={e=>setBudget({...budget,amount:e.target.value})}/>
            </label>
            <label className="text-xs font-bold">Department
              <select className={input} value={budget.departmentId} onChange={e=>setBudget({...budget,departmentId:e.target.value})}>
                <option value="">No department</option>
                {data.departments.filter(row=>row.is_active).map(row=><option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold">Project
              <select className={input} value={budget.projectId} onChange={e=>setBudget({...budget,projectId:e.target.value})}>
                <option value="">No project</option>
                {data.projects.filter(row=>row.status==='open').map(row=><option key={String(row.id)} value={String(row.id)}>{row.name}</option>)}
              </select>
            </label>
          </div>
          <button className={primary + ' mt-4'} disabled={!canEdit || busy==='save-budget-line'}><Save size={15}/>Save dimension budget</button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {[
          ['Department profitability',data.departmentSummary,Building2],
          ['Project profitability',data.projectSummary,FolderKanban],
        ].map(([title,rows,Icon]) => {
          const reportRows = rows as Array<Record<string, unknown>>;
          const ReportIcon = Icon as typeof Building2;
          return (
            <div className={card} key={String(title)}>
              <div className="flex items-center gap-2"><ReportIcon size={18}/><h3 className="font-black">{String(title)}</h3></div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs text-[var(--sami-muted)]"><tr><th className="pb-2 pr-4">Dimension</th><th className="pb-2 pr-4">Income</th><th className="pb-2 pr-4">Expense</th><th className="pb-2">Net</th></tr></thead>
                  <tbody>
                    {reportRows.map(row=>(
                      <tr key={String(row.dimension_id)} className="border-t border-[var(--sami-border)]">
                        <td className="py-3 pr-4 font-bold">{row.code ? String(row.code)+' · ' : ''}{String(row.name)}</td>
                        <td className="py-3 pr-4">{money(row.income)}</td>
                        <td className="py-3 pr-4">{money(row.expense)}</td>
                        <td className="py-3 font-black">{money(row.net)}</td>
                      </tr>
                    ))}
                    {!reportRows.length && <tr><td colSpan={4} className="py-5 text-[var(--sami-muted)]">No allocated posted P&L activity in this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className={card}>
        <h3 className="font-black">Allocation rules</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-[var(--sami-muted)]"><tr><th className="pb-2 pr-4">Rule</th><th className="pb-2 pr-4">Account/source</th><th className="pb-2 pr-4">Target</th><th className="pb-2">Share</th></tr></thead>
            <tbody>
              {data.rules.map(row=>(
                <tr key={String(row.id)} className="border-t border-[var(--sami-border)]">
                  <td className="py-3 pr-4 font-bold">{row.name}</td>
                  <td className="py-3 pr-4">{row.account_code ? row.account_code+' · '+row.account_name : 'Any account'}{row.source_module ? ' · '+row.source_module : ''}</td>
                  <td className="py-3 pr-4">{row.department_name || '—'}{row.project_name ? ' · '+row.project_name : ''}</td>
                  <td className="py-3">{Number(row.basis_points)/100}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay}/>
    </div>
  );
}
