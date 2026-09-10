import { Router, type IRouter } from "express";
import adminPartnersLegacyRouter from "./admin_partners_legacy.js";
import partnerReferralHistoryRouter from "./partner_referral_history.js";

const router: IRouter = Router();

// Mantém todos os endpoints legados de parceiros no mesmo caminho público.
router.use(adminPartnersLegacyRouter);

// Extensão analítica: período, campanha e cidade/região sobre a mesma fonte de atribuição.
router.use(partnerReferralHistoryRouter);

export default router;
