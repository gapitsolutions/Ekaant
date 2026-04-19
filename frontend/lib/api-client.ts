export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const CSRF_COOKIE_NAME = "csrftoken";
const AUTH_RETRY_EXCLUDED_PATHS = new Set([
  "/api/v1/auth/csrf/",
  "/api/v1/auth/login/",
  "/api/v1/auth/refresh/",
  "/api/v1/auth/logout/",
]);

let authFailureHandler: (() => void) | null = null;
let csrfTokenCache: string | null = null;

export interface ApiRequestOptions {
  method?: ApiMethod;
  body?: unknown;
  retryOn401?: boolean;
  suppressAuthRedirect?: boolean;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  const normalizedBase = API_BASE_URL.replace(/\/+$/, "");
  return `${normalizedBase}${normalizedPath}`;
}

function getCsrfToken(): string | null {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  csrfTokenCache = decodeURIComponent(cookie.split("=")[1] || "");
  return csrfTokenCache;
}

async function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) {
    return;
  }

  const response = await fetch(buildApiUrl("/api/v1/auth/csrf/"), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return;
  }

  const payload = (await response.json()) as {
    data?: { csrf_token?: string };
  };

  const token = payload?.data?.csrf_token;
  if (token) {
    csrfTokenCache = token;
  }
}

function shouldAttachCsrf(method: ApiMethod): boolean {
  return method !== "GET";
}

async function parsePayload<T>(response: Response): Promise<ApiEnvelope<T>> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return (await response.json()) as ApiEnvelope<T>;
}

async function sendRequest<T>(
  path: string,
  options: ApiRequestOptions,
): Promise<{ response: Response; payload: ApiEnvelope<T> }> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (shouldAttachCsrf(method)) {
    await ensureCsrfToken();
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }
  }

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    cache: "no-store",
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    response,
    payload: await parsePayload<T>(response),
  };
}

export function registerAuthFailureHandler(handler: (() => void) | null): void {
  authFailureHandler = handler;
}

async function tryRefreshSession(): Promise<boolean> {
  await ensureCsrfToken();
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  const response = await fetch(buildApiUrl("/api/v1/auth/refresh/"), {
    method: "POST",
    headers,
    credentials: "include",
    cache: "no-store",
  });

  return response.ok;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const retryOn401 = options.retryOn401 ?? true;
  const suppressAuthRedirect = options.suppressAuthRedirect ?? false;

  let { response, payload } = await sendRequest<T>(path, options);

  if (
    response.status === 401 &&
    retryOn401 &&
    !AUTH_RETRY_EXCLUDED_PATHS.has(path)
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      ({ response, payload } = await sendRequest<T>(path, {
        ...options,
        retryOn401: false,
      }));
    }
  }

  if (!response.ok || payload?.success === false) {
    if (
      response.status === 401 &&
      !suppressAuthRedirect &&
      authFailureHandler
    ) {
      authFailureHandler();
    }

    const message = payload?.error?.message || "Request failed";
    throw new Error(message);
  }

  return payload.data as T;
}
