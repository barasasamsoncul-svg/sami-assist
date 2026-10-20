'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FileText,
  Info,
  LayoutTemplate,
  Lock,
  Sparkles,
} from 'lucide-react';

import { useMemo, useState } from 'react';

import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

function prettyLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function statusTone(status: string): 'emerald' | 'amber' | 'slate' | 'blue' {
  if (status === 'accepted' || status === 'converted' || status === 'won') return 'emerald';
  if (status === 'rejected' || status === 'cancelled' || status === 'expired') return 'amber';
  if (status === 'draft') return 'slate';
  return 'blue';
}

function statusClass(tone: 'emerald' | 'amber' | 'slate' | 'blue') {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'slate':
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
    case 'blue':
      return 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
  }
}

export default function SalesQuotePdfBuilder({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const initialQuote = data.quotes[0];

  const [quoteId, setQuoteId] = useState(initialQuote?.id || '');
  const [templateId, setTemplateId] = useState(
    initialQuote?.templateId ||
      data.templates.find((template) => template.isDefault)?.id ||
      data.templates[0]?.id ||
      '',
  );
  const [applying, setApplying] = useState(false);

  const selectedQuote = useMemo(
    () => data.quotes.find((quote) => quote.id === quoteId) || null,
    [data.quotes, quoteId],
  );

  const selectedTemplate =
    data.templates.find((template) => template.id === templateId) || null;

  const canApply =
    !busy &&
    !applying &&
    Boolean(selectedQuote) &&
    Boolean(selectedTemplate) &&
    selectedQuote?.status === 'draft' &&
    data.capabilities.canEdit;

  async function applyTemplate() {
    if (!selectedQuote || !selectedTemplate) {
      showError(
        'Choose quote and template',
        'Select both a quotation and a quotation template.',
      );
      return;
    }

    setApplying(true);
    try {
      await request({
        action: 'apply_quote_template',
        quoteId: selectedQuote.id,
        templateId: selectedTemplate.id,
      });
      showSuccess(
        'Template applied',
        selectedTemplate.name + ' is now attached to ' + selectedQuote.quoteNumber + '.',
      );
    } catch (error) {
      showError(
        'Template could not be applied',
        error instanceof Error ? error.message : 'SaMi could not apply this template.',
      );
    } finally {
      setApplying(false);
    }
  }

  const isLocked = selectedQuote && selectedQuote.status !== 'draft';

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Roadmap Part 6
            </p>
            <h2 className="mt-1 text-xl font-black">Quote / PDF Builder</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Select a quotation, apply a presentation template to a draft, inspect the
              document styling and open the same server-generated PDF that customers
              receive.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FileText className="h-3 w-3" />
              {data.quotes.length} quote{data.quotes.length === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <LayoutTemplate className="h-3 w-3" />
              {data.templates.length} template{data.templates.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        {/* Left: configuration */}
        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <LayoutTemplate className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-black">Document configuration</h3>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-black">Quotation</span>
              <select
                value={quoteId}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuoteId(next);
                  const quote = data.quotes.find((item) => item.id === next);
                  if (quote?.templateId) setTemplateId(quote.templateId);
                }}
                aria-label="Quotation"
                className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                {data.quotes.length === 0 ? <option value="">No quotations</option> : null}
                {data.quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.quoteNumber + ' · ' + quote.customerName}
                  </option>
                ))}
              </select>
            </label>

            {selectedQuote ? (
              <div className="rounded-xl border border-[var(--sami-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black">{selectedQuote.quoteNumber}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ring-1 ${statusClass(
                      statusTone(selectedQuote.status),
                    )}`}
                  >
                    {prettyLabel(selectedQuote.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedQuote.customerName}
                </p>
              </div>
            ) : null}

            <label className="block">
              <span className="text-xs font-black">Quotation template</span>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                aria-label="Quotation template"
                className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
              >
                <option value="">Choose template</option>
                {data.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name + (template.isDefault ? ' · Default' : '')}
                  </option>
                ))}
              </select>
            </label>

            {selectedTemplate ? (
              <div className="rounded-xl border border-[var(--sami-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black">{selectedTemplate.name}</p>
                  {selectedTemplate.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" /> Default
                    </span>
                  ) : null}
                </div>
                {selectedQuote && selectedQuote.templateId === selectedTemplate.id ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Currently attached to {selectedQuote.quoteNumber}.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Not yet attached. Apply to attach this template to the draft.
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid gap-2">
              <button
                type="button"
                disabled={!canApply}
                onClick={() => void applyTemplate()}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {applying ? 'Applying…' : 'Apply template to draft'}
              </button>

              {selectedQuote ? (
                <a
                  href={'/api/apps/sales/quotes/' + selectedQuote.id + '/pdf'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                >
                  <FileDown className="h-4 w-4" />
                  Open generated PDF
                </a>
              ) : null}
            </div>

            {isLocked ? (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--sami-border)] bg-slate-500/[0.03] p-3 text-xs text-slate-500 dark:text-slate-400">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Sent or accepted quotations keep their locked commercial presentation.
                  Revise the quotation first if a new template is required.
                </span>
              </div>
            ) : null}

            {!data.capabilities.canEdit ? (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--sami-border)] bg-slate-500/[0.03] p-3 text-xs text-slate-500 dark:text-slate-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  You can preview and download the PDF, but applying a template requires
                  edit permission.
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: preview */}
        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-black">Document preview</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedTemplate ? (
                <span className="inline-flex items-center rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em]">
                  {selectedTemplate.name}
                </span>
              ) : null}
              {selectedQuote ? (
                <a
                  href={'/api/apps/sales/quotes/' + selectedQuote.id + '/pdf'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] hover:bg-slate-500/[0.04]"
                >
                  <ExternalLink className="h-3 w-3" /> Open in new tab
                </a>
              ) : null}
            </div>
          </div>

          {selectedQuote ? (
            <div className="mt-4 space-y-2">
              <iframe
                src={'/api/apps/sales/quotes/' + selectedQuote.id + '/pdf'}
                className="h-[720px] w-full rounded-2xl border border-[var(--sami-border)] bg-white"
                title="Quotation PDF preview"
              />
              <p className="inline-flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                This preview is rendered by the same server-side PDF service customers
                receive.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] px-4 py-10 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <FileText className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-black">No quotation selected</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                Create a quotation to preview its PDF presentation.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}