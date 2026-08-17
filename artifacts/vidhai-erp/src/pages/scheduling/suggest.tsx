import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGenerateScheduleSuggestions,
  useCreateScheduleEvent,
  getListScheduleEventsQueryKey,
  useListOotyRooms,
  getListOotyRoomsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  CalendarDays,
  FlaskConical,
  Box,
  Layers,
  Thermometer,
  ArrowRight,
  Target,
  Package,
  CalendarClock,
  CalendarCheck,
  GanttChartSquare,
  BookOpen,
} from "lucide-react";

// ── Location metadata ─────────────────────────────────────────────────────────
const LOC_META: Record<string, { label: string; location: string; icon: any; accent: string; bg: string; ring: string; desc: string }> = {
  LAB: {
    label: "Lab Spawn Prep",
    location: "Lab · Location D",
    icon: FlaskConical,
    accent: "text-blue-700",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
    desc: "65-day process (9 stages). Spawn must be ready by Annur dispatch date.",
  },
  COIMBATORE: {
    label: "Casing Batch",
    location: "Coimbatore · Location C",
    icon: Layers,
    accent: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    desc: "~120 days: soil prepared and QC-approved before Ooty Casing Run starts.",
  },
  ANNUR: {
    label: "Grow Bag Batch",
    location: "Annur · Location A",
    icon: Box,
    accent: "text-teal-700",
    bg: "bg-teal-50",
    ring: "ring-teal-200",
    desc: "~25 days: bag filling, spawn mixing → dispatch to Ooty. Dispatch date = Spawn Run Day 0.",
  },
  OOTY: {
    label: "Growing Room",
    location: "Ooty · Location B",
    icon: Thermometer,
    accent: "text-violet-700",
    bg: "bg-violet-50",
    ring: "ring-violet-200",
    desc: "Spawn Run (18d) → Casing Run (9d) → DF phase → First Harvest (Day 9–11) → Second Harvest (Day 15–17) → Cookout.",
  },
};

// ── Event type → friendly label ───────────────────────────────────────────────
const EVENT_LABELS: Record<string, { label: string; emoji?: string; note?: string }> = {
  qc_approve_target:  { label: "Casing Batch",          emoji: "🏗️",  note: "Start → QC Approved" },
  spawn_ready_target: { label: "Spawn Prep",             emoji: "🔬",  note: "Start → Spawn Ready" },
  dispatch_target:    { label: "Grow Bags",              emoji: "📦",  note: "Start → Dispatch" },
  spawn_run_start:    { label: "Spawn Run",              emoji: "🌾",  note: "~18 days" },
  casing_run_start:   { label: "Casing Run",             emoji: "🌿",  note: "~9 days" },
  first_harvest:      { label: "First Harvest",          emoji: "🍄",  note: "DF Day 9–11 (required)" },
  second_harvest:     { label: "Second Harvest",         emoji: "🍄",  note: "DF Day 15–17 (assumed)" },
  cookout_target:     { label: "Cookout",                emoji: "🔥",  note: "Room freed for next cycle" },
};

const LOC_ORDER = ["COIMBATORE", "LAB", "ANNUR", "OOTY"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", ...opts,
  });
}

function fmtShort(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function isoToday() {
  return new Date().toISOString().split("T")[0];
}

// ── Timeline milestone definition ─────────────────────────────────────────────
function buildMilestones(s: any) {
  return [
    {
      date: s.coimBatchStart, dateEnd: null,
      label: "Coimbatore Casing Batch Start",
      note: "Soil preparation begins (120-day process)",
      badge: "COIM", dotColor: "bg-amber-400",
    },
    {
      date: s.labBatchStart, dateEnd: null,
      label: "Lab Spawn Prep Start",
      note: "Media Prep Stage 1 — 65-day multi-stage process",
      badge: "LAB", dotColor: "bg-blue-400",
    },
    {
      date: s.annurBatchStart, dateEnd: null,
      label: "Annur Grow Bag Batch Start",
      note: `Bag filling & spawn mixing begins (${25}d)`,
      badge: "ANNUR", dotColor: "bg-teal-400",
    },
    {
      date: s.annurDispatchDate, dateEnd: null,
      label: "Annur Dispatch → Ooty Spawn Run Day 0",
      note: "Bags leave Annur; placed in Ooty room same day",
      badge: "ANNUR", dotColor: "bg-teal-600",
      isKey: true,
    },
    {
      date: s.casingRunStart, dateEnd: null,
      label: "Ooty Casing Run Start · Coimbatore QC Approved",
      note: "Casing soil applied; Coim soil arrives QC-clear",
      badge: "OOTY", dotColor: "bg-violet-400",
    },
    {
      date: s.dfDay0, dateEnd: null,
      label: "DF Day 0 — Development & Fruiting Begins",
      note: "Casing Run complete; pinning / fruiting phase starts",
      badge: "OOTY", dotColor: "bg-violet-500",
      isKey: true,
    },
    {
      date: s.firstHarvestDate, dateEnd: s.firstHarvestDateTo,
      label: "First Harvest Window",
      emoji: "🍄",
      note: `DF Day 9–11 · must harvest by ${fmtShort(s.firstHarvestDate)} for ${s.packingDays} packing days`,
      badge: "OOTY", dotColor: "bg-green-500",
      isKey: true,
    },
    {
      date: s.secondHarvestDateFrom, dateEnd: s.secondHarvestDateTo,
      label: "Second Harvest (assumed)",
      emoji: "🍄",
      note: "DF Day 15–17 · secondary flush; timing may vary ±1–2 days",
      badge: "OOTY", dotColor: "bg-green-400",
    },
    {
      date: s.cookoutDate, dateEnd: null,
      label: "Cookout",
      emoji: "🔥",
      note: "DF Day 20 · heat-treat substrate; room freed for next cycle",
      badge: "OOTY", dotColor: "bg-orange-400",
    },
  ];
}

const BADGE_COLORS: Record<string, string> = {
  COIM: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  LAB:  "bg-blue-50  text-blue-700  ring-1 ring-inset ring-blue-200",
  ANNUR:"bg-teal-50  text-teal-700  ring-1 ring-inset ring-teal-200",
  OOTY: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
};

// ── Page component ────────────────────────────────────────────────────────────
export default function ScheduleSuggest() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: rooms } = useListOotyRooms({ query: { queryKey: getListOotyRoomsQueryKey() } });
  const roomList: any[] = (rooms as any) ?? [];

  const [roomId,         setRoomId]         = useState<string>("");
  const [targetSellDate, setTargetSellDate] = useState(isoToday());
  const [summary,        setSummary]        = useState<any>(null);
  const [events,         setEvents]         = useState<any[]>([]);
  const [planCode,       setPlanCode]       = useState<string>("");
  const [targetEdits,    setTargetEdits]    = useState<Record<number, string>>({});
  const [startEdits,     setStartEdits]     = useState<Record<number, string>>({});
  const [saved,          setSaved]          = useState(false);
  const [saveError,      setSaveError]      = useState<string | null>(null);

  const suggestMut = useGenerateScheduleSuggestions({
    mutation: {
      onSuccess: (data: any) => {
        const { summary: s, planCode: pc, events: evts } = data as {
          summary: any; planCode: string; events: any[];
        };
        setSummary(s);
        setPlanCode(pc);
        setEvents(evts);
        const initTarget: Record<number, string> = {};
        const initStart:  Record<number, string> = {};
        evts.forEach((e: any, i: number) => {
          initTarget[i] = e.plannedDate;
          initStart[i]  = e.startDate ?? e.plannedDate;
        });
        setTargetEdits(initTarget);
        setStartEdits(initStart);
        setSaved(false);
        setSaveError(null);
      },
    },
  });

  const createMut = useCreateScheduleEvent({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListScheduleEventsQueryKey() }),
    },
  });

  const handleGenerate = () => {
    suggestMut.mutate({
      data: { targetSellDate, ootyRoomId: roomId ? Number(roomId) : null } as any,
    });
  };

  const handleSaveAll = async () => {
    setSaveError(null);
    try {
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        await createMut.mutateAsync({
          data: {
            locationCode: e.locationCode,
            entityType: e.entityType ?? "batch",
            entityId: e.entityId ?? null,
            eventType: e.eventType,
            startDate: startEdits[i] ?? e.startDate ?? null,
            plannedDate: targetEdits[i] ?? e.plannedDate,
            planCode: e.planCode ?? null,
            notes: e.notes ?? `Auto-suggested — target sell date ${targetSellDate}`,
            isManualOverride: false,
            isSuggestion: false,
          } as any,
        });
      }
      setSaved(true);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save some events.");
    }
  };

  // Group events by location code
  const grouped = LOC_ORDER.reduce<Record<string, { idx: number; ev: any }[]>>((acc, loc) => {
    acc[loc] = events.map((ev, idx) => ({ ev, idx })).filter(({ ev }) => ev.locationCode === loc);
    return acc;
  }, {} as any);

  const milestones = summary ? buildMilestones(summary) : [];
  const hasPlan = events.length > 0 && summary;

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:space-y-8 md:p-8">

        {/* ── Back ─────────────────────────────────────────────────────────── */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/scheduling")}
          className="px-0 h-auto py-1 hover:bg-transparent text-muted-foreground hover:text-foreground font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Calendar
        </Button>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <CalendarCheck className="w-6 h-6 text-primary" />
            Plan a Production Schedule
          </h1>
        </div>

        {/* ── Plan Parameters ──────────────────────────────────────────────── */}
        <Card className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
          <CardHeader className="border-b border-border/60 bg-muted/30 px-4 pb-4 pt-5 sm:px-6">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5" />
              Plan Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
              {/* Ooty Room */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-violet-500" />
                  Ooty Room
                  <span className="normal-case text-muted-foreground/60 font-normal">(optional)</span>
                </Label>
                <select
                  className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground shadow-sm outline-none transition-all hover:border-foreground/20 focus:ring-4 focus:ring-primary/10 focus:border-primary/50 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m3%204.5%203%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.9rem_center]"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">Any / unspecified</option>
                  {roomList
                    .filter((r: any) => r.status !== "maintenance")
                    .map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.status})
                      </option>
                    ))}
                </select>
              </div>

              {/* Target Sell Date */}
              <div>
                <div className="flex items-center gap-2.5 h-11 rounded-lg border border-border bg-background px-3.5 shadow-sm hover:border-foreground/20 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary/50 transition-all">
                  <Target className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0 whitespace-nowrap">
                    Target Date
                  </span>
                  <div className="w-px h-4 bg-border shrink-0" />
                  <input
                    type="date"
                    required
                    value={targetSellDate}
                    onChange={(e) => setTargetSellDate(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-mono outline-none min-w-0"
                  />
                </div>
              </div>

              {/* Generate button */}
              <Button
                onClick={handleGenerate}
                disabled={suggestMut.isPending || !targetSellDate}
                className="rounded-lg h-11 w-full font-semibold shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {suggestMut.isPending ? "Calculating…" : "Generate Plan"}
              </Button>
            </div>

            {!targetSellDate && (
              <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                Select a target date to back-calculate the full production schedule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Lead-time reference ──────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
            Lead Time Reference
          </p>
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {LOC_ORDER.map((loc) => {
              const m = LOC_META[loc];
              const Icon = m.icon;
              return (
                <div
                  key={loc}
                  className="p-4 rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center mb-2.5`}>
                    <Icon className={`w-4 h-4 ${m.accent}`} />
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground mb-1">{loc}</p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Plan output ──────────────────────────────────────────────────── */}
        {hasPlan && (
          <div className="space-y-6">
            {/* Section header + Save button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2.5">
                Suggested Schedule
                <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  {planCode}
                </span>
              </h2>
              {!saved ? (
                <Button
                  onClick={handleSaveAll}
                  disabled={createMut.isPending}
                  className="h-10 w-full rounded-lg px-5 font-semibold shadow-sm transition-all hover:shadow-md sm:w-auto"
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  {createMut.isPending ? "Saving…" : "Save All as Events"}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold bg-emerald-50 px-3.5 py-2 rounded-lg ring-1 ring-inset ring-emerald-200">
                  <CheckCircle2 className="w-4 h-4" /> Saved to calendar
                </div>
              )}
            </div>

            {saveError && (
              <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
                {saveError}
              </div>
            )}

            {/* ── Plan Timeline card ───────────────────────────────────────── */}
            <Card className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
              <CardHeader className="pb-4 pt-5 px-6 bg-gradient-to-br from-muted/40 to-transparent border-b border-border/60">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Production Plan — {planCode}
                    </p>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-lg font-bold text-foreground">Target Sell / Ready: {fmt(summary.targetSellDate)}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <div className="flex items-center justify-end gap-1.5 text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-md ring-1 ring-inset ring-amber-200 mb-1.5">
                      <Package className="w-3.5 h-3.5" />
                      {summary.packingDays} days packing
                    </div>
                    <p className="text-muted-foreground">First Harvest required by</p>
                    <p className="font-bold text-foreground">{fmt(summary.firstHarvestDate)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-5 sm:px-6">
                {/* Timeline with connecting spine */}
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-1">
                    {milestones.map((m: any, i) => (
                      <div
                        key={i}
                        className={`relative grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 py-3 pr-2 sm:flex sm:gap-4 sm:pr-3 rounded-lg transition-colors ${
                          m.isKey ? "bg-muted/40" : "hover:bg-muted/20"
                        }`}
                      >
                        {/* Dot */}
                        <div className="flex items-center pt-1 shrink-0 relative z-10">
                          <div className={`w-3.5 h-3.5 rounded-full ${m.dotColor} ring-4 ring-background shadow-sm`} />
                        </div>
                        {/* Date */}
                        <div className="min-w-0 pt-0.5 sm:w-28 sm:shrink-0">
                          <p className={`text-sm font-mono font-bold ${m.isKey ? "text-foreground" : "text-foreground/75"}`}>
                            {fmtShort(m.date)}
                            {m.dateEnd && m.dateEnd !== m.date && (
                              <span className="text-muted-foreground font-normal"> – {fmtShort(m.dateEnd)}</span>
                            )}
                          </p>
                        </div>
                        {/* Badge */}
                        <div className="col-start-2 shrink-0 pt-0.5 sm:col-auto">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${BADGE_COLORS[m.badge]}`}>
                            {m.badge}
                          </span>
                        </div>
                        {/* Label + note */}
                        <div className="col-start-2 min-w-0 pt-0.5 sm:col-auto">
                          <p className={`text-sm font-semibold leading-snug ${m.isKey ? "text-foreground" : "text-foreground/90"}`}>
                            {m.emoji && <span className="mr-1">{m.emoji}</span>}
                            {m.label}
                          </p>
                          <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{m.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Editable location cards ─────────────────────────────────── */}
            <div>
              <p className="text-xs text-muted-foreground mb-4 px-1">
                Review and adjust start / target dates below, then click <strong className="text-foreground">Save All as Events</strong> to add to the master calendar.
              </p>

              {/* Upstream cards: Coimbatore, Lab, Annur (3 cols) */}
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                {(["COIMBATORE", "LAB", "ANNUR"] as const).map((loc) => {
                  const m = LOC_META[loc];
                  const Icon = m.icon;
                  const items = grouped[loc] ?? [];
                  if (items.length === 0) return null;
                  return (
                    <Card key={loc} className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
                      <CardHeader className="pb-4 pt-4 px-5 border-b border-border/60">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`w-4 h-4 ${m.accent}`} />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-bold text-foreground">{m.label}</CardTitle>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{m.location}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 space-y-5">
                        {items.map(({ ev, idx }) => {
                          const el = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, note: "" };
                          return (
                            <div key={idx} className="space-y-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm">{el.emoji}</span>
                                <p className="text-[13px] font-bold text-foreground">{el.label}</p>
                                {el.note && <p className="text-[11px] text-muted-foreground ml-auto">{el.note}</p>}
                              </div>
                              {/* Start Date */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Start Date</p>
                                <Input
                                  type="date"
                                  value={startEdits[idx] ?? ev.startDate ?? ev.plannedDate}
                                  onChange={(e) => setStartEdits({ ...startEdits, [idx]: e.target.value })}
                                  className="rounded-lg font-mono h-9 w-full border-primary/25 bg-primary/[0.03] shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                                />
                              </div>
                              <div className="flex items-center gap-1.5 text-muted-foreground/50 py-0.5">
                                <div className="flex-1 h-px bg-border" />
                                <ArrowRight className="w-3 h-3 shrink-0" />
                                <div className="flex-1 h-px bg-border" />
                              </div>
                              {/* Target Date */}
                              <div className="space-y-1.5">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Target / Deadline Date</p>
                                <Input
                                  type="date"
                                  value={targetEdits[idx] ?? ev.plannedDate}
                                  onChange={(e) => setTargetEdits({ ...targetEdits, [idx]: e.target.value })}
                                  className="rounded-lg font-mono h-9 w-full shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                                />
                              </div>
                              {ev.notes && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-2.5 py-2">{ev.notes}</p>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Ooty card — full width, compact table layout for 5 events */}
              {(grouped["OOTY"]?.length ?? 0) > 0 && (() => {
                const m = LOC_META["OOTY"];
                const Icon = m.icon;
                const items = grouped["OOTY"];
                return (
                  <Card className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
                    <CardHeader className="pb-4 pt-4 px-5 border-b border-border/60">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4 h-4 ${m.accent}`} />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">{m.label}</CardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.location}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {items.map(({ ev, idx }, itemIdx) => {
                        const el = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, emoji: "📅", note: "" };
                        const isHarvest = ev.eventType === "first_harvest" || ev.eventType === "second_harvest";
                        const isCookout = ev.eventType === "cookout_target";
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 px-5 py-4 border-b last:border-b-0 border-border/60 transition-colors ${
                              isHarvest ? "bg-green-50/50" : isCookout ? "bg-orange-50/40" : itemIdx % 2 === 1 ? "bg-muted/20" : ""
                            }`}
                          >
                            {/* Event label */}
                            <div className="w-full lg:w-52 shrink-0">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{el.emoji}</span>
                                <div>
                                  <p className="text-sm font-semibold text-foreground leading-tight">{el.label}</p>
                                  <p className="text-[11px] text-muted-foreground">{el.note}</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Start Date */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Start</p>
                                <Input
                                  type="date"
                                  value={startEdits[idx] ?? ev.startDate ?? ev.plannedDate}
                                  onChange={(e) => setStartEdits({ ...startEdits, [idx]: e.target.value })}
                                  className="rounded-lg font-mono h-9 border-primary/25 bg-primary/[0.03] shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                                />
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-4" />
                              {/* Target Date */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                                  {isHarvest ? "Window End" : "Target / End"}
                                </p>
                                <Input
                                  type="date"
                                  value={targetEdits[idx] ?? ev.plannedDate}
                                  onChange={(e) => setTargetEdits({ ...targetEdits, [idx]: e.target.value })}
                                  className="rounded-lg font-mono h-9 shadow-sm focus-visible:ring-4 focus-visible:ring-primary/10"
                                />
                              </div>
                            </div>
                            {/* Context note */}
                            <div className="w-full lg:w-48 shrink-0 hidden lg:block">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">{ev.notes}</p>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          </div>
        )}

        {events.length === 0 && !suggestMut.isPending && suggestMut.isSuccess && (
          <Card className="rounded-xl border-border/60 shadow-sm">
            <CardContent className="p-10 text-center">
              <p className="text-sm font-medium text-foreground mb-1">No suggestions returned</p>
              <p className="text-sm text-muted-foreground">Try adjusting the target date or room selection.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
