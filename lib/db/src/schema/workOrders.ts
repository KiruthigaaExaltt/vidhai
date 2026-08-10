import { mongoTable, serial, integer, text, numeric, timestamp, json, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const workOrderTemplatesTable = mongoTable("work_order_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  taskSteps: json("task_steps").notNull().default([]),
  materialRequirements: json("material_requirements").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesWorkOrdersTable = mongoTable("sales_work_orders", {
  id: serial("id").primaryKey(),
  workOrderNumber: text("work_order_number").notNull(),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name").notNull().default(""),
  productId: integer("product_id"),
  variantId: integer("variant_id"),
  productionQuantity: numeric("production_quantity").notNull().default("0"),
  productionUom: text("production_uom").notNull().default("Nos"),
  sourceDocumentType: text("source_document_type").notNull(),
  sourceDocumentId: integer("source_document_id").notNull(),
  sourceDocumentNumber: text("source_document_number").notNull(),
  workOrderTemplateId: integer("work_order_template_id"),
  expectedCompletionDate: text("expected_completion_date"),
  items: json("items").notNull().default([]),
  materialRequirements: json("material_requirements").notNull().default([]),
  generatedTaskIds: json("generated_task_ids").notNull().default([]),
  status: text("status").notNull().default("Active"),
  productionStatus: text("production_status").notNull().default("Pending"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSalesWorkOrderSchema = createInsertSchema(salesWorkOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesWorkOrder = z.infer<typeof insertSalesWorkOrderSchema>;
export type SalesWorkOrder = typeof salesWorkOrdersTable.$inferSelect;
