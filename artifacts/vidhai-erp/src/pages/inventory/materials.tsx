import { useState } from "react";
import { 
  useListInventory, useListMaterials, useCreateInventoryAdjustment, 
  useListInventoryMovements, useCreateInventoryMovement, useListLocations 
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, ArrowRightLeft, Plus, Image as ImageIcon, IndianRupee } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function Inventory() {
  const queryClient = useQueryClient();
  
  // Queries
  const { data: inventory, isLoading: isInvLoading } = useListInventory();
  const { data: materials } = useListMaterials();
  const { data: movements, isLoading: isMovLoading } = useListInventoryMovements();
  const { data: locations } = useListLocations();

  // Mutations
  const createAdjustment = useCreateInventoryAdjustment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        setIsAdjOpen(false);
        toast.success("Stock adjusted successfully");
      }
    }
  });

  const createMovement = useCreateInventoryMovement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
        setIsMovOpen(false);
        toast.success("Transfer recorded successfully");
      }
    }
  });

  // State
  const [isAdjOpen, setIsAdjOpen] = useState(false);
  const [isMovOpen, setIsMovOpen] = useState(false);
  
  const [adjForm, setAdjForm] = useState({ materialId: "", quantityDelta: "", reason: "receipt", notes: "" });
  const [movForm, setMovForm] = useState({ materialId: "", fromLocationId: "", toLocationId: "", quantityKg: "", reason: "", notes: "" });

  const handleAdjSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAdjustment.mutate({ 
      data: { 
        materialId: Number(adjForm.materialId), 
        quantityDelta: Number(adjForm.quantityDelta),
        reason: adjForm.reason,
        notes: adjForm.notes || null
      } 
    });
  };

  const handleMovSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMovement.mutate({
      data: {
        materialId: Number(movForm.materialId),
        fromLocationId: movForm.fromLocationId ? Number(movForm.fromLocationId) : null,
        toLocationId: movForm.toLocationId ? Number(movForm.toLocationId) : null,
        quantityKg: Number(movForm.quantityKg),
        reason: movForm.reason || null,
        notes: movForm.notes || null
      }
    });
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display">Inventory</h1>
            <p className="text-base text-muted-foreground mt-1">Manage global materials, stock levels, and transfers</p>
          </div>
          <div className="flex gap-3">
            <Dialog open={isMovOpen} onOpenChange={setIsMovOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-sm shadow-sm h-10 px-4">
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Transfer
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm shadow-xl max-w-md">
                <DialogHeader>
                  <DialogTitle>Stock Transfer</DialogTitle>
                  <DialogDescription>Move inventory between locations</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleMovSubmit} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Material</Label>
                    <Select value={movForm.materialId} onValueChange={v => setMovForm({ ...movForm, materialId: v })}>
                      <SelectTrigger className="rounded-sm h-10">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials?.map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
                      <Select value={movForm.fromLocationId} onValueChange={v => setMovForm({ ...movForm, fromLocationId: v })}>
                        <SelectTrigger className="rounded-sm h-10">
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations?.map(l => (
                            <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                      <Select value={movForm.toLocationId} onValueChange={v => setMovForm({ ...movForm, toLocationId: v })}>
                        <SelectTrigger className="rounded-sm h-10">
                          <SelectValue placeholder="Destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations?.map(l => (
                            <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                    <Input type="number" step="0.01" required value={movForm.quantityKg} onChange={e => setMovForm({ ...movForm, quantityKg: e.target.value })} className="rounded-sm font-mono h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
                    <Input value={movForm.reason} onChange={e => setMovForm({ ...movForm, reason: e.target.value })} className="rounded-sm h-10" placeholder="e.g. Production shortage" />
                  </div>
                  <div className="pt-2 border-t">
                    <Button type="submit" disabled={createMovement.isPending || !movForm.materialId} className="w-full rounded-sm h-10 mt-2">Execute Transfer</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isAdjOpen} onOpenChange={setIsAdjOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-sm shadow-sm h-10 px-4">
                  <Plus className="w-4 h-4 mr-2" /> Adjust Stock
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm shadow-xl max-w-md">
                <DialogHeader>
                  <DialogTitle>Stock Adjustment</DialogTitle>
                  <DialogDescription>Record receipts or manual corrections</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdjSubmit} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Material</Label>
                    <Select value={adjForm.materialId} onValueChange={v => setAdjForm({ ...adjForm, materialId: v })}>
                      <SelectTrigger className="rounded-sm h-10">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials?.map(m => (
                          <SelectItem key={m.id} value={m.id.toString()}>{m.name} ({m.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Qty Delta</Label>
                      <Input type="number" step="0.01" required value={adjForm.quantityDelta} onChange={e => setAdjForm({ ...adjForm, quantityDelta: e.target.value })} className="rounded-sm font-mono h-10" placeholder="+/- amount" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
                      <Select value={adjForm.reason} onValueChange={v => setAdjForm({ ...adjForm, reason: v })}>
                        <SelectTrigger className="rounded-sm h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="receipt">Receipt (Purchase)</SelectItem>
                          <SelectItem value="consumption">Consumption</SelectItem>
                          <SelectItem value="audit">Audit Adjustment</SelectItem>
                          <SelectItem value="waste">Waste/Spoilage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                    <Input value={adjForm.notes} onChange={e => setAdjForm({ ...adjForm, notes: e.target.value })} className="rounded-sm h-10" />
                  </div>
                  <div className="pt-2 border-t">
                    <Button type="submit" disabled={createAdjustment.isPending || !adjForm.materialId} className="w-full rounded-sm h-10 mt-2">Submit Adjustment</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="catalog" className="w-full">
          <TabsList className="w-full justify-start rounded-sm border-b border-border bg-transparent p-0 mb-6">
            <TabsTrigger value="catalog" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-medium">
              Product Catalog
            </TabsTrigger>
            <TabsTrigger value="transfers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 pb-3 pt-2 font-medium">
              Transfers & Movements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="mt-0 outline-none">
            {isInvLoading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">Loading catalog...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {inventory?.map((inv) => (
                  <Card key={inv.id} className="rounded-sm border-border shadow-md hover:shadow-lg transition-all overflow-hidden flex flex-col group">
                    <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden border-b">
                      {inv.imageUrl ? (
                        <img src={inv.imageUrl} alt={inv.materialName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                      )}
                      
                      {inv.sku && (
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-white/90 text-foreground border shadow-sm backdrop-blur-sm hover:bg-white text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-sm">
                            {inv.sku}
                          </Badge>
                        </div>
                      )}
                      {inv.category && (
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="bg-primary/90 text-primary-foreground border-none shadow-sm backdrop-blur-sm hover:bg-primary text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm">
                            {inv.category}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-display font-bold text-lg leading-tight line-clamp-2">{inv.materialName}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{inv.locationName || 'Global'}</p>
                      </div>
                      
                      <div className="mt-4 space-y-3">
                        <div className="flex items-end justify-between">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">In Stock</div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl font-mono font-bold text-foreground leading-none">{inv.quantityOnHand}</span>
                            <span className="text-sm font-medium text-muted-foreground leading-none">{inv.unit}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-3 border-t border-border/50">
                          <div className="flex-1 flex items-center gap-1.5">
                            <IndianRupee className="w-3 h-3 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Cost</span>
                              <span className="font-mono text-xs font-medium">{inv.buyPricePerUnit ?? '---'}</span>
                            </div>
                          </div>
                          <div className="w-px h-6 bg-border/50"></div>
                          <div className="flex-1 flex items-center gap-1.5">
                            <IndianRupee className="w-3 h-3 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Price</span>
                              <span className="font-mono text-xs font-medium">{inv.sellPricePerUnit ?? '---'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!inventory || inventory.length === 0) && (
                  <div className="col-span-full py-20 text-center text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No items found in inventory.</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transfers" className="mt-0 outline-none">
            <Card className="rounded-sm border-border shadow-md">
              <CardContent className="p-0">
                {isMovLoading ? (
                  <div className="py-20 text-center text-sm text-muted-foreground">Loading movements...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Material</th>
                          <th className="px-4 py-3 font-medium">From</th>
                          <th className="px-4 py-3 font-medium">To</th>
                          <th className="px-4 py-3 font-medium text-right">Quantity</th>
                          <th className="px-4 py-3 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {movements?.map((m) => (
                          <tr key={m.id} className="hover:bg-muted/30 transition-colors h-[44px]">
                            <td className="px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(m.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="px-4 font-medium">{m.materialName}</td>
                            <td className="px-4">{m.fromLocationName || <span className="text-muted-foreground italic">External</span>}</td>
                            <td className="px-4">{m.toLocationName || <span className="text-muted-foreground italic">External</span>}</td>
                            <td className="px-4 text-right font-mono font-semibold">
                              {m.quantityKg} kg
                            </td>
                            <td className="px-4 text-muted-foreground text-xs max-w-[200px] truncate">{m.reason || '-'}</td>
                          </tr>
                        ))}
                        {(!movements || movements.length === 0) && (
                          <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No movements recorded.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}