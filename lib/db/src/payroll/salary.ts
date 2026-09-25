function money(value: number): number {
  return Number(value.toFixed(2));
}

type SalaryComponentSnapshot = {
  componentId: string;
  name: string;
  calculationType: string;
  monthlyAmount: number;
  yearlyAmount: number;
  earnedAmount: number;
  includeInPfWage?: boolean;
  includeInEsiWage?: boolean;
};

const SALARY_EPSILON = 0.01;
const DEDUCTION_COMPONENT_IDS = new Set(["pf", "esi", "pt", "tds"]);

function isDeductionComponent(componentId: string): boolean {
  return DEDUCTION_COMPONENT_IDS.has(String(componentId || "").trim().toLowerCase());
}

function ctcBalanceTolerance(monthlyCtc: number): number {
  return Math.max(SALARY_EPSILON, monthlyCtc * 0.0001, 1);
}

function parseNumeric(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

type TemplateComponentInput = {
  id?: unknown;
  name?: unknown;
  calculationType?: unknown;
  value?: unknown;
  referenceComponentId?: unknown;
  order?: unknown;
  includeInPfWage?: unknown;
  includeInEsiWage?: unknown;
};

export function calculateSalaryTemplateComponents(input: {
  templateComponents: TemplateComponentInput[];
  monthlyCtc: number;
  fixedComponentValues?: Record<string, number>;
  earnedRatio: number;
}): SalaryComponentSnapshot[] {
  const { templateComponents, monthlyCtc, fixedComponentValues = {}, earnedRatio } = input;

  if (!Array.isArray(templateComponents) || templateComponents.length === 0) {
    return [
      {
        componentId: "base_salary",
        name: "Base Salary",
        calculationType: "fixed",
        monthlyAmount: money(monthlyCtc),
        yearlyAmount: money(monthlyCtc * 12),
        earnedAmount: money(monthlyCtc * earnedRatio),
      },
    ];
  }

  const ordered = [...templateComponents].sort(
    (a, b) => Number(a?.order || 0) - Number(b?.order || 0),
  );

  const seenIds = new Set<string>();
  let residualCount = 0;
  for (const component of ordered) {
    const componentId = String(component?.id || "").trim();
    if (!componentId) {
      throw new Error("Salary template component id is required.");
    }
    if (seenIds.has(componentId)) {
      throw new Error(`Duplicate salary template component id: ${componentId}.`);
    }
    seenIds.add(componentId);

    const calculationType = String(component?.calculationType || "").trim();
    if (calculationType === "residual") {
      residualCount += 1;
    }
  }

  if (residualCount > 1) {
    throw new Error("Only one residual component is allowed in a salary template.");
  }

  const snapshots = new Map<string, { monthlyAmount: number }>();
  const result: SalaryComponentSnapshot[] = [];
  let earningsRunningTotal = 0;
  let hasResidual = false;

  for (const component of ordered) {
    const componentId = String(component?.id || "").trim() || `component_${result.length + 1}`;
    const componentName = String(component?.name || componentId).trim() || componentId;
    const calculationType = String(component?.calculationType || "fixed").trim();
    const parsedValue = parseNumeric(component?.value);
    const isDeduction = isDeductionComponent(componentId);

    let monthlyAmount = 0;

    if (calculationType === "fixed") {
      const fromMapById = Number(fixedComponentValues[componentId]);
      const fromMapByName = Number(fixedComponentValues[componentName]);
      if (Number.isFinite(fromMapById)) {
        monthlyAmount = fromMapById;
      } else if (Number.isFinite(fromMapByName)) {
        monthlyAmount = fromMapByName;
      } else if (Number.isFinite(parsedValue)) {
        monthlyAmount = parsedValue;
      } else {
        throw new Error(`Fixed amount is required for salary component: ${componentName}.`);
      }
      if (monthlyAmount < 0) {
        throw new Error(`Fixed amount cannot be negative for ${componentName}.`);
      }
    } else if (calculationType === "percentage_of_ctc") {
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw new Error(`Percentage cannot be negative for ${componentName}.`);
      }
      monthlyAmount = (monthlyCtc * parsedValue) / 100;
    } else if (calculationType === "percentage_of_component") {
      const refId = String(component?.referenceComponentId || "").trim();
      if (!refId) {
        throw new Error(`${componentName} must reference another component.`);
      }
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw new Error(`Percentage cannot be negative for ${componentName}.`);
      }
      const refSnapshot = snapshots.get(refId);
      if (!refSnapshot) {
        throw new Error(
          `${componentName} must reference a component that appears earlier in the template.`,
        );
      }
      const ref = refSnapshot.monthlyAmount;
      monthlyAmount = (ref * parsedValue) / 100;
    } else if (calculationType === "residual") {
      if (isDeduction) {
        throw new Error(`${componentName} cannot use the residual calculation type.`);
      }
      hasResidual = true;
      monthlyAmount = monthlyCtc - earningsRunningTotal;
      if (monthlyAmount < -ctcBalanceTolerance(monthlyCtc)) {
        throw new Error("Salary earning components exceed monthly CTC.");
      }
      monthlyAmount = Math.max(0, monthlyAmount);
    } else {
      throw new Error(`Unsupported salary component calculation type: ${calculationType}.`);
    }

    if (monthlyAmount < -SALARY_EPSILON) {
      throw new Error(`Calculated monthly amount cannot be negative for ${componentName}.`);
    }

    monthlyAmount = money(Math.max(0, monthlyAmount));
    if (!isDeduction) {
      earningsRunningTotal += monthlyAmount;
    }

    snapshots.set(componentId, { monthlyAmount });
    result.push({
      componentId,
      name: componentName,
      calculationType,
      monthlyAmount,
      yearlyAmount: money(monthlyAmount * 12),
      earnedAmount: money(monthlyAmount * earnedRatio),
      includeInPfWage: Boolean(component.includeInPfWage) || ["basic", "da", "dearness_allowance"].includes(componentId.toLowerCase()),
      includeInEsiWage: component.includeInEsiWage !== false && !isDeduction,
    });
  }

  const tolerance = ctcBalanceTolerance(monthlyCtc);
  if (!hasResidual && Math.abs(earningsRunningTotal - monthlyCtc) > tolerance) {
    throw new Error(
      `Salary template earning components total ₹${money(earningsRunningTotal)} but employee monthly CTC is ₹${money(monthlyCtc)}. Add a Residual component (e.g. Special Allowance) or adjust earning percentages to total 100%. PF, ESI, PT, and TDS are deductions and are excluded from this total.`,
    );
  }

  return result;
}


export function calculateStatutorySalary(input: { templateComponents: any[]; baseSalary: number; fixedComponentValues: Record<string, number>; earnedRatio: number; payableDays: number; year: number; month: number; employee: any; statutoryConfig: any; rates?: any }) {
 const { templateComponents, baseSalary, fixedComponentValues, earnedRatio, payableDays, year, month, employee, statutoryConfig, rates } = input;
  const statutoryRates = {
    pfEmployeeRate: Number(rates?.pfEmployeeRate ?? 12),
    pfEmployerRate: Number(rates?.pfEmployerRate ?? 12),
    pfMonthlyWageCeiling: Number(rates?.pfMonthlyWageCeiling ?? 15000),
    esiEmployeeRate: Number(rates?.esiEmployeeRate ?? 0.75),
    esiEmployerRate: Number(rates?.esiEmployerRate ?? 3.25),
    esiMonthlyWageCeiling: Number(rates?.esiMonthlyWageCeiling ?? 21000),
    esiPwdMonthlyWageCeiling: Number(rates?.esiPwdMonthlyWageCeiling ?? 25000),
    esiDailyEmployeeExemption: Number(rates?.esiDailyEmployeeExemption ?? 137),
  };
    const templateSource = Array.isArray(templateComponents) && templateComponents.length > 0
      ? templateComponents
      : [];
    // PF and ESI are calculated by the statutory engine. Legacy template rows are ignored to prevent duplicate deductions.
    const statutoryTemplateComponents = templateSource.filter((component: any) => {
      const id = String(component?.id || "").trim().toLowerCase();
      if (statutoryConfig.pfEnabled && id === "pf") return false;
      if (statutoryConfig.esiEnabled && id === "esi") return false;
      return true;
    });
    let salaryTemplateComponents = calculateSalaryTemplateComponents({
      templateComponents:
        statutoryTemplateComponents,
      monthlyCtc: baseSalary,
      fixedComponentValues,
      earnedRatio,
    });
    const preliminaryEarnedSalary = money(
      salaryTemplateComponents
        .filter((component) => !isDeductionComponent(component.componentId))
        .reduce((sum: number, component) => sum + Number(component.earnedAmount || 0), 0),
    );
    const pfEarnedWages = money(salaryTemplateComponents
      .filter((component) => !isDeductionComponent(component.componentId) && component.includeInPfWage)
      .reduce((sum, component) => sum + Number(component.earnedAmount || 0), 0));
    const configuredEsiGross = money(salaryTemplateComponents
      .filter((component) => !isDeductionComponent(component.componentId) && component.includeInEsiWage)
      .reduce((sum, component) => sum + Number(component.monthlyAmount || 0), 0));
    const contributionPeriodStartMonth = month >= 4 && month <= 9 ? 4 : 10;
    const contributionPeriodStartYear = month >= 4 ? year : year - 1;
    const contributionPeriodEndYear = contributionPeriodStartMonth === 4 ? contributionPeriodStartYear : contributionPeriodStartYear + 1;
    const esiContributionPeriod = contributionPeriodStartMonth === 4
      ? `${contributionPeriodStartYear}-04 to ${contributionPeriodStartYear}-09`
      : `${contributionPeriodStartYear}-10 to ${contributionPeriodEndYear}-03`;
    const eligibilityMap = employee.esiEligibilityPeriods instanceof Map
      ? Object.fromEntries(employee.esiEligibilityPeriods)
      : (employee.esiEligibilityPeriods || {});
    const esiCeiling = employee.isPersonWithDisability ? statutoryRates.esiPwdMonthlyWageCeiling : statutoryRates.esiMonthlyWageCeiling;
    const lockedEligibility = eligibilityMap[esiContributionPeriod];
    const esiEligibleForPeriod = statutoryConfig.esiEnabled && (typeof lockedEligibility === "boolean" ? lockedEligibility : configuredEsiGross <= esiCeiling);

    const pfWageBasis = statutoryConfig.pfEnabled
      ? money(statutoryConfig.pfWageBasis === "actual_wages"
        ? pfEarnedWages
        : Math.min(pfEarnedWages, statutoryRates.pfMonthlyWageCeiling * earnedRatio))
      : 0;
    const employeePf = statutoryConfig.pfEnabled
      ? money(statutoryConfig.pfMode === "manual" ? Number(statutoryConfig.manualEmployeePf || 0) : pfWageBasis * statutoryRates.pfEmployeeRate / 100)
      : 0;
    const employerPf = statutoryConfig.pfEnabled
      ? money(statutoryConfig.pfMode === "manual" ? Number(statutoryConfig.manualEmployerPf || 0) : pfWageBasis * statutoryRates.pfEmployerRate / 100)
      : 0;
    const employeeVpf = statutoryConfig.pfEnabled && statutoryConfig.vpfEnabled ? money(Number(statutoryConfig.employeeVpf || 0)) : 0;
    const employerVpf = statutoryConfig.pfEnabled && statutoryConfig.vpfEnabled ? money(Number(statutoryConfig.employerVpf || 0)) : 0;
    const esiEmployerRateDecimal = statutoryRates.esiEmployerRate / 100;
    const esiWageBasis = esiEligibleForPeriod
      ? money(Math.max(0, preliminaryEarnedSalary - employerPf - employerVpf) / (1 + esiEmployerRateDecimal))
      : 0;
    const dailyAverageEsiWage = payableDays > 0 ? esiWageBasis / payableDays : 0;
    const employeeEsi = esiEligibleForPeriod
      ? money(statutoryConfig.esiMode === "manual" ? Number(statutoryConfig.manualEmployeeEsi || 0) : dailyAverageEsiWage < statutoryRates.esiDailyEmployeeExemption ? 0 : esiWageBasis * statutoryRates.esiEmployeeRate / 100)
      : 0;
    const employerEsi = esiEligibleForPeriod
      ? money(statutoryConfig.esiMode === "manual" ? Number(statutoryConfig.manualEmployerEsi || 0) : esiWageBasis * statutoryRates.esiEmployerRate / 100)
      : 0;
    const employeeContributionTotal = money(employeePf + employeeVpf + employeeEsi);
    const employerContributionTotal = money(employerPf + employerVpf + employerEsi);
    if (employerContributionTotal > 0) {
      const residualIndex = salaryTemplateComponents.findIndex((component) => component.calculationType === "residual");
      if (residualIndex < 0 || Number(salaryTemplateComponents[residualIndex].earnedAmount || 0) + SALARY_EPSILON < employerContributionTotal) {
        throw new Error(`${employee.name}: employer PF/VPF/ESI contributions of ₹${employerContributionTotal.toFixed(2)} cannot be absorbed by the residual salary component. Increase the residual component or revise the CTC structure.`);
      }
      const residual = salaryTemplateComponents[residualIndex];
      const fullMonthEmployerCost = earnedRatio > 0 ? employerContributionTotal / earnedRatio : employerContributionTotal;
      salaryTemplateComponents = salaryTemplateComponents.map((component, index) => index === residualIndex ? {
        ...component,
        monthlyAmount: money(Math.max(0, component.monthlyAmount - fullMonthEmployerCost)),
        yearlyAmount: money(Math.max(0, component.monthlyAmount - fullMonthEmployerCost) * 12),
        earnedAmount: money(component.earnedAmount - employerContributionTotal),
      } : component);
    }

 return { components: salaryTemplateComponents, statutoryContributions: { pfWageBasis, esiWageBasis, employeePf, employerPf, employeeVpf, employerVpf, employeeEsi, employerEsi, employeeContributionTotal, employerContributionTotal, totalEmployerCost: preliminaryEarnedSalary, esiContributionPeriod, esiEligibleForPeriod, calculationNote: statutoryConfig.esiMode === "manual" || statutoryConfig.pfMode === "manual" ? "Manual contribution amounts are fixed monthly overrides and are not attendance-prorated." : "Automatic contributions use attendance-prorated eligible wages and configured statutory rates." } };
}
