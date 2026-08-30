import { logger } from "./logger";

const endpoint = String(process.env.REVERSE_GEOCODING_URL || "https://nominatim.openstreetmap.org/reverse").trim();
const timeoutMs = Math.max(500, Number(process.env.REVERSE_GEOCODING_TIMEOUT_MS) || 2500);
const userAgent = String(process.env.REVERSE_GEOCODING_USER_AGENT || "VidhaiERP/1.0 (attendance reverse geocoding)").trim();
const cache = new Map<string, string | null>();
let providerQueue: Promise<void> = Promise.resolve();
let lastProviderRequestAt = 0;

async function respectProviderRateLimit() {
  const previous = providerQueue;
  let release!: () => void;
  providerQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const delay = Math.max(0, 1000 - (Date.now() - lastProviderRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastProviderRequestAt = Date.now();
  release();
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await respectProviderRateLimit();
      const url = new URL(endpoint);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("addressdetails", "1");
      if (process.env.REVERSE_GEOCODING_EMAIL) url.searchParams.set("email", process.env.REVERSE_GEOCODING_EMAIL);
      const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: any = await response.json();
      const address = String(body?.display_name || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000) || null;
      cache.set(key, address);
      return address;
    } catch (error) {
      logger.warn({ err: error, attempt }, "Attendance reverse geocoding failed");
    } finally {
      clearTimeout(timer);
    }
  }
  cache.set(key, null);
  return null;
}
