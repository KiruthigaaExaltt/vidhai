import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useTraceGrowingBatch,
  getTraceGrowingBatchQueryKey,
  useListOotyRooms,
  getListOotyRoomsQueryKey,
} from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Box,
  FlaskConical,
  Layers,
  Thermometer,
  ArrowDown,
} from "lucide-react";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function SourceCard({
  icon: Icon,
  location,
  title,
  code,
  rows,
  missing,
  accent,
}: {
  icon: any;
  location: string;
  title: string;
  code?: string | null;
  rows: Array<[string, string]>;
  missing?: string;
  accent: string;
}) {
  return (
    <Card className="rounded-sm border-border shadow-none flex-1 min-w-[220px]">
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-sm flex items-center justify-center ${accent}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-none">{location}</p>
            <CardTitle className="text-sm font-semibold mt-0.5">{title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {code ? (
          <>
            <p className="font-mono text-base font-bold text-primary mb-2">{code}</p>
            <dl className="space-y-1">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-2">{missing ?? "Not linked."}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Traceability() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const batchId = useMemo(() => {
    const p = new URLSearchParams(search);
    const v = Number(p.get("batchId"));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [search]);

  const { data: rooms } = useListOotyRooms({
    query: { queryKey: getListOotyRoomsQueryKey() },
  });
  const roomList: any[] = (rooms as any) ?? [];
  const occupiedRooms = roomList.filter((r) => r.currentGrowingBatchId);

  const { data: trace, isLoading, error } = useTraceGrowingBatch(batchId ?? 0, {
    query: { enabled: !!batchId, queryKey: getTraceGrowingBatchQueryKey(batchId ?? 0) },
  });
  const t = trace as any;
  const ooty = t?.ootyGrowingBatch;
  const labOut = t?.labSpawnOutputs?.[0];

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-primary" /> Batch Traceability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Backward genealogy — from an Ooty growing batch to its Annur, Lab, and Coimbatore source batches.
          </p>
        </div>

        {/* Picker */}
        <Card className="rounded-sm border-border shadow-none">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Ooty Growing Batch
            </label>
            <select
              className="h-9 rounded-sm border border-border bg-background px-3 text-sm font-mono min-w-[260px]"
              value={batchId ?? ""}
              onChange={(e) =>
                setLocation(e.target.value ? `/traceability?batchId=${e.target.value}` : "/traceability")
              }
            >
              <option value="">Select a room / active batch…</option>
              {occupiedRooms.map((r: any) => (
                <option key={r.id} value={r.currentGrowingBatchId}>
                  {r.name} — batch #{r.currentGrowingBatchId}
                </option>
              ))}
            </select>
            {occupiedRooms.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No rooms with active batches. You can also deep-link with ?batchId=…
              </span>
            )}
          </CardContent>
        </Card>

        {!batchId ? (
          <Card className="rounded-sm border-border shadow-none">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Pick an active Ooty batch above, or open a room on the{" "}
              <button className="text-primary underline underline-offset-2" onClick={() => setLocation("/ooty")}>
                Growing Rooms
              </button>{" "}
              page and use “View Traceability”.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading trace…</div>
        ) : error || !ooty ? (
          <Card className="rounded-sm border-border shadow-none">
            <CardContent className="p-8 text-center text-sm text-destructive">
              Could not load traceability for batch #{batchId}.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-0">
            {/* Ooty batch — top of the tree */}
            <div className="flex justify-center">
              <Card className="rounded-sm border-primary/40 shadow-none w-full max-w-md bg-primary/5">
                <CardHeader className="pb-2 border-b border-primary/20">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-sm bg-primary/15 text-primary flex items-center justify-center">
                      <Thermometer className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-none">
                        Ooty Location B
                      </p>
                      <CardTitle className="text-sm font-semibold mt-0.5">Growing Batch</CardTitle>
                    </div>
                    <Badge variant="outline" className="ml-auto border-0 rounded-sm bg-primary/10 text-primary text-[11px] uppercase tracking-wider font-semibold">
                      {ooty.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="font-mono text-lg font-bold text-primary mb-2">{ooty.batchCode}</p>
                  <dl className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">Room</dt>
                      <dd className="font-mono">{ooty.room?.name ?? `#${ooty.roomId}`}</dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">Current phase</dt>
                      <dd className="font-mono">{ooty.currentPhase}</dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">Spawn run start</dt>
                      <dd className="font-mono">{fmt(ooty.spawnRunStartDate)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>

            {/* Connectors */}
            <div className="flex justify-center py-1">
              <ArrowDown className="w-5 h-5 text-muted-foreground/50" />
            </div>
            <div className="relative flex justify-center pb-4" aria-hidden>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[66%] h-4 border-t border-l border-r border-border rounded-t-sm" />
            </div>

            {/* Source batches — converging inputs */}
            <div className="flex flex-col md:flex-row gap-4">
              <SourceCard
                icon={Box}
                location="Annur Location A"
                title="Grow Bag Batch"
                accent="bg-teal-50 text-teal-700"
                code={t.annurBatch?.batchCode}
                rows={[
                  ["Stage", t.annurBatch?.currentStage ?? "—"],
                  ["Status", t.annurBatch?.status ?? "—"],
                ]}
                missing="No Annur grow bag batch linked."
              />
              <SourceCard
                icon={FlaskConical}
                location="Lab Location D"
                title="Spawn Batch"
                accent="bg-violet-50 text-violet-700"
                code={labOut ? `${labOut.strainName ?? "Spawn"} · #${labOut.id}` : null}
                rows={[
                  ["Produced", fmt(labOut?.producedAt ?? labOut?.createdAt)],
                  ["Qty (kg)", labOut?.quantityKg != null ? String(Number(labOut.quantityKg)) : "—"],
                  ["Status", labOut?.status ?? "—"],
                ]}
                missing="No Lab spawn output linked."
              />
              <SourceCard
                icon={Layers}
                location="Coimbatore Location C"
                title="Casing Soil Batch"
                accent="bg-amber-50 text-amber-700"
                code={t.coimBatch?.batchCode}
                rows={[
                  ["Stage", t.coimBatch?.currentStage ?? "—"],
                  ["Status", t.coimBatch?.status ?? "—"],
                ]}
                missing="No Coimbatore casing batch linked."
              />
            </div>

            {/* Raw links */}
            {t.links?.length > 0 && (
              <Card className="rounded-sm border-border shadow-none mt-6">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Link Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                      <tr>
                        <th className="px-4 py-2 font-medium">ID</th>
                        <th className="px-4 py-2 font-medium">Annur Batch</th>
                        <th className="px-4 py-2 font-medium">Coimbatore Batch</th>
                        <th className="px-4 py-2 font-medium">Lab Output</th>
                        <th className="px-4 py-2 font-medium">Notes</th>
                        <th className="px-4 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {t.links.map((l: any) => (
                        <tr key={l.id} className="h-[36px] hover:bg-muted/20">
                          <td className="px-4 font-mono">{l.id}</td>
                          <td className="px-4 font-mono">{l.annurBatchId ?? "—"}</td>
                          <td className="px-4 font-mono">{l.coimBatchId ?? "—"}</td>
                          <td className="px-4 font-mono">{l.labSpawnOutputId ?? "—"}</td>
                          <td className="px-4 text-xs text-muted-foreground">{l.notes ?? "—"}</td>
                          <td className="px-4 font-mono text-muted-foreground">{fmt(l.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
