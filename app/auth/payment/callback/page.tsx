'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      const orderTrackingId = searchParams.get('orderTrackingId') || sessionStorage.getItem('sami_order_tracking_id');

      if (!orderTrackingId) {
        setStatus('failed');
        setMessage('No order tracking ID');
        return;
      }

      try {
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderTrackingId }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) throw new Error(verifyData.error);

        const regData = JSON.parse(sessionStorage.getItem('sami_registration_data') || '{}');
        const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
        const selectedPlan = sessionStorage.getItem('sami_selected_plan') || 'standard';

        const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(regData),
        });
        const registerData = await registerRes.json();
        if (!registerRes.ok) throw new Error(registerData.error);

        const tenantId = registerData.tenant.id;

        await fetch('/api/auth/update-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, plan: selectedPlan, billingCycle: 'monthly' }),
        });

        for (const appKey of selectedApps) {
          await fetch('/api/auth/install-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, appKey }),
          });
        }

        sessionStorage.removeItem('sami_registration_data');
        sessionStorage.removeItem('sami_selected_apps');
        sessionStorage.removeItem('sami_selected_plan');
        sessionStorage.removeItem('sami_order_tracking_id');

        setStatus('success');
        setTimeout(() => router.push('/auth/check-email'), 2000);
      } catch (err) {
        setStatus('failed');
        setMessage(err instanceof Error ? err.message : 'Failed');
      }
    };
    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Link href="/" className="inline-block mb-8"><SaMiLogo size="lg" /></Link>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl max-w-sm mx-auto">
          {status === 'verifying' && <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />}
          {status === 'success' && <CheckCircle size={48} className="mx-auto text-green-500" />}
          {status === 'failed' && <XCircle size={48} className="mx-auto text-red-500" />}
          <h2 className="mt-4 text-lg font-semibold">
            {status === 'verifying' ? 'Verifying payment...' : status === 'success' ? 'Payment Successful!' : 'Failed'}
          </h2>
          {message && <p className="mt-2 text-sm text-gray-500">{message}</p>}
          {status === 'failed' && (
            <button onClick={() => router.push('/auth/register')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
              Back to Registration
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <CallbackContent />
    </Suspense>
  );
}