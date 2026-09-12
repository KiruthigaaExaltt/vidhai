import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout } from "@workspace/api-client-react";
import {
  LogOut,
  Home,
  Box,
  Thermometer,
  Layers,
  Users,
  MapPin,
  FlaskConical,
  GitBranch,
  CalendarDays,
  CalendarCheck,
  ShoppingCart,
  Truck,
  BarChart2,
  ShieldCheck,
  CheckSquare,
  Settings as SettingsIcon,
  BookUser,
  UserCircle,
  RefreshCw,
  Download,
  Banknote,
  Building2,
  Landmark,
  History,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import vidhaiLogo from "@assets/vidhai-leaf.png";
import { usePwa } from "@/pwa/PwaProvider";
import { useSidebar } from "./SidebarContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACCOUNT_VIEW_PERMISSIONS = [
  "accounts.finance_dashboard.view",
  "accounts.customer_ledger.view",
  "accounts.vendor_ledger.view",
  "accounts.chart_of_accounts.view",
  "accounts.accounts_payable.view",
  "accounts.accounts_receivable.view",
  "accounts.journal_entries.view",
  "accounts.financial_statements.view",
];
const INVENTORY_VIEW_PERMISSIONS = [
  "inventory.stock.view",
  "inventory.materials.view",
  "inventory.categories.view",
  "inventory.warehouses.view",
  "inventory.assets.view",
];
const PROCUREMENT_VIEW_PERMISSIONS = [
  "flex.dashboard.view",
  "flex.purchase_requests.view",
  "flex.purchase_orders.view",
  "flex.goods_receipts.view",
  "flex.purchase_invoices.view",
  "flex.vendor_payments.view",
  "flex.purchase_returns.view",
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      setIsDesktop(mql.matches);
    };
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

let savedSidebarScrollTop = 0;

export function Sidebar({
  mobileOpen: propMobileOpen,
  onMobileClose: propOnMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
} = {}) {
  const [location] = useLocation();
  const asideRef = useRef<HTMLElement>(null);
  const navDivRef = useRef<HTMLDivElement>(null);
  const sidebarContext = useSidebar();
  const isDesktop = useIsDesktop();

  // On mobile (< 1024px), the drawer is ALWAYS the original full expanded view
  const isCollapsed = isDesktop && sidebarContext.isCollapsed;
  const toggleCollapsed = sidebarContext.toggleCollapsed;
  const mobileOpen = propMobileOpen !== undefined ? propMobileOpen : sidebarContext.mobileOpen;
  const handleMobileClose = () => {
    if (propOnMobileClose) {
      propOnMobileClose();
    } else {
      sidebarContext.setMobileOpen(false);
    }
  };

  const saveCurrentScroll = () => {
    const top =
      asideRef.current?.scrollTop ||
      navDivRef.current?.scrollTop ||
      savedSidebarScrollTop;
    if (top !== undefined && top >= 0) {
      savedSidebarScrollTop = top;
      try {
        sessionStorage.setItem("vidhai_sidebar_scroll", String(top));
      } catch {}
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const top = e.currentTarget.scrollTop;
    savedSidebarScrollTop = top;
    try {
      sessionStorage.setItem("vidhai_sidebar_scroll", String(top));
    } catch {}
  };

  useLayoutEffect(() => {
    const restore = () => {
      const top =
        savedSidebarScrollTop ||
        Number(sessionStorage.getItem("vidhai_sidebar_scroll") || 0);
      if (top > 0) {
        if (asideRef.current && asideRef.current.scrollTop !== top) {
          asideRef.current.scrollTop = top;
        }
        if (navDivRef.current && navDivRef.current.scrollTop !== top) {
          navDivRef.current.scrollTop = top;
        }
      } else {
        const activeEl = asideRef.current?.querySelector(".border-primary");
        if (activeEl) {
          activeEl.scrollIntoView({ block: "nearest" });
        }
      }
    };

    restore();
    const id1 = requestAnimationFrame(restore);
    const id2 = setTimeout(restore, 50);
    const id3 = setTimeout(restore, 150);
    return () => {
      cancelAnimationFrame(id1);
      clearTimeout(id2);
      clearTimeout(id3);
    };
  }, [location]);

  const { user, logout: clearUser, can, isModuleEnabled } = useAuth();
  const logoutMutation = useLogout();
  const pwa = usePwa();
  const hasAny = (permissions: string[]) => permissions.some(can);
  const hasAnnurAccess = hasAny([
    "production.batches.view",
    "production.chambers.view",
  ]);
  const hasOperationsAccess = hasAny([
    "crew.employees.view",
    "crew.attendance.view",
    "crew.leave.view",
    "crew.claims.view",
    "crew.overtime.view",
    "crew.bonus.view",
    "crew.deductions.view",
    "crewpay.salary_slip.view",
    "crewpay.payroll.view",
    "sales.quotations.view",
    "sales.proforma_invoices.view",
    "sales.delivery_challans.view",
    "sales.invoices.view",
    "sales.payments.view",
    "sales.returns.view",
    ...ACCOUNT_VIEW_PERMISSIONS,
    "fleet.vehicles.view",
    "reports.view",
    "traceability.view",
    ...PROCUREMENT_VIEW_PERMISSIONS,
  ]);
  const hasSettingsAccess = hasAny([
    "settings.company_profile.view",
    "settings.user_management.view",
    "settings.templates.view",
    "settings.master_settings.view",
    "settings.alert_colors.view",
    "settings.locations.view",
    "settings.module_encryption.view",
  ]);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      console.error(error);
    } finally {
      clearUser();
    }
  };

  const NavItem = ({
    href,
    icon: Icon,
    label,
    disabled = false,
    exact = false,
    permission,
  }: {
    href: string;
    icon: any;
    label: string;
    disabled?: boolean;
    exact?: boolean;
    permission?: string | string[];
  }) => {
    if (
      permission &&
      !(Array.isArray(permission) ? permission.some(can) : can(permission))
    )
      return null;

    const isActive = exact
      ? location === href
      : location === href || location.startsWith(href + "/");

    if (disabled) {
      if (isCollapsed) {
        return (
          <div className="flex items-center justify-center h-10 w-10 mx-auto my-0.5 rounded-lg text-sidebar-foreground/25 cursor-not-allowed">
            <Icon className="w-5 h-5 shrink-0" />
          </div>
        );
      }
      return (
        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-sidebar-foreground/30 cursor-not-allowed">
          <Icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      );
    }

    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={href}
              onClick={() => {
                saveCurrentScroll();
                handleMobileClose();
              }}
              aria-label={label}
              className={`flex items-center justify-center h-10 w-10 mx-auto my-0.5 rounded-lg transition-all ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary font-semibold shadow-2xs ring-1 ring-sidebar-primary/40"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive ? "text-sidebar-primary" : ""
                }`}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={14}
            className="z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1.5 text-xs font-semibold rounded-md shadow-lg border border-slate-700/50 pointer-events-none"
          >
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        href={href}
        onClick={() => {
          saveCurrentScroll();
          handleMobileClose();
        }}
        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-l-2 border-transparent"
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors ${
            isActive ? "text-sidebar-primary" : ""
          }`}
        />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => {
    if (isCollapsed) {
      return <div className="my-1.5 border-t border-sidebar-border/50 mx-3.5" />;
    }
    return (
      <div className="px-4 py-2 mt-4 text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase truncate">
        {children}
      </div>
    );
  };

  const isProfileActive = location === "/profile";

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-xs lg:hidden"
          onClick={handleMobileClose}
        />
      )}
      <aside
        ref={asideRef}
        onScroll={handleScroll}
        className={`fixed left-0 top-0 z-50 flex h-[100svh] flex-col overflow-x-hidden border-r border-sidebar-border bg-sidebar accounts-scroll transition-all duration-300 ease-in-out lg:z-30 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${isCollapsed ? "w-64 lg:w-[76px]" : "w-64 lg:w-[260px]"}`}
      >
        {/* Sidebar Header: Logo & Branding + Collapse/Expand Toggle / Mobile Close Button */}
        <div
          className={`flex h-16 lg:h-[72px] shrink-0 items-center border-b border-sidebar-border transition-all duration-300 ${
            isCollapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-1">
              <img
                src={vidhaiLogo}
                alt="Vidhai logo"
                className="w-8 h-8 shrink-0 object-contain"
              />
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:inline-flex h-6 w-8 items-center justify-center rounded-md border border-sidebar-border/80 bg-sidebar text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-primary hover:border-primary/40 transition-all shadow-2xs active:scale-95"
                aria-label="Expand sidebar (Ctrl+B)"
                title="Expand sidebar (Ctrl+B)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                <img
                  src={vidhaiLogo}
                  alt="Vidhai logo"
                  className="w-9 h-9 shrink-0 object-contain"
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-serif font-bold text-lg leading-none tracking-wider text-sidebar-primary truncate">
                    Vidhai
                  </span>
                  <span className="text-[10px] tracking-widest text-sidebar-foreground/50 truncate">
                    ERP SYSTEM
                  </span>
                </div>
              </div>
              {/* Desktop collapse toggle */}
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border/80 bg-sidebar text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-primary hover:border-primary/40 transition-all shadow-2xs active:scale-95"
                aria-label="Collapse sidebar (Ctrl+B)"
                title="Collapse sidebar (Ctrl+B)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* Mobile close button */}
              <button
                type="button"
                aria-label="Close navigation"
                onClick={handleMobileClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Scrollable Navigation Menu */}
        <div
          ref={navDivRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden pb-4 accounts-scroll"
        >
          {/* ── Top-level items ── */}
          <NavItem
            href="/"
            icon={Home}
            label="Dashboard"
            permission="dashboard.view"
            exact
          />
          <NavItem
            href="/crm"
            icon={BookUser}
            label="CRM"
            permission="crm.contacts.view"
          />
          <NavItem
            href="/tasks"
            icon={CheckSquare}
            label="Tasks"
            permission="task.task_board.view"
          />
          <NavItem
            href="/scheduling"
            icon={CalendarDays}
            label="Calendar"
            permission="scheduling.calendar.view"
            exact
          />
          <NavItem
            href="/scheduling/suggest"
            icon={CalendarCheck}
            label="Plan Schedule"
            permission="scheduling.plan_schedule.view"
          />

          {/* ── Location A — Annur ── */}
          {hasAnnurAccess && <SectionTitle>ANNUR · LOCATION A</SectionTitle>}
          <NavItem
            href="/annur/batches"
            icon={Box}
            label="Batches"
            permission="production.batches.view"
          />
          <NavItem
            href="/annur/chambers"
            icon={Thermometer}
            label="Chambers"
            permission="production.chambers.view"
          />

          {/* ── Location B — Ooty ── */}
          {can("production.growing_rooms.view") && (
            <SectionTitle>OOTY · LOCATION B</SectionTitle>
          )}
          <NavItem
            href="/ooty"
            icon={Thermometer}
            label="Growing Rooms"
            permission="production.growing_rooms.view"
            exact
          />
          <NavItem
            href="/ooty/history"
            icon={History}
            label="Room History"
            permission="production.growing_rooms.view"
          />

          {/* ── Location C — Coimbatore ── */}
          {can("production.casing_soil.view") && (
            <SectionTitle>COIMBATORE · LOCATION C</SectionTitle>
          )}
          <NavItem
            href="/coimbatore/batches"
            icon={Layers}
            label="Casing Soil Batches"
            permission="production.casing_soil.view"
          />
          <NavItem
            href="/coimbatore/chambers"
            icon={Thermometer}
            label="Casing Soil Chambers"
            permission="production.chambers.view"
          />

          {/* ── Location D — Lab ── */}
          {can("production.spawn_batches.view") && (
            <SectionTitle>LAB · LOCATION D</SectionTitle>
          )}
          <NavItem
            href="/lab/batches"
            icon={FlaskConical}
            label="Spawn Batches"
            permission="production.spawn_batches.view"
          />

          {/* ── Cross-site operations ── */}
          {hasOperationsAccess && <SectionTitle>OPERATIONS</SectionTitle>}
          {(can("crew.employees.view") ||
            can("crew.attendance.view") ||
            can("crew.leave.view") ||
            can("crew.claims.view") ||
            can("crew.overtime.view") ||
            can("crew.bonus.view") ||
            can("crew.deductions.view")) && (
            <NavItem href="/crew" icon={Users} label="Crew" />
          )}
          {can("crewpay.salary_slip.view") && (
            <NavItem href="/crewpay" icon={Banknote} label="CrewPay" />
          )}
          <NavItem
            href="/sales"
            icon={ShoppingCart}
            label="Sales"
            permission={[
              "sales.quotations.view",
              "sales.proforma_invoices.view",
              "sales.delivery_challans.view",
              "sales.invoices.view",
              "sales.payments.view",
              "sales.returns.view",
            ]}
          />
          {isModuleEnabled("ledger") && hasAny(ACCOUNT_VIEW_PERMISSIONS) && (
            <NavItem href="/accounts" icon={Landmark} label="Accounts" />
          )}
          <NavItem
            href="/fleet"
            icon={Truck}
            label="Vehicle Fleet"
            permission="fleet.vehicles.view"
          />
          <NavItem
            href="/reports"
            icon={BarChart2}
            label="Reports"
            permission="reports.view"
          />
          <NavItem
            href="/traceability"
            icon={GitBranch}
            label="Traceability"
            permission="traceability.view"
          />
          {/* User-facing name: Procurement. Internal routes, APIs, and permissions remain `flex`. */}
          <NavItem
            href="/flex"
            icon={Box}
            label="Procurement"
            permission={PROCUREMENT_VIEW_PERMISSIONS}
          />

          {/* ── System ── */}
          {(hasAny(INVENTORY_VIEW_PERMISSIONS) || hasSettingsAccess) && (
            <SectionTitle>SYSTEM</SectionTitle>
          )}
          <NavItem
            href="/inventory"
            icon={Layers}
            label="Inventory"
            permission={INVENTORY_VIEW_PERMISSIONS}
          />
          {hasSettingsAccess && (
            <NavItem href="/settings" icon={SettingsIcon} label="Settings" />
          )}
        </div>

        {/* ── User card — click to open profile (Optional footer) ── */}
        <div className="hidden">
          <Link
            href="/profile"
            onClick={() => {
              saveCurrentScroll();
              handleMobileClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 w-full transition-colors ${
              isProfileActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/50"
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <UserCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col overflow-hidden flex-1 min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                {user?.displayName}
              </span>
              <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider">
                {user?.role}
              </span>
            </div>
          </Link>
          <div className="px-4 pb-3">
            {!pwa.standalone && (
              <Button
                variant="ghost"
                size="sm"
                disabled={!pwa.installAvailable && !pwa.iosInstallAvailable}
                onClick={() => void pwa.install()}
                title={
                  pwa.installAvailable || pwa.iosInstallAvailable
                    ? "Install Vidhai ERP"
                    : "Install becomes available in the production PWA build"
                }
                className="mb-1 w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs h-7 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pwa.updating}
              onClick={() =>
                void (pwa.updateAvailable
                  ? pwa.applyUpdate()
                  : pwa.checkForUpdates())
              }
              className="mb-1 w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs h-7"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {pwa.updating ? "Updating…" : "Update App"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs h-7"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

