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
]);

type ImportRow = {
  rowNumber: number;
  name: unknown;
  capacity: unknown;
  notes: unknown;
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

function validateRow(row: Omit<ImportRow, "status" | "errors">): string[] {
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
  return errors;
}

export function GrowingRoomImportDialog({
  open,
  onOpenChange,
  existingRooms,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRooms: any[];
  onImported: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
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
      ["Room Name", "Capacity", "Notes"],
      ["Room 01", 1000, ""],
      ["Room 02", 1200, "North wing"],
    ]);
    worksheet["!cols"] = [{ wch: 24 }, { wch: 14 }, { wch: 36 }];
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
        cellDates: false,
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
        };
        const errors = validateRow(base);
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
          rows: rows.map(({ rowNumber, name, capacity, notes }) => ({
            rowNumber,
            name,
            capacity,
            notes,
          })),
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
                Columns: Room Name (required), Capacity, Notes
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
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">Row</th>
                      <th className="text-left p-2">Room Name</th>
                      <th className="text-right p-2">Capacity</th>
                      <th className="text-left p-2">Notes</th>
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
