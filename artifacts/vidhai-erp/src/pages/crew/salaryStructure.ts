export { calculateSalaryTemplateComponents } from "@workspace/db/payroll/salary";
export type SalaryTemplate = {
  id: number;
  templateName: string;
  components: {
    id: string;
    name: string;
    calculationType: string;
    value?: string | null;
    referenceComponentId?: string | null;
    order?: number;
  }[];
};
export type EmployeeRecord = {
  id: number;
  name: string;
  department: string;
  baseSalary: string | number;
  annualCtc?: string | number | null;
  salaryTemplateId?: number | null;
  fixedComponentValues?: Record<string, string | number>;
};

/** Prefer monthly baseSalary; fall back to annual CTC / 12 when base is missing or zero. */
export function monthlyCtcFor(employee?: {
  baseSalary?: unknown;
  annualCtc?: unknown;
}): number {
  const baseSalary = Number(employee?.baseSalary);
  if (Number.isFinite(baseSalary) && baseSalary > 0) return baseSalary;

  const annualCtc = Number(employee?.annualCtc);
  return Number.isFinite(annualCtc) && annualCtc > 0 ? annualCtc / 12 : 0;
}

function sameTemplateId(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): boolean {
  if (left == null || right == null || left === "" || right === "") return false;
  return String(left) === String(right);
}

/** Fixed-amount components from a salary template (entered per employee in ₹ dialog). */
export function fixedSalaryComponents(template: SalaryTemplate | undefined) {
  return (template?.components || []).filter(
    (component) => component.calculationType === "fixed",
  );
}

export function initializeSalaryFixedValues(
  template: SalaryTemplate | undefined,
  employee: EmployeeRecord,
): Record<string, string> {
  const useEmployeeOverrides = sameTemplateId(
    template?.id,
    employee.salaryTemplateId,
  );

  return Object.fromEntries(
    fixedSalaryComponents(template).map((component) => {
      const saved = useEmployeeOverrides
        ? (employee.fixedComponentValues?.[component.id] ??
          employee.fixedComponentValues?.[component.name])
        : undefined;

      if (saved !== undefined && saved !== null && String(saved).trim() !== "") {
        return [component.id, String(saved)];
      }
      // Preserve explicit zero overrides.
      if (saved === 0 || saved === "0") {
        return [component.id, "0"];
      }

      // Fall back to the template's Fixed Amount default (same as Add Member).
      const templateDefault = component.value;
      if (
        templateDefault !== undefined &&
        templateDefault !== null &&
        String(templateDefault).trim() !== ""
      ) {
        return [component.id, String(templateDefault)];
      }

      return [component.id, ""];
    }),
  );
}
