import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, ShieldCheck, Save, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── types ──────────────────────────────────────────────────────────────────────

type PermMap = Record<"view" | "create" | "approve" | "delete", string[]>;

interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  permissions: PermMap;
  isSystem: boolean;
}

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  role: string;
  locationScope: string[];
}

// ── constants ──────────────────────────────────────────────────────────────────

const LOCATIONS: { slug: string; label: string }[] = [
  { slug: "annur",       label: "Annur (A)" },
  { slug: "ooty",        label: "Ooty (B)" },
  { slug: "coimbatore",  label: "Coimbatore (C)" },
  { slug: "lab",         label: "Lab (D)" },
  { slug: "cross_site",  label: "Cross-Site" },
];

const ACTIONS: { key: keyof PermMap; label: string }[] = [
  { key: "view",    label: "View" },
  { key: "create",  label: "Create" },
  { key: "approve", label: "Approve" },
  { key: "delete",  label: "Delete" },
];

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── API helpers ────────────────────────────────────────────────────────────────

async function fetchRoles(): Promise<RoleRow[]> {
  const res = await fetch(`${BASE}/api/roles`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load roles");
  return res.json();
}

async function fetchUsers(): Promise<UserRow[]> {
  const res = await fetch(`${BASE}/api/users`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load users");
  const data = await res.json();
  // The users endpoint returns objects with locationScope already parsed
  return data.map((u: any) => ({
    ...u,
    locationScope: Array.isArray(u.locationScope) ? u.locationScope : [],
  }));
}

async function patchRole(id: number, body: Partial<RoleRow>) {
  const res = await fetch(`${BASE}/api/roles/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update role");
  return res.json();
}

async function createRole(body: { name: string; description: string; permissions: PermMap }) {
  const res = await fetch(`${BASE}/api/roles`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create role");
  return res.json();
}

async function deleteRole(id: number) {
  const res = await fetch(`${BASE}/api/roles/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete role");
}

async function patchUser(id: number, body: { role?: string; locationScope?: string[] }) {
  const res = await fetch(`${BASE}/api/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to update user");
  return res.json();
}

// ── PermissionMatrix ──────────────────────────────────────────────────────────

function emptyPermMap(): PermMap {
  return { view: [], create: [], approve: [], delete: [] };
}

function togglePerm(perms: PermMap, action: keyof PermMap, loc: string): PermMap {
  const current = perms[action] ?? [];
  const next = current.includes(loc)
    ? current.filter((l) => l !== loc)
    : [...current, loc];
  return { ...perms, [action]: next };
}

function PermissionMatrix({
  perms,
  readonly,
  onChange,
}: {
  perms: PermMap;
  readonly: boolean;
  onChange?: (next: PermMap) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider w-28">Action</th>
            {LOCATIONS.map((l) => (
              <th key={l.slug} className="px-3 py-2 text-center font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {l.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ACTIONS.map((a) => (
            <tr key={a.key} className="hover:bg-muted/20">
              <td className="px-3 py-2.5 font-medium capitalize">{a.label}</td>
              {LOCATIONS.map((l) => {
                const checked = (perms[a.key] ?? []).includes(l.slug);
                return (
                  <td key={l.slug} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readonly}
                      onChange={() => !readonly && onChange && onChange(togglePerm(perms, a.key, l.slug))}
                      className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── RolesTab ──────────────────────────────────────────────────────────────────

function RolesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: roles = [], isLoading } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<PermMap>(emptyPermMap());
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<PermMap>(emptyPermMap());

  const selectedRole = roles.find((r) => r.id === selectedId);

  const handleSelect = (role: RoleRow) => {
    setSelectedId(role.id);
    setEditDesc(role.description ?? "");
    setEditPerms({ ...emptyPermMap(), ...role.permissions });
  };

  const saveMutation = useMutation({
    mutationFn: (vars: { id: number; desc: string; perms: PermMap }) =>
      patchRole(vars.id, { description: vars.desc, permissions: vars.perms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast({ title: "Role saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { name: string; description: string; permissions: PermMap }) =>
      createRole(vars),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast({ title: "Role created" });
      setSelectedId(created.id);
      setEditDesc(created.description ?? "");
      setEditPerms({ ...emptyPermMap(), ...created.permissions });
      setSelectedId(null);
      setNewName("");
      setNewDesc("");
      setNewPerms(emptyPermMap());
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setSelectedId(null);
      toast({ title: "Role deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-4">
      {/* Left: role list */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roles</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => { setSelectedId("new"); setNewName(""); setNewDesc(""); setNewPerms(emptyPermMap()); }}
          >
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>

        {isLoading && <div className="text-xs text-muted-foreground px-2">Loading…</div>}

        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => handleSelect(r)}
            className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors flex items-center justify-between group ${
              selectedId === r.id
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted/50 text-foreground"
            }`}
          >
            <span className="truncate">{r.name}</span>
            {r.isSystem && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-2 shrink-0">system</span>
            )}
          </button>
        ))}

        {/* New role form inline in list */}
        {selectedId === "new" && (
          <div className="border border-border rounded-sm p-3 mt-2 space-y-2 bg-muted/20">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New Role</div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. lab_operator"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description"
                className="h-7 text-xs"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="h-7 text-xs flex-1"
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc, permissions: newPerms })}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right: editor */}
      {selectedRole ? (
        <Card className="rounded-sm shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-mono text-base">{selectedRole.name}</CardTitle>
                {selectedRole.isSystem && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">System role — name cannot be changed</span>
                )}
              </div>
              <div className="flex gap-2">
                {!selectedRole.isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(selectedRole.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ id: selectedRole.id, desc: editDesc, perms: editPerms })}
                >
                  <Save className="w-3 h-3 mr-1" /> Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Describe what this role can do"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Permission Matrix</div>
              <PermissionMatrix
                perms={editPerms}
                readonly={false}
                onChange={setEditPerms}
              />
            </div>
          </CardContent>
        </Card>
      ) : selectedId !== "new" ? (
        <div className="flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-sm min-h-[200px]">
          Select a role to edit its permissions
        </div>
      ) : (
        /* When "new" is selected in the left panel, show perm matrix on right too */
        <Card className="rounded-sm shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Set Default Permissions</CardTitle>
            <CardDescription className="text-xs">You can adjust these after creating the role.</CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionMatrix perms={newPerms} readonly={false} onChange={setNewPerms} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── UsersTab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users-admin"], queryFn: fetchUsers });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const [edits, setEdits] = useState<Record<number, { role: string; locationScope: string[] }>>({});

  const getEdit = (u: UserRow) =>
    edits[u.id] ?? { role: u.role, locationScope: u.locationScope };

  const setField = (id: number, field: "role" | "locationScope", value: any) =>
    setEdits((prev) => ({
      ...prev,
      [id]: { ...getEdit({ id } as UserRow), ...prev[id], [field]: value },
    }));

  const toggleLoc = (u: UserRow, loc: string) => {
    const current = getEdit(u).locationScope;
    const next = current.includes(loc) ? current.filter((l) => l !== loc) : [...current, loc];
    setField(u.id, "locationScope", next);
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { role: string; locationScope: string[] } }) =>
      patchUser(id, data),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      setEdits((prev) => { const copy = { ...prev }; delete copy[vars.id]; return copy; });
      toast({ title: "User saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading users…</div>;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-3">
        Assign roles and location access to each user. Changes take effect on the user's next page load.
      </div>
      <div className="border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wider text-muted-foreground">User</th>
              <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wider text-muted-foreground">Role</th>
              <th className="px-4 py-2.5 text-left font-medium text-xs uppercase tracking-wider text-muted-foreground">Location Scope</th>
              <th className="px-4 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const edit = getEdit(u);
              const dirty = edits[u.id] !== undefined;
              return (
                <tr key={u.id} className="h-[52px] hover:bg-muted/20">
                  <td className="px-4">
                    <div className="font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{u.username}</div>
                  </td>
                  <td className="px-4 w-44">
                    <Select value={edit.role} onValueChange={(v) => setField(u.id, "role", v)}>
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.name} className="text-xs">
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4">
                    <div className="flex flex-wrap gap-2">
                      {LOCATIONS.map((l) => (
                        <label key={l.slug} className="flex items-center gap-1 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={edit.locationScope.includes(l.slug)}
                            onChange={() => toggleLoc(u, l.slug)}
                            className="w-3.5 h-3.5 accent-primary"
                          />
                          <span className="text-muted-foreground">{l.label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 text-right">
                    {dirty && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={saveMutation.isPending}
                        onClick={() => saveMutation.mutate({ id: u.id, data: edit })}
                      >
                        <Save className="w-3 h-3 mr-1" /> Save
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Define role permission matrices and assign users to roles and locations.
          </p>
        </div>
      </div>

        <Tabs defaultValue="roles">
          <TabsList className="rounded-sm">
            <TabsTrigger value="roles" className="rounded-sm text-xs">Role Matrix</TabsTrigger>
            <TabsTrigger value="users" className="rounded-sm text-xs">User Assignments</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="mt-4">
            <RolesTab />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
      </Tabs>
    </div>
  );
}
