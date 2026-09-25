import { useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as blazeface from "@tensorflow-models/blazeface";
import "@tensorflow/tfjs";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eye,
  LocateFixed,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useToast } from "@/hooks/use-toast";
import { formatTimeTo12h } from "@/lib/utils";

const base = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const request = async (path: string, options?: RequestInit) => {
  const response = await fetch(`${base}/api/crew/${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
};
const isoToday = (timezone = "Asia/Kolkata") => new Date().toLocaleDateString("en-CA", { timeZone: timezone });
const statusCode: Record<string, string> = {
  Present: "P",
  Late: "L",
  Absent: "A",
  "Half Day": "HD",
  "On Leave": "OL",
  "Week Off": "WO",
  Holiday: "H",
  Remote: "R",
  WFH: "WFH",
  Future: "—",
  "Not Employed": "—",
  "Pending Approval": "PA",
  "Punch Out Pending": "POP",
};
const statusTone: Record<string, string> = {
  Present: "border-emerald-300 bg-emerald-50 text-emerald-700",
  Late: "border-amber-300 bg-amber-50 text-amber-700",
  Absent: "border-rose-300 bg-rose-50 text-rose-700",
  "Half Day": "border-sky-300 bg-sky-50 text-sky-700",
  "On Leave": "border-violet-300 bg-violet-50 text-violet-700",
  "Week Off": "border-teal-300 bg-teal-50 text-teal-700",
  Holiday: "border-indigo-300 bg-indigo-50 text-indigo-700",
  Future: "border-muted bg-muted/20 text-muted-foreground",
};
type FaceState =
  | "loading-model"
  | "detecting"
  | "no-camera"
  | "no-face"
  | "multiple-faces"
  | "ok"
  | "captured";
const faceMessage: Record<FaceState, string> = {
  "loading-model": "Loading face detector...",
  detecting: "Looking for one face...",
  "no-camera": "Camera is unavailable",
  "no-face": "No face detected",
  "multiple-faces": "Only one person is allowed",
  ok: "Face detected. Ready to capture",
  captured: "Photo captured",
};

export function AttendanceModule({
  employees,
  logs,
  user,
  can,
  refresh,
  edit,
}: {
  employees: any[];
  logs: any[];
  user: any;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
  edit: (row: any) => void;
}) {
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  useEffect(() => { request("attendance/settings").then(data => setTimezone(data.timezone)).catch(() => {}); }, []);
  const { toast } = useToast(),
    own = employees.find(
      (employee) =>
        Number(employee.id) === Number(user?.employeeId) ||
        Number(employee.userId) === Number(user?.id) ||
        (user?.email &&
          String(employee.email || "").trim().toLowerCase() ===
            String(user.email).trim().toLowerCase()),
    ),
    today = isoToday(timezone),
    todayRecord = logs.find(
      (log) =>
        Number(log.employeeId) === Number(own?.id) &&
        log.attendanceDate === today,
    );
  const mode = todayRecord?.approvalStatus === "Rejected" || !todayRecord?.checkInTime
    ? "punchIn"
    : todayRecord?.checkOutTime
      ? "completed"
      : "punchOut";
  const [review, setReview] = useState<any>(null);
  const [reviewDecision, setReviewDecision] = useState<"Approved" | "Rejected">("Approved");
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewIn, setReviewIn] = useState("");
  const [reviewOut, setReviewOut] = useState("");
  const [reviewFine, setReviewFine] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [correcting, setCorrecting] = useState<any>(null);
  const [correctionTime, setCorrectionTime] = useState("");
  const [dialog, setDialog] = useState(false),
    [photo, setPhoto] = useState(""),
    [location, setLocation] = useState<any>(null),
    [locationError, setLocationError] = useState(""),
    [resolvingAddress, setResolvingAddress] = useState(false),
    [cameraError, setCameraError] = useState(""),
    [faceState, setFaceState] = useState<FaceState>("loading-model"),
    [cameraKey, setCameraKey] = useState(0),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [query, setQuery] = useState(""),
    [month, setMonth] = useState(today.slice(0, 7)),
    [register, setRegister] = useState<any>(null),
    [registerLoading, setRegisterLoading] = useState(false),
    [details, setDetails] = useState<any>(null),
    [selectedRegisterEmployee, setSelectedRegisterEmployee] = useState<any>(null);
  const webcamRef = useRef<Webcam>(null),
    modelRef = useRef<blazeface.BlazeFaceModel | null>(null);
  useEffect(() => {
    setRegisterLoading(true);
    request(`attendance/register?month=${month}`)
      .then(setRegister)
      .catch((error) =>
        toast({
          title: "Unable to load attendance register",
          description: error.message,
          variant: "destructive",
        }),
      )
      .finally(() => setRegisterLoading(false));
  }, [month, logs]);
  const acquireLocation = () => {
    setLocation(null);
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Geolocation unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        setResolvingAddress(true);
        setLocation({ ...coordinates, address: null });
        try {
          const result = await request("attendance/reverse-geocode", { method: "POST", body: JSON.stringify(coordinates) });
          setLocation({ ...coordinates, address: result.address || null });
        } catch {
          setLocation({ ...coordinates, address: null });
        } finally {
          setResolvingAddress(false);
        }
      },
      (error) =>
        setLocationError(
          error.code === 1
            ? "Location permission denied"
            : error.code === 2
              ? "Location unavailable"
              : "Location request timed out",
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  const refreshEvidence = () => {
    setPhoto("");
    setCameraError("");
    setFaceState("loading-model");
    setCameraKey((value) => value + 1);
    acquireLocation();
  };
  const openPunch = () => {
    setDialog(true);
    refreshEvidence();
  };
  const closePunch = () => {
    setDialog(false);
    setPhoto("");
    setLocation(null);
  };
  useEffect(() => {
    if (!dialog || photo) return;
    let cancelled = false,
      timer: ReturnType<typeof setInterval> | undefined;
    void (async () => {
      try {
        setFaceState("loading-model");
        modelRef.current ??= await blazeface.load();
        if (cancelled) return;
        setFaceState("detecting");
        timer = setInterval(async () => {
          const video = webcamRef.current?.video;
          if (!video || video.readyState < 2 || !modelRef.current) return;
          try {
            const faces = await modelRef.current.estimateFaces(video, false);
            if (!cancelled)
              setFaceState(
                faces.length === 1
                  ? "ok"
                  : faces.length > 1
                    ? "multiple-faces"
                    : "no-face",
              );
          } catch {
            if (!cancelled) setFaceState("no-camera");
          }
        }, 600);
      } catch (error: any) {
        if (!cancelled) {
          setCameraError(error.message || "Unable to load face detector");
          setFaceState("no-camera");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [dialog, photo, cameraKey]);
  const capture = () => {
    if (faceState !== "ok") return null;
    const screenshot = webcamRef.current?.getScreenshot();
    if (!screenshot) {
      setCameraError("Unable to capture camera photo");
      return null;
    }
    setPhoto(screenshot);
    setFaceState("captured");
    return screenshot;
  };
  const confirm = async () => {
    if (!own) {
      toast({
        title: "Punch failed",
        description: "Your user account is not linked to an employee.",
        variant: "destructive",
      });
      return;
    }
    if (!location) {
      toast({
        title: "Current location required",
        description: "Allow location access and tap Retry Location.",
        variant: "destructive",
      });
      return;
    }
    if (!photo) {
      toast({ title: "Camera photo required", description: "Capture your photo before confirming attendance.", variant: "destructive" });
      return;
    }
    const evidencePhoto = photo;
    setBusy(true);
    try {
      if (mode === "punchOut")
        await request(`attendance/${todayRecord.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            punchAction: "punchOut",
            photoDataUrl: evidencePhoto,
            location,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
      else
        await request("attendance", {
          method: "POST",
          body: JSON.stringify({
            employeeId: own.id,
            punchAction: "punchIn",
            photoDataUrl: evidencePhoto,
            location,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
      closePunch();
      await refresh();
      toast({
        title:
          mode === "punchOut" ? "Punch out submitted for approval" : "Punch in recorded",
      });
    } catch (error: any) {
      toast({
        title: "Punch failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const approveAttendance = (record: any, decision: "Approved" | "Rejected" = "Approved") => {
    setReview(record); setReviewDecision(decision); setReviewRemarks("");
    setReviewIn(record.checkInTime || ""); setReviewOut(record.checkOutTime || ""); setReviewFine("");
  };
  const submitReview = async () => {
    setReviewBusy(true);
    try {
      const overrides: any = {};
      if (reviewDecision === "Approved") {
        if (reviewIn !== review.checkInTime) overrides.checkInTime = reviewIn;
        if (reviewOut !== review.checkOutTime) overrides.checkOutTime = reviewOut;
        if (reviewFine !== "") overrides.lateFineAmount = Number(reviewFine);
      }
      const result = await request("attendance/" + review.id + "/approval", { method: "PATCH", body: JSON.stringify({ decision: reviewDecision, remarks: reviewRemarks, overrides }) });
      toast({ title: result.approvalStatus === "Pending" ? "Approved; awaiting L" + result.currentLevel : "Attendance " + result.approvalStatus.toLowerCase(), description: result.payrollRefreshWarning ? "Attendance saved. Payroll refresh failed: " + result.payrollRefreshWarning : undefined });
      setReview(null); setDetails(null); await refresh();
    } catch (error: any) { toast({ title: "Unable to review attendance", description: error.message, variant: "destructive" }); }
    finally { setReviewBusy(false); }
  };
  const submitCorrection = async () => {
    setReviewBusy(true);
    try {
      await request("attendance/" + correcting.id + "/punch-out-edit", { method: "PATCH", body: JSON.stringify({ checkOutTime: correctionTime }) });
      setCorrecting(null); setDetails(null); await refresh(); toast({ title: "Punch-out corrected" });
    } catch (error: any) { toast({ title: "Unable to correct punch-out", description: error.message, variant: "destructive" }); }
    finally { setReviewBusy(false); }
  };
  const filtered = useMemo(
    () =>
      logs.filter(
        (log) =>
          log.attendanceDate >= from &&
          log.attendanceDate <= to &&
          (!query ||
            `${log.employeeName} ${log.status} ${log.notes || ""}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [logs, from, to, query],
  );
  const days = register
    ? Array.from({ length: register.daysInMonth }, (_, index) => index + 1)
    : [];
  const logPagination = useClientPagination(filtered, `${from}|${to}|${query}`);
  const registerRows = register?.rows || [];
  const registerPagination = useClientPagination(registerRows, month);
  return (
    <div className="space-y-6">
      <section className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Attendance</h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {logs.length} records
          </span>
        </div>
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm">
            Employee:{" "}
            <b>
              {own
                ? `${own.name} (${own.employeeCode})`
                : "Linked employee not found"}
            </b>
          </p>
          <div className="mt-4 flex gap-2">
            {mode === "completed" ? (
              <div className="flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                {todayRecord?.approvalStatus === "Pending" ? "Attendance submitted for approval" : "Attendance completed today"}
              </div>
            ) : (
              <Button disabled={!own || ["Holiday", "Week Off", "Not Employed"].includes(todayRecord?.status)} onClick={() => void openPunch()}>
                {mode === "punchOut" ? "Punch Out" : "Punch In"}
              </Button>
            )}
          </div>
          {todayRecord && (
            <p className="mt-3 text-xs text-muted-foreground">
              Punch in: {formatTimeTo12h(todayRecord.checkInTime) || "—"} · Punch out:{" "}
              {formatTimeTo12h(todayRecord.checkOutTime) || "—"} · Status: {todayRecord.status}
            </p>
          )}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h3 className="font-semibold">Latest attendance logs</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-36"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              className="w-36"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-56 pl-9"
                placeholder="Search attendance..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Employee",
                  "Date",
                  "Status",
                  "Punch in",
                  "Punch out",
                  "Lock",
                  "Notes",
                  "Actions",
                ].map((item) => (
                  <th key={item} className="px-4 py-3">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                logPagination.paginatedRows.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {log.employeeName}
                    </td>
                    <td className="px-4 py-3">{log.attendanceDate}</td>
                    <td className="px-4 py-3">{log.status}{log.approvalStatus === "Pending" ? ` (L${log.currentLevel || 1})` : ""}</td>
                    <td className="px-4 py-3">{formatTimeTo12h(log.checkInTime) || "—"}</td>
                    <td className="px-4 py-3">{formatTimeTo12h(log.checkOutTime) || "—"}</td>
                    <td className="px-4 py-3">
                      {log.locked ? "Locked" : "Open"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.notes || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          aria-label="View attendance details"
                          onClick={() => setDetails(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {log.canApprove && (
                          <Button size="sm" variant="outline" onClick={() => void approveAttendance(log)}>Approve</Button>
                        )}
                        {log.canReject && <Button size="sm" variant="outline" onClick={() => approveAttendance(log, "Rejected")}>Reject</Button>}
                        {log.canEditPunchOut && <Button size="sm" variant="outline" onClick={() => { setCorrecting(log); setCorrectionTime(log.checkOutTime); }}>Correct punch-out</Button>}
                        {can("crew.attendance.update") &&
                          ((!log.locked && !log.derived) ||
                            can("crew.attendance.change_time")) && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          aria-label="Edit attendance"
                          onClick={() => edit(log)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="p-12 text-center text-muted-foreground"
                  >
                    No attendance records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPagination
          currentPage={logPagination.currentPage}
          pageSize={logPagination.pageSize}
          totalCount={logPagination.totalCount}
          onPageChange={logPagination.setCurrentPage}
          onPageSizeChange={logPagination.setPageSize}
        />
      </section>
      {selectedRegisterEmployee ? (
        <section className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
            <div className="flex items-start gap-3">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setSelectedRegisterEmployee(null)}
                aria-label="Back to monthly attendance register"
                title="Back to monthly attendance register"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
                  Individual attendance
                </p>
                <h2 className="text-xl font-semibold">
                  {selectedRegisterEmployee.employeeName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedRegisterEmployee.employeeCode} · {selectedRegisterEmployee.department}
                </p>
              </div>
            </div>
            <Input
              type="month"
              className="w-full sm:w-44"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Day</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Punch in</th>
                  <th className="p-3">Punch out</th>
                </tr>
              </thead>
              <tbody>
                {selectedRegisterEmployee.days.map((cell: any) => {
                  const date = new Date(`${cell.date}T00:00:00`);
                  return (
                    <tr
                      key={cell.date}
                      className={cell.future ? "border-t text-muted-foreground" : "cursor-pointer border-t hover:bg-muted/30"}
                      onClick={() => {
                        if (cell.future) return;
                        setDetails({
                          ...cell,
                          id: cell.attendanceId,
                          employeeId: selectedRegisterEmployee.employeeId,
                          employeeName: selectedRegisterEmployee.employeeName,
                          attendanceDate: cell.date,
                        });
                      }}
                    >
                      <td className="p-3 font-medium">{date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="p-3">{date.toLocaleDateString("en-IN", { weekday: "long" })}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusTone[cell.status] || "border-muted bg-muted/20"}`}>
                          {cell.future ? "—" : cell.status}
                        </span>
                      </td>
                      <td className="p-3">{formatTimeTo12h(cell.checkInTime) || "—"}</td>
                      <td className="p-3">{formatTimeTo12h(cell.checkOutTime) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
              Team matrix
            </p>
            <h2 className="text-xl font-semibold">
              Monthly Attendance Register
            </h2>
          </div>
          <Input
            type="month"
            className="w-full sm:w-44"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.keys(statusCode)
            .slice(0, 7)
            .map((status) => (
              <span
                key={status}
                className={`rounded-full border px-3 py-1 text-xs ${statusTone[status] || ""}`}
              >
                {status}
              </span>
            ))}
        </div>
        <div className="min-w-0 overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="min-w-max border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-52 bg-card p-2 text-left">
                    Employee
                  </th>
                  {days.map((day: any) => (
                    <th
                      key={day}
                      className="h-12 w-11 rounded-md border bg-muted/30 text-center"
                    >
                      <b>{day}</b>
                      <small className="block text-muted-foreground">
                        {new Date(
                          `${month}-${String(day).padStart(2, "0")}T00:00:00`,
                        ).toLocaleDateString("en", { weekday: "short" })}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registerLoading ? (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="p-12 text-center text-muted-foreground"
                    >
                      Loading register...
                    </td>
                  </tr>
                ) : registerPagination.paginatedRows.length ? (
                  registerPagination.paginatedRows.map((row: any) => (
                    <tr key={row.employeeId}>
                      <td className="sticky left-0 z-10 rounded-md border bg-card p-3">
                        <button
                          type="button"
                          className="text-left hover:text-primary"
                          onClick={() => setSelectedRegisterEmployee(row)}
                          title={`View ${row.employeeName}'s individual attendance`}
                        >
                          <b>{row.employeeName}</b>
                          <small className="block text-muted-foreground">
                            {row.employeeCode} · {row.department}
                          </small>
                        </button>
                      </td>
                      {row.days.map((cell: any) => (
                        <td key={cell.date} className="p-0.5">
                          {cell.future ? (
                            <span
                              title={`${cell.date}: Future date`}
                              className={`flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-md border font-semibold ${statusTone.Future}`}
                            >
                              —
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDetails({
                                ...cell,
                                id: cell.attendanceId,
                                employeeId: row.employeeId,
                                employeeName: row.employeeName,
                                attendanceDate: cell.date,
                              })}
                              title={`${cell.date}: ${cell.status}`}
                              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border font-semibold hover:ring-2 hover:ring-primary/30 ${statusTone[cell.status] || "border-muted bg-muted/20"}`}
                            >
                              {statusCode[cell.status] || cell.status.slice(0, 2)}
                            </button>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="p-12 text-center text-muted-foreground"
                    >
                      No attendance registry records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataPagination
            currentPage={registerPagination.currentPage}
            pageSize={registerPagination.pageSize}
            totalCount={registerPagination.totalCount}
            onPageChange={registerPagination.setCurrentPage}
            onPageSizeChange={registerPagination.setPageSize}
            loading={registerLoading}
          />
        </div>
      </section>
      )}
      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attendance details</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">Employee:</span> {details.employeeName}</p>
                <p><span className="text-muted-foreground">Date:</span> {details.attendanceDate}</p>
                <p><span className="text-muted-foreground">Status:</span> {details.status}</p>
                <p><span className="text-muted-foreground">Approval:</span> {details.approvalStatus || "Pending"}{details.approvalStatus === "Pending" ? " · L" + (details.currentLevel || 1) : ""}</p>
                {details.rejectionRemarks && <p className="text-destructive">Rejection reason: {details.rejectionRemarks}</p>}
                {Array.isArray(details.approvalChain) && details.approvalChain.length > 0 && <p className="md:col-span-2">Approvers: {details.approvalChain.map((l: any) => "L" + l.level + ": " + l.employeeName).join(" → ")}</p>}
                {details.approvalHistory?.map?.((entry: any, index: number) => <p className="md:col-span-2 text-sm" key={index}>L{entry.level} · {entry.action} · {entry.actorName} · {new Date(entry.at).toLocaleString()} {entry.remarks && "— " + entry.remarks}</p>)}
                {details.lateFinePreview && <p>Calculated fine: INR {Number(details.lateFinePreview.amount).toFixed(2)} ({details.lateFinePreview.totalDeductionMinutes} minutes)</p>}
                <p><span className="text-muted-foreground">Record:</span> {details.locked ? "Locked" : "Open"}</p>
                <p><span className="text-muted-foreground">Punch in:</span> {formatTimeTo12h(details.checkInTime) || "—"}</p>
                <p><span className="text-muted-foreground">Punch out:</span> {formatTimeTo12h(details.checkOutTime) || "—"}</p>
                <p><span className="text-muted-foreground">Punch-in address:</span> {details.checkInAddress || "Address unavailable"}</p>
                <p><span className="text-muted-foreground">Punch-out address:</span> {details.checkOutAddress || "Address unavailable"}</p>
                <p className="sm:col-span-2"><span className="text-muted-foreground">Notes:</span> {details.notes || "—"}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <EvidencePhoto label="Punch-in photo" src={details.checkInPhoto} />
                <EvidencePhoto label="Punch-out photo" src={details.checkOutPhoto} />
              </div>
            </div>
          )}
          <DialogFooter>
            {details &&
              can("crew.attendance.update") &&
              ((!details.locked && !details.derived) ||
                can("crew.attendance.change_time")) && (
              <Button variant="outline" onClick={() => { const row = details; setDetails(null); edit(row); }}>
                <Pencil className="mr-2 h-4 w-4" /> Edit / Override
              </Button>
            )}
            {details?.canApprove && (
              <Button variant="outline" onClick={() => void approveAttendance(details)}>Approve</Button>
            )}
            {details?.canReject && <Button variant="outline" onClick={() => approveAttendance(details, "Rejected")}>Reject</Button>}
            <Button onClick={() => setDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(review)} onOpenChange={open => { if (!open && !reviewBusy) setReview(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{reviewDecision === "Approved" ? "Approve" : "Reject"} attendance · L{review?.currentLevel || 1}</DialogTitle></DialogHeader>
          <p>{review?.employeeName} · {review?.attendanceDate}</p>
          {reviewDecision === "Approved" && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Both punches are reviewed together. Time and fine corrections take effect on final approval.</p>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Punch in<Input type="time" value={reviewIn} onChange={e => setReviewIn(e.target.value)} /></label><label className="text-sm">Punch out<Input type="time" value={reviewOut} onChange={e => setReviewOut(e.target.value)} /></label></div>
            <p className="text-sm">Calculated fine: INR {Number(review?.lateFinePreview?.amount || 0).toFixed(2)} · {review?.lateFinePreview?.totalDeductionMinutes || 0} minutes</p>
            <label className="block text-sm">Fine override (optional)<Input type="number" min="0" step="0.01" placeholder="Use calculated fine" value={reviewFine} onChange={e => setReviewFine(e.target.value)} /></label>
          </div>}
          <label className="text-sm">{reviewDecision === "Rejected" ? "Rejection reason (required)" : "Remarks"}<Input value={reviewRemarks} onChange={e => setReviewRemarks(e.target.value)} /></label>
          <DialogFooter><Button variant="outline" disabled={reviewBusy} onClick={() => setReview(null)}>Cancel</Button><Button disabled={reviewBusy || reviewDecision === "Rejected" && !reviewRemarks.trim()} onClick={() => void submitReview()}>{reviewBusy ? "Saving…" : reviewDecision === "Approved" ? "Approve" : "Reject"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(correcting)} onOpenChange={open => { if (!open && !reviewBusy) setCorrecting(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Correct punch-out</DialogTitle></DialogHeader><p className="text-sm">Available until the first approver acts. The original captured evidence stays in the audit history.</p><Input aria-label="Corrected punch-out time" type="time" value={correctionTime} onChange={e => setCorrectionTime(e.target.value)} /><DialogFooter><Button disabled={reviewBusy || !correctionTime} onClick={() => void submitCorrection()}>Save correction</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog
        open={dialog}
        onOpenChange={(open) => (open ? setDialog(true) : closePunch())}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "punchOut" ? "Punch Out" : "Punch In"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {photo ? (
              <img
                src={photo}
                alt="Captured attendance evidence"
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="relative overflow-hidden rounded-lg bg-black">
                <Webcam
                  key={cameraKey}
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.85}
                  videoConstraints={{
                    facingMode: "user",
                    width: 480,
                    height: 360,
                  }}
                  mirrored
                  className="aspect-[4/3] w-full object-cover"
                  onUserMediaError={(error) => {
                    setCameraError(String(error));
                    setFaceState("no-camera");
                  }}
                />
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[3px] border-dotted shadow-[0_0_0_999px_rgba(0,0,0,0.16)] transition-colors ${faceState === "ok" ? "border-emerald-400" : faceState === "multiple-faces" || faceState === "no-face" ? "border-amber-300" : "border-white/90"}`}
                />
                <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs text-white">
                  Position your face inside the oval
                </span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className={`rounded-md border p-3 text-sm ${faceState === "ok" || faceState === "captured" ? "border-emerald-300 bg-emerald-50" : ""}`}
              >
                <Camera className="mb-1 h-4 w-4" />
                {faceMessage[faceState]}
              </div>
              <div
                className={`rounded-md border p-3 text-sm ${location ? "border-emerald-300 bg-emerald-50" : ""}`}
              >
                <LocateFixed className="mb-1 h-4 w-4" />
                {location
                  ? resolvingAddress ? "Resolving address..." : location.address || "Address unavailable"
                  : locationError || "Getting current location..."}
              </div>
            </div>
            {cameraError && (
              <p className="text-sm text-rose-600">{cameraError}</p>
            )}
            {locationError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <p className="font-medium">{locationError}</p>
                <p className="mt-1">
                  Allow Location for this site in your browser settings, turn on
                  the phone location service, then tap Retry Location.
                </p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                disabled={faceState !== "ok" || !!photo}
                onClick={capture}
              >
                <Camera className="mr-2 h-4 w-4" />
                Capture Photo
              </Button>
              <Button type="button" variant="outline" onClick={refreshEvidence}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Camera + Location
              </Button>
              {photo && !location && (
                <Button
                  type="button"
                  variant="outline"
                  className="sm:col-span-2"
                  onClick={acquireLocation}
                >
                  <LocateFixed className="mr-2 h-4 w-4" />
                  Retry Location
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Capture your camera photo and allow current location access to
              confirm attendance. Both are required.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePunch}>
              Cancel
            </Button>
            <Button
              disabled={busy || resolvingAddress || !location || !photo}
              onClick={() => void confirm()}
            >
              {busy ? (
                "Saving..."
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm{" "}
                  {mode === "punchOut" ? "Punch Out" : "Punch In"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EvidencePhoto({ label, src }: { label: string; src?: string | null }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      {src ? (
        <img
          src={`${base}${src}`}
          alt={label}
          className="aspect-[4/3] w-full rounded-lg border object-cover"
        />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
          No photo captured
        </div>
      )}
    </div>
  );
}
