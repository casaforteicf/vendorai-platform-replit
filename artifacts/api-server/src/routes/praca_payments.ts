import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import orendaPayRouter, { pracaOrendaPayPublicRouter } from "./praca_orendapay";
import legacyAsaasRouter, { pracaPaymentsPublicRouter as legacyAsaasPublicRouter } from "./praca_payments_legacy";

const router: IRouter = Router();

// Keep the existing checkout contract while OrendaPay is the primary provider.
// Hydrate fields OrendaPay requires from the order and existing tenant users.
router.use(async (req, _res, next) => {
  try {
    const match = req.method === "POST"
      ? req.path.match(/^\/tenants\/([^/]+)\/praca-orders\/([^/]+)\/payment-intents$/)
      : null;
    if (!match) return next();

    const [, tenantId, orderId] = match;
    const orderQ = await vendorPool.query(
      `SELECT endereco_entrega FROM praca_pedidos WHERE tenant_id=$1 AND id=$2`,
      [tenantId, orderId],
    );
    const e = orderQ.rows[0]?.endereco_entrega || {};
    req.body = req.body || {};
    req.body.address = {
      street: e.endereco || e.logradouro || e.rua || e.street || e.address || "",
      city: e.cidade || e.city || "",
      state: e.uf || e.estado || e.state || "",
      postalCode: e.cep || e.postalCode || e.zip || "",
    };

    const courierIds = Array.isArray(req.body?.courierSplits)
      ? req.body.courierSplits.map((x:any)=>String(x?.courierId||"")).filter(Boolean)
      : [];
    const users = await vendorPool.query(
      `SELECT id,email,user_function,role,platform_role FROM users
        WHERE tenant_id=$1 AND active=true AND email IS NOT NULL
          AND (id=ANY($2::text[]) OR platform_role='tenant_admin')`,
      [tenantId,courierIds],
    );
    const sellerEmail = users.rows.find((u:any)=>u.platform_role==='tenant_admin')?.email;
    if (sellerEmail) {
      await vendorPool.query(
        `INSERT INTO praca_payment_recipients (tenant_id,owner_type,owner_id,provider,wallet_id,status,metadata)
         VALUES ($1,'seller',$1,'orendapay',$2,'active','{"source":"tenant_admin_email"}'::jsonb)
         ON CONFLICT (tenant_id,provider,owner_type,owner_id) DO NOTHING`,
        [tenantId,String(sellerEmail).trim().toLowerCase()],
      );
    }
    for (const courierId of courierIds) {
      const email = users.rows.find((u:any)=>String(u.id)===courierId)?.email;
      if (!email) continue;
      await vendorPool.query(
        `INSERT INTO praca_payment_recipients (tenant_id,owner_type,owner_id,provider,wallet_id,status,metadata)
         VALUES ($1,'courier',$2,'orendapay',$3,'active','{"source":"user_email"}'::jsonb)
         ON CONFLICT (tenant_id,provider,owner_type,owner_id) DO NOTHING`,
        [tenantId,courierId,String(email).trim().toLowerCase()],
      );
    }

    req.url = req.url.replace(/\/payment-intents(?=\?|$)/, "/payment-intents/orendapay");
    next();
  } catch (error) {
    next(error);
  }
});

router.use(orendaPayRouter);
router.use(legacyAsaasRouter);

export const pracaPaymentsPublicRouter: IRouter = Router();
pracaPaymentsPublicRouter.use(pracaOrendaPayPublicRouter);
pracaPaymentsPublicRouter.use(legacyAsaasPublicRouter);

export default router;