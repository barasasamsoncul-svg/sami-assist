'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ArrowLeft,
  AtSign,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  MonitorSmartphone,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  SunMoon,
  Trash2,
  UserRound,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

import {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  formatUserDate,
  formatUserDateTime,
  formatUserTime,
  getUserFormattingPreview,
  type UserDateFormat,
  type UserDisplayPreferences,
  type UserTheme,
  type UserTimeFormat,
} from '@/lib/account/user-formatting';

type UserAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarFileId: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type PendingEmailChange = {
  email: string;
  expiresAt: string;
  createdAt?: string;
  canResendInSeconds: number;
};

type AccountResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  message?: string;
  account?: UserAccount;
  preferences?: UserDisplayPreferences;

  emailChange?: {
    pending: PendingEmailChange | null;
  };

  pending?: PendingEmailChange | null;

  retryAfterSeconds?: number | null;
};

type AccountView =
  | 'overview'
  | 'personal'
  | 'email'
  | 'preferences';

type OverlayState = {
  type: SaMiOverlayType;
  title: string;
  message: string;
};

const THEME_STORAGE_KEY =
  'sami_theme';

function normalizeEmail(
  value: string
) {
  return value
    .trim()
    .toLowerCase();
}

function validEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim()
  );
}

function normalizeCode(
  value: string
) {
  return value.trim();
}

function validCode(
  value: string
) {
  return /^\d{6}$/.test(
    normalizeCode(value)
  );
}

function formatFallbackDateTime(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date.toLocaleString();
}

function initials(
  account:
    | UserAccount
    | null
) {
  if (!account) {
    return 'SM';
  }

  const first =
    account.firstName
      ?.trim()
      .charAt(0);

  const last =
    account.lastName
      ?.trim()
      .charAt(0);

  const value =
    `${first || ''}${last || ''}`
      .toUpperCase();

  return value || 'SM';
}

function getSystemDarkMode() {
  if (
    typeof window ===
    'undefined'
  ) {
    return false;
  }

  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)'
    ).matches ??
    false
  );
}

function applyTheme(
  theme: UserTheme
) {
  if (
    typeof document ===
    'undefined'
  ) {
    return;
  }

  const dark =
    theme === 'dark' ||
    (
      theme === 'system' &&
      getSystemDarkMode()
    );

  document
    .documentElement
    .classList
    .toggle(
      'dark',
      dark
    );

  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      theme
    );
  } catch {
    // Theme still applies for the current page.
  }
}

async function readJson(
  response: Response
): Promise<AccountResponse> {
  try {
    return (
      await response.json()
    ) as AccountResponse;
  } catch {
    return {
      success: false,
      code:
        'INVALID_SERVER_RESPONSE',
      error:
        'SaMi returned an invalid response.',
    };
  }
}

function getTimezoneOptions(
  currentTimezone: string
) {
  const fallback = [
    'UTC',
    'Africa/Nairobi',
    'Africa/Kampala',
    'Africa/Dar_es_Salaam',
    'Africa/Addis_Ababa',
    'Africa/Kigali',
    'Africa/Johannesburg',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
  ];

  let zones:
    string[] =
    fallback;

  try {
    const intlWithZones =
      Intl as typeof Intl & {
        supportedValuesOf?: (
          key: 'timeZone'
        ) => string[];
      };

    if (
      typeof intlWithZones
        .supportedValuesOf ===
      'function'
    ) {
      zones =
        intlWithZones
          .supportedValuesOf(
            'timeZone'
          );
    }
  } catch {
    zones =
      fallback;
  }

  if (
    currentTimezone &&
    !zones.includes(
      currentTimezone
    )
  ) {
    zones = [
      currentTimezone,
      ...zones,
    ];
  }

  if (
    !zones.includes(
      'UTC'
    )
  ) {
    zones = [
      'UTC',
      ...zones,
    ];
  }

  return zones;
}

function preferencesEqual(
  left:
    UserDisplayPreferences,
  right:
    UserDisplayPreferences
) {
  return (
    left.theme ===
      right.theme &&
    left.locale ===
      right.locale &&
    left.timezone ===
      right.timezone &&
    left.dateFormat ===
      right.dateFormat &&
    left.timeFormat ===
      right.timeFormat &&
    left.firstDayOfWeek ===
      right.firstDayOfWeek
  );
}

export default function MyAccountSettings() {
  const [
    view,
    setView,
  ] =
    useState<AccountView>(
      'overview'
    );

  const [
    account,
    setAccount,
  ] =
    useState<UserAccount | null>(
      null
    );

  const [
    preferences,
    setPreferences,
  ] =
    useState<UserDisplayPreferences>({
      ...DEFAULT_USER_DISPLAY_PREFERENCES,
    });

  const [
    savedPreferences,
    setSavedPreferences,
  ] =
    useState<UserDisplayPreferences>({
      ...DEFAULT_USER_DISPLAY_PREFERENCES,
    });

  const [
    pendingEmailChange,
    setPendingEmailChange,
  ] =
    useState<
      PendingEmailChange | null
    >(null);

  const [
    previewNow,
    setPreviewNow,
  ] =
    useState(
      () => new Date()
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
    phone,
    setPhone,
  ] =
    useState('');

  const [
    emailEditing,
    setEmailEditing,
  ] =
    useState(false);

  const [
    newEmail,
    setNewEmail,
  ] =
    useState('');

  const [
    emailCode,
    setEmailCode,
  ] =
    useState('');

  const [
    resendSeconds,
    setResendSeconds,
  ] =
    useState(0);

  const [
    verifyRetrySeconds,
    setVerifyRetrySeconds,
  ] =
    useState(0);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    profileSaving,
    setProfileSaving,
  ] =
    useState(false);

  const [
    avatarSaving,
    setAvatarSaving,
  ] =
    useState(false);

  const [
    avatarRemoving,
    setAvatarRemoving,
  ] =
    useState(false);

  const [
    preferencesSaving,
    setPreferencesSaving,
  ] =
    useState(false);

  const [
    requestingEmail,
    setRequestingEmail,
  ] =
    useState(false);

  const [
    verifyingEmail,
    setVerifyingEmail,
  ] =
    useState(false);

  const [
    cancellingEmail,
    setCancellingEmail,
  ] =
    useState(false);

  const [
    overlay,
    setOverlay,
  ] =
    useState<OverlayState | null>(
      null
    );

  const timezoneOptions =
    useMemo(
      () =>
        getTimezoneOptions(
          preferences.timezone
        ),
      [
        preferences.timezone,
      ]
    );

  const preferencePreview =
    useMemo(
      () =>
        getUserFormattingPreview(
          preferences,
          previewNow
        ),
      [
        preferences,
        previewNow,
      ]
    );

  const profileChanged =
    Boolean(
      account &&
      (
        firstName.trim() !==
          account.firstName ||
        lastName.trim() !==
          account.lastName ||
        phone.trim() !==
          (
            account.phone ||
            ''
          )
      )
    );

  const preferencesChanged =
    !preferencesEqual(
      preferences,
      savedPreferences
    );

  const busy =
    loading ||
    profileSaving ||
    avatarSaving ||
    avatarRemoving ||
    preferencesSaving ||
    requestingEmail ||
    verifyingEmail ||
    cancellingEmail;

  function showOverlay(
    type:
      SaMiOverlayType,
    title:
      string,
    message:
      string
  ) {
    setOverlay({
      type,
      title,
      message,
    });
  }

  useEffect(
    () => {
      const timer =
        window.setInterval(
          () => {
            setPreviewNow(
              new Date()
            );
          },
          1000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    []
  );

  useEffect(
    () => {
      if (
        preferences.theme !==
        'system'
      ) {
        return;
      }

      const media =
        window.matchMedia(
          '(prefers-color-scheme: dark)'
        );

      const sync =
        () => {
          applyTheme(
            'system'
          );
        };

      sync();

      media.addEventListener?.(
        'change',
        sync
      );

      return () => {
        media.removeEventListener?.(
          'change',
          sync
        );
      };
    },
    [
      preferences.theme,
    ]
  );

  const loadAccount =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await fetch(
              '/api/account',
              {
                method:
                  'GET',

                headers: {
                  Accept:
                    'application/json',
                },

                credentials:
                  'same-origin',

                cache:
                  'no-store',
              }
            );

          const data =
            await readJson(
              response
            );

          if (
            !response.ok ||
            !data.success ||
            !data.account
          ) {
            throw new Error(
              data.error ||
                'SaMi could not load your account.'
            );
          }

          const loadedAccount =
            data.account;

          const loadedPreferences =
            data.preferences || {
              ...DEFAULT_USER_DISPLAY_PREFERENCES,
            };

          setAccount(
            loadedAccount
          );

          setPreferences(
            loadedPreferences
          );

          setSavedPreferences(
            loadedPreferences
          );

          setFirstName(
            loadedAccount
              .firstName ||
              ''
          );

          setLastName(
            loadedAccount
              .lastName ||
              ''
          );

          setPhone(
            loadedAccount
              .phone ||
              ''
          );

          const pending =
            data.emailChange
              ?.pending ||
            null;

          setPendingEmailChange(
            pending
          );

          setResendSeconds(
            pending
              ?.canResendInSeconds ||
              0
          );

          applyTheme(
            loadedPreferences
              .theme
          );
        } catch (
          error
        ) {
          setAccount(
            null
          );

          showOverlay(
            'error',
            'Account unavailable',
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load your account.'
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
      void loadAccount();
    },
    [
      loadAccount,
    ]
  );

  useEffect(
    () => {
      if (
        resendSeconds <=
        0
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            setResendSeconds(
              current =>
                Math.max(
                  0,
                  current - 1
                )
            );
          },
          1000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    [
      resendSeconds,
    ]
  );

  useEffect(
    () => {
      if (
        verifyRetrySeconds <=
        0
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            setVerifyRetrySeconds(
              current =>
                Math.max(
                  0,
                  current - 1
                )
            );
          },
          1000
        );

      return () => {
        window.clearInterval(
          timer
        );
      };
    },
    [
      verifyRetrySeconds,
    ]
  );

  async function uploadAvatar(
    file:
      File | null
  ) {
    if (
      !file ||
      avatarSaving ||
      avatarRemoving
    ) {
      return;
    }

    const allowedTypes =
      new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
      ]);

    if (
      !allowedTypes.has(
        file.type
      )
    ) {
      showOverlay(
        'warning',
        'Unsupported image',
        'Choose a JPEG, PNG, or WebP image.'
      );

      return;
    }

    if (
      file.size >
      5 * 1024 * 1024
    ) {
      showOverlay(
        'warning',
        'Image too large',
        'Your profile image must be 5 MB or smaller.'
      );

      return;
    }

    setAvatarSaving(
      true
    );

    try {
      const formData =
        new FormData();

      formData.append(
        'avatar',
        file
      );

      const response =
        await fetch(
          '/api/account/avatar',
          {
            method:
              'POST',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              formData,
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'SaMi could not update your profile image.'
        );
      }

      await loadAccount();

      showOverlay(
        'success',
        'Profile image updated',
        data.message ||
          'Your profile image has been updated.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Image update failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your profile image.'
      );
    } finally {
      setAvatarSaving(
        false
      );
    }
  }

  async function removeAvatar() {
    if (
      avatarSaving ||
      avatarRemoving ||
      !account ||
      !account.avatarFileId
    ) {
      return;
    }

    setAvatarRemoving(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/avatar',
          {
            method:
              'DELETE',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'SaMi could not remove your profile image.'
        );
      }

      await loadAccount();

      showOverlay(
        'success',
        'Profile image removed',
        data.message ||
          'Your profile image has been removed.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Image removal failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not remove your profile image.'
      );
    } finally {
      setAvatarRemoving(
        false
      );
    }
  }

  async function saveProfile(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      profileSaving ||
      !account
    ) {
      return;
    }

    const cleanFirstName =
      firstName
        .trim()
        .replace(
          /\s+/g,
          ' '
        );

    const cleanLastName =
      lastName
        .trim()
        .replace(
          /\s+/g,
          ' '
        );

    if (
      !cleanFirstName
    ) {
      showOverlay(
        'warning',
        'First name required',
        'Enter your first name.'
      );

      return;
    }

    if (
      !cleanLastName
    ) {
      showOverlay(
        'warning',
        'Last name required',
        'Enter your last name.'
      );

      return;
    }

    setProfileSaving(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/profile',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                firstName:
                  cleanFirstName,

                lastName:
                  cleanLastName,

                phone:
                  phone.trim() ||
                  null,
              }),
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success ||
        !data.account
      ) {
        throw new Error(
          data.error ||
            'SaMi could not update your profile.'
        );
      }

      setAccount(
        data.account
      );

      setFirstName(
        data.account
          .firstName
      );

      setLastName(
        data.account
          .lastName
      );

      setPhone(
        data.account
          .phone ||
          ''
      );

      showOverlay(
        'success',
        'Profile updated',
        data.message ||
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
      setProfileSaving(
        false
      );
    }
  }

  async function savePreferences() {
    if (
      preferencesSaving ||
      !preferencesChanged
    ) {
      return;
    }

    setPreferencesSaving(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/preferences',
          {
            method:
              'PATCH',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify(
                preferences
              ),
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success ||
        !data.preferences
      ) {
        throw new Error(
          data.error ||
            'SaMi could not update your preferences.'
        );
      }

      setPreferences(
        data.preferences
      );

      setSavedPreferences(
        data.preferences
      );

      applyTheme(
        data.preferences
          .theme
      );

      showOverlay(
        'success',
        'Preferences saved',
        data.message ||
          'Your preferences have been updated.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Preferences not saved',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not update your preferences.'
      );
    } finally {
      setPreferencesSaving(
        false
      );
    }
  }

  function discardPreferences() {
    setPreferences(
      savedPreferences
    );

    applyTheme(
      savedPreferences
        .theme
    );
  }

  async function requestNewEmail() {
    if (
      requestingEmail ||
      !account
    ) {
      return;
    }

    const email =
      normalizeEmail(
        newEmail
      );

    if (
      !validEmail(
        email
      )
    ) {
      showOverlay(
        'warning',
        'Invalid email',
        'Enter a valid new email address.'
      );

      return;
    }

    if (
      email ===
      normalizeEmail(
        account.email
      )
    ) {
      showOverlay(
        'warning',
        'Email unchanged',
        'This is already your current email address.'
      );

      return;
    }

    setRequestingEmail(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/email-change/request',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                email,
              }),
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
        ) {
          setResendSeconds(
            Math.ceil(
              data.retryAfterSeconds
            )
          );
        }

        throw new Error(
          data.error ||
            'SaMi could not send the verification code.'
        );
      }

      const pending =
        data.pending ||
        data.emailChange
          ?.pending ||
        null;

      setPendingEmailChange(
        pending
      );

      setResendSeconds(
        pending
          ?.canResendInSeconds ||
          60
      );

      setEmailCode(
        ''
      );

      setEmailEditing(
        false
      );

      showOverlay(
        'success',
        'Verification code sent',
        data.message ||
          'A verification code has been sent to your new email address.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Code not sent',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not send the verification code.'
      );
    } finally {
      setRequestingEmail(
        false
      );
    }
  }

  async function resendEmailCode() {
    if (
      requestingEmail ||
      resendSeconds >
        0 ||
      !pendingEmailChange
    ) {
      return;
    }

    setRequestingEmail(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/email-change/request',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                email:
                  pendingEmailChange
                    .email,
              }),
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success
      ) {
        if (
          data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
        ) {
          setResendSeconds(
            Math.ceil(
              data.retryAfterSeconds
            )
          );
        }

        throw new Error(
          data.error ||
            'SaMi could not resend the verification code.'
        );
      }

      const pending =
        data.pending ||
        data.emailChange
          ?.pending ||
        pendingEmailChange;

      setPendingEmailChange(
        pending
      );

      setResendSeconds(
        pending
          ?.canResendInSeconds ||
          60
      );

      setEmailCode(
        ''
      );

      showOverlay(
        'success',
        'New code sent',
        data.message ||
          'A new verification code has been sent.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Code not sent',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not resend the verification code.'
      );
    } finally {
      setRequestingEmail(
        false
      );
    }
  }

  async function verifyNewEmail() {
    if (
      verifyingEmail ||
      verifyRetrySeconds >
        0 ||
      !pendingEmailChange
    ) {
      return;
    }

    const code =
      normalizeCode(
        emailCode
      );

    if (
      !validCode(
        code
      )
    ) {
      showOverlay(
        'warning',
        'Verification code required',
        'Enter the complete 6-digit verification code.'
      );

      return;
    }

    setVerifyingEmail(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/email-change/verify',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',

            body:
              JSON.stringify({
                code,
              }),
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success ||
        !data.account
      ) {
        if (
          data.code ===
            'EMAIL_CHANGE_VERIFICATION_RATE_LIMITED' &&
          data.retryAfterSeconds &&
          data.retryAfterSeconds >
            0
        ) {
          setVerifyRetrySeconds(
            Math.ceil(
              data.retryAfterSeconds
            )
          );
        }

        throw new Error(
          data.error ||
            'SaMi could not verify your new email.'
        );
      }

      setAccount(
        data.account
      );

      setPendingEmailChange(
        null
      );

      setNewEmail(
        ''
      );

      setEmailCode(
        ''
      );

      setResendSeconds(
        0
      );

      setVerifyRetrySeconds(
        0
      );

      setEmailEditing(
        false
      );

      showOverlay(
        'success',
        'Email updated',
        data.message ||
          'Your email address has been updated successfully.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Email verification failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not verify your new email.'
      );
    } finally {
      setVerifyingEmail(
        false
      );
    }
  }

  async function cancelPendingEmailChange() {
    if (
      cancellingEmail
    ) {
      return;
    }

    setCancellingEmail(
      true
    );

    try {
      const response =
        await fetch(
          '/api/account/email-change',
          {
            method:
              'DELETE',

            headers: {
              Accept:
                'application/json',
            },

            credentials:
              'same-origin',

            cache:
              'no-store',
          }
        );

      const data =
        await readJson(
          response
        );

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'SaMi could not cancel the email change.'
        );
      }

      setPendingEmailChange(
        null
      );

      setNewEmail(
        ''
      );

      setEmailCode(
        ''
      );

      setResendSeconds(
        0
      );

      setVerifyRetrySeconds(
        0
      );

      showOverlay(
        'success',
        'Email change cancelled',
        data.message ||
          'Your pending email change has been cancelled.'
      );
    } catch (
      error
    ) {
      showOverlay(
        'error',
        'Cancellation failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not cancel the email change.'
      );
    } finally {
      setCancellingEmail(
        false
      );
    }
  }

  function openSecurity() {
    window.location.assign(
      '/settings?tab=security'
    );
  }

  if (
    loading
  ) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800" />

            <div className="flex-1">
              <div className="h-5 w-48 rounded bg-slate-100 dark:bg-slate-800" />

              <div className="mt-2 h-4 w-64 max-w-full rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        </div>

        <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-3 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800" />

          <div className="mt-3 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (
    !account
  ) {
    return (
      <>
        <div className="flex min-h-[320px] items-center justify-center">
          <button
            type="button"
            onClick={() =>
              void loadAccount()
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>

        <SaMiOverlay
          open={
            Boolean(
              overlay
            )
          }
          type={
            overlay?.type ||
            'error'
          }
          title={
            overlay?.title ||
            'Account unavailable'
          }
          message={
            overlay?.message ||
            'SaMi could not load your account.'
          }
          onClose={() =>
            setOverlay(
              null
            )
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        {view !==
          'overview' && (
          <button
            type="button"
            onClick={() =>
              setView(
                'overview'
              )
            }
            className="mb-5 inline-flex h-9 items-center gap-2 rounded-xl px-2 text-xs font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {view ===
          'overview' && (
          <AccountOverview
            account={
              account
            }
            preferences={
              preferences
            }
            avatarSaving={
              avatarSaving
            }
            avatarRemoving={
              avatarRemoving
            }
            onAvatar={
              uploadAvatar
            }
            onRemoveAvatar={
              removeAvatar
            }
            onPersonal={() =>
              setView(
                'personal'
              )
            }
            onEmail={() =>
              setView(
                'email'
              )
            }
            onPreferences={() =>
              setView(
                'preferences'
              )
            }
            onSecurity={
              openSecurity
            }
          />
        )}

        {view ===
          'personal' && (
          <PersonalInformationView
            firstName={
              firstName
            }
            lastName={
              lastName
            }
            phone={
              phone
            }
            busy={
              busy
            }
            profileSaving={
              profileSaving
            }
            profileChanged={
              profileChanged
            }
            onFirstName={
              setFirstName
            }
            onLastName={
              setLastName
            }
            onPhone={
              setPhone
            }
            onSubmit={
              saveProfile
            }
          />
        )}

        {view ===
          'email' && (
          <EmailView
            account={
              account
            }
            preferences={
              preferences
            }
            pendingEmailChange={
              pendingEmailChange
            }
            emailEditing={
              emailEditing
            }
            newEmail={
              newEmail
            }
            emailCode={
              emailCode
            }
            resendSeconds={
              resendSeconds
            }
            verifyRetrySeconds={
              verifyRetrySeconds
            }
            requestingEmail={
              requestingEmail
            }
            verifyingEmail={
              verifyingEmail
            }
            cancellingEmail={
              cancellingEmail
            }
            busy={
              busy
            }
            onEditing={
              setEmailEditing
            }
            onNewEmail={
              setNewEmail
            }
            onCode={
              setEmailCode
            }
            onRequest={
              requestNewEmail
            }
            onResend={
              resendEmailCode
            }
            onVerify={
              verifyNewEmail
            }
            onCancelPending={
              cancelPendingEmailChange
            }
          />
        )}

        {view ===
          'preferences' && (
          <PreferencesView
            preferences={
              preferences
            }
            previewNow={
              previewNow
            }
            preferencePreview={
              preferencePreview
            }
            timezoneOptions={
              timezoneOptions
            }
            preferencesChanged={
              preferencesChanged
            }
            preferencesSaving={
              preferencesSaving
            }
            onChange={
              setPreferences
            }
            onSave={
              savePreferences
            }
            onDiscard={
              discardPreferences
            }
          />
        )}
      </div>

      <SaMiOverlay
        open={
          Boolean(
            overlay
          )
        }
        type={
          overlay?.type ||
          'info'
        }
        title={
          overlay?.title ||
          ''
        }
        message={
          overlay?.message ||
          ''
        }
        onClose={() =>
          setOverlay(
            null
          )
        }
      />
    </>
  );
}

function AccountOverview({
  account,
  preferences,
  avatarSaving,
  avatarRemoving,
  onAvatar,
  onRemoveAvatar,
  onPersonal,
  onEmail,
  onPreferences,
  onSecurity,
}: {
  account:
    UserAccount;

  preferences:
    UserDisplayPreferences;

  avatarSaving:
    boolean;

  avatarRemoving:
    boolean;

  onAvatar:
    (
      file:
        File | null
    ) => void;

  onRemoveAvatar:
    () => void;

  onPersonal:
    () => void;

  onEmail:
    () => void;

  onPreferences:
    () => void;

  onSecurity:
    () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative h-20 w-20 shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-xl font-black text-white">
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={
                    account.avatarFileId ||
                    account.avatarUrl
                  }
                  src={
                    account.avatarFileId
                      ? `${account.avatarUrl}?v=${encodeURIComponent(
                          account.avatarFileId
                        )}`
                      : account.avatarUrl
                  }
                  alt={`${account.fullName || 'SaMi user'} profile`}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(
                  account
                )
              )}
            </div>

            <label
              htmlFor="account-avatar"
              title={
                account.avatarFileId
                  ? 'Replace profile image'
                  : 'Upload profile image'
              }
              className={`absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border-4 border-white bg-blue-600 text-white shadow-sm transition dark:border-slate-900 ${
                avatarSaving ||
                avatarRemoving
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:bg-blue-700'
              }`}
            >
              {avatarSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}

              <input
                id="account-avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  avatarSaving ||
                  avatarRemoving
                }
                onChange={event => {
                  const file =
                    event.target
                      .files?.[0] ||
                    null;

                  event.currentTarget.value =
                    '';

                  onAvatar(
                    file
                  );
                }}
                className="sr-only"
              />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xl font-black tracking-[-0.025em] text-slate-950 dark:text-white">
                {account.fullName ||
                  account.email}
              </p>

              {account.emailVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Check className="h-3 w-3" />
                  Verified
                </span>
              )}
            </div>

            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {account.email}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <label
                htmlFor="account-avatar"
                className={`inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${
                  avatarSaving ||
                  avatarRemoving
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />

                {account.avatarFileId
                  ? 'Replace photo'
                  : 'Add photo'}
              </label>

              {account.avatarFileId && (
                <button
                  type="button"
                  onClick={
                    onRemoveAvatar
                  }
                  disabled={
                    avatarSaving ||
                    avatarRemoving
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-xs font-black text-slate-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {avatarRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}

                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SettingsRow
          icon={
            UserRound
          }
          title="Personal information"
          description={`${account.firstName} ${account.lastName}${account.phone ? ` · ${account.phone}` : ''}`}
          onClick={
            onPersonal
          }
        />

        <SettingsRow
          icon={
            AtSign
          }
          title="Email"
          description={
            account.email
          }
          badge={
            account.emailVerified
              ? 'Verified'
              : 'Verification required'
          }
          onClick={
            onEmail
          }
        />

        <SettingsRow
          icon={
            SunMoon
          }
          title="Preferences"
          description={`${preferences.timezone} · ${preferences.dateFormat} · ${preferences.timeFormat === '24h' ? '24-hour' : '12-hour'}`}
          onClick={
            onPreferences
          }
        />

        <SettingsRow
          icon={
            ShieldCheck
          }
          title="Password & security"
          description="Password, two-factor authentication, sessions and security activity"
          onClick={
            onSecurity
          }
          last
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          <AccountDetail
            label="Account status"
            value={
              account.status
                .replace(
                  /_/g,
                  ' '
                )
            }
          />

          <AccountDetail
            label="Account created"
            value={
              account.createdAt
                ? formatUserDateTime(
                    account.createdAt,
                    preferences
                  )
                : formatFallbackDateTime(
                    account.createdAt
                  )
            }
          />
        </dl>
      </section>
    </div>
  );
}

function SettingsRow({
  icon:
    Icon,
  title,
  description,
  badge,
  onClick,
  last = false,
}: {
  icon:
    typeof UserRound;

  title:
    string;

  description:
    string;

  badge?:
    string;

  onClick:
    () => void;

  last?:
    boolean;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
        last
          ? ''
          : 'border-b border-slate-100 dark:border-slate-800'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {title}
          </p>

          {badge && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {badge}
            </span>
          )}
        </div>

        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}

function AccountDetail({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-xs font-bold text-slate-500">
        {label}
      </dt>

      <dd className="text-sm font-bold capitalize text-slate-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function PersonalInformationView({
  firstName,
  lastName,
  phone,
  busy,
  profileSaving,
  profileChanged,
  onFirstName,
  onLastName,
  onPhone,
  onSubmit,
}: {
  firstName:
    string;

  lastName:
    string;

  phone:
    string;

  busy:
    boolean;

  profileSaving:
    boolean;

  profileChanged:
    boolean;

  onFirstName:
    (
      value:
        string
    ) => void;

  onLastName:
    (
      value:
        string
    ) => void;

  onPhone:
    (
      value:
        string
    ) => void;

  onSubmit:
    (
      event:
        FormEvent<HTMLFormElement>
    ) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <form
        onSubmit={
          onSubmit
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="First name"
            icon={
              UserRound
            }
          >
            <input
              value={
                firstName
              }
              onChange={
                event =>
                  onFirstName(
                    event.target
                      .value
                  )
              }
              maxLength={100}
              autoComplete="given-name"
              disabled={
                busy
              }
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
            />
          </Field>

          <Field
            label="Last name"
            icon={
              UserRound
            }
          >
            <input
              value={
                lastName
              }
              onChange={
                event =>
                  onLastName(
                    event.target
                      .value
                  )
              }
              maxLength={100}
              autoComplete="family-name"
              disabled={
                busy
              }
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Phone"
              icon={
                Phone
              }
            >
              <input
                type="tel"
                value={
                  phone
                }
                onChange={
                  event =>
                    onPhone(
                      event.target
                        .value
                    )
                }
                maxLength={50}
                autoComplete="tel"
                placeholder="+254..."
                disabled={
                  busy
                }
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={
              profileSaving ||
              !profileChanged
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {profileSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            {profileSaving
              ? 'Saving...'
              : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  icon:
    Icon,
  children,
}: {
  label:
    string;

  icon:
    typeof UserRound;

  children:
    React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {label}
      </p>

      <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
        {children}
      </div>
    </div>
  );
}

function EmailView({
  account,
  preferences,
  pendingEmailChange,
  emailEditing,
  newEmail,
  emailCode,
  resendSeconds,
  verifyRetrySeconds,
  requestingEmail,
  verifyingEmail,
  cancellingEmail,
  busy,
  onEditing,
  onNewEmail,
  onCode,
  onRequest,
  onResend,
  onVerify,
  onCancelPending,
}: {
  account:
    UserAccount;

  preferences:
    UserDisplayPreferences;

  pendingEmailChange:
    PendingEmailChange | null;

  emailEditing:
    boolean;

  newEmail:
    string;

  emailCode:
    string;

  resendSeconds:
    number;

  verifyRetrySeconds:
    number;

  requestingEmail:
    boolean;

  verifyingEmail:
    boolean;

  cancellingEmail:
    boolean;

  busy:
    boolean;

  onEditing:
    (
      value:
        boolean
    ) => void;

  onNewEmail:
    (
      value:
        string
    ) => void;

  onCode:
    (
      value:
        string
    ) => void;

  onRequest:
    () => void;

  onResend:
    () => void;

  onVerify:
    () => void;

  onCancelPending:
    () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      {!pendingEmailChange ? (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
              <Mail className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                {account.email}
              </p>

              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {account.emailVerified
                  ? 'Verified email'
                  : 'Email verification required'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onEditing(
                  true
                );

                onNewEmail(
                  ''
                );

                onCode(
                  ''
                );
              }}
              disabled={
                busy
              }
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Change email
            </button>
          </div>

          {emailEditing && (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                New email address
              </label>

              <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />

                <input
                  type="email"
                  value={
                    newEmail
                  }
                  onChange={
                    event =>
                      onNewEmail(
                        event.target
                          .value
                      )
                  }
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="new@example.com"
                  disabled={
                    requestingEmail
                  }
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>

              <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                A 6-digit verification code will be sent to the new address. Your current email remains active until verification succeeds.
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onEditing(
                      false
                    );

                    onNewEmail(
                      ''
                    );
                  }}
                  disabled={
                    requestingEmail
                  }
                  className="h-10 rounded-xl px-4 text-xs font-black text-slate-500"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    onRequest
                  }
                  disabled={
                    requestingEmail
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-50"
                >
                  {requestingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}

                  {requestingEmail
                    ? 'Sending...'
                    : 'Send verification code'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-300">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900 dark:text-white">
                Verify your new email
              </p>

              <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                Code sent to{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {pendingEmailChange.email}
                </span>
              </p>

              <p className="mt-1 text-[10px] text-slate-400">
                Expires{' '}
                {formatUserDateTime(
                  pendingEmailChange
                    .expiresAt,
                  preferences
                )}
              </p>
            </div>
          </div>

          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={
              emailCode
            }
            onChange={event => {
              const value =
                event.target
                  .value;

              if (
                /^\d{0,6}$/.test(
                  value
                )
              ) {
                onCode(
                  value
                );
              }
            }}
            disabled={
              verifyingEmail
            }
            placeholder="000000"
            className="mt-5 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={
                onResend
              }
              disabled={
                requestingEmail ||
                resendSeconds >
                  0
              }
              className="inline-flex items-center gap-2 text-xs font-black text-blue-600 disabled:text-slate-400 dark:text-blue-400"
            >
              {requestingEmail ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : resendSeconds >
                0 ? (
                <Clock3 className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}

              {requestingEmail
                ? 'Sending...'
                : resendSeconds >
                    0
                  ? `Resend in ${resendSeconds}s`
                  : 'Send another code'}
            </button>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  onCancelPending
                }
                disabled={
                  cancellingEmail ||
                  verifyingEmail
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {cancellingEmail
                  ? 'Cancelling...'
                  : 'Cancel change'}
              </button>

              <button
                type="button"
                onClick={
                  onVerify
                }
                disabled={
                  verifyingEmail ||
                  verifyRetrySeconds >
                    0 ||
                  !validCode(
                    emailCode
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-50"
              >
                {verifyingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}

                {verifyingEmail
                  ? 'Verifying...'
                  : verifyRetrySeconds >
                      0
                    ? `Try again in ${verifyRetrySeconds}s`
                    : 'Confirm email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PreferencesView({
  preferences,
  previewNow,
  preferencePreview,
  timezoneOptions,
  preferencesChanged,
  preferencesSaving,
  onChange,
  onSave,
  onDiscard,
}: {
  preferences:
    UserDisplayPreferences;

  previewNow:
    Date;

  preferencePreview:
    ReturnType<
      typeof getUserFormattingPreview
    >;

  timezoneOptions:
    string[];

  preferencesChanged:
    boolean;

  preferencesSaving:
    boolean;

  onChange:
    React.Dispatch<
      React.SetStateAction<UserDisplayPreferences>
    >;

  onSave:
    () => void;

  onDiscard:
    () => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-900/50 dark:from-blue-950/25 dark:to-indigo-950/20">
        <div className="grid gap-px bg-blue-100 dark:bg-blue-900/30 sm:grid-cols-2 lg:grid-cols-4">
          <PreferencePreviewCard
            label="Date"
            value={
              preferencePreview
                .date
            }
            icon={
              CalendarDays
            }
          />

          <PreferencePreviewCard
            label="Time"
            value={
              preferencePreview
                .time
            }
            icon={
              Clock3
            }
          />

          <PreferencePreviewCard
            label="Date & time"
            value={
              preferencePreview
                .dateTime
            }
            icon={
              CalendarDays
            }
          />

          <PreferencePreviewCard
            label="Timezone"
            value={
              preferencePreview
                .timezone
            }
            icon={
              Globe2
            }
          />
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />

        <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          These preferences control how SaMi displays dates, times and appearance to you. They do not change stored timestamps or company settings used on customer-facing documents.
        </p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Theme"
          value={
            preferences.theme
          }
          disabled={
            preferencesSaving
          }
          onChange={
            value => {
              const theme =
                value as UserTheme;

              onChange(
                current => ({
                  ...current,
                  theme,
                })
              );

              applyTheme(
                theme
              );
            }
          }
        >
          <option value="system">
            Follow system
          </option>

          <option value="light">
            Light
          </option>

          <option value="dark">
            Dark
          </option>
        </SelectField>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Timezone
          </label>

          <div className="relative mt-2">
            <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <select
              value={
                preferences.timezone
              }
              onChange={
                event =>
                  onChange(
                    current => ({
                      ...current,

                      timezone:
                        event.target
                          .value,
                    })
                  )
              }
              disabled={
                preferencesSaving
              }
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
            >
              {timezoneOptions.map(
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
          </div>
        </div>

        <SelectField
          label="Date format"
          value={
            preferences.dateFormat
          }
          disabled={
            preferencesSaving
          }
          onChange={
            value =>
              onChange(
                current => ({
                  ...current,

                  dateFormat:
                    value as UserDateFormat,
                })
              )
          }
          help={`Example: ${formatUserDate(
            previewNow,
            preferences
          )}`}
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
            preferences.timeFormat
          }
          disabled={
            preferencesSaving
          }
          onChange={
            value =>
              onChange(
                current => ({
                  ...current,

                  timeFormat:
                    value as UserTimeFormat,
                })
              )
          }
          help={`Example: ${formatUserTime(
            previewNow,
            preferences
          )}`}
        >
          <option value="24h">
            24-hour
          </option>

          <option value="12h">
            12-hour
          </option>
        </SelectField>

        <SelectField
          label="First day of week"
          value={
            String(
              preferences.firstDayOfWeek
            )
          }
          disabled={
            preferencesSaving
          }
          onChange={
            value =>
              onChange(
                current => ({
                  ...current,

                  firstDayOfWeek:
                    Number(
                      value
                    ),
                })
              )
          }
        >
          <option value="0">
            Sunday
          </option>

          <option value="1">
            Monday
          </option>

          <option value="6">
            Saturday
          </option>
        </SelectField>

        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Locale
          </label>

          <input
            value={
              preferences.locale
            }
            onChange={
              event =>
                onChange(
                  current => ({
                    ...current,

                    locale:
                      event.target
                        .value,
                  })
                )
            }
            maxLength={20}
            disabled={
              preferencesSaving
            }
            placeholder="en"
            className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <p
          className={`text-xs ${
            preferencesChanged
              ? 'font-bold text-amber-600 dark:text-amber-400'
              : 'text-slate-400'
          }`}
        >
          {preferencesChanged
            ? 'You have unsaved changes.'
            : 'Your preferences are saved.'}
        </p>

        <div className="flex gap-2">
          {preferencesChanged && (
            <button
              type="button"
              onClick={
                onDiscard
              }
              disabled={
                preferencesSaving
              }
              className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Discard
            </button>
          )}

          <button
            type="button"
            onClick={
              onSave
            }
            disabled={
              preferencesSaving ||
              !preferencesChanged
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {preferencesSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            {preferencesSaving
              ? 'Saving...'
              : 'Save preferences'}
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectField({
  label,
  value,
  disabled,
  onChange,
  help,
  children,
}: {
  label:
    string;

  value:
    string;

  disabled:
    boolean;

  onChange:
    (
      value:
        string
    ) => void;

  help?:
    string;

  children:
    React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {label}
      </label>

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
        disabled={
          disabled
        }
        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
      >
        {children}
      </select>

      {help && (
        <p className="mt-2 text-[10px] text-slate-400">
          {help}
        </p>
      )}
    </div>
  );
}

function PreferencePreviewCard({
  label,
  value,
  icon:
    Icon,
}: {
  label:
    string;

  value:
    string;

  icon:
    typeof Clock3;
}) {
  return (
    <div className="bg-white/90 p-4 dark:bg-slate-900/80">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-3.5 w-3.5" />

        <span className="text-[9px] font-black uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>

      <p className="mt-2 break-words text-sm font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}