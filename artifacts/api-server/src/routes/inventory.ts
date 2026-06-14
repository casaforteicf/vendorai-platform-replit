import { Router, type IRouter } from "express";
import { and, eq, lte, desc } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  inventoryMovementsTable,
  insertInventoryItemSchema,
  updateInventoryItemSchema,
  insertInventoryMovementSchema,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function userTenantId(req: Express.Request) {
  return (req as any).user?.tenantId as string | undefined;
}

function canAccessTenant(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || userTenantId(req) === tenantId;
}

// ─── Inventory Items ─────────────────────────────────────────────────────────

// POST /inventory-items
router.post("/inventory-items", async (req, res) => {
  const parsed = insertInventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (!canAccessTenant(req, parsed.data.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [item] = await db
    .insert(inventoryItemsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(item);
});

// GET /tenants/:tenantId/inventory-items
router.get("/tenants/:tenantId/inventory-items", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.tenantId, tenantId))
    .orderBy(inventoryItemsTable.createdAt);

  res.json(items);
});

// GET /tenants/:tenantId/inventory-items/low-stock
// NOTE: must be declared before /:id to avoid route shadowing
router.get("/tenants/:tenantId/inventory-items/low-stock", async (req, res) => {
  const { tenantId } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // quantidadeAtual <= quantidadeMinima (both stored as numeric strings)
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.tenantId, tenantId),
        lte(inventoryItemsTable.quantidadeAtual, inventoryItemsTable.quantidadeMinima)
      )
    )
    .orderBy(inventoryItemsTable.quantidadeAtual);

  res.json(items);
});

// GET /inventory-items/:id
router.get("/inventory-items/:id", async (req, res) => {
  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, item.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(item);
});

// PATCH /inventory-items/:id
router.patch("/inventory-items/:id", async (req, res) => {
  const parsed = updateInventoryItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [updated] = await db
    .update(inventoryItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(inventoryItemsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// DELETE /inventory-items/:id
router.delete("/inventory-items/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db
    .delete(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, existing.id));

  res.status(204).send();
});

// ─── Movement ────────────────────────────────────────────────────────────────

const movementBodySchema = insertInventoryMovementSchema
  .omit({ tenantId: true, inventoryItemId: true })
  .extend({ forcarNegativo: z.boolean().optional().default(false) });

// POST /tenants/:tenantId/inventory-items/:id/movement
router.post("/tenants/:tenantId/inventory-items/:id/movement", async (req, res) => {
  const { tenantId, id } = req.params;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = movementBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.id, id),
        eq(inventoryItemsTable.tenantId, tenantId)
      )
    );

  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  const { tipo, quantidade, motivo, referenciaId, responsavelId, forcarNegativo } = parsed.data;

  const qty = parseFloat(quantidade);
  const current = parseFloat(item.quantidadeAtual ?? "0");

  let newQty: number;
  if (tipo === "entrada") {
    newQty = current + qty;
  } else if (tipo === "saida") {
    newQty = current - qty;
    if (newQty < 0 && !forcarNegativo) {
      res.status(409).json({
        error: "Insufficient stock",
        quantidadeAtual: item.quantidadeAtual,
        quantidadeSolicitada: quantidade,
      });
      return;
    }
  } else {
    // ajuste: quantidade can be positive or negative — treat as absolute new value
    // Convention: ajuste sets the stock to the given value directly
    newQty = qty;
  }

  // Persist movement + update item in a single transaction
  const [movement, updatedItem] = await db.transaction(async (tx) => {
    const [mov] = await tx
      .insert(inventoryMovementsTable)
      .values({
        tenantId,
        inventoryItemId: id,
        tipo,
        quantidade,
        motivo,
        referenciaId: referenciaId ?? null,
        responsavelId: responsavelId ?? null,
      })
      .returning();

    const [upd] = await tx
      .update(inventoryItemsTable)
      .set({
        quantidadeAtual: String(newQty),
        updatedAt: new Date(),
      })
      .where(eq(inventoryItemsTable.id, id))
      .returning();

    return [mov, upd] as const;
  });

  res.status(201).json({ movement, item: updatedItem });
});

// ─── Inventory Movements (read) ───────────────────────────────────────────────

// GET /tenants/:tenantId/inventory-movements
router.get("/tenants/:tenantId/inventory-movements", async (req, res) => {
  const { tenantId } = req.params;
  const { inventoryItemId } = req.query;

  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(inventoryMovementsTable.tenantId, tenantId)];
  if (inventoryItemId && typeof inventoryItemId === "string") {
    conditions.push(eq(inventoryMovementsTable.inventoryItemId, inventoryItemId));
  }

  const movements = await db
    .select()
    .from(inventoryMovementsTable)
    .where(and(...conditions))
    .orderBy(desc(inventoryMovementsTable.createdAt));

  res.json(movements);
});

// GET /inventory-movements/:id
router.get("/inventory-movements/:id", async (req, res) => {
  const [movement] = await db
    .select()
    .from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.id, String(req.params.id)));

  if (!movement) {
    res.status(404).json({ error: "Movement not found" });
    return;
  }

  if (!canAccessTenant(req, movement.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(movement);
});

export default router;
