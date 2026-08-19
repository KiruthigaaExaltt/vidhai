import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Send,
  Save,
  FileText,
  Trash2,
  Plus,
  Truck,
  RotateCcw,
  History,
  ChevronDown,
  Download,
  Printer,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  buildSalesPdfBlob,
  downloadSalesPdf,
  prepareSalesPdfInput,
  type SalesPdfInput,
} from "../utils/salesPdf";

interface SalesDocumentFormProps {
  type: string;
  onCancel: () => void;
  onSaved?: (document: any) => void;
  documentId?: number | null;
}

function numericValue(value: any): number {
  const parsed = Number(
    value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SalesDocumentForm({
  type,
  onCancel,
  onSaved,
  documentId,
}: SalesDocumentFormProps) {
  const lineItemsScrollRef = useRef<HTMLDivElement>(null);
  const documentResource =
    type === "Proforma Invoice"
      ? "proforma-invoices"
      : type === "Delivery Challan"
        ? "challans"
        : type === "Invoices"
          ? "invoices"
          : type === "Sales Return"
            ? "returns"
            : "quotations";
  const documentLabel =
    type === "Proforma Invoice"
      ? "Proforma invoice"
      : type === "Delivery Challan"
        ? "Delivery challan"
        : type === "Invoices"
          ? "Invoice"
          : type === "Sales Return"
            ? "Sales return"
            : "Quotation";
  const [viewDocumentId, setViewDocumentId] = useState<number | null>(
    documentId || null,
  );

  const [items, setItems] = useState<any[]>([
    {
      id: 1,
      description: "",
      hsn: "",
      qty: 1,
      returnedQty: 0,
      uom: "Nos",
      rate: 0,
      cgst: 9,
      sgst: 9,
      warehouse: "",
      itemId: null,
      serviceId: null,
    },
  ]);

  useEffect(() => {
    lineItemsScrollRef.current?.scrollTo({ left: 0 });
  }, [type, items.length]);

  const [transportCharges, setTransportCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);

  const [clients, setClients] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [placeOfSupply, setPlaceOfSupply] = useState<string>("");
  const [companyStateCode, setCompanyStateCode] = useState<string>("");
  const [customerMobile, setCustomerMobile] = useState<string>("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState<string>("");
  const [clientDetails, setClientDetails] = useState({
    company: "",
    address: "",
    phone: "",
    whatsappNumber: "",
    gstin: "",
  });
  const [docDate, setDocDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branch, setBranch] = useState("");
  const [terms, setTerms] = useState("");
  const [organizationBranding, setOrganizationBranding] = useState<any>({});

  const [billingDetails, setBillingDetails] = useState({
    name: "",
    address: "",
    gstin: "",
    contactNumber: "",
  });

  const [availableQuotations, setAvailableQuotations] = useState<any[]>([]);
  const [availableProformas, setAvailableProformas] = useState<any[]>([]);
  const [availableChallans, setAvailableChallans] = useState<any[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<string[]>([]);
  const [selectedPiId, setSelectedPiId] = useState<string>("");
  const [selectedPiIds, setSelectedPiIds] = useState<string[]>([]);
  const [selectedDcIds, setSelectedDcIds] = useState<string[]>([]);
  const [availableInvoices, setAvailableInvoices] = useState<any[]>([]);
  const [selectedReturnInvoiceId, setSelectedReturnInvoiceId] =
    useState<string>("");
  const [selectedReturnDcId, setSelectedReturnDcId] = useState<string>("");
  const [autoCreatedFromQuotationId, setAutoCreatedFromQuotationId] = useState<
    number | null
  >(null);

  useEffect(() => {
    fetch("/api/sales/clients", {
      credentials: "include",
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Unable to load CRM clients");
        return body;
      })
      .then((body) => {
        const contacts = Array.isArray(body) ? body : body.data || [];
        setClients(
          contacts.filter(
            (contact: any) =>
              String(contact.type || "").toLowerCase() === "client",
          ),
        );
      })
      .catch((err) => console.error("Error loading clients:", err));
    fetch("/api/inventory", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => ({}))).error ||
              "Unable to load inventory",
          );
        return res.json();
      })
      .then((data) => setInventoryItems(data))
      .catch((err) => console.error("Error loading inventory:", err));
    fetch("/api/services")
      .then((res) => res.json())
      .then((data) => setServices(data))
      .catch((err) => console.error("Error loading services:", err));
    fetch("/api/vault/locations", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then(setWarehouses)
      .catch((err) => console.error("Error loading warehouses:", err));
    if (
      type === "Proforma Invoice" ||
      type === "Delivery Challan" ||
      type === "Invoices"
    ) {
      fetch("/api/sales/quotations", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setAvailableQuotations(
            data.filter(
              (quote: any) =>
                quote.status === "Approved" || quote.status === "Confirmed",
            ),
          ),
        )
        .catch((err) =>
          console.error("Error loading approved/confirmed quotations:", err),
        );
    }
    if (type === "Delivery Challan" || type === "Invoices") {
      fetch("/api/sales/proforma-invoices", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setAvailableProformas(
            data.filter(
              (doc: any) =>
                doc.status === "Approved" || doc.status === "Confirmed",
            ),
          ),
        )
        .catch((err) =>
          console.error("Error loading approved Proforma invoices:", err),
        );
    }
    if (type === "Invoices") {
      fetch("/api/sales/challans", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setAvailableChallans(
            data.filter((doc: any) => doc.status === "Dispatched"),
          ),
        )
        .catch((err) =>
          console.error("Error loading dispatched Delivery Challans:", err),
        );
    }
    if (type === "Sales Return") {
      fetch("/api/sales/invoices", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setAvailableInvoices(
            data.filter((doc: any) =>
              ["Approved", "Paid"].includes(doc.status),
            ),
          ),
        )
        .catch((err) =>
          console.error("Error loading returnable invoices:", err),
        );
      fetch("/api/sales/challans", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setAvailableChallans(
            data.filter((doc: any) => doc.status === "Dispatched"),
          ),
        )
        .catch((err) =>
          console.error("Error loading returnable challans:", err),
        );
    }
    fetch("/api/organization-settings", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => ({}))).error ||
              "Unable to load organization details",
          );
        return res.json();
      })
      .then((data) => {
        if (data) {
          setOrganizationBranding(data);
          setBillingDetails({
            name: data.companyName || "",
            address: data.companyAddress || "",
            gstin: data.gstin || "",
            contactNumber: data.salesContactNo || "",
          });
          setBankName(data.bankName || "");
          setAccountNumber(data.accountNumber || "");
          setIfscCode(data.ifscCode || "");
          setBranch(data.branch || "");
          setCompanyStateCode(String(data.companyStateCode || "27").trim());
          setTerms((data.termsAndConditions || []).join("\n"));
        }
      })
      .catch((err) =>
        console.error("Error loading organization details:", err),
      );
  }, []);

  useEffect(() => {
    setViewDocumentId(documentId || null);
  }, [documentId]);

  useEffect(() => {
    if (!viewDocumentId) return;
    fetch(`/api/sales/${documentResource}/${viewDocumentId}`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            (await response.json().catch(() => ({}))).error ||
              `Unable to load ${documentLabel.toLowerCase()}`,
          );
        return response.json();
      })
      .then((document) => {
        setSavedDocumentId(Number(document.id));
        setQuotationNumber(
          document.returnNumber ||
            document.invoiceNumber ||
            document.dcNumber ||
            document.piNumber ||
            document.quotationNumber ||
            document.quoteNumber ||
            "Draft",
        );
        setStatus(document.status || "Draft");
        setClientId(String(document.clientId || ""));
        setClientName(document.clientName || "");
        setCustomerMobile(document.customerMobile || "");
        setCustomerWhatsapp(
          document.customerWhatsappNumber || document.customerMobile || "",
        );
        setClientDetails({
          company: document.customerCompany || "",
          address: document.customerAddress || "",
          phone: document.customerMobile || "",
          whatsappNumber: document.customerWhatsappNumber || "",
          gstin: document.customerGstin || "",
        });
        const mappedQuoteIds = (
          document.quotationIds ||
          document.quoteIds ||
          (document.quoteId ? [document.quoteId] : [])
        ).map(String);
        setSelectedQuoteIds(mappedQuoteIds);
        setSelectedQuoteId(mappedQuoteIds[0] || "");
        const mappedPiIds = (
          document.piIds || (document.piId ? [document.piId] : [])
        ).map(String);
        setSelectedPiIds(mappedPiIds);
        setSelectedPiId(mappedPiIds[0] || "");
        setSelectedDcIds(
          (document.dcIds || (document.dcId ? [document.dcId] : [])).map(
            String,
          ),
        );
        setSelectedReturnInvoiceId(String(document.invoiceId || ""));
        setSelectedReturnDcId(String(document.dcId || ""));
        setPlaceOfSupply(document.placeOfSupply || "");
        setDocDate(
          String(
            document.returnDate ||
              document.invoiceDate ||
              document.dcDate ||
              document.piDate ||
              document.proformaDate ||
              document.quotationDate ||
              "",
          ).slice(0, 10),
        );
        setValidUntil(
          String(document.dueDate || document.validUntil || "").slice(0, 10),
        );
        setBankName(document.bankName || "");
        setAccountNumber(document.accountNumber || "");
        setIfscCode(document.ifscCode || "");
        setBranch(document.branch || "");
        setTerms((current) => document.terms || current);
        setBillingDetails({
          name: document.billedByCompanyName || "",
          address: document.billedByAddress || "",
          gstin: document.billedByGstin || "",
          contactNumber: document.billedByContactNumber || "",
        });
        setDiscountAmount(numericValue(document.discountAmount));
        setItems(
          (document.items || []).map((line: any) => {
            const igstHalf = numericValue(line.igstPercent) / 2;
            return {
              id: line.id,
              itemId: line.itemId == null ? null : Number(line.itemId),
              productId: line.productId == null ? null : Number(line.productId),
              serviceId: line.serviceId == null ? null : Number(line.serviceId),
              inventoryId: null,
              description: line.description || line.productName || "",
              hsn: line.hsnSac || "",
              qty: numericValue(line.invoicedQty ?? line.quantity),
              returnedQty: numericValue(line.returnedQty),
              uom: line.uom || "Nos",
              rate: numericValue(line.rate),
              cgst: numericValue(line.cgstPercent) || igstHalf,
              sgst: numericValue(line.sgstPercent) || igstHalf,
              warehouseId:
                line.warehouseId == null ? null : Number(line.warehouseId),
              warehouse: line.warehouseName || "",
              itemType: line.itemType,
              lineSource: line.lineSource,
              invoiceItemId: line.invoiceItemId,
            };
          }),
        );
        if (type !== "Delivery Challan" && type !== "Sales Return")
          void loadVersions(Number(document.id));
      })
      .catch((error) =>
        setFeedback({
          title: `Unable to load ${documentLabel.toLowerCase()}`,
          message: error.message,
        }),
      );
  }, [viewDocumentId, documentResource, documentLabel]);

  const unresolvedItemKey = items
    .filter((line) => line.itemId && !line.inventoryId)
    .map((line) => `${line.id}:${line.itemId}:${line.warehouseId || ""}`)
    .join("|");

  useEffect(() => {
    if (!inventoryItems.length || !unresolvedItemKey) return;
    setItems((current) => {
      let changed = false;
      const resolved = current.map((line) => {
        if (!line.itemId || line.inventoryId) return line;
        const matchingProduct = inventoryItems.filter(
          (entry) => Number(entry.materialId) === Number(line.itemId),
        );
        const inventory =
          matchingProduct.find(
            (entry) =>
              !line.warehouseId ||
              Number(entry.locationId) === Number(line.warehouseId),
          ) || matchingProduct[0];
        if (!inventory) return line;
        changed = true;
        return {
          ...line,
          inventoryId: Number(inventory.id),
          description: line.description || inventory.materialName || "",
          warehouseId: line.warehouseId || inventory.locationId || null,
          warehouse: line.warehouse || inventory.locationName || "",
        };
      });
      return changed ? resolved : current;
    });
  }, [inventoryItems, unresolvedItemKey]);

  const isQuotation = type === "Quotation";
  const isProforma = type === "Proforma Invoice";
  const isChallan = type === "Delivery Challan";
  const isInvoice = type === "Invoices";
  const isReturn = type === "Sales Return";

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now(),
        description: "",
        hsn: "",
        qty: 1,
        returnedQty: 0,
        uom: "Nos",
        rate: 0,
        cgst: 9,
        sgst: 9,
        warehouse: "",
        itemId: null,
        serviceId: null,
      },
    ]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (
    id: number,
    fieldOrUpdates: string | Record<string, any>,
    value?: string | number,
  ) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          if (typeof fieldOrUpdates === "object") {
            return { ...item, ...fieldOrUpdates };
          }
          return { ...item, [fieldOrUpdates]: value };
        }
        return item;
      }),
    );
  };

  const [savedDocumentId, setSavedDocumentId] = useState<number | null>(null);
  const [quotationNumber, setQuotationNumber] = useState<string>("Draft");
  const [status, setStatus] = useState<string>("Draft");
  const [versions, setVersions] = useState<any[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [responseAction, setResponseAction] = useState<
    "confirm" | "reject" | null
  >(null);
  const [sendMessage, setSendMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    title: string;
    message: string;
    success?: boolean;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const isInterState = Boolean(
    companyStateCode && placeOfSupply && companyStateCode !== placeOfSupply,
  );
  const isLocked = [
    "Approved",
    "Rejected",
    "Dispatched",
    "Received",
    "Credit Issued",
    "Paid",
    "Cancelled",
  ].includes(status);

  const loadVersions = async (quotationId: number) => {
    const response = await fetch(
      `/api/sales/${documentResource}/${quotationId}/versions`,
      { credentials: "include" },
    );
    if (response.ok) setVersions((await response.json()).data || []);
  };

  const handleCustomerResponse = async (action: "confirm" | "reject") => {
    if (
      !savedDocumentId ||
      (isReturn ? status !== "Confirmed" : status !== "Sent")
    )
      return;
    const response = await fetch(
      `/api/sales/${documentResource}/${savedDocumentId}/customer-response`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      return setFeedback({
        title: "Unable to update response",
        message: result.error || "Request failed",
      });
    setStatus(result.status);
    onSaved?.(result);
  };

  const confirmCustomerResponse = async () => {
    if (!responseAction) return;
    setSaving(true);
    try {
      await handleCustomerResponse(responseAction);
      setResponseAction(null);
    } finally {
      setSaving(false);
    }
  };

  const mapSalesSource = async (
    source: "quotation" | "proforma" | "challan",
    sourceId: string,
  ) => {
    if (source === "quotation") {
      setSelectedQuoteId(sourceId);
      setSelectedQuoteIds(sourceId ? [sourceId] : []);
      if (sourceId) {
        setSelectedPiId("");
        setSelectedPiIds([]);
        setSelectedDcIds([]);
      }
    } else if (source === "proforma") {
      setSelectedPiId(sourceId);
      setSelectedPiIds(sourceId ? [sourceId] : []);
      if (sourceId) {
        setSelectedQuoteId("");
        setSelectedQuoteIds([]);
        setSelectedDcIds([]);
      }
    } else {
      setSelectedDcIds(sourceId ? [sourceId] : []);
      if (sourceId) {
        setSelectedQuoteId("");
        setSelectedQuoteIds([]);
        setSelectedPiId("");
        setSelectedPiIds([]);
      }
    }
    if (!sourceId) {
      setItems([
        {
          id: Date.now(),
          description: "",
          hsn: "",
          qty: 1,
          returnedQty: 0,
          uom: "Nos",
          rate: 0,
          cgst: 9,
          sgst: 9,
          warehouse: "",
          itemId: null,
          serviceId: null,
        },
      ]);
      return;
    }
    try {
      const response = await fetch(
        `/api/sales/${source === "quotation" ? "quotations" : source === "proforma" ? "proforma-invoices" : "challans"}/${sourceId}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(`Unable to map ${source}`);
      const document = await response.json();
      setClientId(String(document.clientId || ""));
      setClientName(document.clientName || "");
      setCustomerMobile(document.customerMobile || "");
      setCustomerWhatsapp(
        document.customerWhatsappNumber || document.customerMobile || "",
      );
      setClientDetails({
        company: document.customerCompany || "",
        address: document.customerAddress || "",
        phone: document.customerMobile || "",
        whatsappNumber: document.customerWhatsappNumber || "",
        gstin: document.customerGstin || "",
      });
      setPlaceOfSupply(document.placeOfSupply || companyStateCode);
      setValidUntil(String(document.validUntil || "").slice(0, 10));
      setBankName(document.bankName || "");
      setAccountNumber(document.accountNumber || "");
      setIfscCode(document.ifscCode || "");
      setBranch(document.branch || "");
      setTerms((current) => document.terms || current);
      setBillingDetails({
        name: document.billedByCompanyName || billingDetails.name,
        address: document.billedByAddress || billingDetails.address,
        gstin: document.billedByGstin || billingDetails.gstin,
        contactNumber:
          document.billedByContactNumber || billingDetails.contactNumber,
      });
      setDiscountAmount(numericValue(document.discountAmount));
      setItems(
        (document.items || []).map((line: any) => {
          const igstHalf = numericValue(line.igstPercent) / 2;
          return {
            id: `mapped-${line.id}`,
            itemId: line.itemId == null ? null : Number(line.itemId),
            productId: line.productId == null ? null : Number(line.productId),
            serviceId: line.serviceId == null ? null : Number(line.serviceId),
            inventoryId: null,
            description: line.description || line.productName || "",
            hsn: line.hsnSac || "",
            qty: numericValue(line.quantity),
            returnedQty: 0,
            uom: line.uom || "Nos",
            rate: numericValue(line.rate),
            cgst: numericValue(line.cgstPercent) || igstHalf,
            sgst: numericValue(line.sgstPercent) || igstHalf,
            warehouseId:
              line.warehouseId == null ? null : Number(line.warehouseId),
            warehouse: line.warehouseName || "",
            itemType: line.itemType,
            lineSource: line.lineSource,
            quotationId: source === "quotation" ? Number(sourceId) : null,
            piId: source === "proforma" ? Number(sourceId) : null,
            dcId: source === "challan" ? Number(sourceId) : null,
          };
        }),
      );
    } catch (error: any) {
      setFeedback({ title: `Unable to map ${source}`, message: error.message });
    }
  };

  const mapQuotation = (quotationId: string) =>
    mapSalesSource("quotation", quotationId);

  const mapQuotations = async (quotationIds: string[]) => {
    const uniqueIds = [...new Set(quotationIds.filter(Boolean))];
    if (!uniqueIds.length) {
      await mapSalesSource("quotation", "");
      return;
    }
    try {
      const documents = await Promise.all(
        uniqueIds.map(async (id) => {
          const response = await fetch(`/api/sales/quotations/${id}`, {
            credentials: "include",
          });
          if (!response.ok) throw new Error(`Unable to load quotation #${id}`);
          return response.json();
        }),
      );
      const clientIds = [
        ...new Set(
          documents
            .map((document) => Number(document.clientId))
            .filter(Boolean),
        ),
      ];
      if (clientIds.length > 1)
        throw new Error(
          "All mapped quotations must belong to the same client.",
        );
      await mapSalesSource("quotation", uniqueIds[0]);
      const merged = new Map<string, any>();
      for (const document of documents)
        for (const line of document.items || []) {
          const itemId = line.itemId == null ? null : Number(line.itemId);
          const serviceId =
            line.serviceId == null ? null : Number(line.serviceId);
          const warehouseId =
            line.warehouseId == null ? null : Number(line.warehouseId);
          const key = serviceId
            ? `service-${serviceId}`
            : `item-${itemId}-warehouse-${warehouseId || 0}`;
          const existing = merged.get(key);
          if (existing) {
            existing.qty += numericValue(line.quantity);
            continue;
          }
          const igstHalf = numericValue(line.igstPercent) / 2;
          merged.set(key, {
            id: `mapped-${uniqueIds[0]}-${line.id}`,
            itemId,
            productId: line.productId == null ? itemId : Number(line.productId),
            serviceId,
            inventoryId: null,
            description: line.description || line.productName || "",
            hsn: line.hsnSac || "",
            qty: numericValue(line.quantity),
            returnedQty: 0,
            uom: line.uom || "Nos",
            rate: numericValue(line.rate),
            cgst: numericValue(line.cgstPercent) || igstHalf,
            sgst: numericValue(line.sgstPercent) || igstHalf,
            warehouseId,
            warehouse: line.warehouseName || "",
            itemType: line.itemType,
            lineSource: line.lineSource,
            quotationId: Number(uniqueIds[0]),
            quotationIds: [...uniqueIds.map(Number)],
          });
        }
      setSelectedQuoteIds(uniqueIds);
      setSelectedQuoteId(uniqueIds[0]);
      setSelectedPiId("");
      setSelectedPiIds([]);
      setSelectedDcIds([]);
      setItems([...merged.values()]);
    } catch (error: any) {
      setFeedback({
        title: "Unable to map quotations",
        message: error.message,
      });
    }
  };

  const mapInvoiceSources = async (
    source: "proforma" | "challan",
    sourceIds: string[],
  ) => {
    const uniqueIds = [...new Set(sourceIds.filter(Boolean))];
    if (!uniqueIds.length) {
      await mapSalesSource(source, "");
      if (source === "proforma") {
        setSelectedPiIds([]);
        setSelectedPiId("");
      } else setSelectedDcIds([]);
      return;
    }
    try {
      const resource = source === "proforma" ? "proforma-invoices" : "challans";
      const documents = await Promise.all(
        uniqueIds.map(async (id) => {
          const response = await fetch(`/api/sales/${resource}/${id}`, {
            credentials: "include",
          });
          if (!response.ok) throw new Error(`Unable to load ${source} #${id}`);
          return response.json();
        }),
      );
      const clientIds = [
        ...new Set(
          documents
            .map((document) => Number(document.clientId))
            .filter(Boolean),
        ),
      ];
      if (clientIds.length > 1)
        throw new Error("All mapped documents must belong to the same client.");
      await mapSalesSource(source, uniqueIds[0]);
      const merged = new Map<string, any>();
      for (
        let documentIndex = 0;
        documentIndex < documents.length;
        documentIndex++
      )
        for (const line of documents[documentIndex].items || []) {
          const itemId = line.itemId == null ? null : Number(line.itemId);
          const serviceId =
            line.serviceId == null ? null : Number(line.serviceId);
          const warehouseId =
            line.warehouseId == null ? null : Number(line.warehouseId);
          const key = serviceId
            ? `service-${serviceId}`
            : `item-${itemId}-warehouse-${warehouseId || 0}`;
          const existing = merged.get(key);
          if (existing) {
            existing.qty += numericValue(line.quantity);
            continue;
          }
          const igstHalf = numericValue(line.igstPercent) / 2;
          merged.set(key, {
            id: `mapped-${source}-${uniqueIds[documentIndex]}-${line.id}`,
            itemId,
            productId: line.productId == null ? itemId : Number(line.productId),
            serviceId,
            inventoryId: null,
            description: line.description || line.productName || "",
            hsn: line.hsnSac || "",
            qty: numericValue(line.quantity),
            returnedQty: 0,
            uom: line.uom || "Nos",
            rate: numericValue(line.rate),
            cgst: numericValue(line.cgstPercent) || igstHalf,
            sgst: numericValue(line.sgstPercent) || igstHalf,
            warehouseId,
            warehouse: line.warehouseName || "",
            itemType: line.itemType,
            lineSource: line.lineSource,
            piId:
              source === "proforma" ? Number(uniqueIds[documentIndex]) : null,
            dcId:
              source === "challan" ? Number(uniqueIds[documentIndex]) : null,
          });
        }
      setSelectedQuoteId("");
      setSelectedQuoteIds([]);
      if (source === "proforma") {
        setSelectedPiIds(uniqueIds);
        setSelectedPiId(uniqueIds[0]);
        setSelectedDcIds([]);
      } else {
        setSelectedDcIds(uniqueIds);
        setSelectedPiIds([]);
        setSelectedPiId("");
      }
      setItems([...merged.values()]);
    } catch (error: any) {
      setFeedback({
        title: `Unable to map ${source === "proforma" ? "Proforma invoices" : "Delivery Challans"}`,
        message: error.message,
      });
    }
  };

  const mapReturnSource = async (
    source: "invoice" | "challan",
    sourceId: string,
  ) => {
    if (source === "invoice") {
      setSelectedReturnInvoiceId(sourceId);
      if (sourceId) setSelectedReturnDcId("");
    } else {
      setSelectedReturnDcId(sourceId);
      if (sourceId) setSelectedReturnInvoiceId("");
    }
    if (!sourceId) {
      setItems([
        {
          id: Date.now(),
          description: "",
          hsn: "",
          qty: 1,
          returnedQty: 0,
          uom: "Nos",
          rate: 0,
          cgst: 9,
          sgst: 9,
          warehouse: "",
          itemId: null,
          serviceId: null,
        },
      ]);
      return;
    }
    try {
      const response = await fetch(
        `/api/sales/${source === "invoice" ? "invoices" : "challans"}/${sourceId}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(`Unable to load source ${source}`);
      const document = await response.json();
      setClientId(String(document.clientId || ""));
      setClientName(document.clientName || "");
      setCustomerMobile(document.customerMobile || "");
      setCustomerWhatsapp(
        document.customerWhatsappNumber || document.customerMobile || "",
      );
      setClientDetails({
        company: document.customerCompany || "",
        address: document.customerAddress || "",
        phone: document.customerMobile || "",
        whatsappNumber: document.customerWhatsappNumber || "",
        gstin: document.customerGstin || "",
      });
      setPlaceOfSupply(document.placeOfSupply || companyStateCode);
      setBankName(document.bankName || "");
      setAccountNumber(document.accountNumber || "");
      setIfscCode(document.ifscCode || "");
      setBranch(document.branch || "");
      setTerms((current) => document.terms || current);
      setBillingDetails({
        name: document.billedByCompanyName || billingDetails.name,
        address: document.billedByAddress || billingDetails.address,
        gstin: document.billedByGstin || billingDetails.gstin,
        contactNumber:
          document.billedByContactNumber || billingDetails.contactNumber,
      });
      setItems(
        (document.items || []).map((line: any) => {
          const sourceQty = numericValue(line.dispatchedQty || line.quantity);
          const alreadyReturnedQty =
            source === "invoice" ? numericValue(line.alreadyReturnedQty) : 0;
          const returnableQty =
            source === "invoice" ? numericValue(line.returnableQty) : sourceQty;
          const igstHalf = numericValue(line.igstPercent) / 2;
          return {
            id: `return-${source}-${sourceId}-${line.id}`,
            invoiceItemId: source === "invoice" ? Number(line.id) : null,
            itemId: line.itemId == null ? null : Number(line.itemId),
            productId: line.productId == null ? null : Number(line.productId),
            serviceId: line.serviceId == null ? null : Number(line.serviceId),
            inventoryId: null,
            description: line.description || line.productName || "",
            hsn: line.hsnSac || "",
            qty: sourceQty,
            alreadyReturnedQty,
            returnableQty,
            returnedQty: returnableQty,
            uom: line.uom || "Nos",
            rate: numericValue(line.rate),
            cgst: numericValue(line.cgstPercent) || igstHalf,
            sgst: numericValue(line.sgstPercent) || igstHalf,
            warehouseId:
              line.warehouseId == null ? null : Number(line.warehouseId),
            warehouse: line.warehouseName || "",
            itemType: line.itemType,
            lineSource: line.lineSource,
          };
        }),
      );
    } catch (error: any) {
      setFeedback({
        title: "Unable to map Sales Return source",
        message: error.message,
      });
    }
  };

  const handleSave = async (forSend: boolean, openWhatsApp = false) => {
    if (!clientId) {
      setFeedback({
        title: "Customer required",
        message: "Please select a client first.",
      });
      return;
    }
    const normalizedWhatsapp = customerWhatsapp.replace(/\D/g, "").slice(-10);
    if (!/^\d{2}$/.test(placeOfSupply)) {
      setFeedback({
        title: "Invalid Place of Supply",
        message: "Enter a valid 2-digit GST state code.",
      });
      return;
    }
    if (normalizedWhatsapp.length !== 10) {
      setFeedback({
        title: "Invalid WhatsApp number",
        message: "Enter a valid 10-digit WhatsApp number.",
      });
      return;
    }
    const validItems = items.filter(
      (item) =>
        (item.itemId || item.serviceId) &&
        Number(isReturn ? item.returnedQty : item.qty) > 0 &&
        Number(item.rate) >= 0,
    );
    if (!validItems.length) {
      setFeedback({
        title: "Line item required",
        message: "Add at least one valid inventory product or service line.",
      });
      return;
    }
    if (isReturn) {
      if (!selectedReturnInvoiceId && !selectedReturnDcId) {
        setFeedback({
          title: "Source required",
          message: "Map an approved Invoice or dispatched Delivery Challan.",
        });
        return;
      }
      for (const item of validItems) {
        const availableToReturn = Number(item.returnableQty ?? item.qty);
        if (Number(item.returnedQty) > availableToReturn) {
          setFeedback({
            title: "Invalid returned quantity",
            message: `${item.description} cannot return more than the remaining quantity of ${availableToReturn}.`,
          });
          return;
        }
        if (!item.serviceId && !item.warehouseId) {
          setFeedback({
            title: "Receiving warehouse required",
            message: `Select a receiving warehouse for ${item.description}.`,
          });
          return;
        }
      }
    }
    if (isChallan) {
      for (const item of validItems) {
        if (item.serviceId || String(item.itemType).toLowerCase() === "service")
          continue;
        if (!item.warehouseId) {
          setFeedback({
            title: "Warehouse required",
            message: `Select a warehouse for ${item.description}.`,
          });
          return;
        }
        const stockRow = inventoryItems.find(
          (entry) =>
            Number(entry.materialId) === Number(item.itemId) &&
            Number(entry.locationId) === Number(item.warehouseId),
        );
        if (!stockRow || Number(stockRow.quantityOnHand) < Number(item.qty)) {
          setFeedback({
            title: "Insufficient warehouse stock",
            message: `${item.description} has ${Number(stockRow?.quantityOnHand || 0)} ${item.uom} available in ${item.warehouse || "the selected warehouse"}, but ${item.qty} is requested.`,
          });
          return;
        }
      }
    }

    const isProforma = type === "Proforma Invoice";
    const payload = {
      quoteId:
        (isProforma || isInvoice) && selectedQuoteIds.length
          ? Number(selectedQuoteIds[0])
          : null,
      quoteIds: isProforma || isInvoice ? selectedQuoteIds.map(Number) : [],
      quotationIds: isChallan || isInvoice ? selectedQuoteIds.map(Number) : [],
      piId:
        (isChallan || isInvoice) && selectedPiIds.length
          ? Number(selectedPiIds[0])
          : null,
      piIds: isChallan || isInvoice ? selectedPiIds.map(Number) : [],
      dcId: isReturn
        ? selectedReturnDcId
          ? Number(selectedReturnDcId)
          : null
        : isInvoice && selectedDcIds.length
          ? Number(selectedDcIds[0])
          : null,
      dcIds: isInvoice ? selectedDcIds.map(Number) : [],
      invoiceId:
        isReturn && selectedReturnInvoiceId
          ? Number(selectedReturnInvoiceId)
          : null,
      sourceInvoiceId:
        isReturn && selectedReturnInvoiceId
          ? Number(selectedReturnInvoiceId)
          : null,
      clientId: Number(clientId),
      clientName,
      customerMobile,
      customerWhatsappNumber: normalizedWhatsapp,
      customerCompany: clientDetails.company,
      customerAddress: clientDetails.address,
      customerGstin: clientDetails.gstin,
      customerCountryCode: "91",
      placeOfSupply,
      quotationDate: docDate,
      proformaDate: docDate,
      challanDate: docDate,
      invoiceDate: docDate,
      returnDate: docDate,
      dueDate: validUntil,
      deliveryDate: validUntil,
      validUntil,
      subtotal,
      taxableAmount: subtotal,
      cgstTotal: totalCgst,
      sgstTotal: totalSgst,
      igstTotal: totalIgst,
      grandTotal,
      balanceDue: grandTotal,
      paymentStatus: "Unpaid",
      restock: isReturn,
      discountAmount,
      roundOff: 0,
      terms,
      bankName,
      accountNumber,
      ifscCode,
      branch,
      billedByCompanyName: billingDetails.name,
      billedByAddress: billingDetails.address,
      billedByGstin: billingDetails.gstin,
      billedByContactNumber: billingDetails.contactNumber,
      notes: "",
      status: forSend ? "Sent" : "Draft",
      items: validItems.map((item) => ({
        itemId: item.itemId,
        productId: item.itemId,
        variantId: null,
        serviceId: item.serviceId,
        productName: item.description,
        description: item.description,
        hsnSac: item.hsn,
        quantity: item.qty,
        invoicedQty: isReturn ? item.qty : undefined,
        returnedQty: isReturn ? item.returnedQty : undefined,
        invoiceItemId: item.invoiceItemId ?? null,
        uom: item.uom,
        rate: item.rate,
        discountPercent: 0,
        cgstPercent: isInterState ? 0 : item.cgst,
        sgstPercent: isInterState ? 0 : item.sgst,
        igstPercent: isInterState ? item.cgst + item.sgst : 0,
        itemType: item.itemType,
        lineSource: item.lineSource,
        warehouseId: item.warehouseId ?? null,
        warehouseName: item.warehouse || "",
        attributeValues: {},
        quotationId: item.quotationId ?? null,
        piId: item.piId ?? null,
        dcId: item.dcId ?? null,
      })),
    };

    setSaving(true);
    try {
      let targetId = savedDocumentId;
      let result: any;
      if (!targetId) {
        const createResponse = await fetch(`/api/sales/${documentResource}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: "Draft" }),
        });
        if (!createResponse.ok)
          throw new Error(
            (await createResponse.json().catch(() => ({}))).error ||
              `Failed to save ${documentLabel.toLowerCase()} draft`,
          );
        result = await createResponse.json();
        targetId = Number(result.id);
      } else if (!forSend) {
        const draftResponse = await fetch(
          `/api/sales/${documentResource}/${targetId}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, status: "Draft" }),
          },
        );
        if (!draftResponse.ok)
          throw new Error(
            (await draftResponse.json().catch(() => ({}))).error ||
              `Failed to save ${documentLabel.toLowerCase()} revision`,
          );
        result = await draftResponse.json();
        targetId = Number(result.id);
      }

      if (forSend) {
        const sendResponse = await fetch(
          `/api/sales/${documentResource}/${targetId}/send`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              mobile: normalizedWhatsapp,
              countryCode: "91",
              customMessage: sendMessage,
            }),
          },
        );
        if (!sendResponse.ok)
          throw new Error(
            (await sendResponse.json().catch(() => ({}))).error ||
              `Failed to send ${documentLabel.toLowerCase()}`,
          );
        result = await sendResponse.json();
        targetId = Number(result.id);
      }
      setSavedDocumentId(targetId);
      setViewDocumentId(targetId);
      setQuotationNumber(
        result.returnNumber ||
          result.invoiceNumber ||
          result.dcNumber ||
          result.piNumber ||
          result.quotationNumber ||
          result.quoteNumber,
      );
      setStatus(result.status);
      if (!isChallan && !isReturn) await loadVersions(targetId!);
      setSendOpen(false);
      onSaved?.(result);

      if (forSend && openWhatsApp) {
        const whatsappRecipient = normalizedWhatsapp;
        const savedNumber =
          result.returnNumber ||
          result.invoiceNumber ||
          result.dcNumber ||
          result.piNumber ||
          result.quotationNumber ||
          result.quoteNumber ||
          quotationNumber;
        const preparedPdf = await prepareSalesPdfInput(
          pdfInput(savedNumber, result.status),
        );
        downloadSalesPdf(buildSalesPdfBlob(preparedPdf), preparedPdf);
        const waUrl = `https://wa.me/${whatsappRecipient.length === 10 ? `91${whatsappRecipient}` : whatsappRecipient}?text=${encodeURIComponent(
          `Dear ${clientName}, please find our ${documentLabel} ${result.returnNumber || result.invoiceNumber || result.dcNumber || result.piNumber || result.quotationNumber} with grand total Rs ${grandTotal.toFixed(2)}. ${isInvoice ? "Due" : "Valid until"} ${validUntil}.`,
        )}`;
        window.open(waUrl, "_blank");
      }
      if (isQuotation || isProforma) onCancel();
    } catch (err: any) {
      console.error(err);
      setFeedback({
        title: forSend
          ? `Unable to send ${documentLabel.toLowerCase()}`
          : "Unable to save draft",
        message: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  items.forEach((item) => {
    const calcQty = isReturn ? item.returnedQty : item.qty;
    const lineTotal = calcQty * item.rate;
    subtotal += lineTotal;
    if (isInterState) totalIgst += lineTotal * ((item.cgst + item.sgst) / 100);
    else {
      totalCgst += lineTotal * (item.cgst / 100);
      totalSgst += lineTotal * (item.sgst / 100);
    }
  });

  const grandTotal =
    subtotal +
    totalCgst +
    totalSgst +
    totalIgst +
    Number(transportCharges) -
    Number(discountAmount);

  const pdfInput = (
    number = quotationNumber,
    pdfStatus = status,
  ): SalesPdfInput => ({
    documentType: documentLabel,
    documentNumber: number || "Draft",
    docDate,
    dueDate: validUntil,
    docDateLabel: isQuotation
      ? "Quotation Date"
      : isProforma
        ? "Proforma Date"
        : isChallan
          ? "Challan Date"
          : isInvoice
            ? "Invoice Date"
            : "Return Date",
    dueDateLabel: isInvoice
      ? "Due Date"
      : isReturn
        ? "Reference Date"
        : isChallan
          ? "Delivery Date"
          : "Valid Until",
    status: pdfStatus,
    companyName: billingDetails.name,
    companyAddress: billingDetails.address,
    companyGstin: billingDetails.gstin,
    companyPhone: billingDetails.contactNumber,
    clientName: clientDetails.company || clientName,
    clientAddress: clientDetails.address,
    clientGstin: clientDetails.gstin,
    clientPhone: clientDetails.phone || customerMobile,
    placeOfSupply,
    lines: items
      .filter((item) => item.itemId || item.serviceId)
      .map((item) => {
        const quantity = Number(isReturn ? item.returnedQty : item.qty);
        const rate = Number(item.rate || 0);
        const taxPercent = Number(item.cgst || 0) + Number(item.sgst || 0);
        return {
          description: item.description,
          hsn: item.hsn,
          quantity,
          uom: item.uom,
          rate,
          cgstPercent: isInterState ? 0 : Number(item.cgst || 0),
          sgstPercent: isInterState ? 0 : Number(item.sgst || 0),
          igstPercent: isInterState ? taxPercent : 0,
          lineTotal: quantity * rate * (1 + taxPercent / 100),
        };
      }),
    subtotal,
    cgstTotal: totalCgst,
    sgstTotal: totalSgst,
    igstTotal: totalIgst,
    grandTotal,
    bankName,
    accountNumber,
    ifscCode,
    branch,
    terms,
    notes: "",
    salesExecutive: organizationBranding.salesExecutive || "",
    documentBody: organizationBranding.salesDocBody || "",
    logoUrl: organizationBranding.logoUrl || "",
    watermarkUrl: organizationBranding.watermarkUrl || "",
    bankQrUrl:
      organizationBranding.bankQrUrl || organizationBranding.qrCodeUrl || "",
  });

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewOpen(false);
  };
  const openPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const preparedPdf = await prepareSalesPdfInput(pdfInput());
      setPreviewUrl(URL.createObjectURL(buildSalesPdfBlob(preparedPdf)));
    } catch (error: any) {
      setPreviewOpen(false);
      setFeedback({
        title: "Unable to create PDF preview",
        message: error.message,
      });
    } finally {
      setPreviewLoading(false);
    }
  };
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top Action Bar */}
      <div className="z-10 -mx-4 -mt-4 flex shrink-0 flex-col items-stretch gap-3 border-b border-border bg-white p-4 shadow-sm sm:-mx-6 sm:-mt-6 md:-mx-8 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight sm:text-xl">
              {documentId ? (isLocked ? "View" : "Edit") : "New"} {type}
            </h2>
            <p className="text-xs text-muted-foreground">{quotationNumber}</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:w-auto md:overflow-visible md:pb-0 [&>button]:shrink-0">
          <Button className="shrink-0" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="shrink-0" variant="outline" onClick={() => void openPreview()}>
            <FileText className="w-4 h-4 mr-2" /> Preview
          </Button>
          {versions.length > 0 && (
            <Select
              value={String(viewDocumentId || savedDocumentId || "")}
              onValueChange={(value) => setViewDocumentId(Number(value))}
            >
              <SelectTrigger className="w-[180px] shrink-0">
                <History className="w-4 h-4 mr-2 shrink-0" />
                <SelectValue placeholder="Revision History" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={String(version.id)}>
                    {version.versionLabel} - {version.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isLocked && (
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => void handleSave(false)}
            >
              <Save className="w-4 h-4 mr-2" /> Save Draft
            </Button>
          )}
          {!isLocked && (
            <Button
              disabled={saving}
              onClick={() => setSendOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isChallan ? (
                <Truck className="w-4 h-4 mr-2" />
              ) : isReturn ? (
                <RotateCcw className="w-4 h-4 mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {isChallan
                ? "Save & Dispatch"
                : isReturn
                  ? "Save & Return"
                  : "Save & Send"}
            </Button>
          )}
        </div>
      </div>

      <div className="sales-form-body min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto pb-8 pt-6 sm:px-1">
        <fieldset disabled={isLocked} className="min-w-0 space-y-4 sm:space-y-6">
          {(status === "Sent" || (isReturn && status === "Confirmed")) && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <Label className="font-semibold">Customer Response</Label>
                  <p className="text-xs text-muted-foreground">
                    {isReturn
                      ? "Confirmation records the goods as received and adds physical items back to inventory."
                      : "Confirmation is available only after the document is sent."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setResponseAction("confirm")}>
                    Confirm
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setResponseAction("reject")}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sales document identity and customer details */}
          <Card className="border-border shadow-sm">
            <CardContent className="space-y-5 p-4 sm:p-6">
              <section>
                <Label className="mb-3 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Billed By
                </Label>
                <div className="rounded-md bg-muted/45 px-4 py-3">
                  <Input
                    aria-label="Billed by company name"
                    value={billingDetails.name}
                    onChange={(e) =>
                      setBillingDetails({
                        ...billingDetails,
                        name: e.target.value,
                      })
                    }
                    className="h-7 border-0 bg-transparent px-0 text-sm font-bold shadow-none focus-visible:ring-0"
                  />
                  <Input
                    aria-label="Billed by address"
                    value={billingDetails.address}
                    onChange={(e) =>
                      setBillingDetails({
                        ...billingDetails,
                        address: e.target.value,
                      })
                    }
                    className="h-6 border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0"
                  />
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="shrink-0 font-medium uppercase tracking-wide">
                      GSTIN:
                    </span>
                    <Input
                      aria-label="Billed by GSTIN"
                      value={billingDetails.gstin}
                      onChange={(e) =>
                        setBillingDetails({
                          ...billingDetails,
                          gstin: e.target.value,
                        })
                      }
                      className="h-5 border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              </section>

              {/* Details Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className="h-full rounded-md border border-border bg-muted/15 p-4">
                  <div className="space-y-4">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {isChallan
                        ? "Delivery To"
                        : isReturn
                          ? "Return From"
                          : "Invoice To"}
                    </Label>
                    <Select
                      value={clientId}
                      onValueChange={(val) => {
                        setClientId(val);
                        const client = clients.find(
                          (c) => String(c.id) === val,
                        );
                        if (client) {
                          setClientName(client.name);
                          setCustomerMobile(client.phone || "");
                          setCustomerWhatsapp(
                            client.whatsappNumber || client.phone || "",
                          );
                          const clientStateCode =
                            String(client.stateCode || "").trim() ||
                            (/^\d{2}/.exec(client.gstin || "")?.[0] ?? "");
                          setPlaceOfSupply(clientStateCode || companyStateCode);
                          setClientDetails({
                            company: client.company || "",
                            address: client.address || "",
                            phone: client.phone || "",
                            whatsappNumber: client.whatsappNumber || "",
                            gstin: client.gstin || "",
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-11 bg-card">
                        <SelectValue placeholder="Select Client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name} {c.company ? `(${c.company})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {clientId && (
                      <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/35 p-4 text-xs sm:grid-cols-[minmax(10rem,0.35fr)_minmax(0,1fr)]">
                        <div>
                          <span className="block text-muted-foreground">
                            GSTIN
                          </span>
                          <span className="font-medium">
                            {clientDetails.gstin || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-muted-foreground">
                            Address
                          </span>
                          <span className="whitespace-pre-wrap font-medium">
                            {clientDetails.address || "—"}
                          </span>
                        </div>
                      </div>
                    )}

                    {isChallan && (
                      <div className="space-y-1.5 mt-4">
                        <Label className="text-xs">Shipping Address</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Shipping Address" />
                          </SelectTrigger>
                          <SelectContent>{/* Addresses */}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </section>
                <section className="h-full rounded-md border border-border bg-muted/15 p-4">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Document Number
                      </Label>
                      <span className="text-sm font-bold">
                        {quotationNumber}
                      </span>
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {isChallan
                            ? "DC Date"
                            : isProforma
                              ? "PI Date"
                              : isInvoice
                                ? "Invoice Date"
                                : isReturn
                                  ? "Return Date"
                                  : "Quotation Date"}{" "}
                          <span className="text-primary">*</span>
                        </Label>
                        <Input
                          type="date"
                          value={docDate}
                          onChange={(e) => setDocDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {isInvoice
                            ? "Due Date"
                            : isChallan || isReturn
                              ? "Delivery Date"
                              : "Valid Until"}
                        </Label>
                        <Input
                          type="date"
                          value={validUntil}
                          onChange={(e) => setValidUntil(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>SALES EXECUTIVE</span>
                      <span className="font-medium text-foreground">
                        {organizationBranding.salesExecutive || "�"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                      <span>SALES CONTACT</span>
                      <span className="font-medium text-foreground">
                        {billingDetails.contactNumber || "—"}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Place of Supply (State Code){" "}
                    <span className="text-primary">*</span>
                  </Label>
                  <Input
                    className="h-11"
                    maxLength={2}
                    value={placeOfSupply}
                    onChange={(e) =>
                      setPlaceOfSupply(
                        e.target.value.replace(/\D/g, "").slice(0, 2),
                      )
                    }
                    placeholder="e.g. 33"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {isInterState
                      ? "Inter-state — IGST applies"
                      : "Intra-state — CGST + SGST applies"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <div className="flex h-11 items-center rounded-md border bg-muted/35 px-3 text-sm font-medium">
                    {status}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Status updates automatically based on your actions.
                  </p>
                </div>
                <div className="w-full space-y-1.5 md:max-w-md">
                  <Label className="text-xs">
                    WhatsApp Number <span className="text-primary">*</span>
                  </Label>
                  <Input
                    className="h-11"
                    placeholder="10-digit WhatsApp number"
                    value={customerWhatsapp}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Auto-filled from contacts when client changes. Editable
                    before sharing the {documentLabel.toLowerCase()}.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isChallan && (
            <Card className="shadow-sm border-border bg-slate-50/30">
              <CardContent className="space-y-4 p-4 sm:p-6">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                  Dispatch Details
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Transporter Name</Label>
                    <Input
                      placeholder="Enter Transporter"
                      className="bg-white h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vehicle Number</Label>
                    <Input
                      placeholder="E.g. TN 38 XX 1234"
                      className="bg-white h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">LR Number</Label>
                    <Input
                      placeholder="Lorry Receipt Number"
                      className="bg-white h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(isProforma || isChallan || isInvoice) && (
            <Card className="shadow-sm border-border">
              <CardContent className="p-4 sm:p-6">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {isInvoice
                    ? "Map Sales Document (Optional — choose one source type)"
                    : isChallan
                      ? "Map Confirmed Sales Document (Optional)"
                      : "Map Approved/Confirmed Quotation"}
                </Label>
                <div
                  className={`mt-3 grid gap-3 ${isInvoice ? "md:grid-cols-3" : isChallan ? "md:grid-cols-2" : "max-w-xl"}`}
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          Boolean(autoCreatedFromQuotationId) ||
                          selectedPiIds.length > 0 ||
                          selectedDcIds.length > 0
                        }
                        className="w-full justify-between bg-white font-normal"
                      >
                        <span className="truncate">
                          {selectedQuoteIds.length
                            ? `${selectedQuoteIds.length} quotation${selectedQuoteIds.length > 1 ? "s" : ""} selected`
                            : "Select confirmed quotations"}
                        </span>
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[var(--radix-popover-trigger-width)] p-2"
                    >
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {availableQuotations.map((quote) => {
                          const id = String(quote.id);
                          const checked = selectedQuoteIds.includes(id);
                          return (
                            <label
                              key={id}
                              className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  void mapQuotations(
                                    checked
                                      ? selectedQuoteIds.filter(
                                          (value) => value !== id,
                                        )
                                      : [...selectedQuoteIds, id],
                                  )
                                }
                              />
                              <span>
                                {quote.quotationNumber || quote.quoteNumber} -{" "}
                                {quote.customerCompany || quote.clientName}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {isChallan && (
                    <Select
                      value={selectedPiId || "none"}
                      onValueChange={(value) =>
                        void mapSalesSource(
                          "proforma",
                          value === "none" ? "" : value,
                        )
                      }
                      disabled={selectedQuoteIds.length > 0}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select confirmed Proforma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No Proforma invoice
                        </SelectItem>
                        {availableProformas.map((doc) => (
                          <SelectItem key={doc.id} value={String(doc.id)}>
                            {doc.piNumber} -{" "}
                            {doc.customerCompany || doc.clientName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {isInvoice && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            selectedQuoteIds.length > 0 ||
                            selectedDcIds.length > 0
                          }
                          className="w-full justify-between bg-white font-normal"
                        >
                          <span className="truncate">
                            {selectedPiIds.length
                              ? `${selectedPiIds.length} Proforma invoice${selectedPiIds.length > 1 ? "s" : ""} selected`
                              : "Select approved Proformas"}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] p-2"
                      >
                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {availableProformas.map((doc) => {
                            const id = String(doc.id);
                            const checked = selectedPiIds.includes(id);
                            return (
                              <label
                                key={id}
                                className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() =>
                                    void mapInvoiceSources(
                                      "proforma",
                                      checked
                                        ? selectedPiIds.filter(
                                            (value) => value !== id,
                                          )
                                        : [...selectedPiIds, id],
                                    )
                                  }
                                />
                                <span>
                                  {doc.piNumber} -{" "}
                                  {doc.customerCompany || doc.clientName}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  {isInvoice && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            selectedQuoteIds.length > 0 ||
                            selectedPiIds.length > 0
                          }
                          className="w-full justify-between bg-white font-normal"
                        >
                          <span className="truncate">
                            {selectedDcIds.length
                              ? `${selectedDcIds.length} Delivery Challan${selectedDcIds.length > 1 ? "s" : ""} selected`
                              : "Select dispatched Challans"}
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[var(--radix-popover-trigger-width)] p-2"
                      >
                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {availableChallans.map((doc) => {
                            const id = String(doc.id);
                            const checked = selectedDcIds.includes(id);
                            return (
                              <label
                                key={id}
                                className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() =>
                                    void mapInvoiceSources(
                                      "challan",
                                      checked
                                        ? selectedDcIds.filter(
                                            (value) => value !== id,
                                          )
                                        : [...selectedDcIds, id],
                                    )
                                  }
                                />
                                <span>
                                  {doc.dcNumber} -{" "}
                                  {doc.customerCompany || doc.clientName}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {(selectedQuoteIds.length > 0 ||
                  selectedPiIds.length > 0 ||
                  selectedDcIds.length > 0) &&
                  !autoCreatedFromQuotationId && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() =>
                        void (selectedDcIds.length
                          ? mapInvoiceSources("challan", [])
                          : selectedPiIds.length
                            ? isInvoice
                              ? mapInvoiceSources("proforma", [])
                              : mapSalesSource("proforma", "")
                            : mapQuotations([]))
                      }
                    >
                      Clear Mapping
                    </Button>
                  )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Mapping copies the confirmed source customer, GST, dates, bank
                  details and line items. You can also create this document
                  manually.
                </p>
              </CardContent>
            </Card>
          )}

          {isReturn && (
            <Card className="shadow-sm border-border">
              <CardContent className="p-4 sm:p-6">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Map Return Source (Required — choose one)
                </Label>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Select
                    value={selectedReturnInvoiceId || "none"}
                    onValueChange={(value) =>
                      void mapReturnSource(
                        "invoice",
                        value === "none" ? "" : value,
                      )
                    }
                    disabled={Boolean(selectedReturnDcId)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select approved/paid Invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Invoice</SelectItem>
                      {availableInvoices.map((doc) => (
                        <SelectItem key={doc.id} value={String(doc.id)}>
                          {doc.invoiceNumber} -{" "}
                          {doc.customerCompany || doc.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedReturnDcId || "none"}
                    onValueChange={(value) =>
                      void mapReturnSource(
                        "challan",
                        value === "none" ? "" : value,
                      )
                    }
                    disabled={Boolean(selectedReturnInvoiceId)}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select dispatched Delivery Challan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Delivery Challan</SelectItem>
                      {availableChallans.map((doc) => (
                        <SelectItem key={doc.id} value={String(doc.id)}>
                          {doc.dcNumber} -{" "}
                          {doc.customerCompany || doc.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The source customer and items are copied. Enter the actual
                  returned quantity and receiving warehouse before saving.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Line Items */}
          <Card className="shadow-sm border-border overflow-hidden">
            <div className="flex flex-col items-stretch gap-3 border-b border-border bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Line Items <span className="text-primary">*</span>
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                className="h-9 w-full sm:h-8 sm:w-auto"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add blank row
              </Button>
            </div>
            <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground sm:hidden">
              Swipe left to view tax and total fields.
            </p>
            <div
              ref={lineItemsScrollRef}
              className="line-items-scroll w-full max-w-full overflow-x-auto overscroll-x-contain"
            >
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium w-64">
                      Description
                    </th>
                    {(isChallan || isReturn) && (
                      <th className="px-4 py-3 text-left font-medium w-40">
                        Warehouse
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium">HSN/SAC</th>
                    <th className="w-36 min-w-36 px-4 py-3 text-left font-medium">
                      {isReturn ? "Invoiced Qty" : "QTY"}
                    </th>
                    {isReturn && (
                      <th className="w-36 min-w-36 px-4 py-3 text-left font-medium">
                        Already Returned
                      </th>
                    )}
                    {isReturn && (
                      <th className="w-36 min-w-36 px-4 py-3 text-left font-medium">
                        Returned Qty
                      </th>
                    )}
                    <th className="w-32 min-w-32 px-4 py-3 text-left font-medium">
                      UOM
                    </th>
                    <th className="w-36 min-w-36 px-4 py-3 text-left font-medium">
                      Rate
                    </th>
                    {isInterState ? (
                      <th className="w-32 min-w-32 px-4 py-3 text-left font-medium">
                        IGST%
                      </th>
                    ) : (
                      <>
                        <th className="w-32 min-w-32 px-4 py-3 text-left font-medium">
                          CGST%
                        </th>
                        <th className="w-32 min-w-32 px-4 py-3 text-left font-medium">
                          SGST%
                        </th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right font-medium">Tax</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => {
                    const activeQty = isReturn ? item.returnedQty : item.qty;
                    const tax =
                      activeQty * item.rate * ((item.cgst + item.sgst) / 100);
                    const total = activeQty * item.rate + tax;
                    return (
                      <tr key={item.id} className="group">
                        <td className="px-4 py-3">
                          <div className="space-y-2">
                            <Select
                              value={
                                item.inventoryId
                                  ? `inv-${item.inventoryId}`
                                  : item.serviceId
                                    ? `ser-${item.serviceId}`
                                    : ""
                              }
                              onValueChange={(v) => {
                                const selectedInventory = v.startsWith("inv-")
                                  ? inventoryItems.find(
                                      (entry) =>
                                        entry.id ===
                                        Number(v.replace("inv-", "")),
                                    )
                                  : null;
                                const isDuplicate = items.some(
                                  (row) =>
                                    row.id !== item.id &&
                                    (selectedInventory
                                      ? row.itemId ===
                                        selectedInventory.materialId
                                      : row.serviceId &&
                                        `ser-${row.serviceId}` === v),
                                );
                                if (isDuplicate) {
                                  setFeedback({
                                    title: "Duplicate line item",
                                    message:
                                      "This inventory item is already present in the document.",
                                  });
                                  return;
                                }
                                if (v.startsWith("inv-")) {
                                  const inventoryId = Number(
                                    v.replace("inv-", ""),
                                  );
                                  const inventory = inventoryItems.find(
                                    (entry) => entry.id === inventoryId,
                                  );
                                  if (inventory) {
                                    const halfTax =
                                      Number(inventory.gstPercent || 0) / 2;
                                    updateItem(item.id, {
                                      inventoryId: inventory.id,
                                      itemId: inventory.materialId,
                                      productId: inventory.materialId,
                                      serviceId: null,
                                      description: inventory.materialName,
                                      hsn: inventory.hsnSac || "",
                                      rate: Number(
                                        inventory.sellPricePerUnit || 0,
                                      ),
                                      uom: inventory.unit || "Nos",
                                      cgst: halfTax,
                                      sgst: halfTax,
                                      warehouseId: inventory.locationId,
                                      warehouse: inventory.locationName || "",
                                      itemType: "Product",
                                      lineSource: "Inventory",
                                    });
                                  }
                                } else if (v.startsWith("ser-")) {
                                  const serId = Number(v.replace("ser-", ""));
                                  const ser = services.find(
                                    (s) => s.id === serId,
                                  );
                                  if (ser) {
                                    updateItem(item.id, {
                                      itemId: null,
                                      productId: null,
                                      inventoryId: null,
                                      serviceId: ser.id,
                                      description: ser.name,
                                      hsn: ser.hsnSac || "9983",
                                      rate: Number(ser.sellingPrice || 0),
                                      uom: ser.unit || "Nos",
                                      cgst: Number(ser.gstPercent || 0) / 2,
                                      sgst: Number(ser.gstPercent || 0) / 2,
                                      itemType: "Service",
                                      lineSource: "Service",
                                    });
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select inventory item" />
                              </SelectTrigger>
                              <SelectContent>
                                {inventoryItems.map((entry) => (
                                  <SelectItem
                                    key={`inv-${entry.id}`}
                                    value={`inv-${entry.id}`}
                                    disabled={
                                      (Number(entry.quantityOnHand) <= 0 &&
                                        item.inventoryId !== entry.id) ||
                                      items.some(
                                        (row) =>
                                          row.id !== item.id &&
                                          row.itemId === entry.materialId,
                                      )
                                    }
                                  >
                                    [Inventory] {entry.materialName} —{" "}
                                    {entry.locationName || "Unassigned"} (
                                    {entry.quantityOnHand} {entry.unit})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isReturn && (
                              <Input
                                placeholder="Reason/Condition"
                                className="h-8 text-sm bg-rose-50"
                              />
                            )}
                          </div>
                        </td>
                        {(isChallan || isReturn) && (
                          <td className="px-4 py-3 align-top">
                            <Select
                              value={
                                item.warehouseId ? String(item.warehouseId) : ""
                              }
                              onValueChange={(v) => {
                                const location = isReturn
                                  ? warehouses.find(
                                      (entry) => String(entry.id) === v,
                                    )
                                  : inventoryItems.find(
                                      (entry) => String(entry.locationId) === v,
                                    );
                                updateItem(item.id, {
                                  warehouseId: Number(v),
                                  warehouse:
                                    location?.name ||
                                    location?.locationName ||
                                    "",
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {isReturn
                                  ? warehouses.map((location) => (
                                      <SelectItem
                                        key={location.id}
                                        value={String(location.id)}
                                      >
                                        {location.name ||
                                          location.locationName ||
                                          `Warehouse #${location.id}`}
                                      </SelectItem>
                                    ))
                                  : inventoryItems
                                      .filter(
                                        (entry) =>
                                          Number(entry.materialId) ===
                                            Number(item.itemId) &&
                                          entry.locationId &&
                                          (Number(entry.quantityOnHand) > 0 ||
                                            Number(entry.locationId) ===
                                              Number(item.warehouseId)),
                                      )
                                      .map((entry) => (
                                        <SelectItem
                                          key={entry.id}
                                          value={String(entry.locationId)}
                                        >
                                          {entry.locationName || "Warehouse"} (
                                          {entry.quantityOnHand} {entry.unit})
                                        </SelectItem>
                                      ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )}
                        <td className="min-w-32 px-4 py-3 align-top">
                          <Input
                            value={item.hsn}
                            onChange={(e) =>
                              updateItem(item.id, "hsn", e.target.value)
                            }
                            className="h-8 text-sm"
                            placeholder="9983"
                          />
                        </td>
                        <td className="min-w-36 px-4 py-3 align-top">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={item.qty || ""}
                            placeholder="0"
                            onChange={(e) =>
                              updateItem(item.id, "qty", Number(e.target.value))
                            }
                            className="h-9 w-full min-w-28 text-sm"
                            disabled={isReturn}
                          />
                        </td>
                        {isReturn && (
                          <td className="min-w-36 px-4 py-3 align-top">
                            <div className="flex h-8 items-center rounded-md border bg-muted/35 px-3 text-sm">
                              {item.alreadyReturnedQty || 0}
                            </div>
                          </td>
                        )}
                        {isReturn && (
                          <td className="min-w-36 px-4 py-3 align-top">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              max={item.returnableQty ?? item.qty}
                              value={item.returnedQty || ""}
                              placeholder="0"
                              onChange={(e) =>
                                updateItem(
                                  item.id,
                                  "returnedQty",
                                  Math.min(
                                    Number(e.target.value),
                                    Number(item.returnableQty ?? item.qty),
                                  ),
                                )
                              }
                              className="h-9 w-full min-w-28 text-sm"
                              disabled={
                                Number(item.returnableQty ?? item.qty) <= 0
                              }
                            />
                            {Number(item.returnableQty ?? item.qty) <= 0 && (
                              <p className="mt-1 text-[10px] font-medium text-destructive">
                                Already fully returned
                              </p>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 align-top">
                          <Input
                            value={item.uom}
                            onChange={(e) =>
                              updateItem(item.id, "uom", e.target.value)
                            }
                            className="h-9 w-full min-w-24 text-sm"
                          />
                        </td>
                        <td className="min-w-36 px-4 py-3 align-top">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={item.rate || ""}
                            placeholder="0"
                            onChange={(e) =>
                              updateItem(
                                item.id,
                                "rate",
                                Number(e.target.value),
                              )
                            }
                            className="h-9 w-full min-w-28 text-sm"
                          />
                        </td>
                        {isInterState ? (
                          <td className="min-w-32 px-4 py-3 align-top">
                            <Select
                              value={String(item.cgst + item.sgst)}
                              onValueChange={(v) =>
                                updateItem(item.id, {
                                  cgst: Number(v) / 2,
                                  sgst: Number(v) / 2,
                                })
                              }
                            >
                              <SelectTrigger className="h-9 w-full min-w-24 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                <SelectItem value="5">5%</SelectItem>
                                <SelectItem value="12">12%</SelectItem>
                                <SelectItem value="18">18%</SelectItem>
                                <SelectItem value="28">28%</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        ) : (
                          <>
                            <td className="min-w-32 px-4 py-3 align-top">
                              <Select
                                value={String(item.cgst)}
                                onValueChange={(v) =>
                                  updateItem(item.id, "cgst", Number(v))
                                }
                              >
                                <SelectTrigger className="h-9 w-full min-w-24 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="2.5">2.5%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="9">9%</SelectItem>
                                  <SelectItem value="14">14%</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="min-w-32 px-4 py-3 align-top">
                              <Select
                                value={String(item.sgst)}
                                onValueChange={(v) =>
                                  updateItem(item.id, "sgst", Number(v))
                                }
                              >
                                <SelectTrigger className="h-9 w-full min-w-24 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="2.5">2.5%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="9">9%</SelectItem>
                                  <SelectItem value="14">14%</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 align-top text-right text-muted-foreground pt-5">
                          Rs {tax.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-top text-right font-medium pt-5">
                          Rs {total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 align-top pt-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="shadow-sm border-border bg-slate-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Bank Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Bank Name
                    </Label>
                    <Input
                      placeholder="Enter Bank Name"
                      className="bg-white h-9"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Account Number
                    </Label>
                    <Input
                      placeholder="Enter Account Number"
                      className="bg-white h-9"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        IFSC Code
                      </Label>
                      <Input
                        placeholder="Enter IFSC"
                        className="bg-white h-9"
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Branch
                      </Label>
                      <Input
                        placeholder="Enter Branch"
                        className="bg-white h-9"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Terms &amp; Conditions
                    </Label>
                    <textarea
                      rows={5}
                      placeholder="Enter one term per line"
                      className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="shadow-sm border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>Rs {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Taxable Amount
                    </span>
                    <span>Rs {subtotal.toFixed(2)}</span>
                  </div>

                  {(isQuotation || isProforma || isChallan || isInvoice) && (
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">
                        Transport Charges
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={transportCharges || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setTransportCharges(Number(e.target.value))
                        }
                        className="h-7 w-24 text-right"
                      />
                    </div>
                  )}
                  {(isQuotation || isProforma || isInvoice) && (
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">
                        Discount Amount
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={discountAmount || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setDiscountAmount(Number(e.target.value))
                        }
                        className="h-7 w-24 text-right"
                      />
                    </div>
                  )}

                  {isInterState ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IGST</span>
                      <span>Rs {totalIgst.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">CGST</span>
                        <span>Rs {totalCgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SGST</span>
                        <span>Rs {totalSgst.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {(isQuotation || isProforma || isInvoice) && (
                    <div className="flex justify-between text-sm items-center mt-2 border-t pt-2">
                      <span className="text-muted-foreground">
                        Advance Received
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={amountPaid || ""}
                        placeholder="0"
                        onChange={(e) => setAmountPaid(Number(e.target.value))}
                        className="h-7 w-24 text-right"
                      />
                    </div>
                  )}

                  <div className="border-t pt-3 mt-3 flex justify-between font-bold text-base text-primary">
                    <span>Grand Total</span>
                    <span>Rs {grandTotal.toFixed(2)}</span>
                  </div>

                  {(isQuotation || isProforma || isInvoice) &&
                    amountPaid > 0 && (
                      <div className="flex justify-between font-bold text-sm text-muted-foreground">
                        <span>Balance Due</span>
                        <span>Rs {(grandTotal - amountPaid).toFixed(2)}</span>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
          </div>
        </fieldset>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {isChallan ? "Dispatch Delivery Challan" : `Send ${type}`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {isChallan
                ? "Dispatching will permanently reduce stock from each selected warehouse."
                : "Save as Sent or share the Sent revision through WhatsApp."}
            </p>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Recipient Name</Label>
                <Input value={clientName} readOnly />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_80px_100px_120px] bg-muted px-3 py-2 text-xs font-semibold">
                <span>Description</span>
                <span>Qty</span>
                <span>Rate</span>
                <span className="text-right">Amount</span>
              </div>
              {items
                .filter((item) => item.itemId || item.serviceId)
                .map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_80px_100px_120px] border-t px-3 py-2 text-sm"
                  >
                    <span>{item.description}</span>
                    <span>
                      {item.qty} {item.uom}
                    </span>
                    <span>Rs {Number(item.rate).toFixed(2)}</span>
                    <span className="text-right font-medium">
                      Rs{" "}
                      {(
                        Number(item.qty) *
                        Number(item.rate) *
                        (1 + (item.cgst + item.sgst) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                ))}
              <div className="flex justify-end border-t px-3 py-2 font-bold">
                Grand Total&nbsp; Rs {grandTotal.toFixed(2)}
              </div>
            </div>
            <div>
              <Label>Message</Label>
              <textarea
                className="mt-1 min-h-32 w-full rounded-md border p-3 text-sm"
                value={
                  sendMessage ||
                  `Dear ${clientName},\n\nPlease find ${type.toLowerCase()} ${quotationNumber} for Rs ${grandTotal.toFixed(2)}. Valid until ${validUntil}.`
                }
                onChange={(e) => setSendMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void handleSave(true, false)}
            >
              {isChallan ? "Dispatch" : "Save as Sent"}
            </Button>
            <Button
              disabled={saving}
              onClick={() => void handleSave(true, true)}
            >
              {isChallan ? "Dispatch & Open WhatsApp" : "Open WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(responseAction)}
        onOpenChange={(open) => {
          if (!open && !saving) setResponseAction(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {responseAction === "confirm"
                ? `Confirm ${documentLabel}`
                : `Reject ${documentLabel}`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {responseAction === "confirm"
                ? isReturn
                  ? "Confirm receipt of this return? Inventory and Credit Note automation will be processed."
                  : `Confirm customer approval of this ${documentLabel.toLowerCase()}?`
                : `Reject this ${documentLabel.toLowerCase()}? This action will lock the document.`}
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResponseAction(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant={responseAction === "reject" ? "destructive" : "default"}
              onClick={() => void confirmCustomerResponse()}
              disabled={saving}
            >
              {saving
                ? "Processing..."
                : responseAction === "confirm"
                  ? "Confirm"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(feedback)}
        onOpenChange={(open) => {
          if (!open) setFeedback(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{feedback?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{feedback?.message}</p>
          <DialogFooter>
            <Button onClick={() => setFeedback(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Sales PDF Preview</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Review first, then download or print.
            </p>
          </DialogHeader>
          <div className="min-h-0 flex-1 bg-zinc-800">
            {previewLoading ? (
              <div className="flex h-full items-center justify-center text-white">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Preparing preview...
              </div>
            ) : previewUrl ? (
              <iframe
                title="Sales PDF Preview"
                src={previewUrl}
                className="h-full w-full border-0"
              />
            ) : null}
          </div>
          <DialogFooter className="border-t px-5 py-3">
            <Button variant="outline" onClick={closePreview}>
              Close
            </Button>
            <Button
              variant="outline"
              disabled={!previewUrl}
              onClick={async () => {
                const preparedPdf = await prepareSalesPdfInput(pdfInput());
                downloadSalesPdf(buildSalesPdfBlob(preparedPdf), preparedPdf);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button
              disabled={!previewUrl}
              onClick={() => {
                const frame = document.querySelector<HTMLIFrameElement>(
                  'iframe[title="Sales PDF Preview"]',
                );
                frame?.contentWindow?.focus();
                frame?.contentWindow?.print();
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
