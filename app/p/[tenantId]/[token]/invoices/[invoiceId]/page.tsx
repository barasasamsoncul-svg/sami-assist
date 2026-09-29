import Link from 'next/link';

import {
  notFound,
} from 'next/navigation';

import {
  getCustomerPortalInvoice,
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


export default async function CustomerPortalInvoicePage({
  params,
}: {
  params:
    Promise<{
      tenantId:
        string;
      token:
        string;
      invoiceId:
        string;
    }>;
}) {
  const {
    tenantId,
    token,
    invoiceId,
  } =
    await params;

  let invoice:
    Awaited<
      ReturnType<
        typeof getCustomerPortalInvoice
      >
    >;

  try {
    invoice =
      await getCustomerPortalInvoice(
        tenantId,
        token,
        invoiceId,
      );
  } catch (
    error
  ) {
    if (
      error instanceof
        InvoicingError &&
      [
        'PORTAL_NOT_FOUND',
        'INVOICE_NOT_FOUND',
      ].includes(
        error.code,
      )
    ) {
      notFound();
    }

    throw error;
  }

  const backHref =
    '/p/' +
    encodeURIComponent(
      tenantId,
    ) +
    '/' +
    encodeURIComponent(
      token,
    );

  const pdfHref =
    backHref +
    '/invoices/' +
    encodeURIComponent(
      invoiceId,
    ) +
    '/pdf';

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-5 text-slate-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={
              backHref
            }
            className="text-xs font-black text-blue-700 hover:underline"
          >
            ← Back to customer portal
          </Link>

          <a
            href={
              pdfHref
            }
            className="inline-flex h-10 w-fit items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Open PDF
          </a>
        </div>

        <article
          className={[
            'bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-9',
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
          <header className="flex flex-col gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {
                invoice.template
                  .showCompanyLogo &&
                invoice.company
                  .logoUrl &&
                (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      invoice.company
                        .logoUrl
                    }
                    alt=""
                    className="mb-4 max-h-16 max-w-[190px] object-contain"
                  />
                )
              }

              <h1 className="text-2xl font-black tracking-[-0.03em]">
                {
                  invoice.company
                    .name
                }
              </h1>

              {
                invoice.template
                  .showCompanyAddress &&
                invoice.company
                  .address &&
                (
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                    {
                      invoice.company
                        .address
                    }
                  </p>
                )
              }

              {
                invoice.template
                  .showCompanyContact &&
                (
                  <div className="mt-2 text-xs leading-5 text-slate-600">
                    {
                      invoice.company
                        .email &&
                      (
                        <p>
                          {
                            invoice.company
                              .email
                          }
                        </p>
                      )
                    }
                    {
                      invoice.company
                        .phone &&
                      (
                        <p>
                          {
                            invoice.company
                              .phone
                          }
                        </p>
                      )
                    }
                    {
                      invoice.template
                        .showTaxId &&
                      invoice.company
                        .taxId &&
                      (
                        <p>
                          Tax / PIN: {
                            invoice.company
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
              <p
                className="text-[10px] font-black uppercase tracking-[0.14em]"
                style={{
                  color:
                    invoice.template
                      .primaryColor,
                }}
              >
                Invoice
              </p>
              <p className="mt-1 text-2xl font-black">
                {
                  invoice.invoiceNumber
                }
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Issued {
                  invoice.invoiceDate
                }
              </p>
              <p className="text-sm text-slate-600">
                Due {
                  invoice.dueDate
                }
              </p>
              <span
                className="mt-3 inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase text-white"
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
          </header>

          <section className="grid gap-6 py-7 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                Bill to
              </p>
              <p className="mt-2 text-lg font-black">
                {
                  invoice.customer
                    .name
                }
              </p>
              {
                invoice.customer
                  .email &&
                (
                  <p className="mt-1 text-sm text-slate-600">
                    {
                      invoice.customer
                        .email
                    }
                  </p>
                )
              }
              {
                invoice.customer
                  .phone &&
                (
                  <p className="mt-1 text-sm text-slate-600">
                    {
                      invoice.customer
                        .phone
                    }
                  </p>
                )
              }
              {
                invoice.customer
                  .billingAddress &&
                (
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {
                      invoice.customer
                        .billingAddress
                    }
                  </p>
                )
              }
            </div>

            <div className="space-y-2 sm:text-right">
              {
                invoice.reference &&
                (
                  <p className="text-sm">
                    <span className="text-slate-500">
                      Reference:
                    </span>{' '}
                    <strong>
                      {
                        invoice.reference
                      }
                    </strong>
                  </p>
                )
              }
              {
                invoice.purchaseOrderNumber &&
                (
                  <p className="text-sm">
                    <span className="text-slate-500">
                      PO:
                    </span>{' '}
                    <strong>
                      {
                        invoice.purchaseOrderNumber
                      }
                    </strong>
                  </p>
                )
              }
              {
                invoice.paymentTermsName &&
                (
                  <p className="text-sm">
                    <span className="text-slate-500">
                      Terms:
                    </span>{' '}
                    <strong>
                      {
                        invoice.paymentTermsName
                      }
                    </strong>
                  </p>
                )
              }
            </div>
          </section>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600">
                <tr>
                  <th className="px-3 py-3">
                    Description
                  </th>
                  <th className="px-3 py-3 text-right">
                    Qty
                  </th>
                  <th className="px-3 py-3 text-right">
                    Unit price
                  </th>
                  <th className="px-3 py-3 text-right">
                    Tax
                  </th>
                  <th className="px-3 py-3 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {
                  invoice.lines.map(
                    (
                      line,
                      index,
                    ) => (
                      <tr
                        key={
                          String(
                            index,
                          ) +
                          ':' +
                          line.description
                        }
                      >
                        <td className="px-3 py-3">
                          <p className="font-bold">
                            {
                              line.description
                            }
                          </p>
                          {
                            line.sku &&
                            (
                              <p className="mt-1 text-[10px] text-slate-500">
                                SKU {
                                  line.sku
                                }
                              </p>
                            )
                          }
                        </td>
                        <td className="px-3 py-3 text-right">
                          {
                            line.quantity
                          } {
                            line.unit
                          }
                        </td>
                        <td className="px-3 py-3 text-right">
                          {
                            formatMoney(
                              line.unitPrice,
                              invoice.currency,
                            )
                          }
                        </td>
                        <td className="px-3 py-3 text-right">
                          {
                            formatMoney(
                              line.taxAmount,
                              invoice.currency,
                            )
                          }
                        </td>
                        <td className="px-3 py-3 text-right font-black">
                          {
                            formatMoney(
                              line.lineTotal,
                              invoice.currency,
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

          <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              {
                invoice.notes &&
                (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">
                      {
                        invoice.notes
                      }
                    </p>
                  </div>
                )
              }

              {
                invoice.template
                  .showPaymentInstructions &&
                invoice.paymentInstructions &&
                (
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-700">
                      Payment instructions
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-950">
                      {
                        invoice.paymentInstructions
                      }
                    </p>
                  </div>
                )
              }
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    Subtotal
                  </span>
                  <strong>
                    {
                      formatMoney(
                        invoice.subtotal,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    Discount
                  </span>
                  <strong>
                    {
                      formatMoney(
                        invoice.discountTotal,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    Tax
                  </span>
                  <strong>
                    {
                      formatMoney(
                        invoice.taxTotal,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base">
                  <span className="font-black">
                    Total
                  </span>
                  <strong>
                    {
                      formatMoney(
                        invoice.totalAmount,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    Paid
                  </span>
                  <strong className="text-emerald-700">
                    {
                      formatMoney(
                        invoice.paidAmount,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
                {
                  invoice.creditedAmount >
                    0 &&
                  (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-600">
                        Credits
                      </span>
                      <strong>
                        {
                          formatMoney(
                            invoice.creditedAmount,
                            invoice.currency,
                          )
                        }
                      </strong>
                    </div>
                  )
                }
                <div className="flex justify-between gap-3 border-t border-slate-300 pt-2 text-base">
                  <span className="font-black">
                    Balance due
                  </span>
                  <strong className="text-blue-700">
                    {
                      formatMoney(
                        invoice.balanceDue,
                        invoice.currency,
                      )
                    }
                  </strong>
                </div>
              </div>
            </div>
          </section>

          {
            invoice.terms &&
            (
              <section className="mt-6 border-t border-slate-200 pt-5">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Terms
                </p>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">
                  {
                    invoice.terms
                  }
                </p>
              </section>
            )
          }
        </article>
      </div>
    </main>
  );
}
