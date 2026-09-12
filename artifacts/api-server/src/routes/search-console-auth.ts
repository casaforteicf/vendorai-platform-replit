import baseRouter, { searchConsoleCallbackRouter } from "./search-console-auth-core.js";
import aiVisibilityRouter from "./ai-visibility.js";
import aiVisibilityIntelligenceRouter from "./ai-visibility-intelligence.js";
import { authenticate } from "../middlewares/auth.js";
import { aiVisibilityAuditMiddleware } from "../lib/ai-visibility-audit.js";

// Mantem toda a integracao existente do Search Console e acrescenta o
// Centro de Visibilidade em IA no mesmo agrupamento de Marketing/SEO.
// A auditoria entra antes das rotas de mutacao; os handlers continuam
// fazendo a validacao de tenant individualmente, como no Search Console.
baseRouter.use("/tenants/:tenantId/ai-visibility", authenticate, aiVisibilityAuditMiddleware);
baseRouter.use(aiVisibilityRouter);
baseRouter.use(aiVisibilityIntelligenceRouter);

export { searchConsoleCallbackRouter };
export default baseRouter;
