import { FLEX_TEXT } from "./flexText";
import { useFlexMasterData } from "./flexData";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { FlexTabs } from "./FlexTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface OutstandingBillItem {
  id: number;
  vendorId: string;
  vendor: string;
  billNumber: string;
  invoiceReference?: string;
  date: string;
  amount: number;
  paid: number;
  adjusted: number;
  outstanding: number;
  status?: string;
  paymentMode?: string;
}

async function fetchOutstandingBills(): Promise<OutstandingBillItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/vendor-payments/outstanding-bills`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return (data || []).map((p: any) => ({
        id: p.id,
        vendorId: p.vendorId || "",
        vendor: p.vendorName,
        billNumber: p.billNumber,
        invoiceReference: p.billNumber,
        date: p.billDate,
        amount: Number(p.amount || 0),
        paid: Number(p.paidAmount || 0),
        adjusted: Number(p.adjustedAmount || 0),
        outstanding: Number(p.outstanding || 0),
        status: p.status,
        paymentMode: p.paymentMode,
      }));
    }
  } catch {}
  return [];
}

async function createVendorPayment(payload: any) {
  const res = await fetch(`${BASE}/api/flex/vendor-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || FLEX_TEXT.failedToRecordPayment);
  }
  return res.json();
}

export default function VendorPayments() {
  const queryClient = useQueryClient();
  const { data: bills = [] } = useQuery({
    queryKey: ["get", "/api/flex/vendor-payments/outstanding-bills"],
    queryFn: fetchOutstandingBills,
  });

  const { data: masterData } = useFlexMasterData();
  const vendorsList = masterData?.vendors ?? [];

  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [vendor, setVendor] = useState("");
  const [outstandingBill, setOutstandingBill] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Bank Transfer");
  const [bankAccount, setBankAccount] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  const createMutation = useMutation({
    mutationFn: createVendorPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/vendor-payments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/vendor-payments/outstanding-bills"],
      });
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/dashboard"],
      });
      toast.success(FLEX_TEXT.paymentRecordedAgainstBill);
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || FLEX_TEXT.failedToRecordPayment);
    },
  });

  const resetForm = () => {
    setVendor("");
    setOutstandingBill("");
    setAmount("");
    setTransactionRef("");
    setNotes("");
    setAttachmentName("");
  };

  const filtered = useMemo(() => {
    return bills.filter((b) => {
      return selectedVendor === "All" || b.vendor === selectedVendor;
    });
  }, [bills, selectedVendor]);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const bill = bills.find((item) => item.billNumber === outstandingBill);
    const paymentAmount = Number(amount);
    if (
      !bill ||
      !vendor ||
      !bankAccount ||
      paymentAmount <= 0 ||
      paymentAmount > bill.outstanding
    ) {
      toast.error(
        "Select an outstanding bill, bank/cash account and valid payment amount",
      );
      return;
    }
    createMutation.mutate({
      vendorName: bill.vendor || vendor,
      invoiceReference: outstandingBill,
      amount: parseFloat(amount) || 0,
      paymentMode,
      paymentDate,
      status: "Completed",
      notes,
      transactionReference: transactionRef,
      bankAccount,
      attachmentName,
    });
  };

  const paymentModeOptions = [
    { label: FLEX_TEXT.bankTransfer, value: "Bank Transfer" },
    { label: FLEX_TEXT.cash, value: "Cash" },
    { label: FLEX_TEXT.cheque, value: "Cheque" },
    { label: FLEX_TEXT.upi, value: "UPI" },
    { label: FLEX_TEXT.neftRtgs, value: "NEFT/RTGS" },
  ];

  const filteredModes = paymentModeOptions.filter((m) =>
    m.label.toLowerCase().includes(modeFilter.toLowerCase()),
  );

  const vendorBills = useMemo(() => {
    const selectedName = vendor.trim().toLowerCase();
    return bills.filter(
      (bill) =>
        bill.outstanding > 0 &&
        (!selectedName || bill.vendor.trim().toLowerCase() === selectedName),
    );
  }, [bills, vendor]);

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {FLEX_TEXT.vendorPayments}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {
                FLEX_TEXT.recordPaymentsAgainstVendorBillsAndUpdateAccountsPayable
              }
            </p>
          </div>

          <div>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl gap-2 shadow-xs"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="w-4 h-4" /> {FLEX_TEXT.recordPayment}
            </Button>
          </div>
        </div>

        {/* Filter by Vendor */}
        <div className="space-y-1 max-w-xs">
          <div className="text-xs text-muted-foreground font-medium">
            {FLEX_TEXT.filterByVendor}
          </div>
          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="bg-background text-xs h-10 rounded-xl border-border shadow-2xs">
              <SelectValue placeholder={FLEX_TEXT.allVendors} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{FLEX_TEXT.allVendors}</SelectItem>
              {vendorsList.map((v: any) => (
                <SelectItem key={v.id} value={v.name}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table Card Container */}
        <Card className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">
              {FLEX_TEXT.outstandingBills}
            </h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <th className="px-6 py-3.5">{FLEX_TEXT.vendorId}</th>
                    <th className="px-6 py-3.5">{FLEX_TEXT.vendor2}</th>
                    <th className="px-6 py-3.5">{FLEX_TEXT.bill}</th>
                    <th className="px-6 py-3.5">{FLEX_TEXT.date}</th>
                    <th className="px-6 py-3.5">Bill Amount</th>
                    <th className="px-6 py-3.5">Amount Paid</th>
                    <th className="px-6 py-3.5">{FLEX_TEXT.outstanding}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-8 text-center text-muted-foreground text-sm"
                      >
                        {FLEX_TEXT.noOutstandingBillsFound}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-6 py-4 text-muted-foreground font-normal">
                          {b.vendorId || "-"}
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground">
                          {b.vendor}
                        </td>
                        <td className="px-6 py-4 font-semibold text-muted-foreground font-mono text-[11px]">
                          {b.billNumber}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {b.date}
                        </td>
                        <td className="px-6 py-4 font-bold text-foreground">
                          ₹ {b.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          ₹ {b.paid.toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-4 font-bold text-amber-600 dark:text-amber-400">
                          ₹ {b.outstanding.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Record Vendor Payment Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-6 bg-background rounded-2xl border border-border shadow-2xl">
            <form onSubmit={handleRecordPayment}>
              <DialogHeader className="pb-3 border-border">
                <DialogTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
                  <span className="text-lg font-bold text-primary leading-none">
                    ₹
                  </span>
                  {FLEX_TEXT.recordVendorPayment}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-xs">
                {/* Vendor */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.vendor}
                  </Label>
                  <Select
                    value={vendor}
                    onValueChange={(value) => {
                      setVendor(value);
                      setOutstandingBill("");
                      setAmount("");
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder={FLEX_TEXT.selectVendor2} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorsList.map((v: any) => (
                        <SelectItem key={v.id} value={v.name}>
                          {v.id} - {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Outstanding bill */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.outstandingBill}
                  </Label>
                  <Select
                    value={outstandingBill}
                    onValueChange={(value) => {
                      setOutstandingBill(value);
                      const bill = bills.find((item) => item.billNumber === value);
                      if (bill) {
                        setVendor(bill.vendor || "");
                        setAmount(String(bill.outstanding));
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder={FLEX_TEXT.selectBill} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorBills.map((bill) => (
                          <SelectItem
                            key={bill.id}
                            value={bill.billNumber}
                          >
                            {bill.billNumber} ({bill.vendor} - ₹
                            {bill.outstanding.toLocaleString(
                              "en-IN",
                            )}
                            )
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment date */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.paymentDate}
                  </Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl cursor-pointer"
                  />
                </div>

                {/* Payment amount */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.paymentAmount}
                  </Label>
                  <Input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="-1"
                    className="h-10 text-xs border-border rounded-xl font-medium"
                  />
                </div>

                {/* Payment mode */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.paymentMode}
                  </Label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className="h-10 text-xs bg-background border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl font-semibold text-foreground">
                      <SelectValue placeholder={FLEX_TEXT.selectPaymentMode} />
                    </SelectTrigger>
                    <SelectContent className="p-1 border border-border shadow-lg rounded-xl">
                      <div
                        className="relative p-1.5 mb-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={FLEX_TEXT.typeToFilter}
                          value={modeFilter}
                          onChange={(e) => setModeFilter(e.target.value)}
                          className="h-8 pl-8 text-xs border-border rounded-lg bg-muted/40"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredModes.map((m) => (
                        <SelectItem
                          key={m.value}
                          value={m.value}
                          className="text-xs py-2 rounded-lg cursor-pointer font-medium focus:bg-primary/10 focus:text-primary"
                        >
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Bank / Cash account */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.bankCashAccount}
                  </Label>
                  <Select value={bankAccount} onValueChange={setBankAccount}>
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder={FLEX_TEXT.bankAccount10201} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Account (1020)">Bank Account (1020)</SelectItem>
                      <SelectItem value="Cash Account (1010)">Cash Account (1010)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transaction reference */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.transactionReference}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.upiChequeNeftReference}
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl placeholder:text-muted-foreground"
                  />
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.notes}
                  </Label>
                  <Input
                    placeholder={FLEX_TEXT.optionalPaymentNotes}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl placeholder:text-muted-foreground"
                  />
                </div>

                {/* Invoice Attachment */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {FLEX_TEXT.invoiceAttachment}
                  </Label>
                  <div
                    onClick={() =>
                      document.getElementById("vendor-payment-file")?.click()
                    }
                    className="border border-border rounded-xl p-3 bg-background flex items-center justify-between text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-muted text-foreground font-semibold rounded-lg border border-border">
                        {FLEX_TEXT.chooseFile}
                      </span>
                      <span className="text-muted-foreground">
                        {attachmentName ? attachmentName : "No file chosen"}
                      </span>
                    </div>
                    {attachmentName && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAttachmentName("");
                        }}
                        className="text-muted-foreground hover:text-foreground text-xs font-bold px-2 py-0.5 rounded-md"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Input
                      type="file"
                      className="hidden"
                      id="vendor-payment-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAttachmentName(file.name);
                          toast.success(`${FLEX_TEXT.attached}${file.name}`);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-5 text-xs font-semibold text-foreground bg-background border-border rounded-xl hover:bg-muted"
                  onClick={() => setIsAddOpen(false)}
                >
                  {FLEX_TEXT.cancel}
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-xs"
                >
                  {FLEX_TEXT.recordPayment}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
