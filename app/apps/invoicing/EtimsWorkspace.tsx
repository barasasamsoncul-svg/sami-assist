'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import {
  BadgeCheck,
  CircleAlert,
  CloudCog,
  FileCheck2,
  Link2,
  LoaderCircle,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type EtimsTab =
  | 'overview'
  | 'setup'
  | 'mappings'
  | 'fiscalization';


type EtimsData = {
  company: {
    id: string;
    name: string;
  };
  capabilities: {
    canConfigure: boolean;
    canSubmit: boolean;
  };
  endpointConfigured: boolean;
  productionNotice: string;
  profile: null | {
    solutionType: string;
    environment: string;
    taxpayerPin: string;
    branchId: string;
    deviceSerialNumber: string;
    status: string;
    defaultPaymentTypeCode: string;
    kraSdcId: string | null;
    kraMrcNo: string | null;
    lastDeviceInitAt: string | null;
    lastReferenceSyncAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  };
  readiness: {
    profileConfigured: boolean;
    endpointConfigured: boolean;
    deviceActivated: boolean;
    itemMappings: number;
    taxMappings: number;
    referencesSynced: boolean;
  };
  itemMappings: Array<{
    id: string;
    catalogItemId: string;
    itemName: string;
    sku: string | null;
    itemClassificationCode: string;
    itemCode: string;
    originCountryCode: string;
    packagingUnitCode: string;
    quantityUnitCode: string;
    isActive: boolean;
    updatedAt: string;
  }>;
  taxMappings: Array<{
    id: string;
    taxRateId: string | null;
    taxGroupId: string | null;
    sourceName: string;
    taxTypeCode: string;
    kraRate: number;
    isActive: boolean;
    updatedAt: string;
  }>;
  referenceCache: Array<{
    referenceType: string;
    externalKey: string;
    payload: unknown;
    sourceUpdatedAt: string | null;
    syncedAt: string;
  }>;
  submissions: Array<{
    id: string;
    invoiceId: string | null;
    creditNoteId: string | null;
    documentNumber: string;
    submissionType: string;
    solutionType: string;
    environment: string;
    transactionInvoiceNo: number;
    status: string;
    attemptCount: number;
    lastAttemptAt: string | null;
    nextRetryAt: string | null;
    resultCode: string | null;
    resultMessage: string | null;
    receiptNo: number | null;
    sdcId: string | null;
    mrcNo: string | null;
    receiptPublicationDate: string | null;
    receiptSignature: string | null;
    succeededAt: string | null;
    createdAt: string;
  }>;
  eligibleInvoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    status: string;
    currency: string;
    totalAmount: number;
    customerName: string;
    customerPin: string | null;
    etimsStatus: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    issueDate: string;
    status: string;
    currency: string;
    totalAmount: number;
    invoiceId: string;
    invoiceNumber: string;
    etimsStatus: string | null;
  }>;
};


const inputClass =
  'mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs text-[var(--sami-text)] outline-none focus:border-blue-500';

const buttonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950';


function money(
  value:
    number,
) {
  return new Intl
    .NumberFormat(
      'en-KE',
      {
        style:
          'currency',
        currency:
          'KES',
        maximumFractionDigits:
          2,
      },
    )
    .format(
      value,
    );
}


function dateTime(
  value:
    string |
    null,
) {
  if (!value) {
    return '—';
  }

  const parsed =
    new Date(
      value,
    );

  return Number.isNaN(
    parsed.getTime(),
  )
    ? value
    : parsed
        .toLocaleString(
          'en-KE',
        );
}


function statusClass(
  status:
    string,
) {
  if (
    [
      'succeeded',
      'activated',
    ].includes(
      status,
    )
  ) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20';
  }

  if (
    [
      'failed',
      'error',
    ].includes(
      status,
    )
  ) {
    return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20';
  }

  if (
    [
      'retryable',
      'submitting',
    ].includes(
      status,
    )
  ) {
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10';
}


function StatusPill({
  value,
}: {
  value:
    string;
}) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset',
        statusClass(
          value,
        ),
      ].join(
        ' ',
      )}
    >
      {value.replaceAll(
        '_',
        ' ',
      )}
    </span>
  );
}


function Empty({
  text,
}: {
  text:
    string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 py-8 text-center text-xs text-slate-500">
      {text}
    </div>
  );
}


export default function EtimsWorkspace({
  invoicingData,
}: {
  invoicingData:
    InvoicingWorkspaceData;
}) {
  const [
    data,
    setData,
  ] =
    useState<EtimsData | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    tab,
    setTab,
  ] =
    useState<EtimsTab>(
      'overview',
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    showWarning,
  } =
    useSaMiOverlay();

  const load =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const response =
            await fetch(
              '/api/apps/invoicing/etims',
              {
                cache:
                  'no-store',
                credentials:
                  'same-origin',
              },
            );

          const body =
            await response
              .json()
              .catch(
                () => ({}),
              ) as {
                success?:
                  boolean;
                error?:
                  string;
                data?:
                  EtimsData;
              };

          if (
            !response.ok ||
            body.success !==
              true ||
            !body.data
          ) {
            throw new Error(
              body.error ||
              'SaMi could not load eTIMS.',
            );
          }

          setData(
            body.data,
          );
        } catch (
          error
        ) {
          showError(
            'eTIMS unavailable',
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load eTIMS.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        showError,
      ],
    );

  useEffect(
    () => {
      void load();
    },
    [
      load,
    ],
  );

  async function run(
    action:
      string,
    payload:
      Record<string, unknown>,
    success:
      string,
  ) {
    if (busy) {
      showWarning(
        'Action in progress',
        'Wait for the current eTIMS request to finish.',
      );
      return false;
    }

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/invoicing/etims',
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
                action,
                ...payload,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'eTIMS action failed.',
        );
      }

      showSuccess(
        'eTIMS updated',
        success,
      );

      await load();

      return true;
    } catch (
      error
    ) {
      showError(
        'eTIMS action failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not complete the eTIMS action.',
      );

      return false;
    } finally {
      setBusy(
        false,
      );
    }
  }


  const itemMappingByCatalog =
    useMemo(
      () =>
        new Map(
          (
            data
              ?.itemMappings ||
            []
          ).map(
            mapping => [
              mapping
                .catalogItemId,
              mapping,
            ],
          ),
        ),
      [
        data
          ?.itemMappings,
      ],
    );

  const taxMappingKeys =
    useMemo(
      () =>
        new Set(
          (
            data
              ?.taxMappings ||
            []
          ).map(
            mapping =>
              mapping
                .taxRateId
                ? 'rate:' +
                  mapping.taxRateId
                : 'group:' +
                  mapping.taxGroupId,
          ),
        ),
      [
        data
          ?.taxMappings,
      ],
    );


  if (
    loading &&
    !data
  ) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]">
        <LoaderCircle className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty text="eTIMS data is not available." />
    );
  }

  const readiness =
    [
      {
        label:
          'Company profile',
        ready:
          data.readiness
            .profileConfigured,
      },
      {
        label:
          'Server endpoint',
        ready:
          data.readiness
            .endpointConfigured,
      },
      {
        label:
          'Device activation',
        ready:
          data.readiness
            .deviceActivated,
      },
      {
        label:
          'KRA reference data',
        ready:
          data.readiness
            .referencesSynced,
      },
      {
        label:
          'Item mappings',
        ready:
          data.readiness
            .itemMappings >
          0,
      },
      {
        label:
          'Tax mappings',
        ready:
          data.readiness
            .taxMappings >
          0,
      },
    ];

  const readyCount =
    readiness.filter(
      item =>
        item.ready,
    ).length;

  return (
    <>
      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />

      <div className="space-y-4">
        <section className="overflow-hidden rounded-[24px] border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-sm">
          <div className="border-b border-[var(--sami-border)] bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-4 text-white sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-300" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                    Kenya fiscalization
                  </p>
                </div>
                <h2 className="mt-2 text-xl font-black tracking-[-0.03em] sm:text-2xl">
                  KRA eTIMS control center
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
                  Configure OSCU/VSCU, synchronize KRA reference data, map SaMi items and taxes, and retain an auditable fiscalization history.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {
                  data.profile
                    ? (
                      <StatusPill
                        value={
                          data
                            .profile
                            .status
                        }
                      />
                    )
                    : (
                      <StatusPill value="not configured" />
                    )
                }

                <button
                  type="button"
                  onClick={
                    () =>
                      void load()
                  }
                  disabled={
                    loading ||
                    busy
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white disabled:opacity-50"
                  aria-label="Refresh eTIMS"
                >
                  <RefreshCw
                    className={[
                      'h-4 w-4',
                      loading
                        ? 'animate-spin'
                        : '',
                    ].join(
                      ' ',
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-[var(--sami-border)] px-3 sm:px-5">
            <div className="flex min-w-max gap-1 py-2">
              {
                [
                  [
                    'overview',
                    'Overview',
                  ],
                  [
                    'setup',
                    'Setup',
                  ],
                  [
                    'mappings',
                    'Mappings',
                  ],
                  [
                    'fiscalization',
                    'Fiscalization',
                  ],
                ].map(
                  entry => {
                    const key =
                      entry[0] as
                        EtimsTab;

                    return (
                      <button
                        key={
                          key
                        }
                        type="button"
                        onClick={
                          () =>
                            setTab(
                              key,
                            )
                        }
                        className={[
                          'h-9 rounded-xl px-3 text-xs font-black transition',
                          tab ===
                            key
                            ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                            : 'text-slate-500 hover:bg-[var(--sami-surface-soft)] hover:text-[var(--sami-text)]',
                        ].join(
                          ' ',
                        )}
                      >
                        {
                          entry[1]
                        }
                      </button>
                    );
                  },
                )
              }
            </div>
          </div>
        </section>

        {
          tab ===
            'overview' &&
          (
            <div className="space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Readiness
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {
                      readyCount
                    }/{
                      readiness.length
                    }
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    technical controls ready
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Fiscalized
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {
                      data.submissions
                        .filter(
                          row =>
                            row.status ===
                              'succeeded',
                        )
                        .length
                    }
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    successful documents
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Item mappings
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {
                      data
                        .readiness
                        .itemMappings
                    }
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    catalog items mapped
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Tax mappings
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {
                      data
                        .readiness
                        .taxMappings
                    }
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    SaMi tax sources mapped
                  </p>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                  <h3 className="text-sm font-black">
                    Integration readiness
                  </h3>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {
                      readiness.map(
                        item => (
                          <div
                            key={
                              item.label
                            }
                            className="flex items-center gap-3 rounded-xl bg-[var(--sami-surface-soft)] px-3 py-3"
                          >
                            {
                              item.ready
                                ? (
                                  <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                                )
                                : (
                                  <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                                )
                            }
                            <span className="text-xs font-bold">
                              {
                                item.label
                              }
                            </span>
                          </div>
                        ),
                      )
                    }
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100 sm:p-5">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-black">
                        Production certification
                      </h3>
                      <p className="mt-2 text-xs leading-5">
                        {
                          data
                            .productionNotice
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {
                data.profile
                  ?.lastErrorMessage &&
                (
                  <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                    <p className="text-xs font-black text-rose-700 dark:text-rose-300">
                      Last eTIMS error
                    </p>
                    <p className="mt-1 text-xs leading-5 text-rose-700/90 dark:text-rose-200">
                      {
                        data
                          .profile
                          .lastErrorCode
                      } — {
                        data
                          .profile
                          .lastErrorMessage
                      }
                    </p>
                  </section>
                )
              }
            </div>
          )
        }

        {
          tab ===
            'setup' &&
          (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-black">
                    eTIMS profile
                  </h3>
                </div>

                {
                  data.capabilities
                    .canConfigure
                    ? (
                      <form
                        className="mt-4 grid gap-3 sm:grid-cols-2"
                        onSubmit={
                          async (
                            event:
                              FormEvent<HTMLFormElement>,
                          ) => {
                            event.preventDefault();

                            const form =
                              new FormData(
                                event.currentTarget,
                              );

                            const saved =
                              await run(
                                'save_profile',
                                {
                                  solutionType:
                                    form.get(
                                      'solutionType',
                                    ),
                                  environment:
                                    form.get(
                                      'environment',
                                    ),
                                  taxpayerPin:
                                    form.get(
                                      'taxpayerPin',
                                    ),
                                  branchId:
                                    form.get(
                                      'branchId',
                                    ),
                                  deviceSerialNumber:
                                    form.get(
                                      'deviceSerialNumber',
                                    ),
                                  defaultPaymentTypeCode:
                                    form.get(
                                      'defaultPaymentTypeCode',
                                    ),
                                },
                                'eTIMS company profile saved.',
                              );

                            if (saved) {
                              setTab(
                                'setup',
                              );
                            }
                          }
                        }
                      >
                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Solution
                          </span>
                          <select
                            name="solutionType"
                            className={
                              inputClass
                            }
                            defaultValue={
                              data
                                .profile
                                ?.solutionType ||
                              'oscu'
                            }
                          >
                            <option value="oscu">
                              OSCU — always online
                            </option>
                            <option value="vscu">
                              VSCU — virtual bridge
                            </option>
                          </select>
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Environment
                          </span>
                          <select
                            name="environment"
                            className={
                              inputClass
                            }
                            defaultValue={
                              data
                                .profile
                                ?.environment ||
                              'sandbox'
                            }
                          >
                            <option value="sandbox">
                              Sandbox
                            </option>
                            <option value="production">
                              Production
                            </option>
                          </select>
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Taxpayer KRA PIN
                          </span>
                          <input
                            name="taxpayerPin"
                            className={
                              inputClass
                            }
                            maxLength={11}
                            required
                            defaultValue={
                              data
                                .profile
                                ?.taxpayerPin ||
                              ''
                            }
                            placeholder="P000000000X"
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Branch ID
                          </span>
                          <input
                            name="branchId"
                            className={
                              inputClass
                            }
                            required
                            defaultValue={
                              data
                                .profile
                                ?.branchId ||
                              '00'
                            }
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Device serial
                          </span>
                          <input
                            name="deviceSerialNumber"
                            className={
                              inputClass
                            }
                            required
                            maxLength={120}
                            defaultValue={
                              data
                                .profile
                                ?.deviceSerialNumber ||
                              ''
                            }
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Default payment
                          </span>
                          <select
                            name="defaultPaymentTypeCode"
                            className={
                              inputClass
                            }
                            defaultValue={
                              data
                                .profile
                                ?.defaultPaymentTypeCode ||
                              '02'
                            }
                          >
                            <option value="01">Cash</option>
                            <option value="02">Credit</option>
                            <option value="03">Cash/Credit</option>
                            <option value="04">Bank cheque</option>
                            <option value="05">Card</option>
                            <option value="06">Mobile money</option>
                            <option value="07">Other</option>
                          </select>
                        </label>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className={
                              buttonClass
                            }
                          >
                            <CloudCog className="h-4 w-4" />
                            Save profile
                          </button>
                        </div>
                      </form>
                    )
                    : (
                      <Empty text="You do not have permission to configure eTIMS." />
                    )
                }
              </section>

              <section className="space-y-3">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Endpoint
                  </p>
                  <p className="mt-2 text-sm font-black">
                    {
                      data.endpointConfigured
                        ? 'Server configured'
                        : 'Server variable missing'
                    }
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Endpoint URLs stay in server environment variables and are never supplied by the browser.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Device
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-black">
                      {
                        data.profile
                          ?.status ||
                        'Not configured'
                      }
                    </p>
                    {
                      data.profile &&
                      <StatusPill
                        value={
                          data
                            .profile
                            .status
                        }
                      />
                    }
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Last initialization: {
                      dateTime(
                        data
                          .profile
                          ?.lastDeviceInitAt ||
                        null,
                      )
                    }
                  </p>

                  {
                    data.capabilities
                      .canConfigure &&
                    data.profile &&
                    (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !data
                            .endpointConfigured
                        }
                        onClick={
                          () =>
                            void run(
                              'initialize_device',
                              {},
                              'KRA device initialization succeeded.',
                            )
                        }
                        className={[
                          buttonClass,
                          'mt-4 w-full',
                        ].join(
                          ' ',
                        )}
                      >
                        <Link2 className="h-4 w-4" />
                        Initialize device
                      </button>
                    )
                  }
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Reference data
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Last sync: {
                      dateTime(
                        data
                          .profile
                          ?.lastReferenceSyncAt ||
                        null,
                      )
                    }
                  </p>
                  {
                    data.capabilities
                      .canConfigure &&
                    (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          data.profile
                            ?.status !==
                            'activated'
                        }
                        onClick={
                          () =>
                            void run(
                              'sync_reference_data',
                              {},
                              'KRA codes, item classes, branches and notices synchronized.',
                            )
                        }
                        className={[
                          buttonClass,
                          'mt-4 w-full',
                        ].join(
                          ' ',
                        )}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Sync KRA reference data
                      </button>
                    )
                  }
                </div>
              </section>
            </div>
          )
        }

        {
          tab ===
            'mappings' &&
          (
            <div className="space-y-4">
              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                  <h3 className="text-sm font-black">
                    Item mapping
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Link a SaMi catalog item to its KRA item classification and item code.
                  </p>

                  {
                    data.capabilities
                      .canConfigure &&
                    (
                      <form
                        className="mt-4 grid gap-3 sm:grid-cols-2"
                        onSubmit={
                          async event => {
                            event.preventDefault();
                            const form =
                              new FormData(
                                event.currentTarget,
                              );

                            await run(
                              'save_item_mapping',
                              {
                                catalogItemId:
                                  form.get(
                                    'catalogItemId',
                                  ),
                                itemClassificationCode:
                                  form.get(
                                    'itemClassificationCode',
                                  ),
                                itemCode:
                                  form.get(
                                    'itemCode',
                                  ),
                                originCountryCode:
                                  form.get(
                                    'originCountryCode',
                                  ),
                                packagingUnitCode:
                                  form.get(
                                    'packagingUnitCode',
                                  ),
                                quantityUnitCode:
                                  form.get(
                                    'quantityUnitCode',
                                  ),
                                isActive:
                                  true,
                              },
                              'KRA item mapping saved.',
                            );
                          }
                        }
                      >
                        <label className="sm:col-span-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            SaMi item
                          </span>
                          <select
                            name="catalogItemId"
                            required
                            className={
                              inputClass
                            }
                          >
                            <option value="">
                              Choose item
                            </option>
                            {
                              invoicingData
                                .catalogItems
                                .map(
                                  item => (
                                    <option
                                      key={
                                        item.id
                                      }
                                      value={
                                        item.id
                                      }
                                    >
                                      {
                                        item.name
                                      }
                                      {
                                        itemMappingByCatalog
                                          .has(
                                            item.id,
                                          )
                                          ? ' — mapped'
                                          : ''
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Item class code
                          </span>
                          <input
                            name="itemClassificationCode"
                            className={
                              inputClass
                            }
                            required
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            KRA item code
                          </span>
                          <input
                            name="itemCode"
                            className={
                              inputClass
                            }
                            required
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Origin country
                          </span>
                          <input
                            name="originCountryCode"
                            className={
                              inputClass
                            }
                            defaultValue="KE"
                            required
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Packaging unit
                          </span>
                          <input
                            name="packagingUnitCode"
                            className={
                              inputClass
                            }
                            placeholder="KRA code"
                            required
                          />
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Quantity unit
                          </span>
                          <input
                            name="quantityUnitCode"
                            className={
                              inputClass
                            }
                            placeholder="KRA code"
                            required
                          />
                        </label>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className={
                              buttonClass
                            }
                          >
                            Save item mapping
                          </button>
                        </div>
                      </form>
                    )
                  }
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                  <h3 className="text-sm font-black">
                    Tax mapping
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Map a SaMi rate or tax group to KRA A–E. B is 16% VAT and E is 8%; A/C/D are zero-rate categories with different tax treatment.
                  </p>

                  {
                    data.capabilities
                      .canConfigure &&
                    (
                      <form
                        className="mt-4 grid gap-3 sm:grid-cols-2"
                        onSubmit={
                          async event => {
                            event.preventDefault();

                            const form =
                              new FormData(
                                event.currentTarget,
                              );

                            const source =
                              String(
                                form.get(
                                  'source',
                                ) ||
                                '',
                              );

                            const [
                              kind,
                              id,
                            ] =
                              source.split(
                                ':',
                              );

                            await run(
                              'save_tax_mapping',
                              {
                                taxRateId:
                                  kind ===
                                    'rate'
                                    ? id
                                    : null,
                                taxGroupId:
                                  kind ===
                                    'group'
                                    ? id
                                    : null,
                                taxTypeCode:
                                  form.get(
                                    'taxTypeCode',
                                  ),
                                isActive:
                                  true,
                              },
                              'KRA tax mapping saved.',
                            );
                          }
                        }
                      >
                        <label className="sm:col-span-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            SaMi tax source
                          </span>
                          <select
                            name="source"
                            required
                            className={
                              inputClass
                            }
                          >
                            <option value="">
                              Choose tax
                            </option>
                            {
                              invoicingData
                                .taxRates
                                .map(
                                  rate => (
                                    <option
                                      key={
                                        'rate:' +
                                        rate.id
                                      }
                                      value={
                                        'rate:' +
                                        rate.id
                                      }
                                    >
                                      {
                                        rate.name
                                      } — {
                                        rate.rate
                                      }%
                                      {
                                        taxMappingKeys
                                          .has(
                                            'rate:' +
                                            rate.id,
                                          )
                                          ? ' — mapped'
                                          : ''
                                      }
                                    </option>
                                  ),
                                )
                            }
                            {
                              invoicingData
                                .taxGroups
                                .map(
                                  group => (
                                    <option
                                      key={
                                        'group:' +
                                        group.id
                                      }
                                      value={
                                        'group:' +
                                        group.id
                                      }
                                    >
                                      Group: {
                                        group.name
                                      }
                                      {
                                        taxMappingKeys
                                          .has(
                                            'group:' +
                                            group.id,
                                          )
                                          ? ' — mapped'
                                          : ''
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>

                        <label className="sm:col-span-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            KRA tax type
                          </span>
                          <select
                            name="taxTypeCode"
                            className={
                              inputClass
                            }
                            required
                          >
                            <option value="A">A — Exempt</option>
                            <option value="B">B — VAT 16%</option>
                            <option value="C">C — Zero rated</option>
                            <option value="D">D — Non-VAT</option>
                            <option value="E">E — VAT 8%</option>
                          </select>
                        </label>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className={
                              buttonClass
                            }
                          >
                            Save tax mapping
                          </button>
                        </div>
                      </form>
                    )
                  }
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <h3 className="text-sm font-black">
                    Mapped items
                  </h3>
                  <div className="mt-3 space-y-2">
                    {
                      data.itemMappings
                        .length ===
                      0
                        ? (
                          <Empty text="No catalog items mapped yet." />
                        )
                        : data.itemMappings
                            .map(
                              mapping => (
                                <div
                                  key={
                                    mapping.id
                                  }
                                  className="rounded-xl bg-[var(--sami-surface-soft)] p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-black">
                                        {
                                          mapping
                                            .itemName
                                        }
                                      </p>
                                      <p className="mt-1 break-all text-[10px] text-slate-500">
                                        {
                                          mapping
                                            .itemClassificationCode
                                        } · {
                                          mapping
                                            .itemCode
                                        }
                                      </p>
                                    </div>
                                    <StatusPill
                                      value={
                                        mapping
                                          .isActive
                                          ? 'active'
                                          : 'disabled'
                                      }
                                    />
                                  </div>
                                  <p className="mt-2 text-[10px] text-slate-500">
                                    {
                                      mapping
                                        .originCountryCode
                                    } · package {
                                      mapping
                                        .packagingUnitCode
                                    } · quantity {
                                      mapping
                                        .quantityUnitCode
                                    }
                                  </p>
                                </div>
                              ),
                            )
                    }
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                  <h3 className="text-sm font-black">
                    Mapped taxes
                  </h3>
                  <div className="mt-3 space-y-2">
                    {
                      data.taxMappings
                        .length ===
                      0
                        ? (
                          <Empty text="No tax mappings yet." />
                        )
                        : data.taxMappings
                            .map(
                              mapping => (
                                <div
                                  key={
                                    mapping.id
                                  }
                                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--sami-surface-soft)] p-3"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-black">
                                      {
                                        mapping
                                          .sourceName
                                      }
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      KRA {
                                        mapping
                                          .taxTypeCode
                                      } · {
                                        mapping
                                          .kraRate
                                      }%
                                    </p>
                                  </div>
                                  <StatusPill
                                    value={
                                      mapping
                                        .isActive
                                        ? 'active'
                                        : 'disabled'
                                    }
                                  />
                                </div>
                              ),
                            )
                    }
                  </div>
                </div>
              </section>
            </div>
          )
        }

        {
          tab ===
            'fiscalization' &&
          (
            <div className="space-y-4">
              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-black">
                    Sales invoices
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Fiscalize confirmed KES invoices after their catalog and tax mappings are complete.
                </p>

                <div className="mt-4 space-y-2">
                  {
                    data.eligibleInvoices
                      .length ===
                    0
                      ? (
                        <Empty text="No eligible invoices." />
                      )
                      : data
                          .eligibleInvoices
                          .map(
                            invoice => (
                              <div
                                key={
                                  invoice.id
                                }
                                className="flex flex-col gap-3 rounded-2xl border border-[var(--sami-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-black">
                                      {
                                        invoice
                                          .invoiceNumber
                                      }
                                    </p>
                                    {
                                      invoice
                                        .etimsStatus &&
                                      <StatusPill
                                        value={
                                          invoice
                                            .etimsStatus
                                        }
                                      />
                                    }
                                  </div>
                                  <p className="mt-1 truncate text-xs text-slate-500">
                                    {
                                      invoice
                                        .customerName
                                    } · {
                                      invoice
                                        .invoiceDate
                                    } · {
                                      invoice
                                        .currency
                                    } {
                                      invoice
                                        .totalAmount
                                        .toLocaleString()
                                    }
                                  </p>
                                </div>

                                {
                                  data.capabilities
                                    .canSubmit &&
                                  invoice.etimsStatus !==
                                    'succeeded' &&
                                  (
                                    <button
                                      type="button"
                                      disabled={
                                        busy ||
                                        data
                                          .profile
                                          ?.status !==
                                          'activated'
                                      }
                                      onClick={
                                        () =>
                                          void run(
                                            'submit_invoice',
                                            {
                                              invoiceId:
                                                invoice.id,
                                            },
                                            invoice.etimsStatus
                                              ? 'Invoice fiscalization retried successfully.'
                                              : 'Invoice fiscalized successfully.',
                                          )
                                      }
                                      className={
                                        buttonClass
                                      }
                                    >
                                      <Send className="h-4 w-4" />
                                      {
                                        invoice
                                          .etimsStatus
                                          ? 'Retry'
                                          : 'Send to eTIMS'
                                      }
                                    </button>
                                  )
                                }
                              </div>
                            ),
                          )
                  }
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <h3 className="text-sm font-black">
                  Credit notes
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  A credit note can be fiscalized only after its original invoice has a successful eTIMS sale submission.
                </p>

                {
                  data.capabilities
                    .canSubmit &&
                  data.creditNotes
                    .length >
                    0
                    ? (
                      <form
                        className="mt-4 grid gap-3 sm:grid-cols-3"
                        onSubmit={
                          async event => {
                            event.preventDefault();
                            const form =
                              new FormData(
                                event.currentTarget,
                              );

                            await run(
                              'submit_credit_note',
                              {
                                creditNoteId:
                                  form.get(
                                    'creditNoteId',
                                  ),
                                reasonCode:
                                  form.get(
                                    'reasonCode',
                                  ),
                              },
                              'Credit note fiscalized successfully.',
                            );
                          }
                        }
                      >
                        <label className="sm:col-span-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Credit note
                          </span>
                          <select
                            name="creditNoteId"
                            required
                            className={
                              inputClass
                            }
                          >
                            <option value="">
                              Choose credit note
                            </option>
                            {
                              data.creditNotes
                                .filter(
                                  credit =>
                                    credit
                                      .etimsStatus !==
                                    'succeeded',
                                )
                                .map(
                                  credit => (
                                    <option
                                      key={
                                        credit.id
                                      }
                                      value={
                                        credit.id
                                      }
                                    >
                                      {
                                        credit
                                          .creditNoteNumber
                                      } · original {
                                        credit
                                          .invoiceNumber
                                      } · {
                                        money(
                                          credit
                                            .totalAmount,
                                        )
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>

                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                            KRA reason
                          </span>
                          <select
                            name="reasonCode"
                            required
                            className={
                              inputClass
                            }
                            defaultValue="01"
                          >
                            <option value="01">01 — Missing quantity</option>
                            <option value="02">02 — Missing item</option>
                            <option value="03">03 — Damaged item</option>
                            <option value="04">04 — Wasted item</option>
                            <option value="05">05 — Raw material shortage</option>
                            <option value="06">06 — Refund</option>
                            <option value="07">07 — Wrong PIN</option>
                            <option value="08">08 — Wrong customer name</option>
                            <option value="09">09 — Wrong amount/price</option>
                            <option value="10">10 — Wrong quantity</option>
                            <option value="11">11 — Wrong item</option>
                            <option value="12">12 — Wrong tax type</option>
                            <option value="13">13 — Other</option>
                          </select>
                        </label>

                        <div className="sm:col-span-3">
                          <button
                            type="submit"
                            disabled={
                              busy ||
                              data
                                .profile
                                ?.status !==
                                'activated'
                            }
                            className={
                              buttonClass
                            }
                          >
                            Fiscalize credit note
                          </button>
                        </div>
                      </form>
                    )
                    : (
                      <div className="mt-4">
                        <Empty text="No credit notes require fiscalization." />
                      </div>
                    )
                }
              </section>

              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <h3 className="text-sm font-black">
                  Transmission history
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Each source document keeps one fiscal identity while retry attempts remain auditable.
                </p>

                <div className="mt-4 space-y-2">
                  {
                    data.submissions
                      .length ===
                    0
                      ? (
                        <Empty text="No eTIMS transmissions yet." />
                      )
                      : data.submissions
                          .map(
                            submission => (
                              <div
                                key={
                                  submission.id
                                }
                                className="rounded-2xl border border-[var(--sami-border)] p-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-xs font-black">
                                        {
                                          submission
                                            .documentNumber
                                        }
                                      </p>
                                      <StatusPill
                                        value={
                                          submission
                                            .status
                                        }
                                      />
                                    </div>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      {
                                        submission
                                          .submissionType
                                      } · {
                                        submission
                                          .solutionType
                                          .toUpperCase()
                                      } {
                                        submission
                                          .environment
                                      } · transaction #{
                                        submission
                                          .transactionInvoiceNo
                                      }
                                    </p>
                                  </div>

                                  <div className="text-left sm:text-right">
                                    <p className="text-[10px] font-bold text-slate-500">
                                      Attempts {
                                        submission
                                          .attemptCount
                                      }
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      {
                                        dateTime(
                                          submission
                                            .lastAttemptAt,
                                        )
                                      }
                                    </p>
                                  </div>
                                </div>

                                {
                                  submission
                                    .status ===
                                    'succeeded' &&
                                  (
                                    <div className="mt-3 grid gap-2 rounded-xl bg-emerald-50 p-3 text-[10px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200 sm:grid-cols-3">
                                      <span>
                                        Receipt: {
                                          submission
                                            .receiptNo ??
                                          '—'
                                        }
                                      </span>
                                      <span>
                                        SDC: {
                                          submission
                                            .sdcId ||
                                          '—'
                                        }
                                      </span>
                                      <span>
                                        MRC: {
                                          submission
                                            .mrcNo ||
                                          '—'
                                        }
                                      </span>
                                    </div>
                                  )
                                }

                                {
                                  submission
                                    .resultMessage &&
                                  submission
                                    .status !==
                                    'succeeded' &&
                                  (
                                    <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[10px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                                      {
                                        submission
                                          .resultCode
                                          ? submission
                                              .resultCode +
                                            ' — '
                                          : ''
                                      }
                                      {
                                        submission
                                          .resultMessage
                                      }
                                    </p>
                                  )
                                }
                              </div>
                            ),
                          )
                  }
                </div>
              </section>
            </div>
          )
        }
      </div>
    </>
  );
}
