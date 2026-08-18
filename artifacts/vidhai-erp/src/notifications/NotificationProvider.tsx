import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { getAccessToken } from "@/lib/authTokens";

type NotificationContextValue = {
  unreadCount: number;
  latest: any | null;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  pushSupported: boolean;
  pushPermission: NotificationPermission | "unsupported";
  pushEnabled: boolean;
  enableExternalNotifications: () => Promise<boolean>;
};
const Context = createContext<NotificationContextValue | undefined>(undefined);
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const configuredApiOrigin = String(import.meta.env.VITE_API_BASE || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const apiUrl = (path: string) =>
  `${configuredApiOrigin}${base}/api/notifications${path}`;
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
    [pushEnabled, setPushEnabled] = useState(false),
    [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
      pushSupported ? Notification.permission : "unsupported",
    );
  const receivedIds = useRef(new Set<number>());
  const unreadCountRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const r = await fetch(apiUrl("/count"), {
        credentials: "include",
      });
      if (r.ok) {
        const nextCount = Number((await r.json()).unreadCount) || 0;
        if (nextCount > unreadCountRef.current)
          setLatest({ source: "poll", receivedAt: Date.now() });
        unreadCountRef.current = nextCount;
        setUnreadCount(nextCount);
      }
    } catch (error) {
      console.error("Unable to load notification count", error);
    }
  }, [user]);
  const markRead = useCallback(async (id: number) => {
    const r = await fetch(apiUrl(`/${id}/read`), {
      method: "PATCH",
      credentials: "include",
    });
    if (r.ok) setUnreadCount((n) => {
      const next = Math.max(0, n - 1);
      unreadCountRef.current = next;
      return next;
    });
  }, []);
  const markAllRead = useCallback(async () => {
    const r = await fetch(apiUrl("/read-all"), {
      method: "POST",
      credentials: "include",
    });
    if (r.ok) {
      unreadCountRef.current = 0;
      setUnreadCount(0);
    }
  }, []);
  const subscribeForExternalNotifications = useCallback(async () => {
    if (!user || !pushSupported || Notification.permission !== "granted") return false;
    try {
      const keyResponse = await fetch(apiUrl("/push/public-key"), { credentials: "include" });
      if (!keyResponse.ok) {
        setPushEnabled(false);
        return false;
      }
      const { publicKey } = await keyResponse.json();
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        }));
      const response = await fetch(apiUrl("/push/subscriptions"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      setPushEnabled(response.ok);
      return response.ok;
    } catch (error) {
      console.error("Unable to register browser push notifications", error);
      setPushEnabled(false);
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
    const socket: Socket = io(configuredApiOrigin || undefined, {
      path: `${base}/api/socket.io`,
      withCredentials: true,
      auth: { accessToken: getAccessToken() },
    });
    socket.io.on("reconnect_attempt", () => {
      socket.auth = { accessToken: getAccessToken() };
    });
    socket.on("notification:new", (item) => {
      const id = Number(item?.id);
      if (id && receivedIds.current.has(id)) return;
      if (id) receivedIds.current.add(id);
      setLatest(item);
      setUnreadCount((n) => {
        const next = n + 1;
        unreadCountRef.current = next;
        return next;
      });
      if (document.visibilityState === "visible")
        toast(item.title, { description: item.message });
    });
    socket.on("connect", () => void refresh());
    socket.on("connect_error", (error) => {
      console.error("Notification socket connection failed", error.message);
    });
    return () => {
      socket.disconnect();
    };
  }, [user, refresh]);
  useEffect(() => {
    if (!user) return;
    const poll = window.setInterval(() => void refresh(), 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
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
        pushEnabled,
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
