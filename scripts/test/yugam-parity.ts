/** Differential checks against the optional, unmodified local Yugam checkout. No database. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as calendar from "../../lib/db/src/payroll/calendar";
import {
  calculateSalaryTemplateComponents,
  calculateStatutorySalary,
} from "../../lib/db/src/payroll/salary";
import {
  attendanceMetrics,
  attendanceFine,
  workDurationHours,
} from "../../artifacts/api-server/src/lib/attendanceRules";
const root = path.resolve(import.meta.dirname, "../..");
const reference = path.join(root, "yugam-source-code");
const yc = await import(
  pathToFileURL(
    path.join(
      reference,
      "artifacts/api-server/src/features/hr/utils/payrollCalendar.ts",
    ),
  ).href
);
const { build } = await import(
  pathToFileURL(
    path.join(root, "artifacts/api-server/node_modules/esbuild/lib/main.js"),
  ).href
);
const load = async (contents: string) => {
  const output = await build({
    stdin: { contents, loader: "ts" },
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
};
const pay = await fs.readFile(
  path.join(
    reference,
    "artifacts/api-server/src/features/hr/services/payCalculationService.ts",
  ),
  "utf8",
);
const buffer = await fs.readFile(
  path.join(reference, "lib/db/src/schema/attendanceTemplates.ts"),
  "utf8",
);
const metrics =
  await load(`const ATTENDANCE_BUFFER_MINUTES=15; ${buffer.match(/export function resolveBufferMinutes[\s\S]*?\n}/)![0]}
const roundMoney=n=>Number(n.toFixed(2));
const AUTO_REASON_HALF_DAY='half_day',AUTO_REASON_FLEXIBLE_SHORTAGE='flexible_hours_shortage',AUTO_REASON_BOTH='both',AUTO_REASON_LATE_PUNCH_IN='late_punch_in',AUTO_REASON_EARLY_PUNCH_OUT='early_punch_out';
${pay.slice(pay.indexOf("export function parseTimeToMinutes("), pay.indexOf("export async function resolveScheduledWorkingDaysForEmployeeMonth("))}
${pay.slice(pay.indexOf("export function calculateAttendanceDeductionAmount("), pay.indexOf("export function buildDeductionNotes("))}`);
const crewPay = await fs.readFile(
  path.join(
    reference,
    "artifacts/api-server/src/features/hr/routes/crewPay.ts",
  ),
  "utf8",
);
const salary = await load(
  crewPay.slice(
    crewPay.indexOf("function money("),
    crewPay.indexOf("function normalizePayrollStatus("),
  ) + "\nexport {calculateSalaryTemplateComponents};",
);
let comparisons = 0;
const compare = (actual: any, expected: any, label: string) => {
  assert.deepEqual(actual, expected, label);
  comparisons++;
};
for (const flexibleHours of [false, true])
  for (const bufferTime of [false, true])
    for (const bufferMinutes of [0, 15, 30])
      for (const checkInTime of [
        "08:45",
        "09:00",
        "09:15",
        "09:16",
        "10:30",
        "22:00",
      ])
        for (const checkOutTime of ["12:00", "17:00", "18:00", "06:00"]) {
          const input = {
            flexibleHours,
            bufferTime,
            bufferMinutes,
            checkInTime,
            checkOutTime,
            workStartTime: "09:00",
            workEndTime: "18:00",
            workHours: "9",
          };
          compare(
            attendanceMetrics(input, input),
            metrics.computeAttendanceDeductionMetrics(input),
            `punch ${JSON.stringify(input)}`,
          );
          compare(
            workDurationHours(input),
            metrics.resolveWorkDurationHours(input),
            "work duration",
          );
        }
for (const fineType of [
  "fixed_per_hour",
  "based_on_salary",
  "percent_hourly_basis",
])
  for (const finePerHour of [0, 50, 75])
    for (const hourlySalary of [83.33, 125, 160.125])
      for (const deductionHours of [0, 0.25, 0.5, 1, 2.5])
        compare(
          attendanceFine(
            { fineType, finePerHour },
            hourlySalary,
            deductionHours,
          ),
          metrics.calculateAttendanceDeductionAmount({
            fineType,
            finePerHour,
            hourlySalary,
            deductionHours,
          }),
          "fine rounding",
        );
for (const month of ["2024-02", "2026-02", "2026-08", "2026-09"])
  for (const offDays of [[0], [0, 6], []]) {
    const [year, m] = month.split("-").map(Number),
      end = calendar.endOfMonthIso(year, m);
    const pattern = Object.fromEntries(
      [1, 2, 3, 4, 5].map((w) => [`week${w}OffDays`, offDays]),
    );
    const input = {
      monthStartIso: month + "-01",
      monthEndIso: end,
      workPattern: pattern,
      holidayDates: new Set([month + "-15", month + "-26"]),
    };
    const nonWorkingPaidDates = calendar.buildNonWorkingPaidDateSet(input);
    compare(
      nonWorkingPaidDates,
      yc.buildNonWorkingPaidDateSet(input),
      "calendar",
    );
    for (const status of [
      "Present",
      "Absent",
      "Half Day",
      "Late",
      "Remote",
      "WFH",
      "On Leave",
      "Pending Approval",
    ])
      for (const leaveType of ["Casual", "Sick", "Other", "Permission"])
        for (const session of ["1", "2"]) {
          const sample = {
            employmentStartIso: month + "-03",
            employmentEndIso: end,
            nonWorkingPaidDates,
            attendanceLogs: [
              {
                attendanceDate: month + "-04",
                status,
                checkInTime: "09:00",
                checkOutTime: "18:00",
                locked: true,
              },
            ],
            approvedLeaves: [
              {
                startDate: month + "-05",
                endDate: month + "-05",
                leaveType,
                fromSession: "1",
                toSession: session,
              },
            ],
          };
          for (const fn of [
            "calculatePayableWorkingDays",
            "calculateLeaveWorkingDays",
            "calculateAbsentWorkingDays",
            "calculatePendingApprovalWorkingDays",
          ] as const)
            compare(calendar[fn](sample), yc[fn](sample), fn);
          const scheduled = calendar.countScheduledWorkingDaysInRange({
            rangeStartIso: month + "-01",
            rangeEndIso: end,
            nonWorkingPaidDates,
          });
          compare(
            calendar.calculateLopAmountFromPayableDays(
              30000,
              scheduled,
              scheduled,
              calendar.calculatePayableWorkingDays(sample),
            ),
            yc.calculateLopAmountFromPayableDays(
              30000,
              scheduled,
              scheduled,
              yc.calculatePayableWorkingDays(sample),
            ),
            "LOP",
          );
        }
  }
for (const monthlyCtc of [18000, 21000, 30000, 48765.43])
  for (const earnedRatio of [0, 0.5, 0.84, 1])
    for (const fixed of [0, 500, 1250]) {
      const input = {
        monthlyCtc,
        earnedRatio,
        fixedComponentValues: { travel: fixed },
        templateComponents: [
          {
            id: "basic",
            name: "Basic",
            calculationType: "percentage_of_ctc",
            value: 50,
            order: 1,
          },
          {
            id: "hra",
            name: "HRA",
            calculationType: "percentage_of_component",
            referenceComponentId: "basic",
            value: 40,
            order: 2,
          },
          {
            id: "travel",
            name: "Travel",
            calculationType: "fixed",
            value: fixed,
            order: 3,
          },
          {
            id: "special",
            name: "Special",
            calculationType: "residual",
            order: 4,
          },
        ],
      };
      compare(
        calculateSalaryTemplateComponents(input),
        salary.calculateSalaryTemplateComponents(input),
        "salary components",
      );
    }
const statutoryFields = [
  "pfWageBasis",
  "esiWageBasis",
  "employeePf",
  "employerPf",
  "employeeVpf",
  "employerVpf",
  "employeeEsi",
  "employerEsi",
  "employeeContributionTotal",
  "employerContributionTotal",
  "esiContributionPeriod",
  "esiEligibleForPeriod",
];
const statutory = await load(
  crewPay.slice(
    crewPay.indexOf("function money("),
    crewPay.indexOf("function normalizePayrollStatus("),
  ) +
    `
export async function calculate(input) {
 const {baseSalary,earnedRatio,payableDays,year,month,employee,statutoryConfig,fixedComponentValues}=input;
 const salaryTemplate={components:input.templateComponents}, dryRun=true, organizationSettings={statutoryPayroll:input.rates};
 ${crewPay.slice(crewPay.indexOf("  const statutoryRates ="), crewPay.indexOf("  const employeeQuery ="))}
 ${crewPay.slice(crewPay.indexOf("    const templateSource ="), crewPay.indexOf("    const earnedBaseSalary ="))}
 return {components:salaryTemplateComponents,${statutoryFields.join(",")}};
}`,
);
for (const baseSalary of [18000, 21000, 25000, 40000])
  for (const earnedRatio of [0.5, 1])
    for (const month of [1, 4, 9, 10])
      for (const isPersonWithDisability of [false, true])
        for (const statutoryConfig of [
          { pfEnabled: false, esiEnabled: false },
          { pfEnabled: true, esiEnabled: true },
          { pfEnabled: true, esiEnabled: true, pfWageBasis: "actual_wages" },
          {
            pfEnabled: true,
            esiEnabled: true,
            vpfEnabled: true,
            employeeVpf: 200,
            employerVpf: 100,
          },
          {
            pfEnabled: true,
            esiEnabled: true,
            pfMode: "manual",
            esiMode: "manual",
            manualEmployeePf: 500,
            manualEmployerPf: 500,
            manualEmployeeEsi: 100,
            manualEmployerEsi: 100,
          },
        ]) {
          const input = {
            baseSalary,
            earnedRatio,
            payableDays: 25 * earnedRatio,
            year: 2026,
            month,
            employee: { name: "Parity", isPersonWithDisability },
            statutoryConfig,
            fixedComponentValues: {},
            templateComponents: [
              {
                id: "basic",
                name: "Basic",
                calculationType: "percentage_of_ctc",
                value: 50,
                order: 1,
                includeInPfWage: true,
                includeInEsiWage: true,
              },
              {
                id: "special",
                name: "Special",
                calculationType: "residual",
                order: 2,
                includeInEsiWage: true,
              },
            ],
          };
          const actual = calculateStatutorySalary(input);
          compare(
            {
              components: actual.components,
              ...Object.fromEntries(
                statutoryFields.map((k) => [
                  k,
                  (actual.statutoryContributions as any)[k],
                ]),
              ),
            },
            await statutory.calculate(input),
            "statutory contributions",
          );
        }
await fs.writeFile(
  path.join(root, "docs/qa/yugam-parity-result.json"),
  JSON.stringify(
    {
      comparisons,
      passed: true,
      scope:
        "Differential execution of calendar, paid days, LOP, punch metrics, fines, salary components, PF/VPF/ESI and contribution periods. L1-L5 excluded. Not full application equivalence.",
    },
    null,
    2,
  ) + "\n",
);
console.log(`PASS ${comparisons} Yugam differential comparisons`);
