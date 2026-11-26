import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  AB_STATUS_ORDEM_COMPRA,
  abOrdemCompraItensTable,
  abOrdensCompraTable,
  type AbStatusOrdemCompra,
} from "@workspace/db";
import { executarMotorPreditivo } from "../jobs/abEstoquePreditivo.js";
import {
  abAllowed,
  camposInvalidos,
  withTenantTx,
} from "../lib/ab/escopo.js";
import {
  podeTransicionarOrdem,
  proximosStatusOrdem,
  ordemEditavel,
} from "../lib/ab/ordens-compra.js";

const router: IRouter = Router();

/**
 * A&B — ordens de compra do motor preditivo (AB-11).
 *
 * O motor já cria a ordem `sugerida` a partir do saldo/política/consumo. Esta
 * rota dá ao gerente o ciclo humano: revisar itens, aprovar, enviar, marcar
 * como recebida ou cancelar. A entrada de estoque NÃO acontece aqui; continua
 * no recebimento (AB-06/07), que é o único fluxo que escreve saldo.
 */

const dataISO = z.iso.date();
const decimal = z
  .union([z.string(), z.number()])
  .transform((valor) => String(valor))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Valor decimal inválido"));
const quantidadePositiva = decimal.refine((valor) => Number(valor) > 0, "Deve ser maior que zero");
const custoNaoNegativo = decimal.refine((valor) => Number(valor) >= 0, "Não pode ser negativo");

async function carregarOrdem(tx: any, tenantId: string, ordemId: string) {
  const [ordem] = await tx
    .select()
    .from(abOrdensCompraTable)
    .where(and(eq(abOrdensCompraTable.tenantId, tenantId), eq(abOrdensCompraTable.id, ordemId)));
  if (!ordem) return null;
  const itens = await tx
    .select()
    .from(abOrdemCompraItensTable)
    .where(
      and(
        eq(abOrdemCompraItensTable.tenantId, tenantId),
        eq(abOrdemCompraItensTable.ordemId, ordemId),
      ),
    )
    .orderBy(abOrdemCompraItensTable.insumoNome);
  return { ...ordem, itens };
}

// ── GET /tenants/:tenantId/ab/ordens-compra?status= ─────────────────────────
router.get("/tenants/:tenantId/ab/ordens-compra", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const filtro = z
    .object({ status: z.enum(AB_STATUS_ORDEM_COMPRA).optional() })
    .safeParse(req.query);
  if (!filtro.success) {
    return res.status(422).json({ error: "Filtro inválido", fields: camposInvalidos(filtro.error) });
  }

  try {
    const ordens = await withTenantTx(tenantId, async (tx) => {
      const condicoes = [eq(abOrdensCompraTable.tenantId, tenantId)];
      if (filtro.data.status) condicoes.push(eq(abOrdensCompraTable.status, filtro.data.status));
      const lista = await tx
        .select()
        .from(abOrdensCompraTable)
        .where(and(...condicoes))
        .orderBy(desc(abOrdensCompraTable.coberturaInicio), desc(abOrdensCompraTable.createdAt))
        .limit(200);

      const ids = lista.map((ordem) => ordem.id);
      const itens = ids.length
        ? await tx
            .select()
            .from(abOrdemCompraItensTable)
            .where(
              and(
                eq(abOrdemCompraItensTable.tenantId, tenantId),
                inArray(abOrdemCompraItensTable.ordemId, ids),
              ),
            )
            .orderBy(abOrdemCompraItensTable.insumoNome)
        : [];

      return lista.map((ordem) => ({
        ...ordem,
        itens: itens.filter((item) => item.ordemId === ordem.id),
      }));
    });
    return res.json({ ordens });
  } catch (erro) {
    console.error("[ab-ordens] list", erro);
    return res.status(500).json({ error: "Não foi possível listar as ordens de compra" });
  }
});

// ── GET /tenants/:tenantId/ab/ordens-compra/:id ─────────────────────────────
router.get("/tenants/:tenantId/ab/ordens-compra/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const ordemId = String(req.params.id);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(ordemId).success) {
    return res.status(422).json({ error: "Ordem inválida" });
  }
  try {
    const ordem = await withTenantTx(tenantId, (tx) => carregarOrdem(tx, tenantId, ordemId));
    return ordem ? res.json(ordem) : res.status(404).json({ error: "Ordem não encontrada" });
  } catch (erro) {
    console.error("[ab-ordens] get", erro);
    return res.status(500).json({ error: "Não foi possível carregar a ordem" });
  }
});

// ── POST /tenants/:tenantId/ab/ordens-compra/gerar ──────────────────────────
router.post("/tenants/:tenantId/ab/ordens-compra/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const input = z
    .object({
      dataReferencia: dataISO.optional(),
      diasCobertura: z.number().int().min(1).max(365).optional(),
      janelaDias: z.number().int().min(1).max(365).optional(),
    })
    .strict()
    .safeParse(req.body ?? {});
  if (!input.success) {
    return res.status(422).json({ error: "Parâmetros inválidos", fields: camposInvalidos(input.error) });
  }

  try {
    const resumo = await executarMotorPreditivo({
      tenantIds: [tenantId],
      ...input.data,
    });
    const ordem = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx
        .select()
        .from(abOrdensCompraTable)
        .where(
          and(
            eq(abOrdensCompraTable.tenantId, tenantId),
            eq(abOrdensCompraTable.coberturaInicio, resumo.dataReferencia),
            eq(abOrdensCompraTable.coberturaFim, resumo.coberturaFim),
          ),
        )
        .orderBy(desc(abOrdensCompraTable.createdAt))
        .limit(1);
      if (!existente) return null;
      return carregarOrdem(tx, tenantId, existente.id);
    });
    return res.json({ ordem, resumo });
  } catch (erro) {
    console.error("[ab-ordens] gerar", erro);
    return res.status(500).json({ error: "Não foi possível gerar a ordem de compra" });
  }
});

// ── PATCH /tenants/:tenantId/ab/ordens-compra/:id ───────────────────────────
router.patch("/tenants/:tenantId/ab/ordens-compra/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const ordemId = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(ordemId).success) {
    return res.status(422).json({ error: "Ordem inválida" });
  }
  const input = z
    .object({
      status: z.enum(AB_STATUS_ORDEM_COMPRA).optional(),
      fornecedor: z.string().trim().max(120).nullable().optional(),
      dataEntregaPrevista: z.iso.date().nullable().optional(),
      observacao: z.string().trim().max(1000).nullable().optional(),
    })
    .strict()
    .safeParse(req.body);
  if (!input.success) {
    return res.status(422).json({ error: "Alteração inválida", fields: camposInvalidos(input.error) });
  }
  if (Object.keys(input.data).length === 0) {
    return res.status(422).json({ error: "Nada para atualizar" });
  }

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const [ordem] = await tx
        .select()
        .from(abOrdensCompraTable)
        .where(and(eq(abOrdensCompraTable.tenantId, tenantId), eq(abOrdensCompraTable.id, ordemId)));
      if (!ordem) return { tipo: "nao_encontrada" as const };

      if (input.data.status && input.data.status !== ordem.status) {
        const atual = ordem.status as AbStatusOrdemCompra;
        if (!podeTransicionarOrdem(atual, input.data.status)) {
          return {
            tipo: "transicao_invalida" as const,
            atual,
            permitidos: proximosStatusOrdem(atual),
          };
        }
        if (input.data.status === "recebida") {
          const itens = await tx
            .select()
            .from(abOrdemCompraItensTable)
            .where(and(eq(abOrdemCompraItensTable.tenantId, tenantId), eq(abOrdemCompraItensTable.ordemId, ordemId)));
          const pendentes = itens.filter((item: any) => Number(item.quantidadeRecebida) < Number(item.quantidade));
          if (pendentes.length > 0) {
            return { tipo: "recebimento_pendente" as const, pendentes: pendentes.length };
          }
        }
      }

      const alteracoes: Record<string, unknown> = {};
      if (input.data.status !== undefined) alteracoes.status = input.data.status;
      if (input.data.fornecedor !== undefined) alteracoes.fornecedor = input.data.fornecedor;
      if (input.data.dataEntregaPrevista !== undefined) alteracoes.dataEntregaPrevista = input.data.dataEntregaPrevista;
      if (input.data.observacao !== undefined) alteracoes.observacao = input.data.observacao;
      if (input.data.status === "aprovada" && ordem.status !== "aprovada") {
        alteracoes.aprovadaPor = req.user!.sub;
        alteracoes.aprovadaEm = new Date();
      }

      await tx
        .update(abOrdensCompraTable)
        .set(alteracoes)
        .where(and(eq(abOrdensCompraTable.tenantId, tenantId), eq(abOrdensCompraTable.id, ordemId)));

      return { tipo: "ok" as const, ordem: await carregarOrdem(tx, tenantId, ordemId) };
    });

    if (resultado.tipo === "nao_encontrada") {
      return res.status(404).json({ error: "Ordem não encontrada" });
    }
    if (resultado.tipo === "transicao_invalida") {
      return res.status(409).json({
        error: `Não é possível passar de ${resultado.atual} para ${input.data.status}`,
        permitidos: resultado.permitidos,
      });
    }
    if (resultado.tipo === "recebimento_pendente") {
      return res.status(409).json({
        error: `Ainda há ${resultado.pendentes} item(ns) sem recebimento total. Registre a entrega antes de marcar como recebida.`,
      });
    }
    return res.json(resultado.ordem);
  } catch (erro) {
    console.error("[ab-ordens] patch", erro);
    return res.status(500).json({ error: "Não foi possível atualizar a ordem" });
  }
});

// ── PATCH /tenants/:tenantId/ab/ordens-compra/:id/itens/:itemId ─────────────
router.patch("/tenants/:tenantId/ab/ordens-compra/:id/itens/:itemId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const ordemId = String(req.params.id);
  const itemId = String(req.params.itemId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(ordemId).success || !z.string().uuid().safeParse(itemId).success) {
    return res.status(422).json({ error: "Item inválido" });
  }
  const input = z
    .object({
      quantidade: quantidadePositiva.optional(),
      custoEstimado: custoNaoNegativo.nullable().optional(),
      observacao: z.string().trim().max(1000).nullable().optional(),
    })
    .strict()
    .safeParse(req.body);
  if (!input.success) {
    return res.status(422).json({ error: "Alteração inválida", fields: camposInvalidos(input.error) });
  }
  if (Object.keys(input.data).length === 0) {
    return res.status(422).json({ error: "Nada para atualizar" });
  }

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const ordem = await carregarOrdem(tx, tenantId, ordemId);
      if (!ordem) return { tipo: "ordem_nao_encontrada" as const };
      if (!ordemEditavel(ordem.status as AbStatusOrdemCompra)) {
        return { tipo: "nao_editavel" as const, status: ordem.status };
      }
      if (input.data.quantidade !== undefined) {
        const atual = ordem.itens.find((item: any) => item.id === itemId);
        if (atual && Number(input.data.quantidade) < Number(atual.quantidadeRecebida ?? 0)) {
          return { tipo: "abaixo_recebido" as const, recebido: atual.quantidadeRecebida };
        }
      }
      const alteracoes: Record<string, unknown> = {};
      if (input.data.quantidade !== undefined) alteracoes.quantidade = input.data.quantidade;
      if (input.data.custoEstimado !== undefined) alteracoes.custoEstimado = input.data.custoEstimado;
      if (input.data.observacao !== undefined) alteracoes.observacao = input.data.observacao;

      const atualizados = await tx
        .update(abOrdemCompraItensTable)
        .set(alteracoes)
        .where(
          and(
            eq(abOrdemCompraItensTable.tenantId, tenantId),
            eq(abOrdemCompraItensTable.ordemId, ordemId),
            eq(abOrdemCompraItensTable.id, itemId),
          ),
        )
        .returning({ id: abOrdemCompraItensTable.id });
      if (atualizados.length === 0) return { tipo: "item_nao_encontrado" as const };
      return { tipo: "ok" as const, ordem: await carregarOrdem(tx, tenantId, ordemId) };
    });

    if (resultado.tipo === "ordem_nao_encontrada") return res.status(404).json({ error: "Ordem não encontrada" });
    if (resultado.tipo === "item_nao_encontrado") return res.status(404).json({ error: "Item não encontrado" });
    if (resultado.tipo === "nao_editavel") {
      return res.status(409).json({ error: "Só é possível editar itens de uma ordem sugerida", status: resultado.status });
    }
    if (resultado.tipo === "abaixo_recebido") {
      return res.status(409).json({ error: `A quantidade não pode ser menor que o já recebido (${resultado.recebido}).` });
    }
    return res.json(resultado.ordem);
  } catch (erro) {
    console.error("[ab-ordens] patch item", erro);
    return res.status(500).json({ error: "Não foi possível atualizar o item" });
  }
});

// ── DELETE /tenants/:tenantId/ab/ordens-compra/:id/itens/:itemId ────────────
router.delete("/tenants/:tenantId/ab/ordens-compra/:id/itens/:itemId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const ordemId = String(req.params.id);
  const itemId = String(req.params.itemId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(ordemId).success || !z.string().uuid().safeParse(itemId).success) {
    return res.status(422).json({ error: "Item inválido" });
  }

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const ordem = await carregarOrdem(tx, tenantId, ordemId);
      if (!ordem) return { tipo: "ordem_nao_encontrada" as const };
      if (!ordemEditavel(ordem.status as AbStatusOrdemCompra)) {
        return { tipo: "nao_editavel" as const, status: ordem.status };
      }
      const removidos = await tx
        .delete(abOrdemCompraItensTable)
        .where(
          and(
            eq(abOrdemCompraItensTable.tenantId, tenantId),
            eq(abOrdemCompraItensTable.ordemId, ordemId),
            eq(abOrdemCompraItensTable.id, itemId),
          ),
        )
        .returning({ id: abOrdemCompraItensTable.id });
      if (removidos.length === 0) return { tipo: "item_nao_encontrado" as const };
      return { tipo: "ok" as const, ordem: await carregarOrdem(tx, tenantId, ordemId) };
    });

    if (resultado.tipo === "ordem_nao_encontrada") return res.status(404).json({ error: "Ordem não encontrada" });
    if (resultado.tipo === "item_nao_encontrado") return res.status(404).json({ error: "Item não encontrado" });
    if (resultado.tipo === "nao_editavel") {
      return res.status(409).json({ error: "Só é possível editar itens de uma ordem sugerida", status: resultado.status });
    }
    return res.json(resultado.ordem);
  } catch (erro) {
    console.error("[ab-ordens] delete item", erro);
    return res.status(500).json({ error: "Não foi possível remover o item" });
  }
});

export default router;
