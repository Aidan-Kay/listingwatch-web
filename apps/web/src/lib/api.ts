import type { ApiErrorBody } from "@listingwatch/shared/schemas";

/** A failed API call, carrying the server's error code and any field-level issues. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: { path: string; message: string }[];

  constructor(status: number, code: string, message: string, issues: { path: string; message: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Call the server's JSON API. Resolves with the parsed body (undefined for 204). */
export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network", "Can't reach ListingWatch. Check your connection.");
  }
  if (response.status === 204) return undefined as T;
  if (response.ok) return (await response.json()) as T;
  throw await toApiError(response);
}

/** Upload a file as multipart form data. */
export async function upload<T>(path: string, file: File, method: Method = "PUT"): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api${path}`, { method, body: form, credentials: "same-origin" });
  if (response.ok) return (await response.json()) as T;
  throw await toApiError(response);
}

async function toApiError(response: Response): Promise<ApiError> {
  if (response.status === 401) {
    return new ApiError(401, "unauthenticated", "Your session has expired. Reload the page to sign in again.");
  }
  try {
    const { error } = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, error.code, error.message, error.issues);
  } catch {
    return new ApiError(response.status, "unknown", `The server answered ${response.status}`);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
