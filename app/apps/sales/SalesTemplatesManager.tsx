'use client';

import {
  FileText,
  LayoutTemplate,
  Plus,
} from 'lucide-react';

import {
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


export default function SalesTemplatesManager({
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
  const [
    templates,
    setTemplates,
  ] =
    useState(
      data.templates,
    );

  const [
    formKey,
    setFormKey,
  ] =
    useState(
      0,
    );

  async function save(
    form:
      HTMLFormElement,
  ) {
    const values =
      new FormData(
        form,
      );

    try {
      const result =
        await request({
          action:
            'save_template',
          name:
            values.get(
              'name',
            ),
          primaryColor:
            values.get(
              'primaryColor',
            ),
          secondaryColor:
            values.get(
              'secondaryColor',
            ),
          footerText:
            values.get(
              'footerText',
            ),
          notes:
            values.get(
              'notes',
            ),
          terms:
            values.get(
              'terms',
            ),
          isDefault:
            values.get(
              'isDefault',
            ) ===
              'on',
        });

      const id =
        typeof result.id ===
          'string'
          ? result.id
          : '';

      const name =
        String(
          values.get(
            'name',
          ) ||
          '',
        )
          .trim();

      const isDefault =
        values.get(
          'isDefault',
        ) ===
          'on';

      if (
        id &&
        name
      ) {
        setTemplates(
          current => [
            {
              id,
              name,
              isDefault,
              notes:
                String(
                  values.get(
                    'notes',
                  ) ||
                  '',
                ) ||
                null,
              terms:
                String(
                  values.get(
                    'terms',
                  ) ||
                  '',
                ) ||
                null,
              footerText:
                String(
                  values.get(
                    'footerText',
                  ) ||
                  '',
                ) ||
                null,
              primaryColor:
                String(
                  values.get(
                    'primaryColor',
                  ) ||
                  data.settings
                    .primaryColor,
                ),
              secondaryColor:
                String(
                  values.get(
                    'secondaryColor',
                  ) ||
                  data.settings
                    .secondaryColor,
                ),
            },
            ...current
              .map(
                template => ({
                  ...template,
                  isDefault:
                    isDefault
                      ? false
                      : template
                          .isDefault,
                }),
              )
              .filter(
                template =>
                  template.id !==
                  id,
              ),
          ],
        );
      }

      form.reset();
      setFormKey(
        value =>
          value +
          1,
      );

      showSuccess(
        'Template saved',
        'The quotation template is ready for new quotations.',
      );
    } catch (
      error
    ) {
      showError(
        'Template could not be saved',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save the quotation template.',
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 5
        </p>
        <h2 className="mt-1 text-xl font-black">
          Quotation templates
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Create reusable quotation presentation defaults for notes, commercial terms, footer copy and document branding. Templates stay separate from global Sales policy.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        {
          data.capabilities
            .canManageSettings &&
          (
            <form
              key={
                formKey
              }
              className="sami-surface rounded-[24px] p-4"
              onSubmit={
                async event => {
                  event.preventDefault();

                  await save(
                    event.currentTarget,
                  );
                }
              }
            >
              <div className="flex items-center gap-2">
                <Plus
                  className="h-4 w-4"
                />
                <h3 className="text-sm font-black">
                  New template
                </h3>
              </div>

              <div className="mt-4 space-y-3">
                <Field
                  name="name"
                  label="Template name"
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    name="primaryColor"
                    label="Primary color"
                    defaultValue={
                      data.settings
                        .primaryColor
                    }
                  />
                  <Field
                    name="secondaryColor"
                    label="Secondary color"
                    defaultValue={
                      data.settings
                        .secondaryColor
                    }
                  />
                </div>
                <Area
                  name="notes"
                  label="Default notes"
                />
                <Area
                  name="terms"
                  label="Default terms"
                />
                <Area
                  name="footerText"
                  label="Document footer"
                />

                <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
                  <input
                    type="checkbox"
                    name="isDefault"
                    className="h-4 w-4"
                  />
                  Make this the default quotation template
                </label>

                <button
                  type="submit"
                  disabled={
                    busy
                  }
                  className="h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  Save template
                </button>
              </div>
            </form>
          )
        }

        <div className="sami-surface rounded-[24px] p-4">
          <div className="flex items-center gap-2">
            <LayoutTemplate
              className="h-4 w-4"
            />
            <div>
              <h3 className="text-sm font-black">
                Template library
              </h3>
              <p className="text-xs text-slate-500">
                {
                  templates.length
                } quotation templates
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {
              templates.length ===
                0
                ? (
                    <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-5 text-sm text-slate-500">
                      No quotation templates yet.
                    </div>
                  )
                : templates.map(
                    template => (
                      <div
                        key={
                          template.id
                        }
                        className="rounded-2xl border border-[var(--sami-border)] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="rounded-xl border border-[var(--sami-border)] p-2">
                              <FileText
                                className="h-4 w-4"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">
                                {
                                  template.name
                                }
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {
                                  template.notes ||
                                  template.terms ||
                                  'Reusable quotation presentation defaults.'
                                }
                              </p>
                            </div>
                          </div>

                          {
                            template.isDefault &&
                            (
                              <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-black text-blue-700 dark:text-blue-300">
                                Default
                              </span>
                            )
                          }
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                          <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                            Notes
                            {
                              template.notes
                                ? ' set'
                                : ' empty'
                            }
                          </span>
                          <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                            Terms
                            {
                              template.terms
                                ? ' set'
                                : ' empty'
                            }
                          </span>
                          <span className="rounded-full border border-[var(--sami-border)] px-2 py-1">
                            Footer
                            {
                              template.footerText
                                ? ' set'
                                : ' empty'
                            }
                          </span>
                        </div>
                      </div>
                    ),
                  )
            }
          </div>
        </div>
      </div>
    </section>
  );
}


function Field({
  name,
  label,
  defaultValue,
  required =
    false,
}: {
  name:
    string;
  label:
    string;
  defaultValue?:
    string;
  required?:
    boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <input
        name={
          name
        }
        defaultValue={
          defaultValue
        }
        required={
          required
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


function Area({
  name,
  label,
}: {
  name:
    string;
  label:
    string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <textarea
        name={
          name
        }
        rows={
          4
        }
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}
