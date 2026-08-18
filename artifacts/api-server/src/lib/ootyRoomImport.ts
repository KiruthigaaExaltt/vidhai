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
export type ValidGrowingRoomImportInput = ValidGrowingRoomInput & {
  annurBatchCode: string | null;
  bagsAllocated: number | null;
  spawnRunStartDate: string | null;
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
export function validateGrowingRoomImportInput(
  input: GrowingRoomInput & {
    annurBatchCode?: unknown;
    bagsAllocated?: unknown;
    spawnRunStartDate?: unknown;
  },
):
  | { ok: true; value: ValidGrowingRoomImportInput }
  | { ok: false; errors: string[] } {
  const room = validateGrowingRoomInput(input);
  const errors = room.ok ? [] : [...room.errors];
  const annurBatchCode =
    typeof input.annurBatchCode === "string" ? input.annurBatchCode.trim() : "";
  const rawBags = input.bagsAllocated;
  const bagsAllocated =
    typeof rawBags === "number"
      ? rawBags
      : Number(String(rawBags ?? "").trim());
  const spawnRunStartDate =
    typeof input.spawnRunStartDate === "string"
      ? input.spawnRunStartDate.trim()
      : "";

  const hasAnnurBatch = annurBatchCode !== "";
  const hasBags =
    rawBags !== null && rawBags !== undefined && String(rawBags).trim() !== "";
  const hasStartDate = spawnRunStartDate !== "";
  const hasAnyAssignment = hasAnnurBatch || hasBags || hasStartDate;

  if (hasAnyAssignment) {
    if (!hasAnnurBatch)
      errors.push("Annur Batch is required when assigning a batch");
    if (!hasBags || !Number.isInteger(bagsAllocated) || bagsAllocated <= 0)
      errors.push(
        "Bags Allocated must be a positive whole number when assigning a batch",
      );
    if (
      room.ok &&
      room.value.capacity !== null &&
      Number.isInteger(bagsAllocated) &&
      bagsAllocated > room.value.capacity
    )
      errors.push(
        `Bags Allocated cannot exceed room capacity of ${room.value.capacity}`,
      );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spawnRunStartDate)) {
      errors.push(
        "Spawn Run Start Date must be a valid date in YYYY-MM-DD format when assigning a batch",
      );
    } else {
      const [year, month, day] = spawnRunStartDate.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      )
        errors.push(
          "Spawn Run Start Date must be a valid date in YYYY-MM-DD format when assigning a batch",
        );
    }
  }
  return errors.length || !room.ok
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          ...room.value,
          annurBatchCode: hasAnyAssignment ? annurBatchCode : null,
          bagsAllocated: hasAnyAssignment ? bagsAllocated : null,
          spawnRunStartDate: hasAnyAssignment ? spawnRunStartDate : null,
        },
      };
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
  const pending: Array<{
    rowNumber: number;
    value: ValidGrowingRoomImportInput;
  }> = [];

  rows.forEach((raw, index) => {
    const rowNumber =
      Number.isInteger(raw?.rowNumber) && raw.rowNumber > 1
        ? raw.rowNumber
        : index + 2;
    const parsed = validateGrowingRoomImportInput({
      name: raw?.name,
      capacity: raw?.capacity,
      notes: raw?.notes,
      annurBatchCode: raw?.annurBatchCode,
      bagsAllocated: raw?.bagsAllocated,
      spawnRunStartDate: raw?.spawnRunStartDate,
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
