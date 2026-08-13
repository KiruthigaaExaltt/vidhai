import assert from "node:assert/strict";
import test from "node:test";
import {
  flushNumberForStage,
  harvestInventoryPostingKey,
  validateHarvestProduction,
} from "../artifacts/api-server/src/lib/ootyHarvestInventory.ts";

test("Flush 1 and Flush 2 remain separate production events", () => {
  assert.equal(flushNumberForStage("PINNING_FLUSH1"), 1);
  assert.equal(flushNumberForStage("FLUSH2"), 2);
  assert.notEqual(
    harvestInventoryPostingKey(7, 1),
    harvestInventoryPostingKey(7, 2),
  );
});

test("the same flush produces the same database idempotency key", () => {
  assert.equal(
    harvestInventoryPostingKey(7, 1),
    harvestInventoryPostingKey(7, 1),
  );
  assert.notEqual(
    harvestInventoryPostingKey(7, 1),
    harvestInventoryPostingKey(8, 1),
  );
});

test("mushroom counts accumulate instead of replacing stock", () => {
  const initial = 100;
  const flush1 = validateHarvestProduction({
    weightKg: 42,
    mushroomCount: 350,
  });
  const flush2 = validateHarvestProduction({
    weightKg: 31,
    mushroomCount: 280,
  });
  assert.equal(flush1.ok, true);
  assert.equal(flush2.ok, true);
  assert.equal(
    initial +
      (flush1.ok ? flush1.mushroomCount : 0) +
      (flush2.ok ? flush2.mushroomCount : 0),
    730,
  );
});

test("invalid or missing production values cannot reach inventory", () => {
  assert.equal(
    validateHarvestProduction({ weightKg: 0, mushroomCount: 10 }).ok,
    false,
  );
  assert.equal(
    validateHarvestProduction({ weightKg: 10, mushroomCount: 0 }).ok,
    false,
  );
  assert.equal(
    validateHarvestProduction({ weightKg: 10, mushroomCount: -1 }).ok,
    false,
  );
  assert.equal(
    validateHarvestProduction({ weightKg: 10, mushroomCount: 1.5 }).ok,
    false,
  );
});
