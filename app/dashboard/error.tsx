'use client';

import WorkspaceRouteError from '@/app/components/workspace/WorkspaceRouteError';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  return (
    <WorkspaceRouteError
      error={error}
      reset={reset}
      title="Dashboard unavailable"
    />
  );
}
