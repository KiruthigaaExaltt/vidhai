import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  permissions: string[];
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data: meData, isLoading: meLoading, isError } = useGetMe();

  useEffect(() => {
    if (meData && !isError) {
      setUser(meData);
    } else if (isError) {
      setUser(null);
    }
  }, [meData, isError]);

  useEffect(() => {
    if (!user) { setPermissions([]); return; }
    if (user.role === "admin") { setPermissions(["*"]); return; }
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/permissions/me`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : { permissions: [] })
      .then((data) => setPermissions(Array.isArray(data.permissions) ? data.permissions : []))
      .catch(() => setPermissions([]));
  }, [user]);

  const login = (newUser: User) => {
    setLoggedOut(false);
    setUser(newUser);
  };

  const logout = () => {
    setLoggedOut(true);
    setUser(null);
    setPermissions([]);
  };

  // meData can arrive one render before the effect syncs it into `user`;
  // treat that gap as still-loading so ProtectedRoute doesn't redirect to /login.
  const isLoading = meLoading || (!loggedOut && !!meData && !isError && user === null);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, permissions, can: (permission) => user?.role === "admin" || permissions.includes("*") || permissions.includes(permission) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Permission hook — combines role + locationScope to produce a `can()` checker.
 *
 * Rules:
 *   admin          → always true
 *   location_manager → view/create/approve for locationScope locations
 *   operator       → view/create for locationScope locations
 *   viewer         → view only for locationScope locations
 *   (any role)     → cross_site in locationScope extends access to all locations
 */
export function usePermission() {
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";
  const locationScope: string[] = Array.isArray((user as any)?.locationScope)
    ? (user as any).locationScope
    : [];
  const hasAll = isAdmin || locationScope.includes("cross_site");

  function can(
    action: "view" | "create" | "approve" | "delete",
    location?: string
  ): boolean {
    if (!user) return false;
    if (isAdmin) return true;

    // delete is admin-only
    if (action === "delete") return false;

    // approve requires at least manager role
    if (action === "approve") {
      if (user.role !== "manager" && user.role !== "admin") return false;
      if (!location) return hasAll || locationScope.length > 0;
      return hasAll || locationScope.includes(location);
    }

    // create requires at least operator role (not viewer)
    if (action === "create") {
      if (user.role === "viewer") return false;
      if (!location) return hasAll || locationScope.length > 0;
      return hasAll || locationScope.includes(location);
    }

    // view — all roles can view their location scope
    if (!location) return hasAll || locationScope.length > 0;
    return hasAll || locationScope.includes(location);
  }

  return { isAdmin, can, locationScope, role: user?.role ?? null };
}
