import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 500;
const ALLOWED_HEADERS = new Map([
  ["room name", "name"],
  ["capacity", "capacity"],
  ["notes", "notes"],
  ["annur batch", "annurBatchCode"],
  ["bags allocated", "bagsAllocated"],
  ["spawn run start date", "spawnRunStartDate"],
]);

type ImportRow = {
  rowNumber: number;
  name: unknown;
  capacity: unknown;
  notes: unknown;
  annurBatchCode: unknown;
  bagsAllocated: unknown;
  spawnRunStartDate: unknown;
  status: "valid" | "invalid" | "duplicate" | "existing";
  errors: string[];
};

type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: Array<{
    rowNumber: number;
    name: string;
    status: "created" | "skipped" | "failed";
    reason?: string;
  }>;
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");
const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

function validateRow(
  row: Omit<ImportRow, "status" | "errors">,
  completedBatchCodes: Set<string>,
): string[] {
  const errors: string[] = [];
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) errors.push("Room Name is required");
  else if (name.length > 120)
    errors.push("Room Name must be 120 characters or fewer");

  if (
    row.capacity !== "" &&
    row.capacity !== null &&
    row.capacity !== undefined
  ) {
    const capacity =
      typeof row.capacity === "number"
        ? row.capacity
        : Number(String(row.capacity).trim());
    if (!Number.isInteger(capacity) || capacity <= 0)
      errors.push("Capacity must be a positive whole number");
    else if (capacity > 1_000_000)
      errors.push("Capacity must be 1,000,000 or less");
  }
  if (
    row.notes !== "" &&
    row.notes !== null &&
    row.notes !== undefined &&
    typeof row.notes !== "string"
  )
    errors.push("Notes must be text");
  else if (String(row.notes ?? "").trim().length > 1000)
    errors.push("Notes must be 1000 characters or fewer");
  const annurBatchCode =
    typeof row.annurBatchCode === "string" ? row.annurBatchCode.trim() : "";
  const rawBags = row.bagsAllocated;
  const hasAnnurBatch = annurBatchCode !== "";
  const hasBags =
    rawBags !== null && rawBags !== undefined && String(rawBags).trim() !== "";
  const hasStartDate =
    typeof row.spawnRunStartDate === "string" && row.spawnRunStartDate !== "";
  const hasAnyAssignment = hasAnnurBatch || hasBags || hasStartDate;
  if (hasAnyAssignment) {
    if (!hasAnnurBatch)
      errors.push("Annur Batch is required when assigning a batch");
    else if (!completedBatchCodes.has(annurBatchCode.toLocaleLowerCase()))
      errors.push(
        `Annur Batch "${annurBatchCode}" is not available as a completed batch`,
      );
    const bagsAllocated =
      typeof rawBags === "number"
        ? rawBags
        : Number(String(rawBags ?? "").trim());
    if (!hasBags || !Number.isInteger(bagsAllocated) || bagsAllocated <= 0)
      errors.push(
        "Bags Allocated must be a positive whole number when assigning a batch",
      );
    if (
      !hasStartDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(row.spawnRunStartDate))
    )
      errors.push(
        "Spawn Run Start Date must use YYYY-MM-DD when assigning a batch",
      );
  }
  return errors;
}

function excelDateToIso(value: unknown): unknown {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed)
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return typeof value === "string" ? value.trim() : value;
}

export function GrowingRoomImportDialog({
  open,
  onOpenChange,
  existingRooms,
  completedAnnurBatches,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRooms: any[];
  completedAnnurBatches: any[];
  onImported: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const completedBatchCodes = useMemo(
    () =>
      new Set(
        completedAnnurBatches.map((batch) =>
          String(batch.batchCode).trim().toLocaleLowerCase(),
        ),
      ),
    [completedAnnurBatches],
  );
  const sampleBatchCode =
    completedAnnurBatches[0]?.batchCode ?? "A-YYYYMMDD-001";
  const existingNames = useMemo(
    () => new Set(existingRooms.map((room) => normalizeName(room.name))),
    [existingRooms],
  );
  const counts = useMemo(
    () => ({
      valid: rows.filter((row) => row.status === "valid").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      duplicate: rows.filter((row) => row.status === "duplicate").length,
      existing: rows.filter((row) => row.status === "existing").length,
    }),
    [rows],
  );

  const reset = () => {
    setFileName("");
    setRows([]);
    setFileError("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [
        "Room Name",
        "Capacity",
        "Notes",
        "Annur Batch",
        "Bags Allocated",
        "Spawn Run Start Date",
      ],
      ["Room 01", 1000, "", sampleBatchCode, 1000, new Date()],
      ["Room 02", 1200, "North wing", sampleBatchCode, 1200, new Date()],
    ]);
    worksheet["!cols"] = [
      { wch: 24 },
      { wch: 14 },
      { wch: 36 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
    ];
    worksheet["F2"].z = "yyyy-mm-dd";
    worksheet["F3"].z = "yyyy-mm-dd";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Growing Rooms");
    XLSX.writeFile(workbook, "ooty-growing-rooms-template.xlsx");
  };

  const selectFile = async (file?: File) => {
    setRows([]);
    setResult(null);
    setFileError("");
    if (!file) return;
    setFileName(file.name);
    if (!/\.(xlsx|xls)$/i.test(file.name))
      return setFileError("Select an Excel .xlsx or .xls file");
    if (file.size > MAX_FILE_BYTES)
      return setFileError("Excel file must be 5 MB or smaller");

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: true,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet)
        return setFileError("The Excel workbook does not contain a worksheet");
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: true,
      });
      if (!data.length) return setFileError("The Excel worksheet is empty");
      const headers = (data[0] ?? []).map(normalizeHeader);
      const unsupported = headers.filter(
        (header) => header && !ALLOWED_HEADERS.has(header),
      );
      if (unsupported.length)
        return setFileError(
          `Unsupported column${unsupported.length > 1 ? "s" : ""}: ${unsupported.join(", ")}`,
        );
      const nameIndex = headers.indexOf("room name");
      if (nameIndex < 0)
        return setFileError('Required Excel column "Room Name" is missing');
      const capacityIndex = headers.indexOf("capacity");
      const notesIndex = headers.indexOf("notes");
      const annurBatchIndex = headers.indexOf("annur batch");
      const bagsAllocatedIndex = headers.indexOf("bags allocated");
      const spawnRunStartDateIndex = headers.indexOf("spawn run start date");
      const missingAssignmentHeaders = [
        ["Annur Batch", annurBatchIndex],
        ["Bags Allocated", bagsAllocatedIndex],
        ["Spawn Run Start Date", spawnRunStartDateIndex],
      ]
        .filter(([, index]) => Number(index) < 0)
        .map(([header]) => header);
      if (missingAssignmentHeaders.length)
        return setFileError(
          `Required Excel columns missing: ${missingAssignmentHeaders.join(", ")}`,
        );
      const nonBlank = data
        .slice(1)
        .map((cells, index) => ({ cells, rowNumber: index + 2 }))
        .filter(({ cells }) =>
          cells.some((value) => String(value ?? "").trim() !== ""),
        );
      if (!nonBlank.length)
        return setFileError("The Excel worksheet contains no room records");
      if (nonBlank.length > MAX_ROWS)
        return setFileError(
          `A maximum of ${MAX_ROWS} rooms can be imported at once`,
        );

      const seen = new Set<string>();
      const parsed = nonBlank.map(({ cells, rowNumber }): ImportRow => {
        const base = {
          rowNumber,
          name: cells[nameIndex],
          capacity: capacityIndex >= 0 ? cells[capacityIndex] : "",
          notes: notesIndex >= 0 ? cells[notesIndex] : "",
          annurBatchCode: cells[annurBatchIndex],
          bagsAllocated: cells[bagsAllocatedIndex],
          spawnRunStartDate: excelDateToIso(cells[spawnRunStartDateIndex]),
        };
        const errors = validateRow(base, completedBatchCodes);
        if (errors.length) return { ...base, status: "invalid", errors };
        const key = normalizeName(base.name);
        if (seen.has(key))
          return {
            ...base,
            status: "duplicate",
            errors: ["Duplicate Room Name in this Excel file"],
          };
        seen.add(key);
        if (existingNames.has(key))
          return {
            ...base,
            status: "existing",
            errors: ["Room already exists in Ooty Location B"],
          };
        return { ...base, status: "valid", errors: [] };
      });
      setRows(parsed);
    } catch {
      setFileError("The Excel file is malformed or could not be read");
    }
  };

  const importRooms = async () => {
    setImporting(true);
    try {
      const response = await fetch("/api/ooty/rooms/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileName,
          rows: rows.map(
            ({
              rowNumber,
              name,
              capacity,
              notes,
              annurBatchCode,
              bagsAllocated,
              spawnRunStartDate,
            }) => ({
              rowNumber,
              name,
              capacity,
              notes,
              annurBatchCode,
              bagsAllocated,
              spawnRunStartDate,
            }),
          ),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error || "Growing Room import failed");
      setResult(payload);
      onImported();
      toast({
        title: "Growing Room import completed",
        description: `${payload.created} created, ${payload.skipped} skipped, ${payload.failed} failed.`,
      });
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error?.message || "Growing Room import failed",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="rounded-md border-border shadow-none max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Growing Rooms</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">
                1. Download the Excel template
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Columns: Room Name, Capacity, Notes, Annur Batch, Bags
                Allocated, Spawn Run Start Date
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="rounded-md"
              onClick={downloadTemplate}
            >
              <Download className="w-4 h-4 mr-2" /> Download Template
            </Button>
          </div>
          <div className="rounded-md border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">
                2. Select the completed Excel file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                .xlsx or .xls, up to 5 MB and 500 room rows
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => selectFile(event.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
          </div>

          {rows.length > 0 && !result && (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="outline">Total {rows.length}</Badge>
                <Badge variant="outline">Valid {counts.valid}</Badge>
                <Badge variant="outline">Existing {counts.existing}</Badge>
                <Badge variant="outline">Duplicates {counts.duplicate}</Badge>
                <Badge variant={counts.invalid ? "destructive" : "outline"}>
                  Invalid {counts.invalid}
                </Badge>
              </div>
              <div className="border rounded-md overflow-x-auto max-h-[340px] overflow-y-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">Row</th>
                      <th className="text-left p-2">Room Name</th>
                      <th className="text-right p-2">Capacity</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-left p-2">Annur Batch</th>
                      <th className="text-right p-2">Bags Allocated</th>
                      <th className="text-left p-2">Spawn Run Date</th>
                      <th className="text-left p-2">Status / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className="border-t align-top">
                        <td className="p-2 font-mono">{row.rowNumber}</td>
                        <td className="p-2 font-medium">
                          {String(row.name ?? "") || "—"}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {String(row.capacity ?? "") || "—"}
                        </td>
                        <td className="p-2 max-w-48 truncate">
                          {String(row.notes ?? "") || "—"}
                        </td>
                        <td className="p-2 font-mono">
                          {String(row.annurBatchCode ?? "") || "—"}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {String(row.bagsAllocated ?? "") || "—"}
                        </td>
                        <td className="p-2 font-mono">
                          {String(row.spawnRunStartDate ?? "") || "—"}
                        </td>
                        <td
                          className={`p-2 ${row.status === "valid" ? "text-emerald-700" : row.status === "existing" ? "text-amber-700" : "text-destructive"}`}
                        >
                          {row.status === "valid"
                            ? "Valid"
                            : row.errors.join(". ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div className="rounded-md border p-4 space-y-3">
              <h3 className="font-semibold">Growing Room Import Completed</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  Total: <b>{result.total}</b>
                </div>
                <div className="text-emerald-700">
                  Created: <b>{result.created}</b>
                </div>
                <div className="text-amber-700">
                  Skipped: <b>{result.skipped}</b>
                </div>
                <div className="text-destructive">
                  Failed: <b>{result.failed}</b>
                </div>
              </div>
              {result.results.some((row) => row.status !== "created") && (
                <div className="max-h-52 overflow-auto border rounded-md">
                  <table className="w-full text-sm">
                    <tbody>
                      {result.results
                        .filter((row) => row.status !== "created")
                        .map((row) => (
                          <tr
                            key={`${row.rowNumber}-${row.name}`}
                            className="border-b last:border-0"
                          >
                            <td className="p-2 font-mono">
                              Row {row.rowNumber}
                            </td>
                            <td className="p-2">{row.name || "—"}</td>
                            <td className="p-2">{row.reason}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-md"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && rows.length > 0 && (
            <Button
              type="button"
              className="rounded-md"
              disabled={importing || counts.valid === 0}
              onClick={importRooms}
            >
              <Upload className="w-4 h-4 mr-2" />
              {importing
                ? "Importing..."
                : `Import ${counts.valid} Room${counts.valid === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
