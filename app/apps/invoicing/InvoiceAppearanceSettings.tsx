'use client';

import {
  useState,
} from 'react';

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


type DesignerState = {
  name: string;
  layout: string;
  fontFamily: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  density: string;
  headerStyle: string;
  documentTitle: string;
  fromLabel: string;
  billToLabel: string;
  notesLabel: string;
  termsLabel: string;
  paymentLabel: string;
  footerAlignment: string;
  showStatus: boolean;
  showPageNumbers: boolean;
  showSku: boolean;
  showUnit: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showLineTax: boolean;
  showLineDiscount: boolean;
  showCompanyLogo: boolean;
  showCompanyAddress: boolean;
  showCompanyContact: boolean;
  showTaxId: boolean;
  showPaymentInstructions: boolean;
  showTaxBreakdown: boolean;
  showDiscount: boolean;
  isDefault: boolean;
  footerText: string;
  termsText: string;
};


function initialDesignerState(
  template:
    InvoicingTemplateSummary |
    null,
): DesignerState {
  return {
    name:
      template?.name ||
      '',
    layout:
      template?.layout ||
      'modern',
    fontFamily:
      template?.fontFamily ||
      'Inter',
    logoUrl:
      template?.logoUrl ||
      '',
    primaryColor:
      template?.primaryColor ||
      '#164a9f',
    secondaryColor:
      template?.secondaryColor ||
      '#0f172a',
    accentColor:
      template?.accentColor ||
      '#d4af37',
    density:
      template?.density ||
      'comfortable',
    headerStyle:
      template?.headerStyle ||
      'band',
    documentTitle:
      template?.documentTitle ||
      'Invoice',
    fromLabel:
      template?.fromLabel ||
      'From',
    billToLabel:
      template?.billToLabel ||
      'Bill to',
    notesLabel:
      template?.notesLabel ||
      'Notes',
    termsLabel:
      template?.termsLabel ||
      'Terms',
    paymentLabel:
      template?.paymentLabel ||
      'Payment instructions',
    footerAlignment:
      template?.footerAlignment ||
      'left',
    showStatus:
      template?.showStatus ??
      true,
    showPageNumbers:
      template?.showPageNumbers ??
      true,
    showSku:
      template?.showSku ??
      true,
    showUnit:
      template?.showUnit ??
      true,
    showQuantity:
      template?.showQuantity ??
      true,
    showUnitPrice:
      template?.showUnitPrice ??
      true,
    showLineTax:
      template?.showLineTax ??
      true,
    showLineDiscount:
      template?.showLineDiscount ??
      true,
    showCompanyLogo:
      template?.showCompanyLogo ??
      true,
    showCompanyAddress:
      template?.showCompanyAddress ??
      true,
    showCompanyContact:
      template?.showCompanyContact ??
      true,
    showTaxId:
      template?.showTaxId ??
      true,
    showPaymentInstructions:
      template?.showPaymentInstructions ??
      true,
    showTaxBreakdown:
      template?.showTaxBreakdown ??
      true,
    showDiscount:
      template?.showDiscount ??
      true,
    isDefault:
      template?.isDefault ??
      false,
    footerText:
      template?.footerText ||
      '',
    termsText:
      template?.termsText ||
      '',
  };
}


function MiniPreview({
  state,
  version,
}: {
  state:
    DesignerState;
  version:
    number;
}) {
  const rowGap =
    state.density ===
      'compact'
      ? 'py-1'
      : state.density ===
          'spacious'
        ? 'py-3'
        : 'py-2';

  const headerClass =
    state.headerStyle ===
      'minimal'
      ? 'border-b-2 bg-white'
      : state.headerStyle ===
          'split'
        ? 'border-b-8'
        : '';

  return (
    <div className="sticky top-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
          Live preview
        </p>
        <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black text-blue-700 dark:text-blue-300">
          Design v{
            version
          }
        </span>
      </div>

      <div
        className={[
          'overflow-hidden rounded-[22px] border border-[var(--sami-border)] bg-white text-slate-950 shadow-sm',
          state.layout ===
            'classic'
            ? 'rounded-none'
            : state.layout ===
                'compact'
              ? 'rounded-xl'
              : '',
        ].join(
          ' ',
        )}
        style={{
          fontFamily:
            state.fontFamily +
            ', Arial, sans-serif',
        }}
      >
        <div
          className={[
            'p-4',
            headerClass,
          ].join(
            ' ',
          )}
          style={
            state.headerStyle ===
              'minimal'
              ? {
                  borderColor:
                    state.primaryColor,
                }
              : {
                  background:
                    state.primaryColor,
                  color:
                    '#ffffff',
                  borderColor:
                    state.secondaryColor,
                }
          }
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              {
                state.showCompanyLogo &&
                (
                  <div
                    className="mb-2 h-7 w-16 rounded border border-current/20 bg-white/90"
                    title="Company logo"
                  />
                )
              }
              <p className="text-sm font-black">
                SaMi Technologies
              </p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.12em] opacity-80">
                {
                  state.documentTitle
                }
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs font-black">
                INV-000241
              </p>
              {
                state.showStatus &&
                (
                  <p className="mt-1 text-[8px] font-black uppercase opacity-80">
                    Issued
                  </p>
                )
              }
              {
                state.showPageNumbers &&
                (
                  <p className="mt-1 text-[8px] opacity-70">
                    1 / 1
                  </p>
                )
              }
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 text-[9px] sm:grid-cols-2">
          <div>
            <p
              className="font-black uppercase tracking-[0.1em]"
              style={{
                color:
                  state.primaryColor,
              }}
            >
              {
                state.fromLabel
              }
            </p>
            {
              state.showCompanyAddress &&
              (
                <p className="mt-1 text-slate-600">
                  Nairobi, Kenya
                </p>
              )
            }
            {
              state.showCompanyContact &&
              (
                <p className="text-slate-600">
                  billing@example.com
                </p>
              )
            }
            {
              state.showTaxId &&
              (
                <p className="text-slate-600">
                  PIN P000000000A
                </p>
              )
            }
          </div>

          <div>
            <p
              className="font-black uppercase tracking-[0.1em]"
              style={{
                color:
                  state.primaryColor,
              }}
            >
              {
                state.billToLabel
              }
            </p>
            <p className="mt-1 font-black">
              Acme Customer Ltd
            </p>
            <p className="text-slate-600">
              customer@example.com
            </p>
          </div>
        </div>

        <div className="mx-4 overflow-hidden rounded-xl border border-slate-200">
          <div
            className="grid grid-cols-[minmax(0,1fr)_repeat(5,auto)] gap-2 px-2 py-2 text-[7px] font-black uppercase text-white"
            style={{
              background:
                state.secondaryColor,
            }}
          >
            <span>
              Description
            </span>
            {
              state.showQuantity &&
              <span>Qty</span>
            }
            {
              state.showUnit &&
              <span>Unit</span>
            }
            {
              state.showUnitPrice &&
              <span>Price</span>
            }
            {
              state.showLineDiscount &&
              <span>Disc.</span>
            }
            {
              state.showLineTax &&
              <span>Tax</span>
            }
            <span>
              Amount
            </span>
          </div>

          {
            [
              'Professional services',
              'Implementation support',
            ].map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    item
                  }
                  className={[
                    'grid grid-cols-[minmax(0,1fr)_repeat(5,auto)] gap-2 border-t border-slate-100 px-2 text-[8px]',
                    rowGap,
                  ].join(
                    ' ',
                  )}
                >
                  <div>
                    <p className="font-bold">
                      {
                        item
                      }
                    </p>
                    {
                      state.showSku &&
                      (
                        <p className="text-[7px] text-slate-500">
                          SKU SAMI-{
                            index +
                            1
                          }
                        </p>
                      )
                    }
                  </div>
                  {
                    state.showQuantity &&
                    <span>1</span>
                  }
                  {
                    state.showUnit &&
                    <span>unit</span>
                  }
                  {
                    state.showUnitPrice &&
                    <span>25,000</span>
                  }
                  {
                    state.showLineDiscount &&
                    <span>—</span>
                  }
                  {
                    state.showLineTax &&
                    <span>16%</span>
                  }
                  <span className="font-black">
                    29,000
                  </span>
                </div>
              ),
            )
          }
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="text-[8px] text-slate-600">
            {
              state.showPaymentInstructions &&
              (
                <>
                  <p
                    className="font-black uppercase"
                    style={{
                      color:
                        state.primaryColor,
                    }}
                  >
                    {
                      state.paymentLabel
                    }
                  </p>
                  <p className="mt-1">
                    Pay using the instructions on the invoice.
                  </p>
                </>
              )
            }
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-[8px]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <strong>KES 50,000</strong>
            </div>
            {
              state.showDiscount &&
              (
                <div className="mt-1 flex justify-between">
                  <span>Discount</span>
                  <strong>—</strong>
                </div>
              )
            }
            {
              state.showTaxBreakdown &&
              (
                <div className="mt-1 flex justify-between">
                  <span>Tax</span>
                  <strong>KES 8,000</strong>
                </div>
              )
            }
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[9px]">
              <span className="font-black">
                Total
              </span>
              <strong>KES 58,000</strong>
            </div>
          </div>
        </div>

        <div
          className={[
            'border-t border-slate-200 px-4 py-3 text-[8px] text-slate-500',
            state.footerAlignment ===
              'center'
              ? 'text-center'
              : state.footerAlignment ===
                  'right'
                ? 'text-right'
                : 'text-left',
          ].join(
            ' ',
          )}
        >
          {
            state.footerText ||
            'Generated securely through SaMi'
          }
        </div>
      </div>
    </div>
  );
}


function TemplateFields({
  template,
}: {
  template:
    InvoicingTemplateSummary |
    null;
}) {
  const [
    state,
    setState,
  ] =
    useState<DesignerState>(
      () =>
        initialDesignerState(
          template,
        ),
    );

  function set<
    K extends
      keyof DesignerState
  >(
    key:
      K,
    value:
      DesignerState[K],
  ) {
    setState(
      current => ({
        ...current,
        [key]:
          value,
      }),
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <TextField
            name="name"
            label="Template name"
            value={
              state.name
            }
            required
            onChange={
              value =>
                set(
                  'name',
                  value,
                )
            }
          />

          <SelectField
            name="layout"
            label="Layout"
            value={
              state.layout
            }
            options={[
              ['modern','Modern'],
              ['classic','Classic'],
              ['compact','Compact'],
              ['bold','Bold'],
            ]}
            onChange={
              value =>
                set(
                  'layout',
                  value,
                )
            }
          />

          <SelectField
            name="fontFamily"
            label="Font"
            value={
              state.fontFamily
            }
            options={[
              ['Inter','Inter'],
              ['Arial','Arial'],
              ['Helvetica','Helvetica'],
              ['Georgia','Georgia'],
            ]}
            onChange={
              value =>
                set(
                  'fontFamily',
                  value,
                )
            }
          />

          <SelectField
            name="density"
            label="Row density"
            value={
              state.density
            }
            options={[
              ['compact','Compact'],
              ['comfortable','Comfortable'],
              ['spacious','Spacious'],
            ]}
            onChange={
              value =>
                set(
                  'density',
                  value,
                )
            }
          />

          <SelectField
            name="headerStyle"
            label="Header style"
            value={
              state.headerStyle
            }
            options={[
              ['band','Color band'],
              ['minimal','Minimal'],
              ['split','Split'],
            ]}
            onChange={
              value =>
                set(
                  'headerStyle',
                  value,
                )
            }
          />

          <SelectField
            name="footerAlignment"
            label="Footer alignment"
            value={
              state.footerAlignment
            }
            options={[
              ['left','Left'],
              ['center','Center'],
              ['right','Right'],
            ]}
            onChange={
              value =>
                set(
                  'footerAlignment',
                  value,
                )
            }
          />

          <TextField
            name="documentTitle"
            label="Document title"
            value={
              state.documentTitle
            }
            maxLength={
              80
            }
            onChange={
              value =>
                set(
                  'documentTitle',
                  value,
                )
            }
          />

          <TextField
            name="fromLabel"
            label="From label"
            value={
              state.fromLabel
            }
            maxLength={
              40
            }
            onChange={
              value =>
                set(
                  'fromLabel',
                  value,
                )
            }
          />

          <TextField
            name="billToLabel"
            label="Bill-to label"
            value={
              state.billToLabel
            }
            maxLength={
              40
            }
            onChange={
              value =>
                set(
                  'billToLabel',
                  value,
                )
            }
          />

          <TextField
            name="notesLabel"
            label="Notes label"
            value={
              state.notesLabel
            }
            maxLength={
              40
            }
            onChange={
              value =>
                set(
                  'notesLabel',
                  value,
                )
            }
          />

          <TextField
            name="termsLabel"
            label="Terms label"
            value={
              state.termsLabel
            }
            maxLength={
              40
            }
            onChange={
              value =>
                set(
                  'termsLabel',
                  value,
                )
            }
          />

          <TextField
            name="paymentLabel"
            label="Payment label"
            value={
              state.paymentLabel
            }
            maxLength={
              60
            }
            onChange={
              value =>
                set(
                  'paymentLabel',
                  value,
                )
            }
          />

          <TextField
            name="logoUrl"
            label="Logo URL"
            value={
              state.logoUrl
            }
            type="url"
            placeholder="https://..."
            onChange={
              value =>
                set(
                  'logoUrl',
                  value,
                )
            }
          />

          <ColorField
            name="primaryColor"
            label="Primary"
            value={
              state.primaryColor
            }
            onChange={
              value =>
                set(
                  'primaryColor',
                  value,
                )
            }
          />

          <ColorField
            name="secondaryColor"
            label="Secondary"
            value={
              state.secondaryColor
            }
            onChange={
              value =>
                set(
                  'secondaryColor',
                  value,
                )
            }
          />

          <ColorField
            name="accentColor"
            label="Accent"
            value={
              state.accentColor
            }
            onChange={
              value =>
                set(
                  'accentColor',
                  value,
                )
            }
          />
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
            Document visibility
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {
              [
                ['showStatus','Show status'],
                ['showPageNumbers','Page numbers'],
                ['showCompanyLogo','Show logo'],
                ['showCompanyAddress','Company address'],
                ['showCompanyContact','Company contact'],
                ['showTaxId','Tax ID'],
                ['showPaymentInstructions','Payment instructions'],
                ['showTaxBreakdown','Tax breakdown'],
                ['showDiscount','Discount summary'],
                ['isDefault','Workspace default'],
              ].map(
                (
                  [
                    key,
                    label,
                  ],
                ) => (
                  <Check
                    key={
                      key
                    }
                    name={
                      key
                    }
                    label={
                      label
                    }
                    checked={
                      Boolean(
                        state[
                          key as keyof DesignerState
                        ],
                      )
                    }
                    onChange={
                      checked =>
                        set(
                          key as keyof DesignerState,
                          checked as never,
                        )
                    }
                  />
                ),
              )
            }
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
            Line-item columns
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {
              [
                ['showSku','SKU'],
                ['showQuantity','Quantity'],
                ['showUnit','Unit'],
                ['showUnitPrice','Unit price'],
                ['showLineDiscount','Line discount'],
                ['showLineTax','Line tax'],
              ].map(
                (
                  [
                    key,
                    label,
                  ],
                ) => (
                  <Check
                    key={
                      key
                    }
                    name={
                      key
                    }
                    label={
                      label
                    }
                    checked={
                      Boolean(
                        state[
                          key as keyof DesignerState
                        ],
                      )
                    }
                    onChange={
                      checked =>
                        set(
                          key as keyof DesignerState,
                          checked as never,
                        )
                    }
                  />
                ),
              )
            }
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <TextAreaField
            name="footerText"
            label="Footer text"
            value={
              state.footerText
            }
            onChange={
              value =>
                set(
                  'footerText',
                  value,
                )
            }
          />

          <TextAreaField
            name="termsText"
            label="Template terms"
            value={
              state.termsText
            }
            onChange={
              value =>
                set(
                  'termsText',
                  value,
                )
            }
          />
        </div>
      </div>

      <MiniPreview
        state={
          state
        }
        version={
          template?.designVersion ||
          1
        }
      />
    </div>
  );
}


function TextField({
  name,
  label,
  value,
  onChange,
  required = false,
  maxLength,
  type = 'text',
  placeholder,
}: {
  name:
    string;
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) => void;
  required?:
    boolean;
  maxLength?:
    number;
  type?:
    string;
  placeholder?:
    string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
        {
          label
        }
      </span>
      <input
        name={
          name
        }
        type={
          type
        }
        required={
          required
        }
        maxLength={
          maxLength
        }
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value,
            )
        }
        placeholder={
          placeholder
        }
        className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
      />
    </label>
  );
}


function SelectField({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name:
    string;
  label:
    string;
  value:
    string;
  options:
    Array<
      [
        string,
        string,
      ]
    >;
  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
        {
          label
        }
      </span>
      <select
        name={
          name
        }
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value,
            )
        }
        className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
      >
        {
          options.map(
            (
              [
                optionValue,
                optionLabel,
              ],
            ) => (
              <option
                key={
                  optionValue
                }
                value={
                  optionValue
                }
              >
                {
                  optionLabel
                }
              </option>
            ),
          )
        }
      </select>
    </label>
  );
}


function ColorField({
  name,
  label,
  value,
  onChange,
}: {
  name:
    string;
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
        {
          label
        }
      </span>

      <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2">
        <input
          name={
            name
          }
          type="color"
          value={
            value
          }
          onChange={
            event =>
              onChange(
                event.target
                  .value,
              )
          }
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />

        <span className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">
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
  onChange,
}: {
  name:
    string;
  label:
    string;
  checked:
    boolean;
  onChange:
    (
      checked:
        boolean,
    ) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-bold">
      <input
        type="checkbox"
        name={
          name
        }
        checked={
          checked
        }
        onChange={
          event =>
            onChange(
              event.target
                .checked,
            )
        }
      />

      {
        label
      }
    </label>
  );
}


function TextAreaField({
  name,
  label,
  value,
  onChange,
}: {
  name:
    string;
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
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
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target
                .value,
            )
        }
        className="w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-sm"
      />
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
      density:
        data.get(
          'density',
        ),
      headerStyle:
        data.get(
          'headerStyle',
        ),
      documentTitle:
        data.get(
          'documentTitle',
        ),
      fromLabel:
        data.get(
          'fromLabel',
        ),
      billToLabel:
        data.get(
          'billToLabel',
        ),
      notesLabel:
        data.get(
          'notesLabel',
        ),
      termsLabel:
        data.get(
          'termsLabel',
        ),
      paymentLabel:
        data.get(
          'paymentLabel',
        ),
      footerAlignment:
        data.get(
          'footerAlignment',
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
      showStatus:
        data.get(
          'showStatus',
        ) ===
        'on',
      showPageNumbers:
        data.get(
          'showPageNumbers',
        ) ===
        'on',
      showSku:
        data.get(
          'showSku',
        ) ===
        'on',
      showUnit:
        data.get(
          'showUnit',
        ) ===
        'on',
      showQuantity:
        data.get(
          'showQuantity',
        ) ===
        'on',
      showUnitPrice:
        data.get(
          'showUnitPrice',
        ) ===
        'on',
      showLineTax:
        data.get(
          'showLineTax',
        ) ===
        'on',
      showLineDiscount:
        data.get(
          'showLineDiscount',
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
      ? 'Invoice design updated.'
      : 'Invoice design created.',
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
            Invoice template designer
          </p>

          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 dark:text-slate-300">
            Design the customer-facing invoice and preview it before saving. Issued invoices remain protected by their immutable document snapshot even when the template is redesigned later.
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

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={
                pending
              }
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
            >
              Create design
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

                        <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          v{
                            template.designVersion
                          }
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                        {
                          template.layout
                        } · {
                          template.headerStyle
                        } · {
                          template.density
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

                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        pending
                      }
                      className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                    >
                      Save design
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
