import { mongoTable, serial, text, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";

export const contactsTable = mongoTable("contacts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("client"),
  name: text("name").notNull(),
  company: text("company").default(""),
  phone: text("phone").default(""),
  whatsappNumber: text("whatsapp_number").default(""),
  gstin: text("gstin").default(""),
  stateCode: text("state_code").default(""),
  email: text("email").default(""),
  address: text("address").default(""),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
