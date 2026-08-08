import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

  useEffect(() => {
    if (activeTab === "Quotation") void loadQuotations();
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
            onSaved={() => void loadQuotations()}
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
          {activeTab === "Quotation" ? (
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
                ) : quotations.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    No quotations found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Quotation</th>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Revision</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Customer Response</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {quotations.map((row) => {
                          const total = Number(row.grandTotal);
                          return (
                            <tr key={row.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-semibold">
                                {row.quotationNumber || row.quoteNumber}
                              </td>
                              <td className="px-4 py-3">
                                {row.customerCompany || row.clientName}
                              </td>
                              <td className="px-4 py-3">
                                {String(row.quotationDate || "").slice(0, 10)}
                              </td>
                              <td className="px-4 py-3">{row.versionLabel}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-medium ${row.status === "Sent" ? "bg-blue-100 text-blue-700" : row.status === "Approved" ? "bg-green-100 text-green-700" : row.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs font-medium">
                                {row.status === "Approved" ? (
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
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="Edit quotation"
                                    onClick={() => {
                                      setEditingId(Number(row.id));
                                      setCreatingType("Quotation");
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="Delete quotation"
                                    className="text-destructive"
                                    onClick={() => setDeleteTarget(row)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
                <DialogTitle>Delete quotation?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This removes {deleteTarget?.quotationNumber} and its complete
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
                      `/api/sales/quotations/${deleteTarget.id}`,
                      { method: "DELETE", credentials: "include" },
                    );
                    if (response.ok) {
                      setDeleteTarget(null);
                      await loadQuotations();
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
