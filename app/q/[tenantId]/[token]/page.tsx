import {
  notFound,
} from 'next/navigation';

import PublicSalesQuoteActions from '@/app/q/[tenantId]/[token]/PublicSalesQuoteActions';

import {
  getPublicSalesQuote,
} from '@/lib/apps/sales/public';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function money(
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
      value.toLocaleString()
    );
  }
}


export default async function PublicSalesQuotePage({
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

  const quote =
    await getPublicSalesQuote(
      tenantId,
      token,
    )
      .catch(
        () => null,
      );

  if (
    !quote
  ) {
    notFound();
  }

  const canRespond =
    [
      'sent',
      'viewed',
    ].includes(
      quote.status,
    );

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-950 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <section
          className="overflow-hidden rounded-[28px] bg-white shadow-sm"
          style={{
            borderTop:
              '7px solid ' +
              quote.template
                .primaryColor,
          }}
        >
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_340px]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                Quotation
              </p>

              <h1 className="mt-2 text-2xl font-black tracking-tight">
                {
                  quote.quoteNumber
                }
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Prepared by <strong className="text-slate-800">{
                  quote.company.name
                }</strong> for <strong className="text-slate-800">{
                  quote.customer.name
                }</strong>.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Info
                  label="Quote date"
                  value={
                    quote.quoteDate
                  }
                />
                <Info
                  label="Valid until"
                  value={
                    quote.validUntil ||
                    'No expiry'
                  }
                />
                <Info
                  label="Status"
                  value={
                    quote.status
                      .replaceAll(
                        '_',
                        ' ',
                      )
                  }
                />
                <Info
                  label="Reference"
                  value={
                    quote.reference ||
                    '—'
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Quote total
              </p>

              <p className="mt-2 text-3xl font-black">
                {
                  money(
                    quote.totalAmount,
                    quote.currency,
                  )
                }
              </p>

              <a
                href={
                  '/q/' +
                  tenantId +
                  '/' +
                  token +
                  '/pdf'
                }
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-10 items-center rounded-xl bg-white px-4 text-xs font-black text-slate-950"
              >
                View PDF
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card
            title="From"
            lines={[
              quote.company.name,
              quote.company.address,
              quote.company.email,
              quote.company.phone,
              quote.company.taxId
                ? 'PIN: ' +
                  quote.company.taxId
                : null,
              quote.company
                .registrationNumber
                ? 'Registration: ' +
                  quote.company
                    .registrationNumber
                : null,
            ]}
          />

          <Card
            title="Prepared for"
            lines={[
              quote.customer.name,
              quote.customer
                .billingAddress,
              quote.customer.email,
              quote.customer.phone,
              quote.customer.taxId
                ? 'Tax / PIN: ' +
                  quote.customer.taxId
                : null,
            ]}
          />
        </section>

        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right">
                    Price
                  </th>
                  <th className="px-4 py-3 text-right">
                    Discount
                  </th>
                  <th className="px-4 py-3 text-right">
                    Tax
                  </th>
                  <th className="px-4 py-3 text-right">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {
                  quote.lines.map(
                    (
                      line,
                      index,
                    ) => (
                      <tr
                        key={
                          index
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold">
                            {
                              line.description
                            }
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {
                              [
                                line.sku,
                                line.unit,
                                line.taxName,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  ' · ',
                                )
                            }
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {
                            line.quantity
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          {
                            money(
                              line.unitPrice,
                              quote.currency,
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          {
                            money(
                              line.discountAmount,
                              quote.currency,
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          {
                            money(
                              line.taxAmount,
                              quote.currency,
                            )
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {
                            money(
                              line.lineTotal,
                              quote.currency,
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
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {
              quote.notes &&
              (
                <Card
                  title="Notes"
                  lines={[
                    quote.notes,
                  ]}
                />
              )
            }

            {
              quote.terms &&
              (
                <Card
                  title="Terms & conditions"
                  lines={[
                    quote.terms,
                  ]}
                />
              )
            }
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <Summary
                label="Subtotal"
                value={
                  money(
                    quote.subtotal,
                    quote.currency,
                  )
                }
              />
              <Summary
                label="Discount"
                value={
                  '− ' +
                  money(
                    quote.discountTotal,
                    quote.currency,
                  )
                }
              />
              <Summary
                label="Tax"
                value={
                  money(
                    quote.taxTotal,
                    quote.currency,
                  )
                }
              />
              <Summary
                label="Shipping"
                value={
                  money(
                    quote.shippingTotal,
                    quote.currency,
                  )
                }
              />

              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="font-black">
                  Total
                </span>
                <span className="text-xl font-black">
                  {
                    money(
                      quote.totalAmount,
                      quote.currency,
                    )
                  }
                </span>
              </div>
            </div>

            {
              canRespond &&
              (
                <PublicSalesQuoteActions
                  tenantId={
                    tenantId
                  }
                  token={
                    token
                  }
                  allowAcceptance={
                    quote.portal
                      .allowAcceptance
                  }
                  allowRejection={
                    quote.portal
                      .allowRejection
                  }
                />
              )
            }
          </div>
        </section>

        <p className="pb-4 text-center text-[10px] text-slate-400">
          {
            quote.template
              .footerText ||
            'Secure quotation powered by SaMi Sales'
          }
        </p>
      </div>
    </main>
  );
}


function Info({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </p>
      <p className="mt-1 text-sm font-bold capitalize">
        {
          value
        }
      </p>
    </div>
  );
}


function Card({
  title,
  lines,
}: {
  title:
    string;
  lines:
    Array<
      string |
      null
    >;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          title
        }
      </p>

      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
        {
          lines
            .filter(
              Boolean,
            )
            .map(
              (
                line,
                index,
              ) => (
                <p
                  key={
                    index
                  }
                >
                  {
                    line
                  }
                </p>
              ),
            )
        }
      </div>
    </div>
  );
}


function Summary({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
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
