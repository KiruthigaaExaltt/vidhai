import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout } from "@workspace/api-client-react";
import {
  LogOut, Home, Box, Thermometer, Layers,
  Users, MapPin, FlaskConical, GitBranch, CalendarDays, Sparkles,
  ShoppingCart, Truck, BarChart2, ShieldCheck, CheckSquare,
  Settings as SettingsIcon, BookUser, UserCircle, RefreshCw, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import vidhaiLogo from "@assets/vidhai-logo-transparent.png";
import { usePwa } from "@/pwa/PwaProvider";

const VidhaiLogo = () => (
  <div className="flex items-center gap-3 px-4 py-4 mb-4">
    <img src={vidhaiLogo} alt="Vidhai logo" className="w-10 h-10 object-contain" />
    <div className="flex flex-col">
      <span className="font-serif font-bold text-lg leading-none tracking-wider text-sidebar-primary">VIDHAI</span>
      <span className="text-[10px] tracking-widest text-sidebar-foreground/50">SYSTEMS</span>
    </div>
  </div>
);

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout: clearUser, can } = useAuth();
  const logoutMutation = useLogout();
  const pwa = usePwa();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      clearUser();
    } catch (error) {
      console.error(error);
    }
  };

  const NavItem = ({
    href,
    icon: Icon,
    label,
    disabled = false,
    exact = false,
  }: {
    href: string;
    icon: any;
    label: string;
    disabled?: boolean;
    exact?: boolean;
  }) => {
    const isActive = exact
      ? location === href
      : location === href || location.startsWith(href + "/");

    if (disabled) {
      return (
        <div className="flex items-center gap-3 px-4 py-2 text-sm text-sidebar-foreground/30 cursor-not-allowed">
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </div>
      );
    }

    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground border-l-2 border-transparent"
        }`}
      >
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </Link>
    );
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="px-4 py-2 mt-4 text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
      {children}
    </div>
  );

  const isProfileActive = location === "/profile";

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border h-screen flex flex-col fixed left-0 top-0 overflow-y-auto">
      <VidhaiLogo />

      <div className="flex-1 overflow-y-auto pb-4">
        {/* ── Top-level items ── */}
        <NavItem href="/" icon={Home} label="Dashboard" exact />
        <NavItem href="/crm" icon={BookUser} label="CRM" />
        <NavItem href="/tasks" icon={CheckSquare} label="Tasks" />
        <NavItem href="/scheduling" icon={CalendarDays} label="Calendar" exact />
        <NavItem href="/scheduling/suggest" icon={Sparkles} label="Plan Schedule" />

        {/* ── Location A — Annur ── */}
        <SectionTitle>ANNUR · LOCATION A</SectionTitle>
        <NavItem href="/annur/batches" icon={Box} label="Batches" />
        <NavItem href="/annur/chambers" icon={Thermometer} label="Chambers" />

        {/* ── Location B — Ooty ── */}
        <SectionTitle>OOTY · LOCATION B</SectionTitle>
        <NavItem href="/ooty" icon={Thermometer} label="Growing Rooms" />

        {/* ── Location C — Coimbatore ── */}
        <SectionTitle>COIMBATORE · LOCATION C</SectionTitle>
        <NavItem href="/coimbatore/batches" icon={Layers} label="Casing Soil Batches" />

        {/* ── Location D — Lab ── */}
        <SectionTitle>LAB · LOCATION D</SectionTitle>
        <NavItem href="/lab/batches" icon={FlaskConical} label="Spawn Batches" />

        {/* ── Cross-site operations ── */}
        <SectionTitle>OPERATIONS</SectionTitle>
        {(can("crew.employees.view") || can("crew.attendance.view") || can("crew.leave.view") || can("crew.claims.view") || can("crew.overtime.view") || can("crew.bonus.view") || can("crew.deductions.view")) && (
          <NavItem href="/crew" icon={Users} label="Crew" />
        )}
        <NavItem href="/sales" icon={ShoppingCart} label="Sales" />
        <NavItem href="/fleet" icon={Truck} label="Vehicle Fleet" />
        <NavItem href="/reports" icon={BarChart2} label="Reports" />
        <NavItem href="/traceability" icon={GitBranch} label="Traceability" />

        {/* ── System ── */}
        <SectionTitle>SYSTEM</SectionTitle>
        <NavItem href="/inventory" icon={Layers} label="Inventory" />
        {(can("settings.user_management.view") || can("settings.templates.view")) && (
          <NavItem href="/settings" icon={SettingsIcon} label="Settings" />
        )}
      </div>

      {/* ── User card — click to open profile ── */}
      <div className="hidden">
        <Link
          href="/profile"
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
              title={pwa.installAvailable || pwa.iosInstallAvailable ? "Install Vidhai ERP" : "Install becomes available in the production PWA build"}
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
            onClick={() => void (pwa.updateAvailable ? pwa.applyUpdate() : pwa.checkForUpdates())}
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
    </div>
  );
}
