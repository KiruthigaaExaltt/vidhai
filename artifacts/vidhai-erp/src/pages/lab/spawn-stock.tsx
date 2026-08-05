import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { ArrowRight, PackageSearch } from "lucide-react";

/**
 * This page has been retired. External spawn purchases and sales now go
 * through the central Inventory → Stock Movements flow (Inward / Outward),
 * keeping all stock in one unified pool.
 */
export default function SpawnStockRedirect() {
  const [, setLocation] = useLocation();

  return (
    <Shell>
      <div className="p-8 md:p-16 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <PackageSearch className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">Spawn Stock moved to Inventory</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            External spawn purchases and outward sales are now tracked centrally in the
            Inventory module under <strong>Stock Movements</strong>. Use{" "}
            <em>Inward (GRN)</em> for purchases and <em>Outward</em> for sales. This keeps
            a single unified stock pool for spawn across all sources.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button onClick={() => setLocation("/inventory")} className="rounded-sm">
            Go to Inventory <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" onClick={() => setLocation("/lab/batches")} className="rounded-sm">
            Back to Spawn Batches
          </Button>
        </div>
      </div>
    </Shell>
  );
}
