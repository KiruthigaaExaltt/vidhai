import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function OrganizationDetails() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [watermarkUrl, setWatermarkUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [gstin, setGstin] = useState("");
  const [companyStateCode, setCompanyStateCode] = useState("");
  const [salesExecutive, setSalesExecutive] = useState("");
  const [salesContactNo, setSalesContactNo] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [branch, setBranch] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState<string[]>([]);
  const [salesDocBody, setSalesDocBody] = useState("");
  const [flexDocBody, setFlexDocBody] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  useEffect(() => {
    fetch("/api/sales/organization", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Unable to load organization details");
        return res.json();
      })
      .then((data) => {
        setLogoUrl(data.logoUrl || "");
        setWatermarkUrl(data.watermarkUrl || "");
        setCompanyName(data.companyName || "");
        setOrgEmail(data.orgEmail || "");
        setOrgDomain(data.orgDomain || "");
        setGstin(data.gstin || "");
        setCompanyStateCode(data.companyStateCode || "");
        setSalesExecutive(data.salesExecutive || "");
        setSalesContactNo(data.salesContactNo || "");
        setCompanyAddress(data.companyAddress || "");
        setBankName(data.bankName || "");
        setAccountNumber(data.accountNumber || "");
        setIfscCode(data.ifscCode || "");
        setBranch(data.branch || "");
        setQrCodeUrl(data.qrCodeUrl || "");
        setTermsAndConditions(data.termsAndConditions || []);
        setSalesDocBody(data.salesDocBody || "");
        setFlexDocBody(data.flexDocBody || "");
        setDefaultCurrency(data.defaultCurrency || "INR");
        setTimezone(data.timezone || "Asia/Kolkata");
      })
      .catch((err) => {
        console.error("Error fetching organization details:", err);
        toast({ title: "Unable to load organization details", description: err.message, variant: "destructive" });
      });
  }, []);

  const handleAddTerm = () => {
    setTermsAndConditions([...termsAndConditions, ""]);
  };

  const handleUpdateTerm = (index: number, val: string) => {
    const updated = [...termsAndConditions];
    updated[index] = val;
    setTermsAndConditions(updated);
  };

  const handleRemoveTerm = (index: number) => {
    setTermsAndConditions(termsAndConditions.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const payload = {
      logoUrl,
      watermarkUrl,
      companyName,
      orgEmail,
      orgDomain,
      gstin,
      companyStateCode,
      salesExecutive,
      salesContactNo,
      companyAddress,
      bankName,
      accountNumber,
      ifscCode,
      branch,
      qrCodeUrl,
      termsAndConditions,
      salesDocBody,
      flexDocBody,
      defaultCurrency,
      timezone,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/sales/organization", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to save: ${res.statusText} (${res.status})`);
        }
      const saved = await res.json();
      setCompanyName(saved.companyName || "");
      toast({ title: "Organization details saved", description: "Sales documents will now use these company and bank details." });
    } catch (err: any) {
      toast({ title: "Unable to save organization details", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold">Organization Details</h2>
        <p className="text-sm text-muted-foreground">Configure your company identity, tax information, and document templates.</p>
      </div>

      {/* Logos Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-none border-border">
          <CardContent className="p-5 space-y-3">
            <Label className="text-sm font-bold block">Org Logo</Label>
            <span className="text-xs text-muted-foreground block">If empty, bundled company logo will be used.</span>
            <div className="border border-dashed rounded-lg p-4 flex items-center justify-center bg-slate-50 min-h-[140px]">
              {logoUrl ? (
                <img src={logoUrl} alt="Org Logo" className="max-h-[120px] object-contain" />
              ) : (
                <div className="text-xs text-muted-foreground">No image uploaded</div>
              )}
            </div>
            <div className="flex gap-2">
              <Input type="text" placeholder="Enter Logo Image URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="h-9 text-xs" />
              {logoUrl && (
                <Button variant="outline" size="sm" onClick={() => setLogoUrl("")} className="text-rose-500 hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border-border">
          <CardContent className="p-5 space-y-3">
            <Label className="text-sm font-bold block">Watermark</Label>
            <span className="text-xs text-muted-foreground block">Used as centered background watermark in report PDFs.</span>
            <div className="border border-dashed rounded-lg p-4 flex items-center justify-center bg-slate-50 min-h-[140px]">
              {watermarkUrl ? (
                <img src={watermarkUrl} alt="Watermark" className="max-h-[120px] object-contain" />
              ) : (
                <div className="text-xs text-muted-foreground">No image uploaded</div>
              )}
            </div>
            <div className="flex gap-2">
              <Input type="text" placeholder="Enter Watermark Image URL" value={watermarkUrl} onChange={(e) => setWatermarkUrl(e.target.value)} className="h-9 text-xs" />
              {watermarkUrl && (
                <Button variant="outline" size="sm" onClick={() => setWatermarkUrl("")} className="text-rose-500 hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* General Information */}
      <Card className="shadow-none border-border">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 border-b pb-2 uppercase tracking-wide">General Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Company Name</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter Company Name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Organization Email</Label>
              <Input value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} placeholder="Enter Organization Email" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Organization Domain</Label>
              <Input value={orgDomain} onChange={(e) => setOrgDomain(e.target.value)} placeholder="Enter Organization Domain" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Registration / Tax ID (GSTIN)</Label>
              <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Enter GSTIN" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Company State Code</Label>
              <Input value={companyStateCode} onChange={(e) => setCompanyStateCode(e.target.value)} placeholder="Enter State Code" />
              <span className="text-[10px] text-muted-foreground block">Used for Sales/Flex place-of-supply GST type (intra vs inter).</span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sales Executive</Label>
              <Input value={salesExecutive} onChange={(e) => setSalesExecutive(e.target.value)} placeholder="Enter Sales Executive Name" />
            </div>
            <div className="grid col-span-1 md:col-span-2 space-y-1">
              <Label className="text-xs">Sales Contact No.</Label>
              <Input value={salesContactNo} onChange={(e) => setSalesContactNo(e.target.value)} placeholder="Enter Sales Contact Number" />
              <span className="text-[10px] text-muted-foreground block">Shown on Sales documents when filled. Leave blank to hide.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Address */}
      <Card className="shadow-none border-border">
        <CardContent className="p-6 space-y-2">
          <Label className="text-sm font-bold text-slate-700 block">Company Address</Label>
          <textarea
            className="w-full min-h-[80px] text-sm p-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
            value={companyAddress}
            onChange={(e) => setCompanyAddress(e.target.value)}
            placeholder="Enter Company Address"
          />
        </CardContent>
      </Card>

      {/* Bank Details */}
      <Card className="shadow-none border-border">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 border-b pb-2 uppercase tracking-wide">Bank Details</h3>
          <span className="text-xs text-muted-foreground block">Shown on Sales quotations, proforma invoices, delivery challans, invoices, and sales returns.</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Bank Name</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Enter Bank Name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account Number</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Enter Account Number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">IFSC Code</Label>
              <Input value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} placeholder="Enter IFSC Code" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Enter Branch Name" />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-xs font-bold block">Payment QR / UPI Image</Label>
            <span className="text-[10px] text-muted-foreground block">Attached image appears inside Bank Details on Sales PDF previews.</span>
            <div className="border border-dashed rounded-lg p-4 flex items-center justify-center bg-slate-50 min-h-[140px] max-w-[280px]">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Payment QR" className="max-h-[120px] object-contain" />
              ) : (
                <div className="text-xs text-muted-foreground">No QR Code Image</div>
              )}
            </div>
            <div className="flex gap-2 max-w-md">
              <Input type="text" placeholder="Enter QR Code Image URL" value={qrCodeUrl} onChange={(e) => setQrCodeUrl(e.target.value)} className="h-9 text-xs" />
              {qrCodeUrl && (
                <Button variant="outline" size="sm" onClick={() => setQrCodeUrl("")} className="text-rose-500 hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card className="shadow-none border-border">
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Terms & Conditions</h3>
            <Button variant="outline" size="sm" onClick={handleAddTerm} className="h-8 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
            </Button>
          </div>
          <span className="text-xs text-muted-foreground block">Line-by-line defaults prefilled into Sales documents (editable there).</span>
          <div className="space-y-3">
            {termsAndConditions.map((term, index) => (
              <div key={index} className="flex gap-2 items-center">
                <span className="text-xs text-muted-foreground w-6">{index + 1}.</span>
                <Input value={term} onChange={(e) => handleUpdateTerm(index, e.target.value)} className="h-9 text-xs" placeholder="Enter term detail..." />
                <Button variant="ghost" size="icon" onClick={() => handleRemoveTerm(index)} className="h-9 w-9 text-muted-foreground hover:text-rose-600">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sales Document Body & Flex Document Body */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-none border-border">
          <CardContent className="p-5 space-y-2">
            <Label className="text-sm font-bold text-slate-700 block">Sales Document Body</Label>
            <textarea
              className="w-full min-h-[120px] text-sm p-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              value={salesDocBody}
              onChange={(e) => setSalesDocBody(e.target.value)}
              placeholder="Dear Sir,&#10;Sub: Price List"
            />
          </CardContent>
        </Card>

        <Card className="shadow-none border-border">
          <CardContent className="p-5 space-y-2">
            <Label className="text-sm font-bold text-slate-700 block">Flex Document Body</Label>
            <textarea
              className="w-full min-h-[120px] text-sm p-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-white"
              value={flexDocBody}
              onChange={(e) => setFlexDocBody(e.target.value)}
              placeholder="Enter flex document body"
            />
          </CardContent>
        </Card>
      </div>

      {/* Localization */}
      <Card className="shadow-none border-border">
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 border-b pb-2 uppercase tracking-wide">Localization</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Default Currency</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</SelectItem>
                  <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void handleSave()} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold transition-colors">
          {saving ? "Saving..." : "Save Organization Details"}
        </Button>
      </div>
    </div>
  );
}
