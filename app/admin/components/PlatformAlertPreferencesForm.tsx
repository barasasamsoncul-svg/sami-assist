'use client';

import {
  Bell,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquareText,
  Save,
  ShieldAlert,
} from 'lucide-react';

import {
  useState,
} from 'react';


type Preferences = {
  emailEnabled:
    boolean;
  smsEnabled:
    boolean;
  smsPhoneE164:
    string | null;
  warningEmail:
    boolean;
  criticalEmail:
    boolean;
  warningSms:
    boolean;
  criticalSms:
    boolean;
  serviceAlertsEnabled:
    boolean;
  incidentAlertsEnabled:
    boolean;
  timezone:
    string;
};


type SmsProvider = {
  key?:
    string;
  name?:
    string;
  configured?:
    boolean;
};


function toggleClass(
  active:
    boolean,
) {
  return [
    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
    active
      ? 'bg-blue-600'
      : 'bg-zinc-200 dark:bg-zinc-800',
  ].join(
    ' ',
  );
}


function thumbClass(
  active:
    boolean,
) {
  return [
    'inline-block h-5 w-5 rounded-full bg-white shadow transition',
    active
      ? 'translate-x-5'
      : 'translate-x-0.5',
  ].join(
    ' ',
  );
}


export default function PlatformAlertPreferencesForm({
  initial,
  smsProvider,
}: {
  initial:
    Preferences;
  smsProvider:
    SmsProvider |
    null;
}) {
  const [
    state,
    setState,
  ] =
    useState<
      Preferences
    >(
      initial,
    );

  const [
    smsPhone,
    setSmsPhone,
  ] =
    useState(
      initial
        .smsPhoneE164 ||
      '',
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      {
        type:
          'success' |
          'error';
        text:
          string;
      } |
      null
    >(
      null,
    );


  function patch(
    update:
      Partial<Preferences>,
  ) {
    setState(
      current => ({
        ...current,
        ...update,
      }),
    );
  }


  async function save() {
    if (
      saving
    ) {
      return;
    }

    setSaving(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/admin/account/alert-preferences',
          {
            method:
              'PATCH',
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
                ...state,
                smsPhone,
              }),
          },
        );

      const data =
        await response
          .json()
          .catch(
            () => ({
              success:
                false,
            }),
          ) as {
            success?:
              boolean;
            error?:
              string;
            preferences?:
              Preferences;
          };

      if (
        !response.ok ||
        !data.success ||
        !data.preferences
      ) {
        throw new Error(
          data.error ||
          'SaMi could not update your alert preferences.',
        );
      }

      setState(
        data.preferences,
      );

      setSmsPhone(
        data.preferences
          .smsPhoneE164 ||
        '',
      );

      setMessage({
        type:
          'success',
        text:
          'Operational alert preferences saved.',
      });
    } catch (
      error
    ) {
      setMessage({
        type:
          'error',
        text:
          error instanceof
            Error
            ? error.message
            : 'SaMi could not update your alert preferences.',
      });
    } finally {
      setSaving(
        false,
      );
    }
  }


  const smsAvailable =
    smsProvider
      ?.configured ===
      true;

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Bell className="h-5 w-5" />
          </span>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              Platform Administrator
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              Operational Alerts
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Choose how SaMi should warn you about infrastructure renewals, quota pressure, service failures and critical platform incidents.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={[
              'mt-5 flex items-start gap-2 rounded-xl px-3 py-3 text-xs font-semibold',
              message.type ===
                'success'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
            ].join(
              ' ',
            )}
          >
            {message.type ===
              'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-black text-zinc-950 dark:text-white">
              Email alerts
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black">
                  Enable email alerts
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Use your verified Platform Admin email.
                </p>
              </div>

              <input
                type="checkbox"
                className="sr-only"
                checked={
                  state.emailEnabled
                }
                onChange={
                  event =>
                    patch({
                      emailEnabled:
                        event.target.checked,
                    })
                }
              />

              <span
                aria-hidden="true"
                className={
                  toggleClass(
                    state.emailEnabled,
                  )
                }
              >
                <span
                  className={
                    thumbClass(
                      state.emailEnabled,
                    )
                  }
                />
              </span>
            </label>

            <label className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-900">
              <span className="text-xs font-bold">
                Warning emails
              </span>

              <input
                type="checkbox"
                checked={
                  state.warningEmail
                }
                disabled={
                  !state.emailEnabled
                }
                onChange={
                  event =>
                    patch({
                      warningEmail:
                        event.target.checked,
                    })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold">
                Critical emails
              </span>

              <input
                type="checkbox"
                checked={
                  state.criticalEmail
                }
                disabled={
                  !state.emailEnabled
                }
                onChange={
                  event =>
                    patch({
                      criticalEmail:
                        event.target.checked,
                    })
                }
              />
            </label>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-black text-zinc-950 dark:text-white">
              SMS alerts
            </h2>
          </div>

          <p className="mt-2 text-[11px] leading-5 text-zinc-500">
            Provider: {smsProvider?.name || smsProvider?.key || 'Not configured'}.
          </p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                Alert phone
              </span>

              <input
                value={
                  smsPhone
                }
                onChange={
                  event =>
                    setSmsPhone(
                      event.target.value,
                    )
                }
                placeholder="+2547XXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />

              <p className="mt-1 text-[10px] text-zinc-500">
                Kenya numbers may be entered normally; SaMi stores the normalized E.164 form.
              </p>
            </label>

            <label className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-900">
              <div>
                <p className="text-xs font-black">
                  Enable SMS alerts
                </p>
                {!smsAvailable && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    SMS provider credentials are not complete yet.
                  </p>
                )}
              </div>

              <input
                type="checkbox"
                checked={
                  state.smsEnabled
                }
                onChange={
                  event =>
                    patch({
                      smsEnabled:
                        event.target.checked,
                    })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold">
                Warning SMS
              </span>

              <input
                type="checkbox"
                checked={
                  state.warningSms
                }
                disabled={
                  !state.smsEnabled
                }
                onChange={
                  event =>
                    patch({
                      warningSms:
                        event.target.checked,
                    })
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold">
                Critical SMS
              </span>

              <input
                type="checkbox"
                checked={
                  state.criticalSms
                }
                disabled={
                  !state.smsEnabled
                }
                onChange={
                  event =>
                    patch({
                      criticalSms:
                        event.target.checked,
                    })
                }
              />
            </label>
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-black text-zinc-950 dark:text-white">
          Alert categories
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/50">
            <input
              type="checkbox"
              className="mt-1"
              checked={
                state.serviceAlertsEnabled
              }
              onChange={
                event =>
                  patch({
                    serviceAlertsEnabled:
                      event.target.checked,
                  })
              }
            />

            <div>
              <p className="text-xs font-black">
                Infrastructure & subscription alerts
              </p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                Vercel, Neon, storage, domain, AI, email/SMS and future platform dependencies.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/50">
            <input
              type="checkbox"
              className="mt-1"
              checked={
                state.incidentAlertsEnabled
              }
              onChange={
                event =>
                  patch({
                    incidentAlertsEnabled:
                      event.target.checked,
                  })
              }
            />

            <div>
              <p className="text-xs font-black">
                Platform incident alerts
              </p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                Critical failures detected in SaMi runtime, workers, database operations and provider integrations.
              </p>
            </div>
          </label>
        </div>

        <label className="mt-5 block max-w-sm">
          <span className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
            Alert timezone
          </span>

          <select
            value={
              state.timezone
            }
            onChange={
              event =>
                patch({
                  timezone:
                    event.target.value,
                })
            }
            className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          >
            {[
              'Africa/Nairobi',
              'Africa/Kampala',
              'Africa/Dar_es_Salaam',
              'Africa/Kigali',
              'Africa/Lagos',
              'Africa/Johannesburg',
              'Europe/London',
              'America/New_York',
              'Asia/Dubai',
            ].map(
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
              ),
            )}
          </select>
        </label>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              void save()
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save alert preferences
          </button>
        </div>
      </section>
    </div>
  );
}
