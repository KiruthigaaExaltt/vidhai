export function annurDispatchPostingKey(batchId: number) {
  return `annur-dispatch:${batchId}:grow-bag`;
}
export function validateProducedBags(value: unknown) {
  const producedBags = Number(value);
  if (!Number.isInteger(producedBags) || producedBags <= 0)
    return {
      ok: false as const,
      error: "Produced Bags must be a positive whole number",
    };
  return { ok: true as const, producedBags };
}
export function isAvailableChamber(
  chamber: any,
  type: "turn" | "bulk",
  locationId: number,
) {
  return (
    chamber?.chamberType === type &&
    chamber?.locationId === locationId &&
    chamber?.status === "idle" &&
    chamber?.currentBatchId == null
  );
}
