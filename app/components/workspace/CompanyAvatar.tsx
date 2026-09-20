'use client';

import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  name: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export default function CompanyAvatar({
  name,
  logoUrl,
  size = 'md',
  className = '',
}: Props) {
  const [failedUrl, setFailedUrl] =
    useState<string | null>(null);

  useEffect(() => {
    if (failedUrl && failedUrl !== logoUrl) {
      setFailedUrl(null);
    }
  }, [failedUrl, logoUrl]);

  const sizeClass =
    size === 'sm'
      ? 'h-7 w-7 rounded-lg'
      : size === 'lg'
        ? 'h-10 w-10 rounded-xl'
        : 'h-8 w-8 rounded-lg';

  const showLogo =
    Boolean(logoUrl) && failedUrl !== logoUrl;

  return (
    <div
      className={[
        'flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white text-blue-600 dark:border-white/10 dark:bg-[#0d121b] dark:text-blue-300',
        sizeClass,
        className,
      ].join(' ')}
      title={name}
    >
      {showLogo ? (
        <img
          src={logoUrl || undefined}
          alt=""
          className="h-full w-full object-contain p-0.5"
          onError={() => setFailedUrl(logoUrl || null)}
        />
      ) : (
        <Building2
          className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}
        />
      )}
    </div>
  );
}
