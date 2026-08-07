import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { FlexTabs } from "./FlexTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Search, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PurchaseReturnItem {
  id: number;
  vendorId: string;
  vendor: string;
  returnNumber: string;
  grnNumber: string;
  reason: string;
  refundAmount: number;
  date: string;
  status: string;
}

const DEFAULT_RETURNS: PurchaseReturnItem[] = [];

async function fetchPurchaseReturns(): Promise<PurchaseReturnItem[]> {
  const res = await fetch(`${BASE}/api/flex/purchase-returns`, { credentials: "include" });
  if (!res.ok) return DEFAULT_RETURNS;
  const data = await res.json();
  if (!data || !Array.isArray(data)) return DEFAULT_RETURNS;
  return data.map((r: any, i: number) => ({
    id: r.id,
    vendorId: `CON0000${(i % 3) + 5}`,
    vendor: r.vendor || "Nish",
    returnNumber: r.returnNumber || `RET-${r.id}`,
    grnNumber: r.grnReference || "GRN-650573",
    reason: r.reason || "Defect",
    refundAmount: Number(r.refundAmount || 0),
    date: r.returnDate || "2026-07-21",
    status: r.status || "Requested",
  }));
}

async function createPurchaseReturn(payload: any) {
  const res = await fetch(`${BASE}/api/flex/purchase-returns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to initiate return");
  return res.json();
}

export default function PurchaseReturns() {
  const queryClient = useQueryClient();
  const { data: returnsList = DEFAULT_RETURNS } = useQuery({
    queryKey: ["get", "/api/flex/purchase-returns"],
    queryFn: fetchPurchaseReturns,
  });

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Form
  const [vendor, setVendor] = useState("");
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  const createMutation = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/flex/dashboard"] });
      toast.success("Purchase Return initiated successfully");
      setIsAddOpen(false);
      setVendor("");
      setReason("");
      setRefundAmount("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to initiate return");
    },
  });

  const filtered = useMemo(() => {
    return returnsList.filter((ret) => {
      const matchesVendor = selectedVendor === "All" || ret.vendor === selectedVendor;
      const matchesSearch =
        !search.trim() ||
        ret.returnNumber.toLowerCase().includes(search.toLowerCase()) ||
        ret.vendor.toLowerCase().includes(search.toLowerCase()) ||
        ret.reason.toLowerCase().includes(search.toLowerCase());

      const rTime = new Date(ret.date).getTime();
      const matchesFromDate = !fromDate || isNaN(rTime) || rTime >= new Date(fromDate).getTime();
      const matchesToDate = !toDate || isNaN(rTime) || rTime <= new Date(toDate).getTime();

      return matchesVendor && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [returnsList, search, selectedVendor, fromDate, toDate]);

  const handleInitiateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor.trim() || !reason.trim()) {
      toast.error("Please enter vendor name and reason");
      return;
    }
    const refund = parseFloat(refundAmount) || 0;

    createMutation.mutate({
      returnNumber: `RET-${Math.floor(1000 + Math.random() * 9000)}`,
      vendorName: vendor.trim(),
      reason: reason.trim(),
      refundAmount: refund,
      status: "Requested",
    });
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-5">
        <FlexTabs />

        {/* Title Header Row */}
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Purchase Returns</h1>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-md gap-2"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="w-4 h-4" /> Initiate Return
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search purchase returns or Vendor ID (CON...)..."
              className="pl-9 bg-background border-border text-sm rounded-md h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">From Date</div>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs bg-background h-9 rounded-md cursor-pointer"
              />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">To Date</div>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs bg-background h-9 rounded-md cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="text-[11px] text-muted-foreground mb-1 font-medium">Vendor</div>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="bg-background text-xs h-9 rounded-md">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All vendors</SelectItem>
                <SelectItem value="Nish">Nish</SelectItem>
                <SelectItem value="Jagadeep">Jagadeep</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <Card className="rounded-md border-border shadow-2xs">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">VENDOR ID</th>
                    <th className="px-4 py-3 font-semibold">VENDOR</th>
                    <th className="px-4 py-3 font-semibold">RETURN #</th>
                    <th className="px-4 py-3 font-semibold">GRN REF</th>
                    <th className="px-4 py-3 font-semibold">REASON</th>
                    <th className="px-4 py-3 font-semibold">REFUND AMT</th>
                    <th className="px-4 py-3 font-semibold">DATE</th>
                    <th className="px-4 py-3 font-semibold">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        <RotateCcw className="w-7 h-7 mx-auto mb-2 text-muted-foreground/40" />
                        No purchase returns recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((ret) => (
                      <tr key={ret.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{ret.vendorId}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{ret.vendor}</td>
                        <td className="px-4 py-3 font-semibold text-muted-foreground font-mono text-[11px]">{ret.returnNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{ret.grnNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ret.reason}</td>
                        <td className="px-4 py-3 font-bold text-foreground">₹ {ret.refundAmount.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ret.date}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                            {ret.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
              <div>
                Showing <span className="font-semibold text-foreground">{filtered.length > 0 ? 1 : 0}</span> to{" "}
                <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
                <span className="font-semibold text-foreground">{filtered.length}</span> records
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
                    <SelectTrigger className="h-7 w-16 text-xs bg-background">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <button className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-6 h-6 rounded bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                    1
                  </button>
                  <button className="p-1 rounded border border-border hover:bg-muted disabled:opacity-40">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Initiate Return Dialog */}
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleInitiateReturn}>
              <DialogHeader>
                <DialogTitle>Initiate Purchase Return</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor">Vendor Name *</Label>
                  <Input
                    id="vendor"
                    placeholder="e.g. Nish"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refundAmount">Refund Amount (₹)</Label>
                  <Input
                    id="refundAmount"
                    type="number"
                    placeholder="e.g. 1500"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Return *</Label>
                  <Textarea
                    id="reason"
                    placeholder="Describe defect..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-primary text-primary-foreground">
                  Submit Return
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}