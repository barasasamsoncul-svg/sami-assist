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
    const verifyPayment = async () => {
      const orderTrackingId = searchParams.get('orderTrackingId') || sessionStorage.getItem('sami_order_tracking_id');

      if (!orderTrackingId) {
        setStatus('failed');
        setMessage('No order tracking ID found');
        return;
      }

      try {
        const response = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderTrackingId }),
        });
        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage('Payment successful! Your workspace is ready.');

          const businessId = sessionStorage.getItem('sami_pending_business_id');
          const selectedApps = JSON.parse(sessionStorage.getItem('sami_selected_apps') || '[]');

          for (const appKey of selectedApps) {
            await fetch('/api/auth/install-app', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ businessId, appKey }),
            });
          }

          sessionStorage.removeItem('sami_pending_business_id');
          sessionStorage.removeItem('sami_selected_apps');
          sessionStorage.removeItem('sami_selected_plan');
          sessionStorage.removeItem('sami_order_tracking_id');

          setTimeout(() => {
            router.push('/auth/login?registered=true');
          }, 2000);
        } else {
          setStatus('failed');
          setMessage(data.error || 'Payment verification failed');
        }
      } catch (err) {
        setStatus('failed');
        setMessage('Payment verification failed');
      }
    };

    verifyPayment();
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
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Payment Successful!</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <p className="mt-2 text-sm text-gray-400">Redirecting to login...</p>
            </>
          )}

          {status === 'failed' && (
            <>
              <XCircle size={48} className="mx-auto text-red-500" />
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Payment Failed</h2>
              <p className="mt-1 text-sm text-gray-500">{message}</p>
              <button
                onClick={() => router.push('/auth/payment')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                Try Again
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