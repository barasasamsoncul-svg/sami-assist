"use client";

import Link from 'next/link';
import {
  useRouter,
} from 'next/navigation';
import {
  Boxes,
  CheckCircle2,
  FileCheck2,
  PackageCheck,
  RefreshCcw,
  Save,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';
import type {
  AccountingInventoryValuationWorkspace,
} from '@/lib/apps/accounting/inventory-valuation';
import {
  formatAccountingAmount,
} from '@/lib/apps/accounting/validation';

import styles from './AccountingFoundation.module.css';

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

export default function AccountingInventoryValuation({
  data,
  canCreate,
  canEdit,
}: {
  data:
    AccountingInventoryValuationWorkspace;
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
    settings,
    setSettings,
  ] =
    useState({
      enabled:
        Boolean(
          data.settings
            .enabled,
        ),
      valuationStartDate:
        String(
          data.settings
            .valuation_start_date ||
          data.snapshotDate,
        ).slice(
          0,
          10,
        ),
      inventoryAssetAccountId:
        String(
          data.settings
            .inventory_asset_account_id ||
          '',
        ),
      cogsAccountId:
        String(
          data.settings
            .cogs_account_id ||
          '',
        ),
      inventoryGainAccountId:
        String(
          data.settings
            .inventory_gain_account_id ||
          '',
        ),
      inventoryLossAccountId:
        String(
          data.settings
            .inventory_loss_account_id ||
          '',
        ),
      syncSalesMovements:
        data.settings
          .sync_sales_movements !==
        false,
      syncAdjustments:
        data.settings
          .sync_adjustments !==
        false,
    });

  const [
    movementRule,
    setMovementRule,
  ] =
    useState({
      movementType:
        '',
      treatment:
        'issue_cogs',
    });

  const assetAccounts =
    data.ledgerAccounts
      .filter(
        account =>
          String(
            account.account_type,
          ) ===
            'asset' ||
          String(
            account.account_type,
          ).startsWith(
            'asset_',
          ),
      );

  const expenseAccounts =
    data.ledgerAccounts
      .filter(
        account =>
          String(
            account.account_type,
          ) ===
            'expense' ||
          String(
            account.account_type,
          ).startsWith(
            'expense_',
          ),
      );

  const incomeAccounts =
    data.ledgerAccounts
      .filter(
        account =>
          String(
            account.account_type,
          ) ===
            'income' ||
          String(
            account.account_type,
          ).startsWith(
            'income_',
          ),
      );

  const pending =
    useMemo(
      () =>
        data.events.filter(
          event =>
            event.status ===
            'pending',
        ).length,
      [
        data.events,
      ],
    );

  const review =
    useMemo(
      () =>
        data.events.filter(
          event =>
            event.status ===
            'review',
        ).length,
      [
        data.events,
      ],
    );

  const money = (
    value:
      unknown,
  ) =>
    formatAccountingAmount(
      String(
        value ||
        '0',
      ),
      data.currency,
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
        '/api/apps/accounting/inventory-valuation',
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
        'Inventory valuation action failed.',
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
      'Inventory valuation settings saved',
      () =>
        'Standard-cost valuation controls and ledger mappings were updated.',
    );
  }

  async function sync() {
    await run(
      'sync',
      {
        action:
          'sync',
      },
      'Inventory valuation synchronized',
      result =>
        String(
          result.posted ||
          0,
        ) +
        ' valuation journal(s) posted, ' +
        String(
          result.review ||
          0,
        ) +
        ' event(s) left for review and ' +
        String(
          result.failed ||
          0,
        ) +
        ' posting failure(s).',
    );
  }

  async function reconcile() {
    await run(
      'reconcile',
      {
        action:
          'create-reconciliation',
      },
      'Inventory reconciliation snapshot created',
      result =>
        'Stock value ' +
        money(
          result.stockValue,
        ) +
        ', GL value ' +
        money(
          result.glValue,
        ) +
        ', difference ' +
        money(
          result.difference,
        ) +
        '.',
    );
  }

  async function saveRule(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canEdit
    ) {
      return;
    }

    const result =
      await run(
        'rule',
        {
          action:
            'save-movement-rule',
          ...movementRule,
        },
        'Movement treatment saved',
        () =>
          'Future syncs will use this explicit accounting treatment for the movement type.',
      );

    if (
      result
    ) {
      setMovementRule({
        movementType:
          '',
        treatment:
          'issue_cogs',
      });
    }
  }

  async function saveProductMapping(
    productId:
      string,
    assetId:
      string,
    cogsId:
      string,
  ) {
    await run(
      'product:' +
        productId,
      {
        action:
          'save-product-mapping',
        productId,
        inventoryAssetAccountId:
          assetId ||
          null,
        cogsAccountId:
          cogsId ||
          null,
      },
      'Product accounting mapping saved',
      () =>
        'This product will use the selected Inventory Asset and COGS overrides.',
    );
  }

  async function postReconciliation(
    runId:
      string,
  ) {
    await run(
      'post-recon:' +
        runId,
      {
        action:
          'post-reconciliation',
        runId,
      },
      'Inventory reconciliation adjustment posted',
      result =>
        'Balanced adjustment journal ' +
        String(
          result.journalId ||
          '',
        ) +
        ' was posted.',
    );
  }

  function reverseReconciliation(
    runId:
      string,
  ) {
    confirmAction({
      title:
        'Reverse inventory reconciliation adjustment?',
      message:
        'This creates a linked compensating journal. Stock quantities are not changed.',
      confirmLabel:
        'Reverse adjustment',
      onConfirm:
        () =>
          void run(
            'reverse-recon:' +
              runId,
            {
              action:
                'reverse-reconciliation',
              runId,
              reversalDate:
                today(),
            },
            'Inventory reconciliation reversed',
            result =>
              'Compensating journal ' +
              String(
                result.journalId ||
                '',
              ) +
              ' was posted.',
          ),
    });
  }

  const errors =
    data.diagnostics.filter(
      item =>
        item.level ===
        'error',
    ).length;

  const warnings =
    data.diagnostics.filter(
      item =>
        item.level ===
        'warning',
    ).length;

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
            Accounting · Inventory Valuation · Standard cost
          </div>

          <h2>
            Inventory value, COGS & ledger reconciliation
          </h2>

          <p>
            Inventory remains the source of truth for products, warehouses and quantities. Accounting snapshots standard cost, posts recognized stock events and reconciles current stock value to the mapped Inventory Asset ledger accounts.
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          <Link
            className={
              styles.button
            }
            href="/apps/inventory"
          >
            <Boxes
              size={15}
            />
            Open Inventory
          </Link>

          {canEdit &&
          data.runtime
            .available ? (
            <button
              type="button"
              className={
                styles.primary
              }
              disabled={
                busy ===
                'sync'
              }
              onClick={
                sync
              }
            >
              <RefreshCcw
                size={15}
              />
              Sync valuation
            </button>
          ) : null}
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
            Current stock value
          </span>
          <strong>
            {money(
              data.preview
                .stockValue,
            )}
          </strong>
          <small>
            Quantity × current product standard cost
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Inventory GL
          </span>
          <strong>
            {money(
              data.preview
                .glValue,
            )}
          </strong>
          <small>
            Posted balance through {data.snapshotDate}
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Reconciliation difference
          </span>
          <strong>
            {money(
              data.preview
                .difference,
            )}
          </strong>
          <small>
            Stock valuation less mapped GL
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Valuation queue
          </span>
          <strong>
            {pending} pending
          </strong>
          <small>
            {review} review · {errors} errors · {warnings} warnings
          </small>
        </div>
      </section>

      {data.diagnostics
        .length ? (
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
              <span
                className={
                  styles.eyebrow
                }
              >
                Readiness diagnostics
              </span>
              <h3>
                Inventory accounting controls
              </h3>
            </div>

            {errors ? (
              <TriangleAlert
                size={20}
              />
            ) : (
              <CheckCircle2
                size={20}
              />
            )}
          </div>

          <div
            className={
              styles.healthGrid
            }
          >
            {data.diagnostics.map(
              item => (
                <div
                  key={
                    item.code
                  }
                >
                  <span>
                    {item.level.toUpperCase()}
                  </span>
                  <strong>
                    {item.code.replaceAll(
                      '_',
                      ' ',
                    )}
                  </strong>
                  <small>
                    {item.message}
                  </small>
                </div>
              ),
            )}
          </div>
        </section>
      ) : (
        <div
          className={
            styles.notice
          }
        >
          <CheckCircle2
            size={16}
          />
          Inventory valuation controls have no open diagnostic.
        </div>
      )}

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
            <span
              className={
                styles.eyebrow
              }
            >
              Valuation policy
            </span>
            <h3>
              Standard-cost Accounting setup
            </h3>
          </div>

          <Settings2
            size={20}
          />
        </div>

        <form
          onSubmit={
            saveSettings
          }
        >
          <div
            className={
              styles.setupGrid
            }
          >
            <label>
              <input
                type="checkbox"
                checked={
                  settings.enabled
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      enabled:
                        event.target
                          .checked,
                    })
                }
              />
              Enable perpetual inventory valuation
            </label>

            <label>
              Valuation start date
              <input
                type="date"
                required
                value={
                  settings.valuationStartDate
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      valuationStartDate:
                        event.target
                          .value,
                    })
                }
              />
            </label>

            <label>
              Inventory Asset
              <select
                required
                value={
                  settings.inventoryAssetAccountId
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      inventoryAssetAccountId:
                        event.target
                          .value,
                    })
                }
              >
                <option
                  value=""
                >
                  Choose asset account
                </option>
                {assetAccounts.map(
                  account => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {account.code} · {account.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Cost of Goods Sold
              <select
                required
                value={
                  settings.cogsAccountId
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      cogsAccountId:
                        event.target
                          .value,
                    })
                }
              >
                <option
                  value=""
                >
                  Choose expense account
                </option>
                {expenseAccounts.map(
                  account => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {account.code} · {account.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Inventory Gain
              <select
                required
                value={
                  settings.inventoryGainAccountId
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      inventoryGainAccountId:
                        event.target
                          .value,
                    })
                }
              >
                <option
                  value=""
                >
                  Choose income account
                </option>
                {incomeAccounts.map(
                  account => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {account.code} · {account.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Inventory Loss
              <select
                required
                value={
                  settings.inventoryLossAccountId
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      inventoryLossAccountId:
                        event.target
                          .value,
                    })
                }
              >
                <option
                  value=""
                >
                  Choose expense account
                </option>
                {expenseAccounts.map(
                  account => (
                    <option
                      key={
                        account.id
                      }
                      value={
                        account.id
                      }
                    >
                      {account.code} · {account.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <input
                type="checkbox"
                checked={
                  settings.syncSalesMovements
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      syncSalesMovements:
                        event.target
                          .checked,
                    })
                }
              />
              Value Sales deliveries and returns
            </label>

            <label>
              <input
                type="checkbox"
                checked={
                  settings.syncAdjustments
                }
                onChange={
                  event =>
                    setSettings({
                      ...settings,
                      syncAdjustments:
                        event.target
                          .checked,
                    })
                }
              />
              Value posted Inventory adjustments
            </label>
          </div>

          <p
            className={
              styles.meta
            }
          >
            SaMi uses the existing Inventory product <strong>cost price</strong> as standard cost. FIFO and moving-average valuation are not advertised because Inventory does not currently persist the cost layers required to calculate them correctly.
          </p>

          {canEdit ? (
            <button
              className={
                styles.primary
              }
              disabled={
                busy ===
                'settings'
              }
            >
              <Save
                size={15}
              />
              Save valuation setup
            </button>
          ) : null}
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
            <span
              className={
                styles.eyebrow
              }
            >
              Current control · {data.snapshotDate}
            </span>
            <h3>
              Stock valuation vs General Ledger
            </h3>
          </div>

          <PackageCheck
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
                  Inventory asset account
                </th>
                <th>
                  Products
                </th>
                <th>
                  Stock value
                </th>
                <th>
                  GL value
                </th>
                <th>
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {data.preview
                .lines.length ? (
                data.preview.lines.map(
                  (
                    line,
                    index,
                  ) => (
                    <tr
                      key={
                        String(
                          line.accountId ||
                          'unmapped',
                        ) +
                        index
                      }
                    >
                      <td>
                        <strong>
                          {String(
                            line.accountCode ||
                            'Unmapped',
                          )}
                        </strong>
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {String(
                            line.accountName ||
                            '',
                          )}
                        </span>
                      </td>
                      <td>
                        {String(
                          line.productCount ||
                          0,
                        )}
                      </td>
                      <td>
                        {money(
                          line.stockValue,
                        )}
                      </td>
                      <td>
                        {money(
                          line.glValue,
                        )}
                      </td>
                      <td>
                        {money(
                          line.difference,
                        )}
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      5
                    }
                    className={
                      styles.empty
                    }
                  >
                    No stock valuation rows are available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className={
            styles.actions
          }
        >
          {canCreate &&
          data.runtime
            .available ? (
            <button
              type="button"
              className={
                styles.primary
              }
              disabled={
                busy ===
                'reconcile'
              }
              onClick={
                reconcile
              }
            >
              <FileCheck2
                size={15}
              />
              Save reconciliation snapshot
            </button>
          ) : null}
        </div>

        <p
          className={
            styles.meta
          }
        >
          Reconciliation is a current-state snapshot because Inventory stores current stock levels, not historical quantity layers. Posting an adjustment changes only the ledger; it never changes Inventory quantities.
        </p>
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
            <span
              className={
                styles.eyebrow
              }
            >
              Reconciliation history
            </span>
            <h3>
              Saved stock-to-ledger controls
            </h3>
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
                  Date
                </th>
                <th>
                  Stock
                </th>
                <th>
                  GL
                </th>
                <th>
                  Difference
                </th>
                <th>
                  Status
                </th>
                <th>
                  Control
                </th>
              </tr>
            </thead>
            <tbody>
              {data.reconciliationRuns
                .length ? (
                data.reconciliationRuns.map(
                  run => (
                    <tr
                      key={
                        run.id
                      }
                    >
                      <td>
                        {run.as_of_date}
                      </td>
                      <td>
                        {money(
                          run.stock_value,
                        )}
                      </td>
                      <td>
                        {money(
                          run.gl_value,
                        )}
                      </td>
                      <td>
                        {money(
                          run.difference_amount,
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            styles.badge
                          }
                        >
                          {run.status}
                        </span>
                      </td>
                      <td>
                        <div
                          className={
                            styles.actions
                          }
                        >
                          {canEdit &&
                          run.status ===
                            'draft' ? (
                            <button
                              type="button"
                              className={
                                styles.primary
                              }
                              disabled={
                                busy ===
                                  'post-recon:' +
                                  run.id
                              }
                              onClick={
                                () =>
                                  postReconciliation(
                                    run.id,
                                  )
                              }
                            >
                              Post adjustment
                            </button>
                          ) : null}

                          {canEdit &&
                          run.status ===
                            'posted' &&
                          !run.reversal_journal_id ? (
                            <button
                              type="button"
                              className={
                                styles.button
                              }
                              onClick={
                                () =>
                                  reverseReconciliation(
                                    run.id,
                                  )
                              }
                            >
                              Reverse
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className={
                      styles.empty
                    }
                  >
                    No inventory reconciliation snapshots yet.
                  </td>
                </tr>
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
            <span
              className={
                styles.eyebrow
              }
            >
              Product ledger overrides
            </span>
            <h3>
              Inventory Asset & COGS by product
            </h3>
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
                  Product
                </th>
                <th>
                  Standard cost
                </th>
                <th>
                  Stock
                </th>
                <th>
                  Inventory Asset override
                </th>
                <th>
                  COGS override
                </th>
                <th>
                  Control
                </th>
              </tr>
            </thead>
            <tbody>
              {data.products.map(
                product => (
                  <ProductMappingRow
                    key={
                      String(
                        product.id,
                      )
                    }
                    product={
                      product
                    }
                    assetAccounts={
                      assetAccounts
                    }
                    expenseAccounts={
                      expenseAccounts
                    }
                    busy={
                      busy ===
                      'product:' +
                        String(
                          product.id,
                        )
                    }
                    canEdit={
                      canEdit
                    }
                    onSave={
                      saveProductMapping
                    }
                    currency={
                      data.currency
                    }
                  />
                ),
              )}

              {!data.products
                .length ? (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className={
                      styles.empty
                    }
                  >
                    Inventory products are not available in this workspace.
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
            <span
              className={
                styles.eyebrow
              }
            >
              Movement classification
            </span>
            <h3>
              Explicit rules for non-standard movement types
            </h3>
          </div>
        </div>

        <form
          onSubmit={
            saveRule
          }
        >
          <div
            className={
              styles.setupGrid
            }
          >
            <label>
              Movement type
              <input
                required
                maxLength={
                  80
                }
                value={
                  movementRule.movementType
                }
                onChange={
                  event =>
                    setMovementRule({
                      ...movementRule,
                      movementType:
                        event.target
                          .value,
                    })
                }
                placeholder="e.g. warehouse_issue"
              />
            </label>

            <label>
              Accounting treatment
              <select
                value={
                  movementRule.treatment
                }
                onChange={
                  event =>
                    setMovementRule({
                      ...movementRule,
                      treatment:
                        event.target
                          .value,
                    })
                }
              >
                <option
                  value="issue_cogs"
                >
                  Issue to COGS
                </option>
                <option
                  value="return_cogs"
                >
                  Return from COGS
                </option>
                <option
                  value="adjustment_gain"
                >
                  Inventory gain
                </option>
                <option
                  value="adjustment_loss"
                >
                  Inventory loss
                </option>
                <option
                  value="ignore"
                >
                  Ignore / non-valuing movement
                </option>
              </select>
            </label>
          </div>

          {canEdit ? (
            <button
              className={
                styles.button
              }
              disabled={
                busy ===
                'rule'
              }
            >
              Save movement rule
            </button>
          ) : null}
        </form>

        {data.rules
          .length ? (
          <div
            className={
              styles.tableWrap
            }
          >
            <table>
              <thead>
                <tr>
                  <th>
                    Movement type
                  </th>
                  <th>
                    Treatment
                  </th>
                  <th>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rules.map(
                  rule => (
                    <tr
                      key={
                        rule.id
                      }
                    >
                      <td>
                        {rule.movement_type}
                      </td>
                      <td>
                        {String(
                          rule.treatment,
                        ).replaceAll(
                          '_',
                          ' ',
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            styles.badge
                          }
                        >
                          {rule.active
                            ? 'active'
                            : 'inactive'}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
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
            <span
              className={
                styles.eyebrow
              }
            >
              Valuation event register
            </span>
            <h3>
              Inventory events and posting evidence
            </h3>
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
                  Date
                </th>
                <th>
                  Event
                </th>
                <th>
                  Product
                </th>
                <th>
                  Quantity
                </th>
                <th>
                  Unit cost
                </th>
                <th>
                  Value
                </th>
                <th>
                  Cost evidence
                </th>
                <th>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.events
                .length ? (
                data.events.map(
                  event => (
                    <tr
                      key={
                        event.id
                      }
                    >
                      <td>
                        {event.event_date}
                      </td>
                      <td>
                        <strong>
                          {event.movement_type}
                        </strong>
                        <span
                          className={
                            styles.meta
                          }
                        >
                          {event.source_type}
                        </span>
                      </td>
                      <td>
                        {event.product_name ||
                          event.sku ||
                          event.product_id}
                      </td>
                      <td>
                        {event.quantity_effect}
                      </td>
                      <td>
                        {money(
                          event.unit_cost,
                        )}
                      </td>
                      <td>
                        {money(
                          event.value_amount,
                        )}
                      </td>
                      <td>
                        {event.cost_estimated ? (
                          <span
                            className={
                              styles.badge
                            }
                          >
                            estimated backfill
                          </span>
                        ) : (
                          <span
                            className={
                              styles.badge
                            }
                          >
                            event snapshot
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            styles.badge
                          }
                        >
                          {event.status}
                        </span>
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      8
                    }
                    className={
                      styles.empty
                    }
                  >
                    No valuation events captured yet.
                  </td>
                </tr>
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
            <span
              className={
                styles.eyebrow
              }
            >
              Sync history
            </span>
            <h3>
              Inventory valuation synchronization
            </h3>
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
                  Started
                </th>
                <th>
                  Backfilled
                </th>
                <th>
                  Posted
                </th>
                <th>
                  Review
                </th>
                <th>
                  Failed
                </th>
                <th>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.syncRuns
                .length ? (
                data.syncRuns.map(
                  run => (
                    <tr
                      key={
                        run.id
                      }
                    >
                      <td>
                        {String(
                          run.started_at,
                        )
                          .slice(
                            0,
                            19,
                          )
                          .replace(
                            'T',
                            ' ',
                          )}
                      </td>
                      <td>
                        {run.backfilled_count}
                      </td>
                      <td>
                        {run.posted_count}
                      </td>
                      <td>
                        {run.review_count}
                      </td>
                      <td>
                        {run.failed_count}
                      </td>
                      <td>
                        <span
                          className={
                            styles.badge
                          }
                        >
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  ),
                )
              ) : (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className={
                      styles.empty
                    }
                  >
                    No valuation sync has run yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div
        className={
          styles.notice
        }
      >
        <CheckCircle2
          size={16}
        />
        Inventory owns products, quantities and warehouses. Accounting owns valuation journals and reconciliation only; this page never edits stock quantities.
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

function ProductMappingRow({
  product,
  assetAccounts,
  expenseAccounts,
  busy,
  canEdit,
  onSave,
  currency,
}: {
  product:
    Record<
      string,
      unknown
    >;
  assetAccounts:
    Array<
      Record<
        string,
        unknown
      >
    >;
  expenseAccounts:
    Array<
      Record<
        string,
        unknown
      >
    >;
  busy:
    boolean;
  canEdit:
    boolean;
  onSave:
    (
      productId:
        string,
      assetId:
        string,
      cogsId:
        string,
    ) => Promise<
      void
    >;
  currency:
    string;
}) {
  const [
    assetId,
    setAssetId,
  ] =
    useState(
      String(
        product.inventory_asset_account_id ||
        '',
      ),
    );
  const [
    cogsId,
    setCogsId,
  ] =
    useState(
      String(
        product.cogs_account_id ||
        '',
      ),
    );

  return (
    <tr>
      <td>
        <strong>
          {String(
            product.name,
          )}
        </strong>
        <span
          className={
            styles.meta
          }
        >
          {String(
            product.sku ||
            product.product_type ||
            '',
          )}
        </span>
      </td>
      <td>
        {formatAccountingAmount(
          String(
            product.cost_price ||
            '0',
          ),
          currency,
        )}
      </td>
      <td>
        {String(
          product.stock_quantity ||
          '0',
        )}
      </td>
      <td>
        <select
          value={
            assetId
          }
          onChange={
            event =>
              setAssetId(
                event.target
                  .value,
              )
          }
          disabled={
            !canEdit
          }
        >
          <option
            value=""
          >
            Use default
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
      </td>
      <td>
        <select
          value={
            cogsId
          }
          onChange={
            event =>
              setCogsId(
                event.target
                  .value,
              )
          }
          disabled={
            !canEdit
          }
        >
          <option
            value=""
          >
            Use default
          </option>
          {expenseAccounts.map(
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
      </td>
      <td>
        {canEdit ? (
          <button
            type="button"
            className={
              styles.button
            }
            disabled={
              busy
            }
            onClick={
              () =>
                void onSave(
                  String(
                    product.id,
                  ),
                  assetId,
                  cogsId,
                )
            }
          >
            Save
          </button>
        ) : null}
      </td>
    </tr>
  );
}
