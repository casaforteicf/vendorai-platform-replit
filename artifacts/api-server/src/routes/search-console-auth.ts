import baseRouter, { searchConsoleCallbackRouter } from "./search-console-auth-core.js";
import aiVisibilityRouter from "./ai-visibility.js";

// Mantem toda a integracao existente do Search Console e acrescenta o
// Centro de Visibilidade em IA no mesmo agrupamento de Marketing/SEO.
baseRouter.use(aiVisibilityRouter);

export { searchConsoleCallbackRouter };
export default baseRouter;
