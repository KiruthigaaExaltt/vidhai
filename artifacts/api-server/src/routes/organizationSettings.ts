import { randomUUID } from "node:crypto";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { db, eq, organizationDetailsTable } from "@workspace/db";
import { effectivePermissions, getAuthUser } from "../lib/access";
import { resolveUploadPath } from "../lib/uploadStorage";

const router = Router();
const DEFAULT_TERMS = [
  "PRICE: EX-YARD PRICE, TRANSPORTATION EXTRA.",
  "PAYMENT: ADVANCE 50% & REMAINING BEFORE DELIVERY.",
  "TOTAL VALUE AMOUNT IS INCLUDED 18 % GST.",
];
const salesViews = [
  "sales.quotations.view",
  "sales.proforma_invoices.view",
  "sales.delivery_challans.view",
  "sales.invoices.view",
  "sales.returns.view",
];
const assetFolders = {
  logo: "logo",
  watermark: "watermark",
  "payment-qr": "payment-qr",
} as const;
type AssetFolder = keyof typeof assetFolders;
type StoredAsset = { url: string; newPath?: string };

const canAny = (permissions: string[], keys: string[]) =>
  permissions.includes("*") || keys.some((key) => permissions.includes(key));
const canRead = (permissions: string[]) =>
  canAny(permissions, ["settings.company_profile.view", ...salesViews]);
const cleanTerms = (value: unknown) => {
  const terms = (Array.isArray(value) ? value : [])
    .map((line) => String(line).trim())
    .filter(Boolean);
  return terms.length ? terms : DEFAULT_TERMS;
};

async function context(req: any, res: any) {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return {
    user,
    permissions: await effectivePermissions(user),
    organizationId: Number(user.organizationId ?? 1),
  };
}

async function storeAsset(
  value: unknown,
  currentValue: unknown,
  organizationId: number,
  folder: AssetFolder,
): Promise<StoredAsset> {
  const data = String(value ?? "").trim();
  const current = String(currentValue ?? "").trim();
  if (!data) return { url: "" };

  if (!data.startsWith("data:")) {
    if (data !== current)
      throw new Error("Branding images must be uploaded from your device");
    return { url: data };
  }

  const match = data.match(
    /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i,
  );
  if (!match)
    throw new Error("Branding assets must be PNG, JPEG, or WEBP images");

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Branding image data is malformed");
  if (buffer.length > 5 * 1024 * 1024)
    throw new Error("Each branding image must not exceed 5 MB");

  const extension = match[1].toLowerCase().startsWith("jp")
    ? "jpg"
    : match[1].toLowerCase();
  const directory = resolveUploadPath(
    "company-profile",
    String(organizationId),
    assetFolders[folder],
  );
  await mkdir(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const fullPath = path.join(directory, fileName);
  await writeFile(fullPath, buffer);
  return {
    url: `/api/organization-settings/files/${folder}/${fileName}`,
    newPath: fullPath,
  };
}

function storedPath(
  value: unknown,
  organizationId: number,
): string | undefined {
  const match = String(value ?? "").match(
    /^\/api\/organization-settings\/files\/(logo|watermark|payment-qr)\/([^/]+)$/,
  );
  if (!match) return undefined;
  const folder = match[1] as AssetFolder;
  return resolveUploadPath(
    "company-profile",
    String(organizationId),
    assetFolders[folder],
    path.basename(match[2]),
  );
}

async function removeStoredAsset(value: unknown, organizationId: number) {
  const target = storedPath(value, organizationId);
  if (!target) return;
  await unlink(target).catch((error: any) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

async function findOrganization(organizationId: number) {
  const scoped = await db
    .select()
    .from(organizationDetailsTable)
    .where(eq(organizationDetailsTable.organizationId, organizationId))
    .limit(1);
  if (scoped[0]) return scoped[0];
  const [legacy] = await db.select().from(organizationDetailsTable).limit(1);
  return legacy && Number(legacy.organizationId ?? 1) === organizationId
    ? legacy
    : null;
}

const response = (row: any = {}) => ({
  ...row,
  logoUrl: row.logoUrl || "",
  watermarkUrl: row.watermarkUrl || "",
  bankQrUrl: row.bankQrUrl || row.qrCodeUrl || "",
  qrCodeUrl: row.bankQrUrl || row.qrCodeUrl || "",
  bankName: row.bankName || "",
  accountNumber: row.accountNumber || "",
  ifscCode: row.ifscCode || "",
  branch: row.branch || "",
  companyStateCode: row.companyStateCode || "27",
  defaultCurrency: row.defaultCurrency || "INR",
  timezone: row.timezone || "Asia/Kolkata",
  termsAndConditions: cleanTerms(row.termsAndConditions),
  salesDocBody: row.salesDocBody || "",
  flexDocBody: row.flexDocBody || "",
});

router.get("/files/:folder/:file", async (req: any, res: any): Promise<any> => {
  const auth = await context(req, res);
  if (!auth) return;
  if (!canRead(auth.permissions))
    return res
      .status(403)
      .json({ error: "Company Profile file access denied" });

  const folder = req.params.folder as AssetFolder;
  if (!(folder in assetFolders))
    return res.status(404).json({ error: "Branding file not found" });

  const fileName = path.basename(String(req.params.file));
  const target = resolveUploadPath(
    "company-profile",
    String(auth.organizationId),
    assetFolders[folder],
    fileName,
  );
  try {
    await access(target);
    return res.sendFile(target, { dotfiles: "deny" });
  } catch {
    return res.status(404).json({ error: "Branding file not found" });
  }
});

router.get("/", async (req: any, res: any) => {
  try {
    const auth = await context(req, res);
    if (!auth) return;
    if (!canRead(auth.permissions))
      return res.status(403).json({
        error: "Access denied",
        permission: "settings.company_profile.view",
      });
    return res.json(response(await findOrganization(auth.organizationId)));
  } catch (error) {
    console.error("Unable to load organization details; using defaults", error);
    return res.json(response());
  }
});

router.put("/", async (req: any, res: any) => {
  const newPaths: string[] = [];
  try {
    const auth = await context(req, res);
    if (!auth) return;
    if (!canAny(auth.permissions, ["settings.company_profile.update"]))
      return res.status(403).json({
        error: "Access denied",
        permission: "settings.company_profile.update",
      });

    const contact = String(req.body?.salesContactNo ?? "").replace(/\D/g, "");
    if (contact && contact.length !== 10)
      return res
        .status(400)
        .json({ error: "Sales contact number must contain exactly 10 digits" });

    const state = String(req.body?.companyStateCode ?? "27")
      .replace(/\D/g, "")
      .slice(0, 2)
      .padStart(2, "0");
    const existing = await findOrganization(auth.organizationId);
    const logo = await storeAsset(
      req.body?.logoUrl,
      existing?.logoUrl,
      auth.organizationId,
      "logo",
    );
    if (logo.newPath) newPaths.push(logo.newPath);
    const watermark = await storeAsset(
      req.body?.watermarkUrl,
      existing?.watermarkUrl,
      auth.organizationId,
      "watermark",
    );
    if (watermark.newPath) newPaths.push(watermark.newPath);
    const bankQr = await storeAsset(
      req.body?.bankQrUrl ?? req.body?.qrCodeUrl,
      existing?.bankQrUrl || existing?.qrCodeUrl,
      auth.organizationId,
      "payment-qr",
    );
    if (bankQr.newPath) newPaths.push(bankQr.newPath);

    const data = {
      organizationId: auth.organizationId,
      logoUrl: logo.url,
      watermarkUrl: watermark.url,
      companyName: String(req.body?.companyName ?? "").trim(),
      orgEmail: String(req.body?.orgEmail ?? "").trim(),
      orgDomain: String(req.body?.orgDomain ?? "").trim(),
      gstin: String(req.body?.gstin ?? "")
        .trim()
        .toUpperCase(),
      companyStateCode: state,
      salesExecutive: String(req.body?.salesExecutive ?? "").trim(),
      salesContactNo: contact,
      companyAddress: String(req.body?.companyAddress ?? "").trim(),
      bankName: String(req.body?.bankName ?? "").trim(),
      accountNumber: String(req.body?.accountNumber ?? "").trim(),
      ifscCode: String(req.body?.ifscCode ?? "")
        .trim()
        .toUpperCase(),
      branch: String(req.body?.branch ?? "").trim(),
      bankQrUrl: bankQr.url,
      qrCodeUrl: bankQr.url,
      termsAndConditions: cleanTerms(req.body?.termsAndConditions),
      salesDocBody: String(req.body?.salesDocBody ?? "").trim(),
      flexDocBody: String(req.body?.flexDocBody ?? "").trim(),
      defaultCurrency: String(req.body?.defaultCurrency ?? "INR"),
      timezone: String(req.body?.timezone ?? "Asia/Kolkata"),
    };

    const [saved] = existing
      ? await db
          .update(organizationDetailsTable)
          .set(data)
          .where(eq(organizationDetailsTable.id, existing.id))
          .returning()
      : await db.insert(organizationDetailsTable).values(data).returning();

    await Promise.all(
      [
        [existing?.logoUrl, logo.url],
        [existing?.watermarkUrl, watermark.url],
        [existing?.bankQrUrl || existing?.qrCodeUrl, bankQr.url],
      ]
        .filter(([oldUrl, newUrl]) => oldUrl && oldUrl !== newUrl)
        .map(([oldUrl]) => removeStoredAsset(oldUrl, auth.organizationId)),
    );
    return res.json(response(saved));
  } catch (error: any) {
    await Promise.all(
      newPaths.map((target) =>
        unlink(target).catch(() => {
          // A failed database save must not leave orphaned files.
        }),
      ),
    );
    return res
      .status(400)
      .json({ error: error.message || "Unable to save Company Profile" });
  }
});

export default router;
