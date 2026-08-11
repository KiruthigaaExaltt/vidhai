import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportBatchCosting,
  getGetReportBatchCostingQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, DollarSign } from "lucide-react";

const LOC_OPTS = [
  { value: "", label: "All Locations" },
  { value: "A", label: "Annur (A)" },
  { value: "B", label: "Ooty (B)" },
  { value: "C", label: "Coimbatore (C)" },
  { value: "D", label: "Lab (D)" },
];

export default function ReportBatchCosting() {
  const [, setLocation] = useLocation();
  const [batchIdStr, setBatchIdStr] = useState("");
  const [locationCode, setLocationCode] = useState("");

  const params = {
    ...(batchIdStr && !isNaN(Number(batchIdStr)) ? { batchId: Number(batchIdStr) } : {}),
    ...(locationCode ? { locationCode } : {}),
  };

  const { data, isLoading } = useGetReportBatchCosting(params, {
    query: { queryKey: getGetReportBatchCostingQueryKey(params) },
  });
  const report = data as any;
  const salesOrders: any[] = report?.salesOrders ?? [];
  const coimMaterials: any[] = report?.coimMaterials ?? [];
  const totalRevenue = Number(report?.totalRevenue ?? 0);
  const totalMaterialKg = Number(report?.totalMaterialKg ?? 0);

  const revByType: Record<string, number> = {};
  salesOrders.forEach((o: any) => {
    const k = o.productType ?? "other";
    revByType[k] = (revByType[k] ?? 0) + Number(o.totalValue ?? 0);
  });

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> Batch Costing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Revenue and material cost roll-up from Vidhai data. Labour/vehicle integration from Yugam is out of scope for this release.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Batch ID</Label>
            <Input
              type="number"
              value={batchIdStr}
              onChange={(e) => setBatchIdStr(e.target.value)}
              className="rounded-sm h-9 font-mono w-[120px]"
              placeholder="Any"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Location</Label>
            <select
              className="h-9 rounded-sm border border-border bg-background px-3 text-sm"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
            >
              {LOC_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total Revenue", value: totalRevenue > 0 ? `₹${totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—", cls: "text-primary" },
            { label: "Material Input", value: `${totalMaterialKg.toFixed(1)} kg`, cls: "" },
            { label: "Sales Orders", value: salesOrders.length, cls: "" },
          ].map((s) => (
            <Card key={s.label} className="rounded-sm border-border shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                <p className={`text-lg font-bold font-mono ${s.cls}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue by product type */}
        {Object.keys(revByType).length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue by Product Type</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Product Type</th>
                    <th className="px-4 py-2 font-medium text-right">Revenue (₹)</th>
                    <th className="px-4 py-2 font-medium text-right">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(revByType).map(([k, v]) => (
                    <tr key={k} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-medium capitalize">{k.replace("_", " ")}</td>
                      <td className="px-4 font-mono text-right font-semibold">{v > 0 ? `₹${v.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{salesOrders.filter((o: any) => o.productType === k).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Sales orders */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sales Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading…</div>
            ) : salesOrders.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No sales orders matching the selected filters.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Order Code</th>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Buyer</th>
                    <th className="px-4 py-2 font-medium text-right">Qty (kg)</th>
                    <th className="px-4 py-2 font-medium text-right">Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {salesOrders.map((o: any) => (
                    <tr key={o.id} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono text-xs">{o.orderCode}</td>
                      <td className="px-4 text-muted-foreground capitalize">{(o.productType ?? "—").replace("_", " ")}</td>
                      <td className="px-4 text-muted-foreground text-xs">{o.saleType?.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 text-muted-foreground">{o.buyerName ?? "—"}</td>
                      <td className="px-4 font-mono text-right">{o.qtyKg != null ? Number(o.qtyKg).toFixed(1) : "—"}</td>
                      <td className="px-4 font-mono text-right font-semibold">{o.totalValue != null && o.totalValue > 0 ? `₹${Number(o.totalValue).toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Coimbatore materials */}
        {coimMaterials.length > 0 && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Coimbatore Material Inputs</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="px-4 py-2 font-medium text-right">Qty (kg)</th>
                    <th className="px-4 py-2 font-medium">Batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coimMaterials.map((m: any, i) => (
                    <tr key={i} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4">{m.materialType ?? m.material ?? "—"}</td>
                      <td className="px-4 font-mono text-right">{m.qtyKg != null ? Number(m.qtyKg).toFixed(1) : "—"}</td>
                      <td className="px-4 font-mono text-xs text-muted-foreground">{m.batchCode ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Scope note */}
        <p className="text-xs text-muted-foreground border border-border rounded-sm px-4 py-3 bg-muted/30">
          <strong>Scope note:</strong> This report shows revenue from Vidhai sales orders and material inputs from Coimbatore.
          Actual labour and vehicle cost integration from the Yugam system is planned for a future release.
        </p>
      </div>
    </Shell>
  );
}
