import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  abRecebimentosTable,
  categoriasProdutoTable,
  insertAbRecebimentoSchema,
  produtosCatalogoTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, isForeignKeyViolation, withTenantTx } from "../lib/ab/escopo.js";
import { avaliarSanidade, classificarFefo } from "../lib/ab/fefo.js";

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
          recebidoPor: req.user?.sub ?? null,
        })
        .returning();

      return { recebimento: criado, produto };
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

    return res.status(201).json({
      ...resultado.recebimento,
      produtoNome: resultado.produto?.nome ?? null,
      categoria: resultado.produto?.categoriaNome ?? null,
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
