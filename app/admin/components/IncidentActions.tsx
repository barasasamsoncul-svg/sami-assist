'use client';

import {
  CheckCircle2,
  EyeOff,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


type IncidentAction =
  | 'acknowledge'
  | 'resolve'
  | 'ignore'
  | 'reopen';


export default function IncidentActions({
  incidentId,
  status,
  canManage,
}: {
  incidentId:
    string;
  status:
    string;
  canManage:
    boolean;
}) {
  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] =
    useState<
      IncidentAction |
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
      IncidentAction,
  ) {
    if (
      !canManage ||
      loading
    ) {
      return;
    }

    let note:
      string |
      null =
      null;

    if (
      action ===
        'resolve' ||
      action ===
        'ignore'
    ) {
      const value =
        window.prompt(
          action ===
            'resolve'
            ? 'Optional resolution note'
            : 'Why should this incident be ignored?',
          '',
        );

      if (
        value ===
          null
      ) {
        return;
      }

      note =
        value
          .trim()
          .slice(
            0,
            4000,
          ) ||
        null;
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
          `/api/admin/operations/incidents/${encodeURIComponent(
            incidentId,
          )}`,
          {
            method:
              'PATCH',
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
                note,
              }),
          },
        );

      let data:
        {
          success?:
            boolean;
          error?:
            string;
        } =
        {};

      try {
        data =
          await response.json();
      } catch {
        data =
          {};
      }

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not update this incident.',
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
          : 'SaMi could not update this incident.',
      );
    } finally {
      setLoading(
        null,
      );
    }
  }


  if (
    !canManage
  ) {
    return null;
  }

  const active =
    status ===
      'open' ||
    status ===
      'acknowledged';

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status ===
          'open' && (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              )
            }
            onClick={() =>
              void run(
                'acknowledge',
              )
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {loading ===
              'acknowledge' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Acknowledge
          </button>
        )}

        {active && (
          <>
            <button
              type="button"
              disabled={
                Boolean(
                  loading,
                )
              }
              onClick={() =>
                void run(
                  'resolve',
                )
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-[11px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ===
                'resolve' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Resolve
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
                  'ignore',
                )
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {loading ===
                'ignore' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              Ignore
            </button>
          </>
        )}

        {!active && (
          <button
            type="button"
            disabled={
              Boolean(
                loading,
              )
            }
            onClick={() =>
              void run(
                'reopen',
              )
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {loading ===
              'reopen' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reopen
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
