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
  salaryTemplateId?: number | null;
  fixedComponentValues?: Record<string, string | number>;
};

export function initializeSalaryFixedValues(
  template: SalaryTemplate | undefined,
  employee: EmployeeRecord,
): Record<string, string> {
  return Object.fromEntries(
    (template?.components || [])
      .filter((component) => component.calculationType === "fixed")
      .map((component) => [
        component.id,
        String(
          (template?.id === employee.salaryTemplateId
            ? (employee.fixedComponentValues?.[component.id] ??
              employee.fixedComponentValues?.[component.name])
            : undefined) ?? "",
        ),
      ]),
  );
}
