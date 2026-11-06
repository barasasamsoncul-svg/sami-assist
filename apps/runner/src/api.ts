import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "sami_runner_access_token";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
};

export type RunnerProfile = {
  id: string;
  phone: string;
  fullName: string | null;
  email: string | null;
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

export async function getRunnerSession(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
}

export async function saveRunnerSession(token: string): Promise<void> {
  if (!token || token.length < 40) {
    throw new Error("The Runner server returned an invalid session.");
  }
  await SecureStore.setItemAsync(SESSION_KEY, token);
}

export async function clearRunnerSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const token = await getRunnerSession();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-sami-client": "runner",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = "Bearer " + token;

  let response: Response;
  try {
    response = await fetch(apiBase() + path, {
      method: options.method || "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    });
  } catch {
    throw new Error(
      "Could not reach SaMi Runner. Check your connection and SaMi API URL.",
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      await clearRunnerSession();
    }
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "SaMi Runner could not complete that request.",
    );
  }

  return payload as T;
}

export async function requestRunnerOtp(phone: string): Promise<void> {
  await apiRequest("/api/runner/auth/request-otp", {
    method: "POST",
    body: { phone },
  });
}

export async function verifyRunnerOtp(
  phone: string,
  code: string,
): Promise<{ sessionToken: string; profileComplete: boolean }> {
  return apiRequest("/api/runner/auth/verify-otp", {
    method: "POST",
    body: { phone, code },
  });
}

export async function getRunnerMe(): Promise<{ runner: RunnerMe }> {
  return apiRequest<{ runner: RunnerMe }>("/api/runner/me");
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

export async function setRunnerAvailability(
  isOnline: boolean,
): Promise<{
  availability: {
    isOnline: boolean;
    lastHeartbeatAt: string | null;
  };
}> {
  return apiRequest("/api/runner/me/availability", {
    method: "POST",
    body: { isOnline },
  });
}

export async function getRunnerJobs(): Promise<{
  offers: RunnerJob[];
  active: RunnerJob[];
}> {
  return apiRequest("/api/runner/jobs");
}

export async function acceptRunnerJob(jobId: string): Promise<void> {
  await apiRequest(
    "/api/runner/jobs/" + encodeURIComponent(jobId) + "/accept",
    { method: "POST", body: {} },
  );
}

export async function updateRunnerJobStatus(
  jobId: string,
  action: "start" | "submit_completion",
): Promise<void> {
  await apiRequest(
    "/api/runner/jobs/" + encodeURIComponent(jobId) + "/status",
    { method: "POST", body: { action } },
  );
}

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