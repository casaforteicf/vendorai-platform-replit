import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { createExecutionLot } from "../services/execution_lots.js";
import { saveExecutionProgress } from "../services/execution_progress_persistence.js";
import { getExecutionLots, transitionExecutionLot } from "../services/execution_lot_lifecycle.js";

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

router.get("/execution-lots/deals/:dealId/proposals/:proposalId", async (req: any, res) => {
  if (!req.user?.tenantId) return void res.status(403).json({ error: "Acesso negado" });
  try {
    const result = await getExecutionLots(req.user.tenantId, String(req.params.dealId), String(req.params.proposalId));
    return void res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Proposta não encontrada") return void res.status(404).json({ error: "Proposta não encontrada" });
    console.error("execution lots listing", err);
    return void res.status(500).json({ error: "Falha na consulta de execução" });
  }
});

const transitionSchema = z.object({
  nextStatus: z.enum(["in_progress", "completed", "cancelled"]),
  reason: z.string().trim().max(1000).optional(),
});
router.post("/execution-lots/deals/:dealId/lots/:lotId/status", async (req: any, res) => {
  if (!req.user?.tenantId || !req.user?.sub) return void res.status(403).json({ error: "Acesso negado" });
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Dados inválidos" });
  try {
    const result = await transitionExecutionLot({
      tenantId: req.user.tenantId,
      actorId: req.user.sub,
      dealId: String(req.params.dealId),
      lotId: String(req.params.lotId),
      nextStatus: parsed.data.nextStatus,
      reason: parsed.data.reason,
    });
    return void res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Transição de estado não permitida" || msg === "Cancelamento exige justificativa" || msg === "Existem quantidades pendentes no lote" || msg === "Lote com execução registrada exige estorno") return void res.status(409).json({ error: msg });
    if (msg === "Negócio não localizado" || msg === "Lote não localizado") return void res.status(404).json({ error: "Lote não encontrado" });
    console.error("execution lot status", err);
    return void res.status(500).json({ error: "Falha na transição de execução" });
  }
});


const progressSchema = z.object({
  completedQuantity: z.number().nonnegative(),
  note: z.string().max(2000).optional(),
});
router.post("/execution-lots/deals/:dealId/lots/:lotId/items/:itemId/progress", async (req: any, res) => {
  if (!req.user?.tenantId || !req.user?.sub) return void res.status(403).json({ error: "Acesso negado" });
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Quantidade inválida" });
  try {
    return void res.json(await saveExecutionProgress({
      tenantId: req.user.tenantId,
      actorId: req.user.sub,
      dealId: String(req.params.dealId),
      lotId: String(req.params.lotId),
      itemId: String(req.params.itemId),
      completedQuantity: parsed.data.completedQuantity,
      note: parsed.data.note,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Quantidade") || message.includes("estorno") || message.includes("Lote não está")) {
      return void res.status(409).json({ error: message });
    }
    if (message.includes("não localizado")) return void res.status(404).json({ error: "Registro não encontrado" });
    console.error("execution progress failure", error);
    return void res.status(500).json({ error: "Falha ao registrar progresso" });
  }
});

export default router;
