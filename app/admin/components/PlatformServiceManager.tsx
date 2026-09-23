'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  AdminStatusPill,
} from '@/app/admin/components/AdminResourcePage';


type Service = {
  id:
    string;
  serviceKey:
    string;
  provider:
    string;
  serviceName:
    string;
  category:
    string;
  source:
    string;
  status:
    string;
  planName:
    string | null;
  billingCycle:
    string | null;
  amount:
    number | null;
  currency:
    string | null;
  billingPeriodStart:
    string | null;
  billingPeriodEnd:
    string | null;
  renewalAt:
    string | null;
  expiresAt:
    string | null;
  autoRenew:
    boolean;
  quotaUsed:
    number | null;
  quotaLimit:
    number | null;
  quotaUnit:
    string | null;
  quotaPercent:
    number | null;
  warningThresholdPercent:
    number;
  managementUrl:
    string | null;
  syncAdapter:
    string | null;
  syncStatus:
    string;
  lastSyncedAt:
    string | null;
  lastSyncError:
    string | null;
  metadata:
    Record<
      string,
      unknown
    >;
  updatedAt:
    string | null;
};


type EditableState = {
  planName:
    string;
  billingCycle:
    string;
  amount:
    string;
  currency:
    string;
  renewalAt:
    string;
  expiresAt:
    string;
  autoRenew:
    boolean;
  quotaLimit:
    string;
  quotaUnit:
    string;
  warningThresholdPercent:
    string;
  managementUrl:
    string;
};


function dateInput(
  value:
    string |
    null,
) {
  if (
    !value
  ) {
    return '';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}


function dateLabel(
  value:
    string |
    null,
) {
  if (
    !value
  ) {
    return '—';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date
    .toLocaleDateString(
      'en-KE',
      {
        dateStyle:
          'medium',
      },
    );
}


function moneyLabel(
  amount:
    number |
    null,
  currency:
    string |
    null,
) {
  if (
    amount ===
      null
  ) {
    return '—';
  }

  const code =
    currency ||
    'USD';

  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style:
          'currency',
        currency:
          code,
        maximumFractionDigits:
          2,
      },
    ).format(
      amount,
    );
  } catch {
    return `${code} ${amount.toFixed(
      2,
    )}`;
  }
}


function initialState(
  service:
    Service,
): EditableState {
  return {
    planName:
      service.planName ||
      '',
    billingCycle:
      service.billingCycle ||
      '',
    amount:
      service.amount ===
        null
        ? ''
        : String(
            service.amount,
          ),
    currency:
      service.currency ||
      '',
    renewalAt:
      dateInput(
        service.renewalAt,
      ),
    expiresAt:
      dateInput(
        service.expiresAt,
      ),
    autoRenew:
      service.autoRenew,
    quotaLimit:
      service.quotaLimit ===
        null
        ? ''
        : String(
            service.quotaLimit,
          ),
    quotaUnit:
      service.quotaUnit ||
      '',
    warningThresholdPercent:
      String(
        service.warningThresholdPercent ||
        80,
      ),
    managementUrl:
      service.managementUrl ||
      '',
  };
}


function relativeDue(
  value:
    string |
    null,
) {
  if (
    !value
  ) {
    return null;
  }

  const timestamp =
    new Date(
      value,
    ).getTime();

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return null;
  }

  const days =
    Math.ceil(
      (
        timestamp -
        Date.now()
      ) /
      (
        24 *
        60 *
        60 *
        1000
      ),
    );

  if (
    days <
      0
  ) {
    return `${Math.abs(
      days,
    )}d overdue`;
  }

  if (
    days ===
      0
  ) {
    return 'due today';
  }

  return `in ${days}d`;
}


export default function PlatformServiceManager({
  services,
  canManage,
}: {
  services:
    Service[];
  canManage:
    boolean;
}) {
  const router =
    useRouter();

  const [
    syncing,
    setSyncing,
  ] =
    useState(
      false,
    );

  const [
    savingKey,
    setSavingKey,
  ] =
    useState<
      string |
      null
    >(
      null,
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

  const [
    forms,
    setForms,
  ] =
    useState<
      Record<
        string,
        EditableState
      >
    >(
      () =>
        Object.fromEntries(
          services.map(
            service => [
              service.serviceKey,
              initialState(
                service,
              ),
            ],
          ),
        ),
    );


  function update(
    serviceKey:
      string,
    patch:
      Partial<EditableState>,
  ) {
    setForms(
      current => ({
        ...current,
        [serviceKey]: {
          ...current[
            serviceKey
          ],
          ...patch,
        },
      }),
    );
  }


  async function syncAll() {
    if (
      !canManage ||
      syncing
    ) {
      return;
    }

    setSyncing(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/admin/operations/services/sync',
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
          };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not sync platform services.',
        );
      }

      setMessage({
        type:
          'success',
        text:
          'Platform services synced successfully.',
      });

      router.refresh();
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
            : 'SaMi could not sync platform services.',
      });
    } finally {
      setSyncing(
        false,
      );
    }
  }


  async function save(
    service:
      Service,
  ) {
    if (
      !canManage ||
      savingKey
    ) {
      return;
    }

    const form =
      forms[
        service.serviceKey
      ];

    if (
      !form
    ) {
      return;
    }

    setSavingKey(
      service.serviceKey,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/admin/operations/services/${encodeURIComponent(
            service.serviceKey,
          )}`,
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
                planName:
                  form.planName,
                billingCycle:
                  form.billingCycle ||
                  null,
                amount:
                  form.amount,
                currency:
                  form.currency,
                renewalAt:
                  form.renewalAt,
                expiresAt:
                  form.expiresAt,
                autoRenew:
                  form.autoRenew,
                quotaLimit:
                  form.quotaLimit,
                quotaUnit:
                  form.quotaUnit,
                warningThresholdPercent:
                  form.warningThresholdPercent,
                managementUrl:
                  form.managementUrl,
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
          };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not update this platform service.',
        );
      }

      setMessage({
        type:
          'success',
        text:
          `${service.serviceName} updated.`,
      });

      router.refresh();
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
            : 'SaMi could not update this platform service.',
      });
    } finally {
      setSavingKey(
        null,
      );
    }
  }


  return (
    <div className="space-y-5">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              Operations · Infrastructure
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              Services & Costs
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Track the external services required to keep SaMi online. Provider APIs update what they expose; manual contract fields cover registrar, hosting or other services that do not expose billing data.
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              disabled={
                syncing
              }
              onClick={() =>
                void syncAll()
              }
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-[11px] font-black text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </button>
          )}
        </div>

        {message && (
          <div
            className={[
              'mt-4 flex items-start gap-2 rounded-xl px-3 py-3 text-xs font-semibold',
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
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {services.map(
          service => {
            const form =
              forms[
                service.serviceKey
              ] ||
              initialState(
                service,
              );

            const due =
              relativeDue(
                service.renewalAt ||
                service.expiresAt,
              );

            return (
              <section
                key={
                  service.serviceKey
                }
                className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-black text-zinc-950 dark:text-white">
                        {service.serviceName}
                      </h2>

                      <AdminStatusPill
                        value={
                          service.status
                        }
                      />
                    </div>

                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                      {service.provider} · {service.category} · {service.source}
                    </p>
                  </div>

                  {service.managementUrl && (
                    <a
                      href={
                        service.managementUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-white"
                      aria-label={`Open ${service.serviceName} provider dashboard`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
                    <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                      Plan
                    </p>
                    <p className="mt-1 truncate text-xs font-black">
                      {service.planName || 'Unknown'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
                    <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                      Cost
                    </p>
                    <p className="mt-1 truncate text-xs font-black">
                      {moneyLabel(
                        service.amount,
                        service.currency,
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
                    <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                      Renewal
                    </p>
                    <p className="mt-1 text-xs font-black">
                      {dateLabel(
                        service.renewalAt ||
                        service.expiresAt,
                      )}
                    </p>
                    {due && (
                      <p className="mt-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                        {due}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
                    <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                      Sync
                    </p>
                    <p className="mt-1 text-xs font-black capitalize">
                      {service.syncStatus.replace(
                        /_/g,
                        ' ',
                      )}
                    </p>
                  </div>
                </div>

                {service.quotaPercent !==
                  null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3 text-[10px] font-bold">
                      <span className="text-zinc-500">
                        Usage
                      </span>
                      <span>
                        {service.quotaPercent.toFixed(
                          1,
                        )}%
                      </span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{
                          width:
                            `${Math.min(
                              100,
                              Math.max(
                                0,
                                service.quotaPercent,
                              ),
                            )}%`,
                        }}
                      />
                    </div>

                    <p className="mt-2 text-[10px] text-zinc-500">
                      {service.quotaUsed?.toLocaleString(
                        'en-KE',
                      )} / {service.quotaLimit?.toLocaleString(
                        'en-KE',
                      )} {service.quotaUnit || ''}
                    </p>
                  </div>
                )}

                {service.lastSyncError && (
                  <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] leading-5 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    {service.lastSyncError}
                  </div>
                )}

                <details className="mt-4">
                  <summary className="cursor-pointer text-[11px] font-black text-zinc-600 dark:text-zinc-300">
                    Contract & alert settings
                  </summary>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Plan name
                      <input
                        value={
                          form.planName
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                planName:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none focus:border-blue-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Billing cycle
                      <select
                        value={
                          form.billingCycle
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                billingCycle:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      >
                        <option value="">
                          Unknown
                        </option>
                        {[
                          'monthly',
                          'annual',
                          'usage',
                          'prepaid',
                          'free',
                          'custom',
                        ].map(
                          value => (
                            <option
                              key={
                                value
                              }
                              value={
                                value
                              }
                            >
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          form.amount
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                amount:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Currency
                      <input
                        maxLength={
                          3
                        }
                        value={
                          form.currency
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                currency:
                                  event.target.value.toUpperCase(),
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Renewal date
                      <input
                        type="date"
                        value={
                          form.renewalAt
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                renewalAt:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Expiry date
                      <input
                        type="date"
                        value={
                          form.expiresAt
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                expiresAt:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Quota limit
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          form.quotaLimit
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                quotaLimit:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Quota unit
                      <input
                        value={
                          form.quotaUnit
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                quotaUnit:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400">
                      Warning at %
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={
                          form.warningThresholdPercent
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                warningThresholdPercent:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="text-[10px] font-black uppercase tracking-wide text-zinc-400 sm:col-span-2">
                      Provider management URL
                      <input
                        value={
                          form.managementUrl
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                managementUrl:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold normal-case tracking-normal text-zinc-950 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-300 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={
                          form.autoRenew
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          event =>
                            update(
                              service.serviceKey,
                              {
                                autoRenew:
                                  event.target.checked,
                              },
                            )
                        }
                      />
                      Auto-renew enabled at provider
                    </label>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      disabled={
                        savingKey !==
                          null
                      }
                      onClick={() =>
                        void save(
                          service,
                        )
                      }
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white transition hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingKey ===
                        service.serviceKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save contract settings
                    </button>
                  )}
                </details>
              </section>
            );
          },
        )}
      </div>
    </div>
  );
}
