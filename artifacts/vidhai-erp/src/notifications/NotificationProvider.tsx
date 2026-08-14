import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type NotificationContextValue = {
  unreadCount: number;
  latest: any | null;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  pushSupported: boolean;
  pushPermission: NotificationPermission | "unsupported";
  enableExternalNotifications: () => Promise<boolean>;
};
const Context = createContext<NotificationContextValue | undefined>(undefined);
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const pushSupported =
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function decodeVapidKey(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth(),
    [unreadCount, setUnreadCount] = useState(0),
    [latest, setLatest] = useState<any | null>(null),
    [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
      pushSupported ? Notification.permission : "unsupported",
    );
  const refresh = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const r = await fetch(`${base}/api/notifications/count`, {
        credentials: "include",
      });
      if (r.ok) setUnreadCount(Number((await r.json()).unreadCount) || 0);
    } catch {}
  }, [user]);
  const markRead = useCallback(async (id: number) => {
    const r = await fetch(`${base}/api/notifications/${id}/read`, {
      method: "PATCH",
      credentials: "include",
    });
    if (r.ok) setUnreadCount((n) => Math.max(0, n - 1));
  }, []);
  const markAllRead = useCallback(async () => {
    const r = await fetch(`${base}/api/notifications/read-all`, {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) setUnreadCount(0);
  }, []);
  const subscribeForExternalNotifications = useCallback(async () => {
    if (!user || !pushSupported || Notification.permission !== "granted") return false;
    try {
      const keyResponse = await fetch(`${base}/api/notifications/push/public-key`, { credentials: "include" });
      if (!keyResponse.ok) return false;
      const { publicKey } = await keyResponse.json();
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        }));
      const response = await fetch(`${base}/api/notifications/push/subscriptions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [user]);
  const enableExternalNotifications = useCallback(async () => {
    if (!pushSupported) return false;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    return permission === "granted" && subscribeForExternalNotifications();
  }, [subscribeForExternalNotifications]);
  useEffect(() => {
    if (user && pushSupported && Notification.permission === "granted")
      void subscribeForExternalNotifications();
  }, [user, subscribeForExternalNotifications]);
  useEffect(() => {
    void refresh();
    if (!user) return;
    const socket: Socket = io({
      path: `${base}/api/socket.io`,
      withCredentials: true,
    });
    socket.on("notification:new", (item) => {
      setLatest(item);
      setUnreadCount((n) => n + 1);
      if (document.visibilityState === "visible")
        toast(item.title, { description: item.message });
    });
    socket.on("connect", () => void refresh());
    return () => {
      socket.disconnect();
    };
  }, [user, refresh]);
  return (
    <Context.Provider
      value={{
        unreadCount,
        latest,
        refresh,
        markRead,
        markAllRead,
        pushSupported,
        pushPermission,
        enableExternalNotifications,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useNotifications() {
  const value = useContext(Context);
  if (!value)
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  return value;
}
