'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import {
  Activity,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CircleCheckBig,
  Columns3,
  Database,
  Download,
  History,
  LayoutDashboard,
  List,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  Trash2,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import WorkspaceTutorial, {
  startWorkspaceTutorial,
  type WorkspaceTutorialStep,
} from '@/app/components/workspace/WorkspaceTutorial';

import type {
  EnterpriseField,
  EnterpriseTable,
  EnterpriseWorkspaceData,
} from '@/lib/apps/enterprise/service';

import {
  getEnterpriseWorkflowTransitions,
} from '@/lib/apps/enterprise/workflow-policy';


type ViewKey =
  | 'overview'
  | 'records'
  | 'reports'
  | 'activity'
  | 'settings';


const TUTORIAL:
  WorkspaceTutorialStep[] = [
    {
      id:
        'overview',
      section:
        'overview',
      title:
        'Understand this app',
      description:
        'Start with the current-company record totals and the business record groups owned by this app.',
    },
    {
      id:
        'records',
      section:
        'records',
      title:
        'Work with records',
      description:
        'Choose a business record group, search recent records, create permitted records and edit records without leaving the workspace.',
      tip:
        'SaMi automatically applies the current workspace, company and module permission boundary.',
    },
    {
      id:
        'reports',
      section:
        'reports',
      title:
        'Review operational coverage',
      description:
        'Use the report view to see which record groups contain data and export a selected register when needed.',
    },
    {
      id:
        'settings',
      section:
        'settings',
      title:
        'Manage app settings',
      description:
        'Settings records are kept separate from normal business records and are shown only when the app owns settings tables.',
      tip:
        'Tutorials can be restarted from the Tutorial button whenever you need them.',
    },
  ];


function displayValue(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return '—';
  }

  if (
    typeof value ===
      'boolean'
  ) {
    return value
      ? 'Yes'
      : 'No';
  }

  if (
    typeof value ===
      'object'
  ) {
    try {
      return JSON.stringify(
        value,
      );
    } catch {
      return '[data]';
    }
  }

  const source =
    String(
      value,
    );

  return source.length >
    110
    ? source.slice(
        0,
        107,
      ) +
      '...'
    : source;
}


function singularLabel(
  value:
    string,
) {
  if (
    value.endsWith(
      'ies',
    )
  ) {
    return value.slice(
      0,
      -3,
    ) +
    'y';
  }

  if (
    value.endsWith(
      's',
    ) &&
    !value.endsWith(
      'ss',
    )
  ) {
    return value.slice(
      0,
      -1,
    );
  }

  return value;
}


function csvValue(
  value:
    unknown,
) {
  const source =
    value ===
      null ||
    value ===
      undefined
      ? ''
      : typeof value ===
          'object'
        ? JSON.stringify(
            value,
          )
        : String(
            value,
          );

  return (
    '"' +
    source
      .replaceAll(
        '"',
        '""',
      ) +
    '"'
  );
}


function exportTable(
  moduleName:
    string,
  table:
    EnterpriseTable,
) {
  const fields =
    [
      ...new Set([
        table.recordKey ||
        '',
        ...table.displayFields,
      ]),
    ]
      .filter(
        Boolean,
      );

  const csv =
    [
      fields
        .map(
          csvValue,
        )
        .join(
          ',',
        ),
      ...table.records.map(
        record =>
          fields
            .map(
              field =>
                csvValue(
                  record[
                    field
                  ],
                ),
            )
            .join(
              ',',
            ),
      ),
    ]
      .join(
        '\n',
      );

  const url =
    URL.createObjectURL(
      new Blob(
        [
          csv,
        ],
        {
          type:
            'text/csv;charset=utf-8',
        },
      ),
    );

  const anchor =
    document.createElement(
      'a',
    );

  anchor.href =
    url;

  anchor.download =
    (
      moduleName +
      '-' +
      table.key +
      '-' +
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        )
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        '-',
      ) +
    '.csv';

  document.body
    .appendChild(
      anchor,
    );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}


export default function EnterpriseModuleWorkspaceClient({
  initialData,
  userId,
}: {
  initialData:
    EnterpriseWorkspaceData;
  userId:
    string;
}) {
  const router =
    useRouter();

  const [
    view,
    setView,
  ] =
    useState<ViewKey>(
      'overview',
    );

  const recordTables =
    useMemo(
      () =>
        initialData.tables
          .filter(
            table =>
              !table.settingTable,
          ),
      [
        initialData.tables,
      ],
    );

  const settingTables =
    useMemo(
      () =>
        initialData.tables
          .filter(
            table =>
              table.settingTable,
          ),
      [
        initialData.tables,
      ],
    );

  const [
    selectedTableKey,
    setSelectedTableKey,
  ] =
    useState(
      recordTables[0]
        ?.key ||
      initialData.tables[0]
        ?.key ||
      '',
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const [
    recordPages,
    setRecordPages,
  ] =
    useState<
      Record<
        string,
        {
          records:
            Array<
              Record<
                string,
                unknown
              >
            >;
          total:
            number;
          page:
            number;
          hasMore:
            boolean;
          query:
            string;
        }
      >
    >(
      {},
    );

  const [
    editor,
    setEditor,
  ] =
    useState<{
      tableKey: string;
      record:
        Record<
          string,
          unknown
        > |
        null;
      idempotencyKey:
        string |
        null;
    } | null>(
      null,
    );

  const [
    requestBusy,
    setRequestBusy,
  ] =
    useState(
      false,
    );

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const requestInFlight =
    useRef(
      false,
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    showWarning,
    confirmAction,
  } =
    useSaMiOverlay();

  const busy =
    requestBusy ||
    pending;

  const selectedTable =
    initialData.tables
      .find(
        table =>
          table.key ===
          selectedTableKey,
      ) ||
    (
      view ===
        'settings'
        ? settingTables[0]
        : recordTables[0]
    ) ||
    initialData.tables[0] ||
    null;

  const selectedPage =
    selectedTable
      ? recordPages[
          selectedTable.key
        ]
      : undefined;

  const visibleRecords =
    useMemo(
      () => {
        if (
          !selectedTable
        ) {
          return [];
        }

        if (
          selectedPage
        ) {
          return selectedPage
            .records;
        }

        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return selectedTable
            .records;
        }

        return selectedTable
          .records
          .filter(
            record =>
              selectedTable
                .displayFields
                .some(
                  field =>
                    displayValue(
                      record[
                        field
                      ],
                    )
                      .toLowerCase()
                      .includes(
                        query,
                      ),
                ),
          );
      },
      [
        search,
        selectedPage,
        selectedTable,
      ],
    );

  const tutorialSteps =
    useMemo(
      () =>
        TUTORIAL.filter(
          step =>
            step.section !==
              'settings' ||
            settingTables.length >
              0,
        ),
      [
        settingTables.length,
      ],
    );

  const handleTutorialStep =
    (
      step:
        WorkspaceTutorialStep,
    ) => {
      const section =
        step.section as
          ViewKey |
          undefined;

      if (
        section
      ) {
        setView(
          section,
        );

        if (
          section ===
            'settings' &&
          settingTables[0]
        ) {
          setSelectedTableKey(
            settingTables[0]
              .key,
          );
        }

        if (
          section ===
            'records' &&
          recordTables[0]
        ) {
          setSelectedTableKey(
            recordTables[0]
              .key,
          );
        }
      }
    };

  async function request(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    if (
      requestInFlight
        .current
    ) {
      throw new Error(
        'Another app action is still being saved.',
      );
    }

    requestInFlight
      .current =
      true;

    setRequestBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            initialData
              .module
              .key,
          ) +
          '/records',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            success?:
              boolean;
            error?:
              string;
            result?:
              Record<
                string,
                unknown
              >;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not complete this app action.',
        );
      }

      startTransition(
        () => {
          router.refresh();
        },
      );

      return body.result ||
        {};
    } finally {
      requestInFlight
        .current =
        false;

      setRequestBusy(
        false,
      );
    }
  }

  async function queryTableRecords(
    table:
      EnterpriseTable,
    reset:
      boolean,
  ) {
    try {
      const current =
        recordPages[
          table.key
        ];

      const result =
        await request({
          action:
            'list',
          table:
            table.key,
          query:
            search,
          page:
            reset
              ? 1
              : (
                  current
                    ?.page ||
                  1
                ) +
                1,
          pageSize:
            50,
        });

      const records =
        Array.isArray(
          result.records,
        )
          ? result.records as
              Array<
                Record<
                  string,
                  unknown
                >
              >
          : [];

      setRecordPages(
        previous => ({
          ...previous,
          [
            table.key
          ]: {
            records:
              reset
                ? records
                : [
                    ...(
                      previous[
                        table.key
                      ]
                        ?.records ||
                      []
                    ),
                    ...records,
                  ],
            total:
              Number(
                result.total ||
                0,
              ),
            page:
              Number(
                result.page ||
                1,
              ),
            hasMore:
              Boolean(
                result.hasMore,
              ),
            query:
              String(
                result.query ||
                '',
              ),
          },
        }),
      );
    } catch (
      error
    ) {
      showError(
        'Records could not be loaded',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not load this register.',
      );
    }
  }


  async function saveRecord(
    table:
      EnterpriseTable,
    record:
      Record<
        string,
        unknown
      > |
      null,
    values:
      Record<
        string,
        unknown
      >,
  ) {
    try {
      const recordId =
        record &&
        table.recordKey
          ? record[
              table.recordKey
            ]
          : undefined;

      await request({
        action:
          record
            ? 'update'
            : 'create',
        table:
          table.key,
        recordId,
        idempotencyKey:
          record
            ? undefined
            : editor
                ?.idempotencyKey,
        values,
      });

      setEditor(
        null,
      );

      setRecordPages(
        previous => {
          const nextPages =
            {
              ...previous,
            };

          delete nextPages[
            table.key
          ];

          return nextPages;
        },
      );

      showSuccess(
        record
          ? 'Record updated'
          : 'Record created',
        table.label +
        (
          record
            ? ' was updated successfully.'
            : ' was created successfully.'
        ),
      );

      return true;
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save this record.';

      if (
        message.includes(
          'still being saved',
        )
      ) {
        showWarning(
          'Action already in progress',
          message,
        );
      } else {
        showError(
          'Record could not be saved',
          message,
        );
      }

      return false;
    }
  }

  async function deleteRecord(
    table:
      EnterpriseTable,
    record:
      Record<
        string,
        unknown
      >,
  ) {
    if (
      !table.recordKey
    ) {
      return;
    }

    const recordId =
      record[
        table.recordKey
      ];

    confirmAction({
      title:
        'Delete this record?',
      message:
        'SaMi will use the module safe-delete field. The record remains protected from cross-company access.',
      confirmLabel:
        'Delete record',
      onConfirm:
        () => {
          void (
            async () => {
              try {
                await request({
                  action:
                    'delete',
                  table:
                    table.key,
                  recordId,
                });

                setRecordPages(
                  previous => {
                    const nextPages =
                      {
                        ...previous,
                      };

                    delete nextPages[
                      table.key
                    ];

                    return nextPages;
                  },
                );

                showSuccess(
                  'Record deleted',
                  table.label +
                  ' was removed from the active register.',
                );
              } catch (
                error
              ) {
                showError(
                  'Record could not be deleted',
                  error instanceof
                    Error
                    ? error.message
                    : 'SaMi could not delete this record.',
                );
              }
            }
          )();
        },
    });
  }

  function transitionRecord(
    table:
      EnterpriseTable,
    record:
      Record<
        string,
        unknown
      >,
    statusField:
      string,
    nextStatus:
      string,
  ) {
    if (
      !table.recordKey
    ) {
      return;
    }

    const recordId =
      String(
        record[
          table.recordKey
        ] ||
        '',
      );

    if (
      !recordId
    ) {
      return;
    }

    confirmAction({
      title:
        'Change workflow state?',
      message:
        'SaMi will validate the transition on the server, apply domain rules and add it to the audit history.',
      confirmLabel:
        'Change state',
      onConfirm:
        () => {
          void (
            async () => {
              try {
                await request({
                  action:
                    'transition',
                  table:
                    table.key,
                  recordId,
                  statusField,
                  nextStatus,
                });

                setRecordPages(
                  previous => {
                    const nextPages =
                      {
                        ...previous,
                      };

                    delete nextPages[
                      table.key
                    ];

                    return nextPages;
                  },
                );

                showSuccess(
                  'Workflow updated',
                  table.label +
                  ' moved to ' +
                  nextStatus
                    .replaceAll(
                      '_',
                      ' ',
                    ) +
                  '.',
                );
              } catch (
                error
              ) {
                showError(
                  'Workflow could not be updated',
                  error instanceof
                    Error
                    ? error.message
                    : 'SaMi could not change this workflow state.',
                );
              }
            }
          )();
        },
    });
  }


  const nav:
    Array<{
      key:
        ViewKey;
      label:
        string;
      icon:
        typeof Database;
      visible:
        boolean;
    }> = [
      {
        key:
          'overview',
        label:
          'Overview',
        icon:
          LayoutDashboard,
        visible:
          true,
      },
      {
        key:
          'records',
        label:
          initialData
            .profile
            .navigationLabel,
        icon:
          Table2,
        visible:
          recordTables.length >
          0,
      },
      {
        key:
          'reports',
        label:
          'Reports',
        icon:
          BarChart3,
        visible:
          initialData
            .capabilities
            .canReport,
      },
      {
        key:
          'activity',
        label:
          'Activity',
        icon:
          History,
        visible:
          true,
      },
      {
        key:
          'settings',
        label:
          'Settings',
        icon:
          Settings2,
        visible:
          settingTables.length >
            0 &&
          initialData
            .capabilities
            .canManageSettings,
      },
    ];

  return (
    <>
      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />

      <WorkspaceTutorial
        userId={
          userId
        }
        moduleKey={
          initialData
            .module
            .key
        }
        title={
          initialData
            .module
            .name +
          ' tutorial'
        }
        steps={
          tutorialSteps
        }
        onStepChange={
          handleTutorialStep
        }
      />

      <div className="space-y-4">
        <section className="sami-surface overflow-hidden rounded-[26px]">
          <div className="flex flex-col gap-4 border-b border-[var(--sami-border)] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
                {
                  initialData
                    .company
                    .name
                }
              </p>

              <h1 className="mt-1 text-xl font-black tracking-[-0.03em] sm:text-2xl">
                {
                  initialData
                    .module
                    .name
                }
              </h1>

              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                {
                  initialData
                    .module
                    .description
                }
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  () =>
                    startWorkspaceTutorial(
                      userId,
                      initialData
                        .module
                        .key,
                    )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <BookOpenCheck className="h-4 w-4 text-blue-600" />
                Tutorial
              </button>

              <button
                type="button"
                disabled={
                  busy
                }
                onClick={
                  () =>
                    startTransition(
                      () => {
                        router.refresh();
                      },
                    )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
              >
                <RefreshCw
                  className={[
                    'h-4 w-4',
                    pending
                      ? 'animate-spin'
                      : '',
                  ].join(
                    ' ',
                  )}
                />
                Refresh
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto p-3">
            {
              nav
                .filter(
                  item =>
                    item.visible,
                )
                .map(
                  item => {
                    const Icon =
                      item.icon;

                    return (
                      <button
                        key={
                          item.key
                        }
                        type="button"
                        onClick={
                          () => {
                            setView(
                              item.key,
                            );

                            if (
                              item.key ===
                                'records' &&
                              recordTables[0]
                            ) {
                              setSelectedTableKey(
                                recordTables[0]
                                  .key,
                              );
                            }

                            if (
                              item.key ===
                                'settings' &&
                              settingTables[0]
                            ) {
                              setSelectedTableKey(
                                settingTables[0]
                                  .key,
                              );
                            }
                          }
                        }
                        className={[
                          'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-black',
                          view ===
                            item.key
                            ? 'bg-blue-600 text-white'
                            : 'border border-[var(--sami-border)]',
                        ].join(
                          ' ',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {
                          item.label
                        }
                      </button>
                    );
                  },
                )
            }
          </div>
        </section>

        {
          view ===
            'overview' &&
          (
            <Overview
              data={
                initialData
              }
              onOpenTable={
                table => {
                  setSelectedTableKey(
                    table.key,
                  );

                  setView(
                    table.settingTable
                      ? 'settings'
                      : 'records',
                  );
                }
              }
            />
          )
        }

        {
          (
            view ===
              'records' ||
            view ===
              'settings'
          ) &&
          (
            <Records
              moduleKey={
                initialData
                  .module
                  .key
              }
              tables={
                view ===
                  'settings'
                  ? settingTables
                  : recordTables
              }
              selected={
                selectedTable
              }
              search={
                search
              }
              setSearch={
                setSearch
              }
              records={
                visibleRecords
              }
              totalRecords={
                selectedPage
                  ?.total ||
                selectedTable
                  ?.count ||
                0
              }
              hasMore={
                selectedPage
                  ?.hasMore ||
                false
              }
              busy={
                busy
              }
              canCreate={
                initialData
                  .capabilities
                  .canCreate
              }
              canEdit={
                initialData
                  .capabilities
                  .canEdit
              }
              canDelete={
                initialData
                  .capabilities
                  .canDelete
              }
              onSelect={
                table =>
                  setSelectedTableKey(
                    table.key,
                  )
              }
              onCreate={
                table =>
                  setEditor({
                    tableKey:
                      table.key,
                    record:
                      null,
                    idempotencyKey:
                      globalThis.crypto
                        .randomUUID(),
                  })
              }
              onEdit={
                (
                  table,
                  record,
                ) =>
                  setEditor({
                    tableKey:
                      table.key,
                    record,
                    idempotencyKey:
                      null,
                  })
              }
              onDelete={
                deleteRecord
              }
              onTransition={
                transitionRecord
              }
              onExport={
                table =>
                  exportTable(
                    initialData
                      .module
                      .name,
                    table,
                  )
              }
              onSearchAll={
                table =>
                  void queryTableRecords(
                    table,
                    true,
                  )
              }
              onLoadMore={
                table =>
                  void queryTableRecords(
                    table,
                    false,
                  )
              }
            />
          )
        }

        {
          view ===
            'reports' &&
          initialData
            .capabilities
            .canReport &&
          (
            <Reports
              data={
                initialData
              }
              onOpen={
                table => {
                  setSelectedTableKey(
                    table.key,
                  );
                  setView(
                    table.settingTable
                      ? 'settings'
                      : 'records',
                  );
                }
              }
            />
          )
        }

        {
          view ===
            'activity' &&
          (
            <ModuleActivity
              data={
                initialData
              }
            />
          )
        }
      </div>

      {
        editor &&
        (
          <RecordEditor
            moduleKey={
              initialData
                .module
                .key
            }
            table={
              initialData.tables
                .find(
                  table =>
                    table.key ===
                    editor.tableKey,
                ) ||
              null
            }
            record={
              editor.record
            }
            busy={
              busy
            }
            onClose={
              () =>
                setEditor(
                  null,
                )
            }
            onSave={
              saveRecord
            }
          />
        )
      }
    </>
  );
}


function Overview({
  data,
  onOpenTable,
}: {
  data:
    EnterpriseWorkspaceData;
  onOpenTable:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
}) {
  const primaryTable =
    data.tables.find(
      table =>
        table.key ===
          data.profile
            .primaryTable,
    ) ||
    data.tables.find(
      table =>
        !table.settingTable,
    ) ||
    null;

  const quickStarts =
    data.profile
      .quickStartTables
      .map(
        tableKey =>
          data.tables.find(
            table =>
              table.key ===
              tableKey,
          ),
      )
      .filter(
        (
          table,
        ): table is
          EnterpriseTable =>
          Boolean(
            table,
          ),
      );

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={
            data.profile
              .primaryLabel
          }
          value={
            String(
              data.metrics
                .primaryRecords,
            )
          }
          note="primary operating register"
          icon={
            Activity
          }
        />

        <Metric
          label="Needs attention"
          value={
            String(
              data.metrics
                .attentionRecords,
            )
          }
          note="open or exception workflow states"
          icon={
            TriangleAlert
          }
        />

        <Metric
          label="Completed"
          value={
            String(
              data.metrics
                .successRecords,
            )
          }
          note="successful workflow states"
          icon={
            CircleCheckBig
          }
        />

        <Metric
          label="All records"
          value={
            String(
              data.metrics
                .totalRecords,
            )
          }
          note={
            data.metrics
              .workflowTrackedRecords >
            0
              ? (
                  data.metrics
                    .workflowTrackedRecords +
                  ' workflow-tracked'
                )
              : 'current company data'
          }
          icon={
            Database
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
                {
                  data.profile
                    .domain
                    .replaceAll(
                      '_',
                      ' ',
                    )
                }
                {' · Operating focus'}
              </p>

              <h2 className="mt-2 text-base font-black tracking-[-0.02em]">
                {
                  data.profile
                    .focus
                }
              </h2>

              <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {
                  data.profile
                    .operatingModel
                }
              </p>
            </div>

            {
              primaryTable &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      onOpenTable(
                        primaryTable,
                      )
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white"
                >
                  <Workflow className="h-4 w-4" />
                  Open {
                    singularLabel(
                      primaryTable
                        .label,
                    )
                  }
                </button>
              )
            }
          </div>

          {
            quickStarts.length >
              0 &&
            (
              <div className="mt-5 border-t border-[var(--sami-border)] pt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Quick start
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {
                    quickStarts.map(
                      table => (
                        <button
                          key={
                            table.key
                          }
                          type="button"
                          onClick={
                            () =>
                              onOpenTable(
                                table,
                              )
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-3 text-left transition hover:bg-slate-500/[0.03]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-black">
                              {
                                table.label
                              }
                            </span>
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:text-blue-300">
                              {
                                table.count
                              }
                            </span>
                          </div>

                          <p className="mt-2 text-[11px] leading-4 text-slate-500">
                            {
                              table.workflows
                                .length >
                                0
                                ? 'Workflow-enabled register'
                                : table.settingTable
                                  ? 'Configuration register'
                                  : 'Operational register'
                            }
                          </p>
                        </button>
                      ),
                    )
                  }
                </div>
              </div>
            )
          }
        </div>

        <div className="sami-soft-surface rounded-[24px] p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Operating health
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-500">
                Active registers
              </span>
              <span className="text-sm font-black">
                {
                  data.metrics
                    .activeTables
                }
                {' / '}
                {
                  data.metrics
                    .tables
                }
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-500">
                Workflow tracked
              </span>
              <span className="text-sm font-black">
                {
                  data.metrics
                    .workflowTrackedRecords
                }
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-500">
                Attention queue
              </span>
              <span className="text-sm font-black">
                {
                  data.metrics
                    .attentionRecords
                }
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold text-slate-500">
                Successful states
              </span>
              <span className="text-sm font-black">
                {
                  data.metrics
                    .successRecords
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="sami-surface rounded-[24px] p-4">
        <div>
          <h2 className="text-sm font-black">
            Operational registers
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            These are the code-owned business registers for this app. Company boundaries, permissions, workflows and safe-delete rules are enforced server-side.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {
            data.tables.map(
              table => (
                <button
                  key={
                    table.key
                  }
                  type="button"
                  onClick={
                    () =>
                      onOpenTable(
                        table,
                      )
                  }
                  className="rounded-2xl border border-[var(--sami-border)] p-4 text-left transition hover:-translate-y-0.5 hover:bg-slate-500/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">
                        {
                          table.label
                        }
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {
                          table.companyScoped
                            ? 'Current company'
                            : 'Workspace scoped'
                        }
                        {
                          table.settingTable
                            ? ' · Settings'
                            : table.workflows
                                .length >
                                0
                              ? ' · Workflow'
                              : ''
                        }
                      </p>
                    </div>

                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-black text-blue-700 dark:text-blue-300">
                      {
                        table.count
                      }
                    </span>
                  </div>
                </button>
              ),
            )
          }
        </div>
      </div>
    </section>
  );
}

function Records({
  moduleKey,
  tables,
  selected,
  search,
  setSearch,
  records,
  totalRecords,
  hasMore,
  busy,
  canCreate,
  canEdit,
  canDelete,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onTransition,
  onExport,
  onSearchAll,
  onLoadMore,
}: {
  moduleKey:
    string;
  tables:
    EnterpriseTable[];
  selected:
    EnterpriseTable |
    null;
  search:
    string;
  setSearch:
    (
      value:
        string,
    ) =>
      void;
  records:
    Array<
      Record<
        string,
        unknown
      >
    >;
  totalRecords:
    number;
  hasMore:
    boolean;
  busy:
    boolean;
  canCreate:
    boolean;
  canEdit:
    boolean;
  canDelete:
    boolean;
  onSelect:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
  onCreate:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
  onEdit:
    (
      table:
        EnterpriseTable,
      record:
        Record<
          string,
          unknown
        >,
    ) =>
      void;
  onDelete:
    (
      table:
        EnterpriseTable,
      record:
        Record<
          string,
          unknown
        >,
    ) =>
      void;
  onTransition:
    (
      table:
        EnterpriseTable,
      record:
        Record<
          string,
          unknown
        >,
      statusField:
        string,
      nextStatus:
        string,
    ) =>
      void;
  onExport:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
  onSearchAll:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
  onLoadMore:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
}) {
  const [
    recordView,
    setRecordView,
  ] =
    useState<
      'list' |
      'kanban' |
      'calendar'
    >(
      'list',
    );

  useEffect(
    () => {
      setRecordView(
        'list',
      );
    },
    [
      selected?.key,
    ],
  );

  const workflow =
    selected
      ?.workflows[0] ||
    null;

  const dateField =
    selected
      ?.fields
      .find(
        field =>
          (
            field.inputType ===
              'date' ||
            field.inputType ===
              'datetime'
          ) &&
          ![
            'created_at',
            'updated_at',
          ].includes(
            field.key,
          ),
      )
      ?.key ||
    null;

  const kanbanGroups =
    workflow
      ? Object.entries(
          records.reduce<
            Record<
              string,
              Array<
                Record<
                  string,
                  unknown
                >
              >
            >
          >(
            (
              groups,
              record,
            ) => {
              const state =
                String(
                  record[
                    workflow.field
                  ] ||
                  'Unspecified',
                )
                  .trim() ||
                'Unspecified';

              groups[
                state
              ] =
                groups[
                  state
                ] ||
                [];

              groups[
                state
              ].push(
                record,
              );

              return groups;
            },
            {},
          ),
        )
          .sort(
            (
              left,
              right,
            ) =>
              left[0]
                .localeCompare(
                  right[0],
                ),
          )
      : [];

  const calendarGroups =
    dateField
      ? Object.entries(
          records.reduce<
            Record<
              string,
              Array<
                Record<
                  string,
                  unknown
                >
              >
            >
          >(
            (
              groups,
              record,
            ) => {
              const raw =
                record[
                  dateField
                ];

              const timestamp =
                raw
                  ? Date.parse(
                      String(
                        raw,
                      ),
                    )
                  : Number.NaN;

              const day =
                Number.isFinite(
                  timestamp,
                )
                  ? new Date(
                      timestamp,
                    )
                      .toISOString()
                      .slice(
                        0,
                        10,
                      )
                  : 'Unscheduled';

              groups[
                day
              ] =
                groups[
                  day
                ] ||
                [];

              groups[
                day
              ].push(
                record,
              );

              return groups;
            },
            {},
          ),
        )
          .sort(
            (
              left,
              right,
            ) =>
              left[0] ===
                'Unscheduled'
                ? 1
                : right[0] ===
                    'Unscheduled'
                  ? -1
                  : left[0]
                      .localeCompare(
                        right[0],
                      ),
          )
      : [];

  if (
    !selected
  ) {
    return (
      <div className="sami-surface rounded-[24px] p-8 text-center text-sm text-slate-500">
        No record groups are available for this section.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[22px] p-3">
        <div className="flex gap-2 overflow-x-auto">
          {
            tables.map(
              table => (
                <button
                  key={
                    table.key
                  }
                  type="button"
                  onClick={
                    () =>
                      onSelect(
                        table,
                      )
                  }
                  className={[
                    'shrink-0 rounded-xl px-3 py-2 text-xs font-black',
                    selected.key ===
                      table.key
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'border border-[var(--sami-border)]',
                  ].join(
                    ' ',
                  )}
                >
                  {
                    table.label
                  }
                  {' · '}
                  {
                    table.count
                  }
                </button>
              ),
            )
          }
        </div>
      </div>

      <div className="sami-surface rounded-[22px] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black">
              {
                selected.label
              }
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {
                selected.companyScoped
                  ? 'Restricted to the current company.'
                  : 'Stored at workspace scope.'
              }
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] p-1">
              <button
                type="button"
                aria-label="List view"
                onClick={
                  () =>
                    setRecordView(
                      'list',
                    )
                }
                className={[
                  'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black',
                  recordView ===
                    'list'
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : '',
                ].join(
                  ' ',
                )}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>

              {
                workflow &&
                (
                  <button
                    type="button"
                    aria-label="Kanban view"
                    onClick={
                      () =>
                        setRecordView(
                          'kanban',
                        )
                    }
                    className={[
                      'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black',
                      recordView ===
                        'kanban'
                        ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                        : '',
                    ].join(
                      ' ',
                    )}
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                    Kanban
                  </button>
                )
              }

              {
                dateField &&
                (
                  <button
                    type="button"
                    aria-label="Calendar view"
                    onClick={
                      () =>
                        setRecordView(
                          'calendar',
                        )
                    }
                    className={[
                      'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-black',
                      recordView ===
                        'calendar'
                        ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                        : '',
                    ].join(
                      ' ',
                    )}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendar
                  </button>
                )
              }
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={
                  search
                }
                onChange={
                  event =>
                    setSearch(
                      event
                        .target
                        .value,
                    )
                }
                onKeyDown={
                  event => {
                    if (
                      event.key ===
                        'Enter'
                    ) {
                      onSearchAll(
                        selected,
                      );
                    }
                  }
                }
                placeholder="Search this register"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs sm:w-64"
              />
            </label>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  onSearchAll(
                    selected,
                  )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              Search all
            </button>

            <button
              type="button"
              onClick={
                () =>
                  onExport(
                    selected,
                  )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            {
              canCreate &&
              selected
                .supportsCreate &&
              (
                <button
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={
                    () =>
                      onCreate(
                        selected,
                      )
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  New {
                    singularLabel(
                      selected.label,
                    )
                  }
                </button>
              )
            }
          </div>
        </div>
      </div>

      {
        recordView ===
          'list'
          ? (
                    <div className="sami-surface overflow-hidden rounded-[24px]">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left text-sm">
                          <thead className="border-b border-[var(--sami-border)] bg-slate-500/[0.04] text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
                            <tr>
                              {
                                selected
                                  .displayFields
                                  .map(
                                    field => (
                                      <th
                                        key={
                                          field
                                        }
                                        className="px-4 py-3"
                                      >
                                        {
                                          selected
                                            .fields
                                            .find(
                                              item =>
                                                item.key ===
                                                field,
                                            )
                                            ?.label ||
                                          field
                                        }
                                      </th>
                                    ),
                                  )
                              }
              
                              {
                                (
                                  canEdit &&
                                  (
                                    selected
                                      .supportsEdit ||
                                    selected
                                      .workflows
                                      .length >
                                      0
                                  )
                                ) ||
                                (
                                  canDelete &&
                                  selected
                                    .supportsDelete
                                )
                                  ? (
                                      <th className="px-4 py-3 text-right">
                                        Actions
                                      </th>
                                    )
                                  : null
                              }
                            </tr>
                          </thead>
              
                          <tbody className="divide-y divide-[var(--sami-border)]">
                            {
                              records.length ===
                                0
                                ? (
                                    <tr>
                                      <td
                                        colSpan={
                                          selected
                                            .displayFields
                                            .length +
                                          1
                                        }
                                        className="px-4 py-10 text-center text-sm text-slate-500"
                                      >
                                        No records match this view.
                                      </td>
                                    </tr>
                                  )
                                : records.map(
                                    (
                                      record,
                                      index,
                                    ) => (
                                      <tr
                                        key={
                                          selected.recordKey
                                            ? String(
                                                record[
                                                  selected
                                                    .recordKey
                                                ] ??
                                                index,
                                              )
                                            : index
                                        }
                                        className="hover:bg-slate-500/[0.03]"
                                      >
                                        {
                                          selected
                                            .displayFields
                                            .map(
                                              field => (
                                                <td
                                                  key={
                                                    field
                                                  }
                                                  className="max-w-[300px] px-4 py-3 align-top"
                                                >
                                                  <span className="line-clamp-3 text-xs">
                                                    {
                                                      displayValue(
                                                        record[
                                                          field
                                                        ],
                                                      )
                                                    }
                                                  </span>
                                                </td>
                                              ),
                                            )
                                        }
              
                                        {
                                          (
                                            canEdit &&
                                            selected
                                              .supportsEdit
                                          ) ||
                                          (
                                            canDelete &&
                                            selected
                                              .supportsDelete
                                          )
                                            ? (
                                                <td className="px-4 py-3">
                                                  <div className="flex flex-wrap justify-end gap-1">
                                                    {
                                                      canEdit &&
                                                      selected
                                                        .workflows
                                                        .length >
                                                        0 &&
                                                      (
                                                        <WorkflowActions
                                                          moduleKey={
                                                            moduleKey
                                                          }
                                                          table={
                                                            selected
                                                          }
                                                          record={
                                                            record
                                                          }
                                                          disabled={
                                                            busy
                                                          }
                                                          onTransition={
                                                            onTransition
                                                          }
                                                        />
                                                      )
                                                    }
              
                                                    {
                                                      canEdit &&
                                                      selected
                                                        .supportsEdit &&
                                                      (
                                                        <button
                                                          type="button"
                                                          aria-label="Edit record"
                                                          onClick={
                                                            () =>
                                                              onEdit(
                                                                selected,
                                                                record,
                                                              )
                                                          }
                                                          className="rounded-lg p-2 hover:bg-blue-500/10 hover:text-blue-700"
                                                        >
                                                          <Pencil className="h-4 w-4" />
                                                        </button>
                                                      )
                                                    }
              
                                                    {
                                                      canDelete &&
                                                      selected
                                                        .supportsDelete &&
                                                      (
                                                        <button
                                                          type="button"
                                                          aria-label="Delete record"
                                                          onClick={
                                                            () =>
                                                              onDelete(
                                                                selected,
                                                                record,
                                                              )
                                                          }
                                                          className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                                                        >
                                                          <Trash2 className="h-4 w-4" />
                                                        </button>
                                                      )
                                                    }
                                                  </div>
                                                </td>
                                              )
                                            : null
                                        }
                                      </tr>
                                    ),
                                  )
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
            )
          : recordView ===
              'kanban' &&
            workflow
            ? (
                <div className="overflow-x-auto pb-2">
                  <div className="grid min-w-max auto-cols-[300px] grid-flow-col gap-3">
                    {
                      kanbanGroups.length ===
                        0
                        ? (
                            <div className="sami-surface w-[300px] rounded-[22px] p-6 text-sm text-slate-500">
                              No workflow records match this view.
                            </div>
                          )
                        : kanbanGroups.map(
                            ([
                              state,
                              group,
                            ]) => (
                              <div
                                key={
                                  state
                                }
                                className="sami-surface w-[300px] rounded-[22px] p-3"
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-[var(--sami-border)] pb-3">
                                  <span className="text-xs font-black capitalize">
                                    {
                                      state
                                        .replaceAll(
                                          '_',
                                          ' ',
                                        )
                                    }
                                  </span>
                                  <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-black">
                                    {
                                      group.length
                                    }
                                  </span>
                                </div>

                                <div className="mt-3 space-y-2">
                                  {
                                    group.map(
                                      (
                                        record,
                                        index,
                                      ) => (
                                        <button
                                          key={
                                            selected.recordKey
                                              ? String(
                                                  record[
                                                    selected.recordKey
                                                  ] ??
                                                  index,
                                                )
                                              : index
                                          }
                                          type="button"
                                          onClick={
                                            canEdit &&
                                            selected.supportsEdit
                                              ? () =>
                                                  onEdit(
                                                    selected,
                                                    record,
                                                  )
                                              : undefined
                                          }
                                          className="block w-full rounded-2xl border border-[var(--sami-border)] p-3 text-left hover:bg-slate-500/[0.03]"
                                        >
                                          {
                                            selected.displayFields
                                              .slice(
                                                0,
                                                4,
                                              )
                                              .map(
                                                field => (
                                                  <div
                                                    key={
                                                      field
                                                    }
                                                    className="mb-1 last:mb-0"
                                                  >
                                                    <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                                      {
                                                        selected.fields.find(
                                                          item =>
                                                            item.key ===
                                                            field,
                                                        )
                                                          ?.label ||
                                                        field
                                                      }
                                                    </p>
                                                    <p className="mt-0.5 line-clamp-2 text-xs font-semibold">
                                                      {
                                                        displayValue(
                                                          record[
                                                            field
                                                          ],
                                                        )
                                                      }
                                                    </p>
                                                  </div>
                                                ),
                                              )
                                          }
                                        </button>
                                      ),
                                    )
                                  }
                                </div>
                              </div>
                            ),
                          )
                    }
                  </div>
                </div>
              )
            : (
                <div className="space-y-3">
                  {
                    calendarGroups.length ===
                      0
                      ? (
                          <div className="sami-surface rounded-[22px] p-8 text-center text-sm text-slate-500">
                            No scheduled records match this view.
                          </div>
                        )
                      : calendarGroups.map(
                          ([
                            day,
                            group,
                          ]) => (
                            <div
                              key={
                                day
                              }
                              className="sami-surface rounded-[22px] p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <CalendarDays className="h-4 w-4 text-blue-600" />
                                  <h3 className="text-xs font-black">
                                    {
                                      day ===
                                        'Unscheduled'
                                        ? day
                                        : new Date(
                                            day +
                                            'T00:00:00',
                                          )
                                            .toLocaleDateString(
                                              undefined,
                                              {
                                                year:
                                                  'numeric',
                                                month:
                                                  'long',
                                                day:
                                                  'numeric',
                                              },
                                            )
                                    }
                                  </h3>
                                </div>

                                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-black">
                                  {
                                    group.length
                                  }
                                </span>
                              </div>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {
                                  group.map(
                                    (
                                      record,
                                      index,
                                    ) => (
                                      <button
                                        key={
                                          selected.recordKey
                                            ? String(
                                                record[
                                                  selected.recordKey
                                                ] ??
                                                index,
                                              )
                                            : index
                                        }
                                        type="button"
                                        onClick={
                                          canEdit &&
                                          selected.supportsEdit
                                            ? () =>
                                                onEdit(
                                                  selected,
                                                  record,
                                                )
                                            : undefined
                                        }
                                        className="rounded-2xl border border-[var(--sami-border)] p-3 text-left hover:bg-slate-500/[0.03]"
                                      >
                                        {
                                          selected.displayFields
                                            .slice(
                                              0,
                                              3,
                                            )
                                            .map(
                                              field => (
                                                <p
                                                  key={
                                                    field
                                                  }
                                                  className="line-clamp-2 text-xs font-semibold"
                                                >
                                                  {
                                                    displayValue(
                                                      record[
                                                        field
                                                      ],
                                                    )
                                                  }
                                                </p>
                                              ),
                                            )
                                        }
                                      </button>
                                    ),
                                  )
                                }
                              </div>
                            </div>
                          ),
                        )
                  }
                </div>
              )
      }

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Showing {
            records.length
          } of {
            totalRecords
          } records
        </p>

        {
          hasMore &&
          (
            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  onLoadMore(
                    selected,
                  )
              }
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black disabled:opacity-60"
            >
              Load more records
            </button>
          )
        }
      </div>
    </section>
  );
}


function WorkflowActions({
  moduleKey,
  table,
  record,
  disabled,
  onTransition,
}: {
  moduleKey:
    string;
  table:
    EnterpriseTable;
  record:
    Record<
      string,
      unknown
    >;
  disabled:
    boolean;
  onTransition:
    (
      table:
        EnterpriseTable,
      record:
        Record<
          string,
          unknown
        >,
      statusField:
        string,
      nextStatus:
        string,
    ) =>
      void;
}) {
  const workflow =
    table.workflows.find(
      item =>
        record[
          item.field
        ] !==
          null &&
        record[
          item.field
        ] !==
          undefined,
    );

  if (
    !workflow
  ) {
    return null;
  }

  const transitions =
    getEnterpriseWorkflowTransitions(
      moduleKey,
      table.key,
      record[
        workflow.field
      ],
      workflow
        .databaseAllowedValues,
    );

  if (
    transitions.length ===
      0
  ) {
    return null;
  }

  return (
    <select
      value=""
      disabled={
        disabled
      }
      aria-label={
        workflow.label +
        ' workflow'
      }
      onChange={
        event => {
          const next =
            event.target
              .value;

          if (
            next
          ) {
            onTransition(
              table,
              record,
              workflow.field,
              next,
            );
          }
        }
      }
      className="h-9 max-w-36 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[11px] font-black"
    >
      <option value="">
        Workflow
      </option>

      {
        transitions.map(
          transition => (
            <option
              key={
                transition.value
              }
              value={
                transition.value
              }
            >
              {
                transition.label
              }
            </option>
          ),
        )
      }
    </select>
  );
}


function ModuleActivity({
  data,
}: {
  data:
    EnterpriseWorkspaceData;
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-black">
          My activity in {
            data.module
              .name
          }
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Recent actions are scoped to you, the current company and this app. Platform diagnostics remain internal to SaMi administration.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {
          data.activity
            .length ===
            0
            ? (
                <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-8 text-center text-sm text-slate-500">
                  No recent activity is available for this app yet.
                </div>
              )
            : data.activity.map(
                item => (
                  <div
                    key={
                      item.id
                    }
                    className="rounded-2xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black">
                          {
                            item.label
                          }
                        </p>

                        {
                          item.summary &&
                          (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {
                                item.summary
                              }
                            </p>
                          )
                        }

                        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          {
                            item.entity
                              .type ||
                            'business record'
                          }
                          {
                            item.result
                              ? ' · ' +
                                item.result
                              : ''
                          }
                        </p>
                      </div>

                      <time className="shrink-0 text-[10px] font-semibold text-slate-400">
                        {
                          new Date(
                            item.createdAt,
                          )
                            .toLocaleString()
                        }
                      </time>
                    </div>
                  </div>
                ),
              )
        }
      </div>
    </section>
  );
}


function Reports({
  data,
  onOpen,
}: {
  data:
    EnterpriseWorkspaceData;
  onOpen:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
}) {
  const max =
    Math.max(
      1,
      ...data.tables.map(
        table =>
          table.count,
      ),
    );

  const workflowTables =
    data.tables.filter(
      table =>
        table.workflows
          .length >
        0,
    );

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={
            data.profile
              .primaryLabel
          }
          value={
            String(
              data.metrics
                .primaryRecords,
            )
          }
          note="primary operating register"
          icon={
            Activity
          }
        />

        <Metric
          label="Needs attention"
          value={
            String(
              data.metrics
                .attentionRecords,
            )
          }
          note="open or exception states"
          icon={
            TriangleAlert
          }
        />

        <Metric
          label="Successful"
          value={
            String(
              data.metrics
                .successRecords,
            )
          }
          note="completed or healthy states"
          icon={
            CircleCheckBig
          }
        />

        <Metric
          label="Total records"
          value={
            String(
              data.metrics
                .totalRecords,
            )
          }
          note="across accessible registers"
          icon={
            Database
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="sami-surface rounded-[24px] p-4">
          <h2 className="text-sm font-black">
            {
              data.profile
                .reportsLabel
            }
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Current-company coverage across this app&apos;s operational registers.
          </p>

          <div className="mt-4 space-y-3">
            {
              data.tables.map(
                table => (
                  <button
                    key={
                      table.key
                    }
                    type="button"
                    onClick={
                      () =>
                        onOpen(
                          table,
                        )
                    }
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-bold">
                        {
                          table.label
                        }
                      </span>
                      <span className="font-black">
                        {
                          table.count
                        }
                      </span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-500/10">
                      <div
                        className="h-full rounded-full bg-blue-600"
                        style={{
                          width:
                            Math.max(
                              table.count >
                                0
                                ? 4
                                : 0,
                              table.count /
                              max *
                              100,
                            ) +
                            '%',
                        }}
                      />
                    </div>
                  </button>
                ),
              )
            }
          </div>
        </div>

        <div className="space-y-4">
          <div className="sami-soft-surface rounded-[22px] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              Operating model
            </p>
            <p className="mt-2 text-sm font-black">
              {
                data.profile
                  .focus
              }
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {
                data.profile
                  .operatingModel
              }
            </p>
          </div>

          <div className="sami-soft-surface rounded-[22px] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              Security scope
            </p>
            <p className="mt-2 text-sm font-black">
              Current company
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Company-scoped registers and workflow counts are filtered server-side. Browser values never choose the tenant database or company boundary.
            </p>
          </div>
        </div>
      </div>

      {
        data.tables.some(
          table =>
            table.numericMetrics
              .length >
            0,
        ) &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <h2 className="text-sm font-black">
              Numeric performance
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Company-scoped sums, averages and observed ranges across numeric business fields.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {
                data.tables.flatMap(
                  table =>
                    table.numericMetrics.map(
                      metric => (
                        <div
                          key={
                            table.key +
                            ':' +
                            metric.field
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-4"
                        >
                          <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                            {
                              table.label
                            }
                          </p>
                          <p className="mt-1 text-xs font-black">
                            {
                              metric.label
                            }
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl bg-slate-500/[0.05] p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">
                                Sum
                              </p>
                              <p className="mt-1 font-black">
                                {
                                  metric.sum.toLocaleString()
                                }
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-500/[0.05] p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">
                                Average
                              </p>
                              <p className="mt-1 font-black">
                                {
                                  metric.average.toLocaleString()
                                }
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-500/[0.05] p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">
                                Minimum
                              </p>
                              <p className="mt-1 font-black">
                                {
                                  metric.minimum.toLocaleString()
                                }
                              </p>
                            </div>
                            <div className="rounded-xl bg-slate-500/[0.05] p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">
                                Maximum
                              </p>
                              <p className="mt-1 font-black">
                                {
                                  metric.maximum.toLocaleString()
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      ),
                    ),
                )
              }
            </div>
          </div>
        )
      }

      {
        workflowTables.length >
          0 &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <h2 className="text-sm font-black">
              Workflow distribution
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Live state counts from the current company, grouped by each register&apos;s primary workflow field.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {
                workflowTables.map(
                  table => {
                    const workflow =
                      table.workflows[0];

                    if (
                      !workflow
                    ) {
                      return null;
                    }

                    const entries =
                      Object.entries(
                        workflow.counts,
                      )
                        .sort(
                          (
                            left,
                            right,
                          ) =>
                            right[1] -
                            left[1],
                        );

                    return (
                      <button
                        key={
                          table.key
                        }
                        type="button"
                        onClick={
                          () =>
                            onOpen(
                              table,
                            )
                        }
                        className="rounded-2xl border border-[var(--sami-border)] p-4 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black">
                              {
                                table.label
                              }
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {
                                workflow.label
                              }
                            </p>
                          </div>

                          <span className="text-xs font-black">
                            {
                              entries.reduce(
                                (
                                  total,
                                  [
                                    _state,
                                    count,
                                  ],
                                ) =>
                                  total +
                                  count,
                                0,
                              )
                            }
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {
                            entries.length ===
                              0
                              ? (
                                  <span className="text-[11px] text-slate-400">
                                    No workflow states yet
                                  </span>
                                )
                              : entries
                                  .slice(
                                    0,
                                    8,
                                  )
                                  .map(
                                    ([
                                      state,
                                      count,
                                    ]) => (
                                      <span
                                        key={
                                          state
                                        }
                                        className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-black"
                                      >
                                        {
                                          state
                                            .replaceAll(
                                              '_',
                                              ' ',
                                            )
                                        }
                                        {' · '}
                                        {
                                          count
                                        }
                                      </span>
                                    ),
                                  )
                          }
                        </div>
                      </button>
                    );
                  },
                )
              }
            </div>
          </div>
        )
      }
    </section>
  );
}

function RecordEditor({
  moduleKey,
  table,
  record,
  busy,
  onClose,
  onSave,
}: {
  moduleKey:
    string;
  table:
    EnterpriseTable |
    null;
  record:
    Record<
      string,
      unknown
    > |
    null;
  busy:
    boolean;
  onClose:
    () =>
      void;
  onSave:
    (
      table:
        EnterpriseTable,
      record:
        Record<
          string,
          unknown
        > |
        null,
      values:
        Record<
          string,
          unknown
        >,
    ) =>
      Promise<boolean>;
}) {
  if (
    !table
  ) {
    return null;
  }

  const fields =
    table.fields.filter(
      field =>
        field.writable,
    );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-[var(--sami-surface)] shadow-2xl sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
              {
                table.label
              }
            </p>
            <h2 className="mt-1 text-lg font-black">
              {
                record
                  ? 'Edit ' +
                    singularLabel(
                      table.label,
                    )
                  : 'New ' +
                    singularLabel(
                      table.label,
                    )
              }
            </h2>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            className="rounded-xl border border-[var(--sami-border)] p-2"
            aria-label="Close editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="p-4 sm:p-5"
          onSubmit={
            async event => {
              event.preventDefault();

              const form =
                new FormData(
                  event.currentTarget,
                );

              const values:
                Record<
                  string,
                  unknown
                > = {};

              for (
                const field
                of fields
              ) {
                if (
                  field.inputType ===
                    'checkbox'
                ) {
                  values[
                    field.key
                  ] =
                    form.get(
                      field.key,
                    ) ===
                    'on';
                } else {
                  values[
                    field.key
                  ] =
                    form.get(
                      field.key,
                    );
                }
              }

              await onSave(
                table,
                record,
                values,
              );
            }
          }
        >
          {
            fields.length ===
              0
              ? (
                  <p className="rounded-xl bg-slate-500/[0.06] p-4 text-sm text-slate-500">
                    This record type has no generic editable fields. Use its dedicated business workflow.
                  </p>
                )
              : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {
                      fields.map(
                        field => (
                          <Field
                            key={
                              field.key
                            }
                            moduleKey={
                              moduleKey
                            }
                            tableKey={
                              table.key
                            }
                            field={
                              field
                            }
                            value={
                              record
                                ? record[
                                    field
                                      .key
                                  ]
                                : undefined
                            }
                          />
                        ),
                      )
                    }
                  </div>
                )
          }

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={
                onClose
              }
              className="h-11 rounded-xl border border-[var(--sami-border)] px-5 text-sm font-black"
            >
              Cancel
            </button>

            {
              fields.length >
                0 &&
              (
                <button
                  type="submit"
                  disabled={
                    busy
                  }
                  className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-60"
                >
                  {
                    record
                      ? 'Save changes'
                      : 'Create ' +
                        singularLabel(
                          table.label,
                        )
                  }
                </button>
              )
            }
          </div>
        </form>
      </div>
    </div>
  );
}


function Field({
  moduleKey,
  tableKey,
  field,
  value,
}: {
  moduleKey:
    string;
  tableKey:
    string;
  field:
    EnterpriseField;
  value:
    unknown;
}) {
  const initial =
    value ===
      null ||
    value ===
      undefined
      ? ''
      : field.inputType ===
          'json' &&
        typeof value ===
          'object'
        ? JSON.stringify(
            value,
            null,
            2,
          )
        : String(
            value,
          );

  const common = {
    name:
      field.key,
    required:
      field.required,
  };

  if (
    field.relation
  ) {
    return (
      <RelationField
        moduleKey={
          moduleKey
        }
        tableKey={
          tableKey
        }
        field={
          field
        }
        initialValue={
          initial
        }
      />
    );
  }

  if (
    field.inputType ===
      'checkbox'
  ) {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
        <input
          {...common}
          type="checkbox"
          defaultChecked={
            value ===
              true
          }
          className="h-4 w-4"
        />
        {
          field.label
        }
      </label>
    );
  }

  if (
    field.inputType ===
      'textarea' ||
    field.inputType ===
      'json'
  ) {
    return (
      <label className="block sm:col-span-2">
        <FieldLabel
          field={
            field
          }
        />
        <textarea
          {...common}
          rows={
            field.inputType ===
              'json'
              ? 6
              : 4
          }
          defaultValue={
            initial
          }
          className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
    );
  }

  return (
    <label className="block">
      <FieldLabel
        field={
          field
        }
      />

      <input
        {...common}
        type={
          field.inputType ===
            'number'
            ? 'number'
            : field.inputType ===
                'date'
              ? 'date'
              : field.inputType ===
                  'datetime'
                ? 'datetime-local'
                : 'text'
        }
        step={
          field.inputType ===
            'number'
            ? 'any'
            : undefined
        }
        defaultValue={
          initial
        }
        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


type RelationOption = {
  value:
    string;
  label:
    string;
  secondary:
    string |
    null;
};


function RelationField({
  moduleKey,
  tableKey,
  field,
  initialValue,
}: {
  moduleKey:
    string;
  tableKey:
    string;
  field:
    EnterpriseField;
  initialValue:
    string;
}) {
  const [
    selected,
    setSelected,
  ] =
    useState(
      initialValue,
    );

  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );

  const [
    options,
    setOptions,
  ] =
    useState<
      RelationOption[]
    >(
      [],
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      const timer =
        window.setTimeout(
          () => {
            void (
              async () => {
                setLoading(
                  true,
                );

                setFailed(
                  false,
                );

                try {
                  const params =
                    new URLSearchParams({
                      mode:
                        'relation',
                      table:
                        tableKey,
                      field:
                        field.key,
                    });

                  if (
                    query.trim()
                  ) {
                    params.set(
                      'query',
                      query.trim(),
                    );
                  }

                  if (
                    selected
                  ) {
                    params.set(
                      'selected',
                      selected,
                    );
                  }

                  const response =
                    await fetch(
                      '/api/apps/' +
                      encodeURIComponent(
                        moduleKey,
                      ) +
                      '/records?' +
                      params.toString(),
                      {
                        method:
                          'GET',
                        credentials:
                          'same-origin',
                        cache:
                          'no-store',
                        signal:
                          controller.signal,
                        headers: {
                          Accept:
                            'application/json',
                        },
                      },
                    );

                  const body =
                    await response
                      .json()
                      .catch(
                        () => ({}),
                      ) as {
                        success?:
                          boolean;
                        error?:
                          string;
                        relation?: {
                          options?:
                            RelationOption[];
                        };
                      };

                  if (
                    !response.ok ||
                    body.success !==
                      true
                  ) {
                    throw new Error(
                      body.error ||
                      'Related records could not be loaded.',
                    );
                  }

                  const incoming =
                    Array.isArray(
                      body.relation
                        ?.options,
                    )
                      ? body.relation
                          ?.options ||
                        []
                      : [];

                  setOptions(
                    current => {
                      const selectedOption =
                        selected
                          ? current.find(
                              option =>
                                option.value ===
                                selected,
                            )
                          : undefined;

                      if (
                        !selectedOption ||
                        incoming.some(
                          option =>
                            option.value ===
                            selectedOption.value,
                        )
                      ) {
                        return incoming;
                      }

                      return [
                        selectedOption,
                        ...incoming,
                      ];
                    },
                  );
                } catch (
                  error
                ) {
                  if (
                    error instanceof
                      DOMException &&
                    error.name ===
                      'AbortError'
                  ) {
                    return;
                  }

                  setFailed(
                    true,
                  );
                } finally {
                  if (
                    !controller
                      .signal
                      .aborted
                  ) {
                    setLoading(
                      false,
                    );
                  }
                }
              }
            )();
          },
          220,
        );

      return () => {
        window.clearTimeout(
          timer,
        );

        controller.abort();
      };
    },
    [
      field.key,
      moduleKey,
      query,
      selected,
      tableKey,
    ],
  );

  return (
    <label className="block sm:col-span-2">
      <FieldLabel
        field={
          field
        }
      />

      <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />

          <input
            type="search"
            value={
              query
            }
            onChange={
              event =>
                setQuery(
                  event.target
                    .value,
                )
            }
            placeholder={
              'Search ' +
              (
                field.relation
                  ?.label ||
                field.label
              )
            }
            className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm"
          />
        </div>

        <select
          name={
            field.key
          }
          required={
            field.required
          }
          value={
            selected
          }
          onChange={
            event =>
              setSelected(
                event.target
                  .value,
              )
          }
          className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
        >
          <option value="">
            {
              loading
                ? 'Loading…'
                : (
                    'Choose ' +
                    (
                      field.relation
                        ?.label ||
                      field.label
                    )
                  )
            }
          </option>

          {
            options.map(
              option => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {
                    option.label
                  }
                  {
                    option.secondary
                      ? (
                          ' · ' +
                          option.secondary
                        )
                      : ''
                  }
                </option>
              ),
            )
          }
        </select>
      </div>

      <p className={[
        'mt-1 text-[10px]',
        failed
          ? 'text-red-500'
          : 'text-slate-400',
      ].join(
        ' ',
      )}>
        {
          failed
            ? 'SaMi could not load related records. Retry by typing in the search box.'
            : 'Choices are restricted to records available in the current company.'
        }
      </p>
    </label>
  );
}


function FieldLabel({
  field,
}: {
  field:
    EnterpriseField;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {
        field.label
      }
      {
        field.required
          ? ' *'
          : ''
      }
    </span>
  );
}


function Metric({
  label,
  value,
  note,
  icon:
    Icon,
}: {
  label:
    string;
  value:
    string;
  note:
    string;
  icon:
    typeof Database;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            {
              label
            }
          </p>
          <p className="mt-2 text-xl font-black">
            {
              value
            }
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {
              note
            }
          </p>
        </div>
        <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-700 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
