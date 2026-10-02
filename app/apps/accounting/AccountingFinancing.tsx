'use client';

import {
  Activity,
  BadgeDollarSign,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Scale,
  TrendingDown,
  TrendingUp,
  WalletCards,
  XCircle,
} from 'lucide-react';
import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';
import {
  formatAccountingAmount,
} from '@/lib/apps/accounting/validation';
import type {
  AccountingFinancingWorkspace,
} from '@/lib/apps/accounting/financing-loader';

import styles from './AccountingFoundation.module.css';

type Row =
  Record<
    string,
    unknown
  >;

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function plusYears(
  value:
    string,
  years:
    number,
) {
  const date =
    new Date(
      value +
      'T00:00:00.000Z',
    );

  date.setUTCFullYear(
    date.getUTCFullYear() +
      years,
  );

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function title(
  value:
    unknown,
) {
  return String(
    value ||
    '',
  )
    .replaceAll(
      '_',
      ' ',
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase(),
    );
}

export default function AccountingFinancing({
  data,
  canCreate,
  canEdit,
}: {
  data:
    AccountingFinancingWorkspace;
  canCreate:
    boolean;
  canEdit:
    boolean;
}) {
  const router =
    useRouter();
  const {
    overlay,
    showSuccess,
    showError,
    confirmAction,
    closeOverlay,
  } =
    useSaMiOverlay();
  const [
    busy,
    setBusy,
  ] =
    useState(
      '',
    );
  const settingsRow =
    data.settings as Row;

  const [
    closeDate,
    setCloseDate,
  ] =
    useState(
      data.today ||
      today(),
    );

  const [
    settings,
    setSettings,
  ] =
    useState({
      enabled:
        settingsRow.enabled !==
        false,
      defaultBorrowingPrincipalAccountId:
        String(
          settingsRow
            .default_borrowing_principal_account_id ||
          '',
        ),
      defaultCurrentBorrowingAccountId:
        String(
          settingsRow
            .default_current_borrowing_account_id ||
          '',
        ),
      defaultLendingPrincipalAccountId:
        String(
          settingsRow
            .default_lending_principal_account_id ||
          '',
        ),
      defaultCurrentLendingAccountId:
        String(
          settingsRow
            .default_current_lending_account_id ||
          '',
        ),
      defaultInterestExpenseAccountId:
        String(
          settingsRow
            .default_interest_expense_account_id ||
          '',
        ),
      defaultInterestIncomeAccountId:
        String(
          settingsRow
            .default_interest_income_account_id ||
          '',
        ),
      defaultAccruedInterestLiabilityAccountId:
        String(
          settingsRow
            .default_accrued_interest_liability_account_id ||
          '',
        ),
      defaultAccruedInterestAssetAccountId:
        String(
          settingsRow
            .default_accrued_interest_asset_account_id ||
          '',
        ),
      defaultFinancingFeeExpenseAccountId:
        String(
          settingsRow
            .default_financing_fee_expense_account_id ||
          '',
        ),
      defaultFinancingFeeIncomeAccountId:
        String(
          settingsRow
            .default_financing_fee_income_account_id ||
          '',
        ),
      defaultDayCount:
        String(
          settingsRow
            .default_day_count ||
          'actual_365',
        ),
      defaultRepaymentStructure:
        String(
          settingsRow
            .default_repayment_structure ||
          'annuity',
        ),
      currentClassificationDays:
        String(
          settingsRow
            .current_classification_days ||
          365,
        ),
    });

  const [
    facility,
    setFacility,
  ] =
    useState({
      direction:
        'borrowing',
      facilityType:
        'term_loan',
      name:
        '',
      counterpartyName:
        '',
      counterpartyReference:
        '',
      currency:
        data.currency,
      principalLimit:
        '',
      startDate:
        data.today ||
        today(),
      maturityDate:
        plusYears(
          data.today ||
          today(),
          3,
        ),
      rateType:
        'fixed',
      annualRate:
        '',
      referenceRateName:
        '',
      initialReferenceRate:
        '',
      marginRate:
        '0',
      dayCount:
        String(
          settingsRow
            .default_day_count ||
          'actual_365',
        ),
      repaymentStructure:
        String(
          settingsRow
            .default_repayment_structure ||
          'annuity',
        ),
      paymentFrequency:
        'monthly',
      principalAccountId:
        '',
      currentPrincipalAccountId:
        '',
      interestAccountId:
        '',
      accruedInterestAccountId:
        '',
      feeAccountId:
        '',
      notes:
        '',
    });

  const [
    rateForm,
    setRateForm,
  ] =
    useState({
      facilityId:
        '',
      effectiveDate:
        data.today ||
        today(),
      referenceRate:
        '',
      marginRate:
        '0',
      source:
        '',
      externalReference:
        '',
    });

  const [
    drawdown,
    setDrawdown,
  ] =
    useState({
      facilityId:
        '',
      transactionDate:
        data.today ||
        today(),
      financialAccountId:
        '',
      amount:
        '',
      reference:
        '',
      notes:
        '',
    });

  const [
    repayment,
    setRepayment,
  ] =
    useState({
      facilityId:
        '',
      transactionDate:
        data.today ||
        today(),
      financialAccountId:
        '',
      principalAmount:
        '',
      interestAmount:
        '',
      feeAmount:
        '',
      reference:
        '',
      notes:
        '',
    });

  const [
    customSchedule,
    setCustomSchedule,
  ] =
    useState({
      facilityId:
        '',
      scheduleStartDate:
        data.today ||
        today(),
      lines: [
        {
          dueDate:
            plusYears(
              data.today ||
              today(),
              1,
            ),
          principalAmount:
            '',
          interestAmount:
            '',
          feeAmount:
            '',
        },
      ],
    });

  const metrics =
    data.metrics as Row;

  const assetAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account => {
            const type =
              String(
                account.account_type,
              );

            return type ===
              'asset' ||
              type.startsWith(
                'asset_',
              );
          },
        ),
      [
        data.accounts,
      ],
    );
  const liabilityAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account => {
            const type =
              String(
                account.account_type,
              );

            return type ===
              'liability' ||
              type.startsWith(
                'liability_',
              );
          },
        ),
      [
        data.accounts,
      ],
    );
  const expenseAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account => {
            const type =
              String(
                account.account_type,
              );

            return type ===
              'expense' ||
              type.startsWith(
                'expense_',
              );
          },
        ),
      [
        data.accounts,
      ],
    );
  const incomeAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account => {
            const type =
              String(
                account.account_type,
              );

            return type ===
              'income' ||
              type.startsWith(
                'income_',
              );
          },
        ),
      [
        data.accounts,
      ],
    );

  const activeFacilities =
    data.facilities.filter(
      row =>
        row.status ===
        'active',
    );

  const customFacilities =
    data.facilities.filter(
      row =>
        row.repayment_structure ===
          'custom' &&
        row.status ===
          'active',
    );

  const variableFacilities =
    data.facilities.filter(
      row =>
        row.rate_type ===
        'variable' &&
        (
          row.status ===
            'draft' ||
          row.status ===
            'active'
        ),
    );

  const principalAccounts =
    facility.direction ===
      'borrowing'
      ? liabilityAccounts
      : assetAccounts;
  const interestAccounts =
    facility.direction ===
      'borrowing'
      ? expenseAccounts
      : incomeAccounts;
  const accruedAccounts =
    facility.direction ===
      'borrowing'
      ? liabilityAccounts
      : assetAccounts;
  const feeAccounts =
    facility.direction ===
      'borrowing'
      ? expenseAccounts
      : incomeAccounts;

  const baseMoney = (
    value:
      unknown,
  ) =>
    formatAccountingAmount(
      String(
        value ||
        '0.00',
      ),
      data.currency,
    );

  const foreignMoney = (
    value:
      unknown,
    currency:
      unknown,
  ) =>
    String(
      currency ||
      '',
    ) +
    ' ' +
    String(
      value ||
      '0.0000',
    );

  async function request(
    body:
      Record<
        string,
        unknown
      >,
  ) {
    const response =
      await fetch(
        '/api/apps/accounting/financing',
        {
          method:
            'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body:
            JSON.stringify(
              body,
            ),
        },
      );
    const payload =
      await response
        .json()
        .catch(
          () => ({}),
        );

    if (
      !response.ok
    ) {
      throw new Error(
        payload.error ||
        'Loans and financing action failed.',
      );
    }

    return payload.result as Row;
  }

  async function run(
    key:
      string,
    body:
      Record<
        string,
        unknown
      >,
    successTitle:
      string,
    successMessage:
      (
        result:
          Row,
      ) => string,
  ) {
    setBusy(
      key,
    );

    try {
      const result =
        await request(
          body,
        );

      showSuccess(
        successTitle,
        successMessage(
          result,
        ),
      );
      router.refresh();

      return result;
    } catch (
      error
    ) {
      showError(
        successTitle +
        ' failed',
        error instanceof
          Error
          ? error.message
          : 'Retry this action.',
      );

      return null;
    } finally {
      setBusy(
        '',
      );
    }
  }

  async function saveSettings(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canEdit
    ) {
      return;
    }

    await run(
      'settings',
      {
        action:
          'save-settings',
        expectedCompanyId:
          data.companyId,
        ...settings,
      },
      'Financing settings saved',
      () =>
        'Company financing account mappings and close policy were updated.',
    );
  }

  async function createFacility(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canCreate
    ) {
      return;
    }

    const result =
      await run(
        'facility',
        {
          action:
            'create-facility',
          requestKey:
            crypto.randomUUID(),
          ...facility,
        },
        'Facility created',
        row =>
          String(
            row.facilityNumber ||
            'Financing facility',
          ) +
          ' was created as a draft.',
      );

    if (
      result
    ) {
      setFacility(
        current => ({
          ...current,
          name:
            '',
          counterpartyName:
            '',
          counterpartyReference:
            '',
          principalLimit:
            '',
          annualRate:
            '',
          referenceRateName:
            '',
          initialReferenceRate:
            '',
          marginRate:
            '0',
          notes:
            '',
        }),
      );
    }
  }

  async function postRate(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    await run(
      'rate',
      {
        action:
          'add-rate',
        requestKey:
          crypto.randomUUID(),
        ...rateForm,
      },
      'Rate period added',
      row =>
        'Effective annual rate ' +
        String(
          row.effectiveRate ||
          '',
        ) +
        '% is now available to the facility.',
    );
  }

  async function postDrawdown(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    const result =
      await run(
        'drawdown',
        {
          action:
            'post-drawdown',
          requestKey:
            crypto.randomUUID(),
          ...drawdown,
        },
        'Drawdown posted',
        () =>
          'The drawdown journal, facility balance and financial-account movement were posted together.',
      );

    if (
      result
    ) {
      setDrawdown(
        current => ({
          ...current,
          amount:
            '',
          reference:
            '',
          notes:
            '',
        }),
      );
    }
  }

  async function postRepayment(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    const result =
      await run(
        'repayment',
        {
          action:
            'post-repayment',
          requestKey:
            crypto.randomUUID(),
          ...repayment,
        },
        'Financing payment posted',
        () =>
          'Principal, accrued interest, fees and the financial-account movement were posted as one controlled transaction.',
      );

    if (
      result
    ) {
      setRepayment(
        current => ({
          ...current,
          principalAmount:
            '',
          interestAmount:
            '',
          feeAmount:
            '',
          reference:
            '',
          notes:
            '',
        }),
      );
    }
  }

  async function replaceCustomSchedule(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    await run(
      'custom-schedule',
      {
        action:
          'replace-custom-schedule',
        requestKey:
          crypto.randomUUID(),
        facilityId:
          customSchedule.facilityId,
        scheduleStartDate:
          customSchedule.scheduleStartDate,
        lines:
          customSchedule.lines,
      },
      'Custom schedule saved',
      result =>
        'Revision ' +
        String(
          result.revision ||
          '',
        ) +
        ' was created with ' +
        String(
          result.lines ||
          0,
        ) +
        ' custom line(s).',
    );
  }


  function activate(
    row:
      Row,
  ) {
    confirmAction({
      title:
        'Activate financing facility?',
      message:
        'SaMi will lock the validated accounting policy and create the initial amortization schedule. No cash journal is created until a drawdown is posted.',
      confirmLabel:
        'Activate',
      onConfirm: () => {
        void run(
          'activate-' +
          String(
            row.id,
          ),
          {
            action:
              'activate-facility',
            facilityId:
              row.id,
          },
          'Facility activated',
          result =>
            'The facility is active with schedule revision ' +
            String(
              result.revision ||
              1,
            ) +
            '.',
        );
      },
    });
  }

  function cancel(
    row:
      Row,
  ) {
    confirmAction({
      title:
        'Cancel draft facility?',
      message:
        'The draft will be closed without creating any accounting entries.',
      confirmLabel:
        'Cancel facility',
      onConfirm: () => {
        void run(
          'cancel-' +
          String(
            row.id,
          ),
          {
            action:
              'cancel-facility',
            facilityId:
              row.id,
          },
          'Facility cancelled',
          () =>
            'The draft financing facility was cancelled.',
        );
      },
    });
  }

  function closeFacility(
    row:
      Row,
  ) {
    confirmAction({
      title:
        'Close financing facility?',
      message:
        'Closure is allowed only when outstanding principal and accrued interest are both zero.',
      confirmLabel:
        'Close facility',
      onConfirm: () => {
        void run(
          'close-' +
          String(
            row.id,
          ),
          {
            action:
              'close-facility',
            facilityId:
              row.id,
          },
          'Facility closed',
          () =>
            'The financing facility has no remaining principal or accrued interest and is now closed.',
        );
      },
    });
  }

  function reverseTransaction(
    row:
      Row,
  ) {
    confirmAction({
      title:
        'Reverse financing transaction?',
      message:
        'SaMi will post a linked compensating journal and reverse the associated financial-account movement. Later facility activity must be reversed first.',
      confirmLabel:
        'Post reversal',
      onConfirm: () => {
        void run(
          'reverse-txn-' +
          String(
            row.id,
          ),
          {
            action:
              'reverse-transaction',
            transactionId:
              row.id,
            reversalDate:
              data.today,
          },
          'Transaction reversed',
          () =>
            'The financing transaction and its cash/FX movement were reversed with linked audit evidence.',
        );
      },
    });
  }

  function reverseInterest(
    row:
      Row,
  ) {
    confirmAction({
      title:
        'Reverse interest accrual?',
      message:
        'Later interest accruals or dependent payments must be reversed first.',
      confirmLabel:
        'Post reversal',
      onConfirm: () => {
        void run(
          'reverse-interest-' +
          String(
            row.id,
          ),
          {
            action:
              'reverse-interest-accrual',
            accrualId:
              row.id,
            reversalDate:
              data.today,
          },
          'Interest accrual reversed',
          () =>
            'A linked compensating journal was posted for the financing interest accrual.',
        );
      },
    });
  }

  return (
    <div
      className={
        styles.workspace
      }
    >
      <div
        className={
          styles.heading
        }
      >
        <div>
          <div
            className={
              styles.eyebrow
            }
          >
            Accounting · Loans & Financing
          </div>
          <h2>
            Borrowings, loans receivable and financing control
          </h2>
          <p>
            Manage facilities from approval through drawdown, rate changes, interest accrual, repayment, current/non-current classification, reversal and closure—without bypassing the Accounting ledger.
          </p>
        </div>
      </div>

      <section
        className={
          styles.financeCards
        }
      >
        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Active facilities
          </span>
          <strong>
            {String(
              metrics.active_facilities ||
              0,
            )}
          </strong>
          <small>
            {String(
              metrics.active_borrowings ||
              0,
            )} borrowing · {String(
              metrics.active_lending ||
              0,
            )} lending
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Borrowing principal
          </span>
          <strong>
            {baseMoney(
              metrics.borrowing_principal_base,
            )}
          </strong>
          <small>
            Base-currency principal movements
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Lending principal
          </span>
          <strong>
            {baseMoney(
              metrics.lending_principal_base,
            )}
          </strong>
          <small>
            Loan receivable principal movements
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Due in 30 days
          </span>
          <strong>
            {String(
              metrics.payments_next_30_days ||
              0,
            )}
          </strong>
          <small>
            Scheduled debt-service lines
          </small>
        </div>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Period close
            </div>
            <h3>
              Accrue interest and classify current principal
            </h3>
            <p>
              Interest uses posted drawdowns/repayments and effective rates. Classification posts only the delta needed between long-term and current principal accounts.
            </p>
          </div>
          <CalendarClock
            size={20}
          />
        </div>

        <div
          className={
            styles.formGrid
          }
        >
          <label>
            Close date
            <input
              type="date"
              value={
                closeDate
              }
              onChange={
                event =>
                  setCloseDate(
                    event.target
                      .value,
                  )
              }
            />
          </label>

          <button
            type="button"
            className={
              styles.primary
            }
            disabled={
              !canEdit ||
              busy ===
                'interest-run'
            }
            onClick={
              () =>
                void run(
                  'interest-run',
                  {
                    action:
                      'run-interest-accrual',
                    asOf:
                      closeDate,
                  },
                  'Interest accrual completed',
                  result =>
                    String(
                      result.accrued ||
                      0,
                    ) +
                    ' facility accrual(s) posted; ' +
                    String(
                      result.failed ||
                      0,
                    ) +
                    ' failed.',
                )
            }
          >
            <Play
              size={15}
            />
            Accrue interest
          </button>

          <button
            type="button"
            className={
              styles.button
            }
            disabled={
              !canEdit ||
              busy ===
                'classification'
            }
            onClick={
              () =>
                void run(
                  'classification',
                  {
                    action:
                      'classify-current',
                    asOf:
                      closeDate,
                    classificationDays:
                      Number(
                        settings.currentClassificationDays ||
                        365,
                      ),
                  },
                  'Principal classification completed',
                  result =>
                    String(
                      result.posted ||
                      0,
                    ) +
                    ' classification journal(s) posted; ' +
                    String(
                      result.failed ||
                      0,
                    ) +
                    ' failed.',
                )
            }
          >
            <Scale
              size={15}
            />
            Classify current portion
          </button>
        </div>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              New facility
            </div>
            <h3>
              Create borrowing or loan receivable
            </h3>
          </div>
          <Landmark
            size={20}
          />
        </div>

        <form
          className={
            styles.formGrid
          }
          onSubmit={
            createFacility
          }
        >
          <label>
            Direction
            <select
              value={
                facility.direction
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      direction:
                        event.target
                          .value,
                      principalAccountId:
                        '',
                      currentPrincipalAccountId:
                        '',
                      interestAccountId:
                        '',
                      accruedInterestAccountId:
                        '',
                      feeAccountId:
                        '',
                    }),
                  )
              }
            >
              <option value="borrowing">
                Borrowing / liability
              </option>
              <option value="lending">
                Lending / loan receivable
              </option>
            </select>
          </label>

          <label>
            Facility type
            <select
              value={
                facility.facilityType
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      facilityType:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="term_loan">
                Term loan
              </option>
              <option value="revolving_credit">
                Revolving credit
              </option>
              <option value="overdraft">
                Overdraft
              </option>
              <option value="note">
                Note
              </option>
              <option value="shareholder_loan">
                Shareholder loan
              </option>
              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label>
            Facility name
            <input
              value={
                facility.name
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      name:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Counterparty
            <input
              value={
                facility.counterpartyName
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      counterpartyName:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Counterparty reference
            <input
              value={
                facility.counterpartyReference
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      counterpartyReference:
                        event.target
                          .value,
                    }),
                  )
              }
            />
          </label>

          <label>
            Currency
            <input
              maxLength={3}
              value={
                facility.currency
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      currency:
                        event.target
                          .value
                          .toUpperCase(),
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Principal limit
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              value={
                facility.principalLimit
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      principalLimit:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Start date
            <input
              type="date"
              value={
                facility.startDate
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      startDate:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Maturity date
            <input
              type="date"
              value={
                facility.maturityDate
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      maturityDate:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Rate type
            <select
              value={
                facility.rateType
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      rateType:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="fixed">
                Fixed
              </option>
              <option value="variable">
                Variable
              </option>
            </select>
          </label>

          {facility.rateType ===
            'fixed' ? (
            <label>
              Annual rate %
              <input
                type="number"
                min="0"
                step="0.00000001"
                value={
                  facility.annualRate
                }
                onChange={
                  event =>
                    setFacility(
                      current => ({
                        ...current,
                        annualRate:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              />
            </label>
          ) : (
            <>
              <label>
                Reference rate
                <input
                  value={
                    facility.referenceRateName
                  }
                  onChange={
                    event =>
                      setFacility(
                        current => ({
                          ...current,
                          referenceRateName:
                            event.target
                              .value,
                        }),
                      )
                  }
                  placeholder="CBR, SOFR, EURIBOR..."
                  required
                />
              </label>

              <label>
                Initial reference %
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={
                    facility.initialReferenceRate
                  }
                  onChange={
                    event =>
                      setFacility(
                        current => ({
                          ...current,
                          initialReferenceRate:
                            event.target
                              .value,
                        }),
                      )
                  }
                  required
                />
              </label>

              <label>
                Margin %
                <input
                  type="number"
                  min="-100"
                  max="100"
                  step="0.00000001"
                  value={
                    facility.marginRate
                  }
                  onChange={
                    event =>
                      setFacility(
                        current => ({
                          ...current,
                          marginRate:
                            event.target
                              .value,
                        }),
                      )
                  }
                />
              </label>
            </>
          )}

          <label>
            Day count
            <select
              value={
                facility.dayCount
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      dayCount:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="actual_365">
                Actual / 365
              </option>
              <option value="actual_360">
                Actual / 360
              </option>
              <option value="thirty_360">
                30 / 360
              </option>
            </select>
          </label>

          <label>
            Repayment structure
            <select
              value={
                facility.repaymentStructure
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      repaymentStructure:
                        event.target
                          .value,
                      paymentFrequency:
                        event.target
                          .value ===
                          'custom'
                          ? 'custom'
                          : current.paymentFrequency ===
                              'custom'
                            ? 'monthly'
                            : current.paymentFrequency,
                    }),
                  )
              }
            >
              <option value="annuity">
                Annuity
              </option>
              <option value="equal_principal">
                Equal principal
              </option>
              <option value="interest_only">
                Interest only
              </option>
              <option value="bullet">
                Bullet
              </option>
              <option value="custom">
                Custom
              </option>
            </select>
          </label>

          <label>
            Payment frequency
            <select
              value={
                facility.paymentFrequency
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      paymentFrequency:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="monthly">
                Monthly
              </option>
              <option value="quarterly">
                Quarterly
              </option>
              <option value="semiannual">
                Semiannual
              </option>
              <option value="annual">
                Annual
              </option>
              <option value="bullet">
                Bullet
              </option>
              <option value="custom">
                Custom
              </option>
            </select>
          </label>

          <label>
            Principal account
            <select
              value={
                facility.principalAccountId
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      principalAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                Company default
              </option>
              {principalAccounts.map(
                account => (
                  <option
                    key={
                      String(
                        account.id,
                      )
                    }
                    value={
                      String(
                        account.id,
                      )
                    }
                  >
                    {String(
                      account.code,
                    )} · {String(
                      account.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Current principal account
            <select
              value={
                facility.currentPrincipalAccountId
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      currentPrincipalAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                Company default / none
              </option>
              {principalAccounts.map(
                account => (
                  <option
                    key={
                      String(
                        account.id,
                      )
                    }
                    value={
                      String(
                        account.id,
                      )
                    }
                  >
                    {String(
                      account.code,
                    )} · {String(
                      account.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Interest account
            <select
              value={
                facility.interestAccountId
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      interestAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                Company default
              </option>
              {interestAccounts.map(
                account => (
                  <option
                    key={
                      String(
                        account.id,
                      )
                    }
                    value={
                      String(
                        account.id,
                      )
                    }
                  >
                    {String(
                      account.code,
                    )} · {String(
                      account.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Accrued-interest account
            <select
              value={
                facility.accruedInterestAccountId
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      accruedInterestAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                Company default
              </option>
              {accruedAccounts.map(
                account => (
                  <option
                    key={
                      String(
                        account.id,
                      )
                    }
                    value={
                      String(
                        account.id,
                      )
                    }
                  >
                    {String(
                      account.code,
                    )} · {String(
                      account.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Fee account
            <select
              value={
                facility.feeAccountId
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      feeAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                Company default / none
              </option>
              {feeAccounts.map(
                account => (
                  <option
                    key={
                      String(
                        account.id,
                      )
                    }
                    value={
                      String(
                        account.id,
                      )
                    }
                  >
                    {String(
                      account.code,
                    )} · {String(
                      account.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Notes
            <input
              value={
                facility.notes
              }
              onChange={
                event =>
                  setFacility(
                    current => ({
                      ...current,
                      notes:
                        event.target
                          .value,
                    }),
                  )
              }
            />
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              !canCreate ||
              busy ===
                'facility'
            }
          >
            <BadgeDollarSign
              size={15}
            />
            Create facility
          </button>
        </form>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Facilities
            </div>
            <h3>
              Financing register
            </h3>
          </div>
          <WalletCards
            size={20}
          />
        </div>

        <div
          className={
            styles.tableWrap
          }
        >
          <table>
            <thead>
              <tr>
                <th>
                  Facility
                </th>
                <th>
                  Direction
                </th>
                <th>
                  Counterparty
                </th>
                <th>
                  Outstanding
                </th>
                <th>
                  Current portion
                </th>
                <th>
                  Rate
                </th>
                <th>
                  Next due
                </th>
                <th>
                  Status
                </th>
                <th>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.facilities.map(
                row => (
                  <tr
                    key={
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      <strong>
                        {String(
                          row.facility_number,
                        )}
                      </strong>
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {String(
                          row.name,
                        )} · {String(
                          row.currency,
                        )}
                      </span>
                    </td>
                    <td>
                      {title(
                        row.direction,
                      )}
                    </td>
                    <td>
                      {String(
                        row.counterparty_name,
                      )}
                    </td>
                    <td>
                      {foreignMoney(
                        row.outstanding_principal_foreign,
                        row.currency,
                      )}
                      <span
                        className={
                          styles.meta
                        }
                      >
                        Interest {foreignMoney(
                          row.outstanding_interest_foreign,
                          row.currency,
                        )}
                      </span>
                    </td>
                    <td>
                      {baseMoney(
                        row.current_principal_base,
                      )}
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {String(
                          row.classification_as_of ||
                          'Not classified',
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.effective_annual_rate ||
                        row.annual_rate ||
                        '—',
                      )}{row.effective_annual_rate ||
                      row.annual_rate
                        ? '%'
                        : ''}
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {title(
                          row.rate_type,
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.next_due_date ||
                        '—',
                      )}
                      <span
                        className={
                          styles.meta
                        }
                      >
                        P {String(
                          row.next_principal ||
                          '0.0000',
                        )} · I {String(
                          row.next_interest ||
                          '0.0000',
                        )}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          styles.badge
                        }
                      >
                        {String(
                          row.status,
                        )}
                      </span>
                    </td>
                    <td>
                      <div
                        className={
                          styles.actions
                        }
                      >
                        {row.status ===
                          'draft' ? (
                          <>
                            <button
                              type="button"
                              className={
                                styles.primary
                              }
                              disabled={
                                !canEdit
                              }
                              onClick={
                                () =>
                                  activate(
                                    row,
                                  )
                              }
                            >
                              <CheckCircle2
                                size={14}
                              />
                              Activate
                            </button>
                            <button
                              type="button"
                              className={
                                styles.button
                              }
                              disabled={
                                !canEdit
                              }
                              onClick={
                                () =>
                                  cancel(
                                    row,
                                  )
                              }
                            >
                              <XCircle
                                size={14}
                              />
                              Cancel
                            </button>
                          </>
                        ) : null}

                        {row.status ===
                          'active' ? (
                          <button
                            type="button"
                            className={
                              styles.button
                            }
                            disabled={
                              !canEdit
                            }
                            onClick={
                              () =>
                                closeFacility(
                                  row,
                                )
                            }
                          >
                            Close
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ),
              )}

              {!data.facilities
                .length ? (
                <tr>
                  <td
                    colSpan={9}
                  >
                    No financing facilities yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={
          styles.columns
        }
      >
        <div
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <div
                className={
                  styles.eyebrow
                }
              >
                Drawdown
              </div>
              <h3>
                Move financing principal
              </h3>
            </div>
            <TrendingUp
              size={20}
            />
          </div>

          <form
            className={
              styles.formGrid
            }
            onSubmit={
              postDrawdown
            }
          >
            <label>
              Facility
              <select
                value={
                  drawdown.facilityId
                }
                onChange={
                  event =>
                    setDrawdown(
                      current => ({
                        ...current,
                        facilityId:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              >
                <option value="">
                  Choose active facility
                </option>
                {activeFacilities.map(
                  row => (
                    <option
                      key={
                        String(
                          row.id,
                        )
                      }
                      value={
                        String(
                          row.id,
                        )
                      }
                    >
                      {String(
                        row.facility_number,
                      )} · {String(
                        row.name,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Financial account
              <select
                value={
                  drawdown.financialAccountId
                }
                onChange={
                  event =>
                    setDrawdown(
                      current => ({
                        ...current,
                        financialAccountId:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              >
                <option value="">
                  Choose bank/cash/mobile-money account
                </option>
                {data.financialAccounts.map(
                  account => (
                    <option
                      key={
                        String(
                          account.id,
                        )
                      }
                      value={
                        String(
                          account.id,
                        )
                      }
                    >
                      {String(
                        account.name,
                      )} · {String(
                        account.currency,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={
                  drawdown.transactionDate
                }
                onChange={
                  event =>
                    setDrawdown(
                      current => ({
                        ...current,
                        transactionDate:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              />
            </label>

            <label>
              Amount
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={
                  drawdown.amount
                }
                onChange={
                  event =>
                    setDrawdown(
                      current => ({
                        ...current,
                        amount:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              />
            </label>

            <label>
              Reference
              <input
                value={
                  drawdown.reference
                }
                onChange={
                  event =>
                    setDrawdown(
                      current => ({
                        ...current,
                        reference:
                          event.target
                            .value,
                      }),
                    )
                }
              />
            </label>

            <button
              type="submit"
              className={
                styles.primary
              }
              disabled={
                !canCreate ||
                busy ===
                  'drawdown'
              }
            >
              <Banknote
                size={15}
              />
              Post drawdown
            </button>
          </form>
        </div>

        <div
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <div
                className={
                  styles.eyebrow
                }
              >
                Repayment
              </div>
              <h3>
                Principal, interest and fees
              </h3>
            </div>
            <TrendingDown
              size={20}
            />
          </div>

          <form
            className={
              styles.formGrid
            }
            onSubmit={
              postRepayment
            }
          >
            <label>
              Facility
              <select
                value={
                  repayment.facilityId
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        facilityId:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              >
                <option value="">
                  Choose active facility
                </option>
                {activeFacilities.map(
                  row => (
                    <option
                      key={
                        String(
                          row.id,
                        )
                      }
                      value={
                        String(
                          row.id,
                        )
                      }
                    >
                      {String(
                        row.facility_number,
                      )} · {String(
                        row.name,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Financial account
              <select
                value={
                  repayment.financialAccountId
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        financialAccountId:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              >
                <option value="">
                  Choose bank/cash/mobile-money account
                </option>
                {data.financialAccounts.map(
                  account => (
                    <option
                      key={
                        String(
                          account.id,
                        )
                      }
                      value={
                        String(
                          account.id,
                        )
                      }
                    >
                      {String(
                        account.name,
                      )} · {String(
                        account.currency,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={
                  repayment.transactionDate
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        transactionDate:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              />
            </label>

            <label>
              Principal
              <input
                type="number"
                min="0"
                step="0.0001"
                value={
                  repayment.principalAmount
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        principalAmount:
                          event.target
                            .value,
                      }),
                    )
                }
              />
            </label>

            <label>
              Accrued interest
              <input
                type="number"
                min="0"
                step="0.0001"
                value={
                  repayment.interestAmount
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        interestAmount:
                          event.target
                            .value,
                      }),
                    )
                }
              />
            </label>

            <label>
              Fee
              <input
                type="number"
                min="0"
                step="0.0001"
                value={
                  repayment.feeAmount
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        feeAmount:
                          event.target
                            .value,
                      }),
                    )
                }
              />
            </label>

            <label>
              Reference
              <input
                value={
                  repayment.reference
                }
                onChange={
                  event =>
                    setRepayment(
                      current => ({
                        ...current,
                        reference:
                          event.target
                            .value,
                      }),
                    )
                }
              />
            </label>

            <button
              type="submit"
              className={
                styles.primary
              }
              disabled={
                !canCreate ||
                busy ===
                  'repayment'
              }
            >
              <CircleDollarSign
                size={15}
              />
              Post payment
            </button>
          </form>
        </div>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Variable rate
            </div>
            <h3>
              Add effective rate period
            </h3>
          </div>
          <RefreshCcw
            size={20}
          />
        </div>

        <form
          className={
            styles.formGrid
          }
          onSubmit={
            postRate
          }
        >
          <label>
            Facility
            <select
              value={
                rateForm.facilityId
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      facilityId:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            >
              <option value="">
                Choose variable-rate facility
              </option>
              {variableFacilities.map(
                row => (
                  <option
                    key={
                      String(
                        row.id,
                      )
                    }
                    value={
                      String(
                        row.id,
                      )
                    }
                  >
                    {String(
                      row.facility_number,
                    )} · {String(
                      row.name,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            Effective date
            <input
              type="date"
              value={
                rateForm.effectiveDate
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      effectiveDate:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Reference rate %
            <input
              type="number"
              min="0"
              step="0.00000001"
              value={
                rateForm.referenceRate
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      referenceRate:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Margin %
            <input
              type="number"
              min="-100"
              max="100"
              step="0.00000001"
              value={
                rateForm.marginRate
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      marginRate:
                        event.target
                          .value,
                    }),
                  )
              }
            />
          </label>

          <label>
            Source
            <input
              value={
                rateForm.source
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      source:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="CBK, SOFR administrator, lender notice..."
            />
          </label>

          <label>
            External reference
            <input
              value={
                rateForm.externalReference
              }
              onChange={
                event =>
                  setRateForm(
                    current => ({
                      ...current,
                      externalReference:
                        event.target
                          .value,
                    }),
                  )
              }
            />
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              !canEdit ||
              busy ===
                'rate'
            }
          >
            Save rate
          </button>
        </form>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Custom lender schedule
            </div>
            <h3>
              Replace the current manual repayment revision
            </h3>
            <p>
              For Custom facilities, activate the facility and post the drawdown first. Then enter the lender repayment plan here; principal across all lines must exactly equal the drawn principal.
            </p>
          </div>
          <CalendarClock
            size={20}
          />
        </div>

        <form
          onSubmit={
            replaceCustomSchedule
          }
        >
          <div
            className={
              styles.formGrid
            }
          >
            <label>
              Facility
              <select
                value={
                  customSchedule.facilityId
                }
                onChange={
                  event =>
                    setCustomSchedule(
                      current => ({
                        ...current,
                        facilityId:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              >
                <option value="">
                  Choose custom facility
                </option>
                {customFacilities.map(
                  row => (
                    <option
                      key={
                        String(
                          row.id,
                        )
                      }
                      value={
                        String(
                          row.id,
                        )
                      }
                    >
                      {String(
                        row.facility_number,
                      )} · {String(
                        row.name,
                      )}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Schedule start date
              <input
                type="date"
                value={
                  customSchedule.scheduleStartDate
                }
                onChange={
                  event =>
                    setCustomSchedule(
                      current => ({
                        ...current,
                        scheduleStartDate:
                          event.target
                            .value,
                      }),
                    )
                }
                required
              />
            </label>
          </div>

          <div
            className={
              styles.openingManualRows
            }
          >
            {customSchedule.lines.map(
              (
                row,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  className={
                    styles.openingManualRow
                  }
                >
                  <div
                    className={
                      styles.panelHeading
                    }
                  >
                    <strong>
                      Payment line {String(
                        index +
                        1,
                      )}
                    </strong>

                    {customSchedule
                      .lines
                      .length >
                    1 ? (
                      <button
                        type="button"
                        className={
                          styles.button
                        }
                        onClick={
                          () =>
                            setCustomSchedule(
                              current => ({
                                ...current,
                                lines:
                                  current.lines.filter(
                                    (
                                      _,
                                      rowIndex,
                                    ) =>
                                      rowIndex !==
                                      index,
                                  ),
                              }),
                            )
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div
                    className={
                      styles.formGrid
                    }
                  >
                    <label>
                      Due date
                      <input
                        type="date"
                        value={
                          row.dueDate
                        }
                        onChange={
                          event =>
                            setCustomSchedule(
                              current => ({
                                ...current,
                                lines:
                                  current.lines.map(
                                    (
                                      line,
                                      rowIndex,
                                    ) =>
                                      rowIndex ===
                                        index
                                        ? {
                                            ...line,
                                            dueDate:
                                              event.target
                                                .value,
                                          }
                                        : line,
                                  ),
                              }),
                            )
                        }
                        required
                      />
                    </label>

                    <label>
                      Principal
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={
                          row.principalAmount
                        }
                        onChange={
                          event =>
                            setCustomSchedule(
                              current => ({
                                ...current,
                                lines:
                                  current.lines.map(
                                    (
                                      line,
                                      rowIndex,
                                    ) =>
                                      rowIndex ===
                                        index
                                        ? {
                                            ...line,
                                            principalAmount:
                                              event.target
                                                .value,
                                          }
                                        : line,
                                  ),
                              }),
                            )
                        }
                      />
                    </label>

                    <label>
                      Interest
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={
                          row.interestAmount
                        }
                        onChange={
                          event =>
                            setCustomSchedule(
                              current => ({
                                ...current,
                                lines:
                                  current.lines.map(
                                    (
                                      line,
                                      rowIndex,
                                    ) =>
                                      rowIndex ===
                                        index
                                        ? {
                                            ...line,
                                            interestAmount:
                                              event.target
                                                .value,
                                          }
                                        : line,
                                  ),
                              }),
                            )
                        }
                      />
                    </label>

                    <label>
                      Fee
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={
                          row.feeAmount
                        }
                        onChange={
                          event =>
                            setCustomSchedule(
                              current => ({
                                ...current,
                                lines:
                                  current.lines.map(
                                    (
                                      line,
                                      rowIndex,
                                    ) =>
                                      rowIndex ===
                                        index
                                        ? {
                                            ...line,
                                            feeAmount:
                                              event.target
                                                .value,
                                          }
                                        : line,
                                  ),
                              }),
                            )
                        }
                      />
                    </label>
                  </div>
                </div>
              ),
            )}
          </div>

          <div
            className={
              styles.actions
            }
          >
            <button
              type="button"
              className={
                styles.button
              }
              onClick={
                () =>
                  setCustomSchedule(
                    current => ({
                      ...current,
                      lines: [
                        ...current.lines,
                        {
                          dueDate:
                            '',
                          principalAmount:
                            '',
                          interestAmount:
                            '',
                          feeAmount:
                            '',
                        },
                      ],
                    }),
                  )
              }
            >
              Add schedule line
            </button>

            <button
              type="submit"
              className={
                styles.primary
              }
              disabled={
                !canEdit ||
                busy ===
                  'custom-schedule'
              }
            >
              Save custom revision
            </button>
          </div>
        </form>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Amortization
            </div>
            <h3>
              Current schedule revision
            </h3>
          </div>
          <Activity
            size={20}
          />
        </div>

        <div
          className={
            styles.tableWrap
          }
        >
          <table>
            <thead>
              <tr>
                <th>
                  Facility
                </th>
                <th>
                  Due
                </th>
                <th>
                  Opening
                </th>
                <th>
                  Principal
                </th>
                <th>
                  Interest
                </th>
                <th>
                  Closing
                </th>
                <th>
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.map(
                row => (
                  <tr
                    key={
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      <strong>
                        {String(
                          row.facility_number,
                        )}
                      </strong>
                      <span
                        className={
                          styles.meta
                        }
                      >
                        Rev {String(
                          row.revision,
                        )} · #{String(
                          row.sequence,
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.due_date,
                      )}
                    </td>
                    <td>
                      {String(
                        row.opening_principal,
                      )}
                    </td>
                    <td>
                      {String(
                        row.scheduled_principal,
                      )}
                    </td>
                    <td>
                      {String(
                        row.scheduled_interest,
                      )}
                    </td>
                    <td>
                      {String(
                        row.closing_principal,
                      )}
                    </td>
                    <td>
                      {String(
                        row.annual_rate,
                      )}%
                    </td>
                  </tr>
                ),
              )}

              {!data.schedules
                .length ? (
                <tr>
                  <td
                    colSpan={7}
                  >
                    No active amortization schedule yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Transactions
            </div>
            <h3>
              Drawdowns and financing payments
            </h3>
          </div>
          <Banknote
            size={20}
          />
        </div>

        <div
          className={
            styles.tableWrap
          }
        >
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>
                <th>
                  Facility
                </th>
                <th>
                  Type
                </th>
                <th>
                  Amount
                </th>
                <th>
                  Principal
                </th>
                <th>
                  Interest
                </th>
                <th>
                  Financial account
                </th>
                <th>
                  Status
                </th>
                <th>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map(
                row => (
                  <tr
                    key={
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      {String(
                        row.transaction_date,
                      )}
                    </td>
                    <td>
                      {String(
                        row.facility_number,
                      )}
                    </td>
                    <td>
                      {title(
                        row.transaction_type,
                      )}
                    </td>
                    <td>
                      {foreignMoney(
                        row.foreign_amount,
                        row.currency,
                      )}
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {baseMoney(
                          row.base_amount,
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.principal_foreign,
                      )}
                    </td>
                    <td>
                      {String(
                        row.interest_foreign,
                      )}
                    </td>
                    <td>
                      {String(
                        row.financial_account_name ||
                        '—',
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          styles.badge
                        }
                      >
                        {String(
                          row.status,
                        )}
                      </span>
                    </td>
                    <td>
                      {row.status ===
                        'posted' ? (
                        <button
                          type="button"
                          className={
                            styles.button
                          }
                          disabled={
                            !canEdit
                          }
                          onClick={
                            () =>
                              reverseTransaction(
                                row,
                              )
                          }
                        >
                          <RotateCcw
                            size={14}
                          />
                          Reverse
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ),
              )}

              {!data.transactions
                .length ? (
                <tr>
                  <td
                    colSpan={9}
                  >
                    No financing transactions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className={
          styles.columns
        }
      >
        <div
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <div
                className={
                  styles.eyebrow
                }
              >
                Interest accruals
              </div>
              <h3>
                Posted interest history
              </h3>
            </div>
            <CircleDollarSign
              size={20}
            />
          </div>

          <div
            className={
              styles.tableWrap
            }
          >
            <table>
              <thead>
                <tr>
                  <th>
                    Period
                  </th>
                  <th>
                    Facility
                  </th>
                  <th>
                    Interest
                  </th>
                  <th>
                    Rate
                  </th>
                  <th>
                    Status
                  </th>
                  <th>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.accruals.map(
                  row => (
                    <tr
                      key={
                        String(
                          row.id,
                        )
                      }
                    >
                      <td>
                        {String(
                          row.period_start,
                        )} → {String(
                          row.period_end,
                        )}
                      </td>
                      <td>
                        {String(
                          row.facility_number,
                        )}
                      </td>
                      <td>
                        {foreignMoney(
                          row.foreign_interest_amount,
                          row.currency,
                        )}
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {baseMoney(
                            row.base_interest_amount,
                          )}
                        </span>
                      </td>
                      <td>
                        {String(
                          row.annual_rate,
                        )}%
                      </td>
                      <td>
                        {String(
                          row.status,
                        )}
                      </td>
                      <td>
                        {row.status ===
                          'posted' ? (
                          <button
                            type="button"
                            className={
                              styles.button
                            }
                            disabled={
                              !canEdit
                            }
                            onClick={
                              () =>
                                reverseInterest(
                                  row,
                                )
                            }
                          >
                            Reverse
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ),
                )}

                {!data.accruals
                  .length ? (
                  <tr>
                    <td
                      colSpan={6}
                    >
                      No interest accruals yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <div
                className={
                  styles.eyebrow
                }
              >
                Classification
              </div>
              <h3>
                Current / non-current history
              </h3>
            </div>
            <Scale
              size={20}
            />
          </div>

          <div
            className={
              styles.tableWrap
            }
          >
            <table>
              <thead>
                <tr>
                  <th>
                    As of
                  </th>
                  <th>
                    Facility
                  </th>
                  <th>
                    Current
                  </th>
                  <th>
                    Adjustment
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.classifications.map(
                  row => (
                    <tr
                      key={
                        String(
                          row.id,
                        )
                      }
                    >
                      <td>
                        {String(
                          row.as_of_date,
                        )}
                      </td>
                      <td>
                        {String(
                          row.facility_number,
                        )}
                      </td>
                      <td>
                        {baseMoney(
                          row.target_current_principal,
                        )}
                      </td>
                      <td>
                        {baseMoney(
                          row.adjustment_amount,
                        )}
                      </td>
                    </tr>
                  ),
                )}

                {!data.classifications
                  .length ? (
                  <tr>
                    <td
                      colSpan={4}
                    >
                      No current-principal classification run yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Company policy
            </div>
            <h3>
              Financing defaults
            </h3>
          </div>
          <Save
            size={20}
          />
        </div>

        <form
          className={
            styles.formGrid
          }
          onSubmit={
            saveSettings
          }
        >
          {[
            ['defaultBorrowingPrincipalAccountId','Borrowing principal',liabilityAccounts],
            ['defaultCurrentBorrowingAccountId','Current borrowing',liabilityAccounts],
            ['defaultLendingPrincipalAccountId','Lending principal',assetAccounts],
            ['defaultCurrentLendingAccountId','Current lending',assetAccounts],
            ['defaultInterestExpenseAccountId','Interest expense',expenseAccounts],
            ['defaultInterestIncomeAccountId','Interest income',incomeAccounts],
            ['defaultAccruedInterestLiabilityAccountId','Accrued interest liability',liabilityAccounts],
            ['defaultAccruedInterestAssetAccountId','Accrued interest asset',assetAccounts],
            ['defaultFinancingFeeExpenseAccountId','Financing fee expense',expenseAccounts],
            ['defaultFinancingFeeIncomeAccountId','Financing fee income',incomeAccounts],
          ].map(
            entry => {
              const [
                key,
                label,
                accounts,
              ] =
                entry as [
                  keyof typeof settings,
                  string,
                  Array<Row>,
                ];

              return (
                <label
                  key={
                    key
                  }
                >
                  {label}
                  <select
                    value={
                      String(
                        settings[
                          key
                        ] ||
                        '',
                      )
                    }
                    onChange={
                      event =>
                        setSettings(
                          current => ({
                            ...current,
                            [key]:
                              event.target
                                .value,
                          }),
                        )
                    }
                  >
                    <option value="">
                      None
                    </option>
                    {accounts.map(
                      account => (
                        <option
                          key={
                            String(
                              account.id,
                            )
                          }
                          value={
                            String(
                              account.id,
                            )
                          }
                        >
                          {String(
                            account.code,
                          )} · {String(
                            account.name,
                          )}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              );
            },
          )}

          <label>
            Default day count
            <select
              value={
                settings.defaultDayCount
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultDayCount:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="actual_365">
                Actual / 365
              </option>
              <option value="actual_360">
                Actual / 360
              </option>
              <option value="thirty_360">
                30 / 360
              </option>
            </select>
          </label>

          <label>
            Default repayment
            <select
              value={
                settings.defaultRepaymentStructure
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultRepaymentStructure:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="annuity">
                Annuity
              </option>
              <option value="equal_principal">
                Equal principal
              </option>
              <option value="interest_only">
                Interest only
              </option>
              <option value="bullet">
                Bullet
              </option>
              <option value="custom">
                Custom
              </option>
            </select>
          </label>

          <label>
            Current classification days
            <input
              type="number"
              min="1"
              max="730"
              value={
                settings.currentClassificationDays
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      currentClassificationDays:
                        event.target
                          .value,
                    }),
                  )
              }
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={
                settings.enabled
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      enabled:
                        event.target
                          .checked,
                    }),
                  )
              }
            />
            Enable loans and financing processing
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              !canEdit ||
              busy ===
                'settings'
            }
          >
            <Save
              size={15}
            />
            Save financing defaults
          </button>
        </form>
      </section>

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <div
              className={
                styles.eyebrow
              }
            >
              Close runs
            </div>
            <h3>
              Interest accrual batches
            </h3>
          </div>
          <RefreshCcw
            size={20}
          />
        </div>

        <div
          className={
            styles.tableWrap
          }
        >
          <table>
            <thead>
              <tr>
                <th>
                  As of
                </th>
                <th>
                  Status
                </th>
                <th>
                  Facilities
                </th>
                <th>
                  Accrued
                </th>
                <th>
                  Skipped
                </th>
                <th>
                  Failed
                </th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map(
                row => (
                  <tr
                    key={
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      {String(
                        row.as_of_date,
                      )}
                    </td>
                    <td>
                      {String(
                        row.status,
                      )}
                    </td>
                    <td>
                      {String(
                        row.facility_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.accrued_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.skipped_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.failed_count ||
                        0,
                      )}
                    </td>
                  </tr>
                ),
              )}

              {!data.runs
                .length ? (
                <tr>
                  <td
                    colSpan={6}
                  >
                    No financing close runs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className={
          styles.notice
        }
      >
        <Landmark
          size={16}
        />
        Financing journals use Accounting’s authoritative double-entry engine. Drawdowns and repayments synchronize the mapped bank/cash/mobile-money account, foreign-currency facilities use Accounting exchange rates, and reversals preserve linked evidence instead of deleting posted history.
      </div>

      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />
    </div>
  );
}
