import { boolean, integer, mongoTable, serial, text, timestamp } from "./dsl";

export const crewCodePrefixesTable = mongoTable("crew_code_prefixes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  value: text("value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const crewCodeSuffixesTable = mongoTable("crew_code_suffixes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  value: text("value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const crewCodeSettingsTable = mongoTable("crew_code_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull(),
  paddingDigits: integer("padding_digits").notNull().default(4),
  nextNumber: integer("next_number").notNull().default(1),
  sequenceInitialized: boolean("sequence_initialized").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
