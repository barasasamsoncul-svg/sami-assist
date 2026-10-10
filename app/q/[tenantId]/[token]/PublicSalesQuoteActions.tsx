'use client';

import {
  useState,
} from 'react';

import {
  Check,
  MessageCircle,
  X,
} from 'lucide-react';

import {
  SALES_QUOTE_ELECTRONIC_SIGNATURE_CONSENT,
} from '@/lib/apps/sales/signature';


export default function PublicSalesQuoteActions({
  tenantId,
  token,
  allowAcceptance,
  allowRejection,
  optionalItems,
  currency,
}: {
  tenantId:
    string;
  token:
    string;
  allowAcceptance:
    boolean;
  allowRejection:
    boolean;
  currency:
    string;
  optionalItems:
    Array<{
      id: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
      isSelected: boolean;
    }>;
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

  const [
    selectedOptionalItemIds,
    setSelectedOptionalItemIds,
  ] =
    useState<
      string[]
    >(
      optionalItems
        .filter(
          item =>
            item.isSelected,
        )
        .map(
          item =>
            item.id,
        ),
    );

  const [
    signerName,
    setSignerName,
  ] =
    useState(
      '',
    );

  const [
    signerEmail,
    setSignerEmail,
  ] =
    useState(
      '',
    );

  const [
    acceptanceNote,
    setAcceptanceNote,
  ] =
    useState('');

  const [signatureConsentAccepted, setSignatureConsentAccepted] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionRequestReason, setRevisionRequestReason] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');

  async function respond(action: 'accept' | 'reject' | 'request_revision') {
    const reason = action === 'reject'
      ? rejectionReason.trim()
      : action === 'request_revision'
        ? revisionRequestReason.trim()
        : undefined;

    if (action === 'reject' && !reason) {
      setMessage('Enter a reason for declining this quotation.');
      return;
    }
    if (action === 'request_revision' && (!reason || reason.length < 5)) {
      setMessage('Describe the changes you are requesting (at least 5 characters).');
      return;
    }
    if (action === 'request_revision' && requesterName.trim().length < 2) {
      setMessage('Enter your name so the sales team can follow up.');
      return;
    }

    if (action === 'accept' && !signerName.trim()) {
      setMessage('Enter the name of the person accepting this quotation.');
      return;
    }

    if (action === 'accept' && !signatureConsentAccepted) {
      setMessage('Confirm the electronic signature statement before accepting this quotation.');
      return;
    }

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
                signerName:
                  action ===
                    'accept'
                    ? signerName
                    : undefined,
                signerEmail:
                  action === 'accept'
                    ? signerEmail
                    : undefined,
                signatureConsent: action === 'accept' ? signatureConsentAccepted : undefined,
                requesterName: action === 'request_revision' ? requesterName : undefined,
                requesterEmail: action === 'request_revision' ? requesterEmail : undefined,
                acceptanceNote:
                  action ===
                    'accept'
                    ? acceptanceNote
                    : undefined,
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
        action === 'accept'
          ? 'Quotation acceptance recorded.'
          : action === 'reject'
            ? 'Quotation declined successfully.'
            : 'Your request for quotation changes has been sent to the sales team.',
      );

      if (action !== 'request_revision') {
        window.setTimeout(() => window.location.reload(), 700);
      }
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

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-black">
        Respond to this quotation
      </p>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        Your acceptance, decline or change request is recorded against this quotation.
      </p>

      {
        allowAcceptance &&
        optionalItems.length >
          0 &&
        (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
              Optional products
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Select any extras you want included before accepting. Your accepted quotation total will be recalculated securely.
            </p>

            <div className="mt-3 space-y-2">
              {
                optionalItems.map(
                  item => {
                    const selected =
                      selectedOptionalItemIds.includes(
                        item.id,
                      );

                    const net =
                      item.quantity *
                      item.unitPrice;

                    const total =
                      net +
                      net *
                      item.taxRate /
                      100;

                    return (
                      <label
                        key={
                          item.id
                        }
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <input
                          type="checkbox"
                          checked={
                            selected
                          }
                          onChange={
                            event =>
                              setSelectedOptionalItemIds(
                                current =>
                                  event.target
                                    .checked
                                    ? Array.from(
                                        new Set([
                                          ...current,
                                          item.id,
                                        ]),
                                      )
                                    : current.filter(
                                        id =>
                                          id !==
                                            item.id,
                                      ),
                              )
                          }
                          className="mt-0.5 h-4 w-4"
                        />

                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-black text-slate-900">
                            {
                              item.description
                            }
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-500">
                            {
                              item.quantity
                            } {
                              item.unit
                            } · {
                              new Intl
                                .NumberFormat(
                                  'en-KE',
                                  {
                                    style:
                                      'currency',
                                    currency,
                                    maximumFractionDigits:
                                      2,
                                  },
                                )
                                .format(
                                  total,
                                )
                            }
                          </span>
                        </span>
                      </label>
                    );
                  },
                )
              }
            </div>
          </div>
        )
      }

      {
        allowAcceptance &&
        (
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Accepted by
              </label>
              <input
                value={
                  signerName
                }
                onChange={
                  event =>
                    setSignerName(
                      event.target.value,
                    )
                }
                maxLength={
                  255
                }
                placeholder="Full name"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Email
              </label>
              <input
                type="email"
                value={
                  signerEmail
                }
                onChange={
                  event =>
                    setSignerEmail(
                      event.target.value,
                    )
                }
                maxLength={
                  320
                }
                placeholder="name@company.com"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Acceptance note
              </label>
              <textarea
                value={
                  acceptanceNote
                }
                onChange={
                  event =>
                    setAcceptanceNote(
                      event.target.value,
                    )
                }
                maxLength={
                  2000
                }
                rows={
                  3
                }
                placeholder="Optional purchase instruction or acceptance note"
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <p className="text-[10px] leading-4 text-slate-500">
              Your name, optional email, acceptance note, electronic-signature statement and server timestamp are recorded with the quotation.
            </p>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
              <input
                type="checkbox"
                checked={signatureConsentAccepted}
                onChange={event => setSignatureConsentAccepted(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span>{SALES_QUOTE_ELECTRONIC_SIGNATURE_CONSENT}</span>
            </label>
          </div>
        )
      }

      {allowRejection && (
        <div className="mt-4 space-y-2">
          <label htmlFor="quote-rejection-reason" className="text-xs font-bold text-slate-700">Reason for declining</label>
          <textarea id="quote-rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} maxLength={2000} rows={2} disabled={busy} placeholder="Tell the seller why this quotation does not work for you." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </div>
      )}

      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div><p className="text-sm font-black">Request changes instead</p><p className="mt-1 text-xs leading-5 text-slate-500">Ask for a revision without accepting or declining the current quotation. The quotation remains open while the sales team reviews your request.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="quote-requester-name" className="text-xs font-bold text-slate-700">Your name</label><input id="quote-requester-name" value={requesterName} onChange={event => setRequesterName(event.target.value)} maxLength={255} disabled={busy} placeholder="Full name" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></div>
          <div><label htmlFor="quote-requester-email" className="text-xs font-bold text-slate-700">Email (optional)</label><input id="quote-requester-email" type="email" value={requesterEmail} onChange={event => setRequesterEmail(event.target.value)} maxLength={320} disabled={busy} placeholder="name@company.com" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></div>
        </div>
        <div><label htmlFor="quote-revision-request" className="text-xs font-bold text-slate-700">Requested changes</label><textarea id="quote-revision-request" value={revisionRequestReason} onChange={event => setRevisionRequestReason(event.target.value)} maxLength={2000} rows={3} disabled={busy} placeholder="Describe pricing, quantities, delivery, terms or other changes you need." className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" /></div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
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

        <button type="button" disabled={busy} onClick={() => void respond('request_revision')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-sm font-black text-blue-800 disabled:opacity-60">
          <MessageCircle className="h-4 w-4" />
          Request changes
        </button>
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
