'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Building2, 
  Users, 
  CreditCard,
  Key,
  History,
  AppWindow,
  Save, 
  Plus, 
  Loader2,
  Copy,
  Check,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { SAMI_APPS } from '@/lib/sami-apps';

function SettingsContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'general';
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [apiKeyName, setApiKeyName] = useState('');

  const [businessForm, setBusinessForm] = useState({
    name: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    country: '',
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    industry: '',
    tax_id: '',
    registration_number: '',
    business_type: '',
    employee_count: '',
    founded_year: '',
  });

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member',
  });

  useEffect(() => {
    fetchAllSettings();
  }, [activeTab]);

  const fetchAllSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, subRes, keysRes, logsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/subscription'),
        fetch('/api/settings/api-keys'),
        fetch('/api/settings/audit-logs'),
      ]);

      const settingsData = await settingsRes.json();
      const subData = await subRes.json();
      const keysData = await keysRes.json();
      const logsData = await logsRes.json();

      setData({
        business: settingsData.business,
        apps: settingsData.apps,
        team: settingsData.team,
        invites: settingsData.invites,
        subscription: subData.subscription,
        billing: subData.billing,
        enabledApps: subData.enabledApps,
        apiKeys: keysData.keys || [],
        auditLogs: logsData.logs || [],
      });

      setBusinessForm({
        name: settingsData.business.name || '',
        email: settingsData.business.email || '',
        phone: settingsData.business.phone || '',
        website: settingsData.business.website || '',
        address: settingsData.business.address || '',
        country: settingsData.business.country || '',
        currency: settingsData.business.currency || 'KES',
        timezone: settingsData.business.timezone || 'Africa/Nairobi',
        industry: settingsData.business.industry || '',
        tax_id: settingsData.business.tax_id || '',
        registration_number: settingsData.business.registration_number || '',
        business_type: settingsData.business.business_type || '',
        employee_count: settingsData.business.employee_count || '',
        founded_year: settingsData.business.founded_year || '',
      });

    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBusiness = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'business', data: businessForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      setMessage('Business profile saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to invite');
      setMessage(data.message || 'Invite sent');
      setInviteLink(data.inviteLink || '');
      setInvitedEmail(inviteForm.email);
      setInviteForm({ email: '', role: 'member' });
      fetchAllSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: apiKeyName, permissions: ['read'] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create key');
      setNewApiKey(data.key);
      setApiKeyName('');
      setMessage('API key created. Copy it now - you won\'t see it again!');
      fetchAllSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      if (!response.ok) throw new Error('Failed to delete');
      setMessage('API key deleted');
      fetchAllSettings();
    } catch (err) {
      setError('Failed to delete key');
    }
  };

  const handleInstallApp = async (appKey: string) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to install');
      setMessage(data.message);
      fetchAllSettings();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleApp = async (appKey: string, enabled: boolean) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings/apps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to toggle');
      setMessage(data.message);
      fetchAllSettings();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle');
    } finally {
      setSaving(false);
    }
  };

  const handleUninstallApp = async (appKey: string) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/settings/apps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to uninstall');
      setMessage(data.message);
      setConfirmUninstall(null);
      fetchAllSettings();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall');
    } finally {
      setSaving(false);
    }
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
      {message && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
          <Check size={16} />
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* BUSINESS PROFILE */}
      {activeTab === 'general' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Business Profile</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Name *</label>
              <input type="text" value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input type="email" value={businessForm.email} onChange={(e) => setBusinessForm({ ...businessForm, email: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
              <input type="text" value={businessForm.phone} onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Website</label>
              <input type="text" value={businessForm.website} onChange={(e) => setBusinessForm({ ...businessForm, website: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Country</label>
              <input type="text" value={businessForm.country} onChange={(e) => setBusinessForm({ ...businessForm, country: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Currency</label>
              <select value={businessForm.currency} onChange={(e) => setBusinessForm({ ...businessForm, currency: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none">
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Timezone</label>
              <select value={businessForm.timezone} onChange={(e) => setBusinessForm({ ...businessForm, timezone: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none">
                <option value="Africa/Nairobi">Africa/Nairobi</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Industry</label>
              <input type="text" value={businessForm.industry} onChange={(e) => setBusinessForm({ ...businessForm, industry: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tax ID</label>
              <input type="text" value={businessForm.tax_id} onChange={(e) => setBusinessForm({ ...businessForm, tax_id: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Registration Number</label>
              <input type="text" value={businessForm.registration_number} onChange={(e) => setBusinessForm({ ...businessForm, registration_number: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Business Type</label>
              <input type="text" value={businessForm.business_type} onChange={(e) => setBusinessForm({ ...businessForm, business_type: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" placeholder="e.g. Ltd, LLC, Sole Proprietor" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Address</label>
              <textarea value={businessForm.address} onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })} rows={3} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <button onClick={handleSaveBusiness} disabled={saving} className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Business Profile
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="teammate@company.com" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none">
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button onClick={handleSendInvite} disabled={saving || !inviteForm.email} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Send Invite
            </button>
            {inviteLink && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Share this link with {invitedEmail}:</p>
                <div className="flex gap-2">
                  <input type="text" readOnly value={inviteLink} className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white" />
                  <button onClick={() => { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
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
              {data.team.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold">
                      {member.full_name?.charAt(0) || member.email.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.full_name || 'Pending'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium capitalize px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">{member.role}</span>
                    <span className={`text-xs px-3 py-1 rounded-full ${member.status === 'active' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'}`}>{member.status}</span>
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Install, disable, or uninstall apps. Disabled apps keep their data.</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {SAMI_APPS.map((app) => {
              const installed = data.apps.find((a: any) => a.app_key === app.key);
              return (
                <div key={app.key} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{app.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{app.description}</p>
                      <p className="text-xs mt-1">
                        {installed?.enabled ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">● Enabled</span>
                        ) : installed ? (
                          <span className="text-yellow-600 dark:text-yellow-400 font-medium">● Disabled (data preserved)</span>
                        ) : (
                          <span className="text-gray-400">○ Not installed</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!installed ? (
                        <button onClick={() => handleInstallApp(app.key)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">Install</button>
                      ) : (
                        <>
                          <button onClick={() => handleToggleApp(app.key, !installed.enabled)} disabled={saving} className={`relative w-11 h-6 rounded-full transition ${installed.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${installed.enabled ? 'translate-x-5' : ''}`} />
                          </button>
                          <button onClick={() => setConfirmUninstall(app.key)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {confirmUninstall === app.key && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <AlertTriangle size={16} />
                        <p className="text-sm font-medium">Uninstall {app.name}?</p>
                      </div>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">This will delete all data and remove the schema. This action cannot be undone.</p>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleUninstallApp(app.key)} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition">Yes, Uninstall</button>
                        <button onClick={() => setConfirmUninstall(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* API KEYS */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create API Key</h3>
            <div className="flex gap-3">
              <input type="text" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="Key name (e.g. Production, Testing)" className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none" />
              <button onClick={handleCreateApiKey} disabled={saving || !apiKeyName} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
              </button>
            </div>
            {newApiKey && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
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
              {data.apiKeys.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No API keys created yet</p>
              ) : (
                data.apiKeys.map((key: any) => (
                  <div key={key.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{key.name}</p>
                      <code className="text-xs text-gray-500 dark:text-gray-400">{key.key_preview}</code>
                    </div>
                    <button onClick={() => handleDeleteApiKey(key.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Audit Logs</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Recent activity in your workspace</p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data.auditLogs.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No activity recorded yet</p>
            ) : (
              data.auditLogs.map((log: any) => (
                <div key={log.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{log.action}</p>
                    <span className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {log.full_name || log.email || 'System'} • {log.resource_type || 'N/A'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}