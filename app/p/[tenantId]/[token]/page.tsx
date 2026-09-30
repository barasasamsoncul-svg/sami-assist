import Link from 'next/link';

import {
  notFound,
} from 'next/navigation';

import CustomerPortalMessageForm from '@/app/p/[tenantId]/[token]/CustomerPortalMessageForm';

import {
  getCustomerPortal,
} from '@/lib/apps/invoicing/service';

import {
  InvoicingError,
} from '@/lib/apps/invoicing/context';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function formatMoney(
  value:
    number,
  currency:
    string,
) {
  try {
    return new Intl
      .NumberFormat(
        'en-KE',
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
      value
        .toLocaleString()
    );
  }
}


function formatDate(
  value:
    string |
    null,
) {
  if (
    !value
  ) {
    return '—';
  }

  const parsed =
    new Date(
      value.length ===
        10
        ? value +
          'T00:00:00Z'
        : value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl
    .DateTimeFormat(
      'en-KE',
      {
        dateStyle:
          'medium',
      },
    )
    .format(
      parsed,
    );
}


export default async function CustomerPortalPage({
  params,
}: {
  params:
    Promise<{
      tenantId:
        string;
      token:
        string;
    }>;
}) {
  const {
    tenantId,
    token,
  } =
    await params;

  let portal:
    Awaited<
      ReturnType<
        typeof getCustomerPortal
      >
    >;

  try {
    portal =
      await getCustomerPortal(
        tenantId,
        token,
      );
  } catch (
    error
  ) {
    if (
      error instanceof
        InvoicingError &&
      error.code ===
        'PORTAL_NOT_FOUND'
    ) {
      notFound();
    }

    throw error;
  }

  const currency =
    portal.customer
      .currency ||
    portal.invoices[0]
      ?.currency ||
    'KES';

  const openInvoices =
    portal.invoices.filter(
      invoice =>
        invoice.balanceDue >
        0,
    );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            {
              portal.company
                .logoUrl &&
              (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    portal.company
                      .logoUrl
                  }
                  alt=""
                  className="h-11 w-11 rounded-xl border border-slate-200 bg-white object-contain p-1"
                />
              )
            }

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                Customer portal
              </p>
              <h1 className="text-lg font-black">
                {
                  portal.company
                    .name
                }
              </h1>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-black">
              {
                portal.customer
                  .name
              }
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-600">
              Secure access until {
                formatDate(
                  portal.access
                    .expiresAt,
                )
              }
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              Outstanding
            </p>
            <p className="mt-2 text-xl font-black">
              {
                formatMoney(
                  portal.summary
                    .outstandingTotal,
                  currency,
                )
              }
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              Open invoices
            </p>
            <p className="mt-2 text-xl font-black">
              {
                openInvoices.length
              }
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              Paid
            </p>
            <p className="mt-2 text-xl font-black">
              {
                formatMoney(
                  portal.summary
                    .paidTotal,
                  currency,
                )
              }
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              Credits
            </p>
            <p className="mt-2 text-xl font-black">
              {
                formatMoney(
                  portal.summary
                    .creditedTotal,
                  currency,
                )
              }
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
            <p className="text-sm font-black">
              Invoices
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Review balances, due dates and payment status. Open an invoice for its full document and PDF.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {
              portal.invoices
                .map(
                  invoice => (
                    <div
                      key={
                        invoice.id
                      }
                      className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_130px_150px_120px] sm:items-center sm:px-5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={
                            '/p/' +
                            encodeURIComponent(
                              tenantId,
                            ) +
                            '/' +
                            encodeURIComponent(
                              token,
                            ) +
                            '/invoices/' +
                            encodeURIComponent(
                              invoice.id,
                            )
                          }
                          className="font-black text-blue-700 hover:underline"
                        >
                          {
                            invoice.invoiceNumber
                          }
                        </Link>
                        <p className="mt-1 text-[10px] font-semibold text-slate-600">
                          Issued {
                            formatDate(
                              invoice.invoiceDate,
                            )
                          } · due {
                            formatDate(
                              invoice.dueDate,
                            )
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Status
                        </p>
                        <p className="mt-1 text-xs font-bold capitalize">
                          {
                            invoice.status
                              .replaceAll(
                                '_',
                                ' ',
                              )
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
                          Balance
                        </p>
                        <p className="mt-1 text-xs font-black">
                          {
                            formatMoney(
                              invoice.balanceDue,
                              invoice.currency,
                            )
                          }
                        </p>
                      </div>

                      <Link
                        href={
                          '/p/' +
                          encodeURIComponent(
                            tenantId,
                          ) +
                          '/' +
                          encodeURIComponent(
                            token,
                          ) +
                          '/invoices/' +
                          encodeURIComponent(
                            invoice.id,
                          )
                        }
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-800 hover:bg-slate-50"
                      >
                        View invoice
                      </Link>
                    </div>
                  ),
                )
            }

            {
              portal.invoices
                .length ===
                0 &&
              (
                <p className="px-5 py-10 text-center text-sm text-slate-600">
                  No customer-visible invoices are available yet.
                </p>
              )
            }
          </div>
        </section>

        {
          portal.paymentPlans.length >
            0 &&
          (
            <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-sm font-black">
                Payment plans
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Follow your agreed installment schedule and see how recorded payments and credits have reduced each amount.
              </p>

              <div className="mt-4 space-y-3">
                {
                  portal.paymentPlans.map(
                    plan => (
                      <div
                        key={
                          plan.planNumber
                        }
                        className="rounded-2xl border border-slate-200 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-black">
                              {
                                plan.planNumber
                              } · {
                                plan.invoiceNumber
                              }
                            </p>
                            <p className="mt-1 text-[10px] text-slate-600">
                              {
                                plan.name
                              } · {
                                plan.paidInstallments
                              }/{plan.installmentCount} installments paid
                            </p>
                          </div>
                          <div className="sm:text-right">
                            <p className="text-xs font-black">
                              {
                                formatMoney(
                                  plan.balanceDue,
                                  plan.currency,
                                )
                              } remaining
                            </p>
                            <p className="mt-1 text-[10px] capitalize text-slate-600">
                              {
                                plan.status
                              }{
                                plan.nextDueDate
                                  ? ' · next ' +
                                    formatDate(
                                      plan.nextDueDate,
                                    )
                                  : ''
                              }
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[620px] text-left text-[10px]">
                            <thead className="bg-slate-50 font-black uppercase tracking-[0.08em] text-slate-500">
                              <tr>
                                <th className="px-2 py-2">#</th>
                                <th className="px-2 py-2">Installment</th>
                                <th className="px-2 py-2">Due</th>
                                <th className="px-2 py-2">Amount</th>
                                <th className="px-2 py-2">Balance</th>
                                <th className="px-2 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {
                                plan.installments.map(
                                  (
                                    installment: {
                                      sequenceNo:
                                        number;
                                      label:
                                        string |
                                        null;
                                      dueDate:
                                        string;
                                      amount:
                                        number;
                                      paidAmount:
                                        number;
                                      balanceDue:
                                        number;
                                      status:
                                        string;
                                    },
                                  ) => (
                                    <tr
                                      key={
                                        installment.sequenceNo
                                      }
                                    >
                                      <td className="px-2 py-2 font-black">
                                        {
                                          installment.sequenceNo
                                        }
                                      </td>
                                      <td className="px-2 py-2">
                                        {
                                          installment.label ||
                                          'Installment ' +
                                          installment.sequenceNo
                                        }
                                      </td>
                                      <td className="px-2 py-2">
                                        {
                                          formatDate(
                                            installment.dueDate,
                                          )
                                        }
                                      </td>
                                      <td className="px-2 py-2">
                                        {
                                          formatMoney(
                                            installment.amount,
                                            plan.currency,
                                          )
                                        }
                                      </td>
                                      <td className="px-2 py-2 font-black">
                                        {
                                          formatMoney(
                                            installment.balanceDue,
                                            plan.currency,
                                          )
                                        }
                                      </td>
                                      <td className="px-2 py-2 capitalize">
                                        {
                                          installment.status
                                            .replaceAll(
                                              '_',
                                              ' ',
                                            )
                                        }
                                      </td>
                                    </tr>
                                  ),
                                )
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ),
                  )
                }
              </div>
            </section>
          )
        }

        {
          portal.settings
            .paymentInstructions &&
          (
            <section className="rounded-[24px] border border-blue-200 bg-blue-50 p-4 sm:p-5">
              <p className="text-sm font-black text-blue-950">
                Payment instructions
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-900">
                {
                  portal.settings
                    .paymentInstructions
                }
              </p>
            </section>
          )
        }

        <div className="grid gap-5 xl:grid-cols-2">
          {
            portal.settings
              .showPaymentHistory &&
            (
              <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-black">
                  Payment history
                </p>

                <div className="mt-3 space-y-2">
                  {
                    portal.payments.map(
                      payment => (
                        <div
                          key={
                            payment.id
                          }
                          className="rounded-2xl border border-slate-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-black">
                                {
                                  payment.paymentNumber
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-600">
                                {
                                  formatDate(
                                    payment.paymentDate,
                                  )
                                } · {
                                  payment.method
                                }
                              </p>
                            </div>

                            <p className="text-xs font-black">
                              {
                                formatMoney(
                                  payment.allocatedAmount,
                                  payment.currency,
                                )
                              }
                            </p>
                          </div>

                          {
                            payment.reference &&
                            (
                              <p className="mt-2 text-[10px] text-slate-600">
                                Reference: {
                                  payment.reference
                                }
                              </p>
                            )
                          }

                          <p className="mt-2 text-[10px] font-semibold text-slate-600">
                            Applied to {
                              payment.invoices
                                .map(
                                  (
                                    invoice: {
                                      invoiceNumber:
                                        string;
                                    },
                                  ) =>
                                    invoice.invoiceNumber,
                                )
                                .join(
                                  ', ',
                                ) ||
                              'invoice balance'
                            }
                          </p>
                        </div>
                      ),
                    )
                  }

                  {
                    portal.payments.length ===
                      0 &&
                    (
                      <p className="py-6 text-center text-xs text-slate-600">
                        No posted invoice payments yet.
                      </p>
                    )
                  }
                </div>
              </section>
            )
          }

          {
            portal.settings
              .showCreditNotes &&
            (
              <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-black">
                  Credits
                </p>

                <div className="mt-3 space-y-2">
                  {
                    portal.creditNotes.map(
                      credit => (
                        <div
                          key={
                            credit.id
                          }
                          className="rounded-2xl border border-slate-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-black">
                                {
                                  credit.creditNoteNumber
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-600">
                                {
                                  credit.invoiceNumber
                                } · {
                                  formatDate(
                                    credit.issueDate,
                                  )
                                }
                              </p>
                            </div>

                            <p className="text-xs font-black">
                              {
                                formatMoney(
                                  credit.amount,
                                  credit.currency,
                                )
                              }
                            </p>
                          </div>

                          <p className="mt-2 text-[10px] text-slate-600">
                            {
                              credit.reason
                            }
                          </p>
                        </div>
                      ),
                    )
                  }

                  {
                    portal.creditNotes.length ===
                      0 &&
                    (
                      <p className="py-6 text-center text-xs text-slate-600">
                        No credit notes are available.
                      </p>
                    )
                  }
                </div>
              </section>
            )
          }
        </div>

        {
          portal.settings
            .allowMessages &&
          (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-black">
                  Billing messages
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Questions and replies stay attached to your billing account.
                </p>

                <div className="mt-3 space-y-2">
                  {
                    portal.messages
                      .map(
                        message => (
                          <div
                            key={
                              message.id
                            }
                            className={[
                              'rounded-2xl border p-3',
                              message.direction ===
                                'customer_to_business'
                                ? 'border-blue-200 bg-blue-50'
                                : 'border-slate-200 bg-slate-50',
                            ].join(
                              ' ',
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                                {
                                  message.direction ===
                                    'customer_to_business'
                                    ? 'You'
                                    : portal.company
                                        .name
                                } · {
                                  message.category
                                    .replaceAll(
                                      '_',
                                      ' ',
                                    )
                                }
                              </p>
                              <p className="text-[9px] font-semibold text-slate-500">
                                {
                                  formatDate(
                                    message.createdAt,
                                  )
                                }
                              </p>
                            </div>

                            {
                              message.subject &&
                              (
                                <p className="mt-2 text-xs font-black">
                                  {
                                    message.subject
                                  }
                                </p>
                              )
                            }

                            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700">
                              {
                                message.body
                              }
                            </p>

                            {
                              message.promisedAmount !==
                                null &&
                              (
                                <p className="mt-2 text-[10px] font-black text-emerald-700">
                                  Payment promise: {
                                    formatMoney(
                                      message.promisedAmount,
                                      currency,
                                    )
                                  } by {
                                    formatDate(
                                      message.promisedDate,
                                    )
                                  }
                                </p>
                              )
                            }
                          </div>
                        ),
                      )
                  }

                  {
                    portal.messages.length ===
                      0 &&
                    (
                      <p className="py-6 text-center text-xs text-slate-600">
                        No billing messages yet.
                      </p>
                    )
                  }
                </div>
              </section>

              <CustomerPortalMessageForm
                tenantId={
                  tenantId
                }
                token={
                  token
                }
                invoices={
                  portal.invoices.map(
                    invoice => ({
                      id:
                        invoice.id,
                      invoiceNumber:
                        invoice.invoiceNumber,
                      balanceDue:
                        invoice.balanceDue,
                      currency:
                        invoice.currency,
                    }),
                  )
                }
              />
            </div>
          )
        }

        <footer className="pb-4 pt-2 text-center text-[10px] font-semibold text-slate-500">
          Secure SaMi customer portal · Access is customer-scoped and can be revoked by {
            portal.company
              .name
          }.
        </footer>
      </div>
    </main>
  );
}
