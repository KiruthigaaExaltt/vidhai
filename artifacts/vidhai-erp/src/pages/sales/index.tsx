import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Plus, Pencil, Trash2, CirclePlay, AlertTriangle, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SalesDocumentForm } from "./components/SalesDocumentForm";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  FileText,
  FileMinus,
  ShoppingCart,
  Truck,
  FileSpreadsheet,
  Undo2,
} from "lucide-react";

const SALES_SUBMODULES = [
  { id: "Quotation", label: "Quotation", icon: FileText },
  { id: "Proforma Invoice", label: "Proforma Invoice", icon: FileMinus },
  { id: "Sales Order", label: "Sales Order", icon: ShoppingCart },
  { id: "Delivery Challan", label: "Delivery Challan", icon: Truck },
  { id: "Invoices", label: "Invoices", icon: FileSpreadsheet },
  { id: "Sales Return", label: "Sales Return", icon: Undo2 },
];

export default function Sales() {
  const [activeTab, setActiveTab] = useState(SALES_SUBMODULES[0].id);
  const [creatingType, setCreatingType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [proformas, setProformas] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [approvedDocuments, setApprovedDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadQuotations = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/sales/quotations", {
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load quotations");
      }
      setQuotations(await response.json());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load quotations",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadProformas = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/sales/proforma-invoices", { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to load Proforma invoices");
      setProformas(await response.json());
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load Proforma invoices"); }
    finally { setLoading(false); }
  };

  const loadApprovedDocuments = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/sales/approved-quotations", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to load confirmed sales documents");
      setApprovedDocuments(body.data || []);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load confirmed sales documents"); }
    finally { setLoading(false); }
  };

  const loadChallans = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/sales/challans", { credentials: "include" });
      const body = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(body.error || "Unable to load Delivery Challans");
      setChallans(body);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load Delivery Challans"); }
    finally { setLoading(false); }
  };

  const loadInvoices = async () => {
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/sales/invoices", { credentials: "include" });
      const body = await response.json().catch(() => ([]));
      if (!response.ok) throw new Error(body.error || "Unable to load Invoices");
      setInvoices(body);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load Invoices"); }
    finally { setLoading(false); }
  };

  const loadReturns = async () => {
    setLoading(true); setLoadError("");
    try { const response = await fetch("/api/sales/returns", { credentials: "include" }); const body = await response.json().catch(() => ([])); if (!response.ok) throw new Error(body.error || "Unable to load Sales Returns"); setReturns(body); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load Sales Returns"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === "Quotation") void loadQuotations();
    if (activeTab === "Proforma Invoice") void loadProformas();
    if (activeTab === "Sales Order") void loadApprovedDocuments();
    if (activeTab === "Delivery Challan") void loadChallans();
    if (activeTab === "Invoices") void loadInvoices();
    if (activeTab === "Sales Return") void loadReturns();
  }, [activeTab]);

  if (creatingType) {
    return (
      <Shell>
        <div className="h-[calc(100vh-72px)] w-full overflow-hidden bg-muted/30 p-6 md:p-8">
          <SalesDocumentForm
            type={creatingType}
            documentId={editingId}
            onCancel={() => {
              setCreatingType(null);
              setEditingId(null);
            }}
            onSaved={() => void (creatingType === "Proforma Invoice" ? loadProformas() : creatingType === "Delivery Challan" ? loadChallans() : creatingType === "Invoices" ? loadInvoices() : creatingType === "Sales Return" ? loadReturns() : loadQuotations())}
          />
        </div>
      </Shell>
    );
  }

  const canCreate = [
    "Quotation",
    "Proforma Invoice",
    "Delivery Challan",
    "Invoices",
    "Sales Return",
  ].includes(activeTab);
  const listedDocuments = activeTab === "Quotation" ? quotations : activeTab === "Proforma Invoice" ? proformas : activeTab === "Invoices" ? invoices : activeTab === "Sales Return" ? returns : challans;

  const salesOrderQueue = loading ? (
    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">Loading confirmed documents...</div>
  ) : loadError ? (
    <div className="rounded-xl border bg-card p-12 text-center text-destructive">{loadError}</div>
  ) : approvedDocuments.length === 0 ? (
    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">No confirmed Quotations or Proforma Invoices are ready.</div>
  ) : (
    <div className="space-y-4">
      {approvedDocuments.map(row => {
        const total = Number(row.grandTotal || 0);
        const hasStockIssue = Boolean(row.insufficientItems?.length);
        return (
          <Card key={`${row.source}-${row.id}`} className="rounded-xl border shadow-sm">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{row.documentNumber} · {row.customerCompany || row.clientName}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded border bg-muted px-2 py-0.5 font-semibold uppercase">{row.source}</span>
                    <span>{row.versionLabel}</span>
                    <span>·</span>
                    <span>Confirmed {row.customerApprovedAt ? new Date(row.customerApprovedAt).toLocaleDateString("en-IN") : ""}</span>
                  </div>
                </div>
                <div className="text-right"><div className="font-bold">Rs {Number.isFinite(total) ? total.toFixed(2) : "0.00"}</div><div className="text-xs font-medium text-emerald-700">Approved</div></div>
              </div>
              <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                {(row.items || []).map((item: any) => <div key={item.id || `${item.description}-${item.quantity}`}>{item.description || item.productName} — {Number(item.quantity || 0)} {item.uom || "Nos"}</div>)}
              </div>
              {hasStockIssue && <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{row.insufficientItems.map((item: any) => `${item.description}: requires ${item.required}, available ${item.available}`).join("; ")}</span></div>}
              <div className="mt-4"><Button disabled title="Work Order integration will be added next"><CirclePlay className="mr-2 h-4 w-4" />Start Work Order</Button></div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <Shell>
      <div className="min-h-[calc(100vh-72px)] bg-muted/30">
        <div className="border-b bg-card px-6">
          <div className="flex gap-1 overflow-x-auto">
            {SALES_SUBMODULES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium ${
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Sales Management
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage sales operations and dispatch tracking
              </p>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditingId(null);
                    setCreatingType(activeTab);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" /> Add {activeTab}
                </Button>
              )}
            </div>
          </div>

          {/* Content Area */}
          {activeTab === "Sales Order" ? salesOrderQueue : (activeTab === "Quotation" || activeTab === "Proforma Invoice" || activeTab === "Delivery Challan" || activeTab === "Invoices" || activeTab === "Sales Return") ? (
            <Card className="rounded-xl border border-border shadow-sm bg-card">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-12 text-center text-muted-foreground">
                    Loading quotations...
                  </div>
                ) : loadError ? (
                  <div className="p-12 text-center text-destructive">
                    {loadError}
                  </div>
                ) : listedDocuments.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    No {activeTab.toLowerCase()}s found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">{activeTab === "Quotation" ? "Quotation" : activeTab === "Proforma Invoice" ? "Proforma" : activeTab === "Invoices" ? "Invoice" : activeTab === "Sales Return" ? "Sales Return" : "Delivery Challan"}</th>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Revision</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Customer Response</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          {activeTab === "Invoices" && <th className="px-4 py-3 text-right">Paid</th>}
                          {activeTab === "Invoices" && <th className="px-4 py-3 text-right">Balance</th>}
                          {activeTab === "Invoices" && <th className="px-4 py-3">Payment</th>}
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {listedDocuments.map((row) => {
                          const numeric = (value: any) => { const parsed = Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
                          const total = numeric(row.grandTotal);
                          const isViewOnly = ["Approved", "Rejected", "Dispatched", "Received", "Credit Issued", "Paid", "Cancelled"].includes(row.status);
                          return (
                            <tr key={row.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-semibold">
                                {row.returnNumber || row.invoiceNumber || row.dcNumber || row.piNumber || row.quotationNumber || row.quoteNumber}
                              </td>
                              <td className="px-4 py-3">
                                {row.customerCompany || row.clientName}
                              </td>
                              <td className="px-4 py-3">
                                {String(row.returnDate || row.invoiceDate || row.dcDate || row.piDate || row.quotationDate || "").slice(0, 10)}
                              </td>
                              <td className="px-4 py-3">{row.versionLabel || "—"}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === "Sent" ? "bg-blue-100 text-blue-700" : row.status === "Approved" ? "bg-green-100 text-green-700" : row.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-medium">
                                {row.status === "Dispatched" ? <span className="text-emerald-700">Stock dispatched</span> : row.status === "Received" ? <span className="text-emerald-700">Goods received and restocked</span> : row.status === "Confirmed" ? <span className="text-blue-700">Awaiting receipt confirmation</span> : row.status === "Approved" ? (
                                  <span className="text-green-700">
                                    Confirmed
                                  </span>
                                ) : row.status === "Rejected" ? (
                                  <span className="text-red-700">Rejected</span>
                                ) : row.status === "Sent" ? (
                                  <span className="text-blue-700">
                                    Awaiting response
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    Available after sending
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold">
                                Rs{" "}
                                {Number.isFinite(total)
                                  ? total.toFixed(2)
                                  : "0.00"}
                              </td>
                              {activeTab === "Invoices" && <td className="px-4 py-3 text-right">Rs {numeric(row.amountPaid).toFixed(2)}</td>}
                              {activeTab === "Invoices" && <td className="px-4 py-3 text-right">Rs {numeric(row.balanceDue).toFixed(2)}</td>}
                              {activeTab === "Invoices" && <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{row.paymentStatus || "Unpaid"}</span></td>}
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title={`${isViewOnly ? "View" : "Edit"} ${activeTab.toLowerCase()}`}
                                    onClick={() => {
                                      setEditingId(Number(row.id));
                                      setCreatingType(activeTab);
                                    }}
                                  >
                                    {isViewOnly ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                  </Button>
                                  {!isViewOnly && <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={row.status === "Dispatched" || row.status === "Approved" || row.status === "Rejected" || row.status === "Paid" || row.status === "Cancelled"}
                                    title={`Delete ${activeTab.toLowerCase()}`}
                                    className="text-destructive"
                                    onClick={() => setDeleteTarget({ ...row, documentType: activeTab })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border border-border shadow-sm min-h-[400px] flex items-center justify-center bg-card">
              <CardContent className="p-8 text-center text-muted-foreground">
                {canCreate
                  ? `No ${activeTab.toLowerCase()}s found`
                  : `The ${activeTab} module will be implemented here`}
              </CardContent>
            </Card>
          )}

          <Dialog
            open={Boolean(deleteTarget)}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {deleteTarget?.documentType?.toLowerCase() || "quotation"}?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This removes {deleteTarget?.returnNumber || deleteTarget?.invoiceNumber || deleteTarget?.dcNumber || deleteTarget?.piNumber || deleteTarget?.quotationNumber} and its complete
                revision history.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    const response = await fetch(
                      `/api/sales/${deleteTarget.documentType === "Proforma Invoice" ? "proforma-invoices" : deleteTarget.documentType === "Delivery Challan" ? "challans" : deleteTarget.documentType === "Invoices" ? "invoices" : deleteTarget.documentType === "Sales Return" ? "returns" : "quotations"}/${deleteTarget.id}`,
                      { method: "DELETE", credentials: "include" },
                    );
                    if (response.ok) {
                      setDeleteTarget(null);
                      if (deleteTarget.documentType === "Proforma Invoice") await loadProformas(); else if (deleteTarget.documentType === "Delivery Challan") await loadChallans(); else if (deleteTarget.documentType === "Invoices") await loadInvoices(); else if (deleteTarget.documentType === "Sales Return") await loadReturns(); else await loadQuotations();
                    }
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Shell>
  );
}
