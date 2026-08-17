const configuredApiBase = String(import.meta.env.VITE_API_BASE || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

/**
 * Resolves API-owned files against the configured backend origin.
 * Fetch requests are rewritten in main.tsx, but native elements such as
 * <img> do not pass through that wrapper.
 */
export function apiAssetUrl(source: string | null | undefined): string {
  if (!source) return "";
  if (!configuredApiBase || !source.startsWith("/api/")) return source;
  return `${configuredApiBase}${source}`;
}
