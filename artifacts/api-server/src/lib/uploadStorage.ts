import path from "node:path";

const DEFAULT_UPLOAD_ROOT = "./uploads";
export function getUploadRoot(): string {
  const configured = String(
    process.env.UPLOAD_ROOT || DEFAULT_UPLOAD_ROOT,
  ).trim();
  if (!configured) throw new Error("UPLOAD_ROOT must not be empty");
  return path.normalize(
    path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured),
  );
}
const safeSegment = (segment: string) => {
  const value = String(segment).trim();
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    path.isAbsolute(value)
  )
    throw new Error(`Invalid upload path segment: ${segment}`);
  return value;
};
export function resolveUploadPath(...segments: string[]): string {
  const root = getUploadRoot();
  const target = path.resolve(root, ...segments.map(safeSegment));
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error("Upload path escapes UPLOAD_ROOT");
  return target;
}
export const crewUploadFolder = {
  employees: ["crew", "employee-photos"],
  attendance: ["crew", "attendance"],
  "attendance-punch-in": ["crew", "attendance", "punch-in"],
  "attendance-punch-out": ["crew", "attendance", "punch-out"],
  claims: ["crew", "claims"],
} as const;
export type CrewUploadFolder = keyof typeof crewUploadFolder;
export function resolveCrewUploadPath(
  folder: CrewUploadFolder,
  fileName?: string,
): string {
  return resolveUploadPath(
    ...crewUploadFolder[folder],
    ...(fileName ? [path.basename(fileName)] : []),
  );
}
