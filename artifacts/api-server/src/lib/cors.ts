export function configuredCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.CORS_ALLOWED_ORIGINS, env.CORS_ORIGIN].filter(Boolean).join(",");
  const origins = [...new Set(raw.split(",").map(value => value.trim()).filter(Boolean).map(value => {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`Invalid CORS origin: "${value}"`); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value.replace(/\/$/, "")) {
      throw new Error(`CORS origins must be HTTP(S) origins without a path: "${value}"`);
    }
    return url.origin;
  }))];
  if (!origins.length && env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    throw new Error("CORS_ALLOWED_ORIGINS (or legacy CORS_ORIGIN) is required outside development");
  }
  return origins;
}

export function corsOriginHandler(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowed.has(origin) || (!allowed.size && process.env.NODE_ENV === "development")) return callback(null, true);
    return callback(null, false);
  };
}
