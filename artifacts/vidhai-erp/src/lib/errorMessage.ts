const DEFAULT_ERROR = "The request could not be completed. Please try again.";

function messageFromPayload(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object") return undefined;
  const payload = value as Record<string, unknown>;
  for (const key of ["error", "message", "detail", "error_description", "title"]) {
    const message = payload[key];
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return undefined;
}

export function getErrorMessage(error: unknown, fallback = DEFAULT_ERROR): string {
  if (!error || typeof error !== "object") return messageFromPayload(error) || fallback;
  const value = error as { data?: unknown; response?: { data?: unknown }; message?: unknown };
  const message = messageFromPayload(value.data) || messageFromPayload(value.response?.data) || messageFromPayload(value);
  if (message === "Failed to fetch" || message === "NetworkError when attempting to fetch resource.")
    return "Unable to connect to the server. Check your connection and try again.";
  return message || fallback;
}

// Clone the response so error handling never consumes the caller's body.
export async function responseError(response: Response, fallback = DEFAULT_ERROR): Promise<Error> {
  const body: unknown = await response.clone().json().catch(() => null);
  const defaults: Record<number, string> = {
    401: "Your session has expired. Please sign in again.",
    403: "You do not have permission to perform this action.",
    404: "The requested record could not be found.",
    413: "The uploaded file is too large.",
    429: "Too many requests. Please wait and try again.",
  };
  return Object.assign(new Error(messageFromPayload(body) || defaults[response.status] || fallback), { status: response.status });
}