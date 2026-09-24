'use client';

import {
  useState,
} from 'react';

import {
  Check,
  X,
} from 'lucide-react';


export default function PublicSalesQuoteActions({
  tenantId,
  token,
  allowAcceptance,
  allowRejection,
}: {
  tenantId:
    string;
  token:
    string;
  allowAcceptance:
    boolean;
  allowRejection:
    boolean;
}) {
  const [
    busy,
    setBusy,
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

  async function respond(
    action:
      'accept' |
      'reject',
  ) {
    const reason =
      action ===
        'reject'
        ? (
            window.prompt(
              'Optional reason for declining this quotation',
            ) ||
            undefined
          )
        : undefined;

    setBusy(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/public/sales/' +
          encodeURIComponent(
            tenantId,
          ) +
          '/' +
          encodeURIComponent(
            token,
          ),
          {
            method:
              'POST',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                action,
                reason,
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
          'Your quotation response could not be saved.',
        );
      }

      setMessage(
        action ===
          'accept'
          ? 'Quotation accepted successfully.'
          : 'Quotation declined successfully.',
      );

      window.setTimeout(
        () => {
          window.location
            .reload();
        },
        700,
      );
    } catch (
      error
    ) {
      setMessage(
        error instanceof
          Error
          ? error.message
          : 'Your quotation response could not be saved.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  if (
    !allowAcceptance &&
    !allowRejection
  ) {
    return null;
  }

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black">
        Respond to this quotation
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        Your response is recorded securely against this quotation.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {
          allowAcceptance &&
          (
            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  void respond(
                    'accept',
                  )
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
          )
        }

        {
          allowRejection &&
          (
            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  void respond(
                    'reject',
                  )
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-black text-red-700 disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              Decline
            </button>
          )
        }
      </div>

      {
        message &&
        (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            {
              message
            }
          </p>
        )
      }
    </div>
  );
}
