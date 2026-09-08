export function disbursementAccounts(body: any, accounts: any[]) {
  const payable = accounts.find(account => account.accountCode === "2100" && account.isActive !== false);
  const explicit = body.fromAccountId !== undefined || body.toAccountId !== undefined;
  const validId = (value: unknown) => /^[1-9]\d*$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
  const fromId = explicit ? body.fromAccountId : body.settlementAccountId;
  const toId = explicit ? body.toAccountId : payable?.id;
  const settlement = accounts.find(account => validId(fromId) && Number(account.id) === Number(fromId) && account.isActive !== false);
  if (!settlement) throw new Error("From Account: choose a valid active Chart of Accounts account");
  if (settlement.accountCode === "2100") throw new Error("From Account cannot be the Accounts Payable account (2100)");
  if (!payable || !validId(toId) || Number(toId) !== Number(payable.id)) throw new Error("To Account must be the active Accounts Payable account (2100)");
  if (Number(settlement.id) === Number(payable.id)) throw new Error("From Account and To Account must be different");
  if (body.settlementAccountId && Number(body.settlementAccountId) !== Number(settlement.id)) throw new Error("From Account conflicts with settlement account");
  return { payable, settlement };
}
