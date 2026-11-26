import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  AB_CATEGORIAS_ITEM_CARDAPIO,
  AB_SERVICOS_CARDAPIO,
  abCardapioGradeTable,
  abCardapioItensTable,
  abCardapioModeloItensTable,
  abCardapioModelosTable,
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
const dataISO = z.iso.date();

const itemModelo = z.object({
  fichaId: z.string().uuid(),
  categoria: z.enum(AB_CATEGORIAS_ITEM_CARDAPIO).default("outro"),
  percentualRateio: z.union([z.string(), z.number()]).nullable().optional(),
  ordem: z.number().int().min(0).optional(),
  observacao: z.string().trim().max(1000).nullable().optional(),
}).strict();

const corpoModelo = z.object({
  nome: z.string().trim().min(1).max(120),
  servico: z.enum(AB_SERVICOS_CARDAPIO),
  ativo: z.boolean().optional(),
  observacao: z.string().trim().max(2000).nullable().optional(),
  itens: z.array(itemModelo).min(1, "Informe pelo menos um prato").max(200),
}).strict();

const corpoModeloEdicao = corpoModelo.partial().strict();

function numeroPercentual(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizarPercentuais(itens: z.infer<typeof itemModelo>[]) {
  for (const categoria of ["proteina", "acompanhamento"] as const) {
    const doGrupo = itens.filter((item) => item.categoria === categoria);
    if (doGrupo.length === 0) continue;
    const informados = doGrupo.map((item) => numeroPercentual(item.percentualRateio));
    if (informados.every((valor) => valor === null)) {
      const igual = Number((100 / doGrupo.length).toFixed(2));
      for (const item of doGrupo) item.percentualRateio = igual;
      continue;
    }
    if (informados.some((valor) => valor === null)) {
      return `Informe o percentual de todos os pratos de ${categoria}`;
    }
    const soma = informados.reduce((total, valor) => total + (valor ?? 0), 0);
    if (Math.abs(soma - 100) > 0.01) {
      return `A soma dos percentuais de ${categoria} precisa ser 100% (está ${soma.toFixed(2)}%)`;
    }
  }
  return null;
}

async function fichasDoTenant(tx: any, tenantId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { id: string; nome: string }>();
  const fichas = await tx
    .select({ id: abFichasTecnicasTable.id, nome: abFichasTecnicasTable.nome })
    .from(abFichasTecnicasTable)
    .where(and(eq(abFichasTecnicasTable.tenantId, tenantId), inArray(abFichasTecnicasTable.id, ids)));
  return new Map(fichas.map((ficha: { id: string; nome: string }) => [ficha.id, ficha]));
}

function valoresItens(
  tenantId: string,
  modeloId: string,
  itens: z.infer<typeof itemModelo>[],
  fichas: Map<string, { id: string; nome: string }>,
) {
  return itens.map((item, index) => ({
    tenantId,
    modeloId,
    fichaId: item.fichaId,
    fichaNome: fichas.get(item.fichaId)!.nome,
    categoria: item.categoria,
    percentualRateio: item.categoria === "outro" ? null : String(numeroPercentual(item.percentualRateio) ?? 0),
    ordem: item.ordem ?? index,
    observacao: item.observacao ?? null,
  }));
}

async function detalheModelo(tx: any, tenantId: string, modeloId: string) {
  const [modelo] = await tx
    .select()
    .from(abCardapioModelosTable)
    .where(and(eq(abCardapioModelosTable.tenantId, tenantId), eq(abCardapioModelosTable.id, modeloId)));
  if (!modelo) return null;
  const itens = await tx
    .select()
    .from(abCardapioModeloItensTable)
    .where(and(eq(abCardapioModeloItensTable.tenantId, tenantId), eq(abCardapioModeloItensTable.modeloId, modeloId)))
    .orderBy(asc(abCardapioModeloItensTable.ordem), asc(abCardapioModeloItensTable.fichaNome));
  return { ...modelo, itens };
}

// GET /tenants/:tenantId/ab/cardapio-modelos
router.get("/tenants/:tenantId/ab/cardapio-modelos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const modelos = await withTenantTx(tenantId, async (tx) => {
      const lista = await tx
        .select()
        .from(abCardapioModelosTable)
        .where(eq(abCardapioModelosTable.tenantId, tenantId))
        .orderBy(asc(abCardapioModelosTable.servico), asc(abCardapioModelosTable.nome));
      const ids = lista.map((modelo) => modelo.id);
      const itens = ids.length
        ? await tx
            .select()
            .from(abCardapioModeloItensTable)
            .where(and(eq(abCardapioModeloItensTable.tenantId, tenantId), inArray(abCardapioModeloItensTable.modeloId, ids)))
            .orderBy(asc(abCardapioModeloItensTable.ordem), asc(abCardapioModeloItensTable.fichaNome))
        : [];
      return lista.map((modelo) => ({ ...modelo, itens: itens.filter((item) => item.modeloId === modelo.id) }));
    });
    return res.json({ modelos });
  } catch (erro) {
    console.error("[ab-cardapio-modelos] list", erro);
    return res.status(500).json({ error: "Não foi possível listar os modelos" });
  }
});

// GET /tenants/:tenantId/ab/cardapio-modelos/:id
router.get("/tenants/:tenantId/ab/cardapio-modelos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Modelo inválido" });
  try {
    const modelo = await withTenantTx(tenantId, (tx) => detalheModelo(tx, tenantId, String(req.params.id)));
    return modelo ? res.json(modelo) : res.status(404).json({ error: "Modelo não encontrado" });
  } catch (erro) {
    console.error("[ab-cardapio-modelos] get", erro);
    return res.status(500).json({ error: "Não foi possível carregar o modelo" });
  }
});

// POST /tenants/:tenantId/ab/cardapio-modelos
router.post("/tenants/:tenantId/ab/cardapio-modelos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const parsed = corpoModelo.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Modelo inválido", fields: camposInvalidos(parsed.error) });
  if (new Set(parsed.data.itens.map((item) => item.fichaId)).size !== parsed.data.itens.length) {
    return res.status(422).json({ error: "A mesma ficha não pode aparecer duas vezes no modelo" });
  }
  const erroPercentual = normalizarPercentuais(parsed.data.itens);
  if (erroPercentual) return res.status(422).json({ error: erroPercentual });

  try {
    const criado = await withTenantTx(tenantId, async (tx) => {
      const ids = [...new Set(parsed.data.itens.map((item) => item.fichaId))];
      const fichas = await fichasDoTenant(tx, tenantId, ids);
      if (ids.some((id) => !fichas.has(id))) return { erro: "Ficha não encontrada neste hotel" };
      const [modelo] = await tx.insert(abCardapioModelosTable).values({
        tenantId,
        nome: parsed.data.nome,
        servico: parsed.data.servico,
        ativo: parsed.data.ativo ?? true,
        observacao: parsed.data.observacao ?? null,
        createdBy: req.user!.sub,
      }).returning();
      await tx.insert(abCardapioModeloItensTable).values(valoresItens(tenantId, modelo!.id, parsed.data.itens, fichas));
      return detalheModelo(tx, tenantId, modelo!.id);
    });
    if (criado && "erro" in criado) return res.status(422).json({ error: criado.erro });
    return res.status(201).json(criado);
  } catch (erro) {
    if (isUniqueViolation(erro)) return res.status(409).json({ error: "Já existe um modelo com esse nome para este serviço" });
    if (isForeignKeyViolation(erro)) return res.status(422).json({ error: "Ficha não pertence a este hotel" });
    console.error("[ab-cardapio-modelos] create", erro);
    return res.status(500).json({ error: "Não foi possível criar o modelo" });
  }
});

// PATCH /tenants/:tenantId/ab/cardapio-modelos/:id
router.patch("/tenants/:tenantId/ab/cardapio-modelos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Modelo inválido" });
  const parsed = corpoModeloEdicao.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Modelo inválido", fields: camposInvalidos(parsed.error) });
  if (Object.keys(parsed.data).length === 0) return res.status(422).json({ error: "Nada para atualizar" });
  if (parsed.data.itens) {
    if (new Set(parsed.data.itens.map((item) => item.fichaId)).size !== parsed.data.itens.length) {
      return res.status(422).json({ error: "A mesma ficha não pode aparecer duas vezes no modelo" });
    }
    const erroPercentual = normalizarPercentuais(parsed.data.itens);
    if (erroPercentual) return res.status(422).json({ error: erroPercentual });
  }

  try {
    const atualizado = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx.select().from(abCardapioModelosTable).where(and(
        eq(abCardapioModelosTable.tenantId, tenantId), eq(abCardapioModelosTable.id, String(req.params.id)),
      ));
      if (!existente) return null;
      const { itens, ...campos } = parsed.data;
      if (Object.keys(campos).length > 0) {
        await tx.update(abCardapioModelosTable).set({ ...campos, updatedAt: new Date() }).where(
          and(eq(abCardapioModelosTable.tenantId, tenantId), eq(abCardapioModelosTable.id, existente.id)),
        );
      }
      if (itens) {
        const ids = [...new Set(itens.map((item) => item.fichaId))];
        const fichas = await fichasDoTenant(tx, tenantId, ids);
        if (ids.some((id) => !fichas.has(id))) return { erro: "Ficha não encontrada neste hotel" };
        await tx.delete(abCardapioModeloItensTable).where(and(
          eq(abCardapioModeloItensTable.tenantId, tenantId),
          eq(abCardapioModeloItensTable.modeloId, existente.id),
        ));
        await tx.insert(abCardapioModeloItensTable).values(valoresItens(tenantId, existente.id, itens, fichas));
      }
      return detalheModelo(tx, tenantId, existente.id);
    });
    if (atualizado && "erro" in atualizado) return res.status(422).json({ error: atualizado.erro });
    return atualizado ? res.json(atualizado) : res.status(404).json({ error: "Modelo não encontrado" });
  } catch (erro) {
    if (isUniqueViolation(erro)) return res.status(409).json({ error: "Já existe um modelo com esse nome para este serviço" });
    console.error("[ab-cardapio-modelos] update", erro);
    return res.status(500).json({ error: "Não foi possível atualizar o modelo" });
  }
});

// DELETE /tenants/:tenantId/ab/cardapio-modelos/:id
router.delete("/tenants/:tenantId/ab/cardapio-modelos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Modelo inválido" });
  try {
    const removido = await withTenantTx(tenantId, async (tx) => (
      await tx.delete(abCardapioModelosTable).where(and(
        eq(abCardapioModelosTable.tenantId, tenantId), eq(abCardapioModelosTable.id, String(req.params.id)),
      )).returning({ id: abCardapioModelosTable.id })
    ).length > 0);
    return removido ? res.status(204).send() : res.status(404).json({ error: "Modelo não encontrado" });
  } catch (erro) {
    if (isForeignKeyViolation(erro)) return res.status(409).json({ error: "Modelo em uso pela grade ou escala" });
    console.error("[ab-cardapio-modelos] delete", erro);
    return res.status(500).json({ error: "Não foi possível excluir o modelo" });
  }
});

// ── Grade semanal ───────────────────────────────────────────────────────────
router.get("/tenants/:tenantId/ab/cardapio-grade", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const regras = await withTenantTx(tenantId, (tx) => tx
      .select()
      .from(abCardapioGradeTable)
      .where(eq(abCardapioGradeTable.tenantId, tenantId))
      .orderBy(asc(abCardapioGradeTable.diaSemana), asc(abCardapioGradeTable.servico)));
    return res.json({ regras });
  } catch (erro) {
    console.error("[ab-cardapio-grade] list", erro);
    return res.status(500).json({ error: "Não foi possível listar a grade" });
  }
});

router.post("/tenants/:tenantId/ab/cardapio-grade", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const entrada = z.object({
    diaSemana: z.number().int().min(0).max(6),
    servico: z.enum(AB_SERVICOS_CARDAPIO),
    modeloId: z.string().uuid(),
    ativo: z.boolean().optional(),
  }).strict().safeParse(req.body);
  if (!entrada.success) return res.status(422).json({ error: "Regra inválida", fields: camposInvalidos(entrada.error) });
  try {
    const regra = await withTenantTx(tenantId, async (tx) => {
      const [modelo] = await tx.select().from(abCardapioModelosTable).where(and(
        eq(abCardapioModelosTable.tenantId, tenantId), eq(abCardapioModelosTable.id, entrada.data.modeloId),
      ));
      if (!modelo) return { erro: "Modelo não encontrado" };
      if (modelo.servico !== entrada.data.servico) return { erro: "O serviço da regra precisa ser o mesmo do modelo" };
      const [row] = await tx.insert(abCardapioGradeTable).values({
        tenantId,
        diaSemana: entrada.data.diaSemana,
        servico: entrada.data.servico,
        modeloId: entrada.data.modeloId,
        ativo: entrada.data.ativo ?? true,
      }).onConflictDoUpdate({
        target: [abCardapioGradeTable.tenantId, abCardapioGradeTable.diaSemana, abCardapioGradeTable.servico],
        set: { modeloId: entrada.data.modeloId, ativo: entrada.data.ativo ?? true, updatedAt: new Date() },
      }).returning();
      return row;
    });
    if (regra && "erro" in regra) return res.status(422).json({ error: regra.erro });
    return res.status(201).json(regra);
  } catch (erro) {
    console.error("[ab-cardapio-grade] upsert", erro);
    return res.status(500).json({ error: "Não foi possível salvar a regra" });
  }
});

router.delete("/tenants/:tenantId/ab/cardapio-grade/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Regra inválida" });
  try {
    const removido = await withTenantTx(tenantId, async (tx) => (
      await tx.delete(abCardapioGradeTable).where(and(
        eq(abCardapioGradeTable.tenantId, tenantId), eq(abCardapioGradeTable.id, String(req.params.id)),
      )).returning({ id: abCardapioGradeTable.id })
    ).length > 0);
    return removido ? res.status(204).send() : res.status(404).json({ error: "Regra não encontrada" });
  } catch (erro) {
    console.error("[ab-cardapio-grade] delete", erro);
    return res.status(500).json({ error: "Não foi possível excluir a regra" });
  }
});

// ── Gerar escala dos próximos 30 dias ───────────────────────────────────────
router.post("/tenants/:tenantId/ab/cardapio-grade/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const entrada = z.object({
    dataInicio: dataISO.optional(),
    dias: z.number().int().min(1).max(90).optional(),
  }).strict().safeParse(req.body ?? {});
  if (!entrada.success) return res.status(422).json({ error: "Período inválido", fields: camposInvalidos(entrada.error) });
  const inicio = entrada.data.dataInicio ?? new Date().toISOString().slice(0, 10);
  const dias = entrada.data.dias ?? 30;

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const regras = await tx.select().from(abCardapioGradeTable).where(and(
        eq(abCardapioGradeTable.tenantId, tenantId),
        eq(abCardapioGradeTable.ativo, true),
      ));
      const criados: string[] = [];
      const ignorados: string[] = [];
      for (let offset = 0; offset < dias; offset += 1) {
        const date = new Date(`${inicio}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + offset);
        const data = date.toISOString().slice(0, 10);
        const diaSemana = date.getUTCDay();
        for (const regra of regras.filter((item) => item.diaSemana === diaSemana)) {
          const [existente] = await tx.select({ id: abCardapiosTable.id }).from(abCardapiosTable).where(and(
            eq(abCardapiosTable.tenantId, tenantId),
            eq(abCardapiosTable.data, data),
            eq(abCardapiosTable.servico, regra.servico),
          )).limit(1);
          if (existente) {
            ignorados.push(`${data} ${regra.servico}`);
            continue;
          }
          const [modelo] = await tx.select().from(abCardapioModelosTable).where(and(
            eq(abCardapioModelosTable.tenantId, tenantId),
            eq(abCardapioModelosTable.id, regra.modeloId),
          ));
          if (!modelo) continue;
          const itensModelo = await tx.select().from(abCardapioModeloItensTable).where(and(
            eq(abCardapioModeloItensTable.tenantId, tenantId),
            eq(abCardapioModeloItensTable.modeloId, modelo.id),
          ));
          if (itensModelo.length === 0) continue;
          const [cardapio] = await tx.insert(abCardapiosTable).values({
            tenantId,
            nome: modelo.nome,
            data,
            servico: regra.servico,
            modeloId: modelo.id,
            ativo: true,
            observacao: modelo.observacao ?? null,
            createdBy: req.user!.sub,
          }).returning();
          await tx.insert(abCardapioItensTable).values(itensModelo.map((item, ordem) => ({
            tenantId,
            cardapioId: cardapio!.id,
            fichaId: item.fichaId,
            fichaNome: item.fichaNome,
            categoria: item.categoria,
            percentualRateio: item.percentualRateio,
            modeloItemId: item.id,
            porcoesPorPax: "1",
            ordem: item.ordem ?? ordem,
            observacao: item.observacao ?? null,
          })));
          criados.push(`${data} ${regra.servico}`);
        }
      }
      return { criados, ignorados };
    });
    return res.json({ ...resultado, totalCriados: resultado.criados.length, totalIgnorados: resultado.ignorados.length });
  } catch (erro) {
    if (isUniqueViolation(erro)) return res.status(409).json({ error: "Já existe cardápio para uma das datas" });
    console.error("[ab-cardapio-grade] gerar", erro);
    return res.status(500).json({ error: "Não foi possível gerar a escala" });
  }
});

export default router;
