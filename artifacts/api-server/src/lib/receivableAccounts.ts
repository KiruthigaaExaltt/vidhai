export function receiptAccounts(body: any, accounts: any[]) {
  const receivable = accounts.find(account => account.accountCode === "1100" && account.isActive !== false);
  const explicit = body.fromAccountId !== undefined || body.toAccountId !== undefined;
  const validId = (value: unknown) => /^[1-9]\d*$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
  const fromId = explicit ? body.fromAccountId : receivable?.id;
  const toId = explicit ? body.toAccountId : body.settlementAccountId;
  if (!receivable || !validId(fromId) || Number(fromId) !== Number(receivable.id)) throw new Error("From Account must be the active Accounts Receivable account (1100)");
  const settlement = accounts.find(account => validId(toId) && Number(account.id) === Number(toId) && account.isActive !== false);
  if (!settlement) throw new Error("To Account: choose a valid active Chart of Accounts account");
  if (Number(settlement.id) === Number(receivable.id)) throw new Error("From Account and To Account must be different");
  if (body.settlementAccountId && Number(body.settlementAccountId) !== Number(settlement.id)) throw new Error("To Account conflicts with settlement account");
  return { receivable, settlement };
}
