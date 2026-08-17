import { FormEvent, ReactNode, useEffect, useState } from "react";
import { LockKeyhole, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type GateState = "checking" | "locked" | "unlocking" | "unlocked" | "error";
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function notifyModuleLocked(module: string) {
  window.dispatchEvent(
    new CustomEvent("module-encryption-locked", { detail: { module } }),
  );
}

export default function ModuleEncryptionGate({
  module,
  label,
  children,
}: {
  module: "ledger" | "contracta";
  label: string;
  children: ReactNode;
}) {
  const [gateState, setGateState] = useState<GateState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const check = async () => {
    setGateState("checking");
    try {
      const response = await fetch(
        `${base}/api/module-encryption/status/${module}`,
        {
          credentials: "include",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Unable to check module status");
      setConfigured(data.configured !== false);
      setExpiresAt(data.expiresAt || null);
      setGateState(data.unlocked ? "unlocked" : "locked");
    } catch (cause: any) {
      setError(cause.message || "Unable to check module status");
      setGateState("error");
    }
  };

  useEffect(() => {
    void check();
    const handleLock = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.module === module) {
        setPassword("");
        setExpiresAt(null);
        setGateState("locked");
      }
    };
    window.addEventListener("module-encryption-locked", handleLock);
    return () =>
      window.removeEventListener("module-encryption-locked", handleLock);
  }, [module]);

  useEffect(() => {
    if (!expiresAt || gateState !== "unlocked") return;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setExpiresAt(null);
      setGateState("locked");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, gateState]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length !== 6 || password.trim().length === 0) {
      setError("Enter the 6-character module password.");
      return;
    }
    setGateState("unlocking");
    try {
      const response = await fetch(`${base}/api/module-encryption/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, password }),
      });
      const data = await response.json().catch(() => ({}));
      setPassword("");
      if (!response.ok)
        throw new Error(data.error || "Invalid module password");
      setExpiresAt(data.expiresAt || null);
      setGateState("unlocked");
    } catch (cause: any) {
      setError(cause.message || "Invalid module password");
      setGateState("locked");
    }
  };

  const lock = async () => {
    await fetch(`${base}/api/module-encryption/lock`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module }),
    }).catch(() => undefined);
    notifyModuleLocked(module);
  };

  if (gateState === "unlocked") {
    return (
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed right-6 top-20 z-40 gap-2 bg-background"
          onClick={() => void lock()}
        >
          <LogOut className="h-4 w-4" />
          Lock {label}
        </Button>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {gateState === "checking" ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <LockKeyhole className="h-7 w-7" />
          )}
        </div>
        <h1 className="text-2xl font-semibold">{label} Locked</h1>
        {gateState === "checking" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Checking secure access...
          </p>
        ) : !configured ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {label} password has not been configured. Contact an administrator.
          </p>
        ) : (
          <form className="mt-5 space-y-4 text-left" onSubmit={unlock}>
            <p className="text-center text-sm text-muted-foreground">
              Enter the 6-character password to continue.
            </p>
            <Input
              type="password"
              value={password}
              maxLength={6}
              autoFocus
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value.slice(0, 6));
                setError("");
              }}
              aria-label={`${label} password`}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={gateState === "unlocking"}>
              {gateState === "unlocking" ? "Unlocking..." : `Unlock ${label}`}
            </Button>
          </form>
        )}
        {gateState === "error" && (
          <div className="mt-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void check()}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
