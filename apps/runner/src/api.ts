
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";

const SESSION_KEY = "sami_runner_access_token";

const PUBLIC_AUTH_PATHS = [
  "/api/runner/auth/request-otp",
  "/api/runner/auth/verify-otp",
];

const ONBOARDING_DOCUMENTS_PATH =
  "/api/runner/me/onboarding/documents";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

export type RunnerProfile = {
  id: string;
  phone: string | null;
  email: string | null;
  fullName: string | null;
  accountStatus: string;
  verificationStatus: string;
  serviceArea: string | null;
  vehicleType: string | null;
  vehicleRegistration: string | null;
  profileComplete: boolean;
};

export type RunnerMe = RunnerProfile & {
  availability: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
};

export type RunnerJob = {
  id: string;
  publicCode: string;
  title: string;
  category: string;
  description: string;
  pickupLabel: string;
  destinationLabel: string;
  distanceKm: number | null;
  runnerPayoutAmount: number | null;
  currency: string;
  status: string;
  offerExpiresAt?: string | null;
};

export type RunnerAuthenticatedAccount = {
  id: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  accountStatus: string;
  verificationStatus: string;
  serviceArea: string | null;
  vehicleType: string | null;
  selectedCategories: string[];
};

export type RunnerOtpPurpose = "login" | "register";

export type RunnerOtpChallenge = {
  ok: boolean;
  purpose: RunnerOtpPurpose;
  challengeId: string;
  destination: string;
  expiresInSeconds: number;
  message: string;
};

/**
 * Registration captures identity and contact details only.
 * Task categories are selected after email verification.
 */
export type RunnerRegistrationInput = {
  fullName: string;
  email: string;
  phone: string;
};

export type RunnerOnboardingStatus =
  | "incomplete"
  | "pending_review"
  | "approved"
  | "changes_required";

export type RunnerNextStep =
  | "tasks"
  | "onboarding"
  | "status"
  | "app";

export type RunnerOtpVerificationResult = {
  ok: boolean;
  sessionToken: string;
  expiresInDays: number;
  profileComplete: boolean;
  onboardingStatus: RunnerOnboardingStatus;
  nextStep: RunnerNextStep;
  runner: RunnerAuthenticatedAccount;
};

export type RunnerCategory = {
  key: string;
};

export type RunnerDocumentRequirement = {
  key: string;
  categoryKey: string | null;
  vehicleType: string;
  documentType: string;
  title: string;
  instructions: string | null;
  required: boolean;
};

export type RunnerUploadedDocument = {
  id: string;
  documentType: string;
  categoryKey: string | null;
  requirementKey: string | null;
  reviewStatus: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type RunnerOnboardingData = {
  ok: boolean;
  onboardingStatus: RunnerOnboardingStatus;
  runner: {
    id: string;
    fullName: string | null;
    email: string | null;
    accountStatus: string;
    verificationStatus: string;
    serviceArea: string | null;
    vehicleType: string | null;
    vehicleRegistration: string | null;
    selectedCategories: string[];
  };
  requirements: RunnerDocumentRequirement[];
  documents: RunnerUploadedDocument[];
};

export type RunnerDocumentFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type RunnerDocumentUploadResult = {
  ok: boolean;
  message: string;
  document: RunnerUploadedDocument;
};

export type RunnerDocumentGroupUploadResult = {
  ok: boolean;
  message: string;
  documents: RunnerUploadedDocument[];
  document: RunnerUploadedDocument;
  uploadCount: number;
};

export type RunnerOnboardingSubmissionResult = {
  ok: boolean;
  message: string;
  onboardingStatus: "pending_review";
  runner: {
    accountStatus: string;
    verificationStatus: string;
  };
};

function apiBase(): string {
  const value = process.env.EXPO_PUBLIC_SAMI_API_URL
    ?.trim()
    .replace(/\/+$/, "");

  if (!value) {
    throw new Error(
      "Set EXPO_PUBLIC_SAMI_API_URL in apps/runner/.env before using SaMi Runner.",
    );
  }

  return value;
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(
    () => undefined,
  );
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    const nested = (cause as Error & {
      cause?: unknown;
    }).cause;

    if (nested instanceof Error && nested.message) {
      return `${cause.message}: ${nested.message}`;
    }

    return cause.message || cause.name;
  }

  return String(cause || "Unknown network error");
}

function getApiError(
  payload: unknown,
  fallback: string,
): string {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

/**
 * Normalize common Kenyan mobile number formats to E.164.
 *
 * Examples:
 * 0712345678   -> +254712345678
 * 0112345678   -> +254112345678
 * 254712345678 -> +254712345678
 * +254712345678 -> +254712345678
 */
function normalizeKenyanPhone(value: string): string {
  const trimmed = value.trim();

  if (!/^[+\d\s().-]+$/.test(trimmed)) {
    throw new Error("Enter a valid Kenyan mobile number.");
  }

  const digits = trimmed.replace(/\D/g, "");

  if (/^0[17]\d{8}$/.test(digits)) {
    return `+254${digits.slice(1)}`;
  }

  if (/^254[17]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^[17]\d{8}$/.test(digits)) {
    return `+254${digits}`;
  }

  throw new Error(
    "Enter a valid Kenyan mobile number, such as 0712 345 678.",
  );
}

export async function getRunnerSession(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY).catch(
    () => null,
  );
}

export async function saveRunnerSession(
  token: string,
): Promise<void> {
  if (!token || token.length < 40) {
    throw new Error(
      "The Runner server returned an invalid session.",
    );
  }

  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearRunnerSession(): Promise<void> {
  await clearSession();
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const token = await getRunnerSession();
  const method = options.method || "GET";
  const requestUrl = apiBase() + path;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-sami-client": "runner",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  let response: Response;

  try {
    response = await expoFetch(requestUrl, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });
  } catch (cause) {
    const detail = describeError(cause);

    console.error("[SaMi Runner API] Network request failed.", {
      method,
      path,
      detail,
    });

    throw new Error(
      "Could not reach SaMi Runner. Check your connection and SaMi API URL.",
    );
  }

  const payload: unknown = await response.json().catch(
    () => ({}),
  );

  if (!response.ok) {
    const isPublicAuthRequest =
      PUBLIC_AUTH_PATHS.includes(path);

    if (
      response.status === 401 &&
      token &&
      !isPublicAuthRequest
    ) {
      await clearSession();
    }

    throw new Error(
      getApiError(
        payload,
        `SaMi Runner request failed with HTTP ${response.status}.`,
      ),
    );
  }

  return payload as T;
}

/* -----------------------------------------
   MULTIPART DOCUMENT UPLOAD
------------------------------------------ */

function appendRunnerFile(
  formData: FormData,
  fieldName: string,
  file: RunnerDocumentFile,
): void {
  if (!file.uri) {
    throw new Error("Select a document to upload.");
  }

  formData.append(
    fieldName,
    {
      uri: file.uri,
      name: file.name || "runner-document",
      type: file.mimeType || "application/octet-stream",
    } as unknown as Blob,
  );
}

async function uploadRunnerFile<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = await getRunnerSession();

  if (!token) {
    throw new Error(
      "Your Runner session has expired. Sign in again.",
    );
  }

  const requestUrl = apiBase() + path;

  try {
    const response = await expoFetch(requestUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-sami-client": "runner",
        Authorization: "Bearer " + token,
        // Do not set Content-Type here.
        // Native fetch supplies the multipart boundary.
      },
      body: formData,
    });

    const payload: unknown = await response.json().catch(
      () => ({}),
    );

    if (!response.ok) {
      if (response.status === 401) {
        await clearSession();
      }

      throw new Error(
        getApiError(
          payload,
          `Document upload failed with HTTP ${response.status}.`,
        ),
      );
    }

    return payload as T;
  } catch (cause) {
    if (cause instanceof Error) {
      throw cause;
    }

    console.error(
      "[SaMi Runner API] Document upload failed.",
      describeError(cause),
    );

    throw new Error(
      "Could not upload your document. Check your connection and try again.",
    );
  }
}

/* -----------------------------------------
   RUNNER EMAIL AUTHENTICATION
------------------------------------------ */

export async function requestRunnerOtp(
  email: string,
): Promise<RunnerOtpChallenge> {
  const normalizedEmail = email.trim().toLowerCase();

  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new Error("Enter a valid email address.");
  }

  return apiRequest<RunnerOtpChallenge>(
    "/api/runner/auth/request-otp",
    {
      method: "POST",
      body: {
        email: normalizedEmail,
        purpose: "login",
      },
    },
  );
}

export async function requestRunnerRegistrationOtp(
  input: RunnerRegistrationInput,
): Promise<RunnerOtpChallenge> {
  const fullName = input.fullName
    .trim()
    .replace(/\s+/g, " ");

  const email = input.email.trim().toLowerCase();
  const phone = normalizeKenyanPhone(input.phone);

  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error(
      "Your full name must contain between 2 and 120 characters.",
    );
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address.");
  }

  return apiRequest<RunnerOtpChallenge>(
    "/api/runner/auth/request-otp",
    {
      method: "POST",
      body: {
        email,
        purpose: "register",
        fullName,
        phone,
      },
    },
  );
}

export async function verifyRunnerOtp(
  challengeId: string,
  code: string,
): Promise<RunnerOtpVerificationResult> {
  return apiRequest<RunnerOtpVerificationResult>(
    "/api/runner/auth/verify-otp",
    {
      method: "POST",
      body: {
        challengeId,
        code,
      },
    },
  );
}

/* -----------------------------------------
   RUNNER TASK CATEGORIES
------------------------------------------ */

export async function getRunnerCategories(): Promise<{
  ok: boolean;
  categories: RunnerCategory[];
}> {
  return apiRequest("/api/runner/categories");
}

/* -----------------------------------------
   RUNNER PROFILE
------------------------------------------ */

export async function getRunnerMe(): Promise<{
  runner: RunnerMe;
}> {
  return apiRequest<{ runner: RunnerMe }>(
    "/api/runner/me",
  );
}

export async function updateRunnerProfile(input: {
  fullName: string;
  serviceArea: string;
  vehicleType: string;
  vehicleRegistration?: string;
}): Promise<void> {
  await apiRequest("/api/runner/me", {
    method: "PUT",
    body: input,
  });
}

/* -----------------------------------------
   RUNNER ONBOARDING
------------------------------------------ */

export async function getRunnerOnboarding(): Promise<RunnerOnboardingData> {
  return apiRequest<RunnerOnboardingData>(
    "/api/runner/me/onboarding",
  );
}

export async function updateRunnerOnboarding(input: {
  serviceArea: string;
  vehicleType: string;
  vehicleRegistration?: string;
}): Promise<{
  ok: boolean;
  message: string;
  requirements: RunnerDocumentRequirement[];
}> {
  return apiRequest(
    "/api/runner/me/onboarding",
    {
      method: "PUT",
      body: input,
    },
  );
}

/**
 * Upload one document requirement.
 *
 * This helper must not be used for either National ID side.
 * National ID front and back are submitted together using
 * uploadRunnerNationalId().
 */
export async function uploadRunnerDocument(input: {
  requirementKey: string;
  file: RunnerDocumentFile;
}): Promise<RunnerDocumentUploadResult> {
  const requirementKey = input.requirementKey.trim();

  if (!requirementKey) {
    throw new Error(
      "Choose the document requirement before uploading.",
    );
  }

  if (
    requirementKey === "identity_national_id_front" ||
    requirementKey === "identity_national_id_back"
  ) {
    throw new Error(
      "Submit both sides of your National ID together.",
    );
  }

  const formData = new FormData();

  formData.append("requirementKey", requirementKey);

  appendRunnerFile(
    formData,
    "file",
    input.file,
  );

  return uploadRunnerFile<RunnerDocumentUploadResult>(
    ONBOARDING_DOCUMENTS_PATH,
    formData,
  );
}

/**
 * Upload both sides of a National ID in a single request.
 *
 * The backend validates both files and creates both
 * document records in one database transaction.
 */
export async function uploadRunnerNationalId(input: {
  front: RunnerDocumentFile;
  back: RunnerDocumentFile;
}): Promise<RunnerDocumentGroupUploadResult> {
  if (!input.front?.uri || !input.back?.uri) {
    throw new Error(
      "Select both the front and back of your National ID.",
    );
  }

  const formData = new FormData();

  formData.append(
    "requirementKeyFront",
    "identity_national_id_front",
  );

  appendRunnerFile(
    formData,
    "fileFront",
    input.front,
  );

  formData.append(
    "requirementKeyBack",
    "identity_national_id_back",
  );

  appendRunnerFile(
    formData,
    "fileBack",
    input.back,
  );

  const result =
    await uploadRunnerFile<RunnerDocumentGroupUploadResult>(
      ONBOARDING_DOCUMENTS_PATH,
      formData,
    );

  if (
    !Array.isArray(result.documents) ||
    result.documents.length !== 2 ||
    result.uploadCount !== 2
  ) {
    throw new Error(
      "The server did not confirm both National ID sides. Refresh your document checklist before continuing.",
    );
  }

  return result;
}

export async function submitRunnerOnboarding(): Promise<RunnerOnboardingSubmissionResult> {
  return apiRequest<RunnerOnboardingSubmissionResult>(
    "/api/runner/me/onboarding",
    {
      method: "POST",
      body: {},
    },
  );
}

/* -----------------------------------------
   RUNNER AVAILABILITY
------------------------------------------ */

export async function setRunnerAvailability(
  isOnline: boolean,
): Promise<{
  availability: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
}> {
  return apiRequest(
    "/api/runner/me/availability",
    {
      method: "POST",
      body: { isOnline },
    },
  );
}

/* -----------------------------------------
   RUNNER ERRANDS
------------------------------------------ */

export async function getRunnerJobs(): Promise<{
  offers: RunnerJob[];
  active: RunnerJob[];
}> {
  return apiRequest("/api/runner/jobs");
}

export async function acceptRunnerJob(
  jobId: string,
): Promise<void> {
  await apiRequest(
    "/api/runner/jobs/" +
      encodeURIComponent(jobId) +
      "/accept",
    {
      method: "POST",
      body: {},
    },
  );
}

export async function updateRunnerJobStatus(
  jobId: string,
  action: "start" | "submit_completion",
): Promise<void> {
  await apiRequest(
    "/api/runner/jobs/" +
      encodeURIComponent(jobId) +
      "/status",
    {
      method: "POST",
      body: { action },
    },
  );
}

/* -----------------------------------------
   RUNNER LIVE LOCATION
------------------------------------------ */

export async function publishRunnerLocation(input: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}): Promise<void> {
  await apiRequest("/api/runner/location", {
    method: "POST",
    body: input,
  });
}
