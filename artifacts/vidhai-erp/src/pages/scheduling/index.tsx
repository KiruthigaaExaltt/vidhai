import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListScheduleEvents,
  getListScheduleEventsQueryKey,
  useCreateScheduleEvent,
  useUpdateScheduleEvent,
  useDeleteScheduleEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
  LayoutList,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const LOCATIONS = [
  { code: "ALL", label: "Master View" },
  { code: "ANNUR", label: "Annur (A)" },
  { code: "OOTY", label: "Ooty (B)" },
  { code: "COIMBATORE", label: "Coimbatore (C)" },
  { code: "LAB", label: "Lab (D)" },
];

const EVENT_TYPES: Record<string, string> = {
  spawn_mix: "Spawn Mix",
  bag_fill: "Bag Fill",
  spawn_run_start: "Spawn Run Start",
  casing_run_start: "Casing Run Start",
  df_start: "DF Start",
  cookout: "Cookout",
  casing_batch_start: "Casing Batch Start",
  casing_qc: "Casing QC",
  lab_culture_start: "Culture Start",
  lab_spawn_prep: "Spawn Prep",
  dispatch_target: "Dispatch Target",
  spawn_ready_target: "Spawn Ready",
  qc_approve_target: "QC Approve Target",
  custom: "Custom",
};

const LOC_COLORS: Record<string, string> = {
  ANNUR: "bg-emerald-500",
  OOTY: "bg-blue-500",
  COIMBATORE: "bg-amber-500",
  LAB: "bg-purple-500",
};

const LOC_BG_COLORS: Record<string, string> = {
  ANNUR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OOTY: "bg-blue-50 text-blue-700 border-blue-200",
  COIMBATORE: "bg-amber-50 text-amber-700 border-amber-200",
  LAB: "bg-purple-50 text-purple-700 border-purple-200",
};

const LOC_DOT: Record<string, string> = {
  ANNUR: "bg-emerald-500",
  OOTY: "bg-blue-500",
  COIMBATORE: "bg-amber-500",
  LAB: "bg-purple-500",
};

function isoToday() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const EMPTY_FORM = {
  locationCode: "ANNUR",
  entityType: "batch",
  entityId: "",
  eventType: "custom",
  startDate: "",
  plannedDate: isoToday(),
  notes: "",
  isManualOverride: true,
  isSuggestion: false,
};

export default function SchedulingCalendar() {
  const [, setLocation] = useLocation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [locFilter, setLocFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"calendar" | "plans">("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const calendarParams = {
    ...(locFilter !== "ALL" ? { locationCode: locFilter } : {}),
    from: fromDate,
    to: toDate,
  };

  // Calendar view events (monthly)
  const { data: calEvents, isLoading } = useListScheduleEvents(calendarParams, {
    query: { queryKey: getListScheduleEventsQueryKey(calendarParams) },
  });
  const evList: any[] = (calEvents as any) ?? [];

  // Plans view events — all events, no date filter
  const allEventsParams =
    locFilter !== "ALL" ? { locationCode: locFilter } : {};
  const { data: allEventsData } = useListScheduleEvents(
    allEventsParams as any,
    {
      query: {
        queryKey: getListScheduleEventsQueryKey(allEventsParams as any),
        enabled: viewMode === "plans",
      },
    },
  );
  const allEvents: any[] = (allEventsData as any) ?? [];

  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey: getListScheduleEventsQueryKey(),
    });

  const createMut = useCreateScheduleEvent({
    mutation: { onSuccess: refetch },
  });
  const updateMut = useUpdateScheduleEvent({
    mutation: { onSuccess: refetch },
  });
  const deleteMut = useDeleteScheduleEvent({
    mutation: { onSuccess: refetch },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const openNew = (dateStr?: string) => {
    if (!can("scheduling.calendar.create")) return;
    setEditEvent(null);
    setForm({ ...EMPTY_FORM, plannedDate: dateStr || isoToday() });
    setDialogOpen(true);
  };

  const openEdit = (ev: any) => {
    if (!can("scheduling.calendar.update")) return;
    setEditEvent(ev);
    setForm({
      locationCode: ev.locationCode,
      entityType: ev.entityType,
      entityId: ev.entityId ?? "",
      eventType: ev.eventType,
      startDate: ev.startDate ?? "",
      plannedDate: ev.plannedDate,
      notes: ev.notes ?? "",
      isManualOverride: true,
      isSuggestion: false,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editEvent) {
      updateMut.mutate(
        {
          id: editEvent.id,
          data: {
            startDate: form.startDate || null,
            plannedDate: form.plannedDate,
            notes: form.notes || null,
            isManualOverride: true,
          } as any,
        },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createMut.mutate(
        {
          data: {
            locationCode: form.locationCode,
            entityType: form.entityType,
            entityId: form.entityId ? Number(form.entityId) : null,
            eventType: form.eventType,
            startDate: form.startDate || null,
            plannedDate: form.plannedDate,
            notes: form.notes || null,
            isManualOverride: true,
          } as any,
        },
        { onSuccess: () => setDialogOpen(false) },
      );
    }
  };

  const handleDelete = () => {
    if (!can("scheduling.calendar.delete")) return;
    if (deleteId == null) return;
    deleteMut.mutate({ id: deleteId }, { onSuccess: () => setDeleteId(null) });
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));
  const goToday = () => {
    setCurrentDate(new Date());
    setSelectedDateStr(isoToday());
  };

  // Calendar grid
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarDays: (string | null)[] = [];
  for (let i = 0; i < firstDayOffset; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(
      `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`,
    );
  }
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    evList.forEach((ev) => {
      if (!map[ev.plannedDate]) map[ev.plannedDate] = [];
      map[ev.plannedDate].push(ev);
    });
    return map;
  }, [evList]);

  const selectedEvents = selectedDateStr
    ? eventsByDate[selectedDateStr] || []
    : [];

  // Plans view: group all events by planCode, then sort by oldest start date per plan
  const planGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    allEvents.forEach((ev) => {
      const key = ev.planCode ?? "__manual__";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    });
    // Sort each group's events by plannedDate
    Object.values(groups).forEach((g) =>
      g.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)),
    );
    // Sort plan keys: named plans first (PLAN-NNN), then manual
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "__manual__") return 1;
      if (b === "__manual__") return -1;
      return a.localeCompare(b);
    });
  }, [allEvents]);

  return (
    <Shell>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 w-full flex-col space-y-6 p-6 md:p-8">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display flex items-center gap-3 text-foreground">
              <CalendarDays className="w-8 h-8 text-primary" /> Orchestration
              Calendar
            </h1>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-lg shadow-sm h-10 px-4 font-medium hover:shadow-md transition-all"
              onClick={() => setLocation("/scheduling/suggest")}
            >
              <CalendarCheck className="w-4 h-4 mr-2 text-amber-500" /> Plan Schedule
            </Button>
            <Button
              className="rounded-lg shadow-sm h-10 px-4 font-medium hover:shadow-md transition-all"
              onClick={() => openNew()}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Event
            </Button>
          </div>
        </div>

        {/* Filter + View toggle bar */}
        <div className="flex flex-wrap gap-2 items-center shrink-0 pb-1">
          <div className="flex rounded-lg bg-white shadow-sm border border-border/60 p-0.5">
            {LOCATIONS.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocFilter(l.code)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                  locFilter === l.code
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* View mode toggle */}
            <div className="flex items-center bg-white border border-border/60 rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => setViewMode("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === "calendar"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> Calendar
              </button>
              <button
                onClick={() => setViewMode("plans")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border/60 ${
                  viewMode === "plans"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" /> Plans
              </button>
            </div>

            {viewMode === "calendar" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToday}
                  className="h-8 rounded-lg px-3 text-xs font-medium bg-white shadow-sm"
                >
                  Today
                </Button>
                <div className="flex items-center bg-white border border-border/60 rounded-lg shadow-sm overflow-hidden">
                  <button
                    onClick={prevMonth}
                    className="p-2 hover:bg-muted/50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="w-40 text-center font-semibold uppercase tracking-wider text-sm">
                    {currentDate.toLocaleString("default", {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-muted/50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── CALENDAR VIEW ──────────────────────────────────────────────────── */}
        {viewMode === "calendar" && (
          <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
            {/* Grid */}
            <div className="flex-1 flex flex-col h-full overflow-hidden rounded-xl border border-border/60 shadow-sm ring-1 ring-black/[0.03]">
              <div className="grid grid-cols-7 bg-white shrink-0">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      key={day}
                      className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground border-r border-b border-border/60 bg-muted/20 last:border-r-0"
                    >
                      {day}
                    </div>
                  ),
                )}
              </div>
              <div className="flex-1 bg-muted/10 grid grid-cols-7 grid-rows-5 lg:grid-rows-auto overflow-y-auto">
                {calendarDays.map((dateStr, i) => {
                  if (!dateStr)
                    return (
                      <div
                        key={`empty-${i}`}
                        className="border-r border-b border-border/60 bg-muted/10 last:border-r-0"
                      />
                    );
                  const isToday = dateStr === isoToday();
                  const isSelected = dateStr === selectedDateStr;
                  const dayEvents = eventsByDate[dateStr] || [];
                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDateStr(dateStr)}
                      className={`min-h-[100px] border-r border-b border-border/60 p-2 cursor-pointer transition-colors relative flex flex-col group last:border-r-0 ${
                        isSelected
                          ? "bg-primary/5 ring-1 ring-inset ring-primary"
                          : "bg-white hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span
                          className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                            isToday
                              ? "bg-primary text-primary-foreground shadow-md"
                              : isSelected
                                ? "bg-primary/20 text-primary"
                                : "text-foreground"
                          }`}
                        >
                          {parseInt(dateStr.split("-")[2], 10)}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                        {dayEvents.map((ev) => {
                          const locColor =
                            LOC_COLORS[ev.locationCode] || "bg-slate-500";
                          return (
                            <div
                              key={ev.id}
                              className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded-md hover:bg-black/5"
                              title={`${EVENT_TYPES[ev.eventType] || ev.eventType} — ${ev.locationCode}${ev.planCode ? ` · ${ev.planCode}` : ""}`}
                            >
                              <div
                                className={`w-2 h-2 rounded-full shrink-0 ${locColor}`}
                              />
                              <span className="truncate flex-1 font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                {EVENT_TYPES[ev.eventType] || ev.eventType}
                              </span>
                              {ev.planCode && (
                                <span className="text-[9px] font-mono text-muted-foreground/60">
                                  {ev.planCode}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Side Panel */}
            {selectedDateStr && (
              <Card className="w-80 shrink-0 border-border/60 shadow-xl flex flex-col h-full rounded-xl overflow-hidden ring-1 ring-black/[0.03] animate-in slide-in-from-right-8 duration-300">
                <div className="p-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-foreground font-display text-lg">
                      {new Date(selectedDateStr).toLocaleDateString("default", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </h3>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      {selectedEvents.length} events
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedDateStr(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedEvents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-3">
                      <CalendarDays className="w-12 h-12 opacity-20" />
                      <p className="text-sm">No events on this day.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg shadow-sm"
                        onClick={() => openNew(selectedDateStr)}
                      >
                        Schedule Event
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-lg border-dashed"
                        onClick={() => openNew(selectedDateStr)}
                      >
                        <Plus className="w-4 h-4 mr-2" /> Add to this day
                      </Button>
                      {selectedEvents
                        .sort((a, b) =>
                          a.locationCode.localeCompare(b.locationCode),
                        )
                        .map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-3.5 rounded-lg border ${LOC_BG_COLORS[ev.locationCode] || "bg-slate-50 border-slate-200"} shadow-sm relative group`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="border-current/30 text-[10px] uppercase tracking-wider rounded-full bg-white/50"
                                >
                                  {ev.locationCode}
                                </Badge>
                                {ev.planCode && (
                                  <span className="text-[10px] font-mono text-current/60 bg-white/40 px-1.5 py-0.5 rounded-full">
                                    {ev.planCode}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => openEdit(ev)}
                                  className="p-1 rounded-md hover:bg-black/10"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setDeleteId(ev.id)}
                                  className="p-1 rounded-md hover:bg-black/10 text-red-600"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <h4 className="font-semibold text-sm mb-1">
                              {EVENT_TYPES[ev.eventType] || ev.eventType}
                            </h4>
                            {ev.startDate && (
                              <div className="text-xs font-mono opacity-80">
                                Start: {fmtDate(ev.startDate)}
                              </div>
                            )}
                            {ev.entityId && (
                              <div className="text-xs flex items-center gap-1 opacity-80 font-mono">
                                <MapPin className="w-3 h-3" /> Ref:{" "}
                                {ev.entityId}
                              </div>
                            )}
                            {ev.notes && (
                              <div className="mt-2 text-xs italic opacity-80">
                                "{ev.notes}"
                              </div>
                            )}
                            <div className="mt-3 flex gap-2">
                              {ev.isSuggestion && (
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 text-[10px] rounded-full">
                                  Suggestion
                                </Badge>
                              )}
                              {ev.actualDate && (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0 text-[10px] rounded-full">
                                  Completed
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── PLANS LIST VIEW ────────────────────────────────────────────────── */}
        {viewMode === "plans" && (
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pb-4">
            {planGroups.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarDays className="w-12 h-12 opacity-20 mx-auto mb-3" />
                <p className="text-sm">
                  No saved plans yet. Use <strong>Plan Schedule</strong> to
                  generate and save a plan.
                </p>
              </div>
            )}

            {planGroups.map(([planCode, events]) => {
              const isNamed = planCode !== "__manual__";
              const locsInPlan = [
                ...new Set(events.map((e) => e.locationCode)),
              ];
              const earliestStart = events.reduce((min, e) => {
                const d = e.startDate || e.plannedDate;
                return !min || d < min ? d : min;
              }, "");
              const latestTarget = events.reduce((max, e) => {
                return e.plannedDate > max ? e.plannedDate : max;
              }, "");

              return (
                <Card
                  key={planCode}
                  className="rounded-xl border-border/60 shadow-sm ring-1 ring-black/[0.03] overflow-hidden"
                >
                  {/* Plan header */}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-muted/20 border-b border-border/60">
                    <div className="flex items-center gap-3">
                      {isNamed ? (
                        <span className="font-mono font-bold text-primary text-sm bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                          {planCode}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Manual Events
                        </span>
                      )}
                      <div className="flex gap-1">
                        {locsInPlan.map((loc) => (
                          <span
                            key={loc}
                            className={`w-2 h-2 rounded-full ${LOC_DOT[loc] || "bg-slate-400"}`}
                            title={loc}
                          />
                        ))}
                      </div>
                      {isNamed && earliestStart && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {fmtDate(earliestStart)} → {fmtDate(latestTarget)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {events.length} event{events.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Events table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-muted-foreground text-[10px] uppercase tracking-wider border-b border-border/60">
                        <tr>
                          <th className="px-5 py-2.5 font-medium text-left">
                            Location
                          </th>
                          <th className="px-5 py-2.5 font-medium text-left">
                            Event
                          </th>
                          <th className="px-5 py-2.5 font-medium text-left">
                            Start Date
                          </th>
                          <th className="px-5 py-2.5 font-medium text-left">
                            Target Date
                          </th>
                          <th className="px-5 py-2.5 font-medium text-left">
                            Status
                          </th>
                          <th className="px-3 py-2.5 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {events.map((ev) => (
                          <tr
                            key={ev.id}
                            className="h-[42px] hover:bg-muted/10 transition-colors"
                          >
                            <td className="px-5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${LOC_DOT[ev.locationCode] || "bg-slate-400"}`}
                                />
                                <span
                                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${LOC_BG_COLORS[ev.locationCode] || "bg-slate-50 border-slate-200 text-slate-700"}`}
                                >
                                  {ev.locationCode}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 font-medium text-foreground text-xs">
                              {EVENT_TYPES[ev.eventType] || ev.eventType}
                            </td>
                            <td className="px-5 font-mono text-xs text-muted-foreground">
                              {fmtDate(ev.startDate) !== "—" ? (
                                fmtDate(ev.startDate)
                              ) : (
                                <span className="text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-5 font-mono text-xs text-foreground font-semibold">
                              {fmtDate(ev.plannedDate)}
                            </td>
                            <td className="px-5">
                              {ev.actualDate ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0 text-[10px] rounded-full">
                                  Done
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] rounded-full text-muted-foreground border-muted-foreground/20"
                                >
                                  Scheduled
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => openEdit(ev)}
                                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setDeleteId(ev.id)}
                                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Add / Edit dialog ───────────────────────────────────────────────── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="rounded-xl border-border/60 shadow-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editEvent ? "Edit Event" : "Schedule Event"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {!editEvent && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        Location
                      </Label>
                      <Select
                        value={form.locationCode}
                        onValueChange={(v) =>
                          setForm({ ...form, locationCode: v })
                        }
                      >
                        <SelectTrigger className="rounded-lg h-10 shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg">
                          {LOCATIONS.filter((l) => l.code !== "ALL").map(
                            (l) => (
                              <SelectItem key={l.code} value={l.code}>
                                {l.label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        Event Type
                      </Label>
                      <Select
                        value={form.eventType}
                        onValueChange={(v) =>
                          setForm({ ...form, eventType: v })
                        }
                      >
                        <SelectTrigger className="rounded-lg h-10 shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg">
                          {Object.entries(EVENT_TYPES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Entity ID (optional)
                    </Label>
                    <Input
                      type="number"
                      value={form.entityId}
                      onChange={(e) =>
                        setForm({ ...form, entityId: e.target.value })
                      }
                      className="rounded-lg font-mono h-10 shadow-sm"
                      placeholder="e.g. batch ID"
                    />
                  </div>
                </>
              )}

              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Start Date (optional)
                </Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  className="rounded-lg font-mono h-10 shadow-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  When work on this event begins
                </p>
              </div>

              {/* Target / Planned Date */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Target / Deadline Date
                </Label>
                <Input
                  type="date"
                  required
                  value={form.plannedDate}
                  onChange={(e) =>
                    setForm({ ...form, plannedDate: e.target.value })
                  }
                  className="rounded-lg font-mono h-10 shadow-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  The planned completion or milestone date
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-lg h-10 shadow-sm"
                  placeholder="Optional context"
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button
                variant="outline"
                className="rounded-lg h-10"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-lg h-10 shadow-sm hover:shadow-md transition-all"
                disabled={
                  createMut.isPending ||
                  updateMut.isPending ||
                  !form.plannedDate
                }
                onClick={handleSave}
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editEvent
                    ? "Update Event"
                    : "Add Event"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm dialog */}
        <Dialog
          open={deleteId != null}
          onOpenChange={(o) => {
            if (!o) setDeleteId(null);
          }}
        >
          <DialogContent className="rounded-xl border-border/60 shadow-xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete event?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground pt-1">
              This will permanently remove the scheduled event.
            </p>
            <DialogFooter className="pt-4">
              <Button
                variant="outline"
                className="rounded-lg"
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-lg"
                disabled={deleteMut.isPending}
                onClick={handleDelete}
              >
                {deleteMut.isPending ? "Deleting…" : "Confirm Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
