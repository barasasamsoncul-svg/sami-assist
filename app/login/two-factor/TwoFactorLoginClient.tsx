'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import AuthShell from '@/app/components/auth/AuthShell';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import { getAuthOverlayMessage } from '@/lib/auth/auth-ui-messages';

type ResponseData = { success?: boolean; code?: string; error?: string; message?: string; next?: string };

export default function TwoFactorLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [overlay, setOverlay] = useState<ReturnType<typeof getAuthOverlayMessage> | null>(null);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('sami_2fa_email') || '';
    const storedChallenge = sessionStorage.getItem('sami_2fa_challenge') || '';
    const storedRemember = sessionStorage.getItem('sami_2fa_remember') === 'true';
    setEmail(storedEmail);
    setChallengeToken(storedChallenge);
    setRememberMe(storedRemember);

    if (!storedEmail || !storedChallenge) {
      setOverlay(getAuthOverlayMessage('LOGIN_CHALLENGE_EXPIRED'));
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !email || !challengeToken) return;
    if (!code.trim()) {
      setOverlay(getAuthOverlayMessage('TWO_FACTOR_REQUIRED'));
      return;
    }

    setSubmitting(true);
    setOverlay(null);

    try {
      const response = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, challengeToken, code: code.trim(), rememberMe }),
      });
      const data = (await response.json().catch(() => ({}))) as ResponseData;
      if (!response.ok || !data.success) {
        setOverlay(getAuthOverlayMessage(data.code, { fallback: data.error }));
        return;
      }

      sessionStorage.removeItem('sami_2fa_email');
      sessionStorage.removeItem('sami_2fa_challenge');
      sessionStorage.removeItem('sami_2fa_remember');
      router.replace(data.next || '/dashboard');
    } catch (error) {
      setOverlay(getAuthOverlayMessage('TWO_FACTOR_LOGIN_ERROR', { fallback: error instanceof Error ? error.message : 'Could not complete verification.' }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {overlay && <SaMiOverlay open type={overlay.type} title={overlay.title} message={overlay.message} primaryAction={overlay.primaryAction} secondaryAction={overlay.secondaryAction} onClose={() => setOverlay(null)} />}
      <AuthShell title="Two-factor verification" description="Enter the 6-digit code from your authenticator app, or use one of your recovery codes." backHref="/login" backLabel="Back to login">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="two-factor-code" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Verification or recovery code</label>
            <input id="two-factor-code" value={code} onChange={(e) => setCode(e.target.value.slice(0, 32))} autoComplete="one-time-code" placeholder="000000" className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-xl font-black tracking-[0.25em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <button type="submit" disabled={submitting || !email || !challengeToken} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Verify and continue
          </button>
        </form>
      </AuthShell>
    </>
  );
}
