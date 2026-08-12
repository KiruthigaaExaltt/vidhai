import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Edit2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
type Role = {
  id: number;
  name: string;
  description?: string;
  permissions: string[] | Record<string, string[]>;
  isSystem: boolean;
  isSuperAdmin?: boolean;
  systemKey?: string;
  isActive?: boolean;
};
type Catalog = { module: string; key: string; actions: string[] };
async function request(path: string, options?: RequestInit) {
  const r = await fetch(`${BASE}/api/settings/${path}`, {
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
export type RolesPageHandle = {
  beginCreate: () => void;
};
const RolesPage = forwardRef<
  RolesPageHandle,
  {
    users?: { role: string }[];
  }
>(function RolesPage({ users = [] }, ref) {
  const { toast } = useToast();
  const { can } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]),
    [catalog, setCatalog] = useState<Catalog[]>([]),
    [moduleFilter, setModuleFilter] = useState(""),
    [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Role | null>(null),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [permissions, setPermissions] = useState<string[]>([]),
    [isActive, setIsActive] = useState(true),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [r, c] = await Promise.all([
        request("roles"),
        request("permissions/catalog"),
      ]);
      setRoles(r);
      setCatalog(c);
    } catch (e: any) {
      toast({
        title: "Unable to load roles",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const shown = useMemo(
    () =>
      roles.filter(
        (r) =>
          !r.isSuperAdmin &&
          `${r.name} ${r.description || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [roles, search],
  );
  const begin = (r?: Role) => {
    setEditing(r || null);
    setName(r?.name || "");
    setDescription(r?.description || "");
    setPermissions(Array.isArray(r?.permissions) ? r!.permissions : []);
    setIsActive(r?.isActive !== false);
    setOpen(true);
  };
  useImperativeHandle(ref, () => ({ beginCreate: () => begin() }));
  const toggle = (key: string, checked: boolean) => {
    const [scope, action] = key.split(/\.(?=[^.]+$)/);
    setPermissions((current) => {
      let next = checked
        ? [...new Set([...current, key])]
        : current.filter((k) => k !== key);
      if (checked && action !== "view")
        next = [...new Set([...next, `${scope}.view`])];
      if (!checked && action === "view")
        next = next.filter((k) => !k.startsWith(`${scope}.`));
      return next;
    });
  };
  const actionOrder = [
    "all",
    "view",
    "create",
    "update",
    "delete",
    "notification",
    "approve",
    "reject",
    "export",
    "assign",
    "import",
    "restore",
    "settings",
    "upload",
    "manage_settings",
    "download",
    "for_own",
    "for_others",
    "change_time",
  ];
  const displayActions = actionOrder.filter(
    (action) =>
      action === "all" || catalog.some((row) => row.actions.includes(action)),
  );
  const filteredCatalog = moduleFilter
    ? catalog.filter((row) => row.key === moduleFilter)
    : catalog;
  const rowChecked = (row: Catalog, action: string) =>
    action === "all"
      ? row.actions.length > 0 &&
        row.actions.every((item) => permissions.includes(`${row.key}.${item}`))
      : permissions.includes(`${row.key}.${action}`);
  const toggleAll = (row: Catalog, checked: boolean) =>
    setPermissions((current) => {
      const rowKeys = row.actions.map((action) => `${row.key}.${action}`);
      return checked
        ? [...new Set([...current, ...rowKeys])]
        : current.filter((key) => !rowKeys.includes(key));
    });
  const save = async () => {
    const duplicate = roles.find(
      (role) =>
        role.id !== editing?.id &&
        role.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (duplicate) {
      toast({
        title: "Role already exists",
        description:
          duplicate.isSystem || duplicate.systemKey
            ? `${duplicate.name} is a protected system role. Choose another role name.`
            : `Choose another name; ${duplicate.name} already exists.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await request(editing ? `roles/${editing.id}` : "roles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          description,
          permissionKeys: permissions,
          isActive,
        }),
      });
      setOpen(false);
      await load();
      toast({ title: `Role ${editing ? "updated" : "created"}` });
    } catch (e: any) {
      toast({
        title: "Unable to save role",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (role: Role) => {
    if (!window.confirm(`Delete role ${role.name}?`)) return;
    try {
      await request(`roles/${role.id}`, { method: "DELETE" });
      await load();
      toast({ title: "Role deleted" });
    } catch (e: any) {
      toast({
        title: "Unable to delete role",
        description: e.message,
        variant: "destructive",
      });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          className="w-full"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="hidden grid-cols-[minmax(0,2fr)_120px_120px_100px_90px] gap-3 bg-muted/40 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
          <span>Role</span>
          <span>Modules</span>
          <span>Permissions</span>
          <span>Users</span>
          <span className="text-right">Action</span>
        </div>
        {shown.map((r) => {
          const p = Array.isArray(r.permissions) ? r.permissions : [];
          const roleSlug = String(r.name || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_");
          const isProtected =
            Boolean(r.isSuperAdmin) ||
            r.systemKey === "SUPER_ADMIN" ||
            roleSlug === "admin" ||
            roleSlug === "super_admin";
          const roleUsers = users.filter(
            (user) => user.role.toLowerCase() === r.name.toLowerCase(),
          ).length;
          return (
            <div
              key={r.id}
              className="grid gap-3 border-t p-4 first:border-t-0 md:grid-cols-[minmax(0,2fr)_120px_120px_100px_90px] md:items-center"
            >
              <div className="contents">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{r.name}</h3>
                    {r.isSystem && <Badge variant="secondary">System</Badge>}
                    {r.isActive === false && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.description || "No description"}
                  </p>
                </div>
                <div className="flex justify-end md:order-last">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={Boolean(
                      isProtected ||
                      !can("settings.user_management.manage_settings"),
                    )}
                    title={
                      isProtected
                        ? "Administrator role is protected"
                        : "Edit role"
                    }
                    onClick={() => begin(r)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {!isProtected &&
                    can("settings.user_management.manage_settings") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void remove(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                </div>
              </div>
              <span className="text-sm">
                {new Set(p.map((k) => k.split(".")[0])).size}
              </span>
              <span className="text-sm">{p.length}</span>
              <span className="text-sm">{roleUsers}</span>
            </div>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(90vh,760px)] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
            <DialogTitle>{editing ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <div className="grid shrink-0 gap-4 px-6 sm:grid-cols-2">
            <div>
              <Label>Role Name</Label>
              <Input
                disabled={!!editing}
                placeholder="e.g., Purchase Manager"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                placeholder="What this role is allowed to do"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <label className="flex shrink-0 items-center gap-2 px-6 pt-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={(value) => setIsActive(value === true)}
            />
            <span className="text-sm">Role is active and assignable</span>
          </label>
          <div className="mx-6 mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between bg-muted/40 px-4 py-3">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Permission Table
              </span>
              <select
                className="h-10 w-56 rounded-md border bg-background px-3 text-sm"
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="">All modules</option>
                {catalog.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.module}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-[calc(100%-64px)] overflow-auto">
              <table className="w-full min-w-[1400px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr>
                    <th className="w-64 px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                      Action Type
                    </th>
                    {displayActions.map((action) => (
                      <th
                        key={action}
                        className="px-3 py-3 text-center text-[11px] uppercase text-muted-foreground"
                      >
                        {action.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map((row) => (
                    <tr key={row.key} className="border-t">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{row.module}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.key.split(".")[0]}
                        </p>
                      </td>
                      {displayActions.map((action) => {
                        const available =
                          action === "all" || row.actions.includes(action);
                        const checked = rowChecked(row, action);
                        const disabled =
                          !available ||
                          (action !== "all" &&
                            action !== "view" &&
                            !permissions.includes(`${row.key}.view`));
                        return (
                          <td key={action} className="px-3 py-3 text-center">
                            {available && (
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  action === "all"
                                    ? toggleAll(row, !checked)
                                    : toggle(`${row.key}.${action}`, !checked)
                                }
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${checked ? "bg-primary" : "bg-muted"}`}
                              >
                                <span
                                  className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
                                />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="hidden mt-4 overflow-x-auto rounded-lg border">
            <div className="grid grid-cols-[220px_repeat(5,minmax(80px,1fr))] border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
              <span>Module</span>
              <span>View</span>
              <span>Create</span>
              <span>Update</span>
              <span>Delete</span>
              <span>Other</span>
            </div>
            {catalog.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[220px_repeat(5,minmax(80px,1fr))] items-center border-b px-3 py-3 text-sm last:border-0"
              >
                <span className="font-medium">{row.module}</span>
                {["view", "create", "update", "delete"].map((action) => (
                  <span key={action}>
                    {row.actions.includes(action) ? (
                      <Checkbox
                        checked={permissions.includes(`${row.key}.${action}`)}
                        onCheckedChange={(v) =>
                          toggle(`${row.key}.${action}`, v === true)
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                ))}
                <div className="flex flex-wrap gap-2">
                  {row.actions
                    .filter(
                      (a) =>
                        !["view", "create", "update", "delete"].includes(a),
                    )
                    .map((action) => (
                      <label
                        key={action}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Checkbox
                          checked={permissions.includes(`${row.key}.${action}`)}
                          onCheckedChange={(v) =>
                            toggle(`${row.key}.${action}`, v === true)
                          }
                        />
                        {action.replace("_", " ")}
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4 sm:grid sm:grid-cols-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !name.trim()} onClick={() => void save()}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {busy ? "Saving..." : editing ? "Save Role" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
export default RolesPage;
