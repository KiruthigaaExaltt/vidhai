import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";

const DEFAULT_UPLOAD_ROOT = "./uploads";
export function getUploadRoot(): string {
  const supplied = String(process.env.UPLOAD_ROOT || "").trim();
  if (process.env.NODE_ENV === "production" && !supplied)
    throw new Error("UPLOAD_ROOT is required when NODE_ENV=production");
  const configured = supplied || DEFAULT_UPLOAD_ROOT;
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

export const storedUploadFolder = {
  avatars: ["users", "avatars"],
  "ooty-verification": ["production", "ooty", "stage-verification"],
  "coimbatore-verification": ["production", "coimbatore", "stage-verification"],
  "lab-verification": ["production", "lab", "stage-verification"],
  "legacy-production-verification": [
    "production",
    "legacy",
    "stage-verification",
  ],
  "material-images": ["inventory", "materials"],
  "asset-images": ["inventory", "assets"],
} as const;
export type StoredUploadArea = keyof typeof storedUploadFolder;

export function resolveStoredUploadPath(
  area: StoredUploadArea,
  fileName?: string,
): string {
  return resolveUploadPath(
    ...storedUploadFolder[area],
    ...(fileName ? [path.basename(fileName)] : []),
  );
}

export async function saveImageDataUrl(
  value: unknown,
  area: StoredUploadArea,
  maxBytes = 5 * 1024 * 1024,
): Promise<string> {
  if (typeof value !== "string") throw new Error("Uploaded image is invalid");
  if (value.startsWith(`/api/stored-files/${area}/`)) return value;
  const match = value.match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/s,
  );
  if (!match) throw new Error("Image must be JPG, PNG or WEBP");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Uploaded image data is malformed");
  if (buffer.length > maxBytes)
    throw new Error(
      `Uploaded image must not exceed ${Math.floor(maxBytes / 1024 / 1024)} MB`,
    );
  const extension =
    match[1] === "png" ? "png" : match[1] === "webp" ? "webp" : "jpg";
  const directory = resolveStoredUploadPath(area);
  await mkdir(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  await writeFile(path.join(directory, fileName), buffer);
  return `/api/stored-files/${area}/${fileName}`;
}

export async function deleteStoredUpload(value: unknown): Promise<void> {
  if (typeof value !== "string") return;
  const match = value.match(/^\/api\/stored-files\/([^/]+)\/([^/]+)$/);
  if (!match || !(match[1] in storedUploadFolder)) return;
  await unlink(
    resolveStoredUploadPath(match[1] as StoredUploadArea, match[2]),
  ).catch((error: any) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
