import {
  mongoTable,
  serial,
  integer,
  text,
  timestamp,
  createInsertSchema,
} from "./dsl";
import { z } from "zod/v4";

export const departmentsTable = mongoTable("departments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit(
  {
    id: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
  },
);
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;
