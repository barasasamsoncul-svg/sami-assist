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

const VEHICLE_MANAGEMENT_PATH = "/api/runner/me/vehicle";
const VEHICLE_CHANGE_PATH = "/api/runner/me/vehicle/change";
const VEHICLE_REACTIVATE_PATH = "/api/runner/me/vehicle/reactivate";

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
  pendingReplacement: RunnerVehicleReplacementRequest | null;
  replacementRequests: RunnerVehicleReplacementRequest[];
  replacementRequirements: RunnerVehicleRequirement[];
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
/* RESPONSE AND DATE VALIDATION                                               */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getApiBase(): string {
  const value = process.env.EXPO_PUBLIC_SAMI_API_URL?.trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error("SaMi Runner API configuration is missing.");
  }
  return value;
}

function getResponseError(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCurrentExpiryDate(value: string): boolean {
  return isValidDateOnly(value) && value >= todayInNairobi();
}

function assertVehicleManagementResponse(
  value: unknown,
): asserts value is RunnerVehicleManagementData {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error("The Runner server returned an invalid vehicle response.");
  }

  if (
    !isRecord(value.runner) ||
    typeof value.runner.id !== "string" ||
    typeof value.runner.accountStatus !== "string" ||
    typeof value.runner.verificationStatus !== "string" ||
    !Array.isArray(value.runner.selectedCategories) ||
    !Array.isArray(value.savedVehicles) ||
    !Array.isArray(value.replacementRequests) ||
    !Array.isArray(value.replacementRequirements) ||
    !isRecord(value.replacementEligibility) ||
    !isRecord(value.reactivationEligibility)
  ) {
    throw new Error(
      "The Runner server returned incomplete vehicle information. Refresh and try again.",
    );
  }

  if (
    typeof value.replacementEligibility.canSubmit !== "boolean" ||
    typeof value.replacementEligibility.hasActiveVehicle !== "boolean" ||
    typeof value.replacementEligibility.hasOpenReplacement !== "boolean" ||
    typeof value.replacementEligibility.hasActiveErrand !== "boolean" ||
    typeof value.reactivationEligibility.hasActiveErrand !== "boolean" ||
    !Array.isArray(value.reactivationEligibility.eligibleVehicleIds)
  ) {
    throw new Error(
      "The Runner server returned incomplete vehicle eligibility information. Refresh and try again.",
    );
  }

  if (value.activeVehicle !== null && !isRecord(value.activeVehicle)) {
    throw new Error("The Runner server returned an invalid active vehicle.");
  }

  if (value.pendingReplacement !== null && !isRecord(value.pendingReplacement)) {
    throw new Error("The Runner server returned an invalid replacement request.");
  }
}

/* -------------------------------------------------------------------------- */
/* MULTIPART DOCUMENT HANDLING                                                */
/* -------------------------------------------------------------------------- */

function appendVehicleDocument(
  formData: FormData,
  fieldName: string,
  file: RunnerDocumentFile,
): void {
  if (!file.uri?.trim()) {
    throw new Error("Select a document to upload.");
  }

  let nativeFile: ExpoFile;
  try {
    nativeFile = new ExpoFile(file.uri);
  } catch {
    throw new Error("The selected document could not be opened. Select it again.");
  }

  if (!nativeFile.exists) {
    throw new Error("The selected document is no longer available. Select it again.");
  }

  if (nativeFile.size <= 0) {
    throw new Error("The selected document is empty.");
  }

  if (nativeFile.size > 10 * 1024 * 1024) {
    throw new Error("Each vehicle document must be 10 MB or smaller.");
  }

  const filename = file.name?.trim() || nativeFile.name || "vehicle-document";
  formData.append(fieldName, nativeFile, filename);
}

async function uploadVehicleForm<T>(formData: FormData): Promise<T> {
  const token = await getRunnerSession();
  if (!token) {
    throw new Error("Your Runner session has expired. Sign in again.");
  }

  let response: Response;
  try {
    response = await expoFetch(getApiBase() + VEHICLE_CHANGE_PATH, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-sami-client": "runner",
        Authorization: "Bearer " + token,
      },
      body: formData,
    });
  } catch {
    throw new Error(
      "Could not reach SaMi Runner. Check your connection and try again.",
    );
  }

  const payload: unknown = await response.json().catch(() => ({}));
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

/** Read-only: active vehicle, saved history, review status and eligibility. */
export async function getRunnerVehicles(): Promise<RunnerVehicleManagementData> {
  const result: unknown = await apiRequest<unknown>(VEHICLE_MANAGEMENT_PATH);
  assertVehicleManagementResponse(result);
  return result;
}

/* -------------------------------------------------------------------------- */
/* SUBMIT VEHICLE REPLACEMENT                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Submits a replacement vehicle and its configured vehicle documents.
 * The server remains authoritative for mandatory requirements. An empty
 * document list is allowed here because a bicycle may have no configured
 * vehicle documents; motorised vehicle checklists are enforced by the API.
 */
export async function submitRunnerVehicleChange(
  input: RunnerVehicleChangeInput,
): Promise<RunnerVehicleChangeResult> {
  if (
    input.vehicleType !== "bike" &&
    input.vehicleType !== "motorbike" &&
    input.vehicleType !== "vehicle"
  ) {
    throw new Error("Choose Bike, Motorbike or Vehicle.");
  }

  if (!Array.isArray(input.documents) || input.documents.length > 10) {
    throw new Error("You can upload up to 10 vehicle documents at a time.");
  }

  if (input.vehicleType !== "bike") {
    if ((input.vehicleModel?.trim().length ?? 0) < 2) {
      throw new Error("Enter your replacement vehicle make and model.");
    }

    const registration = input.vehicleRegistration?.trim() ?? "";
    if (!registration) {
      throw new Error("Enter your replacement vehicle registration number.");
    }
  }

  const formData = new FormData();
  const seenRequirements = new Set<string>();

  formData.append("vehicleType", input.vehicleType);

  if (input.vehicleModel?.trim()) {
    formData.append("vehicleModel", input.vehicleModel.trim());
  }

  if (input.vehicleRegistration?.trim()) {
    formData.append("vehicleRegistration", input.vehicleRegistration.trim().toUpperCase());
  }

  for (const document of input.documents) {
    const requirementKey = document.requirementKey.trim();
    if (!requirementKey) {
      throw new Error("A vehicle document is missing its requirement type.");
    }

    if (seenRequirements.has(requirementKey)) {
      throw new Error("A vehicle document requirement has been selected more than once.");
    }

    if (!document.file?.uri) {
      throw new Error("Select a file for each vehicle document you upload.");
    }

    const validUntil = document.validUntil?.trim() ?? "";
    if (validUntil && !isValidDateOnly(validUntil)) {
      throw new Error("Enter document expiry dates in YYYY-MM-DD format.");
    }
    if (validUntil && !isCurrentExpiryDate(validUntil)) {
      throw new Error("A vehicle document expiry date cannot be in the past.");
    }

    seenRequirements.add(requirementKey);
    formData.append("requirementKey", requirementKey);
    appendVehicleDocument(formData, "file", document.file);
    // The API expects one validUntil entry for each uploaded document.
    formData.append("validUntil", validUntil);
  }

  const result: unknown = await uploadVehicleForm<unknown>(formData);
  if (
    !isRecord(result) ||
    result.ok !== true ||
    typeof result.message !== "string" ||
    typeof result.requestId !== "string" ||
    !isUuid(result.requestId) ||
    typeof result.vehicleId !== "string" ||
    !isUuid(result.vehicleId) ||
    result.vehicleStatus !== "pending_review" ||
    result.vehicleIsActive !== false ||
    !Array.isArray(result.documents) ||
    result.documents.length !== input.documents.length
  ) {
    throw new Error(
      "The server did not confirm the replacement vehicle and every document. Refresh your vehicle information before trying again.",
    );
  }

  const uploadedKeys = new Set<string>();
  for (const item of result.documents) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !isUuid(item.id) ||
      typeof item.requirementKey !== "string" ||
      item.reviewStatus !== "pending" ||
      !seenRequirements.has(item.requirementKey)
    ) {
      throw new Error(
        "The server returned an incomplete vehicle document confirmation. Refresh your vehicle information.",
      );
    }
    uploadedKeys.add(item.requirementKey);
  }

  if (uploadedKeys.size !== input.documents.length) {
    throw new Error(
      "The server did not confirm every selected vehicle document. Refresh your vehicle information.",
    );
  }

  return result as RunnerVehicleChangeResult;
}

/* -------------------------------------------------------------------------- */
/* REACTIVATE SAVED VEHICLE                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reactivates one explicitly selected, previously approved vehicle.
 * The server verifies ownership, document approvals and expiry, active jobs,
 * and open replacement requests inside its transaction. Availability is not
 * changed by this operation.
 */
export async function reactivateRunnerVehicle(
  vehicleId: string,
): Promise<RunnerVehicleReactivationResult> {
  const normalizedVehicleId = vehicleId.trim();
  if (!isUuid(normalizedVehicleId)) {
    throw new Error("Select a valid saved vehicle to reactivate.");
  }

  const result = await apiRequest<RunnerVehicleReactivationResult>(
    VEHICLE_REACTIVATE_PATH,
    {
      method: "POST",
      body: { vehicleId: normalizedVehicleId },
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
