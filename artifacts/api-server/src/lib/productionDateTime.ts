export function resolveProductionDateTime(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === "")
    return new Date();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function chronologyError(
  eventTime: Date,
  minimumTime: Date | string | null | undefined,
  eventLabel: string,
): string | null {
  if (!minimumTime) return null;
  const minimum = new Date(minimumTime);
  if (!Number.isNaN(minimum.getTime()) && eventTime < minimum)
    return `${eventLabel} cannot be earlier than the batch initialization or active stage start (${minimum.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}).`;
  return null;
}
