import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNotifications } from "@/notifications/NotificationProvider";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
export default function NotificationsPage() {
  const [tab, setTab] = useState("unread"),
    [items, setItems] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [testing, setTesting] = useState(false);
  const [, navigate] = useLocation();
  const notifications = useNotifications();
  const { isSuperAdmin } = useAuth();
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `${base}/api/notifications?status=${tab}&limit=50`,
        { credentials: "include" },
      );
      setItems(r.ok ? (await r.json()).items : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [tab, notifications.latest]);
  const open = async (item: any) => {
    if (!item.isRead) await notifications.markRead(item.id);
    if (item.navigationUrl) navigate(item.navigationUrl);
    else await load();
  };
  const markAll = async () => {
    await notifications.markAllRead();
    await load();
  };
  const testNotification = async () => {
    setTesting(true);
    try {
      const response = await fetch(`${base}/api/notifications/test`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error((await response.json()).error || "Test failed");
      toast.success("Notification test queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to test notifications");
    } finally {
      setTesting(false);
    }
  };
  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              Updates from modules you are permitted to monitor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <Button variant="outline" disabled={testing} onClick={() => void testNotification()}>
                <Bell className="mr-2 h-4 w-4" />
                {testing ? "Testing…" : "Test notification"}
              </Button>
            )}
            {notifications.pushSupported && !notifications.pushEnabled && (
              <Button
                variant="outline"
                disabled={notifications.pushPermission === "denied"}
                onClick={() => void notifications.enableExternalNotifications().then((enabled) => {
                  if (enabled) toast.success("External notifications enabled");
                  else toast.error("Could not register this browser for external notifications");
                })}
              >
                <BellRing className="mr-2 h-4 w-4" />
                {notifications.pushPermission === "denied"
                  ? "External notifications blocked"
                  : notifications.pushPermission === "granted"
                    ? "Retry external notifications"
                    : "Enable external notifications"}
              </Button>
            )}
            {tab === "unread" && items.length > 0 && (
              <Button variant="outline" onClick={markAll}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-4 overflow-hidden rounded-xl border bg-card">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No {tab} notifications.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => void open(item)}
                className="flex w-full gap-4 border-b p-4 text-left last:border-0 hover:bg-muted/50"
              >
                <span className="mt-1 rounded-full bg-primary/10 p-2 text-primary">
                  <Bell className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {item.message}
                  </span>
                  {item.sourceReference && (
                    <span className="mt-1 block text-xs font-medium">
                      {item.sourceReference}
                    </span>
                  )}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </button>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}
