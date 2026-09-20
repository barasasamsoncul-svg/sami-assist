'use client';

import {
  useEffect,
} from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';

export default function WorkspaceRouteError({
  error,
  reset,
  title = 'Workspace unavailable',
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
  title?: string;
}) {
  useEffect(
    () => {
      console.error(
        '[SaMi] Workspace route error:',
        error,
      );
    },
    [
      error,
    ],
  );

  return (
    <main className="min-h-screen bg-[#F6F7F9] dark:bg-[#090B10]">
      <SaMiOverlay
        open
        type="error"
        title={title}
        message="SaMi could not load this workspace page. Your account data was not changed. Retry the page, or return to the dashboard if the problem continues."
        primaryAction={{
          label:
            'Retry',
          onClick:
            reset,
        }}
        secondaryAction={{
          label:
            'Dashboard',
          href:
            '/dashboard',
        }}
        onClose={
          reset
        }
      />
    </main>
  );
}
