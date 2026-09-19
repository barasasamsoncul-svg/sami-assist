'use client';

import Link from 'next/link';

import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import SaMiLogo from '@/app/components/SaMiLogo';


/* ================================================================
   TYPES
   ================================================================ */

type InvitationPreview = {
  email:
    string;

  workspaceName:
    string;

  memberType:
    'internal'
    | 'portal';

  message:
    string | null;

  expiresAt:
    string;

  inviterName:
    string;

  roles:
    Array<{
      id:
        string;

      name:
        string;
    }>;

  companies:
    Array<{
      id:
        string;

      name:
        string;

      isDefault:
        boolean;
    }>;
};


type SignedInUser = {
  id:
    string;

  email:
    string;

  fullName:
    string;
};


type Props = {
  token:
    string;

  invitation:
    InvitationPreview | null;

  accountExists:
    boolean;

  accountEmailVerified:
    boolean;

  signedInUser:
    SignedInUser | null;

  signedInEmailMatches:
    boolean;

  unavailableMessage?:
    string;
};


type AcceptanceResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  next?:
    string | null;
};


/* ================================================================
   HELPERS
   ================================================================ */

function formatExpiry(
  value:
    string,
) {
  const date =
    new Date(
      value,
    );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return 'Unknown';
  }


  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    },
  ).format(
    date,
  );
}


function isValidPassword(
  value:
    string,
) {
  return (
    value.length >=
      8 &&
    value.length <=
      128
  );
}


/* ================================================================
   CLIENT
   ================================================================ */

export default function InvitationAcceptClient({
  token,
  invitation,
  accountExists,
  accountEmailVerified,
  signedInUser,
  signedInEmailMatches,
  unavailableMessage,
}: Props) {
  const router =
    useRouter();


  const [
    firstName,
    setFirstName,
  ] =
    useState(
      '',
    );


  const [
    lastName,
    setLastName,
  ] =
    useState(
      '',
    );


  const [
    phone,
    setPhone,
  ] =
    useState(
      '',
    );


  const [
    password,
    setPassword,
  ] =
    useState(
      '',
    );


  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState(
      '',
    );


  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false,
    );


  const [
    rememberMe,
    setRememberMe,
  ] =
    useState(
      true,
    );


  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );


  const [
    signingOut,
    setSigningOut,
  ] =
    useState(
      false,
    );


  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    success,
    setSuccess,
  ] =
    useState<
      string | null
    >(
      null,
    );


  const [
    portalAccepted,
    setPortalAccepted,
  ] =
    useState(
      false,
    );


  const invitePath =
    useMemo(
      () =>
        token
          ? `/invite/${encodeURIComponent(
              token,
            )}`
          : '/',

      [
        token,
      ],
    );


  const loginHref =
    useMemo(
      () =>
        `/login?next=${encodeURIComponent(
          invitePath,
        )}`,

      [
        invitePath,
      ],
    );


  /* ============================================================
     ACCEPT
     ============================================================ */

  async function acceptInvitation() {
    if (
      !invitation ||
      !token ||
      submitting
    ) {
      return;
    }


    setError(
      null,
    );


    if (
      !accountExists
    ) {
      if (
        !firstName.trim() ||
        !lastName.trim()
      ) {
        setError(
          'Enter your first name and last name.',
        );

        return;
      }


      if (
        !isValidPassword(
          password,
        )
      ) {
        setError(
          'Password must contain at least 8 characters.',
        );

        return;
      }


      if (
        password !==
        confirmPassword
      ) {
        setError(
          'The passwords do not match.',
        );

        return;
      }
    }


    setSubmitting(
      true,
    );


    try {
      const response =
        await fetch(
          '/api/invitations/accept',
          {
            method:
              'POST',

            credentials:
              'same-origin',

            cache:
              'no-store',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                token,

                firstName,

                lastName,

                phone,

                password,

                rememberMe,
              }),
          },
        );


      let data:
        AcceptanceResponse;


      try {
        data =
          await response.json();
      } catch {
        data = {
          success:
            false,

          error:
            'SaMi returned an invalid response.',
        };
      }


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'The invitation could not be accepted.',
        );
      }


      setSuccess(
        data.message ||
        'Invitation accepted.',
      );


      if (
        data.next
      ) {
        router.replace(
          data.next,
        );

        router.refresh();

        return;
      }


      /*
       * Portal invitations intentionally do not enter the
       * internal workspace shell.
       */
      setPortalAccepted(
        true,
      );
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'The invitation could not be accepted.',
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }


  /* ============================================================
     SIGN OUT WRONG ACCOUNT
     ============================================================ */

  async function signOut() {
    if (
      signingOut
    ) {
      return;
    }


    setSigningOut(
      true,
    );

    setError(
      null,
    );


    try {
      const response =
        await fetch(
          '/api/auth/logout',
          {
            method:
              'POST',

            credentials:
              'include',

            headers: {
              Accept:
                'application/json',
            },
          },
        );


      if (
        !response.ok
      ) {
        throw new Error(
          'SaMi could not sign out.',
        );
      }


      router.refresh();
    } catch (
      requestError
    ) {
      setError(
        requestError instanceof
          Error
          ? requestError.message
          : 'SaMi could not sign out.',
      );
    } finally {
      setSigningOut(
        false,
      );
    }
  }


  /* ============================================================
     UNAVAILABLE
     ============================================================ */

  if (
    !invitation
  ) {
    return (
      <main className="min-h-screen bg-[#F6F7F9] px-4 py-8 text-slate-950 dark:bg-[#090B10] dark:text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">

          <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#11141A]">

            <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
              <SaMiLogo
                size="sm"
                showTagline={
                  false
                }
              />
            </div>


            <div className="px-5 py-10 text-center sm:px-8">

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-white/10">
                <LockKeyhole className="h-6 w-6" />
              </div>


              <h1 className="mt-4 text-lg font-bold">
                Invitation unavailable
              </h1>


              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                {unavailableMessage ||
                  'This invitation is invalid, expired, revoked or has already been used.'}
              </p>


              <Link
                href="/login"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Go to SaMi

                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }


  /* ============================================================
     PORTAL SUCCESS
     ============================================================ */

  if (
    portalAccepted
  ) {
    return (
      <main className="min-h-screen bg-[#F6F7F9] px-4 py-8 text-slate-950 dark:bg-[#090B10] dark:text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">

          <section className="w-full rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-white/10 dark:bg-[#11141A]">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </div>


            <h1 className="mt-4 text-lg font-bold">
              Invitation accepted
            </h1>


            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {success}
            </p>


            <p className="mt-4 text-xs leading-5 text-slate-400">
              This is portal access, so it does not enter the internal SaMi workspace.
            </p>
          </section>
        </div>
      </main>
    );
  }


  /* ============================================================
     MAIN
     ============================================================ */

  return (
    <main className="min-h-screen bg-[#F6F7F9] px-3 py-5 text-slate-950 dark:bg-[#090B10] dark:text-white sm:px-6 sm:py-8">

      <div className="mx-auto max-w-[1020px]">

        {/* HEADER */}

        <div className="mb-4 flex items-center justify-between">
          <SaMiLogo
            size="sm"
            showTagline={
              false
            }
          />

          <span className="hidden text-xs font-medium text-slate-400 sm:block">
            Secure workspace invitation
          </span>
        </div>


        {/* MAIN RECORD */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[#11141A]">

          <div className="grid lg:grid-cols-[360px_minmax(0,1fr)]">

            {/* ==================================================
                INVITATION RECORD SUMMARY
                ================================================== */}

            <aside className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.025] lg:border-b-0 lg:border-r lg:p-6">

              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
                Workspace invitation
              </p>


              <h1 className="mt-2 text-xl font-bold tracking-[-0.025em]">
                {invitation.workspaceName}
              </h1>


              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {invitation.inviterName}{' '}
                invited you to join this workspace on SaMi.
              </p>


              <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">

                <RecordRow
                  icon={
                    Mail
                  }
                  label="Email"
                  value={
                    invitation.email
                  }
                />


                <RecordRow
                  icon={
                    UserRound
                  }
                  label="User type"
                  value={
                    invitation.memberType ===
                      'internal'
                      ? 'Internal User'
                      : 'Portal User'
                  }
                />


                <RecordRow
                  icon={
                    Clock3
                  }
                  label="Expires"
                  value={
                    formatExpiry(
                      invitation.expiresAt,
                    )
                  }
                />
              </div>


              {/* ROLES */}

              {invitation.roles.length >
                0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                    <p className="text-xs font-semibold">
                      Roles
                    </p>
                  </div>


                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {invitation.roles.map(
                      role => (
                        <span
                          key={
                            role.id
                          }
                          className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                        >
                          {role.name}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}


              {/* COMPANIES */}

              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                  <p className="text-xs font-semibold">
                    Companies
                  </p>
                </div>


                <div className="mt-2 space-y-1.5">
                  {invitation.companies.map(
                    company => (
                      <div
                        key={
                          company.id
                        }
                        className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs dark:bg-white/[0.05]"
                      >
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />

                        <span className="min-w-0 flex-1 truncate font-medium">
                          {company.name}
                        </span>

                        {company.isDefault && (
                          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                            Default
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>


              {invitation.message && (
                <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3 dark:border-blue-500/20 dark:bg-blue-500/[0.06]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Message
                  </p>

                  <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {invitation.message}
                  </p>
                </div>
              )}
            </aside>


            {/* ==================================================
                ACTION SIDE
                ================================================== */}

            <div className="p-5 sm:p-7">

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  {error}
                </div>
              )}


              {/* EXISTING ACCOUNT */}

              {accountExists ? (
                <ExistingAccountSection
                  invitation={
                    invitation
                  }

                  accountEmailVerified={
                    accountEmailVerified
                  }

                  signedInUser={
                    signedInUser
                  }

                  signedInEmailMatches={
                    signedInEmailMatches
                  }

                  loginHref={
                    loginHref
                  }

                  submitting={
                    submitting
                  }

                  signingOut={
                    signingOut
                  }

                  onAccept={() =>
                    void acceptInvitation()
                  }

                  onSignOut={() =>
                    void signOut()
                  }
                />
              ) : signedInUser ? (
                /* WRONG ACCOUNT SIGNED IN WHILE INVITED EMAIL IS NEW */

                <div>
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Different account detected
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Sign out first
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    This invitation is for{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {invitation.email}
                    </strong>
                    , but you are currently signed in as{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {signedInUser.email}
                    </strong>
                    .
                  </p>


                  <button
                    type="button"
                    disabled={
                      signingOut
                    }
                    onClick={() =>
                      void signOut()
                    }
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    {signingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}

                    Sign out
                  </button>
                </div>
              ) : (
                /* NEW ACCOUNT */

                <div>
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Create your SaMi account
                  </p>

                  <h2 className="mt-1 text-xl font-bold tracking-[-0.02em]">
                    Join the workspace
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Your account will use{' '}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {invitation.email}
                    </strong>
                    . This invitation joins the existing workspace; it does not create another business workspace.
                  </p>


                  <div className="mt-6 grid gap-4 sm:grid-cols-2">

                    <Field
                      label="First name"
                      value={
                        firstName
                      }
                      onChange={
                        setFirstName
                      }
                      autoComplete="given-name"
                    />


                    <Field
                      label="Last name"
                      value={
                        lastName
                      }
                      onChange={
                        setLastName
                      }
                      autoComplete="family-name"
                    />


                    <div className="sm:col-span-2">
                      <Field
                        label="Phone"
                        value={
                          phone
                        }
                        onChange={
                          setPhone
                        }
                        autoComplete="tel"
                        optional
                      />
                    </div>


                    <PasswordField
                      label="Password"
                      value={
                        password
                      }
                      onChange={
                        setPassword
                      }
                      show={
                        showPassword
                      }
                      onToggle={() =>
                        setShowPassword(
                          current =>
                            !current,
                        )
                      }
                    />


                    <PasswordField
                      label="Confirm password"
                      value={
                        confirmPassword
                      }
                      onChange={
                        setConfirmPassword
                      }
                      show={
                        showPassword
                      }
                      onToggle={() =>
                        setShowPassword(
                          current =>
                            !current,
                        )
                      }
                    />
                  </div>


                  {invitation.memberType ===
                    'internal' && (
                    <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <button
                        type="button"
                        onClick={() =>
                          setRememberMe(
                            current =>
                              !current,
                          )
                        }
                        className={[
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          rememberMe
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-white/20',
                        ].join(
                          ' ',
                        )}
                      >
                        {rememberMe && (
                          <Check className="h-3 w-3" />
                        )}
                      </button>

                      Keep me signed in
                    </label>
                  )}


                  <button
                    type="button"
                    disabled={
                      submitting
                    }
                    onClick={() =>
                      void acceptInvitation()
                    }
                    className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}

                    {submitting
                      ? 'Joining workspace…'
                      : 'Create account & join'}
                  </button>


                  <div className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-slate-400">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                    <span>
                      This secure invitation verifies the invited email address. You cannot replace it with another email during acceptance.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>


        <div className="mt-4 flex items-center justify-between px-1 text-[10px] text-slate-400">
          <span>
            SaMi — AI Powered Business Workspace
          </span>

          <Link
            href="/help"
            className="hover:text-blue-600 dark:hover:text-blue-400"
          >
            Help
          </Link>
        </div>
      </div>
    </main>
  );
}


/* ================================================================
   EXISTING ACCOUNT
   ================================================================ */

function ExistingAccountSection({
  invitation,
  accountEmailVerified,
  signedInUser,
  signedInEmailMatches,
  loginHref,
  submitting,
  signingOut,
  onAccept,
  onSignOut,
}: {
  invitation:
    InvitationPreview;

  accountEmailVerified:
    boolean;

  signedInUser:
    SignedInUser | null;

  signedInEmailMatches:
    boolean;

  loginHref:
    string;

  submitting:
    boolean;

  signingOut:
    boolean;

  onAccept:
    () => void;

  onSignOut:
    () => void;
}) {
  if (
    signedInUser &&
    !signedInEmailMatches
  ) {
    return (
      <div>
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          Account verification
        </p>

        <h2 className="mt-1 text-xl font-bold">
          Wrong SaMi account
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          This invitation belongs to{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {invitation.email}
          </strong>
          , but you are signed in as{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {signedInUser.email}
          </strong>
          .
        </p>


        <button
          type="button"
          disabled={
            signingOut
          }
          onClick={
            onSignOut
          }
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}

          Sign out
        </button>
      </div>
    );
  }


  if (
    !signedInUser
  ) {
    return (
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <KeyRound className="h-5 w-5" />
        </div>

        <p className="mt-5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          Existing SaMi account
        </p>

        <h2 className="mt-1 text-xl font-bold">
          Sign in to continue
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          A SaMi account already exists for{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {invitation.email}
          </strong>
          . Sign in with that account before joining this workspace.
        </p>


        {!accountEmailVerified && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            The existing account also needs email verification before it can sign in.
          </div>
        )}


        <Link
          href={
            loginHref
          }
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Sign in

          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }


  return (
    <div>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
        <ShieldCheck className="h-5 w-5" />
      </div>


      <p className="mt-5 text-xs font-semibold text-blue-600 dark:text-blue-400">
        Signed in
      </p>

      <h2 className="mt-1 text-xl font-bold">
        Join {invitation.workspaceName}
      </h2>


      <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 dark:border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
          <UserRound className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {signedInUser.fullName ||
              signedInUser.email}
          </p>

          <p className="truncate text-[10px] text-slate-400">
            {signedInUser.email}
          </p>
        </div>
      </div>


      <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Accepting adds this workspace to your existing SaMi account. It does not create another account.
      </p>


      <button
        type="button"
        disabled={
          submitting
        }
        onClick={
          onAccept
        }
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}

        {submitting
          ? 'Accepting…'
          : 'Accept invitation'}
      </button>
    </div>
  );
}


/* ================================================================
   RECORD ROW
   ================================================================ */

function RecordRow({
  icon:
    Icon,
  label,
  value,
}: {
  icon:
    typeof Mail;

  label:
    string;

  value:
    string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </p>

        <p className="mt-0.5 break-words text-xs font-medium text-slate-700 dark:text-slate-200">
          {value}
        </p>
      </div>
    </div>
  );
}


/* ================================================================
   FIELD
   ================================================================ */

function Field({
  label,
  value,
  onChange,
  autoComplete,
  optional =
    false,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;

  autoComplete:
    string;

  optional?:
    boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">
        {label}

        {optional && (
          <span className="ml-1 font-normal text-slate-400">
            optional
          </span>
        )}
      </span>

      <input
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        autoComplete={
          autoComplete
        }
        className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
      />
    </label>
  );
}


/* ================================================================
   PASSWORD
   ================================================================ */

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  label:
    string;

  value:
    string;

  onChange:
    (
      value:
        string,
    ) => void;

  show:
    boolean;

  onToggle:
    () => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold">
        {label}
      </span>

      <div className="relative mt-1.5">
        <input
          type={
            show
              ? 'text'
              : 'password'
          }
          value={
            value
          }
          onChange={
            event =>
              onChange(
                event.target.value,
              )
          }
          autoComplete="new-password"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:focus:border-blue-500/60"
        />

        <button
          type="button"
          onClick={
            onToggle
          }
          aria-label={
            show
              ? 'Hide password'
              : 'Show password'
          }
          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
        >
          {show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </label>
  );
}