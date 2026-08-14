export const MAX_GROWING_ROOM_IMPORT_ROWS = 500;

export type GrowingRoomInput = {
  name?: unknown;
  capacity?: unknown;
  notes?: unknown;
};
export type ValidGrowingRoomInput = {
  name: string;
  capacity: number | null;
  notes: string | null;
};
export type GrowingRoomValidation =
  | { ok: true; value: ValidGrowingRoomInput }
  | { ok: false; errors: string[] };

export const normalizeGrowingRoomName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

export function validateGrowingRoomInput(
  input: GrowingRoomInput,
): GrowingRoomValidation {
  const errors: string[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const rawCapacity = input.capacity;
  let capacity: number | null = null;

  if (!name) errors.push("Room Name is required");
  else if (name.length > 120)
    errors.push("Room Name must be 120 characters or fewer");

  if (rawCapacity !== null && rawCapacity !== undefined && rawCapacity !== "") {
    const parsed =
      typeof rawCapacity === "number"
        ? rawCapacity
        : Number(String(rawCapacity).trim());
    if (!Number.isInteger(parsed) || parsed <= 0)
      errors.push("Capacity must be a positive whole number");
    else if (parsed > 1_000_000)
      errors.push("Capacity must be 1,000,000 or less");
    else capacity = parsed;
  }

  if (
    input.notes !== null &&
    input.notes !== undefined &&
    typeof input.notes !== "string"
  )
    errors.push("Notes must be text");
  else if (notes.length > 1000)
    errors.push("Notes must be 1000 characters or fewer");

  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { name, capacity, notes: notes || null } };
}
export type GrowingRoomImportResult = {
  rowNumber: number;
  name: string;
  status: "created" | "skipped" | "failed";
  reason?: string;
};

export function prepareGrowingRoomImport(
  rows: any[],
  existingRoomNames: Iterable<string>,
) {
  const existingNames = new Set(
    [...existingRoomNames].map(normalizeGrowingRoomName),
  );
  const workbookNames = new Set<string>();
  const results: GrowingRoomImportResult[] = [];
  const pending: Array<{ rowNumber: number; value: ValidGrowingRoomInput }> =
    [];

  rows.forEach((raw, index) => {
    const rowNumber =
      Number.isInteger(raw?.rowNumber) && raw.rowNumber > 1
        ? raw.rowNumber
        : index + 2;
    const parsed = validateGrowingRoomInput({
      name: raw?.name,
      capacity: raw?.capacity,
      notes: raw?.notes,
    });
    const displayName = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!parsed.ok) {
      results.push({
        rowNumber,
        name: displayName,
        status: "failed",
        reason: parsed.errors.join(". "),
      });
      return;
    }
    const key = normalizeGrowingRoomName(parsed.value.name);
    if (workbookNames.has(key)) {
      results.push({
        rowNumber,
        name: parsed.value.name,
        status: "failed",
        reason: "Duplicate Room Name in this Excel file",
      });
      return;
    }
    workbookNames.add(key);
    if (existingNames.has(key)) {
      results.push({
        rowNumber,
        name: parsed.value.name,
        status: "skipped",
        reason: "Room already exists in Ooty Location B",
      });
      return;
    }
    pending.push({ rowNumber, value: parsed.value });
  });
  return { results, pending };
}
