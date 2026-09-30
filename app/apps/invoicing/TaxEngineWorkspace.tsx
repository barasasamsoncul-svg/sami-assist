'use client';

import type {
  FormEvent,
  ReactNode,
} from 'react';

import type {
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type Runner = (
  payload:
    Record<string, unknown>,
  message:
    string,
) => Promise<boolean>;


const inputClass =
  'mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs text-[var(--sami-text)] outline-none focus:border-blue-500';

const textAreaClass =
  'mt-1 min-h-20 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs text-[var(--sami-text)] outline-none focus:border-blue-500';


function Label({
  children,
}: {
  children:
    ReactNode;
}) {
  return (
    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">
      {children}
    </span>
  );
}


function Card({
  title,
  description,
  children,
}: {
  title:
    string;
  description:
    string;
  children:
    ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-black">
        {title}
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
        {description}
      </p>
      <div className="mt-4">
        {children}
      </div>
    </section>
  );
}


function SubmitButton({
  pending,
  children,
}: {
  pending:
    boolean;
  children:
    ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={
        pending
      }
      className="h-10 rounded-xl sami-contrast-invert px-4 text-xs font-black disabled:opacity-60"
    >
      {children}
    </button>
  );
}


function blankToNull(
  value:
    FormDataEntryValue |
    null,
) {
  const text =
    String(
      value ||
      '',
    ).trim();

  return text ||
    null;
}


export default function TaxEngineWorkspace({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    Runner;
}) {
  const activeRates =
    data.taxRates
      .filter(
        rate =>
          rate.isActive,
      );

  const activeGroups =
    data.taxGroups
      .filter(
        group =>
          group.isActive,
      );

  const activePositions =
    data.fiscalPositions
      .filter(
        position =>
          position.isActive,
      );

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
    action:
      string,
    message:
      string,
    transform?:
      (
        form:
          FormData,
      ) =>
        Record<string, unknown>,
  ) {
    event.preventDefault();

    const element =
      event.currentTarget;

    const form =
      new FormData(
        element,
      );

    const payload =
      transform
        ? transform(
            form,
          )
        : Object.fromEntries(
            form.entries(),
          );

    const saved =
      await run(
        {
          action,
          ...payload,
        },
        message,
      );

    if (saved) {
      element.reset();
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {
          [
            {
              label:
                'Active tax rates',
              value:
                activeRates.length,
              note:
                'Single tax components',
            },
            {
              label:
                'Tax groups',
              value:
                activeGroups.length,
              note:
                'Combined or compound taxes',
            },
            {
              label:
                'Fiscal positions',
              value:
                activePositions.length,
              note:
                'Customer/jurisdiction mappings',
            },
            {
              label:
                'Active exemptions',
              value:
                data.taxExemptions
                  .filter(
                    exemption =>
                      exemption.status ===
                        'active',
                  )
                  .length,
              note:
                'Customer tax exceptions',
            },
          ].map(
            metric => (
              <div
                key={
                  metric.label
                }
                className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm"
              >
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {
                    metric.label
                  }
                </p>
                <p className="mt-2 text-2xl font-black">
                  {
                    metric.value
                  }
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {
                    metric.note
                  }
                </p>
              </div>
            ),
          )
        }
      </section>

      <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-black">
              Tax engine
            </h3>
            <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-300">
              SaMi resolves invoice taxes from customer jurisdiction, customer type, product tax category, fiscal position, exemptions, tax rules and dated rate validity. The resolved tax components are frozen on each invoice line.
            </p>
          </div>
          <p className="rounded-xl bg-[var(--sami-surface-soft)] px-3 py-2 text-[10px] font-black">
            {
              data.settings
                .taxCalculation ===
              'inclusive'
                ? 'Prices include tax'
                : 'Tax added to prices'
            }
          </p>
        </div>
      </section>

      {
        data.capabilities
          .canManageSettings &&
        (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title="Tax rate"
              description="Create a dated jurisdiction-aware tax component such as VAT, withholding tax, levy or sales tax."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'create_tax_rate',
                      'Tax rate created.',
                      form => ({
                        name:
                          form.get(
                            'name',
                          ),
                        code:
                          blankToNull(
                            form.get(
                              'code',
                            ),
                          ),
                        rate:
                          form.get(
                            'rate',
                          ),
                        taxType:
                          form.get(
                            'taxType',
                          ),
                        countryCode:
                          blankToNull(
                            form.get(
                              'countryCode',
                            ),
                          ),
                        jurisdictionCode:
                          blankToNull(
                            form.get(
                              'jurisdictionCode',
                            ),
                          ),
                        validFrom:
                          blankToNull(
                            form.get(
                              'validFrom',
                            ),
                          ),
                        validTo:
                          blankToNull(
                            form.get(
                              'validTo',
                            ),
                          ),
                        priceIncluded:
                          form.get(
                            'priceIncluded',
                          ) ===
                          'on',
                        isDefault:
                          form.get(
                            'isDefault',
                          ) ===
                          'on',
                      }),
                    )
                }
              >
                <label>
                  <Label>Name</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="name"
                    required
                    maxLength={120}
                    placeholder="VAT 16%"
                  />
                </label>

                <label>
                  <Label>Code</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="code"
                    maxLength={80}
                    placeholder="VAT16"
                  />
                </label>

                <label>
                  <Label>Rate %</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.0001"
                    required
                  />
                </label>

                <label>
                  <Label>Tax type</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="taxType"
                    defaultValue="vat"
                    maxLength={40}
                  />
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    maxLength={2}
                    placeholder="KE"
                  />
                </label>

                <label>
                  <Label>Jurisdiction</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="jurisdictionCode"
                    maxLength={80}
                    placeholder="KE"
                  />
                </label>

                <label>
                  <Label>Valid from</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validFrom"
                    type="date"
                  />
                </label>

                <label>
                  <Label>Valid to</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validTo"
                    type="date"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="priceIncluded"
                    type="checkbox"
                  />
                  Rate is price-included
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="isDefault"
                    type="checkbox"
                  />
                  Default rate
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save tax rate
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card
              title="Tax group"
              description="Combine multiple tax components. Compound mode calculates later taxes on the base plus earlier tax."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_tax_group',
                      'Tax group saved.',
                      form => ({
                        name:
                          form.get(
                            'name',
                          ),
                        code:
                          blankToNull(
                            form.get(
                              'code',
                            ),
                          ),
                        description:
                          blankToNull(
                            form.get(
                              'description',
                            ),
                          ),
                        taxType:
                          form.get(
                            'taxType',
                          ),
                        countryCode:
                          blankToNull(
                            form.get(
                              'countryCode',
                            ),
                          ),
                        jurisdictionCode:
                          blankToNull(
                            form.get(
                              'jurisdictionCode',
                            ),
                          ),
                        calculationMode:
                          form.get(
                            'calculationMode',
                          ),
                        isDefault:
                          form.get(
                            'isDefault',
                          ) ===
                          'on',
                        isActive:
                          true,
                      }),
                    )
                }
              >
                <label>
                  <Label>Name</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="name"
                    required
                    placeholder="VAT + levy"
                  />
                </label>

                <label>
                  <Label>Code</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="code"
                    placeholder="VAT_LEVY"
                  />
                </label>

                <label>
                  <Label>Tax type</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="taxType"
                    defaultValue="vat"
                  />
                </label>

                <label>
                  <Label>Calculation</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="calculationMode"
                    defaultValue="sum"
                  >
                    <option value="sum">
                      Sum components
                    </option>
                    <option value="compound">
                      Compound
                    </option>
                  </select>
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    maxLength={2}
                    placeholder="KE"
                  />
                </label>

                <label>
                  <Label>Jurisdiction</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="jurisdictionCode"
                  />
                </label>

                <label className="sm:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    className={
                      textAreaClass
                    }
                    name="description"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="isDefault"
                    type="checkbox"
                  />
                  Default group
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save tax group
                  </SubmitButton>
                </div>
              </form>

              <form
                className="mt-4 grid gap-3 border-t border-[var(--sami-border)] pt-4 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_tax_group_member',
                      'Tax group component saved.',
                      form => ({
                        groupId:
                          form.get(
                            'groupId',
                          ),
                        taxRateId:
                          form.get(
                            'taxRateId',
                          ),
                        sequenceNo:
                          form.get(
                            'sequenceNo',
                          ),
                        compound:
                          form.get(
                            'compound',
                          ) ===
                          'on',
                      }),
                    )
                }
              >
                <label>
                  <Label>Tax group</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="groupId"
                    required
                  >
                    <option value="">
                      Select group
                    </option>
                    {
                      activeGroups.map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Tax rate</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="taxRateId"
                    required
                  >
                    <option value="">
                      Select rate
                    </option>
                    {
                      activeRates.map(
                        rate => (
                          <option
                            key={
                              rate.id
                            }
                            value={
                              rate.id
                            }
                          >
                            {
                              rate.name
                            } ({
                              rate.rate
                            }%)
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Sequence</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="sequenceNo"
                    type="number"
                    min="1"
                    defaultValue="10"
                  />
                </label>

                <label className="flex items-center gap-2 self-end pb-2 text-xs font-bold">
                  <input
                    name="compound"
                    type="checkbox"
                  />
                  Compound this component
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Add / update component
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card
              title="Fiscal position"
              description="Automatically map taxes for customer types or countries, or assign a fiscal position directly to a customer."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_fiscal_position',
                      'Fiscal position saved.',
                      form => ({
                        name:
                          form.get(
                            'name',
                          ),
                        code:
                          blankToNull(
                            form.get(
                              'code',
                            ),
                          ),
                        description:
                          blankToNull(
                            form.get(
                              'description',
                            ),
                          ),
                        countryCode:
                          blankToNull(
                            form.get(
                              'countryCode',
                            ),
                          ),
                        customerType:
                          blankToNull(
                            form.get(
                              'customerType',
                            ),
                          ),
                        priority:
                          form.get(
                            'priority',
                          ),
                        autoApply:
                          form.get(
                            'autoApply',
                          ) ===
                          'on',
                        isDefault:
                          form.get(
                            'isDefault',
                          ) ===
                          'on',
                        isActive:
                          true,
                      }),
                    )
                }
              >
                <label>
                  <Label>Name</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="name"
                    required
                    placeholder="Export customer"
                  />
                </label>

                <label>
                  <Label>Code</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="code"
                    placeholder="EXPORT"
                  />
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    maxLength={2}
                  />
                </label>

                <label>
                  <Label>Customer type</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="customerType"
                    defaultValue=""
                  >
                    <option value="">
                      Any type
                    </option>
                    <option value="company">
                      Company
                    </option>
                    <option value="individual">
                      Individual
                    </option>
                    <option value="government">
                      Government
                    </option>
                    <option value="non_profit">
                      Non-profit
                    </option>
                  </select>
                </label>

                <label>
                  <Label>Priority</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="priority"
                    type="number"
                    min="0"
                    defaultValue="100"
                  />
                </label>

                <label className="flex items-center gap-2 self-end pb-2 text-xs font-bold">
                  <input
                    name="autoApply"
                    type="checkbox"
                    defaultChecked
                  />
                  Auto-apply
                </label>

                <label className="sm:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    className={
                      textAreaClass
                    }
                    name="description"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="isDefault"
                    type="checkbox"
                  />
                  Default fallback
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save fiscal position
                  </SubmitButton>
                </div>
              </form>

              <form
                className="mt-4 grid gap-3 border-t border-[var(--sami-border)] pt-4 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_fiscal_position_mapping',
                      'Fiscal tax mapping saved.',
                      form => ({
                        positionId:
                          form.get(
                            'positionId',
                          ),
                        sourceTaxRateId:
                          blankToNull(
                            form.get(
                              'sourceTaxRateId',
                            ),
                          ),
                        sourceTaxGroupId:
                          blankToNull(
                            form.get(
                              'sourceTaxGroupId',
                            ),
                          ),
                        destinationTaxRateId:
                          blankToNull(
                            form.get(
                              'destinationTaxRateId',
                            ),
                          ),
                        destinationTaxGroupId:
                          blankToNull(
                            form.get(
                              'destinationTaxGroupId',
                            ),
                          ),
                        exempt:
                          form.get(
                            'exempt',
                          ) ===
                          'on',
                        label:
                          blankToNull(
                            form.get(
                              'label',
                            ),
                          ),
                        sequenceNo:
                          form.get(
                            'sequenceNo',
                          ),
                      }),
                    )
                }
              >
                <label>
                  <Label>Fiscal position</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="positionId"
                    required
                  >
                    <option value="">
                      Select position
                    </option>
                    {
                      activePositions.map(
                        position => (
                          <option
                            key={
                              position.id
                            }
                            value={
                              position.id
                            }
                          >
                            {
                              position.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Label</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="label"
                    placeholder="Export zero rate"
                  />
                </label>

                <label>
                  <Label>Source rate</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="sourceTaxRateId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeRates.map(
                        rate => (
                          <option
                            key={
                              rate.id
                            }
                            value={
                              rate.id
                            }
                          >
                            {
                              rate.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Source group</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="sourceTaxGroupId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeGroups.map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Destination rate</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="destinationTaxRateId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeRates.map(
                        rate => (
                          <option
                            key={
                              rate.id
                            }
                            value={
                              rate.id
                            }
                          >
                            {
                              rate.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Destination group</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="destinationTaxGroupId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeGroups.map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Sequence</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="sequenceNo"
                    type="number"
                    min="1"
                    defaultValue="100"
                  />
                </label>

                <label className="flex items-center gap-2 self-end pb-2 text-xs font-bold">
                  <input
                    name="exempt"
                    type="checkbox"
                  />
                  Map to tax-exempt
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save mapping
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card
              title="Tax rule"
              description="Map, keep or exempt taxes based on country, customer type, product tax category and effective dates."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_tax_rule',
                      'Tax rule saved.',
                      form => ({
                        name:
                          form.get(
                            'name',
                          ),
                        priority:
                          form.get(
                            'priority',
                          ),
                        action:
                          form.get(
                            'action',
                          ),
                        countryCode:
                          blankToNull(
                            form.get(
                              'countryCode',
                            ),
                          ),
                        customerType:
                          blankToNull(
                            form.get(
                              'customerType',
                            ),
                          ),
                        taxCategory:
                          blankToNull(
                            form.get(
                              'taxCategory',
                            ),
                          ),
                        sourceTaxRateId:
                          blankToNull(
                            form.get(
                              'sourceTaxRateId',
                            ),
                          ),
                        sourceTaxGroupId:
                          blankToNull(
                            form.get(
                              'sourceTaxGroupId',
                            ),
                          ),
                        destinationTaxRateId:
                          blankToNull(
                            form.get(
                              'destinationTaxRateId',
                            ),
                          ),
                        destinationTaxGroupId:
                          blankToNull(
                            form.get(
                              'destinationTaxGroupId',
                            ),
                          ),
                        validFrom:
                          blankToNull(
                            form.get(
                              'validFrom',
                            ),
                          ),
                        validTo:
                          blankToNull(
                            form.get(
                              'validTo',
                            ),
                          ),
                        stopProcessing:
                          form.get(
                            'stopProcessing',
                          ) ===
                          'on',
                        isActive:
                          true,
                      }),
                    )
                }
              >
                <label>
                  <Label>Name</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="name"
                    required
                    placeholder="Export zero rating"
                  />
                </label>

                <label>
                  <Label>Priority</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="priority"
                    type="number"
                    min="0"
                    defaultValue="100"
                  />
                </label>

                <label>
                  <Label>Action</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="action"
                    defaultValue="map"
                  >
                    <option value="map">
                      Map tax
                    </option>
                    <option value="exempt">
                      Exempt
                    </option>
                    <option value="keep">
                      Keep source
                    </option>
                  </select>
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    maxLength={2}
                  />
                </label>

                <label>
                  <Label>Customer type</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="customerType"
                    defaultValue=""
                  >
                    <option value="">
                      Any
                    </option>
                    <option value="company">
                      Company
                    </option>
                    <option value="individual">
                      Individual
                    </option>
                    <option value="government">
                      Government
                    </option>
                    <option value="non_profit">
                      Non-profit
                    </option>
                  </select>
                </label>

                <label>
                  <Label>Tax category</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="taxCategory"
                    placeholder="standard"
                  />
                </label>

                <label>
                  <Label>Source rate</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="sourceTaxRateId"
                    defaultValue=""
                  >
                    <option value="">
                      Any / none
                    </option>
                    {
                      activeRates.map(
                        rate => (
                          <option
                            key={
                              rate.id
                            }
                            value={
                              rate.id
                            }
                          >
                            {
                              rate.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Source group</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="sourceTaxGroupId"
                    defaultValue=""
                  >
                    <option value="">
                      Any / none
                    </option>
                    {
                      activeGroups.map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Destination rate</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="destinationTaxRateId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeRates.map(
                        rate => (
                          <option
                            key={
                              rate.id
                            }
                            value={
                              rate.id
                            }
                          >
                            {
                              rate.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Destination group</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="destinationTaxGroupId"
                    defaultValue=""
                  >
                    <option value="">
                      None
                    </option>
                    {
                      activeGroups.map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Valid from</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validFrom"
                    type="date"
                  />
                </label>

                <label>
                  <Label>Valid to</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validTo"
                    type="date"
                  />
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="stopProcessing"
                    type="checkbox"
                    defaultChecked
                  />
                  Stop after match
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save tax rule
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card
              title="Customer tax exemption"
              description="Record exemption authority and validity instead of silently zeroing tax on invoices."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_tax_exemption',
                      'Customer tax exemption saved.',
                      form => ({
                        customerId:
                          form.get(
                            'customerId',
                          ),
                        exemptionType:
                          form.get(
                            'exemptionType',
                          ),
                        certificateNumber:
                          blankToNull(
                            form.get(
                              'certificateNumber',
                            ),
                          ),
                        taxType:
                          blankToNull(
                            form.get(
                              'taxType',
                            ),
                          ),
                        countryCode:
                          blankToNull(
                            form.get(
                              'countryCode',
                            ),
                          ),
                        validFrom:
                          blankToNull(
                            form.get(
                              'validFrom',
                            ),
                          ),
                        validTo:
                          blankToNull(
                            form.get(
                              'validTo',
                            ),
                          ),
                        reason:
                          form.get(
                            'reason',
                          ),
                      }),
                    )
                }
              >
                <label>
                  <Label>Customer</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="customerId"
                    required
                  >
                    <option value="">
                      Select customer
                    </option>
                    {
                      data.customers.map(
                        customer => (
                          <option
                            key={
                              customer.id
                            }
                            value={
                              customer.id
                            }
                          >
                            {
                              customer.name
                            }
                          </option>
                        ),
                      )
                    }
                  </select>
                </label>

                <label>
                  <Label>Exemption type</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="exemptionType"
                    defaultValue="customer"
                  />
                </label>

                <label>
                  <Label>Certificate</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="certificateNumber"
                  />
                </label>

                <label>
                  <Label>Tax type</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="taxType"
                    placeholder="vat"
                  />
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    maxLength={2}
                  />
                </label>

                <label>
                  <Label>Valid from</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validFrom"
                    type="date"
                  />
                </label>

                <label>
                  <Label>Valid to</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="validTo"
                    type="date"
                  />
                </label>

                <label className="sm:col-span-2">
                  <Label>Reason</Label>
                  <textarea
                    className={
                      textAreaClass
                    }
                    name="reason"
                    required
                  />
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save exemption
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card
              title="Tax localization"
              description="Configure a country/jurisdiction tax registration and filing context. Part 16 will use this boundary for Kenya eTIMS."
            >
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={
                  event =>
                    submit(
                      event,
                      'save_tax_localization',
                      'Tax localization saved.',
                      form => ({
                        name:
                          form.get(
                            'name',
                          ),
                        countryCode:
                          form.get(
                            'countryCode',
                          ),
                        jurisdictionCode:
                          blankToNull(
                            form.get(
                              'jurisdictionCode',
                            ),
                          ),
                        taxRegistrationNumber:
                          blankToNull(
                            form.get(
                              'taxRegistrationNumber',
                            ),
                          ),
                        defaultTaxType:
                          form.get(
                            'defaultTaxType',
                          ),
                        filingFrequency:
                          form.get(
                            'filingFrequency',
                          ),
                        isDefault:
                          form.get(
                            'isDefault',
                          ) ===
                          'on',
                        isActive:
                          true,
                      }),
                    )
                }
              >
                <label>
                  <Label>Name</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="name"
                    required
                    placeholder="Kenya tax registration"
                  />
                </label>

                <label>
                  <Label>Country</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="countryCode"
                    required
                    maxLength={2}
                    placeholder="KE"
                  />
                </label>

                <label>
                  <Label>Jurisdiction</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="jurisdictionCode"
                    placeholder="KE"
                  />
                </label>

                <label>
                  <Label>Tax registration no.</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="taxRegistrationNumber"
                  />
                </label>

                <label>
                  <Label>Default tax type</Label>
                  <input
                    className={
                      inputClass
                    }
                    name="defaultTaxType"
                    defaultValue="vat"
                  />
                </label>

                <label>
                  <Label>Filing frequency</Label>
                  <select
                    className={
                      inputClass
                    }
                    name="filingFrequency"
                    defaultValue="monthly"
                  >
                    <option value="monthly">
                      Monthly
                    </option>
                    <option value="quarterly">
                      Quarterly
                    </option>
                    <option value="annual">
                      Annual
                    </option>
                    <option value="custom">
                      Custom
                    </option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    name="isDefault"
                    type="checkbox"
                  />
                  Default localization
                </label>

                <div className="sm:col-span-2">
                  <SubmitButton
                    pending={
                      pending
                    }
                  >
                    Save localization
                  </SubmitButton>
                </div>
              </form>
            </Card>
          </div>
        )
      }

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title="Tax rates & usage"
          description="Usage is calculated from historical invoice lines; inactive or expired rates remain visible for audit."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--sami-surface-soft)] text-[9px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">
                    Tax
                  </th>
                  <th className="px-3 py-2 text-right">
                    Rate
                  </th>
                  <th className="px-3 py-2 text-right">
                    Lines
                  </th>
                  <th className="px-3 py-2">
                    Validity
                  </th>
                </tr>
              </thead>
              <tbody>
                {
                  data.taxRates.map(
                    rate => (
                      <tr
                        key={
                          rate.id
                        }
                        className="border-t border-[var(--sami-border)]"
                      >
                        <td className="px-3 py-3">
                          <p className="font-black">
                            {
                              rate.name
                            }
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {
                              rate.code ||
                              rate.taxType
                            }{
                              rate.countryCode
                                ? ' · ' +
                                  rate.countryCode
                                : ''
                            }{
                              rate.isActive
                                ? ''
                                : ' · inactive'
                            }
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right font-black">
                          {
                            rate.rate
                          }%
                        </td>
                        <td className="px-3 py-3 text-right">
                          {
                            rate.invoiceLineCount
                          }
                        </td>
                        <td className="px-3 py-3 text-[10px]">
                          {
                            rate.validFrom ||
                            'Any'
                          } → {
                            rate.validTo ||
                            'Open'
                          }
                        </td>
                      </tr>
                    ),
                  )
                }
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Tax groups"
          description="Each group lists the ordered component rates that the invoice resolver will calculate."
        >
          <div className="space-y-2">
            {
              data.taxGroups.map(
                group => (
                  <details
                    key={
                      group.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <summary className="cursor-pointer text-xs font-black">
                      {
                        group.name
                      } · {
                        group.calculationMode
                      } · {
                        group.members.length
                      } components
                    </summary>
                    <div className="mt-3 space-y-2">
                      {
                        group.members.map(
                          member => (
                            <div
                              key={
                                member.id
                              }
                              className="flex items-center justify-between rounded-lg bg-[var(--sami-surface-soft)] px-3 py-2 text-[10px]"
                            >
                              <span className="font-bold">
                                {
                                  member.sequenceNo
                                }. {
                                  member.taxRateName
                                }
                              </span>
                              <span>
                                {
                                  member.rate
                                }%{
                                  member.compound
                                    ? ' · compound'
                                    : ''
                                }
                              </span>
                            </div>
                          ),
                        )
                      }
                    </div>
                  </details>
                ),
              )
            }
          </div>
        </Card>

        <Card
          title="Fiscal positions & mappings"
          description="These mappings are evaluated before general tax rules."
        >
          <div className="space-y-2">
            {
              data.fiscalPositions.map(
                position => (
                  <details
                    key={
                      position.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <summary className="cursor-pointer text-xs font-black">
                      {
                        position.name
                      } · priority {
                        position.priority
                      }{
                        position.autoApply
                          ? ' · auto'
                          : ''
                      }
                    </summary>
                    <p className="mt-2 text-[10px] text-slate-500">
                      {
                        position.countryCode ||
                        'Any country'
                      } · {
                        position.customerType ||
                        'Any customer type'
                      }
                    </p>
                    <div className="mt-3 space-y-2">
                      {
                        position.mappings.map(
                          mapping => (
                            <div
                              key={
                                mapping.id
                              }
                              className="rounded-lg bg-[var(--sami-surface-soft)] px-3 py-2 text-[10px]"
                            >
                              {
                                mapping.label ||
                                'Tax mapping'
                              } · {
                                mapping.exempt
                                  ? 'Exempt'
                                  : 'Mapped'
                              }
                            </div>
                          ),
                        )
                      }
                    </div>
                  </details>
                ),
              )
            }
          </div>
        </Card>

        <Card
          title="Tax rules"
          description="Rules are evaluated in priority order against country, customer type, product tax category and source tax."
        >
          <div className="space-y-2">
            {
              data.taxRules.map(
                rule => (
                  <div
                    key={
                      rule.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black">
                          {
                            rule.name
                          }
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          Priority {
                            rule.priority
                          } · {
                            rule.action
                          } · {
                            rule.countryCode ||
                            'any country'
                          } · {
                            rule.customerType ||
                            'any customer'
                          } · {
                            rule.taxCategory ||
                            'any category'
                          }
                        </p>
                      </div>
                      <span className="text-[9px] font-black uppercase">
                        {
                          rule.isActive
                            ? 'Active'
                            : 'Inactive'
                        }
                      </span>
                    </div>
                  </div>
                ),
              )
            }
          </div>
        </Card>

        <Card
          title="Tax exemptions"
          description="Exemptions retain certificate, reason and validity evidence."
        >
          <div className="space-y-2">
            {
              data.taxExemptions.map(
                exemption => (
                  <div
                    key={
                      exemption.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <p className="text-xs font-black">
                      {
                        exemption.customerName
                      }
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {
                        exemption.status
                      } · {
                        exemption.taxType ||
                        'all tax'
                      } · {
                        exemption.certificateNumber ||
                        'no certificate number'
                      }
                    </p>
                    <p className="mt-2 text-[10px]">
                      {
                        exemption.reason
                      }
                    </p>
                  </div>
                ),
              )
            }
          </div>
        </Card>

        <Card
          title="Tax localizations"
          description="Localization records are the jurisdiction boundary for statutory integrations such as Kenya eTIMS."
        >
          <div className="space-y-2">
            {
              data.taxLocalizations.map(
                localization => (
                  <div
                    key={
                      localization.id
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <p className="text-xs font-black">
                      {
                        localization.name
                      } · {
                        localization.countryCode
                      }
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {
                        localization.defaultTaxType
                      } · {
                        localization.filingFrequency
                      }{
                        localization.isDefault
                          ? ' · default'
                          : ''
                      }
                    </p>
                    <p className="mt-1 text-[10px]">
                      Registration: {
                        localization.taxRegistrationNumber ||
                        'not set'
                      }
                    </p>
                  </div>
                ),
              )
            }
          </div>
        </Card>
      </div>
    </div>
  );
}
