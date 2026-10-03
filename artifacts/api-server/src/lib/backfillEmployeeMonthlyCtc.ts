import { db, employeesTable, eq } from "@workspace/db";

// Members created before the monthly CTC was derived from the annual CTC were
// saved with baseSalary 0. Fill it in from the annual CTC they were given.
export async function backfillEmployeeMonthlyCtc() {
  const employees = await db.select().from(employeesTable);
  let updated = 0;
  for (const employee of employees) {
    const annual = Number(employee.annualCtc || 0);
    const monthly = Number(employee.baseSalary || 0);
    if (!Number.isFinite(annual) || annual <= 0 || monthly > 0) continue;
    await db
      .update(employeesTable)
      .set({
        baseSalary: String(Math.round((annual / 12) * 100) / 100),
        updatedAt: new Date(),
      })
      .where(eq(employeesTable.id, employee.id));
    updated += 1;
  }
  return { updated };
}
