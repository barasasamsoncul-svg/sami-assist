'use client';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type Runner = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


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
    : parsed.toLocaleString();
}


function statusClass(
  status:
    string,
) {
  switch (
    status
  ) {
    case 'accepted':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'failed':
    case 'rejected':
      return 'bg-red-500/10 text-red-700 dark:text-red-300';
    case 'submitting':
      return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
    default:
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
}


export default function EtimsWorkspace({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    Runner;
}) {
  const settings =
    data.etimsSettings;

  const documents =
    data.etimsDocuments;

  const accepted =
    documents.filter(
      item =>
        item.status ===
        'accepted',
    ).length;

  const attention =
    documents.filter(
      item =>
        item.status ===
          'failed' ||
        item.status ===
          'rejected',
    ).length;

  const queued =
    documents.filter(
      item =>
        item.status ===
          'queued' ||
        item.status ===
          'submitting',
    ).length;

  const documentByInvoice =
    new Map(
      documents
        .filter(
          item =>
            Boolean(
              item.invoiceId,
            ),
        )
        .map(
          item => [
            item.invoiceId as string,
            item,
          ],
        ),
    );

  const eligibleInvoices =
    data.invoices
      .filter(
        invoice =>
          [
            'confirmed',
            'sent',
            'viewed',
            'partially_paid',
            'paid',
            'overdue',
          ].includes(
            invoice.status,
          ),
      )
      .filter(
        invoice =>
          !documentByInvoice
            .get(
              invoice.id,
            ) ||
          [
            'failed',
            'rejected',
            'queued',
          ].includes(
            documentByInvoice
              .get(
                invoice.id,
              )
              ?.status ||
            '',
          ),
      )
      .slice(
        0,
        100,
      );

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Company eTIMS
          </p>
          <p className="mt-2 text-xl font-black">
            {
              settings.enabled
                ? 'Enabled'
                : 'Disabled'
            }
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {
              settings.controlUnitType
                .toUpperCase()
            } · {
              settings.environment
            }
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Transport
          </p>
          <p className="mt-2 text-xl font-black">
            {
              settings.providerConfigured
                ? 'Ready'
                : 'Not configured'
            }
          </p>
          <p className="mt-1 break-all text-xs text-slate-500">
            {
              settings.provider
            } · {
              settings.endpointHost ||
              'no endpoint'
            }
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Accepted
          </p>
          <p className="mt-2 text-xl font-black text-emerald-700 dark:text-emerald-300">
            {accepted}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Fiscal receipts with CU evidence.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Queue health
          </p>
          <p className="mt-2 text-xl font-black">
            {queued} pending
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {attention} need attention.
          </p>
        </div>
      </section>

      {
        data.capabilities
          .canManageSettings &&
        (
          <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5">
            <div>
              <h3 className="text-sm font-black">
                Kenya eTIMS configuration
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Configure the company fiscal identity here. Transport credentials remain server-side environment variables and are never shown to users.
              </p>
            </div>

            <form
              className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={
                async event => {
                  event.preventDefault();

                  const form =
                    new FormData(
                      event.currentTarget,
                    );

                  await run(
                    {
                      action:
                        'save_etims_settings',
                      enabled:
                        form.get(
                          'enabled',
                        ) ===
                        'on',
                      environment:
                        form.get(
                          'environment',
                        ),
                      controlUnitType:
                        form.get(
                          'controlUnitType',
                        ),
                      taxpayerPin:
                        form.get(
                          'taxpayerPin',
                        ),
                      branchId:
                        form.get(
                          'branchId',
                        ),
                      deviceSerial:
                        form.get(
                          'deviceSerial',
                        ),
                      requireFiscalizationBeforeDelivery:
                        form.get(
                          'requireFiscalizationBeforeDelivery',
                        ) ===
                        'on',
                      autoQueueOnConfirmation:
                        form.get(
                          'autoQueueOnConfirmation',
                        ) ===
                        'on',
                    },
                    'eTIMS settings saved.',
                  );
                }
              }
            >
              <label className="text-xs font-bold">
                KRA PIN
                <input
                  name="taxpayerPin"
                  defaultValue={
                    settings.taxpayerPin ||
                    ''
                  }
                  maxLength={20}
                  placeholder="PXXXXXXXXX"
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 uppercase"
                />
              </label>

              <label className="text-xs font-bold">
                Environment
                <select
                  name="environment"
                  defaultValue={
                    settings.environment
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3"
                >
                  <option value="sandbox">
                    Sandbox / certification
                  </option>
                  <option value="production">
                    Production
                  </option>
                </select>
              </label>

              <label className="text-xs font-bold">
                Control unit
                <select
                  name="controlUnitType"
                  defaultValue={
                    settings.controlUnitType
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3"
                >
                  <option value="oscu">
                    OSCU
                  </option>
                  <option value="vscu">
                    VSCU
                  </option>
                </select>
              </label>

              <label className="text-xs font-bold">
                Branch ID
                <input
                  name="branchId"
                  defaultValue={
                    settings.branchId ||
                    ''
                  }
                  maxLength={40}
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                />
              </label>

              <label className="text-xs font-bold md:col-span-2">
                Device / control-unit serial
                <input
                  name="deviceSerial"
                  defaultValue={
                    settings.deviceSerial ||
                    ''
                  }
                  maxLength={120}
                  className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={
                    settings.enabled
                  }
                />
                Enable eTIMS
              </label>

              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  name="autoQueueOnConfirmation"
                  type="checkbox"
                  defaultChecked={
                    settings.autoQueueOnConfirmation
                  }
                />
                Queue when invoice is confirmed
              </label>

              <label className="flex items-center gap-2 text-xs font-bold md:col-span-2">
                <input
                  name="requireFiscalizationBeforeDelivery"
                  type="checkbox"
                  defaultChecked={
                    settings.requireFiscalizationBeforeDelivery
                  }
                />
                Block official invoice delivery until fiscalization is accepted
              </label>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
                >
                  Save eTIMS settings
                </button>
              </div>
            </form>
          </section>
        )
      }

      <section className="overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)]">
        <div className="border-b border-[var(--sami-border)] px-5 py-4">
          <h3 className="text-sm font-black">
            Fiscalization queue
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Submitted receipts keep their request hash, response evidence and attempt history. Rejected or failed documents can be retried after correction.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-xs">
            <thead className="bg-[var(--sami-surface-soft)] text-[10px] uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Invoice
                </th>
                <th className="px-4 py-3">
                  Status
                </th>
                <th className="px-4 py-3">
                  CU invoice
                </th>
                <th className="px-4 py-3">
                  SCU ID
                </th>
                <th className="px-4 py-3">
                  Attempts
                </th>
                <th className="px-4 py-3">
                  Fiscalized
                </th>
                <th className="px-4 py-3">
                  Response
                </th>
                <th className="px-4 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {
                documents.map(
                  document => (
                    <tr
                      key={
                        document.id
                      }
                      className="border-t border-[var(--sami-border)]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-black">
                          {
                            document.invoiceNumber ||
                            '—'
                          }
                        </p>
                        <p className="mt-1 text-slate-500">
                          {
                            document.customerName ||
                            'Unknown customer'
                          }
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            'rounded-full px-2 py-1 text-[10px] font-black uppercase',
                            statusClass(
                              document.status,
                            ),
                          ].join(
                            ' ',
                          )}
                        >
                          {
                            document.status
                          }
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {
                          document.cuInvoiceNumber ||
                          '—'
                        }
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {
                          document.scuId ||
                          '—'
                        }
                      </td>
                      <td className="px-4 py-3">
                        {
                          document.attemptCount
                        }
                      </td>
                      <td className="px-4 py-3">
                        {
                          dateTime(
                            document.fiscalizedAt,
                          )
                        }
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate font-bold">
                          {
                            document.responseCode ||
                            '—'
                          }
                        </p>
                        <p className="mt-1 line-clamp-2 text-slate-500">
                          {
                            document.responseMessage ||
                            (
                              document.status ===
                                'accepted'
                                ? 'Fiscal evidence accepted.'
                                : 'No provider response yet.'
                            )
                          }
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {
                          document.invoiceId &&
                          document.status !==
                            'accepted' &&
                          data.capabilities
                            .canConfirm
                            ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={
                                  () =>
                                    run(
                                      {
                                        action:
                                          'fiscalize_etims',
                                        invoiceId:
                                          document.invoiceId,
                                      },
                                      document.status ===
                                        'failed' ||
                                      document.status ===
                                        'rejected'
                                        ? 'eTIMS retry completed.'
                                        : 'eTIMS fiscalization completed.',
                                    )
                                }
                                className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                              >
                                {
                                  document.status ===
                                    'failed' ||
                                  document.status ===
                                    'rejected'
                                    ? 'Retry'
                                    : 'Fiscalize'
                                }
                              </button>
                            )
                            : (
                              <span className="text-[10px] text-slate-400">
                                {
                                  document.status ===
                                    'accepted'
                                    ? 'Locked'
                                    : '—'
                                }
                              </span>
                            )
                        }
                      </td>
                    </tr>
                  ),
                )
              }

              {
                documents.length ===
                  0 &&
                (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No eTIMS fiscalization records yet.
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5">
        <h3 className="text-sm font-black">
          Ready to fiscalize
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Confirmed invoices appear here until eTIMS acceptance is complete.
        </p>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {
            eligibleInvoices.map(
              invoice => {
                const existing =
                  documentByInvoice.get(
                    invoice.id,
                  );

                return (
                  <div
                    key={
                      invoice.id
                    }
                    className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black">
                        {
                          invoice.invoiceNumber
                        } · {
                          invoice.customerName
                        }
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {
                          invoice.currency
                        } {
                          invoice.totalAmount
                            .toLocaleString()
                        } · {
                          existing
                            ? existing.status
                            : 'not submitted'
                        }
                      </p>
                    </div>

                    {
                      data.capabilities
                        .canConfirm &&
                      (
                        <button
                          type="button"
                          disabled={
                            pending ||
                            !settings.enabled
                          }
                          onClick={
                            () =>
                              run(
                                {
                                  action:
                                    'fiscalize_etims',
                                  invoiceId:
                                    invoice.id,
                                },
                                'eTIMS fiscalization completed.',
                              )
                          }
                          className="h-9 shrink-0 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-50"
                        >
                          Fiscalize
                        </button>
                      )
                    }
                  </div>
                );
              },
            )
          }

          {
            eligibleInvoices.length ===
              0 &&
            (
              <p className="text-xs text-slate-500">
                No confirmed invoices are waiting for fiscalization.
              </p>
            )
          }
        </div>
      </section>
    </div>
  );
}
