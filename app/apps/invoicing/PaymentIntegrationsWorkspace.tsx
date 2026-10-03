'use client';

import Link from 'next/link';

import {
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Webhook,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const PROVIDER_KEY =
  'invoicing_payment_gateway';

type IntegrationProvider = {
  key: string;
  name: string;
  description: string;
  configured: boolean;
};

type IntegrationConnection = {
  id: string;
  providerKey: string;
  name: string;
  status: string;
  healthStatus: string;
  updatedAt: string;
};

type IntegrationWebhook = {
  id: string;
  providerKey: string;
  endpointPath: string;
  name: string;
  status: string;
  eventKeys: string[];
  lastReceivedAt: string | null;
};

type IntegrationDelivery = {
  id: string;
  endpointId: string;
  status: string;
  signatureValid: boolean;
  externalEventId: string | null;
  receivedAt: string;
  errorMessage: string | null;
};

type IntegrationState = {
  canManage: boolean;
  providers: IntegrationProvider[];
  connections: IntegrationConnection[];
  webhooks: IntegrationWebhook[];
  webhookDeliveries: IntegrationDelivery[];
};

function formatDate(
  value:
    string | null |
    undefined,
) {
  if (
    !value
  ) {
    return 'No verified payment received yet';
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
    return 'Unknown';
  }

  return date.toLocaleString();
}

export default function PaymentIntegrationsWorkspace() {
  const [
    state,
    setState,
  ] =
    useState<
      IntegrationState | null
    >(
      null,
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
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const load =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              '/api/workspace/integrations',
              {
                credentials:
                  'same-origin',
                cache:
                  'no-store',
              },
            );

          const body =
            await response
              .json()
              .catch(
                () => ({}),
              ) as
                Partial<
                  IntegrationState
                > & {
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
              'Payment integration status could not be loaded.',
            );
          }

          setState({
            canManage:
              body.canManage ===
              true,
            providers:
              body.providers ||
              [],
            connections:
              body.connections ||
              [],
            webhooks:
              body.webhooks ||
              [],
            webhookDeliveries:
              body.webhookDeliveries ||
              [],
          });
        } catch (
          caught
        ) {
          setError(
            caught instanceof
              Error
              ? caught.message
              : 'Payment integration status could not be loaded.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void load();
    },
    [
      load,
    ],
  );

  const provider =
    useMemo(
      () =>
        state
          ?.providers
          .find(
            item =>
              item.key ===
              PROVIDER_KEY,
          ) ||
        null,
      [
        state,
      ],
    );

  const connections =
    useMemo(
      () =>
        state
          ?.connections
          .filter(
            item =>
              item.providerKey ===
              PROVIDER_KEY &&
              item.status !==
                'revoked',
          ) ||
        [],
      [
        state,
      ],
    );

  const webhooks =
    useMemo(
      () =>
        state
          ?.webhooks
          .filter(
            item =>
              item.providerKey ===
              PROVIDER_KEY &&
              item.status ===
                'active',
          ) ||
        [],
      [
        state,
      ],
    );

  const endpointIds =
    useMemo(
      () =>
        new Set(
          webhooks.map(
            item =>
              item.id,
          ),
        ),
      [
        webhooks,
      ],
    );

  const latestDelivery =
    useMemo(
      () =>
        (
          state
            ?.webhookDeliveries ||
          []
        )
          .filter(
            item =>
              endpointIds
                .has(
                  item.endpointId,
                ),
          )
          .sort(
            (
              a,
              b,
            ) =>
              new Date(
                b.receivedAt,
              ).getTime() -
              new Date(
                a.receivedAt,
              ).getTime(),
          )[0] ||
        null,
      [
        endpointIds,
        state,
      ],
    );

  const active =
    connections.length >
      0 &&
    webhooks.length >
      0;

  return (
    <div className="space-y-4">
      <section className="sami-surface rounded-[22px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
              <CircleDollarSign className="h-4 w-4" />
              Automatic invoice settlement
            </div>

            <h2 className="mt-2 text-xl font-black tracking-[-0.03em]">
              Invoice Payment Gateway
            </h2>

            <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
              Connect a payment provider or provider bridge to send verified successful-payment events into SaMi. A valid event is matched to the current company invoice and recorded through the same protected payment ledger as a manual receipt.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                () =>
                  void load()
              }
              disabled={
                loading
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-50"
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
              Refresh
            </button>

            <Link
              href="/integrations?provider=invoicing_payment_gateway"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
            >
              <ExternalLink className="h-4 w-4" />
              Configure gateway
            </Link>
          </div>
        </div>
      </section>

      {
        error
          ? (
            <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 sm:p-5">
              <p className="text-sm font-black">
                Integration details are restricted
              </p>

              <p className="mt-1 text-xs leading-5">
                {
                  error
                }
              </p>

              <p className="mt-2 text-[11px] leading-5 opacity-80">
                An owner or user with Integrations access can configure the gateway. This does not disable ordinary manual payment recording in Invoicing.
              </p>
            </section>
          )
          : null
      }

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="Gateway provider"
          value={
            loading
              ? 'Checking…'
              : provider
                ? 'Available'
                : 'Unavailable'
          }
          detail={
            provider
              ?.description ||
            'The module-owned gateway provider must be available to this workspace.'
          }
          healthy={
            Boolean(
              provider,
            )
          }
        />

        <StatusCard
          label="Connection"
          value={
            loading
              ? 'Checking…'
              : connections.length >
                  0
                ? connections[0]
                    .status
                : 'Not connected'
          }
          detail={
            connections[0]
              ? connections[0]
                  .name +
                ' · ' +
                connections[0]
                  .healthStatus
              : 'Create the Invoice Payment Gateway webhook connection.'
          }
          healthy={
            connections.length >
            0
          }
        />

        <StatusCard
          label="Settlement webhook"
          value={
            loading
              ? 'Checking…'
              : webhooks.length >
                  0
                ? 'Active'
                : 'Not configured'
          }
          detail={
            webhooks[0]
              ? webhooks[0]
                  .eventKeys
                  .join(
                    ', ',
                  )
              : 'Expected event: invoicing.payment.succeeded'
          }
          healthy={
            webhooks.length >
            0
          }
        />

        <StatusCard
          label="Latest verified event"
          value={
            loading
              ? 'Checking…'
              : latestDelivery
                ? latestDelivery
                    .status
                : 'None yet'
          }
          detail={
            formatDate(
              latestDelivery
                ?.receivedAt,
            )
          }
          healthy={
            latestDelivery
              ?.signatureValid ===
            true &&
            latestDelivery
              ?.status !==
              'failed'
          }
        />
      </section>

      <section className="sami-surface rounded-[22px] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />

          <div>
            <h3 className="text-sm font-black">
              What SaMi accepts from a payment provider
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              The gateway event must be verified by the SaMi webhook runtime and normalized before settlement. It must identify the invoice and include a successful status, positive amount and matching invoice currency.
            </p>

            <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
              {
                [
                  'invoiceId or invoiceNumber',
                  'status: succeeded / paid / completed / success',
                  'amount greater than zero',
                  'currency matching the invoice',
                  'providerReference or reference',
                  'unique external event ID for idempotency',
                ].map(
                  item => (
                    <div
                      key={
                        item
                      }
                      className="flex items-start gap-2 rounded-xl bg-[var(--sami-surface-soft)] px-3 py-2"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>
                        {
                          item
                        }
                      </span>
                    </div>
                  ),
                )
              }
            </div>

            <p className="mt-3 text-[10px] leading-5 text-slate-400">
              This page exposes SaMi's current provider-neutral gateway bridge. Native provider-specific connectors can plug into the same settlement core without changing invoice accounting.
            </p>
          </div>
        </div>
      </section>

      {
        active
          ? (
            <section className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10 sm:p-5">
              <div className="flex items-start gap-3">
                <Webhook className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />

                <div>
                  <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                    Automatic settlement is connected
                  </p>

                  <p className="mt-1 text-xs leading-5 text-emerald-800/80 dark:text-emerald-200/80">
                    Verified payment events can now settle matching invoices automatically through the shared Invoicing payment core.
                  </p>
                </div>
              </div>
            </section>
          )
          : null
      }
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  healthy,
}: {
  label:
    string;
  value:
    string;
  detail:
    string;
  healthy:
    boolean;
}) {
  return (
    <div className="sami-surface rounded-[20px] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          {
            label
          }
        </p>

        <span
          className={[
            'h-2.5 w-2.5 rounded-full',
            healthy
              ? 'bg-emerald-500'
              : 'bg-slate-300 dark:bg-slate-600',
          ].join(
            ' ',
          )}
        />
      </div>

      <p className="mt-3 break-words text-lg font-black">
        {
          value
        }
      </p>

      <p className="mt-1 break-words text-[10px] leading-5 text-slate-500 dark:text-slate-400">
        {
          detail
        }
      </p>
    </div>
  );
}
