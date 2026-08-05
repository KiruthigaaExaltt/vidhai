import "./schema";
import { connectMongo, modelFor } from "./query";
import { listMongoTables } from "./schema/dsl";

await connectMongo();
for (const table of listMongoTables()) await modelFor(table).syncIndexes();
process.exit(0);
