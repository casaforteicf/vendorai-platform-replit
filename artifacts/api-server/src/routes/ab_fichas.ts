import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  abFichaInsumosTable,
  abFichasTecnicasTable,
  insertAbFichaInsumoSchema,
  insertAbFichaTecnicaSchema,
} from "@workspace/db";
import {
  abAllowed,
  camposInvalidos,
  isForeignKeyViolation,
  isUniqueViolation,
  withTenantTx,
} from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * A&B — fichas técnicas (AB-03 / FASE 2).
 *
 * A ficha e seus insumos são UMA unidade de negócio: nascem juntos, numa
 * transação. Se um insumo falhar (nome vazio, unidade inválida, insumo de outro
 * hotel), nada é gravado — nem a ficha.
 */

/** Insumo como vem do corpo: sem `ficha_id`, que só existe depois do INSERT da ficha. */
const insumoDoCorpo = insertAbFichaInsumoSchema.omit({ fichaId: true });

const corpoCriacao = insertAbFichaTecnicaSchema.extend({
  insumos: z.array(insumoDoCorpo).min(1, "Informe pelo menos um insumo").max(200),
});

const corpoEdicao = insertAbFichaTecnicaSchema.partial().extend({
  insumos: z.array(insumoDoCorpo).min(1).max(200).optional(),
});

/**
 * Duplicidade que o banco recusaria via índice parcial. Checar antes deixa o
 * erro como 422 explicando QUAL insumo repetiu, em vez de um 23505 genérico.
 */
function insumosDuplicados(insumos: Array<{ insumoId?: string | null; insumoNome: string }>): string[] {
  const chaves = new Map<string, number>();
  for (const insumo of insumos) {
    const chave = insumo.insumoId
      ? `catalogo:${insumo.insumoId}`
      : `nome:${insumo.insumoNome.trim().toLowerCase()}`;
    chaves.set(chave, (chaves.get(chave) ?? 0) + 1);
  }
  return [...chaves.entries()].filter(([, n]) => n > 1).map(([chave]) => chave.split(":")[1]!);
}

function valoresInsumo(
  tenantId: string,
  fichaId: string,
  insumos: z.infer<typeof insumoDoCorpo>[],
) {
  return insumos.map((insumo, ordem) => ({
    tenantId,
    fichaId,
    insumoId: insumo.insumoId ?? null,
    insumoNome: insumo.insumoNome,
    unidadeBase: insumo.unidadeBase,
    quantidadePorPorcao: insumo.quantidadePorPorcao,
    fatorCorrecao: insumo.fatorCorrecao ?? "1",
    ordem,
    observacao: insumo.observacao ?? null,
  }));
}

function recusarDuplicados(res: any, insumos: Array<{ insumoId?: string | null; insumoNome: string }>) {
  const duplicados = insumosDuplicados(insumos);
  if (duplicados.length === 0) return false;
  res.status(422).json({ error: `Insumo repetido na ficha: ${duplicados.join(", ")}` });
  return true;
}

// ── POST /tenants/:tenantId/ab/fichas-tecnicas ───────────────────────────────
router.post("/tenants/:tenantId/ab/fichas-tecnicas", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = corpoCriacao.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Ficha inválida", fields: camposInvalidos(parsed.error) });
  }
  if (recusarDuplicados(res, parsed.data.insumos)) return;

  try {
    const criada = await withTenantTx(t, async (tx) => {
      const [ficha] = await tx
        .insert(abFichasTecnicasTable)
        .values({
          tenantId: t,
          nome: parsed.data.nome,
          rendimentoPorcoes: parsed.data.rendimentoPorcoes,
          observacoes: parsed.data.observacoes ?? null,
          ativo: parsed.data.ativo ?? true,
        })
        .returning();

      const insumos = await tx
        .insert(abFichaInsumosTable)
        .values(valoresInsumo(t, ficha!.id, parsed.data.insumos))
        .returning();

      return { ...ficha, insumos: insumos.sort((a, b) => a.ordem - b.ordem) };
    });
    return res.status(201).json(criada);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return res.status(409).json({ error: "Já existe uma ficha com esse nome neste hotel" });
    }
    if (isForeignKeyViolation(e)) {
      return res.status(422).json({ error: "Insumo não pertence a este hotel" });
    }
    console.error("[ab-fichas] create", e);
    return res.status(500).json({ error: "Could not create ficha" });
  }
});

// ── GET /tenants/:tenantId/ab/fichas-tecnicas ────────────────────────────────
router.get("/tenants/:tenantId/ab/fichas-tecnicas", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const filtroAtivo = typeof req.query.ativo === "string" ? req.query.ativo : undefined;
  if (filtroAtivo !== undefined && filtroAtivo !== "true" && filtroAtivo !== "false") {
    return res.status(422).json({ error: "Filtro ativo deve ser true ou false" });
  }

  try {
    const fichas = await withTenantTx(t, async (tx) => {
      // Uma transação para as duas leituras: a lista e os insumos são
      // consistentes entre si (sem ficha aparecendo sem insumo).
      const lista = await tx
        .select()
        .from(abFichasTecnicasTable)
        .where(
          filtroAtivo === undefined
            ? eq(abFichasTecnicasTable.tenantId, t)
            : and(
                eq(abFichasTecnicasTable.tenantId, t),
                eq(abFichasTecnicasTable.ativo, filtroAtivo === "true"),
              ),
        )
        .orderBy(asc(abFichasTecnicasTable.nome));

      if (lista.length === 0) return [];

      const insumos = await tx
        .select()
        .from(abFichaInsumosTable)
        .where(
          inArray(
            abFichaInsumosTable.fichaId,
            lista.map((f) => f.id),
          ),
        )
        .orderBy(asc(abFichaInsumosTable.ordem));

      const porFicha = new Map<string, typeof insumos>();
      for (const insumo of insumos) {
        const atual = porFicha.get(insumo.fichaId) ?? [];
        atual.push(insumo);
        porFicha.set(insumo.fichaId, atual);
      }
      return lista.map((ficha) => ({ ...ficha, insumos: porFicha.get(ficha.id) ?? [] }));
    });

    return res.json({ fichas });
  } catch (e) {
    console.error("[ab-fichas] list", e);
    return res.status(500).json({ error: "Could not list fichas" });
  }
});

// ── GET /tenants/:tenantId/ab/fichas-tecnicas/:id ────────────────────────────
router.get("/tenants/:tenantId/ab/fichas-tecnicas/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) return res.status(422).json({ error: "Id inválido" });

  try {
    const ficha = await withTenantTx(t, async (tx) => {
      const [achada] = await tx
        .select()
        .from(abFichasTecnicasTable)
        .where(and(eq(abFichasTecnicasTable.tenantId, t), eq(abFichasTecnicasTable.id, id.data)));
      if (!achada) return null;

      const insumos = await tx
        .select()
        .from(abFichaInsumosTable)
        .where(eq(abFichaInsumosTable.fichaId, achada.id))
        .orderBy(asc(abFichaInsumosTable.ordem));

      return { ...achada, insumos };
    });

    if (!ficha) return res.status(404).json({ error: "Ficha não encontrada" });
    return res.json(ficha);
  } catch (e) {
    console.error("[ab-fichas] get", e);
    return res.status(500).json({ error: "Could not load ficha" });
  }
});

// ── PATCH /tenants/:tenantId/ab/fichas-tecnicas/:id ──────────────────────────
router.patch("/tenants/:tenantId/ab/fichas-tecnicas/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) return res.status(422).json({ error: "Id inválido" });

  const parsed = corpoEdicao.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Ficha inválida", fields: camposInvalidos(parsed.error) });
  }

  const { insumos, ...campos } = parsed.data;
  if (Object.keys(campos).length === 0 && !insumos) {
    return res.status(422).json({ error: "Nada para atualizar" });
  }
  if (insumos && recusarDuplicados(res, insumos)) return;

  try {
    const atualizada = await withTenantTx(t, async (tx) => {
      const [ficha] = await tx
        .update(abFichasTecnicasTable)
        .set({ ...campos, updatedAt: new Date() })
        .where(and(eq(abFichasTecnicasTable.tenantId, t), eq(abFichasTecnicasTable.id, id.data)))
        .returning();
      if (!ficha) return null;

      // Substituição total: a lista enviada é a nova ficha. Some com o que saiu
      // e insere o que ficou — dentro da mesma transação.
      if (insumos) {
        await tx.delete(abFichaInsumosTable).where(eq(abFichaInsumosTable.fichaId, ficha.id));
        await tx.insert(abFichaInsumosTable).values(valoresInsumo(t, ficha.id, insumos));
      }

      const atuais = await tx
        .select()
        .from(abFichaInsumosTable)
        .where(eq(abFichaInsumosTable.fichaId, ficha.id))
        .orderBy(asc(abFichaInsumosTable.ordem));

      return { ...ficha, insumos: atuais };
    });

    if (!atualizada) return res.status(404).json({ error: "Ficha não encontrada" });
    return res.json(atualizada);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return res.status(409).json({ error: "Já existe uma ficha com esse nome neste hotel" });
    }
    if (isForeignKeyViolation(e)) {
      return res.status(422).json({ error: "Insumo não pertence a este hotel" });
    }
    console.error("[ab-fichas] patch", e);
    return res.status(500).json({ error: "Could not update ficha" });
  }
});

// ── DELETE /tenants/:tenantId/ab/fichas-tecnicas/:id ─────────────────────────
router.delete("/tenants/:tenantId/ab/fichas-tecnicas/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) return res.status(422).json({ error: "Id inválido" });

  try {
    const removidas = await withTenantTx(t, async (tx) =>
      tx
        .delete(abFichasTecnicasTable)
        .where(and(eq(abFichasTecnicasTable.tenantId, t), eq(abFichasTecnicasTable.id, id.data)))
        .returning({ id: abFichasTecnicasTable.id }),
    );

    if (removidas.length === 0) return res.status(404).json({ error: "Ficha não encontrada" });
    // Os insumos saem por ON DELETE CASCADE.
    return res.status(204).send();
  } catch (e) {
    console.error("[ab-fichas] delete", e);
    return res.status(500).json({ error: "Could not delete ficha" });
  }
});

export default router;
