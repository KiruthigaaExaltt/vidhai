import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../src/routes/services.ts", import.meta.url), "utf8");
const tableNames = [...new Set(source.match(/\b\w+Table\b/g))];
const tableModule = `export const db = __sampleDb.db;\n${tableNames.map((name) => `export const ${name} = __sampleDb.table('${name}');`).join("\n")}\nexport const eq = (field, value) => row => String(row[field.name]) === String(value);`;
const built = await build({
  stdin: { contents: source, resolveDir: fileURLToPath(new URL("../src/routes", import.meta.url)), loader: "ts" },
  bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
  plugins: [{ name: "service-sample-db", setup(builder) {
    builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "sample" }));
    builder.onResolve({ filter: /\/lib\/pagination$/ }, () => ({ path: "pagination", namespace: "sample" }));
    builder.onLoad({ filter: /.*/, namespace: "sample" }, (args) => ({
      contents: args.path === "db" ? tableModule : "export const paginateQuery = () => ({skip: 0, limit: 100}); export const paginatedResponse = (data, total) => ({data, totalCount: total});",
      loader: "js",
    }));
  } }],
});

function servicesFixture(sampleServices) {
  const table = (name) => new Proxy({ _name: name }, { get: (obj, key) => key in obj ? obj[key] : { name: key } });
  const db = { select: () => {
    let target;
    const query = { from(value) { target = value; return query; }, orderBy() { return query; }, then(resolve, reject) {
      return Promise.resolve(structuredClone(target._name === "servicesTable" ? sampleServices : [])).then(resolve, reject);
    } };
    return query;
  } };
  const module = { exports: {} };
  new Function("require", "module", "exports", "__sampleDb", built.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports, { db, table });
  const router = module.exports.default;
  return async () => {
    const route = router.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.get);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await route.route.stack[0].handle({ query: {} }, res);
    return res;
  };
}

test("sample Casing Soil service record is returned by Services API without vault-only filtering", async () => {
  const listServices = servicesFixture([{ id: 1, name: "Casing Soil", hsnSac: "9983", unit: "kg", sellingPrice: "0", gstPercent: "0" }]);
  const response = await listServices();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].name, "Casing Soil");

  const page = await readFile(new URL("../../../artifacts/vidhai-erp/src/pages/inventory/index.tsx", import.meta.url), "utf8");
  const tabs = page.slice(page.indexOf('value={productsSubTab}'), page.indexOf('{/* Inventory sub-tab */'));
  assert.doesNotMatch(tabs, /value="services"/);
  assert.match(page, /value="casing-vault"/);
});

test("Pawn Vault sample-data path is absent from current inventory sources", async () => {
  const page = await readFile(new URL("../../../artifacts/vidhai-erp/src/pages/inventory/index.tsx", import.meta.url), "utf8");
  const inventoryRoutes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page, /\bPawn(?: Vault)?\b/i);
  assert.doesNotMatch(inventoryRoutes, /\bpawn\b/i);
});
