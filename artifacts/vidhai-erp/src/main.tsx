import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { PwaProvider } from "./pwa/PwaProvider";
const configuredApiBase = String(import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "").replace(/\/api$/, "");
if (configuredApiBase) {
  setBaseUrl(configuredApiBase);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/")) input = `${configuredApiBase}${input}`;
    else if (input instanceof Request && new URL(input.url, window.location.href).origin === window.location.origin && new URL(input.url, window.location.href).pathname.startsWith("/api/")) input = new Request(`${configuredApiBase}${new URL(input.url, window.location.href).pathname}${new URL(input.url, window.location.href).search}`, input);
    return nativeFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<PwaProvider><App /></PwaProvider>);
