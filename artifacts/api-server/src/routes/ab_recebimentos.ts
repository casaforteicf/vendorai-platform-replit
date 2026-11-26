import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  abInsumoProdutoTable,
  abOrdemCompraItensTable,
  abOrdensCompraTable,
  abRecebimentosTable,
  categoriasProdutoTable,
  insertAbRecebimentoSchema,
  produtosCatalogoTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, isForeignKeyViolation, withTenantTx } from "../lib/ab/escopo.js";
import { avaliarSanidade, classificarFefo } from "../lib/ab/fefo.js";
import { aplicarEntradaNoEstoque } from "../lib/ab/entrada-estoque.js";

const router: IRouter = Router();

/**
 * A&B — recebimento de mercadorias com lote e FEFO (AB-06).
 *
 * Duas regras que NÃO podem vir do cliente:
 *  - **etiqueta FEFO**: recalculada aqui a partir da validade;
 *  - **status** (aprovado/bloqueado): derivado da temperatura vs. categoria.
 *
 * Decisão: recebimento com temperatura inadequada é **gravado** com
 * `status='bloqueado'` e o motivo, em vez de recusado com 422. Segurança
 * alimentar exige rastro do que chegou errado — um 422 apagaria a evidência. A
 * mercadoria bloqueada não entra em estoque (o job de saldo só lê
 * `hotel_stock_location_balances`).
 */

function hojeISO(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

// ── GET /tenants/:tenantId/ab/recebimentos/pendentes ─────────────────────────
router.get("/tenants/:tenantId/ab/recebimentos/pendentes", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });
  try {
    const pedidos = await withTenantTx(t, async (tx) => {
      const ordens = await tx
        .select()
        .from(abOrdensCompraTable)
        .where(and(
          eq(abOrdensCompraTable.tenantId, t),
          inArray(abOrdensCompraTable.status, ["aprovada", "pendente_entrega", "parcialmente_recebida"]),
        ))
        .orderBy(desc(abOrdensCompraTable.coberturaInicio));
      if (ordens.length === 0) return [];
      const ids = ordens.map((ordem) => ordem.id);
      const itens = await tx
        .select({
          id: abOrdemCompraItensTable.id,
          ordemId: abOrdemCompraItensTable.ordemId,
          insumoId: abOrdemCompraItensTable.insumoId,
          insumoNome: abOrdemCompraItensTable.insumoNome,
          quantidade: abOrdemCompraItensTable.quantidade,
          quantidadeRecebida: abOrdemCompraItensTable.quantidadeRecebida,
          unidade: abOrdemCompraItensTable.unidade,
          produtoCatalogoId: abInsumoProdutoTable.produtoCatalogoId,
          produtoNome: produtosCatalogoTable.nome,
        })
        .from(abOrdemCompraItensTable)
        .leftJoin(
          abInsumoProdutoTable,
          and(
            eq(abInsumoProdutoTable.tenantId, abOrdemCompraItensTable.tenantId),
            eq(abInsumoProdutoTable.insumoId, abOrdemCompraItensTable.insumoId),
          ),
        )
        .leftJoin(
          produtosCatalogoTable,
          and(
            eq(produtosCatalogoTable.tenantId, abInsumoProdutoTable.tenantId),
            eq(produtosCatalogoTable.id, abInsumoProdutoTable.produtoCatalogoId),
          ),
        )
        .where(and(
          eq(abOrdemCompraItensTable.tenantId, t),
          inArray(abOrdemCompraItensTable.ordemId, ids),
          sql`${abOrdemCompraItensTable.quantidadeRecebida} < ${abOrdemCompraItensTable.quantidade}`,
        ))
        .orderBy(abOrdemCompraItensTable.insumoNome);
      return ordens
        .map((ordem) => ({
          ...ordem,
          itens: itens.filter((item) => item.ordemId === ordem.id),
        }))
        .filter((ordem) => ordem.itens.length > 0);
    });
    return res.json({ pedidos });
  } catch (e) {
    console.error("[ab-recebimentos] pendentes", e);
    return res.status(500).json({ error: "Não foi possível listar as entregas pendentes" });
  }
});

// ── POST /tenants/:tenantId/ab/recebimentos ──────────────────────────────────
router.post("/tenants/:tenantId/ab/recebimentos", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertAbRecebimentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Recebimento inválido", fields: camposInvalidos(parsed.error) });
  }

  const dados = parsed.data;
  const temperatura =
    dados.temperaturaC === null || dados.temperaturaC === undefined
      ? null
      : Number(dados.temperaturaC);

  if (temperatura !== null && !Number.isFinite(temperatura)) {
    return res.status(422).json({ error: "Temperatura inválida" });
  }

  try {
    const resultado = await withTenantTx(t, async (tx) => {
      // A categoria decide se a temperatura é obrigatória.
      const [produto] = await tx
        .select({
          id: produtosCatalogoTable.id,
          nome: produtosCatalogoTable.nome,
          categoriaNome: categoriasProdutoTable.nome,
        })
        .from(produtosCatalogoTable)
        .leftJoin(
          categoriasProdutoTable,
          and(
            eq(categoriasProdutoTable.tenantId, produtosCatalogoTable.tenantId),
            eq(categoriasProdutoTable.id, produtosCatalogoTable.categoriaId),
          ),
        )
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, t),
            eq(produtosCatalogoTable.id, dados.produtoCatalogoId),
          ),
        );

      if (!produto) return { naoEncontrado: true as const };

      const sanidade = avaliarSanidade({
        categoriaNome: produto.categoriaNome,
        temperaturaC: temperatura,
      });

      // Sem medir não se declara apto: categoria que exige temperatura e veio
      // nula é erro de payload, não "aprovado por omissão".
      if (sanidade.temperaturaObrigatoria && temperatura === null) {
        return { temperaturaObrigatoria: true as const, categoria: produto.categoriaNome };
      }

      const etiquetaFefo = classificarFefo(dados.dataValidade, hojeISO());

      let ordemItem: { id: string; ordemId: string; quantidade: string; quantidadeRecebida: string; unidade: string } | null = null;
      if (dados.ordemItemId || dados.ordemId) {
        if (!dados.ordemId || !dados.ordemItemId) {
          return { ordemIncompleta: true as const };
        }
        const [item] = await tx
          .select({
            id: abOrdemCompraItensTable.id,
            ordemId: abOrdemCompraItensTable.ordemId,
            quantidade: abOrdemCompraItensTable.quantidade,
            quantidadeRecebida: abOrdemCompraItensTable.quantidadeRecebida,
            unidade: abOrdemCompraItensTable.unidade,
          })
          .from(abOrdemCompraItensTable)
          .where(and(
            eq(abOrdemCompraItensTable.tenantId, t),
            eq(abOrdemCompraItensTable.id, dados.ordemItemId),
            eq(abOrdemCompraItensTable.ordemId, dados.ordemId),
          ));
        if (!item) return { ordemNaoEncontrada: true as const };
        const [ordem] = await tx.select().from(abOrdensCompraTable).where(and(
          eq(abOrdensCompraTable.tenantId, t),
          eq(abOrdensCompraTable.id, dados.ordemId),
        ));
        if (!ordem) return { ordemNaoEncontrada: true as const };
        if (!["aprovada", "pendente_entrega", "parcialmente_recebida"].includes(ordem.status)) {
          return { ordemStatusInvalido: true as const, status: ordem.status };
        }
        const restante = Number(item.quantidade) - Number(item.quantidadeRecebida);
        if (Number(dados.quantidade) > restante + 0.0001) {
          return { quantidadeAcimaDoPendente: true as const, restante, unidade: item.unidade };
        }
        ordemItem = item;
      }

      const [criado] = await tx
        .insert(abRecebimentosTable)
        .values({
          tenantId: t,
          produtoCatalogoId: dados.produtoCatalogoId,
          notaFiscal: dados.notaFiscal,
          fornecedor: dados.fornecedor ?? null,
          lote: dados.lote,
          dataValidade: dados.dataValidade,
          temperaturaC: temperatura === null ? null : String(temperatura),
          quantidade: dados.quantidade,
          unidade: dados.unidade,
          etiquetaFefo,
          status: sanidade.status,
          motivoBloqueio: sanidade.motivoBloqueio,
          ordemId: dados.ordemId ?? null,
          ordemItemId: dados.ordemItemId ?? null,
          locationId: dados.locationId ?? null,
          recebidoPor: req.user?.sub ?? null,
        })
        .returning();

      let ordemAtualizada: { id: string; status: string } | null = null;
      if (sanidade.status === "aprovado" && ordemItem) {
        await tx
          .update(abOrdemCompraItensTable)
          .set({ quantidadeRecebida: sql`${abOrdemCompraItensTable.quantidadeRecebida} + ${String(dados.quantidade)}` })
          .where(and(
            eq(abOrdemCompraItensTable.tenantId, t),
            eq(abOrdemCompraItensTable.id, ordemItem.id),
          ));
        const itens = await tx
          .select({ quantidade: abOrdemCompraItensTable.quantidade, recebida: abOrdemCompraItensTable.quantidadeRecebida })
          .from(abOrdemCompraItensTable)
          .where(and(
            eq(abOrdemCompraItensTable.tenantId, t),
            eq(abOrdemCompraItensTable.ordemId, ordemItem.ordemId),
          ));
        const todosRecebidos = itens.every((item: any) => Number(item.recebida) >= Number(item.quantidade) - 0.0001);
        const algumRecebido = itens.some((item: any) => Number(item.recebida) > 0);
        const novoStatus = todosRecebidos ? "recebida" : algumRecebido ? "parcialmente_recebida" : "pendente_entrega";
        await tx.update(abOrdensCompraTable).set({ status: novoStatus, updatedAt: new Date() }).where(and(
          eq(abOrdensCompraTable.tenantId, t),
          eq(abOrdensCompraTable.id, ordemItem.ordemId),
        ));
        ordemAtualizada = { id: ordemItem.ordemId, status: novoStatus };
      }

      return { recebimento: criado, produto, ordemAtualizada };
    });

    if ("naoEncontrado" in resultado) {
      return res.status(404).json({ error: "Produto não encontrado neste hotel" });
    }
    if ("temperaturaObrigatoria" in resultado) {
      return res.status(422).json({
        error: "Temperatura obrigatória para esta categoria",
        fields: ["temperaturaC"],
        categoria: resultado.categoria,
      });
    }
    if ("ordemIncompleta" in resultado) {
      return res.status(422).json({ error: "Informe a ordem e o item da ordem para vincular a entrega" });
    }
    if ("ordemNaoEncontrada" in resultado) {
      return res.status(404).json({ error: "Ordem ou item da ordem não encontrado" });
    }
    if ("ordemStatusInvalido" in resultado) {
      return res.status(409).json({ error: `Ordem com status ${resultado.status} não aceita recebimento` });
    }
    if ("quantidadeAcimaDoPendente" in resultado) {
      return res.status(409).json({
        error: `Quantidade acima do pendente da ordem (${resultado.restante} ${resultado.unidade})`,
        restante: resultado.restante,
      });
    }

    // AB-07: recebimento aprovado entra no saldo físico. Roda em transação
    // própria de propósito — se a soma falhar, o recebimento continua gravado
    // com o motivo e entra na fila de reprocessamento (nada de saldo fantasma).
    const estoque =
      resultado.recebimento.status === "aprovado"
        ? await aplicarEntradaNoEstoque({
            tenantId: t,
            recebimentoId: resultado.recebimento.id,
            produtoCatalogoId: resultado.recebimento.produtoCatalogoId,
            quantidadeBase: Number(resultado.recebimento.quantidade),
            unidadeBase: resultado.recebimento.unidade as "g" | "ml" | "un",
            locationId: resultado.recebimento.locationId,
          })
        : { aplicado: false as const, motivo: "Recebimento bloqueado não entra em estoque" };

    return res.status(201).json({
      ...resultado.recebimento,
      produtoNome: resultado.produto?.nome ?? null,
      categoria: resultado.produto?.categoriaNome ?? null,
      estoque,
      ordem: resultado.ordemAtualizada,
    });
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      return res.status(422).json({ error: "Produto não pertence a este hotel" });
    }
    console.error("[ab-recebimentos] create", e);
    return res.status(500).json({ error: "Could not create recebimento" });
  }
});

// ── GET /tenants/:tenantId/ab/recebimentos ───────────────────────────────────
router.get("/tenants/:tenantId/ab/recebimentos", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const limite = Number(req.query.limite ?? 50);
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) {
    return res.status(422).json({ error: "limite deve ser inteiro entre 1 e 200" });
  }

  try {
    const linhas = await withTenantTx(t, async (tx) =>
      tx
        .select()
        .from(abRecebimentosTable)
        .where(eq(abRecebimentosTable.tenantId, t))
        .orderBy(desc(abRecebimentosTable.createdAt))
        .limit(limite),
    );

    return res.json({
      recebimentos: linhas,
      resumo: {
        total: linhas.length,
        bloqueados: linhas.filter((l) => l.status === "bloqueado").length,
        vencendoEm7Dias: linhas.filter((l) => l.etiquetaFefo === "vermelho").length,
      },
    });
  } catch (e) {
    console.error("[ab-recebimentos] list", e);
    return res.status(500).json({ error: "Could not list recebimentos" });
  }
});

export default router;
