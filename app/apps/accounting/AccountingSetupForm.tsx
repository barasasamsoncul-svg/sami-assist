'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import styles from './AccountingFoundation.module.css';


type AccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

type Setup = {
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultReceivableAccountId: string | null;
  defaultPayableAccountId: string | null;
  retainedEarningsAccountId: string | null;
  outputTaxAccountId: string | null;
  inputTaxAccountId: string | null;
  defaultCashAccountId: string | null;
  fxGainAccountId: string | null;
  fxLossAccountId: string | null;
  writeOffAccountId: string | null;
  roundingAccountId: string | null;
  roundingMethod: 'half_up' | 'half_even';
  globalLockDate: string | null;
  lockPostedEntries: boolean;
  requireOpenPeriod: boolean;
};

type AccountField =
  | 'defaultReceivableAccountId'
  | 'defaultPayableAccountId'
  | 'retainedEarningsAccountId'
  | 'outputTaxAccountId'
  | 'inputTaxAccountId'
  | 'defaultCashAccountId'
  | 'fxGainAccountId'
  | 'fxLossAccountId'
  | 'writeOffAccountId'
  | 'roundingAccountId';


const ACCOUNT_FIELDS:
  Array<{
    key: AccountField;
    label: string;
    hint: string;
    accepts: (
      type: string,
    ) => boolean;
  }> = [
    {
      key:
        'defaultReceivableAccountId',
      label:
        'Accounts receivable',
      hint:
        'Customer balances and invoice receivables.',
      accepts:
        type =>
          type ===
            'asset_receivable',
    },
    {
      key:
        'defaultPayableAccountId',
      label:
        'Accounts payable',
      hint:
        'Supplier balances and vendor bills.',
      accepts:
        type =>
          type ===
            'liability_payable',
    },
    {
      key:
        'retainedEarningsAccountId',
      label:
        'Retained earnings',
      hint:
        'Year-end accumulated profit or loss.',
      accepts:
        type =>
          type ===
            'equity' ||
          type.startsWith(
            'equity_',
          ),
    },
    {
      key:
        'defaultCashAccountId',
      label:
        'Default cash / bank',
      hint:
        'Default settlement ledger for cash or bank movements.',
      accepts:
        type =>
          type ===
            'asset_cash' ||
          type ===
            'asset_bank',
    },
    {
      key:
        'outputTaxAccountId',
      label:
        'Output tax',
      hint:
        'Tax collected from customers and payable to the authority.',
      accepts:
        type =>
          type ===
            'liability_current' ||
          type ===
            'liability_tax',
    },
    {
      key:
        'inputTaxAccountId',
      label:
        'Input tax',
      hint:
        'Recoverable purchase or input tax.',
      accepts:
        type =>
          type ===
            'asset_current' ||
          type ===
            'asset_tax',
    },
    {
      key:
        'fxGainAccountId',
      label:
        'FX gain',
      hint:
        'Realized and later revaluation gain postings.',
      accepts:
        type =>
          type ===
            'income' ||
          type.startsWith(
            'income_',
          ),
    },
    {
      key:
        'fxLossAccountId',
      label:
        'FX loss',
      hint:
        'Foreign-exchange loss postings.',
      accepts:
        type =>
          type ===
            'expense' ||
          type.startsWith(
            'expense_',
          ),
    },
    {
      key:
        'writeOffAccountId',
      label:
        'Write-off expense',
      hint:
        'Bad debt and approved small-balance write-offs.',
      accepts:
        type =>
          type ===
            'expense' ||
          type.startsWith(
            'expense_',
          ),
    },
    {
      key:
        'roundingAccountId',
      label:
        'Rounding account',
      hint:
        'Small approved rounding differences.',
      accepts:
        type =>
          type ===
            'expense' ||
          type.startsWith(
            'expense_',
          ) ||
          type ===
            'income' ||
          type.startsWith(
            'income_',
          ),
    },
  ];


function AccountSelect({
  field,
  value,
  accounts,
  disabled,
  onChange,
}: {
  field:
    typeof ACCOUNT_FIELDS[number];
  value:
    string | null;
  accounts:
    AccountOption[];
  disabled:
    boolean;
  onChange:
    (
      value:
        string | null,
    ) => void;
}) {
  const available =
    accounts.filter(
      account =>
        account.is_active &&
        field.accepts(
          account.account_type,
        ),
    );

  return (
    <label>
      <span>
        {field.label}
      </span>
      <select
        value={
          value ||
          ''
        }
        disabled={
          disabled
        }
        onChange={
          event =>
            onChange(
              event.target.value ||
              null,
            )
        }
      >
        <option value="">
          Not configured
        </option>
        {
          available.map(
            account => (
              <option
                key={
                  account.id
                }
                value={
                  account.id
                }
              >
                {
                  account.code
                } · {
                  account.name
                } · {
                  account.account_type
                    .replaceAll(
                      '_',
                      ' ',
                    )
                }
              </option>
            ),
          )
        }
      </select>
      <small
        className={
          styles.fieldHint
        }
      >
        {
          field.hint
        }
        {
          available.length ===
            0
            ? ' No compatible active account exists yet.'
            : ''
        }
      </small>
    </label>
  );
}


export default function AccountingSetupForm({
  companyId,
  currency,
  accounts,
  initialSetup,
  canManage,
}: {
  companyId:
    string;
  currency:
    string;
  accounts:
    AccountOption[];
  initialSetup:
    Setup;
  canManage:
    boolean;
}) {
  const [
    setup,
    setSetup,
  ] =
    useState<Setup>(
      initialSetup,
    );

  const [
    savedSetup,
    setSavedSetup,
  ] =
    useState<Setup>(
      initialSetup,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    feedback,
    setFeedback,
  ] =
    useState<
      | {
          kind:
            'success' |
            'error';
          message:
            string;
        }
      | null
    >(
      null,
    );

  const dirty =
    useMemo(
      () =>
        JSON.stringify(
          setup,
        ) !==
        JSON.stringify(
          savedSetup,
        ),
      [
        setup,
        savedSetup,
      ],
    );

  const configured =
    useMemo(
      () =>
        ACCOUNT_FIELDS.filter(
          field =>
            Boolean(
              setup[
                field.key
              ],
            ),
        ).length,
      [
        setup,
      ],
    );

  function setAccount(
    key:
      AccountField,
    value:
      string | null,
  ) {
    setSetup(
      previous => ({
        ...previous,
        [key]:
          value,
      }),
    );
  }

  async function save() {
    if (
      saving ||
      !canManage
    ) {
      return;
    }

    setSaving(
      true,
    );

    setFeedback(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/apps/accounting/setup',
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                expectedCompanyId:
                  companyId,
                ...setup,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.error ===
            'string'
            ? body.error
            : 'Accounting Setup could not be saved.',
        );
      }

      if (
        body.setup
      ) {
        setSetup(
          body.setup,
        );
        setSavedSetup(
          body.setup,
        );
      } else {
        setSavedSetup(
          setup,
        );
      }

      setFeedback({
        kind:
          'success',
        message:
          'Accounting Setup saved for this company.',
      });
    } catch (
      error
    ) {
      setFeedback({
        kind:
          'error',
        message:
          error instanceof
            Error
            ? error.message
            : 'Accounting Setup could not be saved.',
      });
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <>
      {
        feedback
          ? (
              <div
                className={
                  styles.feedbackOverlay
                }
                role={
                  feedback.kind ===
                    'error'
                    ? 'alert'
                    : 'status'
                }
              >
                <div
                  className={[
                    styles.feedbackCard,
                    feedback.kind ===
                      'error'
                      ? styles.feedbackError
                      : styles.feedbackSuccess,
                  ].join(
                    ' ',
                  )}
                >
                  {
                    feedback.kind ===
                      'error'
                      ? (
                          <TriangleAlert
                            size={
                              18
                            }
                          />
                        )
                      : (
                          <CheckCircle2
                            size={
                              18
                            }
                          />
                        )
                  }
                  <div>
                    <strong>
                      {
                        feedback.kind ===
                          'error'
                          ? 'Setup not saved'
                          : 'Setup saved'
                      }
                    </strong>
                    <p>
                      {
                        feedback.message
                      }
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={
                      () =>
                        setFeedback(
                          null,
                        )
                    }
                    aria-label="Dismiss message"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          : null
      }

      <div
        className={
          styles.setupSummary
        }
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            Company books
          </span>
          <h3>
            {
              configured
            } / {
              ACCOUNT_FIELDS.length
            } account mappings configured
          </h3>
          <p>
            Base currency: <strong>{currency}</strong>. Mappings are company-specific
            and are validated against the active chart of accounts.
          </p>
        </div>

        <div
          className={
            styles.setupSummaryBadge
          }
        >
          <ShieldCheck
            size={
              18
            }
          />
          {
            dirty
              ? 'Unsaved changes'
              : configured ===
                  ACCOUNT_FIELDS.length
                ? 'Core mappings complete'
                : 'Configuration in progress'
          }
        </div>
      </div>

      {
        !canManage
          ? (
              <div
                className={
                  styles.notice
                }
              >
                You can review Accounting Setup, but changing company accounting
                policy requires Accounting settings permission.
              </div>
            )
          : null
      }

      <section
        className={
          styles.setupSection
        }
      >
        <div
          className={
            styles.setupSectionHeading
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              Fiscal calendar
            </span>
            <h3>
              Financial year & rounding
            </h3>
            <p>
              Define the calendar used by period creation and the rounding
              policy used by future posting engines.
            </p>
          </div>
        </div>

        <div
          className={
            styles.setupGrid
          }
        >
          <label>
            Fiscal year start month
            <select
              value={
                setup.fiscalYearStartMonth
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      fiscalYearStartMonth:
                        Number(
                          event.target.value,
                        ),
                    }),
                  )
              }
            >
              {
                [
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ].map(
                  (
                    month,
                    index,
                  ) => (
                    <option
                      key={
                        month
                      }
                      value={
                        index +
                        1
                      }
                    >
                      {
                        month
                      }
                    </option>
                  ),
                )
              }
            </select>
          </label>

          <label>
            Fiscal year start day
            <input
              type="number"
              min={
                1
              }
              max={
                31
              }
              value={
                setup.fiscalYearStartDay
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      fiscalYearStartDay:
                        Number(
                          event.target.value,
                        ),
                    }),
                  )
              }
            />
          </label>

          <label>
            Rounding method
            <select
              value={
                setup.roundingMethod
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      roundingMethod:
                        event.target.value ===
                          'half_even'
                          ? 'half_even'
                          : 'half_up',
                    }),
                  )
              }
            >
              <option value="half_up">
                Half up
              </option>
              <option value="half_even">
                Half even / bankers rounding
              </option>
            </select>
          </label>
        </div>
      </section>

      <section
        className={
          styles.setupSection
        }
      >
        <div
          className={
            styles.setupSectionHeading
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              Control accounts
            </span>
            <h3>
              Ledger mappings
            </h3>
            <p>
              These defaults let Invoicing, purchasing, tax, banking and future
              subledgers post into one authoritative Accounting ledger.
            </p>
          </div>
        </div>

        <div
          className={
            styles.setupAccountGrid
          }
        >
          {
            ACCOUNT_FIELDS.map(
              field => (
                <AccountSelect
                  key={
                    field.key
                  }
                  field={
                    field
                  }
                  value={
                    setup[
                      field.key
                    ]
                  }
                  accounts={
                    accounts
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    value =>
                      setAccount(
                        field.key,
                        value,
                      )
                  }
                />
              ),
            )
          }
        </div>
      </section>

      <section
        className={
          styles.setupSection
        }
      >
        <div
          className={
            styles.setupSectionHeading
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              Period control
            </span>
            <h3>
              Lock policy
            </h3>
            <p>
              Global locks apply across fiscal periods. Period-specific lock
              dates remain available in Fiscal Periods.
            </p>
          </div>
          <LockKeyhole
            size={
              22
            }
          />
        </div>

        <div
          className={
            styles.setupGrid
          }
        >
          <label>
            Global lock date
            <input
              type="date"
              value={
                setup.globalLockDate ||
                ''
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      globalLockDate:
                        event.target.value ||
                        null,
                    }),
                  )
              }
            />
            <small
              className={
                styles.fieldHint
              }
            >
              Journals dated on or before this date are blocked.
            </small>
          </label>

          <label
            className={
              styles.toggleField
            }
          >
            <input
              type="checkbox"
              checked={
                setup.requireOpenPeriod
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      requireOpenPeriod:
                        event.target.checked,
                    }),
                  )
              }
            />
            <span>
              <strong>
                Require an open fiscal period
              </strong>
              <small>
                Recommended. Prevents journals outside an explicitly open period.
              </small>
            </span>
          </label>

          <label
            className={
              styles.toggleField
            }
          >
            <input
              type="checkbox"
              checked={
                setup.lockPostedEntries
              }
              disabled={
                !canManage
              }
              onChange={
                event =>
                  setSetup(
                    previous => ({
                      ...previous,
                      lockPostedEntries:
                        event.target.checked,
                    }),
                  )
              }
            />
            <span>
              <strong>
                Protect posted entries
              </strong>
              <small>
                Posted journals should be corrected by reversal, not destructive editing.
              </small>
            </span>
          </label>
        </div>
      </section>

      {
        canManage
          ? (
              <div
                className={
                  styles.setupSaveBar
                }
              >
                <div>
                  <strong>
                    Save company Accounting policy
                  </strong>
                  <p>
                    Changes affect this company only and are recorded in the workspace audit trail.
                  </p>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () => {
                        setSetup(
                          savedSetup,
                        );
                        setFeedback(
                          null,
                        );
                      }
                    }
                    disabled={
                      saving ||
                      !dirty
                    }
                  >
                    <RotateCcw
                      size={
                        16
                      }
                    />
                    Reset changes
                  </button>
                  <button
                    type="button"
                    className={
                      styles.primary
                    }
                    onClick={
                      save
                    }
                    disabled={
                      saving ||
                      !dirty
                    }
                  >
                    <Save
                      size={
                        16
                      }
                    />
                    {
                      saving
                        ? 'Saving…'
                        : dirty
                          ? 'Save setup'
                          : 'Saved'
                    }
                  </button>
                </div>
              </div>
            )
          : null
      }
    </>
  );
}
