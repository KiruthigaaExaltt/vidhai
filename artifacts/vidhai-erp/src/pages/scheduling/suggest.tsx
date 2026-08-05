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
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

// ── Location metadata ─────────────────────────────────────────────────────────
const LOC_META: Record<string, { label: string; location: string; icon: any; accent: string; bg: string; desc: string }> = {
  LAB: {
    label: "Lab Spawn Prep",
    location: "Lab · Location D",
    icon: FlaskConical,
    accent: "text-blue-700 border-blue-200",
    bg: "bg-blue-50",
    desc: "65-day process (9 stages). Spawn must be ready by Annur dispatch date.",
  },
  COIMBATORE: {
    label: "Casing Batch",
    location: "Coimbatore · Location C",
    icon: Layers,
    accent: "text-amber-700 border-amber-200",
    bg: "bg-amber-50",
    desc: "~120 days: soil prepared and QC-approved before Ooty Casing Run starts.",
  },
  ANNUR: {
    label: "Grow Bag Batch",
    location: "Annur · Location A",
    icon: Box,
    accent: "text-teal-700 border-teal-200",
    bg: "bg-teal-50",
    desc: "~25 days: bag filling, spawn mixing → dispatch to Ooty. Dispatch date = Spawn Run Day 0.",
  },
  OOTY: {
    label: "Growing Room",
    location: "Ooty · Location B",
    icon: Thermometer,
    accent: "text-violet-700 border-violet-200",
    bg: "bg-violet-50",
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
      loc: "COIM", badge: "COIM", dotColor: "bg-amber-400",
    },
    {
      date: s.labBatchStart, dateEnd: null,
      label: "Lab Spawn Prep Start",
      note: "Media Prep Stage 1 — 65-day multi-stage process",
      loc: "LAB", badge: "LAB", dotColor: "bg-blue-400",
    },
    {
      date: s.annurBatchStart, dateEnd: null,
      label: "Annur Grow Bag Batch Start",
      note: `Bag filling & spawn mixing begins (${25}d)`,
      loc: "ANNUR", badge: "ANNUR", dotColor: "bg-teal-400",
    },
    {
      date: s.annurDispatchDate, dateEnd: null,
      label: "Annur Dispatch → Ooty Spawn Run Day 0",
      note: "Bags leave Annur; placed in Ooty room same day",
      loc: "ANNUR", badge: "ANNUR", dotColor: "bg-teal-600",
      isKey: true,
    },
    {
      date: s.casingRunStart, dateEnd: null,
      label: "Ooty Casing Run Start · Coimbatore QC Approved",
      note: "Casing soil applied; Coim soil arrives QC-clear",
      loc: "OOTY", badge: "OOTY", dotColor: "bg-violet-400",
    },
    {
      date: s.dfDay0, dateEnd: null,
      label: "DF Day 0 — Development & Fruiting Begins",
      note: "Casing Run complete; pinning / fruiting phase starts",
      loc: "OOTY", badge: "OOTY", dotColor: "bg-violet-500",
      isKey: true,
    },
    {
      date: s.firstHarvestDate, dateEnd: s.firstHarvestDateTo,
      label: "🍄 First Harvest Window",
      note: `DF Day 9–11 · must harvest by ${fmtShort(s.firstHarvestDate)} for ${s.packingDays} packing days`,
      loc: "OOTY", badge: "OOTY", dotColor: "bg-green-500",
      isKey: true,
    },
    {
      date: s.secondHarvestDateFrom, dateEnd: s.secondHarvestDateTo,
      label: "🍄 Second Harvest (assumed)",
      note: "DF Day 15–17 · secondary flush; timing may vary ±1–2 days",
      loc: "OOTY", badge: "OOTY", dotColor: "bg-green-400",
    },
    {
      date: s.cookoutDate, dateEnd: null,
      label: "🔥 Cookout",
      note: "DF Day 20 · heat-treat substrate; room freed for next cycle",
      loc: "OOTY", badge: "OOTY", dotColor: "bg-orange-400",
    },
  ];
}

const BADGE_COLORS: Record<string, string> = {
  COIM: "bg-amber-100 text-amber-700 border-amber-200",
  LAB:  "bg-blue-100  text-blue-700  border-blue-200",
  ANNUR:"bg-teal-100  text-teal-700  border-teal-200",
  OOTY: "bg-violet-100 text-violet-700 border-violet-200",
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

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Back */}
        <Button variant="ghost" onClick={() => setLocation("/scheduling")}
          className="px-0 hover:bg-transparent text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Calendar
        </Button>

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Plan a Production Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your <strong>Target Sell / Ready Date</strong>. The system back-calculates every upstream start date — Ooty room, Annur bags, Lab spawn prep, and Coimbatore casing soil.
          </p>
        </div>

        {/* ── Inputs ─────────────────────────────────────────────────────────── */}
        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Plan Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Ooty Room (optional)
              </Label>
              <select
                className="h-9 rounded-sm border border-border bg-background px-3 text-sm min-w-[200px]"
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
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Target Sell / Ready Date
              </Label>
              <Input
                type="date"
                required
                value={targetSellDate}
                onChange={(e) => setTargetSellDate(e.target.value)}
                className="rounded-sm font-mono h-9 w-[180px]"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={suggestMut.isPending || !targetSellDate}
              className="rounded-sm h-9"
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              {suggestMut.isPending ? "Calculating…" : "Generate Plan"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Lead-time reference ────────────────────────────────────────────── */}
        <Card className="rounded-sm border-border shadow-none bg-muted/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">
              Lead Time Reference
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {LOC_ORDER.map((loc) => {
                const m = LOC_META[loc];
                const Icon = m.icon;
                return (
                  <div key={loc} className={`p-3 rounded-sm border ${m.bg} ${m.accent}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">{loc}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">{m.desc}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Plan output ───────────────────────────────────────────────────── */}
        {events.length > 0 && summary && (
          <div className="space-y-5">
            {/* Section header + Save button */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                Suggested Schedule
                <span className="px-2 py-0.5 rounded-sm text-[11px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20">
                  {planCode}
                </span>
              </h2>
              {!saved ? (
                <Button onClick={handleSaveAll} disabled={createMut.isPending} className="rounded-sm h-9">
                  <CalendarDays className="w-4 h-4 mr-1.5" />
                  {createMut.isPending ? "Saving…" : "Save All as Events"}
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-primary text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Saved to calendar
                </div>
              )}
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            {/* ── Plan Timeline card ─────────────────────────────────────────── */}
            <Card className="rounded-sm border-border shadow-none">
              <CardHeader className="pb-0 pt-4 px-4">
                {/* Target Sell Date banner */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
                      Production Plan — {planCode}
                    </p>
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-lg font-bold">Target Sell / Ready: {fmt(summary.targetSellDate)}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <div className="flex items-center justify-end gap-1 text-amber-600 font-medium">
                      <Package className="w-3.5 h-3.5" />
                      {summary.packingDays} days packing
                    </div>
                    <p>First Harvest required by</p>
                    <p className="font-semibold text-foreground">{fmt(summary.firstHarvestDate)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {/* Timeline table */}
                <div className="border-t">
                  {milestones.map((m, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 px-4 py-2.5 border-b last:border-b-0 ${
                        m.isKey ? "bg-muted/30" : ""
                      }`}
                    >
                      {/* Dot */}
                      <div className="flex items-center pt-1 shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${m.dotColor}`} />
                      </div>
                      {/* Date */}
                      <div className="w-32 shrink-0">
                        <p className={`text-sm font-mono font-semibold ${m.isKey ? "text-foreground" : "text-foreground/80"}`}>
                          {fmtShort(m.date)}
                          {m.dateEnd && m.dateEnd !== m.date && (
                            <span className="text-muted-foreground"> – {fmtShort(m.dateEnd)}</span>
                          )}
                        </p>
                      </div>
                      {/* Badge */}
                      <div className="shrink-0 pt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border ${BADGE_COLORS[m.badge]}`}>
                          {m.badge}
                        </span>
                      </div>
                      {/* Label + note */}
                      <div className="min-w-0">
                        <p className={`text-sm font-medium leading-snug ${m.isKey ? "text-foreground" : "text-foreground/90"}`}>
                          {m.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{m.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── Editable location cards ───────────────────────────────────── */}
            <div>
              <p className="text-xs text-muted-foreground mb-3">
                Review and adjust start / target dates below, then click <strong>Save All as Events</strong> to add to the master calendar.
              </p>

              {/* Upstream cards: Coimbatore, Lab, Annur (3 cols) */}
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                {(["COIMBATORE", "LAB", "ANNUR"] as const).map((loc) => {
                  const m = LOC_META[loc];
                  const Icon = m.icon;
                  const items = grouped[loc] ?? [];
                  if (items.length === 0) return null;
                  return (
                    <Card key={loc} className="rounded-sm border-border shadow-none">
                      <CardHeader className="pb-3 border-b">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider border ${m.bg} ${m.accent}`}>
                            {loc}
                          </span>
                          <div>
                            <CardTitle className="text-sm font-semibold">{m.label}</CardTitle>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{m.location}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        {items.map(({ ev, idx }) => {
                          const el = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, note: "" };
                          return (
                            <div key={idx} className="space-y-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">{el.emoji}</span>
                                <p className="text-xs font-semibold text-foreground">{el.label}</p>
                                {el.note && <p className="text-[11px] text-muted-foreground ml-auto">{el.note}</p>}
                              </div>
                              {/* Start Date */}
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Start Date</p>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="date"
                                    value={startEdits[idx] ?? ev.startDate ?? ev.plannedDate}
                                    onChange={(e) => setStartEdits({ ...startEdits, [idx]: e.target.value })}
                                    className="rounded-sm font-mono h-8 flex-1 border-primary/30 bg-primary/[0.02]"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <div className="flex-1 h-px bg-border" />
                                <ArrowRight className="w-3 h-3 shrink-0" />
                                <div className="flex-1 h-px bg-border" />
                              </div>
                              {/* Target Date */}
                              <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Target / Deadline Date</p>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="date"
                                    value={targetEdits[idx] ?? ev.plannedDate}
                                    onChange={(e) => setTargetEdits({ ...targetEdits, [idx]: e.target.value })}
                                    className="rounded-sm font-mono h-8 flex-1"
                                  />
                                </div>
                              </div>
                              {ev.notes && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{ev.notes}</p>
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
                  <Card className="rounded-sm border-border shadow-none">
                    <CardHeader className="pb-3 border-b">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider border ${m.bg} ${m.accent}`}>
                          OOTY
                        </span>
                        <div>
                          <CardTitle className="text-sm font-semibold">{m.label}</CardTitle>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.location}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {/* Compact event table */}
                      {items.map(({ ev, idx }, itemIdx) => {
                        const el = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, emoji: "📅", note: "" };
                        const isHarvest = ev.eventType === "first_harvest" || ev.eventType === "second_harvest";
                        const isCookout = ev.eventType === "cookout_target";
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-4 px-4 py-3 border-b last:border-b-0 ${
                              isHarvest ? "bg-green-50/60" : isCookout ? "bg-orange-50/40" : ""
                            }`}
                          >
                            {/* Event label */}
                            <div className="w-52 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{el.emoji}</span>
                                <div>
                                  <p className="text-sm font-medium leading-tight">{el.label}</p>
                                  <p className="text-[11px] text-muted-foreground">{el.note}</p>
                                </div>
                              </div>
                            </div>
                            {/* Start Date */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Start</p>
                              <Input
                                type="date"
                                value={startEdits[idx] ?? ev.startDate ?? ev.plannedDate}
                                onChange={(e) => setStartEdits({ ...startEdits, [idx]: e.target.value })}
                                className="rounded-sm font-mono h-8 border-primary/30 bg-primary/[0.02]"
                              />
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            {/* Target Date */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                                {isHarvest ? "Window End" : "Target / End"}
                              </p>
                              <Input
                                type="date"
                                value={targetEdits[idx] ?? ev.plannedDate}
                                onChange={(e) => setTargetEdits({ ...targetEdits, [idx]: e.target.value })}
                                className="rounded-sm font-mono h-8"
                              />
                            </div>
                            {/* Context note */}
                            <div className="w-48 shrink-0 hidden lg:block">
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
          <Card className="rounded-sm border-border shadow-none">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No suggestions returned.
            </CardContent>
          </Card>
        )}
      </div>
    </Shell>
  );
}
