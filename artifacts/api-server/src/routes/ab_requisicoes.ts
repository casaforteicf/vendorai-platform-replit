import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  AB_STATUS_REQUISICAO,
  abRequisicoesTable,
  insertAbRequisicaoSchema,
  insumosTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, isForeignKeyViolation, withTenantTx } from "../lib/ab/escopo.js";
import { darBaixaNaRequisicao } from "../lib/ab/saida-estoque.js";

const router: IRouter = Router();

/**
 * A&B — requisição de estoque (AB-08).
 *
 * Criar pedido NÃO mexe no saldo. A baixa só acontece em
 * `PATCH /:id/entregar`, e a transição de status é atômica com a baixa.
 */

function hojeISO(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** A unidade base NÃO vem do corpo: é a do insumo no catálogo. */
const corpoCriacao = insertAbRequisicaoSchema.omit({ unidadeBase: true });

// ── POST /tenants/:tenantId/ab/requisicoes ───────────────────────────────────
router.post("/tenants/:tenantId/ab/requisicoes", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = corpoCriacao.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Requisição inválida", fields: camposInvalidos(parsed.error) });
  }

  try {
    const criada = await withTenantTx(t, async (tx) => {
      const [insumo] = await tx
        .select({ id: insumosTable.id, nome: insumosTable.nome, unidade: insumosTable.unidade })
        .from(insumosTable)
        .where(and(eq(insumosTable.tenantId, t), eq(insumosTable.id, parsed.data.insumoId)));

      if (!insumo) return { naoEncontrado: true as const };

      const unidade = insumo.unidade?.toLowerCase();
      if (unidade !== "g" && unidade !== "ml" && unidade !== "un") {
        return { unidadeInvalida: true as const, unidade: insumo.unidade };
      }

      const [linha] = await tx
        .insert(abRequisicoesTable)
        .values({
          tenantId: t,
          setor: parsed.data.setor,
          insumoId: parsed.data.insumoId,
          quantidadeBase: parsed.data.quantidadeBase,
          unidadeBase: unidade,
          dataSolicitacao: parsed.data.dataSolicitacao ?? hojeISO(),
          status: "pendente",
          solicitadoPor: req.user?.sub ?? null,
        })
        .returning();

      return { requisicao: linha, insumo };
    });

    if ("naoEncontrado" in criada) {
      return res.status(404).json({ error: "Insumo não encontrado neste hotel" });
    }
    if ("unidadeInvalida" in criada) {
      return res.status(422).json({
        error: `Insumo com unidade "${criada.unidade}" não pode ser requisitado (esperado g, ml ou un).`,
      });
    }

    return res.status(201).json({ ...criada.requisicao, insumoNome: criada.insumo?.nome ?? null });
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      return res.status(422).json({ error: "Insumo não pertence a este hotel" });
    }
    console.error("[ab-requisicoes] create", e);
    return res.status(500).json({ error: "Could not create requisicao" });
  }
});

// ── GET /tenants/:tenantId/ab/requisicoes ────────────────────────────────────
router.get("/tenants/:tenantId/ab/requisicoes", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  if (statusParam && !AB_STATUS_REQUISICAO.includes(statusParam as never)) {
    return res.status(422).json({ error: "Status inválido" });
  }

  try {
    const requisicoes = await withTenantTx(t, async (tx) =>
      tx
        .select({
          id: abRequisicoesTable.id,
          setor: abRequisicoesTable.setor,
          insumoId: abRequisicoesTable.insumoId,
          quantidadeBase: abRequisicoesTable.quantidadeBase,
          unidadeBase: abRequisicoesTable.unidadeBase,
          status: abRequisicoesTable.status,
          dataSolicitacao: abRequisicoesTable.dataSolicitacao,
          baixaAplicadaEm: abRequisicoesTable.baixaAplicadaEm,
          createdAt: abRequisicoesTable.createdAt,
          insumoNome: insumosTable.nome,
        })
        .from(abRequisicoesTable)
        .leftJoin(
          insumosTable,
          and(
            eq(insumosTable.tenantId, abRequisicoesTable.tenantId),
            eq(insumosTable.id, abRequisicoesTable.insumoId),
          ),
        )
        .where(
          statusParam
            ? and(eq(abRequisicoesTable.tenantId, t), eq(abRequisicoesTable.status, statusParam))
            : eq(abRequisicoesTable.tenantId, t),
        )
        .orderBy(asc(abRequisicoesTable.status), desc(abRequisicoesTable.createdAt))
        .limit(200),
    );

    const pendentes = requisicoes.filter((r) => r.status === "pendente").length;
    return res.json({ requisicoes, resumo: { total: requisicoes.length, pendentes } });
  } catch (e) {
    console.error("[ab-requisicoes] list", e);
    return res.status(500).json({ error: "Could not list requisicoes" });
  }
});

// ── PATCH /tenants/:tenantId/ab/requisicoes/:id/entregar ─────────────────────
router.patch("/tenants/:tenantId/ab/requisicoes/:id/entregar", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const id = req.params.id ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(422).json({ error: "Id inválido" });

  try {
    const requisicao = await withTenantTx(t, async (tx) => {
      const [linha] = await tx
        .select()
        .from(abRequisicoesTable)
        .where(and(eq(abRequisicoesTable.tenantId, t), eq(abRequisicoesTable.id, id)));
      return linha;
    });

    if (!requisicao) return res.status(404).json({ error: "Requisição não encontrada" });

    const resultado = await darBaixaNaRequisicao({
      tenantId: t,
      requisicaoId: requisicao.id,
      insumoId: requisicao.insumoId,
      quantidadeBase: Number(requisicao.quantidadeBase),
      unidadeBase: requisicao.unidadeBase as "g" | "ml" | "un",
    });

    if ("jaEntregue" in resultado) {
      return res.status(409).json({
        error: "Requisição já entregue — a baixa não pode ser aplicada duas vezes.",
      });
    }
    if (!resultado.entregue) {
      return res.status(422).json({
        error: resultado.motivo,
        disponivel: resultado.disponivel ?? null,
        necessario: resultado.necessario ?? null,
      });
    }

    return res.json({ id: requisicao.id, status: "entregue", baixa: resultado });
  } catch (e) {
    console.error("[ab-requisicoes] entregar", e);
    return res.status(500).json({ error: "Could not deliver requisicao" });
  }
});

export default router;
