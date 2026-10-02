'use client';

import {
  CalendarClock,
  CheckCircle2,
  Plus,
  RefreshCcw,
  Save,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import type { AccountingBudgetsWorkspace } from '@/lib/apps/accounting/budgets';
import { formatAccountingAmount } from '@/lib/apps/accounting/validation';

import styles from './AccountingFoundation.module.css';

function today() {
  return new Date().toISOString().slice(0,10);
}

function yearBounds(value: string) {
  const year = value.slice(0,4);
  return {
    start: year + '-01-01',
    end: year + '-12-31',
  };
}

function monthStarts(start: string, end: string) {
  const items: string[] = [];
  const cursor = new Date(start + 'T00:00:00.000Z');
  const last = new Date(end + 'T00:00:00.000Z');
  while (cursor <= last && items.length < 60) {
    items.push(cursor.toISOString().slice(0,7) + '-01');
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return items;
}

function label(value: unknown) {
  return String(value || '').replaceAll('_',' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function AccountingBudgets({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingBudgetsWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const {
    overlay,
    showSuccess,
    showError,
    confirmAction,
    closeOverlay,
  } = useSaMiOverlay();
  const [busy,setBusy] = useState('');
  const bounds = yearBounds(data.today || today());
  const settingsRow = data.settings as Record<string, unknown>;

  const [settings,setSettings] = useState({
    enabled: settingsRow.enabled !== false,
    defaultHorizonMonths: Number(settingsRow.default_horizon_months || 12),
    rollingForecastMonths: Number(settingsRow.rolling_forecast_months || 12),
    varianceAlertPercent: String(settingsRow.variance_alert_percent || '10'),
  });

  const [plan,setPlan] = useState({
    name: 'Annual operating budget ' + bounds.start.slice(0,4),
    startDate: bounds.start,
    endDate: bounds.end,
    scenario: 'base',
    notes: '',
  });

  const draftVersion =
    data.versions.find(row => String(row.status) === 'draft' && String(row.version_type) === 'budget') ||
    data.versions.find(row => String(row.status) === 'draft') ||
    null;

  const publishedBudget =
    data.publishedBudget as Record<string, unknown> | null;

  const editableInitial = useMemo(
    () =>
      draftVersion
        ? data.lines
            .filter(row =>
              String(row.version_id) === String(draftVersion.id) &&
              String(row.line_kind) === 'planned' &&
              !row.deleted_at
            )
            .map(row => ({
              accountId: String(row.account_id),
              periodStart: String(row.period_start).slice(0,10),
              amount: String(row.amount),
              notes: String(row.notes || ''),
            }))
        : [],
    [data.lines,draftVersion],
  );

  const [editableLines,setEditableLines] = useState(editableInitial);
  const months = draftVersion
    ? monthStarts(
        String(data.plans.find(row => String(row.id) === String(draftVersion.plan_id))?.fiscal_year_start || bounds.start).slice(0,10),
        String(data.plans.find(row => String(row.id) === String(draftVersion.plan_id))?.fiscal_year_end || bounds.end).slice(0,10),
      )
    : [];
  const [lineDraft,setLineDraft] = useState({
    accountId: data.accounts[0] ? String(data.accounts[0].id) : '',
    periodStart: months[0] || bounds.start,
    amount: '',
    notes: '',
  });

  const [assumption,setAssumption] = useState({
    name: 'Revenue / cost growth',
    assumptionType: 'growth_percent',
    value: '0',
    accountId: '',
    effectiveFrom: '',
    effectiveTo: '',
    notes: '',
  });

  const [forecast,setForecast] = useState({
    asOfDate: data.today || today(),
    scenario: 'base',
    growthPercent: '0',
  });

  const money = (value: unknown) =>
    formatAccountingAmount(String(value || '0.00'), data.currency);

  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/apps/accounting/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Budget or forecast action failed.');
    }
    return payload.result as Record<string, unknown>;
  }

  async function run(
    key: string,
    body: Record<string, unknown>,
    title: string,
    message: (result: Record<string, unknown>) => string,
  ) {
    setBusy(key);
    try {
      const result = await request(body);
      showSuccess(title,message(result));
      router.refresh();
      return result;
    } catch (error) {
      showError(title + ' failed', error instanceof Error ? error.message : 'Retry this action.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    await run(
      'settings',
      {
        action: 'save-settings',
        expectedCompanyId: data.companyId,
        ...settings,
      },
      'Budget settings saved',
      () => 'Planning horizon, rolling forecast horizon and variance alert policy were updated.',
    );
  }

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    const result = await run(
      'plan',
      {
        action: 'create-plan',
        requestKey: crypto.randomUUID(),
        ...plan,
      },
      'Budget plan created',
      created => String(created.months || 0) + ' monthly planning periods are ready.',
    );
    if (result) setPlan(current => ({...current,notes:''}));
  }

  function addLine(event: FormEvent) {
    event.preventDefault();
    if (!lineDraft.accountId || !lineDraft.periodStart || lineDraft.amount === '') return;
    setEditableLines(current => {
      const key = lineDraft.accountId + '|' + lineDraft.periodStart;
      const next = current.filter(row => row.accountId + '|' + row.periodStart !== key);
      next.push({...lineDraft});
      return next.sort((a,b) => a.periodStart.localeCompare(b.periodStart) || a.accountId.localeCompare(b.accountId));
    });
    setLineDraft(current => ({...current,amount:'',notes:''}));
  }

  async function saveLines() {
    if (!draftVersion || !canEdit) return;
    await run(
      'lines',
      {
        action: 'save-lines',
        versionId: draftVersion.id,
        lines: editableLines,
      },
      'Budget grid saved',
      result => String(result.saved || 0) + ' monthly account line(s) are stored in this draft version.',
    );
  }

  async function saveAssumption(event: FormEvent) {
    event.preventDefault();
    if (!draftVersion || !canEdit) return;
    await run(
      'assumption',
      {
        action: 'save-assumption',
        versionId: draftVersion.id,
        ...assumption,
      },
      'Assumption saved',
      () => 'The forecast assumption is attached to the draft planning version.',
    );
  }

  function approve(version: Record<string, unknown>) {
    confirmAction({
      title: 'Approve this planning version?',
      message: 'Approval freezes editing. Create a revision if figures need to change later.',
      confirmLabel: 'Approve',
      onConfirm: () => {
        void run(
          'approve-' + String(version.id),
          { action:'approve-version',versionId:version.id },
          'Planning version approved',
          () => 'The version is approved and ready for controlled publication.',
        );
      },
    });
  }

  function publish(version: Record<string, unknown>) {
    confirmAction({
      title: 'Publish this planning version?',
      message: 'SaMi will make this the current published version for its plan, type and scenario. The previous published version is superseded, not deleted.',
      confirmLabel: 'Publish',
      onConfirm: () => {
        void run(
          'publish-' + String(version.id),
          { action:'publish-version',versionId:version.id },
          'Planning version published',
          () => 'The published baseline changed without altering any posted ledger journal.',
        );
      },
    });
  }

  async function revise(version: Record<string, unknown>) {
    await run(
      'revise-' + String(version.id),
      {
        action:'create-revision',
        sourceVersionId:version.id,
        requestKey:crypto.randomUUID(),
        notes:'Revision created from ' + String(version.name || 'planning version'),
      },
      'Draft revision created',
      result => 'Version ' + String(result.versionNumber || '') + ' was cloned with its lines and assumptions.',
    );
  }

  async function generateForecast(event: FormEvent) {
    event.preventDefault();
    if (!publishedBudget || !canCreate) return;
    await run(
      'forecast',
      {
        action:'generate-forecast',
        sourceVersionId:publishedBudget.id,
        requestKey:crypto.randomUUID(),
        ...forecast,
      },
      'Rolling forecast generated',
      result =>
        String(result.actualCount || 0) + ' actual period line(s) locked and ' +
        String(result.forecastCount || 0) + ' future forecast line(s) generated.',
    );
  }

  async function snapshot(version: Record<string, unknown>) {
    await run(
      'snapshot-' + String(version.id),
      {
        action:'variance-snapshot',
        versionId:version.id,
        asOfDate:data.today,
      },
      'Variance snapshot created',
      result => String(result.lines || 0) + ' planning lines snapshotted; ' + String(result.alerts || 0) + ' breach the configured variance threshold.',
    );
  }

  const currentPlan = data.currentPlan as Record<string, unknown> | null;
  const alertThreshold = Number(settingsRow.variance_alert_percent || 10);

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · Budgets & Forecasts</div>
          <h2>Planning, rolling forecasts and variance control</h2>
          <p>
            Build versioned monthly budgets, lock actuals into rolling forecasts, publish controlled scenarios and compare plans to the authoritative posted ledger without creating artificial journals.
          </p>
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Published budget</span>
          <strong>{money(data.metrics.current_budget)}</strong>
          <small>{data.metrics.published_versions} published planning version(s)</small>
        </div>
        <div className={styles.financeCard}>
          <span>Published forecast</span>
          <strong>{money(data.metrics.current_forecast)}</strong>
          <small>Actuals + latest future outlook</small>
        </div>
        <div className={styles.financeCard}>
          <span>Actuals to date</span>
          <strong>{money(data.metrics.current_actual)}</strong>
          <small>Posted income and expense ledger movement</small>
        </div>
        <div className={styles.financeCard}>
          <span>Variance alerts</span>
          <strong>{data.metrics.variance_alerts}</strong>
          <small>Absolute variance ≥ {alertThreshold}%</small>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Company policy</span>
            <h3>Planning defaults</h3>
          </div>
          <ShieldCheck size={20}/>
        </div>
        <form className={styles.inlineForm} onSubmit={saveSettings}>
          <label>
            Enabled
            <select
              value={settings.enabled ? 'yes' : 'no'}
              onChange={event => setSettings(current => ({...current,enabled:event.target.value === 'yes'}))}
            >
              <option value="yes">Enabled</option>
              <option value="no">Disabled</option>
            </select>
          </label>
          <label>
            Default horizon
            <input type="number" min="1" max="60" value={settings.defaultHorizonMonths}
              onChange={event => setSettings(current => ({...current,defaultHorizonMonths:Number(event.target.value)}))}/>
          </label>
          <label>
            Rolling forecast months
            <input type="number" min="1" max="60" value={settings.rollingForecastMonths}
              onChange={event => setSettings(current => ({...current,rollingForecastMonths:Number(event.target.value)}))}/>
          </label>
          <label>
            Variance alert %
            <input value={settings.varianceAlertPercent}
              onChange={event => setSettings(current => ({...current,varianceAlertPercent:event.target.value}))}/>
          </label>
          <button className={styles.primary} disabled={!canEdit || busy === 'settings'}>
            <Save size={15}/> {busy === 'settings' ? 'Saving…' : 'Save policy'}
          </button>
        </form>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Budget lifecycle</span>
              <h3>Create a planning year</h3>
            </div>
            <CalendarClock size={20}/>
          </div>
          <form className={styles.inlineForm} onSubmit={createPlan}>
            <label>
              Plan name
              <input value={plan.name} onChange={event => setPlan(current => ({...current,name:event.target.value}))} required/>
            </label>
            <label>
              Start
              <input type="date" value={plan.startDate} onChange={event => setPlan(current => ({...current,startDate:event.target.value}))} required/>
            </label>
            <label>
              End
              <input type="date" value={plan.endDate} onChange={event => setPlan(current => ({...current,endDate:event.target.value}))} required/>
            </label>
            <label>
              Scenario
              <select value={plan.scenario} onChange={event => setPlan(current => ({...current,scenario:event.target.value}))}>
                <option value="base">Base</option>
                <option value="upside">Upside</option>
                <option value="downside">Downside</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Notes
              <input value={plan.notes} onChange={event => setPlan(current => ({...current,notes:event.target.value}))}/>
            </label>
            <button className={styles.primary} disabled={!canCreate || busy === 'plan'}>
              <Plus size={15}/> {busy === 'plan' ? 'Creating…' : 'Create budget plan'}
            </button>
          </form>
          <div className={styles.notice}>
            Part 22 plans income and expense accounts by month. Project, department and other analytic dimensions are deliberately reserved for Accounting Part 23.
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Rolling outlook</span>
              <h3>Generate forecast</h3>
            </div>
            <TrendingUp size={20}/>
          </div>
          <form className={styles.inlineForm} onSubmit={generateForecast}>
            <label>
              Actuals through
              <input type="date" value={forecast.asOfDate}
                onChange={event => setForecast(current => ({...current,asOfDate:event.target.value}))}/>
            </label>
            <label>
              Scenario
              <select value={forecast.scenario} onChange={event => setForecast(current => ({...current,scenario:event.target.value}))}>
                <option value="base">Base</option>
                <option value="upside">Upside</option>
                <option value="downside">Downside</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Growth vs budget %
              <input value={forecast.growthPercent}
                onChange={event => setForecast(current => ({...current,growthPercent:event.target.value}))}/>
            </label>
            <button className={styles.primary} disabled={!canCreate || !publishedBudget || busy === 'forecast'}>
              <RefreshCcw size={15}/> {busy === 'forecast' ? 'Generating…' : 'Generate rolling forecast'}
            </button>
          </form>
          <p>
            Published budget required. Closed months use posted ledger actuals; future monthly lines are generated from the baseline with the selected growth assumption.
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Monthly budget grid</span>
            <h3>{draftVersion ? String(draftVersion.name) : 'No editable budget draft'}</h3>
          </div>
          <Scale size={20}/>
        </div>
        {draftVersion ? (
          <>
            <form className={styles.inlineForm} onSubmit={addLine}>
              <label>
                Account
                <select value={lineDraft.accountId}
                  onChange={event => setLineDraft(current => ({...current,accountId:event.target.value}))}>
                  {data.accounts.map(account => (
                    <option key={String(account.id)} value={String(account.id)}>
                      {String(account.code)} · {String(account.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Month
                <select value={lineDraft.periodStart}
                  onChange={event => setLineDraft(current => ({...current,periodStart:event.target.value}))}>
                  {months.map(month => <option key={month} value={month}>{month.slice(0,7)}</option>)}
                </select>
              </label>
              <label>
                Planned amount
                <input value={lineDraft.amount}
                  onChange={event => setLineDraft(current => ({...current,amount:event.target.value}))}
                  placeholder="0.00" required/>
              </label>
              <label>
                Note
                <input value={lineDraft.notes}
                  onChange={event => setLineDraft(current => ({...current,notes:event.target.value}))}/>
              </label>
              <button className={styles.button}><Plus size={15}/> Add / update line</button>
            </form>

            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr><th>Month</th><th>Account</th><th>Type</th><th className={styles.number}>Amount</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {editableLines.map(row => {
                    const account = data.accounts.find(item => String(item.id) === row.accountId);
                    return (
                      <tr key={row.accountId + row.periodStart}>
                        <td>{row.periodStart.slice(0,7)}</td>
                        <td>{String(account?.code || '')} · {String(account?.name || '')}</td>
                        <td><span className={styles.badge}>{label(account?.account_type)}</span></td>
                        <td className={styles.number}>{money(row.amount)}</td>
                        <td>{row.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!editableLines.length ? <div className={styles.empty}>Add monthly account lines, then save the draft grid.</div> : null}
            </div>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => void saveLines()} disabled={!canEdit || busy === 'lines'}>
                <Save size={15}/> {busy === 'lines' ? 'Saving…' : 'Save budget grid'}
              </button>
            </div>

            <form className={styles.inlineForm} onSubmit={saveAssumption}>
              <label>
                Assumption
                <input value={assumption.name} onChange={event => setAssumption(current => ({...current,name:event.target.value}))}/>
              </label>
              <label>
                Type
                <select value={assumption.assumptionType} onChange={event => setAssumption(current => ({...current,assumptionType:event.target.value}))}>
                  <option value="growth_percent">Growth percent</option>
                  <option value="prior_year_growth">Prior-year growth</option>
                  <option value="fixed">Fixed</option>
                  <option value="run_rate">Run rate</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>
                Value
                <input value={assumption.value} onChange={event => setAssumption(current => ({...current,value:event.target.value}))}/>
              </label>
              <label>
                Account (optional)
                <select value={assumption.accountId} onChange={event => setAssumption(current => ({...current,accountId:event.target.value}))}>
                  <option value="">All / narrative</option>
                  {data.accounts.map(account => <option key={String(account.id)} value={String(account.id)}>{String(account.code)} · {String(account.name)}</option>)}
                </select>
              </label>
              <button className={styles.button} disabled={!canEdit || busy === 'assumption'}>Save assumption</button>
            </form>
          </>
        ) : (
          <div className={styles.empty}>Create a new plan or revise a published version to get an editable draft.</div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Controlled versions</span>
            <h3>Budget and forecast register</h3>
          </div>
          <CheckCircle2 size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Scenario</th><th>Status</th><th>As of</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.versions.map(version => (
                <tr key={String(version.id)}>
                  <td>{String(version.name)}</td>
                  <td>{label(version.version_type)}</td>
                  <td>{label(version.scenario)}</td>
                  <td><span className={styles.badge}>{label(version.status)}</span></td>
                  <td>{version.as_of_date ? String(version.as_of_date).slice(0,10) : '—'}</td>
                  <td>
                    <div className={styles.actions}>
                      {String(version.status) === 'draft' ? (
                        <button className={styles.button} onClick={() => approve(version)} disabled={!canEdit}>Approve</button>
                      ) : null}
                      {String(version.status) === 'approved' ? (
                        <button className={styles.primary} onClick={() => publish(version)} disabled={!canEdit}>Publish</button>
                      ) : null}
                      {['approved','published','superseded'].includes(String(version.status)) ? (
                        <button className={styles.button} onClick={() => void revise(version)} disabled={!canCreate}>Revise</button>
                      ) : null}
                      {['approved','published','superseded'].includes(String(version.status)) ? (
                        <button className={styles.button} onClick={() => void snapshot(version)} disabled={!canCreate}>Variance snapshot</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.versions.length ? <div className={styles.empty}>No planning versions yet.</div> : null}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Actual vs budget</span>
            <h3>Current published base-budget variance</h3>
          </div>
          <TrendingUp size={20}/>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>Month</th><th>Account</th><th className={styles.number}>Budget</th><th className={styles.number}>Actual</th><th className={styles.number}>Variance</th><th>Signal</th></tr>
            </thead>
            <tbody>
              {data.currentVariance.slice(0,120).map((row,index) => (
                <tr key={String(row.account_id) + String(row.period_start) + index}>
                  <td>{String(row.period_start).slice(0,7)}</td>
                  <td>{String(row.code)} · {String(row.name)}</td>
                  <td className={styles.number}>{money(row.planned_amount)}</td>
                  <td className={styles.number}>{money(row.actual_amount)}</td>
                  <td className={styles.number}>{money(row.variance_amount)}</td>
                  <td>
                    <span className={styles.badge}>
                      {row.favorable === true ? 'Favorable' : row.favorable === false ? 'Unfavorable' : 'Neutral'}
                      {row.variance_percent !== null && row.variance_percent !== undefined ? ' · ' + Number(row.variance_percent).toFixed(2) + '%' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.currentVariance.length ? <div className={styles.empty}>Publish a base budget to compare monthly planned amounts with posted actuals.</div> : null}
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <span className={styles.eyebrow}>Assumptions</span>
          <h3>Forecast evidence</h3>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
              <tbody>
                {data.assumptions.slice(0,30).map(row => (
                  <tr key={String(row.id)}>
                    <td>{String(row.name)}</td>
                    <td>{label(row.assumption_type)}</td>
                    <td>{String(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={styles.panel}>
          <span className={styles.eyebrow}>Run history</span>
          <h3>Forecast and variance evidence</h3>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Run</th><th>As of</th><th>Status</th><th>Lines</th></tr></thead>
              <tbody>
                {data.runs.slice(0,30).map(row => (
                  <tr key={String(row.id)}>
                    <td>{label(row.run_type)}</td>
                    <td>{String(row.as_of_date).slice(0,10)}</td>
                    <td><span className={styles.badge}>{label(row.status)}</span></td>
                    <td>{String(row.processed_lines)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {currentPlan && String(currentPlan.status) === 'open' ? (
        <section className={styles.notice}>
          <strong>Plan close control.</strong> Closing prevents new revisions. SaMi requires every draft or approved version to be resolved first so planning history is not stranded.
        </section>
      ) : null}

      <SaMiOverlay overlay={overlay} onClose={closeOverlay}/>
    </div>
  );
}
