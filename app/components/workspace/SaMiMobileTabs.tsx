'use client';

import type {
  LucideIcon,
} from 'lucide-react';

type TabItem<T extends string> = {
  key: T;
  label: string;
  icon?: LucideIcon;
};

type Props<T extends string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  sticky?: boolean;
};

export default function SaMiMobileTabs<
  T extends string,
>({
  items,
  value,
  onChange,
  sticky = true,
}: Props<T>) {
  return (
    <div
      className={[
        '-mx-1 overflow-x-auto px-1 py-1 md:hidden',
        sticky
          ? 'sticky top-16 z-30 bg-[#F6F7F9]/95 backdrop-blur dark:bg-[#090B10]/95'
          : '',
      ].join(
        ' ',
      )}
    >
      <div className="flex min-w-max gap-2">
        {items.map(
          item => {
            const Icon =
              item.icon;

            const active =
              item.key ===
              value;

            return (
              <button
                key={
                  item.key
                }
                type="button"
                onClick={() =>
                  onChange(
                    item.key,
                  )
                }
                className={
                  active
                    ? 'inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white shadow-sm dark:bg-white dark:text-slate-950'
                    : 'inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300'
                }
              >
                {Icon && (
                  <Icon className="h-3.5 w-3.5" />
                )}

                {item.label}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}
