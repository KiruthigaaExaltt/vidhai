import { Router } from "express";
import {
  and,
  asc,
  contactsTable,
  db,
  desc,
  eq,
  ilike,
  modelFor,
  or,
  syncTableCustomIndexes,
} from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();
const validTypes = new Set(["client", "vendor", "other"]);
const prefixes: Record<string, string> = {
  client: "CLI-",
  vendor: "VEN-",
  other: "OTH-",
};
const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase();
const normalizeType = (value: unknown) => {
  const type = String(value || "").trim().toLowerCase();
  return type === "customer" ? "client" : type;
};
const contactCode = (type: string, sequence: number) => `${prefixes[type]}${String(sequence).padStart(6, "0")}`;

let setupPromise: Promise<void> | null = null;

function nextSequenceFor(type: string, contacts: any[]) {
  const prefix = prefixes[type];
  return contacts.reduce((max, contact) => {
    const code = normalizeCode(contact.contactCode || contact.normalizedContactCode);
    if (!code.startsWith(prefix)) return max;
    const value = Number(code.slice(prefix.length));
    return Number.isInteger(value) ? Math.max(max, value) : max;
  }, 0) + 1;
}

async function ensureContactCodeIndexes() {
  try {
    await syncTableCustomIndexes(contactsTable, [
      { key: { contactCode: 1 }, name: "contacts_contact_code_unique", unique: true },
      { key: { normalizedContactCode: 1 }, name: "contacts_normalized_contact_code_unique", unique: true },
    ] as any);
  } catch (error: any) {
    if (error?.code !== 85 && error?.code !== 86) throw error;
  }
}

export async function ensureContactCodes() {
  const contacts = await db
    .select()
    .from(contactsTable)
    .orderBy(asc(contactsTable.createdAt), asc(contactsTable.id));
  const sequences: Record<string, number> = {
    client: nextSequenceFor("client", contacts),
    vendor: nextSequenceFor("vendor", contacts),
    other: nextSequenceFor("other", contacts),
  };
  for (const contact of contacts as any[]) {
    const type = normalizeType(contact.type);
    if (!validTypes.has(type)) continue;
    const existingCode = normalizeCode(contact.contactCode);
    const code = existingCode || contactCode(type, sequences[type]++);
    const updates: Record<string, any> = {};
    if (contact.type !== type) updates.type = type;
    if (contact.contactCode !== code) updates.contactCode = code;
    if (contact.normalizedContactCode !== normalizeCode(code)) updates.normalizedContactCode = normalizeCode(code);
    if (Object.keys(updates).length)
      await db.update(contactsTable).set(updates).where(eq(contactsTable.id, contact.id));
  }
  await ensureContactCodeIndexes();
}

async function ensureContactsReady() {
  if (!setupPromise) setupPromise = ensureContactCodes();
  await setupPromise;
}

async function createCodeForType(type: string) {
  const contacts = await db.select().from(contactsTable);
  return contactCode(type, nextSequenceFor(type, contacts));
}

async function insertContactWithCode(type: string, values: Record<string, any>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await createCodeForType(type);
    try {
      const [contact] = await db
        .insert(contactsTable)
        .values({
          ...values,
          type,
          contactCode: code,
          normalizedContactCode: normalizeCode(code),
        })
        .returning();
      return contact;
    } catch (error: any) {
      if (error?.code !== 11000 || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to generate a unique contact code");
}

router.get("/", async (req, res) => {
  await ensureContactsReady();
  const pagination = paginateQuery(req.query);
  const type = normalizeType(req.query.type || "all");
  const search = String(req.query.search || "").trim();
  const filter = and(
    type !== "all" ? eq(contactsTable.type, type) : undefined,
    search
      ? or(
          ilike(contactsTable.name, `%${search}%`),
          ilike(contactsTable.company, `%${search}%`),
          ilike(contactsTable.phone, `%${search}%`),
          ilike(contactsTable.whatsappNumber, `%${search}%`),
          ilike(contactsTable.gstin, `%${search}%`),
          ilike(contactsTable.email, `%${search}%`),
          ilike(contactsTable.contactCode, `%${search}%`),
        )
      : undefined,
  );
  const searchFilter = and(
    search
      ? or(
          ilike(contactsTable.name, `%${search}%`),
          ilike(contactsTable.company, `%${search}%`),
          ilike(contactsTable.phone, `%${search}%`),
          ilike(contactsTable.whatsappNumber, `%${search}%`),
          ilike(contactsTable.gstin, `%${search}%`),
          ilike(contactsTable.email, `%${search}%`),
          ilike(contactsTable.contactCode, `%${search}%`),
        )
      : undefined,
  );
  const [contacts, totalCount, all, client, vendor, other] = await Promise.all([
    db
      .select()
      .from(contactsTable)
      .where(filter)
      .orderBy(desc(contactsTable.createdAt))
      .offset(pagination.skip)
      .limit(pagination.limit),
    db.count(contactsTable, filter),
    db.count(contactsTable, searchFilter),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "client"))),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "vendor"))),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "other"))),
  ]);
  res.json({
    ...paginatedResponse(contacts, totalCount, pagination),
    counts: { all, client, vendor, other },
  });
});

router.post("/", async (req, res) => {
  await ensureContactsReady();
  const {
    type,
    name,
    company,
    phone,
    whatsappNumber,
    gstin,
    stateCode,
    email,
    address,
    notes,
  } = req.body;
  const normalizedType = normalizeType(type);
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  if (!validTypes.has(normalizedType))
    return res.status(400).json({ error: "Invalid contact type" });

  const normalizedName = name.trim().toLocaleLowerCase();
  if (normalizedType === "vendor") {
    const existingVendors = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.type, "vendor"));
    const duplicate = existingVendors.some(
      (contact) => contact.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (duplicate) return res.status(409).json({ error: "Vendor already exists" });
  }
  try {
    const contact = await insertContactWithCode(normalizedType, {
      name: name.trim(),
      company: company?.trim() ?? "",
      phone: phone?.trim() ?? "",
      whatsappNumber: whatsappNumber?.trim() ?? "",
      gstin: gstin?.trim().toUpperCase() ?? "",
      stateCode: stateCode?.trim() || gstin?.trim().slice(0, 2) || "",
      email: email?.trim() ?? "",
      address: address?.trim() ?? "",
      notes: notes?.trim() ?? "",
    });
    return res.status(201).json(contact);
  } catch (error: any) {
    return res.status(error?.code === 11000 ? 409 : 500).json({
      error: error?.code === 11000 ? "Contact code already exists. Please retry." : error.message,
    });
  }
});

router.patch("/:id", async (req, res) => {
  await ensureContactsReady();
  const {
    type,
    name,
    company,
    phone,
    whatsappNumber,
    gstin,
    stateCode,
    email,
    address,
    notes,
  } = req.body;
  if (name !== undefined && !name.trim())
    return res.status(400).json({ error: "Name is required" });
  const normalizedType = type === undefined ? undefined : normalizeType(type);
  if (normalizedType !== undefined && !validTypes.has(normalizedType))
    return res.status(400).json({ error: "Invalid contact type" });

  const updates: Record<string, string> = {};
  if (normalizedType !== undefined) updates.type = normalizedType;
  if (name !== undefined) updates.name = name.trim();
  if (company !== undefined) updates.company = company.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber.trim();
  if (gstin !== undefined) updates.gstin = gstin.trim().toUpperCase();
  if (stateCode !== undefined) updates.stateCode = stateCode.trim();
  if (email !== undefined) updates.email = email.trim();
  if (address !== undefined) updates.address = address.trim();
  if (notes !== undefined) updates.notes = notes.trim();

  const [contact] = await db
    .update(contactsTable)
    .set(updates)
    .where(eq(contactsTable.id, Number(req.params.id)))
    .returning();
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  return res.json(contact);
});

router.delete("/:id", async (req, res) => {
  await ensureContactsReady();
  const [contact] = await db
    .delete(contactsTable)
    .where(eq(contactsTable.id, Number(req.params.id)))
    .returning();
  return res.json({
    success: true,
    id: contact?.id ?? Number(req.params.id),
    alreadyDeleted: !contact,
  });
});

ensureContactCodes().catch(() => {});
void modelFor;

export default router;
