import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export interface Option {
  label: string;
  value: string;
  hex?: string;
}

export interface Division {
  id: string;
  name: string;
  optionType: "text" | "color";
  options: Option[];
}

export interface CategoryForm {
  id?: number;
  name: string;
  categoryCode: string;
  divisions: Division[];
}

export function CategoryDialog({
  open,
  onOpenChange,
  initialData,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  initialData: CategoryForm;
  onSave: (data: CategoryForm) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CategoryForm>(initialData);

  useEffect(() => {
    if (open) {
      setForm(initialData);
    }
  }, [open, initialData]);

  const addDivision = () => {
    setForm(prev => ({
      ...prev,
      divisions: [
        ...prev.divisions,
        {
          id: `division-${Date.now()}`,
          name: "",
          optionType: "text",
          options: []
        }
      ]
    }));
  };

  const removeDivision = (index: number) => {
    setForm(prev => ({
      ...prev,
      divisions: prev.divisions.filter((_, i) => i !== index)
    }));
  };

  const updateDivision = (index: number, updates: Partial<Division>) => {
    setForm(prev => ({
      ...prev,
      divisions: prev.divisions.map((d, i) => i === index ? { ...d, ...updates } : d)
    }));
  };

  const addOption = (divIndex: number) => {
    setForm(prev => ({
      ...prev,
      divisions: prev.divisions.map((d, i) => 
        i === divIndex ? {
          ...d,
          options: [...d.options, { label: "", value: "", hex: d.optionType === "color" ? "#000000" : undefined }]
        } : d
      )
    }));
  };

  const updateOption = (divIndex: number, optIndex: number, updates: Partial<Option>) => {
    setForm(prev => ({
      ...prev,
      divisions: prev.divisions.map((d, i) => 
        i === divIndex ? {
          ...d,
          options: d.options.map((o, j) => j === optIndex ? { ...o, ...updates } : o)
        } : d
      )
    }));
  };

  const removeOption = (divIndex: number, optIndex: number) => {
    setForm(prev => ({
      ...prev,
      divisions: prev.divisions.map((d, i) => 
        i === divIndex ? {
          ...d,
          options: d.options.filter((_, j) => j !== optIndex)
        } : d
      )
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Normalize data
    const normalizedDivisions = form.divisions
      .filter(d => d.name.trim())
      .map(d => ({
        ...d,
        name: d.name.trim(),
        options: d.options
          .filter(o => o.label.trim())
          .map(o => ({
            ...o,
            label: o.label.trim(),
            value: (o.value || o.label).trim()
          }))
      }));

    onSave({
      ...form,
      divisions: normalizedDivisions
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0 shadow-lg rounded-xl">
        <DialogHeader className="px-6 py-4 border-b border-border/50 sticky top-0 bg-background z-10">
          <DialogTitle className="text-xl font-semibold">{form.id ? "Edit Category" : "Category"}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Manage category code, divisions, and selectable options.</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category Name <span className="text-destructive">*</span></Label>
                <Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Substrate, Spawn, Amendments" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category Code</Label>
                <Input value={form.categoryCode} onChange={e => setForm({...form, categoryCode: e.target.value})} placeholder="e.g. SUB-001" className="h-10 font-mono" />
                <p className="text-[10px] text-muted-foreground">Leave blank to auto-generate.</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold">Divisions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addDivision} className="gap-2 text-primary border-primary/20 hover:bg-primary/5">
                  <Plus className="w-4 h-4" /> Add Division
                </Button>
              </div>

              <div className="space-y-4">
                {form.divisions.map((division, divIdx) => (
                  <div key={division.id} className="p-4 border border-border/60 bg-slate-50/50 rounded-lg space-y-4">
                    <div className="grid grid-cols-12 gap-4 items-start">
                      <div className="col-span-7 space-y-2">
                        <Label className="text-xs text-muted-foreground">Division Name</Label>
                        <Input value={division.name} onChange={e => {
                          const val = e.target.value;
                          updateDivision(divIdx, { 
                            name: val,
                            optionType: val.toLowerCase() === "color" ? "color" : division.optionType
                          });
                        }} placeholder="e.g. Size, Grade, Wood Type..." className="h-10 bg-white" />
                      </div>
                      <div className="col-span-4 space-y-2">
                        <Label className="text-xs text-muted-foreground">Option Type</Label>
                        <Select 
                          value={division.optionType} 
                          onValueChange={(v: "text" | "color") => {
                            updateDivision(divIdx, { 
                              optionType: v,
                              options: division.options.map(o => ({
                                ...o,
                                hex: v === "color" ? (o.hex || "#000000") : undefined
                              }))
                            });
                          }}
                          disabled={division.name.toLowerCase() === "color"}
                        >
                          <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="color">Color + Hex</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 pt-8 flex justify-end">
                        <button type="button" onClick={() => removeDivision(divIdx)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>

                    <div className="space-y-2 pl-2 border-l-2 border-border/50">
                      {division.options.map((option, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-3">
                          <Input value={option.label} onChange={e => updateOption(divIdx, optIdx, { label: e.target.value, value: e.target.value })} placeholder="Option name" className="h-9 bg-white" />
                          {division.optionType === "color" && (
                            <>
                              <Input type="color" value={option.hex} onChange={e => updateOption(divIdx, optIdx, { hex: e.target.value })} className="h-9 w-12 p-1 cursor-pointer bg-white" />
                              <Input value={option.hex} onChange={e => updateOption(divIdx, optIdx, { hex: e.target.value })} placeholder="#000000" className="h-9 w-28 font-mono bg-white" />
                            </>
                          )}
                          <button type="button" onClick={() => removeOption(divIdx, optIdx)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addOption(divIdx)} className="text-xs text-primary font-medium hover:underline mt-2 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add option
                      </button>
                    </div>
                  </div>
                ))}
                {form.divisions.length === 0 && (
                  <div className="text-center py-6 border border-dashed rounded-lg text-sm text-muted-foreground">
                    No divisions added. Add divisions to create dynamic attributes.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border/50 sticky bottom-0 bg-background z-10 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-6 rounded-md">Cancel</Button>
            <Button type="submit" disabled={isPending} className="px-6 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground">
              {form.id ? "Update Category" : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
