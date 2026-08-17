import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { notifyModuleLocked } from "@/components/security/ModuleEncryptionGate";

type ModuleMetadata = {
  module: "ledger" | "contracta";
  label: string;
  passwordLength: number;
  configured: boolean;
  enabled: boolean;
  passwordUpdatedAt: string | null;
};
type Fields = Record<string, { password: string; confirmPassword: string }>;
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function ModuleEncryptionSettings() {
  const { can, isSuperAdmin } = useAuth();
  const canManage =
    isSuperAdmin || can("settings.module_encryption.manage_settings");
  const [modules, setModules] = useState<ModuleMetadata[]>([]);
  const [fields, setFields] = useState<Fields>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingModule, setSavingModule] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${base}/api/settings/module-encryption`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data.error || "Unable to load module encryption");
        setModules(Array.isArray(data.modules) ? data.modules : []);
      } catch (cause: any) {
        toast.error(cause.message || "Unable to load module encryption");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (
    module: string,
    key: "password" | "confirmPassword",
    value: string,
  ) => {
    setFields((current) => ({
      ...current,
      [module]: {
        ...(current[module] ?? { password: "", confirmPassword: "" }),
        [key]: value.slice(0, 6),
      },
    }));
    setErrors((current) => ({ ...current, [module]: "" }));
  };

  const save = async (metadata: ModuleMetadata) => {
    if (!canManage) return;
    const values = fields[metadata.module] ?? {
      password: "",
      confirmPassword: "",
    };
    if (
      values.password.length !== metadata.passwordLength ||
      !values.password.trim()
    ) {
      setErrors((current) => ({
        ...current,
        [metadata.module]: "Enter exactly 6 non-whitespace characters.",
      }));
      return;
    }
    if (values.password !== values.confirmPassword) {
      setErrors((current) => ({
        ...current,
        [metadata.module]: "Passwords do not match.",
      }));
      return;
    }
    setSavingModule(metadata.module);
    try {
      const response = await fetch(`${base}/api/settings/module-encryption`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: metadata.module,
          password: values.password,
          confirmPassword: values.confirmPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Unable to update module password");
      setFields((current) => ({
        ...current,
        [metadata.module]: { password: "", confirmPassword: "" },
      }));
      setVisible((current) => ({ ...current, [metadata.module]: false }));
      setModules((current) =>
        current.map((item) =>
          item.module === metadata.module
            ? {
                ...item,
                configured: true,
                passwordUpdatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
      notifyModuleLocked(metadata.module);
      toast.success(`${metadata.label} password updated successfully.`);
    } catch (cause: any) {
      setErrors((current) => ({
        ...current,
        [metadata.module]: cause.message || "Unable to update password",
      }));
    } finally {
      setSavingModule(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading encryption settings...
      </div>
    );
  }
  if (!modules.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No encrypted modules are currently available.
      </p>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold">Module Encryption</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure separate organization passwords for sensitive modules. Current
        passwords are never displayed.
      </p>
      <div className="mt-6 space-y-5">
        {modules.map((metadata) => {
          const values = fields[metadata.module] ?? {
            password: "",
            confirmPassword: "",
          };
          const show = visible[metadata.module] === true;
          return (
            <div key={metadata.module} className="rounded-lg border p-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{metadata.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {metadata.configured
                        ? "Password configured"
                        : "Password not configured"}
                      {metadata.passwordUpdatedAt &&
                        ` · Updated ${new Date(metadata.passwordUpdatedAt).toLocaleString()}`}
                    </p>
                  </div>
                </div>
              </div>
              {canManage ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {(["password", "confirmPassword"] as const).map((key) => (
                    <div key={key} className="space-y-2">
                      <Label>
                        {key === "password"
                          ? "New Password"
                          : "Confirm Password"}
                      </Label>
                      <div className="relative">
                        <Input
                          type={show ? "text" : "password"}
                          value={values[key]}
                          maxLength={metadata.passwordLength}
                          autoComplete="new-password"
                          onChange={(event) =>
                            setField(metadata.module, key, event.target.value)
                          }
                          className="pr-10"
                        />
                        <button
                          type="button"
                          aria-label={show ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() =>
                            setVisible((current) => ({
                              ...current,
                              [metadata.module]: !show,
                            }))
                          }
                        >
                          {show ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  {errors[metadata.module] && (
                    <p className="text-sm text-destructive md:col-span-2">
                      {errors[metadata.module]}
                    </p>
                  )}
                  <div className="md:col-span-2">
                    <Button
                      disabled={savingModule === metadata.module}
                      onClick={() => void save(metadata)}
                    >
                      {savingModule === metadata.module
                        ? "Saving..."
                        : metadata.configured
                          ? "Change Password"
                          : "Set Password"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You can view this configuration but cannot change the
                  password.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
