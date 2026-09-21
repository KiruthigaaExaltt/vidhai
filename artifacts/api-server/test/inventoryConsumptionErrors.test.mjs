import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../node_modules/esbuild/lib/main.js";
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/annurInventoryConsumption.ts");
const result = await build({entryPoints:[source],bundle:true,write:false,platform:"node",format:"esm",plugins:[{
  name:"mock-db",setup(builder){
    builder.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"mock"}));
    builder.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:`
      export const db={}; export const eq=(field,value)=>({field,value});
      export const batchInventoryConsumptionsTable='history';
      export const inventoryAdjustmentsTable='adjustments';
      export const inventoryLocationsTable='warehouses';
      export const inventoryTable='stock';export const locationsTable='locations';export const materialsTable='materials';
    `}));
  }
}]});
const {consumeAnnurBatchMaterials}=await import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
function transaction(quantity="0",exists=true){
  const writes=[];
  const rows={warehouses:[{id:4}],locations:[{id:1}],materials:exists?[{id:43,name:"Millets",unit:"kg"}]:[],stock:[{id:28,materialId:43,quantityOnHand:quantity}],history:[]};
  const tx={select:()=>({from(table){const q={where:()=>q,limit:()=>q,then:(ok,bad)=>Promise.resolve(rows[table]).then(ok,bad)};return q;}}),update:table=>({set:value=>({where:async()=>{writes.push({table,value});}})}),insert:table=>({values(value){writes.push({table,value});return{returning:async()=>[{id:100}],then:(ok,bad)=>Promise.resolve([]).then(ok,bad)};}})};
  return {tx,writes};
}
const input={batchType:"LAB",batchId:45,batchReference:"D-260917-001",materials:[{name:"Millets",quantity:32}],userId:2};
test("stock shortages expose a typed operator error without inventory writes",async()=>{
  const {tx,writes}=transaction();
  await assert.rejects(consumeAnnurBatchMaterials(tx,input),e=>e.name==="RequestError"&&e.status===400&&/required 32 kg, available 0 kg in Annur/.test(e.message));
  assert.deepEqual(writes,[]);
});
test("missing items are named in the operator message",async()=>{
  const {tx,writes}=transaction("100",false);
  await assert.rejects(consumeAnnurBatchMaterials(tx,input),/Item "Millets" is missing from Item & Product Master/);
  assert.deepEqual(writes,[]);
});
test("empty formulations have an actionable validation error",async()=>{
  const {tx}=transaction();
  await assert.rejects(consumeAnnurBatchMaterials(tx,{...input,materials:[]}),/At least one formulation material is required/);
});
test("valid consumption still deducts stock and records its ledger",async()=>{
  const {tx,writes}=transaction("100");await consumeAnnurBatchMaterials(tx,input);
  assert.equal(writes[0].value.quantityOnHand,"68");assert.equal(writes[2].value.quantityConsumed,"32");
});