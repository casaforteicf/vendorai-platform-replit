import { Router, type IRouter } from "express";
import orendaPayRouter, { pracaOrendaPayPublicRouter } from "./praca_orendapay";
import legacyAsaasRouter, { pracaPaymentsPublicRouter as legacyAsaasPublicRouter } from "./praca_payments_legacy";

const router: IRouter = Router();

// Asaas é o provedor padrão oficial do Market/Praça.
// O contrato canônico permanece:
// POST /tenants/:tenantId/praca-orders/:orderId/payment-intents
// Provedores alternativos/legados devem usar rotas explícitas próprias
// (ex.: /payment-intents/orendapay) e nunca interceptar silenciosamente
// o endpoint padrão.
router.use(legacyAsaasRouter);
router.use(orendaPayRouter);

export const pracaPaymentsPublicRouter: IRouter = Router();
// Eventos Asaas são prioritários no fluxo padrão. OrendaPay permanece apenas
// para integrações legadas ou chamadas explícitas ao seu provedor.
pracaPaymentsPublicRouter.use(legacyAsaasPublicRouter);
pracaPaymentsPublicRouter.use(pracaOrendaPayPublicRouter);

export default router;
