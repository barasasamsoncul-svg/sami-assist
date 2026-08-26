'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { 
  User, Shield, Monitor, Globe, Building2, Users, AppWindow, 
  Sparkles, Key, CreditCard, History, AlertTriangle, Save, Loader2,
  Check, X, Plus, Trash2, Copy, LogOut, Smartphone, Laptop
} from 'lucide-react';
import { SAMI_APPS } from '@/lib/sami-apps';

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'profile';
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [overlay, setOverlay] = useState<any>(null);

  const [profileForm, setProfileForm] = useState({ fullName: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [businessForm, setBusinessForm] = useState<any>({});
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' });
  const [apiKeyName, setApiKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    fetchSettings();
  }, [activeTab]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed');
      setData(data);
      setProfileForm({ fullName: data.profile?.full_name || '', email: data.profile?.email || '' });
      setBusinessForm({
        name: data.business?.name || '', email: data.business?.email || '',
        phone: data.business?.phone || '', website: data.business?.website || '',
        address: data.business?.address || '', country: data.business?.country || '',
        currency: data.business?.currency || 'KES', timezone: data.business?.timezone || 'Africa/Nairobi',
        industry: data.business?.industry || '', tax_id: data.business?.tax_id || '',
        registration_number: data.business?.registration_number || '',
        business_type: data.business?.business_type || '',
        founded_year: data.business?.founded_year || '',
        employee_count: data.business?.employee_count || '',
      });
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const showOverlay = (type: string, title: string, message: string, action?: string, onConfirm?: () => void) => {
    setOverlay({ type, title, message, action, onConfirm });
  };

  const closeOverlay = () => setOverlay(null);

  const handleSave = async (section: string, body: any, successMsg: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showOverlay('success', 'Saved', successMsg);
      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setInviteLink(data.inviteLink || '');
      setInviteForm({ email: '', role: 'member' });
      showOverlay('success', 'Invite Sent', `Invitation sent to ${inviteForm.email}`);
      fetchSettings();
    } catch (err) {
      setError('Failed to send invite');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: apiKeyName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNewApiKey(data.key);
      setApiKeyName('');
      fetchSettings();
    } catch (err) {
      setError('Failed to create key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    showOverlay('confirm', 'Delete API Key', 'This key will be permanently revoked.', 'Delete', async () => {
      await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      fetchSettings();
      closeOverlay();
    });
  };

  const handleToggleApp = async (appKey: string, enabled: boolean) => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/apps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, enabled }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === 'upgrade_required') {
          showOverlay('warning', 'Upgrade Required', data.message, 'Go to Billing', () => {
            router.push('/dashboard/settings/subscription');
          });
          return;
        }
        throw new Error(data.error);
      }
      showOverlay('success', 'Updated', data.message);
      fetchSettings();
    } catch (err) {
      setError('Failed to update app');
    } finally {
      setSaving(false);
    }
  };

  const handleInstallApp = async (appKey: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === 'upgrade_required') {
          showOverlay('warning', 'Upgrade Required', data.message, 'Go to Billing', () => {
            router.push('/dashboard/settings/subscription');
          });
          return;
        }
        throw new Error(data.error);
      }
      showOverlay('success', 'Installed', data.message);
      fetchSettings();
    } catch (err) {
      setError('Failed to install app');
    } finally {
      setSaving(false);
    }
  };

  const handleUninstallApp = (appKey: string) => {
    showOverlay('confirm', 'Uninstall App', 'This will delete all data. This cannot be undone.', 'Uninstall', async () => {
      await fetch('/api/settings/apps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey }),
      });
      fetchSettings();
      closeOverlay();
    });
  };

  const handleLogoutAllSessions = () => {
    showOverlay('confirm', 'Sign Out All Devices', 'You will be logged out everywhere except this device.', 'Sign Out All', async () => {
      await fetch('/api/auth/logout-all', { method: 'POST' });
      closeOverlay();
    });
  };

  const handleDeleteBusiness = () => {
    showOverlay('confirm', 'Delete Business', 'This will permanently delete your business and all data. This cannot be undone.', 'Delete Everything', async () => {
      closeOverlay();
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!data) return <div>No settings found</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}

      {/* PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">My Profile</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
                {data.profile?.full_name?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{data.profile?.full_name}</p>
                <p className="text-sm text-gray-500">{data.profile?.email}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${data.profile?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {data.profile?.status}
                </span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={profileForm.fullName} onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="text-xs text-gray-500">
              Account created: {new Date(data.profile?.created_at).toLocaleDateString()}
            </div>
            <button onClick={() => handleSave('profile', profileForm, 'Profile updated')} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Profile
            </button>
          </div>
        </div>
      )}

      {/* SECURITY */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Current Password</label>
                <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">New Password</label>
                <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
              <button onClick={() => handleSave('password', passwordForm, 'Password changed')} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Change Password
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h3>
            <p className="text-sm text-gray-500 mb-4">Add extra security to your account.</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Status: {data.profile?.two_factor_enabled ? '✅ Enabled' : '❌ Disabled'}
            </p>
          </div>
        </div>
      )}

      {/* SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Devices & Sessions</h3>
            <button onClick={handleLogoutAllSessions} className="text-sm text-red-600 hover:underline">Sign out all devices</button>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data.sessions?.map((session: any) => (
              <div key={session.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {session.device === 'mobile' ? <Smartphone size={18} /> : <Laptop size={18} />}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {session.browser} · {session.os}
                    </p>
                    <p className="text-xs text-gray-500">{session.location || 'Unknown location'}</p>
                  </div>
                </div>
                {session.is_current ? (
                  <span className="text-xs text-green-600 font-medium">Active now</span>
                ) : (
                  <span className="text-xs text-gray-400">Last active: {new Date(session.last_active).toLocaleString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BUSINESS */}
      {activeTab === 'business' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Business Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Name</label>
              <input type="text" value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input type="email" value={businessForm.email} onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
              <input type="text" value={businessForm.phone} onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Website</label>
              <input type="text" value={businessForm.website} onChange={(e) => setBusinessForm({ ...businessForm, website: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
              <input type="text" value={businessForm.country} onChange={(e) => setBusinessForm({ ...businessForm, country: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Currency</label>
              <select value={businessForm.currency} onChange={(e) => setBusinessForm({ ...businessForm, currency: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm">
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="USD">USD - US Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Industry</label>
              <input type="text" value={businessForm.industry} onChange={(e) => setBusinessForm({ ...businessForm, industry: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax ID</label>
              <input type="text" value={businessForm.tax_id} onChange={(e) => setBusinessForm({ ...businessForm, tax_id: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
            </div>
          </div>
          <button onClick={() => handleSave('business', businessForm, 'Business updated')} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Business
          </button>
        </div>
      )}

      {/* TEAM */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invite Team Member</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="teammate@company.com" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
              <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button onClick={handleSendInvite} disabled={saving || !inviteForm.email} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Send Invite
            </button>
            {inviteLink && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <div className="flex gap-2">
                  <input type="text" readOnly value={inviteLink} className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                  <button onClick={() => navigator.clipboard.writeText(inviteLink)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Team Members</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {data.team?.map((member: any) => (
                <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold">
                      {member.full_name?.charAt(0) || member.email?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.full_name}</p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs capitalize px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">{member.role}</span>
                    <span className={`text-xs px-3 py-1 rounded-full ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{member.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* APPS */}
      {activeTab === 'apps' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Apps</h3>
            <p className="text-sm text-gray-500 mt-1">Plan: <span className="capitalize font-medium">{data.subscription?.plan || 'free'}</span></p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {SAMI_APPS.map((app) => {
              const installed = data.apps?.find((a: any) => a.app_key === app.key);
              return (
                <div key={app.key} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{app.name}</p>
                    <p className="text-xs text-gray-500">
                      {installed?.enabled ? '✅ Enabled' : installed ? '⏸ Disabled (data preserved)' : '○ Not installed'}
                    </p>
                  </div>
                  {!installed ? (
                    <button onClick={() => handleInstallApp(app.key)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                      Install
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleApp(app.key, !installed.enabled)} className={`relative w-11 h-6 rounded-full transition ${installed.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${installed.enabled ? 'translate-x-5' : ''}`} />
                      </button>
                      <button onClick={() => handleUninstallApp(app.key)} className="p-2 rounded-lg text-gray-400 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI USAGE */}
      {activeTab === 'ai' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 dark:text-gray-400">Queries used</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {data.aiUsage?.query_count || 0} / {data.subscription?.ai_queries_limit || 100}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3">
                <div 
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((data.aiUsage?.query_count || 0) / (data.subscription?.ai_queries_limit || 100)) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Tokens used</span>
              <span className="font-medium text-gray-900 dark:text-white">{data.aiUsage?.tokens_used || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* API KEYS */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create API Key</h3>
            <div className="flex gap-3">
              <input type="text" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="Key name" className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              <button onClick={handleCreateApiKey} disabled={saving || !apiKeyName} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                Create
              </button>
            </div>
            {newApiKey && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400 mb-2">Copy this key now. You won't see it again!</p>
                <code className="block bg-white dark:bg-gray-800 p-3 rounded-lg text-sm break-all">{newApiKey}</code>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">API Keys</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {data.apiKeys?.map((key: any) => (
                <div key={key.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{key.name}</p>
                    <code className="text-xs text-gray-500">{key.key_preview}</code>
                  </div>
                  <button onClick={() => handleDeleteApiKey(key.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Log</h3>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data.auditLogs?.map((log: any) => (
              <div key={log.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{log.action}</p>
                  <span className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{log.full_name || 'System'} • {log.resource_type}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DANGER ZONE */}
      {activeTab === 'danger' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
          <div className="space-y-4">
            <div className="p-4 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Sign out all devices</p>
              <p className="text-xs text-gray-500 mt-1">Log out from all other devices.</p>
              <button onClick={handleLogoutAllSessions} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Sign Out All Devices
              </button>
            </div>
            <div className="p-4 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Delete Business</p>
              <p className="text-xs text-gray-500 mt-1">Permanently delete your business and all associated data.</p>
              <button onClick={handleDeleteBusiness} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Delete Business
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY MODAL */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={closeOverlay} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>
            <div className="text-center">
              {overlay.type === 'warning' && (
                <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle size={24} className="text-yellow-600" />
                </div>
              )}
              {overlay.type === 'confirm' && (
                <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle size={24} className="text-red-600" />
                </div>
              )}
              {overlay.type === 'success' && (
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check size={24} className="text-green-600" />
                </div>
              )}
              <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>
              <div className="mt-6 flex gap-3 justify-center">
                <button onClick={closeOverlay} className="px-5 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium">
                  Cancel
                </button>
                {overlay.onConfirm && (
                  <button onClick={overlay.onConfirm} className={`px-5 py-2.5 rounded-xl font-semibold text-white ${overlay.type === 'warning' ? 'bg-blue-600' : 'bg-red-600'}`}>
                    {overlay.action || 'Confirm'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}