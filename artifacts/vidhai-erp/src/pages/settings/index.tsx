import { Shell } from "@/components/layout/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon } from "lucide-react";
import Locations from "./locations";
import AlertColors from "./alert-colors";
import Users from "./users";
import RolesPage from "./roles";

export default function Settings() {
  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
            
          </div>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="w-full justify-start rounded-sm border-b border-border bg-transparent p-0">
            <TabsTrigger value="general" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              General
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Users
            </TabsTrigger>
            <TabsTrigger value="roles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Roles & Permissions
            </TabsTrigger>
            <TabsTrigger value="alert-colors" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Alert Colors
            </TabsTrigger>
            <TabsTrigger value="locations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
              Locations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="pt-6">
            <div className="text-sm text-muted-foreground">
              General settings configuration will go here.
            </div>
          </TabsContent>

          <TabsContent value="users" className="pt-6">
            <Users />
          </TabsContent>

          <TabsContent value="roles" className="pt-6">
            <RolesPage />
          </TabsContent>

          <TabsContent value="alert-colors" className="pt-6">
            <AlertColors />
          </TabsContent>

          <TabsContent value="locations" className="pt-6">
            <Locations />
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}