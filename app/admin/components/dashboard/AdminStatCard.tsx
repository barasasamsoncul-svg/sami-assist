import type { LucideIcon } from 'lucide-react';

type AdminStatCardProps = {
  title: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
};

function numberFormat(value: number) {
  return new Intl.NumberFormat().format(value);
}

export default function AdminStatCard({
  title,
  value,
  hint,
  icon: Icon,
}: AdminStatCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {title}
          </p>

          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {numberFormat(value)}
          </p>

          {hint ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {hint}
            </p>
          ) : null}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}