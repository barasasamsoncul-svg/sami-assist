'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

interface DashboardData {
  user: {
    fullName: string;
  };
  activeBusiness: {
    name: string;
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
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">
          Good morning, {data.user.fullName} 👋
        </h2>
        <p className="mt-1 text-gray-600">
          Welcome to your {data.activeBusiness.name} workspace
        </p>
        
        {!data.databaseReady && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Your workspace database is being provisioned. This may take a few minutes.
            </p>
          </div>
        )}
      </div>

      {/* AI Card */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Ask SaMi AI</h3>
            <p className="text-sm text-blue-100">
              Your AI teammate is ready to help
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/ai"
          className="mt-4 inline-flex items-center gap-2 bg-white text-blue-700 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-blue-50"
        >
          Start Chat
          <ArrowRight size={16} />
        </Link>
      </div>

      {/* Installed Apps Grid */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Your Apps
        </h3>
        
        {data.installedApps.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
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
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold">
                    {app.name.charAt(0)}
                  </div>
                  <ArrowRight size={16} className="text-gray-400 group-hover:text-blue-600 transition" />
                </div>
                <h4 className="mt-3 font-semibold text-gray-900">
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