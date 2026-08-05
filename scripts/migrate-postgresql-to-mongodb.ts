/**
 * One-time, resumable production-data transfer utility. This is intentionally
 * isolated from application runtime and may be removed after cut-over.
 */
import pg from "pg";
import mongoose from "mongoose";
import { listMongoTables } from "@workspace/db/schema";

const sourceUrl = process.env.LEGACY_DATABASE_URL;
const targetUrl = process.env.MONGODB_URI;
if (!sourceUrl || !targetUrl) throw new Error("LEGACY_DATABASE_URL and MONGODB_URI are required");

const source = new pg.Pool({ connectionString: sourceUrl });
await mongoose.connect(targetUrl);
const counters = mongoose.connection.collection("_counters");

try {
  for (const table of listMongoTables()) {
    const result = await source.query(`SELECT * FROM "${table.$name.replace(/"/g, '""')}" ORDER BY id`);
    const collection = mongoose.connection.collection(table.$name);
    const fields = Object.entries(table).filter(([, value]) => typeof value === "object");
    if (result.rows.length) {
      const operations = result.rows.map(row => ({
        replaceOne: {
          filter: { id: row.id },
          replacement: Object.fromEntries(fields.map(([property, field]) => {
            const value=row[field.sourceName];
            if(value==null)return [property,value];
            if(field.kind==="decimal")return [property,mongoose.Types.Decimal128.fromString(String(value))];
            if(field.kind==="date")return [property,new Date(value)];
            return [property,value];
          }).filter(([, value]) => value !== undefined)),
          upsert: true,
        },
      }));
      await collection.bulkWrite(operations, { ordered: true });
      const maxId = Math.max(...result.rows.map(row => Number(row.id) || 0));
      await counters.updateOne({ _id: table.$name }, { $max: { value: maxId } }, { upsert: true });
    }
    console.log(`${table.$name}: ${result.rows.length} records transferred`);
  }
} finally {
  await source.end();
  await mongoose.disconnect();
}
