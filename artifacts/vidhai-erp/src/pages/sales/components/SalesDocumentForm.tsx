import { useState, useEffect } from "react";
import { ArrowLeft, Send, Save, FileText, Trash2, Plus, Truck, RotateCcw, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SalesDocumentFormProps {
  type: string;
  onCancel: () => void;
  onSaved?: (document: any) => void;
  documentId?: number | null;
}

function numericValue(value: any): number {
  const parsed = Number(value?.$numberDecimal ?? value?.toString?.() ?? value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SalesDocumentForm({ type, onCancel, onSaved, documentId }: SalesDocumentFormProps) {
  const [viewDocumentId, setViewDocumentId] = useState<number | null>(documentId || null);
  const [items, setItems] = useState<any[]>([
    { id: 1, description: "", hsn: "", qty: 1, returnedQty: 0, uom: "Nos", rate: 0, cgst: 9, sgst: 9, warehouse: "", itemId: null, serviceId: null }
  ]);

  const [transportCharges, setTransportCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);

  const [clients, setClients] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  const [placeOfSupply, setPlaceOfSupply] = useState<string>("");
  const [companyStateCode, setCompanyStateCode] = useState<string>("");
  const [customerMobile, setCustomerMobile] = useState<string>("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState<string>("");
  const [clientDetails, setClientDetails] = useState({ company: "", address: "", phone: "", whatsappNumber: "", gstin: "" });
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState<string>(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branch, setBranch] = useState("");

  const [billingDetails, setBillingDetails] = useState({
    name: "",
    address: "",
    gstin: "",
    contactNumber: ""
  });

  useEffect(() => {
    fetch("/api/contacts")
      .then(res => res.json())
      .then(data => setClients(data.filter((c: any) => c.type === "client")))
      .catch(err => console.error("Error loading clients:", err));
    fetch("/api/inventory", { credentials: "include" })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Unable to load inventory");
        return res.json();
      })
      .then(data => setInventoryItems(data))
      .catch(err => console.error("Error loading inventory:", err));
    fetch("/api/services")
      .then(res => res.json())
      .then(data => setServices(data))
      .catch(err => console.error("Error loading services:", err));
    fetch("/api/sales/organization", { credentials: "include" })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Unable to load organization details");
        return res.json();
      })
      .then(data => {
        if (data) {
          setBillingDetails({
            name: data.companyName || "",
            address: data.companyAddress || "",
            gstin: data.gstin || "",
            contactNumber: data.salesContactNo || ""
          });
          setBankName(data.bankName || "");
          setAccountNumber(data.accountNumber || "");
          setIfscCode(data.ifscCode || "");
          setBranch(data.branch || "");
          setCompanyStateCode(String(data.companyStateCode || "").trim());
        }
      })
      .catch(err => console.error("Error loading organization details:", err));
  }, []);

  useEffect(() => { setViewDocumentId(documentId || null); }, [documentId]);

  useEffect(() => {
    if (!viewDocumentId) return;
    fetch(`/api/sales/quotations/${viewDocumentId}`, { credentials: "include" })
      .then(async response => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to load quotation");
        return response.json();
      })
      .then(document => {
        setSavedDocumentId(Number(document.id));
        setQuotationNumber(document.quotationNumber || document.quoteNumber || "Draft");
        setStatus(document.status || "Draft");
        setClientId(String(document.clientId || ""));
        setClientName(document.clientName || "");
        setCustomerMobile(document.customerMobile || "");
        setCustomerWhatsapp(document.customerWhatsappNumber || document.customerMobile || "");
        setClientDetails({ company: document.customerCompany || "", address: document.customerAddress || "", phone: document.customerMobile || "", whatsappNumber: document.customerWhatsappNumber || "", gstin: document.customerGstin || "" });
        setPlaceOfSupply(document.placeOfSupply || "");
        setDocDate(String(document.quotationDate || "").slice(0, 10));
        setValidUntil(String(document.validUntil || "").slice(0, 10));
        setBankName(document.bankName || ""); setAccountNumber(document.accountNumber || ""); setIfscCode(document.ifscCode || ""); setBranch(document.branch || "");
        setBillingDetails({ name: document.billedByCompanyName || "", address: document.billedByAddress || "", gstin: document.billedByGstin || "", contactNumber: document.billedByContactNumber || "" });
        setDiscountAmount(numericValue(document.discountAmount));
        setItems((document.items || []).map((line: any) => { const igstHalf = numericValue(line.igstPercent) / 2; return { id: line.id, itemId: line.itemId == null ? null : Number(line.itemId), productId: line.productId == null ? null : Number(line.productId), serviceId: line.serviceId == null ? null : Number(line.serviceId), inventoryId: null, description: line.description || line.productName || "", hsn: line.hsnSac || "", qty: numericValue(line.quantity), returnedQty: 0, uom: line.uom || "Nos", rate: numericValue(line.rate), cgst: numericValue(line.cgstPercent) || igstHalf, sgst: numericValue(line.sgstPercent) || igstHalf, warehouseId: line.warehouseId == null ? null : Number(line.warehouseId), warehouse: line.warehouseName || "", itemType: line.itemType, lineSource: line.lineSource }; }));
        void loadVersions(Number(document.id));
      })
      .catch(error => setFeedback({ title: "Unable to load quotation", message: error.message }));
  }, [viewDocumentId]);

  const unresolvedItemKey = items
    .filter(line => line.itemId && !line.inventoryId)
    .map(line => `${line.id}:${line.itemId}:${line.warehouseId || ""}`)
    .join("|");

  useEffect(() => {
    if (!inventoryItems.length || !unresolvedItemKey) return;
    setItems(current => {
      let changed = false;
      const resolved = current.map(line => {
        if (!line.itemId || line.inventoryId) return line;
        const matchingProduct = inventoryItems.filter(entry => Number(entry.materialId) === Number(line.itemId));
        const inventory = matchingProduct.find(entry => !line.warehouseId || Number(entry.locationId) === Number(line.warehouseId)) || matchingProduct[0];
        if (!inventory) return line;
        changed = true;
        return {
          ...line,
          inventoryId: Number(inventory.id),
          description: line.description || inventory.materialName || "",
          warehouseId: line.warehouseId || inventory.locationId || null,
          warehouse: line.warehouse || inventory.locationName || ""
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
    setItems([...items, { id: Date.now(), description: "", hsn: "", qty: 1, returnedQty: 0, uom: "Nos", rate: 0, cgst: 9, sgst: 9, warehouse: "", itemId: null, serviceId: null }]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: number, fieldOrUpdates: string | Record<string, any>, value?: string | number) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (typeof fieldOrUpdates === "object") {
          return { ...item, ...fieldOrUpdates };
        }
        return { ...item, [fieldOrUpdates]: value };
      }
      return item;
    }));
  };

  const [savedDocumentId, setSavedDocumentId] = useState<number | null>(null);
  const [quotationNumber, setQuotationNumber] = useState<string>("Draft");
  const [status, setStatus] = useState<string>("Draft");
  const [versions, setVersions] = useState<any[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message: string; success?: boolean } | null>(null);
  const isInterState = Boolean(companyStateCode && placeOfSupply && companyStateCode !== placeOfSupply);
  const isLocked = status === "Approved" || status === "Rejected";

  const loadVersions = async (quotationId: number) => {
    const response = await fetch(`/api/sales/quotations/${quotationId}/versions`, { credentials: "include" });
    if (response.ok) setVersions((await response.json()).data || []);
  };

  const handleCustomerResponse = async (action: "confirm" | "reject") => {
    if (!savedDocumentId || status !== "Sent") return;
    const response = await fetch(`/api/sales/quotations/${savedDocumentId}/customer-response`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setFeedback({ title: "Unable to update response", message: result.error || "Request failed" });
    setStatus(result.status);
    setFeedback({ title: action === "confirm" ? "Quotation approved" : "Quotation rejected", message: `Customer response was recorded as ${result.status}.`, success: true });
    onSaved?.(result);
  };

  const handleSave = async (forSend: boolean, openWhatsApp = false) => {
    if (!clientId) {
      setFeedback({ title: "Customer required", message: "Please select a client first." });
      return;
    }
    const normalizedWhatsapp = customerWhatsapp.replace(/\D/g, "").slice(-10);
    if (!/^\d{2}$/.test(placeOfSupply)) {
      setFeedback({ title: "Invalid Place of Supply", message: "Enter a valid 2-digit GST state code." });
      return;
    }
    if (normalizedWhatsapp.length !== 10) {
      setFeedback({ title: "Invalid WhatsApp number", message: "Enter a valid 10-digit WhatsApp number." });
      return;
    }
    const validItems = items.filter(item => (item.itemId || item.serviceId) && Number(item.qty) > 0 && Number(item.rate) >= 0);
    if (!validItems.length) {
      setFeedback({ title: "Line item required", message: "Add at least one valid inventory product or service line." });
      return;
    }

    const payload = {
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
      validUntil,
      subtotal,
      taxableAmount: subtotal,
      cgstTotal: totalCgst,
      sgstTotal: totalSgst,
      igstTotal: totalIgst,
      grandTotal,
      discountAmount,
      roundOff: 0,
      terms: "",
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
      items: validItems.map(item => ({
        itemId: item.itemId,
        productId: item.itemId,
        variantId: null,
        serviceId: item.serviceId,
        productName: item.description,
        description: item.description,
        hsnSac: item.hsn,
        quantity: item.qty,
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
        attributeValues: {}
      }))
    };

    setSaving(true);
    try {
      let targetId = savedDocumentId;
      let result: any;
      if (!targetId) {
        const createResponse = await fetch("/api/sales/quotations", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: "Draft" })
        });
        if (!createResponse.ok) throw new Error((await createResponse.json().catch(() => ({}))).error || "Failed to save quotation draft");
        result = await createResponse.json();
        targetId = Number(result.id);
      } else if (!forSend) {
        const draftResponse = await fetch(`/api/sales/quotations/${targetId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, status: "Draft" })
        });
        if (!draftResponse.ok) throw new Error((await draftResponse.json().catch(() => ({}))).error || "Failed to save quotation revision");
        result = await draftResponse.json();
        targetId = Number(result.id);
      }

      if (forSend) {
        const sendResponse = await fetch(`/api/sales/quotations/${targetId}/send`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, mobile: normalizedWhatsapp, countryCode: "91", customMessage: sendMessage })
        });
        if (!sendResponse.ok) throw new Error((await sendResponse.json().catch(() => ({}))).error || "Failed to send quotation");
        result = await sendResponse.json();
        targetId = Number(result.id);
      }
      setSavedDocumentId(targetId);
      setViewDocumentId(targetId);
      setQuotationNumber(result.quotationNumber || result.quoteNumber);
      setStatus(result.status);
      await loadVersions(targetId!);
      setSendOpen(false);
      setFeedback({ title: forSend ? "Quotation sent" : "Draft saved", message: `${result.quotationNumber || result.quoteNumber} was saved as ${result.versionLabel || result.status}.`, success: true });
      onSaved?.(result);
      
      if (forSend && openWhatsApp) {
        const whatsappRecipient = normalizedWhatsapp;
        const waUrl = `https://wa.me/${whatsappRecipient.length === 10 ? `91${whatsappRecipient}` : whatsappRecipient}?text=${encodeURIComponent(
          `Dear ${clientName}, please find our Quotation ${result.quotationNumber} with grand total Rs ${grandTotal.toFixed(2)}. Valid until ${validUntil}.`
        )}`;
        window.open(waUrl, "_blank");
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({ title: forSend ? "Unable to send quotation" : "Unable to save draft", message: err.message });
    } finally {
      setSaving(false);
    }
  };



  // Calculations
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  items.forEach(item => {
    const calcQty = isReturn ? item.returnedQty : item.qty;
    const lineTotal = calcQty * item.rate;
    subtotal += lineTotal;
    if (isInterState) totalIgst += lineTotal * ((item.cgst + item.sgst) / 100);
    else {
      totalCgst += lineTotal * (item.cgst / 100);
      totalSgst += lineTotal * (item.sgst / 100);
    }
  });

  const grandTotal = subtotal + totalCgst + totalSgst + totalIgst + Number(transportCharges) - Number(discountAmount);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top Action Bar */}
      <div className="z-10 -mx-6 -mt-6 flex shrink-0 items-center justify-between border-b border-border bg-white p-4 shadow-sm md:-mx-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{documentId ? "Edit" : "New"} {type}</h2>
            <p className="text-xs text-muted-foreground">{quotationNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline"><FileText className="w-4 h-4 mr-2" /> Preview</Button>
          {versions.length > 0 && (
            <Select value={String(viewDocumentId || savedDocumentId || "")} onValueChange={value => setViewDocumentId(Number(value))}>
              <SelectTrigger className="w-[180px]">
                <History className="w-4 h-4 mr-2 shrink-0" />
                <SelectValue placeholder="Revision History" />
              </SelectTrigger>
              <SelectContent>
                {versions.map(version => <SelectItem key={version.id} value={String(version.id)}>{version.versionLabel} - {version.status}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button disabled={saving || isLocked} variant="outline" onClick={() => void handleSave(false)}><Save className="w-4 h-4 mr-2" /> Save Draft</Button>
          <Button disabled={saving || isLocked} onClick={() => setSendOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isChallan ? <Truck className="w-4 h-4 mr-2" /> : isReturn ? <RotateCcw className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {isChallan ? "Save & Dispatch" : isReturn ? "Save & Return" : "Save & Send"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-1 pb-8 pt-6">
      {status === "Sent" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div><Label className="font-semibold">Customer Response</Label><p className="text-xs text-muted-foreground">Confirmation is available only after the quotation is sent.</p></div>
            <div className="flex gap-2"><Button onClick={() => void handleCustomerResponse("confirm")}>Confirm</Button><Button variant="destructive" onClick={() => void handleCustomerResponse("reject")}>Reject</Button></div>
          </CardContent>
        </Card>
      )}

      {/* Billed By */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-6">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Billed By</Label>
          <div className="bg-slate-50 p-4 rounded-md space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-[10px] text-muted-foreground">Company Name</Label>
                <Input value={billingDetails.name} onChange={(e) => setBillingDetails({ ...billingDetails, name: e.target.value })} className="h-8 text-xs bg-white" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Address</Label>
                <Input value={billingDetails.address} onChange={(e) => setBillingDetails({ ...billingDetails, address: e.target.value })} className="h-8 text-xs bg-white" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">GSTIN</Label>
                <Input value={billingDetails.gstin} onChange={(e) => setBillingDetails({ ...billingDetails, gstin: e.target.value })} className="h-8 text-xs bg-white" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Contact Number</Label>
                <Input value={billingDetails.contactNumber} onChange={(e) => setBillingDetails({ ...billingDetails, contactNumber: e.target.value })} className="h-8 text-xs bg-white" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="shadow-sm border-border h-full">
            <CardContent className="p-6 space-y-4">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {isChallan ? "Delivery To" : isReturn ? "Return From" : "Invoice To"}
              </Label>
              <Select value={clientId} onValueChange={(val) => {
                setClientId(val);
                const client = clients.find(c => String(c.id) === val);
                if (client) {
                  setClientName(client.name);
                  setCustomerMobile(client.phone || "");
                  setCustomerWhatsapp(client.whatsappNumber || client.phone || "");
                  const clientStateCode = String(client.stateCode || "").trim() || (/^\d{2}/.exec(client.gstin || "")?.[0] ?? "");
                  setPlaceOfSupply(clientStateCode || companyStateCode);
                  setClientDetails({
                    company: client.company || "",
                    address: client.address || "",
                    phone: client.phone || "",
                    whatsappNumber: client.whatsappNumber || "",
                    gstin: client.gstin || ""
                  });
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.company ? `(${c.company})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {clientId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border bg-slate-50 p-4 text-xs">
                  <div><span className="block text-muted-foreground">Company</span><span className="font-medium">{clientDetails.company || clientName || "—"}</span></div>
                  <div><span className="block text-muted-foreground">GSTIN</span><span className="font-medium">{clientDetails.gstin || "—"}</span></div>
                  <div><span className="block text-muted-foreground">Phone</span><span className="font-medium">{clientDetails.phone || "—"}</span></div>
                  <div><span className="block text-muted-foreground">WhatsApp</span><span className="font-medium">{clientDetails.whatsappNumber || "—"}</span></div>
                  <div className="sm:col-span-2"><span className="block text-muted-foreground">Address</span><span className="font-medium whitespace-pre-wrap">{clientDetails.address || "—"}</span></div>
                </div>
              )}


              {(isChallan || isInvoice) && (
                <div className="space-y-1.5 mt-4">
                  <Label className="text-xs">Shipping Address</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Shipping Address" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Addresses */}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isQuotation && (
                <div className="space-y-1.5 mt-4">
                  <Label className="text-xs">
                    Source Reference (optional)
                  </Label>
                  <Input placeholder={isReturn ? "E.g. Invoice ID, DC ID" : "E.g. Quotation ID, Sales Order ID"} />
                  <p className="text-[10px] text-muted-foreground">
                    Link this document to an existing source.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="shadow-sm border-border h-full">
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-4">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Document Number</Label>
                <span className="font-bold text-sm">Draft</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {isChallan ? "DC Date" : isProforma ? "PI Date" : isInvoice ? "Invoice Date" : isReturn ? "Return Date" : "Quotation Date"} <span className="text-primary">*</span>
                  </Label>
                  <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {isInvoice ? "Due Date" : (isChallan || isReturn) ? "Delivery Date" : "Valid Until"}
                  </Label>
                  <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>SALES EXECUTIVE</span>
                <span className="font-medium text-foreground">—</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                <span>SALES CONTACT</span>
                <span className="font-medium text-foreground">—</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isChallan && (
        <Card className="shadow-sm border-border bg-slate-50/30">
          <CardContent className="p-6 space-y-4">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Dispatch Details
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Transporter Name</Label>
                <Input placeholder="Enter Transporter" className="bg-white h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vehicle Number</Label>
                <Input placeholder="E.g. TN 38 XX 1234" className="bg-white h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">LR Number</Label>
                <Input placeholder="Lorry Receipt Number" className="bg-white h-9" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isInvoice && (
        <Card className="shadow-sm border-border bg-slate-50/30">
          <CardContent className="p-6 space-y-4">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Tax & E-Way Details
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Reverse Charge</Label>
                <Select>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="No" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">e-Way Bill Number</Label>
                <Input placeholder="Optional" className="bg-white h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IRN Number</Label>
                <Input placeholder="Optional" className="bg-white h-9" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isReturn && (
        <Card className="shadow-sm border-border bg-slate-50/30">
          <CardContent className="p-6 space-y-4">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Return Details
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Credit Note Number</Label>
                <Input placeholder="Generated after receipt" className="bg-white h-9" disabled />
              </div>
              <div className="space-y-1.5 flex items-center pt-5">
                <Input type="checkbox" className="w-4 h-4 mr-2" defaultChecked />
                <Label className="text-sm font-medium">Restock Inventory upon Receipt</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm border-border">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Place of Supply (State Code) <span className="text-primary">*</span></Label>
              <Input maxLength={2} value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="e.g. 33" />
              <p className="text-[10px] text-muted-foreground">{isInterState ? "Inter-state — IGST applies" : "Intra-state — CGST + SGST applies"}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WhatsApp Number <span className="text-primary">*</span></Label>
              <Input placeholder="10-digit WhatsApp number" value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Auto-filled from contacts when client changes.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="bg-slate-50 p-2.5 rounded-md border text-sm font-medium">{status}</div>
              <p className="text-[10px] text-muted-foreground">Status updates automatically based on your actions.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card className="shadow-sm border-border overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-slate-50/50">
          <Label className="text-xs font-bold text-foreground uppercase tracking-wider">Line Items <span className="text-primary">*</span></Label>
          <Button variant="outline" size="sm" onClick={addItem} className="h-8">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add blank row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-64">Description</th>
                {(isChallan || isReturn) && <th className="px-4 py-3 text-left font-medium w-40">Warehouse</th>}
                <th className="px-4 py-3 text-left font-medium">HSN/SAC</th>
                <th className="px-4 py-3 text-left font-medium w-20">{isReturn ? "Invoiced Qty" : "QTY"}</th>
                {isReturn && <th className="px-4 py-3 text-left font-medium w-24">Returned Qty</th>}
                <th className="px-4 py-3 text-left font-medium w-24">UOM</th>
                <th className="px-4 py-3 text-left font-medium w-28">Rate</th>
                {isInterState ? <th className="px-4 py-3 text-left font-medium w-24">IGST%</th> : <><th className="px-4 py-3 text-left font-medium w-24">CGST%</th><th className="px-4 py-3 text-left font-medium w-24">SGST%</th></>}
                <th className="px-4 py-3 text-right font-medium">Tax</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const activeQty = isReturn ? item.returnedQty : item.qty;
                const tax = (activeQty * item.rate) * ((item.cgst + item.sgst) / 100);
                const total = (activeQty * item.rate) + tax;
                return (
                  <tr key={item.id} className="group">
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <Select 
                          value={item.inventoryId ? `inv-${item.inventoryId}` : item.serviceId ? `ser-${item.serviceId}` : ""}
                          onValueChange={(v) => {
                            const selectedInventory = v.startsWith("inv-") ? inventoryItems.find(entry => entry.id === Number(v.replace("inv-", ""))) : null;
                            const isDuplicate = items.some(row => row.id !== item.id && (
                              selectedInventory ? row.itemId === selectedInventory.materialId : row.serviceId && `ser-${row.serviceId}` === v
                            ));
                            if (isDuplicate) {
                              setFeedback({ title: "Duplicate line item", message: "This product or service is already present in the quotation." });
                              return;
                            }
                            if (v.startsWith("inv-")) {
                              const inventoryId = Number(v.replace("inv-", ""));
                              const inventory = inventoryItems.find(entry => entry.id === inventoryId);
                              if (inventory) {
                                const halfTax = Number(inventory.gstPercent || 0) / 2;
                                updateItem(item.id, {
                                  inventoryId: inventory.id,
                                  itemId: inventory.materialId,
                                  productId: inventory.materialId,
                                  serviceId: null,
                                  description: inventory.materialName,
                                  hsn: inventory.hsnSac || "",
                                  rate: Number(inventory.sellPricePerUnit || 0),
                                  uom: inventory.unit || "Nos",
                                  cgst: halfTax,
                                  sgst: halfTax,
                                  warehouseId: inventory.locationId,
                                  warehouse: inventory.locationName || "",
                                  itemType: "Product",
                                  lineSource: "Inventory"
                                });
                              }
                            } else if (v.startsWith("ser-")) {
                              const serId = Number(v.replace("ser-", ""));
                              const ser = services.find(s => s.id === serId);
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
                                  lineSource: "Service"
                                });
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Product / Service" /></SelectTrigger>
                          <SelectContent>
                            {inventoryItems.map(entry => (
                              <SelectItem key={`inv-${entry.id}`} value={`inv-${entry.id}`} disabled={(Number(entry.quantityOnHand) <= 0 && item.inventoryId !== entry.id) || items.some(row => row.id !== item.id && row.itemId === entry.materialId)}>[Inventory] {entry.materialName} — {entry.locationName || "Unassigned"} ({entry.quantityOnHand} {entry.unit})</SelectItem>
                            ))}
                            {services.map(s => (
                              <SelectItem key={`ser-${s.id}`} value={`ser-${s.id}`} disabled={items.some(row => row.id !== item.id && row.serviceId === s.id)}>[Service] {s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isReturn && (
                          <Input placeholder="Reason/Condition" className="h-8 text-sm bg-rose-50" />
                        )}
                      </div>
                    </td>
                    {(isChallan || isReturn) && (
                      <td className="px-4 py-3 align-top">
                        <Select value={item.warehouseId ? String(item.warehouseId) : ""} onValueChange={(v) => {
                          const location = inventoryItems.find(entry => String(entry.locationId) === v);
                          updateItem(item.id, { warehouseId: Number(v), warehouse: location?.locationName || "" });
                        }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {Array.from(new Map(inventoryItems.filter(entry => entry.locationId).map(entry => [String(entry.locationId), entry.locationName])).entries()).map(([id, name]) => (
                              <SelectItem key={id} value={id}>{name || "Warehouse"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <Input value={item.hsn} onChange={(e) => updateItem(item.id, 'hsn', e.target.value)} className="h-8 text-sm" placeholder="9983" />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', Number(e.target.value))} className="h-8 text-sm" disabled={isReturn} />
                    </td>
                    {isReturn && (
                      <td className="px-4 py-3 align-top">
                        <Input type="number" value={item.returnedQty} onChange={(e) => updateItem(item.id, 'returnedQty', Number(e.target.value))} className="h-8 text-sm" />
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <Input value={item.uom} onChange={(e) => updateItem(item.id, 'uom', e.target.value)} className="h-8 text-sm" />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input type="number" value={item.rate} onChange={(e) => updateItem(item.id, 'rate', Number(e.target.value))} className="h-8 text-sm" />
                    </td>
                    {isInterState ? <td className="px-4 py-3 align-top">
                      <Select value={String(item.cgst + item.sgst)} onValueChange={(v) => updateItem(item.id, { cgst: Number(v) / 2, sgst: Number(v) / 2 })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="5">5%</SelectItem><SelectItem value="12">12%</SelectItem><SelectItem value="18">18%</SelectItem><SelectItem value="28">28%</SelectItem></SelectContent>
                      </Select>
                    </td> : <><td className="px-4 py-3 align-top">
                      <Select value={String(item.cgst)} onValueChange={(v) => updateItem(item.id, 'cgst', Number(v))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="2.5">2.5%</SelectItem><SelectItem value="6">6%</SelectItem><SelectItem value="9">9%</SelectItem><SelectItem value="14">14%</SelectItem></SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Select value={String(item.sgst)} onValueChange={(v) => updateItem(item.id, 'sgst', Number(v))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="0">0%</SelectItem><SelectItem value="2.5">2.5%</SelectItem><SelectItem value="6">6%</SelectItem><SelectItem value="9">9%</SelectItem><SelectItem value="14">14%</SelectItem></SelectContent>
                      </Select>
                    </td></>}
                    <td className="px-4 py-3 align-top text-right text-muted-foreground pt-5">
                      Rs {tax.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-medium pt-5">
                      Rs {total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 align-top pt-4">
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
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
                <Label className="text-xs text-muted-foreground">Bank Name</Label>
                <Input placeholder="Enter Bank Name" className="bg-white h-9" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Account Number</Label>
                <Input placeholder="Enter Account Number" className="bg-white h-9" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                  <Input placeholder="Enter IFSC" className="bg-white h-9" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Branch</Label>
                  <Input placeholder="Enter Branch" className="bg-white h-9" value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
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
                <span className="text-muted-foreground">Taxable Amount</span>
                <span>Rs {subtotal.toFixed(2)}</span>
              </div>
              
              {(isQuotation || isProforma || isChallan || isInvoice) && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Transport Charges</span>
                  <Input 
                    type="number" 
                    value={transportCharges} 
                    onChange={(e) => setTransportCharges(Number(e.target.value))} 
                    className="h-7 w-24 text-right" 
                  />
                </div>
              )}
              {(isQuotation || isProforma || isInvoice) && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Discount Amount</span>
                  <Input 
                    type="number" 
                    value={discountAmount} 
                    onChange={(e) => setDiscountAmount(Number(e.target.value))} 
                    className="h-7 w-24 text-right" 
                  />
                </div>
              )}
              
              {isInterState ? <div className="flex justify-between text-sm"><span className="text-muted-foreground">IGST</span><span>Rs {totalIgst.toFixed(2)}</span></div> : <><div className="flex justify-between text-sm"><span className="text-muted-foreground">CGST</span><span>Rs {totalCgst.toFixed(2)}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">SGST</span><span>Rs {totalSgst.toFixed(2)}</span></div></>}

              {(isQuotation || isProforma || isInvoice) && (
                <div className="flex justify-between text-sm items-center mt-2 border-t pt-2">
                  <span className="text-muted-foreground">Advance Received</span>
                  <Input 
                    type="number" 
                    value={amountPaid} 
                    onChange={(e) => setAmountPaid(Number(e.target.value))} 
                    className="h-7 w-24 text-right" 
                  />
                </div>
              )}

              <div className="border-t pt-3 mt-3 flex justify-between font-bold text-base text-primary">
                <span>Grand Total</span>
                <span>Rs {grandTotal.toFixed(2)}</span>
              </div>
              
              {(isQuotation || isProforma || isInvoice) && amountPaid > 0 && (
                <div className="flex justify-between font-bold text-sm text-muted-foreground">
                  <span>Balance Due</span>
                  <span>Rs {(grandTotal - amountPaid).toFixed(2)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Send Quotation</DialogTitle><p className="text-sm text-muted-foreground">Save as Sent or share the Sent revision through WhatsApp.</p></DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Recipient Name</Label><Input value={clientName} readOnly /></div><div><Label>WhatsApp Number</Label><Input value={customerWhatsapp} onChange={e => setCustomerWhatsapp(e.target.value)} /></div></div>
            <div className="rounded-md border"><div className="grid grid-cols-[1fr_80px_100px_120px] bg-muted px-3 py-2 text-xs font-semibold"><span>Description</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span></div>{items.filter(item => item.itemId || item.serviceId).map(item => <div key={item.id} className="grid grid-cols-[1fr_80px_100px_120px] border-t px-3 py-2 text-sm"><span>{item.description}</span><span>{item.qty} {item.uom}</span><span>Rs {Number(item.rate).toFixed(2)}</span><span className="text-right font-medium">Rs {(Number(item.qty) * Number(item.rate) * (1 + (item.cgst + item.sgst) / 100)).toFixed(2)}</span></div>)}<div className="flex justify-end border-t px-3 py-2 font-bold">Grand Total&nbsp; Rs {grandTotal.toFixed(2)}</div></div>
            <div><Label>Message</Label><textarea className="mt-1 min-h-32 w-full rounded-md border p-3 text-sm" value={sendMessage || `Dear ${clientName},\n\nPlease find quotation ${quotationNumber} for Rs ${grandTotal.toFixed(2)}. Valid until ${validUntil}.`} onChange={e => setSendMessage(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button><Button variant="outline" disabled={saving} onClick={() => void handleSave(true, false)}>Save as Sent</Button><Button disabled={saving} onClick={() => void handleSave(true, true)}>Open WhatsApp</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(feedback)} onOpenChange={open => { if (!open) setFeedback(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{feedback?.title}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{feedback?.message}</p><DialogFooter>{feedback?.success && <Button variant="outline" onClick={() => { setFeedback(null); onCancel(); }}>View Quotations</Button>}<Button onClick={() => setFeedback(null)}>Continue Editing</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
