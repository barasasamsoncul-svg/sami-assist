'use client';

import {
  useMemo,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import type {
  PlatformRecoveryPointSummary,
  PlatformRecoveryWorkspace,
} from '@/lib/admin/recovery-operations';


type Props = {
  available:
    boolean;
  error:
    string | null;
  canManage:
    boolean;
  workspaces:
    PlatformRecoveryWorkspace[];
  recoveryPoints:
    PlatformRecoveryPointSummary[];
};


type ApiResponse = {
  success?:
    boolean;
  error?:
    string;
  code?:
    string;
  requiredConfirmation?:
    string;
};


function formatDate(
  value:
    string | null,
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? value
    : date.toLocaleString();
}


function statusClass(
  value:
    string,
) {
  const normalized =
    value.toLowerCase();

  if (
    normalized === 'available' ||
    normalized === 'active'
  ) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  if (
    normalized === 'failed' ||
    normalized === 'deleted' ||
    normalized === 'purged'
  ) {
    return 'bg-red-500/10 text-red-700 dark:text-red-300';
  }

  if (
    normalized === 'creating' ||
    normalized === 'requested' ||
    normalized === 'pending_deletion'
  ) {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }

  return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300';
}


export default function TenantRecoveryManager({
  available,
  error,
  canManage,
  workspaces,
  recoveryPoints,
}: Props) {
  const router =
    useRouter();

  const [
    tenantId,
    setTenantId,
  ] = useState(
    workspaces[0]
      ?.tenantId ||
    '',
  );

  const [
    reason,
    setReason,
  ] = useState(
    '',
  );

  const [
    busy,
    setBusy,
  ] = useState(
    '',
  );

  const [
    notice,
    setNotice,
  ] = useState<
    string |
    null
  >(null);

  const [
    failure,
    setFailure,
  ] = useState<
    string |
    null
  >(null);

  const [
    restorePoint,
    setRestorePoint,
  ] = useState<
    PlatformRecoveryPointSummary |
    null
  >(null);

  const [
    targetDatabaseName,
    setTargetDatabaseName,
  ] = useState(
    '',
  );

  const [
    restoreConfirmation,
    setRestoreConfirmation,
  ] = useState(
    '',
  );

  const [
    deletePoint,
    setDeletePoint,
  ] = useState<
    PlatformRecoveryPointSummary |
    null
  >(null);

  const [
    deleteConfirmation,
    setDeleteConfirmation,
  ] = useState(
    '',
  );

  const selectedWorkspace =
    useMemo(
      () =>
        workspaces.find(
          workspace =>
            workspace.tenantId ===
            tenantId,
        ) ||
        null,
      [
        tenantId,
        workspaces,
      ],
    );

  async function run(
    key:
      string,
    payload:
      Record<
        string,
        unknown
      >,
    successMessage:
      string,
  ) {
    if (
      busy
    ) {
      return;
    }

    setBusy(
      key,
    );

    setFailure(
      null,
    );

    setNotice(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/admin/operations/recovery',
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      const data =
        await response.json() as
          ApiResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'Recovery operation failed.',
        );
      }

      setNotice(
        successMessage,
      );

      router.refresh();
    } catch (
      actionError
    ) {
      setFailure(
        actionError instanceof
          Error
          ? actionError.message
          : 'Recovery operation failed.',
      );
    } finally {
      setBusy(
        '',
      );
    }
  }


  async function createRecoveryPoint() {
    if (
      !tenantId
    ) {
      setFailure(
        'Select a workspace first.',
      );

      return;
    }

    await run(
      'create',
      {
        action:
          'create',
        tenantId,
        reason,
      },
      'Recovery point created and recorded.',
    );

    setReason(
      '',
    );
  }


  async function verifyPoint(
    point:
      PlatformRecoveryPointSummary,
  ) {
    await run(
      'verify:' +
      point.id,
      {
        action:
          'verify',
        tenantId:
          point.tenantId,
        recoveryPointId:
          point.id,
      },
      'Recovery point verification completed.',
    );
  }


  async function restore() {
    if (
      !restorePoint
    ) {
      return;
    }

    await run(
      'restore:' +
      restorePoint.id,
      {
        action:
          'restore',
        tenantId:
          restorePoint.tenantId,
        recoveryPointId:
          restorePoint.id,
        targetDatabaseName,
        confirmation:
          restoreConfirmation,
      },
      'Recovery point restored into the fresh database. No production cutover was performed.',
    );

    setRestorePoint(
      null,
    );

    setTargetDatabaseName(
      '',
    );

    setRestoreConfirmation(
      '',
    );
  }


  async function deleteRecoveryPoint() {
    if (
      !deletePoint
    ) {
      return;
    }

    await run(
      'delete:' +
      deletePoint.id,
      {
        action:
          'delete',
        tenantId:
          deletePoint.tenantId,
        recoveryPointId:
          deletePoint.id,
        confirmation:
          deleteConfirmation,
      },
      'Recovery point deleted from backup storage.',
    );

    setDeletePoint(
      null,
    );

    setDeleteConfirmation(
      '',
    );
  }


  if (
    !available
  ) {
    return (
      <section className="rounded-[24px] border border-amber-300/70 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />

          <div>
            <h2 className="font-black text-amber-950 dark:text-amber-100">
              Recovery operations are not ready
            </h2>

            <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-200/90">
              {error ||
                'Recovery data could not be loaded.'}
            </p>
          </div>
        </div>
      </section>
    );
  }


  return (
    <div className="space-y-6">
      {notice ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/70 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {notice}
          </span>
        </div>
      ) : null}

      {failure ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-300/70 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {failure}
          </span>
        </div>
      ) : null}

      <section className="rounded-[24px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <Archive className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-zinc-950 dark:text-white">
              Create tenant recovery point
            </h2>

            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              SaMi creates a logical PostgreSQL backup and stores it in the configured private backup storage. Production is not overwritten.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="space-y-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300">
            Workspace

            <select
              value={
                tenantId
              }
              onChange={
                event =>
                  setTenantId(
                    event.target.value,
                  )
              }
              disabled={
                !canManage ||
                Boolean(busy)
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
            >
              {workspaces.map(
                workspace => (
                  <option
                    key={
                      workspace.tenantId
                    }
                    value={
                      workspace.tenantId
                    }
                  >
                    {workspace.tenantName}
                    {' — '}
                    {workspace.databaseName ||
                      'No database'}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300">
            Reason

            <input
              value={
                reason
              }
              onChange={
                event =>
                  setReason(
                    event.target.value,
                  )
              }
              maxLength={
                500
              }
              disabled={
                !canManage ||
                Boolean(busy)
              }
              placeholder="Before migration, support recovery, scheduled safety point..."
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
            />
          </label>

          <button
            type="button"
            onClick={
              createRecoveryPoint
            }
            disabled={
              !canManage ||
              !selectedWorkspace
              ?.databaseName ||
              Boolean(busy)
            }
            className="self-end rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ===
              'create'
              ? 'Creating…'
              : 'Create backup'}
          </button>
        </div>

        {selectedWorkspace ? (
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
              <span className="text-zinc-500">
                Database status
              </span>

              <strong className="mt-1 block text-zinc-950 dark:text-white">
                {selectedWorkspace.databaseStatus}
              </strong>
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
              <span className="text-zinc-500">
                Available backups
              </span>

              <strong className="mt-1 block text-zinc-950 dark:text-white">
                {selectedWorkspace.availableRecoveryPoints}
              </strong>
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
              <span className="text-zinc-500">
                Last recovery point
              </span>

              <strong className="mt-1 block text-zinc-950 dark:text-white">
                {formatDate(
                  selectedWorkspace.lastRecoveryAt,
                )}
              </strong>
            </div>
          </div>
        ) : null}

        {!canManage ? (
          <p className="mt-4 text-xs text-zinc-500">
            Your administrator role can inspect recovery status but cannot create, restore or delete recovery points.
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-300" />

            <div>
              <h2 className="font-black text-zinc-950 dark:text-white">
                Recovery points
              </h2>

              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Recent tenant backups and their verification state. Provider object references and credentials are intentionally hidden.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3">
                  Workspace
                </th>
                <th className="px-4 py-3">
                  Source
                </th>
                <th className="px-4 py-3">
                  Status
                </th>
                <th className="px-4 py-3">
                  Requested
                </th>
                <th className="px-4 py-3">
                  Verified
                </th>
                <th className="px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {recoveryPoints.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      6
                    }
                    className="px-4 py-10 text-center text-zinc-500"
                  >
                    No recovery points have been recorded yet.
                  </td>
                </tr>
              ) : (
                recoveryPoints.map(
                  point => (
                    <tr
                      key={
                        point.id
                      }
                      className="align-top"
                    >
                      <td className="px-4 py-4">
                        <strong className="block text-zinc-950 dark:text-white">
                          {point.tenantName}
                        </strong>

                        <span className="mt-1 block max-w-44 truncate font-mono text-[10px] text-zinc-400">
                          {point.id}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <strong className="block font-mono text-zinc-800 dark:text-zinc-200">
                          {point.sourceDatabaseName}
                        </strong>

                        <span className="mt-1 block text-zinc-500">
                          {point.provider}
                          {' · '}
                          {point.recoveryType}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={
                            'inline-flex rounded-full px-2.5 py-1 font-black ' +
                            statusClass(
                              point.status,
                            )
                          }
                        >
                          {point.status}
                        </span>

                        {point.failureMessage ? (
                          <span className="mt-2 block max-w-56 text-[11px] leading-5 text-red-600 dark:text-red-300">
                            {point.failureMessage}
                          </span>
                        ) : null}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-zinc-500">
                        {formatDate(
                          point.requestedAt,
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-zinc-500">
                        {formatDate(
                          point.lastVerifiedAt,
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex min-w-60 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={
                              () =>
                                verifyPoint(
                                  point,
                                )
                            }
                            disabled={
                              !canManage ||
                              Boolean(busy) ||
                              point.status ===
                                'deleted'
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-2 font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Verify
                          </button>

                          <button
                            type="button"
                            onClick={
                              () => {
                                setRestorePoint(
                                  point,
                                );

                                setTargetDatabaseName(
                                  '',
                                );

                                setRestoreConfirmation(
                                  '',
                                );

                                setDeletePoint(
                                  null,
                                );
                              }
                            }
                            disabled={
                              !canManage ||
                              Boolean(busy) ||
                              point.status !==
                                'available'
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-2 font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-40 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-500/10"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>

                          <button
                            type="button"
                            onClick={
                              () => {
                                setDeletePoint(
                                  point,
                                );

                                setDeleteConfirmation(
                                  '',
                                );

                                setRestorePoint(
                                  null,
                                );
                              }
                            }
                            disabled={
                              !canManage ||
                              Boolean(busy) ||
                              point.status ===
                                'deleted'
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-2 font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {restorePoint ? (
        <section className="rounded-[24px] border border-blue-300 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10">
          <div className="flex items-start gap-3">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />

            <div className="min-w-0 flex-1">
              <h2 className="font-black text-blue-950 dark:text-blue-100">
                Restore into a fresh database
              </h2>

              <p className="mt-1 text-xs leading-5 text-blue-800 dark:text-blue-200/90">
                This never overwrites the active tenant database and never performs registry cutover. After verification, cutover remains a separate administrative decision.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5 text-xs font-bold text-blue-950 dark:text-blue-100">
                  Fresh database name

                  <input
                    value={
                      targetDatabaseName
                    }
                    onChange={
                      event => {
                        setTargetDatabaseName(
                          event.target.value,
                        );

                        setRestoreConfirmation(
                          '',
                        );
                      }
                    }
                    placeholder="sami_restore_workspace_20260923"
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-950 outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-zinc-950 dark:text-white"
                  />
                </label>

                <label className="space-y-1.5 text-xs font-bold text-blue-950 dark:text-blue-100">
                  Type confirmation

                  <input
                    value={
                      restoreConfirmation
                    }
                    onChange={
                      event =>
                        setRestoreConfirmation(
                          event.target.value,
                        )
                    }
                    placeholder={
                      targetDatabaseName
                        ? 'RESTORE ' +
                          targetDatabaseName
                        : 'RESTORE <fresh_database_name>'
                    }
                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-950 outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-zinc-950 dark:text-white"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={
                    restore
                  }
                  disabled={
                    Boolean(busy) ||
                    !targetDatabaseName ||
                    restoreConfirmation !==
                      'RESTORE ' +
                        targetDatabaseName
                  }
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {busy ===
                    'restore:' +
                      restorePoint.id
                    ? 'Restoring…'
                    : 'Restore safely'}
                </button>

                <button
                  type="button"
                  onClick={
                    () =>
                      setRestorePoint(
                        null,
                      )
                  }
                  disabled={
                    Boolean(busy)
                  }
                  className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-black text-blue-900 dark:border-blue-800 dark:text-blue-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {deletePoint ? (
        <section className="rounded-[24px] border border-red-300 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/10">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />

            <div className="min-w-0 flex-1">
              <h2 className="font-black text-red-950 dark:text-red-100">
                Delete recovery point
              </h2>

              <p className="mt-1 text-xs leading-5 text-red-800 dark:text-red-200/90">
                This removes the backup object and marks the recovery point deleted. It does not delete the tenant workspace or production database.
              </p>

              <label className="mt-4 block max-w-xl space-y-1.5 text-xs font-bold text-red-950 dark:text-red-100">
                Type DELETE BACKUP

                <input
                  value={
                    deleteConfirmation
                  }
                  onChange={
                    event =>
                      setDeleteConfirmation(
                        event.target.value,
                      )
                  }
                  placeholder="DELETE BACKUP"
                  className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 font-mono text-sm text-zinc-950 outline-none focus:border-red-500 dark:border-red-900 dark:bg-zinc-950 dark:text-white"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={
                    deleteRecoveryPoint
                  }
                  disabled={
                    Boolean(busy) ||
                    deleteConfirmation !==
                      'DELETE BACKUP'
                  }
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {busy ===
                    'delete:' +
                      deletePoint.id
                    ? 'Deleting…'
                    : 'Delete backup'}
                </button>

                <button
                  type="button"
                  onClick={
                    () =>
                      setDeletePoint(
                        null,
                      )
                  }
                  disabled={
                    Boolean(busy)
                  }
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-black text-red-900 dark:border-red-800 dark:text-red-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
