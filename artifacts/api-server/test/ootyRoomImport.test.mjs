import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGrowingRoomName,
  prepareGrowingRoomImport,
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
test("prepares 50 valid rooms for creation", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    rowNumber: index + 2,
    name: `Room ${index + 1}`,
    capacity: 1000,
  }));
  const prepared = prepareGrowingRoomImport(rows, []);
  assert.equal(prepared.pending.length, 50);
  assert.equal(prepared.results.length, 0);
});

test("skips database duplicates and rejects workbook duplicates", () => {
  const prepared = prepareGrowingRoomImport(
    [
      { rowNumber: 2, name: "Room 01", capacity: 1000 },
      { rowNumber: 3, name: "Room 02", capacity: 1000 },
      { rowNumber: 4, name: " room 02 ", capacity: 1000 },
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
      { rowNumber: 2, name: "", capacity: 1000 },
      { rowNumber: 3, name: "Room 03", capacity: "abc" },
      { rowNumber: 4, name: "Room 04", capacity: 800 },
    ],
    [],
  );
  assert.equal(prepared.pending.length, 1);
  assert.equal(
    prepared.results.filter((row) => row.status === "failed").length,
    2,
  );
});
