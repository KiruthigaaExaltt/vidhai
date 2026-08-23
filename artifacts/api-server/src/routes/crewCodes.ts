import { Router } from "express";
import {
  and,
  crewCodePrefixesTable,
  crewCodeSettingsTable,
  crewCodeSuffixesTable,
  db,
  employeesTable,
  eq,
} from "@workspace/db";

const router = Router();
const CODE_PART = /^[A-Z0-9]+$/;

const orgId = (req: any) => Number(req.session?.organizationId ?? 1);
const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

async function settings(organizationId: number) {
  const [existing] = await db
    .select()
    .from(crewCodeSettingsTable)
    .where(eq(crewCodeSettingsTable.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(crewCodeSettingsTable)
    .values({
      organizationId,
      paddingDigits: 4,
      nextNumber: 1,
      sequenceInitialized: false,
    })
    .returning();
  return created;
}

router.get("/", async (req, res) => {
  const organizationId = orgId(req);
  let [prefixes, suffixes, configuration] = await Promise.all([
    db
      .select()
      .from(crewCodePrefixesTable)
      .where(eq(crewCodePrefixesTable.organizationId, organizationId))
      .orderBy(crewCodePrefixesTable.value),
    db
      .select()
      .from(crewCodeSuffixesTable)
      .where(eq(crewCodeSuffixesTable.organizationId, organizationId))
      .orderBy(crewCodeSuffixesTable.value),
    settings(organizationId),
  ]);
  if (!prefixes.length) {
    const [defaultPrefix] = await db
      .insert(crewCodePrefixesTable)
      .values({
        organizationId,
        value: "EMP",
        isActive: true,
        updatedAt: new Date(),
      })
      .returning();
    prefixes = [defaultPrefix];
  }
  const employees = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.organizationId, organizationId));
  const maxExisting = employees.reduce(
    (maximum: number, employee: any) =>
      Math.max(
        maximum,
        ...(String(employee.employeeCode || "").match(/\d+/g) || []).map(
          Number,
        ),
      ),
    0,
  );
  if (!configuration.sequenceInitialized) {
    const [updated] = await db
      .update(crewCodeSettingsTable)
      .set({
        nextNumber: Math.max(
          Number(configuration.nextNumber || 1),
          maxExisting + 1,
        ),
        sequenceInitialized: true,
        updatedAt: new Date(),
      })
      .where(eq(crewCodeSettingsTable.id, configuration.id))
      .returning();
    configuration = updated;
  }
  return res.json({ prefixes, suffixes, settings: configuration });
});

router.patch("/settings", async (req, res) => {
  const organizationId = orgId(req);
  const paddingDigits = Number(req.body.paddingDigits);
  if (
    !Number.isInteger(paddingDigits) ||
    paddingDigits < 1 ||
    paddingDigits > 12
  )
    return res
      .status(400)
      .json({ error: "Padding digits must be between 1 and 12" });
  const current = await settings(organizationId);
  const [updated] = await db
    .update(crewCodeSettingsTable)
    .set({ paddingDigits, updatedAt: new Date() })
    .where(eq(crewCodeSettingsTable.id, current.id))
    .returning();
  return res.json(updated);
});

function optionRoutes(
  path: "prefixes" | "suffixes",
  table: any,
  label: string,
) {
  router.post(`/${path}`, async (req, res) => {
    const organizationId = orgId(req);
    const value = normalize(req.body.value);
    if (!CODE_PART.test(value))
      return res.status(400).json({
        error: `${label} must contain uppercase letters and numbers only`,
      });
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.organizationId, organizationId));
    if (rows.some((row: any) => normalize(row.value) === value))
      return res.status(409).json({ error: `${label} already exists` });
    const [created] = await db
      .insert(table)
      .values({ organizationId, value, isActive: true, updatedAt: new Date() })
      .returning();
    return res.status(201).json(created);
  });

  router.patch(`/${path}/:id`, async (req, res) => {
    const organizationId = orgId(req);
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: `${label} not found` });
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body.value !== undefined) {
      const value = normalize(req.body.value);
      if (!CODE_PART.test(value))
        return res.status(400).json({
          error: `${label} must contain uppercase letters and numbers only`,
        });
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.organizationId, organizationId));
      if (
        rows.some((row: any) => row.id !== id && normalize(row.value) === value)
      )
        return res.status(409).json({ error: `${label} already exists` });
      updates.value = value;
    }
    if (req.body.isActive !== undefined)
      updates.isActive = Boolean(req.body.isActive);
    const [updated] = await db
      .update(table)
      .set(updates)
      .where(eq(table.id, id))
      .returning();
    return res.json(updated);
  });
}

optionRoutes("prefixes", crewCodePrefixesTable, "Prefix");
optionRoutes("suffixes", crewCodeSuffixesTable, "Suffix");

export default router;
