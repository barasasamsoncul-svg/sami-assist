'use client';

import {
  Loader2,
  RefreshCw,
} from 'lucide-react';

import {
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';


export default function BillingReconcileButton() {
  const router =
    useRouter();

  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      string |
      null
    >(
      null,
    );


  async function reconcile() {
    if (
      loading
    ) {
      return;
    }

    setLoading(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/admin/operations/billing/reconcile',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              Accept:
                'application/json',
            },
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
            report?: {
              checked?:
                number;
              statusUpdated?:
                number;
              recurringUpdated?:
                number;
              failures?:
                number;
            };
          };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          'SaMi could not reconcile subscriptions.',
        );
      }

      const report =
        data.report ||
        {};

      setMessage(
        `Checked ${report.checked || 0}; status updates ${report.statusUpdated || 0}; provider updates ${report.recurringUpdated || 0}; failures ${report.failures || 0}.`,
      );

      router.refresh();
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : 'SaMi could not reconcile subscriptions.',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }


  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={
          loading
        }
        onClick={() =>
          void reconcile()
        }
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-[11px] font-black text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Reconcile billing
      </button>

      {message && (
        <p className="max-w-[320px] text-right text-[9px] leading-4 text-zinc-500">
          {message}
        </p>
      )}
    </div>
  );
}
