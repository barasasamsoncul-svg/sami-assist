'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function LogoutPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'logging_out' | 'done' | 'error'>('logging_out');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleLogout = async () => {
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        
        if (!response.ok) {
          throw new Error('Logout failed');
        }

        setStatus('done');
        
        // Redirect to login after short delay
        setTimeout(() => {
          router.push('/auth/login');
        }, 1500);
        
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    };

    handleLogout();
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <SaMiLogo size="xl" />
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-xl shadow-gray-200/50 dark:shadow-black/20 border border-gray-200 dark:border-gray-800 max-w-sm mx-auto">
          {status === 'logging_out' && (
            <>
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                Signing out...
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Please wait while we securely end your session.
              </p>
            </>
          )}

          {status === 'done' && (
            <>
              <div className="h-12 w-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                Signed out successfully
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Redirecting to login...
              </p>
              <Link
                href="/auth/login"
                className="mt-4 inline-block text-blue-600 dark:text-blue-500 hover:underline text-sm font-medium"
              >
                Go to login now
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="h-12 w-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                Sign out failed
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {error || 'Something went wrong. Please try again.'}
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Try Again
                </button>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                  Back to Dashboard
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-gray-400 dark:text-gray-500">
          AI-powered business workspace
        </p>
      </div>
    </div>
  );
}