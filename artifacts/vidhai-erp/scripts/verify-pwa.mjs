import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist=resolve(import.meta.dirname,"../dist/public");
for(const file of ["index.html","sw.js","manifest.webmanifest","pwa-192x192.png","pwa-512x512.png","pwa-maskable-512x512.png","apple-touch-icon.png","favicon.png"])assert.ok(existsSync(resolve(dist,file)),`${file} missing`);
const manifest=JSON.parse(readFileSync(resolve(dist,"manifest.webmanifest"),"utf8"));
assert.equal(manifest.name,"Vidhai ERP Production Control Center");
assert.equal(manifest.display,"standalone");
assert.equal(manifest.theme_color,"#20BFAF");
assert.equal(manifest.icons.length,3);
assert.ok(manifest.icons.some(icon=>icon.purpose==="maskable"&&icon.sizes==="512x512"));
const sw=readFileSync(resolve(dist,"sw.js"),"utf8");
for(const marker of ["vidhai-navigation-","vidhai-public-images-","SKIP_WAITING","index.html","/api/"])assert.ok(sw.includes(marker),`${marker} absent from sw.js`);
assert.ok(!/\/api\/[^"']+\.(json|js)/.test(sw),"API response unexpectedly precached");
const html=readFileSync(resolve(dist,"index.html"),"utf8");
for(const marker of ["theme-color","apple-mobile-web-app-capable","apple-touch-icon","manifest.webmanifest"])assert.ok(html.includes(marker),`${marker} absent from HTML`);
console.log("PWA artifact verification passed");
