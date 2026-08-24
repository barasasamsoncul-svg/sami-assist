'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SAMI_APPS, getApp, SamiApp } from '@/lib/sami-apps';
import { Boxes, ArrowLeft } from 'lucide-react';

export default function DynamicAppPage() {
  const params = useParams();
  const router = useRouter();
  const [app, setApp] = useState<SamiApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const key = params.app as string;
    
    // Try to find by key first
    let foundApp = getApp(key);
    
    // If not found, try by route
    if (!foundApp) {
      foundApp = SAMI_APPS.find((a: SamiApp) => a.route === key);
    }
    
    if (!foundApp) {
      setError('App not found');
    } else {
      setApp(foundApp);
    }
    
    setLoading(false);
  }, [params.app]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="text-center py-12">
        <Boxes size={48} className="mx-auto text-gray-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">{error}</h3>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-4 text-blue-600 hover:underline"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* App Header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{app.name}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{app.description}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>

      {/* Placeholder - This is where module UI will load */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <Boxes size={48} className="mx-auto text-gray-300 dark:text-gray-700" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white capitalize">
          {app.name} Module
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          This module is installed and ready. The full interface will be available soon.
        </p>
      </div>
    </div>
  );
}