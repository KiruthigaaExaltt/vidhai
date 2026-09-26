import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { responseError } from "@/lib/errorMessage";
import { useLocation } from "wouter";
import {
  calculateSalaryTemplateComponents,
  initializeSalaryFixedValues,
  type SalaryTemplate,
  type EmployeeRecord,
} from "./salaryStructure";
const base = String(
  import.meta.env.VITE_API_BASE || import.meta.env.BASE_URL || "",
)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const authFetch = (path: string, options?: RequestInit) =>
  fetch(`${base}${path}`, { ...options, credentials: "include" });
const currency = (value: number) =>
  value.toLocaleString("en-IN", { style: "currency", currency: "INR" });

export default function SalaryStructureDialog({
  employee,
  canEdit,
  onClose,
  onSaved,
}: {
  employee: EmployeeRecord;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { can: hasPermission } = useAuth();
  const [member, setMember] = useState(employee);
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initializeValues = initializeSalaryFixedValues;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authFetch(`/api/crew/employees/${employee.id}/salary-structure`).then(
        async (response) => {
          if (!response.ok)
            throw await responseError(response, "Unable to access salary structure");
          return response.json() as Promise<EmployeeRecord>;
        },
      ),
      authFetch(`/api/crew/employees/${employee.id}/salary-templates`).then(
        async (response) => {
          if (!response.ok) throw await responseError(response, "Unable to load salary templates");
          return response.json() as Promise<SalaryTemplate[]>;
        },
      ),
    ])
      .then(([record, list]) => {
        if (cancelled) return;
        setMember(record);
        setTemplates(list);
        setTemplateId(
          record.salaryTemplateId == null
            ? ""
            : String(record.salaryTemplateId),
        );
        setValues(
          initializeValues(
            list.find((t) => t.id === record.salaryTemplateId),
            record,
          ),
        );
      })
      .catch((err) => {
        if (!cancelled)
          setError(err.message || "Failed to load salary structure");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  const template = templates.find((t) => String(t.id) === templateId);
  const preview = useMemo(() => {
    if (!template)
      return {
        rows: [],
        error: "Select an available salary template to view the structure.",
      };
    if (
      !Number.isFinite(Number(member.baseSalary)) ||
      Number(member.baseSalary) < 0
    )
      return { rows: [], error: "The employee needs a valid monthly CTC." };
    for (const c of template.components.filter(
      (c) => c.calculationType === "fixed",
    )) {
      if (
        !values[c.id]?.trim() ||
        !Number.isFinite(Number(values[c.id])) ||
        Number(values[c.id]) < 0
      ) {
        return {
          rows: [],
          error: `Enter a valid fixed amount of 0 or more for ${c.name}.`,
        };
      }
    }
    try {
      return {
        rows: calculateSalaryTemplateComponents({
          templateComponents: template.components,
          monthlyCtc: Number(member.baseSalary),
          fixedComponentValues: Object.fromEntries(
            Object.entries(values).map(([id, value]) => [id, Number(value)]),
          ),
          earnedRatio: 1,
        }),
        error: "",
      };
    } catch (err) {
      return {
        rows: [],
        error:
          err instanceof Error
            ? err.message
            : "Unable to preview salary structure",
      };
    }
  }, [template, values, member.baseSalary]);

  const save = async () => {
    if (!canEdit || !template || preview.error || loading || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await authFetch(`/api/crew/employees/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryTemplateId: template.id,
          fixedComponentValues: Object.fromEntries(
            Object.entries(values).map(([id, value]) => [id, Number(value)]),
          ),
          templateSnapshotOption: "immediately",
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save salary structure");
      }
      toast({ title: "Salary structure saved" });
      await onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save salary structure",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        onPointerDownOutside={(event) => {
          if (canEdit || saving) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (canEdit || saving) event.preventDefault();
        }}
        className={`flex max-w-3xl max-h-[90dvh] flex-col overflow-hidden ${canEdit ? "[&>button.absolute]:hidden" : ""}`}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>Salary Structure</DialogTitle>
          <DialogDescription>{member.name}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status">Loading salary structure...</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded border px-2 py-1">
                {member.department}
              </span>
              <span className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-orange-700">
                {member.salaryTemplateId
                  ? "Salary template assigned"
                  : "Salary pending"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm">Template</label>
                <select
                  aria-label="Template"
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={templateId}
                  disabled={!canEdit || saving}
                  onChange={(event) => {
                    const id = event.target.value;
                    setTemplateId(id);
                    setValues(
                      initializeValues(
                        templates.find((t) => String(t.id) === id),
                        member,
                      ),
                    );
                    setError("");
                  }}
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.templateName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="structure-ctc" className="mb-1 block text-sm">
                  Monthly CTC
                </label>
                <input
                  id="structure-ctc"
                  readOnly
                  value={currency(Number(member.baseSalary))}
                  className="w-full rounded-md border bg-blue-50 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {template?.components.some(
              (c) => c.calculationType === "fixed",
            ) && (
              <div className="space-y-3 rounded-2xl border bg-gray-50 p-4">
                <div>
                  <p className="text-sm font-semibold">Fixed Amounts</p>
                </div>
                {template.components
                  .filter((c) => c.calculationType === "fixed")
                  .map((c) => (
                    <div key={c.id}>
                      <label
                        htmlFor={`fixed-${c.id}`}
                        className="mb-1 block text-sm"
                      >
                        {c.name}
                      </label>
                      <input
                        id={`fixed-${c.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canEdit || saving}
                        value={values[c.id] ?? ""}
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            [c.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm focus:border-orange-400"
                      />
                    </div>
                  ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {member.salaryTemplateId
                  ? `Current template: ${templates.find((t) => t.id === member.salaryTemplateId)?.templateName || "Unavailable template"}`
                  : "No salary template assigned yet."}
              </p>
              {hasPermission("settings.templates.view") && (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    onClose();
                    navigate("/settings?section=salary");
                  }}
                >
                  Manage Templates
                </Button>
              )}
            </div>
            {preview.error ? (
              <p role="alert" className="text-sm text-amber-700">
                {preview.error}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="p-3">Component</th>
                      <th className="p-3">Monthly</th>
                      <th className="p-3">Yearly</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map((row) => {
                      const c = template?.components.find(
                        (c) => c.id === row.componentId,
                      );
                      return (
                        <tr key={row.componentId}>
                          <td className="p-3">
                            {row.name}
                            <p className="mt-1 text-xs text-gray-500">
                              {c?.calculationType === "fixed"
                                ? "Fixed amount for this crew member"
                                : c?.calculationType === "percentage_of_ctc"
                                  ? `${c.value}% of monthly CTC`
                                  : c?.calculationType ===
                                      "percentage_of_component"
                                    ? `${c.value}% of ${template?.components.find((r) => r.id === c.referenceComponentId)?.name || "linked component"}`
                                    : "Residual balance"}
                            </p>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {currency(row.monthlyAmount)}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            {currency(row.yearlyAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-gray-50 font-semibold">
                    <tr>
                      <td className="p-3">Total CTC</td>
                      <td className="p-3 whitespace-nowrap">
                        {currency(Number(member.baseSalary))}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {currency(Number(member.baseSalary) * 12)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500">
              This shows the configured salary breakdown before attendance
              adjustments and statutory contributions.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <DialogFooter className="shrink-0">
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Close
          </Button>
          {canEdit && (
            <Button
              disabled={
                loading || saving || !template || Boolean(preview.error)
              }
              onClick={save}
            >
              {saving ? "Saving..." : "Save Salary Structure"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
