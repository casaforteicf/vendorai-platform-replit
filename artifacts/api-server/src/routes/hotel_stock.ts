import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

// HOTEL-01: locais e transferências com escopo de tenant e aprovação explícita.
// Montado após authenticate, enforceAccessScope e enforceModulePermission.
const router: IRouter = Router();

function authorized(req: Express.Request, tenantId: string): boolean {
  const user = (req as any).user;
  return Boolean(user?.sub && user?.actorType !== "ai" && user?.actorType !== "system" && user?.tenantId === tenantId);
}

async function tenantRead(tenantId: string, statement: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(statement, [tenantId]);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

router.get("/tenants/:tenantId/hotelaria/estoque/locais", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await tenantRead(tenantId,
      "SELECT id, code, name, kind, active, created_at FROM hotel_stock_locations WHERE tenant_id=$1 ORDER BY name ASC"
    ));
  } catch (error) {
    console.error("[hotel-stock] failed to list locations", error);
    return res.status(500).json({ error: "Failed to load stock locations" });
  }
});

router.get("/tenants/:tenantId/hotelaria/estoque/transferencias", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await tenantRead(tenantId,
      "SELECT id, origin_location_id, destination_location_id, status, requested_by, approved_by, notes, created_at, updated_at FROM hotel_stock_transfer_requests WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100"
    ));
  } catch (error) {
    console.error("[hotel-stock] failed to list transfers", error);
    return res.status(500).json({ error: "Failed to load transfers" });
  }
});

const createTransferSchema = z.object({
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    quantity: z.number().positive().max(100000000),
  })).min(1).max(100),
}).strict().refine(v => v.originLocationId !== v.destinationLocationId, {
  message: "Origin and destination must differ",
});

function canApprove(req: Express.Request): boolean {
  const user = (req as any).user;
  return user?.platformRole === "tenant_admin"
    || user?.platformRole === "super_admin"
    || user?.userFunction === "administrador";
}

router.post("/tenants/:tenantId/hotelaria/estoque/transferencias", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = createTransferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Invalid transfer", details: parsed.error.issues });
  const actorId = (req as any).user?.sub;
  if (!actorId) return res.status(403).json({ error: "User identity required" });
  const { originLocationId, destinationLocationId, items, notes } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const loc = await client.query(
      "SELECT id FROM hotel_stock_locations WHERE tenant_id=$1 AND id=ANY($2::text[]) AND active",
      [tenantId, [originLocationId, destinationLocationId]],
    );
    if (loc.rowCount !== 2) { await client.query("ROLLBACK"); return res.status(422).json({ error: "Inactive or unknown location" }); }
    const ids = [...new Set(items.map(i => i.inventoryItemId))];
    const verified = await client.query(
      "SELECT id FROM inventory_items WHERE tenant_id=$1 AND id=ANY($2::text[])",
      [tenantId, ids],
    );
    if (verified.rowCount !== ids.length) { await client.query("ROLLBACK"); return res.status(422).json({ error: "Unknown inventory item" }); }
    const transferId = crypto.randomUUID();
    await client.query(
      `INSERT INTO hotel_stock_transfer_requests
       (id, tenant_id, origin_location_id, destination_location_id, requested_by, status, notes)
       VALUES ($1,$2,$3,$4,$5,'requested',$6)`,
      [transferId, tenantId, originLocationId, destinationLocationId, actorId, notes ?? null],
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO hotel_stock_transfer_items
         (id, tenant_id, transfer_id, inventory_item_id, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), tenantId, transferId, item.inventoryItemId, item.quantity],
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ id: transferId, status: "requested" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-stock] create transfer failed", err);
    return res.status(500).json({ error: "Failed to create transfer" });
  } finally { client.release(); }
});

router.post("/tenants/:tenantId/hotelaria/estoque/transferencias/:id/aprovar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId) || !canApprove(req)) return res.status(403).json({ error: "Forbidden" });
  const actorId = (req as any).user?.sub;
  if (!actorId) return res.status(403).json({ error: "User identity required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const transfer = await client.query(
      "SELECT status FROM hotel_stock_transfer_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [tenantId, String(req.params.id)],
    );
    if (!transfer.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Transfer not found" }); }
    if (transfer.rows[0].status !== "requested") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Transfer is not awaiting approval" });
    }
    await client.query(
      "UPDATE hotel_stock_transfer_requests SET status='approved', approved_by=$3, updated_at=now() WHERE tenant_id=$1 AND id=$2",
      [tenantId, String(req.params.id), actorId],
    );
    await client.query("COMMIT");
    return res.json({ id: String(req.params.id), status: "approved" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-stock] approval failed", err);
    return res.status(500).json({ error: "Failed to approve transfer" });
  } finally { client.release(); }
});

router.post("/tenants/:tenantId/hotelaria/estoque/transferencias/:id/concluir", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId) || !canApprove(req)) return res.status(403).json({ error: "Forbidden" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT hotel_stock_complete_transfer($1, $2)", [tenantId, String(req.params.id)]);
    await client.query("COMMIT");
    return res.json({ id: String(req.params.id), status: "completed" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[hotel-stock] completion failed", err);
    return res.status(409).json({ error: "Transfer could not be completed; verify status and available balance" });
  } finally { client.release(); }
});

export default router;
