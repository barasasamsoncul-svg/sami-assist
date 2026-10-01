'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  Archive,
  BookOpen,
  ChevronRight,
  FilePlus2,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import {
  ACCOUNT_TYPE_OPTIONS,
  ACCOUNT_TYPE_BY_KEY,
} from '@/lib/apps/accounting/chart-config';

import type {
  ChartAccount,
  ChartOfAccountsData,
} from '@/lib/apps/accounting/chart-types';

import {
  formatAccountingAmount,
} from '@/lib/apps/accounting/validation';

import styles from './AccountingFoundation.module.css';


type Draft = {
  accountId: string | null;
  code: string;
  name: string;
  accountType: string;
  parentAccountId: string | null;
  reconcile: boolean;
  allowManualPosting: boolean;
  description: string;
  sequence: number;
};


function emptyDraft():
  Draft {
  const type =
    ACCOUNT_TYPE_OPTIONS[0];

  return {
    accountId:
      null,
    code:
      '',
    name:
      '',
    accountType:
      type.key,
    parentAccountId:
      null,
    reconcile:
      type.reconcileDefault,
    allowManualPosting:
      true,
    description:
      '',
    sequence:
      100,
  };
}


function draftFromAccount(
  account:
    ChartAccount,
): Draft {
  return {
    accountId:
      account.id,
    code:
      account.code,
    name:
      account.name,
    accountType:
      account.accountType,
    parentAccountId:
      account.parentAccountId,
    reconcile:
      account.reconcile,
    allowManualPosting:
      account.allowManualPosting,
    description:
      account.description,
    sequence:
      account.sequence,
  };
}


export default function AccountingChartOfAccounts({
  initialChart,
  canCreate,
  canEdit,
  canManageSettings,
}: {
  initialChart:
    ChartOfAccountsData;
  canCreate:
    boolean;
  canEdit:
    boolean;
  canManageSettings:
    boolean;
}) {
  const [
    chart,
    setChart,
  ] =
    useState(
      initialChart,
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );

  const [
    typeFilter,
    setTypeFilter,
  ] =
    useState(
      'all',
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      'all' |
      'active' |
      'archived'
    >(
      'active',
    );

  const [
    editor,
    setEditor,
  ] =
    useState<
      Draft |
      null
    >(
      null,
    );

  const [
    templateKey,
    setTemplateKey,
  ] =
    useState(
      chart.templates[0]
        ?.key ||
        '',
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    confirmAction,
  } =
    useSaMiOverlay();

  const visible =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        return chart.accounts.filter(
          account => {
            if (
              statusFilter ===
                'active' &&
              !account.isActive
            ) {
              return false;
            }

            if (
              statusFilter ===
                'archived' &&
              account.isActive
            ) {
              return false;
            }

            if (
              typeFilter !==
                'all' &&
              account.accountType !==
                typeFilter
            ) {
              return false;
            }

            if (
              !needle
            ) {
              return true;
            }

            return [
              account.code,
              account.name,
              account.accountType,
              account.parentCode ||
                '',
              account.parentName ||
                '',
              account.systemRole ||
                '',
            ]
              .join(
                ' ',
              )
              .toLowerCase()
              .includes(
                needle,
              );
          },
        );
      },
      [
        chart.accounts,
        query,
        statusFilter,
        typeFilter,
      ],
    );

  const stats =
    useMemo(
      () => ({
        total:
          chart.accounts.length,
        active:
          chart.accounts.filter(
            account =>
              account.isActive,
          ).length,
        control:
          chart.accounts.filter(
            account =>
              account.isControlAccount ||
              account.usedBySetup,
          ).length,
        reconcile:
          chart.accounts.filter(
            account =>
              account.reconcile &&
              account.isActive,
          ).length,
      }),
      [
        chart.accounts,
      ],
    );

  async function refreshChart() {
    const response =
      await fetch(
        '/api/apps/accounting/accounts',
        {
          cache:
            'no-store',
        },
      );

    const body =
      await response
        .json()
        .catch(
          () => ({}),
        );

    if (
      !response.ok ||
      !body.chart
    ) {
      throw new Error(
        typeof body.error ===
          'string'
          ? body.error
          : 'Chart of Accounts could not be refreshed.',
      );
    }

    setChart(
      body.chart,
    );
  }


  async function mutate(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    const response =
      await fetch(
        '/api/apps/accounting/accounts',
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
                chart.companyId,
              ...payload,
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
          : 'Chart of Accounts could not complete this request.',
      );
    }

    return body;
  }


  async function saveAccount() {
    if (
      !editor ||
      busy
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      await mutate({
        action:
          editor.accountId
            ? 'update'
            : 'create',
        accountId:
          editor.accountId,
        code:
          editor.code,
        name:
          editor.name,
        accountType:
          editor.accountType,
        parentAccountId:
          editor.parentAccountId,
        reconcile:
          editor.reconcile,
        allowManualPosting:
          editor.allowManualPosting,
        description:
          editor.description,
        sequence:
          editor.sequence,
      });

      await refreshChart();

      setEditor(
        null,
      );

      showSuccess(
        editor.accountId
          ? 'Account updated'
          : 'Account created',
        editor.code +
          ' · ' +
          editor.name +
          ' is ready in this company chart.',
      );
    } catch (
      error
    ) {
      showError(
        'Account could not be saved',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save this account.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }


  function changeStatus(
    account:
      ChartAccount,
  ) {
    const active =
      account.isActive;

    confirmAction({
      title:
        active
          ? 'Archive account?'
          : 'Restore account?',
      message:
        active
          ? 'SaMi will first verify that the account is not a control/setup account, has no active children and has a zero posted balance.'
          : 'This account will return to active use. Historical entries remain unchanged.',
      confirmLabel:
        active
          ? 'Archive account'
          : 'Restore account',
      onConfirm:
        () => {
          void (
            async () => {
              setBusy(
                true,
              );

              try {
                await mutate({
                  action:
                    active
                      ? 'archive'
                      : 'restore',
                  accountId:
                    account.id,
                });

                await refreshChart();

                showSuccess(
                  active
                    ? 'Account archived'
                    : 'Account restored',
                  account.code +
                    ' · ' +
                    account.name +
                    (
                      active
                        ? ' is no longer available for new postings.'
                        : ' is active again.'
                    ),
                );
              } catch (
                error
              ) {
                showError(
                  active
                    ? 'Account could not be archived'
                    : 'Account could not be restored',
                  error instanceof
                    Error
                    ? error.message
                    : 'SaMi could not change this account.',
                );
              } finally {
                setBusy(
                  false,
                );
              }
            }
          )();
        },
    });
  }


  function applyTemplate() {
    const template =
      chart.templates.find(
        item =>
          item.key ===
          templateKey,
      );

    if (
      !template
    ) {
      showError(
        'Choose a chart template',
        'Select the business template you want SaMi to apply.',
      );

      return;
    }

    confirmAction({
      title:
        'Apply ' +
        template.name +
        '?',
      message:
        'SaMi will add missing compatible accounts, reuse existing matching codes and fill empty Accounting Setup mappings. Existing account balances and mappings are not overwritten.',
      confirmLabel:
        'Apply template',
      onConfirm:
        () => {
          void (
            async () => {
              setBusy(
                true,
              );

              try {
                const body =
                  await mutate({
                    action:
                      'apply-template',
                    templateKey:
                      template.key,
                  });

                await refreshChart();

                const result =
                  body.result;

                showSuccess(
                  'Chart template applied',
                  (
                    result?.created ??
                    0
                  ) +
                    ' accounts created, ' +
                    (
                      result?.reused ??
                      0
                    ) +
                    ' reused' +
                    (
                      result
                        ?.conflicts
                        ?.length
                        ? ', with ' +
                          result.conflicts.length +
                          ' code conflict(s) left unchanged.'
                        : '.'
                    ),
                );
              } catch (
                error
              ) {
                showError(
                  'Template could not be applied',
                  error instanceof
                    Error
                    ? error.message
                    : 'SaMi could not apply this chart template.',
                );
              } finally {
                setBusy(
                  false,
                );
              }
            }
          )();
        },
    });
  }


  return (
    <>
      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />

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
              Accounting · {
                chart.currency
              }
            </div>
            <h2>
              Chart of accounts
            </h2>
            <p>
              Control the company ledger structure, hierarchy, reconciliation
              behavior and posting protections from one dedicated Accounting
              surface.
            </p>
          </div>

          <div
            className={
              styles.actions
            }
          >
            {
              canCreate
                ? (
                    <button
                      type="button"
                      className={
                        styles.primary
                      }
                      onClick={
                        () =>
                          setEditor(
                            emptyDraft(),
                          )
                      }
                    >
                      <FilePlus2
                        size={
                          16
                        }
                      />
                      New account
                    </button>
                  )
                : null
            }
          </div>
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
              Accounts
            </span>
            <strong>
              {
                stats.total
              }
            </strong>
            <small>
              Current company chart
            </small>
          </div>
          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Active
            </span>
            <strong>
              {
                stats.active
              }
            </strong>
            <small>
              Available for new activity
            </small>
          </div>
          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Control / mapped
            </span>
            <strong>
              {
                stats.control
              }
            </strong>
            <small>
              Protected financial roles
            </small>
          </div>
          <div
            className={
              styles.financeCard
            }
          >
            <span>
              Reconcile
            </span>
            <strong>
              {
                stats.reconcile
              }
            </strong>
            <small>
              Active reconciliation accounts
            </small>
          </div>
        </div>

        {
          canManageSettings
            ? (
                <section
                  className={
                    styles.chartTemplateBar
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Starter templates
                    </span>
                    <h3>
                      Build a controlled chart without duplicating existing accounts
                    </h3>
                    <p>
                      Templates are additive and idempotent. They can also populate
                      empty Accounting Setup mappings for receivables, payables,
                      VAT, retained earnings, FX and write-offs.
                    </p>
                  </div>

                  <div
                    className={
                      styles.chartTemplateActions
                    }
                  >
                    <select
                      value={
                        templateKey
                      }
                      disabled={
                        busy
                      }
                      aria-label="Chart template"
                      onChange={
                        event =>
                          setTemplateKey(
                            event.target.value,
                          )
                      }
                    >
                      {
                        chart.templates.map(
                          template => (
                            <option
                              key={
                                template.key
                              }
                              value={
                                template.key
                              }
                            >
                              {
                                template.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>

                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      disabled={
                        busy ||
                        !templateKey
                      }
                      onClick={
                        applyTemplate
                      }
                    >
                      <Sparkles
                        size={
                          15
                        }
                      />
                      Apply template
                    </button>
                  </div>
                </section>
              )
            : null
        }

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.chartToolbar
            }
          >
            <label
              className={
                styles.chartSearch
              }
            >
              <span
                className="sr-only"
              >
                Search chart of accounts
              </span>
              <Search
                size={
                  16
                }
              />
              <input
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event.target.value,
                    )
                }
                placeholder="Search code, name, parent or system role"
              />
            </label>

            <select
              value={
                typeFilter
              }
              onChange={
                event =>
                  setTypeFilter(
                    event.target.value,
                  )
              }
              aria-label="Filter account type"
            >
              <option value="all">
                All account types
              </option>
              {
                ACCOUNT_TYPE_OPTIONS.map(
                  type => (
                    <option
                      key={
                        type.key
                      }
                      value={
                        type.key
                      }
                    >
                      {
                        type.group
                      } · {
                        type.label
                      }
                    </option>
                  ),
                )
              }
            </select>

            <select
              value={
                statusFilter
              }
              onChange={
                event =>
                  setStatusFilter(
                    event.target.value as
                      'all' |
                      'active' |
                      'archived',
                  )
              }
              aria-label="Filter account status"
            >
              <option value="active">
                Active
              </option>
              <option value="archived">
                Archived
              </option>
              <option value="all">
                All statuses
              </option>
            </select>
          </div>

          {
            visible.length
              ? (
                  <div
                    className={
                      styles.tableWrap
                    }
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>
                            Account
                          </th>
                          <th>
                            Classification
                          </th>
                          <th>
                            Controls
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Posted balance
                          </th>
                          <th>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          visible.map(
                            account => {
                              const definition =
                                ACCOUNT_TYPE_BY_KEY.get(
                                  account.accountType as never,
                                );

                              return (
                                <tr
                                  key={
                                    account.id
                                  }
                                >
                                  <td>
                                    <strong>
                                      {
                                        account.code
                                      } · {
                                        account.name
                                      }
                                    </strong>
                                    {
                                      account.parentCode
                                        ? (
                                            <span
                                              className={
                                                styles.meta
                                              }
                                            >
                                              <ChevronRight
                                                size={
                                                  11
                                                }
                                                aria-hidden="true"
                                              />{' '}
                                              Parent {
                                                account.parentCode
                                              } · {
                                                account.parentName
                                              }
                                            </span>
                                          )
                                        : null
                                    }
                                    {
                                      account.description
                                        ? (
                                            <span
                                              className={
                                                styles.meta
                                              }
                                            >
                                              {
                                                account.description
                                              }
                                            </span>
                                          )
                                        : null
                                    }
                                  </td>

                                  <td>
                                    <span
                                      className={
                                        styles.badge
                                      }
                                    >
                                      {
                                        definition
                                          ?.label ||
                                        account.accountType.replaceAll(
                                          '_',
                                          ' ',
                                        )
                                      }
                                    </span>
                                    <span
                                      className={
                                        styles.meta
                                      }
                                    >
                                      Normal {
                                        account.normalBalance
                                      } · sequence {
                                        account.sequence
                                      }
                                    </span>
                                  </td>

                                  <td>
                                    <div
                                      className={
                                        styles.chartFlags
                                      }
                                    >
                                      {
                                        account.isControlAccount ||
                                        account.usedBySetup
                                          ? (
                                              <span>
                                                <ShieldCheck
                                                  size={
                                                    13
                                                  }
                                                />
                                                Control
                                              </span>
                                            )
                                          : null
                                      }
                                      {
                                        account.reconcile
                                          ? (
                                              <span>
                                                Reconcile
                                              </span>
                                            )
                                          : null
                                      }
                                      {
                                        !account.allowManualPosting
                                          ? (
                                              <span>
                                                System posting
                                              </span>
                                            )
                                          : null
                                      }
                                      {
                                        !account.isActive
                                          ? (
                                              <span>
                                                Archived
                                              </span>
                                            )
                                          : null
                                      }
                                    </div>
                                    {
                                      account.systemRole
                                        ? (
                                            <span
                                              className={
                                                styles.meta
                                              }
                                            >
                                              Role: {
                                                account.systemRole.replaceAll(
                                                  '_',
                                                  ' ',
                                                )
                                              }
                                            </span>
                                          )
                                        : null
                                    }
                                  </td>

                                  <td
                                    className={
                                      styles.number
                                    }
                                  >
                                    {
                                      formatAccountingAmount(
                                        account.postedBalance,
                                        chart.currency,
                                      )
                                    }
                                    <span
                                      className={
                                        styles.meta
                                      }
                                    >
                                      {
                                        account.journalLineCount
                                      } journal line{
                                        account.journalLineCount ===
                                          1
                                          ? ''
                                          : 's'
                                      }
                                    </span>
                                  </td>

                                  <td>
                                    <div
                                      className={
                                        styles.chartRowActions
                                      }
                                    >
                                      {
                                        canEdit
                                          ? (
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
                                                    setEditor(
                                                      draftFromAccount(
                                                        account,
                                                      ),
                                                    )
                                                }
                                              >
                                                <Pencil
                                                  size={
                                                    14
                                                  }
                                                />
                                                Edit
                                              </button>
                                            )
                                          : null
                                      }

                                      {
                                        canEdit
                                          ? (
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
                                                    changeStatus(
                                                      account,
                                                    )
                                                }
                                              >
                                                {
                                                  account.isActive
                                                    ? (
                                                        <Archive
                                                          size={
                                                            14
                                                          }
                                                        />
                                                      )
                                                    : (
                                                        <RotateCcw
                                                          size={
                                                            14
                                                          }
                                                        />
                                                      )
                                                }
                                                {
                                                  account.isActive
                                                    ? 'Archive'
                                                    : 'Restore'
                                                }
                                              </button>
                                            )
                                          : null
                                      }
                                    </div>
                                  </td>
                                </tr>
                              );
                            },
                          )
                        }
                      </tbody>
                    </table>
                  </div>
                )
              : (
                  <div
                    className={
                      styles.empty
                    }
                  >
                    <BookOpen
                      size={
                        28
                      }
                    />
                    <p>
                      No accounts match these filters.
                    </p>
                  </div>
                )
          }
        </section>
      </div>

      {
        editor
          ? (
              <div
                className={
                  styles.chartEditorBackdrop
                }
                role="presentation"
                onMouseDown={
                  event => {
                    if (
                      event.target ===
                        event.currentTarget
                    ) {
                      setEditor(
                        null,
                      );
                    }
                  }
                }
              >
                <section
                  className={
                    styles.chartEditor
                  }
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="account-editor-title"
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
                        {
                          editor.accountId
                            ? 'Edit account'
                            : 'New account'
                        }
                      </span>
                      <h3
                        id="account-editor-title"
                      >
                        {
                          editor.accountId
                            ? editor.code +
                              ' · ' +
                              editor.name
                            : 'Add ledger account'
                        }
                      </h3>
                    </div>
                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      aria-label="Close account editor"
                      onClick={
                        () =>
                          setEditor(
                            null,
                          )
                      }
                    >
                      <X
                        size={
                          16
                        }
                      />
                    </button>
                  </div>

                  <div
                    className={
                      styles.setupAccountGrid
                    }
                  >
                    <label>
                      Account code
                      <input
                        value={
                          editor.code
                        }
                        maxLength={
                          50
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              code:
                                event.target.value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Account name
                      <input
                        value={
                          editor.name
                        }
                        maxLength={
                          255
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              name:
                                event.target.value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Account type
                      <select
                        value={
                          editor.accountType
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event => {
                            const nextType =
                              event.target.value;

                            const definition =
                              ACCOUNT_TYPE_BY_KEY.get(
                                nextType as never,
                              );

                            setEditor({
                              ...editor,
                              accountType:
                                nextType,
                              reconcile:
                                definition
                                  ?.reconcileDefault ??
                                editor.reconcile,
                            });
                          }
                        }
                      >
                        {
                          ACCOUNT_TYPE_OPTIONS.map(
                            type => (
                              <option
                                key={
                                  type.key
                                }
                                value={
                                  type.key
                                }
                              >
                                {
                                  type.group
                                } · {
                                  type.label
                                }
                              </option>
                            ),
                          )
                        }
                      </select>
                    </label>

                    <label>
                      Parent account
                      <select
                        value={
                          editor.parentAccountId ||
                          ''
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              parentAccountId:
                                event.target.value ||
                                null,
                            })
                        }
                      >
                        <option value="">
                          No parent
                        </option>
                        {
                          chart.accounts
                            .filter(
                              account =>
                                account.isActive &&
                                account.id !==
                                  editor.accountId,
                            )
                            .map(
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
                                  }
                                </option>
                              ),
                            )
                        }
                      </select>
                    </label>

                    <label>
                      Sequence
                      <input
                        type="number"
                        min={
                          0
                        }
                        max={
                          999999
                        }
                        value={
                          editor.sequence
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              sequence:
                                Number(
                                  event.target.value,
                                ),
                            })
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.chartDescription
                      }
                    >
                      Description
                      <textarea
                        value={
                          editor.description
                        }
                        maxLength={
                          2000
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              description:
                                event.target.value,
                            })
                        }
                      />
                    </label>
                  </div>

                  <div
                    className={
                      styles.chartToggleGrid
                    }
                  >
                    <label
                      className={
                        styles.toggleField
                      }
                    >
                      <input
                        type="checkbox"
                        checked={
                          editor.reconcile
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              reconcile:
                                event.target.checked,
                            })
                        }
                      />
                      <span>
                        <strong>
                          Reconciliation enabled
                        </strong>
                        <small>
                          Use for bank, cash, receivable or payable accounts that require matching.
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
                          editor.allowManualPosting
                        }
                        disabled={
                          busy
                        }
                        onChange={
                          event =>
                            setEditor({
                              ...editor,
                              allowManualPosting:
                                event.target.checked,
                            })
                        }
                      />
                      <span>
                        <strong>
                          Allow manual journals
                        </strong>
                        <small>
                          Disable for control accounts that should only receive trusted subsystem postings.
                        </small>
                      </span>
                    </label>
                  </div>

                  <div
                    className={
                      styles.chartEditorFooter
                    }
                  >
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
                          setEditor(
                            null,
                          )
                      }
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={
                        styles.primary
                      }
                      disabled={
                        busy
                      }
                      onClick={
                        saveAccount
                      }
                    >
                      {
                        busy
                          ? 'Saving…'
                          : editor.accountId
                            ? 'Save account'
                            : 'Create account'
                      }
                    </button>
                  </div>
                </section>
              </div>
            )
          : null
      }
    </>
  );
}
