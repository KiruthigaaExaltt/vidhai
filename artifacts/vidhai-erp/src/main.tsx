import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { PwaProvider } from "./pwa/PwaProvider";
import { installAuthenticatedFetch } from "./lib/authTokens";

const configuredApiBase = String(import.meta.env.VITE_API_BASE || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

if (configuredApiBase) {
  setBaseUrl(configuredApiBase);
}
installAuthenticatedFetch(configuredApiBase);

createRoot(document.getElementById("root")!).render(
  <PwaProvider>
    <App />
  </PwaProvider>,
);
