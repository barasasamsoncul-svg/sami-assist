'use client';

import Link from 'next/link';

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';

import { useRouter } from 'next/navigation';

import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
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
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
  AlertTriangle,
  Globe2,
  CalendarDays,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import UserAvatar from '@/app/components/account/UserAvatar';

/* ============================================================
   TYPES
   ============================================================ */

type View =
  | 'overview'
  | 'profile'
  | 'preferences'
  | 'password';

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
};

type SaMiOverlayType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

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

/* ============================================================
   HELPERS
   ============================================================ */

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
  if (
    value.length < 1 ||
    value.length > 100
  ) {
    return false;
  }

  return /^[\p{L}\p{M}'’ -]+$/u.test(
    value
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

  const result =
    `${first || ''}${last || ''}`
      .toUpperCase();

  return result || 'SA';
}

function roleLabel(
  role: string
) {
  return role
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );
}

function statusLabel(
  status: string
) {
  return status
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

  const prefersDark =
    window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

  root.classList.toggle(
    'dark',
    prefersDark
  );
}

/* ============================================================
   PAGE
   ============================================================ */

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

  /* ==========================================================
     PROFILE
     ========================================================== */

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

  /* ==========================================================
     AVATAR
     ========================================================== */

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

  /* ==========================================================
     PREFERENCES
     ========================================================== */

  const [
    savingPreferences,
    setSavingPreferences,
  ] =
    useState(false);

  /* ==========================================================
     PASSWORD
     ========================================================== */

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

  /* ==========================================================
     OVERLAY
     ========================================================== */

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
    type: SaMiOverlayType,
    title: string,
    message: string
  ) {
    setOverlay({
      open: true,
      type,
      title,
      message,
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

  function handleSessionExpired() {
    showOverlay(
      'warning',
      'Administrator session expired',
      'Your administrator session is no longer active. Sign in again to continue.'
    );
  }

  /* ==========================================================
     LOAD
     ========================================================== */

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
            handleSessionExpired();
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
                'SaMi could not load your administrator preferences.'
            );
          }

          const loadedAccount:
            AdminAccount = {
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
          console.error(
            '[Admin My Account] Load failed:',
            error
          );

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

  /* ==========================================================
     PROFILE
     ========================================================== */

  const profileChanged =
    useMemo(
      () => {
        if (!account) {
          return false;
        }

        return (
          normalizeName(
            firstName
          ) !==
            account.firstName ||
          normalizeName(
            lastName
          ) !==
            account.lastName
        );
      },
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

    let invalid =
      false;

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

    if (!profileChanged) {
      showOverlay(
        'info',
        'No changes to save',
        'Your personal information has not changed.'
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
        handleSessionExpired();
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

      const nextAccount:
        AdminAccount = {
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

  /* ==========================================================
     AVATAR
     ========================================================== */

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
        handleSessionExpired();
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
        'Your administrator profile photo has been updated.'
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
        handleSessionExpired();
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
        'Your administrator profile photo has been removed.'
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

  /* ==========================================================
     PREFERENCES
     ========================================================== */

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
        handleSessionExpired();
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
        'Your administrator preferences have been saved.'
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

  /* ==========================================================
     PASSWORD
     ========================================================== */

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
    setView('overview');
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

    let invalid =
      false;

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
        handleSessionExpired();
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

      setView('overview');

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

  /* ==========================================================
     OVERLAY
     ========================================================== */

  const overlayElement = (
    <SaMiOverlay
      open={overlay.open}
      type={overlay.type}
      title={overlay.title}
      message={overlay.message}
      primaryAction={
        overlay.title ===
        'Administrator session expired'
          ? {
              label:
                'Sign in again',

              onClick: () => {
                router.replace(
                  '/admin/login'
                );
              },
            }
          : undefined
      }
      onClose={closeOverlay}
    />
  );

  /* ==========================================================
     LOADING
     ========================================================== */

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-zinc-500" />

          <p className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
            Loading your account
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            Preparing your administrator settings.
          </p>
        </div>
      </div>
    );
  }

  /* ==========================================================
     LOAD ERROR
     ========================================================== */

  if (
    loadError ||
    !account
  ) {
    return (
      <>
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm dark:border-red-950 dark:bg-zinc-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h2 className="mt-5 text-xl font-bold text-zinc-950 dark:text-white">
            Account unavailable
          </h2>

          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {loadError ||
              'SaMi could not load your administrator account.'}
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

  /* ==========================================================
     PASSWORD VIEW
     ========================================================== */

  if (view === 'password') {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            onClick={
              closePassword
            }
            disabled={
              savingPassword
            }
          />

          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <SectionHeader
              icon={
                <KeyRound className="h-5 w-5" />
              }
              title="Password & security"
              description="Protect your administrator account and control your sign-in credentials."
            />

            <form
              onSubmit={
                changePassword
              }
              className="p-6 sm:p-7"
            >
              <div className="mb-7 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-950 dark:bg-blue-950/30">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

                  <div>
                    <p className="text-sm font-bold text-blue-950 dark:text-blue-200">
                      Administrator security
                    </p>

                    <p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">
                      Changing your password keeps this session active and revokes your other administrator sessions.
                    </p>
                  </div>
                </div>
              </div>

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

          <section className="mt-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-4 p-6">
              <IconBox>
                <ShieldCheck className="h-5 w-5" />
              </IconBox>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-zinc-950 dark:text-white">
                  Two-factor authentication
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  {account.twoFactorEnabled
                    ? 'Two-factor authentication is enabled for this administrator account.'
                    : account.twoFactorRequired
                      ? 'Two-factor authentication is required for this administrator account.'
                      : 'Additional sign-in protection for your administrator account.'}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  account.twoFactorEnabled
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {account.twoFactorEnabled
                  ? 'Enabled'
                  : account.twoFactorRequired
                    ? 'Required'
                    : 'Not enabled'}
              </span>
            </div>
          </section>
        </div>

        {overlayElement}
      </>
    );
  }

  /* ==========================================================
     PROFILE VIEW
     ========================================================== */

  if (view === 'profile') {
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
              description="Manage your administrator identity and profile photo."
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
                  <p className="text-sm font-bold text-zinc-950 dark:text-white">
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

                      {savingAvatar
                        ? 'Uploading'
                        : account.avatarFileId
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
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {removingAvatar ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}

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
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
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
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
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
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">
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

  /* ==========================================================
     PREFERENCES VIEW
     ========================================================== */

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
                description="Personalize your administrator workspace."
              />

              <div className="p-6 sm:p-7">
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">
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

                  <p className="font-semibold text-zinc-950 dark:text-white">
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

  /* ==========================================================
     OVERVIEW
     ========================================================== */

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
                    <p className="truncate text-lg font-bold text-zinc-950 dark:text-white">
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
                  {roleLabel(
                    account.role
                  )}
                </span>

                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {statusLabel(
                    account.status
                  )}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
            <p className="font-bold text-zinc-950 dark:text-white">
              Account settings
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Manage your personal administrator account.
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
                  <p className="font-semibold text-zinc-950 dark:text-white">
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
                  ? 'Password and two-factor authentication · 2FA enabled'
                  : 'Password and administrator account protection'
              }
              onClick={
                openPassword
              }
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

/* ============================================================
   PASSWORD FIELD
   ============================================================ */

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
      <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
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
          className={`h-12 w-full rounded-xl border bg-white px-4 pr-12 text-sm font-medium text-zinc-950 outline-none transition dark:bg-zinc-950 dark:text-white ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:border-red-700'
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
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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

/* ============================================================
   PASSWORD RULE
   ============================================================ */

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

/* ============================================================
   SETTINGS ROW
   ============================================================ */

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
        <p className="font-semibold text-zinc-950 dark:text-white">
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

/* ============================================================
   UI
   ============================================================ */

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
          <p className="font-bold text-zinc-950 dark:text-white">
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
}: {
  onClick: () => void;
  disabled?: boolean;
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
      My Account
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

        <p className="font-semibold text-zinc-950 dark:text-white">
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

/* ============================================================
   STYLES
   ============================================================ */

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