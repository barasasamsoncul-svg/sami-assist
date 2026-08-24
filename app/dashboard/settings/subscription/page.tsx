'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, Building2, Users, AppWindow } from 'lucide-react';

interface BillingData {
  subscription: any;
  billing: {
    plan: string;
    planKey: string;
    basePrice: number;
    includedApps: number;
    includedUsers: number;
    pricePerApp: number;
    pricePerUser: number;
    enabledApps: number;
    activeUsers: number;
    extraApps: number;
    extraUsers: number;
    appsCost: number;
    usersCost: number;
    totalMonthly: number;
    currency: string;
  };
}

export default function SubscriptionPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/settings/subscription');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load');
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (plan: string) => {
    setUpgrading(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/settings/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update');
      setMessage(data.message);
      fetchSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!data) return <div>No subscription found</div>;

  const { billing } = data;

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm">{message}</div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}

      {/* Current Summary */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm text-gray-500 dark:text-gray-400">Current Plan</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1 capitalize">{billing.plan}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Total</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">${billing.totalMonthly}</p>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={18} className="text-blue-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Business</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${billing.basePrice}</p>
          <p className="text-xs text-gray-500 mt-1">Base fee</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AppWindow size={18} className="text-purple-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Apps</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${billing.appsCost}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.enabledApps} enabled • {billing.includedApps} included • {billing.extraApps} extra × ${billing.pricePerApp}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-green-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white">Users</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">${billing.usersCost}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.activeUsers} active • {billing.includedUsers} included • {billing.extraUsers} extra × ${billing.pricePerUser}</p>
        </div>
      </div>

      {/* Plans */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* Free */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'free' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <h4 className="font-bold text-gray-900 dark:text-white">Free</h4>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">$0</p>
          <p className="text-sm text-gray-500">/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1 App</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1 User</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> SaMi AI Basic</li>
          </ul>
          {billing.planKey !== 'free' ? (
            <button onClick={() => handlePlanChange('free')} disabled={upgrading} className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">Downgrade</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>

        {/* Business */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'business' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-900 dark:text-white">Business</h4>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full font-medium">Popular</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">$29</p>
          <p className="text-sm text-gray-500">/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 3 Apps included</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 5 Users included</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> +$5 per extra app</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> +$3 per extra user</li>
          </ul>
          {billing.planKey !== 'business' ? (
            <button onClick={() => handlePlanChange('business')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">{upgrading ? 'Updating...' : 'Upgrade'}</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>

        {/* Enterprise */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'enterprise' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <h4 className="font-bold text-gray-900 dark:text-white">Enterprise</h4>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">$99</p>
          <p className="text-sm text-gray-500">/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 10 Apps included</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 20 Users included</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> +$8 per extra app</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> +$5 per extra user</li>
          </ul>
          {billing.planKey !== 'enterprise' ? (
            <button onClick={() => handlePlanChange('enterprise')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition">{upgrading ? 'Updating...' : 'Upgrade'}</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>
      </div>
    </div>
  );
}