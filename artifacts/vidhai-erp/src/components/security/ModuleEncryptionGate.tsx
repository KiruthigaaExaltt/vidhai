import { FormEvent, ReactNode, useEffect, useState } from "react";
import { LockKeyhole, LogOut, Loader2, Info, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OTPInput } from "input-otp";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type GateState = "checking" | "locked" | "unlocking" | "unlocked" | "error";
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function notifyModuleLocked(module: string) {
  window.dispatchEvent(
    new CustomEvent("module-encryption-locked", { detail: { module } }),
  );
}

export async function lockModule(module: string = "ledger") {
  await fetch(`${base}/api/module-encryption/lock`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module }),
  }).catch(() => undefined);
  notifyModuleLocked(module);
}

export default function ModuleEncryptionGate({
  module,
  label,
  children,
  lockedLayout,
  hideFloatingLock = false,
}: {
  module: "ledger" | "contracta";
  label: string;
  children: ReactNode;
  lockedLayout?: (content: ReactNode) => ReactNode;
  hideFloatingLock?: boolean;
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

  const unlock = async (event?: FormEvent) => {
    if (event) event.preventDefault();
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
        {!hideFloatingLock && (
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
        )}
        {children}
      </div>
    );
  }

  const lockedContent = (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-muted/30 p-6 lg:min-h-[calc(100svh-72px)]">
      <div className="w-full max-w-[420px] rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-card p-8 sm:p-9 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#E6FBF7] dark:bg-teal-950/40 text-[#00BDA5]">
          {gateState === "checking" ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <LockKeyhole className="h-8 w-8 stroke-[2.2]" />
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {label} Login
        </h1>
        {gateState === "checking" ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Checking secure access...
          </p>
        ) : !configured ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {label} password has not been configured. Contact an administrator.
          </p>
        ) : (
          <form className="mt-6 space-y-5 text-left" onSubmit={unlock}>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Enter your 6-character password to unlock {label.toLowerCase()}.
            </p>

            <div className="flex justify-center py-1">
              <OTPInput
                maxLength={6}
                value={password}
                onChange={(val) => {
                  setPassword(val);
                  setError("");
                }}
                autoFocus
                autoComplete="current-password"
                disabled={gateState === "unlocking"}
                pushPasswordManagerStrategy="none"
                containerClassName="flex justify-center"
                render={({ slots }) => (
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                    {slots.map((slot, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "relative flex h-14 w-11 sm:w-12 items-center justify-center rounded-xl border bg-white dark:bg-card text-lg font-semibold transition-all select-none",
                          slot.isActive
                            ? "border-[#00BDA5] ring-2 ring-[#00BDA5]/20 shadow-sm"
                            : error
                              ? "border-destructive/60"
                              : "border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600",
                        )}
                      >
                        {slot.char ? (
                          <span className="text-xl sm:text-2xl font-bold leading-none select-none text-slate-800 dark:text-slate-100">
                            ●
                          </span>
                        ) : null}
                        {slot.hasFakeCaret && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="h-5 sm:h-6 w-[2px] animate-caret-blink bg-slate-900 dark:bg-slate-100" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              />
            </div>

            {error && (
              <p className="text-center text-xs sm:text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={gateState === "unlocking"}
              className="w-full h-12 rounded-xl bg-[#00BDA5] hover:bg-[#00a894] active:bg-[#009b88] text-white font-medium flex items-center justify-between px-5 transition-all shadow-sm active:scale-[0.99] border-0 cursor-pointer"
            >
              {gateState === "unlocking" ? (
                <span className="mx-auto flex items-center gap-2 text-white">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Unlocking...
                </span>
              ) : (
                <>
                  <svg
                    className="h-4 w-4 text-white/50 fill-current shrink-0"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 2C12 7.5 7.5 12 2 12C7.5 12 12 16.5 12 22C12 16.5 16.5 12 22 12C16.5 12 12 7.5 12 2Z" />
                  </svg>
                  <span className="flex items-center gap-2 font-semibold text-[15px] text-white">
                    <LockKeyhole className="h-4 w-4 stroke-[2.2]" />
                    Unlock {label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-white stroke-[2.2] shrink-0" />
                </>
              )}
            </Button>

            <div className="mt-7 flex items-center justify-center gap-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
              <span>
                Forgot your {label.toLowerCase()} password? Contact your{" "}
                <button
                  type="button"
                  className="text-[#00BDA5] hover:underline font-medium focus:outline-none"
                  onClick={() =>
                    toast.info(
                      "Please contact your system administrator to reset your module password.",
                    )
                  }
                >
                  administrator.
                </button>
              </span>
            </div>
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

  return lockedLayout ? <>{lockedLayout(lockedContent)}</> : lockedContent;
}
