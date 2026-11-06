
import { apiRequest } from "@/api";

import type {
  CustomerErrandLifecycle,
  CustomerErrandLifecycleResponse,
  CustomerErrandStatus,
  CustomerErrandStage,
} from "./customer-lifecycle";

const CUSTOMER_ERRAND_API = "/api/customer/errands";

const VALID_STATUSES = new Set<CustomerErrandStatus>([
  "requested",
  "quoted",
  "assigned",
  "accepted",
  "in_progress",
  "completion_submitted",
  "completed",
  "cancelled",
  "disputed",
]);

const VALID_STAGES = new Set<CustomerErrandStage>([
  "finding_runner",
  "runner_found",
  "tracking",
  "completion",
  "closed",
]);

export type CancelCustomerErrandInput = {
  reason?: string;
};

export type CancelCustomerErrandResponse = {
  ok: true;
  message: string;
  status: "cancelled";
};

function requireNonEmptyString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `The customer lifecycle response has an invalid ${field}.`,
    );
  }

  return value.trim();
}

function requireBoolean(
  value: unknown,
  field: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new Error(
      `The customer lifecycle response has an invalid ${field}.`,
    );
  }

  return value;
}

function optionalPermission(
  value: unknown,
  field: string,
): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  return requireBoolean(value, field);
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(
      "The customer lifecycle response contains invalid text data.",
    );
  }

  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      "The customer lifecycle response contains an invalid number.",
    );
  }

  return parsed;
}

function parseRunner(
  value: unknown,
): CustomerErrandLifecycle["runner"] {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "The customer lifecycle response contains an invalid runner profile.",
    );
  }

  const runner = value as Record<string, unknown>;

  const rawRatingCount = runner.ratingCount;
  const ratingCount =
    rawRatingCount === undefined || rawRatingCount === null
      ? 0
      : Number(rawRatingCount);

  if (
    !Number.isInteger(ratingCount) ||
    ratingCount < 0
  ) {
    throw new Error(
      "The customer lifecycle response contains an invalid runner rating count.",
    );
  }

  return {
    runnerRef: requireNonEmptyString(
      runner.runnerRef,
      "runner reference",
    ),
    fullName: requireNonEmptyString(
      runner.fullName,
      "runner name",
    ),
    photoUrl: nullableString(runner.photoUrl),
    ratingAverage: nullableNumber(runner.ratingAverage),
    ratingCount,
    completedJobs: nullableNumber(runner.completedJobs),
    verified: optionalPermission(
      runner.verified,
      "runner verification status",
    ),
    backgroundChecked: optionalPermission(
      runner.backgroundChecked,
      "runner background-check status",
    ),
    serviceArea: nullableString(runner.serviceArea),
  };
}

function parseLifecycle(
  value: unknown,
  expectedErrandId: string,
): CustomerErrandLifecycle {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "The customer lifecycle response is invalid.",
    );
  }

  const data = value as Record<string, unknown>;
  const errand = data.errand;

  if (
    typeof errand !== "object" ||
    errand === null ||
    Array.isArray(errand)
  ) {
    throw new Error(
      "The customer lifecycle response has no valid errand.",
    );
  }

  const errandData = errand as Record<string, unknown>;

  const id = requireNonEmptyString(
    errandData.id,
    "errand ID",
  );

  if (id !== expectedErrandId) {
    throw new Error(
      "The lifecycle response does not match the requested errand.",
    );
  }

  const status = requireNonEmptyString(
    errandData.status,
    "errand status",
  ) as CustomerErrandStatus;

  const stage = requireNonEmptyString(
    errandData.stage,
    "errand stage",
  ) as CustomerErrandStage;

  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      "The customer lifecycle response has an unsupported errand status.",
    );
  }

  if (!VALID_STAGES.has(stage)) {
    throw new Error(
      "The customer lifecycle response has an unsupported stage.",
    );
  }

  const serverTime = requireNonEmptyString(
    data.serverTime,
    "server time",
  );

  const parsedServerTime = Date.parse(serverTime);

  if (!Number.isFinite(parsedServerTime)) {
    throw new Error(
      "The customer lifecycle response has an invalid server time.",
    );
  }

  let accessData: Record<string, unknown> = {};

  if (data.access !== undefined && data.access !== null) {
    if (
      typeof data.access !== "object" ||
      Array.isArray(data.access)
    ) {
      throw new Error(
        "The customer lifecycle response has invalid access permissions.",
      );
    }

    accessData = data.access as Record<string, unknown>;
  }

  const visibleUntil = nullableString(
    accessData.runnerProfileVisibleUntil,
  );

  const parsedExpiry =
    visibleUntil === null
      ? null
      : Date.parse(visibleUntil);

  if (
    parsedExpiry !== null &&
    !Number.isFinite(parsedExpiry)
  ) {
    throw new Error(
      "The customer lifecycle response has an invalid profile expiry.",
    );
  }

  const parsedRunner = parseRunner(data.runner);

  const requestedProfileAccess = optionalPermission(
    accessData.canViewRunnerProfile,
    "profile access permission",
  );

  // An active errand may have no timed profile expiry.
  // A completed errand MUST have an explicit future expiry.
  const withinVisibilityWindow =
    status === "completed"
      ? parsedExpiry !== null &&
        parsedExpiry > parsedServerTime
      : parsedExpiry === null ||
        parsedExpiry > parsedServerTime;

  const canViewRunnerProfile =
    requestedProfileAccess &&
    parsedRunner !== null &&
    withinVisibilityWindow &&
    status !== "cancelled" &&
    status !== "disputed";

  const canMessage =
    status !== "completed" &&
    canViewRunnerProfile &&
    optionalPermission(
      accessData.canMessage,
      "messaging permission",
    );

  const canCall =
    status !== "completed" &&
    canViewRunnerProfile &&
    optionalPermission(
      accessData.canCall,
      "calling permission",
    );

  const canCancel =
    status === "requested" || status === "quoted"
      ? optionalPermission(
          accessData.canCancel,
          "cancellation permission",
        )
      : false;

  return {
    errand: {
      id,
      publicCode: requireNonEmptyString(
        errandData.publicCode,
        "public errand code",
      ),
      title: requireNonEmptyString(
        errandData.title,
        "errand title",
      ),
      category: requireNonEmptyString(
        errandData.category,
        "errand category",
      ),
      description: requireNonEmptyString(
        errandData.description,
        "errand description",
      ),
      status,
      stage,
    },

    runner: canViewRunnerProfile
      ? parsedRunner
      : null,

    access: {
      canViewRunnerProfile,
      canMessage,
      canCall,
      canCancel,
      runnerProfileVisibleUntil: visibleUntil,
    },

    serverTime,
  };
}

function errandEndpoint(errandId: string): string {
  const id = errandId.trim();

  if (!id) {
    throw new Error("Errand ID is required.");
  }

  return `${CUSTOMER_ERRAND_API}/${encodeURIComponent(id)}`;
}

export async function getCustomerErrandLifecycle(
  errandId: string,
): Promise<CustomerErrandLifecycle> {
  const id = errandId.trim();

  const response =
    await apiRequest<CustomerErrandLifecycleResponse>(
      `${errandEndpoint(id)}/lifecycle`,
    );

  return parseLifecycle(
    response?.lifecycle,
    id,
  );
}

export async function cancelCustomerErrand(
  errandId: string,
  input: CancelCustomerErrandInput = {},
): Promise<CancelCustomerErrandResponse> {
  const response =
    await apiRequest<CancelCustomerErrandResponse>(
      `${errandEndpoint(errandId)}/cancel`,
      {
        method: "POST",
        body: {
          reason: input.reason?.trim() || undefined,
        },
      },
    );

  if (
    !response ||
    response.ok !== true ||
    typeof response.message !== "string" ||
    !response.message.trim() ||
    response.status !== "cancelled"
  ) {
    throw new Error(
      "The server did not confirm that the errand was cancelled.",
    );
  }

  return response;
}

export async function refreshCustomerErrandLifecycle(
  errandId: string,
): Promise<CustomerErrandLifecycle> {
  return getCustomerErrandLifecycle(errandId);
}
