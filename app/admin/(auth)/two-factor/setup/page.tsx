'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

/* ============================================================
   TYPES
   ============================================================ */

type SetupResponse = {
  success?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  secret?:
    string;

  otpauthUrl?:
    string;

  expiresAt?:
    string;
};

type ConfirmResponse = {
  success?:
    boolean;

  authenticated?:
    boolean;

  code?:
    string;

  error?:
    string;

  message?:
    string;

  recoveryCodes?:
    string[];

  next?:
    string;
};

/* ============================================================
   PAGE
   ============================================================ */

export default function AdminTwoFactorSetupPage() {
  const router =
    useRouter();

  const [
    loadingSetup,
    setLoadingSetup,
  ] =
    useState(
      true
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false
    );

  const [
    secret,
    setSecret,
  ] =
    useState(
      ''
    );

  const [
    otpauthUrl,
    setOtpAuthUrl,
  ] =
    useState(
      ''
    );

  const [
    code,
    setCode,
  ] =
    useState(
      ''
    );

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    copied,
    setCopied,
  ] =
    useState(
      false
    );

  const [
    recoveryCodes,
    setRecoveryCodes,
  ] =
    useState<
      string[]
    >(
      []
    );

  const [
    recoveryAcknowledged,
    setRecoveryAcknowledged,
  ] =
    useState(
      false
    );

  /* ==========================================================
     DISPLAY SECRET
     ========================================================== */

  const formattedSecret =
    useMemo(
      () =>
        secret
          .replace(
            /\s+/g,
            ''
          )
          .match(
            /.{1,4}/g
          )
          ?.join(
            ' '
          ) ??
        secret,
      [
        secret,
      ]
    );

  /* ==========================================================
     START SETUP
     ========================================================== */

  useEffect(() => {
    let cancelled =
      false;

    async function startSetup() {
      try {
        setLoadingSetup(
          true
        );

        setError(
          null
        );

        const response =
          await fetch(
            '/api/admin/auth/two-factor/setup/start',
            {
              method:
                'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/json',
              },
            }
          );

        const data =
          (await response.json()) as
            SetupResponse;

        if (
          cancelled
        ) {
          return;
        }

        if (
          !response.ok ||
          !data.success ||
          !data.secret ||
          !data.otpauthUrl
        ) {
          setError(
            data.error ||
              data.message ||
              'SaMi could not start administrator two-factor setup.'
          );

          return;
        }

        setSecret(
          data.secret
        );

        setOtpAuthUrl(
          data.otpauthUrl
        );
      } catch (
        error
      ) {
        console.error(
          '[Admin 2FA Setup]',
          error
        );

        if (
          !cancelled
        ) {
          setError(
            'SaMi could not connect to the administrator authentication service.'
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoadingSetup(
            false
          );
        }
      }
    }

    void startSetup();

    return () => {
      cancelled =
        true;
    };
  }, []);

  /* ==========================================================
     COPY SETUP KEY
     ========================================================== */

  async function copySecret() {
    if (
      !secret
    ) {
      return;
    }

    try {
      await navigator
        .clipboard
        .writeText(
          secret
        );

      setCopied(
        true
      );

      window.setTimeout(
        () => {
          setCopied(
            false
          );
        },
        2000
      );
    } catch {
      setError(
        'Could not copy the setup key. You can select and copy it manually.'
      );
    }
  }

  /* ==========================================================
     CONFIRM
     ========================================================== */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting
    ) {
      return;
    }

    const normalizedCode =
      code
        .replace(
          /\D/g,
          ''
        )
        .slice(
          0,
          6
        );

    if (
      normalizedCode.length !==
      6
    ) {
      setError(
        'Enter the 6-digit code shown in your authenticator app.'
      );

      return;
    }

    setSubmitting(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          '/api/admin/auth/two-factor/setup/confirm',
          {
            method:
              'POST',

            credentials:
              'include',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                code:
                  normalizedCode,
              }),
          }
        );

      const data =
        (await response.json()) as
          ConfirmResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ||
            data.message ||
            'The authenticator code could not be verified.'
        );

        return;
      }

      const codes =
        Array.isArray(
          data.recoveryCodes
        )
          ? data.recoveryCodes
          : [];

      if (
        codes.length >
        0
      ) {
        setRecoveryCodes(
          codes
        );

        return;
      }

      router.replace(
        data.next ||
          '/admin'
      );

      router.refresh();
    } catch (
      error
    ) {
      console.error(
        '[Admin 2FA Setup Confirmation]',
        error
      );

      setError(
        'SaMi could not complete administrator two-factor setup.'
      );
    } finally {
      setSubmitting(
        false
      );
    }
  }

  /* ==========================================================
     FINISH AFTER RECOVERY CODES
     ========================================================== */

  function finishSetup() {
    if (
      !recoveryAcknowledged
    ) {
      setError(
        'Confirm that you have safely stored your recovery codes.'
      );

      return;
    }

    sessionStorage.removeItem(
      'sami_admin_login_email'
    );

    router.replace(
      '/admin'
    );

    router.refresh();
  }

  /* ==========================================================
     RECOVERY CODE SCREEN
     ========================================================== */

  if (
    recoveryCodes.length >
    0
  ) {
    return (
      <main
        className="
          flex
          min-h-screen
          items-center
          justify-center
          bg-zinc-950
          px-4
          py-10
          text-white
        "
      >
        <section
          className="
            w-full
            max-w-lg
            rounded-3xl
            border
            border-white/10
            bg-white/[0.055]
            p-6
            shadow-2xl
            shadow-black/30
            backdrop-blur-xl
            sm:p-8
          "
        >
          <div
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-2xl
              bg-emerald-500/10
              text-emerald-300
            "
          >
            <CheckCircle2
              className="
                h-6
                w-6
              "
            />
          </div>

          <h1
            className="
              mt-5
              text-2xl
              font-semibold
            "
          >
            Two-factor authentication enabled
          </h1>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-zinc-400
            "
          >
            Store these recovery codes somewhere secure.
            Each code can be used only once if you lose
            access to your authenticator.
          </p>

          <div
            className="
              mt-6
              grid
              grid-cols-1
              gap-2
              rounded-2xl
              border
              border-white/10
              bg-black/20
              p-4
              sm:grid-cols-2
            "
          >
            {recoveryCodes.map(
              (
                recoveryCode
              ) => (
                <code
                  key={
                    recoveryCode
                  }
                  className="
                    rounded-lg
                    bg-white/[0.04]
                    px-3
                    py-2
                    text-center
                    text-sm
                    tracking-wide
                    text-zinc-200
                  "
                >
                  {recoveryCode}
                </code>
              )
            )}
          </div>

          <label
            className="
              mt-6
              flex
              cursor-pointer
              items-start
              gap-3
              text-sm
              text-zinc-300
            "
          >
            <input
              type="checkbox"
              checked={
                recoveryAcknowledged
              }
              onChange={(
                event
              ) =>
                setRecoveryAcknowledged(
                  event.target
                    .checked
                )
              }
              className="
                mt-1
                h-4
                w-4
                accent-white
              "
            />

            <span>
              I have stored my recovery codes securely
              and understand that SaMi will not show
              these exact codes again.
            </span>
          </label>

          {error && (
            <div
              className="
                mt-5
                flex
                gap-3
                rounded-xl
                border
                border-red-500/20
                bg-red-500/10
                px-4
                py-3
                text-sm
                text-red-200
              "
            >
              <AlertCircle
                className="
                  mt-0.5
                  h-5
                  w-5
                  shrink-0
                "
              />

              {error}
            </div>
          )}

          <button
            type="button"
            onClick={
              finishSetup
            }
            disabled={
              !recoveryAcknowledged
            }
            className="
              mt-6
              flex
              h-12
              w-full
              items-center
              justify-center
              gap-2
              rounded-xl
              bg-white
              text-sm
              font-semibold
              text-zinc-950
              transition
              hover:bg-zinc-200
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            Continue to SaMi Admin

            <Check
              className="
                h-4
                w-4
              "
            />
          </button>
        </section>
      </main>
    );
  }

  /* ==========================================================
     SETUP SCREEN
     ========================================================== */

  return (
    <main
      className="
        relative
        flex
        min-h-screen
        items-center
        justify-center
        overflow-hidden
        bg-zinc-950
        px-4
        py-10
        text-white
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          inset-0
        "
      >
        <div
          className="
            absolute
            left-1/2
            top-[-18rem]
            h-[36rem]
            w-[36rem]
            -translate-x-1/2
            rounded-full
            bg-white/[0.04]
            blur-3xl
          "
        />
      </div>

      <section
        className="
          relative
          z-10
          w-full
          max-w-lg
        "
      >
        <header
          className="
            mb-8
            text-center
          "
        >
          <div
            className="
              mx-auto
              flex
              h-14
              w-14
              items-center
              justify-center
              rounded-2xl
              bg-white
              text-zinc-950
            "
          >
            <ShieldCheck
              className="
                h-7
                w-7
              "
            />
          </div>

          <h1
            className="
              mt-5
              text-xl
              font-semibold
            "
          >
            SaMi Admin
          </h1>

          <p
            className="
              mt-2
              text-sm
              text-zinc-400
            "
          >
            Secure administrator enrollment
          </p>
        </header>

        <div
          className="
            rounded-3xl
            border
            border-white/10
            bg-white/[0.055]
            p-6
            shadow-2xl
            shadow-black/30
            backdrop-blur-xl
            sm:p-8
          "
        >
          <div
            className="
              flex
              h-11
              w-11
              items-center
              justify-center
              rounded-xl
              bg-white/[0.07]
            "
          >
            <KeyRound
              className="
                h-5
                w-5
              "
            />
          </div>

          <h2
            className="
              mt-5
              text-2xl
              font-semibold
            "
          >
            Set up two-factor authentication
          </h2>

          <p
            className="
              mt-2
              text-sm
              leading-6
              text-zinc-400
            "
          >
            SaMi requires additional protection for
            administrator accounts. Add this account
            to your authenticator app, then enter the
            generated 6-digit code.
          </p>

          {loadingSetup ? (
            <div
              className="
                mt-8
                flex
                items-center
                justify-center
                gap-3
                py-8
                text-sm
                text-zinc-400
              "
            >
              <Loader2
                className="
                  h-5
                  w-5
                  animate-spin
                "
              />

              Preparing secure authenticator setup...
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="
                    mt-6
                    flex
                    gap-3
                    rounded-xl
                    border
                    border-red-500/20
                    bg-red-500/10
                    px-4
                    py-3
                    text-sm
                    text-red-200
                  "
                >
                  <AlertCircle
                    className="
                      mt-0.5
                      h-5
                      w-5
                      shrink-0
                    "
                  />

                  {error}
                </div>
              )}

              {secret && (
                <>
                  <div
                    className="
                      mt-7
                      rounded-2xl
                      border
                      border-white/10
                      bg-black/20
                      p-5
                    "
                  >
                    <p
                      className="
                        text-xs
                        font-semibold
                        uppercase
                        tracking-[0.15em]
                        text-zinc-500
                      "
                    >
                      Authenticator setup key
                    </p>

                    <div
                      className="
                        mt-3
                        flex
                        items-center
                        gap-3
                      "
                    >
                      <code
                        className="
                          min-w-0
                          flex-1
                          break-all
                          text-sm
                          font-semibold
                          tracking-wider
                          text-zinc-100
                        "
                      >
                        {formattedSecret}
                      </code>

                      <button
                        type="button"
                        onClick={
                          copySecret
                        }
                        className="
                          flex
                          h-10
                          w-10
                          shrink-0
                          items-center
                          justify-center
                          rounded-lg
                          border
                          border-white/10
                          text-zinc-400
                          transition
                          hover:bg-white/[0.06]
                          hover:text-white
                        "
                        aria-label="Copy setup key"
                      >
                        {copied ? (
                          <Check
                            className="
                              h-4
                              w-4
                            "
                          />
                        ) : (
                          <Clipboard
                            className="
                              h-4
                              w-4
                            "
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  <div
                    className="
                      mt-5
                      rounded-2xl
                      border
                      border-white/10
                      bg-white/[0.03]
                      p-5
                    "
                  >
                    <p
                      className="
                        text-sm
                        font-medium
                        text-zinc-200
                      "
                    >
                      In your authenticator app:
                    </p>

                    <ol
                      className="
                        mt-3
                        space-y-2
                        text-sm
                        leading-6
                        text-zinc-400
                      "
                    >
                      <li>
                        1. Choose Add account.
                      </li>

                      <li>
                        2. Choose Enter setup key / Manual setup.
                      </li>

                      <li>
                        3. Enter the key shown above.
                      </li>

                      <li>
                        4. Select time-based authentication.
                      </li>

                      <li>
                        5. Enter the 6-digit code below.
                      </li>
                    </ol>
                  </div>

                  <form
                    onSubmit={
                      handleSubmit
                    }
                    className="
                      mt-6
                    "
                  >
                    <label
                      htmlFor="admin-setup-code"
                      className="
                        mb-2
                        block
                        text-sm
                        font-medium
                        text-zinc-300
                      "
                    >
                      6-digit authenticator code
                    </label>

                    <input
                      id="admin-setup-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={
                        code
                      }
                      onChange={(
                        event
                      ) =>
                        setCode(
                          event.target
                            .value
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
                      disabled={
                        submitting
                      }
                      maxLength={
                        6
                      }
                      placeholder="000000"
                      className="
                        h-14
                        w-full
                        rounded-xl
                        border
                        border-white/10
                        bg-black/20
                        px-4
                        text-center
                        text-2xl
                        font-semibold
                        tracking-[0.45em]
                        outline-none
                        transition
                        placeholder:text-zinc-700
                        focus:border-white/25
                        focus:ring-4
                        focus:ring-white/[0.04]
                      "
                    />

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        code.length !==
                          6
                      }
                      className="
                        mt-5
                        flex
                        h-12
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        bg-white
                        text-sm
                        font-semibold
                        text-zinc-950
                        transition
                        hover:bg-zinc-200
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      {submitting ? (
                        <>
                          <Loader2
                            className="
                              h-4
                              w-4
                              animate-spin
                            "
                          />

                          Verifying...
                        </>
                      ) : (
                        <>
                          <ShieldCheck
                            className="
                              h-4
                              w-4
                            "
                          />

                          Enable and continue
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}
            </>
          )}

          {/*
           * Keep the URI in component state because later we can
           * render it as a QR code without changing the API.
           */}
          <span
            className="
              hidden
            "
            aria-hidden="true"
          >
            {otpauthUrl}
          </span>
        </div>
      </section>
    </main>
  );
}