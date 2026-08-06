import { useState } from "react";
import {
  getListContactsQueryKey,
  useCreateContact,
  useDeleteContact,
  useListContacts,
  useUpdateContact,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Plus, Pencil, Trash2, MoreVertical, Building2, Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

type ContactType = "client" | "vendor" | "other";

interface Contact {
  id: number;
  type: ContactType;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const TYPE_LABELS: Record<ContactType, string> = {
  client: "Client",
  vendor: "Vendor",
  other: "Other",
};

const TYPE_COLORS: Record<ContactType, string> = {
  client: "bg-primary/10 text-primary border-primary/20",
  vendor: "bg-amber-50 text-amber-700 border-amber-200",
  other: "bg-muted text-muted-foreground border-border",
};

const EMPTY_FORM: Omit<Contact, "id"> = {
  type: "client",
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function CRMPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError } = useListContacts();
  const contacts = data as Contact[];
  const [tab, setTab] = useState<ContactType | "all">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<Omit<Contact, "id">>({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const refreshContacts = () => queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() });
  const createContact = useCreateContact({
    mutation: {
      onSuccess: () => {
        refreshContacts();
        setDialogOpen(false);
        toast.success("Contact added");
      },
      onError: () => toast.error("Could not add contact"),
    },
  });
  const updateContact = useUpdateContact({
    mutation: {
      onSuccess: () => {
        refreshContacts();
        setDialogOpen(false);
        toast.success("Contact updated");
      },
      onError: () => toast.error("Could not update contact"),
    },
  });
  const deleteContact = useDeleteContact({
    mutation: {
      onSuccess: () => {
        refreshContacts();
        setDeleteId(null);
        toast.success("Contact deleted");
      },
      onError: () => toast.error("Could not delete contact"),
    },
  });

  const filtered = contacts.filter((c) => {
    const matchesTab = tab === "all" || c.type === tab;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  const counts: Record<string, number> = {
    all: contacts.length,
    client: contacts.filter((c) => c.type === "client").length,
    vendor: contacts.filter((c) => c.type === "vendor").length,
    other: contacts.filter((c) => c.type === "other").length,
  };

  const openNew = () => {
    setEditContact(null);
    setForm({ ...EMPTY_FORM, type: tab === "all" ? "client" : tab });
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditContact(c);
    setForm({ type: c.type, name: c.name, company: c.company, phone: c.phone, email: c.email, address: c.address, notes: c.notes });
    setDialogOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editContact) {
      updateContact.mutate({ id: editContact.id, data: form });
    } else {
      createContact.mutate({ data: form });
    }
  };

  const handleDelete = () => {
    if (deleteId == null) return;
    deleteContact.mutate({ id: deleteId });
  };

  const TABS: Array<{ value: ContactType | "all"; label: string }> = [
    { value: "all", label: "All Contacts" },
    { value: "client", label: "Clients" },
    { value: "vendor", label: "Vendors" },
    { value: "other", label: "Other" },
  ];

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">CRM</h1>
              
            </div>
          </div>
          <Button onClick={openNew} className="rounded-sm h-10 px-4 shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Add Contact
          </Button>
        </div>

        {/* Tab bar + search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-1 bg-muted/40 p-1 rounded-sm border border-border">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  tab === t.value
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-mono rounded px-1 ${tab === t.value ? "bg-white/20" : "bg-muted-foreground/15"}`}>
                  {counts[t.value]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1 sm:max-w-xs">
            <Input
              placeholder="Search by name, company, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-sm h-9 text-sm"
            />
          </div>
        </div>

        {/* Contacts table */}
        <Card className="rounded-sm border-border shadow-md">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">Loading contacts...</div>
            ) : isError ? (
              <div className="py-20 text-center text-sm text-destructive">Could not load contacts. Please try again.</div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground space-y-3">
                <Users className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm">
                  {contacts.length === 0
                    ? "No contacts yet. Add your first client or vendor."
                    : "No contacts match your search."}
                </p>
                {contacts.length === 0 && (
                  <Button variant="outline" size="sm" className="rounded-sm" onClick={openNew}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Company / Org</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Address</th>
                      <th className="px-4 py-3 font-semibold">Notes</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                              {c.name.charAt(0)}
                            </div>
                            {c.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={`rounded-sm text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 border ${TYPE_COLORS[c.type]}`}
                          >
                            {TYPE_LABELS[c.type]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.company ? (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {c.company}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {c.phone ? (
                            <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                              <Phone className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {c.phone}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                              <Mail className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {c.email}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                          {c.address ? (
                            <span className="flex items-center gap-1.5" title={c.address}>
                              <MapPin className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{c.address}</span>
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate" title={c.notes}>
                          {c.notes || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(c)}>
                                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteId(c.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-lg">
          <DialogHeader>
            <DialogTitle>{editContact ? `Edit — ${editContact.name}` : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name <span className="text-destructive">*</span></Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact Type</Label>
                <select
                  className="w-full h-10 rounded-sm border border-border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ContactType })}
                >
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company / Organisation</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Optional"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Phone</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX"
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street, City, State"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes…"
                  className="rounded-sm min-h-[64px]"
                />
              </div>
            </div>
            <DialogFooter className="pt-1">
              <Button variant="outline" type="button" className="rounded-sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-sm" disabled={createContact.isPending || updateContact.isPending}>
                {createContact.isPending || updateContact.isPending ? "Saving..." : editContact ? "Update Contact" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="rounded-sm shadow-xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">This will permanently remove the contact from the directory.</p>
          <DialogFooter className="pt-4">
            <Button variant="outline" className="rounded-sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" className="rounded-sm" onClick={handleDelete} disabled={deleteContact.isPending}>
              {deleteContact.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
