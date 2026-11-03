import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { executarMotorPreditivo } from "../jobs/abEstoquePreditivo.js";
import { sincronizarSaldosAb } from "../jobs/abEstoqueSync.js";
import { reprocessarRecebimentosPendentes } from "../lib/ab/entrada-estoque.js";

const router: IRouter = Router();

/**
 * Gatilho interno do motor preditivo (AB-03 / FASE 3).
 *
 * Não é rota de usuário: é chamada pelo cron do servidor ou por operação
 * assistida, autenticada por `x-internal-key` (`AB_PREDICTIVE_KEY`). Sem a
 * variável configurada, responde 503 — nunca fica aberta por omissão.
 */
function requireInternalKey(req: any, res: any, next: any) {
  const configurada = process.env["AB_PREDICTIVE_KEY"];
  if (!configurada) {
    return res.status(503).json({ error: "AB_PREDICTIVE_KEY não configurada" });
  }
  if (req.header("x-internal-key") !== configurada) {
    return res.status(401).json({ error: "Chave interna inválida" });
  }
  return next();
}

const corpo = z
  .object({
    tenantIds: z.array(z.string().min(1)).max(500).optional(),
    janelaDias: z.number().int().min(1).max(365).optional(),
    diasCobertura: z.number().int().min(1).max(365).optional(),
    dataReferencia: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato yyyy-mm-dd")
      .optional(),
    /** Calcula sem gravar — útil antes de ligar o cron em um ambiente. */
    dryRun: z.boolean().optional(),
  })
  .strict();

router.post("/internal/ab/estoque/preditivo", requireInternalKey, async (req, res) => {
  const parsed = corpo.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: "Parâmetros inválidos",
      fields: parsed.error.issues.map((issue) => issue.path.join(".") || "(corpo)"),
    });
  }

  try {
    const resumo = await executarMotorPreditivo(parsed.data);
    return res.status(parsed.data.dryRun ? 200 : 201).json(resumo);
  } catch (erro) {
    console.error("[ab-preditivo] execução falhou", erro);
    return res.status(500).json({ error: "Não foi possível executar o motor preditivo" });
  }
});

/**
 * Sincroniza `ab_estoque_saldos` a partir de `hotel_stock_location_balances`,
 * convertendo as unidades. Precisa rodar ANTES do motor preditivo: sem saldo
 * atualizado, a sugestão de compra olha para número velho.
 */
const corpoSync = z
  .object({
    tenantIds: z.array(z.string().min(1)).max(500).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

router.post("/internal/ab/estoque/sync", requireInternalKey, async (req, res) => {
  const parsed = corpoSync.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: "Parâmetros inválidos",
      fields: parsed.error.issues.map((issue) => issue.path.join(".") || "(corpo)"),
    });
  }

  try {
    const resumo = await sincronizarSaldosAb(parsed.data);
    return res.json(resumo);
  } catch (erro) {
    console.error("[ab-sync] execução falhou", erro);
    return res.status(500).json({ error: "Não foi possível sincronizar os saldos" });
  }
});

/**
 * Reprocessa recebimentos aprovados que não entraram no saldo físico (AB-07).
 * Serve para quando o cadastro que faltava é corrigido (item de estoque, local,
 * fator de embalagem): a fila é reaplicada sem tocar nos recebimentos.
 */
const corpoReprocesso = z
  .object({
    tenantIds: z.array(z.string().min(1)).max(500).optional(),
    limite: z.number().int().min(1).max(2000).optional(),
  })
  .strict();

router.post(
  "/internal/ab/estoque/reprocessar-recebimentos",
  requireInternalKey,
  async (req, res) => {
    const parsed = corpoReprocesso.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({
        error: "Parâmetros inválidos",
        fields: parsed.error.issues.map((issue) => issue.path.join(".") || "(corpo)"),
      });
    }

    try {
      const resumo = await reprocessarRecebimentosPendentes(parsed.data);
      return res.json(resumo);
    } catch (erro) {
      console.error("[ab-entrada-estoque] reprocessamento falhou", erro);
      return res.status(500).json({ error: "Não foi possível reprocessar os recebimentos" });
    }
  },
);

export default router;
