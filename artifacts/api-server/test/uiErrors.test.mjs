import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../node_modules/esbuild/lib/main.js";
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vidhai-erp/src");
const result = await build({
  stdin: { contents: `export * from "./lib/errorMessage"; export * from "./lib/queryClient"; export { QueryObserver } from "@tanstack/react-query";`, resolveDir: frontend },
  bundle: true, write: false, format: "esm", platform: "node",
});
const { getErrorMessage, responseError, createAppQueryClient, QueryObserver } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

test("uses API payload messages and supports legacy errors", () => {
  assert.equal(getErrorMessage({ data: { error: "Millets stock is missing" }, message: "Request failed" }), "Millets stock is missing");
  assert.equal(getErrorMessage({ response: { data: { error: "Room is occupied" } } }), "Room is occupied");
  assert.equal(getErrorMessage(new Error("Reading is earlier than stage start")), "Reading is earlier than stage start");
});
test("empty and network errors have useful fallbacks", () => {
  assert.equal(getErrorMessage({}, "Unable to log reading"), "Unable to log reading");
  assert.match(getErrorMessage(new TypeError("Failed to fetch")), /Unable to connect/);
});
test("HTTP errors retain server detail without consuming response", async () => {
  const response = Response.json({error:'Item "Calcium" is missing'}, {status:409});
  const error = await responseError(response, "Request failed");
  assert.equal(error.message, 'Item "Calcium" is missing');
  assert.equal(error.status,409);
  assert.deepEqual(await response.json(), {error:'Item "Calcium" is missing'});
});
test("non-JSON proxy errors use safe, actionable fallbacks", async () => {
  assert.equal((await responseError(new Response("<html>proxy error</html>",{status:403}))).message, "You do not have permission to perform this action.");
  assert.equal((await responseError(new Response("<html>proxy error</html>",{status:502}),"Unable to load rooms")).message, "Unable to load rooms");
});
test("mutations without a handler show one notification", async () => {
  const messages=[]; const client=createAppQueryClient(message=>messages.push(message));
  const mutation=client.getMutationCache().build(client,{mutationFn:async()=>{throw new Error("Missing ingredient");}});
  await assert.rejects(mutation.execute(), /Missing ingredient/);
  assert.deepEqual(messages,["Missing ingredient"]);client.clear();
});
test("local mutation handler overrides fallback without duplicate toast", async () => {
  const messages=[]; const client=createAppQueryClient(message=>messages.push(message));let handled=0;
  const mutation=client.getMutationCache().build(client,{mutationFn:async()=>{throw new Error("Room unavailable");},onError:()=>{handled++;}});
  await assert.rejects(mutation.execute());assert.equal(handled,1);assert.deepEqual(messages,[]);client.clear();
});
test("failed active queries show the actual error with a stable toast id", async () => {
  const messages=[];const client=createAppQueryClient((message,options)=>messages.push({message,options}));
  const observer=new QueryObserver(client,{queryKey:["rooms"],queryFn:async()=>{throw new Error("Unable to read rooms");},retry:false,enabled:false});
  const unsubscribe=observer.subscribe(()=>{});await observer.refetch();
  assert.equal(messages.length,1);assert.equal(messages[0].message,"Unable to read rooms");assert.match(messages[0].options.id,/query-error:/);
  unsubscribe();client.clear();
});
test("login session checks do not show an error toast", async () => {
  const messages=[];const client=createAppQueryClient(message=>messages.push(message));
  const observer=new QueryObserver(client,{queryKey:["/api/auth/me"],queryFn:async()=>{throw Object.assign(new Error("Not authenticated"),{status:401});},retry:false,enabled:false});
  const unsubscribe=observer.subscribe(()=>{});await observer.refetch();assert.deepEqual(messages,[]);unsubscribe();client.clear();
});