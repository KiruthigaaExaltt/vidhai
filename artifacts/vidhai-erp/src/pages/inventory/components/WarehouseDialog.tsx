import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

interface WarehouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formState: any;
}

export function WarehouseDialog({ open, onOpenChange, formState }: WarehouseDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!formState.id;

  const [form, setForm] = useState(formState);

  useEffect(() => {
    if (open) {
      setForm({ ...formState });
    }
  }, [open, formState]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEditing ? `/api/vault/locations/${data.id}` : `/api/vault/locations`;
      const method = isEditing ? "PATCH" : "POST";
      
      const payload = {
        locationName: data.locationName,
        locationType: data.locationType,
        capacity: data.capacity,
        capacityUnit: data.capacityUnit,
        manager: data.manager,
        contactNumber: data.contactNumber,
        address: data.address,
        imageUrl: data.imageUrl,
        isDefault: data.isDefault,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save warehouse");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault-locations"] });
      toast.success(`Warehouse ${isEditing ? "updated" : "created"} successfully`);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.locationName?.trim() || !form.capacity || !form.manager?.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    saveMutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 border-0 shadow-lg rounded-xl">
        <DialogHeader className="px-6 py-4 border-b border-border/50 sticky top-0 bg-background z-10">
          <DialogTitle className="text-xl font-semibold">{isEditing ? "Edit Location" : "Add Location"}</DialogTitle>
          <DialogDescription>Manage physical warehouses, godowns and stores.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Warehouse Code</Label>
              <Input disabled value={form.warehouseCode || "Auto generated"} className="h-10 bg-slate-50 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Location Name <span className="text-destructive">*</span></Label>
              <Input required value={form.locationName || ""} onChange={e => setForm({...form, locationName: e.target.value})} className="h-10" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type <span className="text-destructive">*</span></Label>
                <Select disabled={isEditing && form.isSystem} value={form.locationType || "Warehouse"} onValueChange={(v) => setForm({...form, locationType: v})}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Warehouse">Warehouse / Godown</SelectItem>
                    <SelectItem value="Store">Store / POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity Unit <span className="text-destructive">*</span></Label>
                <Select value={form.capacityUnit || "square feet"} onValueChange={(v) => setForm({...form, capacityUnit: v})}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square feet">square feet</SelectItem>
                    <SelectItem value="square metres">square metres</SelectItem>
                    <SelectItem value="cubic feet">cubic feet</SelectItem>
                    <SelectItem value="pallets">pallets</SelectItem>
                    <SelectItem value="racks">racks</SelectItem>
                    <SelectItem value="bins">bins</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Capacity <span className="text-destructive">*</span></Label>
              <Input type="number" min="1" required value={form.capacity?.$numberDecimal ?? form.capacity ?? ""} onChange={e => setForm({...form, capacity: Number(e.target.value)})} className="h-10" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Manager <span className="text-destructive">*</span></Label>
              <Input required value={form.manager || ""} onChange={e => setForm({...form, manager: e.target.value})} placeholder="Employee Name" className="h-10" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Number</Label>
              <Input value={form.contactNumber || ""} onChange={e => setForm({...form, contactNumber: e.target.value})} className="h-10" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
              <Textarea value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} className="min-h-[80px]" />
            </div>

          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 bg-slate-50 sticky bottom-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : isEditing ? "Save Changes" : "Add Location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
