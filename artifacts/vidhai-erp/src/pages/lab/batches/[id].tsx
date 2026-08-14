import { useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetLabBatch,
  getGetLabBatchQueryKey,
  getListLabBatchesQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Beaker,
  FlaskConical,
  Sprout,
  Droplets,
  ThermometerSnowflake,
  Syringe,
  Activity,
  ListRestart,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  Plus,
  Trash2,
  ChevronRight,
  Package,
  PackageCheck,
  Warehouse,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

// ── Stage definitions ──────────────────────────────────────────────────────────

const STAGES = [
  { key: "MEDIA_PREP", label: "Media Prep", days: 17, icon: Beaker },
  {
    key: "MOTHER_CULTURE",
    label: "Mother Culture",
    days: 17,
    icon: FlaskConical,
  },
  { key: "MILLET_1", label: "Millet 1", days: 3, icon: Sprout },
  { key: "MILLET_2", label: "Millet 2", days: 2, icon: ListRestart },
  { key: "MOISTURE", label: "Moisture", days: 2, icon: Droplets },
  { key: "AUTOCLAVE", label: "Autoclave", days: 2, icon: ThermometerSnowflake },
  { key: "INOCULATION", label: "Inoculation", days: 5, icon: Syringe },
  { key: "SHAKING_1", label: "1st Shaking", days: 6, icon: Activity },
  { key: "SHAKING_2", label: "2nd Shaking", days: 11, icon: Activity },
  { key: "QC", label: "QC", days: 1, icon: CheckCircle2 },
] as const;

const NEXT_STAGE: Record<string, string> = {
  MEDIA_PREP: "MOTHER_CULTURE",
  MOTHER_CULTURE: "MILLET_1",
  MILLET_1: "MILLET_2",
  MILLET_2: "MOISTURE",
  MOISTURE: "AUTOCLAVE",
  AUTOCLAVE: "INOCULATION",
  INOCULATION: "SHAKING_1",
  SHAKING_1: "SHAKING_2",
  SHAKING_2: "QC",
  QC: "COMPLETED",
};

// Default formulation
const DEFAULT_ROWS = [
  { id: 1, name: "Millets", qtyKg: "32.0" },
  { id: 2, name: "Gypsum", qtyKg: "1.4" },
  { id: 3, name: "Calcium", qtyKg: "1.1" },
  { id: 4, name: "4th Ingredient", qtyKg: "0.032" },
];

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LabBatchDetail() {
  const params = useParams();
  const batchId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: batch, isLoading } = useGetLabBatch(batchId, {
    query: { enabled: !!batchId, queryKey: getGetLabBatchQueryKey(batchId) },
  });

  const refetch = () => {
    queryClient.invalidateQueries({
      queryKey: getGetLabBatchQueryKey(batchId),
    });
    queryClient.invalidateQueries({ queryKey: getListLabBatchesQueryKey() });
  };

  const b = batch as any;

  // ── Formulation local state ───────────────────────────────────────────────
  const [formulationRows, setFormulationRows] = useState(DEFAULT_ROWS);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatQty, setNewMatQty] = useState("");

  const totalKg = formulationRows.reduce(
    (s, r) => s + (parseFloat(r.qtyKg) || 0),
    0,
  );

  // ── Camera state ──────────────────────────────────────────────────────────
  const imgRef0 = useRef<HTMLInputElement>(null);
  const imgRef1 = useRef<HTMLInputElement>(null);
  const imgRef = [imgRef0, imgRef1] as const;
  const [stageImages, setStageImages] = useState<(string | null)[]>([
    null,
    null,
  ]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const handleImageFile = (slot: 0 | 1, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setStageImages((prev) => {
        const n = [...prev];
        n[slot] = e.target?.result as string;
        return n;
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Advance dialog ────────────────────────────────────────────────────────
  const [advDialog, setAdvDialog] = useState({
    open: false,
    stageKey: "",
    nextStageKey: "",
    notes: "",
    destination: "annur" as "annur" | "inventory",
    strainName: "",
    spawnQty: "",
  });

  const openAdvDialog = (stageKey: string) => {
    setStageImages([null, null]);
    setAdvDialog({
      open: true,
      stageKey,
      nextStageKey: NEXT_STAGE[stageKey] ?? "COMPLETED",
      notes: "",
      destination: "annur",
      strainName: "",
      spawnQty: String(Math.round(totalKg * 0.85)),
    });
  };

  const closeAdvDialog = () => {
    setAdvDialog((p) => ({ ...p, open: false }));
    setStageImages([null, null]);
  };

  const isFinalStage = advDialog.stageKey === "QC";
  const imagesReady = stageImages[0] !== null && stageImages[1] !== null;
  const finalReady =
    !isFinalStage || (!!advDialog.strainName && Number(advDialog.spawnQty) > 0);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const initiateMutation = useMutation({
    mutationFn: async () => {
      const materials = formulationRows
        .map((r) => ({ name: r.name, quantityKg: parseFloat(r.qtyKg) || 0 }))
        .filter((m) => m.quantityKg > 0);
      const res = await fetch(`/api/lab/batches/${batchId}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ materials }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to initiate batch");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast.success("Batch initiated — Media Prep stage is now active");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to initiate"),
  });

  // eslint-disable-next-line prefer-const
  let advanceMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await fetch(`/api/lab/batches/${batchId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to advance stage");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      const isCompletion = advDialog.stageKey === "QC";
      toast.success(
        isCompletion
          ? "Batch completed — spawn stock recorded"
          : "Stage completed",
      );
      closeAdvDialog();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  const canSubmit = imagesReady && finalReady && !advanceMutation.isPending;

  const handleAdvance = () => {
    advanceMutation.mutate({
      nextStage: advDialog.nextStageKey,
      notes: advDialog.notes || null,
      verificationImages: stageImages.filter(Boolean),
      ...(isFinalStage && {
        destination: advDialog.destination,
        strainName: advDialog.strainName,
        spawnQty: Number(advDialog.spawnQty),
      }),
    });
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentStage: string = b?.currentStage ?? "FORMULATION";
  const isFormulation = currentStage === "FORMULATION";
  const isCompleted = currentStage === "COMPLETED";

  const curIdx = STAGES.findIndex((s) => s.key === currentStage);
  const stageLogs: any[] = b?.stageLogs ?? [];
  const spawnOutputs: any[] = b?.spawnOutputs ?? [];
  const savedMaterials: any[] = b?.materials ?? [];

  const completedStageKeys = useMemo(() => {
    return new Set(
      stageLogs.filter((l: any) => l.exitedAt).map((l: any) => l.stage),
    );
  }, [stageLogs]);

  const totalDays = STAGES.reduce((s, st) => s + st.days, 0);
  const doneDays = STAGES.slice(0, Math.max(0, curIdx)).reduce(
    (s, st) => s + st.days,
    0,
  );
  const savedTotalKg = savedMaterials.reduce(
    (s: number, m: any) => s + Number(m.quantityKg),
    0,
  );

  // Planned dates (cumulative from batch creation)
  const stageStartDates = useMemo(() => {
    if (!b?.createdAt) return {};
    const base = new Date(b.createdAt);
    const result: Record<string, string> = {};
    let cum = 0;
    for (const st of STAGES) {
      const d = new Date(base);
      d.setDate(d.getDate() + cum);
      result[st.key] = d.toISOString().split("T")[0];
      cum += st.days;
    }
    return result;
  }, [b?.createdAt]);

  if (isLoading)
    return (
      <Shell>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </Shell>
    );
  if (!b)
    return (
      <Shell>
        <div className="p-8 text-sm text-destructive">Batch not found.</div>
      </Shell>
    );

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        {/* Back */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/lab/batches")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Spawn Batches
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <FlaskConical className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-mono font-bold tracking-tight text-primary">
                {b.batchCode}
              </h1>
              <Badge
                variant="outline"
                className={`border-0 rounded-sm text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 ${
                  isCompleted
                    ? "bg-primary/10 text-primary"
                    : isFormulation
                      ? "bg-muted text-muted-foreground"
                      : "bg-sky-50 text-sky-700"
                }`}
              >
                {isFormulation
                  ? "Formulation"
                  : isCompleted
                    ? "Completed"
                    : currentStage.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Location D — Lab &nbsp;·&nbsp; Created {fmt(b.createdAt)}
              {b.createdByName ? ` by ${b.createdByName}` : ""}
            </p>
          </div>

          {/* Metrics strip */}
          <div className="flex flex-wrap gap-2 md:justify-end">
            <div className="px-3 py-2 rounded-sm border border-border bg-muted/30 text-sm">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                Input
              </span>
              <span className="font-mono font-bold">
                {isFormulation ? totalKg.toFixed(2) : savedTotalKg.toFixed(2)}{" "}
                kg
              </span>
            </div>
            {!isFormulation && (
              <div className="px-3 py-2 rounded-sm border border-border bg-muted/30 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                  Progress
                </span>
                <span className="font-mono font-bold">
                  {doneDays} / {totalDays} days
                </span>
              </div>
            )}
            {spawnOutputs.length > 0 && (
              <div className="px-3 py-2 rounded-sm border border-primary/20 bg-primary/5 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold mr-1.5">
                  Output
                </span>
                <span className="font-mono font-bold text-primary">
                  {spawnOutputs
                    .reduce((s: number, o: any) => s + Number(o.quantityKg), 0)
                    .toFixed(1)}{" "}
                  kg
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FORMULATION STAGE                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {isFormulation && (
          <Card className="rounded-sm border-border shadow-none">
            <CardHeader className="pb-0 border-b flex flex-row items-start justify-between">
              <div className="pb-4">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Beaker className="w-4 h-4" /> Spawn Batch Formulation
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Pre-filled with the standard reference recipe. Adjust
                  quantities for this batch, then click{" "}
                  <strong>Initiate Batch</strong> to lock the formulation and
                  begin the 9-stage tracker.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm h-8 text-xs font-medium mb-4"
                onClick={() => setShowAddRow((v) => !v)}
              >
                <Plus className="w-3 h-3 mr-2" /> Add Material
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-6 py-3 font-medium">Material</th>
                      <th className="px-6 py-3 font-medium text-right">
                        Quantity (kg)
                      </th>
                      <th className="px-6 py-3 font-medium text-right">
                        % of Mix
                      </th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formulationRows.map((row) => {
                      const qty = parseFloat(row.qtyKg) || 0;
                      const pct = totalKg > 0 ? (qty / totalKg) * 100 : 0;
                      return (
                        <tr key={row.id} className="h-[44px] hover:bg-muted/30">
                          <td className="px-6 font-medium">{row.name}</td>
                          <td className="px-6 text-right">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.qtyKg}
                              onChange={(e) =>
                                setFormulationRows((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id
                                      ? { ...r, qtyKg: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                              className="w-28 text-right font-mono bg-transparent border-b border-dashed border-muted-foreground/40 focus:border-primary focus:outline-none py-0.5"
                            />
                          </td>
                          <td className="px-6 font-mono text-right text-muted-foreground">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-4 text-right">
                            <button
                              onClick={() =>
                                setFormulationRows((rows) =>
                                  rows.filter((r) => r.id !== row.id),
                                )
                              }
                              className="text-muted-foreground hover:text-destructive p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {showAddRow && (
                      <tr className="h-[44px] bg-muted/10">
                        <td className="px-4">
                          <input
                            type="text"
                            placeholder="Material name…"
                            value={newMatName}
                            onChange={(e) => setNewMatName(e.target.value)}
                            className="w-40 bg-transparent border border-dashed border-primary/50 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                        </td>
                        <td className="px-6 text-right">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="kg"
                            value={newMatQty}
                            onChange={(e) => setNewMatQty(e.target.value)}
                            className="w-24 text-right font-mono bg-transparent border border-dashed border-primary/50 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                        </td>
                        <td className="px-6 text-right text-muted-foreground text-xs">
                          —
                        </td>
                        <td className="px-4 text-right">
                          <button
                            onClick={() => {
                              if (!newMatName || !newMatQty) return;
                              setFormulationRows((rows) => [
                                ...rows,
                                {
                                  id: Date.now(),
                                  name: newMatName,
                                  qtyKg: newMatQty,
                                },
                              ]);
                              setNewMatName("");
                              setNewMatQty("");
                              setShowAddRow(false);
                            }}
                            className="text-primary font-bold text-sm px-2"
                          >
                            ✓
                          </button>
                        </td>
                      </tr>
                    )}

                    {formulationRows.length === 0 && !showAddRow && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-6 py-8 text-center text-sm text-muted-foreground"
                        >
                          No materials. Click <strong>Add Material</strong> to
                          begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {formulationRows.length > 0 && (
                    <tfoot className="border-t-2 border-border bg-muted/50">
                      <tr className="h-[44px] font-semibold">
                        <td className="px-6 text-xs uppercase tracking-wider">
                          Total Input
                        </td>
                        <td className="px-6 font-mono text-right text-primary text-base">
                          {totalKg.toFixed(3)} kg
                        </td>
                        <td className="px-6 font-mono text-right text-primary">
                          100.0%
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="p-5 border-t border-border bg-muted/10 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Expected output:{" "}
                    <span className="font-semibold text-primary">
                      51–54 kg spawn
                    </span>{" "}
                    per standard batch. Formulation is locked once initiated.
                  </p>
                </div>
                <Button
                  className="rounded-sm h-10 px-6 shrink-0 gap-2"
                  disabled={
                    formulationRows.length === 0 || initiateMutation.isPending
                  }
                  onClick={() => initiateMutation.mutate()}
                >
                  {initiateMutation.isPending
                    ? "Initiating…"
                    : "Initiate Batch"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* POST-INITIATION: TABS                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {!isFormulation && (
          <Tabs defaultValue="tracker" className="w-full">
            <TabsList className="rounded-none bg-transparent border-b w-full justify-start h-auto p-0 space-x-6 mb-0">
              <TabsTrigger
                value="formulation"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2.5 font-medium text-sm"
              >
                Formulation Record
              </TabsTrigger>
              <TabsTrigger
                value="tracker"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2.5 font-medium text-sm"
              >
                Stage Tracker
              </TabsTrigger>
              <TabsTrigger
                value="output"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2.5 font-medium text-sm"
              >
                History & Output
              </TabsTrigger>
            </TabsList>

            {/* ── FORMULATION RECORD (locked) ────────────────────────────── */}
            <TabsContent value="formulation" className="pt-5">
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5" /> Formulation Record —
                        Locked at Initiation
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Read-only snapshot of the batch formulation as recorded
                        at initiation.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-sm text-[10px] uppercase tracking-wider bg-primary/5 border-primary/20 text-primary font-semibold"
                    >
                      Locked
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {savedMaterials.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No formulation data recorded — this batch was created
                      before formulation tracking was introduced.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-6 py-3 font-medium">Material</th>
                            <th className="px-6 py-3 font-medium text-right">
                              Quantity (kg)
                            </th>
                            <th className="px-6 py-3 font-medium text-right">
                              % of Mix
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {savedMaterials.map((m: any) => {
                            const qty = Number(m.quantityKg);
                            const pct =
                              savedTotalKg > 0 ? (qty / savedTotalKg) * 100 : 0;
                            return (
                              <tr key={m.id} className="h-[44px] bg-muted/5">
                                <td className="px-6 font-medium">{m.name}</td>
                                <td className="px-6 font-mono text-right font-semibold">
                                  {qty.toFixed(3)}
                                </td>
                                <td className="px-6 font-mono text-right text-muted-foreground">
                                  {pct.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t-2 border-border bg-muted/50">
                          <tr className="h-[44px] font-bold">
                            <td className="px-6 text-xs uppercase tracking-wider">
                              Total Input
                            </td>
                            <td className="px-6 font-mono text-right text-primary text-base">
                              {savedTotalKg.toFixed(3)} kg
                            </td>
                            <td className="px-6 font-mono text-right text-primary">
                              100.0%
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── STAGE TRACKER ────────────────────────────────────────────── */}
            <TabsContent value="tracker" className="pt-5 space-y-4">
              {/* Progress bar */}
              {!isCompleted && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="uppercase tracking-wider font-medium">
                      Overall Progress
                    </span>
                    <span className="font-mono">
                      {doneDays} / {totalDays} planned days
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{
                        width: `${Math.min(100, (doneDays / totalDays) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {isCompleted && (
                <div className="p-4 border border-primary/20 bg-primary/5 rounded-sm flex items-center gap-3">
                  <PackageCheck className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      All Stages Complete — Spawn Stock Produced
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Check the History &amp; Output tab to see the produced
                      spawn stock and its destination.
                    </p>
                  </div>
                </div>
              )}

              {/* Stage cards — vertical list */}
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    9-Stage Preparation Pipeline
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Complete each stage in order. Two verification photos
                    required per stage.
                  </p>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  {STAGES.map((stage, idx) => {
                    const isDone =
                      isCompleted || completedStageKeys.has(stage.key);
                    const isActive =
                      !isCompleted && !isDone && stage.key === currentStage;
                    const isPending = !isDone && !isActive;
                    const log =
                      stageLogs.find((l: any) => l.stage === stage.key) ?? null;
                    const photos: string[] = log?.verificationImages ?? [];
                    const Icon = stage.icon;

                    return (
                      <div
                        key={stage.key}
                        className={`flex items-start gap-4 p-3 rounded-sm border-2 transition-all ${
                          isActive
                            ? "border-primary bg-primary/5 shadow-sm"
                            : isDone
                              ? "border-green-200 bg-green-50/40"
                              : "border-border bg-muted/10 opacity-60"
                        }`}
                      >
                        {/* Icon + connector */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                              isDone
                                ? "border-green-400 bg-green-50 text-green-700"
                                : isActive
                                  ? "border-primary bg-primary text-white"
                                  : "border-border bg-muted text-muted-foreground/50"
                            }`}
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : isActive ? (
                              <Clock className="w-4 h-4 animate-pulse" />
                            ) : (
                              <Icon className="w-4 h-4" />
                            )}
                          </div>
                          {idx < STAGES.length - 1 && (
                            <div
                              className={`w-0.5 h-3 ${isDone ? "bg-green-400" : "bg-border"}`}
                            />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p
                              className={`text-sm font-semibold ${
                                isDone
                                  ? "text-green-700"
                                  : isActive
                                    ? "text-primary"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {stage.label}
                            </p>
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                                isDone
                                  ? "bg-green-100 text-green-700"
                                  : isActive
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground/50"
                              }`}
                            >
                              {isDone
                                ? "Done"
                                : isActive
                                  ? "Active"
                                  : "Pending"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            ~{stage.days} days
                            {stageStartDates[stage.key] && (
                              <span className="ml-1">
                                · planned from {fmt(stageStartDates[stage.key])}
                              </span>
                            )}
                          </p>
                          {log?.enteredAt && (
                            <p className="text-[11px] text-muted-foreground">
                              Entered: {fmt(log.enteredAt)}
                              {log.exitedAt
                                ? ` · Exited: ${fmt(log.exitedAt)}`
                                : ""}
                            </p>
                          )}
                          {/* Photo thumbnails */}
                          {photos.length > 0 && (
                            <div className="flex gap-1.5 mt-2">
                              {photos
                                .slice(0, 2)
                                .map((img: string, i: number) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setLightboxSrc(img)}
                                    className="w-10 h-10 rounded-sm overflow-hidden border-2 border-green-300 hover:border-primary cursor-zoom-in"
                                  >
                                    <img
                                      src={img}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))}
                              <span className="text-[10px] text-muted-foreground self-end pb-0.5">
                                {photos.length} photo
                                {photos.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Complete button */}
                        {isActive && (
                          <Button
                            size="sm"
                            className="rounded-sm h-8 text-xs shrink-0"
                            onClick={() => openAdvDialog(stage.key)}
                          >
                            {stage.key === "QC"
                              ? "Complete & Produce ✓"
                              : "Complete ✓"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── HISTORY & OUTPUT ──────────────────────────────────────────── */}
            <TabsContent value="output" className="pt-5 space-y-4">
              {/* Stage history */}
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Stage History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {stageLogs.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      No stage transitions recorded yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Stage</th>
                            <th className="px-4 py-2.5 font-medium">Entered</th>
                            <th className="px-4 py-2.5 font-medium">Exited</th>
                            <th className="px-4 py-2.5 font-medium">Photos</th>
                            <th className="px-4 py-2.5 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {stageLogs.map((l: any, i: number) => {
                            const photos: string[] = l.verificationImages ?? [];
                            return (
                              <tr
                                key={l.id ?? i}
                                className="h-[44px] hover:bg-muted/20"
                              >
                                <td className="px-4 font-mono font-semibold text-xs">
                                  {l.stage.replace(/_/g, " ")}
                                </td>
                                <td className="px-4 font-mono text-xs text-muted-foreground">
                                  {fmt(l.enteredAt)}
                                </td>
                                <td className="px-4 font-mono text-xs text-muted-foreground">
                                  {fmt(l.exitedAt)}
                                </td>
                                <td className="px-4">
                                  {photos.length >= 2 ? (
                                    <div className="flex gap-1">
                                      {photos
                                        .slice(0, 2)
                                        .map((img: string, pi: number) => (
                                          <button
                                            key={pi}
                                            type="button"
                                            onClick={() => setLightboxSrc(img)}
                                            className="w-7 h-7 rounded-sm overflow-hidden border hover:border-primary cursor-zoom-in"
                                          >
                                            <img
                                              src={img}
                                              alt=""
                                              className="w-full h-full object-cover"
                                            />
                                          </button>
                                        ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                                  {l.notes ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Spawn output */}
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Produced Spawn Stock
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Strain</th>
                          <th className="px-4 py-2.5 font-medium">Date</th>
                          <th className="px-4 py-2.5 font-medium text-right">
                            Qty (kg)
                          </th>
                          <th className="px-4 py-2.5 font-medium">
                            Destination
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {spawnOutputs.map((o: any) => (
                          <tr key={o.id} className="h-[44px] hover:bg-muted/20">
                            <td className="px-4 font-medium">{o.strainName}</td>
                            <td className="px-4 font-mono text-xs text-muted-foreground">
                              {fmt(o.producedAt)}
                            </td>
                            <td className="px-4 font-mono text-right font-semibold">
                              {Number(o.quantityKg).toFixed(1)}
                            </td>
                            <td className="px-4">
                              <div className="flex items-center gap-1.5">
                                {o.status === "stocked" ? (
                                  <>
                                    <Warehouse className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                                      Inventory
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
                                    <span className="text-xs font-semibold text-sky-700 uppercase tracking-wider">
                                      Available for Annur
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {spawnOutputs.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="p-8 text-center text-sm text-muted-foreground"
                            >
                              No spawn stock produced yet. Complete the final
                              Shaking 2 stage to record output.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {spawnOutputs.length > 0 && (
                        <tfoot className="border-t-2 border-border bg-muted/50">
                          <tr className="h-[44px] font-bold">
                            <td
                              className="px-4 text-xs uppercase tracking-wider"
                              colSpan={2}
                            >
                              Total Produced
                            </td>
                            <td className="px-4 font-mono text-right text-primary text-base">
                              {spawnOutputs
                                .reduce(
                                  (s: number, o: any) =>
                                    s + Number(o.quantityKg),
                                  0,
                                )
                                .toFixed(1)}{" "}
                              kg
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LIGHTBOX                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <Dialog
        open={!!lightboxSrc}
        onOpenChange={(open) => !open && setLightboxSrc(null)}
      >
        <DialogContent className="max-w-2xl border-0 shadow-2xl p-0 bg-black/95">
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt=""
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          )}
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-3 right-3 text-white/70 hover:text-white text-sm font-medium bg-black/40 hover:bg-black/60 px-3 py-1 rounded-sm"
          >
            Close ✕
          </button>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ADVANCE STAGE DIALOG                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <Dialog
        open={advDialog.open}
        onOpenChange={(open) => {
          if (!open) closeAdvDialog();
        }}
      >
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Complete —{" "}
              {STAGES.find((s) => s.key === advDialog.stageKey)?.label}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Two verification photos are required to complete this stage.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Two photo slots */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Verification Photos (2 required)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([0, 1] as const).map((slot) => (
                  <div key={slot} className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Photo {slot + 1}
                    </p>
                    <input
                      ref={imgRef[slot]}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageFile(slot, f);
                      }}
                    />
                    {stageImages[slot] ? (
                      <div className="relative">
                        <img
                          src={stageImages[slot]!}
                          alt={`Photo ${slot + 1}`}
                          className="w-full h-28 object-cover rounded-sm border-2 border-green-400"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute bottom-1 right-1 h-6 text-[10px] rounded-sm bg-white/90"
                          onClick={() => imgRef[slot].current?.click()}
                        >
                          Retake
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => imgRef[slot].current?.click()}
                        className="w-full h-28 rounded-sm border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary"
                      >
                        <Camera className="w-6 h-6" />
                        <span className="text-xs font-medium">Take Photo</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {stageImages[0] ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
                {stageImages[1] ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
                <span
                  className={`text-xs font-medium ${imagesReady ? "text-green-700" : "text-muted-foreground"}`}
                >
                  {stageImages.filter(Boolean).length}/2 photos added
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes (optional)
              </Label>
              <Input
                value={advDialog.notes}
                onChange={(e) =>
                  setAdvDialog((p) => ({ ...p, notes: e.target.value }))
                }
                className="rounded-sm h-9"
                placeholder="Observations, condition notes…"
              />
            </div>

            {/* QC final stage: destination picker + spawn details */}
            {isFinalStage && (
              <div className="p-3 border border-primary/20 bg-primary/5 rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Spawn Output
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Strain Name *
                  </Label>
                  <Input
                    value={advDialog.strainName}
                    onChange={(e) =>
                      setAdvDialog((p) => ({
                        ...p,
                        strainName: e.target.value,
                      }))
                    }
                    className="rounded-sm h-9"
                    placeholder="e.g. A15 Button"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Quantity Produced (kg) *
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={advDialog.spawnQty}
                    onChange={(e) =>
                      setAdvDialog((p) => ({ ...p, spawnQty: e.target.value }))
                    }
                    className="rounded-sm h-9 font-mono"
                    placeholder="e.g. 52"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Destination *
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAdvDialog((p) => ({ ...p, destination: "annur" }))
                      }
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-sm border-2 transition-all text-center ${
                        advDialog.destination === "annur"
                          ? "border-sky-400 bg-sky-50"
                          : "border-border hover:border-sky-300"
                      }`}
                    >
                      <ArrowRight
                        className={`w-5 h-5 ${advDialog.destination === "annur" ? "text-sky-600" : "text-muted-foreground"}`}
                      />
                      <p
                        className={`text-xs font-semibold ${advDialog.destination === "annur" ? "text-sky-700" : "text-foreground"}`}
                      >
                        Available for Annur
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Spawn Mixing source
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdvDialog((p) => ({
                          ...p,
                          destination: "inventory",
                        }))
                      }
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-sm border-2 transition-all text-center ${
                        advDialog.destination === "inventory"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Warehouse
                        className={`w-5 h-5 ${advDialog.destination === "inventory" ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <p
                        className={`text-xs font-semibold ${advDialog.destination === "inventory" ? "text-primary" : "text-foreground"}`}
                      >
                        Stock to Inventory
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        For sale or later use
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={closeAdvDialog}
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={!canSubmit}
              onClick={handleAdvance}
            >
              {advanceMutation.isPending
                ? "Saving…"
                : !imagesReady
                  ? `Add ${2 - stageImages.filter(Boolean).length} more photo${stageImages.filter(Boolean).length === 1 ? "" : "s"}`
                  : isFinalStage
                    ? "Complete & Produce Spawn ✓"
                    : `Complete ${STAGES.find((s) => s.key === advDialog.stageKey)?.label} ✓`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
