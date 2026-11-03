import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "sami_errands_access_token";

const PUBLIC_AUTH_ACTIONS = [
  "requestOtp",
  "verifyOtp",
  "login",
  "register",
  "bootstrap",
];

function apiBase(): string {
  const value = process.env.EXPO_PUBLIC_SAMI_API_URL
    ?.trim()
    .replace(/\/+$/, "");

  if (!value) {
    throw new Error(
      "Set EXPO_PUBLIC_SAMI_API_URL in apps/mobile/.env before using SaMi.",
    );
  }

  return value;
}

export type ApiOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  nativeAuth?: boolean;
  headers?: Record<string, string>;
};

async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(
    () => undefined,
  );
}

export async function apiRequest<T = any>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const token = await SecureStore.getItemAsync(
    SESSION_KEY,
  ).catch(() => null);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-sami-client": "native",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const action = (
    options.body as { action?: string } | undefined
  )?.action;

  const isLogout =
    action === "logout" ||
    path.includes("action=logout");

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
    if (isLogout) {
      await clearSession();
    }

    throw new Error(
      "Could not reach SaMi. Check your connection and API URL, then try again.",
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (isLogout) {
      await clearSession();
    } else if (
      response.status === 401 &&
      token &&
      !PUBLIC_AUTH_ACTIONS.includes(action || "")
    ) {
      await clearSession();
    }

    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "SaMi could not complete that request.",
    );
  }

  if (
    typeof payload?.token === "string" &&
    payload.token.length >= 40
  ) {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      payload.token,
    );
  }

  if (isLogout) {
    await clearSession();
  }

  return payload as T;
}

export function dispatchGet<T = any>(
  action: string,
  params: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    action,
    ...params,
  });

  return apiRequest<T>(
    "/api/dispatch?" + query.toString(),
  );
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
    body: {
      action,
      ...fields,
    },
  });
}

export function locationGet<T = any>(
  params: Record<string, string>,
) {
  return apiRequest<T>(
    "/api/location?" +
      new URLSearchParams(params).toString(),
  );
}