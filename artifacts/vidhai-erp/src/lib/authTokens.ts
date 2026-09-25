let accessToken: string | null = null;
let refreshPromise: Promise<SessionRestoreResult> | null = null;
let originalFetch: typeof fetch | undefined;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => { accessToken = token; };
export type SessionRestoreResult = { token: string | null; unavailable: boolean };

/** Keep the refresh credential in its persistent httpOnly cookie. Coalesce
 * startup/retry requests and serialize cookie rotation between browser tabs. */
export function restoreAccessToken(configuredBase: string): Promise<SessionRestoreResult> {
  if (!refreshPromise) {
    const restore = async (): Promise<SessionRestoreResult> => {
      try {
        const response = await (originalFetch || fetch)(`${configuredBase}/api/auth/refresh`, {
          method: "POST", credentials: "include", headers: { Accept: "application/json" },
        });
        if (response.status === 401) {
          setAccessToken(null);
          window.dispatchEvent(new Event("auth:expired"));
          return { token: null, unavailable: false };
        }
        if (!response.ok) return { token: null, unavailable: true };
        const data = await response.json();
        if (typeof data.accessToken !== "string" || !data.accessToken)
          return { token: null, unavailable: true };
        setAccessToken(data.accessToken);
        return { token: data.accessToken, unavailable: false };
      } catch {
        // A network or service failure does not invalidate the saved session.
        return { token: null, unavailable: true };
      }
    };
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const task = async (): Promise<SessionRestoreResult> => locks
      ? await locks.request("vidhai-session-refresh", restore)
      : await restore();
    refreshPromise = task().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export function installAuthenticatedFetch(configuredBase: string) {
  const nativeFetch = window.fetch.bind(window);
  originalFetch = nativeFetch;
  const apiOrigin = configuredBase ? new URL(configuredBase, window.location.href).origin : window.location.origin;

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const source = input instanceof Request ? input.url : String(input);
    let url = new URL(source, window.location.href);
    if (configuredBase && url.origin === window.location.origin && url.pathname.startsWith("/api/"))
      url = new URL(`${configuredBase}${url.pathname}${url.search}`, window.location.href);
    if (url.origin !== apiOrigin || !url.pathname.startsWith("/api/")) return nativeFetch(input, init);

    const send = (token: string | null) => {
      const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
      if (token) headers.set("authorization", `Bearer ${token}`);
      const request = input instanceof Request ? new Request(url, input.clone()) : url;
      return nativeFetch(request, { ...init, headers, credentials: "include" });
    };
    const sentToken = accessToken;
    let response = await send(sentToken);
    const publicAuth = ["/api/auth/login", "/api/auth/login-key", "/api/auth/refresh", "/api/auth/logout"].includes(url.pathname);
    if (response.status === 401 && !publicAuth) {
      // Another request may already have replaced the expired token.
      const restored = accessToken && accessToken !== sentToken
        ? { token: accessToken, unavailable: false }
        : await restoreAccessToken(configuredBase);
      if (restored.token) response = await send(restored.token);
      else if (restored.unavailable)
        return Response.json({ error: "Unable to refresh session. Please retry." }, { status: 503 });
    }
    return response;
  };
}
