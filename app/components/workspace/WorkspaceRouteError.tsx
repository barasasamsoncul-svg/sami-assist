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

      try {
        void fetch(
          '/api/telemetry/error',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify({
                route:
                  typeof window !==
                    'undefined'
                    ? window.location
                        .pathname
                    : null,
                digest:
                  error.digest ||
                  null,
                name:
                  error.name ||
                  'Error',
                message:
                  error.message ||
                  'Workspace route error',
                stack:
                  error.stack ||
                  null,
              }),
          },
        ).catch(
          () => {
            // Telemetry must never interfere with workspace recovery.
          },
        );
      } catch {
        // Telemetry must remain best-effort.
      }
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
