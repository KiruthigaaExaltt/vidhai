import { useState } from "react";
import { ArrowLeft, Send, Save, FileText, Trash2, Plus, Truck, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SalesDocumentFormProps {
  type: string;
  onCancel: () => void;
}

export function SalesDocumentForm({ type, onCancel }: SalesDocumentFormProps) {
  const [items, setItems] = useState([
    { id: 1, description: "", hsn: "", qty: 1, returnedQty: 0, uom: "Nos", rate: 0, cgst: 9, sgst: 9, warehouse: "" }
  ]);

  const [transportCharges, setTransportCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);

  const isQuotation = type === "Quotation";
  const isProforma = type === "Proforma Invoice";
  const isChallan = type === "Delivery Challan";
  const isInvoice = type === "Invoices";
  const isReturn = type === "Sales Return";

  const addItem = () => {
    setItems([...items, { id: Date.now(), description: "", hsn: "", qty: 1, returnedQty: 0, uom: "Nos", rate: 0, cgst: 9, sgst: 9, warehouse: "" }]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: number, field: string, value: string | number) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  // Calculations
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  items.forEach(item => {
    const calcQty = isReturn ? item.returnedQty : item.qty;
    const lineTotal = calcQty * item.rate;
    subtotal += lineTotal;
    totalCgst += lineTotal * (item.cgst / 100);
    totalSgst += lineTotal * (item.sgst / 100);
  });

  const grandTotal = subtotal + totalCgst + totalSgst + Number(transportCharges) - Number(discountAmount);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between bg-white p-4 border-b border-border -mx-6 md:-mx-8 -mt-6 mb-6 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">New {type}</h2>
            <p className="text-xs text-muted-foreground">Auto-numbered on save</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline"><FileText className="w-4 h-4 mr-2" /> Preview</Button>
          <Button variant="outline"><Save className="w-4 h-4 mr-2" /> Save Draft</Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {isChallan ? <Truck className="w-4 h-4 mr-2" /> : isReturn ? <RotateCcw className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {isChallan ? "Save & Dispatch" : isReturn ? "Save & Return" : "Save & Send"}
          </Button>
        </div>
      </div>

      {/* Billed By */}
      <Card className="shadow-sm border-border">
        <CardContent className="p-6">
          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Billed By</Label>
          <div className="bg-slate-50 p-4 rounded-md">
            <h3 className="font-bold text-sm">—</h3>
            <p className="text-xs text-muted-foreground mt-1">—</p>
            <p className="text-xs text-muted-foreground">GSTIN: —</p>
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
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent>
                  {/* Options */}
                </SelectContent>
              </Select>

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
                  <Input type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {isInvoice ? "Due Date" : (isChallan || isReturn) ? "Delivery Date" : "Valid Until"}
                  </Label>
                  <Input type="date" />
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
              <Input />
              <p className="text-[10px] text-muted-foreground">Intra-state — CGST + SGST applies</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WhatsApp Number <span className="text-primary">*</span></Label>
              <Input placeholder="10-digit WhatsApp number" />
              <p className="text-[10px] text-muted-foreground">Auto-filled from Orbit when Invoice To changes.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="bg-slate-50 p-2.5 rounded-md border text-sm font-medium">Draft</div>
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
                <th className="px-4 py-3 text-left font-medium w-24">CGST%</th>
                <th className="px-4 py-3 text-left font-medium w-24">SGST%</th>
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
                        <Input 
                          placeholder="Select variant / SKU or service" 
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Input placeholder="Custom specification" className="h-8 text-sm bg-slate-50" />
                        {isReturn && (
                          <Input placeholder="Reason/Condition" className="h-8 text-sm bg-rose-50" />
                        )}
                      </div>
                    </td>
                    {(isChallan || isReturn) && (
                      <td className="px-4 py-3 align-top">
                        <Select value={item.warehouse} onValueChange={(v) => updateItem(item.id, 'warehouse', v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="main">Main Warehouse</SelectItem>
                            <SelectItem value="annur">Annur Facility</SelectItem>
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
                    <td className="px-4 py-3 align-top">
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
                    </td>
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
      <div className={`grid grid-cols-1 ${!isQuotation ? "md:grid-cols-2" : ""} gap-6`}>
        
        {!isQuotation ? (
          <div className="space-y-6">
            <Card className="shadow-sm border-border bg-slate-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bank Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Bank Name</Label>
                  <Input placeholder="Enter Bank Name" className="bg-white h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Account Number</Label>
                  <Input placeholder="Enter Account Number" className="bg-white h-9" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">IFSC Code</Label>
                    <Input placeholder="Enter IFSC" className="bg-white h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Branch</Label>
                    <Input placeholder="Enter Branch" className="bg-white h-9" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div>{/* Empty space */}</div>
        )}
        
        <div className={isQuotation ? "md:col-start-2" : ""}>
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
              
              {(isProforma || isChallan || isInvoice) && (
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
              {(isProforma || isInvoice) && (
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

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>Rs {totalCgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>Rs {totalSgst.toFixed(2)}</span>
              </div>

              {(isProforma || isInvoice) && (
                <div className="flex justify-between text-sm items-center mt-2 border-t pt-2">
                  <span className="text-muted-foreground">{isInvoice ? "Amount Paid" : "Advance Received"}</span>
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
              
              {(isProforma || isInvoice) && amountPaid > 0 && (
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
  );
}
