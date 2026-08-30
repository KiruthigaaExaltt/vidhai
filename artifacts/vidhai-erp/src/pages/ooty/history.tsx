import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import { apiAssetUrl } from "@/lib/apiAssetUrl";
import { ImageLightbox } from "@/components/ImageLightbox";
import { Shell } from "@/components/layout/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RoomHistoryRow = {
  id: string;
  batchCode: string;
  roomId: string;
  roomName: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  allocatedBags: number;
  sourceBatches?: string[];
  mushroomCount: number;
  harvestWeightKg: number;
  manureBags?: number | null;
  manureProducedKg?: number | null;
};

type GrowingBatchHistory = RoomHistoryRow & {
  currentStage?: string;
  currentPhase?: string;
  notes?: string | null;
  batchSources?: Array<{ id: number; batchCode?: string | null; bagCount: number }>;
  stageLogs?: Array<{
    id: number;
    stage: string;
    enteredAt: string;
    exitedAt?: string | null;
    notes?: string | null;
    casingBatchRef?: string | null;
    casingSoilQuantityKg?: string | number | null;
    verificationImages?: string[];
    manureBags?: number | null;
  }>;
  observations?: Array<{
    id: number;
    observationDate: string;
    recordedAt?: string | null;
    temperatureCelsius?: string | number | null;
    observationType?: string | null;
    observationNote?: string | null;
  }>;
  harvests?: Array<{
    id: number;
    harvestDate: string;
    flushNumber?: number | null;
    weightKg?: string | number | null;
    mushroomCount?: number | null;
    avgWeightG?: string | number | null;
    qualityNote?: string | null;
  }>;
};

const stageLabel = (stage?: string | null) =>
  ({
    SPAWN_RUN: "Spawn Run",
    CASING_RUN: "Casing Run",
    PINNING_FLUSH1: "Flush 1",
    FLUSH2: "Flush 2",
    COOKOUT: "Cookout",
    COMPLETED: "Completed",
  })[stage || ""] || stage || "-";

function dateKey(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function displayDate(value?: string | null) {
  const key = dateKey(value);
  if (!key) return "-";
  const [year, month, day] = key.split("-");
  return year && month && day ? `${day}/${month}/${year}` : key;
}

function displayDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "-"
    : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function OotyRoomHistory() {
  const [, setLocation] = useLocation();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [batchCode, setBatchCode] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedRow, setSelectedRow] = useState<RoomHistoryRow | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const historyQuery = useQuery<RoomHistoryRow[]>({
    queryKey: ["ooty-room-history"],
    queryFn: async () => {
      const response = await fetch("/api/ooty/room-history", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load growing room history");
      return response.json();
    },
  });

  const rows = historyQuery.data ?? [];
  const detailQuery = useQuery<GrowingBatchHistory>({
    queryKey: ["ooty-completed-room-history", selectedRow?.id],
    enabled: !!selectedRow,
    queryFn: async () => {
      const response = await fetch(`/api/ooty/growing-batches/${selectedRow!.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load completed room history");
      return response.json();
    },
  });
  const batchCodes = useMemo(
    () =>
      [...new Set(rows.map((row) => row.batchCode).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      ),
    [rows],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const productionDate = dateKey(row.completedAt || row.startedAt);
        return (
          (batchCode === "all" || row.batchCode === batchCode) &&
          (!fromDate || productionDate >= fromDate) &&
          (!toDate || productionDate <= toDate)
        );
      }),
    [rows, batchCode, fromDate, toDate],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setBatchCode("all");
    setPage(1);
  };

  return (
    <Shell>
      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">
                Growing Room Production History
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Active batches open their live room process; completed batches
              open their full production history.
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/ooty")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Growing Rooms
          </Button>
        </div>

        <Card className="rounded-md shadow-none">
          <CardContent className="grid gap-4 p-4 md:grid-cols-4 md:items-end">
            <div className="space-y-2">
              <Label htmlFor="history-from">From date</Label>
              <Input
                id="history-from"
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="history-to">To date</Label>
              <Input
                id="history-to"
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(event) => {
                  setToDate(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Growing batch</Label>
              <Select
                value={batchCode}
                onValueChange={(value) => {
                  setBatchCode(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All batches</SelectItem>
                  {batchCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={clearFilters}>
              <RotateCcw className="mr-2 h-4 w-4" /> Clear filters
            </Button>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filteredRows.length} production record
            {filteredRows.length === 1 ? "" : "s"}
          </span>
          <span>
            {filteredRows
              .reduce((sum, row) => sum + Number(row.harvestWeightKg || 0), 0)
              .toFixed(2)}{" "}
            kg produced
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="border-b bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Growing Batch</th>
                <th className="px-4 py-3">Source Batch</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3 text-right">Bags</th>
                <th className="px-4 py-3">Started Date &amp; Time</th>
                <th className="px-4 py-3">Completed Date &amp; Time</th>
                <th className="px-4 py-3 text-right">Mushrooms</th>
                <th className="px-4 py-3 text-right">Weight</th>
                <th className="px-4 py-3 text-right">Manure Bags</th>
                <th className="px-4 py-3 text-right">Conversion</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    if (row.status === "completed") {
                      setSelectedRow(row);
                    } else {
                      setLocation(`/ooty/rooms/${row.roomId}`);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-mono">{row.batchCode}</td>
                  <td className="px-4 py-3">
                    {row.sourceBatches?.join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3 font-medium">{row.roomName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.allocatedBags}
                  </td>
                  <td className="px-4 py-3">{displayDateTime(row.startedAt)}</td>
                  <td className="px-4 py-3">{displayDateTime(row.completedAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-primary">
                    {row.mushroomCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.harvestWeightKg || 0).toFixed(2)} kg
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.manureBags ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.allocatedBags || 0) > 0
                      ? `${(Number(row.mushroomCount || 0) / Number(row.allocatedBags)).toFixed(4)} mushrooms/bag`
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="uppercase">
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {historyQuery.isLoading && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading history...
                  </td>
                </tr>
              )}
              {historyQuery.isError && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-12 text-center text-destructive"
                  >
                    Unable to load growing room history.
                  </td>
                </tr>
              )}
              {!historyQuery.isLoading &&
                !historyQuery.isError &&
                filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No production history matches these filters.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
          <div className="flex min-w-[700px] items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {filteredRows.length === 0
                ? "Showing 0 records"
                : `Showing ${(currentPage - 1) * pageSize + 1} to ${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length} records`}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-16 text-center tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Dialog
          open={!!selectedRow}
          onOpenChange={(open) => {
            if (!open && !previewImage) setSelectedRow(null);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedRow?.roomName} - {selectedRow?.batchCode}
              </DialogTitle>
              <DialogDescription>
                Complete production history for this finished room cycle.
              </DialogDescription>
            </DialogHeader>

            {detailQuery.isLoading && (
              <div className="py-12 text-center text-muted-foreground">Loading complete history...</div>
            )}
            {detailQuery.isError && (
              <div className="py-12 text-center text-destructive">Unable to load this completed room history.</div>
            )}
            {detailQuery.data && (() => {
              const detail = detailQuery.data;
              const stageLogs = detail.stageLogs ?? [];
              const observations = detail.observations ?? [];
              const harvests = detail.harvests ?? [];
              const sources = detail.batchSources ?? [];
              return (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <HistoryValue label="Room" value={selectedRow?.roomName} />
                    <HistoryValue label="Growing batch" value={selectedRow?.batchCode} mono />
                    <HistoryValue label="Source batches" value={sources.map((source) => `${source.batchCode || "-"} (${source.bagCount} bags)`).join(", ") || "-"} />
                    <HistoryValue label="Started" value={displayDateTime(selectedRow?.startedAt)} />
                    <HistoryValue label="Completed" value={displayDateTime(selectedRow?.completedAt)} />
                  </div>

                  <HistoryTable title="Stage history" headers={["Stage", "Entered", "Exited", "Photos", "Manure Bags", "Manure Weight", "Reference / notes"]} empty={stageLogs.length === 0}>
                    {stageLogs.map((log) => (
                      <tr key={log.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{stageLabel(log.stage)}</td>
                        <td className="px-3 py-2">{new Date(log.enteredAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{log.exitedAt ? new Date(log.exitedAt).toLocaleString() : "-"}</td>
                        <td className="px-3 py-2">
                          {log.verificationImages?.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {log.verificationImages.map((image, index) => (
                                <button
                                  key={`${log.id}-${index}`}
                                  type="button"
                                  className="h-10 w-10 overflow-hidden rounded border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  onClick={() => setPreviewImage(image)}
                                  aria-label={`Preview ${stageLabel(log.stage)} photo ${index + 1}`}
                                >
                                  <img src={apiAssetUrl(image)} alt="" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="px-3 py-2">{log.stage === "COOKOUT" ? (log.manureBags ?? detail.manureBags ?? "-") : "-"}</td>
                        <td className="px-3 py-2">{log.stage === "COOKOUT" && detail.manureProducedKg != null ? `${Number(detail.manureProducedKg).toFixed(2)} kg` : "-"}</td>
                        <td className="px-3 py-2">{[log.casingBatchRef, log.casingSoilQuantityKg ? `${Number(log.casingSoilQuantityKg).toFixed(2)} kg` : null, log.notes].filter(Boolean).join(" - ") || "-"}</td>
                      </tr>
                    ))}
                  </HistoryTable>

                  <HistoryTable title="Temperature & observation history" headers={["Date & Time", "Temperature", "Stage", "Note"]} empty={observations.length === 0}>
                    {observations.map((observation) => (
                      <tr key={observation.id} className="border-t">
                        <td className="px-3 py-2">{displayDateTime(observation.recordedAt ?? observation.observationDate)}</td>
                        <td className="px-3 py-2">{observation.temperatureCelsius != null ? `${Number(observation.temperatureCelsius).toFixed(1)} °C` : "-"}</td>
                        <td className="px-3 py-2">{stageLabel(observation.observationType)}</td>
                        <td className="px-3 py-2">{observation.observationNote || "-"}</td>
                      </tr>
                    ))}
                  </HistoryTable>

                  <HistoryTable title="Harvest history" headers={["Date", "Flush", "Weight", "Mushrooms", "Average", "Quality note"]} empty={harvests.length === 0}>
                    {harvests.map((harvest) => (
                      <tr key={harvest.id} className="border-t">
                        <td className="px-3 py-2">{displayDate(harvest.harvestDate)}</td>
                        <td className="px-3 py-2">{harvest.flushNumber ?? "-"}</td>
                        <td className="px-3 py-2">{Number(harvest.weightKg || 0).toFixed(2)} kg</td>
                        <td className="px-3 py-2">{harvest.mushroomCount ?? "-"}</td>
                        <td className="px-3 py-2">{harvest.avgWeightG != null ? `${Number(harvest.avgWeightG).toFixed(1)} g` : "-"}</td>
                        <td className="px-3 py-2">{harvest.qualityNote || "-"}</td>
                      </tr>
                    ))}
                  </HistoryTable>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        <ImageLightbox
          source={previewImage}
          onClose={() => setPreviewImage(null)}
          alt="Stage verification preview"
        />
      </div>
    </Shell>
  );
}

function HistoryValue({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

function HistoryTable({ title, headers, empty, children }: { title: string; headers: string[]; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border">
      <h3 className="border-b bg-muted/20 px-3 py-2 text-sm font-semibold uppercase tracking-wide">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
          <tbody>{empty ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">No records found.</td></tr> : children}</tbody>
        </table>
      </div>
    </section>
  );
}
