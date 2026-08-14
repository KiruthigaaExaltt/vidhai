import { useEffect, useRef, useState } from "react";
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
<<<<<<< Updated upstream
  const mobileNavRef = useRef<HTMLElement>(null);
  const { can } = useAuth();
=======
  const { can, isSuperAdmin } = useAuth();
>>>>>>> Stashed changes
  const companyProfileAccess = can("settings.company_profile.view"),
    userAccess = can("settings.user_management.view"),
    templateAccess = can("settings.templates.view"),
    encryptionAccess = isSuperAdmin || can("settings.module_encryption.view");
  const [view, setView] = useState<View>(
      companyProfileAccess
        ? "general"
        : userAccess
          ? "users"
          : templateAccess
            ? "attendance"
            : encryptionAccess
              ? "module-encryption"
              : "attendance",
    ),
    [expanded, setExpanded] = useState(true),
    [mastersExpanded, setMastersExpanded] = useState(true);
  const mobileItems: [View, string][] = [
    ...(companyProfileAccess ? [["general", "General"] as [View, string]] : []),
    ...(userAccess
      ? [
          ["users", "Users"],
          ["departments", "Departments"],
        ] as [View, string][]
      : []),
    ...(templateAccess ? templates : []),
    ...(userAccess
      ? ([
          ["alerts", "Alert Colors"],
          ["locations", "Locations"],
        ] as [View, string][])
      : []),
  ];
  useEffect(() => {
    mobileNavRef.current
      ?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [view]);
  return (
    <Shell>
      <div className="min-h-[calc(100vh-72px)] w-full bg-muted/30 p-4 sm:p-5 md:p-7">
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        </div>
        <nav ref={mobileNavRef} aria-label="Settings sections" className="-mx-4 mb-4 snap-x snap-mandatory overflow-x-auto overscroll-x-contain border-y bg-card px-4 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-1">
            {mobileItems.map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-active={view === key}
                onClick={() => setView(key)}
                className={`shrink-0 snap-center whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${view === key ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="grid items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <nav className="sticky top-[96px] hidden h-fit min-w-0 p-1 md:block">
            {userAccess && (
              <>
                <Nav
                  active={view === "general"}
                  onClick={() => setView("general")}
                  icon={<SettingsIcon />}
                >
                  General
                </Nav>
                <Nav
                  active={view === "users"}
                  onClick={() => setView("users")}
                  icon={<Users />}
                >
                  User Management
                </Nav>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm hover:bg-background/70"
                  onClick={() => setMastersExpanded(!mastersExpanded)}
                >
                  {mastersExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Database className="h-4 w-4" />
                  Master Settings
                </button>
                {mastersExpanded && (
                  <div className="ml-7 border-l pl-2">
                    <button
                      type="button"
                      onClick={() => setView("departments")}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${view === "departments" ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-background/70"}`}
                    >
                      <Building2 className="h-4 w-4" />
                      Departments
                    </button>
                  </div>
                )}
              </>
            )}
            {encryptionAccess && (
              <Nav
                active={view === "module-encryption"}
                onClick={() => setView("module-encryption")}
                icon={<KeyRound />}
              >
                Module Encryption
              </Nav>
            )}
            {templateAccess && (
              <>
                <button
                  className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm hover:bg-background/70"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <ShieldCheck className="h-4 w-4" />
                  Templates
                </button>
                {expanded && (
                  <div className="ml-7 border-l pl-2">
                    {templates.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setView(key)}
                        className={`block w-full rounded-md px-3 py-2.5 text-left text-sm ${view === key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-background/70"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {userAccess && (
              <>
                <Nav
                  active={view === "alerts"}
                  onClick={() => setView("alerts")}
                  icon={<Palette />}
                >
                  Alert Colors
                </Nav>
                <Nav
                  active={view === "locations"}
                  onClick={() => setView("locations")}
                  icon={<MapPin />}
                >
                  Locations
                </Nav>
              </>
            )}
          </nav>
          <section className="settings-content min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5 md:p-7">
            {view === "general" && companyProfileAccess && (
              <OrganizationDetails />
            )}
            {view === "users" && userAccess && <UserManagement />}
            {view === "module-encryption" && encryptionAccess && (
              <ModuleEncryptionSettings />
            )}
            {view === "departments" && userAccess && <Departments />}
            {templates.some(([k]) => k === view) && templateAccess && (
              <TemplateManager kind={view as any} />
            )}{" "}
            {view === "alerts" && <AlertColors />}
            {view === "locations" && <Locations />}
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
