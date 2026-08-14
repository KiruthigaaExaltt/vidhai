import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Edit2,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataPagination } from "@/components/ui/data-pagination";

const empty = {
  sku: "",
  name: "",
  category: "",
  totalQuantity: "1",
  purchaseValue: "0",
  purchaseDate: new Date().toISOString().slice(0, 10),
  status: "Active",
  imageUrl: "",
};
const request = async (path: string, init?: RequestInit) => {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!r.ok)
    throw new Error(
      (await r.json().catch(() => ({}))).error || "Request failed",
    );
  return r.status === 204 ? null : r.json();
};
const deallocateRequest = async (allocationId: number) => {
  const response = await fetch(
    `/api/assets/allocations/${allocationId}/deallocate`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || `Unable to deallocate asset (HTTP ${response.status})`,
    );
  }
  return response.json();
};
const Field = ({ label, children }: any) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

export function AssetManagement() {
  const qc = useQueryClient(),
    [tab, setTab] = useState("assets"),
    [search, setSearch] = useState(""),
    [assetPage, setAssetPage] = useState(1),
    [assetPageSize, setAssetPageSize] = useState(10),
    [allocationPage, setAllocationPage] = useState(1),
    [allocationPageSize, setAllocationPageSize] = useState(10),
    [formOpen, setFormOpen] = useState(false),
    [allocateOpen, setAllocateOpen] = useState(false),
    [qr, setQr] = useState<any>(null),
    [form, setForm] = useState<any>(empty),
    [editing, setEditing] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [deleteTarget, setDeleteTarget] = useState<any>(null),
    [deallocateTarget, setDeallocateTarget] = useState<any>(null),
    [openMenuId, setOpenMenuId] = useState<number | null>(null),
    [openAllocationMenuId, setOpenAllocationMenuId] = useState<number | null>(
      null,
    ),
    [allocation, setAllocation] = useState({
      employeeId: "",
      quantity: "1",
      allocatedDate: new Date().toISOString().slice(0, 10),
    });
  const assets = useQuery({
    queryKey: ["assets", search, assetPage, assetPageSize],
    queryFn: () =>
      request(
        `/assets?search=${encodeURIComponent(search)}&skip=${(assetPage - 1) * assetPageSize}&limit=${assetPageSize}`,
      ),
    placeholderData: (previous) => previous,
  });
  const allocations = useQuery({
    queryKey: ["asset-allocations", search, allocationPage, allocationPageSize],
    queryFn: () =>
      request(
        `/assets/allocations?search=${encodeURIComponent(search)}&skip=${(allocationPage - 1) * allocationPageSize}&limit=${allocationPageSize}`,
      ),
    placeholderData: (previous) => previous,
  });
  const employees = useQuery({
    queryKey: ["asset-employees"],
    queryFn: () => request("/crew/employees?status=Active&skip=0&limit=100"),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assets"] });
    qc.invalidateQueries({ queryKey: ["asset-allocations"] });
  };
  const payload = () => ({
    ...form,
    totalQuantity: Number(form.totalQuantity),
    purchaseValue: Number(form.purchaseValue),
  });
  const create = useMutation({
    mutationFn: () =>
      request("/assets", { method: "POST", body: JSON.stringify(payload()) }),
    onSuccess: () => {
      toast.success("Asset created");
      closeForm();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: () =>
      request(`/assets/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload()),
      }),
    onSuccess: () => {
      toast.success("Asset updated");
      closeForm();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const allocate = useMutation({
    mutationFn: () =>
      request(`/assets/${selected.id}/allocate`, {
        method: "POST",
        body: JSON.stringify({
          ...allocation,
          employeeId: Number(allocation.employeeId),
          quantity: Number(allocation.quantity),
        }),
      }),
    onSuccess: () => {
      toast.success("Asset allocated");
      setAllocateOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      request(`/assets/${deleteTarget.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Asset deleted");
      setDeleteTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deallocate = useMutation({
    mutationFn: () => deallocateRequest(deallocateTarget.id),
    onSuccess: () => {
      toast.success("Asset deallocated");
      setDeallocateTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(empty);
  };
  const edit = (a: any) => {
    setEditing(a);
    setForm({
      sku: a.sku,
      name: a.name,
      category: a.category,
      totalQuantity: String(a.totalQuantity),
      purchaseValue: String(a.purchaseValue),
      purchaseDate: a.purchaseDate,
      status: a.status,
      imageUrl: a.imageUrl || "",
    });
    setFormOpen(true);
  };
  const startAllocate = (a: any) => {
    setSelected(a);
    setAllocation({
      employeeId: "",
      quantity: "1",
      allocatedDate: new Date().toISOString().slice(0, 10),
    });
    setAllocateOpen(true);
  };
  const readImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setForm((old: any) => ({ ...old, imageUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  const data = assets.data?.data || [],
    rows = allocations.data?.data || [],
    employeeRows = employees.data?.data || employees.data || [];
  const assetPagination = assets.data?.pagination ?? assets.data ?? {};
  const allocationPagination =
    allocations.data?.pagination ?? allocations.data ?? {};
  const changeSearch = (value: string) => {
    setSearch(value);
    setAssetPage(1);
    setAllocationPage(1);
  };
  return (
    <TabsContent value="assets" className="outline-none mt-0 space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display">
              Asset Management
            </h1>
          </div>
          {tab === "assets" && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          )}
        </div>
        <TabsList className="mt-5">
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="allocations">Allocated Assets</TabsTrigger>
        </TabsList>
        <Input
          className="mt-4 max-w-md"
          placeholder="Search assets, SKU, or employee"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
        <TabsContent value="assets">
          <Card>
            <CardContent className="relative overflow-x-auto p-0">
              <table
                className={`w-full text-sm transition-opacity ${assets.isFetching ? "opacity-60" : "opacity-100"}`}
              >
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">Asset</th>
                    <th className="p-3 text-left">SKU</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Available</th>
                    <th className="p-3 text-right">Allocated</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((a: any) => (
                    <tr key={a.id} className="border-b">
                      <td className="p-3 font-medium">{a.name}</td>
                      <td className="p-3">{a.sku}</td>
                      <td className="p-3 text-right">{a.totalQuantity}</td>
                      <td className="p-3 text-right">{a.availableQuantity}</td>
                      <td className="p-3 text-right">{a.allocatedQuantity}</td>
                      <td className="p-3">{a.status}</td>
                      <td className="p-3 text-right">
                        <DropdownMenu
                          open={openMenuId === a.id}
                          onOpenChange={(open) =>
                            setOpenMenuId(open ? a.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${a.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={6}
                            className="z-[60] min-w-36"
                          >
                            <DropdownMenuItem onSelect={() => setQr(a)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View QR
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => edit(a)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={a.availableQuantity <= 0}
                              onSelect={() => startAllocate(a)}
                            >
                              <UserPlus className="mr-2 h-4 w-4" />
                              Allocate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTarget(a)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {!data.length && (
                    <tr>
                      <td
                        className="p-6 text-center text-muted-foreground"
                        colSpan={7}
                      >
                        No assets found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {assets.isFetching && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/25" role="status" aria-label="Loading assets">
                  <span className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading assets
                  </span>
                </div>
              )}
            </CardContent>
            <DataPagination
              currentPage={assetPage}
              pageSize={assetPageSize}
              totalCount={Number(assetPagination.totalCount) || 0}
              totalPages={Number(assetPagination.totalPages) || 0}
              loading={assets.isFetching}
              onPageChange={setAssetPage}
              onPageSizeChange={(size) => {
                setAssetPageSize(size);
                setAssetPage(1);
              }}
            />
          </Card>
        </TabsContent>
        <TabsContent value="allocations">
          <Card>
            <CardContent className="relative overflow-x-auto p-0">
              <table
                className={`w-full text-sm transition-opacity ${allocations.isFetching ? "opacity-60" : "opacity-100"}`}
              >
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="p-3 text-left">SKU</th>
                    <th className="p-3 text-left">Asset Name</th>
                    <th className="p-3 text-right">Qty</th>
                    <th className="p-3 text-left">Allocated To</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Allocated Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3">{r.asset?.sku}</td>
                      <td className="p-3 font-medium">{r.asset?.name}</td>
                      <td className="p-3 text-right">{r.quantity}</td>
                      <td className="p-3">{r.employee?.name}</td>
                      <td className="p-3">{r.status}</td>
                      <td className="p-3">{r.allocatedDate}</td>
                      <td className="p-3 text-right">
                        <DropdownMenu
                          open={openAllocationMenuId === r.id}
                          onOpenChange={(open) =>
                            setOpenAllocationMenuId(open ? r.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for allocation ${r.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={6}
                            className="z-[60] min-w-36"
                          >
                            <DropdownMenuItem
                              onSelect={() => setDeallocateTarget(r)}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Deallocate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td
                        className="p-6 text-center text-muted-foreground"
                        colSpan={7}
                      >
                        No asset allocations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {allocations.isFetching && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/25" role="status" aria-label="Loading allocated assets">
                  <span className="flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading allocated assets
                  </span>
                </div>
              )}
            </CardContent>
            <DataPagination
              currentPage={allocationPage}
              pageSize={allocationPageSize}
              totalCount={Number(allocationPagination.totalCount) || 0}
              totalPages={Number(allocationPagination.totalPages) || 0}
              loading={allocations.isFetching}
              onPageChange={setAllocationPage}
              onPageSizeChange={(size) => {
                setAllocationPageSize(size);
                setAllocationPage(1);
              }}
            />
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog
        open={formOpen}
        onOpenChange={(open) => (open ? setFormOpen(true) : closeForm())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${editing.name}` : "Add Asset"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="SKU">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                min="1"
                value={form.totalQuantity}
                onChange={(e) =>
                  setForm({ ...form, totalQuantity: e.target.value })
                }
              />
            </Field>
            <Field label="Purchase value">
              <Input
                type="number"
                min="0"
                value={form.purchaseValue}
                onChange={(e) =>
                  setForm({ ...form, purchaseValue: e.target.value })
                }
              />
            </Field>
            <Field label="Purchase date">
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm({ ...form, purchaseDate: e.target.value })
                }
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Under Maintenance">
                    Under Maintenance
                  </SelectItem>
                  <SelectItem value="Retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Image">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => readImage(e.target.files?.[0])}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() => (editing ? update.mutate() : create.mutate())}
              disabled={create.isPending || update.isPending}
            >
              {editing ? "Save Changes" : "Save Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Employee">
              <Select
                value={allocation.employeeId}
                onValueChange={(employeeId) =>
                  setAllocation({ ...allocation, employeeId })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employeeRows.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name} {e.employeeCode ? `(${e.employeeCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={`Quantity (available: ${selected?.availableQuantity ?? 0})`}
            >
              <Input
                type="number"
                min="1"
                max={selected?.availableQuantity}
                value={allocation.quantity}
                onChange={(e) =>
                  setAllocation({ ...allocation, quantity: e.target.value })
                }
              />
            </Field>
            <Field label="Allocation date">
              <Input
                type="date"
                value={allocation.allocatedDate}
                onChange={(e) =>
                  setAllocation({
                    ...allocation,
                    allocatedDate: e.target.value,
                  })
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              onClick={() => allocate.mutate()}
              disabled={
                allocate.isPending ||
                !allocation.employeeId ||
                Number(allocation.quantity) <= 0 ||
                Number(allocation.quantity) >
                  Number(selected?.availableQuantity)
              }
            >
              Allocate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) =>
          !open && !remove.isPending && setDeleteTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!deallocateTarget}
        onOpenChange={(open) =>
          !open && !deallocate.isPending && setDeallocateTarget(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deallocate Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deallocate &quot;
              {deallocateTarget?.asset?.name}&quot; (
              {deallocateTarget?.asset?.sku}) from &quot;
              {deallocateTarget?.employee?.name}&quot;? Quantity:{" "}
              {deallocateTarget?.quantity}. This will return the allocated
              quantity to available inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deallocate.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deallocate.mutate()}
              disabled={deallocate.isPending}
            >
              {deallocate.isPending ? "Deallocating..." : "Deallocate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!qr} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asset QR Code</DialogTitle>
          </DialogHeader>
          {qr && (
            <img
              className="mx-auto"
              width="220"
              height="220"
              alt={`QR code for ${qr.sku}`}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr.qrPayload)}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
