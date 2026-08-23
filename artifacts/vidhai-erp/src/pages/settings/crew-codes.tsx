import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Option = { id: number; value: string; isActive: boolean };
type CrewCodes = {
  prefixes: Option[];
  suffixes: Option[];
  settings: { paddingDigits: number; nextNumber: number };
};

async function request(path = "", options?: RequestInit) {
  const response = await fetch(`${BASE}/api/crew-codes${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export default function CrewCodes() {
  const [data, setData] = useState<CrewCodes | null>(null);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [padding, setPadding] = useState("4");
  const [busy, setBusy] = useState(false);
  const load = () =>
    request().then((body) => {
      setData(body);
      setPadding(String(body.settings.paddingDigits));
    });
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, []);

  const add = async (kind: "prefixes" | "suffixes", raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(value)) {
      toast.error("Use uppercase letters and numbers only");
      return;
    }
    setBusy(true);
    try {
      await request(`/${kind}`, {
        method: "POST",
        body: JSON.stringify({ value }),
      });
      kind === "prefixes" ? setPrefix("") : setSuffix("");
      await load();
      toast.success(kind === "prefixes" ? "Prefix added" : "Suffix added");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (kind: "prefixes" | "suffixes", item: Option) => {
    setBusy(true);
    try {
      await request(`/${kind}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const savePadding = async () => {
    setBusy(true);
    try {
      await request("/settings", {
        method: "PATCH",
        body: JSON.stringify({ paddingDigits: Number(padding) }),
      });
      await load();
      toast.success("Crew code padding updated");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const list = (kind: "prefixes" | "suffixes", items: Option[]) => (
    <div className="overflow-hidden rounded-lg border">
      {items.length ? (
        <div className="divide-y">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold">{item.value}</span>
                <Badge variant={item.isActive ? "default" : "secondary"}>
                  {item.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => toggle(kind, item)}
              >
                {item.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">
          No values configured.
        </p>
      )}
    </div>
  );

  if (!data)
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading crew code settings...
      </div>
    );
  return (
    <div className="space-y-7">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold">Crew Code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Employee codes use Prefix + global number + optional Suffix. Existing
          codes never change.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-semibold">Prefixes</h3>
          <div className="flex gap-2">
            <Input
              value={prefix}
              maxLength={20}
              placeholder="EMP"
              onChange={(e) =>
                setPrefix(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                )
              }
            />
            <Button
              disabled={busy || !prefix}
              onClick={() => add("prefixes", prefix)}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {list("prefixes", data.prefixes)}
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">Suffixes</h3>
          <div className="flex gap-2">
            <Input
              value={suffix}
              maxLength={20}
              placeholder="HO"
              onChange={(e) =>
                setSuffix(
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                )
              }
            />
            <Button
              disabled={busy || !suffix}
              onClick={() => add("suffixes", suffix)}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {list("suffixes", data.suffixes)}
        </section>
      </div>
      <section className="max-w-sm space-y-3 rounded-lg border p-4">
        <Label htmlFor="crew-code-padding">Global number padding</Label>
        <div className="flex gap-2">
          <Input
            id="crew-code-padding"
            type="number"
            min={1}
            max={12}
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
          />
          <Button disabled={busy} onClick={savePadding}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Preview:{" "}
          {data.prefixes.find((item) => item.isActive)?.value || "PREFIX"}
          {String(data.settings.nextNumber).padStart(Number(padding) || 1, "0")}
          {data.suffixes.find((item) => item.isActive)?.value || ""}
        </p>
      </section>
    </div>
  );
}
