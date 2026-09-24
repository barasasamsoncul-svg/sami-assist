'use client';

import {
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import {
  BarChart3,
  BookOpenCheck,
  Database,
  Download,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  Trash2,
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


type ViewKey =
  | 'overview'
  | 'records'
  | 'reports'
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

  const visibleRecords =
    useMemo(
      () => {
        if (
          !selectedTable
        ) {
          return [];
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
        values,
      });

      setEditor(
        null,
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
      danger:
        true,
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
          'Records',
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
                  })
              }
              onDelete={
                deleteRecord
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
      </div>

      {
        editor &&
        (
          <RecordEditor
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
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Records"
          value={
            String(
              data.metrics
                .totalRecords,
            )
          }
          note="current accessible app data"
          icon={
            Database
          }
        />

        <Metric
          label="Record groups"
          value={
            String(
              data.metrics
                .tables,
            )
          }
          note="code-owned schema groups"
          icon={
            Table2
          }
        />

        <Metric
          label="Active groups"
          value={
            String(
              data.metrics
                .activeTables,
            )
          }
          note="groups containing records"
          icon={
            BarChart3
          }
        />
      </div>

      <div className="sami-surface rounded-[24px] p-4">
        <div>
          <h2 className="text-sm font-black">
            Business record map
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Each group belongs to this installed app. Company-scoped groups are automatically restricted to the current company.
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
  tables,
  selected,
  search,
  setSearch,
  records,
  busy,
  canCreate,
  canEdit,
  canDelete,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onExport,
}: {
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
  onExport:
    (
      table:
        EnterpriseTable,
    ) =>
      void;
}) {
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

          <div className="flex flex-col gap-2 sm:flex-row">
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
                placeholder="Search loaded records"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs sm:w-64"
              />
            </label>

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
                  New record
                </button>
              )
            }
          </div>
        </div>
      </div>

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
                    selected
                      .supportsEdit
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
                                    <div className="flex justify-end gap-1">
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

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="sami-surface rounded-[24px] p-4">
        <h2 className="text-sm font-black">
          Record coverage
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          A current-company operational summary across this app&apos;s code-owned record groups.
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
        <Metric
          label="Total records"
          value={
            String(
              data.metrics
                .totalRecords,
            )
          }
          note="across accessible record groups"
          icon={
            Database
          }
        />

        <Metric
          label="Active groups"
          value={
            String(
              data.metrics
                .activeTables,
            )
          }
          note={
            'of ' +
            data.metrics
              .tables +
            ' available'
          }
          icon={
            BarChart3
          }
        />

        <div className="sami-soft-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Security scope
          </p>
          <p className="mt-2 text-sm font-black">
            Current company
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Tables with a company boundary are filtered server-side. Client values never select the workspace or company database scope.
          </p>
        </div>
      </div>
    </section>
  );
}


function RecordEditor({
  table,
  record,
  busy,
  onClose,
  onSave,
}: {
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
                  ? 'Edit record'
                  : 'New record'
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
                      : 'Create record'
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
  field,
  value,
}: {
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
