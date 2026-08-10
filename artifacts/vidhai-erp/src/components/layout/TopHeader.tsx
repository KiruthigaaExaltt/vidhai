import { useLocation } from "wouter";
import { useLogout } from "@workspace/api-client-react";
import {
  ChevronDown,
  Download,
  LogOut,
  Menu,
  RefreshCw,
  UserCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePwa } from "@/pwa/PwaProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopHeader({
  onOpenNavigation,
}: {
  onOpenNavigation: () => void;
}) {
  const [, navigate] = useLocation();
  const { user, logout: clearUser } = useAuth();
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

  const initial = user?.displayName?.trim().charAt(0).toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-3 backdrop-blur sm:px-6 lg:h-[72px] lg:justify-end">
      <button
        type="button"
        onClick={onOpenNavigation}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initial}
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="max-w-40 truncate text-sm font-medium leading-tight">
                {user?.displayName || "User"}
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                {user?.role}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="font-medium">{user?.displayName || "User"}</span>
              <span className="text-xs capitalize text-muted-foreground">
                {user?.role}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/profile")}>
            <UserCircle />
            Profile
          </DropdownMenuItem>
          {!pwa.standalone && (
            <DropdownMenuItem
              disabled={!pwa.installAvailable && !pwa.iosInstallAvailable}
              onSelect={() => void pwa.install()}
            >
              <Download />
              Install App
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={pwa.updating}
            onSelect={() =>
              void (pwa.updateAvailable
                ? pwa.applyUpdate()
                : pwa.checkForUpdates())
            }
          >
            <RefreshCw />
            {pwa.updating ? "Updating…" : "Update App"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void handleLogout()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
