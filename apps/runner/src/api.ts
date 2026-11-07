
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

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.includes(path);

    if (
      response.status === 401 &&
      token &&
      !isPublicAuthRequest
    ) {
      await clearSession();
    }

    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `SaMi Runner request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

/* -----------------------------------------
   RUNNER EMAIL AUTHENTICATION
------------------------------------------ */

export async function requestRunnerOtp(
  email: string,
): Promise<{
  ok: boolean;
  challengeId: string;
  destination: string;
  expiresInSeconds: number;
  message: string;
}> {
  return apiRequest(
    "/api/runner/auth/request-otp",
    {
      method: "POST",
      body: { email },
    },
  );
}

export async function verifyRunnerOtp(
  challengeId: string,
  code: string,
): Promise<{
  ok: boolean;
  sessionToken: string;
  expiresInDays: number;
  profileComplete: boolean;
  runner: RunnerAuthenticatedAccount;
}> {
  return apiRequest(
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
