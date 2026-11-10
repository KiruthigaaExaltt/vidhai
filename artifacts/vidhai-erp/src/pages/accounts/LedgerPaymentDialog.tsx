import { useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// settled = received/paid plus credit/debit notes; closing = ledger closing balance.
export type LedgerPaymentParty = { kind: "customer" | "vendor"; id: number; name: string; settled: number; closing: number };
type Request = (path: string, options?: RequestInit) => Promise<any>;
type OpenItem = {
  id: number;
  sourceType: string;
  sourceId: number | null;
  vendorName?: string;
  isOpening: boolean;
  documentNumber: string;
  documentDate: string;
  amount: number;
  settledAmount: number;
  adjustedAmount: number;
  outstanding: number;
};
type Allocation = { item: OpenItem; amount: number; tds: number; charges: number };

const paymentMethods = ["Bank Transfer", "UPI", "Cheque", "Cash"];
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: any) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const inr = (value: any) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(num(value));
const today = () => new Date().toISOString().slice(0, 10);

// FIFO: settle the oldest open documents first (items arrive pre-sorted).
function fifoAllocate(items: OpenItem[], amount: number) {
  let remaining = round2(amount);
  const result: Record<number, number> = {};
  for (const item of items) {
    if (remaining <= 0) break;
    const share = round2(Math.min(remaining, item.outstanding));
    if (share > 0) result[item.id] = share;
    remaining = round2(remaining - share);
  }
  return result;
}

// TDS and bank charges are entered once for the whole receipt/payment and
// shared across documents in proportion to the amount allocated to each; the
// last document absorbs any rounding difference.
function splitProportionally(rows: { item: OpenItem; amount: number }[], tds: number, charges: number): Allocation[] {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  let tdsLeft = round2(tds);
  let chargesLeft = round2(charges);
  return rows.map((row, index) => {
    const last = index === rows.length - 1;
    const rowTds = last ? tdsLeft : round2((tds * row.amount) / total);
    const rowCharges = last ? chargesLeft : round2((charges * row.amount) / total);
    tdsLeft = round2(tdsLeft - rowTds);
    chargesLeft = round2(chargesLeft - rowCharges);
    return { ...row, tds: rowTds, charges: rowCharges };
  });
}

function statusAfter(item: OpenItem, allocated: number) {
  const balance = round2(item.outstanding - allocated);
  if (balance <= 0.009) return "Paid";
  return allocated > 0 || item.settledAmount > 0 || item.adjustedAmount > 0 ? "Partial" : "Pending";
}

// Receive a customer payment / make a vendor payment from the ledger and
// allocate it across the party's open invoices or bills, either automatically
// (oldest first) or manually. Each allocation is posted through the same
// workflow the Receivables / Payables screens use for that document type, so
// approvals, journals, balances and reports behave exactly as they do there.
export function LedgerPaymentDialog({
  party,
  coa,
  request,
  salesRequest,
  flexRequest,
  onClose,
  onPosted,
}: {
  party: LedgerPaymentParty;
  coa: any[];
  request: Request;
  salesRequest: Request;
  flexRequest: Request;
  onClose: () => void;
  onPosted: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const isCustomer = party.kind === "customer";
  const controlCode = isCustomer ? "1100" : "2100";
  const docLabel = isCustomer ? "Invoice" : "Bill";
  const [items, setItems] = useState<OpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<"auto" | "manual">("auto");
  const [amount, setAmount] = useState("");
  const [manual, setManual] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [referenceEdited, setReferenceEdited] = useState(false);
  // Stable retry identities for the AR/AP endpoints that support them.
  const [retryIds] = useState<Record<number, string>>({});
  const controlAccount = coa.find((account) => account.accountCode === controlCode && account.isActive !== false);
  const [form, setForm] = useState(() => ({
    paymentDate: today(),
    paymentMethod: "Bank Transfer",
    controlAccountId: String(controlAccount?.id || ""),
    settlementAccountId: "",
    bankCharges: "0",
    tdsAmount: "0",
    reference: "",
    notes: "",
  }));

  const loadItems = async () => {
    setLoading(true);
    try {
      const rows: OpenItem[] = await request(`/${isCustomer ? "customer" : "vendor"}-ledger/${party.id}/open-items`);
      setItems(rows);
      setManual({});
      setSelected({});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadItems();
  }, [party.kind, party.id]);

  // Allocation is limited to the open documents; the summary shows the
  // party's whole ledger position so it matches the ledger row.
  const totals = useMemo(
    () => ({ outstanding: round2(items.reduce((sum, item) => sum + item.outstanding, 0)) }),
    [items],
  );
  const summary = {
    settled: round2(num(party.settled)),
    balance: round2(num(party.closing)),
    total: round2(num(party.closing) + num(party.settled)),
  };
  const paid = round2(num(amount));
  const allocationById: Record<number, number> = useMemo(() => {
    if (method === "auto") return fifoAllocate(items, Math.min(paid, totals.outstanding));
    const result: Record<number, number> = {};
    for (const item of items) if (selected[item.id]) result[item.id] = round2(num(manual[item.id]));
    return result;
  }, [method, items, paid, totals.outstanding, manual, selected]);
  const allocated = round2(Object.values(allocationById).reduce((sum, value) => sum + value, 0));
  const unallocated = round2(paid - allocated);
  const allocatedRows = items.filter((item) => (allocationById[item.id] || 0) > 0);
  const autoReference = allocatedRows.map((item) => item.documentNumber).join(", ");
  const reference = referenceEdited ? form.reference : autoReference;

  const validationError = (() => {
    if (!(paid > 0)) return "Enter an amount greater than zero.";
    if (paid > totals.outstanding + 0.009)
      return `Amount cannot exceed the total outstanding of ${inr(totals.outstanding)}; advance payments are not allowed.`;
    for (const item of items) {
      const value = allocationById[item.id];
      if (value === undefined) continue;
      if (value < 0) return `${item.documentNumber}: allocation cannot be negative.`;
      if (value > item.outstanding + 0.009) return `${item.documentNumber}: allocation cannot exceed its outstanding ${inr(item.outstanding)}.`;
    }
    if (method === "manual" && Math.abs(unallocated) > 0.009)
      return unallocated > 0
        ? `Allocate the remaining ${inr(unallocated)} to ${docLabel.toLowerCase()}s.`
        : `Allocations exceed the amount by ${inr(-unallocated)}.`;
    if (!allocatedRows.length) return `Allocate the amount to at least one ${docLabel.toLowerCase()}.`;
    const tds = num(form.tdsAmount);
    const charges = num(form.bankCharges);
    if (tds < 0 || charges < 0) return "TDS and bank charges cannot be negative.";
    if (tds + charges > paid + 0.009) return "TDS and bank charges cannot exceed the amount.";
    const early = allocatedRows.find((item) => item.documentDate && form.paymentDate < item.documentDate);
    if (early) return `Payment date cannot be earlier than ${early.documentNumber} (${early.documentDate}).`;
    return "";
  })();
  const canSubmit = !submitting && !loading && !validationError && form.paymentDate && form.controlAccountId && form.settlementAccountId;

  const postAllocation = (row: Allocation, rowReference: string) => {
    const { item } = row;
    const common = { paymentDate: form.paymentDate, paymentMethod: form.paymentMethod, notes: form.notes };
    retryIds[item.id] ||= crypto.randomUUID();
    if (isCustomer) {
      if (item.sourceType === "Sales Invoice" && item.sourceId)
        return salesRequest("/payments", {
          method: "POST",
          body: JSON.stringify({
            ...common, invoiceId: item.sourceId, amount: row.amount, reference: rowReference,
            fromAccountId: Number(form.controlAccountId), toAccountId: Number(form.settlementAccountId),
            settlementAccountId: Number(form.settlementAccountId), bankCharges: row.charges, tdsAmount: row.tds,
          }),
        });
      return request(`/ar/${item.id}/payment`, {
        method: "POST",
        body: JSON.stringify({
          ...common, amount: row.amount, reference: rowReference, receiptId: retryIds[item.id],
          fromAccountId: Number(form.controlAccountId), toAccountId: Number(form.settlementAccountId),
          settlementAccountId: Number(form.settlementAccountId), bankCharges: row.charges, tdsAmount: row.tds,
        }),
      });
    }
    if (item.sourceType === "Purchase Invoice" && item.sourceId)
      return flexRequest("/vendor-payments", {
        method: "POST",
        body: JSON.stringify({
          vendorName: item.vendorName, invoiceReference: item.documentNumber, payableId: item.id, amount: row.amount,
          settlementAccountId: Number(form.settlementAccountId), fromAccountId: Number(form.settlementAccountId),
          toAccountId: Number(form.controlAccountId), recordImmediately: true, paymentDate: form.paymentDate,
          paymentMode: form.paymentMethod, paymentMethod: form.paymentMethod, transactionReference: rowReference,
          notes: form.notes, bankCharges: row.charges, tdsAmount: row.tds,
        }),
      });
    return request(`/ap/${item.id}/payment`, {
      method: "POST",
      body: JSON.stringify({
        ...common, amount: row.amount, reference: rowReference, paymentId: retryIds[item.id],
        fromAccountId: Number(form.settlementAccountId), toAccountId: Number(form.controlAccountId),
        settlementAccountId: Number(form.settlementAccountId), bankCharges: row.charges, tdsAmount: row.tds,
      }),
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    const rows = splitProportionally(
      allocatedRows.map((item) => ({ item, amount: allocationById[item.id] })),
      num(form.tdsAmount),
      num(form.bankCharges),
    );
    setSubmitting(true);
    setError("");
    const posted: string[] = [];
    // The sales and vendor payment workflows reject a reference that was used
    // on any earlier payment, so a second part-payment of the same invoice
    // cannot reuse the bare invoice number. Tag this submission uniquely.
    const batchTag = `LP-${Date.now().toString(36).toUpperCase()}`;
    try {
      for (const row of rows) {
        const typed = referenceEdited ? form.reference.trim() : "";
        const rowReference = typed
          ? rows.length > 1 ? `${typed} / ${row.item.documentNumber}` : typed
          : `${row.item.documentNumber} / ${batchTag}`;
        try {
          await postAllocation(row, rowReference);
        } catch (e: any) {
          throw new Error(`${row.item.documentNumber}: ${e.message}`);
        }
        posted.push(`${row.item.documentNumber} (${inr(row.amount)})`);
      }
      toast({
        title: isCustomer ? "Payment received" : "Payment recorded",
        description: `${inr(paid)} allocated to ${posted.join(", ")}.`,
      });
      await onPosted();
      onClose();
    } catch (e: any) {
      setError(
        posted.length
          ? `Posted ${posted.join(", ")}. Stopped at ${e.message}. Balances have been refreshed; enter the remaining amount again.`
          : e.message,
      );
      if (posted.length) {
        await onPosted();
        await loadItems();
        setAmount("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const accountOption = (account: any) => (
    <SelectItem key={account.id} value={String(account.id)}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0 group-data-[highlighted]:bg-white/25 group-data-[highlighted]:text-white transition-colors">
          {account.accountCode}
        </span>
        <span className="truncate">{account.accountName}</span>
      </div>
    </SelectItem>
  );
  const controlSelect = (
    <Select value={form.controlAccountId || undefined} onValueChange={(value) => setForm((f) => ({ ...f, controlAccountId: value }))}>
      <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {coa.filter((account) => account.isActive !== false && account.accountCode === controlCode).map(accountOption)}
      </SelectContent>
    </Select>
  );
  const settlementSelect = (
    <Select value={form.settlementAccountId || undefined} onValueChange={(value) => setForm((f) => ({ ...f, settlementAccountId: value }))}>
      <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
        <SelectValue placeholder={isCustomer ? "Select settlement account" : "Select payment account"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {coa.filter((account) => account.isActive !== false && account.accountCode !== controlCode).map(accountOption)}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isCustomer ? "Receive Payment" : "Make Payment"}</DialogTitle>
          <DialogDescription>{party.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>
          )}
          <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/45 p-4 text-center">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Total Amount</p>
              <p className="font-semibold">{inr(summary.total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Already Paid</p>
              <p className="font-semibold text-primary">{inr(summary.settled)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Balance</p>
              <p className="font-semibold">{inr(summary.balance)}</p>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading outstanding {docLabel.toLowerCase()}s...
            </div>
          ) : !items.length ? (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              No approved outstanding {docLabel.toLowerCase()}s for this {party.kind}.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ledger-payment-amount">Paid Amount *</Label>
                  <Input
                    id="ledger-payment-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={totals.outstanding}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Allocation Method *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["auto", "manual"] as const).map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={method === value ? "default" : "outline"}
                        className="h-10"
                        onClick={() => setMethod(value)}
                      >
                        {value === "auto" ? "Automatic (FIFO)" : "Manual"}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {method === "manual" && <th className="px-3 py-2 text-left">Select</th>}
                      <th className="px-3 py-2 text-left whitespace-nowrap">{docLabel} No.</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">{docLabel} Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">{isCustomer ? "Received" : "Paid"}</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-right">Allocation</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Balance After</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const value = allocationById[item.id] || 0;
                      return (
                        <tr key={item.id} className="border-t">
                          {method === "manual" && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                aria-label={`Select ${item.documentNumber}`}
                                checked={Boolean(selected[item.id])}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  setSelected((current) => ({ ...current, [item.id]: checked }));
                                  if (checked && !manual[item.id]) {
                                    const room = Math.max(0, round2(paid - allocated));
                                    setManual((current) => ({ ...current, [item.id]: String(round2(Math.min(item.outstanding, room))) }));
                                  }
                                }}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {item.documentNumber}
                            {item.isOpening && <span className="ml-1 text-xs text-muted-foreground">(Opening)</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{item.documentDate}</td>
                          <td className="px-3 py-2 text-right">{inr(item.amount)}</td>
                          <td className="px-3 py-2 text-right">{inr(item.settledAmount + item.adjustedAmount)}</td>
                          <td className="px-3 py-2 text-right">{inr(item.outstanding)}</td>
                          <td className="px-3 py-2 text-right">
                            {method === "manual" ? (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                max={item.outstanding}
                                disabled={!selected[item.id]}
                                value={selected[item.id] ? manual[item.id] ?? "" : ""}
                                onChange={(event) => setManual((current) => ({ ...current, [item.id]: event.target.value }))}
                                className="h-8 w-28 ml-auto text-right"
                                aria-label={`Allocation for ${item.documentNumber}`}
                              />
                            ) : (
                              <span className={value > 0 ? "font-semibold text-primary" : "text-muted-foreground"}>{inr(value)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{inr(Math.max(0, item.outstanding - value))}</td>
                          <td className="px-3 py-2">{statusAfter(item, value)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 text-sm font-semibold">
                    <tr>
                      <td colSpan={method === "manual" ? 6 : 5} className="px-3 py-2 text-right">
                        Allocated {inr(allocated)} · Unallocated {inr(Math.max(0, unallocated))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {paid > 0 && validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>From Account *</Label>
                  {isCustomer ? controlSelect : settlementSelect}
                </div>
                <div className="space-y-1.5">
                  <Label>To Account *</Label>
                  {isCustomer ? settlementSelect : controlSelect}
                </div>
                <div className="space-y-1.5 text-sm">
                  <Label>Payment Date *</Label>
                  <Input
                    type="date"
                    required
                    value={form.paymentDate}
                    onChange={(event) => setForm((f) => ({ ...f, paymentDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 text-sm">
                  <Label>Payment Method</Label>
                  <Select value={form.paymentMethod} onValueChange={(value) => setForm((f) => ({ ...f, paymentMethod: value }))}>
                    <SelectTrigger className="h-10 w-full bg-white font-medium shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((value) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-3.5 w-3.5 opacity-60 group-data-[highlighted]:text-white shrink-0" />
                            <span>{value}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 text-sm">
                  <Label>Bank Charges</Label>
                  <Input type="number" min="0" step="0.01" value={form.bankCharges} onChange={(event) => setForm((f) => ({ ...f, bankCharges: event.target.value }))} />
                </div>
                <div className="space-y-1.5 text-sm">
                  <Label>TDS Amount</Label>
                  <Input type="number" min="0" step="0.01" value={form.tdsAmount} onChange={(event) => setForm((f) => ({ ...f, tdsAmount: event.target.value }))} />
                </div>
                <div className="space-y-1.5 text-sm sm:col-span-2">
                  <Label>Reference ID / {docLabel} Number</Label>
                  <Input
                    placeholder={`${docLabel} numbers are used when left blank`}
                    value={reference}
                    onChange={(event) => {
                      setReferenceEdited(true);
                      setForm((f) => ({ ...f, reference: event.target.value }));
                    }}
                  />
                  {(num(form.tdsAmount) > 0 || num(form.bankCharges) > 0) && allocatedRows.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      TDS and bank charges are shared across the selected {docLabel.toLowerCase()}s in proportion to each allocation.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 text-sm sm:col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {submitting ? "Posting..." : isCustomer ? "Receive Payment" : "Make Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
