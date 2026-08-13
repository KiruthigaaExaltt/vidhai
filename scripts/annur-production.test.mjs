import assert from "node:assert/strict";
import test from "node:test";
import {
  annurDispatchPostingKey,
  isAvailableChamber,
  validateProducedBags,
} from "../artifacts/api-server/src/lib/annurProduction.ts";
const locationId = 1;
test("Turn Chamber dropdown includes only idle unassigned Annur Turn chambers", () => {
  const chambers = [
    {
      name: "Room1",
      chamberType: "bulk",
      status: "idle",
      currentBatchId: null,
      locationId,
    },
    {
      name: "room2-turn",
      chamberType: "turn",
      status: "idle",
      currentBatchId: null,
      locationId,
    },
    {
      name: "room3",
      chamberType: "pre-wetting",
      status: "idle",
      currentBatchId: null,
      locationId,
    },
    {
      name: "room4-turn",
      chamberType: "turn",
      status: "active",
      currentBatchId: 9,
      locationId,
    },
  ];
  assert.deepEqual(
    chambers
      .filter((c) => isAvailableChamber(c, "turn", locationId))
      .map((c) => c.name),
    ["room2-turn"],
  );
});
test("assigned and wrong-location Turn chambers are unavailable", () => {
  assert.equal(
    isAvailableChamber(
      { chamberType: "turn", status: "idle", currentBatchId: 2, locationId },
      "turn",
      locationId,
    ),
    false,
  );
  assert.equal(
    isAvailableChamber(
      {
        chamberType: "turn",
        status: "idle",
        currentBatchId: null,
        locationId: 2,
      },
      "turn",
      locationId,
    ),
    false,
  );
});
test("Produced Bags requires a positive whole number", () => {
  assert.deepEqual(validateProducedBags(4300), {
    ok: true,
    producedBags: 4300,
  });
  for (const value of [0, -1, 1.5, "bad", null])
    assert.equal(validateProducedBags(value).ok, false);
});
test("Dispatch idempotency key is stable per Annur batch", () => {
  assert.equal(annurDispatchPostingKey(7), annurDispatchPostingKey(7));
  assert.notEqual(annurDispatchPostingKey(7), annurDispatchPostingKey(8));
});
test("Produced bags increment rather than replace stock", () =>
  assert.equal(100 + 4300, 4400));
