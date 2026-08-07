import { useListLocations } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Locations() {
  const { data: locations, isLoading } = useListLocations();

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
        <p className="text-sm text-muted-foreground mt-1">Farm facilities and operating zones</p>
      </div>

        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Location Master</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <table className="w-full table-fixed text-sm text-left">
<thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
  <tr>
    <th className="w-1/3 px-4 py-2 font-medium text-center">Code</th>
    <th className="w-1/3 px-4 py-2 font-medium text-center">Name</th>
    <th className="w-1/3 px-4 py-2 font-medium text-center">Description</th>
  </tr>
</thead>
                <tbody className="divide-y divide-border">
                  {locations?.map((loc) => (
                    <tr key={loc.id} className="hover:bg-muted/30 h-[36px]">
                      <td className="px-4 font-mono font-medium">{loc.code}</td>
                      <td className="px-4 font-medium">{loc.name}</td>
                      <td className="px-4 text-muted-foreground">{loc.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
