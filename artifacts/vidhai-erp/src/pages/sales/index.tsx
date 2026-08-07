import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SalesDocumentForm } from "./components/SalesDocumentForm";

import { FileText, FileMinus, ShoppingCart, Truck, FileSpreadsheet, Undo2 } from "lucide-react";

const SALES_SUBMODULES = [
  { id: "Quotation", label: "Quotation", icon: FileText },
  { id: "Proforma Invoice", label: "Proforma Invoice", icon: FileMinus },
  { id: "Sales Order", label: "Sales Order", icon: ShoppingCart },
  { id: "Delivery Challan", label: "Delivery Challan", icon: Truck },
  { id: "Invoices", label: "Invoices", icon: FileSpreadsheet },
  { id: "Sales Return", label: "Sales Return", icon: Undo2 }
];

export default function Sales() {
  const [activeTab, setActiveTab] = useState(SALES_SUBMODULES[0].id);
  const [creatingType, setCreatingType] = useState<string | null>(null);

  if (creatingType) {
    return (
      <Shell>
        <div className="min-h-[calc(100vh-72px)] bg-muted/30 p-6 md:p-8 w-full">
          <SalesDocumentForm type={creatingType} onCancel={() => setCreatingType(null)} />
        </div>
      </Shell>
    );
  }

  const canCreate = ["Quotation", "Proforma Invoice", "Delivery Challan", "Invoices", "Sales Return"].includes(activeTab);

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
              <h1 className="text-2xl font-bold text-foreground">Sales Management</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage sales operations and dispatch tracking
              </p>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button onClick={() => setCreatingType(activeTab)}>
                  <Plus className="w-4 h-4 mr-2" /> Add {activeTab}
                </Button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <Card className="rounded-xl border border-border shadow-sm min-h-[400px] flex items-center justify-center bg-card">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center h-full w-full">
              <h2 className="text-xl font-medium text-slate-700 mb-2">{activeTab}</h2>
              <p className="text-muted-foreground text-sm">
                {canCreate
                  ? `No ${activeTab.toLowerCase()}s found`
                  : `The ${activeTab} module will be implemented here`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
