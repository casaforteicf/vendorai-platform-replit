import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { createExecutionLot } from "../services/execution_lots.js";

const router: IRouter = Router();
const requestSchema = z.object({
  proposalId: z.string().uuid(),
  requestKey: z.string().min(8).max(160),
  label: z.string().max(160).optional(),
  items: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().positive(),
  })).min(1).max(500),
});

/** Montar apenas no segmento autenticado e com escopo de módulos da API. */
router.post("/execution-lots/deals/:dealId", async (req: any, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Dados do lote inválidos", issues: parsed.error.issues });
  const tenantId = req.user?.tenantId;
  const actorId = req.user?.sub;
  if (!tenantId || !actorId) return void res.status(403).json({ error: "Credenciais insuficientes" });
  try {
    const created = await createExecutionLot({
      tenantId, actorId, dealId: String(req.params.dealId),
      proposalId: parsed.data.proposalId, requestKey: parsed.data.requestKey,
      label: parsed.data.label, items: parsed.data.items,
    });
    return void res.status(created.idempotentReplay ? 200 : 201).json(created);
  } catch (error) {
    // Não revelar SQL ou dados de outro tenant em mensagens de erro.
    const message = error instanceof Error ? error.message : "";
    const businessErrors = [
      "Negócio não localizado", "Proposta aceita não encontrada", "Proposta sem itens",
      "Quantidade", "quantidade", "Item", "Chave de idempotência",
    ];
    if (businessErrors.some((prefix) => message.includes(prefix))) {
      return void res.status(409).json({ error: message, code: "EXECUTION_LOT_VALIDATION" });
    }
    console.error("execution-lots: falha na criação", error);
    return void res.status(500).json({ error: "Não foi possível reservar o lote" });
  }
});
export default router;
