'use client';

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
  CalendarDays,
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
  method?: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  recoveryCodesRemaining: number;
};

type TwoFactorSetup = {
  method: string;
  secret: string;
  otpauthUrl: string;
  qrDataUrl?: string | null;
};

type EmailTwoFactorState = {
  enabled: boolean;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  authenticatorEnabled: boolean;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  email: string;
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

type ActivityStatus =
  | 'success'
  | 'failed'
  | 'blocked';

type SecurityActivityItem = {
  id: string;
  source: 'audit' | 'login';
  eventType: string;
  action?: string | null;
  category?: string;
  status?: ActivityStatus;
  title?: string;
  description?: string;
  successful?: boolean;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
  createdAt: string | null;
};

type ActivityFilter =
  | 'all'
  | 'sign_ins'
  | 'security_changes';

type ActivityStatusFilter =
  | 'all'
  | 'success'
  | 'failed'
  | 'blocked';

type ApiPayload = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  field?: string;

  account?: AdminAccount;
  preferences?: AdminPreferences;

  avatar?: {
    id: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  };

  otherSessionsRevoked?: number;

  twoFactor?: TwoFactorState;
  twoFactorEnabled?: boolean;
  setup?: TwoFactorSetup;
  recoveryCodes?: string[];

  emailTwoFactor?: EmailTwoFactorState;
  emailTwoFactorEnabled?: boolean;
  authenticatorEnabled?: boolean;
  contextToken?: string;
  expiresInMinutes?: number;

  sessions?: AdminSessionItem[];
  revokedCount?: number;
  revokedSessionId?: string;

  activity?: SecurityActivityItem[];

  pagination?: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
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
  primaryAction?: {
    label: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
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

  root.classList.toggle(
    'dark',
    window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches
  );
}

function initials(
  account: AdminAccount
) {
  return (
    `${account.firstName
      ?.trim()
      .charAt(0) || ''}${account.lastName
      ?.trim()
      .charAt(0) || ''}`
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

function formatDate(
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

function sessionDeviceLabel(
  item: AdminSessionItem
) {
  if (
    item.browser &&
    item.operatingSystem
  ) {
    return `${item.browser} on ${item.operatingSystem}`;
  }

  return (
    item.browser ||
    item.operatingSystem ||
    item.deviceType ||
    'Unknown device'
  );
}

function primaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200';
}

function secondaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';
}

function dangerButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50';
}

function inputClass(
  error = false
) {
  return `mt-2 h-12 w-full rounded-xl border bg-white px-4 text-sm font-medium outline-none transition dark:bg-zinc-950 ${
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
      : 'border-zinc-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700'
  }`;
}

function selectClass() {
  return 'mt-2 h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-700 dark:bg-zinc-950';
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
    avatarBusy,
    setAvatarBusy,
  ] =
    useState(false);

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
    twoFactorError,
    setTwoFactorError,
  ] =
    useState<string | null>(
      null
    );

  const [
    twoFactorBusy,
    setTwoFactorBusy,
  ] =
    useState(false);

  const [
    loadingTwoFactor,
    setLoadingTwoFactor,
  ] =
    useState(false);

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] =
    useState<string[]>([]);

  const [
    emailTwoFactor,
    setEmailTwoFactor,
  ] =
    useState<EmailTwoFactorState | null>(
      null
    );

  const [
    emailAction,
    setEmailAction,
  ] =
    useState<
      'enable' |
      'disable' |
      null
    >(null);

  const [
    emailContextToken,
    setEmailContextToken,
  ] =
    useState('');

  const [
    emailCode,
    setEmailCode,
  ] =
    useState('');

  const [
    emailCodeError,
    setEmailCodeError,
  ] =
    useState<string | null>(
      null
    );

  const [
    emailBusy,
    setEmailBusy,
  ] =
    useState(false);

  const [
    sessions,
    setSessions,
  ] =
    useState<AdminSessionItem[]>(
      []
    );

  const [
    loadingSessions,
    setLoadingSessions,
  ] =
    useState(false);

  const [
    sessionBusyId,
    setSessionBusyId,
  ] =
    useState<string | null>(
      null
    );

  const [
    revokingOthers,
    setRevokingOthers,
  ] =
    useState(false);

  const [
    securityActivity,
    setSecurityActivity,
  ] =
    useState<SecurityActivityItem[]>(
      []
    );

  const [
    loadingActivity,
    setLoadingActivity,
  ] =
    useState(false);

  const [
    loadingMoreActivity,
    setLoadingMoreActivity,
  ] =
    useState(false);

  const [
    activityFilter,
    setActivityFilter,
  ] =
    useState<ActivityFilter>(
      'all'
    );

  const [
    activityStatus,
    setActivityStatus,
  ] =
    useState<ActivityStatusFilter>(
      'all'
    );

  const [
    activityCursor,
    setActivityCursor,
  ] =
    useState<string | null>(
      null
    );

  const [
    activityHasMore,
    setActivityHasMore,
  ] =
    useState(false);

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

  function closeOverlay() {
    setOverlay(
      current => ({
        ...current,
        open: false,
      })
    );
  }

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

  function sessionExpired() {
    showOverlay(
      'warning',
      'Administrator session expired',
      'Your administrator session is no longer active. Sign in again to continue.',
      {
        label: 'Sign in again',
        onClick: () =>
          router.replace(
            '/admin/login'
          ),
      }
    );
  }

  const loadData =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const [
            accountResponse,
            preferencesResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/admin/account',
                {
                  cache:
                    'no-store',
                  credentials:
                    'same-origin',
                }
              ),

              fetch(
                '/api/admin/account/preferences',
                {
                  cache:
                    'no-store',
                  credentials:
                    'same-origin',
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
                'SaMi could not load your account.'
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
          showOverlay(
            'error',
            'Account unavailable',
            error instanceof Error
              ? error.message
              : 'SaMi could not load your account.'
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
    );

  async function saveProfile(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !account ||
      savingProfile
    ) {
      return;
    }

    const first =
      normalizeName(
        firstName
      );

    const last =
      normalizeName(
        lastName
      );

    setFirstNameError(null);
    setLastNameError(null);

    if (!validName(first)) {
      setFirstNameError(
        'Enter a valid first name.'
      );
      return;
    }

    if (!validName(last)) {
      setLastNameError(
        'Enter a valid last name.'
      );
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
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                firstName: first,
                lastName: last,
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
        throw new Error(
          payload.error ||
            'SaMi could not update your profile.'
        );
      }

      setAccount(
        current =>
          current
            ? {
                ...current,
                ...payload.account,
              }
            : current
      );

      setView(
        'overview'
      );

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

    setAvatarBusy(true);

    try {
      const formData =
        new FormData();

      formData.append(
        'avatar',
        file
      );

      const response =
        await fetch(
          '/api/admin/account/avatar',
          {
            method: 'POST',
            credentials:
              'same-origin',
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

      if (
        !response.ok ||
        !payload.avatar
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not update your profile photo.'
        );
      }

      setAccount(
        current =>
          current
            ? {
                ...current,
                avatarFileId:
                  payload.avatar!
                    .id,
                avatarUrl:
                  payload.avatar!
                    .url,
              }
            : current
      );

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
      setAvatarBusy(false);
    }
  }

  function confirmRemoveAvatar() {
    if (
      !account?.avatarFileId ||
      avatarBusy
    ) {
      return;
    }

    showOverlay(
      'warning',
      'Remove profile photo?',
      'Your current profile photo will be removed.',
      {
        label: 'Remove photo',
        onClick: () => {
          closeOverlay();
          void removeAvatar();
        },
      },
      {
        label: 'Cancel',
        onClick:
          closeOverlay,
      }
    );
  }

  async function removeAvatar() {
    setAvatarBusy(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/avatar',
          {
            method: 'DELETE',
            credentials:
              'same-origin',
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
      setAvatarBusy(false);
    }
  }

  const preferencesChanged =
    JSON.stringify(
      preferences
    ) !==
    JSON.stringify(
      draftPreferences
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

    if (key === 'theme') {
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
            headers: {
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
            'SaMi could not save your preferences.'
        );
      }

      setPreferences(
        payload.preferences
      );

      setDraftPreferences(
        payload.preferences
      );

      applyTheme(
        payload.preferences
          .theme
      );

      setView(
        'overview'
      );

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
          : 'SaMi could not save your preferences.'
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
          /\d/.test(
            newPassword
          ),
      }),
      [newPassword]
    );

  async function changePassword(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setCurrentPasswordError(
      null
    );
    setNewPasswordError(null);
    setConfirmPasswordError(
      null
    );

    if (!currentPassword) {
      setCurrentPasswordError(
        'Enter your current password.'
      );
      return;
    }

    if (
      !Object.values(
        passwordRules
      ).every(Boolean)
    ) {
      setNewPasswordError(
        'Your new password does not meet the requirements.'
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setConfirmPasswordError(
        'The passwords do not match.'
      );
      return;
    }

    if (
      currentPassword ===
      newPassword
    ) {
      setNewPasswordError(
        'Choose a password different from your current password.'
      );
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
            headers: {
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

        throw new Error(
          payload.error ||
            'SaMi could not change your password.'
        );
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setView(
        'security'
      );

      showOverlay(
        'success',
        'Password changed',
        payload.otherSessionsRevoked
          ? `Your password has been changed. ${payload.otherSessionsRevoked} other session${payload.otherSessionsRevoked === 1 ? '' : 's'} were signed out.`
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

  async function loadTwoFactor() {
    setLoadingTwoFactor(true);

    try {
      const [
        authenticatorResponse,
        emailResponse,
      ] =
        await Promise.all([
          fetch(
            '/api/admin/account/two-factor',
            {
              cache:
                'no-store',
              credentials:
                'same-origin',
            }
          ),

          fetch(
            '/api/admin/account/email-two-factor',
            {
              cache:
                'no-store',
              credentials:
                'same-origin',
            }
          ),
        ]);

      const [
        authenticatorPayload,
        emailPayload,
      ] =
        await Promise.all([
          readPayload(
            authenticatorResponse
          ),
          readPayload(
            emailResponse
          ),
        ]);

      if (
        authenticatorResponse.status ===
          401 ||
        emailResponse.status ===
          401
      ) {
        sessionExpired();
        return;
      }

      if (
        !authenticatorResponse.ok ||
        !authenticatorPayload.twoFactor
      ) {
        throw new Error(
          authenticatorPayload.error ||
            'SaMi could not load authenticator settings.'
        );
      }

      if (
        !emailResponse.ok ||
        !emailPayload.emailTwoFactor
      ) {
        throw new Error(
          emailPayload.error ||
            'SaMi could not load email verification settings.'
        );
      }

      setTwoFactor(
        authenticatorPayload.twoFactor
      );

      setEmailTwoFactor(
        emailPayload.emailTwoFactor
      );

      setAccount(
        current =>
          current
            ? {
                ...current,
                twoFactorEnabled:
                  Boolean(
                    authenticatorPayload
                      .twoFactor
                      ?.enabled ||
                    emailPayload
                      .emailTwoFactor
                      ?.enabled
                  ),
              }
            : current
      );
    } catch (error) {
      showOverlay(
        'error',
        'Security settings unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load two-factor authentication settings.'
      );
    } finally {
      setLoadingTwoFactor(false);
    }
  }

  async function openTwoFactor() {
    setView(
      'two-factor'
    );

    setTwoFactorSetup(null);
    setTwoFactorCode('');
    setTwoFactorError(null);
    setEmailAction(null);
    setEmailCode('');
    setEmailCodeError(null);
    setRecoveryCodes([]);

    await loadTwoFactor();
  }

  async function authenticatorRequest(
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
          headers: {
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

  async function startAuthenticator() {
    setTwoFactorBusy(true);
    setTwoFactorError(null);

    try {
      const payload =
        await authenticatorRequest({
          action:
            'start_setup',
        });

      if (!payload.setup) {
        throw new Error(
          'Authenticator setup could not be started.'
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
          : 'Authenticator setup could not be started.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmAuthenticator(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    setTwoFactorError(null);

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorError(
        'Enter the 6-digit code from your authenticator app.'
      );
      return;
    }

    setTwoFactorBusy(true);

    try {
      const payload =
        await authenticatorRequest({
          action:
            'confirm_setup',
          code,
        });

      setRecoveryCodes(
        payload.recoveryCodes ??
          []
      );

      setTwoFactorSetup(null);
      setTwoFactorCode('');

      await loadTwoFactor();

      showOverlay(
        'success',
        'Authenticator enabled',
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

      setTwoFactorError(
        error instanceof Error
          ? error.message
          : 'The verification code could not be confirmed.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  function confirmDisableAuthenticator() {
    if (
      twoFactor?.required &&
      !emailTwoFactor?.enabled
    ) {
      showOverlay(
        'warning',
        'Two-factor authentication required',
        'Enable another verification method before removing the authenticator.'
      );
      return;
    }

    setTwoFactorCode('');
    setTwoFactorError(null);

    showOverlay(
      'warning',
      'Turn off authenticator?',
      'Enter a current authenticator code in the form, then confirm the removal.',
      {
        label: 'Continue',
        onClick:
          closeOverlay,
      }
    );
  }

  async function disableAuthenticator(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorError(
        'Enter the 6-digit code from your authenticator app.'
      );
      return;
    }

    setTwoFactorBusy(true);

    try {
      await authenticatorRequest({
        action: 'disable',
        code,
      });

      setTwoFactorCode('');

      await loadTwoFactor();

      showOverlay(
        'success',
        'Authenticator removed',
        'Authenticator verification has been turned off.'
      );
    } catch (error) {
      setTwoFactorError(
        error instanceof Error
          ? error.message
          : 'Authenticator verification could not be turned off.'
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

    const code =
      twoFactorCode
        .replace(/\s+/g, '')
        .trim();

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setTwoFactorError(
        'Enter the 6-digit code from your authenticator app.'
      );
      return;
    }

    setTwoFactorBusy(true);

    try {
      const payload =
        await authenticatorRequest({
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
      setTwoFactorError(
        error instanceof Error
          ? error.message
          : 'Recovery codes could not be replaced.'
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function emailTwoFactorRequest(
    body: Record<
      string,
      unknown
    >
  ) {
    const response =
      await fetch(
        '/api/admin/account/email-two-factor',
        {
          method: 'POST',
          credentials:
            'same-origin',
          headers: {
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
          'SaMi could not complete email verification.'
      );
    }

    return payload;
  }

  async function requestEmailEnable() {
    setEmailBusy(true);
    setEmailCodeError(null);

    try {
      const payload =
        await emailTwoFactorRequest({
          action:
            'request_enable',
        });

      if (
        !payload.contextToken
      ) {
        throw new Error(
          'SaMi could not start email verification.'
        );
      }

      setEmailAction(
        'enable'
      );

      setEmailContextToken(
        payload.contextToken
      );

      setEmailCode('');

      showOverlay(
        'info',
        'Security code sent',
        'A 6-digit security code has been sent to your administrator email.'
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
        'Code could not be sent',
        error instanceof Error
          ? error.message
          : 'SaMi could not send the security code.'
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function requestEmailDisable() {
    setEmailBusy(true);
    setEmailCodeError(null);

    try {
      const payload =
        await emailTwoFactorRequest({
          action:
            'request_disable',
        });

      if (
        !payload.contextToken
      ) {
        throw new Error(
          'SaMi could not start this verification.'
        );
      }

      setEmailAction(
        'disable'
      );

      setEmailContextToken(
        payload.contextToken
      );

      setEmailCode('');

      showOverlay(
        'info',
        'Security code sent',
        'Confirm the security code sent to your administrator email.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Verification could not start',
        error instanceof Error
          ? error.message
          : 'SaMi could not start this verification.'
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailAction(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const code =
      emailCode
        .replace(/\s+/g, '')
        .trim();

    setEmailCodeError(null);

    if (
      !/^\d{6}$/.test(
        code
      )
    ) {
      setEmailCodeError(
        'Enter the 6-digit security code.'
      );
      return;
    }

    if (
      !emailAction ||
      !emailContextToken
    ) {
      return;
    }

    setEmailBusy(true);

    try {
      const payload =
        await emailTwoFactorRequest({
          action:
            emailAction ===
            'enable'
              ? 'confirm_enable'
              : 'confirm_disable',

          code,

          contextToken:
            emailContextToken,
        });

      if (
        payload.recoveryCodes
          ?.length
      ) {
        setRecoveryCodes(
          payload.recoveryCodes
        );
      }

      const enabled =
        emailAction ===
        'enable';

      setEmailAction(null);
      setEmailContextToken('');
      setEmailCode('');

      await loadTwoFactor();

      showOverlay(
        'success',
        enabled
          ? 'Email verification enabled'
          : 'Email verification turned off',
        enabled
          ? 'Your administrator email can now be used as a two-factor verification method.'
          : 'Email verification has been removed as a two-factor method.'
      );
    } catch (error) {
      setEmailCodeError(
        error instanceof Error
          ? error.message
          : 'The security code could not be verified.'
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(
        recoveryCodes.join(
          '\n'
        )
      );

      showOverlay(
        'success',
        'Recovery codes copied',
        'Store your recovery codes somewhere safe.'
      );
    } catch {
      showOverlay(
        'warning',
        'Could not copy codes',
        'Select and save your recovery codes manually.'
      );
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/sessions',
          {
            cache:
              'no-store',
            credentials:
              'same-origin',
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
        !Array.isArray(
          payload.sessions
        )
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not load your sessions.'
        );
      }

      setSessions(
        payload.sessions
      );
    } catch (error) {
      showOverlay(
        'error',
        'Sessions unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load your sessions.'
      );
    } finally {
      setLoadingSessions(false);
    }
  }

  async function openSessions() {
    setView(
      'sessions'
    );

    await loadSessions();
  }

  function confirmRevokeSession(
    session:
      AdminSessionItem
  ) {
    if (
      session.current
    ) {
      return;
    }

    showOverlay(
      'warning',
      'Sign out this device?',
      `${sessionDeviceLabel(
        session
      )} will lose access to your administrator account.`,
      {
        label:
          'Sign out device',
        onClick: () => {
          closeOverlay();
          void revokeSession(
            session.id
          );
        },
      },
      {
        label: 'Cancel',
        onClick:
          closeOverlay,
      }
    );
  }

  async function revokeSession(
    sessionId: string
  ) {
    setSessionBusyId(
      sessionId
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/sessions',
          {
            method: 'DELETE',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                sessionId,
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
        throw new Error(
          payload.error ||
            'SaMi could not sign out this device.'
        );
      }

      setSessions(
        current =>
          current.filter(
            session =>
              session.id !==
              sessionId
          )
      );

      showOverlay(
        'success',
        'Device signed out',
        'The selected administrator session has been revoked.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Sign out failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not sign out this device.'
      );
    } finally {
      setSessionBusyId(
        null
      );
    }
  }

  function confirmRevokeOthers() {
    const count =
      sessions.filter(
        session =>
          !session.current
      ).length;

    if (!count) {
      return;
    }

    showOverlay(
      'warning',
      'Sign out all other devices?',
      `${count} other administrator session${count === 1 ? '' : 's'} will be signed out. This device will remain signed in.`,
      {
        label:
          'Sign out all others',
        onClick: () => {
          closeOverlay();
          void revokeOthers();
        },
      },
      {
        label: 'Cancel',
        onClick:
          closeOverlay,
      }
    );
  }

  async function revokeOthers() {
    setRevokingOthers(true);

    try {
      const response =
        await fetch(
          '/api/admin/account/sessions',
          {
            method: 'DELETE',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                allOthers: true,
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
        throw new Error(
          payload.error ||
            'SaMi could not sign out your other sessions.'
        );
      }

      setSessions(
        current =>
          current.filter(
            session =>
              session.current
          )
      );

      showOverlay(
        'success',
        'Other devices signed out',
        `${payload.revokedCount ?? 0} other administrator session${payload.revokedCount === 1 ? '' : 's'} were signed out.`
      );
    } catch (error) {
      showOverlay(
        'error',
        'Sign out failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not sign out your other sessions.'
      );
    } finally {
      setRevokingOthers(false);
    }
  }

  async function loadActivity(
    reset = true
  ) {
    if (reset) {
      setLoadingActivity(true);
    } else {
      setLoadingMoreActivity(
        true
      );
    }

    try {
      const params =
        new URLSearchParams({
          limit: '20',
          filter:
            activityFilter,
          status:
            activityStatus,
        });

      if (
        !reset &&
        activityCursor
      ) {
        params.set(
          'cursor',
          activityCursor
        );
      }

      const response =
        await fetch(
          `/api/admin/account/security-activity?${params.toString()}`,
          {
            cache:
              'no-store',
            credentials:
              'same-origin',
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
        !Array.isArray(
          payload.activity
        )
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not load your security activity.'
        );
      }

      setSecurityActivity(
        current =>
          reset
            ? payload.activity!
            : [
                ...current,
                ...payload.activity!,
              ]
      );

      setActivityCursor(
        payload.pagination
          ?.nextCursor ??
          null
      );

      setActivityHasMore(
        Boolean(
          payload.pagination
            ?.hasMore
        )
      );
    } catch (error) {
      showOverlay(
        'error',
        'Security activity unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load your security activity.'
      );
    } finally {
      setLoadingActivity(
        false
      );

      setLoadingMoreActivity(
        false
      );
    }
  }

  async function openActivity() {
    setView(
      'activity'
    );

    setActivityCursor(null);
    setSecurityActivity([]);

    await loadActivity(
      true
    );
  }

  useEffect(
    () => {
      if (
        view !==
        'activity'
      ) {
        return;
      }

      setActivityCursor(null);

      void loadActivity(
        true
      );
    },
    [
      activityFilter,
      activityStatus,
    ]
  );

  const overlayElement = (
    <SaMiOverlay
      open={
        overlay.open
      }
      type={
        overlay.type
      }
      title={
        overlay.title
      }
      message={
        overlay.message
      }
      primaryAction={
        overlay.primaryAction
      }
      secondaryAction={
        overlay.secondaryAction
      }
      onClose={
        closeOverlay
      }
    />
  );

  if (loading) {
    return (
      <>
        <LoadingState />
        {overlayElement}
      </>
    );
  }

  if (!account) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <AlertTriangle className="h-8 w-8 text-red-500" />

          <p className="mt-5 text-lg font-bold">
            Account unavailable
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

  if (
    view ===
    'security'
  ) {
    return (
      <>
        <Page>
          <BackButton
            label="My Account"
            onClick={() =>
              setView(
                'overview'
              )
            }
          />

          <Card>
            <SectionHeader
              icon={
                <ShieldCheck className="h-5 w-5" />
              }
              title="Password & security"
              description="Manage your password, two-factor authentication, devices and security activity."
            />

            <Rows>
              <SettingsRow
                icon={
                  <LockKeyhole className="h-5 w-5" />
                }
                title="Password"
                description="Change your sign-in password."
                onClick={() =>
                  setView(
                    'password'
                  )
                }
              />

              <SettingsRow
                icon={
                  <ShieldCheck className="h-5 w-5" />
                }
                title="Two-factor authentication"
                description="Authenticator app, email verification and recovery codes."
                onClick={() =>
                  void openTwoFactor()
                }
                trailing={
                  account.twoFactorEnabled
                    ? (
                      <Badge>
                        Protected
                      </Badge>
                    )
                    : undefined
                }
              />

              <SettingsRow
                icon={
                  <Monitor className="h-5 w-5" />
                }
                title="Sessions & devices"
                description="Review and sign out devices with access to your account."
                onClick={() =>
                  void openSessions()
                }
              />

              <SettingsRow
                icon={
                  <BadgeCheck className="h-5 w-5" />
                }
                title="Security activity"
                description="Review recent sign-ins and security changes."
                onClick={() =>
                  void openActivity()
                }
              />
            </Rows>
          </Card>
        </Page>

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
        <Page>
          <BackButton
            label="Password & security"
            disabled={
              savingPassword
            }
            onClick={() =>
              setView(
                'security'
              )
            }
          />

          <Card>
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
              className="space-y-5 p-6 sm:p-7"
            >
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
                onChange={
                  setCurrentPassword
                }
                onToggle={() =>
                  setShowCurrentPassword(
                    value =>
                      !value
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
                onChange={
                  setNewPassword
                }
                onToggle={() =>
                  setShowNewPassword(
                    value =>
                      !value
                  )
                }
              />

              <div className="grid gap-2 rounded-2xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950 sm:grid-cols-2">
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
                  Uppercase letter
                </PasswordRule>

                <PasswordRule
                  passed={
                    passwordRules.lowercase
                  }
                >
                  Lowercase letter
                </PasswordRule>

                <PasswordRule
                  passed={
                    passwordRules.number
                  }
                >
                  Number
                </PasswordRule>
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
                onChange={
                  setConfirmPassword
                }
                onToggle={() =>
                  setShowConfirmPassword(
                    value =>
                      !value
                  )
                }
              />

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={
                    savingPassword
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

                  Change password
                </button>
              </div>
            </form>
          </Card>
        </Page>

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
        <Page>
          <BackButton
            label="Password & security"
            disabled={
              twoFactorBusy ||
              emailBusy
            }
            onClick={() =>
              setView(
                'security'
              )
            }
          />

          <Card>
            <SectionHeader
              icon={
                <ShieldCheck className="h-5 w-5" />
              }
              title="Two-factor authentication"
              description="Choose how SaMi verifies your identity when additional sign-in protection is required."
            />

            {loadingTwoFactor ? (
              <LoadingBlock />
            ) : (
              <div className="space-y-6 p-6 sm:p-7">
                <SecurityMethod
                  icon={
                    <Smartphone className="h-5 w-5" />
                  }
                  title="Authenticator app"
                  description="Use time-based codes from Google Authenticator, Microsoft Authenticator, Authy or another compatible app."
                  enabled={
                    Boolean(
                      twoFactor?.enabled
                    )
                  }
                >
                  {!twoFactor?.enabled &&
                    !twoFactorSetup && (
                      <button
                        type="button"
                        disabled={
                          twoFactorBusy
                        }
                        onClick={() =>
                          void startAuthenticator()
                        }
                        className={
                          primaryButton()
                        }
                      >
                        <Smartphone className="h-4 w-4" />
                        Set up authenticator
                      </button>
                    )}

                  {twoFactorSetup && (
                    <form
                      onSubmit={
                        confirmAuthenticator
                      }
                      className="mt-5 space-y-5"
                    >
                      {twoFactorSetup.qrDataUrl ? (
                        <div className="flex justify-center">
                          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <img
                              src={
                                twoFactorSetup.qrDataUrl
                              }
                              alt="Authenticator QR code"
                              className="h-56 w-56"
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="text-center">
                        <p className="text-sm font-semibold">
                          Scan this QR code with your authenticator app
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Then enter the 6-digit code generated by the app.
                        </p>
                      </div>

                      <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                        <summary className="cursor-pointer text-sm font-semibold">
                          Can&apos;t scan the QR code?
                        </summary>

                        <p className="mt-3 text-xs text-zinc-500">
                          Enter this setup key manually:
                        </p>

                        <p className="mt-2 break-all rounded-lg bg-zinc-100 p-3 font-mono text-sm font-bold dark:bg-zinc-950">
                          {twoFactorSetup.secret}
                        </p>
                      </details>

                      <VerificationField
                        value={
                          twoFactorCode
                        }
                        error={
                          twoFactorError
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
                        className={
                          primaryButton()
                        }
                      >
                        <Check className="h-4 w-4" />
                        Verify and enable
                      </button>
                    </form>
                  )}

                  {twoFactor?.enabled && (
                    <div className="mt-5 space-y-5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Info
                          label="Last used"
                          value={
                            formatDate(
                              twoFactor.lastUsedAt
                            )
                          }
                        />

                        <Info
                          label="Recovery codes"
                          value={`${twoFactor.recoveryCodesRemaining} remaining`}
                        />
                      </div>

                      <form
                        onSubmit={
                          regenerateRecoveryCodes
                        }
                        className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                      >
                        <p className="text-sm font-semibold">
                          Replace recovery codes
                        </p>

                        <VerificationField
                          value={
                            twoFactorCode
                          }
                          error={
                            twoFactorError
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
                          className={`${secondaryButton()} mt-4`}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Generate new codes
                        </button>
                      </form>

                      <form
                        onSubmit={
                          disableAuthenticator
                        }
                        className="rounded-xl border border-red-200 p-4 dark:border-red-950"
                      >
                        <p className="text-sm font-semibold text-red-600">
                          Turn off authenticator
                        </p>

                        <VerificationField
                          value={
                            twoFactorCode
                          }
                          error={
                            twoFactorError
                          }
                          disabled={
                            twoFactorBusy
                          }
                          onChange={
                            setTwoFactorCode
                          }
                        />

                        <button
                          type="button"
                          onClick={
                            confirmDisableAuthenticator
                          }
                          className="mt-4 text-xs font-semibold text-zinc-500"
                        >
                          Review removal
                        </button>

                        <button
                          type="submit"
                          disabled={
                            twoFactorBusy
                          }
                          className={`${dangerButton()} mt-4`}
                        >
                          Turn off authenticator
                        </button>
                      </form>
                    </div>
                  )}
                </SecurityMethod>

                <SecurityMethod
                  icon={
                    <Mail className="h-5 w-5" />
                  }
                  title="Email verification"
                  description={`Receive a 6-digit security code at ${account.email}.`}
                  enabled={
                    Boolean(
                      emailTwoFactor?.enabled
                    )
                  }
                >
                  {!emailTwoFactor?.enabled &&
                    emailAction !==
                      'enable' && (
                      <button
                        type="button"
                        disabled={
                          emailBusy ||
                          !account.emailVerified
                        }
                        onClick={() =>
                          void requestEmailEnable()
                        }
                        className={
                          secondaryButton()
                        }
                      >
                        <Mail className="h-4 w-4" />
                        Enable email verification
                      </button>
                    )}

                  {emailTwoFactor?.enabled &&
                    emailAction !==
                      'disable' && (
                      <div className="mt-4">
                        <Info
                          label="Last used"
                          value={
                            formatDate(
                              emailTwoFactor.lastUsedAt
                            )
                          }
                        />

                        <button
                          type="button"
                          disabled={
                            emailBusy
                          }
                          onClick={() =>
                            void requestEmailDisable()
                          }
                          className={`${dangerButton()} mt-4`}
                        >
                          Turn off email verification
                        </button>
                      </div>
                    )}

                  {emailAction && (
                    <form
                      onSubmit={
                        confirmEmailAction
                      }
                      className="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                    >
                      <p className="text-sm font-semibold">
                        Enter your security code
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        We sent a 6-digit code to your administrator email.
                      </p>

                      <VerificationField
                        value={
                          emailCode
                        }
                        error={
                          emailCodeError
                        }
                        disabled={
                          emailBusy
                        }
                        onChange={
                          setEmailCode
                        }
                      />

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="submit"
                          disabled={
                            emailBusy
                          }
                          className={
                            primaryButton()
                          }
                        >
                          {emailBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Confirm
                        </button>

                        <button
                          type="button"
                          disabled={
                            emailBusy
                          }
                          onClick={() => {
                            setEmailAction(
                              null
                            );
                            setEmailCode(
                              ''
                            );
                            setEmailContextToken(
                              ''
                            );
                          }}
                          className={
                            secondaryButton()
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </SecurityMethod>

                {recoveryCodes.length >
                  0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/20">
                    <p className="font-semibold">
                      Save your recovery codes
                    </p>

                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Each code can be used once if you cannot access your normal verification method.
                    </p>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {recoveryCodes.map(
                        code => (
                          <div
                            key={
                              code
                            }
                            className="rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold dark:bg-zinc-900"
                          >
                            {code}
                          </div>
                        )
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void copyRecoveryCodes()
                      }
                      className={`${secondaryButton()} mt-4`}
                    >
                      <Copy className="h-4 w-4" />
                      Copy recovery codes
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Page>

        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'sessions'
  ) {
    const otherSessions =
      sessions.filter(
        session =>
          !session.current
      );

    return (
      <>
        <Page>
          <BackButton
            label="Password & security"
            onClick={() =>
              setView(
                'security'
              )
            }
          />

          <Card>
            <SectionHeader
              icon={
                <Monitor className="h-5 w-5" />
              }
              title="Sessions & devices"
              description="Review every device currently signed in to your administrator account."
            />

            {loadingSessions ? (
              <LoadingBlock />
            ) : (
              <div className="space-y-4 p-6 sm:p-7">
                {sessions.map(
                  session => (
                    <div
                      key={
                        session.id
                      }
                      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800 sm:flex-row sm:items-center"
                    >
                      <IconBox>
                        {session.deviceType
                          ?.toLowerCase()
                          .includes(
                            'mobile'
                          ) ? (
                          <Smartphone className="h-5 w-5" />
                        ) : (
                          <Monitor className="h-5 w-5" />
                        )}
                      </IconBox>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {sessionDeviceLabel(
                              session
                            )}
                          </p>

                          {session.current && (
                            <Badge>
                              Current device
                            </Badge>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-zinc-500">
                          Last active{' '}
                          {formatDate(
                            session.lastActivityAt
                          )}
                        </p>

                        <p className="mt-1 text-xs text-zinc-400">
                          {session.ipAddress
                            ? `IP ${session.ipAddress} · `
                            : ''}
                          Signed in{' '}
                          {formatDate(
                            session.createdAt
                          )}
                        </p>

                        <p className="mt-1 text-xs text-zinc-400">
                          Session expires{' '}
                          {formatDate(
                            session.expiresAt
                          )}
                        </p>
                      </div>

                      {!session.current && (
                        <button
                          type="button"
                          disabled={
                            sessionBusyId ===
                            session.id
                          }
                          onClick={() =>
                            confirmRevokeSession(
                              session
                            )
                          }
                          className={
                            secondaryButton()
                          }
                        >
                          {sessionBusyId ===
                          session.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                          Sign out
                        </button>
                      )}
                    </div>
                  )
                )}

                {sessions.length ===
                  0 && (
                  <EmptyState>
                    No active sessions were found.
                  </EmptyState>
                )}

                {otherSessions.length >
                  0 && (
                  <div className="flex justify-end border-t border-zinc-200 pt-5 dark:border-zinc-800">
                    <button
                      type="button"
                      disabled={
                        revokingOthers
                      }
                      onClick={
                        confirmRevokeOthers
                      }
                      className={
                        dangerButton()
                      }
                    >
                      {revokingOthers ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Monitor className="h-4 w-4" />
                      )}
                      Sign out all other devices
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </Page>

        {overlayElement}
      </>
    );
  }

  if (
    view ===
    'activity'
  ) {
    return (
      <>
        <Page>
          <BackButton
            label="Password & security"
            onClick={() =>
              setView(
                'security'
              )
            }
          />

          <Card>
            <SectionHeader
              icon={
                <BadgeCheck className="h-5 w-5" />
              }
              title="Security activity"
              description="Review sign-ins and important security changes on your administrator account."
            />

            <div className="grid gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800 sm:grid-cols-2">
              <select
                value={
                  activityFilter
                }
                onChange={
                  event =>
                    setActivityFilter(
                      event.target
                        .value as
                        ActivityFilter
                    )
                }
                className={
                  selectClass()
                }
              >
                <option value="all">
                  All activity
                </option>
                <option value="sign_ins">
                  Sign-ins
                </option>
                <option value="security_changes">
                  Security changes
                </option>
              </select>

              <select
                value={
                  activityStatus
                }
                onChange={
                  event =>
                    setActivityStatus(
                      event.target
                        .value as
                        ActivityStatusFilter
                    )
                }
                className={
                  selectClass()
                }
              >
                <option value="all">
                  All statuses
                </option>
                <option value="success">
                  Successful
                </option>
                <option value="failed">
                  Failed
                </option>
                <option value="blocked">
                  Blocked
                </option>
              </select>
            </div>

            {loadingActivity ? (
              <LoadingBlock />
            ) : (
              <>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {securityActivity.map(
                    item => {
                      const successful =
                        item.status
                          ? item.status ===
                            'success'
                          : item.successful !==
                            false;

                      return (
                        <div
                          key={`${item.source}-${item.id}`}
                          className="flex gap-4 px-6 py-5"
                        >
                          <IconBox>
                            {successful ? (
                              <ShieldCheck className="h-5 w-5" />
                            ) : (
                              <AlertTriangle className="h-5 w-5 text-red-500" />
                            )}
                          </IconBox>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">
                                {item.title ||
                                  labelFromValue(
                                    item.eventType
                                  )}
                              </p>

                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  successful
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                                }`}
                              >
                                {item.status
                                  ? labelFromValue(
                                      item.status
                                    )
                                  : successful
                                    ? 'Successful'
                                    : 'Failed'}
                              </span>
                            </div>

                            {item.description && (
                              <p className="mt-1 text-sm text-zinc-500">
                                {item.description}
                              </p>
                            )}

                            <p className="mt-2 text-xs text-zinc-400">
                              {formatDate(
                                item.createdAt
                              )}
                            </p>

                            {(item.browser ||
                              item.operatingSystem ||
                              item.ipAddress) && (
                              <p className="mt-1 text-xs text-zinc-400">
                                {[
                                  item.browser &&
                                  item.operatingSystem
                                    ? `${item.browser} on ${item.operatingSystem}`
                                    : item.browser ||
                                      item.operatingSystem,

                                  item.ipAddress
                                    ? `IP ${item.ipAddress}`
                                    : null,
                                ]
                                  .filter(
                                    Boolean
                                  )
                                  .join(
                                    ' · '
                                  )}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                {securityActivity.length ===
                  0 && (
                  <div className="p-6">
                    <EmptyState>
                      No security activity matches these filters.
                    </EmptyState>
                  </div>
                )}

                {activityHasMore && (
                  <div className="flex justify-center border-t border-zinc-200 p-5 dark:border-zinc-800">
                    <button
                      type="button"
                      disabled={
                        loadingMoreActivity
                      }
                      onClick={() =>
                        void loadActivity(
                          false
                        )
                      }
                      className={
                        secondaryButton()
                      }
                    >
                      {loadingMoreActivity ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </Page>

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
        <Page>
          <BackButton
            label="My Account"
            disabled={
              savingProfile ||
              avatarBusy
            }
            onClick={() =>
              setView(
                'overview'
              )
            }
          />

          <Card>
            <SectionHeader
              icon={
                <UserRound className="h-5 w-5" />
              }
              title="Personal information"
              description="Manage your name and profile photo."
            />

            <div className="flex flex-col gap-5 border-b border-zinc-200 p-6 dark:border-zinc-800 sm:flex-row sm:items-center">
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
              />

              <div>
                <p className="font-semibold">
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
                    onClick={() =>
                      avatarInputRef.current?.click()
                    }
                    className={
                      secondaryButton()
                    }
                  >
                    {avatarBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
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
                      onClick={
                        confirmRemoveAvatar
                      }
                      className={
                        dangerButton()
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  )}
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
                <Field
                  label="First name"
                  value={
                    firstName
                  }
                  error={
                    firstNameError
                  }
                  onChange={
                    setFirstName
                  }
                />

                <Field
                  label="Last name"
                  value={
                    lastName
                  }
                  error={
                    lastNameError
                  }
                  onChange={
                    setLastName
                  }
                />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={
                    savingProfile ||
                    !profileChanged
                  }
                  className={
                    primaryButton()
                  }
                >
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save changes
                </button>
              </div>
            </form>
          </Card>
        </Page>

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
        <Page>
          <BackButton
            label="My Account"
            disabled={
              savingPreferences
            }
            onClick={() => {
              setDraftPreferences(
                preferences
              );
              applyTheme(
                preferences.theme
              );
              setView(
                'overview'
              );
            }}
          />

          <Card>
            <SectionHeader
              icon={
                <Settings2 className="h-5 w-5" />
              }
              title="Preferences"
              description="Personalize how your administrator workspace behaves."
            />

            <form
              onSubmit={
                savePreferences
              }
              className="space-y-7 p-6 sm:p-7"
            >
              <div>
                <p className="text-sm font-semibold">
                  Appearance
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      value:
                        'system' as const,
                      label:
                        'System',
                      icon:
                        <Monitor className="h-5 w-5" />,
                    },
                    {
                      value:
                        'light' as const,
                      label:
                        'Light',
                      icon:
                        <Sun className="h-5 w-5" />,
                    },
                    {
                      value:
                        'dark' as const,
                      label:
                        'Dark',
                      icon:
                        <Moon className="h-5 w-5" />,
                    },
                  ].map(
                    option => (
                      <button
                        key={
                          option.value
                        }
                        type="button"
                        onClick={() =>
                          updatePreference(
                            'theme',
                            option.value
                          )
                        }
                        className={`flex items-center gap-3 rounded-xl border p-4 text-left ${
                          draftPreferences.theme ===
                          option.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : 'border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        {option.icon}
                        <span className="font-semibold">
                          {option.label}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  label="Language & locale"
                  icon={
                    <Languages className="h-4 w-4" />
                  }
                  value={
                    draftPreferences.locale
                  }
                  onChange={
                    value =>
                      updatePreference(
                        'locale',
                        value
                      )
                  }
                >
                  {LOCALES.map(
                    locale => (
                      <option
                        key={
                          locale.value
                        }
                        value={
                          locale.value
                        }
                      >
                        {locale.label}
                      </option>
                    )
                  )}
                </SelectField>

                <SelectField
                  label="Time zone"
                  icon={
                    <Globe2 className="h-4 w-4" />
                  }
                  value={
                    draftPreferences.timezone
                  }
                  onChange={
                    value =>
                      updatePreference(
                        'timezone',
                        value
                      )
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
                </SelectField>

                <SelectField
                  label="Date format"
                  icon={
                    <CalendarDays className="h-4 w-4" />
                  }
                  value={
                    draftPreferences.dateFormat
                  }
                  onChange={
                    value =>
                      updatePreference(
                        'dateFormat',
                        value as
                          AdminDateFormat
                      )
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
                </SelectField>

                <SelectField
                  label="Time format"
                  value={
                    draftPreferences.timeFormat
                  }
                  onChange={
                    value =>
                      updatePreference(
                        'timeFormat',
                        value as
                          AdminTimeFormat
                      )
                  }
                >
                  <option value="12h">
                    12-hour
                  </option>
                  <option value="24h">
                    24-hour
                  </option>
                </SelectField>

                <SelectField
                  label="First day of week"
                  value={String(
                    draftPreferences.firstDayOfWeek
                  )}
                  onChange={
                    value =>
                      updatePreference(
                        'firstDayOfWeek',
                        Number(
                          value
                        )
                      )
                  }
                >
                  {DAYS.map(
                    (
                      day,
                      index
                    ) => (
                      <option
                        key={
                          day
                        }
                        value={
                          index
                        }
                      >
                        {day}
                      </option>
                    )
                  )}
                </SelectField>
              </div>

              <div className="flex justify-end border-t border-zinc-200 pt-6 dark:border-zinc-800">
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
            </form>
          </Card>
        </Page>

        {overlayElement}
      </>
    );
  }

  return (
    <>
      <Page>
        <Card>
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
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
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>
                {labelFromValue(
                  account.role
                )}
              </Badge>

              <Badge>
                {labelFromValue(
                  account.status
                )}
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader
            icon={
              <Settings2 className="h-5 w-5" />
            }
            title="Account settings"
            description="Manage your personal administrator account."
          />

          <Rows>
            <SettingsRow
              icon={
                <UserRound className="h-5 w-5" />
              }
              title="Personal information"
              description={`${account.firstName} ${account.lastName}`}
              onClick={() => {
                setFirstName(
                  account.firstName
                );
                setLastName(
                  account.lastName
                );
                setView(
                  'profile'
                );
              }}
            />

            <SettingsRow
              icon={
                <Mail className="h-5 w-5" />
              }
              title="Email"
              description={
                account.email
              }
              onClick={() =>
                router.push(
                  '/admin/settings/account/email'
                )
              }
              trailing={
                account.emailVerified
                  ? (
                    <Badge>
                      Verified
                    </Badge>
                  )
                  : undefined
              }
            />

            <SettingsRow
              icon={
                <Settings2 className="h-5 w-5" />
              }
              title="Preferences"
              description={`${labelFromValue(
                preferences.theme
              )} · ${preferences.timezone}`}
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
              description="Password, two-factor authentication, devices and security activity."
              onClick={() =>
                setView(
                  'security'
                )
              }
              trailing={
                account.twoFactorEnabled
                  ? (
                    <Badge>
                      Protected
                    </Badge>
                  )
                  : undefined
              }
            />
          </Rows>
        </Card>
      </Page>

      {overlayElement}
    </>
  );
}

function Page({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {children}
    </div>
  );
}

function Card({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </section>
  );
}

function Rows({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
    <div className="flex gap-4 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
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
  );
}

function SettingsRow({
  icon,
  title,
  description,
  trailing,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  trailing?:
    ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950"
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

      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
    </button>
  );
}

function IconBox({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </div>
  );
}

function Badge({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <span className="mr-1 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      {children}
    </span>
  );
}

function BackButton({
  label = 'Back',
  disabled = false,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
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
      className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error:
    string | null;
  onChange:
    (value: string) =>
      void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <input
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value
            )
        }
        className={
          inputClass(
            Boolean(error)
          )
        }
      />

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </label>
  );
}

function SelectField({
  label,
  icon,
  value,
  children,
  onChange,
}: {
  label: string;
  icon?: ReactNode;
  value: string;
  children:
    ReactNode;
  onChange:
    (value: string) =>
      void;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {label}
      </span>

      <select
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value
            )
        }
        className={
          selectClass()
        }
      >
        {children}
      </select>
    </label>
  );
}

function PasswordField({
  label,
  value,
  visible,
  error,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  error:
    string | null;
  onChange:
    (value: string) =>
      void;
  onToggle:
    () => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">
        {label}
      </span>

      <div className="relative">
        <input
          type={
            visible
              ? 'text'
              : 'password'
          }
          value={
            value
          }
          maxLength={
            128
          }
          onChange={
            event =>
              onChange(
                event.target
                  .value
              )
          }
          className={`${inputClass(
            Boolean(error)
          )} pr-12`}
        />

        <button
          type="button"
          onClick={
            onToggle
          }
          className="absolute right-3 top-[22px] rounded-lg p-1 text-zinc-400"
        >
          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </label>
  );
}

function PasswordRule({
  passed,
  children,
}: {
  passed: boolean;
  children:
    ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        passed
          ? 'text-emerald-600'
          : 'text-zinc-500'
      }`}
    >
      <Check className="h-4 w-4" />
      {children}
    </div>
  );
}

function VerificationField({
  value,
  error,
  disabled,
  onChange,
}: {
  value: string;
  error:
    string | null;
  disabled: boolean;
  onChange:
    (value: string) =>
      void;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-semibold">
        Verification code
      </span>

      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={
          6
        }
        disabled={
          disabled
        }
        value={
          value
        }
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
        placeholder="000000"
        className={`${inputClass(
          Boolean(error)
        )} font-mono text-lg tracking-[0.3em]`}
      />

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </label>
  );
}

function SecurityMethod({
  icon,
  title,
  description,
  enabled,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  children:
    ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-start gap-4">
        <IconBox>
          {icon}
        </IconBox>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {title}
            </p>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                enabled
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
              }`}
            >
              {enabled
                ? 'Enabled'
                : 'Not enabled'}
            </span>
          </div>

          <p className="mt-1 text-sm leading-6 text-zinc-500">
            {description}
          </p>

          <div className="mt-4">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-950">
      <p className="text-xs font-semibold text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-500" />

        <p className="mt-4 text-sm font-semibold">
          Loading your account
        </p>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  );
}

function EmptyState({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
      {children}
    </div>
  );
}