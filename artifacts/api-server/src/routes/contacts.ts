import { Router } from "express";
import { and, contactsTable, db, desc, eq, ilike, or } from "@workspace/db";
import { paginateQuery, paginatedResponse } from "../lib/pagination";

const router = Router();
const validTypes = new Set(["client", "vendor", "other"]);

router.get("/", async (req, res) => {
  const pagination = paginateQuery(req.query);
  const type = String(req.query.type || "all");
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
        )
      : undefined,
  );
  const [contacts, totalCount, all, client, vendor, other] = await Promise.all([
    db.select().from(contactsTable).where(filter).orderBy(desc(contactsTable.createdAt)).offset(pagination.skip).limit(pagination.limit),
    db.count(contactsTable, filter),
    db.count(contactsTable, searchFilter),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "client"))),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "vendor"))),
    db.count(contactsTable, and(searchFilter, eq(contactsTable.type, "other"))),
  ]);
  res.json({ ...paginatedResponse(contacts, totalCount, pagination), counts: { all, client, vendor, other } });
});

router.post("/", async (req, res) => {
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
  if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
  if (!validTypes.has(type))
    return res.status(400).json({ error: "Invalid contact type" });

  const normalizedName = name.trim().toLocaleLowerCase();
  if (type === "vendor") {
    const existingVendors = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.type, "vendor"));
    const duplicate = existingVendors.some(
      (contact) => contact.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (duplicate) {
      return res.status(409).json({ error: "Vendor already exists" });
    }
  }
  const [contact] = await db
    .insert(contactsTable)
    .values({
      type,
      name: name.trim(),
      company: company?.trim() ?? "",
      phone: phone?.trim() ?? "",
      whatsappNumber: whatsappNumber?.trim() ?? "",
      gstin: gstin?.trim().toUpperCase() ?? "",
      stateCode: stateCode?.trim() || gstin?.trim().slice(0, 2) || "",
      email: email?.trim() ?? "",
      address: address?.trim() ?? "",
      notes: notes?.trim() ?? "",
    })
    .returning();
  return res.status(201).json(contact);
});

router.patch("/:id", async (req, res) => {
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
  if (type !== undefined && !validTypes.has(type))
    return res.status(400).json({ error: "Invalid contact type" });

  const updates: Record<string, string> = {};
  if (type !== undefined) updates.type = type;
  if (name !== undefined) updates.name = name.trim();
  if (company !== undefined) updates.company = company.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (whatsappNumber !== undefined)
    updates.whatsappNumber = whatsappNumber.trim();
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
  const [contact] = await db
    .delete(contactsTable)
    .where(eq(contactsTable.id, Number(req.params.id)))
    .returning();
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  return res.status(204).send();
});

export default router;
