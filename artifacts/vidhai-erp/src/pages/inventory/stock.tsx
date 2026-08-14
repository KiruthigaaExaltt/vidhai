import { useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  useCreateInventoryAdjustment,
  useListMaterials,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { getListInventoryQueryKey } from "@workspace/api-client-react";

export default function Stock() {
  const queryClient = useQueryClient();
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);
  const stockQuery = useQuery({
    queryKey: ["inventory-stock-paged", stockPage, stockPageSize],
    queryFn: async () => {
      const response = await fetch(`/api/inventory?skip=${(stockPage - 1) * stockPageSize}&limit=${stockPageSize}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load inventory");
      return response.json() as Promise<{ data: any[]; totalCount: number; totalPages: number }>;
    },
    placeholderData: keepPreviousData,
  });
  const inventory = stockQuery.data?.data ?? [];
  const isLoading = stockQuery.isLoading || stockQuery.isFetching;
  const { data: materials } = useListMaterials();

  const createMutation = useCreateInventoryAdjustment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["inventory-stock-paged"] });
        setIsOpen(false);
      },
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    materialId: "",
    quantityDelta: "",
    reason: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        materialId: Number(formData.materialId),
        quantityDelta: Number(formData.quantityDelta),
        reason: formData.reason,
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
              Stock Levels
            </h1>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-sm font-medium h-9">
                <Plus className="w-4 h-4 mr-2" /> Add/Remove Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm border-border shadow-none max-w-md">
              <DialogHeader>
                <DialogTitle>Stock Adjustment</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Material
                  </Label>
                  <Select
                    value={formData.materialId}
                    onValueChange={(v) =>
                      setFormData({ ...formData, materialId: v })
                    }
                  >
                    <SelectTrigger className="rounded-sm">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.name} ({m.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Quantity Delta (+ for receive, - for consume)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={formData.quantityDelta}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantityDelta: e.target.value,
                      })
                    }
                    className="rounded-sm font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Reason
                  </Label>
                  <Select
                    value={formData.reason}
                    onValueChange={(v) =>
                      setFormData({ ...formData, reason: v })
                    }
                  >
                    <SelectTrigger className="rounded-sm">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receipt">
                        Receipt (Purchase)
                      </SelectItem>
                      <SelectItem value="consumption">
                        Consumption (Batch)
                      </SelectItem>
                      <SelectItem value="audit">Audit Adjustment</SelectItem>
                      <SelectItem value="waste">Waste/Spoilage</SelectItem>
                    </SelectContent>
                  </Select>
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
                  disabled={
                    createMutation.isPending ||
                    !formData.materialId ||
                    !formData.reason
                  }
                  className="w-full rounded-sm"
                >
                  Submit Adjustment
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
                      <th className="px-4 py-2 font-medium">Material</th>
                      <th className="px-4 py-2 font-medium">Unit</th>
                      <th className="px-4 py-2 font-medium text-right">
                        Stock on Hand
                      </th>
                      <th className="px-4 py-2 font-medium text-right">
                        Last Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inventory.map((inv) => (
                      <tr key={inv.id} className="hover:bg-muted/30 h-[36px]">
                        <td className="px-4 font-medium">{inv.materialName}</td>
                        <td className="px-4 text-muted-foreground">
                          {inv.unit}
                        </td>
                        <td className="px-4 font-mono text-right font-semibold">
                          {inv.quantityOnHand}
                        </td>
                        <td className="px-4 font-mono text-right text-muted-foreground">
                          {new Date(inv.lastUpdated).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {inventory?.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-6 text-center text-muted-foreground"
                        >
                          No inventory records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <DataPagination
                  currentPage={stockPage}
                  pageSize={stockPageSize}
                  totalCount={Number(stockQuery.data?.totalCount || 0)}
                  totalPages={Number(stockQuery.data?.totalPages || 0)}
                  onPageChange={setStockPage}
                  onPageSizeChange={(size) => { setStockPageSize(size); setStockPage(1); }}
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
