import { alertClasses, alertDot } from "@/lib/status-colors";

/**
 * Canonical status/stage badge using the five-tier alert color system.
 * Use this everywhere instead of local stageBadgeClass helpers or AlertBadge.
 *
 * Props:
 *   status — raw status/stage key, e.g. "QC_APPROVAL", "active", "COMPLETED"
 *   label  — optional display override; defaults to status with _ replaced by space
 */
export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider ${alertClasses(status)}`}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Compact dot indicator — for room heatmaps or sidebar counts.
 */
export function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${alertDot(status)} ${className}`}
    />
  );
}
