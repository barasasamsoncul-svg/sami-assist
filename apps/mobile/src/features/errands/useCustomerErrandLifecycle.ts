
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cancelCustomerErrand,
  getCustomerErrandLifecycle,
} from "./customer-lifecycle-api";

import {
  getCustomerRunnerAccess,
  type CustomerErrandLifecycle,
  type CustomerErrandStage,
  type CustomerErrandStatus,
} from "./customer-lifecycle";

type HookOptions = {
  errandId: string;
  pollingInterval?: number;
};

type CancelOptions = {
  reason?: string;
};

type LifecycleState = {
  lifecycle: CustomerErrandLifecycle | null;
  loading: boolean;
  refreshing: boolean;
  cancelling: boolean;
  error: string;
  notice: string;
};

const INITIAL_STATE: LifecycleState = {
  lifecycle: null,
  loading: true,
  refreshing: false,
  cancelling: false,
  error: "",
  notice: "",
};

const TERMINAL_STATUSES = new Set<CustomerErrandStatus>([
  "completed",
  "cancelled",
  "disputed",
]);

const ACTIVE_STATUSES = new Set<CustomerErrandStatus>([
  "requested",
  "quoted",
  "assigned",
  "accepted",
  "in_progress",
  "completion_submitted",
]);

function stageAfterCancellation(): CustomerErrandStage {
  return "closed";
}

function errorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

function closedAccess(): CustomerErrandLifecycle["access"] {
  return {
    canViewRunnerProfile: false,
    canMessage: false,
    canCall: false,
    canCancel: false,
    runnerProfileVisibleUntil: null,
  };
}

export function useCustomerErrandLifecycle({
  errandId,
  pollingInterval = 5000,
}: HookOptions) {
  const normalizedErrandId = errandId.trim();

  const [state, setState] = useState<LifecycleState>({
    ...INITIAL_STATE,
  });

  const mountedRef = useRef(false);

  // Track the current ID so responses from an earlier errand
  // cannot overwrite the newly selected errand's state.
  const activeErrandIdRef = useRef(normalizedErrandId);
  activeErrandIdRef.current = normalizedErrandId;

  // Track requests by errand ID, not with a single global lock.
  const inFlightIdsRef = useRef<Set<string>>(new Set());

  const cancelInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (showRefresh = false): Promise<void> => {
      const id = errandId.trim();

      if (!id) {
        if (
          mountedRef.current &&
          activeErrandIdRef.current === id
        ) {
          setState((previous) => ({
            ...previous,
            loading: false,
            refreshing: false,
            error: "Errand ID is missing.",
          }));
        }

        return;
      }

      if (inFlightIdsRef.current.has(id)) {
        return;
      }

      inFlightIdsRef.current.add(id);

      const isCurrentRequest = () =>
        mountedRef.current &&
        activeErrandIdRef.current === id;

      if (isCurrentRequest()) {
        setState((previous) => ({
          ...previous,
          loading:
            previous.lifecycle?.errand.id === id
              ? false
              : !showRefresh,
          refreshing: showRefresh,
          error: "",
        }));
      }

      try {
        const lifecycle =
          await getCustomerErrandLifecycle(id);

        if (!isCurrentRequest()) {
          return;
        }

        setState((previous) => ({
          ...previous,
          lifecycle,
          loading: false,
          refreshing: false,
          error: "",
        }));
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }

        setState((previous) => ({
          ...previous,
          loading: false,
          refreshing: false,
          error: errorMessage(
            error,
            "Could not load your errand status.",
          ),
        }));
      } finally {
        inFlightIdsRef.current.delete(id);

        if (isCurrentRequest()) {
          setState((previous) => ({
            ...previous,
            loading: false,
            refreshing: false,
          }));
        }
      }
    },
    [errandId],
  );

  useEffect(() => {
    setState({
      ...INITIAL_STATE,
    });

    void load(false);
  }, [load]);

  const lifecycle =
    state.lifecycle?.errand.id === normalizedErrandId
      ? state.lifecycle
      : null;

  const currentStatus = lifecycle?.errand.status ?? null;

  useEffect(() => {
    if (
      !currentStatus ||
      !ACTIVE_STATUSES.has(currentStatus)
    ) {
      return;
    }

    const interval = Math.max(
      3000,
      Math.min(pollingInterval, 30000),
    );

    const timer = setInterval(() => {
      void load(false);
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, [currentStatus, load, pollingInterval]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  const permissions = useMemo(() => {
    if (!lifecycle) {
      return {
        canViewRunnerProfile: false,
        canMessage: false,
        canCall: false,
        canCancel: false,
        runnerProfileVisibleUntil: null,
      };
    }

    return getCustomerRunnerAccess(lifecycle);
  }, [lifecycle]);

  const cancel = useCallback(
    async (options: CancelOptions = {}): Promise<boolean> => {
      const currentLifecycle =
        state.lifecycle?.errand.id === normalizedErrandId
          ? state.lifecycle
          : null;

      if (!currentLifecycle) {
        setState((previous) => ({
          ...previous,
          error: "Errand details are not available.",
        }));

        return false;
      }

      const currentPermissions =
        getCustomerRunnerAccess(currentLifecycle);

      if (!currentPermissions.canCancel) {
        setState((previous) => ({
          ...previous,
          error: "This errand can no longer be cancelled.",
        }));

        return false;
      }

      if (cancelInFlightRef.current || state.cancelling) {
        return false;
      }

      const id = currentLifecycle.errand.id;

      cancelInFlightRef.current = true;

      setState((previous) => ({
        ...previous,
        cancelling: true,
        error: "",
        notice: "",
      }));

      try {
        const result = await cancelCustomerErrand(id, {
          reason: options.reason,
        });

        if (
          mountedRef.current &&
          activeErrandIdRef.current === id
        ) {
          setState((previous) => {
            if (
              previous.lifecycle?.errand.id !== id
            ) {
              return previous;
            }

            return {
              ...previous,
              lifecycle: {
                ...previous.lifecycle,
                errand: {
                  ...previous.lifecycle.errand,
                  status: result.status,
                  stage: stageAfterCancellation(),
                },
                runner: null,
                access: closedAccess(),
              },
              notice: result.message,
              error: "",
            };
          });
        }

        return true;
      } catch (error) {
        if (
          mountedRef.current &&
          activeErrandIdRef.current === id
        ) {
          setState((previous) => ({
            ...previous,
            error: errorMessage(
              error,
              "The errand could not be cancelled.",
            ),
          }));
        }

        return false;
      } finally {
        cancelInFlightRef.current = false;

        if (
          mountedRef.current &&
          activeErrandIdRef.current === id
        ) {
          setState((previous) => ({
            ...previous,
            cancelling: false,
          }));
        }
      }
    },
    [
      normalizedErrandId,
      state.lifecycle,
      state.cancelling,
    ],
  );

  const isActive = Boolean(
    currentStatus &&
      ACTIVE_STATUSES.has(currentStatus),
  );

  const isComplete = currentStatus === "completed";

  const isClosed = Boolean(
    currentStatus &&
      TERMINAL_STATUSES.has(currentStatus),
  );

  return {
    lifecycle,

    errand: lifecycle?.errand ?? null,

    runner:
      permissions.canViewRunnerProfile
        ? lifecycle?.runner ?? null
        : null,

    status: currentStatus,
    stage: lifecycle?.errand.stage ?? null,

    permissions,

    canViewRunnerProfile:
      permissions.canViewRunnerProfile,
    canMessage: permissions.canMessage,
    canCall: permissions.canCall,
    canCancel: permissions.canCancel,

    isActive,
    isComplete,
    isClosed,

    loading: state.loading,
    refreshing: state.refreshing,
    cancelling: state.cancelling,

    error: state.error,
    notice: state.notice,

    refresh,
    cancel,
  };
}
