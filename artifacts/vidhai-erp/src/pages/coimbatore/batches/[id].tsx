import { useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetCoimbatoreBatch,
  getGetCoimbatoreBatchQueryKey,
  useListMaterials,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Leaf,
  Lock,
  Plus,
  Trash2,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  RotateCcw,
  PackageCheck,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(base: Date | string, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function fmt(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TONS_KEYWORDS = ["coir pith", "press mud", "coir", "mud"];

function getUnit(name: string): "tons" | "kg" {
  return TONS_KEYWORDS.some((kw) => name?.toLowerCase().includes(kw))
    ? "tons"
    : "kg";
}

function toKg(displayQty: number, name: string): number {
  return getUnit(name) === "tons" ? displayQty * 1000 : displayQty;
}

const DEFAULT_FORMULATION = [
  { id: 1, name: "Coir Pith", qty: "10" },
  { id: 2, name: "Press Mud", qty: "10" },
  { id: 3, name: "Limestone", qty: "10" },
];

type TurnScheduleEntry = { turnNumber: number; intervalDays: number };

function parseTurnSchedule(value: unknown): TurnScheduleEntry[] {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => ({
      turnNumber: Number(entry?.turnNumber),
      intervalDays: Number(entry?.intervalDays),
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.turnNumber) &&
        entry.turnNumber > 0 &&
        Number.isFinite(entry.intervalDays) &&
        entry.intervalDays >= 0,
    );
}
function buildTurnSchedule(
  totalTurns: number,
  scheduleJson: unknown,
  batchCreatedAt: string | Date,
) {
  const parsed = parseTurnSchedule(scheduleJson);
  const base = new Date(batchCreatedAt);
  return Array.from({ length: totalTurns }, (_, i) => {
    const n = i + 1;
    let cumDays = 0;
    for (let t = 1; t <= n; t++) {
      const entry = parsed.find((s) => s.turnNumber === t);
      cumDays += entry?.intervalDays ?? (t <= 4 ? 10 : 6);
    }
    return { turnNumber: n, plannedDate: addDays(base, cumDays) };
  });
}

function buildScheduleFromConfig(
  totalTurns: number,
  earlyTurns: number,
  earlyDays: number,
  lateDays: number,
): { turnNumber: number; intervalDays: number }[] {
  return Array.from({ length: totalTurns }, (_, i) => ({
    turnNumber: i + 1,
    intervalDays: i + 1 <= earlyTurns ? earlyDays : lateDays,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoimbatoreBatchDetail() {
  const params = useParams();
  const batchId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: batch, isLoading } = useGetCoimbatoreBatch(batchId, {
    query: {
      enabled: !!batchId,
      queryKey: getGetCoimbatoreBatchQueryKey(batchId),
    },
  });
  const { data: materialsList } = useListMaterials();

  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey: getGetCoimbatoreBatchQueryKey(batchId),
    });

  const b = batch as any;
  const config = b?.config ?? null;
  const turns: any[] = b?.turns ?? [];
  const preparationStages: any[] = b?.preparationStages ?? [];
  const qcDecisions: any[] = b?.qcDecisions ?? [];
  const configuredTurns = Number(config?.totalTurns ?? 12);
  const totalTurns =
    Number.isInteger(configuredTurns) && configuredTurns > 0
      ? configuredTurns
      : 12;
  const { data: casingChambers = [] } = useQuery<any[]>({
    queryKey: ["coimbatore-casing-chambers"],
    queryFn: async () => {
      const response = await fetch("/api/chambers", { credentials: "include" });
      if (!response.ok) throw new Error("Unable to load casing-soil chambers");
      const rows = await response.json();
      return rows.filter(
        (row: any) =>
          row.locationCode === "C" && row.chamberType === "casing_soil",
      );
    },
  });
  const [assignDialog, setAssignDialog] = useState({
    open: false,
    turnNumber: 0,
    chamberId: "",
    stage: "" as "PRE_WETTING" | "MIXING" | "",
  });

  // ── Formulation local state (editable only in FORMULATION stage) ──────────
  const [formulationRows, setFormulationRows] =
    useState<{ id: number; name: string; qty: string }[]>(DEFAULT_FORMULATION);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatQty, setNewMatQty] = useState("");
  const [newMatUnit, setNewMatUnit] = useState<"tons" | "kg">("kg");

  const totalKg = formulationRows.reduce(
    (sum, r) => sum + toKg(parseFloat(r.qty) || 0, r.name),
    0,
  );

  // ── Turn configuration (at initiation) ───────────────────────────────────
  const [cfgTotalTurns, setCfgTotalTurns] = useState(12);
  const [cfgEarlyTurns, setCfgEarlyTurns] = useState(4);
  const [cfgEarlyDays, setCfgEarlyDays] = useState(10);
  const [cfgLateDays, setCfgLateDays] = useState(6);
  const [initialTemperature, setInitialTemperature] = useState("");
  const [initialMoisture, setInitialMoisture] = useState("");

  // ── Adjust-turns dialog (post-initiation) ─────────────────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjTotal, setAdjTotal] = useState(totalTurns);
  const [adjEarly, setAdjEarly] = useState(4);
  const [adjEarlyD, setAdjEarlyD] = useState(10);
  const [adjLateD, setAdjLateD] = useState(6);
  const [adjSaving, setAdjSaving] = useState(false);

  const openAdjust = () => {
    setAdjTotal(totalTurns);
    const existing = parseTurnSchedule(config?.turnScheduleJson);
    const firstLate = existing.findIndex((e) => e.intervalDays < 8);
    setAdjEarly(firstLate > 0 ? firstLate : 4);
    setAdjEarlyD(existing[0]?.intervalDays ?? 10);
    setAdjLateD(existing[existing.length - 1]?.intervalDays ?? 6);
    setAdjustOpen(true);
  };

  const handleSaveAdjust = async () => {
    setAdjSaving(true);
    try {
      const schedule = buildScheduleFromConfig(
        adjTotal,
        adjEarly,
        adjEarlyD,
        adjLateD,
      );
      const res = await fetch(`/api/coimbatore/batches/${batchId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          totalTurns: adjTotal,
          turnScheduleJson: schedule,
        }),
      });
      if (!res.ok) throw new Error("Failed to update turn config");
      toast.success("Turn configuration updated");
      refetch();
      setAdjustOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setAdjSaving(false);
    }
  };

  // ── Camera / lightbox state ───────────────────────────────────────────────
  const imgRef0 = useRef<HTMLInputElement>(null);
  const imgRef1 = useRef<HTMLInputElement>(null);
  const imgRef = [imgRef0, imgRef1] as const;
  const [stageImages, setStageImages] = useState<(string | null)[]>([
    null,
    null,
  ]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [preparationDialog, setPreparationDialog] = useState({
    open: false,
    stage: "" as "PRE_WETTING" | "MIXING" | "",
    notes: "",
  });

  const [completeDialog, setCompleteDialog] = useState({
    open: false,
    turnNumber: 0,
    actualDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const closeCompleteDialog = () => {
    setCompleteDialog((p) => ({ ...p, open: false }));
    setStageImages([null, null]);
  };

  const openCompleteDialog = (turnNumber: number) => {
    setStageImages([null, null]);
    setCompleteDialog({
      open: true,
      turnNumber,
      actualDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  // ── QC dialog ─────────────────────────────────────────────────────────────
  const savedMaterials: any[] = b?.materials ?? [];
  const savedTotalKg = savedMaterials.reduce((sum, material) => {
    const quantity = Number(material.weightKg);
    return sum + (Number.isFinite(quantity) ? quantity : 0);
  }, 0);

  const [qcDialog, setQcDialog] = useState({
    open: false,
    decision: "" as "approve" | "reject" | "",
    notes: "",
    producedKg: "",
  });

  const openQcDialog = () => {
    setQcDialog({
      open: true,
      decision: "",
      notes: "",
      producedKg: String(Math.round(savedTotalKg)),
    });
  };

  // ── Image handler ─────────────────────────────────────────────────────────
  const handleImageFile = (slot: 0 | 1, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setStageImages((prev) => {
        const next = [...prev];
        next[slot] = e.target?.result as string;
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────

  const initiateMutation = useMutation({
    mutationFn: async () => {
      const materials = formulationRows
        .map((r) => ({
          name: r.name,
          weightKg: toKg(parseFloat(r.qty) || 0, r.name),
        }))
        .filter((m) => m.weightKg > 0);

      const turnSchedule = buildScheduleFromConfig(
        cfgTotalTurns,
        cfgEarlyTurns,
        cfgEarlyDays,
        cfgLateDays,
      );

      const res = await fetch(`/api/coimbatore/batches/${batchId}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          materials,
          totalTurns: cfgTotalTurns,
          turnSchedule,
          initialTemperatureCelsius: initialTemperature,
          initialMoisturePercent: initialMoisture,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to initiate batch");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast.success("Batch initiated - Pre-wetting is now active");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to initiate"),
  });

  const completePreparationMutation = useMutation({
    mutationFn: async (payload: {
      stage: "PRE_WETTING" | "MIXING";
      notes: string | null;
      verificationImages: string[];
    }) => {
      const res = await fetch(
        `/api/coimbatore/batches/${batchId}/complete-preparation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error ?? "Failed to complete stage");
      }
      return res.json();
    },
    onSuccess: async (_data, payload) => {
      setPreparationDialog({ open: false, stage: "", notes: "" });
      setStageImages([null, null]);
      await queryClient.invalidateQueries({
        queryKey: getGetCoimbatoreBatchQueryKey(batchId),
      });
      toast.success(
        payload.stage === "PRE_WETTING"
          ? "Pre-wetting completed - Mixing is now active"
          : "Mixing completed - Turn tracker is now active",
      );
    },
    onError: (error: any) =>
      toast.error(error.message ?? "Failed to complete stage"),
  });
  const assignChamberMutation = useMutation({
    mutationFn: async ({
      turnNumber,
      chamberId,
      stage,
    }: {
      turnNumber: number;
      chamberId: number;
      stage?: "PRE_WETTING" | "MIXING";
    }) => {
      const endpoint = stage
        ? `/api/coimbatore/batches/${batchId}/preparation/${stage}/assign`
        : `/api/coimbatore/batches/${batchId}/turns/${turnNumber}/assign`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chamberId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error ?? "Unable to assign chamber");
      }
      return response.json();
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({
        queryKey: ["coimbatore-casing-chambers"],
      });
      setAssignDialog({ open: false, turnNumber: 0, chamberId: "", stage: "" });
      toast.success("Chamber assigned - open it to log the stage reading");
    },
    onError: (error: any) =>
      toast.error(error.message ?? "Unable to assign chamber"),
  });
  const completeTurnMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await fetch(`/api/coimbatore/batches/${batchId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      closeCompleteDialog();
      await queryClient.invalidateQueries({
        queryKey: getGetCoimbatoreBatchQueryKey(batchId),
      });
      queryClient.invalidateQueries({
        queryKey: ["coimbatore-casing-chambers"],
      });
      toast.success("Turn completed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const qcMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await fetch(`/api/coimbatore/batches/${batchId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      refetch();
      toast.success(
        vars.decision === "approve"
          ? "QC Approved — casing soil stocked into Inventory"
          : "QC Rejected — 3 additional turns added",
      );
      setQcDialog({ open: false, decision: "", notes: "", producedKg: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const turnSchedule = useMemo(() => {
    if (!b) return [];
    return buildTurnSchedule(
      totalTurns,
      config?.turnScheduleJson,
      b.createdAt ?? new Date(),
    );
  }, [b, config, totalTurns]);

  const completedCount = turns.length;
  const nextTurnNumber = completedCount + 1;
  const permanentChamber = b?.casingSoilChamberId
    ? {
        chamberId: b.casingSoilChamberId,
        chamberNameSnapshot:
          b.casingSoilChamberNameSnapshot ?? `Chamber ${b.casingSoilChamberId}`,
      }
    : null;
  const activeAssignment =
    b?.activeAssignment?.turnNumber === nextTurnNumber
      ? b.activeAssignment
      : permanentChamber;
  const activePreparationAssignment =
    b?.activePreparationAssignment ?? permanentChamber;
  const allTurnsDone = completedCount >= totalTurns;
  const imagesReady = stageImages[0] !== null && stageImages[1] !== null;
  const canSubmitTurn = !completeTurnMutation.isPending;

  const currentStage: string = b?.currentStage ?? "FORMULATION";
  const isFormulation = currentStage === "FORMULATION";
  const isPreWetting = currentStage === "PRE_WETTING";
  const isMixing = currentStage === "MIXING";
  const isPreparation = isPreWetting || isMixing;
  const isTurning = currentStage === "TURNING";
  const isQcPending = currentStage === "QC_PENDING";
  const isCompleted =
    currentStage === "COMPLETED" || currentStage === "READY_TO_SHIP";

  const displayTotalKg = isFormulation ? totalKg : savedTotalKg;

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
          onClick={() => setLocation("/coimbatore/batches")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Batches
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Leaf className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-mono font-bold tracking-tight text-primary">
                {b.batchCode}
              </h1>
              <Badge
                variant="outline"
                className={`border-0 rounded-sm text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 ${
                  isCompleted
                    ? "bg-primary/10 text-primary"
                    : isQcPending
                      ? "bg-amber-50 text-amber-700"
                      : isTurning
                        ? "bg-sky-50 text-sky-700"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStage.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Location C — Coimbatore &nbsp;·&nbsp; Created {fmt(b.createdAt)}
              {b.createdByName ? ` by ${b.createdByName}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            {b.casingSoilChamberNameSnapshot && (
              <div className="px-3 py-2 rounded-sm border border-primary/30 bg-primary/5 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                  Reserved chamber
                </span>
                <span className="font-mono font-bold text-primary">
                  {b.casingSoilChamberNameSnapshot}
                </span>
              </div>
            )}
            {b.casingSoilProducedQuantityKg != null && (
              <div className="px-3 py-2 rounded-sm border border-border bg-muted/30 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                  Produced
                </span>
                <span className="font-mono font-bold">
                  {Number(b.casingSoilProducedQuantityKg).toFixed(2)} kg
                </span>
              </div>
            )}
            <div className="px-3 py-2 rounded-sm border border-border bg-muted/30 text-sm">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                Input
              </span>
              <span className="font-mono font-bold">
                {(displayTotalKg / 1000).toFixed(2)} t
                <span className="text-muted-foreground text-xs ml-1">
                  ({displayTotalKg.toFixed(0)} kg)
                </span>
              </span>
            </div>
            {!isFormulation && (
              <div className="px-3 py-2 rounded-sm border border-border bg-muted/30 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1.5">
                  Turns
                </span>
                <span className="font-mono font-bold">
                  {completedCount} / {totalTurns}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FORMULATION STAGE                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {isFormulation && (
          <>
            {/* Materials table */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-0 border-b flex flex-row items-start justify-between">
                <div className="pb-4">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Casing Soil Formulation
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adjust quantities to match the actual batch. Coir Pith &amp;
                    Press Mud in <strong>tons</strong>; Limestone in{" "}
                    <strong>kg</strong>.
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
                          Quantity
                        </th>
                        <th className="px-6 py-3 font-medium">Unit</th>
                        <th className="px-6 py-3 font-medium text-right">
                          % of Mix
                        </th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {formulationRows.map((row) => {
                        const unit = getUnit(row.name);
                        const kgVal = toKg(parseFloat(row.qty) || 0, row.name);
                        const pct = totalKg > 0 ? (kgVal / totalKg) * 100 : 0;
                        return (
                          <tr
                            key={row.id}
                            className="h-[44px] hover:bg-muted/30"
                          >
                            <td className="px-6 font-medium">{row.name}</td>
                            <td className="px-6 text-right">
                              <input
                                type="number"
                                step={unit === "tons" ? "0.1" : "0.01"}
                                min="0"
                                value={row.qty}
                                onChange={(e) =>
                                  setFormulationRows((rows) =>
                                    rows.map((r) =>
                                      r.id === row.id
                                        ? { ...r, qty: e.target.value }
                                        : r,
                                    ),
                                  )
                                }
                                className="w-28 text-right font-mono bg-transparent border-b border-dashed border-muted-foreground/40 focus:border-primary focus:outline-none py-0.5"
                              />
                            </td>
                            <td className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              {unit}
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
                            <Select
                              value={newMatName}
                              onValueChange={(v) => {
                                setNewMatName(v);
                                setNewMatUnit(getUnit(v));
                              }}
                            >
                              <SelectTrigger className="h-8 rounded-sm text-xs border-dashed w-44">
                                <SelectValue placeholder="Select material" />
                              </SelectTrigger>
                              <SelectContent>
                                {materialsList?.map((m: any) => (
                                  <SelectItem key={m.id} value={m.name}>
                                    {m.name}
                                  </SelectItem>
                                ))}
                                <SelectItem value="__custom__">
                                  Custom…
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-6 text-right">
                            <input
                              type="number"
                              step={newMatUnit === "tons" ? "0.1" : "0.01"}
                              min="0"
                              placeholder={newMatUnit}
                              value={newMatQty}
                              onChange={(e) => setNewMatQty(e.target.value)}
                              className="w-24 text-right font-mono bg-transparent border border-dashed border-primary/50 rounded px-2 py-1 text-xs focus:outline-none"
                            />
                          </td>
                          <td className="px-6">
                            <Select
                              value={newMatUnit}
                              onValueChange={(v) =>
                                setNewMatUnit(v as "tons" | "kg")
                              }
                            >
                              <SelectTrigger className="h-7 rounded-sm text-xs border-dashed w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="tons">tons</SelectItem>
                                <SelectItem value="kg">kg</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-6 text-right text-muted-foreground text-xs">
                            —
                          </td>
                          <td className="px-4 text-right">
                            <button
                              onClick={() => {
                                if (!newMatName || !newMatQty) return;
                                const name =
                                  newMatName === "__custom__"
                                    ? "Custom"
                                    : newMatName;
                                setFormulationRows((rows) => [
                                  ...rows,
                                  { id: Date.now(), name, qty: newMatQty },
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
                            colSpan={5}
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
                          <td
                            className="px-6 text-xs uppercase tracking-wider"
                            colSpan={2}
                          >
                            Total
                          </td>
                          <td className="px-6 text-xs text-muted-foreground">
                            kg
                          </td>
                          <td className="px-6 font-mono text-right text-primary text-base">
                            {totalKg.toFixed(0)} kg
                            <span className="text-sm text-muted-foreground ml-1.5">
                              ({(totalKg / 1000).toFixed(2)} t)
                            </span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Turn Configuration */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Turn Configuration
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure the turning schedule for this batch. These settings
                  can be adjusted later during the turning phase.
                </p>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total Turns
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgTotalTurns}
                      onChange={(e) => setCfgTotalTurns(Number(e.target.value))}
                      className="rounded-sm h-9 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      e.g. 12 (extendable via QC reject)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Early Phase Turns
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgEarlyTurns}
                      onChange={(e) => setCfgEarlyTurns(Number(e.target.value))}
                      className="rounded-sm h-9 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      First N turns (e.g. 4)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Early Interval (days)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgEarlyDays}
                      onChange={(e) => setCfgEarlyDays(Number(e.target.value))}
                      className="rounded-sm h-9 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Days between early turns (e.g. 10)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Late Interval (days)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgLateDays}
                      onChange={(e) => setCfgLateDays(Number(e.target.value))}
                      className="rounded-sm h-9 font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Days between remaining turns (e.g. 6)
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-muted/30 rounded-sm text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Schedule preview:{" "}
                  </span>
                  T1–T{cfgEarlyTurns} every {cfgEarlyDays} days, T
                  {cfgEarlyTurns + 1}–T{cfgTotalTurns} every {cfgLateDays} days
                  · Total: ~
                  {cfgEarlyTurns * cfgEarlyDays +
                    (cfgTotalTurns - cfgEarlyTurns) * cfgLateDays}{" "}
                  days
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Initial Process Readings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Initial Temperature (�C) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={initialTemperature}
                    onChange={(e) => setInitialTemperature(e.target.value)}
                    className="rounded-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Initial Moisture (%) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={initialMoisture}
                    onChange={(e) => setInitialMoisture(e.target.value)}
                    className="rounded-sm"
                  />
                </div>
              </CardContent>
            </Card>
            {/* Initiate CTA */}
            <div className="p-5 border border-border rounded-sm bg-muted/10 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Review the formulation quantities and turn schedule above, then
                click <strong>Initiate Batch</strong> to lock the formulation
                and begin the sequential turn tracker.
              </p>
              <Button
                className="rounded-sm h-10 px-6 shrink-0 gap-2"
                disabled={
                  formulationRows.length === 0 ||
                  !initialTemperature ||
                  !initialMoisture ||
                  initiateMutation.isPending
                }
                onClick={() => initiateMutation.mutate()}
              >
                {initiateMutation.isPending ? "Initiating…" : "Initiate Batch"}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* POST-FORMULATION: TABS                                               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {(isPreparation || isTurning || isQcPending || isCompleted) && (
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
                Turn Tracker
              </TabsTrigger>
            </TabsList>

            {/* ── FORMULATION RECORD (locked read-only) ─────────────────── */}
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
                        Read-only snapshot of the casing soil materials as
                        recorded at batch initiation.
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
                      No formulation data available for this batch.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-6 py-3 font-medium">Material</th>
                            <th className="px-6 py-3 font-medium text-right">
                              Quantity
                            </th>
                            <th className="px-6 py-3 font-medium">Unit</th>
                            <th className="px-6 py-3 font-medium text-right">
                              % of Mix
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {savedMaterials.map((m: any) => {
                            const parsedKg = Number(m.weightKg);
                            const kgVal = Number.isFinite(parsedKg)
                              ? parsedKg
                              : 0;
                            const materialLabel =
                              m.materialName ??
                              m.notes?.replace(
                                /^Formulation material:\s*/i,
                                "",
                              ) ??
                              "";
                            const unit = getUnit(materialLabel);
                            const display =
                              unit === "tons"
                                ? (kgVal / 1000).toFixed(2)
                                : kgVal.toFixed(0);
                            const pct =
                              savedTotalKg > 0
                                ? (kgVal / savedTotalKg) * 100
                                : 0;
                            return (
                              <tr key={m.id} className="h-[44px] bg-muted/5">
                                <td className="px-6 font-medium">
                                  {m.materialName ??
                                    m.notes?.replace(
                                      /^Formulation material:\s*/i,
                                      "",
                                    ) ??
                                    `Archived material #${m.materialId}`}
                                </td>
                                <td className="px-6 font-mono text-right font-semibold">
                                  {display}
                                </td>
                                <td className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  {unit}
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
                            <td
                              className="px-6 text-xs uppercase tracking-wider"
                              colSpan={2}
                            >
                              Total Input
                            </td>
                            <td className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              kg
                            </td>
                            <td className="px-6 font-mono text-right text-primary text-base">
                              {savedTotalKg.toFixed(0)} kg
                              <span className="text-sm text-muted-foreground ml-1.5">
                                ({(savedTotalKg / 1000).toFixed(2)} t)
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {config &&
                (config.initialTemperatureCelsius != null ||
                  config.initialMoisturePercent != null) && (
                  <Card className="rounded-sm border-border shadow-none mt-4">
                    <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Initial Temperature
                        </p>
                        <p className="font-mono font-semibold">
                          {Number(
                            config.initialTemperatureCelsius ?? 0,
                          ).toFixed(2)}{" "}
                          �C
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">
                          Initial Moisture
                        </p>
                        <p className="font-mono font-semibold">
                          {Number(config.initialMoisturePercent ?? 0).toFixed(
                            2,
                          )}{" "}
                          %
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              {/* Turn config summary */}
              {config && (
                <Card className="rounded-sm border-border shadow-none mt-4">
                  <CardHeader className="pb-2 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Settings2 className="w-3.5 h-3.5" /> Turn Configuration
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 text-xs text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">
                        {config.totalTurns} total turns
                      </span>{" "}
                      configured at initiation. Schedule:{" "}
                      {(() => {
                        const sched = parseTurnSchedule(
                          config.turnScheduleJson,
                        );
                        if (!sched.length)
                          return "Default (T1–T4: 10 days, T5+: 6 days)";
                        const earlyEnd = sched.findIndex(
                          (s, i) =>
                            i > 0 && s.intervalDays !== sched[0].intervalDays,
                        );
                        const earlyN = earlyEnd > 0 ? earlyEnd : sched.length;
                        return `T1–T${earlyN}: ${sched[0].intervalDays} days, T${earlyN + 1}–T${sched.length}: ${sched[sched.length - 1].intervalDays} days`;
                      })()}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── TURN TRACKER ──────────────────────────────────────────── */}
            <TabsContent value="tracker" className="pt-5 space-y-4">
              {/* Stage Pipeline */}
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Casing Soil Stage Pipeline
                      </CardTitle>
                      {!isCompleted && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Complete Pre-wetting and Mixing first, then complete
                          every turn in order with two verification photos.
                          {isQcPending && (
                            <span className="ml-1 text-amber-600 font-medium">
                              All turns complete — awaiting QC decision.
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {(isTurning || isQcPending) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-sm h-8 text-xs gap-1.5"
                        onClick={openAdjust}
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Adjust Turns
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {isCompleted ? (
                    <div className="p-4 border border-primary/20 bg-primary/5 rounded-sm flex items-center gap-3">
                      <PackageCheck className="w-5 h-5 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-primary">
                          Batch Complete — Casing Soil Stocked to Inventory
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          This batch passed QC. The produced casing soil has
                          been added to Inventory.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <div className="flex gap-2 min-w-max pb-2">
                        {(
                          [
                            { key: "PRE_WETTING", label: "Pre-wetting" },
                            { key: "MIXING", label: "Mixing" },
                          ] as const
                        ).map((stage, index) => {
                          const isActive = currentStage === stage.key;
                          const isDone =
                            stage.key === "PRE_WETTING"
                              ? currentStage !== "PRE_WETTING"
                              : !["PRE_WETTING", "MIXING"].includes(
                                  currentStage,
                                );
                          return (
                            <div
                              key={stage.key}
                              className="flex items-center gap-2"
                            >
                              <div
                                className={`w-40 rounded-sm border-2 p-3 transition-all ${
                                  isActive
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : isDone
                                      ? "border-green-300 bg-green-50/50"
                                      : "border-border bg-muted/20 opacity-60"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  {isDone ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : isActive ? (
                                    <Clock className="w-4 h-4 text-primary animate-pulse" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground/40" />
                                  )}
                                  <span
                                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                                      isActive
                                        ? "text-primary"
                                        : isDone
                                          ? "text-green-700"
                                          : "text-muted-foreground/50"
                                    }`}
                                  >
                                    {isActive
                                      ? "Active"
                                      : isDone
                                        ? "Done"
                                        : "Pending"}
                                  </span>
                                </div>
                                <p
                                  className={`text-sm font-bold mb-1 ${!isDone && !isActive ? "text-muted-foreground" : "text-foreground"}`}
                                >
                                  {stage.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  Preparation stage {index + 1}
                                </p>
                                {isActive && !activePreparationAssignment && (
                                  <Button
                                    size="sm"
                                    className="w-full mt-3 h-7 text-xs rounded-sm"
                                    onClick={() =>
                                      setAssignDialog({
                                        open: true,
                                        turnNumber: 0,
                                        chamberId: "",
                                        stage: stage.key,
                                      })
                                    }
                                  >
                                    Assign Chamber
                                  </Button>
                                )}
                                {isActive && activePreparationAssignment && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-primary">
                                      {
                                        activePreparationAssignment.chamberNameSnapshot
                                      }
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full h-7 text-[10px] rounded-sm"
                                      onClick={() =>
                                        setLocation(
                                          `/coimbatore/chambers?reading=${activePreparationAssignment.chamberId}`,
                                        )
                                      }
                                    >
                                      Log Reading
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="w-full h-7 text-xs rounded-sm"
                                      onClick={() => {
                                        setStageImages([null, null]);
                                        setPreparationDialog({
                                          open: true,
                                          stage: stage.key,
                                          notes: "",
                                        });
                                      }}
                                    >
                                      Complete
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div
                                className={`w-4 h-0.5 shrink-0 ${isDone ? "bg-green-400" : "bg-border"}`}
                              />
                            </div>
                          );
                        })}

                        {turnSchedule.map((slot, idx) => {
                          const logged =
                            turns.find(
                              (t: any) => t.turnNumber === slot.turnNumber,
                            ) ?? null;
                          const isCompletedSlot = !!logged;
                          const isActive =
                            !isCompletedSlot &&
                            turns.length === idx &&
                            isTurning;

                          return (
                            <div
                              key={slot.turnNumber}
                              className="flex items-center gap-2"
                            >
                              <div
                                className={`w-36 rounded-sm border-2 p-3 transition-all ${
                                  isActive
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : isCompletedSlot
                                      ? "border-green-300 bg-green-50/50"
                                      : "border-border bg-muted/20 opacity-60"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  {isCompletedSlot ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  ) : isActive ? (
                                    <Clock className="w-4 h-4 text-primary animate-pulse" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground/40" />
                                  )}
                                  <span
                                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                                      isActive
                                        ? "text-primary"
                                        : isCompletedSlot
                                          ? "text-green-700"
                                          : "text-muted-foreground/50"
                                    }`}
                                  >
                                    {isActive
                                      ? "Active"
                                      : isCompletedSlot
                                        ? "Done"
                                        : "Pending"}
                                  </span>
                                </div>
                                <p
                                  className={`text-sm font-bold mb-1 ${!isCompletedSlot && !isActive ? "text-muted-foreground" : "text-foreground"}`}
                                >
                                  T{slot.turnNumber}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {fmt(slot.plannedDate)}
                                </p>
                                {isCompletedSlot && logged.actualDate && (
                                  <p className="text-[10px] text-green-700 font-mono">
                                    Done {fmt(logged.actualDate)}
                                  </p>
                                )}
                                {isActive && !activeAssignment && (
                                  <Button
                                    size="sm"
                                    className="w-full mt-3 h-7 text-xs rounded-sm"
                                    onClick={() =>
                                      setAssignDialog({
                                        open: true,
                                        turnNumber: slot.turnNumber,
                                        chamberId: "",
                                        stage: "",
                                      })
                                    }
                                  >
                                    Assign Chamber
                                  </Button>
                                )}
                                {isActive && activeAssignment && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-[10px] font-semibold text-primary">
                                      {activeAssignment.chamberNameSnapshot}
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full h-7 text-[10px] rounded-sm"
                                      onClick={() =>
                                        setLocation(
                                          `/coimbatore/chambers?reading=${activeAssignment.chamberId}`,
                                        )
                                      }
                                    >
                                      Log Reading
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="w-full h-7 text-xs rounded-sm"
                                      onClick={() =>
                                        openCompleteDialog(slot.turnNumber)
                                      }
                                    >
                                      Complete ?
                                    </Button>
                                  </div>
                                )}
                                {isCompletedSlot &&
                                  logged.verificationImages?.length > 0 && (
                                    <div className="flex gap-1 mt-2">
                                      {logged.verificationImages
                                        .slice(0, 2)
                                        .map((img: string, i: number) => (
                                          <button
                                            key={i}
                                            type="button"
                                            onClick={() => setLightboxSrc(img)}
                                            className="w-8 h-8 rounded-sm overflow-hidden border border-green-300 hover:border-primary cursor-zoom-in"
                                          >
                                            <img
                                              src={img}
                                              className="w-full h-full object-cover"
                                              alt=""
                                            />
                                          </button>
                                        ))}
                                    </div>
                                  )}
                              </div>
                              <div
                                className={`w-4 h-0.5 shrink-0 ${isCompletedSlot ? "bg-green-400" : "bg-border"}`}
                              />
                            </div>
                          );
                        })}

                        {/* QC Approval card */}
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-40 rounded-sm border-2 p-3 transition-all ${
                              isCompleted
                                ? "border-primary bg-primary/5"
                                : isQcPending
                                  ? "border-amber-400 bg-amber-50/60 shadow-sm"
                                  : "border-border bg-muted/20 opacity-60"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              {isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-primary" />
                              ) : isQcPending ? (
                                <ShieldCheck className="w-4 h-4 text-amber-600 animate-pulse" />
                              ) : (
                                <Circle className="w-4 h-4 text-muted-foreground/40" />
                              )}
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wider ${
                                  isCompleted
                                    ? "text-primary"
                                    : isQcPending
                                      ? "text-amber-700"
                                      : "text-muted-foreground/50"
                                }`}
                              >
                                {isCompleted
                                  ? "Approved"
                                  : isQcPending
                                    ? "Active"
                                    : "Pending"}
                              </span>
                            </div>
                            <p
                              className={`text-sm font-bold mb-1 ${!isQcPending && !isCompleted ? "text-muted-foreground" : "text-foreground"}`}
                            >
                              QC Approval
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Manual gate
                            </p>
                            {isQcPending && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-3 h-7 text-xs rounded-sm border-amber-400 text-amber-700 hover:bg-amber-50"
                                onClick={openQcDialog}
                              >
                                Submit Decision
                              </Button>
                            )}
                            {qcDecisions.filter(
                              (q: any) => q.decision === "reject",
                            ).length > 0 &&
                              !isCompleted && (
                                <div className="flex items-center gap-1 mt-2">
                                  <RotateCcw className="w-3 h-3 text-amber-600" />
                                  <span className="text-[10px] text-amber-600">
                                    {
                                      qcDecisions.filter(
                                        (q: any) => q.decision === "reject",
                                      ).length
                                    }
                                    × rejected
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(isTurning || isQcPending) && totalTurns > 0 && (
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="uppercase tracking-wider">
                          Turning Progress
                        </span>
                        <span className="font-mono">
                          {completedCount} / {totalTurns} turns
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all rounded-full"
                          style={{
                            width: `${Math.min(100, (completedCount / totalTurns) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preparation History Log */}
              {preparationStages.length > 0 && (
                <Card className="rounded-sm border-border shadow-none">
                  <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Preparation History Log
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {preparationStages.map((record: any) => (
                        <div
                          key={record.id}
                          className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-muted/20"
                        >
                          <div className="min-w-28">
                            <p className="text-xs font-bold text-primary">
                              {record.stage === "PRE_WETTING"
                                ? "Pre-wetting"
                                : "Mixing"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(record.completedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            {(record.verificationImages ?? [])
                              .slice(0, 2)
                              .map((img: string, index: number) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => setLightboxSrc(img)}
                                  className="w-10 h-10 rounded-sm overflow-hidden border hover:border-primary cursor-zoom-in"
                                >
                                  <img
                                    src={img}
                                    className="w-full h-full object-cover"
                                    alt={`${record.stage} photo ${index + 1}`}
                                  />
                                </button>
                              ))}
                          </div>
                          <p className="text-xs text-muted-foreground flex-1 min-w-40">
                            {record.notes || "No notes"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* Turn History Log */}
              {turns.length > 0 && (
                <Card className="rounded-sm border-border shadow-none">
                  <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Turn History Log
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Turn</th>
                            <th className="px-4 py-2.5 font-medium">Planned</th>
                            <th className="px-4 py-2.5 font-medium">Actual</th>
                            <th className="px-4 py-2.5 font-medium">Chamber</th>
                            <th className="px-4 py-2.5 font-medium">Temp �C</th>
                            <th className="px-4 py-2.5 font-medium">NH3 ppm</th>
                            <th className="px-4 py-2.5 font-medium">CO2 %</th>
                            <th className="px-4 py-2.5 font-medium">
                              Moisture %
                            </th>
                            <th className="px-4 py-2.5 font-medium">Photos</th>
                            <th className="px-4 py-2.5 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {turnSchedule.map((slot) => {
                            const logged =
                              turns.find(
                                (t: any) => t.turnNumber === slot.turnNumber,
                              ) ?? null;
                            return (
                              <tr
                                key={slot.turnNumber}
                                className={`h-[38px] ${logged ? "hover:bg-muted/20" : "opacity-50"}`}
                              >
                                <td className="px-4">
                                  <span
                                    className={`text-xs font-bold font-mono ${logged ? "text-primary" : "text-muted-foreground"}`}
                                  >
                                    T{slot.turnNumber}
                                  </span>
                                </td>
                                <td className="px-4 font-mono text-xs text-muted-foreground">
                                  {fmt(slot.plannedDate)}
                                </td>
                                <td className="px-4 font-mono text-xs">
                                  {logged ? fmt(logged.actualDate) : "—"}
                                </td>
                                <td className="px-4 text-xs font-semibold">
                                  {logged?.chamberNameSnapshot ??
                                    "Legacy � not recorded"}
                                </td>
                                <td className="px-4 font-mono text-xs">
                                  {logged?.temperatureCelsius ?? "�"}
                                </td>
                                <td className="px-4 font-mono text-xs">
                                  {logged?.nh3Ppm ?? "�"}
                                </td>
                                <td className="px-4 font-mono text-xs">
                                  {logged?.co2Percent ?? "�"}
                                </td>
                                <td className="px-4 font-mono text-xs">
                                  {logged?.moisturePercent ?? "�"}
                                </td>
                                <td className="px-4">
                                  {logged &&
                                  logged.verificationImages?.length > 0 ? (
                                    <div className="flex gap-1">
                                      {logged.verificationImages
                                        .slice(0, 2)
                                        .map((img: string, i: number) => (
                                          <button
                                            key={i}
                                            type="button"
                                            onClick={() => setLightboxSrc(img)}
                                            className="w-7 h-7 rounded-sm overflow-hidden border hover:border-primary cursor-zoom-in"
                                          >
                                            <img
                                              src={img}
                                              className="w-full h-full object-cover"
                                              alt=""
                                            />
                                          </button>
                                        ))}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground/40">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                                  {logged?.notes ?? "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* QC Decision History */}
              {qcDecisions.length > 0 && (
                <Card className="rounded-sm border-border shadow-none">
                  <CardHeader className="pb-2 border-b">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      QC Decision History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {qcDecisions.map((qc: any) => (
                        <div
                          key={qc.id}
                          className={`flex items-start gap-3 px-4 py-3 ${qc.decision === "approve" ? "bg-primary/5" : "bg-red-50/40"}`}
                        >
                          {qc.decision === "approve" ? (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p
                              className={`text-xs font-semibold uppercase tracking-wider ${qc.decision === "approve" ? "text-primary" : "text-destructive"}`}
                            >
                              {qc.decision === "approve"
                                ? "Approved"
                                : "Rejected"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(qc.decidedAt).toLocaleString()}
                              {qc.notes ? ` · "${qc.notes}"` : ""}
                              {qc.decision === "reject" &&
                                " · 3 additional turns added"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
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

      {/* ── Adjust Turns dialog ────────────────────────────────────────────── */}
      <Dialog
        open={adjustOpen}
        onOpenChange={(open) => !open && setAdjustOpen(false)}
      >
        <DialogContent className="rounded-sm shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Adjust Turn Configuration
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Update the remaining turn schedule. Only future (uncompleted)
              turns are affected.
            </p>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Total Turns (min: {completedCount})
                </Label>
                <Input
                  type="number"
                  min={completedCount}
                  step="1"
                  value={adjTotal}
                  onChange={(e) => setAdjTotal(Number(e.target.value))}
                  className="rounded-sm h-9 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Early Phase Turns
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={adjEarly}
                  onChange={(e) => setAdjEarly(Number(e.target.value))}
                  className="rounded-sm h-9 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Early Interval (days)
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={adjEarlyD}
                  onChange={(e) => setAdjEarlyD(Number(e.target.value))}
                  className="rounded-sm h-9 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Late Interval (days)
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={adjLateD}
                  onChange={(e) => setAdjLateD(Number(e.target.value))}
                  className="rounded-sm h-9 font-mono"
                />
              </div>
            </div>
            <div className="p-3 bg-muted/30 rounded-sm text-xs text-muted-foreground">
              T1–T{adjEarly}: {adjEarlyD} days · T{adjEarly + 1}–T{adjTotal}:{" "}
              {adjLateD} days · Total: ~
              {adjEarly * adjEarlyD + (adjTotal - adjEarly) * adjLateD} days
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => setAdjustOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={adjSaving || adjTotal < completedCount}
              onClick={handleSaveAdjust}
            >
              {adjSaving ? "Saving…" : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete preparation stage dialog */}
      <Dialog
        open={preparationDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setPreparationDialog({ open: false, stage: "", notes: "" });
            setStageImages([null, null]);
          }
        }}
      >
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Complete{" "}
              {preparationDialog.stage === "PRE_WETTING"
                ? "Pre-wetting"
                : "Mixing"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Photos are optional. Added photos will be preserved in the batch
              history.
            </p>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Verification Photos (optional)
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
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleImageFile(slot, file);
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
              <p
                className={`mt-2 text-xs font-medium ${imagesReady ? "text-green-700" : "text-muted-foreground"}`}
              >
                {stageImages.filter(Boolean).length}/2 photos added
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes (optional)
              </Label>
              <Input
                value={preparationDialog.notes}
                onChange={(event) =>
                  setPreparationDialog((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
                className="rounded-sm h-9"
                placeholder="Preparation observations..."
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => {
                setPreparationDialog({ open: false, stage: "", notes: "" });
                setStageImages([null, null]);
              }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={completePreparationMutation.isPending}
              onClick={() =>
                completePreparationMutation.mutate({
                  stage: preparationDialog.stage as "PRE_WETTING" | "MIXING",
                  notes: preparationDialog.notes || null,
                  verificationImages: stageImages.filter(Boolean) as string[],
                })
              }
            >
              {completePreparationMutation.isPending
                ? "Saving..."
                : "Complete Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Complete Turn dialog ────────────────────────────────────────────── */}
      <Dialog
        open={assignDialog.open}
        onOpenChange={(open) =>
          !open &&
          setAssignDialog({
            open: false,
            turnNumber: 0,
            chamberId: "",
            stage: "",
          })
        }
      >
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>
              Assign Chamber for{" "}
              {assignDialog.stage
                ? assignDialog.stage === "PRE_WETTING"
                  ? "Pre-wetting"
                  : "Mixing"
                : `T${assignDialog.turnNumber}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <Label>Available Casing Soil Chamber</Label>
            <Select
              value={assignDialog.chamberId}
              onValueChange={(value) =>
                setAssignDialog((p) => ({ ...p, chamberId: value }))
              }
            >
              <SelectTrigger className="rounded-sm">
                <SelectValue placeholder="Select an idle chamber" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {casingChambers
                  .filter(
                    (chamber: any) =>
                      chamber.status === "idle" && !chamber.currentBatchId,
                  )
                  .map((chamber: any) => (
                    <SelectItem key={chamber.id} value={String(chamber.id)}>
                      {chamber.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {casingChambers.filter(
              (chamber: any) =>
                chamber.status === "idle" && !chamber.currentBatchId,
            ).length === 0 && (
              <p className="text-xs text-destructive">
                No casing-soil chambers are currently available.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setAssignDialog({
                  open: false,
                  turnNumber: 0,
                  chamberId: "",
                  stage: "",
                })
              }
            >
              Cancel
            </Button>
            <Button
              disabled={
                !assignDialog.chamberId || assignChamberMutation.isPending
              }
              onClick={() =>
                assignChamberMutation.mutate({
                  turnNumber: assignDialog.turnNumber,
                  chamberId: Number(assignDialog.chamberId),
                  stage: assignDialog.stage || undefined,
                })
              }
            >
              {assignDialog.stage
                ? "Assign & Start Stage"
                : "Assign & Start Turn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={completeDialog.open}
        onOpenChange={(open) => {
          if (!open) closeCompleteDialog();
        }}
      >
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Complete Turn T{completeDialog.turnNumber}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Photos are optional for this turn.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Verification Photos (optional)
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

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Actual Date
              </Label>
              <Input
                type="date"
                value={completeDialog.actualDate}
                onChange={(e) =>
                  setCompleteDialog((p) => ({
                    ...p,
                    actualDate: e.target.value,
                  }))
                }
                className="rounded-sm h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Notes (optional)
              </Label>
              <Input
                value={completeDialog.notes}
                onChange={(e) =>
                  setCompleteDialog((p) => ({ ...p, notes: e.target.value }))
                }
                className="rounded-sm h-9"
                placeholder="Substrate condition, observations…"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={closeCompleteDialog}
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={!canSubmitTurn}
              onClick={() => {
                completeTurnMutation.mutate({
                  turnNumber: completeDialog.turnNumber,
                  actualDate: completeDialog.actualDate,
                  notes: completeDialog.notes || null,
                  verificationImages: stageImages.filter(Boolean),
                });
              }}
            >
              {completeTurnMutation.isPending
                ? "Saving..."
                : `Mark T${completeDialog.turnNumber} Complete`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QC Decision dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={qcDialog.open}
        onOpenChange={(open) => {
          if (!open) setQcDialog((p) => ({ ...p, open: false }));
        }}
      >
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" /> QC Approval —{" "}
              {b?.batchCode}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Inspect the substrate quality. Approve to stock into Inventory, or
              Reject to add 3 more conditioning turns.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setQcDialog((p) => ({ ...p, decision: "approve" }))
                }
                className={`flex flex-col items-center gap-2 p-4 rounded-sm border-2 transition-all ${
                  qcDialog.decision === "approve"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <CheckCircle2
                  className={`w-6 h-6 ${qcDialog.decision === "approve" ? "text-primary" : "text-muted-foreground"}`}
                />
                <div className="text-center">
                  <p
                    className={`text-sm font-semibold ${qcDialog.decision === "approve" ? "text-primary" : "text-foreground"}`}
                  >
                    Approve
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Stock into Inventory
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setQcDialog((p) => ({ ...p, decision: "reject" }))
                }
                className={`flex flex-col items-center gap-2 p-4 rounded-sm border-2 transition-all ${
                  qcDialog.decision === "reject"
                    ? "border-destructive bg-destructive/5"
                    : "border-border hover:border-destructive/50"
                }`}
              >
                <RotateCcw
                  className={`w-6 h-6 ${qcDialog.decision === "reject" ? "text-destructive" : "text-muted-foreground"}`}
                />
                <div className="text-center">
                  <p
                    className={`text-sm font-semibold ${qcDialog.decision === "reject" ? "text-destructive" : "text-foreground"}`}
                  >
                    Reject
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Add 3 more turns
                  </p>
                </div>
              </button>
            </div>

            {qcDialog.decision === "approve" && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Stock Quantity
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Produced Quantity (kg)
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={`~${savedTotalKg.toFixed(0)} kg (formulation total)`}
                    key={`produced-${b.id}-${qcDialog.decision}`}
                    defaultValue={qcDialog.producedKg}
                    onKeyDown={(e) => e.stopPropagation()}
                    onInput={(e) =>
                      setQcDialog((p) => ({
                        ...p,
                        producedKg: e.currentTarget.value,
                      }))
                    }
                    className="rounded-sm h-9 font-mono"
                  />
                </div>
              </div>
            )}

            {qcDialog.decision === "reject" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Rejecting will add <strong>3 more turns</strong> (T
                  {completedCount + 1}–T{completedCount + 3}) to the schedule.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                {qcDialog.decision === "reject"
                  ? "Rejection Reason *"
                  : "Notes (optional)"}
              </Label>
              <Input
                value={qcDialog.notes}
                onChange={(e) =>
                  setQcDialog((p) => ({ ...p, notes: e.target.value }))
                }
                className="rounded-sm h-9"
                placeholder={
                  qcDialog.decision === "reject"
                    ? "Reason for rejection…"
                    : "Quality observations…"
                }
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => setQcDialog((p) => ({ ...p, open: false }))}
            >
              Cancel
            </Button>
            <Button
              className={`rounded-sm ${qcDialog.decision === "reject" ? "bg-destructive hover:bg-destructive/90" : ""}`}
              disabled={
                !qcDialog.decision ||
                (qcDialog.decision === "reject" && !qcDialog.notes) ||
                qcMutation.isPending
              }
              onClick={() => {
                qcMutation.mutate({
                  decision: qcDialog.decision,
                  notes: qcDialog.notes || null,
                  producedQuantityKg: qcDialog.producedKg
                    ? Number(qcDialog.producedKg)
                    : null,
                });
              }}
            >
              {qcMutation.isPending
                ? "Saving…"
                : !qcDialog.decision
                  ? "Select a decision"
                  : qcDialog.decision === "approve"
                    ? "Approve & Stock Inventory ✓"
                    : "Reject & Add 3 Turns"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
