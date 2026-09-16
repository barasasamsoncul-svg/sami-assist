'use client';

import Link from 'next/link';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Languages,
  Loader2,
  LockKeyhole,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
  CalendarDays,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import UserAvatar from '@/app/components/account/UserAvatar';

type View =
  | 'overview'
  | 'profile'
  | 'preferences'
  | 'security'
  | 'password'
  | 'two-factor'
  | 'sessions'
  | 'activity';

type AdminTheme =
  | 'system'
  | 'light'
  | 'dark';

type AdminDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

type AdminTimeFormat =
  | '12h'
  | '24h';

type AdminAccount = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt?: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
  avatarFileId: string | null;
  avatarUrl?: string | null;
};

type AdminPreferences = {
  theme: AdminTheme;
  locale: string;
  timezone: string;
  dateFormat: AdminDateFormat;
  timeFormat: AdminTimeFormat;
  firstDayOfWeek: number;
};

type TwoFactorState = {
  enabled: boolean;
  required: boolean;
  method: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  recoveryCodesRemaining: number;
};

type TwoFactorSetup = {
  method: string;
  secret: string;
  otpauthUrl: string;
};



type AdminSessionItem = {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
};

type SecurityActivityItem = {
  id: string;
  source: 'audit' | 'login';
  eventType: string;
  action: string | null;
  successful: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string | null;
};

type ApiPayload = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  field?: string;

  account?: AdminAccount;
  preferences?: AdminPreferences;

  avatarFileId?: string | null;
  otherSessionsRevoked?: number;

  twoFactor?: TwoFactorState;
  twoFactorEnabled?: boolean;
  setup?: TwoFactorSetup;
  recoveryCodes?: string[];
  sessions?: AdminSessionItem[];
  revokedCount?: number;
  activity?: SecurityActivityItem[];
};

type OverlayType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

type OverlayState = {
  open: boolean;
  type: OverlayType;
  title: string;
  message: string;
  primaryAction?: { label: string; onClick?: () => void };
  secondaryAction?: { label: string; onClick?: () => void };
};

const DEFAULT_PREFERENCES: AdminPreferences = {
  theme: 'system',
  locale: 'en-KE',
  timezone: 'Africa/Nairobi',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  firstDayOfWeek: 1,
};

const MAX_AVATAR_BYTES =
  5 * 1024 * 1024;

const ACCEPTED_AVATAR_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

const LOCALES = [
  {
    value: 'en-KE',
    label: 'English (Kenya)',
  },
  {
    value: 'en-US',
    label: 'English (United States)',
  },
  {
    value: 'en-GB',
    label: 'English (United Kingdom)',
  },
];

const TIMEZONES = [
  'Africa/Nairobi',
  'Africa/Kampala',
  'Africa/Dar_es_Salaam',
  'Africa/Kigali',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
];

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

async function readPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeName(
  value: string
) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function validName(
  value: string
) {
  return (
    value.length >= 1 &&
    value.length <= 100 &&
    /^[\p{L}\p{M}'’ -]+$/u.test(
      value
    )
  );
}

function initials(
  account: AdminAccount
) {
  const first =
    account.firstName
      ?.trim()
      .charAt(0);

  const last =
    account.lastName
      ?.trim()
      .charAt(0);

  return (
    `${first || ''}${last || ''}`
      .toUpperCase() ||
    'SA'
  );
}

function labelFromValue(
  value: string
) {
  return value
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );
}

function themeLabel(
  theme: AdminTheme
) {
  if (theme === 'dark') {
    return 'Dark';
  }

  if (theme === 'light') {
    return 'Light';
  }

  return 'System';
}

function applyTheme(
  theme: AdminTheme
) {
  if (
    typeof document ===
    'undefined'
  ) {
    return;
  }

  const root =
    document.documentElement;

  if (theme === 'dark') {
    root.classList.add(
      'dark'
    );

    return;
  }

  if (theme === 'light') {
    root.classList.remove(
      'dark'
    );

    return;
  }

  const dark =
    window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

  root.classList.toggle(
    'dark',
    dark
  );
}

function formatSecurityDate(
  value: string | null
) {
  if (!value) {
    return 'Not yet';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Not yet';
  }

  return date.toLocaleString();
}

function formatAccountDate(value: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

function securityActivityTitle(item: SecurityActivityItem) {
  if (item.source === 'login') {
    return item.successful ? 'Administrator sign-in' : 'Failed administrator sign-in';
  }

  const labels: Record<string, string> = {
    'admin.password.changed': 'Password changed',
    'admin.two_factor.enabled': 'Two-factor authentication enabled',
    'admin.two_factor.disabled': 'Two-factor authentication disabled',
    'admin.two_factor.recovery_codes_regenerated': 'Recovery codes replaced',
    'admin.sessions.others_revoked': 'Other sessions signed out',
  };

  if (labels[item.eventType]) return labels[item.eventType];

  return item.eventType
    .replace(/^admin[._-]/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase()) || 'Security activity';
}

function sessionDeviceLabel(item: AdminSessionItem) {
  if (item.browser && item.operatingSystem) return `${item.browser} on ${item.operatingSystem}`;
  return item.browser || item.operatingSystem || item.deviceType || 'Unknown device';
}

export default function AdminMyAccountPage() {
  const router =
    useRouter();

  const avatarInputRef =
    useRef<HTMLInputElement>(
      null
    );

  const [
    view,
    setView,
  ] =
    useState<View>(
      'overview'
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    loadError,
    setLoadError,
  ] =
    useState<string | null>(
      null
    );

  const [
    account,
    setAccount,
  ] =
    useState<AdminAccount | null>(
      null
    );

  const [
    preferences,
    setPreferences,
  ] =
    useState<AdminPreferences>(
      DEFAULT_PREFERENCES
    );

  const [
    draftPreferences,
    setDraftPreferences,
  ] =
    useState<AdminPreferences>(
      DEFAULT_PREFERENCES
    );

  const [
    firstName,
    setFirstName,
  ] =
    useState('');

  const [
    lastName,
    setLastName,
  ] =
    useState('');

  const [
    firstNameError,
    setFirstNameError,
  ] =
    useState<string | null>(
      null
    );

  const [
    lastNameError,
    setLastNameError,
  ] =
    useState<string | null>(
      null
    );

  const [
    savingProfile,
    setSavingProfile,
  ] =
    useState(false);

  const [
    savingAvatar,
    setSavingAvatar,
  ] =
    useState(false);

  const [
    removingAvatar,
    setRemovingAvatar,
  ] =
    useState(false);

  const avatarBusy =
    savingAvatar ||
    removingAvatar;

  const [
    savingPreferences,
    setSavingPreferences,
  ] =
    useState(false);

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState('');

  const [
    newPassword,
    setNewPassword,
  ] =
    useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('');

  const [
    showCurrentPassword,
    setShowCurrentPassword,
  ] =
    useState(false);

  const [
    showNewPassword,
    setShowNewPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    currentPasswordError,
    setCurrentPasswordError,
  ] =
    useState<string | null>(
      null
    );

  const [
    newPasswordError,
    setNewPasswordError,
  ] =
    useState<string | null>(
      null
    );

  const [
    confirmPasswordError,
    setConfirmPasswordError,
  ] =
    useState<string | null>(
      null
    );

  const [
    savingPassword,
    setSavingPassword,
  ] =
    useState(false);

  const [
    twoFactor,
    setTwoFactor,
  ] =
    useState<TwoFactorState | null>(
      null
    );

  const [
    loadingTwoFactor,
    setLoadingTwoFactor,
  ] =
    useState(false);

  const [
    twoFactorBusy,
    setTwoFactorBusy,
  ] =
    useState(false);

  const [
    twoFactorSetup,
    setTwoFactorSetup,
  ] =
    useState<TwoFactorSetup | null>(
      null
    );

  const [
    twoFactorCode,
    setTwoFactorCode,
  ] =
    useState('');

  const [
    twoFactorCodeError,
    setTwoFactorCodeError,
  ] =
    useState<string | null>(
      null
    );

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] =
    useState<string[]>([]);

  const [
    recoveryCopied,
    setRecoveryCopied,
  ] =
    useState(false);

  const [sessions, setSessions] = useState<AdminSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const [securityActivity, setSecurityActivity] = useState<SecurityActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState>({
      open: false,
      type: 'info',
      title: '',
      message: '',
    });

  function showOverlay(
    type: OverlayType,
    title: string,
    message: string,
    primaryAction?: OverlayState['primaryAction'],
    secondaryAction?: OverlayState['secondaryAction']
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
      primaryAction,
      secondaryAction,
    });
  }

  function closeOverlay() {
    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

  function sessionExpired() {
    showOverlay(
      'warning',
      'Administrator session expired',
      'Your administrator session is no longer active. Sign in again to continue.'
    );
  }

  const loadData =
    useCallback(
      async () => {
        setLoading(true);
        setLoadError(null);

        try {
          const [
            accountResponse,
            preferencesResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/admin/account',
                {
                  method: 'GET',
                  cache:
                    'no-store',
                  credentials:
                    'same-origin',
                  headers: {
                    Accept:
                      'application/json',
                  },
                }
              ),

              fetch(
                '/api/admin/account/preferences',
                {
                  method: 'GET',
                  cache:
                    'no-store',
                  credentials:
                    'same-origin',
                  headers: {
                    Accept:
                      'application/json',
                  },
                }
              ),
            ]);

          const [
            accountPayload,
            preferencesPayload,
          ] =
            await Promise.all([
              readPayload(
                accountResponse
              ),
              readPayload(
                preferencesResponse
              ),
            ]);

          if (
            accountResponse.status ===
              401 ||
            preferencesResponse.status ===
              401
          ) {
            sessionExpired();
            return;
          }

          if (
            !accountResponse.ok ||
            !accountPayload.account
          ) {
            throw new Error(
              accountPayload.error ||
                'SaMi could not load your administrator account.'
            );
          }

          if (
            !preferencesResponse.ok ||
            !preferencesPayload.preferences
          ) {
            throw new Error(
              preferencesPayload.error ||
                'SaMi could not load your preferences.'
            );
          }

          const loadedAccount = {
            ...accountPayload.account,
            avatarFileId:
              accountPayload.account
                .avatarFileId ??
              null,
          };

          setAccount(
            loadedAccount
          );

          setFirstName(
            loadedAccount.firstName
          );

          setLastName(
            loadedAccount.lastName
          );

          setPreferences(
            preferencesPayload.preferences
          );

          setDraftPreferences(
            preferencesPayload.preferences
          );

          applyTheme(
            preferencesPayload
              .preferences.theme
          );
        } catch (error) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'SaMi could not load your administrator account.'
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(
    () => {
      void loadData();
    },
    [loadData]
  );

  const profileChanged =
    useMemo(
      () =>
        Boolean(
          account &&
            (
              normalizeName(
                firstName
              ) !==
                account.firstName ||
              normalizeName(
                lastName
              ) !==
                account.lastName
            )
        ),
      [
        account,
        firstName,
        lastName,
      ]
    );

  function openProfile() {
    if (!account) {
      return;
    }

    setFirstName(
      account.firstName
    );

    setLastName(
      account.lastName
    );

    setFirstNameError(null);
    setLastNameError(null);

    setView('profile');
  }

  async function saveProfile(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingProfile ||
      !account
    ) {
      return;
    }

    const normalizedFirst =
      normalizeName(
        firstName
      );

    const normalizedLast =
      normalizeName(
        lastName
      );

    setFirstNameError(null);
    setLastNameError(null);

    let invalid = false;

    if (
      !validName(
        normalizedFirst
      )
    ) {
      setFirstNameError(
        'Enter a valid first name.'
      );

      invalid = true;
    }

    if (
      !validName(
        normalizedLast
      )
    ) {
      setLastNameError(
        'Enter a valid last name.'
      );

      invalid = true;
    }

    if (invalid) {
      return;
    }

    setSavingProfile(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/profile',
          {
            method: 'PATCH',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                firstName:
                  normalizedFirst,
                lastName:
                  normalizedLast,
              }),
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (
        !response.ok ||
        !payload.account
      ) {
        if (
          payload.field ===
          'firstName'
        ) {
          setFirstNameError(
            payload.error ||
              'First name is invalid.'
          );

          return;
        }

        if (
          payload.field ===
          'lastName'
        ) {
          setLastNameError(
            payload.error ||
              'Last name is invalid.'
          );

          return;
        }

        throw new Error(
          payload.error ||
            'SaMi could not update your profile.'
        );
      }

      const nextAccount: AdminAccount = {
        ...account,
        ...payload.account,
        avatarFileId:
          payload.account
            .avatarFileId ??
          account.avatarFileId,
        twoFactorRequired:
          account.twoFactorRequired,
        twoFactorEnabled:
          account.twoFactorEnabled,
      };

      setAccount(
        nextAccount
      );

      setFirstName(
        nextAccount.firstName
      );

      setLastName(
        nextAccount.lastName
      );

      setView('overview');

      router.refresh();

      showOverlay(
        'success',
        'Profile updated',
        'Your personal information has been updated.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Profile update failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not update your profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function openAvatarPicker() {
    if (!avatarBusy) {
      avatarInputRef
        .current
        ?.click();
    }
  }

  async function uploadAvatar(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = '';

    if (
      !file ||
      !account ||
      avatarBusy
    ) {
      return;
    }

    if (
      !ACCEPTED_AVATAR_TYPES.has(
        file.type
      )
    ) {
      showOverlay(
        'warning',
        'Unsupported image',
        'Choose a JPEG, PNG or WebP image.'
      );

      return;
    }

    if (
      file.size <= 0 ||
      file.size >
        MAX_AVATAR_BYTES
    ) {
      showOverlay(
        'warning',
        'Image is too large',
        'Choose an image smaller than 5 MB.'
      );

      return;
    }

    setSavingAvatar(true);

    try {
      const formData =
        new FormData();

      formData.append(
        'file',
        file
      );

      const response =
        await fetch(
          '/api/admin/account/avatar',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
            },
            body: formData,
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            'SaMi could not update your profile photo.'
        );
      }

      if (
        payload.avatarFileId
      ) {
        setAccount(
          current =>
            current
              ? {
                  ...current,
                  avatarFileId:
                    payload.avatarFileId ??
                    null,
                }
              : current
        );
      } else {
        await loadData();
      }

      router.refresh();

      showOverlay(
        'success',
        'Profile photo updated',
        'Your profile photo has been updated.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Photo update failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not update your profile photo.'
      );
    } finally {
      setSavingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (
      !account?.avatarFileId ||
      avatarBusy
    ) {
      return;
    }

    setRemovingAvatar(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/avatar',
          {
            method: 'DELETE',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            'SaMi could not remove your profile photo.'
        );
      }

      setAccount(
        current =>
          current
            ? {
                ...current,
                avatarFileId:
                  null,
                avatarUrl:
                  null,
              }
            : current
      );

      router.refresh();

      showOverlay(
        'success',
        'Profile photo removed',
        'Your profile photo has been removed.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Photo removal failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not remove your profile photo.'
      );
    } finally {
      setRemovingAvatar(false);
    }
  }

  const preferencesChanged =
    useMemo(
      () =>
        JSON.stringify(
          preferences
        ) !==
        JSON.stringify(
          draftPreferences
        ),
      [
        preferences,
        draftPreferences,
      ]
    );

  function updatePreference<
    K extends keyof AdminPreferences
  >(
    key: K,
    value:
      AdminPreferences[K]
  ) {
    setDraftPreferences(
      current => ({
        ...current,
        [key]: value,
      })
    );

    if (
      key ===
      'theme'
    ) {
      applyTheme(
        value as AdminTheme
      );
    }
  }

  async function savePreferences(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingPreferences ||
      !preferencesChanged
    ) {
      return;
    }

    setSavingPreferences(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/preferences',
          {
            method: 'PATCH',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify(
                draftPreferences
              ),
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (
        !response.ok ||
        !payload.preferences
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not update your preferences.'
        );
      }

      setPreferences(
        payload.preferences
      );

      setDraftPreferences(
        payload.preferences
      );

      applyTheme(
        payload.preferences.theme
      );

      setView('overview');

      showOverlay(
        'success',
        'Preferences updated',
        'Your preferences have been saved.'
      );
    } catch (error) {
      applyTheme(
        preferences.theme
      );

      showOverlay(
        'error',
        'Preferences update failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not update your preferences.'
      );
    } finally {
      setSavingPreferences(false);
    }
  }

  const passwordRules =
    useMemo(
      () => ({
        length:
          newPassword.length >=
            8 &&
          newPassword.length <=
            128,

        uppercase:
          /[A-Z]/.test(
            newPassword
          ),

        lowercase:
          /[a-z]/.test(
            newPassword
          ),

        number:
          /[0-9]/.test(
            newPassword
          ),
      }),
      [newPassword]
    );

  const passwordValid =
    Object.values(
      passwordRules
    ).every(Boolean);

  const passwordChanged =
    Boolean(
      currentPassword ||
      newPassword ||
      confirmPassword
    );

  function clearPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    setCurrentPasswordError(
      null
    );

    setNewPasswordError(
      null
    );

    setConfirmPasswordError(
      null
    );

    setShowCurrentPassword(
      false
    );

    setShowNewPassword(
      false
    );

    setShowConfirmPassword(
      false
    );
  }

  function openPassword() {
    clearPasswordForm();
    setView('password');
  }

  function closePassword() {
    if (savingPassword) {
      return;
    }

    clearPasswordForm();
    setView('security');
  }

  async function changePassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingPassword) {
      return;
    }

    setCurrentPasswordError(
      null
    );

    setNewPasswordError(
      null
    );

    setConfirmPasswordError(
      null
    );

    let invalid = false;

    if (!currentPassword) {
      setCurrentPasswordError(
        'Enter your current password.'
      );

      invalid = true;
    }

    if (!newPassword) {
      setNewPasswordError(
        'Enter a new password.'
      );

      invalid = true;
    } else if (
      !passwordValid
    ) {
      setNewPasswordError(
        'Your new password does not meet the password requirements.'
      );

      invalid = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError(
        'Confirm your new password.'
      );

      invalid = true;
    } else if (
      newPassword !==
      confirmPassword
    ) {
      setConfirmPasswordError(
        'The password confirmation does not match.'
      );

      invalid = true;
    }

    if (
      currentPassword &&
      newPassword &&
      currentPassword ===
        newPassword
    ) {
      setNewPasswordError(
        'Your new password must be different from your current password.'
      );

      invalid = true;
    }

    if (invalid) {
      return;
    }

    setSavingPassword(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/change-password',
          {
            method: 'POST',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword,
              }),
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (!response.ok) {
        if (
          payload.field ===
          'currentPassword'
        ) {
          setCurrentPasswordError(
            payload.error ||
              'The current password is incorrect.'
          );

          return;
        }

        if (
          payload.field ===
          'newPassword'
        ) {
          setNewPasswordError(
            payload.error ||
              'The new password is invalid.'
          );

          return;
        }

        if (
          payload.field ===
          'confirmPassword'
        ) {
          setConfirmPasswordError(
            payload.error ||
              'The password confirmation is invalid.'
          );

          return;
        }

        throw new Error(
          payload.error ||
            'SaMi could not change your password.'
        );
      }

      const revoked =
        payload.otherSessionsRevoked ??
        0;

      clearPasswordForm();

      setView('security');

      showOverlay(
        'success',
        'Password changed',
        revoked > 0
          ? `Your password has been changed. ${revoked} other signed-in session${revoked === 1 ? '' : 's'} were revoked.`
          : 'Your password has been changed successfully.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Password change failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not change your password.'
      );
    } finally {
      setSavingPassword(false);
    }
  }

  function clearTwoFactorAction() {
    setTwoFactorSetup(null);
    setTwoFactorCode('');
    setTwoFactorCodeError(null);
    setRecoveryCodes([]);
    setRecoveryCopied(false);
  }

  async function loadTwoFactor() {
    setLoadingTwoFactor(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/two-factor',
          {
            method: 'GET',
            credentials:
              'same-origin',
            cache: 'no-store',
            headers: {
              Accept:
                'application/json',
            },
          }
        );

      const payload =
        await readPayload(
          response
        );

      if (
        response.status ===
        401
      ) {
        sessionExpired();
        return;
      }

      if (
        !response.ok ||
        !payload.twoFactor
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not load your security settings.'
        );
      }

      setTwoFactor(
        payload.twoFactor
      );

      setAccount(
        current =>
          current
            ? {
                ...current,
                twoFactorEnabled:
                  payload
                    .twoFactor!
                    .enabled,
                twoFactorRequired:
                  payload
                    .twoFactor!
                    .required,
              }
            : current
      );
    } catch (error) {
      showOverlay(
        'error',
        'Security settings unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load your security settings.'
      );
    } finally {
      setLoadingTwoFactor(false);
    }
  }

  async function openTwoFactor() {
    clearTwoFactorAction();

    setView(
      'two-factor'
    );

    await loadTwoFactor();
  }

  async function twoFactorRequest(
    body: Record<
      string,
      unknown
    >
  ) {
    const response =
      await fetch(
        '/api/admin/account/two-factor',
        {
          method: 'POST',
          credentials:
            'same-origin',
          cache: 'no-store',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify(
              body
            ),
        }
      );

    const payload =
      await readPayload(
        response
      );

    if (
      response.status ===
      401
    ) {
      sessionExpired();

      throw new Error(
        'SESSION_EXPIRED'
      );
    }

    if (!response.ok) {
      throw new Error(
        payload.error ||
          'SaMi could not complete this security action.'
      );
    }

    return payload;
  }

  async function startTwoFactorSetup() {
    if (twoFactorBusy) {
      return;
    }

    setTwoFactorBusy(true);
    setTwoFactorCode('');
    setTwoFactorCodeError(null);
    setRecoveryCodes([]);

    try {
      const payload =
        await twoFactorRequest({
          action:
            'start_setup',
        });

      if (!payload.setup) {
        throw new Error(
          'SaMi could not start authenticator setup.'
        );
      }

      setTwoFactorSetup(
        payload.setup
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'SESSION_EXPIRED'
      ) {
        return;
      }

      showOverlay(
        'error',
        'Setup could not start',
        error instanceof Error
          ? error.message
          : 'SaMi could not start authenticator setup.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactorSetup(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (twoFactorBusy) {
      return;
    }

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    setTwoFactorCodeError(
      null
    );

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorCodeError(
        'Enter the 6-digit code from your authenticator app.'
      );

      return;
    }

    setTwoFactorBusy(true);

    try {
      const payload =
        await twoFactorRequest({
          action:
            'confirm_setup',
          code,
        });

      const codes =
        payload.recoveryCodes ??
        [];

      setRecoveryCodes(
        codes
      );

      setTwoFactorSetup(
        null
      );

      setTwoFactorCode('');

      await loadTwoFactor();

      setAccount(
        current =>
          current
            ? {
                ...current,
                twoFactorEnabled:
                  true,
              }
            : current
      );

      showOverlay(
        'success',
        'Two-factor authentication enabled',
        'Your authenticator app is now protecting your administrator account.'
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'SESSION_EXPIRED'
      ) {
        return;
      }

      setTwoFactorCodeError(
        error instanceof Error
          ? error.message
          : 'The verification code could not be confirmed.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (twoFactorBusy) {
      return;
    }

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    setTwoFactorCodeError(
      null
    );

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorCodeError(
        'Enter the 6-digit code from your authenticator app.'
      );

      return;
    }

    setTwoFactorBusy(true);

    try {
      await twoFactorRequest({
        action:
          'disable',
        code,
      });

      setTwoFactorCode('');

      await loadTwoFactor();

      setAccount(
        current =>
          current
            ? {
                ...current,
                twoFactorEnabled:
                  false,
              }
            : current
      );

      showOverlay(
        'success',
        'Two-factor authentication disabled',
        'Authenticator protection has been removed from your account.'
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'SESSION_EXPIRED'
      ) {
        return;
      }

      setTwoFactorCodeError(
        error instanceof Error
          ? error.message
          : 'Two-factor authentication could not be disabled.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function regenerateRecoveryCodes(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (twoFactorBusy) {
      return;
    }

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    setTwoFactorCodeError(
      null
    );

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorCodeError(
        'Enter the 6-digit code from your authenticator app.'
      );

      return;
    }

    setTwoFactorBusy(true);

    try {
      const payload =
        await twoFactorRequest({
          action:
            'regenerate_recovery_codes',
          code,
        });

      setRecoveryCodes(
        payload.recoveryCodes ??
        []
      );

      setTwoFactorCode('');

      await loadTwoFactor();

      showOverlay(
        'success',
        'Recovery codes replaced',
        'Your previous recovery codes can no longer be used.'
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'SESSION_EXPIRED'
      ) {
        return;
      }

      setTwoFactorCodeError(
        error instanceof Error
          ? error.message
          : 'New recovery codes could not be generated.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    if (
      recoveryCodes.length ===
      0
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        recoveryCodes.join(
          '\n'
        )
      );

      setRecoveryCopied(
        true
      );

      showOverlay('success', 'Recovery codes copied', 'Your recovery codes have been copied. Store them somewhere safe.');

      window.setTimeout(
        () =>
          setRecoveryCopied(
            false
          ),
        2000
      );
    } catch {
      showOverlay(
        'warning',
        'Could not copy codes',
        'Select and save your recovery codes manually.'
      );
    }
  }

  async function openSessions() {
    setView('sessions');
    setLoadingSessions(true);

    try {
      const response = await fetch('/api/admin/account/sessions', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await readPayload(response);

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok || !Array.isArray(payload.sessions)) {
        throw new Error(payload.error || 'SaMi could not load your active sessions.');
      }
      setSessions(payload.sessions);
    } catch (error) {
      showOverlay('error', 'Sessions unavailable', error instanceof Error ? error.message : 'SaMi could not load your active sessions.');
    } finally {
      setLoadingSessions(false);
    }
  }

  function confirmRevokeOtherSessions() {
    const others = sessions.filter(item => !item.current).length;
    if (!others || revokingSessions) return;

    showOverlay(
      'warning',
      'Sign out other sessions?',
      'Every other active administrator session will be signed out. This device will remain signed in.',
      {
        label: 'Sign out other sessions',
        onClick: () => {
          closeOverlay();
          void revokeOtherSessions();
        },
      },
      { label: 'Cancel', onClick: closeOverlay }
    );
  }

  async function revokeOtherSessions() {
    if (revokingSessions) return;
    setRevokingSessions(true);

    try {
      const response = await fetch('/api/admin/account/sessions', {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await readPayload(response);

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'SaMi could not sign out your other sessions.');
      }

      setSessions(current => current.filter(item => item.current));
      const count = payload.revokedCount ?? 0;
      showOverlay('success', 'Other sessions signed out', count === 1 ? '1 other administrator session has been signed out.' : `${count} other administrator sessions have been signed out.`);
    } catch (error) {
      showOverlay('error', 'Sign out failed', error instanceof Error ? error.message : 'SaMi could not sign out your other sessions.');
    } finally {
      setRevokingSessions(false);
    }
  }

  async function openSecurityActivity() {
    setView('activity');
    setLoadingActivity(true);

    try {
      const response = await fetch('/api/admin/account/security-activity', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = await readPayload(response);

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok || !Array.isArray(payload.activity)) {
        throw new Error(payload.error || 'SaMi could not load your security activity.');
      }
      setSecurityActivity(payload.activity);
    } catch (error) {
      showOverlay('error', 'Security activity unavailable', error instanceof Error ? error.message : 'SaMi could not load your security activity.');
    } finally {
      setLoadingActivity(false);
    }
  }

  const overlayElement = (
    <SaMiOverlay
      open={overlay.open}
      type={overlay.type}
      title={overlay.title}
      message={
        overlay.message
      }
      primaryAction={
        overlay.primaryAction ??
        (overlay.title === 'Administrator session expired'
          ? {
              label: 'Sign in again',
              onClick: () => {
                router.replace('/admin/login');
              },
            }
          : undefined)
      }
      secondaryAction={overlay.secondaryAction}
      onClose={closeOverlay}
    />
  );

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-500" />

          <p className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
            Loading your account
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            Preparing your settings.
          </p>
        </div>
      </div>
    );
  }

  if (
    loadError ||
    !account
  ) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-950 dark:bg-zinc-900">
          <AlertTriangle className="h-8 w-8 text-red-500" />

          <h2 className="mt-5 text-xl font-bold">
            Account unavailable
          </h2>

          <p className="mt-2 text-sm text-zinc-500">
            {loadError ||
              'SaMi could not load your account.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            className={`${primaryButton()} mt-6`}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>

        {overlayElement}
      </>
    );
  }

  if (view === 'security') {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton label="My Account" onClick={() => setView('overview')} />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Password & security"
              description="Manage your password, sign-in protection, sessions and recent security activity."
            />

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <SettingsRow
                icon={<LockKeyhole className="h-5 w-5" />}
                title="Password"
                description="Change the password you use to sign in."
                onClick={openPassword}
              />
              <SettingsRow
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Two-factor authentication"
                description={account.twoFactorEnabled ? 'Authenticator protection is enabled.' : account.twoFactorRequired ? 'Authenticator protection is required.' : 'Add an extra layer of protection to your account.'}
                onClick={() => void openTwoFactor()}
                trailing={account.twoFactorEnabled ? <span className="mr-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Enabled</span> : undefined}
              />
              <SettingsRow
                icon={<Monitor className="h-5 w-5" />}
                title="Sessions & devices"
                description="Review devices currently signed in to your administrator account."
                onClick={() => void openSessions()}
              />
              <SettingsRow
                icon={<BadgeCheck className="h-5 w-5" />}
                title="Security activity"
                description="Review recent sign-ins and security changes."
                onClick={() => void openSecurityActivity()}
              />
            </div>
          </section>
        </div>
        {overlayElement}
      </>
    );
  }

  if (view === 'sessions') {
    const otherSessions = sessions.filter(item => !item.current);
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton label="Password & security" onClick={() => setView('security')} disabled={revokingSessions} />
          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader icon={<Monitor className="h-5 w-5" />} title="Sessions & devices" description="Review devices currently signed in to your administrator account." />
            {loadingSessions ? (
              <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
            ) : (
              <div className="p-6 sm:p-7">
                <div className="space-y-3">
                  {sessions.length === 0 ? (
                    <p className="rounded-2xl border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">No active sessions were found.</p>
                  ) : sessions.map(item => (
                    <div key={item.id} className="flex items-start gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                      <IconBox>{item.deviceType?.toLowerCase().includes('mobile') ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}</IconBox>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{sessionDeviceLabel(item)}</p>
                          {item.current && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Current</span>}
                        </div>
                        <p className="mt-1 text-sm text-zinc-500">Last active {formatAccountDate(item.lastActivityAt)}</p>
                        <p className="mt-1 text-xs text-zinc-400">{item.ipAddress ? `IP ${item.ipAddress} · ` : ''}Signed in {formatAccountDate(item.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {otherSessions.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <button type="button" disabled={revokingSessions} onClick={confirmRevokeOtherSessions} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                      {revokingSessions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
                      Sign out other sessions
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        {overlayElement}
      </>
    );
  }

  if (view === 'activity') {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton label="Password & security" onClick={() => setView('security')} />
          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader icon={<BadgeCheck className="h-5 w-5" />} title="Security activity" description="Review recent sign-ins and security changes on your administrator account." />
            {loadingActivity ? (
              <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
            ) : securityActivity.length === 0 ? (
              <div className="p-10 text-center text-sm text-zinc-500">No recent security activity was found.</div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {securityActivity.map(item => (
                  <div key={`${item.source}-${item.id}`} className="flex items-start gap-4 px-6 py-5">
                    <IconBox>{item.successful ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}</IconBox>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{securityActivityTitle(item)}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.successful ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>{item.successful ? 'Successful' : 'Failed'}</span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">{formatAccountDate(item.createdAt)}</p>
                      {item.ipAddress && <p className="mt-1 text-xs text-zinc-400">IP {item.ipAddress}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'two-factor'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            label="Password & security"
            onClick={() => {
              clearTwoFactorAction();
              setView(
                'security'
              );
            }}
            disabled={
              twoFactorBusy
            }
          />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={
                <ShieldCheck className="h-5 w-5" />
              }
              title="Two-factor authentication"
              description="Add an authenticator app as an extra layer of sign-in protection."
            />

            {loadingTwoFactor ? (
              <div className="flex min-h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              </div>
            ) : (
              <div className="p-6 sm:p-7">
                <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800 sm:flex-row sm:items-center">
                  <IconBox>
                    <Smartphone className="h-5 w-5" />
                  </IconBox>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      Authenticator app
                    </p>

                    <p className="mt-1 text-sm text-zinc-500">
                      {twoFactor?.enabled
                        ? 'Use a verification code from your authenticator app when signing in.'
                        : 'Use time-based verification codes from an authenticator app.'}
                    </p>
                  </div>

                  <StatusBadge
                    enabled={
                      Boolean(
                        twoFactor?.enabled
                      )
                    }
                    required={
                      Boolean(
                        twoFactor?.required
                      )
                    }
                  />
                </div>

                {twoFactor?.enabled && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <SecurityInfo
                      label="Status"
                      value="Enabled"
                    />

                    <SecurityInfo
                      label="Recovery codes"
                      value={`${twoFactor.recoveryCodesRemaining} remaining`}
                    />

                    <SecurityInfo
                      label="Last used"
                      value={
                        formatSecurityDate(
                          twoFactor.lastUsedAt
                        )
                      }
                    />
                  </div>
                )}

                {!twoFactor?.enabled &&
                  !twoFactorSetup &&
                  recoveryCodes.length ===
                    0 && (
                    <div className="mt-6">
                      <button
                        type="button"
                        disabled={
                          twoFactorBusy
                        }
                        onClick={() =>
                          void startTwoFactorSetup()
                        }
                        className={
                          primaryButton()
                        }
                      >
                        {twoFactorBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}

                        Set up authenticator
                      </button>
                    </div>
                  )}

                {twoFactorSetup && (
                  <div className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      Connect your authenticator
                    </p>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      Add a new account in your authenticator app, then enter the key below.
                    </p>

                    <div className="mt-4 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Setup key
                      </p>

                      <p className="mt-2 break-all font-mono text-sm font-bold tracking-wider text-zinc-950 dark:text-white">
                        {
                          twoFactorSetup.secret
                        }
                      </p>
                    </div>

                    <form
                      onSubmit={
                        confirmTwoFactorSetup
                      }
                      className="mt-5"
                    >
                      <VerificationField
                        value={
                          twoFactorCode
                        }
                        error={
                          twoFactorCodeError
                        }
                        disabled={
                          twoFactorBusy
                        }
                        onChange={
                          setTwoFactorCode
                        }
                      />

                      <div className="mt-5 flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          disabled={
                            twoFactorBusy
                          }
                          onClick={
                            clearTwoFactorAction
                          }
                          className={
                            secondaryButton()
                          }
                        >
                          Cancel
                        </button>

                        <button
                          type="submit"
                          disabled={
                            twoFactorBusy
                          }
                          className={
                            primaryButton()
                          }
                        >
                          {twoFactorBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}

                          Verify and enable
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {recoveryCodes.length >
                  0 && (
                  <RecoveryCodes
                    codes={
                      recoveryCodes
                    }
                    copied={
                      recoveryCopied
                    }
                    onCopy={() =>
                      void copyRecoveryCodes()
                    }
                    onDone={() => {
                      setRecoveryCodes(
                        []
                      );

                      setTwoFactorCode(
                        ''
                      );

                      void loadTwoFactor();
                    }}
                  />
                )}

                {twoFactor?.enabled &&
                  recoveryCodes.length ===
                    0 && (
                    <div className="mt-6 space-y-5">
                      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                        <p className="font-semibold">
                          Replace recovery codes
                        </p>

                        <p className="mt-1 text-sm leading-6 text-zinc-500">
                          Generate a new set if your existing recovery codes are lost or exposed. Your old codes will stop working.
                        </p>

                        <form
                          onSubmit={
                            regenerateRecoveryCodes
                          }
                          className="mt-5"
                        >
                          <VerificationField
                            value={
                              twoFactorCode
                            }
                            error={
                              twoFactorCodeError
                            }
                            disabled={
                              twoFactorBusy
                            }
                            onChange={
                              setTwoFactorCode
                            }
                          />

                          <button
                            type="submit"
                            disabled={
                              twoFactorBusy
                            }
                            className={`${secondaryButton()} mt-4`}
                          >
                            {twoFactorBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4" />
                            )}

                            Generate new recovery codes
                          </button>
                        </form>
                      </section>

                      <section className="rounded-2xl border border-red-200 p-5 dark:border-red-950">
                        <p className="font-semibold text-red-700 dark:text-red-400">
                          Turn off two-factor authentication
                        </p>

                        <p className="mt-1 text-sm leading-6 text-zinc-500">
                          Your account will no longer require authenticator codes when signing in.
                        </p>

                        {twoFactor.required ? (
                          <p className="mt-4 rounded-xl bg-zinc-100 p-4 text-sm font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                            Two-factor authentication is required for this account and cannot be turned off.
                          </p>
                        ) : (
                          <form
                            onSubmit={
                              disableTwoFactor
                            }
                            className="mt-5"
                          >
                            <VerificationField
                              value={
                                twoFactorCode
                              }
                              error={
                                twoFactorCodeError
                              }
                              disabled={
                                twoFactorBusy
                              }
                              onChange={
                                setTwoFactorCode
                              }
                            />

                            <button
                              type="submit"
                              disabled={
                                twoFactorBusy
                              }
                              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                            >
                              {twoFactorBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4" />
                              )}

                              Turn off
                            </button>
                          </form>
                        )}
                      </section>
                    </div>
                  )}
              </div>
            )}
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'password'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            label="Password & security"
            onClick={
              closePassword
            }
            disabled={
              savingPassword
            }
          />


          <section
            id="change-password"
            className="mt-4 scroll-mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <SectionHeader
              icon={
                <LockKeyhole className="h-5 w-5" />
              }
              title="Change password"
              description="Choose a strong password you do not use elsewhere."
            />

            <form
              onSubmit={
                changePassword
              }
              className="p-6 sm:p-7"
            >
              <div className="space-y-5">
                <PasswordField
                  label="Current password"
                  value={
                    currentPassword
                  }
                  visible={
                    showCurrentPassword
                  }
                  error={
                    currentPasswordError
                  }
                  autoComplete="current-password"
                  disabled={
                    savingPassword
                  }
                  onChange={
                    setCurrentPassword
                  }
                  onToggle={() =>
                    setShowCurrentPassword(
                      current =>
                        !current
                    )
                  }
                />

                <PasswordField
                  label="New password"
                  value={
                    newPassword
                  }
                  visible={
                    showNewPassword
                  }
                  error={
                    newPasswordError
                  }
                  autoComplete="new-password"
                  disabled={
                    savingPassword
                  }
                  onChange={
                    setNewPassword
                  }
                  onToggle={() =>
                    setShowNewPassword(
                      current =>
                        !current
                    )
                  }
                />

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                    Password requirements
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <PasswordRule
                      passed={
                        passwordRules.length
                      }
                    >
                      8–128 characters
                    </PasswordRule>

                    <PasswordRule
                      passed={
                        passwordRules.uppercase
                      }
                    >
                      One uppercase letter
                    </PasswordRule>

                    <PasswordRule
                      passed={
                        passwordRules.lowercase
                      }
                    >
                      One lowercase letter
                    </PasswordRule>

                    <PasswordRule
                      passed={
                        passwordRules.number
                      }
                    >
                      One number
                    </PasswordRule>
                  </div>
                </div>

                <PasswordField
                  label="Confirm new password"
                  value={
                    confirmPassword
                  }
                  visible={
                    showConfirmPassword
                  }
                  error={
                    confirmPasswordError
                  }
                  autoComplete="new-password"
                  disabled={
                    savingPassword
                  }
                  onChange={
                    setConfirmPassword
                  }
                  onToggle={() =>
                    setShowConfirmPassword(
                      current =>
                        !current
                    )
                  }
                />
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    savingPassword
                  }
                  onClick={
                    closePassword
                  }
                  className={
                    secondaryButton()
                  }
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingPassword ||
                    !passwordChanged
                  }
                  className={
                    primaryButton()
                  }
                >
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}

                  {savingPassword
                    ? 'Changing password'
                    : 'Change password'}
                </button>
              </div>
            </form>
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'profile'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            onClick={() =>
              setView(
                'overview'
              )
            }
            disabled={
              savingProfile ||
              avatarBusy
            }
          />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={
                <UserRound className="h-5 w-5" />
              }
              title="Personal information"
              description="Manage your name and profile photo."
            />

            <div className="border-b border-zinc-200 p-6 dark:border-zinc-800 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <UserAvatar
                  avatarFileId={
                    account.avatarFileId
                  }
                  displayName={
                    account.fullName
                  }
                  initials={
                    initials(
                      account
                    )
                  }
                  endpoint="/api/admin/account/avatar"
                  size="lg"
                  className="ring-4 ring-zinc-100 dark:ring-zinc-800"
                />

                <div className="flex-1">
                  <p className="text-sm font-bold">
                    Profile photo
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    JPEG, PNG or WebP. Maximum 5 MB.
                  </p>

                  <input
                    ref={
                      avatarInputRef
                    }
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={
                      avatarBusy
                    }
                    onChange={
                      uploadAvatar
                    }
                  />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        avatarBusy
                      }
                      onClick={
                        openAvatarPicker
                      }
                      className={
                        secondaryButton()
                      }
                    >
                      {savingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : account.avatarFileId ? (
                        <Camera className="h-4 w-4" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}

                      {account.avatarFileId
                        ? 'Change photo'
                        : 'Upload photo'}
                    </button>

                    {account.avatarFileId && (
                      <button
                        type="button"
                        disabled={
                          avatarBusy
                        }
                        onClick={() =>
                          void removeAvatar()
                        }
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <form
              onSubmit={
                saveProfile
              }
              className="p-6 sm:p-7"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <label className="text-sm font-semibold">
                    First name
                  </label>

                  <input
                    value={
                      firstName
                    }
                    disabled={
                      savingProfile
                    }
                    onChange={
                      event =>
                        setFirstName(
                          event.target
                            .value
                        )
                    }
                    className={
                      inputClass(
                        Boolean(
                          firstNameError
                        )
                      )
                    }
                  />

                  {firstNameError && (
                    <FieldError>
                      {firstNameError}
                    </FieldError>
                  )}
                </Field>

                <Field>
                  <label className="text-sm font-semibold">
                    Last name
                  </label>

                  <input
                    value={
                      lastName
                    }
                    disabled={
                      savingProfile
                    }
                    onChange={
                      event =>
                        setLastName(
                          event.target
                            .value
                        )
                    }
                    className={
                      inputClass(
                        Boolean(
                          lastNameError
                        )
                      )
                    }
                  />

                  {lastNameError && (
                    <FieldError>
                      {lastNameError}
                    </FieldError>
                  )}
                </Field>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 text-zinc-400" />

                  <div>
                    <p className="text-sm font-semibold">
                      {account.email}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      Your sign-in email uses a separate verification process.
                    </p>
                  </div>
                </div>
              </div>

              <FormActions
                saving={
                  savingProfile
                }
                changed={
                  profileChanged
                }
                onCancel={() =>
                  setView(
                    'overview'
                  )
                }
              />
            </form>
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'preferences'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-5xl">
          <BackButton
            onClick={() => {
              setDraftPreferences({
                ...preferences,
              });

              applyTheme(
                preferences.theme
              );

              setView(
                'overview'
              );
            }}
            disabled={
              savingPreferences
            }
          />

          <form
            onSubmit={
              savePreferences
            }
            className="mt-4 space-y-5"
          >
            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <SectionHeader
                icon={
                  <Settings2 className="h-5 w-5" />
                }
                title="Preferences"
                description="Personalize your workspace."
              />

              <div className="p-6 sm:p-7">
                <p className="text-sm font-semibold">
                  Appearance
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <ThemeOption
                    active={
                      draftPreferences.theme ===
                      'system'
                    }
                    icon={
                      <Monitor className="h-5 w-5" />
                    }
                    title="System"
                    onClick={() =>
                      updatePreference(
                        'theme',
                        'system'
                      )
                    }
                  />

                  <ThemeOption
                    active={
                      draftPreferences.theme ===
                      'light'
                    }
                    icon={
                      <Sun className="h-5 w-5" />
                    }
                    title="Light"
                    onClick={() =>
                      updatePreference(
                        'theme',
                        'light'
                      )
                    }
                  />

                  <ThemeOption
                    active={
                      draftPreferences.theme ===
                      'dark'
                    }
                    icon={
                      <Moon className="h-5 w-5" />
                    }
                    title="Dark"
                    onClick={() =>
                      updatePreference(
                        'theme',
                        'dark'
                      )
                    }
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="grid divide-y divide-zinc-200 dark:divide-zinc-800 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <PreferenceBlock
                  icon={
                    <Languages className="h-5 w-5" />
                  }
                  title="Language & locale"
                >
                  <select
                    value={
                      draftPreferences.locale
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'locale',
                          event.target
                            .value
                        )
                    }
                    className={
                      selectClass()
                    }
                  >
                    {LOCALES.map(
                      item => (
                        <option
                          key={
                            item.value
                          }
                          value={
                            item.value
                          }
                        >
                          {item.label}
                        </option>
                      )
                    )}
                  </select>
                </PreferenceBlock>

                <PreferenceBlock
                  icon={
                    <Globe2 className="h-5 w-5" />
                  }
                  title="Time zone"
                >
                  <select
                    value={
                      draftPreferences.timezone
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'timezone',
                          event.target
                            .value
                        )
                    }
                    className={
                      selectClass()
                    }
                  >
                    {TIMEZONES.map(
                      timezone => (
                        <option
                          key={
                            timezone
                          }
                          value={
                            timezone
                          }
                        >
                          {timezone}
                        </option>
                      )
                    )}
                  </select>
                </PreferenceBlock>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-5 w-5 text-zinc-500" />

                  <p className="font-semibold">
                    Date & time
                  </p>
                </div>
              </div>

              <div className="grid gap-5 p-6 sm:p-7 lg:grid-cols-3">
                <Field>
                  <label className="text-sm font-semibold">
                    Date format
                  </label>

                  <select
                    value={
                      draftPreferences.dateFormat
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'dateFormat',
                          event.target
                            .value as
                            AdminDateFormat
                        )
                    }
                    className={
                      selectClass()
                    }
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

                <Field>
                  <label className="text-sm font-semibold">
                    Time format
                  </label>

                  <select
                    value={
                      draftPreferences.timeFormat
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'timeFormat',
                          event.target
                            .value as
                            AdminTimeFormat
                        )
                    }
                    className={
                      selectClass()
                    }
                  >
                    <option value="12h">
                      12-hour
                    </option>

                    <option value="24h">
                      24-hour
                    </option>
                  </select>
                </Field>

                <Field>
                  <label className="text-sm font-semibold">
                    First day of week
                  </label>

                  <select
                    value={
                      draftPreferences.firstDayOfWeek
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'firstDayOfWeek',
                          Number(
                            event.target
                              .value
                          )
                        )
                    }
                    className={
                      selectClass()
                    }
                  >
                    {DAYS.map(
                      (
                        day,
                        index
                      ) => (
                        <option
                          key={day}
                          value={
                            index
                          }
                        >
                          {day}
                        </option>
                      )
                    )}
                  </select>
                </Field>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-200 p-6 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setDraftPreferences({
                      ...preferences,
                    });

                    applyTheme(
                      preferences.theme
                    );

                    setView(
                      'overview'
                    );
                  }}
                  className={
                    secondaryButton()
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingPreferences ||
                    !preferencesChanged
                  }
                  className={
                    primaryButton()
                  }
                >
                  {savingPreferences ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}

                  Save preferences
                </button>
              </div>
            </section>
          </form>
        </div>

        {overlayElement}
      </>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="p-6 sm:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <UserAvatar
                  avatarFileId={
                    account.avatarFileId
                  }
                  displayName={
                    account.fullName
                  }
                  initials={
                    initials(
                      account
                    )
                  }
                  endpoint="/api/admin/account/avatar"
                  size="lg"
                  className="ring-4 ring-zinc-100 dark:ring-zinc-800"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-bold">
                      {account.fullName}
                    </p>

                    {account.emailVerified && (
                      <BadgeCheck className="h-5 w-5 text-emerald-500" />
                    )}
                  </div>

                  <p className="mt-1 truncate text-sm text-zinc-500">
                    {account.email}
                  </p>

                  <button
                    type="button"
                    onClick={
                      openProfile
                    }
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <Camera className="h-3.5 w-3.5" />

                    {account.avatarFileId
                      ? 'Change profile photo'
                      : 'Add profile photo'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800">
                  {labelFromValue(
                    account.role
                  )}
                </span>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {labelFromValue(
                    account.status
                  )}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
            <p className="font-bold">
              Account settings
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Manage your personal account.
            </p>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <SettingsRow
              icon={
                <UserRound className="h-5 w-5" />
              }
              title="Personal information"
              description={`${account.firstName} ${account.lastName}`}
              onClick={
                openProfile
              }
            />

            <Link
              href="/admin/settings/account/email"
              className="group flex items-center gap-4 px-6 py-5 transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
            >
              <IconBox>
                <Mail className="h-5 w-5" />
              </IconBox>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    Email
                  </p>

                  {account.emailVerified && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Verified
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {account.email}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 text-zinc-400" />
            </Link>

            <SettingsRow
              icon={
                <Settings2 className="h-5 w-5" />
              }
              title="Preferences"
              description={`${themeLabel(
                preferences.theme
              )} · ${
                preferences.timezone
              } · ${
                preferences.timeFormat ===
                '24h'
                  ? '24-hour time'
                  : '12-hour time'
              }`}
              onClick={() => {
                setDraftPreferences({
                  ...preferences,
                });

                setView(
                  'preferences'
                );
              }}
            />

            <SettingsRow
              icon={
                <KeyRound className="h-5 w-5" />
              }
              title="Password & security"
              description={
                account.twoFactorEnabled
                  ? 'Password and two-factor authentication'
                  : 'Password and sign-in protection'
              }
              onClick={() => setView('security')}
              trailing={
                account.twoFactorEnabled ? (
                  <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Protected
                  </span>
                ) : undefined
              }
            />
          </div>
        </section>
      </div>

      {overlayElement}
    </>
  );
}

function PasswordField({
  label,
  value,
  visible,
  error,
  autoComplete,
  disabled,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  error: string | null;
  autoComplete:
    | 'current-password'
    | 'new-password';
  disabled: boolean;
  onChange:
    (value: string) => void;
  onToggle:
    () => void;
}) {
  return (
    <Field>
      <label className="text-sm font-semibold">
        {label}
      </label>

      <div className="relative mt-2">
        <input
          type={
            visible
              ? 'text'
              : 'password'
          }
          value={value}
          disabled={
            disabled
          }
          autoComplete={
            autoComplete
          }
          maxLength={128}
          onChange={
            event =>
              onChange(
                event.target.value
              )
          }
          className={`h-12 w-full rounded-xl border bg-white px-4 pr-12 text-sm font-medium outline-none transition dark:bg-zinc-950 ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
              : 'border-zinc-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700'
          }`}
        />

        <button
          type="button"
          disabled={
            disabled
          }
          onClick={
            onToggle
          }
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <FieldError>
          {error}
        </FieldError>
      )}
    </Field>
  );
}

function VerificationField({
  value,
  error,
  disabled,
  onChange,
}: {
  value: string;
  error: string | null;
  disabled: boolean;
  onChange:
    (value: string) => void;
}) {
  return (
    <Field>
      <label className="text-sm font-semibold">
        Verification code
      </label>

      <input
        value={value}
        disabled={
          disabled
        }
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        onChange={
          event =>
            onChange(
              event.target.value
                .replace(
                  /\D/g,
                  ''
                )
                .slice(
                  0,
                  6
                )
            )
        }
        className={`${inputClass(
          Boolean(
            error
          )
        )} font-mono tracking-[0.35em]`}
      />

      {error && (
        <FieldError>
          {error}
        </FieldError>
      )}
    </Field>
  );
}

function RecoveryCodes({
  codes,
  copied,
  onCopy,
  onDone,
}: {
  codes: string[];
  copied: boolean;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-950 dark:bg-amber-950/20">
      <div className="flex gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

        <div>
          <p className="font-bold">
            Save your recovery codes
          </p>

          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Keep these codes somewhere safe. Each code can be used once if you cannot access your authenticator app.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 rounded-2xl border border-amber-200 bg-white p-4 font-mono text-sm font-semibold dark:border-amber-950 dark:bg-zinc-950 sm:grid-cols-2">
        {codes.map(
          code => (
            <div
              key={code}
              className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
            >
              {code}
            </div>
          )
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={
            onCopy
          }
          className={
            secondaryButton()
          }
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}

          {copied
            ? 'Copied'
            : 'Copy codes'}
        </button>

        <button
          type="button"
          onClick={
            onDone
          }
          className={
            primaryButton()
          }
        >
          I saved my codes
        </button>
      </div>
    </section>
  );
}

function SecurityInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-semibold text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  enabled,
  required,
}: {
  enabled: boolean;
  required: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        enabled
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : required
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300'
      }`}
    >
      {enabled
        ? 'Enabled'
        : required
          ? 'Required'
          : 'Not enabled'}
    </span>
  );
}

function PasswordRule({
  passed,
  children,
}: {
  passed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs ${
        passed
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-zinc-500'
      }`}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full ${
          passed
            ? 'bg-emerald-100 dark:bg-emerald-950'
            : 'bg-zinc-200 dark:bg-zinc-800'
        }`}
      >
        {passed && (
          <Check className="h-3 w-3" />
        )}
      </span>

      {children}
    </div>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-950"
    >
      <IconBox>
        {icon}
      </IconBox>

      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {title}
        </p>

        <p className="mt-1 truncate text-sm text-zinc-500">
          {description}
        </p>
      </div>

      {trailing}

      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
    </button>
  );
}

function IconBox({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <IconBox>
          {icon}
        </IconBox>

        <div>
          <p className="font-bold">
            {title}
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function BackButton({
  onClick,
  disabled,
  label = 'My Account',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      {children}
    </div>
  );
}

function FieldError({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

function PreferenceBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="p-6 sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        {icon}

        <p className="font-semibold">
          {title}
        </p>
      </div>

      {children}
    </div>
  );
}

function ThemeOption({
  active,
  icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/10 dark:bg-blue-950/30 dark:text-blue-300'
          : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      {icon}

      <span className="font-semibold">
        {title}
      </span>

      {active && (
        <Check className="ml-auto h-4 w-4" />
      )}
    </button>
  );
}

function FormActions({
  saving,
  changed,
  onCancel,
}: {
  saving: boolean;
  changed: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800 sm:flex-row sm:justify-end">
      <button
        type="button"
        disabled={
          saving
        }
        onClick={
          onCancel
        }
        className={
          secondaryButton()
        }
      >
        <X className="h-4 w-4" />
        Cancel
      </button>

      <button
        type="submit"
        disabled={
          saving ||
          !changed
        }
        className={
          primaryButton()
        }
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}

        {saving
          ? 'Saving'
          : 'Save changes'}
      </button>
    </div>
  );
}

function inputClass(
  error = false
) {
  return `mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium text-zinc-950 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-950 dark:text-white ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:border-red-700'
      : 'border-zinc-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700'
  }`;
}

function selectClass() {
  return 'mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
}

function primaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200';
}

function secondaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
}