'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, AppWindow, Users, Sparkles, AlertTriangle } from 'lucide-react';

export default function SubscriptionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/settings/subscription');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setData(data);
    } catch (err) {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (plan: string) => {
    setUpgrading(true);
    try {
      const response = await fetch('/api/settings/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingCycle: 'monthly' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.message);
      fetchSubscription();
    } catch (err) {
      setError('Failed');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancel = async () => {
    setUpgrading(true);
    try {
      const response = await fetch('/api/settings/subscription/cancel', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.message);
      setShowCancel(false);
      fetchSubscription();
    } catch (err) {
      setError('Failed');
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;
  }

  if (!data) return <div>No subscription found</div>;

  const { billing } = data;

  return (
    <div className="space-y-6">
      {message && <div className="p-4 bg-green-50 rounded-xl text-green-700 text-sm">{message}</div>}
      {error && <div className="p-4 bg-red-50 rounded-xl text-red-700 text-sm">{error}</div>}

      {billing.status === 'trialing' && billing.trialDaysRemaining > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <p className="text-sm text-blue-700"><strong>Trial active:</strong> {billing.trialDaysRemaining} days remaining</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Current Plan</p>
            <p className="text-2xl font-bold mt-1">{billing.plan}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">Status: <span className="font-medium">{billing.status}</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Billing</p>
            <p className="text-xl font-bold mt-1 capitalize">{billing.billingCycle}</p>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <AppWindow size={18} className="text-purple-600" />
          <p className="text-2xl font-bold mt-2">{billing.enabledApps}</p>
          <p className="text-xs text-gray-500">Apps</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <Users size={18} className="text-green-600" />
          <p className="text-2xl font-bold mt-2">{billing.activeUsers}</p>
          <p className="text-xs text-gray-500">Users</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800">
          <Sparkles size={18} className="text-indigo-600" />
          <p className="text-2xl font-bold mt-2">{billing.aiQueriesLimit === -1 ? '∞' : billing.aiQueriesLimit}</p>
          <p className="text-xs text-gray-500">AI Queries</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'free' ? 'border-blue-600' : 'border-gray-200'}`}>
          <h4 className="font-bold">One App Free</h4>
          <p className="text-3xl font-extrabold mt-2">$0</p>
          {billing.planKey !== 'free' ? (
            <button onClick={() => handlePlanChange('free')} disabled={upgrading} className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">Downgrade</button>
          ) : <span className="mt-4 block text-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm">Current</span>}
        </div>
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'standard' ? 'border-blue-600' : 'border-gray-200'}`}>
          <h4 className="font-bold">Standard</h4>
          <p className="text-3xl font-extrabold mt-2">$14.90</p>
          {billing.planKey !== 'standard' ? (
            <button onClick={() => handlePlanChange('standard')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Upgrade</button>
          ) : <span className="mt-4 block text-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm">Current</span>}
        </div>
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'custom' ? 'border-blue-600' : 'border-gray-200'}`}>
          <h4 className="font-bold">Custom</h4>
          <p className="text-3xl font-extrabold mt-2">$24.90</p>
          <button onClick={() => handlePlanChange('custom')} disabled={upgrading} className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">Contact Sales</button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
        <h3 className="text-lg font-semibold text-red-600">Cancel Subscription</h3>
        <button onClick={() => setShowCancel(true)} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Cancel</button>
      </div>

      {showCancel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold">Cancel Subscription?</h3>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCancel(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Keep</button>
              <button onClick={handleCancel} disabled={upgrading} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Cancel Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}