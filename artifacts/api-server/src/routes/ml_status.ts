import { Router, type IRouter } from "express";
import { isNotNull, eq, count } from "drizzle-orm";
import { db, mlFeatureSnapshotsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// Mesmos números do microserviço Python (services/ml-scout-service/db.py)
// — mantidos em sincronia manualmente, é só uma constante simples.
const MIN_EXAMPLES_TO_TRAIN = 100;
const MIN_EXAMPLES_PER_CLASS = 20;

// GET /admin/ml-status — quantos exemplos rotulados já existem, e se já
// dá pra treinar. Não depende do microserviço Python estar no ar — lê
// direto do Postgres, mesma tabela que ele vai ler quando for implantado.
router.get("/admin/ml-status", requireRole("super_admin"), async (_req, res) => {
  const [totalRow] = await db.select({ total: count() })
    .from(mlFeatureSnapshotsTable)
    .where(isNotNull(mlFeatureSnapshotsTable.resultado));

  const [ganhosRow] = await db.select({ total: count() })
    .from(mlFeatureSnapshotsTable)
    .where(eq(mlFeatureSnapshotsTable.resultado, "ganho"));

  const [perdidosRow] = await db.select({ total: count() })
    .from(mlFeatureSnapshotsTable)
    .where(eq(mlFeatureSnapshotsTable.resultado, "perdido"));

  const total = totalRow?.total ?? 0;
  const ganhos = ganhosRow?.total ?? 0;
  const perdidos = perdidosRow?.total ?? 0;

  const prontoParaTreinar = total >= MIN_EXAMPLES_TO_TRAIN && ganhos >= MIN_EXAMPLES_PER_CLASS && perdidos >= MIN_EXAMPLES_PER_CLASS;

  return res.json({
    totalExemplosRotulados: total,
    ganhos,
    perdidos,
    minimoNecessario: MIN_EXAMPLES_TO_TRAIN,
    minimoPorClasse: MIN_EXAMPLES_PER_CLASS,
    prontoParaTreinar,
  });
});

export default router;
