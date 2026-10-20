'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, Search } from 'lucide-react';

type RecordRow = Record<string, unknown>;
function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function CrmAccount360Launcher({ records }: { records: RecordRow[] }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return records.filter((record) => {
      const name = display(record.account_name);
      return !search || name.toLowerCase().includes(search) ||
        display(record.email).toLowerCase().includes(search) ||
        display(record.phone).toLowerCase().includes(search);
    }).slice(0, 12);
  }, [records, query]);

  return (
    <section aria-label="Customer 360 account directory" className="mb-6 space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Customer 360</p>
          <h2 className="mt-1 text-lg font-black tracking-tight">Open an account profile</h2>
          <p className="mt-1 text-sm text-slate-500">Review contacts, relationship history, linked billing identity and matching Sales activity from one page.</p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Search CRM accounts</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Search accounts..." className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center text-sm text-slate-500">
          <Building2 className="mx-auto mb-2 h-5 w-5" />
          {records.length === 0 ? 'Create a CRM account to start a Customer 360 profile.' : 'No accounts match this search.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--sami-border)]">
          <table className="min-w-full divide-y divide-[var(--sami-border)] text-sm">
            <thead className="bg-[var(--sami-surface-soft)] text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3 text-right">Profile</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--sami-border)]">
              {rows.map((record, index) => {
                const id = display(record.id);
                const name = display(record.account_name);
                const available = id !== '—' && name !== '—';
                return (
                  <tr key={id === '—' ? name + '-' + index : id} className="bg-[var(--sami-surface)] hover:bg-[var(--sami-surface-soft)]">
                    <td className="px-4 py-3 font-semibold">{name}</td>
                    <td className="px-4 py-3 text-slate-500">{display(record.lifecycle_stage)}</td>
                    <td className="px-4 py-3 text-slate-500">{display(record.email || record.phone)}</td>
                    <td className="px-4 py-3 text-right">
                      {available ? <Link href={'/apps/crm/accounts/' + encodeURIComponent(id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold hover:border-blue-400 hover:text-blue-700"><span>Open 360</span><ArrowUpRight className="h-3.5 w-3.5" /></Link> : <span className="text-xs text-slate-400">Unavailable</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Use the register below to create or maintain account fields. This table is a shortcut into the full profile.</p>
    </section>
  );
}
