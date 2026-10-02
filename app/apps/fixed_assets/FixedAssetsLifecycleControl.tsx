'use client';

import {
  FileLink2,
  RefreshCcw,
  Scale,
  ShieldAlert,
  Trash2,
  Undo2,
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

import styles from './FixedAssetsControl.module.css';

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
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

export default function FixedAssetsLifecycleControl({
  data,
  canExecute,
}: {
  data:
    FixedAssetsAccountingWorkspace;
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
    assetId,
    setAssetId,
  ] =
    useState(
      '',
    );

  const [
    impairment,
    setImpairment,
  ] =
    useState({
      date:
        today(),
      amount:
        '',
      reason:
        '',
    });

  const [
    revaluation,
    setRevaluation,
  ] =
    useState({
      date:
        today(),
      fairValue:
        '',
      reason:
        '',
    });

  const [
    disposal,
    setDisposal,
  ] =
    useState({
      date:
        today(),
      method:
        'sale',
      proceeds:
        '0',
      proceedsAccountId:
        '',
      notes:
        '',
    });

  const [
    vendorBillId,
    setVendorBillId,
  ] =
    useState(
      '',
    );

  const [
    source,
    setSource,
  ] =
    useState({
      module:
        'purchase',
      type:
        'vendor_bill',
      id:
        '',
      reference:
        '',
      amount:
        '',
    });

  const assetsById =
    useMemo(
      () =>
        new Map(
          data.assets.map(
            asset => [
              String(
                asset.id,
              ),
              asset,
            ],
          ),
        ),
      [
        data.assets,
      ],
    );

  const selectedAsset =
    assetId
      ? assetsById.get(
          assetId,
        ) ||
        null
      : null;

  const activeAssets =
    data.assets.filter(
      asset =>
        Boolean(
          asset
            .capitalization_journal_id,
        ) &&
        !asset
          .capitalization_reversal_journal_id &&
        String(
          asset.status ||
          '',
        ) !==
          'disposed',
    );

  const cashAccounts =
    data.accounts.filter(
      account => {
        const type =
          String(
            account.account_type ||
            '',
          );

        return (
          type ===
            'asset' ||
          type.startsWith(
            'asset_',
          )
        );
      },
    );

  function assetLabel(
    id:
      unknown,
  ) {
    const asset =
      assetsById.get(
        String(
          id ||
          '',
        ),
      );

    return asset
      ? String(
          asset.asset_code ||
          '',
        ) +
          ' · ' +
          String(
            asset.name ||
            '',
          )
      : String(
          id ||
          '',
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
        'Fixed Asset lifecycle action failed.',
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
      (
        result:
          Record<
            string,
            unknown
          >,
      ) =>
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
        message(
          result,
        ),
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

  async function postImpairment(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute ||
      !assetId
    ) {
      return;
    }

    const result =
      await run(
        'impairment',
        {
          action:
            'post-impairment',
          assetId,
          requestKey:
            crypto.randomUUID(),
          impairmentDate:
            impairment.date,
          impairmentAmount:
            impairment.amount,
          reason:
            impairment.reason,
        },
        'Impairment posted',
        value =>
          'Carrying value is now ' +
          amount(
            value.carryingValue,
          ) +
          '.',
      );

    if (
      result
    ) {
      setImpairment({
        date:
          today(),
        amount:
          '',
        reason:
          '',
      });
    }
  }

  async function postRevaluation(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute ||
      !assetId
    ) {
      return;
    }

    const result =
      await run(
        'revaluation',
        {
          action:
            'post-revaluation',
          assetId,
          requestKey:
            crypto.randomUUID(),
          revaluationDate:
            revaluation.date,
          fairValue:
            revaluation.fairValue,
          reason:
            revaluation.reason,
        },
        'Revaluation posted',
        value =>
          'Change ' +
          amount(
            value.change,
          ) +
          '; carrying value ' +
          amount(
            value.carryingValue,
          ) +
          '.',
      );

    if (
      result
    ) {
      setRevaluation({
        date:
          today(),
        fairValue:
          '',
        reason:
          '',
      });
    }
  }

  function postDisposal(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute ||
      !assetId
    ) {
      return;
    }

    confirmAction({
      title:
        'Dispose selected asset?',
      message:
        'SaMi will derecognize the asset and its contra balances, recognize proceeds, and post any disposal gain or loss. The journal can be reversed later.',
      confirmLabel:
        'Post disposal',
      onConfirm:
        () =>
          void run(
            'disposal',
            {
              action:
                'dispose',
              assetId,
              requestKey:
                crypto.randomUUID(),
              disposalDate:
                disposal.date,
              disposalMethod:
                disposal.method,
              proceeds:
                disposal.proceeds,
              proceedsAccountId:
                Number(
                  disposal.proceeds ||
                  0,
                ) >
                  0
                  ? disposal
                      .proceedsAccountId
                  : null,
              notes:
                disposal.notes,
            },
            'Asset disposal posted',
            value =>
              'Disposal gain/loss: ' +
              amount(
                value.gainLoss,
              ) +
              '.',
          ),
    });
  }

  async function linkVendorBill(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute ||
      !assetId ||
      !vendorBillId
    ) {
      return;
    }

    const result =
      await run(
        'vendor-bill',
        {
          action:
            'link-vendor-bill',
          assetId,
          documentId:
            vendorBillId,
        },
        'Vendor bill linked',
        value =>
          'Linked ' +
          String(
            value.documentNumber ||
            'vendor bill',
          ) +
          ' for ' +
          amount(
            value.amount,
          ) +
          '.',
      );

    if (
      result
    ) {
      setVendorBillId(
        '',
      );
    }
  }

  async function linkSource(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !canExecute ||
      !assetId
    ) {
      return;
    }

    const result =
      await run(
        'source',
        {
          action:
            'link-source',
          assetId,
          sourceModule:
            source.module,
          sourceType:
            source.type,
          sourceId:
            source.id,
          sourceReference:
            source.reference,
          sourceAmount:
            source.amount,
        },
        'Source evidence linked',
        () =>
          'The source document is now linked to this asset without duplicating the source transaction.',
      );

    if (
      result
    ) {
      setSource({
        ...source,
        id:
          '',
        reference:
          '',
        amount:
          '',
      });
    }
  }

  function reverse(
    key:
      string,
    action:
      string,
    idKey:
      string,
    id:
      string,
    title:
      string,
  ) {
    confirmAction({
      title,
      message:
        'SaMi will create a linked compensating Accounting journal. Original evidence remains immutable.',
      confirmLabel:
        'Post reversal',
      onConfirm:
        () =>
          void run(
            key +
              ':' +
              id,
            {
              action,
              [idKey]:
                id,
              reversalDate:
                today(),
            },
            title.replace(
              '?',
              '',
            ),
            value =>
              'Compensating journal ' +
              String(
                value.journalId ||
                '',
              ) +
              ' was posted.',
          ),
    });
  }

  function reverseCapitalization() {
    if (
      !selectedAsset
    ) {
      return;
    }

    reverse(
      'reverse-cap',
      'reverse-capitalization',
      'assetId',
      String(
        selectedAsset.id,
      ),
      'Reverse capitalization?',
    );
  }

  return (
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
            Lifecycle accounting
          </div>
          <h3>
            Impairment, revaluation, disposal & provenance
          </h3>
          <p>
            Post value-changing events through controlled services and retain immutable source and reversal evidence.
          </p>
        </div>

        <Scale
          size={20}
        />
      </div>

      <div
        className={
          styles.grid
        }
      >
        <label>
          Selected active asset
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
          >
            <option value="">
              Choose capitalized asset
            </option>
            {activeAssets.map(
              asset => (
                <option
                  key={
                    String(
                      asset.id,
                    )
                  }
                  value={
                    String(
                      asset.id,
                    )
                  }
                >
                  {String(
                    asset.asset_code ||
                    '',
                  )} · {String(
                    asset.name ||
                    '',
                  )} · carrying {amount(
                    asset.carrying_value,
                  )}
                </option>
              ),
            )}
          </select>
        </label>

        {selectedAsset ? (
          <>
            <div
              className={
                styles.notice
              }
            >
              <strong>
                {String(
                  selectedAsset.asset_code ||
                  '',
                )}
              </strong>
              <div>
                Carrying value {amount(
                  selectedAsset.carrying_value,
                )}
              </div>
            </div>

            <button
              type="button"
              className={
                styles.button
              }
              disabled={
                !canExecute ||
                busy ===
                  'reverse-cap:' +
                  String(
                    selectedAsset.id,
                  )
              }
              onClick={
                reverseCapitalization
              }
            >
              <Undo2
                size={15}
              />
              Reverse capitalization
            </button>
          </>
        ) : null}
      </div>

      <details
        className={
          styles.details
        }
      >
        <summary>
          Impairment
        </summary>

        <form
          className={
            styles.grid
          }
          onSubmit={
            postImpairment
          }
        >
          <label>
            Impairment date
            <input
              type="date"
              required
              value={
                impairment.date
              }
              onChange={
                event =>
                  setImpairment({
                    ...impairment,
                    date:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Impairment amount
            <input
              inputMode="decimal"
              required
              value={
                impairment.amount
              }
              onChange={
                event =>
                  setImpairment({
                    ...impairment,
                    amount:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Reason
            <input
              required
              value={
                impairment.reason
              }
              onChange={
                event =>
                  setImpairment({
                    ...impairment,
                    reason:
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
              !assetId ||
              busy ===
                'impairment'
            }
          >
            <ShieldAlert
              size={15}
            />
            Post impairment
          </button>
        </form>
      </details>

      <details
        className={
          styles.details
        }
      >
        <summary>
          Revaluation
        </summary>

        <form
          className={
            styles.grid
          }
          onSubmit={
            postRevaluation
          }
        >
          <label>
            Revaluation date
            <input
              type="date"
              required
              value={
                revaluation.date
              }
              onChange={
                event =>
                  setRevaluation({
                    ...revaluation,
                    date:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Fair value
            <input
              inputMode="decimal"
              required
              value={
                revaluation
                  .fairValue
              }
              onChange={
                event =>
                  setRevaluation({
                    ...revaluation,
                    fairValue:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Valuation reason
            <input
              required
              value={
                revaluation.reason
              }
              onChange={
                event =>
                  setRevaluation({
                    ...revaluation,
                    reason:
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
              !assetId ||
              busy ===
                'revaluation'
            }
          >
            <RefreshCcw
              size={15}
            />
            Post revaluation
          </button>
        </form>
      </details>

      <details
        className={
          styles.details
        }
      >
        <summary>
          Disposal
        </summary>

        <form
          className={
            styles.grid
          }
          onSubmit={
            postDisposal
          }
        >
          <label>
            Disposal date
            <input
              type="date"
              required
              value={
                disposal.date
              }
              onChange={
                event =>
                  setDisposal({
                    ...disposal,
                    date:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Method
            <select
              value={
                disposal.method
              }
              onChange={
                event =>
                  setDisposal({
                    ...disposal,
                    method:
                      event.target
                        .value,
                  })
              }
            >
              <option value="sale">
                Sale
              </option>
              <option value="scrap">
                Scrap
              </option>
              <option value="donation">
                Donation
              </option>
              <option value="write_off">
                Write-off
              </option>
              <option value="other">
                Other
              </option>
            </select>
          </label>

          <label>
            Proceeds
            <input
              inputMode="decimal"
              required
              value={
                disposal.proceeds
              }
              onChange={
                event =>
                  setDisposal({
                    ...disposal,
                    proceeds:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Proceeds account
            <select
              value={
                disposal
                  .proceedsAccountId
              }
              onChange={
                event =>
                  setDisposal({
                    ...disposal,
                    proceedsAccountId:
                      event.target
                        .value,
                  })
              }
            >
              <option value="">
                None for zero proceeds
              </option>
              {cashAccounts.map(
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
                      account.code ||
                      '',
                    )} · {String(
                      account.name ||
                      '',
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
                disposal.notes
              }
              onChange={
                event =>
                  setDisposal({
                    ...disposal,
                    notes:
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
              !assetId ||
              busy ===
                'disposal'
            }
          >
            <Trash2
              size={15}
            />
            Post disposal
          </button>
        </form>
      </details>

      <details
        className={
          styles.details
        }
      >
        <summary>
          Source document provenance
        </summary>

        <form
          className={
            styles.inlineForm
          }
          onSubmit={
            linkVendorBill
          }
        >
          <label>
            Available posted vendor bill
            <select
              value={
                vendorBillId
              }
              onChange={
                event =>
                  setVendorBillId(
                    event.target
                      .value,
                  )
              }
            >
              <option value="">
                Choose posted bill
              </option>
              {data.sourceCandidates.map(
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
                      row.document_number ||
                      '',
                    )} · {String(
                      row.vendor_name ||
                      '',
                    )} · {amount(
                      row.base_total_amount,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <button
            type="submit"
            className={
              styles.primary
            }
            disabled={
              !canExecute ||
              !assetId ||
              !vendorBillId ||
              busy ===
                'vendor-bill'
            }
          >
            <FileLink2
              size={15}
            />
            Link posted bill
          </button>
        </form>

        <div
          className={
            styles.notice
          }
        >
          Use the posted-bill selector when the acquisition exists in Accounting. Manual evidence below is reserved for external or legacy sources.
        </div>

        <form
          className={
            styles.grid
          }
          onSubmit={
            linkSource
          }
        >
          <label>
            Source module
            <select
              value={
                source.module
              }
              onChange={
                event =>
                  setSource({
                    ...source,
                    module:
                      event.target
                        .value,
                  })
              }
            >
              <option value="purchase">
                Purchase
              </option>
              <option value="accounting">
                Accounting
              </option>
              <option value="expenses">
                Expenses
              </option>
              <option value="inventory">
                Inventory
              </option>
              <option value="manual">
                Manual evidence
              </option>
            </select>
          </label>

          <label>
            Source type
            <input
              required
              value={
                source.type
              }
              onChange={
                event =>
                  setSource({
                    ...source,
                    type:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Source ID
            <input
              required
              value={
                source.id
              }
              onChange={
                event =>
                  setSource({
                    ...source,
                    id:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Reference
            <input
              value={
                source.reference
              }
              onChange={
                event =>
                  setSource({
                    ...source,
                    reference:
                      event.target
                        .value,
                  })
              }
            />
          </label>

          <label>
            Source amount
            <input
              inputMode="decimal"
              value={
                source.amount
              }
              onChange={
                event =>
                  setSource({
                    ...source,
                    amount:
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
              !assetId ||
              busy ===
                'source'
            }
          >
            <FileLink2
              size={15}
            />
            Link evidence
          </button>
        </form>
      </details>

      <details
        className={
          styles.details
        }
        open
      >
        <summary>
          Recent lifecycle postings
        </summary>

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
                  Type
                </th>
                <th>
                  Asset
                </th>
                <th>
                  Date
                </th>
                <th>
                  Amount / value
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
              {data.depreciationEntries.map(
                row => (
                  <tr key={'dep:' + String(row.id)}>
                    <td>Depreciation</td>
                    <td>{assetLabel(row.asset_id)}</td>
                    <td>{String(row.period_date || '')}</td>
                    <td>{amount(row.depreciation_amount)}</td>
                    <td>
                      <span className={styles.status}>
                        {String(row.status || '')}
                      </span>
                    </td>
                    <td>
                      {[
                        'active',
                        'posted',
                      ].includes(String(row.status)) &&
                      !row.reversal_journal_id ? (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={!canExecute}
                          onClick={() =>
                            reverse(
                              'reverse-dep',
                              'reverse-depreciation',
                              'entryId',
                              String(row.id),
                              'Reverse depreciation?',
                            )
                          }
                        >
                          <Undo2 size={14} />
                          Reverse
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}

              {data.impairments.map(
                row => (
                  <tr
                    key={
                      'imp:' +
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      Impairment
                    </td>
                    <td>
                      {assetLabel(
                        row.asset_id,
                      )}
                    </td>
                    <td>
                      {String(
                        row.impairment_date ||
                        '',
                      )}
                    </td>
                    <td>
                      {amount(
                        row.impairment_amount,
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          styles.status
                        }
                      >
                        {String(
                          row.status ||
                          '',
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.status,
                      ) ===
                        'posted' &&
                      !row
                        .reversal_journal_id ? (
                        <button
                          type="button"
                          className={
                            styles.button
                          }
                          disabled={
                            !canExecute
                          }
                          onClick={
                            () =>
                              reverse(
                                'reverse-imp',
                                'reverse-impairment',
                                'impairmentId',
                                String(
                                  row.id,
                                ),
                                'Reverse impairment?',
                              )
                          }
                        >
                          <Undo2
                            size={14}
                          />
                          Reverse
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}

              {data.revaluations.map(
                row => (
                  <tr
                    key={
                      'rev:' +
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      Revaluation
                    </td>
                    <td>
                      {assetLabel(
                        row.asset_id,
                      )}
                    </td>
                    <td>
                      {String(
                        row.revaluation_date ||
                        '',
                      )}
                    </td>
                    <td>
                      {amount(
                        row.change_amount,
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          styles.status
                        }
                      >
                        {String(
                          row.status ||
                          '',
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.status,
                      ) ===
                        'posted' &&
                      !row
                        .reversal_journal_id ? (
                        <button
                          type="button"
                          className={
                            styles.button
                          }
                          disabled={
                            !canExecute
                          }
                          onClick={
                            () =>
                              reverse(
                                'reverse-rev',
                                'reverse-revaluation',
                                'revaluationId',
                                String(
                                  row.id,
                                ),
                                'Reverse revaluation?',
                              )
                          }
                        >
                          <Undo2
                            size={14}
                          />
                          Reverse
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}

              {data.disposals.map(
                row => (
                  <tr
                    key={
                      'disp:' +
                      String(
                        row.id,
                      )
                    }
                  >
                    <td>
                      Disposal
                    </td>
                    <td>
                      {assetLabel(
                        row.asset_id,
                      )}
                    </td>
                    <td>
                      {String(
                        row.disposal_date ||
                        '',
                      )}
                    </td>
                    <td>
                      Proceeds {amount(
                        row.proceeds,
                      )} · G/L {amount(
                        row.gain_loss,
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          styles.status
                        }
                      >
                        {String(
                          row.status ||
                          '',
                        )}
                      </span>
                    </td>
                    <td>
                      {String(
                        row.status,
                      ) ===
                        'posted' &&
                      !row
                        .reversal_journal_id ? (
                        <button
                          type="button"
                          className={
                            styles.button
                          }
                          disabled={
                            !canExecute
                          }
                          onClick={
                            () =>
                              reverse(
                                'reverse-disp',
                                'reverse-disposal',
                                'disposalId',
                                String(
                                  row.id,
                                ),
                                'Reverse disposal?',
                              )
                          }
                        >
                          <Undo2
                            size={14}
                          />
                          Reverse
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}

              {!data.depreciationEntries
                .length &&
              !data.impairments
                .length &&
              !data.revaluations
                .length &&
              !data.disposals
                .length ? (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                  >
                    No lifecycle postings yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      {data.sourceLinks
        .length ? (
        <details
          className={
            styles.details
          }
        >
          <summary>
            Recent source evidence
          </summary>

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
                    Source
                  </th>
                  <th>
                    Reference
                  </th>
                  <th>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sourceLinks.map(
                  row => (
                    <tr
                      key={
                        String(
                          row.id,
                        )
                      }
                    >
                      <td>
                        {assetLabel(
                          row.asset_id,
                        )}
                      </td>
                      <td>
                        {String(
                          row.source_module ||
                          '',
                        )} · {String(
                          row.source_type ||
                          '',
                        )}
                      </td>
                      <td>
                        {String(
                          row.source_reference ||
                          row.source_id ||
                          '',
                        )}
                      </td>
                      <td>
                        {row.source_amount ==
                          null
                          ? '—'
                          : amount(
                              row.source_amount,
                            )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <SaMiOverlay
        overlay={
          overlay
        }
        onClose={
          closeOverlay
        }
      />
    </section>
  );
}
