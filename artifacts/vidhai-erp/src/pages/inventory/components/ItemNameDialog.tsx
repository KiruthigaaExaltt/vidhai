import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ItemNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formState: any;
  categories: any[];
}

export function ItemNameDialog({ open, onOpenChange, formState, categories }: ItemNameDialogProps) {
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
      const url = isEditing ? `/api/vault/item-names/${data.id}` : `/api/vault/item-names`;
      const method = isEditing ? "PATCH" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          categoryId: data.categoryId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save item name");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-names"] });
      toast.success(`Item ${isEditing ? "updated" : "added"} successfully`);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.categoryId) {
      toast.error("Please fill all required fields");
      return;
    }
    saveMutation.mutate(form);
  };

  const selectedCategory = categories.find((c) => String(c.id) === String(form.categoryId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 border-0 shadow-lg rounded-xl">
        <DialogHeader className="px-6 py-4 border-b border-border/50 bg-background rounded-t-xl">
          <DialogTitle className="text-xl font-semibold">{isEditing ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Item Name <span className="text-destructive">*</span></Label>
              <Input required value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Oyster Mushroom Spawn" className="h-10 rounded-sm" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Category <span className="text-destructive">*</span></Label>
              <Select value={form.categoryId ? String(form.categoryId) : ""} onValueChange={(v) => setForm({...form, categoryId: v})}>
                <SelectTrigger className="h-10 rounded-sm">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCategory.divisions?.length > 0 
                    ? `Category has ${selectedCategory.divisions.length} divisions.` 
                    : "Category only — no divisions or attributes on this master."}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 bg-background rounded-b-xl">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {isEditing ? "Save Changes" : "+ Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
