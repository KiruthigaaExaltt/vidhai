import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  permissions: string[];
  enabledModuleKeys: string[];
  isSuperAdmin: boolean;
  isModuleEnabled: (moduleKey: string) => boolean;
  can: (permission: string) => boolean;
  hasScopedPermission: (
    moduleKey: string,
    submoduleKey: string | null | undefined,
    action?: string,
  ) => boolean;
  refreshPermissions: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const normalizePermission = (value: string) => {
  const key = value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const parts = key.split(".");
  const action = parts.pop() ?? "";
  const aliases: Record<string, string> = {
    edit: "update",
    forown: "for_own",
    forothers: "for_others",
    changetime: "change_time",
    settings: "manage_settings",
  };
  return [...parts, aliases[action.replaceAll("_", "")] ?? action].join(".");
};
const buildScopedPermissionKey = (
  moduleKey: string,
  submoduleKey: string | null | undefined,
  action = "view",
) =>
  normalizePermission(
    [moduleKey, submoduleKey, action].filter(Boolean).join("."),
  );
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loggedOut, setLoggedOut] = useState(false),
    [permissions, setPermissions] = useState<string[]>([]),
    [enabledModuleKeys, setEnabledModuleKeys] = useState<string[]>(["ledger"]),
    [isSuperAdmin, setIsSuperAdmin] = useState(false),
    [permissionsLoading, setPermissionsLoading] = useState(false);
  const { data: meData, isLoading: meLoading, isError } = useGetMe();
  useEffect(() => {
    if (meData && !isError) setUser(meData);
    else if (isError) setUser(null);
  }, [meData, isError]);
  const refreshPermissions = async () => {
    if (!user) {
      setPermissions([]);
      return;
    }
    setPermissionsLoading(true);
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const response = await fetch(`${base}/api/permissions/me`, {
        credentials: "include",
      });
      const data = response.ok ? await response.json() : { permissions: [] };
      setPermissions(
        Array.isArray(data.permissions)
          ? data.permissions.map(normalizePermission)
          : [],
      );
      setIsSuperAdmin(data.isSuperAdmin === true);
      setEnabledModuleKeys(
        Array.isArray(data.enabledModuleKeys)
          ? data.enabledModuleKeys
          : ["ledger"],
      );
    } catch {
      setPermissions([]);
      setIsSuperAdmin(false);
      setEnabledModuleKeys(["ledger"]);
    } finally {
      setPermissionsLoading(false);
    }
  };
  useEffect(() => {
    void refreshPermissions();
  }, [user]);
  const login = (newUser: User) => {
    setLoggedOut(false);
    setUser(newUser);
  };
  const logout = () => {
    setLoggedOut(true);
    setUser(null);
    setPermissions([]);
    setIsSuperAdmin(false);
    setEnabledModuleKeys(["ledger"]);
  };
  const isLoading =
    meLoading ||
    permissionsLoading ||
    (!loggedOut && !!meData && !isError && user === null);
  const can = (permission: string) =>
    permissions.includes("*") ||
    permissions.includes(normalizePermission(permission));
  const isModuleEnabled = (moduleKey: string) =>
    enabledModuleKeys.includes(moduleKey);
  const hasScopedPermission = (
    moduleKey: string,
    submoduleKey: string | null | undefined,
    action = "view",
  ) => {
    const key = buildScopedPermissionKey(moduleKey, submoduleKey, action);
    if (can(key)) return true;
    if (key === "crew.attendance.for_own") return can("crew.attendance_own");
    if (key === "crew.attendance.for_others")
      return can("crew.attendance_others");
    return false;
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        permissions,
        enabledModuleKeys,
        isSuperAdmin,
        isModuleEnabled,
        can,
        hasScopedPermission,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
export function usePermission() {
  const { user, isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin;
  const locationScope: string[] = Array.isArray((user as any)?.locationScope)
    ? (user as any).locationScope
    : [];
  const hasAll = isAdmin || locationScope.includes("cross_site");
  function can(
    action: "view" | "create" | "approve" | "delete",
    location?: string,
  ): boolean {
    if (!user) return false;
    if (isAdmin) return true;
    if (action === "delete") return false;
    if (action === "approve") {
      if (user.role !== "manager" && !isSuperAdmin) return false;
      return !location
        ? hasAll || locationScope.length > 0
        : hasAll || locationScope.includes(location);
    }
    if (action === "create") {
      if (user.role === "viewer") return false;
      return !location
        ? hasAll || locationScope.length > 0
        : hasAll || locationScope.includes(location);
    }
    return !location
      ? hasAll || locationScope.length > 0
      : hasAll || locationScope.includes(location);
  }
  return { isAdmin, can, locationScope, role: user?.role ?? null };
}
