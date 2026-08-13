import assert from "node:assert/strict";
import test from "node:test";
import {
  cookoutManurePostingKey,
  validateCookoutManure,
} from "../artifacts/api-server/src/lib/ootyCookoutInventory.ts";

test("Cookout uses one stable manure posting key per growing batch", () => {
  assert.equal(cookoutManurePostingKey(7), cookoutManurePostingKey(7));
  assert.notEqual(cookoutManurePostingKey(7), cookoutManurePostingKey(8));
});

test("Cookout manure increments and preserves existing stock", () => {
  const production = validateCookoutManure(500);
  assert.equal(production.ok, true);
  assert.equal(200 + (production.ok ? production.manureKg : 0), 700);
  assert.equal(350 + (production.ok ? 200 : 0), 550);
});

test("Cookout manure accepts zero and existing four-decimal precision", () => {
  assert.equal(validateCookoutManure(0).ok, true);
  assert.equal(validateCookoutManure("12.3456").ok, true);
});

test("Cookout manure rejects missing, negative, invalid, and unsupported precision", () => {
  for (const value of ["", null, undefined, -1, "invalid", NaN, "1.23456"]) {
    assert.equal(validateCookoutManure(value).ok, false);
  }
});
