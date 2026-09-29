'use client';

import {
  useMemo,
  useState,
} from 'react';


export default function CustomerPortalMessageForm({
  tenantId,
  token,
  invoices,
}: {
  tenantId:
    string;
  token:
    string;
  invoices:
    Array<{
      id:
        string;
      invoiceNumber:
        string;
      balanceDue:
        number;
      currency:
        string;
    }>;
}) {
  const [
    category,
    setCategory,
  ] =
    useState(
      'invoice_question',
    );

  const [
    invoiceId,
    setInvoiceId,
  ] =
    useState(
      '',
    );

  const [
    subject,
    setSubject,
  ] =
    useState(
      '',
    );

  const [
    body,
    setBody,
  ] =
    useState(
      '',
    );

  const [
    promisedAmount,
    setPromisedAmount,
  ] =
    useState(
      '',
    );

  const [
    promisedDate,
    setPromisedDate,
  ] =
    useState(
      '',
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const selectedInvoice =
    useMemo(
      () =>
        invoices.find(
          invoice =>
            invoice.id ===
            invoiceId,
        ) ||
        null,
      [
        invoiceId,
        invoices,
      ],
    );

  async function submit(
    event:
      React.FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    setBusy(
      true,
    );

    setMessage(
      null,
    );

    try {
      const idempotencyKey =
        typeof crypto !==
          'undefined' &&
        'randomUUID' in crypto
          ? crypto
              .randomUUID()
          : (
              Date.now()
                .toString(
                  36,
                ) +
              '-' +
              Math.random()
                .toString(
                  36,
                )
                .slice(
                  2,
                )
            );

      const response =
        await fetch(
          '/api/public/invoicing/portal/' +
          encodeURIComponent(
            tenantId,
          ) +
          '/' +
          encodeURIComponent(
            token,
          ),
          {
            method:
              'POST',
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
                category,
                invoiceId:
                  invoiceId ||
                  undefined,
                subject,
                body,
                idempotencyKey,
                promisedAmount:
                  category ===
                    'payment_promise'
                    ? promisedAmount
                    : undefined,
                promisedDate:
                  category ===
                    'payment_promise'
                    ? promisedDate
                    : undefined,
              }),
          },
        );

      const result =
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
        result.success !==
          true
      ) {
        throw new Error(
          result.error ||
          'Your message could not be sent.',
        );
      }

      setSubject(
        '',
      );
      setBody(
        '',
      );
      setPromisedAmount(
        '',
      );
      setPromisedDate(
        '',
      );
      setMessage(
        'Message sent successfully.',
      );

      window.setTimeout(
        () => {
          window.location
            .reload();
        },
        650,
      );
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : 'Your message could not be sent.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <form
      onSubmit={
        submit
      }
      className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div>
        <p className="text-sm font-black text-slate-950">
          Contact billing
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Ask about an invoice, dispute a charge, or tell the business when you expect to pay.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
            Request type
          </span>
          <select
            value={
              category
            }
            onChange={
              event =>
                setCategory(
                  event.target
                    .value,
                )
            }
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950"
          >
            <option value="invoice_question">
              Invoice question
            </option>
            <option value="dispute">
              Dispute
            </option>
            <option value="payment_promise">
              Payment promise
            </option>
            <option value="general">
              General billing message
            </option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
            Invoice
          </span>
          <select
            value={
              invoiceId
            }
            onChange={
              event =>
                setInvoiceId(
                  event.target
                    .value,
                )
            }
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950"
          >
            <option value="">
              General / no invoice
            </option>
            {
              invoices.map(
                invoice => (
                  <option
                    key={
                      invoice.id
                    }
                    value={
                      invoice.id
                    }
                  >
                    {
                      invoice.invoiceNumber
                    } · {
                      invoice.currency
                    } {
                      invoice.balanceDue
                        .toLocaleString()
                    }
                  </option>
                ),
              )
            }
          </select>
        </label>
      </div>

      <label className="mt-3 block space-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
          Subject
        </span>
        <input
          value={
            subject
          }
          onChange={
            event =>
              setSubject(
                event.target
                  .value,
              )
          }
          maxLength={
            255
          }
          placeholder={
            selectedInvoice
              ? 'Regarding ' +
                selectedInvoice
                  .invoiceNumber
              : 'Billing question'
          }
          className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-500"
        />
      </label>

      {
        category ===
          'payment_promise' &&
        (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
                Expected amount
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={
                  promisedAmount
                }
                onChange={
                  event =>
                    setPromisedAmount(
                      event.target
                        .value,
                    )
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
                Expected payment date
              </span>
              <input
                type="date"
                required
                value={
                  promisedDate
                }
                onChange={
                  event =>
                    setPromisedDate(
                      event.target
                        .value,
                    )
                }
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950"
              />
            </label>
          </div>
        )
      }

      <label className="mt-3 block space-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">
          Message
        </span>
        <textarea
          value={
            body
          }
          onChange={
            event =>
              setBody(
                event.target
                  .value,
              )
          }
          maxLength={
            5000
          }
          required
          rows={
            5
          }
          placeholder="Write your message here."
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 placeholder:text-slate-500"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-600">
          {
            message ||
            'Your message is saved against this customer account.'
          }
        </p>

        <button
          type="submit"
          disabled={
            busy
          }
          className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {
            busy
              ? 'Sending…'
              : 'Send message'
          }
        </button>
      </div>
    </form>
  );
}
