const MAX_CREW_APPROVAL_LEVELS = 5;

export type ApprovalChainLevel = {
  level: number;
  employeeId: number;
  employeeName: string;
  selfApproval?: boolean;
};

export type ApprovalHistoryEntry = {
  level: number;
  action: "Approved" | "Rejected" | "OverrideApproved" | "OverrideRejected";
  actorEmployeeId: number | null;
  actorUserId: number | null;
  actorName: string;
  remarks: string;
  isOverride: boolean;
  at: Date;
};

export type ApprovalActor = {
  userId: number;
  employeeId: number;
  name: string;
  role: string;
  isSuperAdmin: boolean;
};

export type ApprovalDecisionResult = {
  status: "Pending" | "Approved" | "Rejected";
  currentLevel: number | null;
  remarks: string | null;
  approvalHistory: ApprovalHistoryEntry[];
  advancedToNextLevel: boolean;
  nextApproverEmployeeId: number | null;
  wasOverride: boolean;
};

function normalizeChain(raw: unknown): ApprovalChainLevel[] {
  if (!Array.isArray(raw)) return [];
  const levels: ApprovalChainLevel[] = [];
  for (const entry of raw) {
    const level = Number((entry as any)?.level || 0);
    const employeeId = Number((entry as any)?.employeeId || 0);
    if (
      !Number.isInteger(level) ||
      level < 1 ||
      level > MAX_CREW_APPROVAL_LEVELS
    )
      continue;
    if (!Number.isInteger(employeeId) || employeeId <= 0) continue;
    levels.push({
      level,
      employeeId,
      employeeName: String((entry as any)?.employeeName || "").trim(),
      selfApproval: (entry as any)?.selfApproval === true,
    });
  }
  levels.sort((a, b) => a.level - b.level);
  // Enforce contiguous levels 1..N without duplicates
  const unique: ApprovalChainLevel[] = [];
  for (const row of levels) {
    if (unique.some((u) => u.level === row.level)) continue;
    if (
      !row.selfApproval &&
      unique.some((u) => u.employeeId === row.employeeId)
    )
      continue;
    const expected = unique.length + 1;
    if (row.level !== expected) continue;
    unique.push({ ...row, level: expected });
    if (unique.length >= MAX_CREW_APPROVAL_LEVELS) break;
  }
  return unique;
}

export function isApprovalOverrideActor(
  actor: Pick<ApprovalActor, "isSuperAdmin" | "role">,
  options?: { allowOverride?: boolean; isAdminRole?: boolean },
): boolean {
  if (options?.allowOverride === false) return false;
  if (actor.isSuperAdmin) return true;
  if (options?.isAdminRole === true) return true;
  const role = String(actor.role || "")
    .trim()
    .toLowerCase();
  return role === "super admin";
}

export function normalizeApprovalChainInput(
  raw: unknown,
): ApprovalChainLevel[] {
  return normalizeChain(raw);
}

/**
 * Apply a multi-level approval decision.
 * - Strict sequence L1→LN
 * - Reject is terminal (remarks required)
 * - Admin/Super Admin may override any level (flagged in history)
 * - Empty chain → single-step (legacy RBAC-only)
 */
export function applyApprovalDecision(input: {
  status: string;
  currentLevel?: number | null;
  approvalChain?: ApprovalChainLevel[] | null;
  approvalHistory?: ApprovalHistoryEntry[] | null;
  decision: "Approved" | "Rejected";
  remarks?: string | null;
  actor: ApprovalActor;
  hasActionPermission: boolean;
  /** Org setting; default true (Admin/Super Admin may skip levels). */
  allowApprovalOverride?: boolean;
  isAdminRole?: boolean;
}): ApprovalDecisionResult {
  if (String(input.status) !== "Pending") {
    throw Object.assign(
      new Error("Only pending requests can be approved or rejected"),
      { status: 400 },
    );
  }
  const chain = normalizeChain(input.approvalChain || []);
  const actorEmployeeId = Number(input.actor.employeeId || 0);
  const isSelfApproval =
    input.decision === "Approved" &&
    actorEmployeeId > 0 &&
    chain.length > 0 &&
    chain.every(
      (level) =>
        level.selfApproval === true &&
        Number(level.employeeId) === actorEmployeeId,
    );
  if (!input.hasActionPermission && !isSelfApproval) {
    throw Object.assign(new Error("Forbidden: approval permission required"), {
      status: 403,
    });
  }

  const remarks = String(input.remarks || "").trim();
  if (input.decision === "Rejected" && !remarks) {
    throw Object.assign(new Error("Rejection remarks are mandatory"), {
      status: 400,
    });
  }

  const history = Array.isArray(input.approvalHistory)
    ? [...input.approvalHistory]
    : [];
  const currentLevel = Math.max(1, Number(input.currentLevel || 1));
  const isOverride =
    isSelfApproval ||
    isApprovalOverrideActor(input.actor, {
      allowOverride: input.allowApprovalOverride !== false,
      isAdminRole: input.isAdminRole === true,
    });

  if (chain.length > 0 && !isOverride) {
    const expected = chain.find((level) => level.level === currentLevel);
    if (!expected) {
      throw Object.assign(
        new Error(`No approver configured for level L${currentLevel}`),
        { status: 400 },
      );
    }
    if (Number(input.actor.employeeId || 0) !== Number(expected.employeeId)) {
      throw Object.assign(
        new Error(
          `Only the L${currentLevel} approver (${expected.employeeName || `#${expected.employeeId}`}) can act on this request`,
        ),
        { status: 403 },
      );
    }
  }

  if (input.decision === "Rejected") {
    const entry: ApprovalHistoryEntry = {
      level: currentLevel,
      action: isOverride ? "OverrideRejected" : "Rejected",
      actorEmployeeId: input.actor.employeeId || null,
      actorUserId: input.actor.userId || null,
      actorName: input.actor.name || "User",
      remarks,
      isOverride,
      at: new Date(),
    };
    history.push(entry);
    return {
      status: "Rejected",
      currentLevel: null,
      remarks,
      approvalHistory: history,
      advancedToNextLevel: false,
      nextApproverEmployeeId: null,
      wasOverride: isOverride,
    };
  }

  // Approved
  const entry: ApprovalHistoryEntry = {
    level: currentLevel,
    action: isOverride ? "OverrideApproved" : "Approved",
    actorEmployeeId: input.actor.employeeId || null,
    actorUserId: input.actor.userId || null,
    actorName: input.actor.name || "User",
    remarks,
    isOverride,
    at: new Date(),
  };
  history.push(entry);

  // Override or no further levels → final Approved
  if (isOverride || chain.length === 0 || currentLevel >= chain.length) {
    return {
      status: "Approved",
      currentLevel: null,
      remarks: remarks || null,
      approvalHistory: history,
      advancedToNextLevel: false,
      nextApproverEmployeeId: null,
      wasOverride: isOverride,
    };
  }

  const nextLevel = currentLevel + 1;
  const next = chain.find((level) => level.level === nextLevel) || null;
  return {
    status: "Pending",
    currentLevel: nextLevel,
    remarks: remarks || null,
    approvalHistory: history,
    advancedToNextLevel: true,
    nextApproverEmployeeId: next?.employeeId || null,
    wasOverride: false,
  };
}
