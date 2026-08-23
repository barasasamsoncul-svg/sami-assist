'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Sparkles, TrendingUp, Users, BarChart3, Activity } from 'lucide-react';

interface DashboardData {
  user: {
    fullName: string;
  };
  activeBusiness: {
    name: string;
    role: string;
  };
  installedApps: Array<{
    key: string;
    name: string;
    route: string;
    description: string;
  }>;
  databaseReady: boolean;
}

export default function DashboardHome() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        if (data.error === 'Not authenticated') {
          router.push('/auth/login');
        } else {
          setData(data);
        }
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
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl shadow-blue-600/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-100 mb-1">Welcome back</p>
            <h2 className="text-3xl font-bold">{data.user.fullName} 👋</h2>
            <p className="mt-2 text-blue-100">
              {data.activeBusiness.name} • <span className="capitalize">{data.activeBusiness.role}</span>
            </p>
          </div>
          <Link
            href="/dashboard/ai"
            className="hidden sm:flex items-center gap-2 bg-white text-blue-700 px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-50 transition shadow-lg"
          >
            <Sparkles size={18} />
            Ask SaMi AI
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Apps Installed</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.installedApps.length}</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <BarChart3 size={20} className="text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Database</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.databaseReady ? 'Connected' : 'Pending'}
              </p>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${data.databaseReady ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <Activity size={20} className={data.databaseReady ? 'text-green-600' : 'text-yellow-600'} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 capitalize">{data.activeBusiness.role}</p>
            </div>
            <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">AI Ready</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.databaseReady ? 'Yes' : 'Soon'}
              </p>
            </div>
            <div className="h-10 w-10 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Your Apps */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Your Apps</h3>
          <Link href="/dashboard/settings" className="text-sm text-blue-600 hover:underline">
            Manage Apps
          </Link>
        </div>
        
        {data.installedApps.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <p className="text-gray-500">
              No apps installed yet. Contact support to add apps to your workspace.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.installedApps.map((app) => (
              <Link
                key={app.key}
                href={`/dashboard/${app.route}`}
                className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-600/20">
                    {app.name.charAt(0)}
                  </div>
                  <ArrowRight size={16} className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
                <h4 className="mt-4 font-semibold text-gray-900">
                  {app.name}
                </h4>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                  {app.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}