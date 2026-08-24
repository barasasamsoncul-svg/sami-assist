'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowRight, 
  Sparkles, 
  Users, 
  Activity,
  AppWindow,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface DashboardData {
  user: {
    fullName: string;
    email: string;
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

interface TeamData {
  team: Array<{
    id: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    last_active_at: string;
  }>;
}

export default function DashboardHome() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');

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

    fetch('/api/team')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTeamData(data);
        }
      })
      .catch(() => {});
  }, [router]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const activeTeamCount = teamData?.team.filter(m => m.status === 'active').length || 1;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl shadow-blue-600/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-blue-100 mb-1">{greeting}</p>
            <h2 className="text-3xl font-bold">{data.user.fullName} 👋</h2>
            <p className="mt-2 text-blue-100 text-sm">
              {data.activeBusiness.name} • <span className="capitalize">{data.activeBusiness.role}</span>
            </p>
          </div>
          <Link
            href="/dashboard/ai"
            className="inline-flex items-center gap-2 bg-white text-blue-700 px-5 py-3 rounded-xl font-semibold hover:bg-blue-50 transition shadow-lg"
          >
            <Sparkles size={18} />
            Ask SaMi AI
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Apps</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{data.installedApps.length}</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
              <AppWindow size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Team</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{activeTeamCount}</p>
            </div>
            <div className="h-10 w-10 bg-purple-100 dark:bg-purple-900/20 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Database</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {data.databaseReady ? 'Online' : 'Setup'}
              </p>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${data.databaseReady ? 'bg-green-100 dark:bg-green-900/20' : 'bg-yellow-100 dark:bg-yellow-900/20'}`}>
              {data.databaseReady ? (
                <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle size={20} className="text-yellow-600 dark:text-yellow-400" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">AI Status</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Ready</p>
            </div>
            <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Apps Section */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Your Apps</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {data.installedApps.length} apps installed
                </p>
              </div>
              <Link href="/dashboard/settings" className="text-sm text-blue-600 dark:text-blue-500 hover:underline">
                Manage
              </Link>
            </div>
            
            {data.installedApps.length === 0 ? (
              <div className="p-12 text-center">
                <AppWindow size={48} className="mx-auto text-gray-300 dark:text-gray-700" />
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  No apps installed yet. Go to Settings to add apps.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800">
                {data.installedApps.map((app) => (
                  <Link
                    key={app.key}
                    href={`/dashboard/${app.route}`}
                    className="group bg-white dark:bg-gray-900 p-5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-600/20">
                        {app.name.charAt(0)}
                      </div>
                      <ArrowRight size={16} className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                    </div>
                    <h4 className="mt-3 font-semibold text-gray-900 dark:text-white text-sm">{app.name}</h4>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{app.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Team Section */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Team</h3>
              <Link href="/dashboard/settings" className="text-xs text-blue-600 dark:text-blue-500 hover:underline">
                View All
              </Link>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {teamData?.team.slice(0, 5).map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    {member.full_name?.charAt(0) || member.email.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {member.full_name || member.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{member.role}</p>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${member.status === 'active' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
                </div>
              ))}
            </div>
          </div>

          {/* AI Quick Action */}
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-600/20">
            <div className="flex items-center gap-3">
              <Sparkles size={20} className="text-indigo-200" />
              <h3 className="font-semibold">SaMi AI</h3>
            </div>
            <p className="mt-3 text-sm text-indigo-100">
              Ask AI about your business performance, get insights, or automate tasks.
            </p>
            <Link
              href="/dashboard/ai"
              className="mt-4 inline-flex items-center gap-2 bg-white text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition"
            >
              Start Chat
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}