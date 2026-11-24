import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { abBriffingPrevisoesTable } from "@workspace/db";
import { abAllowed, camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

const SERVICOS = ["cafe_manha", "almoco", "jantar", "outro"] as const;

const corpoPrevisao = z.object({
  data: z.iso.date(),
  servico: z.enum(SERVICOS),
  ocupacao: z.number().int().min(0).max(100_000),
  evento: z.string().trim().max(255).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
}).strict();

function selectPrevisao() {
  return {
    id: abBriffingPrevisoesTable.id,
    data: abBriffingPrevisoesTable.data,
    servico: abBriffingPrevisoesTable.servico,
    ocupacao: abBriffingPrevisoesTable.ocupacao,
    evento: abBriffingPrevisoesTable.evento,
    observacoes: abBriffingPrevisoesTable.observacoes,
    updatedAt: abBriffingPrevisoesTable.updatedAt,
  };
}

router.get("/tenants/:tenantId/ab/briffing/previsoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const filtro = z.object({
    data: z.iso.date().optional(),
    de: z.iso.date().optional(),
    ate: z.iso.date().optional(),
    servico: z.enum(SERVICOS).optional(),
  }).safeParse(req.query);
  if (!filtro.success) return res.status(422).json({ error: "Filtro inválido", fields: camposInvalidos(filtro.error) });

  try {
    const previsoes = await withTenantTx(tenantId, async (tx) => {
      const conditions = [eq(abBriffingPrevisoesTable.tenantId, tenantId)];
      if (filtro.data.data) conditions.push(eq(abBriffingPrevisoesTable.data, filtro.data.data));
      if (filtro.data.de) conditions.push(gte(abBriffingPrevisoesTable.data, filtro.data.de));
      if (filtro.data.ate) conditions.push(lte(abBriffingPrevisoesTable.data, filtro.data.ate));
      if (filtro.data.servico) conditions.push(eq(abBriffingPrevisoesTable.servico, filtro.data.servico));
      return tx
        .select(selectPrevisao())
        .from(abBriffingPrevisoesTable)
        .where(and(...conditions))
        .orderBy(desc(abBriffingPrevisoesTable.data), abBriffingPrevisoesTable.servico)
        .limit(200);
    });
    return res.json({ previsoes });
  } catch (error) {
    console.error("[ab-briffing] list", error);
    return res.status(500).json({ error: "Não foi possível listar as previsões" });
  }
});

router.put("/tenants/:tenantId/ab/briffing/previsoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = corpoPrevisao.safeParse(req.body);
  if (!input.success) {
    return res.status(422).json({ error: "Previsão inválida", fields: camposInvalidos(input.error) });
  }

  try {
    const previsao = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx
        .select({ id: abBriffingPrevisoesTable.id })
        .from(abBriffingPrevisoesTable)
        .where(and(
          eq(abBriffingPrevisoesTable.tenantId, tenantId),
          eq(abBriffingPrevisoesTable.data, input.data.data),
          eq(abBriffingPrevisoesTable.servico, input.data.servico),
        ))
        .limit(1);
      if (existente) {
        const [row] = await tx.update(abBriffingPrevisoesTable).set({
          ocupacao: input.data.ocupacao,
          evento: input.data.evento ?? null,
          observacoes: input.data.observacoes ?? null,
          updatedAt: new Date(),
        }).where(eq(abBriffingPrevisoesTable.id, existente.id)).returning(selectPrevisao());
        return row;
      }
      const [row] = await tx.insert(abBriffingPrevisoesTable).values({
        tenantId,
        data: input.data.data,
        servico: input.data.servico,
        ocupacao: input.data.ocupacao,
        evento: input.data.evento ?? null,
        observacoes: input.data.observacoes ?? null,
        createdBy: req.user?.sub ?? null,
      }).returning(selectPrevisao());
      return row;
    });
    return res.status(201).json(previsao);
  } catch (error) {
    console.error("[ab-briffing] upsert", error);
    return res.status(500).json({ error: "Não foi possível salvar a previsão" });
  }
});

router.delete("/tenants/:tenantId/ab/briffing/previsoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().trim().min(1).max(100).safeParse(id).success) return res.status(422).json({ error: "Previsão inválida" });
  try {
    const removida = await withTenantTx(tenantId, async (tx) => (
      await tx.delete(abBriffingPrevisoesTable)
        .where(and(eq(abBriffingPrevisoesTable.tenantId, tenantId), eq(abBriffingPrevisoesTable.id, id)))
        .returning({ id: abBriffingPrevisoesTable.id })
    ).length > 0);
    return removida ? res.status(204).send() : res.status(404).json({ error: "Previsão não encontrada" });
  } catch (error) {
    console.error("[ab-briffing] delete", error);
    return res.status(500).json({ error: "Não foi possível excluir a previsão" });
  }
});

export default router;
