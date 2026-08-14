import { useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import {
  useListSpawnEntries,
  useCreateSpawnEntry,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListSpawnEntriesQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export default function Spawn() {
  const queryClient = useQueryClient();
  const { data: spawn, isLoading } = useListSpawnEntries();

  const createMutation = useCreateSpawnEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListSpawnEntriesQueryKey(),
        });
        setIsOpen(false);
      },
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const spawnPagination = useClientPagination(spawn ?? []);
  const [formData, setFormData] = useState({
    strainName: "",
    quantityKg: "",
    source: "",
    receivedAt: new Date().toISOString().slice(0, 16),
    expiresAt: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        strainName: formData.strainName,
        quantityKg: Number(formData.quantityKg),
        source: formData.source,
        receivedAt: new Date(formData.receivedAt).toISOString(),
        expiresAt: formData.expiresAt
          ? new Date(formData.expiresAt).toISOString()
          : null,
        notes: formData.notes || null,
      },
    });
  };

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Spawn Inventory
            </h1>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-sm font-medium h-9">
                <Plus className="w-4 h-4 mr-2" /> Log Receipt
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm border-border shadow-none max-w-md">
              <DialogHeader>
                <DialogTitle>Log Spawn Receipt</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Strain Name
                    </Label>
                    <Input
                      required
                      value={formData.strainName}
                      onChange={(e) =>
                        setFormData({ ...formData, strainName: e.target.value })
                      }
                      className="rounded-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Quantity (kg)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.quantityKg}
                      onChange={(e) =>
                        setFormData({ ...formData, quantityKg: e.target.value })
                      }
                      className="rounded-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Source / Supplier
                  </Label>
                  <Input
                    required
                    value={formData.source}
                    onChange={(e) =>
                      setFormData({ ...formData, source: e.target.value })
                    }
                    className="rounded-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Received Date
                    </Label>
                    <Input
                      type="datetime-local"
                      required
                      value={formData.receivedAt}
                      onChange={(e) =>
                        setFormData({ ...formData, receivedAt: e.target.value })
                      }
                      className="rounded-sm font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Expiry Date
                    </Label>
                    <Input
                      type="datetime-local"
                      value={formData.expiresAt}
                      onChange={(e) =>
                        setFormData({ ...formData, expiresAt: e.target.value })
                      }
                      className="rounded-sm font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Notes
                  </Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="rounded-sm"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full rounded-sm"
                >
                  Save Record
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-0">
            {false ? (
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
                        Qty (kg)
                      </th>
                      <th className="px-4 py-2 font-medium">Source</th>
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
                          {s.quantityKg}
                        </td>
                        <td className="px-4">{s.source}</td>
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
                          colSpan={6}
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
      </div>
    </Shell>
  );
}
