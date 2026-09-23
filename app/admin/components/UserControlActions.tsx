'use client';

import {
  Ban,
  KeyRound,
  Loader2,
  LockKeyhole,
  RotateCcw,
  UnlockKeyhole,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


type Action =
  | 'lock'
  | 'unlock'
  | 'suspend'
  | 'reactivate'
  | 'revoke_sessions';


export default function UserControlActions({
  userId,
  status,
  lockedUntil,
}: {
  userId:
    string;
  status:
    string;
  lockedUntil:
    string |
    null;
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

    let reason =
      '';

    let lockMinutes:
      number |
      undefined;

    if (
      action ===
        'lock' ||
      action ===
        'suspend' ||
      action ===
        'reactivate' ||
      action ===
        'revoke_sessions'
    ) {
      const entered =
        window.prompt(
          action ===
            'lock'
            ? 'Reason for locking this account'
            : action ===
                'suspend'
              ? 'Reason for suspending this account'
              : action ===
                  'reactivate'
                ? 'Reason for reactivating this account'
                : 'Reason for revoking all sessions',
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
        'lock'
    ) {
      const entered =
        window.prompt(
          'Lock duration in minutes (5–10080)',
          '60',
        );

      if (
        entered ===
          null
      ) {
        return;
      }

      lockMinutes =
        Number(
          entered,
        );

      if (
        !Number.isInteger(
          lockMinutes,
        ) ||
        lockMinutes <
          5 ||
        lockMinutes >
          10080
      ) {
        setError(
          'Lock duration must be between 5 minutes and 7 days.',
        );

        return;
      }
    }

    if (
      action ===
        'suspend' &&
      !window.confirm(
        'Suspend this SaMi identity and revoke its active sessions?',
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
          `/api/admin/users/${encodeURIComponent(
            userId,
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
                reason:
                  reason ||
                  null,
                lockMinutes:
                  lockMinutes ??
                  null,
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
          'SaMi could not complete this security action.',
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
          : 'SaMi could not complete this security action.',
      );
    } finally {
      setLoading(
        null,
      );
    }
  }


  const normalized =
    status
      .trim()
      .toLowerCase();

  const locked =
    Boolean(
      lockedUntil &&
      new Date(
        lockedUntil,
      ).getTime() >
        Date.now(),
    ) ||
    normalized ===
      'locked';

  return (
    <div className="min-w-[220px]">
      <div className="flex flex-wrap gap-1.5">
        {locked ? (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              )
            }
            onClick={() =>
              void run(
                'unlock',
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {loading ===
              'unlock' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UnlockKeyhole className="h-3 w-3" />
            )}
            Unlock
          </button>
        ) : (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              )
            }
            onClick={() =>
              void run(
                'lock',
              )
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {loading ===
              'lock' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <LockKeyhole className="h-3 w-3" />
            )}
            Lock
          </button>
        )}

        {normalized ===
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
              )
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

        <button
          type="button"
          disabled={
            Boolean(
              loading,
            )
          }
          onClick={() =>
            void run(
              'revoke_sessions',
            )
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {loading ===
            'revoke_sessions' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
          Revoke sessions
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[10px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
