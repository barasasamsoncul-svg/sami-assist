'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Building2, CircleAlert, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';

type AccountDuplicate = {
  left_id: string;
  right_id: string;
  left_name: string;
  right_name: string;
  left_email: string | null;
  right_email: string | null;
  left_phone: string | null;
  right_phone: string | null;
  left_owner_user_id: string | null;
  right_owner_user_id: string | null;
  left_has_billing_identity: boolean;
  right_has_billing_identity: boolean;
  left_contact_count: number | string;
  right_contact_count: number | string;
  match_reason: string;
};
type ContactDuplicate = {
  left_id: string;
  right_id: string;
  left_first_name: string;
  left_last_name: string;
  right_first_name: string;
  right_last_name: string;
  left_email: string | null;
  right_email: string | null;
  left_phone: string | null;
  right_phone: string | null;
  left_mobile: string | null;
  right_mobile: string | null;
  left_account_id: string | null;
  right_account_id: string | null;
  left_account_name: string | null;
  right_account_name: string | null;
  match_reason: string;
};
type Payload = { success?: boolean; error?: string; accounts?: AccountDuplicate[]; contacts?: ContactDuplicate[] };
type MergePayload = { success?: boolean; error?: string; message?: string; movedContactCount?: number; movedInteractionCount?: number };
type MergeSelection = { survivorId: string; confirmation: string };

function count(value: number | string | null | undefined) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result.toLocaleString('en-KE') : '0';
}
function reason(value: string) {
  if (value === 'shared_email') return 'Same email address';
  if (value === 'shared_phone') return 'Same phone number';
  if (value === 'same_name_same_account') return 'Same contact name in the same account';
  return 'Names match after punctuation is removed';
}
function ownerLabel(value: string | null) {
  return value ? 'Owner · ' + value.slice(0, 8) : 'Unassigned';
}
function pairKey(leftId: string, rightId: string) {
  return leftId + ':' + rightId;
}

export default function CrmDataQualityPanel({ canMerge }: { canMerge: boolean }) {
  const [accounts, setAccounts] = useState<AccountDuplicate[]>([]);
  const [contacts, setContacts] = useState<ContactDuplicate[]>([]);
  const [selections, setSelections] = useState<Record<string, MergeSelection>>({});
  const [loading, setLoading] = useState(true);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/apps/crm/duplicate-candidates', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Duplicate candidates could not be loaded.');
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
      setSelections((current) => {
        const next = { ...current };
        for (const pair of payload.accounts || []) {
          const key = pairKey(pair.left_id, pair.right_id);
          if (!next[key]) next[key] = { survivorId: pair.left_id, confirmation: '' };
        }
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Duplicate candidates could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const chooseSurvivor = useCallback((pair: AccountDuplicate, survivorId: string) => {
    const key = pairKey(pair.left_id, pair.right_id);
    setSelections((current) => ({ ...current, [key]: { survivorId, confirmation: '' } }));
  }, []);

  const merge = useCallback(async (pair: AccountDuplicate) => {
    const key = pairKey(pair.left_id, pair.right_id);
    const selection = selections[key] || { survivorId: pair.left_id, confirmation: '' };
    const survivorId = selection.survivorId;
    const sourceId = survivorId === pair.left_id ? pair.right_id : pair.left_id;
    const sourceName = survivorId === pair.left_id ? pair.right_name : pair.left_name;
    if (selection.confirmation.trim() !== sourceName) {
      setError('Type the exact name of the duplicate account that will be retired.');
      return;
    }
    if (pair.left_has_billing_identity && pair.right_has_billing_identity) {
      setError('This pair is linked to two Invoicing identities. Resolve the billing links before merging.');
      return;
    }

    setMergingKey(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/accounts/merge', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survivorAccountId: survivorId,
          sourceAccountId: sourceId,
          confirmSourceAccountName: sourceName,
        }),
      });
      const payload = await response.json() as MergePayload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'The accounts could not be merged.');
      setNotice((payload.message || 'Accounts merged.') + ' Moved ' + count(payload.movedContactCount) + ' contact(s) and ' + count(payload.movedInteractionCount) + ' interaction(s).');
      setSelections((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The accounts could not be merged.');
    } finally {
      setMergingKey(null);
    }
  }, [load, selections]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">CRM data stewardship</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Data quality</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Review potential duplicate accounts and contacts before taking action. Matches are suggestions, not proof that records represent the same person or business.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || mergingKey !== null} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm font-bold hover:bg-[var(--sami-surface-soft)] disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
          <Link href="/apps/crm/crm_accounts" className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-700"><Building2 className="h-4 w-4" /> Accounts</Link>
        </div>
      </div>

      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 py-3 text-sm">{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)]">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Account pairs flagged</p></div>
          <p className="mt-2 text-2xl font-black tabular-nums">{count(accounts.length)}</p>
          <p className="mt-1 text-xs text-slate-500">Same email, phone, or normalized name.</p>
        </section>
        <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)]">
          <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-blue-600" /><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Contact pairs flagged</p></div>
          <p className="mt-2 text-2xl font-black tabular-nums">{count(contacts.length)}</p>
          <p className="mt-1 text-xs text-slate-500">Same phone or same normalized name within an account.</p>
        </section>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><h2 className="text-sm font-black">Potential duplicate accounts</h2><span className="ml-auto text-xs text-slate-500">Up to 100 pairs</span></div>
        {loading && accounts.length === 0 ? <div aria-busy="true" className="space-y-3">{[1, 2, 3].map((row) => <div key={row} className="h-24 animate-pulse rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)]" />)}</div> : null}
        {!loading && accounts.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-7 text-center"><ShieldCheck className="mx-auto h-6 w-6 text-emerald-600" /><p className="mt-2 text-sm font-bold">No likely duplicate account pairs found</p><p className="mt-1 text-xs text-slate-500">The detector uses exact email or phone matches, and account names after punctuation is normalized.</p></div> : null}
        {accounts.map((pair) => {
          const key = pairKey(pair.left_id, pair.right_id);
          const selection = selections[key] || { survivorId: pair.left_id, confirmation: '' };
          const sourceName = selection.survivorId === pair.left_id ? pair.right_name : pair.left_name;
          const survivorName = selection.survivorId === pair.left_id ? pair.left_name : pair.right_name;
          const billingConflict = pair.left_has_billing_identity && pair.right_has_billing_identity;
          return <article key={key} className="space-y-4 rounded-xl border border-[var(--sami-border)] p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-bold text-slate-600">{reason(pair.match_reason)}</span>{billingConflict ? <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">Billing conflict · merge blocked</span> : null}</div>
            <div className="grid gap-3 lg:grid-cols-2">
              {[{id:pair.left_id,name:pair.left_name,email:pair.left_email,phone:pair.left_phone,contacts:pair.left_contact_count,owner:pair.left_owner_user_id},{id:pair.right_id,name:pair.right_name,email:pair.right_email,phone:pair.right_phone,contacts:pair.right_contact_count,owner:pair.right_owner_user_id}].map((item) => <button type="button" key={item.id} onClick={() => chooseSurvivor(pair,item.id)} disabled={!canMerge || billingConflict || mergingKey !== null} className={'rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ' + (selection.survivorId===item.id?'border-blue-400 bg-blue-50/60':'border-[var(--sami-border)] hover:border-blue-300')}>
                <span className="flex items-start justify-between gap-2"><span className="font-bold">{item.name}</span>{selection.survivorId===item.id?<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-800">Keep</span>:null}</span>
                <span className="mt-2 block break-all text-xs text-slate-500">{item.email || 'No email'} · {item.phone || 'No phone'}</span>
                <span className="mt-1 block text-xs text-slate-500">{count(item.contacts)} contact(s) · {ownerLabel(item.owner)}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Choose as survivor <ArrowRight className="h-3.5 w-3.5" /></span>
              </button>)}
            </div>
            {canMerge ? <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Type the name of the account to retire: <span className="font-black">{sourceName}</span></span><input value={selection.confirmation} onChange={(event) => setSelections((current) => ({...current,[key]:{...selection,confirmation:event.target.value}}))} maxLength={255} disabled={billingConflict || mergingKey!==null} placeholder="Enter exact account name" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50" /></label>
              <button type="button" onClick={() => void merge(pair)} disabled={billingConflict || mergingKey!==null || selection.confirmation.trim()!==sourceName} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-40">{mergingKey===key?'Merging…':'Merge into "'+survivorName+'"'} <ArrowRight className="h-4 w-4" /></button>
            </div> : <p className="text-xs text-slate-500">You have read-only CRM access. Ask a CRM administrator with edit permissions to merge records.</p>}
            {billingConflict ? <p className="text-xs leading-5 text-amber-900">Each record is linked to an Invoicing customer. Keep the identities separate until a billing administrator resolves the links.</p> : null}
          </article>;
        })}
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Potential duplicate contacts</h2><span className="ml-auto text-xs text-slate-500">Up to 100 pairs</span></div>
        {contacts.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--sami-border)] p-6 text-center text-sm text-slate-500">{loading?'Checking contacts…':'No likely duplicate contact pairs found.'}</p> : null}
        <div className="space-y-3">
          {contacts.map((pair) => <article key={pairKey(pair.left_id,pair.right_id)} className="grid gap-3 rounded-xl border border-[var(--sami-border)] p-3 md:grid-cols-2">
            {[{id:pair.left_id,name:[pair.left_first_name,pair.left_last_name].filter(Boolean).join(' '),email:pair.left_email,phone:pair.left_phone||pair.left_mobile,account:pair.left_account_name},{id:pair.right_id,name:[pair.right_first_name,pair.right_last_name].filter(Boolean).join(' '),email:pair.right_email,phone:pair.right_phone||pair.right_mobile,account:pair.right_account_name}].map((person)=><div key={person.id}><p className="text-sm font-bold">{person.name || 'Unnamed contact'}</p><p className="mt-1 break-all text-xs text-slate-500">{person.email || 'No email'} · {person.phone || 'No phone'}</p><p className="mt-1 text-xs text-slate-500">{person.account || 'No linked account'}</p></div>)}
            <div className="md:col-span-2"><span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-bold text-slate-600">{reason(pair.match_reason)}</span><p className="mt-2 text-xs text-slate-500">Contact duplicates are flagged for review only in this increment; no contact rows are merged automatically.</p></div>
          </article>)}
        </div>
      </section>
    </div>
  );
}
