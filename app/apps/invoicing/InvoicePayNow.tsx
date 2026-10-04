'use client';

import {
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  useState,
} from 'react';

type Option = {
  provider:
    'pesapal' |
    'stripe' |
    'paystack' |
    'flutterwave' |
    'paypal';
  name: string;
  environment:
    'sandbox' |
    'live';
};

type PaymentStatus =
  | 'paid'
  | 'pending'
  | 'cancelled'
  | 'failed'
  | null;

export default function InvoicePayNow({
  access,
  tenantId,
  token,
  invoiceId,
  balanceDue,
  currency,
  providers,
  paymentStatus,
}: {
  access:
    'public' |
    'portal';
  tenantId: string;
  token: string;
  invoiceId: string;
  balanceDue: number;
  currency: string;
  providers: Option[];
  paymentStatus:
    PaymentStatus;
}) {
  const [
    busy,
    setBusy,
  ] =
    useState<
      string |
      null
    >(null);
  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(null);

  async function start(
    provider:
      Option['provider'],
  ) {
    setBusy(
      provider,
    );
    setError(
      null,
    );

    try {
      const response =
        await fetch(
          '/api/public/invoicing/payment-checkout/' +
            encodeURIComponent(access) +
            '/' +
            encodeURIComponent(tenantId) +
            '/' +
            encodeURIComponent(token) +
            '/' +
            encodeURIComponent(invoiceId),
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            credentials:
              'same-origin',
            cache:
              'no-store',
            body:
              JSON.stringify({
                provider,
              }),
          },
        );

      const body =
        await response.json() as {
          success?:
            boolean;
          error?:
            string;
          result?: {
            checkoutUrl?:
              string;
          };
        };

      if (
        !response.ok ||
        body.success !==
          true ||
        !body.result
          ?.checkoutUrl
      ) {
        throw new Error(
          body.error ||
          'SaMi could not start this payment.',
        );
      }

      window.location.assign(
        body.result
          .checkoutUrl,
      );
    } catch (
      checkoutError
    ) {
      setError(
        checkoutError instanceof
          Error
          ? checkoutError.message
          : 'SaMi could not start this payment.',
      );
      setBusy(
        null,
      );
    }
  }

  if (
    balanceDue <=
      0
  ) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">
              Paid in full
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">
              This invoice has no outstanding balance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (
    providers.length ===
      0 &&
    !paymentStatus
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {
        paymentStatus
          ? (
              <PaymentNotice
                status={
                  paymentStatus
                }
              />
            )
          : null
      }

      {
        providers.length >
          0
          ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-blue-950">
                      Pay securely online
                    </p>
                    <p className="mt-1 text-xs leading-5 text-blue-800">
                      Choose a payment provider. SaMi will use the invoice reference automatically and update the invoice after the provider verifies the payment.
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {
                        providers.map(
                          provider => (
                            <button
                              key={
                                provider.provider
                              }
                              type="button"
                              disabled={
                                busy !==
                                null
                              }
                              onClick={() =>
                                void start(
                                  provider.provider,
                                )
                              }
                              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-left text-xs font-black text-slate-900 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="flex items-center gap-2">
                                {
                                  busy ===
                                  provider.provider
                                    ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
                                      )
                                    : (
                                        <CreditCard className="h-4 w-4 text-blue-700" />
                                      )
                                }
                                Pay with {
                                  provider.name
                                }
                              </span>
                              {
                                provider.environment ===
                                  'sandbox'
                                  ? (
                                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] uppercase text-amber-800">
                                        Test
                                      </span>
                                    )
                                  : null
                              }
                            </button>
                          ),
                        )
                      }
                    </div>

                    <p className="mt-3 text-[10px] leading-4 text-blue-700">
                      Amount due: {
                        currency
                      } {
                        balanceDue.toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits:
                              2,
                            maximumFractionDigits:
                              2,
                          },
                        )
                      }
                    </p>
                  </div>
                </div>

                {
                  error
                    ? (
                        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            {
                              error
                            }
                          </span>
                        </div>
                      )
                    : null
                }
              </div>
            )
          : null
      }
    </div>
  );
}

function PaymentNotice({
  status,
}: {
  status:
    Exclude<
      PaymentStatus,
      null
    >;
}) {
  const content =
    status === 'paid'
      ? {
          title:
            'Payment verified',
          detail:
            'SaMi verified the provider payment and updated the invoice. The balance shown below is current.',
          className:
            'border-emerald-200 bg-emerald-50 text-emerald-900',
        }
      : status ===
          'pending'
        ? {
            title:
              'Payment processing',
            detail:
              'The provider has not confirmed a completed payment yet. SaMi will also process the signed provider notification when it arrives.',
            className:
              'border-amber-200 bg-amber-50 text-amber-900',
          }
        : status ===
            'cancelled'
          ? {
              title:
                'Payment cancelled',
              detail:
                'No payment was posted. You can start a new payment below.',
              className:
                'border-slate-200 bg-slate-50 text-slate-800',
            }
          : {
              title:
                'Payment could not be verified',
              detail:
                'No unverified payment was posted. Check the provider result or try again.',
              className:
                'border-rose-200 bg-rose-50 text-rose-900',
            };

  return (
    <div
      className={[
        'rounded-2xl border p-4',
        content.className,
      ].join(
        ' ',
      )}
    >
      <div className="flex items-start gap-3">
        {
          status ===
            'paid'
            ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              )
            : (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
              )
        }
        <div>
          <p className="text-sm font-black">
            {
              content.title
            }
          </p>
          <p className="mt-1 text-xs leading-5 opacity-80">
            {
              content.detail
            }
          </p>
        </div>
      </div>
    </div>
  );
}
