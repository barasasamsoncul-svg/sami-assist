'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, Building2, Users, AppWindow, Sparkles, CreditCard } from 'lucide-react';

interface BillingData {
  subscription: any;
  billing: {
    plan: string;
    planKey: string;
    billingCycle: string;
    includedApps: string;
    includedUsers: string;
    pricePerUserMonthly: number;
    pricePerUserAnnual: number;
    enabledApps: number;
    activeUsers: number;
    billableUsers: number;
    userCost: number;
    totalMonthly: number;
    aiQueriesIncluded: string;
    currency: string;
  };
}

export default function SubscriptionPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

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
        body: JSON.stringify({ plan, billingCycle }),
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
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{billing.plan}</p>
            <p className="text-sm text-gray-500 mt-1 capitalize">{billing.billingCycle} billing</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Total</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">
              ${billing.totalMonthly}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {billing.billableUsers} billable users × ${billing.pricePerUserMonthly}
            </p>
          </div>
        </div>
      </div>

      {/* Usage Summary */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AppWindow size={18} className="text-purple-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Apps</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{billing.enabledApps}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.includedApps}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-green-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Active Users</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{billing.activeUsers}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.includedUsers}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={18} className="text-blue-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Billable Users</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{billing.billableUsers}</p>
          <p className="text-xs text-gray-500 mt-1">× ${billing.pricePerUserMonthly}/user</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-indigo-600" />
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">AI Queries</h4>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{billing.aiQueriesIncluded}</p>
          <p className="text-xs text-gray-500 mt-1">included</p>
        </div>
      </div>

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${billingCycle === 'monthly' ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${billingCycle === 'annual' ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-500'}`}
          >
            Annual <span className="text-xs text-green-600">-20%</span>
          </button>
        </div>
      </div>

      {/* Plans - Odoo Style Per User */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* One App Free */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'free' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <h4 className="font-bold text-gray-900 dark:text-white">One App Free</h4>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">$0</p>
          <p className="text-sm text-gray-500">/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1 App</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Unlimited Users</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 100 AI queries/month</li>
          </ul>
          {billing.planKey !== 'free' ? (
            <button onClick={() => handlePlanChange('free')} disabled={upgrading} className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">Downgrade</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>

        {/* Standard */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'standard' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-900 dark:text-white">Standard</h4>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full font-medium">Popular</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            ${billingCycle === 'monthly' ? '14.90' : '11.90'}
          </p>
          <p className="text-sm text-gray-500">/user/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> All Apps included</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Per user billing</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1,000 AI queries/user/month</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Priority support</li>
          </ul>
          {billing.planKey !== 'standard' ? (
            <button onClick={() => handlePlanChange('standard')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              {upgrading ? 'Updating...' : 'Upgrade'}
            </button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>

        {/* Custom */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'custom' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <h4 className="font-bold text-gray-900 dark:text-white">Custom</h4>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            ${billingCycle === 'monthly' ? '24.90' : '19.90'}
          </p>
          <p className="text-sm text-gray-500">/user/month</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> All Apps + Custom</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Unlimited AI queries</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Dedicated support</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Custom integrations</li>
          </ul>
          {billing.planKey !== 'custom' ? (
            <button onClick={() => handlePlanChange('custom')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition">
              {upgrading ? 'Updating...' : 'Contact Sales'}
            </button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium">Current Plan</span>
          )}
        </div>
      </div>
    </div>
  );
}