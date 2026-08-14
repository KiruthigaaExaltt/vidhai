import { useState, useMemo, useEffect } from "react";
import {
  useCreateBatch,
  useListChambers,
  useListLocations,
  useListMaterials,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Flexible name resolver: exact â†’ contains â†’ first-word match.
// Prevents silent material drops when DB names differ slightly (e.g. "Chicken Manure (Dry)" vs "Chicken Manure").
function resolveMaterial(
  list: Array<{ id: number; name: string }>,
  rowName: string,
) {
  const rn = rowName.toLowerCase().trim();
  return (
    list.find((m) => m.name.toLowerCase() === rn) ??
    list.find((m) => m.name.toLowerCase().includes(rn)) ??
    list.find((m) => rn.includes(m.name.toLowerCase())) ??
    list.find(
      (m) => m.name.toLowerCase().split(/\s+/)[0] === rn.split(/\s+/)[0],
    )
  );
}

const BASELINE_MATERIALS = [
  { name: "Paddy Straw", wetPerBag: 3.3, moisture: 12, nitrogen: 0.6 },
  { name: "Sugarcane", wetPerBag: 0.327, moisture: 10, nitrogen: 0.5 },
  { name: "Chicken Manure", wetPerBag: 1.257, moisture: 16, nitrogen: 2.8 },
  { name: "Castor DOC", wetPerBag: 0.662, moisture: 9, nitrogen: 4.2 },
  { name: "Urea", wetPerBag: 0.0356, moisture: 0, nitrogen: 42.63 },
  { name: "CAN", wetPerBag: 0.00556, moisture: 0, nitrogen: 25.0 },
  { name: "Gypsum", wetPerBag: 0.418, moisture: 19, nitrogen: 0.0 },
];

interface FormulationRow {
  materialId?: number;
  name: string;
  wetWeightKg: number;
  moisturePercent: number;
  nitrogenPercent: number;
  isCustom: boolean;
}

export default function NewBatch() {
  const [, setLocation] = useLocation();
  const { data: locations } = useListLocations();
  const { data: materialsList } = useListMaterials();
  const annurLoc = locations?.find(
    (l) =>
      l.code.trim().toUpperCase() === "A" ||
      l.name.trim().toLowerCase().includes("annur"),
  );

  const createBatch = useCreateBatch();
  const { data: chambers } = useListChambers();

  const availablePreWettingChambers = (chambers ?? []).filter(
    (chamber) =>
      chamber.locationId === annurLoc?.id &&
      chamber.chamberType === "pre_wetting" &&
      chamber.status === "idle" &&
      chamber.currentBatchId == null,
  );

  const [targetBags, setTargetBags] = useState<string>("4500");
  const [notes, setNotes] = useState("");
  const [preWettingChamberId, setPreWettingChamberId] = useState("");

  // Initialize from baseline (IDs resolved later via useEffect)
  const [formulation, setFormulation] = useState<FormulationRow[]>(() =>
    BASELINE_MATERIALS.map((m) => ({
      name: m.name,
      wetWeightKg: m.wetPerBag * 4500,
      moisturePercent: m.moisture,
      nitrogenPercent: m.nitrogen,
      isCustom: false,
    })),
  );

  // Pre-resolve materialIds as soon as materialsList is available.
  // Uses flexible matching: exact first, then contains, to survive minor DB name differences.
  useEffect(() => {
    if (!materialsList || materialsList.length === 0) return;
    setFormulation((prev) =>
      prev.map((row) => {
        if (row.materialId) return row; // already resolved
        const match = resolveMaterial(materialsList, row.name);
        return match ? { ...row, materialId: match.id } : row;
      }),
    );
  }, [materialsList]);

  // Calculate N% live
  const nitrogenStats = useMemo(() => {
    let totalWet = 0;
    let totalDry = 0;
    let totalN2 = 0;

    formulation.forEach((row) => {
      const wet = row.wetWeightKg || 0;
      const moist = row.moisturePercent || 0;
      const n2 = row.nitrogenPercent || 0;

      totalWet += wet;
      const dry = wet * (1 - moist / 100);
      totalDry += dry;

      // Gypsum doesn't contribute to total dry mass for N calculation? Usually it doesn't.
      // But standard formula: sum(dry * n2/100) / sum(dry)
      // Actually standard N calculation excludes gypsum from dry weight divisor sometimes, but let's just use strict math:
      totalN2 += dry * (n2 / 100);
    });

    const percent = totalDry > 0 ? (totalN2 / totalDry) * 100 : 0;
    return { percent, totalWet, totalDry };
  }, [formulation]);

  const n2Status =
    nitrogenStats.percent >= 1.5 && nitrogenStats.percent <= 1.8
      ? "green"
      : nitrogenStats.percent >= 1.4 && nitrogenStats.percent <= 1.9
        ? "amber"
        : "red";

  const handleTargetBagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetBags(val);
    const bags = Number(val);
    if (!isNaN(bags) && bags > 0) {
      setFormulation((prev) =>
        prev.map((row) => {
          if (!row.isCustom) {
            const baseline = BASELINE_MATERIALS.find(
              (b) => b.name === row.name,
            );
            if (baseline) {
              return { ...row, wetWeightKg: baseline.wetPerBag * bags };
            }
          }
          return row;
        }),
      );
    }
  };

  const handleUpdateRow = (
    index: number,
    field: keyof FormulationRow,
    val: string | number,
  ) => {
    const newFormulation = [...formulation];
    newFormulation[index] = { ...newFormulation[index], [field]: val };
    setFormulation(newFormulation);
  };

  const removeRow = (index: number) => {
    setFormulation((prev) => prev.filter((_, i) => i !== index));
  };

  const addCustomMaterial = () => {
    setFormulation((prev) => [
      ...prev,
      {
        name: "",
        wetWeightKg: 0,
        moisturePercent: 0,
        nitrogenPercent: 0,
        isCustom: true,
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annurLoc) {
      toast.error(
        "Annur location is not configured. Add Location A in Settings first.",
      );
      return;
    }
    if (!materialsList) {
      toast.error("Materials are still loading. Please try again.");
      return;
    }
    if (!preWettingChamberId) {
      toast.error("Select an available Pre-Wetting chamber");
      return;
    }

    try {
      const batch = await createBatch.mutateAsync({
        data: {
          locationId: annurLoc.id,
          preWettingChamberId: Number(preWettingChamberId),
          targetBags: targetBags ? Number(targetBags) : null,
          notes: notes || null,
          formulation: formulation.map((row) => ({
            materialId: row.materialId,
            name: row.name,
            wetWeightKg: row.wetWeightKg,
            moisturePercent: row.moisturePercent,
            nitrogenPercent: row.nitrogenPercent,
          })),
        } as any,
      });
      toast.success("Batch and formulation created successfully");
      setLocation(`/annur/batches/${batch.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create batch");
    }
  };

  if (!locations || !materialsList)
    return (
      <Shell>
        <div className="p-8">Loading...</div>
      </Shell>
    );

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/annur/batches")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Batches
        </Button>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Initiate Formulation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start a new production cycle in Annur Location A
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="rounded-md border-border shadow-md">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                General Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Location
                  </Label>
                  <div className="px-3 py-2 bg-muted rounded-md text-sm border font-medium">
                    {annurLoc?.name || "Annur (Location A)"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Pre-Wetting Chamber{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    required
                    value={preWettingChamberId}
                    onValueChange={setPreWettingChamberId}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder="Select chamber" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePreWettingChambers.map((chamber) => (
                        <SelectItem key={chamber.id} value={String(chamber.id)}>
                          {chamber.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availablePreWettingChambers.length === 0 && (
                    <p className="text-xs text-destructive">
                      No Pre-Wetting chamber is currently available.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Target Bags
                  </Label>
                  <Input
                    type="number"
                    required
                    value={targetBags}
                    onChange={handleTargetBagsChange}
                    className="rounded-md font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Initial Notes
                  </Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="rounded-md"
                    placeholder="Any starting notes..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-sm border-border shadow-md">
            <CardHeader className="pb-4 border-b bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Material Formulation
                </CardTitle>
                <CardDescription className="mt-1">
                  Adjust quantities. Target N% is 1.5â€“1.8%.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 bg-background border px-4 py-2 rounded-md shadow-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Calculated N%
                </div>
                <div
                  className={`font-mono text-xl font-bold flex items-center gap-2 ${
                    n2Status === "green"
                      ? "text-green-600"
                      : n2Status === "amber"
                        ? "text-amber-500"
                        : "text-destructive"
                  }`}
                >
                  {nitrogenStats.percent.toFixed(2)}%
                  {n2Status === "green" && (
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  )}
                  {n2Status === "amber" && (
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  )}
                  {n2Status === "red" && (
                    <div className="w-2 h-2 rounded-full bg-destructive animate-pulse"></div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                        Material
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-36 bg-blue-50/40">
                        Wet Weight (kg)
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-28 bg-blue-50/40">
                        Hâ‚‚O %
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-primary/70 w-36 bg-primary/5">
                        Dry Weight (kg)
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground w-28 bg-emerald-50/40">
                        N %
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-primary/70 w-32 bg-primary/5">
                        Nâ‚‚ (kg)
                      </th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formulation.map((row, i) => {
                      const dryWt =
                        (row.wetWeightKg || 0) *
                        (1 - (row.moisturePercent || 0) / 100);
                      const n2Kg = dryWt * ((row.nitrogenPercent || 0) / 100);
                      return (
                        <tr
                          key={i}
                          className="hover:bg-muted/10 group h-[46px]"
                        >
                          <td className="px-4 font-medium">
                            {row.isCustom ? (
                              <Select
                                value={row.materialId?.toString()}
                                onValueChange={(val) => {
                                  const m = materialsList.find(
                                    (mat) => mat.id.toString() === val,
                                  );
                                  if (m) {
                                    handleUpdateRow(i, "materialId", m.id);
                                    handleUpdateRow(i, "name", m.name);
                                    handleUpdateRow(
                                      i,
                                      "moisturePercent",
                                      m.defaultMoisturePercent || 0,
                                    );
                                    handleUpdateRow(
                                      i,
                                      "nitrogenPercent",
                                      m.defaultNitrogenPercent || 0,
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Select material" />
                                </SelectTrigger>
                                <SelectContent>
                                  {materialsList.map((m) => (
                                    <SelectItem
                                      key={m.id}
                                      value={m.id.toString()}
                                    >
                                      {m.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span>{row.name}</span>
                            )}
                          </td>
                          {/* Wet Weight â€” editable */}
                          <td className="px-2 bg-blue-50/10">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="h-8 text-right font-mono border-transparent hover:border-border focus:border-border bg-transparent"
                              value={Number(row.wetWeightKg.toFixed(3))}
                              onChange={(e) =>
                                handleUpdateRow(
                                  i,
                                  "wetWeightKg",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          {/* Hâ‚‚O% â€” editable */}
                          <td className="px-2 bg-blue-50/10">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              className="h-8 text-right font-mono border-transparent hover:border-border focus:border-border bg-transparent"
                              value={row.moisturePercent}
                              onChange={(e) =>
                                handleUpdateRow(
                                  i,
                                  "moisturePercent",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          {/* Dry Weight â€” computed, read-only */}
                          <td className="px-4 text-right font-mono font-bold text-primary bg-primary/5">
                            {dryWt.toFixed(3)}
                          </td>
                          {/* N% â€” editable */}
                          <td className="px-2 bg-emerald-50/10">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              className="h-8 text-right font-mono border-transparent hover:border-border focus:border-border bg-transparent"
                              value={row.nitrogenPercent}
                              onChange={(e) =>
                                handleUpdateRow(
                                  i,
                                  "nitrogenPercent",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          {/* Nâ‚‚ â€” computed, read-only */}
                          <td className="px-4 text-right font-mono font-bold text-primary bg-primary/5">
                            {n2Kg.toFixed(4)}
                          </td>
                          <td className="px-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeRow(i)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-border bg-muted/10">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomMaterial}
                  className="rounded-md text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Custom Material
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              disabled={
                createBatch.isPending ||
                !preWettingChamberId ||
                availablePreWettingChambers.length === 0
              }
              className="rounded-md px-10 h-12 text-lg shadow-md"
            >
              {createBatch.isPending ? "Initiating..." : "Initiate Batch"}
            </Button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
