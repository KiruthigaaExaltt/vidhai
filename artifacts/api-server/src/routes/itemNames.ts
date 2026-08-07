import { Router } from "express";
import { db, itemNamesTable, inventoryCategoriesTable, materialsTable } from "@workspace/db";
import { eq, desc, and } from "@workspace/db";

const router = Router();

router.get("/", async (req, res) => {
  // Join itemNames with inventoryCategories to return category name as well
  const items = await db.select({
    id: itemNamesTable.id,
    name: itemNamesTable.name,
    categoryId: itemNamesTable.categoryId,
    category: inventoryCategoriesTable.name,
    isActive: itemNamesTable.isActive,
  })
  .from(itemNamesTable)
  .innerJoin(inventoryCategoriesTable, eq(itemNamesTable.categoryId, inventoryCategoriesTable.id))
  .where(eq(itemNamesTable.isActive, true))
  .orderBy(desc(itemNamesTable.id));
  
  res.json(items);
});

router.post("/", async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    
    if (!name?.trim() || !categoryId) {
      res.status(400).json({ error: "Item name and category are required" });
      return;
    }
    
    const trimmedName = name.trim();
    
    // Validate category exists and is active
    const [category] = await db.select().from(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.id, Number(categoryId))).limit(1);
    if (!category) {
      res.status(400).json({ error: "Selected category does not exist" });
      return;
    }
    if (!category.isActive) {
      res.status(400).json({ error: "Selected category is not active" });
      return;
    }
    
    // Globally unique case-insensitive check
    const existing = await db.select().from(itemNamesTable).where(eq(itemNamesTable.isActive, true));
    if (existing.some(item => item.name.toLowerCase() === trimmedName.toLowerCase())) {
      res.status(400).json({ error: "An active item with this name already exists" });
      return;
    }
    
    const [newItem] = await db.insert(itemNamesTable).values({
      name: trimmedName,
      categoryId: Number(categoryId),
      isActive: true,
    }).returning();
    
    res.status(201).json({
      id: newItem.id,
      name: newItem.name,
      categoryId: newItem.categoryId,
      category: category.name,
      isActive: newItem.isActive,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, categoryId } = req.body;
    
    const [item] = await db.select().from(itemNamesTable).where(eq(itemNamesTable.id, id)).limit(1);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    
    const updates: any = {};
    
    if (name) {
      const trimmedName = name.trim();
      const existing = await db.select().from(itemNamesTable).where(and(eq(itemNamesTable.isActive, true)));
      if (existing.some(i => i.id !== id && i.name.toLowerCase() === trimmedName.toLowerCase())) {
        res.status(400).json({ error: "An active item with this name already exists" });
        return;
      }
      updates.name = trimmedName;
    }
    
    if (categoryId && Number(categoryId) !== item.categoryId) {
      // Check if item is used by materials/SKUs
      // Assuming itemNamesTable isn't directly referenced in materialsTable yet, 
      // but if the name is used in materialsTable as a text, we can check that.
      // Wait, materialsTable has `name` which is the Item Name.
      const skusUsingThisItem = await db.select().from(materialsTable).where(eq(materialsTable.name, item.name)).limit(1);
      if (skusUsingThisItem.length > 0) {
        res.status(400).json({ error: "Cannot change category because this Item Name is already used in existing SKUs" });
        return;
      }
      
      const [category] = await db.select().from(inventoryCategoriesTable).where(eq(inventoryCategoriesTable.id, Number(categoryId))).limit(1);
      if (!category) {
        res.status(400).json({ error: "Selected category does not exist" });
        return;
      }
      updates.categoryId = Number(categoryId);
    }
    
    if (Object.keys(updates).length > 0) {
      const [updated] = await db.update(itemNamesTable).set(updates).where(eq(itemNamesTable.id, id)).returning();
      res.json(updated);
    } else {
      res.json(item);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [item] = await db.select().from(itemNamesTable).where(eq(itemNamesTable.id, id)).limit(1);
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    
    // Soft deletion
    await db.update(itemNamesTable).set({ isActive: false }).where(eq(itemNamesTable.id, id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
