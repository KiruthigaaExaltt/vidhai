export const HARVEST_STAGES = ["PINNING_FLUSH1", "FLUSH2"] as const;

export function flushNumberForStage(stage: string): 1 | 2 | null {
  if (stage === "PINNING_FLUSH1") return 1;
  if (stage === "FLUSH2") return 2;
  return null;
}

export function harvestInventoryPostingKey(
  growingBatchId: number,
  flushNumber: 1 | 2,
) {
  return `ooty-harvest:${growingBatchId}:flush:${flushNumber}`;
}

export function validateHarvestProduction(harvestData: any) {
  const weightKg = Number(harvestData?.weightKg);
  const mushroomCount = Number(harvestData?.mushroomCount);
  if (!Number.isFinite(weightKg) || weightKg <= 0)
    return {
      ok: false as const,
      error: "Harvest weight must be greater than zero",
    };
  if (!Number.isInteger(mushroomCount) || mushroomCount <= 0)
    return {
      ok: false as const,
      error: "Mushroom count must be a positive whole number",
    };
  return { ok: true as const, weightKg, mushroomCount };
}
