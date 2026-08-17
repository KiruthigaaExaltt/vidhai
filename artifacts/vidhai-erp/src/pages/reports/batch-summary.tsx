import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetReportBatchSummary,
  getGetReportBatchSummaryQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, PackageSearch } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary/10 text-primary border-0",
  completed: "bg-green-50 text-green-700 border-0",
  failed: "bg-red-50 text-red-600 border-0",
  on_hold: "bg-amber-50 text-amber-700 border-0",
};

const LOC_OPTS = [
  { value: "", label: "All Locations" },
  { value: "A", label: "Annur (A)" },
  { value: "B", label: "Ooty (B)" },
  { value: "C", label: "Coimbatore (C)" },
  { value: "D", label: "Lab (D)" },
];

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReportBatchSummary() {
  const [, setLocation] = useLocation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locationCode, setLocationCode] = useState("");

  const params = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(locationCode ? { locationCode } : {}),
  };

  const { data, isLoading } = useGetReportBatchSummary(params, {
    query: { queryKey: getGetReportBatchSummaryQueryKey(params) },
  });
  const report = data as any;
  const batches: any[] = report?.batches ?? [];

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:p-8">
        <Button variant="ghost" onClick={() => setLocation("/reports")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Reports
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackageSearch className="w-6 h-6 text-primary" /> Batch Summary
          </h1>
          <p className="text-sm text-muted-foreground mt-1">All batches across all four locations with current status and stage.</p>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 items-end gap-3 sm:flex sm:flex-wrap">
          <div className="space-y-1">
            <Label className="block text-[11px] uppercase tracking-wider text-muted-foreground">Location</Label>
            <select
              className="h-9 w-full rounded-sm border border-border bg-background px-3 text-sm sm:w-auto"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
            >
              {LOC_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full rounded-sm font-mono sm:w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full rounded-sm font-mono sm:w-[150px]" />
          </div>
        </div>

        {/* Summary stats */}
        {report && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total", value: report.total },
              { label: "Active", value: report.active, cls: "text-primary" },
              { label: "Completed", value: report.completed, cls: "text-green-600" },
              { label: "Failed", value: report.failed, cls: "text-red-600" },
              { label: "On Hold", value: report.onHold, cls: "text-amber-600" },
            ].map((s) => (
              <Card key={s.label} className="rounded-sm border-border shadow-none">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold font-mono ${s.cls ?? ""}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Batches table */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading…</div>
            ) : batches.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">No batches found for selected filters.</div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Batch Code</th>
                    <th className="px-4 py-2 font-medium">Location</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Target Bags</th>
                    <th className="px-4 py-2 font-medium text-right">Actual Bags</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((b: any) => (
                    <tr key={b.id} className="h-[36px] hover:bg-muted/20">
                      <td className="px-4 font-mono font-semibold">{b.batchCode}</td>
                      <td className="px-4 text-muted-foreground">{b.locationName} ({b.locationCode})</td>
                      <td className="px-4 text-xs text-muted-foreground font-mono">{b.currentStage?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="px-4">
                        <Badge variant="outline" className={`rounded-sm text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[b.status] ?? "bg-muted text-muted-foreground border-0"}`}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-4 font-mono text-right text-muted-foreground">{b.targetBags ?? "—"}</td>
                      <td className="px-4 font-mono text-right">{b.actualBags ?? "—"}</td>
                      <td className="px-4 font-mono text-muted-foreground text-xs">{fmt(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
