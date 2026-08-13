export function cookoutManurePostingKey(growingBatchId: number) {
  return `ooty-cookout:${growingBatchId}:manure`;
}

export function validateCookoutManure(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return { ok: false as const, error: "Manure quantity is required" };
  }
  const manureKg = Number(value);
  if (!Number.isFinite(manureKg) || manureKg < 0) {
    return {
      ok: false as const,
      error: "Manure quantity must be a non-negative number",
    };
  }
  if (Math.abs(manureKg * 10000 - Math.round(manureKg * 10000)) > 1e-7) {
    return {
      ok: false as const,
      error: "Manure quantity supports up to 4 decimal places",
    };
  }
  return { ok: true as const, manureKg };
}
