import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

async function fetchGrowBagVault() {
  const response = await fetch("/api/grow-bags", { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Unable to load Grow Bag Vault");
  }
  return response.json();
}

export function GrowBagVaultPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["grow-bag-vault"],
    queryFn: fetchGrowBagVault,
  });
  const lots = (data as any[] | undefined) ?? [];
  const pagination = useClientPagination(lots);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    reference: "",
    bags: "",
  });

  const setField = (field: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const createExternalLot = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/grow-bags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: form.reference.trim(),
          bags: Number(form.bags),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Unable to create grow bag lot");
      toast.success("External grow bags added to Grow Bag Vault");
      setCreateOpen(false);
      setForm({ reference: "", bags: "" });
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create grow bag lot",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Grow Bag Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Finished bags from Annur production and bags purchased via GRN.
          </p>
        </div>
        <Button className="rounded-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create New Grow Bag Lot
        </Button>
      </div>

      <Card className="rounded-sm border-border shadow-none">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Lot / Batch</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Physical
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Reserved
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Available
                    </th>
                    <th className="px-4 py-2 font-medium">Origin</th>
                    <th className="px-4 py-2 font-medium">Source Type</th>
                    <th className="px-4 py-2 font-medium">Received</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagination.paginatedRows.map((lot: any) => (
                    <tr key={lot.id} className="hover:bg-muted/30 h-[36px]">
                      <td className="px-4 font-medium font-mono">
                        {lot.reference}
                      </td>
                      <td className="px-4 font-mono text-right">
                        {Number(lot.availableBags || 0)} bags
                      </td>
                      <td className="px-4 font-mono text-right text-amber-700">
                        {Number(lot.reservedBags || 0)} bags
                      </td>
                      <td className="px-4 font-mono text-right text-primary">
                        {Number(
                          lot.freeAvailableBags ?? lot.availableBags ?? 0,
                        )}{" "}
                        bags
                      </td>
                      <td className="px-4">
                        <Badge variant="outline">
                          {lot.originLabel ||
                            (lot.origin === "external"
                              ? "EXTERNAL"
                              : "INTERNAL")}
                        </Badge>
                      </td>
                      <td className="px-4 uppercase text-xs tracking-wider text-muted-foreground">
                        {lot.sourceType}
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {lot.stockDate
                          ? new Date(lot.stockDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-4">
                        <Badge
                          variant="outline"
                          className={`border-0 rounded-sm uppercase tracking-wider text-[10px] ${
                            lot.status === "available"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {lot.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {lots.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No grow bag vault lots yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPagination
                currentPage={pagination.currentPage}
                pageSize={pagination.pageSize}
                totalCount={pagination.totalCount}
                onPageChange={pagination.setCurrentPage}
                onPageSizeChange={pagination.setPageSize}
                loading={isLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg rounded-sm">
          <DialogHeader>
            <DialogTitle>Create External Grow Bag Lot</DialogTitle>
          </DialogHeader>
          <form onSubmit={createExternalLot} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reference / Lot *</Label>
                <Input
                  value={form.reference}
                  onChange={(e) => setField("reference", e.target.value)}
                  placeholder="EXT-0001"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bags *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.bags}
                  onChange={(e) => setField("bags", e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Create Lot"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
