import { useState } from "react";
import { DataPagination } from "@/components/ui/data-pagination";
import { useClientPagination } from "@/hooks/use-client-pagination";
import { useListSpawnEntries } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SpawnVaultPanel() {
  const { data: spawn, isLoading } = useListSpawnEntries();
  const spawnPagination = useClientPagination(spawn ?? []);

  return (
    <div className="min-w-0 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Spawn Inventory
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Stock enters automatically from finalized Lab production or received
          Spawn goods receipts.
        </p>
      </div>

      <Card className="rounded-sm border-border shadow-none">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Strain</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Qty (kg)
                    </th>
                    <th className="px-4 py-2 font-medium">Origin</th>
                    <th className="px-4 py-2 font-medium">Source / Lot</th>
                    <th className="px-4 py-2 font-medium">Received</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {spawnPagination.paginatedRows.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 h-[36px]">
                      <td className="px-4 font-medium">{s.strainName}</td>
                      <td className="px-4 font-mono text-right">
                        {s.quantityKg}
                      </td>
                      <td className="px-4">
                        <Badge variant="outline">
                          {(s as any).sourceType ?? "LEGACY"}
                        </Badge>
                      </td>
                      <td className="px-4">
                        {(s as any).sourceReference ||
                          (s as any).supplierLot ||
                          s.source}
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {new Date(s.receivedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">
                        {s.expiresAt
                          ? new Date(s.expiresAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-4">
                        <Badge
                          variant="outline"
                          className={`border-0 rounded-sm uppercase tracking-wider text-[10px] ${
                            s.status === "available"
                              ? "bg-primary/10 text-primary"
                              : s.status === "expired"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {spawn?.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No spawn records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <DataPagination
                currentPage={spawnPagination.currentPage}
                pageSize={spawnPagination.pageSize}
                totalCount={spawnPagination.totalCount}
                onPageChange={spawnPagination.setCurrentPage}
                onPageSizeChange={spawnPagination.setPageSize}
                loading={isLoading}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Spawn() {
  return (
    <Shell>
      <div className="p-4 sm:p-6 md:p-8">
        <SpawnVaultPanel />
      </div>
    </Shell>
  );
}
