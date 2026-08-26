'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyAndCreateAccount = async () => {
      const orderTrackingId = searchParams.get('orderTrackingId') || sessionStorage.getItem('sami_order_tracking_id');

      if (!orderTrackingId) {
        setStatus('failed');
        setMessage('No order tracking ID found');
        return;
      }

      try {
        // Step 1: Verify payment (trial authorization)
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderTrackingId }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          setStatus('failed');
          setMessage(verifyData.error || 'Payment verification failed');
          return;
        }

        // Step 2: Create account (after payment verified)
        const registrationData = JSON.parse(sessionStorage.getItem('sami_registration_data') || '{}');
        const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');
        const selectedPlan = sessionStorage.getItem('sami_selected_plan') || 'standard';

        const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registrationData),
        });
        const registerData = await registerRes.json();

        if (!registerRes.ok) {
          setStatus('failed');
          setMessage(registerData.error || 'Account creation failed');
          return;
        }

        const businessId = registerData.business.id;

        // Step 3: Update plan to standard with trial
        await fetch('/api/auth/update-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, plan: selectedPlan, billingCycle: 'monthly' }),
        });

        // Step 4: Install all selected apps
        for (const appKey of selectedApps) {
          await fetch('/api/auth/install-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, appKey }),
          });
        }

        // Step 5: Clean up
        sessionStorage.removeItem('sami_registration_data');
        sessionStorage.removeItem('sami_selected_apps');
        sessionStorage.removeItem('sami_selected_plan');
        sessionStorage.removeItem('sami_order_tracking_id');

        setStatus('success');
        setMessage('Your workspace is ready! 15-day trial started.');

        setTimeout(() => {
          router.push('/auth/login?registered=true');
        }, 2000);

      } catch (err) {
        setStatus('failed');
        setMessage('Failed to complete registration');
      }
    };

    verifyAndCreateAccount();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Link href="/" className="inline-block mb-8">
          <SaMiLogo size="lg" />
        </Link>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-800 max-w-sm mx-auto">
          {status === 'verifying' && (
            <>
              <Loader2 size={48} className="mx-auto text-blue-600 animate-spin" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Verifying payment...</h2>
              <p className="mt-1 text-sm text-gray-500">Please wait while we confirm</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={48} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Trial Started!</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <p className="mt-2 text-sm text-gray-400">Redirecting to login...</p>
            </>
          )}

          {status === 'failed' && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Failed</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <button
                onClick={() => router.push('/auth/register')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Back to Registration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <CallbackContent />
    </Suspense>
  );
}