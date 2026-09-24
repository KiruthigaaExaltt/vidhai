import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats an internal 24-hour clock value for display without changing it. */
export function formatTimeTo12h(time: string | null | undefined): string {
  if (!time) return "";
  const match = String(time)
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return String(time);
  const hour24 = Number(match[1]);
  const minute = match[2];
  const hour12 = hour24 % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${minute} ${hour24 < 12 ? "AM" : "PM"}`;
}
