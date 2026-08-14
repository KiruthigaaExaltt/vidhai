import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every Ledger API mount enforces visibility, RBAC, then unlock", async () => {
  const source = await read("artifacts/api-server/src/routes/index.ts");
  const mounts = [...source.matchAll(/router\.use\([\s\S]*?accountsRouter,[\s\S]*?\);/g)];
  assert.equal(mounts.length, 1, "Ledger/accounts router must have one central mount");
  const mount = mounts[0][0];
  const visibility = mount.indexOf('requireProductModule("ledger")');
  const rbac = mount.indexOf("requireModulePermission(accountsScope)");
  const unlock = mount.indexOf('requireModuleUnlock("ledger")');
  assert.ok(visibility >= 0, "Ledger mount is missing Module Visibility");
  assert.ok(rbac > visibility, "Ledger RBAC must run after Module Visibility");
  assert.ok(unlock > rbac, "Ledger unlock must run after RBAC");
});

test("module encryption has no production default password", async () => {
  const source = await read("artifacts/api-server/src/lib/moduleEncryption.ts");
  assert.doesNotMatch(source, /123456/);
  assert.match(source, /passwordHash/);
  assert.match(source, /bcryptjs/);
});

test("encryptable modules are explicitly allowlisted", async () => {
  const source = await read("artifacts/api-server/src/lib/moduleEncryption.ts");
  assert.match(source, /value === "ledger" \|\| value === "contracta"/);
  assert.doesNotMatch(source, /ENCRYPTED_MODULES\[String\(/);
});
