import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "sami_errands_access_token";

function apiBase(): string {
  const value = process.env.EXPO_PUBLIC_SAMI_API_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Set EXPO_PUBLIC_SAMI_API_URL in apps/mobile/.env before using SaMi.");
  return value;
}

export type ApiOptions = { method?: "GET" | "POST"; body?: unknown; nativeAuth?: boolean; headers?: Record<string, string> };

export async function apiRequest<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  if (options.nativeAuth) headers["x-sami-client"] = "native";
  if (options.headers) Object.assign(headers, options.headers);

  let response: Response;
  try {
    response = await fetch(apiBase() + path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Could not reach SaMi. Check your connection and API URL, then try again.");
  }

  const payload = await response.json().catch(() => ({}));
  const action = (options.body as { action?: string } | undefined)?.action;
  if (!response.ok) {
    if (response.status === 401 && action !== "login" && action !== "register") {
      await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
    }
    throw new Error(typeof payload?.error === "string" ? payload.error : "SaMi could not complete that request.");
  }
  if (typeof payload?.token === "string" && payload.token.length >= 40) {
    await SecureStore.setItemAsync(SESSION_KEY, payload.token);
  }
  if (action === "logout" || path.includes("action=logout")) {
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  }
  return payload as T;
}

export function dispatchGet<T = any>(action: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ action, ...params });
  return apiRequest<T>("/api/dispatch?" + query.toString());
}

export function dispatchPost<T = any>(
  action: string,
  fields: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return apiRequest<T>("/api/dispatch", {
    method: "POST",
    nativeAuth: true,
    headers,
    body: { action, ...fields },
  });
}

export function locationGet<T = any>(params: Record<string, string>) {
  return apiRequest<T>("/api/location?" + new URLSearchParams(params).toString());
}
