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

/* ============================================================
   TYPES
   ============================================================ */

type UserTheme =
  | 'system'
  | 'light'
  | 'dark';

type UserTimeFormat =
  | '12h'
  | '24h';

type UserDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

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

type UserPreferences = {
  theme: UserTheme;
  locale: string;
  timezone: string;
  dateFormat: UserDateFormat;
  timeFormat: UserTimeFormat;
  firstDayOfWeek: number;
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
    UserPreferences;

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

const DEFAULT_PREFERENCES:
  UserPreferences = {
  theme: 'system',
  locale: 'en',
  timezone: 'UTC',
  dateFormat:
    'DD/MM/YYYY',
  timeFormat: '24h',
  firstDayOfWeek: 1,
};

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

function formatDateTime(
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
    ).matches ?? false
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
    // Theme still works for the current page.
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
    string[] = fallback;

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
    zones = fallback;
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

  return zones;
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
    useState<UserPreferences>(
      DEFAULT_PREFERENCES
    );

  const [
    pendingEmailChange,
    setPendingEmailChange,
  ] =
    useState<
      PendingEmailChange | null
    >(null);

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

  const busy =
    loading ||
    profileSaving ||
    preferencesSaving ||
    requestingEmail ||
    verifyingEmail ||
    cancellingEmail;

  /* ==========================================================
     LOAD ACCOUNT
     ========================================================== */

  const loadAccount =
    useCallback(
      async () => {
        setLoading(true);

        setNotice(null);

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
            data.preferences ||
            DEFAULT_PREFERENCES;

          setAccount(
            loadedAccount
          );

          setPreferences(
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
            loadedPreferences.theme
          );
        } catch (error) {
          setNotice({
            type: 'error',

            message:
              error instanceof
              Error
                ? error.message
                : 'SaMi could not load your account.',
          });
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  /* ==========================================================
     RESEND COUNTDOWN
     ========================================================== */

  useEffect(() => {
    if (
      resendSeconds <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setResendSeconds(
            (current) =>
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
  }, [resendSeconds]);

  /* ==========================================================
     VERIFY RATE-LIMIT COUNTDOWN
     ========================================================== */

  useEffect(() => {
    if (
      verifyRetrySeconds <= 0
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setVerifyRetrySeconds(
            (current) =>
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
  }, [verifyRetrySeconds]);

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

    if (!cleanFirstName) {
      setNotice({
        type: 'warning',
        message:
          'Enter your first name.',
      });

      return;
    }

    if (!cleanLastName) {
      setNotice({
        type: 'warning',
        message:
          'Enter your last name.',
      });

      return;
    }

    setProfileSaving(true);
    setNotice(null);

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
        type: 'success',

        message:
          data.message ||
          'Your profile has been updated.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not update your profile.',
      });
    } finally {
      setProfileSaving(false);
    }
  }

  /* ==========================================================
     PREFERENCES SAVE
     ========================================================== */

  async function savePreferences() {
    if (
      preferencesSaving
    ) {
      return;
    }

    setPreferencesSaving(
      true
    );

    setNotice(null);

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

      applyTheme(
        data.preferences
          .theme
      );

      setNotice({
        type: 'success',

        message:
          data.message ||
          'Your preferences have been updated.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

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
        type: 'warning',

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
        type: 'warning',

        message:
          'This is already your current email address.',
      });

      return;
    }

    setRequestingEmail(
      true
    );

    setNotice(null);

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
        null;

      setPendingEmailChange(
        pending
      );

      setResendSeconds(
        pending
          ?.canResendInSeconds ||
          60
      );

      setEmailCode('');

      setEmailEditing(
        false
      );

      setNotice({
        type: 'success',

        message:
          data.message ||
          'A verification code has been sent to your new email address.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

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
     RESEND EMAIL CHANGE CODE
     ========================================================== */

  async function resendEmailCode() {
    if (
      requestingEmail ||
      resendSeconds > 0 ||
      !pendingEmailChange
    ) {
      return;
    }

    setNewEmail(
      pendingEmailChange.email
    );

    setRequestingEmail(
      true
    );

    setNotice(null);

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
        pendingEmailChange;

      setPendingEmailChange(
        pending
      );

      setResendSeconds(
        pending
          ?.canResendInSeconds ||
          60
      );

      setEmailCode('');

      setNotice({
        type: 'success',

        message:
          data.message ||
          'A new verification code has been sent.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

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
        type: 'warning',

        message:
          'Enter the complete 6-digit verification code.',
      });

      return;
    }

    setVerifyingEmail(true);
    setNotice(null);

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

      setNewEmail('');
      setEmailCode('');
      setResendSeconds(0);
      setVerifyRetrySeconds(0);
      setEmailEditing(false);

      setNotice({
        type: 'success',

        message:
          data.message ||
          'Your email address has been updated successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

        message:
          error instanceof
            Error
              ? error.message
              : 'SaMi could not verify your new email.',
      });
    } finally {
      setVerifyingEmail(false);
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

    setNotice(null);

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

      setNewEmail('');
      setEmailCode('');
      setResendSeconds(0);
      setVerifyRetrySeconds(0);

      setNotice({
        type: 'success',

        message:
          data.message ||
          'Your pending email change has been cancelled.',
      });
    } catch (error) {
      setNotice({
        type: 'error',

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

  if (loading) {
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

  if (!account) {
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
              setNotice(null)
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
          EMAIL ADDRESS
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

                  setNewEmail('');
                  setEmailCode('');
                  setNotice(null);
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

                      setNewEmail('');
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
                  {formatDateTime(
                    pendingEmailChange
                      .expiresAt
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
              These follow your SaMi account across workspaces.
            </p>
          </div>
        </div>

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
                  (current) => ({
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
                System
              </option>

              <option value="light">
                Light
              </option>

              <option value="dark">
                Dark
              </option>
            </select>
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
                    (current) => ({
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
                  (timezone) => (
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
                    (current) => ({
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
                    (current) => ({
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
                  (current) => ({
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
                  (current) => ({
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
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={
              savePreferences
            }
            disabled={
              preferencesSaving
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
              {formatDateTime(
                account.createdAt
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}