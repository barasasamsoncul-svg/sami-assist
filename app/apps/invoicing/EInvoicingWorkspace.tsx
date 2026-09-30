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
  Download,
  FileCode2,
  Globe2,
  LoaderCircle,
  Network,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Users2,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';


type Tab =
  | 'overview'
  | 'profiles'
  | 'participants'
  | 'documents';


type WorkspaceData = {
  company: {
    id: string;
    name: string;
  };
  capabilities: {
    canConfigure: boolean;
    canManageParticipants: boolean;
    canSubmit: boolean;
  };
  standards: {
    syntax: string;
    peppolSpecification: string;
    peppolProcess: string;
    architecture: string;
  };
  profiles: Array<{
    id: string;
    name: string;
    network: string;
    providerKey: string;
    environment: string;
    status: string;
    syntax: string;
    supplierCountryCode: string;
    supplierEndpointScheme: string;
    supplierEndpointId: string;
    customizationId: string;
    processId: string;
    providerAccountId: string | null;
    credentialConfigured: boolean;
    endpointConfigured: boolean;
    isDefault: boolean;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }>;
  participants: Array<{
    id: string;
    customerId: string;
    customerName: string;
    network: string;
    participantScheme: string;
    participantId: string;
    countryCode: string;
    buyerReference: string | null;
    isActive: boolean;
  }>;
  documents: Array<{
    id: string;
    profileId: string;
    participantId: string;
    invoiceId: string | null;
    creditNoteId: string | null;
    documentKind: string;
    network: string;
    syntax: string;
    specificationId: string;
    processId: string;
    documentUuid: string;
    xmlSha256: string;
    validationStatus: string;
    validationErrors: Array<{
      code?: string;
      message?: string;
      field?: string;
    }>;
    transmissionStatus: string;
    providerMessageId: string | null;
    providerStatus: string | null;
    attemptCount: number;
    lastAttemptAt: string | null;
    submittedAt: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    createdAt: string;
    updatedAt: string;
    profileName: string;
    providerKey: string;
    customerName: string;
    documentNumber: string;
  }>;
  customers: Array<{
    id: string;
    name: string;
    taxId: string | null;
    countryCode: string | null;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    status: string;
    currency: string;
    totalAmount: number;
    customerId: string;
    customerName: string;
    buyerReference: string | null;
    purchaseOrderNumber: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    creditNoteNumber: string;
    issueDate: string;
    status: string;
    currency: string;
    totalAmount: number;
    customerId: string;
    customerName: string;
    sourceInvoiceNumber: string;
  }>;
};


const inputClass =
  'mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs text-[var(--sami-text)] outline-none focus:border-blue-500';

const buttonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950';

const secondaryButtonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-black text-[var(--sami-text)] disabled:cursor-not-allowed disabled:opacity-50';


function money(
  value:
    number,
  currency =
    'KES',
) {
  try {
    return new Intl
      .NumberFormat(
        'en',
        {
          style:
            'currency',
          currency,
          maximumFractionDigits:
            2,
        },
      )
      .format(
        value,
      );
  } catch {
    return (
      currency +
      ' ' +
      value.toFixed(
        2,
      )
    );
  }
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
        .toLocaleString();
}


function statusClass(
  status:
    string,
) {
  if (
    [
      'active',
      'accepted',
      'valid',
      'exported',
    ].includes(
      status,
    )
  ) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20';
  }

  if (
    [
      'invalid',
      'rejected',
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
      'queued',
      'configured',
      'ready',
    ].includes(
      status,
    )
  ) {
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20';
  }

  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10';
}


function Status({
  value,
}: {
  value:
    string;
}) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ring-inset',
        statusClass(
          value,
        ),
      ].join(
        ' ',
      )}
    >
      {
        value.replaceAll(
          '_',
          ' ',
        )
      }
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
    <div className="rounded-2xl border border-dashed border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-5 text-center text-xs text-[var(--sami-text-muted)]">
      {
        text
      }
    </div>
  );
}


export default function EInvoicingWorkspace() {
  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      'overview',
    );

  const [
    data,
    setData,
  ] =
    useState<
      WorkspaceData |
      null
    >(
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
    editingProfileId,
    setEditingProfileId,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const {
    overlay,
    showError,
    showSuccess,
    showWarning,
    closeOverlay,
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
              '/api/apps/invoicing/e-invoicing',
              {
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
                  WorkspaceData;
              };

          if (
            !response.ok ||
            body.success !==
              true ||
            !body.data
          ) {
            throw new Error(
              body.error ||
              'SaMi could not load international e-invoicing.',
            );
          }

          setData(
            body.data,
          );
        } catch (
          error
        ) {
          showError(
            'International e-invoicing unavailable',
            error instanceof
              Error
              ? error.message
              : 'SaMi could not load international e-invoicing.',
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
        'Wait for the current e-invoicing request to finish.',
      );
      return null;
    }

    setBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/invoicing/e-invoicing',
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
            result?:
              Record<string, unknown>;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'The international e-invoicing action failed.',
        );
      }

      showSuccess(
        'E-invoicing updated',
        success,
      );

      await load();

      return body.result ||
        {};
    } catch (
      error
    ) {
      showError(
        'E-invoicing action failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not complete the international e-invoicing action.',
      );

      return null;
    } finally {
      setBusy(
        false,
      );
    }
  }


  const profile =
    useMemo(
      () =>
        data
          ?.profiles
          .find(
            item =>
              item.id ===
              editingProfileId,
          ) ||
        null,
      [
        data,
        editingProfileId,
      ],
    );

  const defaultProfile =
    useMemo(
      () =>
        data
          ?.profiles
          .find(
            item =>
              item.isDefault,
          ) ||
        data
          ?.profiles[0] ||
        null,
      [
        data,
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
      <Empty text="International e-invoicing data is not available." />
    );
  }

  const participantReady =
    data.participants
      .filter(
        item =>
          item.isActive,
      )
      .length;

  const validDocuments =
    data.documents
      .filter(
        item =>
          item.validationStatus ===
            'valid',
      )
      .length;

  const acceptedDocuments =
    data.documents
      .filter(
        item =>
          item.transmissionStatus ===
            'accepted',
      )
      .length;

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
          <div className="border-b border-[var(--sami-border)] bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 p-4 text-white sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5 text-cyan-300" />
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">
                    International e-invoicing
                  </p>
                </div>
                <h2 className="mt-2 text-xl font-black tracking-[-0.03em] sm:text-2xl">
                  Peppol, UBL & EDI control center
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
                  Generate standards-aware UBL documents, map electronic participant identities, export XML and route validated documents through provider adapters.
                </p>
              </div>

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
                aria-label="Refresh international e-invoicing"
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

          <div className="overflow-x-auto border-b border-[var(--sami-border)] px-3 sm:px-5">
            <div className="flex min-w-max gap-1 py-2">
              {
                [
                  [
                    'overview',
                    'Overview',
                  ],
                  [
                    'profiles',
                    'Profiles',
                  ],
                  [
                    'participants',
                    'Participants',
                  ],
                  [
                    'documents',
                    'Documents',
                  ],
                ].map(
                  entry => {
                    const key =
                      entry[0] as
                        Tab;

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
                {
                  [
                    {
                      label:
                        'Profiles',
                      value:
                        data
                          .profiles
                          .length,
                      icon:
                        Settings2,
                    },
                    {
                      label:
                        'Participants',
                      value:
                        participantReady,
                      icon:
                        Users2,
                    },
                    {
                      label:
                        'Valid documents',
                      value:
                        validDocuments,
                      icon:
                        FileCode2,
                    },
                    {
                      label:
                        'Accepted',
                      value:
                        acceptedDocuments,
                      icon:
                        BadgeCheck,
                    },
                  ].map(
                    card => {
                      const Icon =
                        card.icon;

                      return (
                        <div
                          key={
                            card.label
                          }
                          className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--sami-text-muted)]">
                              {
                                card.label
                              }
                            </p>
                            <Icon className="h-4 w-4 text-blue-600" />
                          </div>
                          <p className="mt-3 text-2xl font-black">
                            {
                              card.value
                            }
                          </p>
                        </div>
                      );
                    },
                  )
                }
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-black">
                      Fiscal document architecture
                    </h3>
                  </div>
                  <p className="mt-3 rounded-xl bg-[var(--sami-surface-soft)] p-3 font-mono text-[11px] leading-5 text-[var(--sami-text)]">
                    {
                      data
                        .standards
                        .architecture
                    }
                  </p>
                  <div className="mt-4 grid gap-2 text-xs text-[var(--sami-text-muted)]">
                    <p>
                      <strong className="text-[var(--sami-text)]">Syntax:</strong>{' '}
                      {
                        data
                          .standards
                          .syntax
                      }
                    </p>
                    <p className="break-all">
                      <strong className="text-[var(--sami-text)]">Peppol specification:</strong>{' '}
                      {
                        data
                          .standards
                          .peppolSpecification
                      }
                    </p>
                    <p className="break-all">
                      <strong className="text-[var(--sami-text)]">Process:</strong>{' '}
                      {
                        data
                          .standards
                          .peppolProcess
                      }
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10 sm:p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    <h3 className="text-sm font-black text-amber-900 dark:text-amber-100">
                      Network responsibility
                    </h3>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    SaMi validates and renders the fiscal document. Peppol network delivery still requires an approved access-point or gateway provider. Activating a SaMi profile does not by itself certify a business or create Peppol membership.
                  </p>
                  <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    Provider URLs come from server environment configuration, not user-entered URLs, so workspace users cannot turn the connector into an arbitrary outbound request.
                  </p>
                </div>
              </section>

              {
                defaultProfile
                  ? (
                    <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black">
                          Default profile — {
                            defaultProfile
                              .name
                          }
                        </h3>
                        <Status value={defaultProfile.status} />
                        <Status
                          value={
                            defaultProfile
                              .endpointConfigured
                              ? 'endpoint ready'
                              : 'endpoint missing'
                          }
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--sami-text-muted)]">
                        {
                          defaultProfile
                            .network
                        } · {
                          defaultProfile
                            .providerKey
                        } · {
                          defaultProfile
                            .environment
                        } · {
                          defaultProfile
                            .supplierEndpointScheme
                        }:{
                          defaultProfile
                            .supplierEndpointId
                        }
                      </p>
                    </section>
                  )
                  : (
                    <Empty text="Create an e-invoicing profile before generating international fiscal documents." />
                  )
              }
            </div>
          )
        }

        {
          tab ===
            'profiles' &&
          (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <section className="space-y-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black">
                    Provider profiles
                  </h3>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={
                      () =>
                        setEditingProfileId(
                          null,
                        )
                    }
                  >
                    New profile
                  </button>
                </div>

                {
                  data.profiles
                    .length
                    ? data.profiles
                        .map(
                          item => (
                            <button
                              key={
                                item.id
                              }
                              type="button"
                              onClick={
                                () =>
                                  setEditingProfileId(
                                    item.id,
                                  )
                              }
                              className="w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3 text-left"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black">
                                  {
                                    item.name
                                  }
                                </span>
                                {
                                  item.isDefault &&
                                  (
                                    <span className="text-[10px] font-black uppercase text-blue-600">
                                      Default
                                    </span>
                                  )
                                }
                                <Status value={item.status} />
                              </div>
                              <p className="mt-2 text-[11px] text-[var(--sami-text-muted)]">
                                {
                                  item.network
                                } · {
                                  item.providerKey
                                } · {
                                  item.environment
                                }
                              </p>
                            </button>
                          ),
                        )
                    : (
                        <Empty text="No provider profile has been configured." />
                      )
                }
              </section>

              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-black">
                    {
                      profile
                        ? 'Edit provider profile'
                        : 'Create provider profile'
                    }
                  </h3>
                </div>

                {
                  data.capabilities
                    .canConfigure
                    ? (
                      <form
                        key={
                          profile
                            ?.id ||
                          'new-profile'
                        }
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

                            const network =
                              String(
                                form.get(
                                  'networkKey',
                                ) ||
                                'peppol',
                              );

                            const result =
                              await run(
                                'save_profile',
                                {
                                  id:
                                    profile
                                      ?.id ||
                                    undefined,
                                  name:
                                    form.get(
                                      'name',
                                    ),
                                  networkKey:
                                    network,
                                  providerKey:
                                    form.get(
                                      'providerKey',
                                    ),
                                  environment:
                                    form.get(
                                      'environment',
                                    ),
                                  status:
                                    form.get(
                                      'status',
                                    ),
                                  supplierCountryCode:
                                    form.get(
                                      'supplierCountryCode',
                                    ),
                                  supplierEndpointScheme:
                                    form.get(
                                      'supplierEndpointScheme',
                                    ),
                                  supplierEndpointId:
                                    form.get(
                                      'supplierEndpointId',
                                    ),
                                  customizationId:
                                    form.get(
                                      'customizationId',
                                    ),
                                  processId:
                                    form.get(
                                      'processId',
                                    ),
                                  providerAccountId:
                                    form.get(
                                      'providerAccountId',
                                    ),
                                  credential:
                                    form.get(
                                      'credential',
                                    ),
                                  isDefault:
                                    form.get(
                                      'isDefault',
                                    ) ===
                                    'on',
                                },
                                'Provider profile saved.',
                              );

                            if (
                              result &&
                              !profile
                            ) {
                              setEditingProfileId(
                                null,
                              );
                              event
                                .currentTarget
                                .reset();
                            }
                          }
                        }
                      >
                        <label className="text-xs font-bold">
                          Profile name
                          <input
                            name="name"
                            required
                            defaultValue={
                              profile
                                ?.name ||
                              'Peppol Billing'
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Network
                          <select
                            name="networkKey"
                            defaultValue={
                              profile
                                ?.network ||
                              'peppol'
                            }
                            className={inputClass}
                          >
                            <option value="peppol">
                              Peppol
                            </option>
                            <option value="custom_edi">
                              Custom EDI
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Provider adapter
                          <select
                            name="providerKey"
                            defaultValue={
                              profile
                                ?.providerKey ||
                              'peppol_gateway'
                            }
                            className={inputClass}
                          >
                            <option value="peppol_gateway">
                              Peppol gateway
                            </option>
                            <option value="custom_edi_gateway">
                              Custom EDI gateway
                            </option>
                            <option value="file_export">
                              XML export only
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Environment
                          <select
                            name="environment"
                            defaultValue={
                              profile
                                ?.environment ||
                              'sandbox'
                            }
                            className={inputClass}
                          >
                            <option value="sandbox">
                              Sandbox
                            </option>
                            <option value="production">
                              Production
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Status
                          <select
                            name="status"
                            defaultValue={
                              profile
                                ?.status ||
                              'configured'
                            }
                            className={inputClass}
                          >
                            <option value="configured">
                              Configured
                            </option>
                            <option value="active">
                              Active
                            </option>
                            <option value="disabled">
                              Disabled
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Supplier country
                          <input
                            name="supplierCountryCode"
                            required
                            maxLength={2}
                            defaultValue={
                              profile
                                ?.supplierCountryCode ||
                              'KE'
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Endpoint scheme
                          <input
                            name="supplierEndpointScheme"
                            required
                            placeholder="0088"
                            defaultValue={
                              profile
                                ?.supplierEndpointScheme ||
                              ''
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Supplier endpoint ID
                          <input
                            name="supplierEndpointId"
                            required
                            defaultValue={
                              profile
                                ?.supplierEndpointId ||
                              ''
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold sm:col-span-2">
                          Specification identifier
                          <input
                            name="customizationId"
                            required
                            defaultValue={
                              profile
                                ?.customizationId ||
                              data
                                .standards
                                .peppolSpecification
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold sm:col-span-2">
                          Business process
                          <input
                            name="processId"
                            required
                            defaultValue={
                              profile
                                ?.processId ||
                              data
                                .standards
                                .peppolProcess
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Provider account ID
                          <input
                            name="providerAccountId"
                            defaultValue={
                              profile
                                ?.providerAccountId ||
                              ''
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Provider credential
                          <input
                            name="credential"
                            type="password"
                            autoComplete="new-password"
                            placeholder={
                              profile
                                ?.credentialConfigured
                                ? 'Leave blank to keep saved secret'
                                : 'Bearer/API token'
                            }
                            className={inputClass}
                          />
                        </label>

                        <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2">
                          <input
                            name="isDefault"
                            type="checkbox"
                            defaultChecked={
                              profile
                                ?.isDefault ||
                              data
                                .profiles
                                .length ===
                                0
                            }
                          />
                          Make this the default fiscal profile.
                        </label>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className={buttonClass}
                          >
                            {
                              busy
                                ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  )
                                : (
                                    <ShieldCheck className="h-4 w-4" />
                                  )
                            }
                            Save profile
                          </button>
                        </div>
                      </form>
                    )
                    : (
                        <Empty text="You do not have permission to configure e-invoicing providers." />
                      )
                }
              </section>
            </div>
          )
        }

        {
          tab ===
            'participants' &&
          (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-black">
                    Buyer participant mapping
                  </h3>
                </div>

                {
                  data.capabilities
                    .canManageParticipants
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

                            const result =
                              await run(
                                'save_participant',
                                {
                                  customerId:
                                    form.get(
                                      'customerId',
                                    ),
                                  networkKey:
                                    form.get(
                                      'networkKey',
                                    ),
                                  participantScheme:
                                    form.get(
                                      'participantScheme',
                                    ),
                                  participantId:
                                    form.get(
                                      'participantId',
                                    ),
                                  countryCode:
                                    form.get(
                                      'countryCode',
                                    ),
                                  buyerReference:
                                    form.get(
                                      'buyerReference',
                                    ),
                                  isActive:
                                    true,
                                },
                                'Buyer electronic identity saved.',
                              );

                            if (result) {
                              event
                                .currentTarget
                                .reset();
                            }
                          }
                        }
                      >
                        <label className="text-xs font-bold sm:col-span-2">
                          Customer
                          <select
                            name="customerId"
                            required
                            className={inputClass}
                          >
                            <option value="">
                              Select customer
                            </option>
                            {
                              data.customers
                                .map(
                                  customer => (
                                    <option
                                      key={
                                        customer.id
                                      }
                                      value={
                                        customer.id
                                      }
                                    >
                                      {
                                        customer.name
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Network
                          <select
                            name="networkKey"
                            defaultValue="peppol"
                            className={inputClass}
                          >
                            <option value="peppol">
                              Peppol
                            </option>
                            <option value="custom_edi">
                              Custom EDI
                            </option>
                          </select>
                        </label>

                        <label className="text-xs font-bold">
                          Country
                          <input
                            name="countryCode"
                            required
                            maxLength={2}
                            placeholder="DE"
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Participant scheme
                          <input
                            name="participantScheme"
                            required
                            placeholder="0088"
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold">
                          Participant ID
                          <input
                            name="participantId"
                            required
                            className={inputClass}
                          />
                        </label>

                        <label className="text-xs font-bold sm:col-span-2">
                          Default buyer reference
                          <input
                            name="buyerReference"
                            placeholder="Department / buyer routing reference"
                            className={inputClass}
                          />
                        </label>

                        <div className="sm:col-span-2">
                          <button
                            type="submit"
                            disabled={
                              busy
                            }
                            className={buttonClass}
                          >
                            Save participant
                          </button>
                        </div>
                      </form>
                    )
                    : (
                        <Empty text="You do not have permission to manage customer participant identities." />
                      )
                }
              </section>

              <section className="space-y-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                <h3 className="text-sm font-black">
                  Registered participants
                </h3>

                {
                  data.participants
                    .length
                    ? data.participants
                        .map(
                          item => (
                            <div
                              key={
                                item.id
                              }
                              className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-black">
                                  {
                                    item.customerName
                                  }
                                </p>
                                <Status
                                  value={
                                    item.isActive
                                      ? 'active'
                                      : 'disabled'
                                  }
                                />
                              </div>
                              <p className="mt-2 break-all text-[11px] text-[var(--sami-text-muted)]">
                                {
                                  item.network
                                } · {
                                  item.participantScheme
                                }:{
                                  item.participantId
                                } · {
                                  item.countryCode
                                }
                              </p>
                              {
                                item.buyerReference &&
                                (
                                  <p className="mt-1 text-[11px] text-[var(--sami-text-muted)]">
                                    Buyer ref: {
                                      item.buyerReference
                                    }
                                  </p>
                                )
                              }
                            </div>
                          ),
                        )
                    : (
                        <Empty text="No customer electronic identities are mapped yet." />
                      )
                }
              </section>
            </div>
          )
        }

        {
          tab ===
            'documents' &&
          (
            <div className="space-y-4">
              <section className="grid gap-4 xl:grid-cols-2">
                <DocumentGenerator
                  title="Generate invoice XML"
                  kind="invoice"
                  profileId={
                    defaultProfile
                      ?.id ||
                    ''
                  }
                  profiles={
                    data.profiles
                  }
                  options={
                    data.invoices
                      .map(
                        invoice => ({
                          id:
                            invoice.id,
                          label:
                            invoice.invoiceNumber +
                            ' · ' +
                            invoice.customerName +
                            ' · ' +
                            money(
                              invoice.totalAmount,
                              invoice.currency,
                            ),
                        }),
                      )
                  }
                  busy={
                    busy
                  }
                  onGenerate={
                    async (
                      sourceId,
                      profileId,
                    ) =>
                      run(
                        'generate_document',
                        {
                          documentKind:
                            'invoice',
                          sourceId,
                          profileId,
                        },
                        'UBL invoice document generated.',
                      )
                  }
                />

                <DocumentGenerator
                  title="Generate credit-note XML"
                  kind="credit_note"
                  profileId={
                    defaultProfile
                      ?.id ||
                    ''
                  }
                  profiles={
                    data.profiles
                  }
                  options={
                    data.creditNotes
                      .map(
                        credit => ({
                          id:
                            credit.id,
                          label:
                            credit.creditNoteNumber +
                            ' · ' +
                            credit.customerName +
                            ' · ' +
                            money(
                              credit.totalAmount,
                              credit.currency,
                            ),
                        }),
                      )
                  }
                  busy={
                    busy
                  }
                  onGenerate={
                    async (
                      sourceId,
                      profileId,
                    ) =>
                      run(
                        'generate_document',
                        {
                          documentKind:
                            'credit_note',
                          sourceId,
                          profileId,
                        },
                        'UBL credit-note document generated.',
                      )
                  }
                />
              </section>

              <section className="space-y-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
                <div>
                  <h3 className="text-sm font-black">
                    Fiscal document ledger
                  </h3>
                  <p className="mt-1 text-xs text-[var(--sami-text-muted)]">
                    Generated XML is immutable by source hash. Fix source/profile/participant data and regenerate rather than editing a stored fiscal document.
                  </p>
                </div>

                {
                  data.documents
                    .length
                    ? data.documents
                        .map(
                          document => (
                            <div
                              key={
                                document.id
                              }
                              className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3 sm:p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-black">
                                      {
                                        document.documentNumber ||
                                        document.documentUuid
                                      }
                                    </p>
                                    <Status value={document.validationStatus} />
                                    <Status value={document.transmissionStatus} />
                                  </div>
                                  <p className="mt-2 text-[11px] text-[var(--sami-text-muted)]">
                                    {
                                      document.customerName
                                    } · {
                                      document.profileName
                                    } · {
                                      document.network
                                    } · {
                                      document.syntax
                                    }
                                  </p>
                                  <p className="mt-1 break-all font-mono text-[10px] text-[var(--sami-text-muted)]">
                                    SHA-256: {
                                      document.xmlSha256
                                    }
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={secondaryButtonClass}
                                    onClick={
                                      async () => {
                                        await run(
                                          'mark_exported',
                                          {
                                            documentId:
                                              document.id,
                                          },
                                          'XML export recorded.',
                                        );

                                        window.location.href =
                                          '/api/apps/invoicing/e-invoicing/' +
                                          document.id +
                                          '/xml';
                                      }
                                    }
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    XML
                                  </button>

                                  {
                                    data.capabilities
                                      .canSubmit &&
                                    document
                                      .validationStatus ===
                                      'valid' &&
                                    ![
                                      'accepted',
                                    ].includes(
                                      document
                                        .transmissionStatus,
                                    ) &&
                                    (
                                      <button
                                        type="button"
                                        className={secondaryButtonClass}
                                        disabled={
                                          busy
                                        }
                                        onClick={
                                          () =>
                                            void run(
                                              'submit_document',
                                              {
                                                documentId:
                                                  document.id,
                                              },
                                              'Document sent to the configured provider adapter.',
                                            )
                                        }
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        Submit
                                      </button>
                                    )
                                  }
                                </div>
                              </div>

                              {
                                document
                                  .validationErrors
                                  .length >
                                0 &&
                                (
                                  <div className="mt-3 space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                                    <div className="flex items-center gap-2 text-xs font-black text-rose-700 dark:text-rose-300">
                                      <CircleAlert className="h-4 w-4" />
                                      Validation issues
                                    </div>
                                    {
                                      document
                                        .validationErrors
                                        .map(
                                          (
                                            issue,
                                            index,
                                          ) => (
                                            <p
                                              key={
                                                String(
                                                  issue.code ||
                                                  index,
                                                ) +
                                                index
                                              }
                                              className="text-[11px] leading-5 text-rose-700 dark:text-rose-200"
                                            >
                                              {
                                                issue.code ||
                                                'VALIDATION'
                                              } — {
                                                issue.message ||
                                                'Document validation failed.'
                                              }
                                            </p>
                                          ),
                                        )
                                    }
                                  </div>
                                )
                              }

                              <div className="mt-3 grid gap-2 text-[11px] text-[var(--sami-text-muted)] sm:grid-cols-2 lg:grid-cols-4">
                                <p>
                                  Attempts: {
                                    document.attemptCount
                                  }
                                </p>
                                <p>
                                  Provider: {
                                    document.providerStatus ||
                                    '—'
                                  }
                                </p>
                                <p>
                                  Accepted: {
                                    dateTime(
                                      document.acceptedAt,
                                    )
                                  }
                                </p>
                                <p>
                                  Created: {
                                    dateTime(
                                      document.createdAt,
                                    )
                                  }
                                </p>
                              </div>
                            </div>
                          ),
                        )
                    : (
                        <Empty text="Generate an invoice or credit-note fiscal document to start the ledger." />
                      )
                }
              </section>
            </div>
          )
        }
      </div>
    </>
  );
}


function DocumentGenerator({
  title,
  kind,
  profileId,
  profiles,
  options,
  busy,
  onGenerate,
}: {
  title:
    string;
  kind:
    'invoice' |
    'credit_note';
  profileId:
    string;
  profiles:
    WorkspaceData[
      'profiles'
    ];
  options:
    Array<{
      id: string;
      label: string;
    }>;
  busy:
    boolean;
  onGenerate:
    (
      sourceId:
        string,
      profileId:
        string,
    ) =>
      Promise<
        unknown
      >;
}) {
  return (
    <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <FileCode2 className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-black">
          {
            title
          }
        </h3>
      </div>

      <form
        className="mt-4 grid gap-3"
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

            const sourceId =
              String(
                form.get(
                  'sourceId',
                ) ||
                '',
              );

            const selectedProfile =
              String(
                form.get(
                  'profileId',
                ) ||
                '',
              );

            if (
              !sourceId ||
              !selectedProfile
            ) {
              return;
            }

            await onGenerate(
              sourceId,
              selectedProfile,
            );
          }
        }
      >
        <label className="text-xs font-bold">
          Fiscal profile
          <select
            name="profileId"
            required
            defaultValue={
              profileId
            }
            className={inputClass}
          >
            <option value="">
              Select profile
            </option>
            {
              profiles.map(
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
                    } · {
                      item.environment
                    }
                  </option>
                ),
              )
            }
          </select>
        </label>

        <label className="text-xs font-bold">
          {
            kind ===
              'invoice'
              ? 'Invoice'
              : 'Credit note'
          }
          <select
            name="sourceId"
            required
            className={inputClass}
          >
            <option value="">
              Select {
                kind ===
                  'invoice'
                  ? 'invoice'
                  : 'credit note'
              }
            </option>
            {
              options.map(
                option => (
                  <option
                    key={
                      option.id
                    }
                    value={
                      option.id
                    }
                  >
                    {
                      option.label
                    }
                  </option>
                ),
              )
            }
          </select>
        </label>

        <button
          type="submit"
          disabled={
            busy ||
            !profiles.length ||
            !options.length
          }
          className={buttonClass}
        >
          {
            busy
              ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )
              : (
                  <FileCode2 className="h-4 w-4" />
                )
          }
          Generate UBL XML
        </button>
      </form>
    </section>
  );
}
