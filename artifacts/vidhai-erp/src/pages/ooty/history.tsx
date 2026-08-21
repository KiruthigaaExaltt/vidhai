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
};

function dateKey(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function displayDate(value?: string | null) {
  const key = dateKey(value);
  if (!key) return "-";
  const [year, month, day] = key.split("-");
  return year && month && day ? `${day}/${month}/${year}` : key;
}

export default function OotyRoomHistory() {
  const [, setLocation] = useLocation();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [batchCode, setBatchCode] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
              Completed and active production batches remain here even after a
              room becomes idle.
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
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Growing Batch</th>
                <th className="px-4 py-3">Source Batch</th>
                <th className="px-4 py-3 text-right">Bags</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-right">Mushrooms</th>
                <th className="px-4 py-3 text-right">Weight</th>
                <th className="px-4 py-3 text-right">Conversion</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedRows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setLocation(`/ooty/rooms/${row.roomId}`)}
                >
                  <td className="px-4 py-3 font-medium">{row.roomName}</td>
                  <td className="px-4 py-3 font-mono">{row.batchCode}</td>
                  <td className="px-4 py-3">
                    {row.sourceBatches?.join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.allocatedBags}
                  </td>
                  <td className="px-4 py-3">{displayDate(row.startedAt)}</td>
                  <td className="px-4 py-3">{displayDate(row.completedAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-primary">
                    {row.mushroomCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.harvestWeightKg || 0).toFixed(2)} kg
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
                    colSpan={10}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading history...
                  </td>
                </tr>
              )}
              {historyQuery.isError && (
                <tr>
                  <td
                    colSpan={10}
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
                      colSpan={10}
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
      </div>
    </Shell>
  );
}
