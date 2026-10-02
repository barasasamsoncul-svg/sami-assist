'use client';

import {
  Calculator,
  CheckCircle2,
  Landmark,
  PlayCircle,
  Save,
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
  FixedAssetsAccountingWorkspace,
} from '@/lib/apps/fixed_assets/accounting-control';
import FixedAssetsLifecycleControl from './FixedAssetsLifecycleControl';

import styles from './FixedAssetsControl.module.css';

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function monthStart() {
  const value =
    today();

  return (
    value.slice(
      0,
      8,
    ) +
    '01'
  );
}

function amount(
  value:
    unknown,
) {
  const number =
    Number(
      value ||
      0,
    );

  return Number.isFinite(
    number,
  )
    ? number.toLocaleString(
        undefined,
        {
          minimumFractionDigits:
            2,
          maximumFractionDigits:
            2,
        },
      )
    : '0.00';
}

function idValue(
  value:
    unknown,
) {
  return value
    ? String(
        value,
      )
    : '';
}

export default function FixedAssetsAccountingControl({
  data,
  canEdit,
  canExecute,
}: {
  data:
    FixedAssetsAccountingWorkspace;
  canEdit:
    boolean;
  canExecute:
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
    overrideThreshold,
    setOverrideThreshold,
  ] =
    useState(
      false,
    );

  const [
    settings,
    setSettings,
  ] =
    useState({
      capitalizationThreshold:
        String(
          data.settings
            .capitalization_threshold ||
          '0',
        ),
      defaultProrataConvention:
        String(
          data.settings
            .default_prorata_convention ||
          'daily',
        ),
      defaultAssetAccountId:
        idValue(
          data.settings
            .default_asset_account_id,
        ),
      defaultAccumulatedDepreciationAccountId:
        idValue(
          data.settings
            .default_accumulated_depreciation_account_id,
        ),
      defaultDepreciationExpenseAccountId:
        idValue(
          data.settings
            .default_depreciation_expense_account_id,
        ),
      defaultCapitalizationOffsetAccountId:
        idValue(
          data.settings
            .default_capitalization_offset_account_id,
        ),
      defaultDisposalGainAccountId:
        idValue(
          data.settings
            .default_disposal_gain_account_id,
        ),
      defaultDisposalLossAccountId:
        idValue(
          data.settings
            .default_disposal_loss_account_id,
        ),
      defaultImpairmentLossAccountId:
        idValue(
          data.settings
            .default_impairment_loss_account_id,
        ),
      defaultAccumulatedImpairmentAccountId:
        idValue(
          data.settings
            .default_accumulated_impairment_account_id,
        ),
      defaultRevaluationReserveAccountId:
        idValue(
          data.settings
            .default_revaluation_reserve_account_id,
        ),
      defaultRevaluationLossAccountId:
        idValue(
          data.settings
            .default_revaluation_loss_account_id,
        ),
    });

  const [
    category,
    setCategory,
  ] =
    useState({
      categoryId:
        '',
      defaultUsefulLifeMonths:
        '60',
      defaultDepreciationMethod:
        'straight_line',
      prorataConvention:
        'daily',
      decliningBalanceRate:
        '',
      assetAccountId:
        '',
      accumulatedDepreciationAccountId:
        '',
      depreciationExpenseAccountId:
        '',
      capitalizationOffsetAccountId:
        '',
      disposalGainAccountId:
        '',
      disposalLossAccountId:
        '',
      impairmentLossAccountId:
        '',
      accumulatedImpairmentAccountId:
        '',
      revaluationReserveAccountId:
        '',
      revaluationLossAccountId:
        '',
    });

  const [
    depreciation,
    setDepreciation,
  ] =
    useState({
      periodStart:
        monthStart(),
      periodEnd:
        today(),
      runDate:
        today(),
    });

  const assetAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            String(
              account.account_type ||
              '',
            ) ===
              'asset' ||
            String(
              account.account_type ||
              '',
            ).startsWith(
              'asset_',
            ),
        ),
      [
        data.accounts,
      ],
    );

  const expenseAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            String(
              account.account_type ||
              '',
            ) ===
              'expense' ||
            String(
              account.account_type ||
              '',
            ).startsWith(
              'expense_',
            ),
        ),
      [
        data.accounts,
      ],
    );

  const incomeAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            String(
              account.account_type ||
              '',
            ) ===
              'income' ||
            String(
              account.account_type ||
              '',
            ).startsWith(
              'income_',
            ),
        ),
      [
        data.accounts,
      ],
    );

  const equityAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            String(
              account.account_type ||
              '',
            ) ===
              'equity' ||
            String(
              account.account_type ||
              '',
            ).startsWith(
              'equity_',
            ),
        ),
      [
        data.accounts,
      ],
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
        '/api/apps/fixed_assets/accounting-control',
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
        'Fixed Asset action failed.',
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
    title:
      string,
    message:
      string,
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
        title,
        message,
      );

      router.refresh();

      return result;
    } catch (
      error
    ) {
      showError(
        title +
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
        ...settings,
      },
      'Fixed Asset settings saved',
      'Capitalization, depreciation and lifecycle account defaults were updated.',
    );
  }

  function loadCategory(
    categoryId:
      string,
  ) {
    const row =
      data.categories.find(
        item =>
          String(
            item.id,
          ) ===
          categoryId,
      );

    if (
      !row
    ) {
      setCategory({
        ...category,
        categoryId,
      });
      return;
    }

    setCategory({
      categoryId,
      defaultUsefulLifeMonths:
        String(
          row.default_useful_life_months ||
          60,
        ),
      defaultDepreciationMethod:
        String(
          row.default_depreciation_method ||
          'straight_line',
        ),
      prorataConvention:
        String(
          row.prorata_convention ||
          'daily',
        ),
      decliningBalanceRate:
        row.declining_balance_rate
          ? String(
              row.declining_balance_rate,
            )
          : '',
      assetAccountId:
        idValue(
          row.asset_account_reference,
        ),
      accumulatedDepreciationAccountId:
        idValue(
          row.depreciation_account_reference,
        ),
      depreciationExpenseAccountId:
        idValue(
          row.expense_account_reference,
        ),
      capitalizationOffsetAccountId:
        idValue(
          row.capitalization_offset_account_id,
        ),
      disposalGainAccountId:
        idValue(
          row.disposal_gain_account_id,
        ),
      disposalLossAccountId:
        idValue(
          row.disposal_loss_account_id,
        ),
      impairmentLossAccountId:
        idValue(
          row.impairment_loss_account_id,
        ),
      accumulatedImpairmentAccountId:
        idValue(
          row.accumulated_impairment_account_id,
        ),
      revaluationReserveAccountId:
        idValue(
          row.revaluation_reserve_account_id,
        ),
      revaluationLossAccountId:
        idValue(
          row.revaluation_loss_account_id,
        ),
    });
  }

  async function saveCategory(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canEdit ||
      !category.categoryId
    ) {
      return;
    }

    await run(
      'category',
      {
        action:
          'save-category',
        ...category,
      },
      'Asset category policy saved',
      'Useful life, depreciation method and ledger mappings were updated.',
    );
  }

  function capitalize(
    assetId:
      string,
    label:
      string,
  ) {
    confirmAction({
      title:
        'Capitalize ' +
        label +
        '?',
      message:
        'SaMi will post a balanced Accounting journal using the mapped Asset and Capitalization Offset accounts. This does not create a second purchase document.',
      confirmLabel:
        'Capitalize asset',
      onConfirm:
        () =>
          void run(
            'capitalize:' +
              assetId,
            {
              action:
                'capitalize',
              assetId,
              capitalizationDate:
                today(),
              overrideThreshold,
            },
            'Asset capitalized',
            'The asset was placed in service and its capitalization journal was posted.',
          ),
    });
  }

  async function runDepreciation(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute
    ) {
      return;
    }

    await run(
      'depreciation',
      {
        action:
          'run-depreciation',
        requestKey:
          crypto.randomUUID(),
        ...depreciation,
      },
      'Depreciation run completed',
      'Eligible assets were processed with isolated journal posting and retry-safe period controls.',
    );
  }

  function accountOptions(
    rows:
      Array<
        Record<
          string,
          unknown
        >
      >,
  ) {
    return rows.map(
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
            row.code ||
            '',
          )} · {String(
            row.name ||
            '',
          )}
        </option>
      ),
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
            Fixed Assets · Accounting control
          </div>
          <h2>
            Asset capitalization, depreciation & carrying value
          </h2>
          <p>
            Fixed Assets owns the asset register and lifecycle. Accounting remains the authoritative journal and period-control layer.
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          <span
            className={
              styles.status
            }
          >
            2.4 control
          </span>
        </div>
      </div>

      <section
        className={
          styles.cards
        }
      >
        <div
          className={
            styles.card
          }
        >
          <span>
            Asset register
          </span>
          <strong>
            {data.summary
              .assetCount}
          </strong>
          <small>
            {data.summary
              .capitalizedCount} capitalized
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Gross cost
          </span>
          <strong>
            {amount(
              data.summary
                .grossCost,
            )}
          </strong>
          <small>
            Recorded acquisition cost
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Accumulated depreciation
          </span>
          <strong>
            {amount(
              data.summary
                .accumulatedDepreciation,
            )}
          </strong>
          <small>
            Posted depreciation to date
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Carrying value
          </span>
          <strong>
            {amount(
              data.summary
                .carryingValue,
            )}
          </strong>
          <small>
            Cost + revaluation − depreciation − impairment
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
              Period processing
            </div>
            <h3>
              Run depreciation
            </h3>
            <p>
              The run locks eligible assets, skips already-posted periods and isolates individual failures with SQL savepoints.
            </p>
          </div>
          <Calculator
            size={20}
          />
        </div>

        <form
          className={
            styles.inlineForm
          }
          onSubmit={
            runDepreciation
          }
        >
          <label>
            Period start
            <input
              type="date"
              required
              value={
                depreciation
                  .periodStart
              }
              onChange={
                event =>
                  setDepreciation({
                    ...depreciation,
                    periodStart:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Period end
            <input
              type="date"
              required
              value={
                depreciation
                  .periodEnd
              }
              onChange={
                event =>
                  setDepreciation({
                    ...depreciation,
                    periodEnd:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Journal date
            <input
              type="date"
              required
              value={
                depreciation
                  .runDate
              }
              onChange={
                event =>
                  setDepreciation({
                    ...depreciation,
                    runDate:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              !canExecute ||
              busy ===
                'depreciation'
            }
          >
            <PlayCircle
              size={16}
            />
            Run depreciation
          </button>
        </form>

        {data.runs.length ? (
          <div
            className={
              styles.tableWrap
            }
          >
            <table
              className={
                styles.table
              }
            >
              <thead>
                <tr>
                  <th>
                    Period
                  </th>
                  <th>
                    Status
                  </th>
                  <th>
                    Candidates
                  </th>
                  <th>
                    Posted
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
                  run => (
                    <tr
                      key={
                        String(
                          run.id,
                        )
                      }
                    >
                      <td>
                        {String(
                          run.period_start ||
                          '',
                        )} → {String(
                          run.period_end ||
                          '',
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            styles.status
                          }
                        >
                          {String(
                            run.status ||
                            '',
                          )}
                        </span>
                      </td>
                      <td>
                        {String(
                          run.candidate_count ||
                          0,
                        )}
                      </td>
                      <td>
                        {String(
                          run.posted_count ||
                          0,
                        )}
                      </td>
                      <td>
                        {String(
                          run.skipped_count ||
                          0,
                        )}
                      </td>
                      <td>
                        {String(
                          run.failed_count ||
                          0,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className={
              styles.notice
            }
          >
            No depreciation run has been posted yet.
          </div>
        )}
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
              Asset register
            </div>
            <h3>
              Capitalization readiness
            </h3>
          </div>
          <Landmark
            size={20}
          />
        </div>

        <label
          className={
            styles.notice
          }
        >
          <input
            type="checkbox"
            checked={
              overrideThreshold
            }
            onChange={
              event =>
                setOverrideThreshold(
                  event.target
                    .checked,
                )
            }
          />
          Allow authorized capitalization below the configured threshold for this action.
        </label>

        <div
          className={
            styles.tableWrap
          }
        >
          <table
            className={
              styles.table
            }
          >
            <thead>
              <tr>
                <th>
                  Asset
                </th>
                <th>
                  Category
                </th>
                <th>
                  Cost
                </th>
                <th>
                  Depreciation
                </th>
                <th>
                  Carrying value
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
              {data.assets.map(
                asset => {
                  const capitalized =
                    Boolean(
                      asset
                        .capitalization_journal_id,
                    );

                  return (
                    <tr
                      key={
                        String(
                          asset.id,
                        )
                      }
                    >
                      <td>
                        <strong>
                          {String(
                            asset.asset_code ||
                            '',
                          )}
                        </strong>
                        <div
                          className={
                            styles.muted
                          }
                        >
                          {String(
                            asset.name ||
                            '',
                          )}
                        </div>
                      </td>
                      <td>
                        {String(
                          asset.category_name ||
                          'Unmapped',
                        )}
                      </td>
                      <td>
                        {amount(
                          asset.acquisition_cost,
                        )}
                      </td>
                      <td>
                        {amount(
                          asset.accumulated_depreciation,
                        )}
                      </td>
                      <td>
                        {amount(
                          asset.carrying_value,
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            styles.status
                          }
                        >
                          {String(
                            asset.status ||
                            '',
                          )}
                        </span>
                      </td>
                      <td>
                        {capitalized ? (
                          <span
                            className={
                              styles.status
                            }
                          >
                            <CheckCircle2
                              size={13}
                            />
                            Capitalized
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={
                              styles.button
                            }
                            disabled={
                              !canEdit ||
                              busy ===
                                'capitalize:' +
                                String(
                                  asset.id,
                                )
                            }
                            onClick={
                              () =>
                                capitalize(
                                  String(
                                    asset.id,
                                  ),
                                  String(
                                    asset.asset_code ||
                                    asset.name ||
                                    'asset',
                                  ),
                                )
                            }
                          >
                            Capitalize
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                },
              )}
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
              Accounting policy
            </div>
            <h3>
              Defaults and category mappings
            </h3>
          </div>
          <Save
            size={20}
          />
        </div>

        <details
          className={
            styles.details
          }
        >
          <summary>
            Company defaults
          </summary>

          <form
            onSubmit={
              saveSettings
            }
          >
            <div
              className={
                styles.grid
              }
            >
              <label>
                Capitalization threshold
                <input
                  inputMode="decimal"
                  value={
                    settings
                      .capitalizationThreshold
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        capitalizationThreshold:
                          event.target
                            .value,
                      })
                  }
                />
              </label>

              <label>
                Prorata convention
                <select
                  value={
                    settings
                      .defaultProrataConvention
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultProrataConvention:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="daily">
                    Daily
                  </option>
                  <option value="full_month">
                    Full month
                  </option>
                  <option value="none">
                    No proration
                  </option>
                </select>
              </label>
            </div>

            <div
              className={
                styles.accountGrid
              }
            >
              <label>
                Default Asset account
                <select
                  value={
                    settings
                      .defaultAssetAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultAssetAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    assetAccounts,
                  )}
                </select>
              </label>

              <label>
                Accumulated Depreciation
                <select
                  value={
                    settings
                      .defaultAccumulatedDepreciationAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultAccumulatedDepreciationAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    assetAccounts,
                  )}
                </select>
              </label>

              <label>
                Depreciation Expense
                <select
                  value={
                    settings
                      .defaultDepreciationExpenseAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultDepreciationExpenseAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    expenseAccounts,
                  )}
                </select>
              </label>

              <label>
                Capitalization Offset
                <select
                  value={
                    settings
                      .defaultCapitalizationOffsetAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultCapitalizationOffsetAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    data.accounts,
                  )}
                </select>
              </label>

              <label>
                Disposal Gain
                <select
                  value={
                    settings
                      .defaultDisposalGainAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultDisposalGainAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    incomeAccounts,
                  )}
                </select>
              </label>

              <label>
                Disposal Loss
                <select
                  value={
                    settings
                      .defaultDisposalLossAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultDisposalLossAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    expenseAccounts,
                  )}
                </select>
              </label>

              <label>
                Impairment Loss
                <select
                  value={
                    settings
                      .defaultImpairmentLossAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultImpairmentLossAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    expenseAccounts,
                  )}
                </select>
              </label>

              <label>
                Accumulated Impairment
                <select
                  value={
                    settings
                      .defaultAccumulatedImpairmentAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultAccumulatedImpairmentAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    assetAccounts,
                  )}
                </select>
              </label>

              <label>
                Revaluation Reserve
                <select
                  value={
                    settings
                      .defaultRevaluationReserveAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultRevaluationReserveAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    equityAccounts,
                  )}
                </select>
              </label>

              <label>
                Revaluation Loss
                <select
                  value={
                    settings
                      .defaultRevaluationLossAccountId
                  }
                  onChange={
                    event =>
                      setSettings({
                        ...settings,
                        defaultRevaluationLossAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Choose account
                  </option>
                  {accountOptions(
                    expenseAccounts,
                  )}
                </select>
              </label>
            </div>

            <div
              className={
                styles.actions
              }
            >
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
                Save defaults
              </button>
            </div>
          </form>
        </details>

        <details
          className={
            styles.details
          }
        >
          <summary>
            Category accounting policy
          </summary>

          <form
            onSubmit={
              saveCategory
            }
          >
            <div
              className={
                styles.grid
              }
            >
              <label>
                Asset category
                <select
                  required
                  value={
                    category
                      .categoryId
                  }
                  onChange={
                    event =>
                      loadCategory(
                        event.target
                          .value,
                      )
                  }
                >
                  <option value="">
                    Choose category
                  </option>
                  {data.categories.map(
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
                          row.name ||
                          '',
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Useful life (months)
                <input
                  type="number"
                  min="1"
                  required
                  value={
                    category
                      .defaultUsefulLifeMonths
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        defaultUsefulLifeMonths:
                          event.target
                            .value,
                      })
                  }
                />
              </label>

              <label>
                Depreciation method
                <select
                  value={
                    category
                      .defaultDepreciationMethod
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        defaultDepreciationMethod:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="straight_line">
                    Straight line
                  </option>
                  <option value="declining_balance">
                    Declining balance
                  </option>
                  <option value="no_depreciation">
                    No depreciation
                  </option>
                </select>
              </label>

              <label>
                Annual declining rate %
                <input
                  inputMode="decimal"
                  value={
                    category
                      .decliningBalanceRate
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        decliningBalanceRate:
                          event.target
                            .value,
                      })
                  }
                />
              </label>

              <label>
                Prorata convention
                <select
                  value={
                    category
                      .prorataConvention
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        prorataConvention:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="daily">
                    Daily
                  </option>
                  <option value="full_month">
                    Full month
                  </option>
                  <option value="none">
                    No proration
                  </option>
                </select>
              </label>
            </div>

            <div
              className={
                styles.accountGrid
              }
            >
              <label>
                Asset account
                <select
                  value={
                    category
                      .assetAccountId
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        assetAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Use company default
                  </option>
                  {accountOptions(
                    assetAccounts,
                  )}
                </select>
              </label>

              <label>
                Accumulated Depreciation
                <select
                  value={
                    category
                      .accumulatedDepreciationAccountId
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        accumulatedDepreciationAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Use company default
                  </option>
                  {accountOptions(
                    assetAccounts,
                  )}
                </select>
              </label>

              <label>
                Depreciation Expense
                <select
                  value={
                    category
                      .depreciationExpenseAccountId
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        depreciationExpenseAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Use company default
                  </option>
                  {accountOptions(
                    expenseAccounts,
                  )}
                </select>
              </label>

              <label>
                Capitalization Offset
                <select
                  value={
                    category
                      .capitalizationOffsetAccountId
                  }
                  onChange={
                    event =>
                      setCategory({
                        ...category,
                        capitalizationOffsetAccountId:
                          event.target
                            .value,
                      })
                  }
                >
                  <option value="">
                    Use company default
                  </option>
                  {accountOptions(
                    data.accounts,
                  )}
                </select>
              </label>
            </div>

            <div
              className={
                styles.actions
              }
            >
              <button
                type="submit"
                className={
                  styles.primary
                }
                disabled={
                  !canEdit ||
                  !category
                    .categoryId ||
                  busy ===
                    'category'
                }
              >
                <Save
                  size={15}
                />
                Save category policy
              </button>
            </div>
          </form>
        </details>
      </section>

      <FixedAssetsLifecycleControl
        data={data}
        canExecute={canExecute}
      />

      <SaMiOverlay
        overlay={
          overlay
        }
        onClose={
          closeOverlay
        }
      />
    </div>
  );
}
