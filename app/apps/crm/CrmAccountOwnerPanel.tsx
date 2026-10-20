'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, RefreshCw, Save, UserRound } from 'lucide-react';

type Owner = { id: string; name: string; email: string };
type OwnersPayload = { success?: boolean; error?: string; owners?: Owner[] };
type UpdatePayload = { success?: boolean; error?: string; changed?: boolean };

export default function CrmAccountOwnerPanel({
  accountId,
  currentOwnerId,
  canEdit,
  onSaved,
}: {
  accountId: string;
  currentOwnerId: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState(currentOwnerId || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOwners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/apps/crm/owners', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as OwnersPayload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Account owners could not be loaded.');
      setOwners(Array.isArray(payload.owners) ? payload.owners : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Account owners could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOwners(); }, [loadOwners]);
  useEffect(() => { setSelectedOwnerId(currentOwnerId || ''); }, [currentOwnerId]);

  const saveOwner = useCallback(async () => {
    if (!canEdit || selectedOwnerId === (currentOwnerId || '')) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/accounts/' + encodeURIComponent(accountId) + '/owner', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId: selectedOwnerId || null }),
      });
      const payload = await response.json() as UpdatePayload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'The account owner could not be updated.');
      setNotice(payload.changed ? 'Account owner updated.' : 'This account already has that owner.');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The account owner could not be updated.');
    } finally {
      setSaving(false);
    }
  }, [accountId, canEdit, currentOwnerId, onSaved, selectedOwnerId]);

  const activeCurrentOwner = owners.find((owner) => owner.id === currentOwnerId);
  const selectedOwner = owners.find((owner) => owner.id === (selectedOwnerId || currentOwnerId));

  return (
    <section aria-label="Account owner assignment" className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sami-surface-soft)] text-blue-600"><UserRound className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-black">Account owner</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Assign this account to an active internal workspace member who has access to the current company.</p>
            <p className="mt-2 text-sm font-semibold">{activeCurrentOwner?.name || (currentOwnerId ? 'Existing owner · ' + currentOwnerId.slice(0, 8) : 'Unassigned')}</p>
            {activeCurrentOwner?.email ? <p className="mt-0.5 text-xs text-slate-500">{activeCurrentOwner.email}</p> : null}
          </div>
        </div>
        <button type="button" onClick={() => void loadOwners()} disabled={loading || saving} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold hover:bg-[var(--sami-surface-soft)] disabled:opacity-50"><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh people</button>
      </div>
      {error ? <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"><CircleAlert className="h-4 w-4 shrink-0" />{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-3 py-2 text-xs">{notice}</p> : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Assign owner</span>
          <select
            value={selectedOwnerId}
            onChange={(event) => { setSelectedOwnerId(event.target.value); setNotice(null); }}
            disabled={!canEdit || loading || saving}
            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {currentOwnerId && !owners.some((owner) => owner.id === currentOwnerId) ? <option value={currentOwnerId} disabled>Existing owner · {currentOwnerId.slice(0, 8)} (inactive or unavailable)</option> : null}
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.email ? ' · ' + owner.email : ''}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" onClick={() => void saveOwner()} disabled={!canEdit || loading || saving || selectedOwnerId === (currentOwnerId || '')} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50 sm:w-auto"><Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save owner'}</button>
        </div>
      </div>
      {!canEdit ? <p className="mt-2 text-xs text-slate-500">You have read-only access to account assignment.</p> : null}
      {canEdit && selectedOwner && selectedOwner.id !== currentOwnerId ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500"><Check className="h-3.5 w-3.5" /> Pending change: {selectedOwner.name}</p> : null}
    </section>
  );
}
