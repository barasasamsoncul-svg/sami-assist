'use client';

import {
  Palette,
} from 'lucide-react';

import type {
  InvoicingTemplateSummary,
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type Submitter = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


function TemplateFields({
  template,
}: {
  template:
    InvoicingTemplateSummary |
    null;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Template name
          </span>

          <input
            name="name"
            required
            defaultValue={
              template?.name ||
              ''
            }
            className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Layout
          </span>

          <select
            name="layout"
            defaultValue={
              template?.layout ||
              'modern'
            }
            className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
          >
            <option value="modern">
              Modern
            </option>
            <option value="classic">
              Classic
            </option>
            <option value="compact">
              Compact
            </option>
            <option value="bold">
              Bold
            </option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Font
          </span>

          <select
            name="fontFamily"
            defaultValue={
              template?.fontFamily ||
              'Inter'
            }
            className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
          >
            <option value="Inter">
              Inter
            </option>
            <option value="Arial">
              Arial
            </option>
            <option value="Helvetica">
              Helvetica
            </option>
            <option value="Georgia">
              Georgia
            </option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Logo URL
          </span>

          <input
            name="logoUrl"
            type="url"
            defaultValue={
              template?.logoUrl ||
              ''
            }
            placeholder="https://..."
            className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
          />
        </label>

        <ColorField
          name="primaryColor"
          label="Primary"
          value={
            template?.primaryColor ||
            '#164a9f'
          }
        />

        <ColorField
          name="secondaryColor"
          label="Secondary"
          value={
            template?.secondaryColor ||
            '#0f172a'
          }
        />

        <ColorField
          name="accentColor"
          label="Accent"
          value={
            template?.accentColor ||
            '#d4af37'
          }
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Check
          name="showCompanyLogo"
          label="Show logo"
          checked={
            template?.showCompanyLogo ??
            true
          }
        />
        <Check
          name="showCompanyAddress"
          label="Show company address"
          checked={
            template?.showCompanyAddress ??
            true
          }
        />
        <Check
          name="showCompanyContact"
          label="Show company contact"
          checked={
            template?.showCompanyContact ??
            true
          }
        />
        <Check
          name="showTaxId"
          label="Show tax ID"
          checked={
            template?.showTaxId ??
            true
          }
        />
        <Check
          name="showPaymentInstructions"
          label="Show payment instructions"
          checked={
            template?.showPaymentInstructions ??
            true
          }
        />
        <Check
          name="showTaxBreakdown"
          label="Show tax breakdown"
          checked={
            template?.showTaxBreakdown ??
            true
          }
        />
        <Check
          name="showDiscount"
          label="Show discounts"
          checked={
            template?.showDiscount ??
            true
          }
        />
        <Check
          name="isDefault"
          label="Workspace default"
          checked={
            template?.isDefault ??
            false
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Footer text
          </span>

          <textarea
            name="footerText"
            rows={3}
            defaultValue={
              template?.footerText ||
              ''
            }
            className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
            Template terms
          </span>

          <textarea
            name="termsText"
            rows={3}
            defaultValue={
              template?.termsText ||
              ''
            }
            className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>
    </>
  );
}


function ColorField({
  name,
  label,
  value,
}: {
  name:
    string;
  label:
    string;
  value:
    string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
        {
          label
        }
      </span>

      <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-2">
        <input
          name={
            name
          }
          type="color"
          defaultValue={
            value
          }
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <span className="truncate text-xs font-bold text-slate-500">
          {
            value
          }
        </span>
      </div>
    </label>
  );
}


function Check({
  name,
  label,
  checked,
}: {
  name:
    string;
  label:
    string;
  checked:
    boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold">
      <input
        type="checkbox"
        name={
          name
        }
        defaultChecked={
          checked
        }
      />

      {
        label
      }
    </label>
  );
}


async function submitTemplate(
  form:
    HTMLFormElement,
  run:
    Submitter,
  templateId:
    string |
    null,
) {
  const data =
    new FormData(
      form,
    );

  return run(
    {
      action:
        'save_template',
      templateId:
        templateId ||
        undefined,
      name:
        data.get(
          'name',
        ),
      layout:
        data.get(
          'layout',
        ),
      primaryColor:
        data.get(
          'primaryColor',
        ),
      secondaryColor:
        data.get(
          'secondaryColor',
        ),
      accentColor:
        data.get(
          'accentColor',
        ),
      logoUrl:
        data.get(
          'logoUrl',
        ),
      fontFamily:
        data.get(
          'fontFamily',
        ),
      footerText:
        data.get(
          'footerText',
        ),
      termsText:
        data.get(
          'termsText',
        ),
      isDefault:
        data.get(
          'isDefault',
        ) ===
        'on',
      showCompanyLogo:
        data.get(
          'showCompanyLogo',
        ) ===
        'on',
      showCompanyAddress:
        data.get(
          'showCompanyAddress',
        ) ===
        'on',
      showCompanyContact:
        data.get(
          'showCompanyContact',
        ) ===
        'on',
      showTaxId:
        data.get(
          'showTaxId',
        ) ===
        'on',
      showPaymentInstructions:
        data.get(
          'showPaymentInstructions',
        ) ===
        'on',
      showTaxBreakdown:
        data.get(
          'showTaxBreakdown',
        ) ===
        'on',
      showDiscount:
        data.get(
          'showDiscount',
        ) ===
        'on',
    },
    templateId
      ? 'Invoice appearance updated.'
      : 'Invoice appearance created.',
  );
}


export default function InvoiceAppearanceSettings({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    Submitter;
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600">
          <Palette className="h-4 w-4" />
        </div>

        <div>
          <p className="text-sm font-black">
            Invoice appearance
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Configure branded document layouts per company. Templates change presentation only; customer snapshots, totals, tax and audit history remain authoritative.
          </p>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-dashed border-[var(--sami-border)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-blue-600">
          + Create appearance template
        </summary>

        <form
          className="border-t border-[var(--sami-border)] p-4"
          onSubmit={
            async event => {
              event.preventDefault();

              const element =
                event.currentTarget;

              const saved =
                await submitTemplate(
                  element,
                  run,
                  null,
                );

              if (
                saved
              ) {
                element.reset();
              }
            }
          }
        >
          <TemplateFields
            template={
              null
            }
          />

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={
                pending
              }
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
            >
              Create template
            </button>
          </div>
        </form>
      </details>

      <div className="mt-4 space-y-3">
        {
          data.templates.map(
            template => (
              <details
                key={
                  template.id
                }
                className="rounded-2xl border border-[var(--sami-border)]"
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 shrink-0 rounded-xl border border-black/5"
                      style={{
                        background:
                          template.primaryColor,
                      }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black">
                          {
                            template.name
                          }
                        </p>

                        {
                          template.isDefault &&
                          (
                            <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-600">
                              Default
                            </span>
                          )
                        }
                      </div>

                      <p className="mt-1 text-[11px] text-slate-500">
                        {
                          template.layout
                        } · {
                          template.fontFamily
                        }
                      </p>
                    </div>
                  </div>
                </summary>

                <form
                  className="border-t border-[var(--sami-border)] p-4"
                  onSubmit={
                    event => {
                      event.preventDefault();

                      void submitTemplate(
                        event.currentTarget,
                        run,
                        template.id,
                      );
                    }
                  }
                >
                  <TemplateFields
                    template={
                      template
                    }
                  />

                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        pending
                      }
                      className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                    >
                      Save template
                    </button>
                  </div>
                </form>
              </details>
            ),
          )
        }
      </div>
    </section>
  );
}
