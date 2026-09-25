import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CrewPaySalarySlip, OrganizationSettings } from "./types";
import { formatMonthLabel, resolveSalaryComponentEarnedAmount } from "./utils";

const DEDUCTION_COMPONENT_IDS = new Set(["pf", "esi", "pt", "tds"]);

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#2f2f2f",
    padding: 20,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: "#E31E24",
    paddingBottom: 8,
  },
  companyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    paddingRight: 12,
  },
  companyLogo: {
    width: 42,
    height: 42,
    objectFit: "contain",
    marginRight: 10,
  },
  companyText: {
    flex: 1,
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#E31E24",
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 9,
    color: "#666",
  },
  periodLabel: {
    fontSize: 9,
    color: "#666",
    textAlign: "right",
  },
  periodValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#2f2f2f",
    textAlign: "right",
  },
  slipTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#555",
    textAlign: "right",
    marginTop: 2,
  },
  detailsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  detailsColumn: {
    flex: 1,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  detailLabel: {
    width: "44%",
    fontSize: 9,
    fontWeight: "bold",
    color: "#4a4a4a",
  },
  detailValue: {
    width: "56%",
    fontSize: 9,
    color: "#333",
  },
  statStrip: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d9d9d9",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 10,
    backgroundColor: "#f7f7f7",
  },
  statCell: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderRightColor: "#ddd",
  },
  statCellLast: {
    borderRightWidth: 0,
  },
  statLabel: {
    fontSize: 7.5,
    color: "#666",
    textAlign: "center",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  mainTable: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#d9d9d9",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  earningsSection: {
    width: "60%",
    borderRightWidth: 1,
    borderRightColor: "#d9d9d9",
  },
  deductionsSection: {
    width: "40%",
  },
  sectionHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f1f1",
    borderBottomWidth: 1,
    borderBottomColor: "#d9d9d9",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#2f2f2f",
    flex: 1,
  },
  sectionHeaderAmount: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#2f2f2f",
    textAlign: "right",
    width: 70,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#efefef",
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 20,
  },
  rowName: {
    flex: 1,
    fontSize: 9,
    color: "#444",
  },
  rowAmount: {
    fontSize: 9,
    color: "#333",
    textAlign: "right",
    width: 70,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderTopColor: "#d9d9d9",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  totalLabel: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: "bold",
    color: "#2f2f2f",
  },
  totalAmount: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: "#2f2f2f",
    textAlign: "right",
    width: 70,
  },
  netPayRow: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "space-between",
  },
  netPayLeft: {
    flexDirection: "column",
  },
  netPayLabel: {
    fontSize: 9,
    color: "#aaa",
    marginBottom: 1,
  },
  netPayFormula: {
    fontSize: 8,
    color: "#888",
  },
  netPayAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#dedede",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#888",
  },
});

function safeDate(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CrewPaySalarySlipPdfDocument({
  slip,
  organization,
}: {
  slip: CrewPaySalarySlip;
  organization?: OrganizationSettings;
}) {
  const companyName = organization?.companyName || "Organization";
  const templateComponents = Array.isArray(slip.salaryTemplateComponents)
    ? slip.salaryTemplateComponents
    : [];

  // Separate earnings components and deduction components from template
  const earningComponents = templateComponents.filter(
    (c) => !DEDUCTION_COMPONENT_IDS.has(c.componentId.toLowerCase()),
  );
  const deductionComponents = templateComponents.filter(
    (c) => DEDUCTION_COMPONENT_IDS.has(c.componentId.toLowerCase()),
  );

  // Calculate amounts
  const templateEarningsTotal = earningComponents.reduce(
    (sum, c) => sum + resolveSalaryComponentEarnedAmount(c),
    0,
  );
  const otAmount = Number(slip.overtimeAmount || 0);
  const claimsAmount = Number(slip.claimsAmount || 0);
  const computedGrossPay = templateEarningsTotal + otAmount + claimsAmount;

  const templateDeductionsTotal = deductionComponents.reduce(
    (sum, c) => sum + resolveSalaryComponentEarnedAmount(c),
    0,
  );
  const lopAmount = Number(slip.lopAmount || 0);
  const lateFines = Number((slip as any).lateFines || 0);
  const otherDeductionsAmount = Number(slip.otherDeductionsAmount || 0);
  const otherDeductionItems = Array.isArray(slip.otherDeductionItems) ? slip.otherDeductionItems : [];
  const recurringDeductionItems = otherDeductionItems.filter((item) => item.isRecurring);
  const oneTimeDeductionItems = otherDeductionItems.filter((item) => !item.isRecurring);
  const statutory = slip.statutoryContributions;
  // LOP is already reflected in pro-rated gross pay; only statutory and attendance deductions reduce net.
  const totalDeductions = slip.deductionsAmount != null ? Number(slip.deductionsAmount) : templateDeductionsTotal + Number(statutory?.employeeContributionTotal || 0) + otherDeductionsAmount + lateFines;
  const grossPay = slip.grossPay != null ? Number(slip.grossPay) : computedGrossPay;
  const netPay = slip.netPay != null ? Number(slip.netPay) : Math.max(0, grossPay - totalDeductions);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyHeader}>
            {organization?.logoUrl ? <Image src={organization.logoUrl} style={styles.companyLogo} /> : null}
            <View style={styles.companyText}>
              <Text style={styles.companyName}>{companyName}</Text>
              <Text style={styles.headerSubtitle}>{organization?.address || ""}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.periodLabel}>Pay Period</Text>
            <Text style={styles.periodValue}>{formatMonthLabel(slip.payrollMonth)}</Text>
            <Text style={styles.slipTitle}>SALARY SLIP</Text>
          </View>
        </View>

        {/* Employee Details */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailsColumn}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Employee Name</Text>
              <Text style={styles.detailValue}>{slip.employeeName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Employee Code</Text>
              <Text style={styles.detailValue}>{slip.employeeCode || String(slip.employeeId)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Department</Text>
              <Text style={styles.detailValue}>{slip.department || "--"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Designation</Text>
              <Text style={styles.detailValue}>{slip.designation || "--"}</Text>
            </View>
          </View>
          <View style={styles.detailsColumn}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Salary Template</Text>
              <Text style={styles.detailValue}>{slip.salaryTemplateName || "--"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Work Location</Text>
              <Text style={styles.detailValue}>{slip.location || "--"}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date Joined</Text>
              <Text style={styles.detailValue}>{safeDate(slip.joinDate)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>PAN Number</Text>
              <Text style={styles.detailValue}>{slip.panNumber || "--"}</Text>
            </View>
          </View>
        </View>

        {/* Attendance Stats */}
        <View style={styles.statStrip}>
          {[
            { label: "Month Days", value: String(slip.monthDays) },
            { label: "Emp. Days", value: String(slip.employmentDays) },
            { label: "Present", value: String(slip.presentDays) },
            { label: "Absent", value: String(slip.absentDays) },
            { label: "Half Day", value: String(slip.halfDays) },
            { label: "Late Days", value: String(slip.lateDays) },
            { label: "Week Off", value: String(slip.weekOffDays) },
            { label: "Holidays", value: String(slip.holidayDays) },
            { label: "Leaves", value: String(slip.leaveDays) },
            { label: "Payable Days", value: String(slip.payableDays) },
          ].map((stat, i, arr) => (
            <View
              key={stat.label}
              style={[styles.statCell, i === arr.length - 1 ? styles.statCellLast : {}]}
            >
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Earnings & Deductions Table */}
        <View style={styles.mainTable}>
          {/* Earnings Column */}
          <View style={styles.earningsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Earnings</Text>
              <Text style={styles.sectionHeaderAmount}>Amount</Text>
            </View>

            {/* Template earnings components */}
            {earningComponents.length > 0 ? (
              earningComponents.map((c) => (
                <View style={styles.tableRow} key={c.componentId}>
                  <Text style={styles.rowName}>{c.name}</Text>
                  <Text style={styles.rowAmount}>{fmt(resolveSalaryComponentEarnedAmount(c))}</Text>
                </View>
              ))
            ) : (
              <View style={styles.tableRow}>
                <Text style={styles.rowName}>Basic Salary</Text>
                <Text style={styles.rowAmount}>{fmt(Number(slip.earnedBaseSalary || slip.baseSalary || 0))}</Text>
              </View>
            )}

            {/* OT */}
            {otAmount > 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.rowName}>OT (Overtime)</Text>
                <Text style={styles.rowAmount}>{fmt(otAmount)}</Text>
              </View>
            )}

            {/* Claims */}
            {claimsAmount > 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.rowName}>Claims / Allowances</Text>
                <Text style={styles.rowAmount}>{fmt(claimsAmount)}</Text>
              </View>
            )}

            {/* Gross Pay Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Gross Pay</Text>
              <Text style={styles.totalAmount}>{fmt(grossPay)}</Text>
            </View>
          </View>

          {/* Deductions Column */}
          <View style={styles.deductionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Deductions</Text>
              <Text style={styles.sectionHeaderAmount}>Amount</Text>
            </View>

            {deductionComponents.length > 0 ? (
              deductionComponents.map((c) => (
                <View style={styles.tableRow} key={c.componentId}>
                  <Text style={styles.rowName}>{c.name}</Text>
                  <Text style={styles.rowAmount}>{fmt(resolveSalaryComponentEarnedAmount(c))}</Text>
                </View>
              ))
            ) : null}
            {Number(statutory?.employeePf || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employee Provident Fund (PF) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employeePf || 0))}</Text></View> : null}
            {Number(statutory?.employeeVpf || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employee Voluntary Provident Fund (VPF) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employeeVpf || 0))}</Text></View> : null}
            {Number(statutory?.employeeEsi || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employee State Insurance (ESI) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employeeEsi || 0))}</Text></View> : null}

            <View style={styles.tableRow}>
              <Text style={styles.rowName}>
                Loss of Pay (LOP) — this month{lopAmount > 0 ? " — reflected in gross" : ""}
              </Text>
              <Text style={styles.rowAmount}>{fmt(lopAmount)}</Text>
            </View>

            {lateFines > 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.rowName}>Late Arrival Fines</Text>
                <Text style={styles.rowAmount}>{fmt(lateFines)}</Text>
              </View>
            )}

            {oneTimeDeductionItems.map((item: any, index: number) => (
              <View key={`${item.deductionId || item.name}-${index}`} style={styles.tableRow}>
                <Text style={styles.rowName}>{item.name || "Other Deduction"}</Text>
                <Text style={styles.rowAmount}>{fmt(Number(item.amount || 0))}</Text>
              </View>
            ))}
            {recurringDeductionItems.length > 0 ? <View style={styles.tableRow}><Text style={styles.totalLabel}>Recurring Deductions</Text><Text style={styles.rowAmount}> </Text></View> : null}
            {recurringDeductionItems.map((item: any, index: number) => (
              <View key={`recurring-${item.deductionId || item.name}-${index}`} style={styles.tableRow}>
                <Text style={styles.rowName}>{item.name || "Recurring Deduction"}{item.installmentNumber ? ` (Installment ${item.installmentNumber}${item.numberOfInstallments ? `/${item.numberOfInstallments}` : ""})` : " (Ongoing)"}</Text>
                <Text style={styles.rowAmount}>{fmt(Number(item.amount || 0))}</Text>
              </View>
            ))}
            {otherDeductionItems.length === 0 && otherDeductionsAmount > 0 && (
              <View style={styles.tableRow}>
                <Text style={styles.rowName}>Other Deductions</Text>
                <Text style={styles.rowAmount}>{fmt(otherDeductionsAmount)}</Text>
              </View>
            )}

            {/* Total Deductions */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Deductions</Text>
              <Text style={styles.totalAmount}>{fmt(totalDeductions)}</Text>
            </View>
          </View>
        </View>

        {Number(statutory?.employerContributionTotal || 0) > 0 ? <View style={styles.mainTable}>
          <View style={styles.earningsSection}><View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>Employer Contributions (included in CTC; not deducted from net pay)</Text></View>
            {Number(statutory?.employerPf || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employer Provident Fund (PF) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employerPf || 0))}</Text></View> : null}
            {Number(statutory?.employerVpf || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employer Voluntary Provident Fund (VPF) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employerVpf || 0))}</Text></View> : null}
            {Number(statutory?.employerEsi || 0) > 0 ? <View style={styles.tableRow}><Text style={styles.rowName}>Employer State Insurance (ESI) contribution</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employerEsi || 0))}</Text></View> : null}
          </View>
          <View style={styles.deductionsSection}><View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>Employer Cost Summary</Text></View><View style={styles.tableRow}><Text style={styles.rowName}>Total employer contributions</Text><Text style={styles.rowAmount}>{fmt(Number(statutory?.employerContributionTotal || 0))}</Text></View><View style={styles.totalRow}><Text style={styles.totalLabel}>Total Employer Cost / CTC</Text><Text style={styles.totalAmount}>{fmt(Number(statutory?.totalEmployerCost || grossPay))}</Text></View></View>
        </View> : null}

        {/* Net Pay */}
        <View style={styles.netPayRow}>
          <View style={styles.netPayLeft}>
            <Text style={styles.netPayLabel}>Net Pay</Text>
            <Text style={styles.netPayFormula}>Gross Pay ({fmt(grossPay)}) - Deductions ({fmt(totalDeductions)})</Text>
          </View>
          <Text style={styles.netPayAmount}>{fmt(netPay)}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>PAN: {slip.panNumber || "--"}  |  UAN: {slip.uan || "--"}  |  PF: {slip.pfNumber || "--"}  |  ESI: {slip.esiNumber || "--"}</Text>
          <Text style={styles.footerText}>This is a computer-generated salary slip.</Text>
        </View>
      </Page>
    </Document>
  );
}

