'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  AtSign,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Globe2,
  Info,
  Loader2,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  SunMoon,
  UserRound,
  X,
} from 'lucide-react';

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

/* ============================================================
   TYPES
   ============================================================ */

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

  preferences?:
    UserDisplayPreferences;

  emailChange?: {
    pending:
      PendingEmailChange | null;
  };

  pending?:
    PendingEmailChange | null;

  retryAfterSeconds?:
    number | null;
};

type NoticeState = {
  type:
    | 'success'
    | 'error'
    | 'warning';

  message: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEME_STORAGE_KEY =
  'sami_theme';

/* ============================================================
   HELPERS
   ============================================================ */

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

  return date
    .toLocaleString();
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
  theme:
    UserTheme
) {
  if (
    typeof document ===
    'undefined'
  ) {
    return;
  }

  const dark =
    theme ===
      'dark' ||
    (
      theme ===
        'system' &&
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
  response:
    Response
): Promise<AccountResponse> {
  try {
    return (
      await response.json()
    ) as AccountResponse;
  } catch {
    return {
      success:
        false,

      code:
        'INVALID_SERVER_RESPONSE',

      error:
        'SaMi returned an invalid response.',
    };
  }
}

function getTimezoneOptions(
  currentTimezone:
    string
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
          key:
            'timeZone'
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

/* ============================================================
   COMPONENT
   ============================================================ */

export default function MyAccountSettings() {
  /* ==========================================================
     MAIN DATA
     ========================================================== */

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
    useState<UserDisplayPreferences>(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
      }
    );

  const [
    savedPreferences,
    setSavedPreferences,
  ] =
    useState<UserDisplayPreferences>(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
      }
    );

  const [
    pendingEmailChange,
    setPendingEmailChange,
  ] =
    useState<
      PendingEmailChange | null
    >(null);

  /* ==========================================================
     LIVE PREFERENCE PREVIEW
     ========================================================== */

  const [
    previewNow,
    setPreviewNow,
  ] =
    useState(
      () =>
        new Date()
    );

  /* ==========================================================
     PROFILE FORM
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
    phone,
    setPhone,
  ] =
    useState('');

  /* ==========================================================
     EMAIL CHANGE
     ========================================================== */

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

  /* ==========================================================
     UI STATE
     ========================================================== */

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
    notice,
    setNotice,
  ] =
    useState<
      NoticeState | null
    >(null);

  /* ==========================================================
     COMPUTED
     ========================================================== */

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
    preferencesSaving ||
    requestingEmail ||
    verifyingEmail ||
    cancellingEmail;

  /* ==========================================================
     LIVE CLOCK
     ========================================================== */

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

  /* ==========================================================
     SYSTEM THEME LISTENER

     When theme = system, SaMi should follow the operating
     system automatically if the system theme changes.
     ========================================================== */

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

  /* ==========================================================
     LOAD ACCOUNT
     ========================================================== */

  const loadAccount =
    useCallback(
      async () => {
        setLoading(
          true
        );

        setNotice(
          null
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
          setNotice({
            type:
              'error',

            message:
              error instanceof
              Error
                ? error.message
                : 'SaMi could not load your account.',
          });
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

  /* ==========================================================
     RESEND COUNTDOWN
     ========================================================== */

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
              (
                current
              ) =>
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

  /* ==========================================================
     VERIFY RATE-LIMIT COUNTDOWN
     ========================================================== */

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
              (
                current
              ) =>
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

  /* ==========================================================
     PROFILE SAVE
     ========================================================== */

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
      setNotice({
        type:
          'warning',

        message:
          'Enter your first name.',
      });

      return;
    }

    if (
      !cleanLastName
    ) {
      setNotice({
        type:
          'warning',

        message:
          'Enter your last name.',
      });

      return;
    }

    setProfileSaving(
      true
    );

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Your profile has been updated.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not update your profile.',
      });
    } finally {
      setProfileSaving(
        false
      );
    }
  }

  /* ==========================================================
     PREFERENCES SAVE
     ========================================================== */

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

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Your preferences have been updated.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not update your preferences.',
      });
    } finally {
      setPreferencesSaving(
        false
      );
    }
  }

  /* ==========================================================
     DISCARD UNSAVED PREFERENCES
     ========================================================== */

  function discardPreferences() {
    setPreferences(
      savedPreferences
    );

    applyTheme(
      savedPreferences
        .theme
    );

    setNotice(
      null
    );
  }

  /* ==========================================================
     REQUEST EMAIL CHANGE
     ========================================================== */

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
      setNotice({
        type:
          'warning',

        message:
          'Enter a valid new email address.',
      });

      return;
    }

    if (
      email ===
      normalizeEmail(
        account.email
      )
    ) {
      setNotice({
        type:
          'warning',

        message:
          'This is already your current email address.',
      });

      return;
    }

    setRequestingEmail(
      true
    );

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'A verification code has been sent to your new email address.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not send the verification code.',
      });
    } finally {
      setRequestingEmail(
        false
      );
    }
  }

  /* ==========================================================
     RESEND EMAIL CODE
     ========================================================== */

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

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'A new verification code has been sent.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not resend the verification code.',
      });
    } finally {
      setRequestingEmail(
        false
      );
    }
  }

  /* ==========================================================
     VERIFY EMAIL CHANGE
     ========================================================== */

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
      setNotice({
        type:
          'warning',

        message:
          'Enter the complete 6-digit verification code.',
      });

      return;
    }

    setVerifyingEmail(
      true
    );

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Your email address has been updated successfully.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not verify your new email.',
      });
    } finally {
      setVerifyingEmail(
        false
      );
    }
  }

  /* ==========================================================
     CANCEL EMAIL CHANGE
     ========================================================== */

  async function cancelPendingEmailChange() {
    if (
      cancellingEmail
    ) {
      return;
    }

    setCancellingEmail(
      true
    );

    setNotice(
      null
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

      setNotice({
        type:
          'success',

        message:
          data.message ||
          'Your pending email change has been cancelled.',
      });
    } catch (
      error
    ) {
      setNotice({
        type:
          'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not cancel the email change.',
      });
    } finally {
      setCancellingEmail(
        false
      );
    }
  }

  /* ==========================================================
     LOADING
     ========================================================== */

  if (
    loading
  ) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">

          <div className="flex items-center gap-4">

            <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />

            <div className="flex-1">

              <div className="h-5 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />

              <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />

            <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 sm:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     ACCOUNT LOAD FAILED
     ========================================================== */

  if (
    !account
  ) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">

        <div className="flex items-start gap-3">

          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />

          <div>

            <h3 className="font-bold text-red-900 dark:text-red-200">
              Account unavailable
            </h3>

            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              {notice?.message ||
                'SaMi could not load your account.'}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadAccount()
              }
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" />

              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="space-y-6">

      {/* ======================================================
          NOTICE
          ====================================================== */}

      {notice && (
        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
            notice.type ===
              'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
              : notice.type ===
                  'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'
          }`}
        >
          {notice.type ===
          'success' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          )}

          <p className="min-w-0 flex-1 text-sm font-medium">
            {notice.message}
          </p>

          <button
            type="button"
            onClick={() =>
              setNotice(
                null
              )
            }
            aria-label="Dismiss message"
            className="shrink-0 opacity-60 transition hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ======================================================
          ACCOUNT IDENTITY
          ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-blue-600 text-lg font-black text-white shadow-sm">

            {account.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  account.avatarUrl
                }
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials(
                account
              )
            )}
          </div>

          <div className="min-w-0 flex-1">

            <div className="flex flex-wrap items-center gap-2">

              <h2 className="truncate text-xl font-black tracking-[-0.025em] text-slate-950 dark:text-white">
                {account.fullName ||
                  account.email}
              </h2>

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

            <p className="mt-2 text-xs text-slate-400">
              Your personal SaMi account follows you across every workspace you belong to.
            </p>
          </div>
        </div>
      </section>

      {/* ======================================================
          PERSONAL PROFILE
          ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <UserRound className="h-5 w-5" />
          </div>

          <div>

            <h3 className="text-base font-black text-slate-950 dark:text-white">
              Personal information
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Your global identity across SaMi. Workspace roles and permissions are managed separately.
            </p>
          </div>
        </div>

        <form
          onSubmit={
            saveProfile
          }
          className="mt-6"
        >
          <div className="grid gap-5 sm:grid-cols-2">

            <div>

              <label
                htmlFor="account-first-name"
                className="text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                First name
              </label>

              <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

                <UserRound className="h-4 w-4 shrink-0 text-slate-400" />

                <input
                  id="account-first-name"
                  value={
                    firstName
                  }
                  onChange={(
                    event
                  ) =>
                    setFirstName(
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
              </div>
            </div>

            <div>

              <label
                htmlFor="account-last-name"
                className="text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Last name
              </label>

              <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

                <UserRound className="h-4 w-4 shrink-0 text-slate-400" />

                <input
                  id="account-last-name"
                  value={
                    lastName
                  }
                  onChange={(
                    event
                  ) =>
                    setLastName(
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
              </div>
            </div>

            <div className="sm:col-span-2">

              <label
                htmlFor="account-phone"
                className="text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                Phone
              </label>

              <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

                <Phone className="h-4 w-4 shrink-0 text-slate-400" />

                <input
                  id="account-phone"
                  type="tel"
                  value={
                    phone
                  }
                  onChange={(
                    event
                  ) =>
                    setPhone(
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
              </div>
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
                : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      {/* ======================================================
          EMAIL
          ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
            <AtSign className="h-5 w-5" />
          </div>

          <div className="min-w-0">

            <h3 className="text-base font-black text-slate-950 dark:text-white">
              Email address
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Your email is part of your global SaMi identity and is used to sign in.
            </p>
          </div>
        </div>

        {!pendingEmailChange ? (
          <>
            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center">

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
                  setEmailEditing(
                    true
                  );

                  setNewEmail(
                    ''
                  );

                  setEmailCode(
                    ''
                  );

                  setNotice(
                    null
                  );
                }}
                disabled={
                  busy
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5" />

                Change email
              </button>
            </div>

            {emailEditing && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">

                <label
                  htmlFor="new-account-email"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  New email address
                </label>

                <div className="mt-2 flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950">

                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />

                  <input
                    id="new-account-email"
                    type="email"
                    value={
                      newEmail
                    }
                    onChange={(
                      event
                    ) =>
                      setNewEmail(
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
                  SaMi will send a 6-digit confirmation code to the new address. Your current email remains active until verification succeeds.
                </p>

                <div className="mt-4 flex flex-wrap justify-end gap-2">

                  <button
                    type="button"
                    onClick={() => {
                      setEmailEditing(
                        false
                      );

                      setNewEmail(
                        ''
                      );
                    }}
                    disabled={
                      requestingEmail
                    }
                    className="h-10 rounded-xl px-4 text-xs font-black text-slate-500 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={
                      requestNewEmail
                    }
                    disabled={
                      requestingEmail
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
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
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/70 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">

            <div className="flex items-start gap-3">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-300">
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

            <div className="mt-5">

              <label
                htmlFor="account-email-code"
                className="text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                6-digit code
              </label>

              <input
                id="account-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={
                  emailCode
                }
                onChange={(
                  event
                ) => {
                  const value =
                    event.target
                      .value;

                  if (
                    /^\d{0,6}$/.test(
                      value
                    )
                  ) {
                    setEmailCode(
                      value
                    );
                  }
                }}
                disabled={
                  verifyingEmail
                }
                placeholder="000000"
                className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl font-black tracking-[0.35em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <button
                type="button"
                onClick={
                  resendEmailCode
                }
                disabled={
                  requestingEmail ||
                  resendSeconds >
                    0
                }
                className="inline-flex items-center gap-2 text-xs font-black text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-blue-400"
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
                    cancelPendingEmailChange
                  }
                  disabled={
                    cancellingEmail ||
                    verifyingEmail
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  {cancellingEmail
                    ? 'Cancelling...'
                    : 'Cancel change'}
                </button>

                <button
                  type="button"
                  onClick={
                    verifyNewEmail
                  }
                  disabled={
                    verifyingEmail ||
                    verifyRetrySeconds >
                      0 ||
                    !validCode(
                      emailCode
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : verifyRetrySeconds >
                    0 ? (
                    <Clock3 className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
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

      {/* ======================================================
          PERSONAL PREFERENCES
          ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
            <SunMoon className="h-5 w-5" />
          </div>

          <div>

            <h3 className="text-base font-black text-slate-950 dark:text-white">
              Personal preferences
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              These settings control how SaMi is displayed to you across the platform.
            </p>
          </div>
        </div>

        {/* ====================================================
            LIVE PREVIEW
            ==================================================== */}

        <div className="mt-6 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-900/50 dark:from-blue-950/25 dark:to-indigo-950/20">

          <div className="border-b border-blue-100 px-5 py-4 dark:border-blue-900/40">

            <div className="flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Clock3 className="h-4 w-4" />
              </div>

              <div>

                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Live preference preview
                </p>

                <p className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-400">
                  Change the options below and you can immediately see how dates and times will appear to you in SaMi.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-blue-100 dark:bg-blue-900/30 sm:grid-cols-2 lg:grid-cols-4">

            <PreferencePreviewCard
              label="Your date"
              value={
                preferencePreview
                  .date
              }
              icon={
                CalendarDays
              }
            />

            <PreferencePreviewCard
              label="Your time"
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
              label="Active timezone"
              value={
                preferencePreview
                  .timezone
              }
              icon={
                Globe2
              }
            />
          </div>

          <div className="border-t border-blue-100 bg-white/60 px-5 py-4 dark:border-blue-900/40 dark:bg-slate-950/30">

            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              Your week
            </p>

            <div className="mt-3 grid grid-cols-7 gap-1.5">

              {preferencePreview
                .weekdays
                .map(
                  (
                    weekday,
                    index
                  ) => (
                    <div
                      key={`${weekday}-${index}`}
                      className={`rounded-lg px-1 py-2 text-center text-[9px] font-bold ${
                        index === 0
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                      }`}
                    >
                      {weekday}
                    </div>
                  )
                )}
            </div>

            <p className="mt-3 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
              The highlighted day is the first day of your week. This will later control SaMi calendars, schedules, timesheets and weekly reports.
            </p>
          </div>
        </div>

        {/* ====================================================
            WHERE PREFERENCES APPLY
            ==================================================== */}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">

          <div className="flex items-start gap-3">

            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />

            <div>

              <p className="text-xs font-black text-slate-900 dark:text-white">
                Where these settings apply
              </p>

              <p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                Your preferences will be used when SaMi displays dashboard activity, sessions, audit events, notifications, tasks, AI history and timestamps from business apps.
              </p>

              <p className="mt-2 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                They do not change the actual timestamp stored in the database and do not override company settings on customer-facing documents such as invoices.
              </p>
            </div>
          </div>
        </div>

        {/* ====================================================
            PREFERENCE FORM
            ==================================================== */}

        <div className="mt-6 grid gap-5 sm:grid-cols-2">

          {/* THEME */}

          <div>

            <label
              htmlFor="account-theme"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              Theme
            </label>

            <select
              id="account-theme"
              value={
                preferences.theme
              }
              onChange={(
                event
              ) => {
                const theme =
                  event.target
                    .value as UserTheme;

                setPreferences(
                  (
                    current
                  ) => ({
                    ...current,
                    theme,
                  })
                );

                applyTheme(
                  theme
                );
              }}
              disabled={
                preferencesSaving
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
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
            </select>

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Controls the appearance of your SaMi interface.
            </p>
          </div>

          {/* TIMEZONE */}

          <div>

            <label
              htmlFor="account-timezone"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              Timezone
            </label>

            <div className="relative mt-2">

              <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <select
                id="account-timezone"
                value={
                  preferences.timezone
                }
                onChange={(
                  event
                ) =>
                  setPreferences(
                    (
                      current
                    ) => ({
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
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
              >
                {timezoneOptions.map(
                  (
                    timezone
                  ) => (
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

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Converts stored timestamps into the time you should see.
            </p>
          </div>

          {/* DATE FORMAT */}

          <div>

            <label
              htmlFor="account-date-format"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              Date format
            </label>

            <div className="relative mt-2">

              <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <select
                id="account-date-format"
                value={
                  preferences.dateFormat
                }
                onChange={(
                  event
                ) =>
                  setPreferences(
                    (
                      current
                    ) => ({
                      ...current,

                      dateFormat:
                        event.target
                          .value as UserDateFormat,
                    })
                  )
                }
                disabled={
                  preferencesSaving
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
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
            </div>

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Example: {formatUserDate(
                previewNow,
                preferences
              )}
            </p>
          </div>

          {/* TIME FORMAT */}

          <div>

            <label
              htmlFor="account-time-format"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              Time format
            </label>

            <div className="relative mt-2">

              <Clock3 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <select
                id="account-time-format"
                value={
                  preferences.timeFormat
                }
                onChange={(
                  event
                ) =>
                  setPreferences(
                    (
                      current
                    ) => ({
                      ...current,

                      timeFormat:
                        event.target
                          .value as UserTimeFormat,
                    })
                  )
                }
                disabled={
                  preferencesSaving
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="24h">
                  24-hour
                </option>

                <option value="12h">
                  12-hour
                </option>
              </select>
            </div>

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Example: {formatUserTime(
                previewNow,
                preferences
              )}
            </p>
          </div>

          {/* FIRST DAY */}

          <div>

            <label
              htmlFor="account-first-day"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              First day of week
            </label>

            <select
              id="account-first-day"
              value={
                preferences.firstDayOfWeek
              }
              onChange={(
                event
              ) =>
                setPreferences(
                  (
                    current
                  ) => ({
                    ...current,

                    firstDayOfWeek:
                      Number(
                        event.target
                          .value
                      ),
                  })
                )
              }
              disabled={
                preferencesSaving
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value={0}>
                Sunday
              </option>

              <option value={1}>
                Monday
              </option>

              <option value={6}>
                Saturday
              </option>
            </select>

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Used by calendars, schedules and weekly views.
            </p>
          </div>

          {/* LOCALE */}

          <div>

            <label
              htmlFor="account-locale"
              className="text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              Locale
            </label>

            <input
              id="account-locale"
              value={
                preferences.locale
              }
              onChange={(
                event
              ) =>
                setPreferences(
                  (
                    current
                  ) => ({
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
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950"
            />

            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              Controls locale-aware number and language formatting.
            </p>
          </div>
        </div>

        {/* ====================================================
            SAVE / DISCARD
            ==================================================== */}

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">

          <div>

            {preferencesChanged ? (
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                You have unsaved preference changes.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Your displayed preferences are saved.
              </p>
            )}
          </div>

          <div className="flex gap-2">

            {preferencesChanged && (
              <button
                type="button"
                onClick={
                  discardPreferences
                }
                disabled={
                  preferencesSaving
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Discard
              </button>
            )}

            <button
              type="button"
              onClick={
                savePreferences
              }
              disabled={
                preferencesSaving ||
                !preferencesChanged
              }
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* ======================================================
          ACCOUNT DETAILS
          ====================================================== */}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>

            <h3 className="text-base font-black text-slate-950 dark:text-white">
              Account details
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Identity information maintained by SaMi.
            </p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100 dark:divide-slate-800">

          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">

            <dt className="text-xs font-bold text-slate-500">
              Account status
            </dt>

            <dd className="text-sm font-bold capitalize text-slate-900 dark:text-white">
              {account.status.replace(
                /_/g,
                ' '
              )}
            </dd>
          </div>

          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">

            <dt className="text-xs font-bold text-slate-500">
              Email verified
            </dt>

            <dd className="text-sm font-bold text-slate-900 dark:text-white">
              {account.emailVerified
                ? 'Yes'
                : 'No'}
            </dd>
          </div>

          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">

            <dt className="text-xs font-bold text-slate-500">
              Account created
            </dt>

            <dd className="text-sm font-bold text-slate-900 dark:text-white">
              {account.createdAt
                ? formatUserDateTime(
                    account.createdAt,
                    preferences
                  )
                : formatFallbackDateTime(
                    account.createdAt
                  )}
            </dd>
          </div>

          <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">

            <dt className="text-xs font-bold text-slate-500">
              Current display timezone
            </dt>

            <dd className="text-sm font-bold text-slate-900 dark:text-white">
              {preferencePreview.timezone}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

/* ============================================================
   PREFERENCE PREVIEW CARD
   ============================================================ */

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