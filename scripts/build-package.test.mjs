import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyEcosystemText,
  verifyEntries,
  zipEntries,
} from "./verify-build-package.mjs";

const frontend = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  ".htaccess",
  "web.config",
  "assets/app.js",
  "assets/app.css",
  "README.md",
];
const backend = [
  "dist/index.mjs",
  "dist/seed-data.mjs",
  ".env.staging",
  "ecosystem.config.cjs",
  "package.json",
  "README.md",
  "uploads/.gitkeep",
];
test("accepts expected frontend and backend layouts", () => {
  assert.equal(verifyEntries(frontend, "frontend", "staging").files, 8);
  assert.equal(verifyEntries(backend, "backend", "staging").files, 7);
});
test("rejects backend without the standalone data seeder", () =>
  assert.throws(
    () =>
      verifyEntries(
        backend.filter((x) => x !== "dist/seed-data.mjs"),
        "backend",
        "staging",
      ),
    /seed-data\.mjs/i,
  ));
test("rejects hosting collision suffixes", () =>
  assert.throws(
    () =>
      verifyEntries([...frontend, "assets/app_copy.js"], "frontend", "staging"),
    /_copy|copy-suffixed/i,
  ));
test("rejects case-insensitive duplicates", () =>
  assert.throws(
    () => verifyEntries([...frontend, "INDEX.HTML"], "frontend", "staging"),
    /duplicate/i,
  ));
test("rejects unsafe traversal paths", () =>
  assert.throws(
    () => verifyEntries([...frontend, "../index.html"], "frontend", "staging"),
    /unsafe/i,
  ));
test("rejects missing frontend entry point", () =>
  assert.throws(
    () =>
      verifyEntries(
        frontend.filter((x) => x !== "index.html"),
        "frontend",
        "staging",
      ),
    /index\.html/i,
  ));
test("rejects a nested public wrapper", () =>
  assert.throws(
    () =>
      verifyEntries(
        frontend.map((x) => (x === "README.md" ? x : `public/${x}`)),
        "frontend",
        "staging",
      ),
    /public\/ wrapper|index\.html/i,
  ));
test("rejects missing backend environment", () =>
  assert.throws(
    () =>
      verifyEntries(
        backend.filter((x) => x !== ".env.staging"),
        "backend",
        "staging",
      ),
    /\.env\.staging/i,
  ));
test("rejects corrupt ZIP data", () =>
  assert.throws(
    () => zipEntries(Buffer.from("not a zip")),
    /corrupt|central-directory/i,
  ));
test("accepts environment-specific PM2 config", () =>
  assert.doesNotThrow(() =>
    verifyEcosystemText('node_args: "--env-file=.env.staging"', "staging"),
  ));
test("rejects staging PM2 config loading production env", () =>
  assert.throws(
    () =>
      verifyEcosystemText('node_args: "--env-file=.env.production"', "staging"),
    /\.env\.staging/i,
  ));
