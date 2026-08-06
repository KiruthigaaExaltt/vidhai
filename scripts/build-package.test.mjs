import test from "node:test";
import assert from "node:assert/strict";
import { verifyEcosystemText, verifyEntries, zipEntries } from "./verify-build-package.mjs";

const frontend=["public/index.html","public/manifest.webmanifest","public/sw.js","public/assets/app.js","public/assets/app.css","README.md"];
const backend=["dist/index.mjs",".env.staging","ecosystem.config.cjs","package.json","README.md","uploads/.gitkeep"];
test("accepts expected frontend and backend layouts",()=>{assert.equal(verifyEntries(frontend,"frontend","staging").files,6);assert.equal(verifyEntries(backend,"backend","staging").files,6)});
test("rejects hosting collision suffixes",()=>assert.throws(()=>verifyEntries([...frontend,"public/assets/app_copy.js"],"frontend","staging"),/_copy|copy-suffixed/i));
test("rejects case-insensitive duplicates",()=>assert.throws(()=>verifyEntries([...frontend,"PUBLIC/INDEX.HTML"],"frontend","staging"),/duplicate/i));
test("rejects unsafe traversal paths",()=>assert.throws(()=>verifyEntries([...frontend,"../index.html"],"frontend","staging"),/unsafe/i));
test("rejects missing frontend entry point",()=>assert.throws(()=>verifyEntries(frontend.filter(x=>x!=="public/index.html"),"frontend","staging"),/index\.html/i));
test("rejects missing backend environment",()=>assert.throws(()=>verifyEntries(backend.filter(x=>x!==".env.staging"),"backend","staging"),/\.env\.staging/i));
test("rejects corrupt ZIP data",()=>assert.throws(()=>zipEntries(Buffer.from("not a zip")),/corrupt|central-directory/i));
test("accepts environment-specific PM2 config",()=>assert.doesNotThrow(()=>verifyEcosystemText('node_args: "--env-file=.env.staging"',"staging")));
test("rejects staging PM2 config loading production env",()=>assert.throws(()=>verifyEcosystemText('node_args: "--env-file=.env.prod"',"staging"),/\.env\.staging/i));
