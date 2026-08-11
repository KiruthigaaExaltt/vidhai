import { FLEX_TEXT } from "./flexText";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ClipboardList,
  ShoppingCart,
  PackageCheck,
  Receipt,
  CreditCard,
  RotateCcw,
} from "lucide-react";

export interface FlexTabItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

export const FLEX_TABS: FlexTabItem[] = [
  { label: FLEX_TEXT.dashboard, href: "/flex", icon: LayoutDashboard },
  {
    label: FLEX_TEXT.purchaseRequests,
    href: "/flex/purchase-requests",
    icon: ClipboardList,
  },
  {
    label: FLEX_TEXT.purchaseOrders,
    href: "/flex/purchase-orders",
    icon: ShoppingCart,
  },
  {
    label: FLEX_TEXT.goodsReceipts,
    href: "/flex/goods-receipts",
    icon: PackageCheck,
  },
  {
    label: FLEX_TEXT.purchaseInvoices,
    href: "/flex/purchase-invoices",
    icon: Receipt,
  },
  {
    label: FLEX_TEXT.vendorPayments,
    href: "/flex/vendor-payments",
    icon: CreditCard,
  },
  {
    label: FLEX_TEXT.purchaseReturns,
    href: "/flex/purchase-returns",
    icon: RotateCcw,
  },
];

export function FlexTabs() {
  const [location] = useLocation();

  const isTabActive = (href: string) => {
    if (href === "/flex") {
      return location === "/flex" || location === "/flex/";
    }
    return location === href || location.startsWith(href + "/");
  };

  return (
    <div className="mb-5 w-full overflow-x-auto border-b border-border bg-card scrollbar-none">
      <nav className="flex min-w-max items-center">
        {FLEX_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
