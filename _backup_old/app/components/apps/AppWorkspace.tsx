"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, RefreshCw, Search, Database, Pencil, X, Check } from "lucide-react";

type AppInfo = { key: string; name: string; category: string; description: string; route: string };
type Column = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
type TableMeta = { table: string; columns: Column[]; primaryKey: string; relationships: { column_name: string; foreign_table: string; foreign_column: string }[] };

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
}

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AppWorkspace({ app }: { app: AppInfo }) {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const current = useMemo(() => tables.find((t) => t.table === selectedTable) || null, [tables, selectedTable]);

  const load = useCallback(async (table?: string) => {
    try {
      setLoading(true);
      setError("");
      const query = new URLSearchParams();
      if (table || selectedTable) query.set("table", table || selectedTable);
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(`/api/apps/${app.key}/data?${query.toString()}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load module data.");
      setTables(data.tables || []);
      setSelectedTable(data.table || table || selectedTable || data.tables?.[0]?.table || "");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module data.");
    } finally {
      setLoading(false);
    }
  }, [app.key, search, selectedTable]);

  useEffect(() => { load(); }, [app.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTable = (table: string) => {
    setSelectedTable(table);
    setSearch("");
    load(table);
  };

  const save = async (values: Record<string, unknown>, isEdit: boolean) => {
    if (!current) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/apps/${app.key}/data`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit
          ? { table: current.table, primaryKey: current.primaryKey, id: editing?.[current.primaryKey], values }
          : { table: current.table, values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed.");
      setShowCreate(false);
      setEditing(null);
      await load(current.table);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600"><ArrowLeft size={16}/> Dashboard</Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-blue-600">SaMi Business Module</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{app.name}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{app.description}</p>
            </div>
            <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh</button>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs text-gray-500">Tables</p><p className="mt-2 text-2xl font-bold">{tables.length}</p></div>
          <div className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs text-gray-500">Current records</p><p className="mt-2 text-2xl font-bold">{rows.length}</p></div>
          <div className="rounded-2xl border bg-white p-5 dark:border-gray-800 dark:bg-gray-900"><p className="text-xs text-gray-500">Active table</p><p className="mt-2 font-bold">{current ? label(current.table) : "Loading…"}</p></div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold"><Database size={16}/> Module data</div>
            <div className="space-y-1">
              {tables.map((table) => <button key={table.table} onClick={() => switchTable(table.table)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selectedTable === table.table ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}>{label(table.table)}</button>)}
            </div>
          </aside>

          <section className="min-w-0 rounded-2xl border bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 dark:border-gray-800">
              <div><h2 className="font-semibold">{current ? label(current.table) : "Module data"}</h2><p className="text-xs text-gray-500">Live tenant records from the selected module schema.</p></div>
              <div className="flex gap-2">
                <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search records" className="w-48 rounded-xl border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700"/></div>
                <button onClick={() => setShowCreate(true)} disabled={!current} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16}/> New</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? <div className="p-10 text-center text-sm text-gray-500">Loading module data…</div> : rows.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">No records found in this table.</div> :
                <table className="min-w-full text-left text-sm"><thead className="bg-gray-50 dark:bg-gray-950/50"><tr>{current?.columns.map((c) => <th key={c.column_name} className="whitespace-nowrap px-4 py-3 font-semibold">{label(c.column_name)}</th>)}<th className="px-4 py-3">Actions</th></tr></thead><tbody>{rows.map((row, i) => <tr key={String(row[current?.primaryKey || "id"] ?? i)} className="border-t dark:border-gray-800"><>{current?.columns.map((c) => <td key={c.column_name} className="max-w-xs whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">{displayValue(row[c.column_name])}</td>)}</><td className="px-4 py-3"><button onClick={() => setEditing(row)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Pencil size={13}/> Edit</button></td></tr>)}</tbody></table>}
            </div>
          </section>
        </section>
      </div>

      {(showCreate || editing) && current && <RecordModal table={current} initial={editing} saving={saving} onClose={() => { setShowCreate(false); setEditing(null); }} onSave={(values) => save(values, Boolean(editing))} />}
    </main>
  );
}

function RecordModal({ table, initial, saving, onClose, onSave }: { table: TableMeta; initial: Record<string, unknown> | null; saving: boolean; onClose: () => void; onSave: (values: Record<string, unknown>) => void }) {
  const editable = table.columns.filter((c) => c.column_name !== table.primaryKey && !c.column_default?.includes("nextval") && !c.column_default?.includes("gen_random_uuid") && !c.column_default?.includes("uuid_generate"));
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(editable.map((c) => [c.column_name, initial?.[c.column_name] ?? ""])));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"><div className="flex items-center justify-between border-b p-5 dark:border-gray-800"><div><h3 className="font-semibold">{initial ? "Edit" : "Create"} {label(table.table)}</h3><p className="text-xs text-gray-500">Only fields defined by the module schema are editable.</p></div><button onClick={onClose}><X/></button></div><div className="max-h-[65vh] overflow-y-auto p-5"><div className="grid gap-4 sm:grid-cols-2">{editable.map((c) => <label key={c.column_name} className="text-sm"><span className="mb-1 block font-medium">{label(c.column_name)}</span><input value={displayValue(values[c.column_name]) === "—" ? "" : displayValue(values[c.column_name])} onChange={(e) => setValues((v) => ({ ...v, [c.column_name]: e.target.value }))} placeholder={c.data_type} className="w-full rounded-xl border px-3 py-2 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"/></label>)}</div></div><div className="flex justify-end gap-2 border-t p-4 dark:border-gray-800"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm dark:border-gray-700">Cancel</button><button onClick={() => onSave(values)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : <><Check size={16}/> Save</>}</button></div></div></div>;
}
