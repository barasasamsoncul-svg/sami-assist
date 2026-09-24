'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  MessageSquareText,
  Paperclip,
  Plus,
  Save,
  Tag,
  Trash2,
  Upload,
  UserRoundCheck,
  Wrench,
  X,
} from 'lucide-react';

import type {
  EnterpriseTable,
} from '@/lib/apps/enterprise/service';


type NoteItem = {
  id: string;
  note_type: string;
  body: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
};

type TaskItem = {
  id: string;
  title: string;
  details: string | null;
  assigned_user_id: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  created_at: string;
};

type FileItem = {
  id: string;
  name: string;
  mimeType: string | null;
  extension: string | null;
  sizeBytes: number;
  purpose: string;
  createdAt: string;
};

type CustomField = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  required: boolean;
  active: boolean;
};

type TimelineItem = {
  id: string;
  action: string | null;
  event_type: string | null;
  summary: string | null;
  result: string | null;
  user_id: string | null;
  created_at: string;
};

type CompletionData = {
  table: string;
  recordId: string;
  notes: NoteItem[];
  tasks: TaskItem[];
  customFields: CustomField[];
  extras: {
    custom_values?: Record<string, unknown>;
    tags?: unknown;
    watchers?: unknown;
    updated_at?: string | null;
  };
  files: FileItem[];
  timeline: TimelineItem[];
};


function showValue(
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

  return String(
    value,
  );
}


function dateLabel(
  value:
    string | null | undefined,
) {
  if (
    !value
  ) {
    return '—';
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date
    .toLocaleString();
}


function fileSize(
  value:
    number,
) {
  if (
    value <
      1024
  ) {
    return value +
      ' B';
  }

  if (
    value <
      1024 *
      1024
  ) {
    return (
      value /
      1024
    )
      .toFixed(
        1,
      ) +
      ' KB';
  }

  return (
    value /
    1024 /
    1024
  )
    .toFixed(
      1,
    ) +
    ' MB';
}


export default function EnterpriseRecordWorkspacePanel({
  moduleKey,
  table,
  record,
  userId,
  canEdit,
  canManageSettings,
  onClose,
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
  userId:
    string;
  canEdit:
    boolean;
  canManageSettings:
    boolean;
  onClose:
    () =>
      void;
}) {
  const recordId =
    table.recordKey
      ? String(
          record[
            table.recordKey
          ] ||
          '',
        )
      : '';

  const [
    data,
    setData,
  ] =
    useState<CompletionData | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    error,
    setError,
  ] =
    useState(
      '',
    );

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const [
    tab,
    setTab,
  ] =
    useState<
      'summary' |
      'notes' |
      'tasks' |
      'files' |
      'custom' |
      'timeline'
    >(
      'summary',
    );

  const [
    noteText,
    setNoteText,
  ] =
    useState(
      '',
    );

  const [
    noteType,
    setNoteType,
  ] =
    useState<
      'note' |
      'comment'
    >(
      'note',
    );

  const [
    taskTitle,
    setTaskTitle,
  ] =
    useState(
      '',
    );

  const [
    taskDueAt,
    setTaskDueAt,
  ] =
    useState(
      '',
    );

  const [
    taskPriority,
    setTaskPriority,
  ] =
    useState(
      'normal',
    );

  const [
    tagsText,
    setTagsText,
  ] =
    useState(
      '',
    );

  const [
    customValues,
    setCustomValues,
  ] =
    useState<
      Record<
        string,
        unknown
      >
    >(
      {},
    );

  const [
    newFieldLabel,
    setNewFieldLabel,
  ] =
    useState(
      '',
    );

  const [
    newFieldType,
    setNewFieldType,
  ] =
    useState(
      'text',
    );

  const [
    newFieldOptions,
    setNewFieldOptions,
  ] =
    useState(
      '',
    );

  const fileInput =
    useRef<HTMLInputElement | null>(
      null,
    );

  const tabs =
    [
      [
        'summary',
        'Summary',
        FileText,
      ],
      [
        'notes',
        'Notes',
        MessageSquareText,
      ],
      [
        'tasks',
        'Activities',
        CalendarClock,
      ],
      [
        'files',
        'Files',
        Paperclip,
      ],
      [
        'custom',
        'Fields & tags',
        Tag,
      ],
      [
        'timeline',
        'Timeline',
        Clock3,
      ],
    ] as const;

  const watcherIds =
    useMemo(
      () =>
        Array.isArray(
          data?.extras
            ?.watchers,
        )
          ? data!
              .extras
              .watchers!
              .map(
                value =>
                  String(
                    value,
                  ),
              )
          : [],
      [
        data?.extras
          ?.watchers,
      ],
    );

  const watching =
    watcherIds.includes(
      userId,
    );

  async function load() {
    if (
      !recordId
    ) {
      setError(
        'This record cannot be opened.',
      );
      setLoading(
        false,
      );
      return;
    }

    setLoading(
      true,
    );
    setError(
      '',
    );

    try {
      const params =
        new URLSearchParams({
          mode:
            'record_completion',
          table:
            table.key,
          recordId,
        });

      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
          ) +
          '/records?' +
          params.toString(),
          {
            credentials:
              'same-origin',
            cache:
              'no-store',
          },
        );

      const body =
        await response
          .json() as {
            success?:
              boolean;
            error?:
              string;
            completion?:
              CompletionData;
          };

      if (
        !response.ok ||
        body.success !==
          true ||
        !body.completion
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load this record workspace.',
        );
      }

      setData(
        body.completion,
      );

      setTagsText(
        Array.isArray(
          body.completion
            .extras
            ?.tags,
        )
          ? body.completion
              .extras
              .tags
              .map(
                value =>
                  String(
                    value,
                  ),
              )
              .join(
                ', ',
              )
          : '',
      );

      setCustomValues(
        body.completion
          .extras
          ?.custom_values &&
        typeof body.completion
          .extras
          .custom_values ===
          'object'
          ? body.completion
              .extras
              .custom_values
          : {},
      );
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not load this record workspace.',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      void load();
    },
    [
      moduleKey,
      table.key,
      recordId,
    ],
  );

  async function action(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    setBusy(
      true,
    );
    setError(
      '',
    );

    try {
      const response =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
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
              JSON.stringify({
                table:
                  table.key,
                recordId,
                ...payload,
              }),
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
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not complete this record action.',
        );
      }

      await load();
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function addNote() {
    const body =
      noteText
        .trim();

    if (
      !body
    ) {
      return;
    }

    try {
      await action({
        action:
          'add_note',
        body,
        noteType,
      });

      setNoteText(
        '',
      );
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not add the note.',
      );
    }
  }

  async function saveTask(
    task?: TaskItem,
    statusOverride?: string,
  ) {
    const title =
      task
        ?.title ||
      taskTitle
        .trim();

    if (
      !title
    ) {
      return;
    }

    try {
      await action({
        action:
          'save_task',
        taskId:
          task?.id,
        title,
        details:
          task?.details ||
          '',
        assignedUserId:
          task
            ?.assigned_user_id,
        dueAt:
          task?.due_at ||
          taskDueAt ||
          null,
        priority:
          task?.priority ||
          taskPriority,
        status:
          statusOverride ||
          task?.status ||
          'open',
      });

      if (
        !task
      ) {
        setTaskTitle(
          '',
        );
        setTaskDueAt(
          '',
        );
        setTaskPriority(
          'normal',
        );
      }
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not save the activity.',
      );
    }
  }

  async function saveExtras(
    watchers =
      watcherIds,
  ) {
    try {
      await action({
        action:
          'update_extras',
        customValues,
        tags:
          tagsText
            .split(
              ',',
            )
            .map(
              tag =>
                tag.trim(),
            )
            .filter(
              Boolean,
            ),
        watchers,
      });
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not save record fields.',
      );
    }
  }

  async function createCustomField() {
    const label =
      newFieldLabel
        .trim();

    if (
      !label
    ) {
      return;
    }

    try {
      await action({
        action:
          'save_custom_field',
        fieldKey:
          label
            .toLowerCase()
            .replace(
              /[^a-z0-9]+/g,
              '_',
            )
            .replace(
              /^_+|_+$/g,
              '',
            ),
        label,
        fieldType:
          newFieldType,
        options:
          newFieldType ===
            'select'
            ? newFieldOptions
                .split(
                  ',',
                )
                .map(
                  value =>
                    value.trim(),
                )
                .filter(
                  Boolean,
                )
            : [],
        required:
          false,
        active:
          true,
      });

      setNewFieldLabel(
        '',
      );
      setNewFieldType(
        'text',
      );
      setNewFieldOptions(
        '',
      );
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not create the custom field.',
      );
    }
  }

  async function uploadFile(
    file:
      File,
  ) {
    setBusy(
      true,
    );
    setError(
      '',
    );

    try {
      const intentResponse =
        await fetch(
          '/api/workspace/files/upload-intent',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                fileName:
                  file.name,
                mimeType:
                  file.type ||
                  'application/octet-stream',
                sizeBytes:
                  file.size,
                purpose:
                  moduleKey +
                  '_attachment',
              }),
          },
        );

      const intent =
        await intentResponse
          .json() as {
            success?:
              boolean;
            error?:
              string;
            file?: {
              id:
                string;
            };
            upload?: {
              url:
                string;
              method:
                'PUT';
              headers:
                Record<
                  string,
                  string
                >;
            };
          };

      if (
        !intentResponse.ok ||
        intent.success !==
          true ||
        !intent.file ||
        !intent.upload
      ) {
        throw new Error(
          intent.error ||
          'SaMi could not prepare the file upload.',
        );
      }

      const uploadResponse =
        await fetch(
          intent.upload.url,
          {
            method:
              intent.upload
                .method,
            headers:
              intent.upload
                .headers,
            body:
              file,
          },
        );

      if (
        !uploadResponse.ok
      ) {
        throw new Error(
          'The file could not be uploaded to private storage.',
        );
      }

      const completeResponse =
        await fetch(
          '/api/workspace/files/' +
          encodeURIComponent(
            intent.file.id,
          ) +
          '/complete',
          {
            method:
              'POST',
            credentials:
              'same-origin',
          },
        );

      const completed =
        await completeResponse
          .json() as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !completeResponse.ok ||
        completed.success !==
          true
      ) {
        throw new Error(
          completed.error ||
          'SaMi could not finalize the file upload.',
        );
      }

      const linkResponse =
        await fetch(
          '/api/apps/' +
          encodeURIComponent(
            moduleKey,
          ) +
          '/records',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action:
                  'link_file',
                table:
                  table.key,
                recordId,
                fileId:
                  intent.file.id,
              }),
          },
        );

      const linked =
        await linkResponse
          .json() as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !linkResponse.ok ||
        linked.success !==
          true
      ) {
        throw new Error(
          linked.error ||
          'The file uploaded but could not be linked to this record.',
        );
      }

      await load();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not attach the file.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  const summaryFields =
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

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/45 backdrop-blur-[2px]">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[var(--sami-surface)] shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-[var(--sami-border)] bg-[var(--sami-surface)]">
          <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 dark:text-blue-300">
                {
                  table.label
                }
              </p>
              <h2 className="mt-1 text-lg font-black">
                Record workspace
              </h2>
              <p className="mt-1 max-w-xl text-xs text-slate-500">
                Notes, activities, files, tags, custom fields and audit history stay attached to this company-scoped business record.
              </p>
            </div>

            <button
              type="button"
              onClick={
                onClose
              }
              className="rounded-xl border border-[var(--sami-border)] p-2"
              aria-label="Close record workspace"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto px-4 pb-3 sm:px-5">
            {
              tabs.map(
                ([
                  key,
                  label,
                  Icon,
                ]) => (
                  <button
                    key={
                      key
                    }
                    type="button"
                    onClick={
                      () =>
                        setTab(
                          key,
                        )
                    }
                    className={[
                      'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-black',
                      tab ===
                        key
                        ? 'bg-blue-600 text-white'
                        : 'border border-[var(--sami-border)]',
                    ].join(
                      ' ',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {
                      label
                    }
                  </button>
                ),
              )
            }
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {
            error &&
            (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-3 text-xs font-bold text-red-700 dark:text-red-300">
                {
                  error
                }
              </div>
            )
          }

          {
            loading
              ? (
                  <div className="rounded-2xl border border-[var(--sami-border)] p-8 text-center text-sm text-slate-500">
                    Loading record workspace…
                  </div>
                )
              : !data
                ? (
                    <div className="rounded-2xl border border-[var(--sami-border)] p-8 text-center text-sm text-slate-500">
                      Record workspace is unavailable.
                    </div>
                  )
                : (
                    <>
                      {
                        tab ===
                          'summary' &&
                        (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              {
                                canEdit &&
                                (
                                  <button
                                    type="button"
                                    disabled={
                                      busy
                                    }
                                    onClick={
                                      () =>
                                        void saveExtras(
                                          watching
                                            ? watcherIds
                                                .filter(
                                                  id =>
                                                    id !==
                                                    userId,
                                                )
                                            : [
                                                ...watcherIds,
                                                userId,
                                              ],
                                        )
                                    }
                                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-black"
                                  >
                                    {
                                      watching
                                        ? (
                                            <Bell className="h-3.5 w-3.5 text-blue-600" />
                                          )
                                        : (
                                            <UserRoundCheck className="h-3.5 w-3.5" />
                                          )
                                    }
                                    {
                                      watching
                                        ? 'Watching'
                                        : 'Watch record'
                                    }
                                  </button>
                                )
                              }

                              <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-black text-slate-500">
                                {
                                  data.notes
                                    .length
                                }
                                {' notes · '}
                                {
                                  data.tasks
                                    .filter(
                                      task =>
                                        ![
                                          'completed',
                                          'cancelled',
                                        ].includes(
                                          task.status,
                                        ),
                                    )
                                    .length
                                }
                                {' open activities · '}
                                {
                                  data.files
                                    .length
                                }
                                {' files'}
                              </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              {
                                summaryFields.map(
                                  field => (
                                    <div
                                      key={
                                        field
                                      }
                                      className="rounded-2xl border border-[var(--sami-border)] p-3"
                                    >
                                      <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                                        {
                                          table.fields
                                            .find(
                                              item =>
                                                item.key ===
                                                field,
                                            )
                                            ?.label ||
                                          field
                                        }
                                      </p>
                                      <p className="mt-2 break-words text-xs font-bold">
                                        {
                                          showValue(
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
                            </div>
                          </div>
                        )
                      }

                      {
                        tab ===
                          'notes' &&
                        (
                          <div className="space-y-4">
                            {
                              canEdit &&
                              (
                                <div className="rounded-2xl border border-[var(--sami-border)] p-4">
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <select
                                      value={
                                        noteType
                                      }
                                      onChange={
                                        event =>
                                          setNoteType(
                                            event
                                              .target
                                              .value as
                                              'note' |
                                              'comment',
                                          )
                                      }
                                      className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs font-bold"
                                    >
                                      <option value="note">
                                        Note
                                      </option>
                                      <option value="comment">
                                        Comment
                                      </option>
                                    </select>

                                    <textarea
                                      value={
                                        noteText
                                      }
                                      onChange={
                                        event =>
                                          setNoteText(
                                            event
                                              .target
                                              .value,
                                          )
                                      }
                                      rows={
                                        3
                                      }
                                      placeholder="Add context, a handover note or a team comment…"
                                      className="min-h-24 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-xs"
                                    />
                                  </div>

                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      disabled={
                                        busy ||
                                        !noteText
                                          .trim()
                                      }
                                      onClick={
                                        () =>
                                          void addNote()
                                      }
                                      className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white disabled:opacity-50"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Add {
                                        noteType
                                      }
                                    </button>
                                  </div>
                                </div>
                              )
                            }

                            <div className="space-y-2">
                              {
                                data.notes
                                  .length ===
                                  0
                                  ? (
                                      <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-6 text-center text-xs text-slate-500">
                                        No notes or comments yet.
                                      </div>
                                    )
                                  : data.notes.map(
                                      note => (
                                        <div
                                          key={
                                            note.id
                                          }
                                          className="rounded-2xl border border-[var(--sami-border)] p-4"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[9px] font-black uppercase text-blue-700 dark:text-blue-300">
                                                {
                                                  note.note_type
                                                }
                                              </span>
                                              <p className="mt-2 whitespace-pre-wrap text-xs leading-5">
                                                {
                                                  note.body
                                                }
                                              </p>
                                              <p className="mt-2 text-[10px] text-slate-400">
                                                {
                                                  dateLabel(
                                                    note.created_at,
                                                  )
                                                }
                                              </p>
                                            </div>

                                            {
                                              canEdit &&
                                              (
                                                <button
                                                  type="button"
                                                  disabled={
                                                    busy
                                                  }
                                                  onClick={
                                                    () =>
                                                      void action({
                                                        action:
                                                          'delete_note',
                                                        noteId:
                                                          note.id,
                                                      })
                                                  }
                                                  className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                                                  aria-label="Delete note"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
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
                      }

                      {
                        tab ===
                          'tasks' &&
                        (
                          <div className="space-y-4">
                            {
                              canEdit &&
                              (
                                <div className="grid gap-2 rounded-2xl border border-[var(--sami-border)] p-4 sm:grid-cols-[1fr_180px_120px_auto]">
                                  <input
                                    value={
                                      taskTitle
                                    }
                                    onChange={
                                      event =>
                                        setTaskTitle(
                                          event
                                            .target
                                            .value,
                                        )
                                    }
                                    placeholder="Follow-up activity"
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                  />

                                  <input
                                    type="datetime-local"
                                    value={
                                      taskDueAt
                                    }
                                    onChange={
                                      event =>
                                        setTaskDueAt(
                                          event
                                            .target
                                            .value,
                                        )
                                    }
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                  />

                                  <select
                                    value={
                                      taskPriority
                                    }
                                    onChange={
                                      event =>
                                        setTaskPriority(
                                          event
                                            .target
                                            .value,
                                        )
                                    }
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                  >
                                    <option value="low">
                                      Low
                                    </option>
                                    <option value="normal">
                                      Normal
                                    </option>
                                    <option value="high">
                                      High
                                    </option>
                                    <option value="urgent">
                                      Urgent
                                    </option>
                                  </select>

                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      !taskTitle
                                        .trim()
                                    }
                                    onClick={
                                      () =>
                                        void saveTask()
                                    }
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white disabled:opacity-50"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add
                                  </button>
                                </div>
                              )
                            }

                            <div className="space-y-2">
                              {
                                data.tasks
                                  .length ===
                                  0
                                  ? (
                                      <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-6 text-center text-xs text-slate-500">
                                        No follow-up activities yet.
                                      </div>
                                    )
                                  : data.tasks.map(
                                      task => (
                                        <div
                                          key={
                                            task.id
                                          }
                                          className="rounded-2xl border border-[var(--sami-border)] p-4"
                                        >
                                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-xs font-black">
                                                  {
                                                    task.title
                                                  }
                                                </p>
                                                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[9px] font-black uppercase">
                                                  {
                                                    task.priority
                                                  }
                                                </span>
                                                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700 dark:text-blue-300">
                                                  {
                                                    task.status
                                                      .replaceAll(
                                                        '_',
                                                        ' ',
                                                      )
                                                  }
                                                </span>
                                              </div>

                                              {
                                                task.details &&
                                                (
                                                  <p className="mt-2 text-xs text-slate-500">
                                                    {
                                                      task.details
                                                    }
                                                  </p>
                                                )
                                              }

                                              <p className="mt-2 text-[10px] text-slate-400">
                                                Due {
                                                  dateLabel(
                                                    task.due_at,
                                                  )
                                                }
                                              </p>
                                            </div>

                                            {
                                              canEdit &&
                                              ![
                                                'completed',
                                                'cancelled',
                                              ].includes(
                                                task.status,
                                              ) &&
                                              (
                                                <div className="flex gap-1">
                                                  {
                                                    task.status ===
                                                      'open' &&
                                                    (
                                                      <button
                                                        type="button"
                                                        disabled={
                                                          busy
                                                        }
                                                        onClick={
                                                          () =>
                                                            void saveTask(
                                                              task,
                                                              'in_progress',
                                                            )
                                                        }
                                                        className="rounded-lg border border-[var(--sami-border)] px-2.5 py-1.5 text-[10px] font-black"
                                                      >
                                                        Start
                                                      </button>
                                                    )
                                                  }

                                                  <button
                                                    type="button"
                                                    disabled={
                                                      busy
                                                    }
                                                    onClick={
                                                      () =>
                                                        void saveTask(
                                                          task,
                                                          'completed',
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300"
                                                  >
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Complete
                                                  </button>
                                                </div>
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
                      }

                      {
                        tab ===
                          'files' &&
                        (
                          <div className="space-y-4">
                            {
                              canEdit &&
                              (
                                <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-4">
                                  <input
                                    ref={
                                      fileInput
                                    }
                                    type="file"
                                    className="hidden"
                                    onChange={
                                      event => {
                                        const file =
                                          event
                                            .target
                                            .files?.[0];

                                        if (
                                          file
                                        ) {
                                          void uploadFile(
                                            file,
                                          );
                                        }

                                        event
                                          .currentTarget
                                          .value =
                                          '';
                                      }
                                    }
                                  />

                                  <button
                                    type="button"
                                    disabled={
                                      busy
                                    }
                                    onClick={
                                      () =>
                                        fileInput
                                          .current
                                          ?.click()
                                    }
                                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
                                  >
                                    <Upload className="h-4 w-4" />
                                    Attach file
                                  </button>

                                  <p className="mt-2 text-[10px] text-slate-400">
                                    Files use SaMi private workspace storage, company scoping and existing storage quotas.
                                  </p>
                                </div>
                              )
                            }

                            <div className="space-y-2">
                              {
                                data.files
                                  .length ===
                                  0
                                  ? (
                                      <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-6 text-center text-xs text-slate-500">
                                        No files attached.
                                      </div>
                                    )
                                  : data.files.map(
                                      file => (
                                        <div
                                          key={
                                            file.id
                                          }
                                          className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--sami-border)] p-3"
                                        >
                                          <div className="min-w-0">
                                            <p className="truncate text-xs font-black">
                                              {
                                                file.name
                                              }
                                            </p>
                                            <p className="mt-1 text-[10px] text-slate-400">
                                              {
                                                fileSize(
                                                  file.sizeBytes,
                                                )
                                              }
                                              {' · '}
                                              {
                                                dateLabel(
                                                  file.createdAt,
                                                )
                                              }
                                            </p>
                                          </div>

                                          <div className="flex gap-1">
                                            <a
                                              href={
                                                '/api/workspace/files/' +
                                                encodeURIComponent(
                                                  file.id,
                                                ) +
                                                '/download'
                                              }
                                              className="rounded-lg p-2 hover:bg-blue-500/10 hover:text-blue-700"
                                              aria-label="Download file"
                                            >
                                              <Download className="h-4 w-4" />
                                            </a>

                                            {
                                              canEdit &&
                                              (
                                                <button
                                                  type="button"
                                                  disabled={
                                                    busy
                                                  }
                                                  onClick={
                                                    () =>
                                                      void action({
                                                        action:
                                                          'unlink_file',
                                                        fileId:
                                                          file.id,
                                                      })
                                                  }
                                                  className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                                                  aria-label="Remove file from record"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
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
                      }

                      {
                        tab ===
                          'custom' &&
                        (
                          <div className="space-y-4">
                            {
                              canEdit &&
                              (
                                <div className="rounded-2xl border border-[var(--sami-border)] p-4">
                                  <label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                                    Tags
                                  </label>
                                  <input
                                    value={
                                      tagsText
                                    }
                                    onChange={
                                      event =>
                                        setTagsText(
                                          event
                                            .target
                                            .value,
                                        )
                                    }
                                    placeholder="priority, vip, follow-up"
                                    className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                  />
                                </div>
                              )
                            }

                            <div className="grid gap-3 sm:grid-cols-2">
                              {
                                data.customFields.map(
                                  field => {
                                    const value =
                                      customValues[
                                        field.field_key
                                      ];

                                    return (
                                      <label
                                        key={
                                          field.id
                                        }
                                        className="rounded-2xl border border-[var(--sami-border)] p-3"
                                      >
                                        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                                          {
                                            field.label
                                          }
                                          {
                                            field.required
                                              ? ' *'
                                              : ''
                                          }
                                        </span>

                                        {
                                          field.field_type ===
                                            'checkbox'
                                            ? (
                                                <input
                                                  type="checkbox"
                                                  checked={
                                                    value ===
                                                      true
                                                  }
                                                  disabled={
                                                    !canEdit
                                                  }
                                                  onChange={
                                                    event =>
                                                      setCustomValues(
                                                        current => ({
                                                          ...current,
                                                          [field.field_key]:
                                                            event
                                                              .target
                                                              .checked,
                                                        }),
                                                      )
                                                  }
                                                  className="mt-3 h-4 w-4"
                                                />
                                              )
                                            : field.field_type ===
                                                'select'
                                              ? (
                                                  <select
                                                    value={
                                                      String(
                                                        value ||
                                                        '',
                                                      )
                                                    }
                                                    disabled={
                                                      !canEdit
                                                    }
                                                    onChange={
                                                      event =>
                                                        setCustomValues(
                                                          current => ({
                                                            ...current,
                                                            [field.field_key]:
                                                              event
                                                                .target
                                                                .value,
                                                          }),
                                                        )
                                                    }
                                                    className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                                  >
                                                    <option value="">
                                                      Select…
                                                    </option>
                                                    {
                                                      Array.isArray(
                                                        field.options,
                                                      ) &&
                                                      field.options.map(
                                                        option => (
                                                          <option
                                                            key={
                                                              String(
                                                                option,
                                                              )
                                                            }
                                                            value={
                                                              String(
                                                                option,
                                                              )
                                                            }
                                                          >
                                                            {
                                                              String(
                                                                option,
                                                              )
                                                            }
                                                          </option>
                                                        ),
                                                      )
                                                    }
                                                  </select>
                                                )
                                              : (
                                                  <input
                                                    type={
                                                      field.field_type ===
                                                        'number'
                                                        ? 'number'
                                                        : field.field_type ===
                                                            'date'
                                                          ? 'date'
                                                          : field.field_type ===
                                                              'datetime'
                                                            ? 'datetime-local'
                                                            : 'text'
                                                    }
                                                    value={
                                                      String(
                                                        value ||
                                                        '',
                                                      )
                                                    }
                                                    disabled={
                                                      !canEdit
                                                    }
                                                    onChange={
                                                      event =>
                                                        setCustomValues(
                                                          current => ({
                                                            ...current,
                                                            [field.field_key]:
                                                              event
                                                                .target
                                                                .value,
                                                          }),
                                                        )
                                                    }
                                                    className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                                  />
                                                )
                                        }
                                      </label>
                                    );
                                  },
                                )
                              }
                            </div>

                            {
                              canEdit &&
                              (
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    disabled={
                                      busy
                                    }
                                    onClick={
                                      () =>
                                        void saveExtras()
                                    }
                                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
                                  >
                                    <Save className="h-4 w-4" />
                                    Save fields & tags
                                  </button>
                                </div>
                              )
                            }

                            {
                              canManageSettings &&
                              (
                                <div className="rounded-2xl border border-[var(--sami-border)] p-4">
                                  <div className="flex items-center gap-2">
                                    <Wrench className="h-4 w-4 text-blue-600" />
                                    <h3 className="text-xs font-black">
                                      Add custom field
                                    </h3>
                                  </div>

                                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_1fr_auto]">
                                    <input
                                      value={
                                        newFieldLabel
                                      }
                                      onChange={
                                        event =>
                                          setNewFieldLabel(
                                            event
                                              .target
                                              .value,
                                          )
                                      }
                                      placeholder="Field label"
                                      className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                    />

                                    <select
                                      value={
                                        newFieldType
                                      }
                                      onChange={
                                        event =>
                                          setNewFieldType(
                                            event
                                              .target
                                              .value,
                                          )
                                      }
                                      className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                    >
                                      <option value="text">
                                        Text
                                      </option>
                                      <option value="textarea">
                                        Long text
                                      </option>
                                      <option value="number">
                                        Number
                                      </option>
                                      <option value="checkbox">
                                        Checkbox
                                      </option>
                                      <option value="date">
                                        Date
                                      </option>
                                      <option value="datetime">
                                        Date & time
                                      </option>
                                      <option value="select">
                                        Select
                                      </option>
                                    </select>

                                    <input
                                      value={
                                        newFieldOptions
                                      }
                                      onChange={
                                        event =>
                                          setNewFieldOptions(
                                            event
                                              .target
                                              .value,
                                          )
                                      }
                                      disabled={
                                        newFieldType !==
                                        'select'
                                      }
                                      placeholder="Options, comma separated"
                                      className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs disabled:opacity-50"
                                    />

                                    <button
                                      type="button"
                                      disabled={
                                        busy ||
                                        !newFieldLabel
                                          .trim()
                                      }
                                      onClick={
                                        () =>
                                          void createCustomField()
                                      }
                                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-[11px] font-black text-white dark:bg-white dark:text-slate-950 disabled:opacity-50"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Add
                                    </button>
                                  </div>
                                </div>
                              )
                            }
                          </div>
                        )
                      }

                      {
                        tab ===
                          'timeline' &&
                        (
                          <div className="space-y-2">
                            {
                              data.timeline
                                .length ===
                                0
                                ? (
                                    <div className="rounded-2xl border border-dashed border-[var(--sami-border)] p-6 text-center text-xs text-slate-500">
                                      No audit events are attached to this record yet.
                                    </div>
                                  )
                                : data.timeline.map(
                                    event => (
                                      <div
                                        key={
                                          event.id
                                        }
                                        className="rounded-2xl border border-[var(--sami-border)] p-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div>
                                            <p className="text-xs font-black">
                                              {
                                                event.summary ||
                                                event.event_type ||
                                                event.action ||
                                                'Record activity'
                                              }
                                            </p>
                                            <p className="mt-1 text-[10px] text-slate-400">
                                              {
                                                event.result ||
                                                'activity'
                                              }
                                            </p>
                                          </div>

                                          <span className="shrink-0 text-[10px] text-slate-400">
                                            {
                                              dateLabel(
                                                event.created_at,
                                              )
                                            }
                                          </span>
                                        </div>
                                      </div>
                                    ),
                                  )
                            }
                          </div>
                        )
                      }
                    </>
                  )
          }
        </div>
      </div>
    </div>
  );
}
