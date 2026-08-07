export interface VendorItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

const VENDOR_KEY = "vidhai_shared_vendors_v2";
const PR_KEY = "vidhai_shared_prs_v2";
const PO_KEY = "vidhai_shared_pos_v2";
const GRN_KEY = "vidhai_shared_grns_v2";
const INV_KEY = "vidhai_shared_invoices_v2";
const PAY_KEY = "vidhai_shared_payments_v2";

function getStorage<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStorage<T>(key: string, data: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error("Storage save failed:", err);
  }
}

// ── VENDORS ──
export function getStoredVendors(): VendorItem[] {
  return getStorage<VendorItem>(VENDOR_KEY);
}

export function addStoredVendor(vendor: VendorItem): VendorItem[] {
  const current = getStoredVendors();
  const exists = current.some(
    (v) => v.name.toLowerCase() === vendor.name.toLowerCase(),
  );
  if (exists) return current;
  const updated = [vendor, ...current];
  saveStorage(VENDOR_KEY, updated);
  return updated;
}

export function mergeVendors(apiVendors: VendorItem[]): VendorItem[] {
  const local = getStoredVendors();
  const map = new Map<string, VendorItem>();

  if (Array.isArray(apiVendors)) {
    apiVendors.forEach((v) => map.set(v.name.toLowerCase(), v));
  }
  local.forEach((v) => map.set(v.name.toLowerCase(), v));
  return Array.from(map.values());
}

// ── PURCHASE REQUESTS ──
export function getStoredPRs(): any[] {
  return getStorage<any>(PR_KEY);
}

export function addStoredPR(pr: any): any[] {
  const current = getStoredPRs();
  const updated = [pr, ...current];
  saveStorage(PR_KEY, updated);
  return updated;
}

export function mergePRs(serverData: any[]): any[] {
  const local = getStoredPRs();
  const map = new Map<string | number, any>();
  if (Array.isArray(serverData)) {
    serverData.forEach((s) => map.set(s.id || s.prNumber, s));
  }
  local.forEach((l) => map.set(l.id || l.prNumber, l));

  return Array.from(map.values());
}

// ── PURCHASE ORDERS ──
export function getStoredPOs(): any[] {
  return getStorage<any>(PO_KEY);
}

export function addStoredPO(po: any): any[] {
  const current = getStoredPOs();
  const updated = [po, ...current];
  saveStorage(PO_KEY, updated);
  return updated;
}

export function mergePOs(serverData: any[]): any[] {
  const local = getStoredPOs();
  const map = new Map<string | number, any>();
  if (Array.isArray(serverData)) {
    serverData.forEach((s) => map.set(s.id || s.poNumber, s));
  }
  local.forEach((l) => map.set(l.id || l.poNumber, l));
  return Array.from(map.values());
}

// ── GOODS RECEIPTS ──
export function getStoredGRNs(): any[] {
  return getStorage<any>(GRN_KEY);
}

export function addStoredGRN(grn: any): any[] {
  const current = getStoredGRNs();
  const updated = [grn, ...current];
  saveStorage(GRN_KEY, updated);
  return updated;
}

export function mergeGRNs(serverData: any[]): any[] {
  const local = getStoredGRNs();
  const map = new Map<string | number, any>();
  if (Array.isArray(serverData)) {
    serverData.forEach((s) => map.set(s.id || s.grnNumber, s));
  }
  local.forEach((l) => map.set(l.id || l.grnNumber, l));
  return Array.from(map.values());
}

// ── PURCHASE INVOICES ──
export function getStoredInvoices(): any[] {
  return getStorage<any>(INV_KEY);
}

export function addStoredInvoice(inv: any): any[] {
  const current = getStoredInvoices();
  const updated = [inv, ...current];
  saveStorage(INV_KEY, updated);
  return updated;
}

export function mergeInvoices(serverData: any[]): any[] {
  const local = getStoredInvoices();
  const map = new Map<string | number, any>();
  if (Array.isArray(serverData)) {
    serverData.forEach((s) => map.set(s.id || s.invoiceNumber, s));
  }
  local.forEach((l) => map.set(l.id || l.invoiceNumber, l));
  return Array.from(map.values());
}

// ── VENDOR PAYMENTS ──
export function getStoredPayments(): any[] {
  return getStorage<any>(PAY_KEY);
}

export function addStoredPayment(pay: any): any[] {
  const current = getStoredPayments();
  const updated = [pay, ...current];
  saveStorage(PAY_KEY, updated);
  return updated;
}

export function mergePayments(serverData: any[]): any[] {
  const local = getStoredPayments();
  const map = new Map<string | number, any>();

  if (Array.isArray(serverData)) {
    serverData.forEach((s) => map.set(s.id || s.billNumber, s));
  }
  local.forEach((l) => map.set(l.id || l.billNumber, l));
  return Array.from(map.values());
}
