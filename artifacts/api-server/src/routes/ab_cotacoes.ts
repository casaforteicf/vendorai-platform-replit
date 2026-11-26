import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  abCotacaoFornecedoresTable,
  abCotacaoItensTable,
  abCotacoesTable,
  abOrdemCompraItensTable,
  abOrdensCompraTable,
  fornecedoresTable,
  insumosTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();
const dataISO = z.iso.date();

async function detalhe(tx: any, tenantId: string, id: string) {
  const [cotacao] = await tx.select().from(abCotacoesTable).where(and(
    eq(abCotacoesTable.tenantId, tenantId), eq(abCotacoesTable.id, id),
  ));
  if (!cotacao) return null;
  const itens = await tx.select().from(abCotacaoItensTable).where(and(
    eq(abCotacaoItensTable.tenantId, tenantId), eq(abCotacaoItensTable.cotacaoId, id),
  )).orderBy(asc(abCotacaoItensTable.ordem));
  const fornecedores = await tx.select({
    id: abCotacaoFornecedoresTable.id,
    fornecedorId: abCotacaoFornecedoresTable.fornecedorId,
    nome: fornecedoresTable.nome,
    status: abCotacaoFornecedoresTable.status,
    valorTotal: abCotacaoFornecedoresTable.valorTotal,
    prazoEntregaDias: abCotacaoFornecedoresTable.prazoEntregaDias,
    condicoesPagamento: abCotacaoFornecedoresTable.condicoesPagamento,
    observacao: abCotacaoFornecedoresTable.observacao,
  }).from(abCotacaoFornecedoresTable).leftJoin(
    fornecedoresTable,
    and(eq(fornecedoresTable.tenantId, abCotacaoFornecedoresTable.tenantId), eq(fornecedoresTable.id, abCotacaoFornecedoresTable.fornecedorId)),
  ).where(and(
    eq(abCotacaoFornecedoresTable.tenantId, tenantId), eq(abCotacaoFornecedoresTable.cotacaoId, id),
  )).orderBy(asc(fornecedoresTable.nome));
  return { ...cotacao, itens, fornecedores };
}

router.get("/tenants/:tenantId/ab/cotacoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const cotacoes = await withTenantTx(tenantId, (tx) => tx.select().from(abCotacoesTable)
      .where(eq(abCotacoesTable.tenantId, tenantId))
      .orderBy(desc(abCotacoesTable.dataInicio), desc(abCotacoesTable.createdAt)));
    return res.json({ cotacoes });
  } catch (erro) {
    console.error("[ab-cotacoes] list", erro);
    return res.status(500).json({ error: "Não foi possível listar as cotações" });
  }
});

router.get("/tenants/:tenantId/ab/cotacoes/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Cotação inválida" });
  try {
    const cotacao = await withTenantTx(tenantId, (tx) => detalhe(tx, tenantId, String(req.params.id)));
    return cotacao ? res.json(cotacao) : res.status(404).json({ error: "Cotação não encontrada" });
  } catch (erro) {
    console.error("[ab-cotacoes] get", erro);
    return res.status(500).json({ error: "Não foi possível carregar a cotação" });
  }
});

router.post("/tenants/:tenantId/ab/cotacoes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const entrada = z.object({
    dataInicio: dataISO,
    dataFim: dataISO,
    observacao: z.string().trim().max(1000).nullable().optional(),
    itens: z.array(z.object({
      insumoId: z.string().uuid(),
      quantidade: z.number().finite().positive(),
    })).min(1).max(200),
    fornecedorIds: z.array(z.string().uuid()).min(1).max(100),
  }).strict().safeParse(req.body);
  if (!entrada.success) return res.status(422).json({ error: "Cotação inválida", fields: camposInvalidos(entrada.error) });
  try {
    const cotacao = await withTenantTx(tenantId, async (tx) => {
      const insumoIds = [...new Set(entrada.data.itens.map((item) => item.insumoId))];
      const insumos = await tx.select().from(insumosTable).where(and(
        eq(insumosTable.tenantId, tenantId), inArray(insumosTable.id, insumoIds),
      ));
      if (insumos.length !== insumoIds.length) return { erro: "Insumo não encontrado" };
      const fornecedores = await tx.select().from(fornecedoresTable).where(and(
        eq(fornecedoresTable.tenantId, tenantId), eq(fornecedoresTable.ativo, true), inArray(fornecedoresTable.id, entrada.data.fornecedorIds),
      ));
      if (fornecedores.length !== entrada.data.fornecedorIds.length) return { erro: "Fornecedor não encontrado ou inativo" };
      const nomes = new Map(insumos.map((item: any) => [item.id, item]));
      const [criada] = await tx.insert(abCotacoesTable).values({
        tenantId,
        origem: "planejamento",
        dataInicio: entrada.data.dataInicio,
        dataFim: entrada.data.dataFim,
        status: "aberta",
        observacao: entrada.data.observacao ?? null,
        createdBy: req.user?.sub ?? null,
      }).returning();
      await tx.insert(abCotacaoItensTable).values(entrada.data.itens.map((item, ordem) => ({
        tenantId,
        cotacaoId: criada!.id,
        insumoId: item.insumoId,
        insumoNome: nomes.get(item.insumoId)!.nome,
        quantidade: String(item.quantidade),
        unidade: nomes.get(item.insumoId)!.unidade,
        ordem,
      })));
      await tx.insert(abCotacaoFornecedoresTable).values(entrada.data.fornecedorIds.map((fornecedorId) => ({
        tenantId,
        cotacaoId: criada!.id,
        fornecedorId,
        status: "convidado",
      })));
      return detalhe(tx, tenantId, criada!.id);
    });
    if (cotacao && "erro" in cotacao) return res.status(422).json({ error: cotacao.erro });
    return res.status(201).json(cotacao);
  } catch (erro) {
    console.error("[ab-cotacoes] create", erro);
    return res.status(500).json({ error: "Não foi possível criar a cotação" });
  }
});

router.post("/tenants/:tenantId/ab/cotacoes/:id/resposta", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Cotação inválida" });
  const entrada = z.object({
    fornecedorId: z.string().uuid(),
    valorTotal: z.number().finite().positive(),
    prazoEntregaDias: z.number().int().min(0).max(365),
    condicoesPagamento: z.string().trim().max(500).nullable().optional(),
    observacao: z.string().trim().max(2000).nullable().optional(),
  }).strict().safeParse(req.body);
  if (!entrada.success) return res.status(422).json({ error: "Resposta inválida", fields: camposInvalidos(entrada.error) });
  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const [cotacao] = await tx.select().from(abCotacoesTable).where(and(
        eq(abCotacoesTable.tenantId, tenantId), eq(abCotacoesTable.id, String(req.params.id)),
      ));
      if (!cotacao) return { tipo: "nao_encontrada" as const };
      if (cotacao.status === "adjudicada" || cotacao.status === "cancelada") return { tipo: "fechada" as const };
      const atualizados = await tx.update(abCotacaoFornecedoresTable).set({
        status: "respondido",
        valorTotal: String(entrada.data.valorTotal),
        prazoEntregaDias: entrada.data.prazoEntregaDias,
        condicoesPagamento: entrada.data.condicoesPagamento ?? null,
        observacao: entrada.data.observacao ?? null,
        respondidoEm: new Date(),
      }).where(and(
        eq(abCotacaoFornecedoresTable.tenantId, tenantId),
        eq(abCotacaoFornecedoresTable.cotacaoId, cotacao.id),
        eq(abCotacaoFornecedoresTable.fornecedorId, entrada.data.fornecedorId),
      )).returning({ id: abCotacaoFornecedoresTable.id });
      if (atualizados.length === 0) return { tipo: "fornecedor" as const };
      await tx.update(abCotacoesTable).set({ status: "respondida", updatedAt: new Date() }).where(eq(abCotacoesTable.id, cotacao.id));
      return { tipo: "ok" as const, cotacao: await detalhe(tx, tenantId, cotacao.id) };
    });
    if (resultado.tipo === "nao_encontrada") return res.status(404).json({ error: "Cotação não encontrada" });
    if (resultado.tipo === "fechada") return res.status(409).json({ error: "Cotação já fechada" });
    if (resultado.tipo === "fornecedor") return res.status(422).json({ error: "Fornecedor não convidado" });
    return res.json(resultado.cotacao);
  } catch (erro) {
    console.error("[ab-cotacoes] resposta", erro);
    return res.status(500).json({ error: "Não foi possível registrar a resposta" });
  }
});

router.post("/tenants/:tenantId/ab/cotacoes/:id/selecionar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Cotação inválida" });
  const entrada = z.object({ fornecedorId: z.string().uuid() }).strict().safeParse(req.body);
  if (!entrada.success) return res.status(422).json({ error: "Fornecedor inválido" });
  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const [cotacao] = await tx.select().from(abCotacoesTable).where(and(
        eq(abCotacoesTable.tenantId, tenantId), eq(abCotacoesTable.id, String(req.params.id)),
      ));
      if (!cotacao) return { tipo: "nao_encontrada" as const };
      if (cotacao.status === "adjudicada") return { tipo: "fechada" as const };
      const [escolhido] = await tx.select().from(abCotacaoFornecedoresTable).where(and(
        eq(abCotacaoFornecedoresTable.tenantId, tenantId),
        eq(abCotacaoFornecedoresTable.cotacaoId, cotacao.id),
        eq(abCotacaoFornecedoresTable.fornecedorId, entrada.data.fornecedorId),
        eq(abCotacaoFornecedoresTable.status, "respondido"),
      ));
      if (!escolhido) return { tipo: "sem_resposta" as const };
      const [fornecedor] = await tx.select().from(fornecedoresTable).where(and(
        eq(fornecedoresTable.tenantId, tenantId), eq(fornecedoresTable.id, entrada.data.fornecedorId),
      ));
      const itens = await tx.select().from(abCotacaoItensTable).where(and(
        eq(abCotacaoItensTable.tenantId, tenantId), eq(abCotacaoItensTable.cotacaoId, cotacao.id),
      )).orderBy(asc(abCotacaoItensTable.ordem));
      await tx.update(abCotacaoFornecedoresTable).set({ status: "descartado" }).where(and(
        eq(abCotacaoFornecedoresTable.tenantId, tenantId),
        eq(abCotacaoFornecedoresTable.cotacaoId, cotacao.id),
      ));
      await tx.update(abCotacaoFornecedoresTable).set({ status: "selecionado" }).where(and(
        eq(abCotacaoFornecedoresTable.tenantId, tenantId),
        eq(abCotacaoFornecedoresTable.id, escolhido.id),
      ));
      await tx.update(abCotacoesTable).set({ status: "adjudicada", updatedAt: new Date() }).where(eq(abCotacoesTable.id, cotacao.id));
      const [ordem] = await tx.insert(abOrdensCompraTable).values({
        tenantId,
        coberturaInicio: cotacao.dataInicio,
        coberturaFim: cotacao.dataFim,
        status: "sugerida",
        fornecedor: fornecedor?.nome ?? null,
        fornecedorId: entrada.data.fornecedorId,
        cotacaoId: cotacao.id,
        dataEntregaPrevista: null,
        observacao: `Gerada da cotação ${cotacao.id}`,
      }).returning();
      await tx.insert(abOrdemCompraItensTable).values(itens.map((item, ordemItem) => ({
        tenantId,
        ordemId: ordem!.id,
        insumoId: item.insumoId,
        insumoNome: item.insumoNome,
        quantidade: item.quantidade,
        unidade: item.unidade,
        custoEstimado: null,
      })));
      return { tipo: "ok" as const, ordemId: ordem!.id, fornecedor: fornecedor?.nome ?? null };
    });
    if (resultado.tipo === "nao_encontrada") return res.status(404).json({ error: "Cotação não encontrada" });
    if (resultado.tipo === "fechada") return res.status(409).json({ error: "Cotação já adjudicada" });
    if (resultado.tipo === "sem_resposta") return res.status(409).json({ error: "Fornecedor ainda não respondeu" });
    return res.status(201).json(resultado);
  } catch (erro) {
    console.error("[ab-cotacoes] selecionar", erro);
    return res.status(500).json({ error: "Não foi possível gerar a ordem" });
  }
});

export default router;
