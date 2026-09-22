'use client';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

import {
  loadStripe,
} from '@stripe/stripe-js';

import {
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

function StripeSetupForm({
  onCompleted,
  onError,
}: {
  onCompleted:
    () =>
      Promise<void>;
  onError:
    (
      message:
        string,
    ) =>
      void;
}) {
  const stripe =
    useStripe();

  const elements =
    useElements();

  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  async function submit() {
    if (
      !stripe ||
      !elements ||
      busy
    ) {
      return;
    }

    setBusy(
      true,
    );

    try {
      const result =
        await stripe.confirmSetup({
          elements,
          confirmParams: {
            return_url:
              `${window.location.origin}/settings?tab=billing&billing_setup=return`,
          },
          redirect:
            'if_required',
        });

      if (
        result.error
      ) {
        throw new Error(
          result.error
            .message ||
          'Stripe could not save the payment method.',
        );
      }

      await onCompleted();
    } catch (
      error
    ) {
      onError(
        error instanceof
          Error
          ? error.message
          : 'Automatic billing setup could not be completed.',
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement />

      <div className="flex items-start gap-2 rounded-xl border border-[var(--sami-border)] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-5 text-slate-500">
          No charge is made today. Your payment method is authorized for future subscription billing after the free month.
        </p>
      </div>

      <button
        type="button"
        onClick={
          submit
        }
        disabled={
          !stripe ||
          !elements ||
          busy
        }
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
      >
        {busy && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        Save payment method
      </button>
    </div>
  );
}

export default function StripeRecurringSetup({
  publicKey,
  clientSecret,
  onCompleted,
  onError,
}: {
  publicKey:
    string;
  clientSecret:
    string;
  onCompleted:
    () =>
      Promise<void>;
  onError:
    (
      message:
        string,
    ) =>
      void;
}) {
  const stripePromise =
    useMemo(
      () =>
        loadStripe(
          publicKey,
        ),
      [
        publicKey,
      ],
    );

  return (
    <Elements
      stripe={
        stripePromise
      }
      options={{
        clientSecret,
        appearance: {
          variables: {
            borderRadius:
              '12px',
          },
        },
      }}
    >
      <StripeSetupForm
        onCompleted={
          onCompleted
        }
        onError={
          onError
        }
      />
    </Elements>
  );
}
