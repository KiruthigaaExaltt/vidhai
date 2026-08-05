import { mongoTable, serial, integer, text, numeric, timestamp, createInsertSchema } from "./dsl";
import { z } from "zod/v4";
import { batchesTable } from "./batches";
import { usersTable } from "./users";

export const stageLogsTable = mongoTable("stage_logs", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchesTable.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
  enteredByUserId: integer("entered_by_user_id").references(() => usersTable.id),
  notes: text("notes"),
  nh3Ppm: numeric("nh3_ppm", { precision: 8, scale: 4 }),
  temperatureCelsius: numeric("temperature_celsius", { precision: 6, scale: 2 }),
  verificationImages: text("verification_images"), // JSON array of base64 image data URLs
});

export const insertStageLogSchema = createInsertSchema(stageLogsTable).omit({ id: true });
export type InsertStageLog = z.infer<typeof insertStageLogSchema>;
export type StageLog = typeof stageLogsTable.$inferSelect;
