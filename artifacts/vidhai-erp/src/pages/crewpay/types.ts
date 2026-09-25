export interface CrewPayEmployee {
	id: number;
	name: string;
	employeeCode: string | null;
	department: string;
	designation: string | null;
	joinDate?: string;
	createdAt?: string;
}

export interface CrewPaySalarySlip {
	id: number;
	payrollMonth: string;
	employeeId: number;
	employeeName: string;
	employeeCode: string;
	department: string;
	designation: string;
	salaryTemplateId?: number | null;
	salaryTemplateName?: string;
	salaryTemplateComponents?: Array<{
		componentId: string;
		name: string;
		calculationType: string;
		monthlyAmount: number;
		yearlyAmount: number;
		earnedAmount: number;
	}>;
	location: string;
	panNumber: string;
	uan: string;
	pfNumber: string;
	esiNumber: string;
	statutoryContributions?: {
		pfWageBasis: number; esiWageBasis: number;
		employeePf: number; employerPf: number; employeeVpf: number; employerVpf: number;
		employeeEsi: number; employerEsi: number;
		employeeContributionTotal: number; employerContributionTotal: number; totalEmployerCost: number;
		esiContributionPeriod: string; esiEligibleForPeriod: boolean; calculationNote: string;
	};
	bankName: string;
	accountNumber: string;
	joinDate: string;
	employmentWindowStart: string;
	employmentWindowEnd: string;
	monthDays: number;
	employmentDays: number;
	presentDays: number;
	lateDays: number;
	lateDaysDeductionApplied: number;
	lateDaysDeductionRejected: number;
	absentDays: number;
	halfDays: number;
	workedDays: number;
	payableDays: number;
	paidDays: number;
	leaveDays: number;
	weekOffDays: number;
	holidayDays: number;
	hoursWorked: number;
	overtimeAmount: number;
	claimsAmount: number;
	bonusAmount: number;
	lopAmount: number;
	lateFines?: number;
	otherDeductionsAmount: number;
	otherDeductionItems?: Array<{
		deductionId: number | null;
		name: string;
		amount: number;
		isRecurring: boolean;
		installmentNumber: number | null;
		numberOfInstallments: number | null;
	}>;
	deductionsAmount: number;
	baseSalary: number;
	earnedBaseSalary: number;
	grossPay: number;
	netPay: number;
	status: string;
	payrollLocked?: boolean;
	payrollLockMessage?: string;
	lockedAt?: string | null;
	lockedByUserId?: number | null;
	lockedByName?: string;
	generatedAt: string;
	createdAt: string;
}

export interface CrewPayPayrollRecord {
	id: number;
	payrollId?: number | null;
	employeeId: number;
	employeeName: string;
	department: string;
	payPeriod: string;
	grossPay: number;
	deductions: number;
	netPay: number;
	status: string;
	message?: string;
	lockedAt?: string | null;
	lockedByUserId?: number | null;
	lockedByName?: string;
	createdAt: string;
}

export interface GenerateSalarySlipPayload {
	year: number;
	month: number;
	employeeId?: number;
}

export interface OrganizationSettings {
	companyName: string;
	logoUrl: string;
	address: string;
	gstin: string;
}

