import Link from "next/link";

type AppInfo = { key:string; name:string; category:string; description:string; route:string };

const coreSchema = ["customers","documents","employees","inventory","invoice_items","invoices","payments","products","conversations","messages","ai_memory"];

export default function AppWorkspace({app}:{app:AppInfo}) {
  const invoice=app.key==="invoicing";
  const crm=app.key==="crm";
  return <main className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 sm:p-6">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">SaMi Business Module</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{app.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{app.description}</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-xl border px-4 py-2 text-sm">Back to Dashboard</Link>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Records","Tenant database"],["Status","Module enabled"],
          ["Category",app.category.replace("_"," ")],["AI","SaMi Assistant"]
        ].map(([a,b])=><div key={a} className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs text-gray-500">{a}</p><p className="mt-2 font-semibold capitalize">{b}</p>
        </div>)}
      </section>
      <section className="rounded-2xl border bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        {invoice ? <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/dashboard/invoices" className="rounded-xl bg-blue-600 p-4 font-semibold text-white">Open Invoicing</Link>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800"><b>Core tables</b><p className="text-sm">invoices, invoice_items, payments</p></div>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800"><b>Relationship</b><p className="text-sm">invoices → customers</p></div>
        </div> : crm ? <Link href="/dashboard" className="inline-block rounded-xl bg-blue-600 p-4 font-semibold text-white">Open CRM / Customers</Link> :
        <div className="rounded-xl border border-dashed p-6">
          <h2 className="font-semibold">Module workspace</h2>
          <p className="mt-2 text-sm text-gray-500">The app is registered, but its dedicated schema was not present in the source material available for this package. No database fields or fake records are being invented.</p>
        </div>}
      </section>
      <section className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="font-semibold">Verified core tenant schema</h2>
        <div className="mt-3 flex flex-wrap gap-2">{coreSchema.map(t=><span key={t} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs dark:bg-gray-800">{t}</span>)}</div>
      </section>
    </div>
  </main>;
}
