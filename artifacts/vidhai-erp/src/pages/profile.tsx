import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Shell } from "@/components/layout/Shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  UserCircle,
  KeyRound,
  Save,
  Camera,
  Briefcase,
  Lock,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";

const ROLE_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  admin: { label: "Admin", variant: "default" },
  manager: { label: "Manager", variant: "secondary" },
  operator: { label: "Operator", variant: "outline" },
  viewer: { label: "Viewer", variant: "outline" },
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function changeOwnPassword(body: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const res = await fetch(BASE + "/api/users/me/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error ?? "Failed to change password");
  return result;
}
async function patchProfile(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/users/me/profile`, {
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
  const { user, login, can, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // ── Phase 1: Profile details state ──
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState((user as any)?.email ?? "");
  const [savedDetails, setSavedDetails] = useState({
    displayName: user?.displayName ?? "",
    email: (user as any)?.email ?? "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPicture, setSavingPicture] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState((user as any)?.avatarUrl ?? "");

  // ── Phase 2: Employee details state (UI only for now — wired to backend later) ──
  const [department, setDepartment] = useState((user as any)?.department ?? "");
  const [designation, setDesignation] = useState(
    (user as any)?.designation ?? "",
  );
  const [phoneNumber, setPhoneNumber] = useState(
    (user as any)?.phoneNumber ?? "",
  );
  const [workLocation, setWorkLocation] = useState(
    (user as any)?.workLocation ?? "",
  );
  const [dob, setDob] = useState((user as any)?.dob ?? "");
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [savedEmployeeDetails, setSavedEmployeeDetails] = useState({
    department: (user as any)?.department ?? "",
    designation: (user as any)?.designation ?? "",
    phoneNumber: (user as any)?.phoneNumber ?? "",
    workLocation: (user as any)?.workLocation ?? "",
    dob: (user as any)?.dob ? String((user as any).dob).slice(0, 10) : "",
  });

  // ── Phase 3: Password state ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setEmail((user as any).email ?? "");
    setSavedDetails({
      displayName: user.displayName ?? "",
      email: (user as any).email ?? "",
    });
    setAvatarUrl((user as any).avatarUrl ?? "");
    setDepartment((user as any).department ?? "");
    setDesignation((user as any).designation ?? "");
    setPhoneNumber((user as any).phoneNumber ?? "");
    setWorkLocation((user as any).workLocation ?? "");
    setDob(
      (user as any).dob
        ? String((user as any).dob).slice(0, 10)
        : "",
    );
    setSavedEmployeeDetails({
      department: (user as any).department ?? "",
      designation: (user as any).designation ?? "",
      phoneNumber: (user as any).phoneNumber ?? "",
      workLocation: (user as any).workLocation ?? "",
      dob: (user as any).dob ? String((user as any).dob).slice(0, 10) : "",
    });
  }, [user?.id]);

  if (!user) return null;

  const roleInfo = ROLE_LABELS[user.role] ?? {
    label: user.role,
    variant: "outline" as const,
  };
  const initial = user.displayName?.charAt(0)?.toUpperCase() ?? "U";
  const normalizedDetails = {
    displayName: displayName.trim(),
    email: email.trim().toLowerCase(),
  };
  const detailsChanged =
    normalizedDetails.displayName !== savedDetails.displayName.trim() ||
    normalizedDetails.email !== savedDetails.email.trim().toLowerCase();
  const canEditWorkDetails =
    isSuperAdmin || can("settings.user_management.update");
  const employeeDetailsChanged =
    phoneNumber.trim() !== savedEmployeeDetails.phoneNumber.trim() ||
    dob !== savedEmployeeDetails.dob ||
    (canEditWorkDetails &&
      (department.trim() !== savedEmployeeDetails.department.trim() ||
        designation.trim() !== savedEmployeeDetails.designation.trim() ||
        workLocation.trim() !== savedEmployeeDetails.workLocation.trim()));

  // ── Phase 1 handler ──
  const handleSaveDetails = async () => {
    if (!displayName.trim()) {
      toast({ title: "Display name cannot be empty", variant: "destructive" });
      return;
    }
    setSavingDetails(true);
    try {
      const updated = await patchProfile({
        displayName: normalizedDetails.displayName,
        email: normalizedDetails.email,
      });
      setDisplayName(updated.displayName ?? normalizedDetails.displayName);
      setEmail(updated.email ?? normalizedDetails.email);
      setSavedDetails({
        displayName: updated.displayName ?? normalizedDetails.displayName,
        email: updated.email ?? normalizedDetails.email,
      });
      login({ ...user, ...updated });
      queryClient.invalidateQueries({ queryKey: ["get", "/api/auth/me"] });
      toast({
        title: "Profile updated",
        description: "Your details have been saved.",
      });
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const handlePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(
        file.type,
      )
    ) {
      toast({
        title: "Choose a JPEG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Picture must be 5 MB or smaller", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const nextAvatar = String(reader.result ?? "");
      setSavingPicture(true);
      try {
        const updated = await patchProfile({ avatarUrl: nextAvatar });
        setAvatarUrl(updated.avatarUrl ?? "");
        login({ ...user, ...updated });
        window.dispatchEvent(
          new CustomEvent("profile-avatar-updated", {
            detail: { userId: user.id },
          }),
        );
        await queryClient.invalidateQueries({
          queryKey: ["get", "/api/auth/me"],
        });
        toast({ title: "Profile picture updated" });
      } catch (e: any) {
        toast({
          title: "Picture update failed",
          description: e.message,
          variant: "destructive",
        });
      } finally {
        setSavingPicture(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePicture = async () => {
    setSavingPicture(true);
    try {
      const updated = await patchProfile({ avatarUrl: "" });
      setAvatarUrl("");
      login({ ...user, ...updated, avatarUrl: "" } as any);
      window.dispatchEvent(
        new CustomEvent("profile-avatar-updated", {
          detail: { userId: user.id },
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: ["get", "/api/auth/me"],
      });
      toast({ title: "Profile picture removed" });
    } catch (e: any) {
      toast({
        title: "Picture removal failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSavingPicture(false);
    }
  };

  // ── Phase 2 handler (UI only — backend wiring comes later) ──
  const handleSaveEmployee = async () => {
    setSavingEmployee(true);

    try {
      const updated = await patchProfile({
        phoneNumber,
        dob,
        ...(canEditWorkDetails
          ? { department, designation, workLocation }
          : {}),
      });

      setSavedEmployeeDetails({
        department: updated.department ?? department,
        designation: updated.designation ?? designation,
        phoneNumber: updated.phoneNumber ?? phoneNumber,
        workLocation: updated.workLocation ?? workLocation,
        dob: updated.dob ? String(updated.dob).slice(0, 10) : "",
      });
      login({ ...user, ...updated });

      queryClient.invalidateQueries({
        queryKey: ["get", "/api/auth/me"],
      });

      toast({
        title: "Employee details saved",
        description: "Your profile has been updated successfully.",
      });
    } catch (e: any) {
      toast({
        title: "Update failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSavingEmployee(false);
    }
  };

  // ── Phase 3 handler ──
  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast({ title: "Current password is required", variant: "destructive" });
      return;
    }
    if (!newPassword) {
      toast({ title: "New password is required", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await changeOwnPassword({
        oldPassword: currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    } catch (e: any) {
      toast({
        title: "Password change failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Shell>
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account details, profile picture, and password.
          </p>
        </div>

        {/* ── Phase 1: Avatar + Profile Details ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Avatar card */}
          <Card className="rounded-md border-border shadow-md">
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center mb-4 overflow-hidden">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`${user.displayName}'s profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-primary">{initial}</span>
                )}
              </div>
              <div className="text-lg font-bold tracking-tight">
                {user.displayName}
              </div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                @{user.username}
              </div>
              <Badge variant={roleInfo.variant} className="mt-2 rounded-md">
                {roleInfo.label}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                className="mt-5 rounded-md gap-2 w-full"
                onClick={() => pictureInputRef.current?.click()}
                disabled={savingPicture}
              >
                <Camera className="w-3.5 h-3.5" />
                {savingPicture
                  ? "Updating…"
                  : avatarUrl
                    ? "Edit Picture"
                    : "Add Picture"}
              </Button>
              <input
                ref={pictureInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePictureChange}
              />
              {avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full gap-2 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleRemovePicture}
                  disabled={savingPicture}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Picture
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                JPEG, PNG, or WebP. Maximum 5 MB.
              </p>
            </CardContent>
          </Card>

          {/* Profile details card */}
          <Card className="rounded-md border-border shadow-md">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <UserCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">Profile Details</div>
                  <div className="text-xs text-muted-foreground">
                    Your account information
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (detailsChanged && !savingDetails)
                    void handleSaveDetails();
                }}
              >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">Full Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={user.username}
                    disabled
                    className="rounded-md bg-muted/50 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={
                      user.role.charAt(0).toUpperCase() + user.role.slice(1)
                    }
                    disabled
                    className="rounded-md bg-muted/50"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingDetails || !detailsChanged}
                  size="sm"
                  className="rounded-md gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingDetails ? "Saving…" : "Save Changes"}
                </Button>
              </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── Phase 2: Employee Details ── */}
        <Card className="rounded-md border-border shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-base font-semibold">Employee Details</div>
                <div className="text-xs text-muted-foreground">
                  Editable work and crew information
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Employee Code</Label>
                <Input
                  value={(user as any)?.employeeCode ?? "—"}
                  disabled
                  className="rounded-md bg-muted/50 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!canEditWorkDetails}
                  placeholder="e.g. Production"
                  className="rounded-md disabled:bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reporting Manager</Label>
                <Input
                  value={(user as any)?.reportingManager ?? "—"}
                  disabled
                  className="rounded-md bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  disabled={!canEditWorkDetails}
                  placeholder="e.g. Full-Stack Developer"
                  className="rounded-md disabled:bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Joining Date</Label>
                <Input
                  value={(user as any)?.joiningDate ?? "—"}
                  disabled
                  className="rounded-md bg-muted/50 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Employment Type</Label>
                <Input
                  value={(user as any)?.employmentType ?? "Full-time"}
                  disabled
                  className="rounded-md bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workLocation">Work Location</Label>
                <Input
                  id="workLocation"
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                  disabled={!canEditWorkDetails}
                  placeholder="e.g. Coimbatore HQ"
                  className="rounded-md disabled:bg-muted/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="rounded-md font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dob">Date of Birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                  className="rounded-md font-mono cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="pt-1.5">
                  <Badge variant="secondary" className="rounded-md">
                    {(user as any)?.status ?? "Active"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveEmployee}
                disabled={savingEmployee || !employeeDetailsChanged}
                size="sm"
                className="rounded-md gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                {savingEmployee ? "Saving…" : "Save Employee Details"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Phase 3: Change Password ── */}
        <Card className="rounded-md border-border shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-base font-semibold">Change Password</div>
                <div className="text-xs text-muted-foreground">
                  Verify your current password before choosing a new one
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Old Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                  className="rounded-md pr-10"
                />
                <PasswordVisibilityButton
                  visible={showCurrentPassword}
                  onToggle={() => setShowCurrentPassword((value) => !value)}
                  label="old password"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="rounded-md pr-10"
                  />
                  <PasswordVisibilityButton
                    visible={showNewPassword}
                    onToggle={() => setShowNewPassword((value) => !value)}
                    label="new password"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    className="rounded-md pr-10"
                  />
                  <PasswordVisibilityButton
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((value) => !value)}
                    label="confirmed password"
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">
                    Passwords do not match
                  </p>
                )}
                {confirmPassword &&
                  newPassword === confirmPassword &&
                  confirmPassword.length >= 8 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Passwords match ✓
                    </p>
                  )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleChangePassword}
                disabled={
                  savingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  newPassword.length < 8 ||
                  newPassword !== confirmPassword
                }
                size="sm"
                className="rounded-md gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {savingPassword ? "Updating…" : "Change Password"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

function PasswordVisibilityButton({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`${visible ? "Hide" : "Show"} ${label}`}
      aria-pressed={visible}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
