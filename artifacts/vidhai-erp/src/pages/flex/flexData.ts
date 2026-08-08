import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface FlexVendorOption {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}

export interface FlexItemOption {
  id: number;
  name: string;
  sku?: string | null;
  unit?: string;
  hsnSac?: string | null;
  buyPricePerUnit?: number | null;
}

export interface FlexDepartmentOption {
  id: number;
  name: string;
}
export interface FlexUserOption {
  id: number;
  name: string;
  department?: string | null;
}

export interface FlexWarehouseOption {
  id: number;
  code: string;
  name: string;
  address?: string | null;
}

export interface FlexMasterData {
  vendors: FlexVendorOption[];
  items: FlexItemOption[];
  users: FlexUserOption[];
  departments: FlexDepartmentOption[];
  projects: string[];
  warehouses: FlexWarehouseOption[];
}

export async function flexFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function useFlexMasterData() {
  return useQuery({
    queryKey: ["get", "/api/flex/master-data"],
    queryFn: () => flexFetch<FlexMasterData>("/api/flex/master-data"),
  });
}

export function useFlexPurchaseOrders() {
  return useQuery({
    queryKey: ["get", "/api/flex/purchase-orders"],
    queryFn: () => flexFetch<any[]>("/api/flex/purchase-orders"),
  });
}

export function useFlexGoodsReceipts() {
  return useQuery({
    queryKey: ["get", "/api/flex/goods-receipts"],
    queryFn: () => flexFetch<any[]>("/api/flex/goods-receipts"),
  });
}

export function useFlexPurchaseInvoices() {
  return useQuery({
    queryKey: ["get", "/api/flex/purchase-invoices"],
    queryFn: () => flexFetch<any[]>("/api/flex/purchase-invoices"),
  });
}

export function useFlexPurchaseRequests() {
  return useQuery({
    queryKey: ["get", "/api/flex/purchase-requests"],
    queryFn: () => flexFetch<any[]>("/api/flex/purchase-requests"),
  });
}
