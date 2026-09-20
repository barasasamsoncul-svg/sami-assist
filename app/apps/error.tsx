'use client';

import WorkspaceRouteError from '@/app/components/workspace/WorkspaceRouteError';

export default function AppsError({
  error,
  reset,
}: {
  error:
    Error & {
      digest?:
        string;
    };

  reset:
    () => void;
}) {
  return (
    <WorkspaceRouteError
      error={
        error
      }
      reset={
        reset
      }
      title="Apps unavailable"
    />
  );
}
