
import { fetch as expoFetch } from "expo/fetch";
import { File as ExpoFile } from "expo-file-system";

import {
  apiRequest,
  clearRunnerSession,
  getRunnerSession,
} from "@/api";

import type {
  RunnerDocumentFile,
  RunnerDocumentReviewStatus,
  RunnerVehicleType,
} from "@/api";

const VEHICLE_MANAGEMENT_PATH =
  "/api/runner/me/vehicle";

const VEHICLE_CHANGE_PATH =
  "/api/runner/me/vehicle/change";

const VEHICLE_REACTIVATE_PATH =
  "/api/runner/me/vehicle/reactivate";

/* -------------------------------------------------------------------------- */
/* VEHICLE TYPES                                                              */
/* -------------------------------------------------------------------------- */

export type RunnerVehicleDocument = {
  id: string;
  vehicleId: string | null;
  documentType: string;
  requirementKey: string | null;
  reviewStatus: RunnerDocumentReviewStatus | string;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  validUntil: string | null;
};

export type RunnerManagedVehicle = {
  id: string;
  vehicleType: RunnerVehicleType | string;
  storedVehicleType: string;
  vehicleLabel: string;
  vehicleModel: string | null;
  vehicleRegistration: string | null;
  status: string;
  isActive: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents: RunnerVehicleDocument[];
  canReactivate: boolean;
  reactivationBlockReason: string | null;
};

export type RunnerVehicleRequirement = {
  key: string;
  categoryKey: string | null;
  vehicleType: string;
  storedVehicleType: string;
  documentType: string;
  title: string;
  instructions: string;
  required: boolean;
  requiresExpiry: boolean;
  displayOrder: number;
};

export type RunnerVehicleReplacementRequest = {
  id: string;
  vehicleId: string | null;
  vehicleType: string;
  storedVehicleType: string;
  vehicleLabel: string;
  vehicleModel: string | null;
  vehicleRegistration: string | null;
  status: string;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documents: RunnerVehicleDocument[];
};

export type RunnerVehicleManagementData = {
  ok: boolean;

  runner: {
    id: string;
    accountStatus: string;
    verificationStatus: string;
    serviceArea: string | null;
    selectedCategories: string[];
  };

  activeVehicle: RunnerManagedVehicle | null;

  savedVehicles: RunnerManagedVehicle[];

  pendingReplacement:
    RunnerVehicleReplacementRequest | null;

  replacementRequests:
    RunnerVehicleReplacementRequest[];

  replacementRequirements:
    RunnerVehicleRequirement[];

  replacementEligibility: {
    canSubmit: boolean;
    hasActiveVehicle: boolean;
    hasOpenReplacement: boolean;
    hasActiveErrand: boolean;
    activeErrandStatus: string | null;
    blockReason: string | null;
  };

  reactivationEligibility: {
    hasActiveErrand: boolean;
    activeErrandStatus: string | null;
    eligibleVehicleIds: string[];
  };
};

export type RunnerVehicleChangeInput = {
  vehicleType: RunnerVehicleType;
  vehicleModel?: string | null;
  vehicleRegistration?: string | null;

  documents: Array<{
    requirementKey: string;
    file: RunnerDocumentFile;
    validUntil?: string | null;
  }>;
};

export type RunnerVehicleChangeResult = {
  ok: boolean;
  message: string;
  requestId: string;
  vehicleId: string;
  vehicleStatus: "pending_review";
  vehicleIsActive: false;

  documents: Array<{
    id: string;
    requirementKey: string;
    reviewStatus: RunnerDocumentReviewStatus | string;
    validUntil: string | null;
  }>;
};

export type RunnerVehicleReactivationResult = {
  ok: boolean;
  message: string;

  activeVehicle: {
    id: string;
    vehicleType: string;
    vehicleModel: string | null;
    vehicleRegistration: string | null;
    status: "approved";
    isActive: true;
  };

  previousVehicleId: string | null;
};

/* -------------------------------------------------------------------------- */
/* API RESPONSE VALIDATION                                                    */
/* -------------------------------------------------------------------------- */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getApiBase(): string {
  const value = process.env.EXPO_PUBLIC_SAMI_API_URL
    ?.trim()
    .replace(/\/+$/, "");

  if (!value) {
    throw new Error(
      "SaMi Runner API configuration is missing.",
    );
  }

  return value;
}

function getResponseError(
  payload: unknown,
  fallback: string,
): string {
  if (
    isRecord(payload) &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

/* -------------------------------------------------------------------------- */
/* MULTIPART DOCUMENT HANDLING                                                */
/* -------------------------------------------------------------------------- */

function appendVehicleDocument(
  formData: FormData,
  fieldName: string,
  file: RunnerDocumentFile,
): void {
  if (!file.uri) {
    throw new Error(
      "Select a document to upload.",
    );
  }

  let nativeFile: ExpoFile;

  try {
    nativeFile = new ExpoFile(file.uri);
  } catch {
    throw new Error(
      "The selected document could not be opened. Select it again.",
    );
  }

  if (!nativeFile.exists) {
    throw new Error(
      "The selected document is no longer available. Select it again.",
    );
  }

  if (nativeFile.size <= 0) {
    throw new Error(
      "The selected document is empty.",
    );
  }

  const filename =
    file.name?.trim() ||
    nativeFile.name ||
    "vehicle-document";

  formData.append(
    fieldName,
    nativeFile,
    filename,
  );
}

async function uploadVehicleForm<T>(
  formData: FormData,
): Promise<T> {
  const token = await getRunnerSession();

  if (!token) {
    throw new Error(
      "Your Runner session has expired. Sign in again.",
    );
  }

  let response: Response;

  try {
    response = await expoFetch(
      getApiBase() + VEHICLE_CHANGE_PATH,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "x-sami-client": "runner",
          Authorization: "Bearer " + token,
        },
        body: formData,
      },
    );
  } catch {
    throw new Error(
      "Could not reach SaMi Runner. Check your connection and try again.",
    );
  }

  const payload: unknown = await response.json().catch(
    () => ({}),
  );

  if (!response.ok) {
    if (response.status === 401) {
      await clearRunnerSession();
    }

    throw new Error(
      getResponseError(
        payload,
        `Vehicle document submission failed with HTTP ${response.status}.`,
      ),
    );
  }

  return payload as T;
}

/* -------------------------------------------------------------------------- */
/* GET RUNNER VEHICLES                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fetches:
 * - Active vehicle.
 * - Saved vehicle history.
 * - Replacement requests.
 * - Vehicle document review and expiry information.
 * - Server-calculated replacement and reactivation eligibility.
 *
 * This operation is read-only.
 */
export async function getRunnerVehicles(): Promise<RunnerVehicleManagementData> {
  const result =
    await apiRequest<RunnerVehicleManagementData>(
      VEHICLE_MANAGEMENT_PATH,
    );

  if (
    !isRecord(result) ||
    result.ok !== true ||
    !Array.isArray(result.savedVehicles) ||
    !Array.isArray(result.replacementRequests) ||
    !Array.isArray(result.replacementRequirements) ||
    !isRecord(result.replacementEligibility) ||
    !isRecord(result.reactivationEligibility)
  ) {
    throw new Error(
      "The Runner server returned incomplete vehicle information. Refresh and try again.",
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* SUBMIT VEHICLE REPLACEMENT                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Submits a replacement vehicle and its required documents.
 *
 * Each document is uploaded with matching fields:
 * - requirementKey
 * - file
 * - validUntil
 *
 * An empty expiry value is sent when a document does not require expiry.
 * The server independently validates the configured requirements.
 */
export async function submitRunnerVehicleChange(
  input: RunnerVehicleChangeInput,
): Promise<RunnerVehicleChangeResult> {
  if (
    input.vehicleType !== "bike" &&
    input.vehicleType !== "motorbike" &&
    input.vehicleType !== "vehicle"
  ) {
    throw new Error(
      "Choose Bike, Motorbike or Vehicle.",
    );
  }

  if (
    !Array.isArray(input.documents) ||
    input.documents.length === 0
  ) {
    throw new Error(
      "Upload the required documents for your replacement vehicle.",
    );
  }

  if (input.documents.length > 10) {
    throw new Error(
      "You can upload up to 10 vehicle documents at a time.",
    );
  }

  if (input.vehicleType !== "bike") {
    if ((input.vehicleModel?.trim().length ?? 0) < 2) {
      throw new Error(
        "Enter your replacement vehicle make and model.",
      );
    }

    if (!input.vehicleRegistration?.trim()) {
      throw new Error(
        "Enter your replacement vehicle registration number.",
      );
    }
  }

  const formData = new FormData();
  const seenRequirements = new Set<string>();

  formData.append(
    "vehicleType",
    input.vehicleType,
  );

  if (input.vehicleModel?.trim()) {
    formData.append(
      "vehicleModel",
      input.vehicleModel.trim(),
    );
  }

  if (input.vehicleRegistration?.trim()) {
    formData.append(
      "vehicleRegistration",
      input.vehicleRegistration.trim(),
    );
  }

  for (const document of input.documents) {
    const requirementKey =
      document.requirementKey.trim();

    if (!requirementKey) {
      throw new Error(
        "A vehicle document is missing its requirement type.",
      );
    }

    if (seenRequirements.has(requirementKey)) {
      throw new Error(
        "A vehicle document requirement has been selected more than once.",
      );
    }

    if (!document.file?.uri) {
      throw new Error(
        "Select a file for each required vehicle document.",
      );
    }

    const validUntil =
      document.validUntil?.trim() ?? "";

    if (
      validUntil &&
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(validUntil)
    ) {
      throw new Error(
        "Enter document expiry dates in YYYY-MM-DD format.",
      );
    }

    seenRequirements.add(requirementKey);

    formData.append(
      "requirementKey",
      requirementKey,
    );

    appendVehicleDocument(
      formData,
      "file",
      document.file,
    );

    // One expiry entry per document keeps all three multipart
    // arrays aligned with their corresponding document.
    formData.append(
      "validUntil",
      validUntil,
    );
  }

  const result =
    await uploadVehicleForm<RunnerVehicleChangeResult>(
      formData,
    );

  if (
    result?.ok !== true ||
    !result.vehicleId ||
    !result.requestId ||
    !Array.isArray(result.documents)
  ) {
    throw new Error(
      "The server did not confirm your replacement vehicle submission. Refresh your vehicle information.",
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* REACTIVATE SAVED VEHICLE                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reactivates one explicitly selected saved vehicle.
 *
 * The server independently verifies:
 * - Vehicle ownership.
 * - Previous approval and inactive status.
 * - Mandatory document approvals.
 * - Current document expiry dates.
 * - No active errand.
 * - No unresolved replacement request.
 *
 * The server performs the vehicle switch in one transaction.
 * Runner online/offline availability is not changed.
 */
export async function reactivateRunnerVehicle(
  vehicleId: string,
): Promise<RunnerVehicleReactivationResult> {
  const normalizedVehicleId = vehicleId.trim();

  if (!isUuid(normalizedVehicleId)) {
    throw new Error(
      "Select a valid saved vehicle to reactivate.",
    );
  }

  const result =
    await apiRequest<RunnerVehicleReactivationResult>(
      VEHICLE_REACTIVATE_PATH,
      {
        method: "POST",
        body: {
          vehicleId: normalizedVehicleId,
        },
      },
    );

  if (
    result?.ok !== true ||
    result.activeVehicle?.id !== normalizedVehicleId ||
    result.activeVehicle.isActive !== true ||
    result.activeVehicle.status !== "approved"
  ) {
    throw new Error(
      "The server did not confirm vehicle reactivation. Refresh your vehicle information.",
    );
  }

  return result;
}
