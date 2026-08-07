export interface VendorItem {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

const STORAGE_KEY = "vidhai_shared_vendors_v1";

export const DEFAULT_SHARED_VENDORS: VendorItem[] = [
  { id: "CON00005", name: "Nish", phone: "9876543210", email: "nish@example.com" },
  { id: "CON00006", name: "Jagadeep", phone: "9876543211", email: "jagadeep@example.com" },
  { id: "CON00007", name: "Elakiya Shri", phone: "9876543212", email: "elakiya@example.com" },
  { id: "CON00008", name: "sample", phone: "9876543213", email: "sample@example.com" },
];

export function getStoredVendors(): VendorItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addStoredVendor(vendor: VendorItem): VendorItem[] {
  try {
    const current = getStoredVendors();
    const exists = current.some((v) => v.name.toLowerCase() === vendor.name.toLowerCase());
    if (exists) return current;
    const updated = [vendor, ...current];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function mergeVendors(apiVendors: VendorItem[]): VendorItem[] {
  const local = getStoredVendors();
  const map = new Map<string, VendorItem>();
  
  // 1. Add default vendors
  DEFAULT_SHARED_VENDORS.forEach((v) => map.set(v.name.toLowerCase(), v));
  // 2. Add API vendors from DB
  if (Array.isArray(apiVendors)) {
    apiVendors.forEach((v) => map.set(v.name.toLowerCase(), v));
  }
  // 3. Add stored vendors from local storage
  local.forEach((v) => map.set(v.name.toLowerCase(), v));

  return Array.from(map.values());
}
