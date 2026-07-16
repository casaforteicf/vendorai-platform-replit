import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prospectorFlowExecutionsTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * GET /track/c/:execId
 * Rastreamento de clique em material de fluxo de nutrição.
 * Registra clicadaEm na execução e redireciona para o material.
 */
router.get("/track/c/:execId", async (req, res) => {
  const { execId } = req.params;

  try {
    const [exec] = await db
      .select({ id: prospectorFlowExecutionsTable.id, materialGeradoUrl: prospectorFlowExecutionsTable.materialGeradoUrl, clicadaEm: prospectorFlowExecutionsTable.clicadaEm })
      .from(prospectorFlowExecutionsTable)
      .where(eq(prospectorFlowExecutionsTable.id, execId))
      .limit(1);

    if (exec && !exec.clicadaEm) {
      await db
        .update(prospectorFlowExecutionsTable)
        .set({ clicadaEm: new Date() })
        .where(eq(prospectorFlowExecutionsTable.id, execId));
      req.log.info({ execId }, "content-tracking: clique registrado");
    }

    const redirectUrl = exec?.materialGeradoUrl ?? "/";
    return res.redirect(302, redirectUrl);
  } catch (err) {
    req.log.error({ err, execId }, "content-tracking: erro ao registrar clique");
    return res.redirect(302, "/");
  }
});

export default router;
