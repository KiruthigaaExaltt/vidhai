import { boolean, integer, mongoTable, serial, text, timestamp } from "./dsl";

const common = () => ({
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().default(1),
  templateName: text("template_name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceTemplatesTable = mongoTable("attendance_templates", {
  ...common(), flexibleHours: boolean("flexible_hours").notNull().default(false),
  lateThresholdMinutes: integer("late_threshold_minutes").notNull().default(15),
  workStartTime: text("work_start_time").notNull().default("09:00"),
  workEndTime: text("work_end_time").notNull().default("17:00"),
  fineType: text("fine_type").notNull().default("fixed_per_hour"),
  finePerHour: text("fine_per_hour").notNull().default("0"),
});

export const workPatternTemplatesTable = mongoTable("work_pattern_templates", {
  ...common(), week1OffDays: text("week1_off_days").notNull().default("[0]"),
  week2OffDays: text("week2_off_days").notNull().default("[0]"), week3OffDays: text("week3_off_days").notNull().default("[0]"),
  week4OffDays: text("week4_off_days").notNull().default("[0]"), week5OffDays: text("week5_off_days").notNull().default("[0]"),
});

export const salaryTemplatesTable = mongoTable("salary_templates", {
  ...common(), description: text("description"), components: text("components").notNull().default("[]"),
});

export const holidayTemplatesTable = mongoTable("holiday_templates", {
  ...common(), effectiveYear: integer("effective_year").notNull(), effectiveFrom: text("effective_from").notNull(),
  holidays: text("holidays").notNull().default("[]"),
});

export const leaveTemplatesTable = mongoTable("leave_templates", {
  ...common(), totalSickLeaves: integer("total_sick_leaves").notNull().default(0),
  totalCasualLeaves: integer("total_casual_leaves").notNull().default(0), earnedLeave: integer("earned_leave").notNull().default(0),
  maxSickLeavesPerMonth: integer("max_sick_leaves_per_month").notNull().default(0),
  maxCasualLeavesPerMonth: integer("max_casual_leaves_per_month").notNull().default(0),
  maxEarnedLeavesPerMonth: integer("max_earned_leaves_per_month").notNull().default(0),
  carryForwardEnabled: boolean("carry_forward_enabled").notNull().default(true),
});
