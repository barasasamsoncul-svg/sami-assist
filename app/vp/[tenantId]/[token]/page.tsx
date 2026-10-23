import { notFound } from 'next/navigation';
import VendorPortalResponseForm from '@/app/vp/[tenantId]/[token]/VendorPortalResponseForm';
import {
  getVendorPortalPublicView,
  VendorPortalError,
} from '@/lib/apps/vendor_portal/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string | null) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusClass(status: string) {
  if (['responded', 'awarded', 'accepted'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (['cancelled', 'closed', 'rejected'].includes(status)) return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

export default async function VendorPortalPublicPage({
  params,
}: {
  params: Promise<{ tenantId: string; token: string }>;
}) {
  const { tenantId, token } = await params;
  let portal: Awaited<ReturnType<typeof getVendorPortalPublicView>>;
  try {
    portal = await getVendorPortalPublicView(tenantId, token);
  } catch (error) {
    if (error instanceof VendorPortalError && error.code === 'ACCESS_NOT_FOUND') notFound();
    throw error;
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950" data-vendor-portal-public="true">
      <meta name="robots" content="noindex,nofollow" />
      <meta name="referrer" content="no-referrer" />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Secure supplier portal</p>
            <h1 className="mt-1 text-xl font-black tracking-tight">{portal.companyName}</h1>
            <p className="mt-1 text-sm text-slate-600">Procurement collaboration workspace</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:text-right">
            <p className="text-sm font-bold">{portal.vendorName}</p>
            <p className="mt-1 text-xs text-slate-600">{portal.email}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-600">Access expires {formatDate(portal.accessExpiresAt)}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
          <p className="text-sm font-black text-blue-950">Your quotation invitations</p>
          <p className="mt-1 text-sm leading-6 text-blue-900">Only RFQ invitations assigned to this vendor account are shown. Submit your total quotation, currency, promised delivery date and commercial notes before the deadline.</p>
        </section>

        {portal.rfqs.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="font-bold">No quotation invitations</h2>
            <p className="mt-2 text-sm text-slate-600">There are no RFQ invitations assigned to this supplier account yet.</p>
          </section>
        ) : (
          <section className="space-y-4" aria-label="Supplier quotation invitations">
            {portal.rfqs.map((rfq) => {
              const deadlinePassed = rfq.dueAt !== null && new Date(rfq.dueAt).getTime() <= Date.now();
              const canRespond = !deadlinePassed && !['awarded', 'closed', 'cancelled'].includes(rfq.status);
              return (
                <article key={rfq.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Request for quotation</p>
                      <h2 className="mt-1 text-lg font-black">{rfq.rfqNumber}</h2>
                      <p className="mt-1 text-xs text-slate-600">Deadline: {formatDate(rfq.dueAt)}</p>
                    </div>
                    <span className={'inline-flex w-fit rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ' + statusClass(rfq.status)}>{rfq.status.replaceAll('_', ' ')}</span>
                  </header>

                  <div className="grid gap-4 p-4 sm:p-5">
                    {rfq.response ? (
                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                        <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Submitted amount</p><p className="mt-1 font-black tabular-nums">{rfq.response.currency} {Number(rfq.response.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                        <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Promised delivery</p><p className="mt-1 text-sm font-bold">{formatDate(rfq.response.promisedDate)}</p></div>
                        <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Response status</p><p className="mt-1 text-sm font-bold capitalize">{rfq.response.status}</p></div>
                        {rfq.response.terms ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 sm:col-span-3">{rfq.response.terms}</p> : null}
                      </div>
                    ) : null}
                    <VendorPortalResponseForm
                      tenantId={tenantId}
                      token={token}
                      rfqId={rfq.id}
                      rfqNumber={rfq.rfqNumber}
                      initialResponse={rfq.response}
                      canRespond={canRespond}
                    />
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <footer className="border-t border-slate-200 py-4 text-center text-xs leading-5 text-slate-500">
          This link is private to your supplier account and expires automatically. Contact the purchasing company if your access or an invitation needs to be changed.
        </footer>
      </div>
    </main>
  );
}
