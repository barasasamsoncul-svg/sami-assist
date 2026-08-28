'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Sparkles, AppWindow, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';

interface DashboardData {
  user: { fullName: string };
  activeTenant: { name: string; role: string };
  installedModules: Array<{ key: string; name: string; category: string }>;
  subscription: { status: string; plan_name: string } | null;
  databaseReady: boolean;
}

export default function DashboardHome() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.error === 'Not authenticated') router.push('/auth/login');
        else setData(data);
      })
      .catch(() => router.push('/auth/login'));
  }, [router]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
        <p className="text-sm text-blue-100">{greeting}</p>
        <h2 className="text-3xl font-bold mt-1">{data.user.fullName} 👋</h2>
        <p className="mt-2 text-blue-100 text-sm">{data.activeTenant.name} • <span className="capitalize">{data.activeTenant.role}</span></p>
        <Link href="/dashboard/ai" className="mt-4 inline-flex items-center gap-2 bg-white text-blue-700 px-5 py-3 rounded-xl font-semibold hover:bg-blue-50 transition">
          <Sparkles size={18} />
          Ask SaMi AI
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <AppWindow size={20} className="text-blue-600" />
          <p className="text-2xl font-bold mt-2">{data.installedModules.length}</p>
          <p className="text-xs text-gray-500">Apps</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          {data.databaseReady ? <CheckCircle2 size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-yellow-600" />}
          <p className="text-2xl font-bold mt-2">{data.databaseReady ? 'Online' : 'Setup'}</p>
          <p className="text-xs text-gray-500">Database</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <CreditCard size={20} className="text-purple-600" />
          <p className="text-2xl font-bold mt-2">{data.subscription?.plan_name || 'Free'}</p>
          <p className="text-xs text-gray-500">Plan</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <Sparkles size={20} className="text-indigo-600" />
          <p className="text-2xl font-bold mt-2">Ready</p>
          <p className="text-xs text-gray-500">AI</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Your Apps</h3>
          <Link href="/dashboard/settings?tab=apps" className="text-sm text-blue-600 hover:underline">Manage</Link>
        </div>
        {data.installedModules.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-12 text-center border border-gray-200 dark:border-gray-800">
            <p className="text-sm text-gray-500">No apps installed. Install apps from Settings.</p>
            <Link href="/dashboard/settings?tab=apps" className="mt-4 inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold">Install Apps</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.installedModules.map((app) => (
              <Link key={app.key} href={`/dashboard/${app.key}`} className="group bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 hover:shadow-md transition">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">{app.name.charAt(0)}</div>
                <h4 className="mt-4 font-semibold">{app.name}</h4>
                <p className="mt-1 text-xs text-gray-500 capitalize">{app.category}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}