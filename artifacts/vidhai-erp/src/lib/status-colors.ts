/**
 * Five-tier alert color system — the single source of truth for every
 * status/stage badge in the app.  The same color always means the same thing.
 *
 * Tier    Meaning                                        Tailwind classes
 * ------  ---------------------------------------------  --------------------
 * teal    Normal / on-track                              bg-teal-50 text-teal-700
 * amber   Watch / schedule-risk / active processing     bg-amber-50 text-amber-700
 * red     Critical / breach / biological gate failure   bg-red-50 text-red-600
 * purple  Needs a decision / pending approval           bg-purple-50 text-purple-700
 * gray    Idle / awaiting action / completed/done       bg-gray-100 text-gray-500
 */

export type AlertTier = "teal" | "amber" | "red" | "purple" | "gray";

const STAGE_MAP: Record<string, AlertTier> = {
  // ── Teal — normal / on-track ────────────────────────────────────────────────
  active:        "teal",
  normal:        "teal",
  on_track:      "teal",
  available:     "teal",
  dispatched:    "teal",
  PINNING:       "teal",    // Annur: visible mushroom pins — biological progress on track
  CROPPING:      "teal",    // Annur: active harvest
  READY_TO_SHIP: "teal",    // Coimbatore: QC passed, ready for dispatch
  DISTRIBUTION:  "teal",    // Lab: spawn is leaving lab — on track
  external:      "teal",    // Sales: standard external sale

  // ── Amber — watch / schedule-risk / active processing ──────────────────────
  on_hold:       "amber",
  warning:       "amber",
  at_risk:       "amber",
  pending:       "amber",
  in_progress:   "amber",
  in_use:        "amber",
  allocated:     "amber",
  // Annur composting stages
  PRE_WETTING:   "amber",
  COMPOSTING:    "amber",
  PEAK_HEAT:     "amber",   // Hot-phase — watch temperature closely
  SPAWNING:      "amber",
  CASING:        "amber",
  // Annur legacy/custom stages
  T1: "amber", T2: "amber", T3: "amber", T4: "amber",
  BULK_CHAMBER:  "amber",
  QUALITY_CHECK: "amber",
  SPAWN_MIXING:  "amber",
  DISPATCH:      "amber",
  // Coimbatore processing
  FORMULATION:   "amber",
  FILLING:       "amber",
  STERILIZATION: "amber",
  // Lab processing
  PLATE_PREP:    "amber",
  MOTHER_SPAWN:  "amber",
  MS:            "amber",
  SPAWN:         "amber",   // Lab SPAWN stage (different from Ooty SPAWN_RUN gate)
  // Ooty
  CASING_RUN:    "amber",
  DF:            "amber",
  COOKOUT:       "amber",

  // ── Red — critical / breach / gate failure ──────────────────────────────────
  failed:        "red",
  FAILED:        "red",
  critical:      "red",
  breach:        "red",
  maintenance:   "red",     // Fleet: vehicle unavailable
  QC_FAILED:     "red",     // Coimbatore: failed QC inspection

  // ── Purple — needs a decision / pending approval ─────────────────────────────
  SPAWN_RUN:         "purple", // Ooty gate: biological approval required before advancing
  QC_APPROVAL:       "purple", // Coimbatore: awaiting quality sign-off
  needs_decision:    "purple",
  pending_approval:  "purple",
  internal_transfer: "purple", // Sales: cross-site move needs coordination

  // ── Gray — idle / awaiting action / completed ────────────────────────────────
  COMPLETED:  "gray",
  completed:  "gray",
  delivered:  "gray",
  retired:    "gray",
  idle:       "gray",
  vacant:     "gray",
  awaiting:   "gray",
};

export const TIER_CLASSES: Record<AlertTier, string> = {
  teal:   "bg-teal-50 text-teal-700",
  amber:  "bg-amber-50 text-amber-700",
  red:    "bg-red-50 text-red-600",
  purple: "bg-purple-50 text-purple-700",
  gray:   "bg-gray-100 text-gray-500",
};

/** Dot fill classes for heatmap / indicator contexts */
export const TIER_DOT: Record<AlertTier, string> = {
  teal:   "bg-teal-400",
  amber:  "bg-amber-400",
  red:    "bg-red-500",
  purple: "bg-purple-400",
  gray:   "bg-gray-300",
};

/**
 * Returns the tier for a given status/stage string.
 * Defaults to "amber" (unknown = watch) so unknown stages are visible.
 */
export function alertTier(status: string): AlertTier {
  return STAGE_MAP[status] ?? "amber";
}

/** Full Tailwind bg+text class string for a status/stage. */
export function alertClasses(status: string): string {
  return TIER_CLASSES[alertTier(status)];
}

/** Dot fill class for a status/stage. */
export function alertDot(status: string): string {
  return TIER_DOT[alertTier(status)];
}
