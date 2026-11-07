
import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";

const SESSION_KEY = "sami_runner_access_token";

const PUBLIC_AUTH_PATHS = [
  "/api/runner/auth/request-otp",
  "/api/runner/auth/verify-otp",
];

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

export type RunnerRegistrationInput = {
  fullName: string;
  email: string;
  categoryKeys: string[];
};

export type RunnerOnboardingStatus =
  | "incomplete"
  | "pending_review"
  | "approved"
  | "changes_required";

export type RunnerNextStep =
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
        // The native fetch implementation supplies the
        // multipart boundary for FormData automatically.
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
  return apiRequest<RunnerOtpChallenge>(
    "/api/runner/auth/request-otp",
    {
      method: "POST",
      body: {
        email: email.trim().toLowerCase(),
        purpose: "login",
      },
    },
  );
}

export async function requestRunnerRegistrationOtp(
  input: RunnerRegistrationInput,
): Promise<RunnerOtpChallenge> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const categoryKeys = [...new Set(input.categoryKeys)];

  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error("Enter your full name.");
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Enter a valid email address.");
  }

  if (
    categoryKeys.length < 1 ||
    categoryKeys.length > 20
  ) {
    throw new Error(
      "Select at least one task category you can perform.",
    );
  }

  return apiRequest<RunnerOtpChallenge>(
    "/api/runner/auth/request-otp",
    {
      method: "POST",
      body: {
        email,
        purpose: "register",
        fullName,
        categoryKeys,
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

export async function uploadRunnerDocument(input: {
  requirementKey: string;
  file: RunnerDocumentFile;
}): Promise<RunnerDocumentUploadResult> {
  if (!input.requirementKey.trim()) {
    throw new Error(
      "Choose the document requirement before uploading.",
    );
  }

  if (!input.file.uri) {
    throw new Error("Select a document to upload.");
  }

  const formData = new FormData();

  formData.append(
    "requirementKey",
    input.requirementKey.trim(),
  );

  // React Native uses a URI-backed file object. The cast
  // bridges React Native's FormData extension to the
  // standard TypeScript Blob overload.
  formData.append(
    "file",
    {
      uri: input.file.uri,
      name: input.file.name || "runner-document",
      type: input.file.mimeType || "application/octet-stream",
    } as unknown as Blob,
  );

  return uploadRunnerFile<RunnerDocumentUploadResult>(
    "/api/runner/me/onboarding/documents",
    formData,
  );
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
