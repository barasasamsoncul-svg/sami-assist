'use client';

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileClock,
  Play,
  RefreshCcw,
  Link2,
  RotateCcw,
  Save,
  Scale,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
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
import type {
  AccountingAccrualsWorkspace,
} from '@/lib/apps/accounting/accruals';
import {
  formatAccountingAmount,
} from '@/lib/apps/accounting/validation';

import styles from './AccountingFoundation.module.css';

type ScheduleType =
  | 'prepaid_expense'
  | 'deferred_revenue'
  | 'accrued_expense'
  | 'accrued_revenue';

function title(
  value:
    string,
) {
  return value
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

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function plusMonths(
  value:
    string,
  months:
    number,
) {
  const date =
    new Date(
      value +
      'T00:00:00.000Z',
    );

  date.setUTCMonth(
    date.getUTCMonth() +
      months,
  );

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

export default function AccountingAccruals({
  data,
  canCreate,
  canEdit,
}: {
  data:
    AccountingAccrualsWorkspace;
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

  const [
    runAsOf,
    setRunAsOf,
  ] =
    useState(
      data.today ||
      today(),
    );

  const settingsRow =
    data.settings as
      Record<
        string,
        unknown
      >;

  const [
    settings,
    setSettings,
  ] =
    useState({
      enabled:
        settingsRow.enabled !==
        false,
      defaultPrepaidAssetAccountId:
        String(
          settingsRow
            .default_prepaid_asset_account_id ||
          '',
        ),
      defaultDeferredRevenueAccountId:
        String(
          settingsRow
            .default_deferred_revenue_account_id ||
          '',
        ),
      defaultAccruedExpenseAccountId:
        String(
          settingsRow
            .default_accrued_expense_account_id ||
          '',
        ),
      defaultAccruedRevenueAccountId:
        String(
          settingsRow
            .default_accrued_revenue_account_id ||
          '',
        ),
      defaultAllocationMethod:
        String(
          settingsRow
            .default_allocation_method ||
          'equal_periods',
        ),
      defaultFrequency:
        String(
          settingsRow
            .default_frequency ||
          'monthly',
        ),
      defaultAutoReverseAccruals:
        settingsRow
          .default_auto_reverse_accruals !==
        false,
    });

  const [
    schedule,
    setSchedule,
  ] =
    useState({
      scheduleType:
        'prepaid_expense' as
          ScheduleType,
      name:
        '',
      totalAmount:
        '',
      startDate:
        data.today ||
        today(),
      endDate:
        plusMonths(
          data.today ||
          today(),
          11,
        ),
      frequency:
        String(
          settingsRow
            .default_frequency ||
          'monthly',
        ),
      allocationMethod:
        String(
          settingsRow
            .default_allocation_method ||
          'equal_periods',
        ),
      balanceAccountId:
        String(
          settingsRow
            .default_prepaid_asset_account_id ||
          '',
        ),
      recognitionAccountId:
        '',
      initialReclassification:
        true,
      autoReverseAccrual:
        false,
      sourceJournalId:
        '',
      sourceModule:
        '',
      sourceType:
        '',
      sourceId:
        '',
      sourceReference:
        '',
      notes:
        '',
    });

  const metrics =
    data.metrics as
      Record<
        string,
        unknown
      >;

  const reporting =
    data.reporting;

  const money = (
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

  const assetAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account => {
            const type =
              String(
                account.account_type,
              );

            return (
              type ===
                'asset' ||
              type.startsWith(
                'asset_',
              )
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

            return (
              type ===
                'liability' ||
              type.startsWith(
                'liability_',
              )
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

            return (
              type ===
                'expense' ||
              type.startsWith(
                'expense_',
              )
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

            return (
              type ===
                'income' ||
              type.startsWith(
                'income_',
              )
            );
          },
        ),
      [
        data.accounts,
      ],
    );

  const scheduleBalanceAccounts =
    schedule.scheduleType ===
        'prepaid_expense' ||
      schedule.scheduleType ===
        'accrued_revenue'
      ? assetAccounts
      : liabilityAccounts;

  const scheduleRecognitionAccounts =
    schedule.scheduleType ===
        'prepaid_expense' ||
      schedule.scheduleType ===
        'accrued_expense'
      ? expenseAccounts
      : incomeAccounts;

  function setScheduleType(
    type:
      ScheduleType,
  ) {
    const defaultBalance =
      type ===
        'prepaid_expense'
        ? settings
            .defaultPrepaidAssetAccountId
        : type ===
            'deferred_revenue'
          ? settings
              .defaultDeferredRevenueAccountId
          : type ===
              'accrued_expense'
            ? settings
                .defaultAccruedExpenseAccountId
            : settings
                .defaultAccruedRevenueAccountId;

    setSchedule(
      current => ({
        ...current,
        scheduleType:
          type,
        balanceAccountId:
          defaultBalance,
        recognitionAccountId:
          '',
        initialReclassification:
          type ===
            'prepaid_expense' ||
          type ===
            'deferred_revenue',
        autoReverseAccrual:
          (
            type ===
              'accrued_expense' ||
            type ===
              'accrued_revenue'
          ) &&
          settings
            .defaultAutoReverseAccruals,
      }),
    );
  }

  async function request(
    body:
      Record<
        string,
        unknown
      >,
  ) {
    const response =
      await fetch(
        '/api/apps/accounting/accruals',
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
        'Accrual or deferral action failed.',
      );
    }

    return payload.result as
      Record<
        string,
        unknown
      >;
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
          Record<
            string,
            unknown
          >,
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
      'Accrual settings saved',
      () =>
        'Company defaults for prepaid, deferred and accrued balances were updated.',
    );
  }

  async function createSchedule(
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
        'create',
        {
          action:
            'create-schedule',
          requestKey:
            crypto.randomUUID(),
          ...schedule,
        },
        'Schedule created',
        created =>
          String(
            created.scheduleNumber ||
            'The schedule',
          ) +
          ' was created with ' +
          String(
            created.periods ||
            0,
          ) +
          ' recognition period(s).',
      );

    if (
      result
    ) {
      setSchedule(
        current => ({
          ...current,
          name:
            '',
          totalAmount:
            '',
          sourceJournalId:
            '',
          sourceModule:
            '',
          sourceType:
            '',
          sourceId:
            '',
          sourceReference:
            '',
          notes:
            '',
        }),
      );
    }
  }

  function activate(
    row:
      Record<
        string,
        unknown
      >,
  ) {
    confirmAction({
      title:
        'Activate recognition schedule?',
      message:
        String(
          row.schedule_number,
        ) +
        ' will become active. If initial reclassification is enabled, SaMi will post the opening deferral journal through the authoritative ledger.',
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
              'activate-schedule',
            scheduleId:
              row.id,
            activationDate:
              data.today,
          },
          'Schedule activated',
          result =>
            result.journalId
              ? 'The schedule is active and its opening reclassification journal was posted.'
              : 'The schedule is active and ready for recognition.',
        );
      },
    });
  }

  function cancel(
    row:
      Record<
        string,
        unknown
      >,
  ) {
    confirmAction({
      title:
        'Cancel this schedule?',
      message:
        'Cancellation is allowed only when no recognition line remains posted. Any opening reclassification will be reversed automatically.',
      confirmLabel:
        'Cancel schedule',
      onConfirm: () => {
        void run(
          'cancel-' +
          String(
            row.id,
          ),
          {
            action:
              'cancel-schedule',
            scheduleId:
              row.id,
            cancellationDate:
              data.today,
          },
          'Schedule cancelled',
          () =>
            'Future recognition was stopped and the opening reclassification was reversed when applicable.',
        );
      },
    });
  }

  function reverseLine(
    row:
      Record<
        string,
        unknown
      >,
  ) {
    confirmAction({
      title:
        'Reverse recognition?',
      message:
        'SaMi will post a linked compensating journal. Later posted periods in the same schedule must be reversed first.',
      confirmLabel:
        'Post reversal',
      onConfirm: () => {
        void run(
          'reverse-' +
          String(
            row.id,
          ),
          {
            action:
              'reverse-recognition',
            lineId:
              row.id,
            reversalDate:
              data.today,
          },
          'Recognition reversed',
          () =>
            'A linked compensating journal was posted and the recognition line is now reversed.',
        );
      },
    });
  }

  async function runDue() {
    await run(
      'run-due',
      {
        action:
          'run-due',
        asOf:
          runAsOf,
      },
      'Recognition run completed',
      result =>
        String(
          result.posted ||
          0,
        ) +
        ' recognition journal(s) posted, ' +
        String(
          result.reversed ||
          0,
        ) +
        ' automatic reversal(s) posted, and ' +
        String(
          result.failed ||
          0,
        ) +
        ' item(s) need review.',
    );
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
            Accounting · Accruals & Deferrals
          </div>
          <h2>
            Recognition schedules and period-end accrual control
          </h2>
          <p>
            Spread prepaid expenses and deferred revenue across service periods, accrue expenses or revenue before billing, and keep every recognition or reversal tied to an immutable posted journal.
          </p>
        </div>

      </div>

      <section
        className={
          styles.panel
        }
      >
        <form
          className={
            styles.inlineForm
          }
          onSubmit={
            event => {
              event.preventDefault();
              void runDue();
            }
          }
        >
          <label>
            Recognition through
            <input
              type="date"
              value={
                runAsOf
              }
              onChange={
                event =>
                  setRunAsOf(
                    event.target
                      .value,
                  )
              }
              required
            />
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              busy ===
                'run-due' ||
              !canEdit
            }
          >
            <Play
              size={15}
            />
            {busy ===
              'run-due'
              ? 'Running…'
              : 'Run due recognition'}
          </button>
        </form>
      </section>

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
            Active schedules
          </span>
          <strong>
            {String(
              metrics.active_schedules ||
              0,
            )}
          </strong>
          <small>
            Drafts {String(
              metrics.draft_schedules ||
              0,
            )}
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Due recognition
          </span>
          <strong>
            {String(
              metrics.due_count ||
              0,
            )}
          </strong>
          <small>
            Through {data.today}
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Deferred / prepaid balance
          </span>
          <strong>
            {money(
              metrics.deferred_balance,
            )}
          </strong>
          <small>
            Unrecognized balance on active and completed schedules
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Active accrued balance
          </span>
          <strong>
            {money(
              metrics.accrued_balance,
            )}
          </strong>
          <small>
            Posted accruals not yet reversed
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
              New schedule
            </div>
            <h3>
              Build recognition periods
            </h3>
            <p>
              Equal-period allocation spreads exact cents evenly. Actual-days allocation weights each period by calendar days while preserving the exact schedule total.
            </p>
          </div>
          <CalendarClock
            size={20}
          />
        </div>

        <form
          className={
            styles.inlineForm
          }
          onSubmit={
            createSchedule
          }
        >
          <label>
            Type
            <select
              value={
                schedule.scheduleType
              }
              onChange={
                event =>
                  setScheduleType(
                    event.target
                      .value as
                      ScheduleType,
                  )
              }
            >
              <option value="prepaid_expense">
                Prepaid expense
              </option>
              <option value="deferred_revenue">
                Deferred revenue
              </option>
              <option value="accrued_expense">
                Accrued expense
              </option>
              <option value="accrued_revenue">
                Accrued revenue
              </option>
            </select>
          </label>

          <label>
            Schedule name
            <input
              value={
                schedule.name
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      name:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="Annual insurance"
              required
            />
          </label>

          <label>
            Total amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={
                schedule.totalAmount
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      totalAmount:
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
                schedule.startDate
              }
              onChange={
                event =>
                  setSchedule(
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
            End date
            <input
              type="date"
              value={
                schedule.endDate
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      endDate:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            />
          </label>

          <label>
            Frequency
            <select
              value={
                schedule.frequency
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      frequency:
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
              <option value="annual">
                Annual
              </option>
            </select>
          </label>

          <label>
            Allocation
            <select
              value={
                schedule.allocationMethod
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      allocationMethod:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="equal_periods">
                Equal periods
              </option>
              <option value="actual_days">
                Actual days
              </option>
            </select>
          </label>

          <label>
            Balance-sheet account
            <select
              value={
                schedule.balanceAccountId
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      balanceAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            >
              <option value="">
                Choose account
              </option>
              {scheduleBalanceAccounts.map(
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
            Recognition account
            <select
              value={
                schedule.recognitionAccountId
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      recognitionAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
              required
            >
              <option value="">
                Choose account
              </option>
              {scheduleRecognitionAccounts.map(
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
            Source reference
            <input
              value={
                schedule.sourceReference
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      sourceReference:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="Bill, invoice or contract reference"
            />
          </label>

          <label>
            Posted source journal ID
            <input
              value={
                schedule.sourceJournalId
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      sourceJournalId:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="Optional UUID"
            />
          </label>

          <label>
            Source module
            <input
              value={
                schedule.sourceModule
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      sourceModule:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="accounting / invoicing / expenses"
            />
          </label>

          <label>
            Source type
            <input
              value={
                schedule.sourceType
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      sourceType:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="vendor_bill / invoice / contract"
            />
          </label>

          <label>
            Source ID
            <input
              value={
                schedule.sourceId
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      sourceId:
                        event.target
                          .value,
                    }),
                  )
              }
              placeholder="Optional source record identifier"
            />
          </label>

          <label>
            Notes
            <textarea
              value={
                schedule.notes
              }
              onChange={
                event =>
                  setSchedule(
                    current => ({
                      ...current,
                      notes:
                        event.target
                          .value,
                    }),
                  )
              }
              rows={3}
            />
          </label>

          {schedule.scheduleType ===
              'prepaid_expense' ||
          schedule.scheduleType ===
              'deferred_revenue' ? (
            <label>
              <input
                type="checkbox"
                checked={
                  schedule.initialReclassification
                }
                onChange={
                  event =>
                    setSchedule(
                      current => ({
                        ...current,
                        initialReclassification:
                          event.target
                            .checked,
                      }),
                    )
                }
              />
              Reclassify the full source amount to the balance sheet when this schedule is activated
            </label>
          ) : (
            <label>
              <input
                type="checkbox"
                checked={
                  schedule.autoReverseAccrual
                }
                onChange={
                  event =>
                    setSchedule(
                      current => ({
                        ...current,
                        autoReverseAccrual:
                          event.target
                            .checked,
                      }),
                    )
                }
              />
              Automatically reverse each accrual on the day after its recognition period
            </label>
          )}

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              busy ===
                'create' ||
              !canCreate
            }
          >
            <FileClock
              size={15}
            />
            {busy ===
              'create'
              ? 'Creating…'
              : 'Create schedule'}
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
              Recognition schedules
            </div>
            <h3>
              Lifecycle and balances
            </h3>
          </div>
          <Clock3
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
                  Schedule
                </th>
                <th>
                  Type
                </th>
                <th>
                  Period
                </th>
                <th>
                  Total
                </th>
                <th>
                  Active posted
                </th>
                <th>
                  Next
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
                          row.schedule_number,
                        )}
                      </strong>
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {String(
                          row.name,
                        )}
                      </span>
                    </td>
                    <td>
                      {title(
                        String(
                          row.schedule_type,
                        ),
                      )}
                    </td>
                    <td>
                      {String(
                        row.start_date,
                      )} → {String(
                        row.end_date,
                      )}
                    </td>
                    <td>
                      {money(
                        row.total_amount,
                      )}
                    </td>
                    <td>
                      {money(
                        row.active_posted_amount,
                      )}
                    </td>
                    <td>
                      {String(
                        row.next_posting_date ||
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
                      {Number(
                        row.failed_count ||
                        0,
                      ) >
                      0 ? (
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {String(
                            row.failed_count,
                          )} failed
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div
                        className={
                          styles.actions
                        }
                      >
                        {row.status ===
                          'draft' ? (
                          <button
                            type="button"
                            className={
                              styles.primary
                            }
                            disabled={
                              !canEdit ||
                              busy ===
                                'activate-' +
                                  String(
                                    row.id,
                                  )
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
                        ) : null}

                        {row.status ===
                            'draft' ||
                        row.status ===
                            'active' ? (
                          <button
                            type="button"
                            className={
                              styles.button
                            }
                            disabled={
                              !canEdit ||
                              busy ===
                                'cancel-' +
                                  String(
                                    row.id,
                                  )
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
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ),
              )}

              {!data.schedules
                .length ? (
                <tr>
                  <td
                    colSpan={8}
                  >
                    No accrual or deferral schedules yet.
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
              Recognition history
            </div>
            <h3>
              Schedule lines and journals
            </h3>
          </div>
          <ShieldCheck
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
                  Schedule
                </th>
                <th>
                  Period
                </th>
                <th>
                  Posting date
                </th>
                <th>
                  Amount
                </th>
                <th>
                  Status
                </th>
                <th>
                  Auto reversal
                </th>
                <th>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map(
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
                          row.schedule_number,
                        )}
                      </strong>
                      <span
                        className={
                          styles.meta
                        }
                      >
                        {String(
                          row.schedule_name,
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.period_start,
                      )} → {String(
                        row.period_end,
                      )}
                    </td>
                    <td>
                      {String(
                        row.posting_date,
                      )}
                    </td>
                    <td>
                      {money(
                        row.amount,
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
                      {row.failure_message ? (
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {String(
                            row.failure_message,
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {String(
                        row.auto_reversal_date ||
                        '—',
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
                            !canEdit ||
                            busy ===
                              'reverse-' +
                                String(
                                  row.id,
                                )
                          }
                          onClick={
                            () =>
                              reverseLine(
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

              {!data.lines
                .length ? (
                <tr>
                  <td
                    colSpan={7}
                  >
                    No recognition periods generated yet.
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
              Schedule-to-ledger
            </div>
            <h3>
              Accrual & deferral reconciliation
            </h3>
            <p>
              Compares each controlled balance-sheet account with the journals managed by these schedules and linked source journals through {reporting.asOf}.
            </p>
          </div>

          {Number(
            reporting
              .reconciliation
              .difference ||
            0,
          ) ===
          0 ? (
            <Scale
              size={20}
            />
          ) : (
            <TriangleAlert
              size={20}
            />
          )}
        </div>

        <div
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
              Schedule balance
            </span>
            <strong>
              {money(
                reporting
                  .reconciliation
                  .expectedBalance,
              )}
            </strong>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Managed GL balance
            </span>
            <strong>
              {money(
                reporting
                  .reconciliation
                  .managedGlBalance,
              )}
            </strong>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Difference
            </span>
            <strong>
              {money(
                reporting
                  .reconciliation
                  .difference,
              )}
            </strong>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Unlinked schedules
            </span>
            <strong>
              {String(
                reporting
                  .sourceCoverage
                  .unlinked_count ||
                0,
              )}
            </strong>
            <small>
              No source journal or reference
            </small>
          </div>
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
                  Balance account
                </th>
                <th>
                  Schedules
                </th>
                <th>
                  Schedule balance
                </th>
                <th>
                  Managed GL
                </th>
                <th>
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {reporting
                .reconciliation
                .lines.map(
                  row => (
                    <tr
                      key={
                        String(
                          row.account_id,
                        )
                      }
                    >
                      <td>
                        <strong>
                          {String(
                            row.account_code ||
                            '',
                          )}
                        </strong>
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {String(
                            row.account_name ||
                            '',
                          )}
                        </span>
                      </td>
                      <td>
                        {String(
                          row.schedule_count ||
                          0,
                        )}
                      </td>
                      <td>
                        {money(
                          row.expected_balance,
                        )}
                      </td>
                      <td>
                        {money(
                          row.managed_gl_balance,
                        )}
                      </td>
                      <td>
                        {money(
                          row.difference,
                        )}
                      </td>
                    </tr>
                  ),
                )}

              {!reporting
                .reconciliation
                .lines.length ? (
                <tr>
                  <td
                    colSpan={5}
                  >
                    No active schedule balances need reconciliation yet.
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
              Recognition forecast
            </div>
            <h3>
              Upcoming P&L timing
            </h3>
            <p>
              Future pending and retryable recognition lines are projected without creating journals.
            </p>
          </div>
          <TrendingUp
            size={20}
          />
        </div>

        <div
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
              Next 90 days
            </span>
            <strong>
              {money(
                reporting
                  .forecast
                  .next90Days,
              )}
            </strong>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Next 365 days
            </span>
            <strong>
              {money(
                reporting
                  .forecast
                  .next365Days,
              )}
            </strong>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Source-journal coverage
            </span>
            <strong>
              {String(
                reporting
                  .sourceCoverage
                  .journal_linked_count ||
                0,
              )} / {String(
                reporting
                  .sourceCoverage
                  .schedule_count ||
                0,
              )}
            </strong>
            <small>
              Schedules linked to posted source journals
            </small>
          </div>

          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Reference coverage
            </span>
            <strong>
              {String(
                reporting
                  .sourceCoverage
                  .reference_linked_count ||
                0,
              )}
            </strong>
            <small>
              Schedules carrying an external/source reference
            </small>
          </div>
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
                  Posting date
                </th>
                <th>
                  Schedule
                </th>
                <th>
                  Type
                </th>
                <th>
                  Amount
                </th>
                <th>
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {reporting
                .forecast
                .lines
                .slice(
                  0,
                  50,
                )
                .map(
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
                          row.posting_date,
                        )}
                      </td>
                      <td>
                        <strong>
                          {String(
                            row.schedule_number,
                          )}
                        </strong>
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {String(
                            row.schedule_name,
                          )}
                        </span>
                      </td>
                      <td>
                        {title(
                          String(
                            row.schedule_type,
                          ),
                        )}
                      </td>
                      <td>
                        {money(
                          row.amount,
                        )}
                      </td>
                      <td>
                        {String(
                          row.status,
                        )}
                      </td>
                    </tr>
                  ),
                )}

              {!reporting
                .forecast
                .lines.length ? (
                <tr>
                  <td
                    colSpan={5}
                  >
                    No future recognition falls within the next 365 days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div
          className={
            styles.notice
          }
        >
          <Link2
            size={16}
          />
          Source coverage is diagnostic: a schedule may use a text reference without a source journal, but opening reclassifications linked to a journal are validated against the selected recognition account.
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
              Accrual and deferral defaults
            </h3>
          </div>
          <Save
            size={20}
          />
        </div>

        <form
          className={
            styles.inlineForm
          }
          onSubmit={
            saveSettings
          }
        >
          <label>
            Default prepaid asset
            <select
              value={
                settings.defaultPrepaidAssetAccountId
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultPrepaidAssetAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                None
              </option>
              {assetAccounts.map(
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
            Default deferred revenue
            <select
              value={
                settings.defaultDeferredRevenueAccountId
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultDeferredRevenueAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                None
              </option>
              {liabilityAccounts.map(
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
            Default accrued expense liability
            <select
              value={
                settings.defaultAccruedExpenseAccountId
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultAccruedExpenseAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                None
              </option>
              {liabilityAccounts.map(
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
            Default accrued revenue asset
            <select
              value={
                settings.defaultAccruedRevenueAccountId
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultAccruedRevenueAccountId:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="">
                None
              </option>
              {assetAccounts.map(
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
            Default allocation
            <select
              value={
                settings.defaultAllocationMethod
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultAllocationMethod:
                        event.target
                          .value,
                    }),
                  )
              }
            >
              <option value="equal_periods">
                Equal periods
              </option>
              <option value="actual_days">
                Actual days
              </option>
            </select>
          </label>

          <label>
            Default frequency
            <select
              value={
                settings.defaultFrequency
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultFrequency:
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
              <option value="annual">
                Annual
              </option>
            </select>
          </label>

          <label>
            <input
              type="checkbox"
              checked={
                settings.defaultAutoReverseAccruals
              }
              onChange={
                event =>
                  setSettings(
                    current => ({
                      ...current,
                      defaultAutoReverseAccruals:
                        event.target
                          .checked,
                    }),
                  )
              }
            />
            Auto-reverse new accrual schedules by default
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
            Enable accrual and deferral processing
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              busy ===
                'settings' ||
              !canEdit
            }
          >
            <Save
              size={15}
            />
            Save defaults
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
              Run history
            </div>
            <h3>
              Recognition batches
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
                  Due
                </th>
                <th>
                  Posted
                </th>
                <th>
                  Reversed
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
                      {String(
                        row.due_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.posted_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.reversed_count ||
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
                    No recognition runs yet.
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
        <ShieldCheck
          size={16}
        />
        Recognition and reversal always post through Accounting’s authoritative double-entry engine. Period locks, company scope, active accounts, idempotency and immutable compensating reversals remain enforced.
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
