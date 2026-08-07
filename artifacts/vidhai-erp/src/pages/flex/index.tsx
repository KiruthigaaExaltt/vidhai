import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, RotateCcw, FileCheck2 } from "lucide-react";
import { FlexTabs } from "./FlexTabs";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface FlexVendorSummary {
  id: number;
  name: string;
  spend: number;
  onTimePercent: number;
  returns: number;
}

interface FlexActivity {
  id: number;
  title: string;
  timestamp: string;
  status: string;
}

interface FlexDashboardData {
  pendingPurchaseRequests: number;
  openVendorResponses: number;
  pendingPOs: number;
  pendingGRNs: number;
  unpaidInvoices: number;
  totalSpend: number;
  totalSpendChangePercent: number;
  purchaseReturns: number;
  activeVendors: number;
  topVendors: FlexVendorSummary[];
  recentActivities: FlexActivity[];
}

async function fetchFlexDashboard(): Promise<FlexDashboardData> {
  const res = await fetch(`${BASE}/api/flex/dashboard`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load Flex dashboard");
  return res.json();
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="rounded-md border-border shadow-sm">
      <CardContent className="p-5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function VendorRow({ vendor }: { vendor: FlexVendorSummary }) {
  return (
    <div className="py-3 border-b last:border-b-0 border-border">
      <div className="font-semibold text-sm">{vendor.name}</div>
      <div className="mt-1.5 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Spend</span>
          <span className="text-foreground">₹{vendor.spend.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>On-time</span>
          <span className="text-foreground">{vendor.onTimePercent}%</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Returns</span>
          <span className="text-foreground">{vendor.returns}</span>
        </div>
      </div>
    </div>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  Submitted: "outline",
  Issued: "secondary",
  Paid: "default",
  Complete: "default",
  Completed: "secondary",
  Closed: "outline",
};

function ActivityRow({ activity }: { activity: FlexActivity }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0 border-border">
      <div>
        <div className="font-semibold text-sm">{activity.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{activity.timestamp}</div>
      </div>
      <Badge variant={STATUS_VARIANT[activity.status] ?? "outline"} className="rounded-full">
        {activity.status}
      </Badge>
    </div>
  );
}
export default function FlexDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["get", "/api/flex/dashboard"],
    queryFn: fetchFlexDashboard,
  });

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
        <FlexTabs />

        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
            Procurement Control Tower
          </h1>
        </div>

        {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {isError && <div className="text-sm text-destructive">Couldn't load the dashboard. Try again.</div>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Pending Purchase Requests" value={data.pendingPurchaseRequests} />
              <StatCard label="Open Vendor Responses" value={data.openVendorResponses} />
              <StatCard label="Pending POs" value={data.pendingPOs} />
              <StatCard label="Pending GRNs" value={data.pendingGRNs} />
              <StatCard label="Unpaid Invoices" value={data.unpaidInvoices} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="rounded-md border-border shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Spend</div>
                    <div className="text-xl font-bold">₹{data.totalSpend.toLocaleString("en-IN")}</div>
                    <div className="text-xs text-muted-foreground">
                      {data.totalSpendChangePercent}% vs last month
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-md border-border shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Purchase Returns</div>
                    <div className="text-xl font-bold">{data.purchaseReturns}</div>
                    <div className="text-xs text-muted-foreground">
                      {data.purchaseReturns === 0 ? "No returns recorded" : `${data.purchaseReturns} recorded`}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-md border-border shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active Vendors</div>
                    <div className="text-xl font-bold">{data.activeVendors}</div>
                    <div className="text-xs text-muted-foreground">{data.activeVendors} tracked in analytics</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="rounded-md border-border shadow-sm">
                <CardContent className="p-5">
                  <div className="font-semibold mb-1">Top Vendors</div>
                  {data.topVendors.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No vendor activity yet.</div>
                  ) : (
                    data.topVendors.map((v) => <VendorRow key={v.id} vendor={v} />)
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-md border-border shadow-sm">
                <CardContent className="p-5">
                  <div className="font-semibold mb-1">Recent Activities</div>
                  {data.recentActivities.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No recent activity.</div>
                  ) : (
                    data.recentActivities.map((a) => <ActivityRow key={a.id} activity={a} />)
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}