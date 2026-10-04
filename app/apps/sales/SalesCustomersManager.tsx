'use client';

import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


type Customer =
  SalesWorkspaceData[
    'billingCustomers'
  ][number];

type CustomerDraft = {
  customerId:
    string;
  customerType:
    string;
  name:
    string;
  legalName:
    string;
  contactName:
    string;
  email:
    string;
  phone:
    string;
  taxId:
    string;
  registrationNumber:
    string;
  billingAddress:
    string;
  shippingAddress:
    string;
  city:
    string;
  state:
    string;
  postalCode:
    string;
  country:
    string;
  countryCode:
    string;
  currency:
    string;
  creditLimit:
    string;
  notes:
    string;
};

function emptyDraft(
  currency:
    string,
): CustomerDraft {
  return {
    customerId:
      '',
    customerType:
      'company',
    name:
      '',
    legalName:
      '',
    contactName:
      '',
    email:
      '',
    phone:
      '',
    taxId:
      '',
    registrationNumber:
      '',
    billingAddress:
      '',
    shippingAddress:
      '',
    city:
      '',
    state:
      '',
    postalCode:
      '',
    country:
      '',
    countryCode:
      '',
    currency,
    creditLimit:
      '',
    notes:
      '',
  };
}

function fromCustomer(
  customer:
    Customer,
): CustomerDraft {
  return {
    customerId:
      customer.id,
    customerType:
      customer.customerType,
    name:
      customer.name,
    legalName:
      customer.legalName ||
      '',
    contactName:
      customer.contactName ||
      '',
    email:
      customer.email ||
      '',
    phone:
      customer.phone ||
      '',
    taxId:
      customer.taxId ||
      '',
    registrationNumber:
      customer.registrationNumber ||
      '',
    billingAddress:
      customer.billingAddress ||
      '',
    shippingAddress:
      customer.shippingAddress ||
      '',
    city:
      customer.city ||
      '',
    state:
      customer.state ||
      '',
    postalCode:
      customer.postalCode ||
      '',
    country:
      customer.country ||
      '',
    countryCode:
      customer.countryCode ||
      '',
    currency:
      customer.currency,
    creditLimit:
      customer.creditLimit ===
        null
        ? ''
        : String(
            customer.creditLimit,
          ),
    notes:
      customer.notes ||
      '',
  };
}

function draftToCustomer(
  draft:
    CustomerDraft,
  id:
    string,
  previous?:
    Customer,
): Customer {
  return {
    id,
    customerType:
      draft.customerType,
    name:
      draft.name.trim(),
    legalName:
      draft.legalName.trim() ||
      null,
    contactName:
      draft.contactName.trim() ||
      null,
    email:
      draft.email.trim() ||
      null,
    phone:
      draft.phone.trim() ||
      null,
    taxId:
      draft.taxId.trim() ||
      null,
    registrationNumber:
      draft.registrationNumber.trim() ||
      null,
    billingAddress:
      draft.billingAddress.trim() ||
      null,
    shippingAddress:
      draft.shippingAddress.trim() ||
      null,
    city:
      draft.city.trim() ||
      null,
    state:
      draft.state.trim() ||
      null,
    postalCode:
      draft.postalCode.trim() ||
      null,
    country:
      draft.country.trim() ||
      null,
    countryCode:
      draft.countryCode
        .trim()
        .toUpperCase() ||
      null,
    currency:
      draft.currency
        .trim()
        .toUpperCase(),
    creditLimit:
      draft.creditLimit.trim()
        ? Number(
            draft.creditLimit,
          )
        : null,
    notes:
      draft.notes.trim() ||
      null,
    status:
      previous?.status ||
      'active',
  };
}


export default function SalesCustomersManager({
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
    customers,
    setCustomers,
  ] =
    useState(
      data.billingCustomers,
    );

  const [
    search,
    setSearch,
  ] =
    useState('');

  const [
    draft,
    setDraft,
  ] =
    useState<CustomerDraft>(
      emptyDraft(
        data.company.currency ||
        'KES',
      ),
    );

  const [
    editing,
    setEditing,
  ] =
    useState(false);

  const visible =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return customers;
        }

        return customers.filter(
          customer =>
            [
              customer.name,
              customer.legalName,
              customer.contactName,
              customer.email,
              customer.phone,
              customer.taxId,
              customer.registrationNumber,
              customer.city,
              customer.country,
            ]
              .filter(
                Boolean,
              )
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                query,
              ),
        );
      },
      [
        customers,
        search,
      ],
    );

  function setField(
    key:
      keyof CustomerDraft,
    value:
      string,
  ) {
    setDraft(
      current => ({
        ...current,
        [key]:
          value,
      }),
    );
  }

  function reset() {
    setDraft(
      emptyDraft(
        data.company.currency ||
        'KES',
      ),
    );
    setEditing(
      false,
    );
  }

  async function save() {
    if (
      !draft.name.trim()
    ) {
      showError(
        'Customer name required',
        'Enter a customer or company name before saving.',
      );
      return;
    }

    try {
      const result =
        await request({
          action:
            editing
              ? 'update_customer'
              : 'create_customer',
          customerId:
            draft.customerId ||
            undefined,
          customerType:
            draft.customerType,
          name:
            draft.name,
          legalName:
            draft.legalName,
          contactName:
            draft.contactName,
          email:
            draft.email,
          phone:
            draft.phone,
          taxId:
            draft.taxId,
          registrationNumber:
            draft.registrationNumber,
          billingAddress:
            draft.billingAddress,
          shippingAddress:
            draft.shippingAddress,
          city:
            draft.city,
          state:
            draft.state,
          postalCode:
            draft.postalCode,
          country:
            draft.country,
          countryCode:
            draft.countryCode,
          currency:
            draft.currency,
          creditLimit:
            draft.creditLimit,
          notes:
            draft.notes,
        });

      const id =
        String(
          result.id ||
          draft.customerId ||
          '',
        );

      if (
        !id
      ) {
        throw new Error(
          'SaMi did not return the saved customer.',
        );
      }

      setCustomers(
        current => {
          const previous =
            current.find(
              customer =>
                customer.id ===
                id,
            );

          const next =
            draftToCustomer(
              draft,
              id,
              previous,
            );

          return [
            next,
            ...current.filter(
              customer =>
                customer.id !==
                id,
            ),
          ];
        },
      );

      showSuccess(
        editing
          ? 'Customer updated'
          : 'Customer created',
        editing
          ? 'The Sales customer and primary contact were updated in the shared customer master.'
          : 'The Sales customer and primary contact are ready for quotations and invoicing.',
      );

      reset();
    } catch (
      error
    ) {
      showError(
        editing
          ? 'Customer update failed'
          : 'Customer creation failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save this customer.',
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Roadmap Part 2
            </p>
            <h2 className="mt-1 text-xl font-black">
              Customers & contacts
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Maintain the shared customer master from Sales. The same identity is reused by quotations, sales orders, invoicing, payments and customer portal flows.
            </p>
          </div>

          {
            data.capabilities
              .canManageBillingCustomers &&
            (
              <button
                type="button"
                onClick={
                  reset
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <Plus
                  className="h-4 w-4"
                />
                New customer
              </button>
            )
          }
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="sami-surface rounded-[24px] p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
            />
            <input
              value={
                search
              }
              onChange={
                event =>
                  setSearch(
                    event.target.value,
                  )
              }
              placeholder="Search customers or contacts"
              className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm"
            />
          </div>

          <div className="mt-3 max-h-[680px] space-y-2 overflow-y-auto">
            {
              visible.length ===
                0
                ? (
                    <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                      No customers match this view.
                    </div>
                  )
                : visible.map(
                    customer => (
                      <button
                        key={
                          customer.id
                        }
                        type="button"
                        onClick={
                          () => {
                            setDraft(
                              fromCustomer(
                                customer,
                              ),
                            );
                            setEditing(
                              true,
                            );
                          }
                        }
                        className="w-full rounded-2xl border border-[var(--sami-border)] p-3 text-left transition hover:bg-slate-500/[0.04]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {
                                customer.customerType ===
                                  'individual'
                                  ? (
                                      <UserRound
                                        className="h-4 w-4 shrink-0"
                                      />
                                    )
                                  : (
                                      <Building2
                                        className="h-4 w-4 shrink-0"
                                      />
                                    )
                              }
                              <p className="truncate text-sm font-black">
                                {
                                  customer.name
                                }
                              </p>
                            </div>

                            {
                              customer.contactName &&
                              (
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {
                                    customer.contactName
                                  }
                                </p>
                              )
                            }

                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                              {
                                customer.email &&
                                (
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {
                                      customer.email
                                    }
                                  </span>
                                )
                              }
                              {
                                customer.phone &&
                                (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {
                                      customer.phone
                                    }
                                  </span>
                                )
                              }
                              {
                                (
                                  customer.city ||
                                  customer.country
                                ) &&
                                (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {
                                      [
                                        customer.city,
                                        customer.country,
                                      ]
                                        .filter(
                                          Boolean,
                                        )
                                        .join(
                                          ', ',
                                        )
                                    }
                                  </span>
                                )
                              }
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black uppercase">
                              {
                                customer.status
                              }
                            </span>
                            <Pencil className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                        </div>
                      </button>
                    ),
                  )
            }
          </div>
        </div>

        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
              {
                editing
                  ? 'Edit customer'
                  : 'New customer'
              }
            </p>
            <h3 className="mt-1 text-lg font-black">
              Customer identity & primary contact
            </h3>
          </div>

          {
            data.capabilities
              .canManageBillingCustomers
              ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field
                      label="Customer name"
                      value={
                        draft.name
                      }
                      onChange={
                        value =>
                          setField(
                            'name',
                            value,
                          )
                      }
                    />
                    <SelectField
                      label="Customer type"
                      value={
                        draft.customerType
                      }
                      onChange={
                        value =>
                          setField(
                            'customerType',
                            value,
                          )
                      }
                      options={[
                        ['company','Company'],
                        ['individual','Individual'],
                        ['government','Government'],
                        ['non_profit','Non-profit'],
                      ]}
                    />
                    <Field
                      label="Legal name"
                      value={
                        draft.legalName
                      }
                      onChange={
                        value =>
                          setField(
                            'legalName',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Primary contact"
                      value={
                        draft.contactName
                      }
                      onChange={
                        value =>
                          setField(
                            'contactName',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Email"
                      type="email"
                      value={
                        draft.email
                      }
                      onChange={
                        value =>
                          setField(
                            'email',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Phone"
                      value={
                        draft.phone
                      }
                      onChange={
                        value =>
                          setField(
                            'phone',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Tax ID"
                      value={
                        draft.taxId
                      }
                      onChange={
                        value =>
                          setField(
                            'taxId',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Registration number"
                      value={
                        draft.registrationNumber
                      }
                      onChange={
                        value =>
                          setField(
                            'registrationNumber',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Currency"
                      value={
                        draft.currency
                      }
                      maxLength={
                        3
                      }
                      onChange={
                        value =>
                          setField(
                            'currency',
                            value.toUpperCase(),
                          )
                      }
                    />
                    <Field
                      label="Credit limit"
                      type="number"
                      value={
                        draft.creditLimit
                      }
                      onChange={
                        value =>
                          setField(
                            'creditLimit',
                            value,
                          )
                      }
                    />
                    <Field
                      label="City"
                      value={
                        draft.city
                      }
                      onChange={
                        value =>
                          setField(
                            'city',
                            value,
                          )
                      }
                    />
                    <Field
                      label="State / region"
                      value={
                        draft.state
                      }
                      onChange={
                        value =>
                          setField(
                            'state',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Country"
                      value={
                        draft.country
                      }
                      onChange={
                        value =>
                          setField(
                            'country',
                            value,
                          )
                      }
                    />
                    <Field
                      label="Country code"
                      value={
                        draft.countryCode
                      }
                      maxLength={
                        2
                      }
                      onChange={
                        value =>
                          setField(
                            'countryCode',
                            value.toUpperCase(),
                          )
                      }
                    />
                    <div className="md:col-span-2">
                      <Area
                        label="Billing address"
                        value={
                          draft.billingAddress
                        }
                        onChange={
                          value =>
                            setField(
                              'billingAddress',
                              value,
                            )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Area
                        label="Shipping address"
                        value={
                          draft.shippingAddress
                        }
                        onChange={
                          value =>
                            setField(
                              'shippingAddress',
                              value,
                            )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Area
                        label="Notes"
                        value={
                          draft.notes
                        }
                        onChange={
                          value =>
                            setField(
                              'notes',
                              value,
                            )
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          save
                        }
                        className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
                      >
                        {
                          editing
                            ? 'Save customer'
                            : 'Create customer'
                        }
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy
                        }
                        onClick={
                          reset
                        }
                        className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )
              : (
                  <div className="mt-4 rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-sm text-slate-500">
                    You can view Sales customers, but customer-management permission is required to create or edit the shared customer master.
                  </div>
                )
          }
        </div>
      </div>
    </section>
  );
}


function Field({
  label,
  value,
  onChange,
  type =
    'text',
  maxLength,
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
  type?:
    string;
  maxLength?:
    number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <input
        type={
          type
        }
        value={
          value
        }
        maxLength={
          maxLength
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
  options:
    Array<
      [
        string,
        string,
      ]
    >;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <select
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      >
        {
          options.map(
            option => (
              <option
                key={
                  option[0]
                }
                value={
                  option[0]
                }
              >
                {
                  option[1]
                }
              </option>
            ),
          )
        }
      </select>
    </label>
  );
}


function Area({
  label,
  value,
  onChange,
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <textarea
        value={
          value
        }
        rows={
          3
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}
