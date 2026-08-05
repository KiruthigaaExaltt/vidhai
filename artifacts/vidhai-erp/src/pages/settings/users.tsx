import { useListUsers } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Users() {
  const { data: users, isLoading } = useListUsers();

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Users</h1>
        <p className="text-sm text-muted-foreground mt-1">Access control and role management</p>
      </div>

        <Card className="rounded-sm border-border shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active Directory</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Username</th>
                    <th className="px-4 py-2 font-medium">Display Name</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users?.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30 h-[36px]">
                      <td className="px-4 font-mono font-medium">{u.username}</td>
                      <td className="px-4">{u.displayName}</td>
                      <td className="px-4">
                        <Badge variant="outline" className="border-0 bg-primary/10 text-primary uppercase tracking-wider text-[10px] rounded-sm">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 font-mono text-muted-foreground">{u.locationScope.join(', ') || '*'}</td>
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
