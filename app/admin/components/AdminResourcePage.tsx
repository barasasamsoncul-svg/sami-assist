import Link from 'next/link';

import {
  Search,
} from 'lucide-react';

import type {
  ReactNode,
} from 'react';


export type AdminTableColumn<T> = {
  key:
    string;
  label:
    string;
  render:
    (
      row:
        T,
    ) =>
      ReactNode;
};


type Props<T> = {
  title:
    string;
  description:
    string;
  baseHref:
    string;
  search:
    string;
  searchPlaceholder:
    string;
  total:
    number;
  page:
    number;
  totalPages:
    number;
  rows:
    T[];
  columns:
    readonly AdminTableColumn<T>[];
  rowKey:
    (
      row:
        T,
    ) =>
      string;
  emptyMessage:
    string;
  actions?:
    ReactNode;
  filterFields?:
    ReactNode;
  persistentQuery?:
    Readonly<
      Record<
        string,
        string |
        null |
        undefined
      >
    >;
};


function hrefFor(
  baseHref:
    string,
  page:
    number,
  search:
    string,
  persistentQuery?:
    Readonly<
      Record<
        string,
        string |
        null |
        undefined
      >
    >,
) {
  const query =
    new URLSearchParams();

  for (
    const [
      key,
      value,
    ] of Object.entries(
      persistentQuery ||
      {},
    )
  ) {
    if (
      value
    ) {
      query.set(
        key,
        value,
      );
    }
  }

  if (
    page >
      1
  ) {
    query.set(
      'page',
      String(
        page,
      ),
    );
  }

  if (
    search
  ) {
    query.set(
      'q',
      search,
    );
  }

  const suffix =
    query.toString();

  return suffix
    ? `${baseHref}?${suffix}`
    : baseHref;
}


export function AdminStatusPill({
  value,
}: {
  value:
    string |
    null |
    undefined;
}) {
  const normalized =
    (
      value ||
      'unknown'
    )
      .trim()
      .toLowerCase();

  const positive =
    new Set([
      'active',
      'enabled',
      'available',
      'healthy',
      'success',
      'succeeded',
      'completed',
      'verified',
    ]);

  const warning =
    new Set([
      'trial',
      'trialing',
      'past_due',
      'pending',
      'processing',
      'acknowledged',
      'degraded',
      'invited',
      'locked',
    ]);

  const negative =
    new Set([
      'failed',
      'error',
      'critical',
      'unavailable',
      'cancelled',
      'canceled',
      'suspended',
      'disabled',
      'revoked',
    ]);

  const className =
    positive.has(
      normalized,
    )
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
      : negative.has(
            normalized,
          )
        ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
        : warning.has(
              normalized,
            )
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${className}`}
    >
      {normalized.replace(
        /_/g,
        ' ',
      )}
    </span>
  );
}


export function AdminDate({
  value,
}: {
  value:
    string |
    null |
    undefined;
}) {
  if (
    !value
  ) {
    return (
      <span className="text-zinc-400">
        —
      </span>
    );
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return (
      <span className="text-zinc-500">
        {value}
      </span>
    );
  }

  return (
    <span
      title={
        date.toISOString()
      }
      className="whitespace-nowrap text-zinc-500 dark:text-zinc-400"
    >
      {date.toLocaleString(
        'en-KE',
        {
          dateStyle:
            'medium',
          timeStyle:
            'short',
        },
      )}
    </span>
  );
}


export default function AdminResourcePage<T>({
  title,
  description,
  baseHref,
  search,
  searchPlaceholder,
  total,
  page,
  totalPages,
  rows,
  columns,
  rowKey,
  emptyMessage,
  actions,
  filterFields,
  persistentQuery,
}: Props<T>) {
  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              Platform Administration
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-3xl">
              {title}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {actions}

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-right dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="text-[9px] font-black uppercase tracking-wide text-zinc-400">
                Records
              </p>

              <p className="mt-1 text-xl font-black text-zinc-950 dark:text-white">
                {total.toLocaleString(
                  'en-KE',
                )}
              </p>
            </div>
          </div>
        </div>

        <form
          action={
            baseHref
          }
          method="get"
          className="mt-6 flex flex-col gap-2 sm:flex-row"
        >
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-zinc-800 dark:bg-zinc-950">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />

            <input
              name="q"
              defaultValue={
                search
              }
              placeholder={
                searchPlaceholder
              }
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-white"
            />
          </div>

          {filterFields}

          <button
            type="submit"
            className="h-11 rounded-xl bg-zinc-950 px-5 text-xs font-black text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            Apply
          </button>

          {(search ||
            Object.values(
              persistentQuery ||
              {},
            ).some(
              Boolean,
            )) && (
            <Link
              href={
                baseHref
              }
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 px-4 text-xs font-black text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Clear
            </Link>
          )}
        </form>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                {columns.map(
                  column => (
                    <th
                      key={
                        column.key
                      }
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400"
                    >
                      {column.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.map(
                row => (
                  <tr
                    key={
                      rowKey(
                        row,
                      )
                    }
                    className="align-top transition hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
                  >
                    {columns.map(
                      column => (
                        <td
                          key={
                            column.key
                          }
                          className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          {column.render(
                            row,
                          )}
                        </td>
                      ),
                    )}
                  </tr>
                ),
              )}

              {rows.length ===
                0 && (
                <tr>
                  <td
                    colSpan={
                      columns.length
                    }
                    className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <p className="text-[11px] font-semibold text-zinc-500">
            Page {page.toLocaleString(
              'en-KE',
            )} of {totalPages.toLocaleString(
              'en-KE',
            )}
          </p>

          <div className="flex items-center gap-2">
            {page >
              1 ? (
              <Link
                href={
                  hrefFor(
                    baseHref,
                    page -
                      1,
                    search,
                    persistentQuery,
                  )
                }
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Previous
              </Link>
            ) : (
              <span className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
                Previous
              </span>
            )}

            {page <
              totalPages ? (
              <Link
                href={
                  hrefFor(
                    baseHref,
                    page +
                      1,
                    search,
                    persistentQuery,
                  )
                }
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Next
              </Link>
            ) : (
              <span className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-xl border border-zinc-200 px-3 text-[11px] font-black text-zinc-300 dark:border-zinc-800 dark:text-zinc-700">
                Next
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
