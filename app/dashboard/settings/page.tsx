'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  User, Shield, Monitor, Globe, Building2, Users, AppWindow,
  Sparkles, Key, CreditCard, AlertTriangle, Save, Loader2,
  Check, X, Plus, Trash2, Copy, Smartphone, Laptop, Download,
  ShieldCheck, ShieldOff, History, Mail, Camera
} from 'lucide-react';
import { SAMI_APPS } from '@/lib/sami-apps';
import AuditLogsSection from './components/AuditLogsSection';

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'profile';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<any>(null);

  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [businessForm, setBusinessForm] = useState({ name: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'member' });
  const [apiKeyName, setApiKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [preferencesForm, setPreferencesForm] = useState({ theme: 'system', dateFormat: 'DD/MM/YYYY', timeFormat: '24h' });

  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');

  useEffect(() => {
    fetchSettings();
  }, [activeTab]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setData(data);
      setProfileForm({
        firstName: data.profile?.firstName || '',
        lastName: data.profile?.lastName || '',
        phone: data.profile?.phone || '',
      });
      setBusinessForm({ name: data.tenant?.name || '' });
    } catch {
      setOverlay({ type: 'error', title: 'Failed', message: 'Could not load settings' });
    } finally {
      setLoading(false);
    }
  };

  const showOverlay = (type: string, title: string, message: string, action?: string, onConfirm?: () => void) => {
    setOverlay({ type, title, message, action, onConfirm });
  };
  const closeOverlay = () => setOverlay(null);

  const handleSave = async (section: string, body: any, msg: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data: body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showOverlay('success', 'Saved', msg);
      fetchSettings();
    } catch (err) {
      showOverlay('error', 'Failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // Avatar
  const handleSetAvatar = async () => {
    const fileId = prompt('Enter file ID:');
    if (!fileId) return;
    try {
      const response = await fetch('/api/settings/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      const data = await response.json();
      if (data.success) {
        showOverlay('success', 'Updated', data.message);
        fetchSettings();
      } else {
        showOverlay('error', 'Failed', data.error);
      }
    } catch {
      showOverlay('error', 'Failed', 'Could not update avatar');
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const response = await fetch('/api/settings/profile/avatar', { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        showOverlay('success', 'Removed', data.message);
        fetchSettings();
      } else {
        showOverlay('error', 'Failed', data.error);
      }
    } catch {
      showOverlay('error', 'Failed', 'Could not remove avatar');
    }
  };

  // Email Change
  const handleRequestEmailChange = async () => {
    if (!newEmail) {
      showOverlay('error', 'Missing Email', 'Please enter a new email address.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/profile/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail }),
      });
      const data = await response.json();
      if (data.success) {
        showOverlay('success', 'Code Sent', data.message);
      } else {
        showOverlay('error', 'Failed', data.error);
      }
    } catch {
      showOverlay('error', 'Failed', 'Could not send code');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    if (emailCode.length !== 6) {
      showOverlay('error', 'Invalid Code', 'Enter the 6-digit code from your email.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/settings/profile/verify-email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailCode }),
      });
      const data = await response.json();
      if (data.success) {
        showOverlay('success', 'Email Changed', data.message);
        setShowEmailChange(false);
        setNewEmail('');
        setEmailCode('');
        fetchSettings();
      } else {
        showOverlay('error', 'Failed', data.error);
      }
    } catch {
      showOverlay('error', 'Failed', 'Could not verify');
    } finally {
      setSaving(false);
    }
  };

  // 2FA
  const handleSetup2FA = async () => {
    setShow2FASetup(true);
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setQrCode(data.qrCodeDataUrl);
    } catch {
      showOverlay('error', 'Failed', 'Could not setup 2FA');
      setShow2FASetup(false);
    }
  };

  const handleVerify2FA = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFactorCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showOverlay('success', '2FA Enabled', data.message);
      setShow2FASetup(false);
      setTwoFactorCode('');
      fetchSettings();
    } catch (err) {
      showOverlay('error', 'Failed', err instanceof Error ? err.message : 'Could not verify');
    } finally {
      setSaving(false);
    }
  };

  // Team
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
      showOverlay('success', 'Invite Sent', data.message);
      fetchSettings();
    } catch (err) {
      showOverlay('error', 'Failed', err instanceof Error ? err.message : 'Could not send invite');
    } finally {
      setSaving(false);
    }
  };

  // API Keys
  const handleCreateApiKey = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: apiKeyName, scopes: ['read', 'write'] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNewApiKey(data.key);
      setApiKeyName('');
      fetchSettings();
      showOverlay('success', 'API Key Created', 'Copy this key now!');
    } catch {
      showOverlay('error', 'Failed', 'Could not create API key');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = (keyId: string) => {
    showOverlay('confirm', 'Revoke API Key', 'This key will be permanently revoked.', 'Revoke', async () => {
      await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      fetchSettings();
      closeOverlay();
    });
  };

  // Apps
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
          showOverlay('warning', 'Upgrade Required', data.message, 'Go to Billing', () => router.push('/dashboard/settings/subscription'));
          return;
        }
        throw new Error(data.error);
      }
      showOverlay('success', 'Installed', data.message);
      fetchSettings();
    } catch {
      showOverlay('error', 'Failed', 'Could not install app');
    } finally {
      setSaving(false);
    }
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
      if (!response.ok) throw new Error(data.error);
      showOverlay('success', 'Updated', data.message);
      fetchSettings();
    } catch {
      showOverlay('error', 'Failed', 'Could not update app');
    } finally {
      setSaving(false);
    }
  };

  const handleUninstallApp = (appKey: string) => {
    showOverlay('confirm', 'Uninstall App', 'This will delete all data.', 'Uninstall', async () => {
      await fetch('/api/settings/apps', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey }),
      });
      fetchSettings();
      closeOverlay();
    });
  };

  const handleLogoutAll = () => {
    showOverlay('confirm', 'Sign Out All Devices', 'You will be logged out everywhere except here.', 'Sign Out All', async () => {
      await fetch('/api/auth/logout-all', { method: 'POST' });
      fetchSettings();
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
      {/* PROFILE */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Profile Picture */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Camera size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profile Picture</h3>
            </div>
            <div className="flex items-center gap-6">
              <div className="h-20 w-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                {data.profile?.firstName?.charAt(0) || 'U'}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button onClick={handleSetAvatar} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Set Avatar</button>
                  {data.profile?.avatarFileId && (
                    <button onClick={handleRemoveAvatar} className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50">Remove</button>
                  )}
                </div>
                <p className="text-xs text-gray-500">Max 5MB. JPG, PNG, WebP, GIF</p>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Personal Information</h3>
            </div>
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <span className={`text-sm font-medium capitalize px-3 py-1 rounded-full ${data.profile?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {data.profile?.status || 'active'}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-1.5">First Name</label>
                <input type="text" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Last Name</label>
                <input type="text" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Phone</label>
                <input type="text" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+254 700 000 000" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              </div>
            </div>
            <button onClick={() => handleSave('profile', profileForm, 'Profile updated')} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Profile
            </button>
          </div>

          {/* Email */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Email Address</h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{data.profile?.email}</p>
                <p className="text-xs text-gray-500 mt-1">{data.profile?.emailVerifiedAt ? '✓ Verified' : '⚠ Not verified'}</p>
              </div>
              <button onClick={() => { setShowEmailChange(!showEmailChange); setNewEmail(''); setEmailCode(''); }} className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                {showEmailChange ? 'Cancel' : 'Change Email'}
              </button>
            </div>
            {showEmailChange && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">New Email Address</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
                </div>
                <button onClick={handleRequestEmailChange} disabled={saving || !newEmail} className="w-full px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                  Send Verification Code
                </button>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Verification Code</label>
                  <input type="text" maxLength={6} value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/[^0-9]/g, ''))} placeholder="000000" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-center text-2xl tracking-[0.5em]" />
                </div>
                <button onClick={handleVerifyEmailChange} disabled={saving || emailCode.length !== 6} className="w-full px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50">
                  Verify & Change Email
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECURITY */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold">Change Password</h3>
            </div>
            <div className="space-y-4">
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="Current Password" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="New Password (min 8)" className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              <button onClick={() => handleSave('password', passwordForm, 'Password changed')} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Change Password
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>
              </div>
              {data.profile?.twoFactorEnabled ? <ShieldCheck size={24} className="text-green-600" /> : <ShieldOff size={24} className="text-gray-400" />}
            </div>
            {show2FASetup && qrCode && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
                <img src={qrCode} alt="2FA QR" className="mx-auto w-40 h-40" />
                <div className="mt-3 flex gap-2 max-w-xs mx-auto">
                  <input type="text" maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, ''))} className="flex-1 rounded-lg border px-3 py-2 text-center text-xl tracking-widest" placeholder="000000" />
                  <button onClick={handleVerify2FA} disabled={saving || twoFactorCode.length !== 6} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Verify</button>
                </div>
              </div>
            )}
            {!data.profile?.twoFactorEnabled ? (
              <button onClick={handleSetup2FA} className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">Enable 2FA</button>
            ) : (
              <button onClick={() => showOverlay('confirm', 'Disable 2FA', 'Enter password to disable.', 'Disable', closeOverlay)} className="mt-4 px-5 py-2.5 border border-red-300 text-red-600 rounded-xl font-semibold hover:bg-red-50">Disable 2FA</button>
            )}
          </div>
        </div>
      )}

      {/* SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold">Devices & Sessions</h3>
            </div>
            <button onClick={handleLogoutAll} className="text-sm text-red-600 hover:underline">Sign out all</button>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {data.sessions?.map((session: any) => (
              <div key={session.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {session.device_type === 'mobile' ? <Smartphone size={18} /> : <Laptop size={18} />}
                  <div>
                    <p className="text-sm font-medium">{session.browser} · {session.operating_system}</p>
                    <p className="text-xs text-gray-500">{session.ip_address}</p>
                  </div>
                </div>
                {session.is_current ? <span className="text-xs text-green-600">Active now</span> : <span className="text-xs text-gray-400">{new Date(session.last_active_at).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} className="text-blue-600" />
            <h3 className="text-lg font-semibold">Preferences</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Theme</label>
              <select value={preferencesForm.theme} onChange={(e) => setPreferencesForm({ ...preferencesForm, theme: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Date Format</label>
              <select value={preferencesForm.dateFormat} onChange={(e) => setPreferencesForm({ ...preferencesForm, dateFormat: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm">
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
          </div>
          <button onClick={() => handleSave('preferences', preferencesForm, 'Preferences saved')} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      )}

      {/* BUSINESS */}
      {activeTab === 'business' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={18} className="text-blue-600" />
            <h3 className="text-lg font-semibold">Business</h3>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Business Name</label>
            <input type="text" value={businessForm.name} onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })} className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
          </div>
          <button onClick={() => handleSave('business', businessForm, 'Business updated')} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      )}

      {/* TEAM */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold">Invite Team Member</h3>
            </div>
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
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Send Invite
            </button>
            {inviteLink && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl">
                <div className="flex gap-2">
                  <input type="text" readOnly value={inviteLink} className="flex-1 rounded-lg border px-3 py-2 text-sm" />
                  <button onClick={() => navigator.clipboard.writeText(inviteLink)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"><Copy size={14} /></button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold">Team Members</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {data.team?.map((member: any) => (
                <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-semibold">
                      {member.full_name?.charAt(0) || member.email?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{member.full_name}</p>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  <span className="text-xs capitalize px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">{member.role}</span>
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
            <div className="flex items-center gap-2">
              <AppWindow size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold">Manage Apps</h3>
            </div>
            <p className="text-sm text-gray-500 mt-1">Plan: <span className="capitalize">{data.subscription?.plan_name || 'free'}</span></p>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {SAMI_APPS.map((app) => {
              const installed = data.modules?.find((m: any) => m.key === app.key);
              return (
                <div key={app.key} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{app.name}</p>
                    <p className="text-xs text-gray-500">{installed?.status === 'installed' ? '✅ Installed' : '○ Not installed'}</p>
                  </div>
                  {!installed || installed.status !== 'installed' ? (
                    <button onClick={() => handleInstallApp(app.key)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Install</button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleApp(app.key, installed.status !== 'installed')} className={`relative w-11 h-6 rounded-full ${installed.status === 'installed' ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${installed.status === 'installed' ? 'translate-x-5' : ''}`} />
                      </button>
                      <button onClick={() => handleUninstallApp(app.key)} className="p-2 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
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
            <div className="flex items-center gap-2 mb-4">
              <Key size={18} className="text-blue-600" />
              <h3 className="text-lg font-semibold">Create API Key</h3>
            </div>
            <div className="flex gap-3">
              <input type="text" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="Key name" className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm" />
              <button onClick={handleCreateApiKey} disabled={saving || !apiKeyName} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50">Create</button>
            </div>
            {newApiKey && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p className="text-sm font-medium mb-2">Copy this key now!</p>
                <code className="block bg-white dark:bg-gray-800 p-3 rounded-lg text-sm break-all">{newApiKey}</code>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800"><h3 className="text-lg font-semibold">API Keys</h3></div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {data.apiKeys?.map((key: any) => (
                <div key={key.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{key.name}</p>
                    <code className="text-xs text-gray-500">{key.key_preview}</code>
                  </div>
                  <button onClick={() => handleDeleteApiKey(key.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOGS */}
      {activeTab === 'audit-logs' && <AuditLogsSection />}

      {/* DANGER */}
      {activeTab === 'danger' && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-red-200 dark:border-red-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-600" />
            <h3 className="text-lg font-semibold text-red-600">Danger Zone</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm font-semibold">Sign out all devices</p>
              <button onClick={handleLogoutAll} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Sign Out All</button>
            </div>
            <div className="p-4 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-sm font-semibold">Export Data</p>
              <button className="mt-3 flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm"><Download size={14} /> Export</button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button onClick={closeOverlay} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} className="text-gray-500" /></button>
            <div className="text-center">
              {overlay.type === 'warning' && <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto"><AlertTriangle size={24} className="text-yellow-600" /></div>}
              {overlay.type === 'confirm' && <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto"><AlertTriangle size={24} className="text-red-600" /></div>}
              {overlay.type === 'success' && <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto"><Check size={24} className="text-green-600" /></div>}
              {overlay.type === 'error' && <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto"><X size={24} className="text-red-600" /></div>}
              <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>
              <div className="mt-6 flex gap-3 justify-center">
                <button onClick={closeOverlay} className="px-5 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium">Cancel</button>
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