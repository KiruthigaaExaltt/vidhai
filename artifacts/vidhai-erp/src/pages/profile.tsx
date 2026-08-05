import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, KeyRound, Save, Shield, MapPin } from "lucide-react";

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  admin: { label: "Admin", variant: "default" },
  manager: { label: "Manager", variant: "secondary" },
  operator: { label: "Operator", variant: "outline" },
  viewer: { label: "Viewer", variant: "outline" },
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function patchUser(id: number, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Failed to update profile");
  }
  return res.json();
}

export default function Profile() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Personal details state ──
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingDetails, setSavingDetails] = useState(false);

  // ── Password state ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return null;

  const locationScope: string[] = Array.isArray((user as any).locationScope)
    ? (user as any).locationScope
    : [];

  const roleInfo = ROLE_LABELS[user.role] ?? { label: user.role, variant: "outline" as const };

  const handleSaveDetails = async () => {
    if (!displayName.trim()) {
      toast({ title: "Display name cannot be empty", variant: "destructive" });
      return;
    }
    setSavingDetails(true);
    try {
      const updated = await patchUser(user.id, { displayName: displayName.trim() });
      // Refresh auth state
      login({ ...user, displayName: updated.displayName });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/auth/me"] });
      toast({ title: "Profile updated", description: "Your display name has been saved." });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      toast({ title: "New password is required", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await patchUser(user.id, { password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
    } catch (e: any) {
      toast({ title: "Password change failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Shell>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
            <UserCircle className="w-9 h-9 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{user.displayName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
              <span className="text-xs text-muted-foreground font-mono">@{user.username}</span>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-primary" />
              Account Details
            </CardTitle>
            <CardDescription>Update your display name and view your account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={user.username}
                  disabled
                  className="bg-muted/50 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Username cannot be changed.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  disabled
                  className="bg-muted/50"
                />
                <p className="text-[11px] text-muted-foreground">Contact an admin to change your role.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            {locationScope.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> Location Access
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {locationScope.map((loc) => (
                    <Badge key={loc} variant="secondary" className="font-mono text-xs">
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveDetails}
                disabled={savingDetails || displayName.trim() === user.displayName}
                size="sm"
                className="gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {savingDetails ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>Set a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
              {confirmPassword && newPassword === confirmPassword && confirmPassword.length >= 6 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Passwords match ✓</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleChangePassword}
                disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
                size="sm"
                variant="outline"
                className="gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {savingPassword ? "Updating…" : "Update Password"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Info Footer */}
        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Your account is managed by Vidhai ERP. Role and access scope changes require an administrator.
                {user.role === "admin" && (
                  <> You can manage all users from <a href={`${BASE}/settings`} className="underline underline-offset-2 hover:text-foreground">Settings → User Management</a>.</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
