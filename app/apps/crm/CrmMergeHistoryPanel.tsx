'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, History, RefreshCw, RotateCcw, UsersRound } from 'lucide-react';

type MergeEntry = {
  id: string;
  type: 'account' | 'contact';
  survivorId: string;
  sourceId: string;
  survivorName: string;
  sourceName: string;
  movedContactCount: number;
  movedInteractionCount: number;
  mergedBy: string;
  mergedAt: string;
  reversedBy: string | null;
  reversedAt: string | null;
  recoverable: boolean;
};
type Payload = { success?: boolean; error?: string; entries?: MergeEntry[]; message?: string };

function count(value: number) {
  return Number(value || 0).toLocaleString('en-KE');
}
function date(value: string | null) {
  if (!value) return 'Unknown date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleString();
}
function userLabel(value: string | null) {
  return value ? value.slice(0, 8) : 'Unknown';
}

export default function CrmMergeHistoryPanel({ canRecover }: { canRecover: boolean }) {
  const [entries, setEntries] = useState<MergeEntry[]>([]);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [recovering, setRecovering] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/apps/crm/merge-history', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Merge history could not be loaded.');
      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Merge history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recover = useCallback(async (entry: MergeEntry) => {
    const key = entry.type + ':' + entry.id;
    if (confirmations[key]?.trim() !== entry.sourceName) {
      setError('Type the exact source record name to confirm recovery.');
      return;
    }
    setRecovering(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/merge-history', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entry.type, historyId: entry.id, confirmSourceName: entry.sourceName }),
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'This merge could not be recovered safely.');
      setNotice(payload.message || 'The original CRM record was restored.');
      setConfirmations((current) => { const next = { ...current }; delete next[key]; return next; });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This merge could not be recovered safely.');
    } finally {
      setRecovering(null);
    }
  }, [confirmations, load]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><History className="h-5 w-5" /><h1 className="text-lg font-black">CRM merge history</h1></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Review account and contact merges, who performed them, and the relationships moved. Recovery is offered only when the original relationship snapshot is complete and the affected records have not changed since the merge.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-sm font-bold disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Refresh</button>
      </header>
      {error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
      {!canRecover ? <div className="rounded-xl border border-[var(--sami-border)] p-3 text-sm text-[var(--sami-muted)]">You have read-only CRM access. History is visible, but recovery requires edit permission for CRM accounts, contacts and interactions.</div> : null}
      {entries.length === 0 && !loading ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center"><History className="mx-auto h-6 w-6 text-[var(--sami-muted)]" /><p className="mt-2 text-sm font-bold">No merge history yet</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Account and contact merges will appear here.</p></div> : null}
      <div className="space-y-3">
        {entries.map((entry) => {
          const key = entry.type + ':' + entry.id;
          const confirmed = confirmations[key]?.trim() === entry.sourceName;
          const state = entry.reversedAt ? 'Recovered' : entry.recoverable ? 'Recovery available' : 'History only';
          return <article key={key} className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide">{entry.type} merge</span>
                  <span className={'rounded-full border px-2.5 py-1 text-[10px] font-bold ' + (entry.reversedAt ? 'border-emerald-300 text-emerald-800' : entry.recoverable ? 'border-blue-300 text-blue-800' : 'border-[var(--sami-border)] text-[var(--sami-muted)]')}>{state}</span>
                </div>
                <h2 className="mt-3 text-sm font-black">{entry.sourceName} <span className="font-normal text-[var(--sami-muted)]">merged into</span> {entry.survivorName}</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--sami-muted)]"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{date(entry.mergedAt)}</span><span>Performed by · {userLabel(entry.mergedBy)}</span><span>Source ID · {String(entry.sourceId).slice(0, 8)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-[var(--sami-border)] px-3 py-2"><UsersRound className="mx-auto h-4 w-4 text-[var(--sami-muted)]" /><p className="mt-1 text-lg font-black">{count(entry.movedContactCount)}</p><p className="text-[10px] text-[var(--sami-muted)]">Contacts moved</p></div>
                <div className="rounded-xl border border-[var(--sami-border)] px-3 py-2"><History className="mx-auto h-4 w-4 text-[var(--sami-muted)]" /><p className="mt-1 text-lg font-black">{count(entry.movedInteractionCount)}</p><p className="text-[10px] text-[var(--sami-muted)]">Interactions moved</p></div>
              </div>
            </div>
            {entry.reversedAt ? <p className="flex items-start gap-2 text-xs text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Recovered {date(entry.reversedAt)} by {userLabel(entry.reversedBy)}. The recovery is also recorded in the merge audit.</p>
              : entry.recoverable && canRecover ? <div className="grid gap-3 border-t border-[var(--sami-border)] pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block"><span className="mb-1.5 block text-xs font-bold">Type the exact source name to confirm recovery: <span className="font-black">{entry.sourceName}</span></span><input value={confirmations[key] || ''} onChange={(event) => setConfirmations((current) => ({ ...current, [key]: event.target.value }))} maxLength={320} disabled={recovering !== null} placeholder="Enter exact source name" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50" /></label>
                <button type="button" onClick={() => void recover(entry)} disabled={!confirmed || recovering !== null} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-400 px-4 text-sm font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-40"><RotateCcw className="h-4 w-4" />{recovering === key ? 'Recovering…' : 'Recover merge'}</button>
              </div>
              : entry.recoverable ? <p className="text-xs text-[var(--sami-muted)]">This merge has a complete snapshot, but your current CRM permissions do not allow recovery.</p>
                : <p className="flex items-start gap-2 text-xs text-[var(--sami-muted)]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Automatic recovery is unavailable because this is a legacy merge or its relationship snapshot is incomplete. The audit record remains available for review.</p>}
          </article>;
        })}
      </div>
      {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading CRM merge history…</p> : null}
    </div>
  );
}
