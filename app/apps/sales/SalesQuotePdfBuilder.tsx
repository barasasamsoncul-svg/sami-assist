'use client';

import {
  FileDown,
  FileText,
  LayoutTemplate,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


export default function SalesQuotePdfBuilder({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data:
    SalesWorkspaceData;
  busy:
    boolean;
  request:
    (
      payload:
        Record<
          string,
          unknown
        >,
    ) =>
      Promise<
        Record<
          string,
          unknown
        >
      >;
  showSuccess:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
  showError:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
}) {
  const initialQuote =
    data.quotes[0];

  const [
    quoteId,
    setQuoteId,
  ] =
    useState(
      initialQuote?.id ||
      '',
    );

  const selectedQuote =
    useMemo(
      () =>
        data.quotes.find(
          quote =>
            quote.id ===
            quoteId,
        ) ||
        null,
      [
        data.quotes,
        quoteId,
      ],
    );

  const [
    templateId,
    setTemplateId,
  ] =
    useState(
      initialQuote
        ?.templateId ||
      data.templates.find(
        template =>
          template.isDefault,
      )?.id ||
      data.templates[0]
        ?.id ||
      '',
    );

  const selectedTemplate =
    data.templates.find(
      template =>
        template.id ===
        templateId,
    ) ||
    null;

  async function applyTemplate() {
    if (
      !selectedQuote ||
      !selectedTemplate
    ) {
      showError(
        'Choose quote and template',
        'Select both a quotation and a quotation template.',
      );
      return;
    }

    try {
      await request({
        action:
          'apply_quote_template',
        quoteId:
          selectedQuote.id,
        templateId:
          selectedTemplate.id,
      });

      showSuccess(
        'Template applied',
        selectedTemplate.name +
          ' is now attached to ' +
          selectedQuote.quoteNumber +
          '.',
      );
    } catch (
      error
    ) {
      showError(
        'Template could not be applied',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not apply this template.',
      );
    }
  }

  const primary =
    selectedTemplate
      ?.primaryColor ||
    data.settings
      .primaryColor;

  const secondary =
    selectedTemplate
      ?.secondaryColor ||
    data.settings
      .secondaryColor;

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 6
        </p>
        <h2 className="mt-1 text-xl font-black">
          Quote / PDF Builder
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Select a quotation, apply a presentation template to a draft, inspect the document styling and open the same server-generated PDF that customers receive.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center gap-2">
            <LayoutTemplate
              className="h-4 w-4"
            />
            <h3 className="text-sm font-black">
              Document configuration
            </h3>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-black">
                Quotation
              </span>
              <select
                value={
                  quoteId
                }
                onChange={
                  event => {
                    const next =
                      event.target.value;

                    setQuoteId(
                      next,
                    );

                    const quote =
                      data.quotes.find(
                        item =>
                          item.id ===
                          next,
                      );

                    if (
                      quote?.templateId
                    ) {
                      setTemplateId(
                        quote.templateId,
                      );
                    }
                  }
                }
                className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                {
                  data.quotes.length ===
                    0 &&
                  (
                    <option value="">
                      No quotations
                    </option>
                  )
                }
                {
                  data.quotes.map(
                    quote => (
                      <option
                        key={
                          quote.id
                        }
                        value={
                          quote.id
                        }
                      >
                        {
                          quote.quoteNumber +
                          ' · ' +
                          quote.customerName
                        }
                      </option>
                    ),
                  )
                }
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black">
                Quotation template
              </span>
              <select
                value={
                  templateId
                }
                onChange={
                  event =>
                    setTemplateId(
                      event.target.value,
                    )
                }
                className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                <option value="">
                  Choose template
                </option>
                {
                  data.templates.map(
                    template => (
                      <option
                        key={
                          template.id
                        }
                        value={
                          template.id
                        }
                      >
                        {
                          template.name +
                          (
                            template.isDefault
                              ? ' · Default'
                              : ''
                          )
                        }
                      </option>
                    ),
                  )
                }
              </select>
            </label>

            <div className="grid gap-2">
              <button
                type="button"
                disabled={
                  busy ||
                  !selectedQuote ||
                  !selectedTemplate ||
                  selectedQuote.status !==
                    'draft' ||
                  !data.capabilities
                    .canEdit
                }
                onClick={
                  applyTemplate
                }
                className="h-10 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
              >
                Apply template to draft
              </button>

              {
                selectedQuote &&
                (
                  <a
                    href={
                      '/api/apps/sales/quotes/' +
                      selectedQuote.id +
                      '/pdf'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                  >
                    <FileDown
                      className="h-4 w-4"
                    />
                    Open generated PDF
                  </a>
                )
              }
            </div>

            {
              selectedQuote &&
              selectedQuote.status !==
                'draft' &&
              (
                <div className="rounded-xl border border-[var(--sami-border)] p-3 text-xs text-slate-500">
                  Sent or accepted quotations keep their locked commercial presentation. Revise the quotation first if a new template is required.
                </div>
              )
            }
          </div>
        </div>

        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText
                className="h-4 w-4"
              />
              <h3 className="text-sm font-black">
                Document preview
              </h3>
            </div>
            {
              selectedTemplate &&
              (
                <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase">
                  {
                    selectedTemplate.name
                  }
                </span>
              )
            }
          </div>

          {
            selectedQuote
              ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-white text-slate-900 shadow-sm">
                    <div
                      className="h-2"
                      style={{
                        backgroundColor:
                          primary,
                      }}
                    />
                    <div className="p-5 sm:p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p
                            className="text-xs font-black uppercase tracking-[0.16em]"
                            style={{
                              color:
                                primary,
                            }}
                          >
                            {
                              data.company.name
                            }
                          </p>
                          <h4 className="mt-2 text-2xl font-black">
                            QUOTATION
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">
                            {
                              selectedQuote.quoteNumber
                            }
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-black">
                            {
                              selectedQuote.quoteDate
                            }
                          </p>
                          <p className="text-slate-500">
                            Valid until {
                              selectedQuote.validUntil ||
                              '—'
                            }
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                            Prepared for
                          </p>
                          <p className="mt-1 text-sm font-black">
                            {
                              selectedQuote.customerName
                            }
                          </p>
                          <p className="text-xs text-slate-500">
                            {
                              selectedQuote.customerEmail ||
                              'No email'
                            }
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                            Commercial total
                          </p>
                          <p
                            className="mt-1 text-xl font-black"
                            style={{
                              color:
                                secondary,
                            }}
                          >
                            {
                              new Intl.NumberFormat(
                                'en-KE',
                                {
                                  style:
                                    'currency',
                                  currency:
                                    selectedQuote.currency,
                                  maximumFractionDigits:
                                    2,
                                },
                              ).format(
                                selectedQuote.totalAmount,
                              )
                            }
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 rounded-xl border border-slate-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Commercial document
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          Line items, discounts, taxes, shipping, notes and terms are rendered securely from the saved quotation by the Sales PDF service.
                        </p>
                      </div>

                      <p
                        className="mt-8 border-t border-slate-200 pt-4 text-center text-[10px]"
                        style={{
                          color:
                            secondary,
                        }}
                      >
                        {
                          selectedTemplate
                            ?.footerText ||
                          data.settings
                            .footerText ||
                          'Generated by SaMi Sales'
                        }
                      </p>
                    </div>
                  </div>
                )
              : (
                  <div className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center text-sm text-slate-500">
                    Create a quotation to preview its PDF presentation.
                  </div>
                )
          }
        </div>
      </div>
    </section>
  );
}
