import { useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useListSpawnEntries } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
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

export function SpawnVaultPanel() {
  const { data: spawn, isLoading, refetch } = useListSpawnEntries();
  const spawnPagination = useClientPagination(spawn ?? []);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    strainName: "",
    quantityKg: "",
  });

  const setField = (field: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const createExternalSpawn = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/spawn", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantityKg: Number(form.quantityKg) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Unable to create external spawn");
      toast.success("External spawn added to Spawn Vault");
      setCreateOpen(false);
      setForm({
        strainName: "",
        quantityKg: "",
      });
      await refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create external spawn",
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
            Spawn Inventory
          </h1>
        </div>
        <Button className="rounded-sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create New Spawn
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
                    <th className="px-4 py-2 font-medium">Strain</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Physical
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Reserved
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Free Available
                    </th>
                    <th className="px-4 py-2 font-medium">Origin</th>
                    <th className="px-4 py-2 font-medium">Source / Lot</th>
                    <th className="px-4 py-2 font-medium">Received</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {spawnPagination.paginatedRows.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 h-[36px]">
                      <td className="px-4 font-medium">{s.strainName}</td>
                      <td className="px-4 font-mono text-right">
                        {s.quantityKg} kg
                      </td>
                      <td className="px-4 font-mono text-right text-amber-700">
                        {(s as any).reservedQuantityKg ?? 0} kg
                      </td>
                      <td className="px-4 font-mono text-right text-primary">
                        {(s as any).freeAvailableQuantityKg ?? s.quantityKg} kg
                      </td>
                      <td className="px-4">
                        <Badge variant="outline">
                          {(s as any).sourceType ?? "LEGACY"}
                        </Badge>
                      </td>
                      <td className="px-4">
                        {(s as any).sourceReference ||
                          (s as any).supplierLot ||
                          s.source}
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {new Date(s.receivedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {s.expiresAt
                          ? new Date(s.expiresAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-4">
                        <Badge
                          variant="outline"
                          className={`border-0 rounded-sm uppercase tracking-wider text-[10px] ${
                            s.status === "available"
                              ? "bg-primary/10 text-primary"
                              : s.status === "expired"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {spawn?.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No spawn records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPagination
                currentPage={spawnPagination.currentPage}
                pageSize={spawnPagination.pageSize}
                totalCount={spawnPagination.totalCount}
                onPageChange={spawnPagination.setCurrentPage}
                onPageSizeChange={spawnPagination.setPageSize}
                loading={isLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg rounded-sm">
          <DialogHeader>
            <DialogTitle>Create New Spawn</DialogTitle>
          </DialogHeader>
          <form onSubmit={createExternalSpawn} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Strain Name *</Label>
                <Input
                  value={form.strainName}
                  onChange={(e) => setField("strainName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity Produced (kg) *</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={form.quantityKg}
                  onChange={(e) => setField("quantityKg", e.target.value)}
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
                {saving ? "Saving..." : "Create Spawn"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Spawn() {
  return (
    <Shell>
      <div className="p-4 sm:p-6 md:p-8">
        <SpawnVaultPanel />
      </div>
    </Shell>
  );
}
