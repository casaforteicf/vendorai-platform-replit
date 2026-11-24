import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  AB_SERVICOS_CARDAPIO,
  abCardapioItensTable,
  abCardapiosTable,
  abFichasTecnicasTable,
} from "@workspace/db";
import {
  abAllowed,
  camposInvalidos,
  isForeignKeyViolation,
  isUniqueViolation,
  withTenantTx,
} from "../lib/ab/escopo.js";

const router: IRouter = Router();

class CardapioValidationError extends Error {}

/**
 * A&B — cardápios por data/serviço (AB-10).
 *
 * O cardápio liga a ficha técnica (como produzir) à operação do dia (o que
 * servir e quantas porções por hóspede). O nome da ficha é gravado como
 * snapshot no item; renomear a ficha depois não reescreve cardápios passados.
 */

const dataISO = z.iso.date();

const itemDoCorpo = z
  .object({
    fichaId: z.string().uuid(),
    porcoesPorPax: z
      .union([z.string(), z.number()])
      .transform((valor) => String(valor))
      .pipe(z.string().regex(/^\d+(\.\d+)?$/).refine((valor) => Number(valor) > 0, "Deve ser maior que zero"))
      .optional(),
    ordem: z.number().int().min(0).optional(),
    observacao: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const corpoCriacao = z
  .object({
    nome: z.string().trim().min(1).max(120),
    data: dataISO,
    servico: z.enum(AB_SERVICOS_CARDAPIO),
    ativo: z.boolean().optional(),
    observacao: z.string().trim().max(2000).nullable().optional(),
    itens: z.array(itemDoCorpo).min(1, "Informe pelo menos um prato").max(200),
  })
  .strict();

const corpoEdicao = corpoCriacao.partial().strict();

/** Fichas usadas pelo cardápio, na ordem do corpo e sem repetição. */
function fichasUnicas(itens: Array<{ fichaId: string }>): string[] {
  return [...new Set(itens.map((item) => item.fichaId))];
}

async function carregarFichas(
  tx: any,
  tenantId: string,
  fichaIds: string[],
): Promise<Map<string, { id: string; nome: string }>> {
  if (fichaIds.length === 0) return new Map();
  const fichas = await tx
    .select({ id: abFichasTecnicasTable.id, nome: abFichasTecnicasTable.nome })
    .from(abFichasTecnicasTable)
    .where(
      and(
        eq(abFichasTecnicasTable.tenantId, tenantId),
        inArray(abFichasTecnicasTable.id, fichaIds),
      ),
    );
  return new Map(fichas.map((ficha: { id: string; nome: string }) => [ficha.id, ficha]));
}

function itensParaGravar(
  tenantId: string,
  cardapioId: string,
  itens: Array<{ fichaId: string; porcoesPorPax?: string; ordem?: number; observacao?: string | null }>,
  fichas: Map<string, { id: string; nome: string }>,
) {
  return itens.map((item, index) => ({
    tenantId,
    cardapioId,
    fichaId: item.fichaId,
    fichaNome: fichas.get(item.fichaId)!.nome,
    porcoesPorPax: item.porcoesPorPax ?? "1",
    ordem: item.ordem ?? index,
    observacao: item.observacao ?? null,
  }));
}

function respostaDetalhe(cardapio: any, itens: any[]) {
  return { ...cardapio, itens };
}

// ── GET /tenants/:tenantId/ab/cardapios?data=&servico= ───────────────────────
router.get("/tenants/:tenantId/ab/cardapios", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filtros = z
    .object({
      data: dataISO.optional(),
      servico: z.enum(AB_SERVICOS_CARDAPIO).optional(),
      incluirInativos: z.enum(["true", "false"]).optional(),
    })
    .safeParse(req.query);
  if (!filtros.success) {
    return res.status(422).json({ error: "Filtros inválidos", fields: camposInvalidos(filtros.error) });
  }

  try {
    const cardapios = await withTenantTx(tenantId, async (tx) => {
      const condicoes = [eq(abCardapiosTable.tenantId, tenantId)];
      if (filtros.data.data) condicoes.push(eq(abCardapiosTable.data, filtros.data.data));
      if (filtros.data.servico) condicoes.push(eq(abCardapiosTable.servico, filtros.data.servico));
      if (filtros.data.incluirInativos !== "true") condicoes.push(eq(abCardapiosTable.ativo, true));

      const menus = await tx
        .select()
        .from(abCardapiosTable)
        .where(and(...condicoes))
        .orderBy(asc(abCardapiosTable.data), asc(abCardapiosTable.servico), asc(abCardapiosTable.nome));

      const ids = menus.map((menu) => menu.id);
      const itens = ids.length
        ? await tx
            .select()
            .from(abCardapioItensTable)
            .where(
              and(
                eq(abCardapioItensTable.tenantId, tenantId),
                inArray(abCardapioItensTable.cardapioId, ids),
              ),
            )
            .orderBy(asc(abCardapioItensTable.ordem), asc(abCardapioItensTable.fichaNome))
        : [];

      return menus.map((menu) => respostaDetalhe(menu, itens.filter((item) => item.cardapioId === menu.id)));
    });
    return res.json({ cardapios });
  } catch (erro) {
    console.error("[ab-cardapios] list", erro);
    return res.status(500).json({ error: "Não foi possível listar os cardápios" });
  }
});

// ── GET /tenants/:tenantId/ab/cardapios/:id ─────────────────────────────────
router.get("/tenants/:tenantId/ab/cardapios/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const cardapioId = String(req.params.id);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(cardapioId).success) {
    return res.status(422).json({ error: "Cardápio inválido" });
  }

  try {
    const detalhe = await withTenantTx(tenantId, async (tx) => {
      const [cardapio] = await tx
        .select()
        .from(abCardapiosTable)
        .where(and(eq(abCardapiosTable.tenantId, tenantId), eq(abCardapiosTable.id, cardapioId)));
      if (!cardapio) return null;
      const itens = await tx
        .select()
        .from(abCardapioItensTable)
        .where(
          and(
            eq(abCardapioItensTable.tenantId, tenantId),
            eq(abCardapioItensTable.cardapioId, cardapioId),
          ),
        )
        .orderBy(asc(abCardapioItensTable.ordem), asc(abCardapioItensTable.fichaNome));
      return respostaDetalhe(cardapio, itens);
    });
    return detalhe ? res.json(detalhe) : res.status(404).json({ error: "Cardápio não encontrado" });
  } catch (erro) {
    console.error("[ab-cardapios] get", erro);
    return res.status(500).json({ error: "Não foi possível carregar o cardápio" });
  }
});

// ── POST /tenants/:tenantId/ab/cardapios ────────────────────────────────────
router.post("/tenants/:tenantId/ab/cardapios", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = corpoCriacao.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "Cardápio inválido", fields: camposInvalidos(parsed.error) });
  }
  const fichaIds = fichasUnicas(parsed.data.itens);
  if (fichaIds.length !== parsed.data.itens.length) {
    return res.status(422).json({ error: "A mesma ficha não pode aparecer duas vezes no cardápio" });
  }

  try {
    const criado = await withTenantTx(tenantId, async (tx) => {
      const fichas = await carregarFichas(tx, tenantId, fichaIds);
      const faltando = fichaIds.filter((id) => !fichas.has(id));
      if (faltando.length > 0) {
        return { erro: `Ficha não encontrada neste hotel: ${faltando.join(", ")}` };
      }

      const [cardapio] = await tx
        .insert(abCardapiosTable)
        .values({
          tenantId,
          nome: parsed.data.nome,
          data: parsed.data.data,
          servico: parsed.data.servico,
          ativo: parsed.data.ativo ?? true,
          observacao: parsed.data.observacao ?? null,
          createdBy: req.user!.sub,
        })
        .returning();

      const itens = await tx
        .insert(abCardapioItensTable)
        .values(itensParaGravar(tenantId, cardapio!.id, parsed.data.itens, fichas))
        .returning();

      return respostaDetalhe(cardapio, itens.sort((a, b) => a.ordem - b.ordem));
    });

    if ("erro" in criado) return res.status(422).json({ error: criado.erro });
    return res.status(201).json(criado);
  } catch (erro) {
    if (isUniqueViolation(erro)) {
      return res.status(409).json({ error: "Já existe um cardápio com esse nome para esta data e serviço" });
    }
    if (isForeignKeyViolation(erro)) {
      return res.status(422).json({ error: "Ficha ou usuário não pertence a este hotel" });
    }
    console.error("[ab-cardapios] create", erro);
    return res.status(500).json({ error: "Não foi possível criar o cardápio" });
  }
});

// ── PATCH /tenants/:tenantId/ab/cardapios/:id ───────────────────────────────
router.patch("/tenants/:tenantId/ab/cardapios/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const cardapioId = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(cardapioId).success) {
    return res.status(422).json({ error: "Cardápio inválido" });
  }
  const parsed = corpoEdicao.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "Cardápio inválido", fields: camposInvalidos(parsed.error) });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(422).json({ error: "Nada para atualizar" });
  }
  if (parsed.data.itens) {
    const fichaIds = fichasUnicas(parsed.data.itens);
    if (fichaIds.length !== parsed.data.itens.length) {
      return res.status(422).json({ error: "A mesma ficha não pode aparecer duas vezes no cardápio" });
    }
  }

  try {
    const atualizado = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx
        .select()
        .from(abCardapiosTable)
        .where(and(eq(abCardapiosTable.tenantId, tenantId), eq(abCardapiosTable.id, cardapioId)));
      if (!existente) return null;

      // Valida as fichas ANTES de qualquer escrita: retornar erro no meio da
      // transação sem lançar exceção faria o COMMIT gravar o cabeçalho órfão.
      let fichasParaItens: Map<string, { id: string; nome: string }> | null = null;
      if (parsed.data.itens) {
        const fichaIds = fichasUnicas(parsed.data.itens);
        fichasParaItens = await carregarFichas(tx, tenantId, fichaIds);
        const faltando = fichaIds.filter((id) => !fichasParaItens!.has(id));
        if (faltando.length > 0) {
          throw new CardapioValidationError(`Ficha não encontrada neste hotel: ${faltando.join(", ")}`);
        }
      }

      const alteracoes: Record<string, unknown> = {};
      if (parsed.data.nome !== undefined) alteracoes.nome = parsed.data.nome;
      if (parsed.data.data !== undefined) alteracoes.data = parsed.data.data;
      if (parsed.data.servico !== undefined) alteracoes.servico = parsed.data.servico;
      if (parsed.data.ativo !== undefined) alteracoes.ativo = parsed.data.ativo;
      if (parsed.data.observacao !== undefined) alteracoes.observacao = parsed.data.observacao;

      let cardapio = existente;
      if (Object.keys(alteracoes).length > 0) {
        [cardapio] = await tx
          .update(abCardapiosTable)
          .set(alteracoes)
          .where(and(eq(abCardapiosTable.tenantId, tenantId), eq(abCardapiosTable.id, cardapioId)))
          .returning();
      }

      if (parsed.data.itens && fichasParaItens) {
        await tx
          .delete(abCardapioItensTable)
          .where(
            and(
              eq(abCardapioItensTable.tenantId, tenantId),
              eq(abCardapioItensTable.cardapioId, cardapioId),
            ),
          );
        await tx
          .insert(abCardapioItensTable)
          .values(itensParaGravar(tenantId, cardapioId, parsed.data.itens, fichasParaItens));
      }

      const itens = await tx
        .select()
        .from(abCardapioItensTable)
        .where(
          and(
            eq(abCardapioItensTable.tenantId, tenantId),
            eq(abCardapioItensTable.cardapioId, cardapioId),
          ),
        )
        .orderBy(asc(abCardapioItensTable.ordem), asc(abCardapioItensTable.fichaNome));
      return respostaDetalhe(cardapio, itens);
    });

    if (!atualizado) return res.status(404).json({ error: "Cardápio não encontrado" });
    return res.json(atualizado);
  } catch (erro) {
    if (erro instanceof CardapioValidationError) {
      return res.status(422).json({ error: erro.message });
    }
    if (isUniqueViolation(erro)) {
      return res.status(409).json({ error: "Já existe um cardápio com esse nome para esta data e serviço" });
    }
    console.error("[ab-cardapios] update", erro);
    return res.status(500).json({ error: "Não foi possível atualizar o cardápio" });
  }
});

// ── DELETE /tenants/:tenantId/ab/cardapios/:id ──────────────────────────────
router.delete("/tenants/:tenantId/ab/cardapios/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const cardapioId = String(req.params.id);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(cardapioId).success) {
    return res.status(422).json({ error: "Cardápio inválido" });
  }
  try {
    const removido = await withTenantTx(tenantId, async (tx) => (
      await tx
        .delete(abCardapiosTable)
        .where(and(eq(abCardapiosTable.tenantId, tenantId), eq(abCardapiosTable.id, cardapioId)))
        .returning({ id: abCardapiosTable.id })
    ).length > 0);
    return removido ? res.status(204).send() : res.status(404).json({ error: "Cardápio não encontrado" });
  } catch (erro) {
    console.error("[ab-cardapios] delete", erro);
    return res.status(500).json({ error: "Não foi possível excluir o cardápio" });
  }
});

export default router;
