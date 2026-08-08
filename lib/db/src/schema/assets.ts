import { boolean, integer, mongoTable, numeric, serial, text, timestamp } from "./dsl";
import { employeesTable } from "./crew";

export const assetsTable = mongoTable("assets", {
  id: serial("id").primaryKey(), sku: text("sku").notNull().unique(), name: text("name").notNull(), category: text("category").notNull(), status: text("status").notNull().default("Active"),
  totalQuantity: numeric("total_quantity").notNull(), allocatedQuantity: numeric("allocated_quantity").notNull().default("0"), availableQuantity: numeric("available_quantity").notNull(), purchaseValue: numeric("purchase_value").notNull().default("0"), unitPrice: numeric("unit_price").notNull().default("0"),
  imageUrl: text("image_url"), purchaseDate: text("purchase_date").notNull(), qrPayload: text("qr_payload").notNull(), isDeleted: boolean("is_deleted").notNull().default(false), createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const assetAllocationsTable = mongoTable("asset_allocations", {
  id: serial("id").primaryKey(), assetId: integer("asset_id").notNull().references(() => assetsTable.id), employeeId: integer("employee_id").notNull().references(() => employeesTable.id), quantity: numeric("quantity").notNull(), status: text("status").notNull().default("Allocated"), allocatedDate: text("allocated_date").notNull(), returnedDate: text("returned_date"), createdAt: timestamp("created_at").notNull().defaultNow(), updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
