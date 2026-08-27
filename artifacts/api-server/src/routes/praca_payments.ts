import { Router, type IRouter } from "express";
import orendaPayRouter, { pracaOrendaPayPublicRouter } from "./praca_orendapay";
import legacyAsaasRouter, { pracaPaymentsPublicRouter as legacyAsaasPublicRouter } from "./praca_payments_legacy";

const router: IRouter = Router();
router.use(orendaPayRouter);
router.use(legacyAsaasRouter);

export const pracaPaymentsPublicRouter: IRouter = Router();
pracaPaymentsPublicRouter.use(pracaOrendaPayPublicRouter);
pracaPaymentsPublicRouter.use(legacyAsaasPublicRouter);

export default router;
