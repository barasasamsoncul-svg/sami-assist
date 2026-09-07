'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { AppWindow, ArrowLeft, Bell, Bot, Building2, CreditCard, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Plug, ShieldCheck, User, Users } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type UserData = { id: string; email: string; fullName: string; firstName: string; lastName: string; avatarFileId: string | null };
type TenantData = { id: string; name: string; slug: string; status: string } | null;
type MembershipData = { accessLevel: 'owner' | 'admin' | 'member'; isOwner: boolean; isAdmin: boolean; label: string } | null;
type SubscriptionData = { status: string; billingCycle: string | null; currentPeriodEnd: string | null; planKey: string | null; planName: string | null } | null;
type ModuleData = { key: string; name: string; status: string };
type SessionData = { id: string; expiresAt: string; device: { deviceType: string; browser: string; operatingSystem: string; lastActiveAt: string | null } };

type Props = { user: UserData; tenant: TenantData; membership: MembershipData; subscription: SubscriptionData; modules: ModuleData[]; session: SessionData };
type Section = 'personal' | 'security' | 'sessions' | 'workspace' | 'apps' | 'notifications' | 'ai' | 'integrations' | 'billing' | 'advanced';

const NAV: { key: Section; label: string; icon: typeof User; ready: boolean; ownerOnly?: boolean; adminOnly?: boolean }[] = [
  { key: 'personal', label: 'Personal', icon: User, ready: true },
  { key: 'security', label: 'Security', icon: ShieldCheck, ready: true },
  { key: 'sessions', label: 'Sessions', icon: LockKeyhole, ready: true },
  { key: 'workspace', label: 'Workspace', icon: Building2, ready: false, adminOnly: true },
  { key: 'apps', label: 'Apps', icon: AppWindow, ready: false, adminOnly: true },
  { key: 'notifications', label: 'Notifications', icon: Bell, ready: false },
  { key: 'ai', label: 'SaMi AI', icon: Bot, ready: false },
  { key: 'integrations', label: 'Integrations', icon: Plug, ready: false, adminOnly: true },
  { key: 'billing', label: 'Billing', icon: CreditCard, ready: false, ownerOnly: true },
  { key: 'advanced', label: 'Advanced', icon: KeyRound, ready: false, ownerOnly: true },
];

export default function SettingsClient({ user, tenant, membership, subscription, modules, session }: Props) {
  const [active, setActive] = useState<Section>('security');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  const visibleNav = useMemo(() => NAV.filter((item) => (!item.ownerOnly || membership?.isOwner) && (!item.adminOnly || membership?.isAdmin)), [membership]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!currentPassword) {
      setOverlay(getAuthOverlayMessage('CURRENT_PASSWORD_REQUIRED'));
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setOverlay(getAuthOverlayMessage('PASSWORD_WEAK'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setOverlay(getAuthOverlayMessage('PASSWORDS_DO_NOT_MATCH'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error }));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOverlay(getAuthOverlayMessage('PASSWORD_CHANGED'));
    } catch (error) {
      setOverlay(getAuthOverlayMessage('CHANGE_PASSWORD_ERROR', { fallback: error instanceof Error ? error.message : 'Could not change password.' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#080B12] dark:text-white">
      {overlay && <SaMiOverlay open type={overlay.type} title={overlay.title} message={overlay.message} primaryAction={overlay.primaryAction} secondaryAction={overlay.secondaryAction} onClose={() => setOverlay(null)} />}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" />Back to dashboard</Link>
            <SaMiLogo size="md" showTagline={false} />
            <h1 className="mt-2 text-3xl font-black tracking-tight">Settings</h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm font-bold">{tenant?.name || 'Workspace'}</p>
            <p className="text-xs capitalize text-slate-500 dark:text-slate-400">{membership?.accessLevel || 'member'}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="h-fit rounded-[26px] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-6">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const selected = active === item.key;
              return (
                <button key={item.key} type="button" onClick={() => setActive(item.key)} className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${selected ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <Icon className="h-5 w-5" />
                  <span className="flex-1 text-sm font-bold">{item.label}</span>
                  {!item.ready && <span className="text-[10px] font-black uppercase opacity-50">Later</span>}
                </button>
              );
            })}
          </aside>

          <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            {active === 'personal' && (
              <>
                <h2 className="text-xl font-black">Personal</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your current SaMi account identity.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Info label="First name" value={user.firstName || 'Not set'} />
                  <Info label="Last name" value={user.lastName || 'Not set'} />
                  <Info label="Full name" value={user.fullName || `${user.firstName} ${user.lastName}`.trim()} />
                  <Info label="Email" value={user.email} />
                </div>
              </>
            )}

            {active === 'security' && (
              <>
                <h2 className="text-xl font-black">Security</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Change your password and protect your account.</p>
                <form onSubmit={changePassword} className="mt-6 max-w-xl space-y-4">
                  <Password label="Current password" value={currentPassword} onChange={setCurrentPassword} show={showPasswords} />
                  <Password label="New password" value={newPassword} onChange={setNewPassword} show={showPasswords} />
                  <Password label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} show={showPasswords} />
                  <button type="button" onClick={() => setShowPasswords((v) => !v)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white">
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showPasswords ? 'Hide passwords' : 'Show passwords'}
                  </button>
                  <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    Change password
                  </button>
                </form>
                <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
                  <p className="text-sm font-bold">Two-factor authentication</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The login challenge foundation is ready. Enable/disable controls will be connected when we finish the 2FA settings API.</p>
                </div>
              </>
            )}

            {active === 'sessions' && (
              <>
                <h2 className="text-xl font-black">Sessions</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your current authenticated session.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Info label="Device" value={session.device.deviceType} />
                  <Info label="Browser" value={session.device.browser} />
                  <Info label="Operating system" value={session.device.operatingSystem} />
                  <Info label="Last active" value={formatDate(session.device.lastActiveAt)} />
                  <Info label="Session expires" value={formatDate(session.expiresAt)} />
                </div>
              </>
            )}

            {active === 'workspace' && <Placeholder title="Workspace" detail={`${tenant?.name || 'Workspace'} · ${tenant?.status || 'unknown'}`} />}
            {active === 'apps' && <Placeholder title="Apps" detail={`${modules.length} installed module${modules.length === 1 ? '' : 's'}`} />}
            {active === 'notifications' && <Placeholder title="Notifications" />}
            {active === 'ai' && <Placeholder title="SaMi AI" />}
            {active === 'integrations' && <Placeholder title="Integrations" />}
            {active === 'billing' && <Placeholder title="Billing" detail={subscription?.planName || subscription?.planKey || 'Free'} />}
            {active === 'advanced' && <Placeholder title="Advanced" />}
          </section>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 break-words text-sm font-bold">{value}</p></div>;
}

function Password({ label, value, onChange, show }: { label: string; value: string; onChange: (value: string) => void; show: boolean }) {
  return <div><label className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label><input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950" /></div>;
}

function Placeholder({ title, detail }: { title: string; detail?: string }) {
  return <><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{detail || 'This section is reserved for its platform category and is not hardcoded early.'}</p><div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">This section will receive its real controls when that category is completed.</div></>;
}

function formatDate(value: string | null) {
  if (!value) return 'Not available';
  try { return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return 'Not available'; }
}
