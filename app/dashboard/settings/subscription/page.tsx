'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, CreditCard, Users, AppWindow, Sparkles, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';

interface BillingData {
  billing: {
    plan: string;
    planKey: string;
    status: string;
    billingCycle: string;
    trialEndsAt: string;
    trialDaysRemaining: number;
    currentPeriodEnd: string;
    startedAt: string;
    enabledApps: number;
    activeUsers: number;
    aiQueriesUsed: number;
    aiQueriesLimit: number;
    pricePerUser: number;
    cardLast4: string;
    cardBrand: string;
  };
  billingHistory: Array<{
    id: string;
    action: string;
    details: any;
    created_at: string;
  }>;
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

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
    setError('');
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
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setUpgrading(true);
    try {
      const response = await fetch('/api/settings/subscription/cancel', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.message);
      setShowCancelConfirm(false);
      fetchSubscription();
    } catch (err) {
      setError('Failed to cancel');
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

  const { billing, billingHistory } = data;

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm">{message}</div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}

      {/* Trial Banner */}
      {billing.status === 'trialing' && billing.trialDaysRemaining > 0 && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Trial active:</strong> {billing.trialDaysRemaining} days remaining. Your card will be charged after the trial ends.
          </p>
        </div>
      )}

      {billing.status === 'past_due' && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-400">Payment failed. Please update your payment method.</p>
        </div>
      )}

      {/* Current Plan Summary */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Current Plan</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{billing.plan}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">
              Status: <span className={`font-medium ${billing.status === 'active' ? 'text-green-600' : billing.status === 'trialing' ? 'text-blue-600' : 'text-red-600'}`}>{billing.status}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Billing Cycle</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 capitalize">{billing.billingCycle}</p>
            {billing.cardLast4 && (
              <p className="text-xs text-gray-500 mt-1">💳 {billing.cardBrand} •••• {billing.cardLast4}</p>
            )}
          </div>
        </div>

        {/* Trial info */}
        {billing.status === 'trialing' && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs text-gray-600 dark:text-gray-400">
            Trial ends: {new Date(billing.trialEndsAt).toLocaleDateString()}
          </div>
        )}

        {billing.currentPeriodEnd && (
          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs text-gray-600 dark:text-gray-400">
            Next billing date: {new Date(billing.currentPeriodEnd).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Usage Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AppWindow size={18} className="text-purple-600" />
            <h4 className="font-semibold text-sm">Apps</h4>
          </div>
          <p className="text-2xl font-bold">{billing.enabledApps}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.planKey === 'free' ? '1 included' : 'All apps'}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-green-600" />
            <h4 className="font-semibold text-sm">Users</h4>
          </div>
          <p className="text-2xl font-bold">{billing.activeUsers}</p>
          <p className="text-xs text-gray-500 mt-1">{billing.planKey === 'free' ? 'Unlimited' : `$${billing.pricePerUser}/user/mo`}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-indigo-600" />
            <h4 className="font-semibold text-sm">AI Queries</h4>
          </div>
          <p className="text-2xl font-bold">{billing.aiQueriesUsed} / {billing.aiQueriesLimit === -1 ? '∞' : billing.aiQueriesLimit}</p>
          <p className="text-xs text-gray-500 mt-1">per month</p>
        </div>
      </div>

      {/* Plans */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* Free */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'free' ? 'border-blue-600' : 'border-gray-200 dark:border-gray-800'}`}>
          <h4 className="font-bold">One App Free</h4>
          <p className="text-3xl font-extrabold mt-2">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1 App</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Unlimited users</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 100 AI queries/mo</li>
          </ul>
          {billing.planKey !== 'free' ? (
            <button onClick={() => handlePlanChange('free')} disabled={upgrading} className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">Downgrade</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium">Current</span>
          )}
        </div>

        {/* Standard */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'standard' ? 'border-blue-600' : 'border-gray-200'}`}>
          <h4 className="font-bold">Standard</h4>
          <p className="text-3xl font-extrabold mt-2">$14.90<span className="text-sm font-normal text-gray-500">/user/mo</span></p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> All apps</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> 1,000 AI queries/user</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Priority support</li>
          </ul>
          {billing.planKey !== 'standard' ? (
            <button onClick={() => handlePlanChange('standard')} disabled={upgrading} className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Upgrade</button>
          ) : (
            <span className="mt-4 block text-center px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium">Current</span>
          )}
        </div>

        {/* Custom */}
        <div className={`bg-white dark:bg-gray-900 rounded-2xl border-2 p-6 ${billing.planKey === 'custom' ? 'border-blue-600' : 'border-gray-200'}`}>
          <h4 className="font-bold">Custom</h4>
          <p className="text-3xl font-extrabold mt-2">$24.90<span className="text-sm font-normal text-gray-500">/user/mo</span></p>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> All + Custom</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Unlimited AI</li>
            <li className="flex items-center gap-2"><Check size={14} className="text-green-500" /> Dedicated support</li>
          </ul>
          <button onClick={() => window.location.href = 'mailto:sales@sami.tech'} className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">Contact Sales</button>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold">Billing History</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {billingHistory.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">No billing history</p>
          ) : (
            billingHistory.map((item) => (
              <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{item.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
                {item.action === 'payment_received' ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : item.action === 'payment_failed' ? (
                  <XCircle size={16} className="text-red-500" />
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Cancel Subscription</h3>
        <p className="text-sm text-gray-500 mb-4">Your workspace will be downgraded to free plan at the end of the billing period.</p>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          Cancel Subscription
        </button>
      </div>

      {/* Cancel Confirmation Overlay */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cancel Subscription?</h3>
            <p className="text-sm text-gray-500 mt-2">
              You will lose access to paid features at the end of your billing period. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Keep Subscription</button>
              <button onClick={handleCancelSubscription} disabled={upgrading} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Cancel Anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}