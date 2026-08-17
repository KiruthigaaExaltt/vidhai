import { useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Database,
  MapPin,
  Palette,
  KeyRound,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import UserManagement from "./user-management";
import TemplateManager from "./templates";
import Locations from "./locations";
import AlertColors from "./alert-colors";
import Departments from "./departments";
import OrganizationDetails from "./OrganizationDetails";
import ModuleEncryptionSettings from "./module-encryption";
import { useAuth } from "@/lib/auth";

type View =
  | "general"
  | "users"
  | "departments"
  | "attendance"
  | "work-pattern"
  | "salary"
  | "holiday"
  | "leave"
  | "alerts"
  | "locations"
  | "module-encryption";
const templates: [View, string][] = [
  ["attendance", "Attendance Template"],
  ["work-pattern", "Work Pattern Template"],
  ["salary", "Salary Template"],
  ["holiday", "Holiday Template"],
  ["leave", "Leave Template"],
];
export default function Settings() {
  const { can, isSuperAdmin } = useAuth();
  const companyProfileAccess = can("settings.company_profile.view"),
    userAccess = can("settings.user_management.view"),
    masterAccess = can("settings.master_settings.view"),
    templateAccess = can("settings.templates.view"),
    alertAccess = can("settings.alert_colors.view"),
    locationAccess = can("settings.locations.view"),
    encryptionAccess = isSuperAdmin || can("settings.module_encryption.view");
  const accessibleViews = new Set<View>([
    ...(companyProfileAccess ? (["general"] as View[]) : []),
    ...(userAccess ? (["users"] as View[]) : []),
    ...(masterAccess ? (["departments"] as View[]) : []),
    ...(templateAccess ? templates.map(([key]) => key) : []),
    ...(alertAccess ? (["alerts"] as View[]) : []),
    ...(locationAccess ? (["locations"] as View[]) : []),
    ...(encryptionAccess ? (["module-encryption"] as View[]) : []),
  ]);
  const fallbackView = accessibleViews.values().next().value as View;
  const requestedView = new URLSearchParams(window.location.search).get(
    "section",
  ) as View | null;
  const [view, setView] = useState<View>(
    requestedView && accessibleViews.has(requestedView)
      ? requestedView
      : fallbackView,
  );
  const [expanded, setExpanded] = useState(true);
  const [mastersExpanded, setMastersExpanded] = useState(true);
  const selectView = (next: View, push = true) => {
    if (!accessibleViews.has(next)) return;
    setView(next);
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set("section", next);
      window.history.pushState({}, "", url);
    }
  };
  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search).get(
        "section",
      ) as View | null;
      setView(next && accessibleViews.has(next) ? next : fallbackView);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fallbackView]);
  const mobileOptions = [
    ...(companyProfileAccess ? [["general", "General"]] : []),
    ...(userAccess ? [["users", "User Management"]] : []),
    ...(masterAccess ? [["departments", "Master Settings � Departments"]] : []),
    ...(templateAccess
      ? templates.map(([key, label]) => [key, `Templates � ${label}`])
      : []),
    ...(alertAccess ? [["alerts", "Alert Colors"]] : []),
    ...(locationAccess ? [["locations", "Locations"]] : []),
    ...(encryptionAccess ? [["module-encryption", "Module Encryption"]] : []),
  ] as [View, string][];
  return (
    <Shell>
      <div className="min-h-[calc(100vh-72px)] w-full bg-muted/30 p-5 md:p-7">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        </div>
        <div className="mb-4 md:hidden">
          <label
            htmlFor="settings-section"
            className="mb-1.5 block text-sm font-medium"
          >
            Settings section
          </label>
          <select
            id="settings-section"
            value={view}
            onChange={(event) => selectView(event.target.value as View)}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {mobileOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <nav
            className="hidden h-fit min-w-0 p-1 md:block"
            aria-label="Settings sections"
          >
            {companyProfileAccess && (
              <Nav
                active={view === "general"}
                onClick={() => selectView("general")}
                icon={<SettingsIcon />}
              >
                General
              </Nav>
            )}
            {userAccess && (
              <Nav
                active={view === "users"}
                onClick={() => selectView("users")}
                icon={<Users />}
              >
                User Management
              </Nav>
            )}
            {masterAccess && (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm hover:bg-background/70"
                  onClick={() => setMastersExpanded(!mastersExpanded)}
                  aria-expanded={mastersExpanded}
                >
                  {mastersExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <Database className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">Master Settings</span>
                </button>
                {mastersExpanded && (
                  <div className="ml-7 border-l pl-2">
                    <button
                      type="button"
                      onClick={() => selectView("departments")}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${view === "departments" ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-background/70"}`}
                    >
                      <Building2 className="h-4 w-4 shrink-0" />
                      Departments
                    </button>
                  </div>
                )}
              </>
            )}
            {encryptionAccess && (
              <Nav
                active={view === "module-encryption"}
                onClick={() => selectView("module-encryption")}
                icon={<KeyRound />}
              >
                Module Encryption
              </Nav>
            )}{" "}
            {templateAccess && (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm hover:bg-background/70"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">Templates</span>
                </button>
                {expanded && (
                  <div className="ml-7 border-l pl-2">
                    {templates.map(([key, label]) => (
                      <button
                        type="button"
                        key={key}
                        onClick={() => selectView(key)}
                        className={`block w-full rounded-md px-3 py-2.5 text-left text-sm ${view === key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-background/70"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {alertAccess && (
              <Nav
                active={view === "alerts"}
                onClick={() => selectView("alerts")}
                icon={<Palette />}
              >
                Alert Colors
              </Nav>
            )}
            {locationAccess && (
              <Nav
                active={view === "locations"}
                onClick={() => selectView("locations")}
                icon={<MapPin />}
              >
                Locations
              </Nav>
            )}
          </nav>
          <section className="min-w-0 rounded-xl border bg-card p-5 shadow-sm md:p-7">
            {view === "general" && companyProfileAccess && (
              <OrganizationDetails />
            )}
            {view === "users" && userAccess && <UserManagement />}
            {view === "module-encryption" && encryptionAccess && (
              <ModuleEncryptionSettings />
            )}{" "}
            {view === "departments" && masterAccess && <Departments />}
            {templates.some(([k]) => k === view) && templateAccess && (
              <TemplateManager kind={view as any} />
            )}{" "}
            {view === "alerts" && alertAccess && <AlertColors />}
            {view === "locations" && locationAccess && <Locations />}
          </section>
        </div>
      </div>
    </Shell>
  );
}
function Nav({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  children: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "hover:bg-background/70"}`}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {children}
    </button>
  );
}
