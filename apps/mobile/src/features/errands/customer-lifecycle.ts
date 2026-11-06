
export type CustomerErrandStatus =
  | "requested"
  | "quoted"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "completion_submitted"
  | "completed"
  | "cancelled"
  | "disputed";

export type CustomerErrandStage =
  | "finding_runner"
  | "runner_found"
  | "tracking"
  | "completion"
  | "closed";

export type CustomerRunnerProfile = {
  runnerRef: string;
  fullName: string;
  photoUrl: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number | null;
  verified: boolean;
  backgroundChecked: boolean;
  serviceArea: string | null;
};

export type CustomerRunnerAccess = {
  canViewRunnerProfile: boolean;
  canMessage: boolean;
  canCall: boolean;
  canCancel: boolean;
  runnerProfileVisibleUntil: string | null;
};

export type CustomerErrandLifecycle = {
  errand: {
    id: string;
    publicCode: string;
    title: string;
    category: string;
    description: string;
    status: CustomerErrandStatus;
    stage: CustomerErrandStage;
  };
  runner: CustomerRunnerProfile | null;
  access: CustomerRunnerAccess;
  serverTime: string;
};

export type CustomerErrandLifecycleResponse = {
  lifecycle: CustomerErrandLifecycle;
};

const ASSIGNED_STATUSES = new Set<CustomerErrandStatus>([
  "assigned",
  "accepted",
  "in_progress",
  "completion_submitted",
  "completed",
]);

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function hasValidRunnerIdentity(
  runner: CustomerRunnerProfile | null,
): runner is CustomerRunnerProfile {
  return Boolean(
    runner &&
      runner.runnerRef.trim() &&
      runner.fullName.trim(),
  );
}

function isWithinVisibilityWindow(
  visibleUntil: string | null,
  now: number,
  requireExpiry: boolean,
): boolean {
  if (visibleUntil === null) {
    return !requireExpiry;
  }

  if (!isValidTimestamp(visibleUntil)) {
    return false;
  }

  return Date.parse(visibleUntil) > now;
}

function deniedAccess(
  visibleUntil: string | null = null,
): CustomerRunnerAccess {
  return {
    canViewRunnerProfile: false,
    canMessage: false,
    canCall: false,
    canCancel: false,
    runnerProfileVisibleUntil: visibleUntil,
  };
}

/**
 * Applies customer-visible access restrictions.
 *
 * Completed:
 * - Profile can remain visible only until an explicit server expiry.
 * - Messaging and calling stop immediately.
 * - Cancellation is disabled.
 *
 * Cancelled or disputed:
 * - Runner profile and communication access are denied.
 *
 * The Customer API must enforce these rules independently.
 */
export function getCustomerRunnerAccess(
  lifecycle: CustomerErrandLifecycle,
  now = Date.now(),
): CustomerRunnerAccess {
  const { status } = lifecycle.errand;
  const supplied = lifecycle.access;
  const visibleUntil = supplied.runnerProfileVisibleUntil;

  if (
    status === "cancelled" ||
    status === "disputed"
  ) {
    return deniedAccess();
  }

  const runnerAvailable =
    hasValidRunnerIdentity(lifecycle.runner);

  const canViewRunnerProfile =
    supplied.canViewRunnerProfile &&
    runnerAvailable &&
    isWithinVisibilityWindow(
      visibleUntil,
      now,
      status === "completed",
    );

  if (status === "completed") {
    return {
      canViewRunnerProfile,
      canMessage: false,
      canCall: false,
      canCancel: false,
      runnerProfileVisibleUntil: visibleUntil,
    };
  }

  return {
    canViewRunnerProfile,
    canMessage:
      canViewRunnerProfile && supplied.canMessage,
    canCall:
      canViewRunnerProfile && supplied.canCall,
    canCancel: supplied.canCancel,
    runnerProfileVisibleUntil: visibleUntil,
  };
}

export function hasAssignedCustomerRunner(
  lifecycle: CustomerErrandLifecycle,
): boolean {
  return (
    ASSIGNED_STATUSES.has(lifecycle.errand.status) &&
    hasValidRunnerIdentity(lifecycle.runner)
  );
}

export function isCustomerErrandClosed(
  status: CustomerErrandStatus,
): boolean {
  return (
    status === "completed" ||
    status === "cancelled" ||
    status === "disputed"
  );
}
