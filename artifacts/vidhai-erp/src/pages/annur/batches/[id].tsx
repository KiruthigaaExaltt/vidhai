import { useState, useMemo, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetBatch, getGetBatchQueryKey,
  useAdvanceBatchStage,
  useListLabBatches,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Camera, CheckCircle2, Clock, Circle, Lock, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// ── Stage sequence with lead-time durations ───────────────────────────────────
const STAGE_SEQ = [
  { key: "PRE_WETTING",   label: "Pre-Wetting",   dayStart: 0,  duration: 1 },
  { key: "T1",            label: "T1",             dayStart: 1,  duration: 2 },
  { key: "T2",            label: "T2",             dayStart: 3,  duration: 2 },
  { key: "T3",            label: "T3",             dayStart: 5,  duration: 2 },
  { key: "T4",            label: "T4",             dayStart: 7,  duration: 2 },
  { key: "BULK_CHAMBER",  label: "Bulk Chamber",   dayStart: 9,  duration: 7 },
  { key: "QUALITY_CHECK", label: "Quality Check",  dayStart: 16, duration: 1 },
  { key: "SPAWN_MIXING",  label: "Spawn Mixing",   dayStart: 17, duration: 1 },
  { key: "DISPATCH",      label: "Dispatch",       dayStart: 18, duration: 0 },
];

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function BatchDetail() {
  const params = useParams();
  const batchId = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: batch, isLoading } = useGetBatch(batchId, {
    query: { enabled: !!batchId, queryKey: getGetBatchQueryKey(batchId) },
  });
  const { data: labBatches } = useListLabBatches({ query: { enabled: true } } as any);
  const completedLabBatches = labBatches?.filter((b: any) => b.status === "completed") ?? [];

  const advanceMutation = useAdvanceBatchStage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBatchQueryKey(batchId) });
        toast.success("Stage completed");
        setCompleteDialog({ open: false, stageKey: "", nextStageKey: "", notes: "", spawnType: "internal", spawnRef: "" });
        setStageImages([null, null]);
      },
      onError: (e: any) => {
        toast.error(e?.response?.data?.error ?? "Failed to advance stage");
      },
    },
  });

  // ── Lightbox ──────────────────────────────────────────────────────────────
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ── Stage tracker state ───────────────────────────────────────────────────
  const imgRef0 = useRef<HTMLInputElement>(null);
  const imgRef1 = useRef<HTMLInputElement>(null);
  const imgRef = [imgRef0, imgRef1] as const;

  const [stageImages, setStageImages] = useState<(string | null)[]>([null, null]);
  const [completeDialog, setCompleteDialog] = useState({
    open: false, stageKey: "", nextStageKey: "",
    notes: "", spawnType: "internal", spawnRef: "",
  });

  const openCompleteDialog = (stageKey: string) => {
    const idx = STAGE_SEQ.findIndex(s => s.key === stageKey);
    const nextStageKey = idx < STAGE_SEQ.length - 1 ? STAGE_SEQ[idx + 1].key : "COMPLETED";
    setStageImages([null, null]);
    setCompleteDialog({ open: true, stageKey, nextStageKey, notes: "", spawnType: "internal", spawnRef: "" });
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

  // Show spawn picker when COMPLETING Quality Check (which moves the batch TO Spawn Mixing)
  const isSpawnMixing = completeDialog.nextStageKey === "SPAWN_MIXING";
  const imagesReady = stageImages[0] !== null && stageImages[1] !== null;
  const spawnReady = !isSpawnMixing || !!completeDialog.spawnRef;
  const canSubmit = imagesReady && spawnReady && !advanceMutation.isPending;

  const handleCompleteStage = () => {
    advanceMutation.mutate({
      id: batchId,
      data: {
        nextStage: completeDialog.nextStageKey as any,
        notes: completeDialog.notes || null,
        verificationImages: stageImages.filter(Boolean),
        ...(isSpawnMixing && {
          spawnBatchRef: completeDialog.spawnRef,
          spawnBatchType: completeDialog.spawnType,
        }),
      } as any,
    });
  };

  // Determine stage statuses from stageLogs
  const completedStageKeys = useMemo(() => {
    if (!batch?.stageLogs) return new Set<string>();
    return new Set(
      batch.stageLogs
        .filter((log: any) => log.exitedAt !== null && log.exitedAt !== undefined)
        .map((log: any) => log.stage)
    );
  }, [batch?.stageLogs]);

  const currentStageKey = batch?.currentStage ?? "PRE_WETTING";
  const batchCreatedAt = batch ? new Date(batch.createdAt) : new Date();

  // Formulation stats from saved materials (read-only, no local state)
  const formulationStats = useMemo(() => {
    const mats = batch?.materials ?? [];
    let totalWet = 0, totalDry = 0, totalN2 = 0;
    const items = mats.map((m: any) => {
      const wet = Number(m.wetWeightKg);
      const dry = Number(m.dryWeightKg ?? (wet * (1 - m.moisturePercent / 100)));
      const n2  = Number(m.n2Kg ?? (dry * m.nitrogenPercent / 100));
      totalWet += wet; totalDry += dry; totalN2 += n2;
      return { ...m, wet, dry, n2 };
    });
    const nPercent = totalDry > 0 ? (totalN2 / totalDry) * 100 : 0;
    return { items, totalWet, totalDry, totalN2, nPercent };
  }, [batch?.materials]);

  const nPassed = formulationStats.nPercent >= 1.5 && formulationStats.nPercent <= 1.8;

  if (isLoading) return <Shell><div className="p-8 text-muted-foreground text-sm">Loading...</div></Shell>;
  if (!batch) return <Shell><div className="p-8 text-destructive text-sm">Batch not found</div></Shell>;

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-6 md:p-8">
        {/* Back */}
        <Button variant="ghost" onClick={() => setLocation("/annur/batches")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Batches
        </Button>

        {/* Batch header */}
        <div className="flex flex-col md:flex-row md:items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-display font-bold tracking-tight text-primary">{batch.batchCode}</h1>
              <StatusBadge status={batch.currentStage} />
              <StatusBadge status={batch.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Location: {batch.locationCode} · Created: {new Date(batch.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              {batch.targetBags && <> · Target: <strong>{batch.targetBags.toLocaleString()} bags</strong></>}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="formulation" className="w-full">
          <TabsList className="rounded-sm bg-transparent border-b w-full justify-start h-auto p-0 space-x-6 mb-6">
            <TabsTrigger value="formulation" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 font-medium">
              Formulation Record
            </TabsTrigger>
            <TabsTrigger value="tracker" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2 font-medium">
              Stage Tracker
            </TabsTrigger>
          </TabsList>

          {/* ── FORMULATION RECORD (read-only) ────────────────────────────── */}
          <TabsContent value="formulation" className="mt-0 outline-none">
            <Card className="rounded-sm border-border shadow-md">
              {/* Locked header */}
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5" /> Formulation Record — Locked at Initiation
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      This is a permanent record of what was formulated when the batch was initiated. It cannot be changed.
                    </p>
                  </div>
                  {formulationStats.items.length > 0 && (
                    <div className="flex items-center gap-3 bg-background border px-4 py-2 rounded-sm shadow-sm shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">N%</div>
                      <div className={`font-mono text-2xl font-bold ${nPassed ? "text-green-600" : "text-destructive"}`}>
                        {formulationStats.nPercent.toFixed(2)}%
                      </div>
                      <Badge variant="outline" className={`border-0 rounded-sm uppercase tracking-wider px-2 py-0.5 text-[10px] font-semibold ${nPassed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {nPassed ? "PASS" : "FAIL"}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {formulationStats.items.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground text-sm">
                    No formulation data recorded for this batch.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/30 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="px-4 py-3 font-medium">Material</th>
                            <th className="px-4 py-3 font-medium text-right bg-blue-50/40">Wet Weight (kg)</th>
                            <th className="px-4 py-3 font-medium text-right bg-blue-50/40">H₂O %</th>
                            <th className="px-4 py-3 font-medium text-right bg-primary/5 text-primary/70">Dry Weight (kg)</th>
                            <th className="px-4 py-3 font-medium text-right bg-emerald-50/40">N %</th>
                            <th className="px-4 py-3 font-medium text-right bg-primary/5 text-primary/70">N₂ (kg)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {formulationStats.items.map((m: any, idx: number) => (
                            <tr key={idx} className="h-[42px] hover:bg-muted/10">
                              <td className="px-4 font-medium">{m.materialName}</td>
                              <td className="px-4 font-mono text-right bg-blue-50/10">{m.wet.toFixed(3)}</td>
                              <td className="px-4 font-mono text-right bg-blue-50/10">{Number(m.moisturePercent).toFixed(1)}</td>
                              <td className="px-4 font-mono text-right font-bold text-primary bg-primary/5">{m.dry.toFixed(3)}</td>
                              <td className="px-4 font-mono text-right bg-emerald-50/10">{Number(m.nitrogenPercent).toFixed(2)}</td>
                              <td className="px-4 font-mono text-right font-bold text-primary bg-primary/5">{m.n2.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-border bg-muted/40">
                          <tr className="h-[42px] text-sm font-semibold">
                            <td className="px-4 text-[10px] uppercase tracking-wider text-muted-foreground">Totals</td>
                            <td className="px-4 font-mono text-right font-bold">{formulationStats.totalWet.toFixed(2)}</td>
                            <td className="px-4 font-mono text-right text-muted-foreground">—</td>
                            <td className="px-4 font-mono text-right font-bold text-primary bg-primary/5">{formulationStats.totalDry.toFixed(2)}</td>
                            <td className="px-4 font-mono text-right text-muted-foreground">—</td>
                            <td className="px-4 font-mono text-right font-bold text-primary bg-primary/5">{formulationStats.totalN2.toFixed(4)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {/* Target bags info */}
                    {batch.targetBags && (
                      <div className="px-5 py-3 border-t bg-muted/10 flex items-center gap-6 text-xs text-muted-foreground">
                        <span>Target bags: <strong className="text-foreground font-mono">{batch.targetBags.toLocaleString()}</strong></span>
                        <span>Total wet: <strong className="text-foreground font-mono">{formulationStats.totalWet.toFixed(1)} kg</strong></span>
                        <span>Total dry: <strong className="text-foreground font-mono">{formulationStats.totalDry.toFixed(1)} kg</strong></span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── STAGE TRACKER ──────────────────────────────────────────────── */}
          <TabsContent value="tracker" className="mt-0 outline-none space-y-5">
            {/* Stage pipeline */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Production Stage Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-2">
                    {STAGE_SEQ.map((stage, idx) => {
                      const isCompleted = completedStageKeys.has(stage.key);
                      const isActive    = stage.key === currentStageKey;
                      const isPending   = !isCompleted && !isActive;

                      const expectedStart = addDays(batchCreatedAt, stage.dayStart);
                      const expectedEnd   = stage.duration > 0 ? addDays(batchCreatedAt, stage.dayStart + stage.duration) : null;
                      const logEntry      = batch.stageLogs?.find((l: any) => l.stage === stage.key);

                      return (
                        <div key={stage.key} className="flex items-center gap-2">
                          <div className={`w-36 rounded-sm border-2 p-3 transition-all ${
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

                            <p className={`text-sm font-semibold leading-tight mb-2 ${isPending ? "text-muted-foreground" : "text-foreground"}`}>
                              {stage.label}
                            </p>

                            <div className="text-[11px] text-muted-foreground space-y-0.5">
                              <p>Expected: {fmtDate(expectedStart)}{expectedEnd ? ` – ${fmtDate(expectedEnd)}` : ""}</p>
                              {logEntry?.enteredAt && (
                                <p className="text-green-700 font-medium">
                                  Entered: {new Date(logEntry.enteredAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </p>
                              )}
                              {stage.duration > 0 && (
                                <p className="text-[10px] text-muted-foreground/70">{stage.duration}d duration</p>
                              )}
                            </div>

                            {/* Complete button */}
                            {isActive && (batch.status as string) !== "dispatched" && batch.status !== "completed" && (
                              <Button
                                size="sm"
                                className="w-full mt-3 h-7 text-xs rounded-sm"
                                onClick={() => openCompleteDialog(stage.key)}
                              >
                                Complete ✓
                              </Button>
                            )}

                            {/* Verification image thumbnails — clickable */}
                            {isCompleted && (logEntry as any)?.verificationImages?.length > 0 && (
                              <div className="flex gap-1 mt-2">
                                {(logEntry as any).verificationImages.slice(0, 2).map((img: string, i: number) => (
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
              </CardContent>
            </Card>

            {/* Stage history log */}
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
                      <th className="px-4 py-2.5 font-medium">By</th>
                      <th className="px-4 py-2.5 font-medium">Photos</th>
                      <th className="px-4 py-2.5 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {batch.stageLogs?.map((log: any) => (
                      <tr key={log.id} className="h-[38px] hover:bg-muted/20 transition-colors">
                        <td className="px-4"><StatusBadge status={log.stage} /></td>
                        <td className="px-4 font-mono text-xs text-muted-foreground">
                          {new Date(log.enteredAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 font-mono text-xs text-muted-foreground">
                          {log.exitedAt ? new Date(log.exitedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="px-4 text-xs text-muted-foreground">{log.enteredByName}</td>
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
                        <td className="px-4 text-xs text-muted-foreground truncate max-w-[180px]">{log.notes || "—"}</td>
                      </tr>
                    ))}
                    {(!batch.stageLogs || batch.stageLogs.length === 0) && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No stage history recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      <Dialog open={!!lightboxSrc} onOpenChange={open => !open && setLightboxSrc(null)}>
        <DialogContent className="rounded-sm border-border max-w-2xl shadow-2xl p-2 bg-black/95">
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt="Verification photo"
              className="w-full h-auto max-h-[80vh] object-contain rounded-sm"
            />
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

      {/* ── Complete Stage Dialog ──────────────────────────────────────────────── */}
      <Dialog open={completeDialog.open} onOpenChange={open => {
        if (!open) {
          setCompleteDialog(p => ({ ...p, open: false }));
          setStageImages([null, null]);
        }
      }}>
        <DialogContent className="rounded-sm border-border max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Complete Stage: {STAGE_SEQ.find(s => s.key === completeDialog.stageKey)?.label}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Two verification photos are required before this stage can be marked complete.
            </p>
          </DialogHeader>

          <div className="space-y-4 pt-1">
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

            {/* Spawn Mixing extras */}
            {isSpawnMixing && (
              <div className="p-3 bg-muted/30 border border-border rounded-sm space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Spawn Batch</p>
                <RadioGroup
                  value={completeDialog.spawnType}
                  onValueChange={v => setCompleteDialog(p => ({ ...p, spawnType: v as any, spawnRef: "" }))}
                  className="flex gap-3"
                >
                  <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-sm">
                    <RadioGroupItem value="internal" id="spawn-int" />
                    <Label htmlFor="spawn-int" className="cursor-pointer text-sm">Internal Lab</Label>
                  </div>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 border rounded-sm">
                    <RadioGroupItem value="external" id="spawn-ext" />
                    <Label htmlFor="spawn-ext" className="cursor-pointer text-sm">External Vendor</Label>
                  </div>
                </RadioGroup>
                {completeDialog.spawnType === "internal" ? (
                  <Select
                    value={completeDialog.spawnRef}
                    onValueChange={v => setCompleteDialog(p => ({ ...p, spawnRef: v }))}
                  >
                    <SelectTrigger className="rounded-sm h-9 bg-white">
                      <SelectValue placeholder="Select lab batch…" />
                    </SelectTrigger>
                    <SelectContent>
                      {completedLabBatches.map((lb: any) => (
                        <SelectItem key={lb.id} value={lb.batchCode}>{lb.batchCode}</SelectItem>
                      ))}
                      {completedLabBatches.length === 0 && (
                        <SelectItem value="__none__" disabled>No completed lab batches</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={completeDialog.spawnRef}
                    onChange={e => setCompleteDialog(p => ({ ...p, spawnRef: e.target.value }))}
                    className="rounded-sm h-9 bg-white font-mono"
                    placeholder="Vendor lot / reference number"
                  />
                )}
                {!completeDialog.spawnRef && (
                  <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Spawn batch reference required</p>
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
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => { setCompleteDialog(p => ({ ...p, open: false })); setStageImages([null, null]); }}
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm"
              disabled={!canSubmit}
              onClick={handleCompleteStage}
            >
              {advanceMutation.isPending ? "Saving…" : (
                !imagesReady ? `Add ${2 - stageImages.filter(Boolean).length} more photo${stageImages.filter(Boolean).length === 1 ? "" : "s"}` :
                !spawnReady ? "Select spawn batch" : "Mark Stage Complete ✓"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
