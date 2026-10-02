'use client';

import {
  Download,
  FileBarChart2,
  Printer,
  RefreshCw,
} from 'lucide-react';
import {
  useState,
  type FormEvent,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';
import type {
  FixedAssetsReportData,
} from '@/lib/apps/fixed_assets/reports';

import styles from './FixedAssetsControl.module.css';

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

function csvValue(
  value:
    unknown,
) {
  const text =
    String(
      value ??
      '',
    );

  return (
    '"' +
    text.replace(
      /"/g,
      '""',
    ) +
    '"'
  );
}

function downloadCsv(
  filename:
    string,
  rows:
    Array<
      Array<
        unknown
      >
    >,
) {
  const csv =
    rows
      .map(
        row =>
          row
            .map(
              csvValue,
            )
            .join(
              ',',
            ),
      )
      .join(
        '\n',
      );

  const blob =
    new Blob(
      [
        csv,
      ],
      {
        type:
          'text/csv;charset=utf-8',
      },
    );
  const url =
    URL.createObjectURL(
      blob,
    );
  const anchor =
    document.createElement(
      'a',
    );

  anchor.href =
    url;
  anchor.download =
    filename;
  anchor.click();

  URL.revokeObjectURL(
    url,
  );
}

export default function FixedAssetsReports({
  initialData,
}: {
  initialData:
    FixedAssetsReportData;
}) {
  const [
    data,
    setData,
  ] =
    useState(
      initialData,
    );
  const [
    from,
    setFrom,
  ] =
    useState(
      initialData
        .period.from,
    );
  const [
    to,
    setTo,
  ] =
    useState(
      initialData
        .period.to,
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
    showError,
    showSuccess,
    closeOverlay,
  } =
    useSaMiOverlay();

  async function refresh(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    setBusy(
      true,
    );

    try {
      const params =
        new URLSearchParams({
          from,
          to,
        });
      const response =
        await fetch(
          '/api/apps/fixed_assets/reports?' +
          params.toString(),
          {
            cache:
              'no-store',
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
          'Fixed Asset reports could not be refreshed.',
        );
      }

      setData(
        payload.result as
          FixedAssetsReportData,
      );

      showSuccess(
        'Fixed Asset reports refreshed',
        'The roll-forward now reflects the selected journal period.',
      );
    } catch (
      error
    ) {
      showError(
        'Report refresh failed',
        error instanceof
          Error
          ? error.message
          : 'Retry this report.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  function exportRegister() {
    downloadCsv(
      'fixed-assets-register-' +
        data.period.to +
        '.csv',
      [
        [
          'Asset code',
          'Asset name',
          'Category',
          'Acquisition date',
          'Capitalization date',
          'Gross cost',
          'Salvage value',
          'Accumulated depreciation',
          'Accumulated impairment',
          'Revaluation adjustment',
          'Carrying value',
          'Method',
          'Useful life months',
          'Status',
          'Source',
        ],
        ...data.register.map(
          row => [
            row.asset_code,
            row.name,
            row.category_name,
            row.acquisition_date,
            row.capitalization_date,
            row.acquisition_cost,
            row.salvage_value,
            row.accumulated_depreciation,
            row.accumulated_impairment,
            row.revaluation_adjustment,
            row.carrying_value,
            row.depreciation_method,
            row.useful_life_months,
            row.status,
            [
              row.source_module,
              row.source_type,
              row.source_reference,
            ]
              .filter(
                Boolean,
              )
              .join(
                ' · ',
              ),
          ],
        ),
      ],
    );
  }

  function exportMovements() {
    downloadCsv(
      'fixed-assets-movements-' +
        data.period.from +
        '-to-' +
        data.period.to +
        '.csv',
      [
        [
          'Date',
          'Asset code',
          'Asset name',
          'Category',
          'Event',
          'Amount',
          'Journal ID',
        ],
        ...data.movements.map(
          row => [
            row.event_date,
            row.asset_code,
            row.asset_name,
            row.category_name,
            row.event_type,
            row.amount,
            row.journal_id,
          ],
        ),
      ],
    );
  }

  const roll =
    data.rollforward;

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
            Fixed Assets · Reports
          </div>
          <h2>
            Asset roll-forward, register & depreciation schedule
          </h2>
          <p>
            Amounts are reconstructed from posted Fixed Asset lifecycle journals, including compensating reversals.
          </p>
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
              exportMovements
            }
          >
            <Download
              size={15}
            />
            Export movements
          </button>

          <button
            type="button"
            className={
              styles.button
            }
            onClick={
              exportRegister
            }
          >
            <Download
              size={15}
            />
            Export register
          </button>

          <button
            type="button"
            className={
              styles.button
            }
            onClick={
              () =>
                window.print()
            }
          >
            <Printer
              size={15}
            />
            Print
          </button>
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
            refresh
          }
        >
          <label>
            From
            <input
              type="date"
              value={
                from
              }
              onChange={
                event =>
                  setFrom(
                    event.target
                      .value,
                  )
              }
              required
            />
          </label>

          <label>
            To
            <input
              type="date"
              value={
                to
              }
              onChange={
                event =>
                  setTo(
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
              busy
            }
          >
            <RefreshCw
              size={15}
            />
            {busy
              ? 'Refreshing…'
              : 'Apply period'}
          </button>
        </form>
      </section>

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
            Opening carrying value
          </span>
          <strong>
            {amount(
              roll.opening,
            )}
          </strong>
          <small>
            Before {data.period.from}
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Net period movement
          </span>
          <strong>
            {amount(
              roll.netMovement,
            )}
          </strong>
          <small>
            Additions and value changes
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Depreciation
          </span>
          <strong>
            {amount(
              roll.depreciation,
            )}
          </strong>
          <small>
            Reversals {amount(
              roll.depreciationReversals,
            )}
          </small>
        </div>

        <div
          className={
            styles.card
          }
        >
          <span>
            Closing carrying value
          </span>
          <strong>
            {amount(
              roll.closing,
            )}
          </strong>
          <small>
            Through {data.period.to}
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
              Roll-forward
            </div>
            <h3>
              Carrying-value bridge
            </h3>
          </div>
          <FileBarChart2
            size={20}
          />
        </div>

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
                  Movement
                </th>
                <th>
                  Increase
                </th>
                <th>
                  Decrease
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Opening carrying value
                </td>
                <td>
                  {amount(
                    roll.opening,
                  )}
                </td>
                <td>
                  —
                </td>
              </tr>
              <tr>
                <td>
                  Additions
                </td>
                <td>
                  {amount(
                    roll.additions,
                  )}
                </td>
                <td>
                  —
                </td>
              </tr>
              <tr>
                <td>
                  Capitalization reversals
                </td>
                <td>
                  —
                </td>
                <td>
                  {amount(
                    roll.capitalizationReversals,
                  )}
                </td>
              </tr>
              <tr>
                <td>
                  Depreciation
                </td>
                <td>
                  {amount(
                    roll.depreciationReversals,
                  )}
                </td>
                <td>
                  {amount(
                    roll.depreciation,
                  )}
                </td>
              </tr>
              <tr>
                <td>
                  Impairment
                </td>
                <td>
                  {amount(
                    roll.impairmentReversals,
                  )}
                </td>
                <td>
                  {amount(
                    roll.impairments,
                  )}
                </td>
              </tr>
              <tr>
                <td>
                  Revaluation
                </td>
                <td>
                  {Number(
                    roll.revaluations,
                  ) >
                  0
                    ? amount(
                        roll.revaluations,
                      )
                    : amount(
                        roll.revaluationReversals,
                      )}
                </td>
                <td>
                  {Number(
                    roll.revaluations,
                  ) <
                  0
                    ? amount(
                        Math.abs(
                          Number(
                            roll.revaluations,
                          ),
                        ),
                      )
                    : amount(
                        roll.revaluationReversals,
                      )}
                </td>
              </tr>
              <tr>
                <td>
                  Disposals
                </td>
                <td>
                  {amount(
                    roll.disposalReversals,
                  )}
                </td>
                <td>
                  {amount(
                    roll.disposals,
                  )}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>
                    Closing carrying value
                  </strong>
                </td>
                <td>
                  <strong>
                    {amount(
                      roll.closing,
                    )}
                  </strong>
                </td>
                <td>
                  —
                </td>
              </tr>
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
              Period activity
            </div>
            <h3>
              Journal-dated lifecycle movements
            </h3>
          </div>
        </div>

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
                  Date
                </th>
                <th>
                  Asset
                </th>
                <th>
                  Category
                </th>
                <th>
                  Event
                </th>
                <th>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map(
                (
                  row,
                  index,
                ) => (
                  <tr
                    key={
                      String(
                        row.journal_id ||
                        index,
                      ) +
                      ':' +
                      String(
                        row.event_type ||
                        '',
                      )
                    }
                  >
                    <td>
                      {String(
                        row.event_date ||
                        '',
                      )}
                    </td>
                    <td>
                      <strong>
                        {String(
                          row.asset_code ||
                          '',
                        )}
                      </strong>
                      <div
                        className={
                          styles.muted
                        }
                      >
                        {String(
                          row.asset_name ||
                          '',
                        )}
                      </div>
                    </td>
                    <td>
                      {String(
                        row.category_name ||
                        '',
                      )}
                    </td>
                    <td>
                      {String(
                        row.event_type ||
                        '',
                      ).replaceAll(
                        '_',
                        ' ',
                      )}
                    </td>
                    <td>
                      {amount(
                        row.amount,
                      )}
                    </td>
                  </tr>
                ),
              )}

              {!data.movements
                .length ? (
                <tr>
                  <td
                    colSpan={
                      5
                    }
                  >
                    No posted Fixed Asset movements in this period.
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
              Current snapshot
            </div>
            <h3>
              Category carrying values
            </h3>
          </div>
        </div>

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
                  Category
                </th>
                <th>
                  Assets
                </th>
                <th>
                  Gross cost
                </th>
                <th>
                  Accum. dep.
                </th>
                <th>
                  Impairment
                </th>
                <th>
                  Revaluation
                </th>
                <th>
                  Carrying value
                </th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map(
                row => (
                  <tr
                    key={
                      String(
                        row.category_name,
                      )
                    }
                  >
                    <td>
                      {String(
                        row.category_name ||
                        '',
                      )}
                    </td>
                    <td>
                      {String(
                        row.asset_count ||
                        0,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.gross_cost,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.accumulated_depreciation,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.accumulated_impairment,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.revaluation_adjustment,
                      )}
                    </td>
                    <td>
                      <strong>
                        {amount(
                          row.carrying_value,
                        )}
                      </strong>
                    </td>
                  </tr>
                ),
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
              Depreciation
            </div>
            <h3>
              Remaining schedule
            </h3>
          </div>
        </div>

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
                  Method
                </th>
                <th>
                  Useful life
                </th>
                <th>
                  Posted periods
                </th>
                <th>
                  Remaining
                </th>
                <th>
                  Carrying value
                </th>
                <th>
                  Last depreciation
                </th>
              </tr>
            </thead>
            <tbody>
              {data.schedule.map(
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
                          row.asset_code ||
                          '',
                        )}
                      </strong>
                      <div
                        className={
                          styles.muted
                        }
                      >
                        {String(
                          row.name ||
                          '',
                        )}
                      </div>
                    </td>
                    <td>
                      {String(
                        row.category_name ||
                        '',
                      )}
                    </td>
                    <td>
                      {String(
                        row.depreciation_method ||
                        '',
                      ).replaceAll(
                        '_',
                        ' ',
                      )}
                    </td>
                    <td>
                      {String(
                        row.useful_life_months ||
                        0,
                      )} months
                    </td>
                    <td>
                      {String(
                        row.posted_periods ||
                        0,
                      )}
                    </td>
                    <td>
                      {String(
                        row.remaining_periods ||
                        0,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.carrying_value,
                      )}
                    </td>
                    <td>
                      {String(
                        row.last_depreciation_date ||
                        '—',
                      )}
                    </td>
                  </tr>
                ),
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
              Asset register
            </div>
            <h3>
              Accounting register
            </h3>
          </div>
        </div>

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
                  Impairment
                </th>
                <th>
                  Revaluation
                </th>
                <th>
                  Carrying
                </th>
                <th>
                  Status
                </th>
                <th>
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {data.register.map(
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
                          row.asset_code ||
                          '',
                        )}
                      </strong>
                      <div
                        className={
                          styles.muted
                        }
                      >
                        {String(
                          row.name ||
                          '',
                        )}
                      </div>
                    </td>
                    <td>
                      {String(
                        row.category_name ||
                        '',
                      )}
                    </td>
                    <td>
                      {amount(
                        row.acquisition_cost,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.accumulated_depreciation,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.accumulated_impairment,
                      )}
                    </td>
                    <td>
                      {amount(
                        row.revaluation_adjustment,
                      )}
                    </td>
                    <td>
                      <strong>
                        {amount(
                          row.carrying_value,
                        )}
                      </strong>
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
                      {[
                        row.source_module,
                        row.source_type,
                        row.source_reference,
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(
                          ' · ',
                        ) ||
                        '—'}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

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
