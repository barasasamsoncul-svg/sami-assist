'use client';

import { useCallback, useEffect, useState } from 'react';
import CompanyAvatar from '@/app/components/workspace/CompanyAvatar';

type Company = {
  id: string;
  name: string;
  logoUrl: string | null;
  isCurrent: boolean;
};

type CompanyContextResponse = {
  success?: boolean;
  selector?: {
    currentCompanyId: string;
    companies: Company[];
  };
};

export default function WorkspaceCompanyIdentity() {
  const [company, setCompany] =
    useState<Company | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/workspace/company-context',
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      );

      const data =
        (await response.json()) as CompanyContextResponse;

      if (!response.ok || !data.success || !data.selector) {
        return;
      }

      setCompany(
        data.selector.companies.find(
          item =>
            item.id === data.selector?.currentCompanyId,
        ) || null,
      );
    } catch {
      // Decorative workspace context must never block the shell.
    }
  }, []);

  useEffect(() => {
    void load();

    const listener = () => {
      void load();
    };

    window.addEventListener(
      'sami:company-context-changed',
      listener,
    );

    return () => {
      window.removeEventListener(
        'sami:company-context-changed',
        listener,
      );
    };
  }, [load]);

  if (!company) {
    return null;
  }

  return (
    <div
      aria-label={`Current company: ${company.name}`}
      title={company.name}
      className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 shadow-[var(--sami-shadow-sm)] md:px-2.5"
    >
      <CompanyAvatar
        name={company.name}
        logoUrl={company.logoUrl}
        size="sm"
      />

      <div className="hidden min-w-0 md:block">
        <p className="max-w-[190px] truncate text-[10px] font-black text-slate-700 dark:text-slate-200">
          {company.name}
        </p>
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Company context
        </p>
      </div>
    </div>
  );
}
