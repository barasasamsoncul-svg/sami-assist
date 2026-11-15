import "server-only";

/* =========================================================
   RUNNER COMPLIANCE

   This module is the single source of truth for deciding
   which stage an authenticated Runner must enter.

   It is intentionally independent of HTTP routes and UI.
========================================================= */

export type RunnerComplianceStage =
  | "tasks"
  | "documents"
  | "dashboard"
  | "restricted";

export type RunnerComplianceStatus =
  | "incomplete"
  | "pending_review"
  | "changes_required"
  | "approved"
  | "restricted"
  | "configuration_error";

export type RunnerComplianceDocument = {
  id: string;
  requirementKey: string | null;
  reviewStatus: string;
  submittedAt: string;
};

export type RunnerComplianceInput = {
  accountStatus: string;
  verificationStatus: string;

  fullName: string | null;

  selectedCategories: string[];

  serviceArea: string | null;
  vehicleType: string | null;
  vehicleModel: string | null;
  vehicleRegistration: string | null;

  requiredDocuments: Array<{
    key: string;
  }>;

  uploadedDocuments: RunnerComplianceDocument[];
};

export type RunnerComplianceResult = {
  status: RunnerComplianceStatus;
  nextStep: RunnerComplianceStage;

  account: {
    eligible: boolean;
    restricted: boolean;
  };

  tasks: {
    complete: boolean;
    selectedCategories: string[];
    missingFields: string[];
  };

  documents: {
    configured: boolean;
    complete: boolean;
    approved: boolean;
    requiredCount: number;
    satisfiedCount: number;
    pendingCount: number;
    missingRequirements: string[];
    rejectedRequirements: string[];
  };

  canSubmit: boolean;
  reasons: string[];
};

const VALID_SERVICE_KEYS = new Set([
  "pickup_deliver",
  "shop_deliver",
]);

const VALID_VEHICLE_TYPES = new Set([
  "bike",
  "bicycle",
  "motorbike",
  "motorcycle",
  "vehicle",
  "car",
  "van",
  "other",
]);

const MOTOR_VEHICLE_TYPES = new Set([
  "motorbike",
  "motorcycle",
  "vehicle",
  "car",
  "van",
  "other",
]);

const ACCEPTED_DOCUMENT_STATUSES = new Set([
  "pending",
  "approved",
]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function latestDocumentsByRequirement(
  documents: RunnerComplianceDocument[],
): Map<string, RunnerComplianceDocument> {
  const latest = new Map<
    string,
    RunnerComplianceDocument
  >();

  for (const document of documents) {
    const key = document.requirementKey?.trim();

    if (!key) {
      continue;
    }

    const previous = latest.get(key);

    if (!previous) {
      latest.set(key, document);
      continue;
    }

    const currentTime = Date.parse(document.submittedAt);
    const previousTime = Date.parse(previous.submittedAt);

    if (
      Number.isFinite(currentTime) &&
      (
        !Number.isFinite(previousTime) ||
        currentTime > previousTime
      )
    ) {
      latest.set(key, document);
    }
  }

  return latest;
}

/**
 * Evaluate the saved state of a Runner.
 *
 * Destination priority:
 *
 * 1. Restricted account
 * 2. Incomplete task and transport setup
 * 3. Missing, rejected or unapproved documents
 * 4. Pending application review
 * 5. Approved account with all checks satisfied
 *
 * A Runner must have exactly one selected service:
 * - pickup_deliver
 * - shop_deliver
 *
 * A pending document counts as uploaded, but not approved.
 * A rejected document never satisfies a requirement.
 */
export function resolveRunnerCompliance(
  input: RunnerComplianceInput,
): RunnerComplianceResult {
  const accountStatus = normalize(input.accountStatus);
  const verificationStatus = normalize(
    input.verificationStatus,
  );

  const restricted = [
    "suspended",
    "closed",
  ].includes(accountStatus);

  const account = {
    eligible: false,
    restricted,
  };

  /* =======================================================
     RESTRICTED ACCOUNT
  ======================================================= */

  if (restricted) {
    return {
      status: "restricted",
      nextStep: "restricted",

      account,

      tasks: {
        complete: false,
        selectedCategories: [],
        missingFields: [],
      },

      documents: {
        configured: false,
        complete: false,
        approved: false,
        requiredCount: 0,
        satisfiedCount: 0,
        pendingCount: 0,
        missingRequirements: [],
        rejectedRequirements: [],
      },

      canSubmit: false,
      reasons: [
        accountStatus === "suspended"
          ? "runner_account_suspended"
          : "runner_account_closed",
      ],
    };
  }

  /* =======================================================
     TASK AND TRANSPORT COMPLIANCE
  ======================================================= */

  const selectedCategories = [
    ...new Set(
      input.selectedCategories
        .map((item) => normalize(item))
        .filter(Boolean),
    ),
  ];

  const validCategories = selectedCategories.filter(
    (category) => VALID_SERVICE_KEYS.has(category),
  );

  const vehicleType = normalize(input.vehicleType);

  const supportedVehicle = VALID_VEHICLE_TYPES.has(
    vehicleType,
  );

  const motorizedVehicle = MOTOR_VEHICLE_TYPES.has(
    vehicleType,
  );

  const missingTaskFields: string[] = [];

  if (
    !hasText(input.fullName) ||
    input.fullName!.trim().length < 2
  ) {
    missingTaskFields.push("full_name");
  }

  /*
   * Exactly one supported service must be selected.
   *
   * This rejects:
   * - No selected service
   * - Both supported services
   * - Any unsupported service
   *
   * The Tasks screen presents the six permitted
   * service-and-transport combinations.
   */
  if (
    validCategories.length !== 1 ||
    validCategories.length !== selectedCategories.length
  ) {
    missingTaskFields.push("service_selection");
  }

  if (
    !hasText(input.serviceArea) ||
    input.serviceArea!.trim().length < 2
  ) {
    missingTaskFields.push("service_area");
  }

  if (!supportedVehicle) {
    missingTaskFields.push("vehicle_type");
  }

  if (supportedVehicle && motorizedVehicle) {
    if (
      !hasText(input.vehicleModel) ||
      input.vehicleModel!.trim().length < 2
    ) {
      missingTaskFields.push("vehicle_model");
    }

    if (
      !hasText(input.vehicleRegistration) ||
      input.vehicleRegistration!.trim().length < 3
    ) {
      missingTaskFields.push("vehicle_registration");
    }
  }

  const tasksComplete = missingTaskFields.length === 0;

  const tasks = {
    complete: tasksComplete,
    selectedCategories: validCategories,
    missingFields: missingTaskFields,
  };

  /* =======================================================
     DOCUMENT COMPLIANCE
  ======================================================= */

  const requiredKeys = [
    ...new Set(
      input.requiredDocuments
        .map((item) => item.key.trim())
        .filter(Boolean),
    ),
  ];

  const latestDocuments = latestDocumentsByRequirement(
    input.uploadedDocuments,
  );

  const missingRequirements: string[] = [];
  const rejectedRequirements: string[] = [];

  let satisfiedCount = 0;
  let pendingCount = 0;
  let approvedCount = 0;

  for (const requirementKey of requiredKeys) {
    const document = latestDocuments.get(requirementKey);

    if (!document) {
      missingRequirements.push(requirementKey);
      continue;
    }

    const reviewStatus = normalize(document.reviewStatus);

    if (!ACCEPTED_DOCUMENT_STATUSES.has(reviewStatus)) {
      missingRequirements.push(requirementKey);

      if (
        reviewStatus === "rejected" ||
        reviewStatus === "resubmission_required"
      ) {
        rejectedRequirements.push(requirementKey);
      }

      continue;
    }

    satisfiedCount += 1;

    if (reviewStatus === "pending") {
      pendingCount += 1;
    }

    if (reviewStatus === "approved") {
      approvedCount += 1;
    }
  }

  const requiredCount = requiredKeys.length;
  const documentsConfigured = requiredCount > 0;

  const documentsComplete =
    documentsConfigured &&
    satisfiedCount === requiredCount;

  const documentsApproved =
    documentsConfigured &&
    approvedCount === requiredCount;

  const documents = {
    configured: documentsConfigured,
    complete: documentsComplete,
    approved: documentsApproved,
    requiredCount,
    satisfiedCount,
    pendingCount,
    missingRequirements,
    rejectedRequirements,
  };

  /* =======================================================
     COMPLIANCE REASONS
  ======================================================= */

  const reasons: string[] = [];

  if (!tasksComplete) {
    reasons.push("tasks_incomplete");
  }

  if (!documentsConfigured) {
    reasons.push("document_requirements_not_configured");
  }

  if (missingRequirements.length > 0) {
    reasons.push("documents_incomplete");
  }

  if (rejectedRequirements.length > 0) {
    reasons.push("documents_rejected");
  }

  if (verificationStatus === "rejected") {
    reasons.push("application_changes_required");
  }

  /* =======================================================
     TASK SETUP TAKES PRIORITY
  ======================================================= */

  if (!tasksComplete) {
    return {
      status:
        verificationStatus === "rejected"
          ? "changes_required"
          : "incomplete",

      nextStep: "tasks",

      account,

      tasks,
      documents,

      canSubmit: false,
      reasons,
    };
  }

  /* =======================================================
     DOCUMENT CONFIGURATION ERROR
  ======================================================= */

  if (!documentsConfigured) {
    return {
      status: "configuration_error",
      nextStep: "documents",

      account,

      tasks,
      documents,

      canSubmit: false,
      reasons,
    };
  }

  /* =======================================================
     DOCUMENTS INCOMPLETE OR REJECTED
  ======================================================= */

  if (!documentsComplete) {
    return {
      status:
        verificationStatus === "rejected" ||
        rejectedRequirements.length > 0
          ? "changes_required"
          : "incomplete",

      nextStep: "documents",

      account,

      tasks,
      documents,

      canSubmit: false,
      reasons,
    };
  }

  /* =======================================================
     APPLICATION AWAITING REVIEW
  ======================================================= */

  if (verificationStatus === "submitted") {
    return {
      status: "pending_review",
      nextStep: "documents",

      account: {
        eligible: false,
        restricted: false,
      },

      tasks,
      documents,

      canSubmit: false,
      reasons: [
        ...reasons,
        "application_pending_review",
      ],
    };
  }

  /* =======================================================
     APPROVED ACCOUNT
  ======================================================= */

  if (
    verificationStatus === "approved" &&
    accountStatus === "active" &&
    documentsApproved
  ) {
    return {
      status: "approved",
      nextStep: "dashboard",

      account: {
        eligible: true,
        restricted: false,
      },

      tasks,
      documents,

      canSubmit: false,
      reasons: [],
    };
  }

  /* =======================================================
     APPROVED BUT ACCOUNT NOT FULLY COMPLIANT
  ======================================================= */

  if (verificationStatus === "approved") {
    return {
      status: "changes_required",
      nextStep: "documents",

      account: {
        eligible: false,
        restricted: false,
      },

      tasks,
      documents,

      canSubmit: false,
      reasons: [
        ...reasons,
        "approved_account_failed_compliance_check",
      ],
    };
  }

  /* =======================================================
     APPLICATION REJECTED
  ======================================================= */

  if (verificationStatus === "rejected") {
    return {
      status: "changes_required",
      nextStep: "documents",

      account: {
        eligible: false,
        restricted: false,
      },

      tasks,
      documents,

      canSubmit: documentsComplete,
      reasons,
    };
  }

  /* =======================================================
     READY FOR SUBMISSION OR WAITING FOR DOCUMENT REVIEW
  ======================================================= */

  return {
    status: "incomplete",
    nextStep: "documents",

    account: {
      eligible: false,
      restricted: false,
    },

    tasks,
    documents,

    canSubmit: documentsComplete,
    reasons,
  };
}