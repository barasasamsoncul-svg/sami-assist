import {
  notFound,
} from 'next/navigation';

import {
  getPublicInvoice,
  InvoicingError,
} from '@/lib/apps/invoicing/service';


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


export default async function PublicInvoicePage({
  params,
}: {
  params:
    Promise<{
      tenantId: string;
      token: string;
    }>;
}) {
  const {
    tenantId,
    token,
  } =
    await params;

  let invoice:
    Awaited<
      ReturnType<
        typeof getPublicInvoice
      >
    >;

  try {
    invoice =
      await getPublicInvoice(
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
        'INVOICE_NOT_FOUND'
    ) {
      notFound();
    }

    throw error;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-950 sm:px-6 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]"
              style={{
                color:
                  invoice.template
                    .primaryColor,
              }}>
              SaMi secure invoice
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-500">
              Use your browser Print command to save this invoice as PDF.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={
                '/i/' +
                tenantId +
                '/' +
                token +
                '/pdf'
              }
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"
            >
              Open PDF
            </a>

            <span
              className="rounded-xl px-3 py-2 text-xs font-black text-white"
              style={{
                backgroundColor:
                  invoice.template
                    .secondaryColor,
              }}
            >
              {
                invoice.status
                  .replaceAll(
                    '_',
                    ' ',
                  )
              }
            </span>
          </div>
        </div>

        <article
          className={[
            'bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-10 print:rounded-none print:p-0 print:shadow-none',
            invoice.template.layout ===
              'compact'
              ? 'rounded-xl'
              : invoice.template.layout ===
                  'classic'
                ? 'rounded-none border-t-4'
                : 'rounded-[28px] border-t-4',
          ].join(
            ' ',
          )}
          style={{
            borderTopColor:
              invoice.template
                .primaryColor,
            fontFamily:
              invoice.template
                .fontFamily +
              ', Arial, sans-serif',
          }}
        >
          <header className="flex flex-col gap-7 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {
                invoice.template
                  .showCompanyLogo &&
                invoice
                  .company
                  .logoUrl
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        invoice
                          .company
                          .logoUrl
                      }
                      alt=""
                      className="mb-4 max-h-16 max-w-[190px] object-contain"
                    />
                  )
                  : null
              }

              <h1 className="text-2xl font-black tracking-[-0.03em]">
                {
                  invoice
                    .company
                    .name
                }
              </h1>

              {
                invoice.template
                  .showCompanyAddress &&
                invoice
                  .company
                  .address &&
                (
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    {
                      invoice
                        .company
                        .address
                    }
                  </p>
                )
              }

              {
                invoice.template
                  .showCompanyContact &&
                (
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                {
                  invoice
                    .company
                    .email &&
                  (
                    <p>
                      {
                        invoice
                          .company
                          .email
                      }
                    </p>
                  )
                }

                {
                  invoice
                    .company
                    .phone &&
                  (
                    <p>
                      {
                        invoice
                          .company
                          .phone
                      }
                    </p>
                  )
                }

                {
                  invoice.template
                    .showTaxId &&
                  invoice
                    .company
                    .taxId &&
                  (
                    <p>
                      Tax / PIN: {
                        invoice
                          .company
                          .taxId
                      }
                    </p>
                  )
                }
                  </div>
                )
              }
            </div>

            <div className="sm:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.14em]"
              style={{
                color:
                  invoice.template
                    .primaryColor,
              }}>
                Invoice
              </p>

              <p className="mt-1 text-2xl font-black">
                {
                  invoice
                    .invoiceNumber
                }
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Issued {
                  invoice
                    .invoiceDate
                }
              </p>

              <p className="text-sm text-slate-500">
                Due {
                  invoice
                    .dueDate
                }
              </p>
            </div>
          </header>

          <section className="grid gap-6 py-8 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Bill to
              </p>

              <p className="mt-2 text-lg font-black">
                {
                  invoice
                    .customer
                    .name
                }
              </p>

              {
                invoice
                  .customer
                  .email &&
                (
                  <p className="mt-1 text-sm text-slate-500">
                    {
                      invoice
                        .customer
                        .email
                    }
                  </p>
                )
              }

              {
                invoice
                  .customer
                  .billingAddress &&
                (
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-500">
                    {
                      invoice
                        .customer
                        .billingAddress
                    }
                  </p>
                )
              }
            </div>

            <div className="sm:text-right">
              {
                invoice
                  .reference &&
                (
                  <p className="text-sm">
                    <span className="text-slate-400">
                      Reference:
                    </span>{' '}
                    <strong>
                      {
                        invoice
                          .reference
                      }
                    </strong>
                  </p>
                )
              }

              {
                invoice
                  .purchaseOrderNumber &&
                (
                  <p className="mt-1 text-sm">
                    <span className="text-slate-400">
                      PO:
                    </span>{' '}
                    <strong>
                      {
                        invoice
                          .purchaseOrderNumber
                      }
                    </strong>
                  </p>
                )
              }
            </div>
          </section>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-y border-slate-200 text-[10px] uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="py-3 pr-3">
                    Description
                  </th>

                  <th className="px-3 py-3 text-right">
                    Qty
                  </th>

                  <th className="px-3 py-3 text-right">
                    Price
                  </th>

                  <th className="px-3 py-3 text-right">
                    Tax
                  </th>

                  <th className="py-3 pl-3 text-right">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                {
                  invoice
                    .lines
                    .map(
                      (
                        line,
                        index,
                      ) => (
                        <tr
                          key={
                            index
                          }
                          className="border-b border-slate-100"
                        >
                          <td className="py-4 pr-3">
                            <p className="font-bold">
                              {
                                line
                                  .description
                              }
                            </p>

                            {
                              line
                                .sku &&
                              (
                                <p className="mt-1 text-xs text-slate-400">
                                  {
                                    line
                                      .sku
                                  }
                                </p>
                              )
                            }
                          </td>

                          <td className="px-3 py-4 text-right">
                            {
                              line
                                .quantity
                            }
                          </td>

                          <td className="px-3 py-4 text-right">
                            {
                              formatMoney(
                                line
                                  .unitPrice,
                                invoice
                                  .currency,
                              )
                            }
                          </td>

                          <td className="px-3 py-4 text-right">
                            {
                              line
                                .taxRate
                            }%
                          </td>

                          <td className="py-4 pl-3 text-right font-black">
                            {
                              formatMoney(
                                line
                                  .lineTotal,
                                invoice
                                  .currency,
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

          <section className="mt-8 flex justify-end">
            <div className="w-full max-w-sm space-y-2">
              <TotalRow
                label="Subtotal"
                value={
                  formatMoney(
                    invoice
                      .subtotal,
                    invoice
                      .currency,
                  )
                }
              />

              {
                invoice.template
                  .showDiscount &&
                invoice
                  .discountTotal >
                  0 &&
                (
                  <TotalRow
                    label="Discount"
                    value={
                      '− ' +
                      formatMoney(
                        invoice
                          .discountTotal,
                        invoice
                          .currency,
                      )
                    }
                  />
                )
              }

              {
                invoice.template
                  .showTaxBreakdown &&
                (
              <TotalRow
                label="Tax"
                value={
                  formatMoney(
                    invoice
                      .taxTotal,
                    invoice
                      .currency,
                  )
                }
              />
                )
              }

              {
                invoice
                  .shippingTotal >
                  0 &&
                (
                  <TotalRow
                    label="Shipping"
                    value={
                      formatMoney(
                        invoice
                          .shippingTotal,
                        invoice
                          .currency,
                      )
                    }
                  />
                )
              }

              <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Total
                  </p>

                  <p className="mt-1 text-2xl font-black">
                    {
                      formatMoney(
                        invoice
                          .totalAmount,
                        invoice
                          .currency,
                      )
                    }
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Balance due
                  </p>

                  <p
                    className="mt-1 text-lg font-black"
                    style={{
                      color:
                        invoice.template
                          .primaryColor,
                    }}
                  >
                    {
                      formatMoney(
                        invoice
                          .balanceDue,
                        invoice
                          .currency,
                      )
                    }
                  </p>
                </div>
              </div>
            </div>
          </section>

          {
            (
              invoice
                .paymentInstructions ||
              invoice
                .notes ||
              invoice
                .terms
            ) &&
            (
              <section className="mt-10 grid gap-5 border-t border-slate-200 pt-7 sm:grid-cols-2">
                {
                  invoice.template
                    .showPaymentInstructions &&
                  invoice
                    .paymentInstructions &&
                  (
                    <CopyBlock
                      title="Payment instructions"
                      value={
                        invoice
                          .paymentInstructions
                      }
                    />
                  )
                }

                {
                  invoice
                    .notes &&
                  (
                    <CopyBlock
                      title="Notes"
                      value={
                        invoice
                          .notes
                      }
                    />
                  )
                }

                {
                  (
                    invoice.template
                      .termsText ||
                    invoice
                      .terms
                  ) &&
                  (
                    <div className="sm:col-span-2">
                      <CopyBlock
                        title="Terms"
                        value={
                          invoice.template
                            .termsText ||
                          invoice
                            .terms ||
                          ''
                        }
                      />
                    </div>
                  )
                }
              </section>
            )
          }
        </article>

        <p className="mt-4 text-center text-[11px] text-slate-400 print:hidden">
          {
            invoice.template
              .footerText ||
            'Generated and delivered securely through SaMi.'
          }
        </p>
      </div>
    </main>
  );
}


function TotalRow({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">
        {
          label
        }
      </span>

      <span className="font-bold">
        {
          value
        }
      </span>
    </div>
  );
}


function CopyBlock({
  title,
  value,
}: {
  title:
    string;
  value:
    string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
        {
          title
        }
      </p>

      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
        {
          value
        }
      </p>
    </div>
  );
}
