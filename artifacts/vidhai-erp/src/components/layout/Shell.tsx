import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="flex min-h-[100svh] bg-background text-foreground">
      <Sidebar
        mobileOpen={mobileNavigationOpen}
        onMobileClose={() => setMobileNavigationOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col lg:ml-64">
        <TopHeader onOpenNavigation={() => setMobileNavigationOpen(true)} />
        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
