import { mongoTable, serial, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const contactsTable = mongoTable("contacts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("client"),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
