'use client';

import Link from 'next/link';
import {
  type ChangeEvent,
  type FormEvent,
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
  Clock3,
  Globe2,
  KeyRound,
  Languages,
  Loader2,
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
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

import UserAvatar from '@/app/components/account/UserAvatar';

/* ============================================================
   TYPES
   ============================================================ */

type AdminAccount = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  twoFactorRequired: boolean;
  twoFactorEnabled: boolean;
  avatarFileId: string | null;
  avatarUrl?: string | null;
  updatedAt?: string | null;
};

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
  account?: AdminAccount;
  preferences?: AdminPreferences;
  avatarFileId?: string | null;
  avatarUrl?: string | null;
  error?: string;
  message?: string;
  field?: string | null;
  retryable?: boolean;
  requestId?: string;
};

type ViewMode =
  | 'overview'
  | 'profile'
  | 'preferences';

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_AVATAR_BYTES =
  5 * 1024 * 1024;

const ACCEPTED_AVATAR_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

const DEFAULT_PREFERENCES:
  AdminPreferences = {
    theme: 'system',
    locale: 'en',
    timezone: 'UTC',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    firstDayOfWeek: 1,
  };

const TIMEZONES = [
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

const LOCALES = [
  {
    value: 'en',
    label: 'English',
  },
  {
    value: 'en-KE',
    label: 'English (Kenya)',
  },
  {
    value: 'en-GB',
    label: 'English (United Kingdom)',
  },
  {
    value: 'en-US',
    label: 'English (United States)',
  },
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

function roleLabel(
  value: string
) {
  return value
    .split('_')
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
}

function statusLabel(
  value: string
) {
  return roleLabel(
    value
  );
}

function initials(
  account: AdminAccount
) {
  return (
    `${account.firstName?.[0] || ''}${
      account.lastName?.[0] || ''
    }`.toUpperCase() ||
    'SM'
  );
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
  const normalized =
    normalizeName(
      value
    );

  return (
    normalized.length >= 1 &&
    normalized.length <= 80 &&
    /^[\p{L}\p{M}][\p{L}\p{M}\s'’\-]*$/u.test(
      normalized
    )
  );
}

async function readPayload(
  response: Response
): Promise<ApiPayload> {
  try {
    const body:
      unknown =
      await response.json();

    if (
      body &&
      typeof body ===
        'object' &&
      !Array.isArray(
        body
      )
    ) {
      return body as
        ApiPayload;
    }
  } catch {
    // handled below
  }

  return {
    success: false,
    code:
      'INVALID_SERVER_RESPONSE',
    error:
      'SaMi returned an invalid response.',
  };
}

function applyTheme(
  theme: AdminTheme
) {
  const root =
    document.documentElement;

  const prefersDark =
    window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

  const dark =
    theme === 'dark' ||
    (
      theme === 'system' &&
      prefersDark
    );

  root.classList.toggle(
    'dark',
    dark
  );

  root.dataset.theme =
    theme;

  try {
    localStorage.setItem(
      'sami-admin-theme',
      theme
    );
  } catch {
    // Browser storage is optional.
  }
}

/* ============================================================
   COMPONENT
   ============================================================ */

export default function AdminMyAccountPage() {
  const router =
    useRouter();

  const avatarInputRef =
    useRef<HTMLInputElement | null>(
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
    view,
    setView,
  ] =
    useState<ViewMode>(
      'overview'
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
    draftPreferences,
    setDraftPreferences,
  ] =
    useState<AdminPreferences>(
      DEFAULT_PREFERENCES
    );

  const [
    savingPreferences,
    setSavingPreferences,
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
    type:
      SaMiOverlayType,
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

  /* ==========================================================
     LOAD
     ========================================================== */

  const loadData =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setLoadError(
          null
        );

        try {
          const [
            accountResponse,
            preferencesResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/admin/account',
                {
                  method:
                    'GET',
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
                  method:
                    'GET',
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
            showOverlay(
              'warning',
              'Administrator session expired',
              'Your administrator session is no longer active. Sign in again to continue.'
            );

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
              .preferences
              .theme
          );
        } catch (
          error
        ) {
          console.error(
            '[Admin My Account] Load failed:',
            error
          );

          setLoadError(
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load your administrator account.'
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );

  useEffect(
    () => {
      void loadData();
    },
    [
      loadData,
    ]
  );

  /* ==========================================================
     AVATAR UPLOAD
     ========================================================== */

  function openAvatarPicker() {
    if (
      avatarBusy
    ) {
      return;
    }

    avatarInputRef.current?.click();
  }

  async function uploadAvatar(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value =
      '';

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

    setSavingAvatar(
      true
    );

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
            method:
              'POST',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              Accept:
                'application/json',
            },

            body:
              formData,
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
        showOverlay(
          'warning',
          'Administrator session expired',
          'Sign in again to continue.'
        );

        return;
      }

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ||
            'SaMi could not update your profile photo.'
        );
      }

      /*
       * The avatar route may return avatarFileId directly.
       * If it does not, reload the authoritative account record.
       */
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
        const accountResponse =
          await fetch(
            '/api/admin/account',
            {
              method:
                'GET',

              credentials:
                'same-origin',

              cache:
                'no-store',

              headers: {
                Accept:
                  'application/json',
              },
            }
          );

        const accountPayload =
          await readPayload(
            accountResponse
          );

        if (
          accountResponse.ok &&
          accountPayload.account
        ) {
          setAccount({
            ...accountPayload.account,
            avatarFileId:
              accountPayload.account
                .avatarFileId ??
              null,
          });
        }
      }

      router.refresh();

      showOverlay(
        'success',
        'Profile photo updated',
        'Your administrator profile photo has been updated.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Photo update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your profile photo.'
      );
    } finally {
      setSavingAvatar(
        false
      );
    }
  }

  /* ==========================================================
     AVATAR REMOVE
     ========================================================== */

  async function removeAvatar() {
    if (
      !account ||
      !account.avatarFileId ||
      avatarBusy
    ) {
      return;
    }

    setRemovingAvatar(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/avatar',
          {
            method:
              'DELETE',

            credentials:
              'same-origin',

            cache:
              'no-store',

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
        showOverlay(
          'warning',
          'Administrator session expired',
          'Sign in again to continue.'
        );

        return;
      }

      if (
        !response.ok
      ) {
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
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Photo removal failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not remove your profile photo.'
      );
    } finally {
      setRemovingAvatar(
        false
      );
    }
  }

  /* ==========================================================
     PROFILE STATE
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

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

    setView(
      'profile'
    );
  }

  function closeProfile() {
    if (
      savingProfile ||
      avatarBusy
    ) {
      return;
    }

    if (account) {
      setFirstName(
        account.firstName
      );

      setLastName(
        account.lastName
      );
    }

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

    setView(
      'overview'
    );
  }

  /* ==========================================================
     SAVE PROFILE
     ========================================================== */

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

    setFirstNameError(
      null
    );

    setLastNameError(
      null
    );

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

      invalid =
        true;
    }

    if (
      !validName(
        normalizedLast
      )
    ) {
      setLastNameError(
        'Enter a valid last name.'
      );

      invalid =
        true;
    }

    if (invalid) {
      return;
    }

    if (
      !profileChanged
    ) {
      showOverlay(
        'info',
        'No changes to save',
        'Your personal information has not changed.'
      );

      return;
    }

    setSavingProfile(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/profile',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

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
        showOverlay(
          'warning',
          'Administrator session expired',
          'Sign in again to continue.'
        );

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

      setView(
        'overview'
      );

      router.refresh();

      showOverlay(
        'success',
        'Profile updated',
        'Your personal information has been updated.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Profile update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your profile.'
      );
    } finally {
      setSavingProfile(
        false
      );
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

  function openPreferences() {
    setDraftPreferences({
      ...preferences,
    });

    setView(
      'preferences'
    );
  }

  function closePreferences() {
    if (
      savingPreferences
    ) {
      return;
    }

    setDraftPreferences({
      ...preferences,
    });

    applyTheme(
      preferences.theme
    );

    setView(
      'overview'
    );
  }

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
        value as
          AdminTheme
      );
    }
  }

  async function savePreferences(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      savingPreferences
    ) {
      return;
    }

    if (
      !preferencesChanged
    ) {
      showOverlay(
        'info',
        'No changes to save',
        'Your preferences have not changed.'
      );

      return;
    }

    setSavingPreferences(
      true
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/preferences',
          {
            method:
              'PATCH',

            credentials:
              'same-origin',

            cache:
              'no-store',

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
        showOverlay(
          'warning',
          'Administrator session expired',
          'Sign in again to continue.'
        );

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
        payload.preferences
          .theme
      );

      setView(
        'overview'
      );

      showOverlay(
        'success',
        'Preferences updated',
        'Your administrator preferences have been saved.'
      );
    } catch (
      error
    ) {
      applyTheme(
        preferences.theme
      );

      showOverlay(
        'error',
        'Preferences update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your preferences.'
      );
    } finally {
      setSavingPreferences(
        false
      );
    }
  }

  /* ==========================================================
     OVERLAY
     ========================================================== */

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
        overlay.title ===
        'Administrator session expired'
          ? {
              label:
                'Sign in again',

              onClick:
                () => {
                  router.replace(
                    '/admin/login'
                  );
                },
            }
          : undefined
      }
      onClose={
        closeOverlay
      }
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
     ERROR
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

          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            {loadError ||
              'SaMi could not load your administrator account.'}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
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
     PROFILE VIEW
     ========================================================== */

  if (
    view ===
    'profile'
  ) {
    return (
      <>
        <div className="mx-auto w-full max-w-4xl">
          <BackButton
            onClick={
              closeProfile
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

            {/* AVATAR */}

            <div className="border-b border-zinc-200 p-6 sm:p-7 dark:border-zinc-800">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative shrink-0">
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

                  {savingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-950 dark:text-white">
                    Profile photo
                  </p>

                  <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                    JPEG, PNG or WebP. Maximum file size 5 MB.
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
                      className={secondaryButton()}
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
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {removingAvatar ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}

                        {removingAvatar
                          ? 'Removing'
                          : 'Remove'}
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
                  <label
                    htmlFor="admin-first-name"
                    className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    First name
                  </label>

                  <input
                    id="admin-first-name"
                    value={
                      firstName
                    }
                    maxLength={
                      80
                    }
                    autoComplete="given-name"
                    disabled={
                      savingProfile
                    }
                    onChange={
                      event => {
                        setFirstName(
                          event.target.value
                        );

                        setFirstNameError(
                          null
                        );
                      }
                    }
                    className={inputClass(
                      Boolean(
                        firstNameError
                      )
                    )}
                  />

                  {firstNameError && (
                    <FieldError>
                      {firstNameError}
                    </FieldError>
                  )}
                </Field>

                <Field>
                  <label
                    htmlFor="admin-last-name"
                    className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
                  >
                    Last name
                  </label>

                  <input
                    id="admin-last-name"
                    value={
                      lastName
                    }
                    maxLength={
                      80
                    }
                    autoComplete="family-name"
                    disabled={
                      savingProfile
                    }
                    onChange={
                      event => {
                        setLastName(
                          event.target.value
                        );

                        setLastNameError(
                          null
                        );
                      }
                    }
                    className={inputClass(
                      Boolean(
                        lastNameError
                      )
                    )}
                  />

                  {lastNameError && (
                    <FieldError>
                      {lastNameError}
                    </FieldError>
                  )}
                </Field>
              </div>

              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />

                  <div>
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                      {account.email}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Your sign-in email is protected by a separate verification process.
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
                onCancel={
                  closeProfile
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
            onClick={
              closePreferences
            }
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
                description="Personalize how the administrator workspace appears and formats information."
              />

              <div className="p-6 sm:p-7">
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                  Appearance
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  Choose how SaMi looks on this account.
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
                    description="Follow your device"
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
                    description="Always use light"
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
                    description="Always use dark"
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
                  description="Controls language and regional formatting."
                >
                  <select
                    value={
                      draftPreferences.locale
                    }
                    disabled={
                      savingPreferences
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'locale',
                          event.target.value
                        )
                    }
                    className={selectClass()}
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
                  </select>
                </PreferenceBlock>

                <PreferenceBlock
                  icon={
                    <Globe2 className="h-5 w-5" />
                  }
                  title="Time zone"
                  description="Used when displaying dates and activity times."
                >
                  <select
                    value={
                      draftPreferences.timezone
                    }
                    disabled={
                      savingPreferences
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'timezone',
                          event.target.value
                        )
                    }
                    className={selectClass()}
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

                  <div>
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      Date & time
                    </p>

                    <p className="mt-1 text-sm text-zinc-500">
                      Control how dates and times are presented.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-6 sm:p-7 lg:grid-cols-3">
                <Field>
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Date format
                  </label>

                  <select
                    value={
                      draftPreferences.dateFormat
                    }
                    disabled={
                      savingPreferences
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'dateFormat',
                          event.target.value as
                            AdminDateFormat
                        )
                    }
                    className={selectClass()}
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
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Time format
                  </label>

                  <select
                    value={
                      draftPreferences.timeFormat
                    }
                    disabled={
                      savingPreferences
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'timeFormat',
                          event.target.value as
                            AdminTimeFormat
                        )
                    }
                    className={selectClass()}
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
                  <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    First day of week
                  </label>

                  <select
                    value={
                      draftPreferences.firstDayOfWeek
                    }
                    disabled={
                      savingPreferences
                    }
                    onChange={
                      event =>
                        updatePreference(
                          'firstDayOfWeek',
                          Number(
                            event.target.value
                          )
                        )
                    }
                    className={selectClass()}
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
                  </select>
                </Field>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 px-6 py-5 dark:border-zinc-800 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={
                    closePreferences
                  }
                  disabled={
                    savingPreferences
                  }
                  className={secondaryButton()}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingPreferences ||
                    !preferencesChanged
                  }
                  className={primaryButton()}
                >
                  {savingPreferences ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}

                  {savingPreferences
                    ? 'Saving'
                    : 'Save preferences'}
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
                  className="shadow-sm ring-4 ring-zinc-100 dark:ring-zinc-800"
                />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
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
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400"
                  >
                    <Camera className="h-3.5 w-3.5" />

                    {account.avatarFileId
                      ? 'Change profile photo'
                      : 'Add profile photo'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
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
              Manage your personal administrator identity and preferences.
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
              className="group flex items-center gap-4 px-6 py-5 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-zinc-950"
            >
              <IconBox>
                <Mail className="h-5 w-5" />
              </IconBox>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    Email
                  </p>

                  {account.emailVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  {account.email}
                </p>
              </div>

              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
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
              onClick={
                openPreferences
              }
            />

            <div
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-4 px-6 py-5 opacity-55"
            >
              <IconBox>
                <KeyRound className="h-5 w-5" />
              </IconBox>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-zinc-950 dark:text-white">
                    Password & security
                  </p>

                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400 dark:bg-zinc-800">
                    Category 4
                  </span>
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  Password, two-factor authentication and security controls.
                </p>
              </div>

              <ShieldCheck className="h-5 w-5 text-zinc-300 dark:text-zinc-700" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard
            icon={
              <BadgeCheck className="h-5 w-5" />
            }
            label="Identity"
            value={
              account.emailVerified
                ? 'Verified'
                : 'Verification required'
            }
          />

          <StatusCard
            icon={
              <ShieldCheck className="h-5 w-5" />
            }
            label="Administrator status"
            value={statusLabel(
              account.status
            )}
          />

          <StatusCard
            icon={
              <Clock3 className="h-5 w-5" />
            }
            label="Time zone"
            value={
              preferences.timezone
            }
          />
        </section>
      </div>

      {overlayElement}
    </>
  );
}

/* ============================================================
   UI COMPONENTS
   ============================================================ */

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
      onClick={
        onClick
      }
      disabled={
        disabled
      }
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      My Account
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon:
    React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
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
  );
}

function IconBox({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </div>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon:
    React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
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

      <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition group-hover:translate-x-0.5" />
    </button>
  );
}

function StatusCard({
  icon,
  label,
  value,
}: {
  icon:
    React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3 text-zinc-500">
        {icon}

        <p className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </p>
      </div>

      <p className="mt-4 truncate text-sm font-bold text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function PreferenceBlock({
  icon,
  title,
  description,
  children,
}: {
  icon:
    React.ReactNode;
  title: string;
  description: string;
  children:
    React.ReactNode;
}) {
  return (
    <div className="p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-zinc-500">
          {icon}
        </div>

        <div>
          <p className="font-semibold text-zinc-950 dark:text-white">
            {title}
          </p>

          <p className="mt-1 text-sm leading-6 text-zinc-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {children}
      </div>
    </div>
  );
}

function ThemeOption({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon:
    React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`relative rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950 dark:border-white dark:bg-zinc-800 dark:ring-white'
          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-zinc-600 dark:text-zinc-300">
          {icon}
        </div>

        {active && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>

      <p className="mt-4 text-sm font-bold text-zinc-950 dark:text-white">
        {title}
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        {description}
      </p>
    </button>
  );
}

function Field({
  children,
}: {
  children:
    React.ReactNode;
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
  children:
    React.ReactNode;
}) {
  return (
    <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
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
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={
          onCancel
        }
        disabled={
          saving
        }
        className={secondaryButton()}
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
        className={primaryButton()}
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
  return 'h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
}

function primaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200';
}

function secondaryButton() {
  return 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800';
}

function themeLabel(
  theme:
    AdminTheme
) {
  if (
    theme ===
    'dark'
  ) {
    return 'Dark';
  }

  if (
    theme ===
    'light'
  ) {
    return 'Light';
  }

  return 'System';
}