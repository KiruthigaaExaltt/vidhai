export const APPLICATION_BALANCE_CONVENTION = "credit-increases";
export type AccountMovement = { accountId: number; debit: number; credit: number };
export const applicationBalanceDelta = (debit: number, credit: number) => credit - debit;
const positiveAmount = (value: unknown) => { const amount = Number(value); if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero"); return amount; };
const differentAccounts = (debitAccountId: number, creditAccountId: number) => { if (!Number.isFinite(debitAccountId) || !Number.isFinite(creditAccountId)) throw new Error("Choose valid Chart of Accounts accounts"); if (debitAccountId === creditAccountId) throw new Error("Debit and credit accounts must be different"); };
export function bankCashMovements(mode: string, selectedAccountId: number, amountValue: unknown, transferToAccountId?: number): AccountMovement[] {
  const amount = positiveAmount(amountValue), normalizedMode = String(mode).trim().toLowerCase();
  if (normalizedMode === "credit") return [{ accountId: selectedAccountId, debit: 0, credit: amount }];
  if (normalizedMode === "debit") return [{ accountId: selectedAccountId, debit: amount, credit: 0 }];
  if (normalizedMode === "transfer") { differentAccounts(selectedAccountId, Number(transferToAccountId)); return [{ accountId: selectedAccountId, debit: amount, credit: 0 }, { accountId: Number(transferToAccountId), debit: 0, credit: amount }]; }
  throw new Error("Transaction type must be Credit, Debit, or Transfer");
}
export function journalMovements(debitAccountId: number, creditAccountId: number, amountValue: unknown): AccountMovement[] {
  const amount = positiveAmount(amountValue); differentAccounts(debitAccountId, creditAccountId);
  return [{ accountId: debitAccountId, debit: amount, credit: 0 }, { accountId: creditAccountId, debit: 0, credit: amount }];
}
