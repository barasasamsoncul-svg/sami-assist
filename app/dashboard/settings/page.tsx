'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  User,
  Shield,
  Monitor,
  Globe,
  Building2,
  Users,
  AppWindow,
  Key,
  AlertTriangle,
  Save,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Copy,
  Smartphone,
  Laptop,
  Download,
  ShieldCheck,
  ShieldOff,
  Mail,
  Camera,
  Lock,
  Eye,
  EyeOff,
  Bell,
  Languages,
  Clock3,
  ChevronRight,
  CheckCircle2,
  Info,
  RefreshCw,
  LogOut,
  UserPlus,
  Settings2,
  Sparkles,
  ExternalLink,
  MoreHorizontal,
  CircleHelp,
  FileText,
  Database,
  Fingerprint,
  KeyRound,
  UserRoundCheck,
  BadgeCheck,
  AlertCircle,
} from 'lucide-react';

import { SAMI_APPS } from '@/lib/sami-apps';
import AuditLogsSection from './components/AuditLogsSection';

type OverlayType =
  | 'success'
  | 'error'
  | 'warning'
  | 'confirm'
  | 'info';

type OverlayState = {
  type: OverlayType;
  title: string;
  message: string;
  action?: string;
  onConfirm?: () => void;
};

type SettingsData = {
  profile?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    status?: string;
    avatarFileId?: string | null;
    emailVerifiedAt?: string | null;
    twoFactorEnabled?: boolean;
    createdAt?: string;
  };
  tenant?: {
    id?: string;
    name?: string;
    slug?: string;
    businessType?: string;
    industry?: string;
    phone?: string;
    email?: string;
    website?: string;
    country?: string;
    timezone?: string;
  };
  subscription?: {
    plan_name?: string;
    status?: string;
  };
  sessions?: any[];
  team?: any[];
  invitations?: any[];
  modules?: any[];
  apiKeys?: any[];
  preferences?: {
    theme?: string;
    dateFormat?: string;
    timeFormat?: string;
    language?: string;
    timezone?: string;
    notifications?: {
      email?: boolean;
      product?: boolean;
      security?: boolean;
      team?: boolean;
    };
  };
};

const inputClass =
  'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 placeholder:text-gray-400';

const selectClass =
  'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10';

const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 transition hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50';

const dangerButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50';

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  action,
  danger = false,
}: {
  icon: any;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-gray-900 ${
        danger
          ? 'border-red-200 dark:border-red-900/70'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6 dark:border-gray-800">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              danger
                ? 'bg-red-50 text-red-600 dark:bg-red-950/40'
                : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40'
            }`}
          >
            <Icon size={19} />
          </div>

          <div>
            <h2
              className={`text-base font-bold ${
                danger
                  ? 'text-red-600'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {title}
            </h2>

            {description && (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
        </div>

        {action}
      </div>

      <div className="p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
        {label}
      </label>

      {children}

      {hint && (
        <p className="mt-1.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center dark:border-gray-700">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <Icon size={22} />
      </div>

      <h3 className="mt-4 text-sm font-bold text-gray-900 dark:text-white">
        {title}
      </h3>

      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        enabled
          ? 'bg-blue-600'
          : 'bg-gray-300 dark:bg-gray-700'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const score = useMemo(() => {
    let value = 0;

    if (password.length >= 8) value++;
    if (password.length >= 12) value++;
    if (/[A-Z]/.test(password)) value++;
    if (/[0-9]/.test(password)) value++;
    if (/[^A-Za-z0-9]/.test(password)) value++;

    return Math.min(value, 5);
  }, [password]);

  if (!password) return null;

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];

  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index < score ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-gray-500">Password strength</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {labels[score]}
        </span>
      </div>
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  /*
   * Navigation is intentionally NOT implemented here.
   * Your existing sidebar remains responsible for changing ?tab=...
   */
  const activeTab = searchParams.get('tab') || 'profile';

  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [businessForm, setBusinessForm] = useState({
    name: '',
    businessType: '',
    industry: '',
    phone: '',
    email: '',
    website: '',
    country: '',
    timezone: '',
  });

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member',
  });

  const [apiKeyName, setApiKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');

  const [inviteLink, setInviteLink] = useState('');

  const [preferencesForm, setPreferencesForm] = useState({
    theme: 'system',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    language: 'en',
    timezone: 'Africa/Nairobi',
  });

  const [notificationForm, setNotificationForm] = useState({
    email: true,
    product: true,
    security: true,
    team: true,
  });

  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [showEmailChange, setShowEmailChange] = useState(false);
  const [emailStep, setEmailStep] = useState<'email' | 'verify'>('email');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'GET',
        cache: 'no-store',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to load settings');
      }

      setData(result);

      setProfileForm({
        firstName: result.profile?.firstName || '',
        lastName: result.profile?.lastName || '',
        phone: result.profile?.phone || '',
      });

      setBusinessForm({
        name: result.tenant?.name || '',
        businessType: result.tenant?.businessType || '',
        industry: result.tenant?.industry || '',
        phone: result.tenant?.phone || '',
        email: result.tenant?.email || '',
        website: result.tenant?.website || '',
        country: result.tenant?.country || '',
        timezone:
          result.tenant?.timezone ||
          result.preferences?.timezone ||
          'Africa/Nairobi',
      });

      setPreferencesForm({
        theme: result.preferences?.theme || 'system',
        dateFormat: result.preferences?.dateFormat || 'DD/MM/YYYY',
        timeFormat: result.preferences?.timeFormat || '24h',
        language: result.preferences?.language || 'en',
        timezone:
          result.preferences?.timezone || 'Africa/Nairobi',
      });

      setNotificationForm({
        email: result.preferences?.notifications?.email ?? true,
        product: result.preferences?.notifications?.product ?? true,
        security: result.preferences?.notifications?.security ?? true,
        team: result.preferences?.notifications?.team ?? true,
      });
    } catch (error) {
      showOverlay(
        'error',
        'Unable to load settings',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const showOverlay = (
    type: OverlayType,
    title: string,
    message: string,
    action?: string,
    onConfirm?: () => void
  ) => {
    setOverlay({
      type,
      title,
      message,
      action,
      onConfirm,
    });
  };

  const closeOverlay = () => setOverlay(null);

  const handleSave = async (
    section: string,
    body: any,
    message: string
  ) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          section,
          data: body,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Unable to save changes');
      }

      showOverlay('success', 'Changes saved', message);

      await fetchSettings();
    } catch (error) {
      showOverlay(
        'error',
        'Could not save changes',
        error instanceof Error
          ? error.message
          : 'Something went wrong.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleProfileSave = () => {
    if (!profileForm.firstName.trim()) {
      showOverlay(
        'error',
        'First name required',
        'Please enter your first name.'
      );
      return;
    }

    handleSave(
      'profile',
      {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
      },
      'Your personal information has been updated.'
    );
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword) {
      showOverlay(
        'error',
        'Current password required',
        'Enter your current password first.'
      );
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      showOverlay(
        'error',
        'Password too short',
        'Your new password must contain at least 8 characters.'
      );
      return;
    }

    if (
      passwordForm.newPassword !== passwordForm.confirmPassword
    ) {
      showOverlay(
        'error',
        'Passwords do not match',
        'Make sure the new password and confirmation are identical.'
      );
      return;
    }

    await handleSave(
      'password',
      {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      },
      'Your password has been changed successfully.'
    );

    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  };

  const handleSetAvatar = async (
    event?: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event?.target.files?.[0];

    if (!file) return;

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowed.includes(file.type)) {
      showOverlay(
        'error',
        'Unsupported image',
        'Use JPG, PNG, WebP, or GIF.'
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showOverlay(
        'error',
        'Image too large',
        'Your profile image must be smaller than 5MB.'
      );
      return;
    }

    /*
     * Your current avatar API expects a fileId.
     * Therefore this UI deliberately does not pretend to upload
     * the binary file directly.
     *
     * If your file system later exposes an upload endpoint,
     * connect the upload step here and then send its fileId
     * to /api/settings/profile/avatar.
     */
    showOverlay(
      'info',
      'Upload integration required',
      'Your avatar endpoint currently accepts a fileId. Connect your file-upload endpoint here to finish direct avatar uploads.'
    );
  };

  const handleRemoveAvatar = () => {
    showOverlay(
      'confirm',
      'Remove profile picture?',
      'Your profile picture will be removed from your account.',
      'Remove',
      async () => {
        try {
          const response = await fetch(
            '/api/settings/profile/avatar',
            {
              method: 'DELETE',
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || 'Could not remove avatar'
            );
          }

          closeOverlay();

          showOverlay(
            'success',
            'Profile picture removed',
            result.message || 'Your profile picture has been removed.'
          );

          await fetchSettings();
        } catch (error) {
          closeOverlay();

          showOverlay(
            'error',
            'Could not remove picture',
            error instanceof Error
              ? error.message
              : 'Please try again.'
          );
        }
      }
    );
  };

  const handleRequestEmailChange = async () => {
    const normalized = newEmail.trim().toLowerCase();

    if (!normalized) {
      showOverlay(
        'error',
        'Email required',
        'Enter the new email address.'
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      showOverlay(
        'error',
        'Invalid email',
        'Enter a valid email address.'
      );
      return;
    }

    if (
      normalized ===
      String(data?.profile?.email || '').toLowerCase()
    ) {
      showOverlay(
        'error',
        'Same email address',
        'The new email is already your current email.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        '/api/settings/profile/change-email',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            newEmail: normalized,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not start email change'
        );
      }

      setEmailStep('verify');

      showOverlay(
        'success',
        'Verification code sent',
        result.message ||
          `We sent a 6-digit verification code to ${normalized}.`
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not send code',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmailChange = async () => {
    if (!/^\d{6}$/.test(emailCode)) {
      showOverlay(
        'error',
        'Invalid code',
        'Enter the 6-digit verification code from your email.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        '/api/settings/profile/verify-email-change',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: emailCode,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not verify email'
        );
      }

      setShowEmailChange(false);
      setEmailStep('email');
      setNewEmail('');
      setEmailCode('');

      await fetchSettings();

      showOverlay(
        'success',
        'Email changed successfully',
        result.message ||
          'Your account email address has been updated.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Verification failed',
        error instanceof Error
          ? error.message
          : 'The verification code could not be accepted.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSetup2FA = async () => {
    setSaving(true);
    setShow2FASetup(true);

    try {
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not start 2FA setup'
        );
      }

      setQrCode(result.qrCodeDataUrl || '');
    } catch (error) {
      setShow2FASetup(false);

      showOverlay(
        'error',
        'Could not set up 2FA',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!/^\d{6}$/.test(twoFactorCode)) {
      showOverlay(
        'error',
        'Invalid code',
        'Enter the 6-digit authenticator code.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: twoFactorCode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not verify 2FA'
        );
      }

      setShow2FASetup(false);
      setTwoFactorCode('');
      setQrCode('');

      await fetchSettings();

      showOverlay(
        'success',
        'Two-factor authentication enabled',
        result.message ||
          'Your account now has an additional layer of protection.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not verify 2FA',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisable2FA = () => {
    showOverlay(
      'confirm',
      'Disable two-factor authentication?',
      'This reduces the protection on your account. You can enable it again later.',
      'Disable 2FA',
      async () => {
        /*
         * IMPORTANT:
         * Add a real authenticated disable endpoint before
         * enabling this action in production.
         */
        try {
          const response = await fetch(
            '/api/auth/2fa/disable',
            {
              method: 'POST',
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || 'Could not disable 2FA'
            );
          }

          closeOverlay();
          await fetchSettings();

          showOverlay(
            'success',
            '2FA disabled',
            result.message ||
              'Two-factor authentication has been disabled.'
          );
        } catch (error) {
          closeOverlay();

          showOverlay(
            'error',
            'Could not disable 2FA',
            error instanceof Error
              ? error.message
              : 'Please try again.'
          );
        }
      }
    );
  };

  const handleSendInvite = async () => {
    const email = inviteForm.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showOverlay(
        'error',
        'Invalid email',
        'Enter a valid team member email address.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          role: inviteForm.role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not send invitation'
        );
      }

      setInviteLink(result.inviteLink || '');
      setInviteForm({
        email: '',
        role: 'member',
      });

      await fetchSettings();

      showOverlay(
        'success',
        'Invitation sent',
        result.message ||
          'The team member has been invited.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not send invitation',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApiKey = async () => {
    const name = apiKeyName.trim();

    if (!name) {
      showOverlay(
        'error',
        'Name required',
        'Give your API key a recognizable name.'
      );
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          scopes: ['read', 'write'],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not create API key'
        );
      }

      setNewApiKey(result.key || '');
      setApiKeyName('');

      await fetchSettings();

      showOverlay(
        'success',
        'API key created',
        'Copy your API key now. For security, it may not be shown again.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not create API key',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApiKey = (keyId: string) => {
    showOverlay(
      'confirm',
      'Revoke API key?',
      'Applications using this key will immediately lose access.',
      'Revoke key',
      async () => {
        try {
          const response = await fetch(
            '/api/settings/api-keys',
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                keyId,
              }),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || 'Could not revoke key'
            );
          }

          closeOverlay();
          await fetchSettings();

          showOverlay(
            'success',
            'API key revoked',
            'The API key can no longer be used.'
          );
        } catch (error) {
          closeOverlay();

          showOverlay(
            'error',
            'Could not revoke key',
            error instanceof Error
              ? error.message
              : 'Please try again.'
          );
        }
      }
    );
  };

  const handleInstallApp = async (appKey: string) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appKey,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error === 'upgrade_required') {
          showOverlay(
            'warning',
            'Upgrade required',
            result.message ||
              'This app is not available on your current plan.',
            'View subscription',
            () =>
              router.push(
                '/dashboard/settings/subscription'
              )
          );
          return;
        }

        throw new Error(
          result.error || 'Could not install app'
        );
      }

      await fetchSettings();

      showOverlay(
        'success',
        'App installed',
        result.message ||
          'The app is now available in your workspace.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not install app',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleApp = async (
    appKey: string,
    enabled: boolean
  ) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/apps', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          appKey,
          enabled,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || 'Could not update app'
        );
      }

      await fetchSettings();

      showOverlay(
        'success',
        enabled ? 'App enabled' : 'App disabled',
        result.message ||
          (enabled
            ? 'The app is now active.'
            : 'The app has been disabled.')
      );
    } catch (error) {
      showOverlay(
        'error',
        'Could not update app',
        error instanceof Error
          ? error.message
          : 'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUninstallApp = (appKey: string) => {
    showOverlay(
      'confirm',
      'Uninstall app?',
      'This may remove data associated with this app. Make sure you understand what will be deleted before continuing.',
      'Uninstall',
      async () => {
        try {
          const response = await fetch(
            '/api/settings/apps',
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                appKey,
              }),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || 'Could not uninstall app'
            );
          }

          closeOverlay();
          await fetchSettings();

          showOverlay(
            'success',
            'App uninstalled',
            result.message ||
              'The app has been removed from your workspace.'
          );
        } catch (error) {
          closeOverlay();

          showOverlay(
            'error',
            'Could not uninstall app',
            error instanceof Error
              ? error.message
              : 'Please try again.'
          );
        }
      }
    );
  };

  const handleLogoutAll = () => {
    showOverlay(
      'confirm',
      'Sign out all other devices?',
      'Every other active session will be signed out. Your current session will remain active.',
      'Sign out all',
      async () => {
        try {
          const response = await fetch(
            '/api/auth/logout-all',
            {
              method: 'POST',
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || 'Could not sign out devices'
            );
          }

          closeOverlay();
          await fetchSettings();

          showOverlay(
            'success',
            'Sessions secured',
            result.message ||
              'All other devices have been signed out.'
          );
        } catch (error) {
          closeOverlay();

          showOverlay(
            'error',
            'Could not sign out devices',
            error instanceof Error
              ? error.message
              : 'Please try again.'
          );
        }
      }
    );
  };

  const handleExportData = () => {
    showOverlay(
      'info',
      'Data export',
      'Your export endpoint is not connected yet. Once implemented, this action should generate a secure downloadable archive of your account data.'
    );
  };

  const fullName =
    data?.profile?.fullName ||
    `${data?.profile?.firstName || ''} ${
      data?.profile?.lastName || ''
    }`.trim() ||
    'Your account';

  const initials =
    `${data?.profile?.firstName?.charAt(0) || ''}${
      data?.profile?.lastName?.charAt(0) || ''
    }`.toUpperCase() || 'U';

  const profileCompletion = useMemo(() => {
    if (!data?.profile) return 0;

    const checks = [
      !!data.profile.firstName,
      !!data.profile.lastName,
      !!data.profile.phone,
      !!data.profile.email,
      !!data.profile.emailVerifiedAt,
      !!data.profile.twoFactorEnabled,
    ];

    return Math.round(
      (checks.filter(Boolean).length / checks.length) * 100
    );
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-3 h-4 w-64 rounded bg-gray-100 dark:bg-gray-800" />
          <div className="mt-6 h-24 rounded-xl bg-gray-100 dark:bg-gray-800" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-900" />
          <div className="h-72 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-900" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
        <AlertCircle className="mx-auto text-red-600" size={32} />
        <h2 className="mt-4 font-bold text-red-700 dark:text-red-400">
          Settings unavailable
        </h2>
        <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
          We couldn't load your account settings.
        </p>

        <button
          onClick={fetchSettings}
          className={`${secondaryButton} mt-5`}
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10">
      {/* ACCOUNT HEADER */}
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="relative h-28 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_25%),radial-gradient(circle_at_80%_30%,white_0,transparent_25%)]" />
        </div>

        <div className="px-6 pb-6 sm:px-8">
          <div className="-mt-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt=""
                    className="h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-lg dark:border-gray-900"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white shadow-lg dark:border-gray-900">
                    {initials}
                  </div>
                )}

                {data.profile?.emailVerifiedAt && (
                  <div className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-green-500 text-white dark:border-gray-900">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </div>

              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-950 dark:text-white">
                    {fullName}
                  </h1>

                  {data.profile?.status && (
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold capitalize text-green-700 dark:bg-green-950/40 dark:text-green-400">
                      {data.profile.status}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {data.profile?.email}
                </p>
              </div>
            </div>

            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Profile completion
              </p>

              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{
                      width: `${profileCompletion}%`,
                    }}
                  />
                </div>

                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {profileCompletion}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <SectionCard
            icon={User}
            title="Personal information"
            description="Manage the personal details associated with your SaMi account."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name">
                <input
                  value={profileForm.firstName}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      firstName: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="First name"
                />
              </Field>

              <Field label="Last name">
                <input
                  value={profileForm.lastName}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      lastName: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Last name"
                />
              </Field>

              <Field
                label="Phone number"
                hint="Use an international format where possible."
              >
                <input
                  value={profileForm.phone}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      phone: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="+254 700 000 000"
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleProfileSave}
                disabled={saving}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}
                Save changes
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={Camera}
            title="Profile picture"
            description="Use a clear image so teammates can recognize you easily."
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-2xl font-bold text-white">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials
                )}
              </div>

              <div>
                <div className="flex flex-wrap gap-2">
                  <label className={secondaryButton}>
                    <Camera size={16} />
                    Choose image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleSetAvatar}
                    />
                  </label>

                  {data.profile?.avatarFileId && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  )}
                </div>

                <p className="mt-3 text-xs text-gray-500">
                  JPG, PNG, WebP or GIF · Maximum 5MB
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Mail}
            title="Email address"
            description="Your email is used for account access, security notifications and important communications."
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Mail size={19} />
                </div>

                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {data.profile?.email}
                  </p>

                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    {data.profile?.emailVerifiedAt ? (
                      <>
                        <CheckCircle2
                          size={14}
                          className="text-green-600"
                        />
                        <span className="text-green-600">
                          Verified
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle
                          size={14}
                          className="text-amber-600"
                        />
                        <span className="text-amber-600">
                          Not verified
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowEmailChange(!showEmailChange);
                  setEmailStep('email');
                  setNewEmail('');
                  setEmailCode('');
                }}
                className={secondaryButton}
              >
                <Mail size={16} />
                {showEmailChange ? 'Cancel' : 'Change email'}
              </button>
            </div>

            {showEmailChange && (
              <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
                {emailStep === 'email' ? (
                  <>
                    <div className="mb-5">
                      <h3 className="font-bold text-gray-900 dark:text-white">
                        Enter your new email
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        We'll send a 6-digit verification code to the new address.
                      </p>
                    </div>

                    <Field label="New email address">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) =>
                          setNewEmail(e.target.value)
                        }
                        className={inputClass}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </Field>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleRequestEmailChange}
                        disabled={saving || !newEmail}
                        className={primaryButton}
                      >
                        {saving && (
                          <Loader2
                            size={16}
                            className="animate-spin"
                          />
                        )}
                        Send verification code
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-5 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40">
                        <Mail size={21} />
                      </div>

                      <h3 className="mt-4 font-bold text-gray-900 dark:text-white">
                        Check your email
                      </h3>

                      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                        Enter the 6-digit code sent to{' '}
                        <strong className="text-gray-700 dark:text-gray-300">
                          {newEmail}
                        </strong>
                      </p>
                    </div>

                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) =>
                        setEmailCode(
                          e.target.value.replace(/\D/g, '')
                        )
                      }
                      className={`${inputClass} text-center text-2xl font-bold tracking-[0.45em]`}
                      placeholder="000000"
                    />

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                      <button
                        onClick={() => {
                          setEmailStep('email');
                          setEmailCode('');
                        }}
                        className={secondaryButton}
                      >
                        Change email
                      </button>

                      <button
                        onClick={handleVerifyEmailChange}
                        disabled={
                          saving || emailCode.length !== 6
                        }
                        className={primaryButton}
                      >
                        {saving && (
                          <Loader2
                            size={16}
                            className="animate-spin"
                          />
                        )}
                        Verify & change email
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* SECURITY */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <SectionCard
            icon={Shield}
            title="Account security"
            description="Protect your account with a strong password and additional verification."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-green-50 p-2.5 text-green-600 dark:bg-green-950/40">
                    <Lock size={18} />
                  </div>

                  <div>
                    <p className="text-sm font-bold">
                      Password
                    </p>
                    <p className="text-xs text-green-600">
                      Protected
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-xl p-2.5 ${
                      data.profile?.twoFactorEnabled
                        ? 'bg-green-50 text-green-600 dark:bg-green-950/40'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'
                    }`}
                  >
                    <Fingerprint size={18} />
                  </div>

                  <div>
                    <p className="text-sm font-bold">2FA</p>
                    <p
                      className={`text-xs ${
                        data.profile?.twoFactorEnabled
                          ? 'text-green-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {data.profile?.twoFactorEnabled
                        ? 'Enabled'
                        : 'Not enabled'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/40">
                    <Mail size={18} />
                  </div>

                  <div>
                    <p className="text-sm font-bold">
                      Email
                    </p>
                    <p className="text-xs text-blue-600">
                      {data.profile?.emailVerifiedAt
                        ? 'Verified'
                        : 'Needs verification'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={KeyRound}
            title="Change password"
            description="Use a unique password that you don't use for other services."
          >
            <div className="grid gap-5">
              <Field label="Current password">
                <div className="relative">
                  <input
                    type={
                      showCurrentPassword
                        ? 'text'
                        : 'password'
                    }
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value,
                      })
                    }
                    className={`${inputClass} pr-12`}
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowCurrentPassword(
                        !showCurrentPassword
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="New password"
                  hint="Use at least 8 characters. A longer password is recommended."
                >
                  <div className="relative">
                    <input
                      type={
                        showNewPassword ? 'text' : 'password'
                      }
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({
                          ...passwordForm,
                          newPassword: e.target.value,
                        })
                      }
                      className={`${inputClass} pr-12`}
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowNewPassword(
                          !showNewPassword
                        )
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showNewPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>

                  <PasswordStrength
                    password={passwordForm.newPassword}
                  />
                </Field>

                <Field label="Confirm new password">
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirmPassword: e.target.value,
                      })
                    }
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </Field>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handlePasswordChange}
                  disabled={saving}
                  className={primaryButton}
                >
                  {saving ? (
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Lock size={17} />
                  )}
                  Update password
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={ShieldCheck}
            title="Two-factor authentication"
            description="Use an authenticator app to protect your account even if your password is compromised."
          >
            {data.profile?.twoFactorEnabled ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-900/60 dark:bg-green-950/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 text-green-600"
                      size={22}
                    />

                    <div>
                      <p className="font-bold text-green-800 dark:text-green-400">
                        Two-factor authentication is enabled
                      </p>

                      <p className="mt-1 text-sm text-green-700/80 dark:text-green-400/70">
                        Your account has an additional authentication layer.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleDisable2FA}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-gray-900"
                  >
                    <ShieldOff size={16} />
                    Disable
                  </button>
                </div>
              </div>
            ) : show2FASetup ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="grid gap-8 md:grid-cols-[auto_1fr]">
                  <div className="flex justify-center">
                    {qrCode ? (
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <img
                          src={qrCode}
                          alt="Scan this QR code with your authenticator app"
                          className="h-52 w-52"
                        />
                      </div>
                    ) : (
                      <div className="flex h-52 w-52 items-center justify-center rounded-2xl bg-white">
                        <Loader2
                          size={28}
                          className="animate-spin text-blue-600"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      Set up your authenticator
                    </p>

                    <ol className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          1
                        </span>
                        Install an authenticator app on your phone.
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          2
                        </span>
                        Scan the QR code shown here.
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          3
                        </span>
                        Enter the 6-digit code generated by the app.
                      </li>
                    </ol>

                    <div className="mt-6 flex max-w-sm gap-2">
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={twoFactorCode}
                        onChange={(e) =>
                          setTwoFactorCode(
                            e.target.value.replace(/\D/g, '')
                          )
                        }
                        className={`${inputClass} text-center text-xl font-bold tracking-[0.35em]`}
                        placeholder="000000"
                      />

                      <button
                        onClick={handleVerify2FA}
                        disabled={
                          saving ||
                          twoFactorCode.length !== 6
                        }
                        className={primaryButton}
                      >
                        Verify
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setShow2FASetup(false);
                        setQrCode('');
                        setTwoFactorCode('');
                      }}
                      className="mt-4 text-sm font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-white"
                    >
                      Cancel setup
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40">
                    <ShieldOff size={20} />
                  </div>

                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">
                      2FA is not enabled
                    </p>

                    <p className="mt-1 max-w-xl text-sm text-gray-500">
                      Add an authenticator app to make unauthorized access significantly harder.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSetup2FA}
                  disabled={saving}
                  className={primaryButton}
                >
                  <ShieldCheck size={17} />
                  Enable 2FA
                </button>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* SESSIONS */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <SectionCard
            icon={Monitor}
            title="Devices & sessions"
            description="Review where your SaMi account is currently signed in."
            action={
              <button
                onClick={handleLogoutAll}
                className="text-sm font-semibold text-red-600 hover:text-red-700"
              >
                Sign out others
              </button>
            }
          >
            {data.sessions?.length ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="hidden grid-cols-[1fr_auto] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-950 sm:grid">
                  <span>Device</span>
                  <span>Activity</span>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.sessions.map((session: any) => (
                    <div
                      key={session.id}
                      className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {session.device_type === 'mobile' ? (
                            <Smartphone size={19} />
                          ) : (
                            <Laptop size={19} />
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                              {session.browser ||
                                'Unknown browser'}
                              {' · '}
                              {session.operating_system ||
                                'Unknown device'}
                            </p>

                            {session.is_current && (
                              <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
                                This device
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            {session.ip_address ||
                              'IP unavailable'}
                          </p>
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        {session.is_current ? (
                          <p className="text-xs font-semibold text-green-600">
                            Active now
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {session.last_active_at
                              ? new Date(
                                  session.last_active_at
                                ).toLocaleString()
                              : 'Unknown activity'}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Monitor}
                title="No session information"
                description="Your active devices will appear here."
              />
            )}
          </SectionCard>

          <SectionCard
            icon={LogOut}
            title="Session protection"
            description="If you believe someone else has accessed your account, sign out of all other devices immediately."
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-400">
                  Security action
                </p>

                <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-400/70">
                  Your current session will remain active.
                </p>
              </div>

              <button
                onClick={handleLogoutAll}
                className={dangerButton}
              >
                <LogOut size={16} />
                Sign out all other devices
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          <SectionCard
            icon={Globe}
            title="Appearance & regional preferences"
            description="Customize how SaMi looks and displays dates, times and language."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Theme">
                <select
                  value={preferencesForm.theme}
                  onChange={(e) =>
                    setPreferencesForm({
                      ...preferencesForm,
                      theme: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="system">
                    Use system setting
                  </option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>

              <Field label="Language">
                <select
                  value={preferencesForm.language}
                  onChange={(e) =>
                    setPreferencesForm({
                      ...preferencesForm,
                      language: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="en">English</option>
                  <option value="sw">Swahili</option>
                </select>
              </Field>

              <Field label="Date format">
                <select
                  value={preferencesForm.dateFormat}
                  onChange={(e) =>
                    setPreferencesForm({
                      ...preferencesForm,
                      dateFormat: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="DD/MM/YYYY">
                    DD/MM/YYYY
                  </option>
                  <option value="MM/DD/YYYY">
                    MM/DD/YYYY
                  </option>
                  <option value="YYYY-MM-DD">
                    YYYY-MM-DD
                  </option>
                </select>
              </Field>

              <Field label="Time format">
                <select
                  value={preferencesForm.timeFormat}
                  onChange={(e) =>
                    setPreferencesForm({
                      ...preferencesForm,
                      timeFormat: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="24h">
                    24-hour
                  </option>
                  <option value="12h">
                    12-hour
                  </option>
                </select>
              </Field>

              <Field label="Timezone">
                <select
                  value={preferencesForm.timezone}
                  onChange={(e) =>
                    setPreferencesForm({
                      ...preferencesForm,
                      timezone: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="Africa/Nairobi">
                    Africa/Nairobi (EAT)
                  </option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">
                    Europe/London
                  </option>
                  <option value="America/New_York">
                    America/New_York
                  </option>
                  <option value="America/Los_Angeles">
                    America/Los_Angeles
                  </option>
                </select>
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() =>
                  handleSave(
                    'preferences',
                    preferencesForm,
                    'Your display preferences have been updated.'
                  )
                }
                disabled={saving}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}
                Save preferences
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={Bell}
            title="Notifications"
            description="Choose which account and workspace notifications you want to receive."
          >
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                {
                  key: 'email',
                  title: 'Email notifications',
                  description:
                    'Receive important account notifications by email.',
                },
                {
                  key: 'product',
                  title: 'Product updates',
                  description:
                    'Receive updates about new SaMi features and improvements.',
                },
                {
                  key: 'security',
                  title: 'Security alerts',
                  description:
                    'Receive notifications about important security events.',
                },
                {
                  key: 'team',
                  title: 'Team activity',
                  description:
                    'Receive relevant notifications about your workspace team.',
                },
              ].map((item) => {
                const key =
                  item.key as keyof typeof notificationForm;

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-5 py-5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {item.title}
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        {item.description}
                      </p>
                    </div>

                    <Toggle
                      enabled={notificationForm[key]}
                      onChange={(value) =>
                        setNotificationForm({
                          ...notificationForm,
                          [key]: value,
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() =>
                  handleSave(
                    'notifications',
                    notificationForm,
                    'Your notification preferences have been updated.'
                  )
                }
                disabled={saving}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}
                Save notifications
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      {/* BUSINESS */}
      {activeTab === 'business' && (
        <div className="space-y-6">
          <SectionCard
            icon={Building2}
            title="Business profile"
            description="Manage the business information associated with your SaMi workspace."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Business name">
                <input
                  value={businessForm.name}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      name: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Your business name"
                />
              </Field>

              <Field label="Business type">
                <input
                  value={businessForm.businessType}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      businessType: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="e.g. Retail, Agency, Restaurant"
                />
              </Field>

              <Field label="Industry">
                <input
                  value={businessForm.industry}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      industry: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Industry"
                />
              </Field>

              <Field label="Business phone">
                <input
                  value={businessForm.phone}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      phone: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="+254..."
                />
              </Field>

              <Field label="Business email">
                <input
                  type="email"
                  value={businessForm.email}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      email: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="business@example.com"
                />
              </Field>

              <Field label="Website">
                <input
                  type="url"
                  value={businessForm.website}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      website: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="https://example.com"
                />
              </Field>

              <Field label="Country">
                <input
                  value={businessForm.country}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      country: e.target.value,
                    })
                  }
                  className={inputClass}
                  placeholder="Kenya"
                />
              </Field>

              <Field label="Timezone">
                <select
                  value={businessForm.timezone}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      timezone: e.target.value,
                    })
                  }
                  className={selectClass}
                >
                  <option value="Africa/Nairobi">
                    Africa/Nairobi
                  </option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">
                    Europe/London
                  </option>
                  <option value="America/New_York">
                    America/New_York
                  </option>
                </select>
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() =>
                  handleSave(
                    'business',
                    businessForm,
                    'Business information has been updated.'
                  )
                }
                disabled={saving}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}
                Save business
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={Building2}
            title="Workspace identity"
            description="Basic information about your current SaMi workspace."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Workspace
                </p>
                <p className="mt-2 truncate text-sm font-bold">
                  {data.tenant?.name || 'Unnamed workspace'}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Plan
                </p>
                <p className="mt-2 text-sm font-bold capitalize">
                  {data.subscription?.plan_name || 'Free'}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Subscription
                </p>
                <p className="mt-2 text-sm font-bold capitalize">
                  {data.subscription?.status || 'Active'}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* TEAM */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <SectionCard
            icon={UserPlus}
            title="Invite team member"
            description="Give a teammate access to your SaMi workspace."
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto]">
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({
                    ...inviteForm,
                    email: e.target.value,
                  })
                }
                className={inputClass}
                placeholder="teammate@company.com"
              />

              <select
                value={inviteForm.role}
                onChange={(e) =>
                  setInviteForm({
                    ...inviteForm,
                    role: e.target.value,
                  })
                }
                className={selectClass}
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>

              <button
                onClick={handleSendInvite}
                disabled={saving || !inviteForm.email}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Plus size={17} />
                )}
                Invite
              </button>
            </div>

            {inviteLink && (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex items-start gap-3">
                  <Info
                    size={18}
                    className="mt-0.5 shrink-0 text-blue-600"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-blue-800 dark:text-blue-400">
                      Invitation link
                    </p>

                    <div className="mt-2 flex gap-2">
                      <input
                        readOnly
                        value={inviteLink}
                        className={`${inputClass} min-w-0 bg-white dark:bg-gray-900`}
                      />

                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            inviteLink
                          )
                        }
                        className={secondaryButton}
                        title="Copy invitation link"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={Users}
            title="Team members"
            description={`${data.team?.length || 0} member${
              data.team?.length === 1 ? '' : 's'
            } in this workspace.`}
          >
            {data.team?.length ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.team.map((member: any) => (
                    <div
                      key={member.id}
                      className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">
                          {(
                            member.full_name ||
                            member.email ||
                            'U'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {member.full_name ||
                              'Unnamed member'}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold capitalize text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {member.role}
                        </span>

                        <button
                          type="button"
                          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No team members yet"
                description="Invite people to collaborate in your workspace."
              />
            )}
          </SectionCard>
        </div>
      )}

      {/* APPS */}
      {activeTab === 'apps' && (
        <div className="space-y-6">
          <SectionCard
            icon={AppWindow}
            title="Workspace apps"
            description="Install and manage the SaMi applications available to your workspace."
            action={
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold capitalize text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                {data.subscription?.plan_name || 'Free'} plan
              </span>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {SAMI_APPS.map((app: any) => {
                const installed = data.modules?.find(
                  (m: any) => m.key === app.key
                );

                const enabled =
                  installed?.enabled ??
                  (installed?.status === 'installed');

                return (
                  <div
                    key={app.key}
                    className="group rounded-2xl border border-gray-200 p-5 transition hover:border-blue-200 hover:shadow-sm dark:border-gray-800 dark:hover:border-blue-900"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                          <Sparkles size={19} />
                        </div>

                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {app.name}
                          </p>

                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            {app.description ||
                              'Extend your SaMi workspace with this application.'}
                          </p>
                        </div>
                      </div>

                      {installed &&
                        installed.status ===
                          'installed' && (
                          <Toggle
                            enabled={enabled}
                            disabled={saving}
                            onChange={(value) =>
                              handleToggleApp(
                                app.key,
                                value
                              )
                            }
                          />
                        )}
                    </div>

                    <div className="mt-5 flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          installed?.status === 'installed'
                            ? enabled
                              ? 'text-green-600'
                              : 'text-gray-500'
                            : 'text-gray-400'
                        }`}
                      >
                        {installed?.status ===
                        'installed'
                          ? enabled
                            ? 'Active'
                            : 'Disabled'
                          : 'Not installed'}
                      </span>

                      {!installed ||
                      installed.status !==
                        'installed' ? (
                        <button
                          onClick={() =>
                            handleInstallApp(app.key)
                          }
                          disabled={saving}
                          className={primaryButton}
                        >
                          <Plus size={15} />
                          Install
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleUninstallApp(app.key)
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600 transition hover:border-red-200 hover:text-red-600 dark:border-gray-700 dark:text-gray-300"
                        >
                          <Trash2 size={14} />
                          Uninstall
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* API KEYS */}
      {activeTab === 'api-keys' && (
        <div className="space-y-6">
          <SectionCard
            icon={Key}
            title="API access"
            description="Create credentials for applications and integrations that need to communicate with SaMi."
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={19}
                  className="mt-0.5 shrink-0 text-amber-600"
                />

                <div>
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-400">
                    Treat API keys like passwords
                  </p>

                  <p className="mt-1 text-sm leading-6 text-amber-700/80 dark:text-amber-400/70">
                    Never publish a key in client-side code, screenshots, repositories or public logs.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input
                value={apiKeyName}
                onChange={(e) =>
                  setApiKeyName(e.target.value)
                }
                className={`${inputClass} flex-1`}
                placeholder="e.g. Production integration"
              />

              <button
                onClick={handleCreateApiKey}
                disabled={saving || !apiKeyName.trim()}
                className={primaryButton}
              >
                {saving ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Plus size={17} />
                )}
                Create API key
              </button>
            </div>

            {newApiKey && (
              <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5 dark:border-green-900/60 dark:bg-green-950/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    size={19}
                    className="mt-0.5 shrink-0 text-green-600"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-green-800 dark:text-green-400">
                      Your API key is ready
                    </p>

                    <p className="mt-1 text-sm text-green-700/80 dark:text-green-400/70">
                      Copy it now. For security, you may not be able to view it again.
                    </p>

                    <div className="mt-4 flex gap-2">
                      <code className="min-w-0 flex-1 break-all rounded-xl border border-green-200 bg-white px-4 py-3 text-xs text-gray-800 dark:border-green-900 dark:bg-gray-900 dark:text-gray-200">
                        {newApiKey}
                      </code>

                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            newApiKey
                          )
                        }
                        className={secondaryButton}
                        title="Copy API key"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={KeyRound}
            title="Your API keys"
            description="Review and revoke credentials currently associated with your account."
          >
            {data.apiKeys?.length ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.apiKeys.map((key: any) => (
                    <div
                      key={key.id}
                      className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">
                            {key.name}
                          </p>

                          {key.revoked_at && (
                            <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 dark:bg-red-950/40">
                              Revoked
                            </span>
                          )}
                        </div>

                        <code className="mt-1 block text-xs text-gray-500">
                          {key.key_preview || '••••••••••••'}
                        </code>

                        {key.created_at && (
                          <p className="mt-1 text-xs text-gray-400">
                            Created{' '}
                            {new Date(
                              key.created_at
                            ).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {!key.revoked_at && (
                        <button
                          onClick={() =>
                            handleDeleteApiKey(key.id)
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                        >
                          <Trash2 size={15} />
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Key}
                title="No API keys"
                description="Create an API key when you need an external application to access SaMi."
              />
            )}
          </SectionCard>
        </div>
      )}

      {/* AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <SectionCard
          icon={FileText}
          title="Account activity"
          description="Review important actions and security events associated with your account."
        >
          <AuditLogsSection />
        </SectionCard>
      )}

      {/* DANGER */}
      {activeTab === 'danger' && (
        <div className="space-y-6">
          <SectionCard
            icon={Database}
            title="Your data"
            description="Manage and export information associated with your SaMi account."
          >
            <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40">
                  <Download size={19} />
                </div>

                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    Export your data
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    Request a copy of your account and workspace data.
                  </p>
                </div>
              </div>

              <button
                onClick={handleExportData}
                className={secondaryButton}
              >
                <Download size={16} />
                Export data
              </button>
            </div>
          </SectionCard>

          <SectionCard
            icon={AlertTriangle}
            title="Danger zone"
            description="These actions can affect access to your account and should only be used when necessary."
            danger
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-5 rounded-2xl border border-red-200 p-5 dark:border-red-900/70 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    Sign out all devices
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    End all other active sessions while keeping this session active.
                  </p>
                </div>

                <button
                  onClick={handleLogoutAll}
                  className={dangerButton}
                >
                  <LogOut size={16} />
                  Sign out all
                </button>
              </div>

              <div className="flex flex-col gap-5 rounded-2xl border border-red-200 p-5 dark:border-red-900/70 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">
                    Delete account
                  </p>

                  <p className="mt-1 text-sm text-gray-500">
                    Permanently delete your account and associated data.
                  </p>
                </div>

                <button
                  onClick={() =>
                    showOverlay(
                      'info',
                      'Account deletion',
                      'Connect your account-deletion API before enabling permanent deletion. This action should require strong re-authentication and an explicit confirmation.'
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                >
                  <Trash2 size={16} />
                  Delete account
                </button>
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {/* FALLBACK */}
      {![
        'profile',
        'security',
        'sessions',
        'preferences',
        'business',
        'team',
        'apps',
        'api-keys',
        'audit-logs',
        'danger',
      ].includes(activeTab) && (
        <SectionCard
          icon={Settings2}
          title="Settings"
          description="Manage your SaMi account and workspace."
        >
          <EmptyState
            icon={Settings2}
            title="Settings section not found"
            description="Use the settings navigation to select a valid section."
          />
        </SectionCard>
      )}

      {/* GLOBAL OVERLAY */}
      {overlay && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeOverlay();
            }
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    overlay.type === 'success'
                      ? 'bg-green-50 text-green-600 dark:bg-green-950/40'
                      : overlay.type === 'warning'
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'
                      : overlay.type === 'confirm'
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/40'
                      : overlay.type === 'error'
                      ? 'bg-red-50 text-red-600 dark:bg-red-950/40'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40'
                  }`}
                >
                  {overlay.type === 'success' && (
                    <Check size={23} />
                  )}

                  {overlay.type === 'warning' && (
                    <AlertTriangle size={23} />
                  )}

                  {overlay.type === 'confirm' && (
                    <AlertTriangle size={23} />
                  )}

                  {overlay.type === 'error' && (
                    <X size={23} />
                  )}

                  {overlay.type === 'info' && (
                    <Info size={23} />
                  )}
                </div>

                <button
                  onClick={closeOverlay}
                  className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <h3
                id="settings-dialog-title"
                className="mt-5 text-lg font-bold text-gray-950 dark:text-white"
              >
                {overlay.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {overlay.message}
              </p>

              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={closeOverlay}
                  className={secondaryButton}
                >
                  {overlay.onConfirm
                    ? 'Cancel'
                    : 'Close'}
                </button>

                {overlay.onConfirm && (
                  <button
                    onClick={overlay.onConfirm}
                    className={
                      overlay.type === 'warning'
                        ? primaryButton
                        : dangerButton
                    }
                  >
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
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2
            size={28}
            className="animate-spin text-blue-600"
          />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}