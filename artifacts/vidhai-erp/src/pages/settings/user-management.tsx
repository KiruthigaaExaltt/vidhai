import { useEffect, useMemo, useState } from "react";
import {
  Edit2,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import RolesPage from "./roles";
import { AddMemberDialog } from "@/pages/crew/AddMemberDialog";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
async function api(path: string, options?: RequestInit) {
  const r = await fetch(`${BASE}/api/settings/users${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error || "Request failed");
  }
  return r.status === 204 ? null : r.json();
}
type User = {
  id: number;
  displayName: string;
  username: string;
  email?: string;
  role: string;
  employeeName?: string;
  employeeId?: number;
  department?: string;
  isActive?: boolean;
  permissionOverrides?: string[];
  lastLogin?: string;
  locationScope: string[];
};
const empty = {
  displayName: "",
  username: "",
  email: "",
  role: "viewer",
  employeeName: "",
  employeeId: "",
  department: "",
  includeInCrew: false,
  locationScope: [] as string[],
};
export default function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]),
    [roles, setRoles] = useState<any[]>([]),
    [employees, setEmployees] = useState<any[]>([]),
    [catalog, setCatalog] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [tab, setTab] = useState("users"),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<User | null>(null),
    [form, setForm] = useState<any>(empty),
    [accessFor, setAccessFor] = useState<User | null>(null),
    [access, setAccess] = useState<any>(null),
    [crewSeed, setCrewSeed] = useState<any>(null),
    [crewUser, setCrewUser] = useState<any>(null),
    [passwordFor, setPasswordFor] = useState<User | null>(null),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [u, r, e, c] = await Promise.all([
        api(""),
        fetch(`${BASE}/api/settings/roles`, { credentials: "include" }).then(
          (x) => (x.ok ? x.json() : []),
        ),
        api("/employee-options"),
        fetch(`${BASE}/api/settings/permissions/catalog`, {
          credentials: "include",
        }).then((x) => (x.ok ? x.json() : [])),
      ]);
      setUsers(u);
      setRoles(r);
      setEmployees(e);
      setCatalog(c);
    } catch (e: any) {
      toast({
        title: "Unable to load user management",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const filtered = useMemo(
    () =>
      users.filter((u) =>
        `${u.displayName} ${u.username} ${u.email || ""} ${u.role} ${u.employeeName || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [users, search],
  );
  const begin = async (u?: User) => {
    try {
      const latestRoles = await fetch(`${BASE}/api/settings/roles`, {
        credentials: "include",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Unable to refresh roles");
        return response.json();
      });
      const assignable = (Array.isArray(latestRoles) ? latestRoles : []).filter(
        (role: any) => role.isActive !== false && !role.isSuperAdmin,
      );
      setRoles(latestRoles);
      setEditing(u || null);
      setForm(u ? { ...u } : { ...empty, role: assignable[0]?.name || "" });
      setOpen(true);
    } catch (error: any) {
      toast({
        title: "Unable to open user form",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: form.displayName,
        displayName: form.displayName,
        username: form.username,
        email: form.email,
        role: form.role,
        employeeName: form.employeeName || null,
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        department: form.department || null,
        locationScope: form.locationScope || [],
      };
      const result = await api(editing ? `/${editing.id}` : "", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setOpen(false);
      await load();
      toast({
        title: editing ? "User updated" : "User created",
        description: result?.temporaryPassword
          ? `One-time password: ${result.temporaryPassword}`
          : undefined,
      });
    } catch (e: any) {
      toast({
        title: "Unable to save user",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const openCrewForm = () => {
    if (
      !form.displayName.trim() ||
      (!form.username.trim() && !form.email.trim())
    ) {
      toast({
        title: "Enter the user details first",
        description: "Full name and either username or email are required.",
        variant: "destructive",
      });
      return;
    }
    setCrewUser(null);
    setCrewSeed({
      name: form.displayName,
      email: form.email,
      role: form.role,
      department: form.department,
      includeInUser: true,
      userAccountEmail: form.email,
      userAccountUsername: form.username,
    });
    setOpen(false);
  };
  const createCrewUser = async () => {
    if (crewUser) return crewUser;
    const created = await api("", {
      method: "POST",
      body: JSON.stringify({
        name: form.displayName,
        displayName: form.displayName,
        username: form.username,
        email: form.email,
        role: form.role,
        department: form.department || null,
      }),
    });
    setCrewUser(created);
    if (created.temporaryPassword)
      toast({
        title: "User created",
        description: `One-time password: ${created.temporaryPassword}`,
      });
    return created;
  };
  const reset = async () => {
    if (!passwordFor) return;
    setBusy(true);
    try {
      await api(`/${passwordFor.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({
          newPassword: password,
          confirmPassword: password,
        }),
      });
      setPasswordFor(null);
      setPassword("");
      toast({
        title: "Password reset",
        description: "Existing sessions for this user were invalidated.",
      });
    } catch (e: any) {
      toast({
        title: "Unable to reset password",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const deactivate = async (u: User) => {
    if (!window.confirm(`Deactivate ${u.displayName}?`)) return;
    try {
      await api(`/${u.id}/deactivate`, { method: "PATCH" });
      await load();
      toast({ title: "User deactivated" });
    } catch (e: any) {
      toast({
        title: "Unable to deactivate",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  const activate = async (u: User) => {
    try {
      await api(`/${u.id}/activate`, {
        method: "PATCH",
        body: JSON.stringify({ restoreEmployee: true }),
      });
      await load();
      toast({ title: "User activated" });
    } catch (e: any) {
      toast({
        title: "Unable to activate",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  const remove = async (u: User) => {
    if (
      !window.confirm(
        `Delete ${u.displayName} and offboard the linked employee? This hides both records from active lists.`,
      )
    )
      return;
    try {
      await api(`/${u.id}`, { method: "DELETE" });
      await load();
      toast({ title: "User deleted" });
    } catch (e: any) {
      toast({
        title: "Unable to delete",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  const beginAccess = async (u: User) => {
    try {
      const value = await api(`/${u.id}/access`);
      setAccessFor(u);
      setAccess({
        ...value,
        employeeId: value.employeeId ? String(value.employeeId) : "",
        permissionOverrides: value.permissionOverrides || [],
      });
    } catch (e: any) {
      toast({
        title: "Unable to load access",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  const saveAccess = async () => {
    if (!accessFor || !access) return;
    setBusy(true);
    try {
      await api(`/${accessFor.id}/access`, {
        method: "PUT",
        body: JSON.stringify({
          ...access,
          employeeId: access.employeeId ? Number(access.employeeId) : null,
        }),
      });
      setAccessFor(null);
      await load();
      toast({
        title: "User access updated",
        description: "The user's existing sessions were refreshed.",
      });
    } catch (e: any) {
      toast({
        title: "Unable to update access",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const override = (key: string, value: "inherit" | "allow" | "deny") => {
    setAccess((current: any) => {
      const next = (current.permissionOverrides || []).filter(
        (item: string) => item !== key && item !== `!${key}`,
      );
      if (value === "allow") next.push(key);
      if (value === "deny") next.push(`!${key}`);
      return { ...current, permissionOverrides: next };
    });
  };
  const sync = async () => {
    try {
      const r = await api("/sync-roles", { method: "POST" });
      toast({
        title: "Users and roles synced",
        description: `${r.syncedUsers} user session(s) refreshed.`,
      });
    } catch (e: any) {
      toast({
        title: "Unable to sync",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void sync()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync users and roles
            </Button>
            {tab === "users" && (
              <Button onClick={() => begin()}>
                <Plus className="mr-2 h-4 w-4" />
                New User
              </Button>
            )}
          </div>
        </div>
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-hidden rounded-lg border">
            <div className="hidden grid-cols-[2fr,1.5fr,1fr,1fr,auto] gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase text-muted-foreground md:grid">
              <span>User</span>
              <span>Email / Employee</span>
              <span>Role</span>
              <span>Last login</span>
              <span>Actions</span>
            </div>
            {filtered.map((u) => (
              <div
                key={u.id}
                className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[2fr,1.5fr,1fr,1fr,auto] md:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                    {u.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      @{u.username}
                    </div>
                  </div>
                </div>
                <div className="text-sm">
                  <div>{u.email || "No email"}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.employeeName || "No linked employee"}
                  </div>
                </div>
                <Badge variant="outline" className="w-fit capitalize">
                  {u.role} · {u.isActive === false ? "Inactive" : "Active"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {u.lastLogin ? relative(u.lastLogin) : "Never"}
                </span>
                <div className="flex">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Access and permissions"
                    onClick={() => void beginAccess(u)}
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Edit"
                    onClick={() => begin(u)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Reset password"
                    onClick={() => setPasswordFor(u)}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  {u.isActive === false ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Activate"
                      onClick={() => void activate(u)}
                    >
                      <UserCheck className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Deactivate"
                      onClick={() => void deactivate(u)}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete"
                    className="text-destructive"
                    onClick={() => void remove(u)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No users found.
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="roles">
          <RolesPage />
        </TabsContent>
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Full Name">
              <Input
                placeholder="e.g., Priya Sharma"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
              />
            </Field>
            <Field label="Unique Username">
              <Input
                placeholder="e.g., priya_sharma"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.toLowerCase() })
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers, and underscore only.
              </p>
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                placeholder="e.g., priya.sharma@edecs.com"
                value={form.email || ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Employee Name">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.employeeId || ""}
                onChange={(e) =>
                  setForm({ ...form, employeeId: e.target.value })
                }
              >
                <option value="">No employee linked</option>
                {employees
                  .filter(
                    (employee) =>
                      !employee.userId ||
                      Number(employee.userId) === editing?.id,
                  )
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employeeCode} · {employee.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Role">
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roles
                  .filter((r) => r.isActive !== false && !r.isSuperAdmin)
                  .map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            {!editing && !form.employeeId && (
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={form.includeInCrew}
                  onCheckedChange={(value) => value === true && openCrewForm()}
                />
                <span className="text-sm">Include in Crew</span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !form.displayName.trim() ||
                (!form.username.trim() && !form.email.trim())
              }
              onClick={() => void save()}
            >
              {busy ? "Adding..." : editing ? "Save User" : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!passwordFor}
        onOpenChange={(v) => !v && setPasswordFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset password for {passwordFor?.displayName}
            </DialogTitle>
          </DialogHeader>
          <Field label="New password (minimum 8 characters)">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || password.length < 8}
              onClick={() => void reset()}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!accessFor}
        onOpenChange={(value) => !value && setAccessFor(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Access for {accessFor?.displayName}</DialogTitle>
          </DialogHeader>
          {access && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={access.role}
                    onChange={(e) =>
                      setAccess({ ...access, role: e.target.value })
                    }
                  >
                    {roles
                      .filter(
                        (role) => role.isActive !== false && !role.isSuperAdmin,
                      )
                      .map((role) => (
                        <option key={role.id} value={role.name}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Linked Crew member">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={access.employeeId || ""}
                    onChange={(e) =>
                      setAccess({ ...access, employeeId: e.target.value })
                    }
                  >
                    <option value="">No linked employee</option>
                    {employees
                      .filter(
                        (employee) =>
                          !employee.userId ||
                          Number(employee.userId) === accessFor?.id,
                      )
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.employeeCode} · {employee.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <div className="grid grid-cols-[1fr,140px] bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                  <span>Permission override</span>
                  <span>Rule</span>
                </div>
                {catalog
                  .flatMap((row) =>
                    row.actions.map((action: string) => ({
                      label: `${row.module} · ${action.replaceAll("_", " ")}`,
                      key: `${row.key}.${action}`,
                    })),
                  )
                  .map((permission) => {
                    const values = access.permissionOverrides || [];
                    const value = values.includes(permission.key)
                      ? "allow"
                      : values.includes(`!${permission.key}`)
                        ? "deny"
                        : "inherit";
                    return (
                      <div
                        key={permission.key}
                        className="grid grid-cols-[1fr,140px] items-center border-t px-3 py-2 text-sm"
                      >
                        <span>{permission.label}</span>
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={value}
                          onChange={(e) =>
                            override(permission.key, e.target.value as any)
                          }
                        >
                          <option value="inherit">Inherit role</option>
                          <option value="allow">Allow</option>
                          <option value="deny">Deny</option>
                        </select>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !access}
              onClick={() => void saveAccess()}
            >
              Save Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AddMemberDialog
        open={!!crewSeed}
        onOpenChange={(value) => {
          if (!value) {
            setCrewSeed(null);
            setCrewUser(null);
          }
        }}
        employees={employees}
        initialEmployee={crewSeed}
        beforeCreate={createCrewUser}
        onCreated={async () => {
          setCrewSeed(null);
          setCrewUser(null);
          await load();
        }}
      />
    </div>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function relative(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
