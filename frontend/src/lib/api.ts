/** Thin fetch wrapper for the NestJS API (same origin: /api is proxied). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const NO_REFRESH = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "X-Requested-With": "forkan" },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/** Multipart upload of one file (field "file"); the browser sets the content type. */
export const upload = <T>(path: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<T>(path, { method: "PUT", body: form });
};

export async function api<T>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const send = () =>
    fetch(`/api${path}`, {
      method,
      headers: {
        "X-Requested-With": "forkan",
        ...(body !== undefined && !isForm && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !NO_REFRESH.has(path) && (await refreshSession())) {
      res = await send();
    }
  } catch {
    throw new ApiError(0, "NETWORK");
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; params?: Record<string, unknown> };
    throw new ApiError(res.status, data.code ?? "UNKNOWN", data.params);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
