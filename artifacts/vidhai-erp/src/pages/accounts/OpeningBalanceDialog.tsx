import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export type OpeningBalanceParty = {
  kind: "customer" | "vendor";
  id: number;
  name: string;
  openingBalance?: number;
  openingDate?: string;
  openingDirection?: string;
  openingNotes?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

// Captures the balance a customer/vendor carried before this ERP went live.
// All ledger transactions are treated as posted after it.
export function OpeningBalanceDialog({
  party,
  request,
  onClose,
  onSaved,
}: {
  party: OpeningBalanceParty;
  request: (path: string, options?: RequestInit) => Promise<any>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const isCustomer = party.kind === "customer";
  const current = Number(party.openingBalance || 0);
  const [amount, setAmount] = useState(current ? String(Math.abs(current)) : "");
  const [date, setDate] = useState(party.openingDate || today());
  const [direction, setDirection] = useState(party.openingDirection === "advance" ? "advance" : "due");
  const [notes, setNotes] = useState(party.openingNotes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const value = Number(amount || 0);
  const invalid = !Number.isFinite(value) || value < 0 || (value > 0 && !date);

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    setError("");
    try {
      await request(`/${isCustomer ? "customer" : "vendor"}-ledger/${party.id}/initial-balance`, {
        method: "PUT",
        body: JSON.stringify({ amount: value, date, direction: direction === "advance" ? "advance" : isCustomer ? "receivable" : "payable", notes }),
      });
      toast({ title: value > 0 ? "Opening balance saved" : "Opening balance cleared" });
      await onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save opening balance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-md rounded-md border bg-background shadow-xl">
        <DialogHeader>
          <DialogTitle>Opening Balance</DialogTitle>
          <DialogDescription>
            {party.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="block space-y-1.5 text-sm">
            <Label>Balance Type</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="due">{isCustomer ? "Receivable (customer owes us)" : "Payable (we owe vendor)"}</SelectItem>
                <SelectItem value="advance">{isCustomer ? "Advance (we owe customer)" : "Advance (vendor owes us)"}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-sm">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </label>
            <label className="block space-y-1.5 text-sm">
              <Label>As of Date{value > 0 ? " *" : ""}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
          <p className="text-xs text-muted-foreground">Set the amount to 0 to clear the opening balance.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || invalid}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
