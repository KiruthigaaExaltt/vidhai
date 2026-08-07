import { mongoTable, serial, text, boolean, numeric, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const inventoryLocationsTable = mongoTable("inventoryLocations", {
  id: serial("id").primaryKey(),
  warehouseCode: text("warehouseCode").notNull().unique(),
  locationName: text("locationName").notNull(),
  locationType: text("locationType").notNull().default("Warehouse"), // "Warehouse" or "Store"
  
  systemCode: text("systemCode"),
  isSystem: boolean("isSystem").default(false),
  isReservedWarehouse: boolean("isReservedWarehouse").default(false),
  isProtected: boolean("isProtected").default(false),
  
  isActive: boolean("isActive").default(true),
  isDefault: boolean("isDefault").default(false),
  
  capacity: numeric("capacity").notNull(),
  capacityUnit: text("capacityUnit").notNull().default("square feet"),
  
  manager: text("manager").notNull(),
  contactNumber: text("contactNumber"),
  
  imageUrl: text("imageUrl"),
  address: text("address"),
});

export const insertInventoryLocationSchema = createInsertSchema(inventoryLocationsTable);

export type InsertInventoryLocation = z.infer<typeof insertInventoryLocationSchema>;
export type InventoryLocation = typeof inventoryLocationsTable.$inferSelect;
