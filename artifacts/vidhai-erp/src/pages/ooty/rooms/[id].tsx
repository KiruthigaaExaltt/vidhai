import { useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetOotyRoom,
  getGetOotyRoomQueryKey,
  getListOotyRoomsQueryKey,
  useGetOotyGrowingBatch,
  getGetOotyGrowingBatchQueryKey,
  useAddOotyObservation,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Circle,
  Thermometer,
  Sprout,
  Layers,
  Scissors,
  Flame,
  GitBranch,
  AlertTriangle,
  Package,
} from "lucide-react";
import { toast } from "sonner";

// ── Stage sequence ─────────────────────────────────────────────────────────────
const STAGE_SEQ = [
  { key: "SPAWN_RUN",      label: "Spawn Run",    dayRange: "16–22 d",    icon: Sprout,   phase: "SPAWN_RUN" },
  { key: "CASING_RUN",     label: "Casing Run",   dayRange: "8–10 d",     icon: Layers,   phase: "CASING_RUN" },
  { key: "PINNING_FLUSH1", label: "Flush 1",      dayRange: "DF Day 9–11",icon: Scissors, phase: "DF" },
  { key: "FLUSH2",         label: "Flush 2",      dayRange: "DF Day 15–17",icon: Scissors, phase: "DF" },
  { key: "COOKOUT",        label: "Cookout",      dayRange: "—",          icon: Flame,    phase: "COOKOUT" },
] as const;

// Stages that require harvest data on completion
const HARVEST_STAGES = new Set(["PINNING_FLUSH1", "FLUSH2"]);

// Map phase → completed stages (for backward compat with batches created before stage tracking)
function completedStagesFromPhase(currentPhase: string): Set<string> {
  const completed = new Set<string>();
  if (["CASING_RUN", "DF", "COOKOUT", "COMPLETED"].includes(currentPhase)) completed.add("SPAWN_RUN");
  if (["DF", "COOKOUT", "COMPLETED"].includes(currentPhase)) completed.add("CASING_RUN");
  if (["COOKOUT", "COMPLETED"].includes(currentPhase)) {
    completed.add("PINNING_FLUSH1");
    completed.add("FLUSH2");
  }
  if (currentPhase === "COMPLETED") completed.add("COOKOUT");
  return completed;
}

// Map stage key → next stage key
function nextStageKey(key: string): string {
  const idx = STAGE_SEQ.findIndex(s => s.key === key);
  if (idx < 0 || idx >= STAGE_SEQ.length - 1) return "COMPLETED";
  return STAGE_SEQ[idx + 1].key;
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OotyRoomDetail() {
  const params = useParams();
  const roomId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: room, isLoading } = useGetOotyRoom(roomId, {
    query: { enabled: !!roomId, queryKey: getGetOotyRoomQueryKey(roomId) },
  });
  const r = room as any;
  const activeBatch = r?.batches?.find((b: any) => b.status === "active") ??
    r?.batches?.find((b: any) => b.id === r?.currentGrowingBatchId);
  const batchId = activeBatch?.id;

  const { data: batchDetail } = useGetOotyGrowingBatch(batchId ?? 0, {
    query: { enabled: !!batchId, queryKey: getGetOotyGrowingBatchQueryKey(batchId ?? 0) },
  });
  const b = batchDetail as any;

  // Fetch Coimbatore batches for casing soil selector
  const { data: coimBatches } = useQuery({
    queryKey: ["coimbatore-batches"],
    queryFn: async () => {
      const res = await fetch("/api/coimbatore/batches");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: getGetOotyRoomQueryKey(roomId) });
    queryClient.invalidateQueries({ queryKey: getListOotyRoomsQueryKey() });
    if (batchId) queryClient.invalidateQueries({ queryKey: getGetOotyGrowingBatchQueryKey(batchId) });
  };

  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ── Stage tracker state ───────────────────────────────────────────────────
  const imgRef0 = useRef<HTMLInputElement>(null);
  const imgRef1 = useRef<HTMLInputElement>(null);
  const imgRef = [imgRef0, imgRef1] as const;

  const [stageImages, setStageImages] = useState<(string | null)[]>([null, null]);
  const [completeDialog, setCompleteDialog] = useState({
    open: false,
    stageKey: "",
    notes: "",
    // Casing soil extras (asked at SPAWN_RUN completion)
    casingSourceType: "internal" as "internal" | "external",
    casingBatchRef: "",
    // Harvest extras (Flush 1 / Flush 2)
    harvestDate: new Date().toISOString().split("T")[0],
    harvestWeightKg: "",
    harvestCount: "",
    harvestQualityNote: "",
    // Cookout extras
    cookoutDate: new Date().toISOString().split("T")[0],
    substrateWeightKg: "",
    manureKg: "",
  });

  const closeDialog = () => {
    setCompleteDialog(p => ({ ...p, open: false }));
    setStageImages([null, null]);
  };

  const openCompleteDialog = (stageKey: string) => {
    setStageImages([null, null]);
    setCompleteDialog({
      open: true,
      stageKey,
      notes: "",
      casingSourceType: "internal",
      casingBatchRef: "",
      harvestDate: new Date().toISOString().split("T")[0],
      harvestWeightKg: "",
      harvestCount: "",
      harvestQualityNote: "",
      cookoutDate: new Date().toISOString().split("T")[0],
      substrateWeightKg: "",
    manureKg: "",
    });
  };

  const handleImageFile = (slot: 0 | 1, file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      setStageImages(prev => {
        const next = [...prev];
        next[slot] = e.target?.result as string;
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Advance stage mutation ────────────────────────────────────────────────
  const advanceStageMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const res = await fetch(`/api/ooty/growing-batches/${batchId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to advance stage");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast.success("Stage completed");
      closeDialog();
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Failed to advance stage");
    },
  });

  const isSpawnRun = completeDialog.stageKey === "SPAWN_RUN";
  const isHarvestStage = HARVEST_STAGES.has(completeDialog.stageKey);
  const isCookout = completeDialog.stageKey === "COOKOUT";

  const imagesReady = stageImages[0] !== null && stageImages[1] !== null;
  const casingReady = !isSpawnRun || !!completeDialog.casingBatchRef;
  const harvestReady = !isHarvestStage || (Number(completeDialog.harvestWeightKg) > 0 && Number.isInteger(Number(completeDialog.harvestCount)) && Number(completeDialog.harvestCount) > 0);
  const manureValue = Number(completeDialog.manureKg);
  const manurePrecisionValid = Math.abs(manureValue * 10000 - Math.round(manureValue * 10000)) <= 1e-7;
  const cookoutReady = !isCookout || (!!completeDialog.substrateWeightKg && completeDialog.manureKg !== "" && Number.isFinite(manureValue) && manureValue >= 0 && manurePrecisionValid);
  const canSubmit = imagesReady && casingReady && harvestReady && cookoutReady && !advanceStageMutation.isPending;

  const handleCompleteStage = () => {
    const payload: Record<string, any> = {
      nextStage: nextStageKey(completeDialog.stageKey),
      verificationImages: stageImages.filter(Boolean),
      notes: completeDialog.notes || null,
    };
    if (isSpawnRun) payload.casingBatchRef = completeDialog.casingBatchRef;
    if (isHarvestStage) {
      payload.harvestData = {
        harvestDate: completeDialog.harvestDate,
        weightKg: completeDialog.harvestWeightKg,
        mushroomCount: completeDialog.harvestCount || null,
        qualityNote: completeDialog.harvestQualityNote || null,
      };
    }
    if (isCookout) {
      payload.cookoutDate = completeDialog.cookoutDate;
      payload.substrateWeightKg = completeDialog.substrateWeightKg ? Number(completeDialog.substrateWeightKg) : null;
      payload.manureKg = completeDialog.manureKg === "" ? null : manureValue;
    }
    advanceStageMutation.mutate(payload);
  };

  // ── Stage status from logs + legacy phase fallback ────────────────────────
  const { completedStageKeys, currentStageKey } = useMemo(() => {
    if (!b) return { completedStageKeys: new Set<string>(), currentStageKey: "SPAWN_RUN" };

    // Use stage logs if available (new flow)
    if (b.stageLogs && b.stageLogs.length > 0) {
      const completed = new Set(
        b.stageLogs
          .filter((log: any) => log.exitedAt !== null && log.exitedAt !== undefined)
          .map((log: any) => log.stage)
      );
      const active = b.currentStage === "PRONING" ? "PINNING_FLUSH1" : (b.currentStage ?? "SPAWN_RUN");
      return { completedStageKeys: completed, currentStageKey: active };
    }

    // Backward compat: derive from currentPhase
    const currentPhase = b.currentPhase ?? "SPAWN_RUN";
    const completed = completedStagesFromPhase(currentPhase);
    const stage = b.currentStage === "PRONING" ? "PINNING_FLUSH1" : b.currentStage && b.currentStage !== "" ? b.currentStage : (
      currentPhase === "DF" ? "PINNING_FLUSH1" :
      currentPhase === "COMPLETED" ? "COMPLETED" :
      currentPhase
    );
    return { completedStageKeys: completed, currentStageKey: stage };
  }, [b]);

  const isFullyCompleted = currentStageKey === "COMPLETED" || b?.status === "completed";

  // ── Observation state ─────────────────────────────────────────────────────
  const [obsForm, setObsForm] = useState({ date: new Date().toISOString().split("T")[0], temp: "", note: "" });
  const observationMutation = useAddOotyObservation({
    mutation: { onSuccess: refetch },
  });

  const handleLogObservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchId) return;
    observationMutation.mutate(
      {
        id: batchId,
        data: {
          observationDate: obsForm.date,
          temperatureCelsius: obsForm.temp ? Number(obsForm.temp) : null,
          observationNote: obsForm.note || null,
          observationType: "routine",
        } as any,
      },
      { onSuccess: () => setObsForm({ date: new Date().toISOString().split("T")[0], temp: "", note: "" }) }
    );
  };

  const observations: any[] = b?.observations ?? [];
  const harvests: any[] = b?.harvests ?? [];
  const totalHarvestKg = harvests.reduce((s, h) => s + Number(h.weightKg ?? 0), 0);
  const batchSources: any[] = b?.batchSources ?? activeBatch?.batchSources ?? [];

  if (isLoading) return <Shell><div className="p-8 text-sm text-muted-foreground">Loading...</div></Shell>;
  if (!room) return <Shell><div className="p-8 text-sm text-destructive">Room not found.</div></Shell>;

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        <Button variant="ghost" onClick={() => setLocation("/ooty")} className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Growing Rooms
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{r.name}</h1>
              <Badge variant="outline" className={`border-0 rounded-sm text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 ${
                r.status === "active" ? "bg-primary/10 text-primary" :
                r.status === "maintenance" ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground"
              }`}>
                {r.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Ooty Location B{r.capacity ? ` · ${r.capacity} bags capacity` : ""}
            </p>
          </div>
          {activeBatch && (
            <div className="text-right space-y-1">
              <p className="font-mono text-lg font-bold text-primary">{activeBatch.batchCode}</p>
              <p className="text-xs text-muted-foreground">Spawn run started {fmt(activeBatch.spawnRunStartDate)}</p>
              {batchSources.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-end mt-1">
                  {batchSources.map((src: any) => (
                    <Badge key={src.id} variant="outline" className="border-primary/30 bg-primary/5 text-primary font-mono text-[11px] rounded-sm gap-1">
                      <Package className="w-3 h-3" />
                      {src.batchCode ?? `Annur #${src.annurBatchId}`}
                      {src.bagCount ? ` · ${src.bagCount} bags` : ""}
                    </Badge>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm h-8 mt-1"
                onClick={() => setLocation(`/traceability?batchId=${activeBatch.id}`)}
              >
                <GitBranch className="w-3.5 h-3.5 mr-1.5" /> View Traceability
              </Button>
            </div>
          )}
        </div>

        {!activeBatch ? (
          <Card className="rounded-sm border-border shadow-none">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Room is idle — no active growing batch. Assign a batch from the rooms overview.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stage Tracker Pipeline */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Growing Stage Tracker
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {isFullyCompleted ? (
                  <div className="p-4 border border-primary/20 bg-primary/5 rounded-sm flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-primary">Growing Cycle Completed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cookout done{b?.cookoutDate ? ` ${fmt(b.cookoutDate)}` : ""}{b?.substrateWeightKg ? ` · spent substrate ${b.substrateWeightKg} kg` : ""}. Room reset to idle.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 min-w-max pb-2">
                      {STAGE_SEQ.map((stage, idx) => {
                        const isCompleted = completedStageKeys.has(stage.key);
                        const isActive    = !isFullyCompleted && stage.key === currentStageKey;
                        const isPending   = !isCompleted && !isActive;
                        const Icon = stage.icon;

                        // Find stage log entry for completed stages
                        const logEntry = b?.stageLogs?.find((l: any) => l.stage === stage.key && l.exitedAt);

                        return (
                          <div key={stage.key} className="flex items-center gap-2">
                            <div className={`w-44 rounded-sm border-2 p-3 transition-all ${
                              isActive    ? "border-primary bg-primary/5 shadow-sm" :
                              isCompleted ? "border-green-300 bg-green-50/50" :
                                            "border-border bg-muted/20 opacity-60"
                            }`}>
                              {/* Status icon */}
                              <div className="flex items-center justify-between mb-2">
                                {isCompleted ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                ) : isActive ? (
                                  <Clock className="w-4 h-4 text-primary animate-pulse" />
                                ) : (
                                  <Circle className="w-4 h-4 text-muted-foreground/40" />
                                )}
                                <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                                  isActive ? "text-primary" : isCompleted ? "text-green-700" : "text-muted-foreground/50"
                                }`}>
                                  {isActive ? "Active" : isCompleted ? "Done" : "Pending"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 mb-1">
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${isPending ? "text-muted-foreground/50" : isCompleted ? "text-green-700" : "text-primary"}`} />
                                <p className={`text-sm font-semibold leading-tight ${isPending ? "text-muted-foreground" : "text-foreground"}`}>
                                  {stage.label}
                                </p>
                              </div>

                              <p className="text-[11px] text-muted-foreground font-mono mb-1">{stage.dayRange}</p>

                              {/* Casing batch ref */}
                              {isCompleted && logEntry?.casingBatchRef && (
                                <p className="text-[10px] text-muted-foreground truncate">
                                  Casing: <span className="font-mono text-foreground">{logEntry.casingBatchRef}</span>
                                </p>
                              )}

                              {/* Complete button */}
                              {isActive && !isFullyCompleted && (
                                <Button
                                  size="sm"
                                  className="w-full mt-3 h-7 text-xs rounded-sm"
                                  onClick={() => openCompleteDialog(stage.key)}
                                >
                                  Complete ✓
                                </Button>
                              )}

                              {/* Verification image thumbnails */}
                              {isCompleted && logEntry?.verificationImages?.length > 0 && (
                                <div className="flex gap-1 mt-2">
                                  {logEntry.verificationImages.slice(0, 2).map((img: string, i: number) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setLightboxSrc(img)}
                                      className="w-8 h-8 rounded-sm overflow-hidden border border-green-300 hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all cursor-zoom-in focus:outline-none"
                                      title="Click to enlarge"
                                    >
                                      <img src={img} className="w-full h-full object-cover" alt={`Verification ${i + 1}`} />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Connector */}
                            {idx < STAGE_SEQ.length - 1 && (
                              <div className={`w-4 h-0.5 shrink-0 ${isCompleted ? "bg-green-400" : "bg-border"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stage history log */}
            {b?.stageLogs && b.stageLogs.length > 0 && (
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-2 border-b">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage History Log</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Stage</th>
                        <th className="px-4 py-2.5 font-medium">Entered</th>
                        <th className="px-4 py-2.5 font-medium">Exited</th>
                        <th className="px-4 py-2.5 font-medium">Photos</th>
                        <th className="px-4 py-2.5 font-medium">Ref / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {b.stageLogs.map((log: any) => (
                        <tr key={log.id} className="h-[38px] hover:bg-muted/20 transition-colors">
                          <td className="px-4">
                            <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                              {STAGE_SEQ.find(s => s.key === log.stage)?.label ?? log.stage}
                            </span>
                          </td>
                          <td className="px-4 font-mono text-xs text-muted-foreground">
                            {new Date(log.enteredAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-4 font-mono text-xs text-muted-foreground">
                            {log.exitedAt ? new Date(log.exitedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </td>
                          <td className="px-4">
                            {log.verificationImages?.length >= 2 ? (
                              <div className="flex gap-1">
                                {log.verificationImages.slice(0, 2).map((img: string, i: number) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setLightboxSrc(img)}
                                    className="w-7 h-7 rounded-sm overflow-hidden border hover:border-primary hover:ring-2 hover:ring-primary/30 transition-all cursor-zoom-in focus:outline-none"
                                    title="Click to enlarge"
                                  >
                                    <img src={img} className="w-full h-full object-cover" alt="" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-4 text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.casingBatchRef ? <span className="font-mono">{log.casingBatchRef}</span> : (log.notes || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Harvest Log */}
            {(harvests.length > 0 || ["PINNING_FLUSH1", "FLUSH2", "COOKOUT", "COMPLETED"].includes(currentStageKey) || b?.currentPhase === "DF") && (
              <Card className="rounded-sm border-border shadow-none">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Harvest Log{totalHarvestKg > 0 ? ` · Total ${totalHarvestKg.toFixed(1)} kg` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                        <tr>
                          <th className="px-4 py-2 font-medium">Date</th>
                          <th className="px-4 py-2 font-medium text-right">Flush</th>
                          <th className="px-4 py-2 font-medium text-right">Weight (kg)</th>
                          <th className="px-4 py-2 font-medium text-right">Count</th>
                          <th className="px-4 py-2 font-medium text-right">Avg (g)</th>
                          <th className="px-4 py-2 font-medium">Quality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {harvests.map((h: any) => (
                          <tr key={h.id} className="h-[36px] hover:bg-muted/20">
                            <td className="px-4 font-mono text-muted-foreground">{fmt(h.harvestDate)}</td>
                            <td className="px-4 font-mono text-right">{h.flushNumber}</td>
                            <td className="px-4 font-mono text-right font-semibold">{Number(h.weightKg).toFixed(2)}</td>
                            <td className="px-4 font-mono text-right">{h.mushroomCount ?? "—"}</td>
                            <td className={`px-4 font-mono text-right ${h.avgWeightG && Number(h.avgWeightG) < 15 ? "text-amber-600" : ""}`}>
                              {h.avgWeightG ? Number(h.avgWeightG).toFixed(1) : "—"}
                            </td>
                            <td className="px-4 text-muted-foreground text-xs">{h.qualityNote ?? "—"}</td>
                          </tr>
                        ))}
                        {harvests.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                              No harvests logged yet. Flush 1 expected around DF Day 9–11.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observation Log */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Temperature & Observation Log
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!isFullyCompleted && (
                  <form onSubmit={handleLogObservation} className="flex flex-wrap items-end gap-3 p-4 border-b border-border bg-muted/20">
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</Label>
                      <Input type="date" required value={obsForm.date} onChange={(e) => setObsForm({ ...obsForm, date: e.target.value })} className="rounded-sm font-mono h-9 w-[150px]" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Temp (°C)</Label>
                      <Input type="number" step="0.1" value={obsForm.temp} onChange={(e) => setObsForm({ ...obsForm, temp: e.target.value })} className="rounded-sm font-mono h-9 w-[110px]" placeholder="24.5" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-[200px]">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Note</Label>
                      <Input value={obsForm.note} onChange={(e) => setObsForm({ ...obsForm, note: e.target.value })} className="rounded-sm h-9" placeholder="Mycelium spread, humidity, CO₂..." />
                    </div>
                    <Button type="submit" disabled={observationMutation.isPending || (!obsForm.temp && !obsForm.note)} className="rounded-sm h-9">
                      <Thermometer className="w-4 h-4 mr-1.5" /> {observationMutation.isPending ? "Logging..." : "Log"}
                    </Button>
                  </form>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium text-right">Temp (°C)</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {observations.map((o: any) => (
                        <tr key={o.id} className="h-[36px] hover:bg-muted/20">
                          <td className="px-4 font-mono text-muted-foreground">{fmt(o.observationDate)}</td>
                          <td className="px-4 font-mono text-right">
                            {o.temperatureCelsius !== null && o.temperatureCelsius !== undefined ? Number(o.temperatureCelsius).toFixed(1) : "—"}
                          </td>
                          <td className="px-4 text-xs uppercase tracking-wider text-muted-foreground">{o.observationType}</td>
                          <td className="px-4 text-muted-foreground text-xs">{o.observationNote ?? "—"}</td>
                        </tr>
                      ))}
                      {observations.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No observations logged yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      <Dialog open={!!lightboxSrc} onOpenChange={open => !open && setLightboxSrc(null)}>
        <DialogContent className="rounded-sm border-border max-w-2xl shadow-2xl p-2 bg-black/95">
          {lightboxSrc && (
            <img src={lightboxSrc} alt="Verification photo" className="w-full h-auto max-h-[80vh] object-contain rounded-sm" />
          )}
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-3 right-3 text-white/70 hover:text-white text-sm font-medium bg-black/40 hover:bg-black/60 px-3 py-1 rounded-sm transition-colors"
          >
            Close ✕
          </button>
        </DialogContent>
      </Dialog>

      {/* ── Complete Stage Dialog ─────────────────────────────────────────────── */}
      <Dialog open={completeDialog.open} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Complete Stage: {STAGE_SEQ.find(s => s.key === completeDialog.stageKey)?.label}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Two verification photos are required before this stage can be marked complete.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1 max-h-[60vh] overflow-y-auto pr-1">
            {/* Image capture — two slots */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Verification Photos (2 required)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([0, 1] as const).map(slot => (
                  <div key={slot} className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">Photo {slot + 1}</p>
                    <input
                      ref={imgRef[slot]}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFile(slot, file);
                      }}
                    />
                    {stageImages[slot] ? (
                      <div className="relative">
                        <img
                          src={stageImages[slot]!}
                          alt={`Verification ${slot + 1}`}
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
                {stageImages[0] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                {stageImages[1] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                <span className={`text-xs font-medium ${imagesReady ? "text-green-700" : "text-muted-foreground"}`}>
                  {stageImages.filter(Boolean).length}/2 photos added
                </span>
              </div>
            </div>

            {/* Spawn Run → select casing soil to be used at next stage */}
            {isSpawnRun && (
              <div className="p-3 bg-muted/30 border border-border rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Casing Soil Source</p>
                <p className="text-[11px] text-muted-foreground">
                  Select the casing soil that will be applied when Casing Run begins immediately after this.
                </p>
                <RadioGroup
                  value={completeDialog.casingSourceType}
                  onValueChange={v => setCompleteDialog(p => ({ ...p, casingSourceType: v as "internal" | "external", casingBatchRef: "" }))}
                  className="flex gap-2"
                >
                  <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-sm flex-1">
                    <RadioGroupItem value="internal" id="casing-int" />
                    <Label htmlFor="casing-int" className="cursor-pointer text-sm">Internally Produced</Label>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-sm flex-1">
                    <RadioGroupItem value="external" id="casing-ext" />
                    <Label htmlFor="casing-ext" className="cursor-pointer text-sm">External Purchase</Label>
                  </div>
                </RadioGroup>
                {completeDialog.casingSourceType === "internal" ? (
                  <Select
                    value={completeDialog.casingBatchRef}
                    onValueChange={v => setCompleteDialog(p => ({ ...p, casingBatchRef: v }))}
                  >
                    <SelectTrigger className="rounded-sm h-9 bg-white">
                      <SelectValue placeholder="Select Coimbatore casing batch…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(coimBatches as any[])?.filter((b: any) => b.status !== "archived").map((cb: any) => (
                        <SelectItem key={cb.id} value={cb.batchCode}>
                          {cb.batchCode} — {cb.status}
                        </SelectItem>
                      ))}
                      {(!coimBatches || (coimBatches as any[]).length === 0) && (
                        <SelectItem value="__none__" disabled>No Coimbatore batches found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={completeDialog.casingBatchRef}
                    onChange={e => setCompleteDialog(p => ({ ...p, casingBatchRef: e.target.value }))}
                    className="rounded-sm h-9 bg-white font-mono"
                    placeholder="Vendor lot / purchase reference number"
                  />
                )}
                {!completeDialog.casingBatchRef && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Casing soil reference required for traceability
                  </p>
                )}
              </div>
            )}

            {/* Flush stages: harvest data */}
            {isHarvestStage && (
              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  {completeDialog.stageKey === "PINNING_FLUSH1" ? "Flush 1 Harvest Data" : "Flush 2 Harvest Data"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</Label>
                    <Input
                      type="date"
                      value={completeDialog.harvestDate}
                      onChange={e => setCompleteDialog(p => ({ ...p, harvestDate: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Weight (kg) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 45.5"
                      value={completeDialog.harvestWeightKg}
                      onChange={e => setCompleteDialog(p => ({ ...p, harvestWeightKg: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Mushroom Count *</Label>
                    <Input
                      type="number"
                      placeholder="optional"
                      value={completeDialog.harvestCount}
                      onChange={e => setCompleteDialog(p => ({ ...p, harvestCount: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Quality Note</Label>
                    <Input
                      placeholder="optional"
                      value={completeDialog.harvestQualityNote}
                      onChange={e => setCompleteDialog(p => ({ ...p, harvestQualityNote: e.target.value }))}
                      className="rounded-sm h-8 text-sm"
                    />
                  </div>
                </div>
                {!completeDialog.harvestWeightKg && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Harvest weight required
                  </p>
                )}
              </div>
            )}

            {/* Cookout: substrate weight */}
            {isCookout && (
              <div className="p-3 bg-red-50/50 border border-red-200 rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-800">Cookout Details</p>
                <p className="text-[11px] text-muted-foreground">Records spent substrate weight, completes the batch, and resets the room to idle.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cookout Date</Label>
                    <Input
                      type="date"
                      value={completeDialog.cookoutDate}
                      onChange={e => setCompleteDialog(p => ({ ...p, cookoutDate: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Spent Substrate (kg) *</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 1200"
                      value={completeDialog.substrateWeightKg}
                      onChange={e => setCompleteDialog(p => ({ ...p, substrateWeightKg: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Manure (kg) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.0001"
                      placeholder="e.g. 500"
                      value={completeDialog.manureKg}
                      onChange={e => setCompleteDialog(p => ({ ...p, manureKg: e.target.value }))}
                      className="rounded-sm h-8 font-mono text-sm"
                    />
                  </div>
                </div>
                {!completeDialog.substrateWeightKg && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Substrate weight required
                  </p>
                )}
                {(completeDialog.manureKg === "" || !Number.isFinite(manureValue) || manureValue < 0 || !manurePrecisionValid) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Enter a valid non-negative Manure quantity (up to 4 decimals)
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Input
                value={completeDialog.notes}
                onChange={e => setCompleteDialog(p => ({ ...p, notes: e.target.value }))}
                className="rounded-sm h-9"
                placeholder="Any observations for this stage…"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="rounded-sm" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={!canSubmit}
              onClick={handleCompleteStage}
            >
              {advanceStageMutation.isPending ? "Saving…" :
                !imagesReady ? `Add ${2 - stageImages.filter(Boolean).length} more photo${stageImages.filter(Boolean).length === 1 ? "" : "s"}` :
                !casingReady ? "Enter casing soil reference" :
                !harvestReady ? "Enter harvest weight and mushroom count" :
                !cookoutReady ? "Enter substrate and Manure weight" :
                "Mark Stage Complete ✓"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
