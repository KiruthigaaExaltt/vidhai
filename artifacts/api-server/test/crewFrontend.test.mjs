import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "../node_modules/esbuild/lib/main.js";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vidhai-erp/src");
let instance = 0;
async function authModule(handler) {
  const events = [];
  globalThis.window = { fetch: handler, location: { href: "http://localhost:5173/", origin: "http://localhost:5173" }, dispatchEvent: event => events.push(event.type) };
  const result = await build({ entryPoints: [path.join(frontend, "lib/authTokens.ts")], bundle: true, write: false, format: "esm", platform: "node" });
  const auth = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text + `\n// instance ${instance++}`).toString("base64"));
  auth.installAuthenticatedFetch("");
  return { auth, events };
}
test("expired access token on /auth/me renews and retries without logout", async () => {
  let refreshes = 0;
  const { auth, events } = await authModule(async (input, init) => {
    if (String(input).endsWith("/auth/refresh")) { refreshes++; return Response.json({ accessToken: "renewed" }); }
    return new Headers(init.headers).get("authorization") === "Bearer renewed" ? Response.json({ id: 1 }) : Response.json({}, { status: 401 });
  });
  auth.setAccessToken("expired");
  assert.equal((await window.fetch("/api/auth/me")).status, 200);
  assert.equal(refreshes, 1); assert.deepEqual(events, []);
});
test("network and 503 renewal failures preserve authentication", async () => {
  for (const failure of ["network", "503"]) {
    const { auth, events } = await authModule(async input => {
      if (String(input).endsWith("/auth/refresh")) { if (failure === "network") throw new TypeError("Failed to fetch"); return new Response("", { status: 503 }); }
      return new Response("", { status: 401 });
    });
    auth.setAccessToken("old-access");
    assert.equal((await window.fetch("/api/auth/me")).status, 503);
    assert.equal(auth.getAccessToken(), "old-access"); assert.deepEqual(events, []);
  }
});
test("only rejected refresh credentials end the session", async () => {
  const { auth, events } = await authModule(async () => new Response("", { status: 401 }));
  auth.setAccessToken("expired"); await window.fetch("/api/auth/me");
  assert.equal(auth.getAccessToken(), null); assert.deepEqual(events, ["auth:expired"]);
});
test("simultaneous startup restoration calls share one cookie rotation", async () => {
  let calls = 0;
  const { auth } = await authModule(async () => { calls++; return Response.json({ accessToken: "restored" }); });
  const [first, second] = await Promise.all([auth.restoreAccessToken(""), auth.restoreAccessToken("")]);
  assert.equal(calls, 1); assert.equal(first.token, "restored"); assert.equal(second.token, "restored");
});
test("authenticated Request retries preserve method and JSON body", async () => {
  const bodies = [];
  const { auth } = await authModule(async (input, init) => {
    if (String(input).endsWith("/auth/refresh")) return Response.json({ accessToken: "renewed" });
    assert.equal(input.method, "POST"); bodies.push(await input.text());
    return new Response("", { status: new Headers(init.headers).get("authorization") === "Bearer renewed" ? 200 : 401 });
  });
  auth.setAccessToken("expired");
  await window.fetch(new Request("http://localhost:5173/api/crew/attendance", { method: "POST", body: '{"punchAction":"punchIn"}' }));
  assert.deepEqual(bodies, ['{"punchAction":"punchIn"}', '{"punchAction":"punchIn"}']);
});
test("12-hour format handles midnight, noon, and evening", async () => {
  const result = await build({ entryPoints: [path.join(frontend, "lib/utils.ts")], bundle: true, write: false, format: "esm", platform: "node" });
  const { formatTimeTo12h } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
  assert.equal(formatTimeTo12h("00:00"), "12:00 AM"); assert.equal(formatTimeTo12h("12:00"), "12:00 PM"); assert.equal(formatTimeTo12h("18:30"), "06:30 PM");
});
test("numeric input removes leading zero while preserving decimals and text identifiers", async () => {
  const result = await build({ entryPoints: [path.join(frontend, "components/ui/input.tsx")], bundle: true, write: false, format: "esm", platform: "node", alias: { "@": frontend } });
  const { Input } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
  for (const [type, entered, expected] of [["number", "016", "16"], ["number", "0.5", "0.5"], ["number", "-016", "-16"], ["text", "001234", "001234"]]) {
    let value;
    const node = Input.render({ type, onChange: event => { value = event.currentTarget.value; } }, null);
    node.props.onChange({ currentTarget: { value: entered } }); assert.equal(value, expected);
  }
});
test("application source has no common broken currency or punctuation encoding", () => {
  const suspicious = /\u00e2\u201a|\u00e2\u20ac|\u00f0\u0178|\ufffd/;
  const bad = [];
  function visit(folder) {
    for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, file.name);
      if (file.isDirectory()) visit(full);
      else if (/\.(tsx?|css)$/.test(file.name) && suspicious.test(fs.readFileSync(full, "utf8"))) bad.push(path.relative(frontend, full));
    }
  }
  visit(frontend); assert.deepEqual(bad, []);
});
