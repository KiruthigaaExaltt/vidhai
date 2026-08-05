import React from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 ml-64 min-w-0 flex flex-col">
        <TopHeader />
        {children}
      </main>
    </div>
  );
}
