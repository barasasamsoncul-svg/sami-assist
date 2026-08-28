'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Boxes, ArrowLeft } from 'lucide-react';

function DynamicAppContent() {
  const params = useParams();
  const router = useRouter();
  const [appName, setAppName] = useState('');

  useEffect(() => {
    const key = params.app as string;
    setAppName(key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' '));
  }, [params.app]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{appName}</h2>
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
        <Boxes size={48} className="mx-auto text-gray-300 dark:text-gray-700" />
        <h3 className="mt-4 text-lg font-semibold">{appName} Module</h3>
        <p className="mt-2 text-sm text-gray-500">Interface coming soon.</p>
      </div>
    </div>
  );
}

export default function DynamicAppPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center">Loading...</div>}>
      <DynamicAppContent />
    </Suspense>
  );
}