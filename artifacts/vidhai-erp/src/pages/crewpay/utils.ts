export const formatMonthLabel = (value: string) => new Date(value + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
export const resolveSalaryComponentEarnedAmount = (component: { earnedAmount?: number | null; monthlyAmount?: number | null }) => Number(component.earnedAmount ?? component.monthlyAmount ?? 0);
