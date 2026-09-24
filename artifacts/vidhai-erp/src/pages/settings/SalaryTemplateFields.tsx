import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const deductionComponentIds = new Set(["pf", "esi", "pt", "tds"]);
const newComponent = (order: number) => ({
  id: `component_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`,
  name: "",
  calculationType: "fixed",
  value: "",
  referenceComponentId: null,
  order,
  includeInPfWage: false,
  includeInEsiWage: true,
});

const calculations = [
  { id: "fixed", name: "Fixed Amount" },
  { id: "percentage_of_ctc", name: "% of CTC" },
  { id: "percentage_of_component", name: "% of Component" },
  { id: "residual", name: "Residual" },
] as const;

type PickerOption = { id: string; name: string; disabled?: boolean };

function SearchPicker({ value, options, placeholder, onChange }: { value: string; options: PickerOption[]; placeholder: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-11 w-full justify-between bg-background font-normal">
      <span className="truncate">{selected?.name || placeholder}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
      <Command><CommandInput placeholder="Type to filter..."/><CommandList><CommandEmpty>No option found.</CommandEmpty><CommandGroup>
        {options.map(option=><CommandItem key={option.id} value={`${option.name} ${option.id}`} disabled={option.disabled} onSelect={()=>{onChange(option.id);setOpen(false)}}>
          <Check className={cn("h-4 w-4",value===option.id?"opacity-100":"opacity-0")}/>{option.name}
        </CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>;
}

export function SalaryTemplateFields({ form, set }: { form: any; set: (key: string, value: any) => void }) {
  const components = form.components || [];
  const update = (index:number, patch:any) => set("components", components.map((component:any,i:number)=>i===index?{...component,...patch}:component));
  const remove = (index:number) => set("components",components.filter((_:any,i:number)=>i!==index).map((component:any,i:number)=>({...component,order:i+1})));
  const add = () => set("components",[...components,newComponent(components.length+1)]);
  return <div className="space-y-4">
    {components.map((component:any,index:number)=>{
      const isDeduction=deductionComponentIds.has(String(component.id).toLowerCase());
      const calculationOptions=calculations.map(option=>({...option,disabled:option.id==="residual"&&(isDeduction||components.some((item:any,i:number)=>i!==index&&item.calculationType==="residual"))}));
      const references=components.slice(0,index).map((item:any)=>({id:item.id,name:item.name}));
      const changeCalculation=(calculationType:string)=>update(index,{calculationType,value:calculationType==="residual"?null:component.value??"",referenceComponentId:calculationType==="percentage_of_component"?component.referenceComponentId:null});
      return <section key={`${component.id}-${index}`} className="rounded-md border bg-muted/20 p-4">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold">Component {index+1}</p><p className="text-xs text-muted-foreground">{isDeduction?"Deduction":"Earning"}</p></div><Button type="button" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={()=>remove(index)}><Trash2 className="mr-1 h-4 w-4"/>Remove</Button></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Component Name</Label><Input value={component.name} placeholder="Enter component name" onChange={event=>update(index,{name:event.target.value})}/></div>
        <div className="space-y-1.5"><Label>Calculation</Label><SearchPicker value={component.calculationType} options={calculationOptions} placeholder="Select calculation" onChange={changeCalculation}/></div></div>
        {component.calculationType!=="residual"&&<div className="mt-4 space-y-1.5"><Label>{component.calculationType==="fixed"?"Fixed Amount":"Percentage"}</Label><Input type="number" min="0" max={component.calculationType.startsWith("percentage")?100:undefined} step="0.01" value={component.value??""} placeholder={component.calculationType==="fixed"?"Enter fixed amount":"Enter percentage"} onChange={event=>update(index,{value:event.target.value})}/></div>}
        {component.calculationType==="percentage_of_component"&&<div className="mt-4 space-y-1.5"><Label>Reference Component</Label><SearchPicker value={component.referenceComponentId||""} options={references} placeholder={references.length?"Select an earlier component":"Add an earlier component first"} onChange={referenceComponentId=>update(index,{referenceComponentId})}/><p className="text-xs text-muted-foreground">Only components above this one can be referenced.</p></div>}
        <div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={component.includeInPfWage===true} onChange={event=>update(index,{includeInPfWage:event.target.checked})}/>Include in PF wage</label><label className="flex items-center gap-2"><input type="checkbox" checked={component.includeInEsiWage!==false} onChange={event=>update(index,{includeInEsiWage:event.target.checked})}/>Include in ESI wage</label></div>
      </section>;
    })}
    <Button type="button" variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4"/>Add Component</Button>
  </div>;
}
