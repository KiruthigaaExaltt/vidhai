import { useRef, useState } from "react";
import {
  getListContactsQueryKey,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from "@workspace/api-client-react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { DataPagination } from "@/components/ui/data-pagination";
import { Shell } from "@/components/layout/Shell";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Search } from "lucide-react";
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
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  MoreVertical,
  Building2,
  Phone,
  Mail,
  MapPin,
  Download,
  FileDown,
  FileUp,
} from "lucide-react";
import { toast } from "sonner";

type ContactType = "client" | "vendor" | "other";

interface Contact {
  id: number;
  type: ContactType;
  contactCode: string;
  name: string;
  company: string;
  phone: string;
  whatsappNumber: string;
  gstin: string;
  stateCode: string;
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
  contactCode: "",
  name: "",
  company: "",
  phone: "",
  whatsappNumber: "",
  gstin: "",
  stateCode: "",
  email: "",
  address: "",
  notes: "",
};

export default function CRMPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<ContactType | "all">("all");
  const [search, setSearch] = useState("");
  const [paginationStates, setPaginationStates] = useState<
    Record<string, { page: number; size: number }>
  >({});
  const paginationState = paginationStates[tab] ?? { page: 1, size: 15 };
  const setPagination = (next: Partial<typeof paginationState>) =>
    setPaginationStates((current) => ({
      ...current,
      [tab]: { ...(current[tab] ?? paginationState), ...next },
    }));
  const contactsQuery = useQuery({
    queryKey: [
      ...getListContactsQueryKey(),
      tab,
      search,
      paginationState.page,
      paginationState.size,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        type: tab,
        search,
        skip: String((paginationState.page - 1) * paginationState.size),
        limit: String(paginationState.size),
      });
      const response = await fetch(`/api/contacts?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load contacts");
      return response.json();
    },
    placeholderData: keepPreviousData,
  });
  const contacts = (contactsQuery.data?.data ?? []) as Contact[];
  const { isLoading, isError, isFetching } = contactsQuery;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<Omit<Contact, "id">>({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshContacts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getListContactsQueryKey(),
        refetchType: "active",
      }),
      queryClient.invalidateQueries({
        queryKey: ["get", "/api/flex/master-data"],
        refetchType: "active",
      }),
    ]);
  };
  const createContact = useCreateContact({
    mutation: {
      onSuccess: () => {
        refreshContacts();
        setDialogOpen(false);
        toast.success("Contact added");
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not add contact",
        ),
    },
  });
  const updateContact = useUpdateContact({
    mutation: {
      onSuccess: () => {
        refreshContacts();
        setDialogOpen(false);
        toast.success("Contact updated");
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not update contact",
        ),
    },
  });
  const deleteContact = useDeleteContact({
    mutation: {
      onSuccess: async () => {
        await refreshContacts();
        setDeleteId(null);
        toast.success("Contact deleted");
      },
      onError: (error) =>
        toast.error(
          error instanceof Error ? error.message : "Could not delete contact",
        ),
    },
  });

  const filtered = contacts;

  const counts: Record<string, number> = {
    all: Number(contactsQuery.data?.counts?.all || 0),
    client: Number(contactsQuery.data?.counts?.client || 0),
    vendor: Number(contactsQuery.data?.counts?.vendor || 0),
    other: Number(contactsQuery.data?.counts?.other || 0),
  };

  const openNew = () => {
    if (!can("crm.contacts.create")) return;
    setEditContact(null);
    setForm({ ...EMPTY_FORM, type: tab === "all" ? "client" : tab });
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    if (!can("crm.contacts.update")) return;
    setEditContact(c);
    setForm({
      type: c.type,
      contactCode: c.contactCode || "",
      name: c.name,
      company: c.company,
      phone: c.phone,
      whatsappNumber: c.whatsappNumber || "",
      gstin: c.gstin || "",
      stateCode: c.stateCode || "",
      email: c.email,
      address: c.address,
      notes: c.notes,
    });
    setDialogOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editContact) {
      updateContact.mutate({ id: editContact.id, data: form });
    } else {
      createContact.mutate({ data: form });
    }
  };

  const handleDelete = () => {
    if (!can("crm.contacts.delete")) return;
    if (deleteId == null) return;
    deleteContact.mutate({ id: deleteId });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        type: tab,
        search,
        skip: "0",
        limit: "10000",
      });
      const res = await fetch(`/api/contacts?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch contacts for export");
      const json = await res.json();
      const exportList: Contact[] = json.data || [];
      if (!exportList.length) {
        toast.info("No contacts to export");
        return;
      }
      const XLSX = await import("xlsx");
      const rows = exportList.map((c) => ({
        "Name *": c.name || "",
        "Contact Type *": TYPE_LABELS[c.type] || c.type,
        "Company / Organisation": c.company || "",
        Phone: c.phone || "",
        Email: c.email || "",
        "WhatsApp Number": c.whatsappNumber || "",
        GSTIN: c.gstin || "",
        "GST State Code": c.stateCode || "",
        Address: c.address || "",
        Notes: c.notes || "",
        "Contact Code": c.contactCode || "",
      }));
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 25 },
        { wch: 18 },
        { wch: 25 },
        { wch: 16 },
        { wch: 25 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 },
        { wch: 35 },
        { wch: 30 },
        { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `contacts-${tab}-${today}.xlsx`);
      toast.success(`Exported ${exportList.length} contact(s)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to export contacts");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const ExcelJS = await import("exceljs");
      const WorkbookClass = (ExcelJS as any).Workbook || (ExcelJS as any).default?.Workbook;
      const workbook = new WorkbookClass();
      const worksheet = workbook.addWorksheet("Contacts Template");

      worksheet.columns = [
        { header: "Name *", key: "name", width: 25 },
        { header: "Contact Type *", key: "type", width: 18 },
        { header: "Company / Organisation", key: "company", width: 25 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Email", key: "email", width: 25 },
        { header: "WhatsApp Number", key: "whatsapp", width: 18 },
        { header: "GSTIN", key: "gstin", width: 18 },
        { header: "GST State Code", key: "stateCode", width: 15 },
        { header: "Address", key: "address", width: 35 },
        { header: "Notes", key: "notes", width: 30 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle" };
      headerRow.height = 24;

      // Add dropdown validation for Contact Type column (B) for rows 2 to 1000
      for (let r = 2; r <= 1000; r++) {
        worksheet.getCell(`B${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Client,Vendor,Other"'],
          showErrorMessage: true,
          errorTitle: "Invalid Contact Type",
          error: "Please select Client, Vendor, or Other from the dropdown list",
        };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts-template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Contacts template downloaded");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate template");
    }
  };

  const parseImportFile = async (file?: File | null) => {
    if (!file) return;
    setImportFileName(file.name);
    setImportError("");
    setImportRows([]);
    if (!/\.xlsx$/i.test(file.name)) {
      setImportError("Please select an Excel .xlsx file");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      if (!worksheet) {
        setImportError("No sheets found in Excel file");
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });
      if (!rawRows.length) {
        setImportError("The Excel sheet is empty");
        return;
      }

      const mapped = rawRows
        .map((r: any) => {
          const typeKey = Object.keys(r).find((k) => /type/i.test(k));
          const nameKey = Object.keys(r).find((k) => /^name/i.test(k) || /party/i.test(k) || /contact\s*name/i.test(k));
          const companyKey = Object.keys(r).find((k) => /company/i.test(k) || /org/i.test(k));
          const phoneKey = Object.keys(r).find((k) => /^phone/i.test(k) || /mobile/i.test(k));
          const whatsappKey = Object.keys(r).find((k) => /whats/i.test(k));
          const gstinKey = Object.keys(r).find((k) => /gstin/i.test(k) || (/gst/i.test(k) && !/state/i.test(k)));
          const stateKey = Object.keys(r).find((k) => /state/i.test(k));
          const emailKey = Object.keys(r).find((k) => /mail/i.test(k));
          const addressKey = Object.keys(r).find((k) => /addr/i.test(k));
          const notesKey = Object.keys(r).find((k) => /note/i.test(k) || /remark/i.test(k));

          const rawType = String(r[typeKey || "Type"] || "").trim().toLowerCase();
          const normType = rawType === "vendor" ? "vendor" : rawType === "other" ? "other" : "client";

          return {
            type: normType,
            name: String(r[nameKey || "Name"] || "").trim(),
            company: String(r[companyKey || "Company"] || "").trim(),
            phone: String(r[phoneKey || "Phone"] || "").trim(),
            whatsappNumber: String(r[whatsappKey || "WhatsApp"] || "").trim(),
            gstin: String(r[gstinKey || "GSTIN"] || "").trim().toUpperCase(),
            stateCode: String(r[stateKey || "State Code"] || "").trim(),
            email: String(r[emailKey || "Email"] || "").trim(),
            address: String(r[addressKey || "Address"] || "").trim(),
            notes: String(r[notesKey || "Notes"] || "").trim(),
          };
        })
        .filter((r) => r.name.length > 0);

      if (!mapped.length) {
        setImportError("No valid rows found. Each contact must have a Name.");
        return;
      }
      setImportRows(mapped);
    } catch (err: any) {
      setImportError(err.message || "Failed to read Excel file");
    }
  };

  const submitImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    setImportError("");
    try {
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: importRows }),
      });
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || "Failed to import contacts");
      }
      const result = await response.json();
      await refreshContacts();
      setImportDialogOpen(false);
      setImportRows([]);
      setImportFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(`Imported ${result.created || importRows.length} contact(s) successfully`);
      if (result.errors?.length) {
        toast.warning(`${result.errors.length} row(s) had warnings or skipped`);
      }
    } catch (err: any) {
      setImportError(err.message || "Failed to import contacts");
      toast.error(err.message || "Failed to import contacts");
    } finally {
      setImporting(false);
    }
  };

  const TABS: Array<{ value: ContactType | "all"; label: string }> = [
    { value: "all", label: "All Contacts" },
    { value: "client", label: "Clients" },
    { value: "vendor", label: "Vendors" },
    { value: "other", label: "Other" },
  ];

  return (
    <Shell>
      <div className="min-w-0 w-full space-y-6 p-4 sm:p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
                CRM
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {can("crm.contacts.create") && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setImportDialogOpen(true);
                  setImportRows([]);
                  setImportFileName("");
                  setImportError("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="h-9 px-3 gap-1.5 border-primary bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-colors font-medium text-xs sm:text-sm shadow-xs"
              >
                <FileUp className="h-4 w-4 shrink-0" />
                <span>Import</span>
              </Button>
            )}
            {can("crm.contacts.view") && (
              <Button
                type="button"
                variant="outline"
                disabled={exporting}
                onClick={() => void handleExport()}
                className="h-9 px-3 gap-1.5 border-primary bg-background text-foreground hover:bg-primary hover:text-primary-foreground transition-colors font-medium text-xs sm:text-sm shadow-xs"
              >
                <FileDown className="h-4 w-4 shrink-0" />
                <span>{exporting ? "Exporting..." : "Export"}</span>
              </Button>
            )}
            {can("crm.contacts.create") && (
              <Button className="h-9 w-full sm:w-auto" onClick={openNew}>
                <Plus className="w-4 h-4 mr-2" /> Add Contact
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar + search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="w-full overflow-x-auto pb-1 sm:w-auto">
            <div className="flex min-w-max gap-1">
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
                  <span
                    className={`text-[10px] font-mono rounded px-1 ${tab === t.value ? "bg-white/20" : "bg-muted-foreground/15"}`}
                  >
                    {counts[t.value]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="relative w-full flex-1 sm:max-w-xs">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />

            <Input
              placeholder="Search by name, company, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination({ page: 1 });
              }}
              className="rounded-full h-11 pl-11 pr-5 text-sm border border-gray-300 transition-all duration-300 ease-in-out focus:scale-[1.02] focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
            />
          </div>
        </div>

        {/* Contacts table */}
        <Card className="rounded-sm border-border shadow-md">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-20 text-center text-sm text-muted-foreground">
                Loading contacts...
              </div>
            ) : isError ? (
              <div className="py-20 text-center text-sm text-destructive">
                Could not load contacts. Please try again.
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground space-y-3">
                <Users className="w-10 h-10 mx-auto opacity-20" />
                <p className="text-sm">
                  {contacts.length === 0
                    ? "No contacts yet. Add your first client or vendor."
                    : "No contacts match your search."}
                </p>
                {contacts.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-sm"
                    onClick={openNew}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Code</th>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Company / Org</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">WhatsApp</th>
                      <th className="px-4 py-3 font-semibold">GSTIN</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Address</th>
                      <th className="px-4 py-3 font-semibold">Notes</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {contacts.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {c.contactCode || "Pending"}
                        </td>
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
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {c.phone}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {c.whatsappNumber || "�"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {c.gstin || "�"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                            >
                              <Mail className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {c.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                          {c.address ? (
                            <span
                              className="flex items-center gap-1.5"
                              title={c.address}
                            >
                              <MapPin className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{c.address}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate"
                          title={c.notes}
                        >
                          {c.notes || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
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
          <DataPagination
            currentPage={paginationState.page}
            pageSize={paginationState.size}
            totalCount={Number(contactsQuery.data?.totalCount || 0)}
            totalPages={Number(contactsQuery.data?.totalPages || 0)}
            loading={isFetching}
            onPageChange={(page) => setPagination({ page })}
            onPageSizeChange={(size) => setPagination({ size, page: 1 })}
          />
        </Card>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-sm shadow-xl max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editContact ? `Edit — ${editContact.name}` : "Add Contact"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Code
                </Label>
                <Input
                  value={editContact ? form.contactCode || editContact.contactCode || "" : "Generated after save"}
                  readOnly
                  disabled
                  className="rounded-sm h-10 font-mono bg-muted/60 text-muted-foreground"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Contact Type
                </Label>
                <select
                  className="w-full h-10 rounded-sm border border-border bg-background px-3 text-sm"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as ContactType })
                  }
                >
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Company / Organisation
                </Label>
                <Input
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                  placeholder="Optional"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Phone
                </Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 XXXXX XXXXX"
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  WhatsApp Number
                </Label>
                <Input
                  type="tel"
                  value={form.whatsappNumber}
                  onChange={(e) =>
                    setForm({ ...form, whatsappNumber: e.target.value })
                  }
                  placeholder="+91 XXXXX XXXXX"
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  GSTIN
                </Label>
                <Input
                  value={form.gstin}
                  onChange={(e) =>
                    setForm({ ...form, gstin: e.target.value.toUpperCase() })
                  }
                  placeholder="GST identification number"
                  className="rounded-sm h-10 font-mono uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  GST State Code
                </Label>
                <Input
                  value={form.stateCode}
                  maxLength={2}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stateCode: e.target.value.replace(/\D/g, "").slice(0, 2),
                    })
                  }
                  placeholder="33"
                  className="rounded-sm h-10 font-mono"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Address
                </Label>
                <Input
                  value={form.address}
                  onChange={(e) =>
                    setForm({ ...form, address: e.target.value })
                  }
                  placeholder="Street, City, State"
                  className="rounded-sm h-10"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes…"
                  className="rounded-sm min-h-[64px]"
                />
              </div>
            </div>
            <DialogFooter className="pt-1">
              <Button
                variant="outline"
                type="button"
                className="rounded-sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-sm"
                disabled={createContact.isPending || updateContact.isPending}
              >
                {createContact.isPending || updateContact.isPending
                  ? "Saving..."
                  : editContact
                    ? "Update Contact"
                    : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog
        open={deleteId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <DialogContent className="rounded-sm shadow-xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">
            This will permanently remove the contact from the directory.
          </p>
          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              className="rounded-sm"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-sm"
              onClick={handleDelete}
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Contacts Modal */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setImportDialogOpen(false);
            setImportRows([]);
            setImportFileName("");
            setImportError("");
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between bg-card">
              <div>
                <p className="text-sm font-medium text-foreground">Download template</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the exact headers. Contact type can be Client, Vendor, or Other.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={importing}
                onClick={() => void downloadTemplate()}
                className="shrink-0 border-primary/40 hover:border-primary hover:bg-primary/5 text-foreground"
              >
                <Download className="mr-2 h-4 w-4" /> Download Template
              </Button>
            </div>

            <div className="rounded-md border p-4 bg-card">
              <Label className="text-sm font-medium text-foreground">Upload .xlsx file</Label>
              <Input
                ref={fileInputRef}
                className="mt-2 cursor-pointer"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={importing}
                onChange={(e) => void parseImportFile(e.target.files?.[0])}
              />
              {importFileName && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {importFileName} &mdash;{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {importRows.length} row(s) ready to import
                  </span>
                </p>
              )}
              {importError && (
                <div className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {importError}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => setImportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={importing || !importRows.length}
              onClick={() => void submitImport()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}
