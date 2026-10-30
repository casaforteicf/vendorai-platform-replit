import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// HOTEL-01: consulta de locais e transferências. Não altera saldos.
// Montado após authenticate, enforceAccessScope e enforceModulePermission.
const router: IRouter = Router();

function authorized(req: Express.Request, tenantId: string): boolean {
  const user = (req as any).user;
  return Boolean(user?.tenantId && user.tenantId === tenantId);
}

router.get("/tenants/:tenantId/hotelaria/estoque/locais", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.execute(sql`
      SELECT id, code, name, kind, active, created_at
      FROM hotel_stock_locations
      WHERE tenant_id = ${tenantId}
      ORDER BY name ASC
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error("[hotel-stock] failed to list locations", error);
    return res.status(500).json({ error: "Failed to load stock locations" });
  }
});

router.get("/tenants/:tenantId/hotelaria/estoque/transferencias", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!authorized(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.execute(sql`
      SELECT id, origin_location_id, destination_location_id,
             status, requested_by, approved_by, notes, created_at, updated_at
      FROM hotel_stock_transfer_requests
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC LIMIT 100
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error("[hotel-stock] failed to list transfers", error);
    return res.status(500).json({ error: "Failed to load transfers" });
  }
});

export default router;
