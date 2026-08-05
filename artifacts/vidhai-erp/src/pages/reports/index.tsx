import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart2,
  TrendingUp,
  PackageSearch,
  Truck,
  Fuel,
  DollarSign,
  ChevronRight,
  Sprout,
} from "lucide-react";

const REPORTS = [
  {
    key: "batch-summary",
    title: "Batch Summary",
    description: "All batches across all four locations — status, stage, bag counts.",
    icon: PackageSearch,
    color: "bg-teal-50 text-teal-600",
  },
  {
    key: "monthly-production",
    title: "Monthly Production",
    description: "Mushroom harvest (kg) and grow bags produced, by month.",
    icon: BarChart2,
    color: "bg-violet-50 text-violet-600",
  },
  {
    key: "quality-trend",
    title: "Quality Trend",
    description: "Average mushroom weight vs ~20 g benchmark, per harvest.",
    icon: TrendingUp,
    color: "bg-amber-50 text-amber-600",
  },
  {
    key: "vehicle-utilization",
    title: "Vehicle Utilization",
    description: "Hours worked and run count per vehicle over the period.",
    icon: Truck,
    color: "bg-sky-50 text-sky-600",
  },
  {
    key: "fuel-consumption",
    title: "Fuel Consumption",
    description: "Litres and cost per vehicle, with per-fill log breakdown.",
    icon: Fuel,
    color: "bg-orange-50 text-orange-600",
  },
  {
    key: "batch-costing",
    title: "Batch Costing",
    description: "Revenue and material cost roll-up per batch (Vidhai data only).",
    icon: DollarSign,
    color: "bg-green-50 text-green-600",
  },
  {
    key: "annur-batch-yield",
    title: "Annur Batch Yield",
    description: "Total mushroom yield per Annur grow-bag batch, rolled up across all Ooty rooms.",
    icon: Sprout,
    color: "bg-primary/10 text-primary",
  },
];

export default function ReportsLanding() {
  const [, setLocation] = useLocation();
  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Production, quality, fleet, and financial summaries across all Nilgiri Farm Produce locations.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Card
                key={r.key}
                className="rounded-sm border-border shadow-none cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setLocation(`/reports/${r.key}`)}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`p-2.5 rounded-sm ${r.color} shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
