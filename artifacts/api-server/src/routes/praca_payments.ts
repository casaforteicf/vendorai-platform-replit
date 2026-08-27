import { Router, type IRouter } from "express";
import orendaPayRouter, { pracaOrendaPayPublicRouter } from "./praca_orendapay";
import legacyAsaasRouter, { pracaPaymentsPublicRouter as legacyAsaasPublicRouter } from "./praca_payments_legacy";

const router: IRouter = Router();

// Keep the existing checkout contract while OrendaPay is the primary provider.
// This lets the current frontend continue POSTing to /payment-intents unchanged.
router.use((req, _res, next) => {
  if (req.method === "POST" && /\/praca-orders\/[^/]+\/payment-intents$/.test(req.path)) {
    req.url = req.url.replace(/\/payment-intents(?=\?|$)/, "/payment-intents/orendapay");
  }
  next();
});

router.use(orendaPayRouter);
router.use(legacyAsaasRouter);

export const pracaPaymentsPublicRouter: IRouter = Router();
pracaPaymentsPublicRouter.use(pracaOrendaPayPublicRouter);
pracaPaymentsPublicRouter.use(legacyAsaasPublicRouter);

export default router;
