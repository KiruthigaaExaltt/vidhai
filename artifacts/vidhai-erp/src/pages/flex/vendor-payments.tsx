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
  outstanding: number;
  status?: string;
  paymentMode?: string;
}

const DEFAULT_BILLS: OutstandingBillItem[] = [
  {
    id: 1,
    vendorId: "-",
    vendor: "sample",
    billNumber: "PAY-2026-08-2-ACCRUAL",
    invoiceReference: "INV000",
    date: "07 Aug 2026",
    amount: 100,
    paid: 0,
    outstanding: 100,
    status: "Completed",
    paymentMode: "Bank Transfer",
  },
  {
    id: 2,
    vendorId: "-",
    vendor: "Elakiya Shri",
    billNumber: "PAY-2026-07-1-ACCRUAL",
    invoiceReference: "INV001",
    date: "17 Jul 2026",
    amount: 6451.61,
    paid: 0,
    outstanding: 6451.61,
    status: "Completed",
    paymentMode: "Bank Transfer",
  },
  {
    id: 3,
    vendorId: "-",
    vendor: "Elakiya Shri",
    billNumber: "CCLM-1",
    invoiceReference: "INV002",
    date: "17 Jul 2026",
    amount: 12000,
    paid: 0,
    outstanding: 12000,
    status: "Completed",
    paymentMode: "Bank Transfer",
  },
];

import { mergeVendors, addStoredVendor, mergePayments, addStoredPayment } from "@/lib/flexStore";

async function fetchVendorPayments(): Promise<OutstandingBillItem[]> {
  try {
    const res = await fetch(`${BASE}/api/flex/vendor-payments`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const serverMapped = (data || []).map((p: any) => ({
        id: p.id,
        vendorId: p.vendorId || "-",
        vendor: p.vendor || "Elakiya Shri",
        billNumber: p.paymentNumber || "PAY-2026-07-1-ACCRUAL",
        invoiceReference: p.invoiceReference || "INV001",
        date: p.paymentDate || "17 Jul 2026",
        amount: Number(p.amount || 0),
        paid: 0,
        outstanding: Number(p.amount || 0),
        status: p.status || "Completed",
        paymentMode: p.paymentMode || "Bank Transfer",
      }));
      return mergePayments(serverMapped, DEFAULT_BILLS);
    }
  } catch {}
  return mergePayments([], DEFAULT_BILLS);
}

async function createVendorPayment(payload: any) {
  const res = await fetch(`${BASE}/api/flex/vendor-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to record payment");
  return res.json();
}


async function fetchVendorsList() {
  try {
    const res = await fetch(`${BASE}/api/flex/vendors`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      return mergeVendors(data);
    }
  } catch {}
  return mergeVendors([]);
}

export default function VendorPayments() {
  const queryClient = useQueryClient();
  const { data: bills = DEFAULT_BILLS } = useQuery({
    queryKey: ["get", "/api/flex/vendor-payments"],
    queryFn: fetchVendorPayments,
  });

  const { data: vendorsList = [] } = useQuery({
    queryKey: ["get", "/api/flex/vendors"],
    queryFn: fetchVendorsList,
  });

  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form State
  const [vendor, setVendor] = useState("");
  const [outstandingBill, setOutstandingBill] = useState("");
  const [paymentDate, setPaymentDate] = useState("2026-08-07");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Bank Transfer");
  const [bankAccount, setBankAccount] = useState("Bank Account (1020) (1)");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  const createMutation = useMutation({
    mutationFn: createVendorPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/vendor-payments"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
      toast.success("Payment recorded against bill");
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to record payment");
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
    const vendorName = vendor.trim() || "Elakiya Shri";
    const billNum = outstandingBill.trim() || `PAY-2026-08-${bills.length + 1}-ACCRUAL`;
    const amt = parseFloat(amount) || 100;

    const newPaymentItem: OutstandingBillItem = {
      id: Date.now(),
      vendorId: "CON00007",
      vendor: vendorName,
      billNumber: billNum,
      invoiceReference: "INV001",
      date: paymentDate || "07 Aug 2026",
      amount: amt,
      paid: 0,
      outstanding: amt,
      status: "Completed",
      paymentMode,
    };

    addStoredPayment(newPaymentItem);
    addStoredVendor({ id: "CON00007", name: vendorName });

    toast.success("Vendor payment recorded successfully!");
    setIsAddOpen(false);
    resetForm();

    createMutation.mutate({
      paymentNumber: billNum,
      vendorName,
      invoiceReference: "INV001",
      amount: amt,
      paymentMode,
      paymentDate,
      status: "Completed",
      notes,
    });
  };

  const paymentModeOptions = [
    { label: "Bank Transfer", value: "Bank Transfer" },
    { label: "Cash", value: "Cash" },
    { label: "Cheque", value: "Cheque" },
    { label: "UPI", value: "UPI" },
    { label: "NEFT/RTGS", value: "NEFT/RTGS" },
  ];

  const filteredModes = paymentModeOptions.filter((m) =>
    m.label.toLowerCase().includes(modeFilter.toLowerCase())
  );

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Vendor Payments</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Record payments against vendor bills and update accounts payable.
            </p>
          </div>

          <div>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2.5 rounded-xl gap-2 shadow-xs"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="w-4 h-4" /> Record Payment
            </Button>
          </div>
        </div>

        {/* Filter by Vendor */}
        <div className="space-y-1 max-w-xs">
          <div className="text-xs text-muted-foreground font-medium">Filter by vendor</div>
          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="bg-background text-xs h-10 rounded-xl border-border shadow-2xs">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All vendors</SelectItem>
              {vendorsList.map((v: any) => (
                <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Data Table Card Container */}
        <Card className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Outstanding Bills</h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <th className="px-6 py-3.5">VENDOR ID</th>
                    <th className="px-6 py-3.5">VENDOR</th>
                    <th className="px-6 py-3.5">BILL #</th>
                    <th className="px-6 py-3.5">DATE</th>
                    <th className="px-6 py-3.5">AMOUNT</th>
                    <th className="px-6 py-3.5">PAID</th>
                    <th className="px-6 py-3.5">OUTSTANDING</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground text-sm">
                        No outstanding bills found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-4 text-muted-foreground font-normal">{b.vendorId || "-"}</td>
                        <td className="px-6 py-4 font-bold text-foreground">{b.vendor}</td>
                        <td className="px-6 py-4 font-semibold text-muted-foreground font-mono text-[11px]">{b.billNumber}</td>
                        <td className="px-6 py-4 text-muted-foreground">{b.date}</td>
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
                  <span className="text-lg font-bold text-primary leading-none">₹</span>
                  Record Vendor Payment
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-xs">
                {/* Vendor */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Vendor</Label>
                  <Select value={vendor} onValueChange={setVendor}>
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorsList.map((v: any) => (
                        <SelectItem key={v.id} value={v.name}>{v.id} - {v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Outstanding bill */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Outstanding bill</Label>
                  <Select
                    value={outstandingBill}
                    onValueChange={(val) => {
                      setOutstandingBill(val);
                      if (val === "PAY-2026-08-2-ACCRUAL") {
                        setVendor("sample");
                        setAmount("100");
                      } else if (val === "PAY-2026-07-1-ACCRUAL") {
                        setVendor("Elakiya Shri");
                        setAmount("6451.61");
                      } else if (val === "CCLM-1") {
                        setVendor("Elakiya Shri");
                        setAmount("12000");
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder="Select bill" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PAY-2026-08-2-ACCRUAL">PAY-2026-08-2-ACCRUAL (₹ 100)</SelectItem>
                      <SelectItem value="PAY-2026-07-1-ACCRUAL">PAY-2026-07-1-ACCRUAL (₹ 6,451.61)</SelectItem>
                      <SelectItem value="CCLM-1">CCLM-1 (₹ 12,000)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment date */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment date</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl cursor-pointer"
                  />
                </div>

                {/* Payment amount */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment amount</Label>
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
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Payment mode</Label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className="h-10 text-xs bg-background border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl font-semibold text-foreground">
                      <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent className="p-1 border border-border shadow-lg rounded-xl">
                      <div className="relative p-1.5 mb-1" onClick={(e) => e.stopPropagation()}>
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Type to filter..."
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
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bank / Cash account</Label>
                  <Select value={bankAccount} onValueChange={setBankAccount}>
                    <SelectTrigger className="h-10 text-xs bg-background border-border rounded-xl">
                      <SelectValue placeholder="Bank Account (1020) (1)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Account (1020) (1)">Bank Account (1020) (1)</SelectItem>
                      <SelectItem value="Petty Cash (1010)">Petty Cash (1010)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transaction reference */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Transaction reference</Label>
                  <Input
                    placeholder="UPI / cheque / NEFT reference"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl placeholder:text-muted-foreground"
                  />
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</Label>
                  <Input
                    placeholder="Optional payment notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 text-xs border-border rounded-xl placeholder:text-muted-foreground"
                  />
                </div>

                {/* Invoice Attachment */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Invoice Attachment</Label>
                  <div
                    onClick={() => document.getElementById("vendor-payment-file")?.click()}
                    className="border border-border rounded-xl p-3 bg-background flex items-center justify-between text-xs cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-muted text-foreground font-semibold rounded-lg border border-border">
                        Choose File
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
                          toast.success(`Attached ${file.name}`);
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
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 px-5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-xs"
                >
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}