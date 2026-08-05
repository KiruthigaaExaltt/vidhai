import { mongoTable, serial, integer, numeric, text, date, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { locationsTable } from "./locations";
import { usersTable } from "./users";

export const vehiclesTable = mongoTable("vehicles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  regNo: text("reg_no").notNull().unique(),
  homeLocationId: integer("home_location_id").references(() => locationsTable.id),
  vehicleType: text("vehicle_type").notNull().default("truck"),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;

export const fuelLogsTable = mongoTable("fuel_logs", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
  fuelDate: date("fuel_date", { mode: "string" }).notNull(),
  litres: numeric("litres", { precision: 10, scale: 2 }).notNull(),
  costPerLitre: numeric("cost_per_litre", { precision: 8, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }),
  odometer: numeric("odometer", { precision: 10, scale: 1 }),
  startKm: numeric("start_km", { precision: 10, scale: 1 }),
  endKm: numeric("end_km", { precision: 10, scale: 1 }),
  distanceKm: numeric("distance_km", { precision: 10, scale: 1 }),
  notes: text("notes"),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFuelLogSchema = createInsertSchema(fuelLogsTable).omit({ id: true, createdAt: true });
export type InsertFuelLog = z.infer<typeof insertFuelLogSchema>;
export type FuelLog = typeof fuelLogsTable.$inferSelect;

export const maintenanceLogsTable = mongoTable("maintenance_logs", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
  serviceDate: date("service_date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  nextServiceDue: date("next_service_due", { mode: "string" }),
  notes: text("notes"),
  recordedByUserId: integer("recorded_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogsTable).omit({ id: true, createdAt: true });
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogsTable.$inferSelect;

export const vehicleUsageLogsTable = mongoTable("vehicle_usage_logs", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  driverId: integer("driver_id").references(() => usersTable.id),
  hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }),
  workType: text("work_type").notNull(),
  fromLocationId: integer("from_location_id").references(() => locationsTable.id),
  toLocationId: integer("to_location_id").references(() => locationsTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleUsageLogSchema = createInsertSchema(vehicleUsageLogsTable).omit({ id: true, createdAt: true });
export type InsertVehicleUsageLog = z.infer<typeof insertVehicleUsageLogSchema>;
export type VehicleUsageLog = typeof vehicleUsageLogsTable.$inferSelect;
