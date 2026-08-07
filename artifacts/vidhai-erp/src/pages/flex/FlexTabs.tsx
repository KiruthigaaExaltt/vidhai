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
  { label: "Dashboard", href: "/flex", icon: LayoutDashboard },
  { label: "Purchase Requests", href: "/flex/purchase-requests", icon: ClipboardList },
  { label: "Purchase Orders", href: "/flex/purchase-orders", icon: ShoppingCart },
  { label: "Goods Receipts", href: "/flex/goods-receipts", icon: PackageCheck },
  { label: "Purchase Invoices", href: "/flex/purchase-invoices", icon: Receipt },
  { label: "Vendor Payments", href: "/flex/vendor-payments", icon: CreditCard },
  { label: "Purchase Returns", href: "/flex/purchase-returns", icon: RotateCcw },
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
    <div className="w-full overflow-x-auto border-b border-border/80 pb-2 mb-6 scrollbar-none">
      <nav className="flex items-center gap-1.5 min-w-max">
        {FLEX_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                active
                  ? "bg-primary/15 text-primary border border-primary/40 font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
