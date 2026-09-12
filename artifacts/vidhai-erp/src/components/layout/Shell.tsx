import React from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { SidebarProvider, useSidebar } from "./SidebarContext";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isCollapsed, setMobileOpen } = useSidebar();

  return (
    <div className="flex min-h-[100svh] bg-background text-foreground">
      <Sidebar />
      <main
        className={`flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out ${
          isCollapsed ? "lg:ml-[76px]" : "lg:ml-[260px]"
        }`}
      >
        <TopHeader onOpenNavigation={() => setMobileOpen(true)} />
        <div className="app-content min-w-0 flex-1 overflow-x-clip">{children}</div>
      </main>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
