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
  Download,
  FileJson,
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
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

import SecuritySettings from './SecuritySettings';

import {
  DEFAULT_USER_DISPLAY_PREFERENCES,
  getUserFormattingPreview,
  type UserDateFormat,
  type UserDisplayPreferences,
  type UserTheme,
  type UserTimeFormat,
} from '@/lib/account/user-formatting';

import {
  setSaMiTheme,
} from '@/lib/theme/runtime';

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

type AccountView =
  | 'overview'
  | 'personal'
  | 'email'
  | 'preferences'
  | 'security'
  | 'data';

type OverlayState = {
  type: SaMiOverlayType;
  title: string;
  message: string;
};

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
  return value
    .replace(/\D/g, '')
    .slice(0, 6);
}

function validCode(
  value: string
) {
  return /^\d{6}$/.test(
    value
  );
}

function initials(
  account:
    UserAccount | null
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

  const result =
    `${first || ''}${last || ''}`
      .toUpperCase();

  return result || 'SM';
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

  let zones =
    fallback;

  try {
    const intl =
      Intl as typeof Intl & {
        supportedValuesOf?: (
          key: 'timeZone'
        ) => string[];
      };

    if (
      typeof intl
        .supportedValuesOf ===
      'function'
    ) {
      zones =
        intl.supportedValuesOf(
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

  if (
    !zones.includes('UTC')
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
    useState<PendingEmailChange | null>(
      null
    );

  const [
    firstName,
    setFirstName,
  ] = useState('');

  const [
    lastName,
    setLastName,
  ] = useState('');

  const [
    phone,
    setPhone,
  ] = useState('');

  const [
    emailEditing,
    setEmailEditing,
  ] = useState(false);

  const [
    newEmail,
    setNewEmail,
  ] = useState('');

  const [
    emailCode,
    setEmailCode,
  ] = useState('');

  const [
    resendSeconds,
    setResendSeconds,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    profileSaving,
    setProfileSaving,
  ] = useState(false);

  const [
    avatarSaving,
    setAvatarSaving,
  ] = useState(false);

  const [
    avatarRemoving,
    setAvatarRemoving,
  ] = useState(false);

  const [
    preferencesSaving,
    setPreferencesSaving,
  ] = useState(false);

  const [
    requestingEmail,
    setRequestingEmail,
  ] = useState(false);

  const [
    verifyingEmail,
    setVerifyingEmail,
  ] = useState(false);

  const [
    cancellingEmail,
    setCancellingEmail,
  ] = useState(false);

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
          new Date()
        ),
      [preferences]
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
          (account.phone || '')
      )
    );

  const preferencesChanged =
    !preferencesEqual(
      preferences,
      savedPreferences
    );

  function showOverlay(
    type: SaMiOverlayType,
    title: string,
    message: string
  ) {
    setOverlay({
      type,
      title,
      message,
    });
  }

  const loadAccount =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const response =
            await fetch(
              '/api/account',
              {
                method: 'GET',
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

          setAccount(
            data.account
          );

          setFirstName(
            data.account
              .firstName || ''
          );

          setLastName(
            data.account
              .lastName || ''
          );

          setPhone(
            data.account
              .phone || ''
          );

          const loadedPreferences =
            data.preferences || {
              ...DEFAULT_USER_DISPLAY_PREFERENCES,
            };

          setPreferences(
            loadedPreferences
          );

          setSavedPreferences(
            loadedPreferences
          );

          setSaMiTheme(
            loadedPreferences
              .theme
          );

          const pending =
            data.emailChange
              ?.pending ||
            data.pending ||
            null;

          setPendingEmailChange(
            pending
          );

          setResendSeconds(
            pending
              ?.canResendInSeconds ||
              0
          );
        } catch (error) {
          setAccount(null);

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

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

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
            current =>
              Math.max(
                0,
                current - 1
              )
          );
        },
        1000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [resendSeconds]);

  async function uploadAvatar(
    file: File | null
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

    setAvatarSaving(true);

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
            method: 'POST',
            headers: {
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body: formData,
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
    } catch (error) {
      showOverlay(
        'error',
        'Image update failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not update your profile image.'
      );
    } finally {
      setAvatarSaving(false);
    }
  }

  async function removeAvatar() {
    if (
      !account?.avatarFileId ||
      avatarRemoving ||
      avatarSaving
    ) {
      return;
    }

    setAvatarRemoving(true);

    try {
      const response =
        await fetch(
          '/api/account/avatar',
          {
            method: 'DELETE',
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
    } catch (error) {
      showOverlay(
        'error',
        'Image removal failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not remove your profile image.'
      );
    } finally {
      setAvatarRemoving(false);
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
        .replace(/\s+/g, ' ');

    const cleanLastName =
      lastName
        .trim()
        .replace(/\s+/g, ' ');

    if (!cleanFirstName) {
      showOverlay(
        'warning',
        'First name required',
        'Enter your first name.'
      );

      return;
    }

    if (!cleanLastName) {
      showOverlay(
        'warning',
        'Last name required',
        'Enter your last name.'
      );

      return;
    }

    setProfileSaving(true);

    try {
      const response =
        await fetch(
          '/api/account/profile',
          {
            method: 'PATCH',

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
        data.account.firstName
      );

      setLastName(
        data.account.lastName
      );

      setPhone(
        data.account.phone ||
          ''
      );

      showOverlay(
        'success',
        'Profile updated',
        data.message ||
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
      setProfileSaving(false);
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
            method: 'PATCH',

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

      setSaMiTheme(
        data.preferences.theme
      );

      showOverlay(
        'success',
        'Preferences saved',
        data.message ||
          'Your preferences have been updated.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Preferences not saved',
        error instanceof Error
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

    setSaMiTheme(
      savedPreferences.theme
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

    if (!validEmail(email)) {
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

    setRequestingEmail(true);

    try {
      const response =
        await fetch(
          '/api/account/email-change/request',
          {
            method: 'POST',

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
          data.retryAfterSeconds
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
          ?.pending || {
          email,
          expiresAt: '',
          canResendInSeconds:
            60,
        };

      setPendingEmailChange(
        pending
      );

      setResendSeconds(
        pending
          .canResendInSeconds ||
          60
      );

      setEmailCode('');

      showOverlay(
        'success',
        'Verification code sent',
        data.message ||
          `A verification code has been sent to ${email}.`
      );
    } catch (error) {
      showOverlay(
        'error',
        'Email change not started',
        error instanceof Error
          ? error.message
          : 'SaMi could not start the email change.'
      );
    } finally {
      setRequestingEmail(
        false
      );
    }
  }

  async function resendEmailCode() {
    if (
      !pendingEmailChange ||
      resendSeconds > 0 ||
      requestingEmail
    ) {
      return;
    }

    setNewEmail(
      pendingEmailChange.email
    );

    setRequestingEmail(true);

    try {
      const response =
        await fetch(
          '/api/account/email-change/request',
          {
            method: 'POST',

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
          data.retryAfterSeconds
        ) {
          setResendSeconds(
            Math.ceil(
              data.retryAfterSeconds
            )
          );
        }

        throw new Error(
          data.error ||
            'SaMi could not resend the code.'
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
          .canResendInSeconds ||
          60
      );

      showOverlay(
        'success',
        'New code sent',
        data.message ||
          'A new verification code has been sent.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Code not sent',
        error instanceof Error
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
      !pendingEmailChange
    ) {
      return;
    }

    if (
      !validCode(
        emailCode
      )
    ) {
      showOverlay(
        'warning',
        'Invalid code',
        'Enter the 6-digit verification code.'
      );

      return;
    }

    setVerifyingEmail(true);

    try {
      const response =
        await fetch(
          '/api/account/email-change/verify',
          {
            method: 'POST',

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
                code:
                  emailCode,
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
        throw new Error(
          data.error ||
            'SaMi could not verify the new email address.'
        );
      }

      setPendingEmailChange(
        null
      );

      setEmailCode('');
      setNewEmail('');
      setEmailEditing(false);

      await loadAccount();

      showOverlay(
        'success',
        'Email updated',
        data.message ||
          'Your email address has been changed successfully.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Verification failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not verify the code.'
      );
    } finally {
      setVerifyingEmail(
        false
      );
    }
  }

  async function cancelEmailChange() {
    if (
      cancellingEmail ||
      !pendingEmailChange
    ) {
      return;
    }

    setCancellingEmail(true);

    try {
      const response =
        await fetch(
          '/api/account/email-change/cancel',
          {
            method: 'POST',

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

      setEmailCode('');
      setNewEmail('');
      setEmailEditing(false);

      showOverlay(
        'success',
        'Email change cancelled',
        data.message ||
          'The pending email change has been cancelled.'
      );
    } catch (error) {
      showOverlay(
        'error',
        'Cancellation failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not cancel the email change.'
      );
    } finally {
      setCancellingEmail(
        false
      );
    }
  }

  function navigate(
    next: AccountView
  ) {
    setView(next);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!account) {
    return (
      <>
        <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <UserRound className="h-8 w-8 text-slate-400" />

          <p className="mt-4 text-sm font-black">
            Account unavailable
          </p>

          <button
            type="button"
            onClick={() =>
              void loadAccount()
            }
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>

        <Overlay
          state={overlay}
          onClose={() =>
            setOverlay(null)
          }
        />
      </>
    );
  }

  if (
    view === 'security'
  ) {
    return (
      <>
        <SecuritySettings
          onBack={() =>
            navigate(
              'overview'
            )
          }
        />

        <Overlay
          state={overlay}
          onClose={() =>
            setOverlay(null)
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
              navigate(
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
            account={account}
            onPersonal={() =>
              navigate(
                'personal'
              )
            }
            onEmail={() =>
              navigate(
                'email'
              )
            }
            onPreferences={() =>
              navigate(
                'preferences'
              )
            }
            onSecurity={() =>
              navigate(
                'security'
              )
            }
            onData={() =>
              navigate(
                'data'
              )
            }
            onUploadAvatar={
              uploadAvatar
            }
            onRemoveAvatar={
              removeAvatar
            }
            avatarSaving={
              avatarSaving
            }
            avatarRemoving={
              avatarRemoving
            }
          />
        )}

        {view ===
          'personal' && (
          <PersonalView
            firstName={
              firstName
            }
            lastName={
              lastName
            }
            phone={phone}
            changed={
              profileChanged
            }
            saving={
              profileSaving
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
            account={account}
            pending={
              pendingEmailChange
            }
            editing={
              emailEditing
            }
            newEmail={
              newEmail
            }
            code={
              emailCode
            }
            resendSeconds={
              resendSeconds
            }
            requesting={
              requestingEmail
            }
            verifying={
              verifyingEmail
            }
            cancelling={
              cancellingEmail
            }
            onEditing={
              setEmailEditing
            }
            onNewEmail={
              setNewEmail
            }
            onCode={value =>
              setEmailCode(
                normalizeCode(
                  value
                )
              )
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
            onCancel={
              cancelEmailChange
            }
          />
        )}

        {view ===
          'data' && (
          <DataPrivacyView />
        )}

        {view ===
          'preferences' && (
          <PreferencesView
            preferences={
              preferences
            }
            timezoneOptions={
              timezoneOptions
            }
            preview={
              preferencePreview
            }
            changed={
              preferencesChanged
            }
            saving={
              preferencesSaving
            }
            onChange={
              next => {
                setPreferences(
                  next
                );

                setSaMiTheme(
                  next.theme
                );
              }
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

      <Overlay
        state={overlay}
        onClose={() =>
          setOverlay(null)
        }
      />
    </>
  );
}

function AccountOverview({
  account,
  onPersonal,
  onEmail,
  onPreferences,
  onSecurity,
  onData,
  onUploadAvatar,
  onRemoveAvatar,
  avatarSaving,
  avatarRemoving,
}: {
  account: UserAccount;
  onPersonal: () => void;
  onEmail: () => void;
  onPreferences:
    () => void;
  onSecurity: () => void;
  onData: () => void;
  onUploadAvatar:
    (file: File | null) =>
      void;
  onRemoveAvatar:
    () => void;
  avatarSaving: boolean;
  avatarRemoving: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-xl font-black text-white">
              {account.avatarFileId ? (
                <img
                  src={
                    account.avatarUrl ||
                    '/api/account/avatar'
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

            <label className="absolute -bottom-2 -right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-4 border-white bg-blue-600 text-white shadow-sm dark:border-[#0d121b]">
              {avatarSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  avatarSaving ||
                  avatarRemoving
                }
                onChange={
                  event => {
                    const file =
                      event.target
                        .files?.[0] ||
                      null;

                    void onUploadAvatar(
                      file
                    );

                    event.target.value =
                      '';
                  }
                }
                className="hidden"
              />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-slate-950 dark:text-white">
              {account.fullName ||
                `${account.firstName} ${account.lastName}`.trim()}
            </h2>

            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {account.email}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Camera className="h-4 w-4" />
                Change photo

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    avatarSaving ||
                    avatarRemoving
                  }
                  onChange={
                    event => {
                      const file =
                        event.target
                          .files?.[0] ||
                        null;

                      void onUploadAvatar(
                        file
                      );

                      event.target.value =
                        '';
                    }
                  }
                  className="hidden"
                />
              </label>

              {account.avatarFileId && (
                <button
                  type="button"
                  disabled={
                    avatarRemoving ||
                    avatarSaving
                  }
                  onClick={() =>
                    void onRemoveAvatar()
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  {avatarRemoving ? (
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
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <AccountRow
          icon={UserRound}
          title="Personal information"
          description="Name and phone number"
          value={
            account.fullName
          }
          onClick={
            onPersonal
          }
        />

        <AccountRow
          icon={Mail}
          title="Email"
          description="Sign-in and account email"
          value={
            account.email
          }
          onClick={
            onEmail
          }
        />

        <AccountRow
          icon={SunMoon}
          title="Preferences"
          description="Theme, timezone and date formats"
          onClick={
            onPreferences
          }
        />

        <AccountRow
          icon={ShieldCheck}
          title="Password & security"
          description="Password, two-factor authentication, sessions and security activity"
          onClick={
            onSecurity
          }
        />

        <AccountRow
          icon={FileJson}
          title="Data & privacy"
          description="Download a portable copy of your SaMi account data"
          onClick={
            onData
          }
          last
        />
      </section>
    </div>
  );
}

function AccountRow({
  icon: Icon,
  title,
  description,
  value,
  onClick,
  last = false,
}: {
  icon:
    typeof UserRound;
  title: string;
  description: string;
  value?: string | null;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-[#0d121b] dark:hover:border-blue-500/30 dark:hover:bg-blue-500/[0.06]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-[18px] w-[18px]" />
      </div>

      <div className="mt-3 min-w-0">
        <p className="text-sm font-black text-slate-950 dark:text-white">
          {title}
        </p>

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {value ? (
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-400">
            {value}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400">
            Open settings
          </span>
        )}

        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
      </div>
    </button>
  );
}

function PersonalView({
  firstName,
  lastName,
  phone,
  changed,
  saving,
  onFirstName,
  onLastName,
  onPhone,
  onSubmit,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  changed: boolean;
  saving: boolean;
  onFirstName:
    (value: string) =>
      void;
  onLastName:
    (value: string) =>
      void;
  onPhone:
    (value: string) =>
      void;
  onSubmit:
    (
      event:
        FormEvent<HTMLFormElement>
    ) => void;
}) {
  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
      <form
        onSubmit={
          onSubmit
        }
        className="max-w-2xl space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            value={
              firstName
            }
            onChange={
              onFirstName
            }
            autoComplete="given-name"
          />

          <Field
            label="Last name"
            value={
              lastName
            }
            onChange={
              onLastName
            }
            autoComplete="family-name"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
            Phone number
          </label>

          <div className="relative">
            <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="tel"
              value={phone}
              onChange={
                event =>
                  onPhone(
                    event.target
                      .value
                  )
              }
              autoComplete="tel"
              placeholder="Phone number"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={
            saving ||
            !changed
          }
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}

          {saving
            ? 'Saving...'
            : 'Save changes'}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange:
    (value: string) =>
      void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="text"
        value={value}
        onChange={
          event =>
            onChange(
              event.target.value
            )
        }
        autoComplete={
          autoComplete
        }
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
      />
    </div>
  );
}

function EmailView({
  account,
  pending,
  editing,
  newEmail,
  code,
  resendSeconds,
  requesting,
  verifying,
  cancelling,
  onEditing,
  onNewEmail,
  onCode,
  onRequest,
  onResend,
  onVerify,
  onCancel,
}: {
  account: UserAccount;
  pending:
    PendingEmailChange | null;
  editing: boolean;
  newEmail: string;
  code: string;
  resendSeconds: number;
  requesting: boolean;
  verifying: boolean;
  cancelling: boolean;
  onEditing:
    (value: boolean) =>
      void;
  onNewEmail:
    (value: string) =>
      void;
  onCode:
    (value: string) =>
      void;
  onRequest: () => void;
  onResend: () => void;
  onVerify: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <AtSign className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-500 dark:text-slate-400">
              Current email
            </p>

            <p className="mt-1 break-all text-sm font-black text-slate-950 dark:text-white">
              {account.email}
            </p>

            <div className="mt-2 flex items-center gap-2 text-xs">
              {account.emailVerified ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Verified
                  </span>
                </>
              ) : (
                <span className="font-bold text-amber-600">
                  Verification required
                </span>
              )}
            </div>
          </div>

          {!pending &&
            !editing && (
              <button
                type="button"
                onClick={() =>
                  onEditing(true)
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Change email
              </button>
            )}
        </div>
      </section>

      {editing &&
        !pending && (
          <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
            <div className="max-w-xl">
              <label className="mb-2 block text-xs font-black text-slate-700 dark:text-slate-300">
                New email address
              </label>

              <input
                type="email"
                value={newEmail}
                onChange={
                  event =>
                    onNewEmail(
                      event.target
                        .value
                    )
                }
                autoComplete="email"
                placeholder="name@example.com"
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    requesting
                  }
                  onClick={() =>
                    void onRequest()
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                >
                  {requesting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  Send verification code
                </button>

                <button
                  type="button"
                  disabled={
                    requesting
                  }
                  onClick={() =>
                    onEditing(false)
                  }
                  className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

      {pending && (
        <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
          <div className="max-w-xl">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-blue-600" />

              <div>
                <p className="text-sm font-black">
                  Verify new email
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-black">
                    {pending.email}
                  </span>
                  .
                </p>
              </div>
            </div>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={
                event =>
                  onCode(
                    event.target.value
                  )
              }
              placeholder="000000"
              className="mt-5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  verifying ||
                  !validCode(code)
                }
                onClick={() =>
                  void onVerify()
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
              >
                {verifying && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                Verify email
              </button>

              <button
                type="button"
                disabled={
                  requesting ||
                  resendSeconds > 0
                }
                onClick={() =>
                  void onResend()
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
              >
                <RefreshCw className="h-4 w-4" />

                {resendSeconds > 0
                  ? `Resend in ${resendSeconds}s`
                  : 'Resend code'}
              </button>

              <button
                type="button"
                disabled={
                  cancelling
                }
                onClick={() =>
                  void onCancel()
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 px-4 text-xs font-black text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
              >
                {cancelling && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                Cancel change
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function DataPrivacyView() {
  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
              <FileJson className="h-5 w-5" />
            </div>

            <h2 className="mt-4 text-lg font-black text-slate-950 dark:text-white">
              Your SaMi data
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Download a machine-readable JSON copy of your global account,
              personal preferences, workspace membership history, active
              session metadata, and data exposed by any accessible SaMi
              module that implements the platform data-export contract.
            </p>
          </div>

          <a
            href="/api/account/export"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"
          >
            <Download className="h-4 w-4" />
            Download my data
          </a>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
        <h3 className="text-sm font-black text-slate-950 dark:text-white">
          Data deletion safety
        </h3>

        <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
          SaMi does not silently delete business records or bypass workspace
          ownership, audit, billing, or legal-retention boundaries. Business
          modules must implement the platform erasure contract before their
          records can participate in a controlled account-erasure workflow.
        </p>
      </section>
    </div>
  );
}


function PreferencesView({
  preferences,
  timezoneOptions,
  preview,
  changed,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  preferences:
    UserDisplayPreferences;
  timezoneOptions:
    string[];
  preview:
    ReturnType<
      typeof getUserFormattingPreview
    >;
  changed: boolean;
  saving: boolean;
  onChange:
    (
      value:
        UserDisplayPreferences
    ) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  function update<
    K extends keyof UserDisplayPreferences,
  >(
    key: K,
    value:
      UserDisplayPreferences[K]
  ) {
    onChange({
      ...preferences,
      [key]: value,
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b] sm:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <SelectField
            icon={SunMoon}
            label="Theme"
            value={
              preferences.theme
            }
            onChange={
              value =>
                update(
                  'theme',
                  value as UserTheme
                )
            }
            options={[
              {
                value:
                  'system',
                label:
                  'Use system setting',
              },
              {
                value:
                  'light',
                label:
                  'Light',
              },
              {
                value:
                  'dark',
                label:
                  'Dark',
              },
            ]}
          />

          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
              <Globe2 className="h-4 w-4" />
              Timezone
            </label>

            <select
              value={
                preferences.timezone
              }
              onChange={
                event =>
                  update(
                    'timezone',
                    event.target
                      .value
                  )
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
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

          <SelectField
            icon={CalendarDays}
            label="Date format"
            value={
              preferences.dateFormat
            }
            onChange={
              value =>
                update(
                  'dateFormat',
                  value as UserDateFormat
                )
            }
            options={[
              {
                value:
                  'DD/MM/YYYY',
                label:
                  'DD/MM/YYYY',
              },
              {
                value:
                  'MM/DD/YYYY',
                label:
                  'MM/DD/YYYY',
              },
              {
                value:
                  'YYYY-MM-DD',
                label:
                  'YYYY-MM-DD',
              },
            ]}
          />

          <SelectField
            icon={Clock3}
            label="Time format"
            value={
              preferences.timeFormat
            }
            onChange={
              value =>
                update(
                  'timeFormat',
                  value as UserTimeFormat
                )
            }
            options={[
              {
                value: '12h',
                label:
                  '12-hour',
              },
              {
                value: '24h',
                label:
                  '24-hour',
              },
            ]}
          />

          <SelectField
            icon={CalendarDays}
            label="First day of week"
            value={String(
              preferences.firstDayOfWeek
            )}
            onChange={
              value =>
                update(
                  'firstDayOfWeek',
                  Number(
                    value
                  ) as UserDisplayPreferences['firstDayOfWeek']
                )
            }
            options={[
              {
                value: '0',
                label:
                  'Sunday',
              },
              {
                value: '1',
                label:
                  'Monday',
              },
              {
                value: '6',
                label:
                  'Saturday',
              },
            ]}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              saving ||
              !changed
            }
            onClick={() =>
              void onSave()
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            Save preferences
          </button>

          <button
            type="button"
            disabled={
              saving ||
              !changed
            }
            onClick={
              onDiscard
            }
            className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            Discard
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0d121b]">
        <p className="text-xs font-black text-slate-500 dark:text-slate-400">
          Preview
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <PreviewCard
            label="Date"
            value={
              preview.date
            }
          />

          <PreviewCard
            label="Time"
            value={
              preview.time
            }
          />

          <PreviewCard
            label="Date & time"
            value={
              preview.dateTime
            }
          />
        </div>
      </section>
    </div>
  );
}

function SelectField({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon:
    typeof SunMoon;
  label: string;
  value: string;
  onChange:
    (value: string) =>
      void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
        <Icon className="h-4 w-4" />
        {label}
      </label>

      <select
        value={value}
        onChange={
          event =>
            onChange(
              event.target.value
            )
        }
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
      >
        {options.map(
          option => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function PreviewCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">
      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-black text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function Overlay({
  state,
  onClose,
}: {
  state:
    OverlayState | null;
  onClose: () => void;
}) {
  return (
    <SaMiOverlay
      open={
        Boolean(state)
      }
      type={
        state?.type ||
        'info'
      }
      title={
        state?.title ||
        ''
      }
      message={
        state?.message ||
        ''
      }
      onClose={
        onClose
      }
    />
  );
}