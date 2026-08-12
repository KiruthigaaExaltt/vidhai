import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { PwaProvider } from "./pwa/PwaProvider";

const configuredApiBase = String(import.meta.env.VITE_API_BASE || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

if (configuredApiBase) {
  setBaseUrl(configuredApiBase);
  const nativeFetch = window.fetch.bind(window);
  const apiOrigin = new URL(configuredApiBase).origin;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const inputUrl =
      input instanceof Request
        ? new URL(input.url, window.location.href)
        : new URL(String(input), window.location.href);

    if (
      inputUrl.origin === window.location.origin &&
      inputUrl.pathname.startsWith("/api/")
    ) {
      const target = `${configuredApiBase}${inputUrl.pathname}${inputUrl.search}`;
      input = input instanceof Request ? new Request(target, input) : target;
      inputUrl.href = target;
    }

    const isConfiguredApi =
      inputUrl.origin === apiOrigin && inputUrl.pathname.startsWith("/api/");
    const requestInit = isConfiguredApi
      ? { ...init, credentials: init?.credentials ?? "include" }
      : init;

    return nativeFetch(input, requestInit);
  };
}

createRoot(document.getElementById("root")!).render(
  <PwaProvider>
    <App />
  </PwaProvider>,
);
