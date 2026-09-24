import { responseError } from "@/lib/errorMessage";
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/**
 * Restores the short-lived access token after a full page load. The refresh
 * credential is an httpOnly cookie, so it deliberately never reaches browser
 * storage. Calling this before protected queries prevents a refresh from being
 * mistaken for a logout.
 */
export type SessionRestoreResult = {
  token: string | null;
  /** The API could not be reached yet; this is not evidence of a logout. */
  unavailable: boolean;
};

export async function restoreAccessToken(
  configuredBase: string,
): Promise<SessionRestoreResult> {
  try {
    const response = await fetch(`${configuredBase}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    // A 401 means the refresh session has genuinely ended. A startup/network
    // error must not immediately throw the user back to Login.
    if (!response.ok) return { token: null, unavailable: response.status >= 500 };
    const data = (await response.json()) as { accessToken?: string };
    const token = typeof data.accessToken === "string" ? data.accessToken : null;
    setAccessToken(token);
    return { token, unavailable: false };
  } catch {
    return { token: null, unavailable: true };
  }
}

export function installAuthenticatedFetch(configuredBase: string) {
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = configuredBase
    ? new URL(configuredBase).origin
    : window.location.origin;

  const normalize = (input: RequestInfo | URL) => {
    const source = input instanceof Request ? input.url : String(input);
    const url = new URL(source, window.location.href);
    if (
      configuredBase &&
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/")
    ) {
      return new URL(`${configuredBase}${url.pathname}${url.search}`);
    }
    return url;
  };

  const refresh = () => {
    if (!refreshPromise) {
      const refreshUrl = `${configuredBase}/api/auth/refresh`;
      refreshPromise = nativeFetch(refreshUrl, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          if (!response.ok) throw await responseError(response, "Session expired");
          const data = (await response.json()) as { accessToken: string };
          setAccessToken(data.accessToken);
          return data.accessToken;
        })
        .catch(() => {
          setAccessToken(null);
          window.dispatchEvent(new Event("auth:expired"));
          return null;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  };

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = normalize(input);
    const isApi = url.origin === apiOrigin && url.pathname.startsWith("/api/");
    if (!isApi) return nativeFetch(input, init);

    const send = (token: string | null) => {
      const headers = new Headers(
        init.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (token && !headers.has("authorization"))
        headers.set("authorization", `Bearer ${token}`);
      return nativeFetch(url, { ...init, headers, credentials: "include" });
    };

    let response = await send(accessToken);
    const publicAuthRequest = [
      "/api/auth/me",
      "/api/auth/login",
      "/api/auth/login-key",
      "/api/auth/refresh",
    ].includes(url.pathname);
    if (response.status === 401 && !publicAuthRequest) {
      const renewed = await refresh();
      if (renewed) response = await send(renewed);
    }
    return response;
  };
}
