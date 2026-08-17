import { useEffect, useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { Shell } from "@/components/layout/Shell";
import {
  Plus,
  Pencil,
  Trash2,
  CirclePlay,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [workOrderTemplates, setWorkOrderTemplates] = useState<any[]>([]);
  const [startTarget, setStartTarget] = useState<any | null>(null);
  const [workOrderTarget, setWorkOrderTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [workOrderSaving, setWorkOrderSaving] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState({
    templateId: "",
    quantity: "",
    uom: "Nos",
    expectedCompletionDate: "",
    convertToMm: false,
  });
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [paginationByTab, setPaginationByTab] = useState<Record<string, { page: number; size: number }>>({});
  const [listMeta, setListMeta] = useState({ totalCount: 0, totalPages: 0 });
  const paginationState = paginationByTab[activeTab] ?? { page: 1, size: 10 };
  const setListPagination = (next: Partial<typeof paginationState>) =>
    setPaginationByTab((current) => ({
      ...current,
      [activeTab]: { ...(current[activeTab] ?? paginationState), ...next },
    }));
  const pagedPath = (path: string) =>
    `${path}?skip=${(paginationState.page - 1) * paginationState.size}&limit=${paginationState.size}`;
  const acceptPage = (body: any, setter: (rows: any[]) => void) => {
    setter(body.data || []);
    setListMeta({
      totalCount: Number(body.totalCount || 0),
      totalPages: Number(body.totalPages || 0),
    });
  };

  const loadQuotations = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(pagedPath("/api/sales/quotations"), {
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load quotations");
      }
      acceptPage(await response.json(), setQuotations);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load quotations",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadProformas = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(pagedPath("/api/sales/proforma-invoices"), {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => ({}))).error ||
            "Unable to load Proforma invoices",
        );
      acceptPage(await response.json(), setProformas);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load Proforma invoices",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadApprovedDocuments = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/sales/approved-quotations", {
        credentials: "include",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          body.error || "Unable to load confirmed sales documents",
        );
      setApprovedDocuments(body.data || []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load confirmed sales documents",
      );
    } finally {
      setLoading(false);
    }
  };

  const openWorkOrderForm = (row: any) => {
    const quantity = (row.items || []).reduce(
      (sum: number, item: any) => sum + Number(item.quantity || 0),
      0,
    );
    setWorkOrderForm({
      templateId: "",
      quantity: String(quantity || 1),
      uom: row.items?.[0]?.uom || "Nos",
      expectedCompletionDate: "",
      convertToMm: false,
    });
    setWorkOrderTarget(row);
    setStartTarget(null);
  };

  const createWorkOrder = async () => {
    if (!workOrderTarget) return;
    setWorkOrderSaving(true);
    setLoadError("");
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDocumentType: workOrderTarget.source,
          sourceDocumentId: workOrderTarget.id,
          sourceDocumentNumber: workOrderTarget.documentNumber,
          clientId: workOrderTarget.clientId,
          clientName: workOrderTarget.clientName,
          productId:
            workOrderTarget.items?.[0]?.productId ||
            workOrderTarget.items?.[0]?.itemId,
          variantId: workOrderTarget.items?.[0]?.variantId,
          productionQuantity: workOrderForm.convertToMm
            ? Number(workOrderForm.quantity) * 304.8
            : Number(workOrderForm.quantity),
          productionUom: workOrderForm.convertToMm ? "mm" : workOrderForm.uom,
          workOrderTemplateId: workOrderForm.templateId
            ? Number(workOrderForm.templateId)
            : undefined,
          expectedCompletionDate:
            workOrderForm.expectedCompletionDate || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Unable to create Work Order");
      setWorkOrderTarget(null);
      await loadApprovedDocuments();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to create Work Order",
      );
    } finally {
      setWorkOrderSaving(false);
    }
  };

  const rejectApprovedDocument = async () => {
    if (!rejectTarget) return;
    setWorkOrderSaving(true);
    setLoadError("");
    try {
      const response = await fetch("/api/sales/approved-quotations/reject", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: rejectTarget.source,
          documentId: rejectTarget.id,
          rejectionReason,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Unable to reject document");
      setRejectTarget(null);
      setRejectionReason("");
      await loadApprovedDocuments();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to reject document",
      );
    } finally {
      setWorkOrderSaving(false);
    }
  };

  const loadChallans = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(pagedPath("/api/sales/challans"), {
        credentials: "include",
      });
      const body = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error(body.error || "Unable to load Delivery Challans");
      acceptPage(body, setChallans);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load Delivery Challans",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(pagedPath("/api/sales/invoices"), {
        credentials: "include",
      });
      const body = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error(body.error || "Unable to load Invoices");
      acceptPage(body, setInvoices);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load Invoices",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadReturns = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(pagedPath("/api/sales/returns"), {
        credentials: "include",
      });
      const body = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error(body.error || "Unable to load Sales Returns");
      acceptPage(body, setReturns);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load Sales Returns",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "Quotation") void loadQuotations();
    if (activeTab === "Proforma Invoice") void loadProformas();
    if (activeTab === "Sales Order") {
      void loadApprovedDocuments();
      void fetch("/api/work-orders/templates", { credentials: "include" })
        .then((response) => (response.ok ? response.json() : []))
        .then(setWorkOrderTemplates)
        .catch(() => setWorkOrderTemplates([]));
    }
    if (activeTab === "Delivery Challan") void loadChallans();
    if (activeTab === "Invoices") void loadInvoices();
    if (activeTab === "Sales Return") void loadReturns();
  }, [activeTab, paginationState.page, paginationState.size]);

  const listedDocuments =
    activeTab === "Quotation"
      ? quotations
      : activeTab === "Proforma Invoice"
        ? proformas
        : activeTab === "Invoices"
          ? invoices
          : activeTab === "Sales Return"
            ? returns
            : challans;

  if (creatingType) {
    return (
      <Shell>
        <div className="h-[calc(100svh-4rem)] min-w-0 w-full overflow-hidden bg-muted/30 p-4 sm:p-6 md:h-[calc(100vh-72px)] md:p-8">
          <SalesDocumentForm
            type={creatingType}
            documentId={editingId}
            onCancel={() => {
              setCreatingType(null);
              setEditingId(null);
            }}
            onSaved={() =>
              void (creatingType === "Proforma Invoice"
                ? loadProformas()
                : creatingType === "Delivery Challan"
                  ? loadChallans()
                  : creatingType === "Invoices"
                    ? loadInvoices()
                    : creatingType === "Sales Return"
                      ? loadReturns()
                      : loadQuotations())
            }
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

  const salesOrderQueue = loading ? (
    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
      Loading confirmed documents...
    </div>
  ) : loadError ? (
    <div className="rounded-xl border bg-card p-12 text-center text-destructive">
      {loadError}
    </div>
  ) : approvedDocuments.length === 0 ? (
    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
      No confirmed Quotations or Proforma Invoices are ready.
    </div>
  ) : (
    <div className="space-y-4">
      {approvedDocuments.map((row) => {
        const total = Number(row.grandTotal || 0);
        const hasStockIssue = Boolean(row.insufficientItems?.length);
        return (
          <Card
            key={`${row.source}-${row.id}`}
            className="rounded-xl border shadow-sm"
          >
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">
                    {row.documentNumber} ·{" "}
                    {row.customerCompany || row.clientName}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded border bg-muted px-2 py-0.5 font-semibold uppercase">
                      {row.source}
                    </span>
                    <span>{row.versionLabel}</span>
                    <span>·</span>
                    <span>
                      Confirmed{" "}
                      {row.customerApprovedAt
                        ? new Date(row.customerApprovedAt).toLocaleDateString(
                            "en-IN",
                          )
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    Rs {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                  </div>
                  <div className="text-xs font-medium text-emerald-700">
                    Approved
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                {(row.items || []).map((item: any) => (
                  <div key={item.id || `${item.description}-${item.quantity}`}>
                    {item.description || item.productName} —{" "}
                    {Number(item.quantity || 0)} {item.uom || "Nos"}
                  </div>
                ))}
              </div>
              {hasStockIssue && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {row.insufficientItems
                      .map(
                        (item: any) =>
                          `${item.description}: requires ${item.required}, available ${item.available}`,
                      )
                      .join("; ")}
                  </span>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button onClick={() => setStartTarget(row)}>
                  <CirclePlay className="mr-2 h-4 w-4" />
                  Start Work Order
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectTarget(row);
                    setRejectionReason("");
                  }}
                >
                  Reject
                </Button>
              </div>
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
          <div className="flex gap-1 overflow-x-auto overscroll-x-contain pb-px">
            {SALES_SUBMODULES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-4 text-sm font-medium sm:px-4 ${
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

        <div className="space-y-6 p-4 sm:p-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Sales Management
              </h1>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button
                  className="w-full sm:w-auto"
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
          {activeTab === "Sales Order" ? (
            salesOrderQueue
          ) : activeTab === "Quotation" ||
            activeTab === "Proforma Invoice" ||
            activeTab === "Delivery Challan" ||
            activeTab === "Invoices" ||
            activeTab === "Sales Return" ? (
            <Card className="rounded-xl border border-border shadow-sm bg-card">
              <CardContent className="p-0">
                {loading && listedDocuments.length === 0 ? (
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
                          <th className="px-4 py-3">
                            {activeTab === "Quotation"
                              ? "Quotation"
                              : activeTab === "Proforma Invoice"
                                ? "Proforma"
                                : activeTab === "Invoices"
                                  ? "Invoice"
                                  : activeTab === "Sales Return"
                                    ? "Sales Return"
                                    : "Delivery Challan"}
                          </th>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Revision</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Customer Response</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          {activeTab === "Invoices" && (
                            <th className="px-4 py-3 text-right">Paid</th>
                          )}
                          {activeTab === "Invoices" && (
                            <th className="px-4 py-3 text-right">Balance</th>
                          )}
                          {activeTab === "Invoices" && (
                            <th className="px-4 py-3">Payment</th>
                          )}
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {listedDocuments.map((row) => {
                          const numeric = (value: any) => {
                            const parsed = Number(
                              value?.$numberDecimal ??
                                value?.toString?.() ??
                                value ??
                                0,
                            );
                            return Number.isFinite(parsed) ? parsed : 0;
                          };
                          const total = numeric(row.grandTotal);
                          const isViewOnly = [
                            "Approved",
                            "Rejected",
                            "Dispatched",
                            "Received",
                            "Credit Issued",
                            "Paid",
                            "Cancelled",
                          ].includes(row.status);
                          return (
                            <tr key={row.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-semibold">
                                {row.returnNumber ||
                                  row.invoiceNumber ||
                                  row.dcNumber ||
                                  row.piNumber ||
                                  row.quotationNumber ||
                                  row.quoteNumber}
                              </td>
                              <td className="px-4 py-3">
                                {row.customerCompany || row.clientName}
                              </td>
                              <td className="px-4 py-3">
                                {String(
                                  row.returnDate ||
                                    row.invoiceDate ||
                                    row.dcDate ||
                                    row.piDate ||
                                    row.quotationDate ||
                                    "",
                                ).slice(0, 10)}
                              </td>
                              <td className="px-4 py-3">
                                {row.versionLabel || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === "Sent" ? "bg-blue-100 text-blue-700" : row.status === "Approved" ? "bg-green-100 text-green-700" : row.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-medium">
                                {row.status === "Dispatched" ? (
                                  <span className="text-emerald-700">
                                    Stock dispatched
                                  </span>
                                ) : row.status === "Received" ? (
                                  <span className="text-emerald-700">
                                    Goods received and restocked
                                  </span>
                                ) : row.status === "Confirmed" ? (
                                  <span className="text-blue-700">
                                    Awaiting receipt confirmation
                                  </span>
                                ) : row.status === "Approved" ? (
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
                              {activeTab === "Invoices" && (
                                <td className="px-4 py-3 text-right">
                                  Rs {numeric(row.amountPaid).toFixed(2)}
                                </td>
                              )}
                              {activeTab === "Invoices" && (
                                <td className="px-4 py-3 text-right">
                                  Rs {numeric(row.balanceDue).toFixed(2)}
                                </td>
                              )}
                              {activeTab === "Invoices" && (
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                    {row.paymentStatus || "Unpaid"}
                                  </span>
                                </td>
                              )}
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
                                    {isViewOnly ? (
                                      <Eye className="h-4 w-4" />
                                    ) : (
                                      <Pencil className="h-4 w-4" />
                                    )}
                                  </Button>
                                  {!isViewOnly && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={
                                        row.status === "Dispatched" ||
                                        row.status === "Approved" ||
                                        row.status === "Rejected" ||
                                        row.status === "Paid" ||
                                        row.status === "Cancelled"
                                      }
                                      title={`Delete ${activeTab.toLowerCase()}`}
                                      className="text-destructive"
                                      onClick={() =>
                                        setDeleteTarget({
                                          ...row,
                                          documentType: activeTab,
                                        })
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
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
              <DataPagination
                currentPage={paginationState.page}
                pageSize={paginationState.size}
                totalCount={listMeta.totalCount}
                totalPages={listMeta.totalPages}
                onPageChange={(page) => setListPagination({ page })}
                onPageSizeChange={(size) => setListPagination({ size, page: 1 })}
                loading={loading}
              />
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
            open={Boolean(startTarget)}
            onOpenChange={(open) => {
              if (!open) setStartTarget(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Start Work Order?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Start a Work Order for {startTarget?.documentNumber}? Stock will
                be validated before tasks and material reservations are created.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStartTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={() => openWorkOrderForm(startTarget)}>
                  Continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(workOrderTarget)}
            onOpenChange={(open) => {
              if (!open && !workOrderSaving) setWorkOrderTarget(null);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  Create Work Order — {workOrderTarget?.documentNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Workflow Template</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={workOrderForm.templateId}
                    onChange={(event) =>
                      setWorkOrderForm({
                        ...workOrderForm,
                        templateId: event.target.value,
                      })
                    }
                  >
                    <option value="">Default Production Workflow</option>
                    {workOrderTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Production Quantity</Label>
                  <Input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={workOrderForm.quantity}
                    onChange={(event) =>
                      setWorkOrderForm({
                        ...workOrderForm,
                        quantity: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Production UOM</Label>
                  <Input
                    value={workOrderForm.uom}
                    onChange={(event) =>
                      setWorkOrderForm({
                        ...workOrderForm,
                        uom: event.target.value,
                      })
                    }
                  />
                </div>
                {/^(ft|feet|foot)$/i.test(workOrderForm.uom.trim()) && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={workOrderForm.convertToMm}
                      onChange={(event) =>
                        setWorkOrderForm({
                          ...workOrderForm,
                          convertToMm: event.target.checked,
                        })
                      }
                    />
                    Convert feet to millimetres before production
                  </label>
                )}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Expected Completion Date</Label>
                  <Input
                    type="date"
                    value={workOrderForm.expectedCompletionDate}
                    onChange={(event) =>
                      setWorkOrderForm({
                        ...workOrderForm,
                        expectedCompletionDate: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={workOrderSaving}
                  onClick={() => setWorkOrderTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    workOrderSaving || Number(workOrderForm.quantity) <= 0
                  }
                  onClick={() => void createWorkOrder()}
                >
                  {workOrderSaving ? "Creating..." : "Create & Activate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(rejectTarget)}
            onOpenChange={(open) => {
              if (!open && !workOrderSaving) setRejectTarget(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  Reject {rejectTarget?.documentNumber}?
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>Rejection Reason</Label>
                <Input
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="Enter the reason"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={workOrderSaving}
                  onClick={() => setRejectTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={workOrderSaving || !rejectionReason.trim()}
                  onClick={() => void rejectApprovedDocument()}
                >
                  {workOrderSaving ? "Rejecting..." : "Reject"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={Boolean(deleteTarget)}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Delete{" "}
                  {deleteTarget?.documentType?.toLowerCase() || "quotation"}?
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This removes{" "}
                {deleteTarget?.returnNumber ||
                  deleteTarget?.invoiceNumber ||
                  deleteTarget?.dcNumber ||
                  deleteTarget?.piNumber ||
                  deleteTarget?.quotationNumber}{" "}
                and its complete revision history.
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
                      if (deleteTarget.documentType === "Proforma Invoice")
                        await loadProformas();
                      else if (deleteTarget.documentType === "Delivery Challan")
                        await loadChallans();
                      else if (deleteTarget.documentType === "Invoices")
                        await loadInvoices();
                      else if (deleteTarget.documentType === "Sales Return")
                        await loadReturns();
                      else await loadQuotations();
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
