const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details: unknown;

  constructor(statusCode: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("hyperdesk_access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("hyperdesk_refresh_token");
}

export function persistSession(accessToken: string, refreshToken: string): void {
  localStorage.setItem("hyperdesk_access_token", accessToken);
  localStorage.setItem("hyperdesk_refresh_token", refreshToken);
  document.cookie = `hyperdesk_access_token=${accessToken}; Path=/; SameSite=Lax`;
}

export function clearSession(): void {
  localStorage.removeItem("hyperdesk_access_token");
  localStorage.removeItem("hyperdesk_refresh_token");
  document.cookie = "hyperdesk_access_token=; Path=/; Max-Age=0";
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown> | FormData;
  token?: string | null;
};

let refreshInFlight: Promise<string | null> | null = null;

async function requestWithToken(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  let requestBody: BodyInit | undefined;
  if (options.body) {
    requestBody = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  return fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: requestBody,
    cache: "no-store"
  });
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { accessToken: string; refreshToken: string };
    persistSession(payload.accessToken, payload.refreshToken);
    return payload.accessToken;
  } catch {
    return null;
  }
}

function handleUnauthorizedSession(): never {
  clearSession();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
  throw new ApiError(401, "UNAUTHORIZED", "Session expired. Please sign in again.");
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.token ?? getAccessToken();
  let response = await requestWithToken(path, options, token);

  const shouldTryRefresh =
    response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh" && path !== "/auth/logout";

  if (shouldTryRefresh) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }

    const freshAccessToken = await refreshInFlight;
    if (!freshAccessToken) {
      handleUnauthorizedSession();
    }

    response = await requestWithToken(path, options, freshAccessToken);
    if (response.status === 401) {
      handleUnauthorizedSession();
    }
  }

  if (!response.ok) {
    let payload: { statusCode?: number; code?: string; message?: string; details?: unknown } = {};
    try {
      payload = (await response.json()) as { statusCode?: number; code?: string; message?: string; details?: unknown };
    } catch {
      // noop
    }
    throw new ApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? "Request failed", payload.details ?? null);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
