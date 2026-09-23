'use client';

import {
  Activity,
  Ban,
  Loader2,
  RotateCcw,
  Wrench,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


type Action =
  | 'health_check'
  | 'maintenance_on'
  | 'maintenance_off'
  | 'suspend'
  | 'reactivate';


export default function WorkspaceControlActions({
  tenantId,
  workspaceStatus,
  databaseHealthStatus,
}: {
  tenantId:
    string;
  workspaceStatus:
    string;
  databaseHealthStatus:
    string;
}) {
  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] =
    useState<
      Action |
      null
    >(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null,
    );


  async function run(
    action:
      Action,
  ) {
    if (
      loading
    ) {
      return;
    }

    let reason:
      string |
      null =
      null;

    if (
      action ===
        'suspend' ||
      action ===
        'reactivate' ||
      action ===
        'maintenance_on'
    ) {
      const entered =
        window.prompt(
          action ===
            'suspend'
            ? 'Reason for suspending this workspace'
            : action ===
                'reactivate'
              ? 'Reason for reactivating this workspace'
              : 'Reason for enabling database maintenance',
          '',
        );

      if (
        entered ===
          null
      ) {
        return;
      }

      reason =
        entered
          .trim();

      if (
        !reason
      ) {
        setError(
          'An administrative reason is required.',
        );

        return;
      }
    }

    if (
      action ===
        'suspend' &&
      !window.confirm(
        'Suspend this workspace? Users currently inside it will be moved out of the workspace, but their SaMi identities and other workspace memberships remain active.',
      )
    ) {
      return;
    }

    setLoading(
      action,
    );

    setError(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${encodeURIComponent(
            tenantId,
          )}/control`,
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
                action,
                reason,
              }),
          },
        );

      const data =
        await response
          .json()
          .catch(
            () => ({
              success:
                false,
            }),
          ) as {
            success?:
              boolean;
            error?:
              string;
          };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not complete this workspace operation.',
        );
      }

      router.refresh();
    } catch (
      candidate
    ) {
      setError(
        candidate instanceof
          Error
          ? candidate.message
          : 'SaMi could not complete this workspace operation.',
      );
    } finally {
      setLoading(
        null,
      );
    }
  }


  const status =
    workspaceStatus
      .trim()
      .toLowerCase();

  const maintenance =
    databaseHealthStatus
      .trim()
      .toLowerCase() ===
      'maintenance';

  return (
    <div className="min-w-[250px]">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={
            Boolean(
              loading,
            )
          }
          onClick={() =>
            void run(
              'health_check',
            )
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {loading ===
            'health_check' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Activity className="h-3 w-3" />
          )}
          Check health
        </button>

        <button
          type="button"
          disabled={
            Boolean(
              loading,
            )
          }
          onClick={() =>
            void run(
              maintenance
                ? 'maintenance_off'
                : 'maintenance_on',
            )
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {loading ===
            'maintenance_on' ||
          loading ===
            'maintenance_off' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wrench className="h-3 w-3" />
          )}
          {maintenance
            ? 'End maintenance'
            : 'Maintenance'}
        </button>

        {status ===
          'suspended' ? (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              )
            }
            onClick={() =>
              void run(
                'reactivate',
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-[10px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ===
              'reactivate' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Reactivate
          </button>
        ) : (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              ) ||
              status !==
                'active'
            }
            onClick={() =>
              void run(
                'suspend',
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 text-[10px] font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ===
              'suspend' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Ban className="h-3 w-3" />
            )}
            Suspend
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[10px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
