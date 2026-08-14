import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGrowingRoomName,
  prepareGrowingRoomImport,
  validateGrowingRoomImportInput,
  validateGrowingRoomInput,
} from "../src/lib/ootyRoomImport.ts";

test("accepts and normalizes a valid room", () => {
  const result = validateGrowingRoomInput({
    name: " Room 01 ",
    capacity: "1000",
    notes: " South wing ",
  });
  assert.deepEqual(result, {
    ok: true,
    value: { name: "Room 01", capacity: 1000, notes: "South wing" },
  });
});

test("capacity is optional like manual room creation", () => {
  const result = validateGrowingRoomInput({
    name: "Room 02",
    capacity: "",
    notes: "",
  });
  assert.deepEqual(result, {
    ok: true,
    value: { name: "Room 02", capacity: null, notes: null },
  });
});

test("rejects missing names and invalid capacities", () => {
  assert.deepEqual(validateGrowingRoomInput({ name: "", capacity: "abc" }), {
    ok: false,
    errors: [
      "Room Name is required",
      "Capacity must be a positive whole number",
    ],
  });
  assert.equal(
    validateGrowingRoomInput({ name: "Room", capacity: 0 }).ok,
    false,
  );
  assert.equal(
    validateGrowingRoomInput({ name: "Room", capacity: -1 }).ok,
    false,
  );
});

test("normalizes duplicate identity case-insensitively", () => {
  assert.equal(
    normalizeGrowingRoomName(" Room 01 "),
    normalizeGrowingRoomName("room 01"),
  );
});
const assignment = {
  annurBatchCode: "A-260813-011",
  bagsAllocated: 1000,
  spawnRunStartDate: "2026-08-14",
};

test("prepares 50 valid rooms for creation", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    rowNumber: index + 2,
    name: `Room ${index + 1}`,
    capacity: 1000,
    ...assignment,
  }));
  const prepared = prepareGrowingRoomImport(rows, []);
  assert.equal(prepared.pending.length, 50);
  assert.equal(prepared.results.length, 0);
});

test("skips database duplicates and rejects workbook duplicates", () => {
  const prepared = prepareGrowingRoomImport(
    [
      { rowNumber: 2, name: "Room 01", capacity: 1000, ...assignment },
      { rowNumber: 3, name: "Room 02", capacity: 1000, ...assignment },
      { rowNumber: 4, name: " room 02 ", capacity: 1000, ...assignment },
    ],
    ["room 01"],
  );
  assert.equal(prepared.pending.length, 1);
  assert.deepEqual(
    prepared.results.map((row) => row.status),
    ["skipped", "failed"],
  );
});

test("reports invalid rows while retaining valid rows", () => {
  const prepared = prepareGrowingRoomImport(
    [
      { rowNumber: 2, name: "", capacity: 1000, ...assignment },
      { rowNumber: 3, name: "Room 03", capacity: "abc", ...assignment },
      { rowNumber: 4, name: "Room 04", capacity: 800, ...assignment },
    ],
    [],
  );
  assert.equal(prepared.pending.length, 1);
  assert.equal(
    prepared.results.filter((row) => row.status === "failed").length,
    2,
  );
});
test("allows room creation when all assignment fields are blank", () => {
  const roomOnly = validateGrowingRoomImportInput({ name: "Room 05" });
  assert.deepEqual(roomOnly, {
    ok: true,
    value: {
      name: "Room 05",
      capacity: null,
      notes: null,
      annurBatchCode: null,
      bagsAllocated: null,
      spawnRunStartDate: null,
    },
  });
});

test("rejects partially filled or invalid batch assignments", () => {
  const partial = validateGrowingRoomImportInput({
    name: "Room 06",
    annurBatchCode: assignment.annurBatchCode,
  });
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.errors, [
    "Bags Allocated must be a positive whole number when assigning a batch",
    "Spawn Run Start Date must be a valid date in YYYY-MM-DD format when assigning a batch",
  ]);
  assert.equal(
    validateGrowingRoomImportInput({
      name: "Room 06",
      ...assignment,
      spawnRunStartDate: "2026-02-30",
    }).ok,
    false,
  );
});
