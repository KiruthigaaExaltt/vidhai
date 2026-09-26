import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { AttendanceModule, attendanceRequest } from "./AttendanceModule";

export default function DashboardAttendance() {
  const { user, can } = useAuth();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["attendance", "self", user?.id],
    queryFn: () => attendanceRequest("attendance/self"),
    enabled: !!user,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading your attendance…</p>;
  if (error) return <div className="rounded-lg border p-4 text-sm">Unable to load your attendance. <button className="text-primary underline" onClick={() => void refetch()}>Retry</button></div>;
  if (!data?.employee) return null;
  return <AttendanceModule compact employees={[data.employee]} logs={data.logs} user={user} can={can} edit={() => {}} refresh={async () => { await refetch(); }} />;
}
