import { Router, type IRouter } from "express";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  abBriffingPrevisoesTable,
  abCardapioItensTable,
  abCardapiosTable,
  abEstoqueInsumosTable,
  abFichaInsumosTable,
  abFichasTecnicasTable,
} from "@workspace/db";
import { abAllowed, camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

const dataISO = z.iso.date();
const SERVICOS = ["cafe_manha", "almoco", "jantar", "outro"] as const;

/**
 * Planejamento do restaurante usando o A&B novo:
 * hóspedes por período + cardápios do dia + fichas técnicas + estoque de insumos.
 */
router.post("/tenants/:tenantId/ab/planejamento/previsoes-periodo", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const entrada = z.object({
    dataInicio: dataISO,
    dataFim: dataISO,
    servico: z.enum(SERVICOS),
    ocupacao: z.number().int().min(0).max(100000),
  }).strict().safeParse(req.body);
  if (!entrada.success) return res.status(422).json({ error: "Período inválido", fields: camposInvalidos(entrada.error) });
  if (entrada.data.dataFim < entrada.data.dataInicio) return res.status(422).json({ error: "Data final menor que a inicial" });

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      let atualizados = 0;
      const cursor = new Date(`${entrada.data.dataInicio}T12:00:00Z`);
      const fim = new Date(`${entrada.data.dataFim}T12:00:00Z`);
      while (cursor <= fim) {
        const data = cursor.toISOString().slice(0, 10);
        await tx.insert(abBriffingPrevisoesTable).values({
          tenantId,
          data,
          servico: entrada.data.servico,
          ocupacao: entrada.data.ocupacao,
          createdBy: req.user?.sub ?? null,
          observacoes: "Planejamento por período",
        }).onConflictDoUpdate({
          target: [abBriffingPrevisoesTable.tenantId, abBriffingPrevisoesTable.data, abBriffingPrevisoesTable.servico],
          set: { ocupacao: entrada.data.ocupacao, updatedAt: new Date() },
        });
        atualizados += 1;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return { dias: atualizados };
    });
    return res.json(resultado);
  } catch (erro) {
    console.error("[ab-planejamento] previsoes", erro);
    return res.status(500).json({ error: "Não foi possível salvar as previsões" });
  }
});

type Necessidade = {
  insumoId: string;
  insumoNome: string;
  unidade: string;
  necessario: number;
  disponivel: number;
  comprar: number;
};

router.get("/tenants/:tenantId/ab/planejamento/necessidades", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!abAllowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const filtro = z.object({
    dataInicio: dataISO,
    dataFim: dataISO,
    proteinaPorAdulto: z.coerce.number().min(0).max(5000).optional(),
    acompanhamentoPorAdulto: z.coerce.number().min(0).max(5000).optional(),
  }).safeParse(req.query);
  if (!filtro.success) return res.status(422).json({ error: "Filtro inválido", fields: camposInvalidos(filtro.error) });
  if (filtro.data.dataFim < filtro.data.dataInicio) return res.status(422).json({ error: "Data final menor que a inicial" });
  const proteina = filtro.data.proteinaPorAdulto ?? 300;
  const acompanhamento = filtro.data.acompanhamentoPorAdulto ?? 150;

  try {
    const resultado = await withTenantTx(tenantId, async (tx) => {
      const menus = await tx
        .select()
        .from(abCardapiosTable)
        .where(and(
          eq(abCardapiosTable.tenantId, tenantId),
          eq(abCardapiosTable.ativo, true),
          gte(abCardapiosTable.data, filtro.data.dataInicio),
          lte(abCardapiosTable.data, filtro.data.dataFim),
        ))
        .orderBy(asc(abCardapiosTable.data), asc(abCardapiosTable.servico));

      const previsoes = await tx
        .select()
        .from(abBriffingPrevisoesTable)
        .where(and(
          eq(abBriffingPrevisoesTable.tenantId, tenantId),
          gte(abBriffingPrevisoesTable.data, filtro.data.dataInicio),
          lte(abBriffingPrevisoesTable.data, filtro.data.dataFim),
        ));

      const menuIds = menus.map((menu) => menu.id);
      const itens = menuIds.length
        ? await tx.select().from(abCardapioItensTable).where(and(
            eq(abCardapioItensTable.tenantId, tenantId),
            inArray(abCardapioItensTable.cardapioId, menuIds),
          ))
        : [];
      const fichaIds = [...new Set(itens.map((item) => item.fichaId))];
      const fichas = fichaIds.length
        ? await tx.select().from(abFichasTecnicasTable).where(and(
            eq(abFichasTecnicasTable.tenantId, tenantId),
            inArray(abFichasTecnicasTable.id, fichaIds),
          ))
        : [];
      const insumos = fichaIds.length
        ? await tx.select().from(abFichaInsumosTable).where(and(
            eq(abFichaInsumosTable.tenantId, tenantId),
            inArray(abFichaInsumosTable.fichaId, fichaIds),
          ))
        : [];
      const saldos = await tx.select().from(abEstoqueInsumosTable).where(eq(abEstoqueInsumosTable.tenantId, tenantId));

      const porFicha = new Map(fichas.map((ficha) => [ficha.id, ficha]));
      const insumosPorFicha = new Map<string, typeof insumos>();
      for (const insumo of insumos) {
        const lista = insumosPorFicha.get(insumo.fichaId) ?? [];
        lista.push(insumo);
        insumosPorFicha.set(insumo.fichaId, lista);
      }
      const saldoPorInsumo = new Map<string, number>();
      for (const saldo of saldos) {
        saldoPorInsumo.set(saldo.insumoId, (saldoPorInsumo.get(saldo.insumoId) ?? 0) + Number(saldo.quantidade));
      }

      const acumulado = new Map<string, Necessidade>();
      const dias: Array<{ data: string; servico: string; ocupacao: number; menu: string }> = [];

      for (const menu of menus) {
        const previsao = previsoes.find((item) => item.data === menu.data && item.servico === menu.servico);
        if (!previsao || previsao.ocupacao <= 0) continue;
        const itensMenu = itens.filter((item) => item.cardapioId === menu.id);
        dias.push({ data: menu.data, servico: menu.servico, ocupacao: previsao.ocupacao, menu: menu.nome });

        for (const item of itensMenu) {
          const ficha = porFicha.get(item.fichaId);
          if (!ficha) continue;
          const categoria = item.categoria as "proteina" | "acompanhamento" | "outro";
          const grupo = itensMenu.filter((outro) => outro.categoria === categoria);
          const percentual = item.percentualRateio
            ? Number(item.percentualRateio)
            : grupo.length > 0 ? 100 / grupo.length : 0;
          const listaFicha = insumosPorFicha.get(ficha.id) ?? [];
          const referencia = Math.max(0, ...listaFicha
            .filter((insumo) => insumo.unidadeBase !== "un")
            .map((insumo) => Number(insumo.quantidadePorPorcao)));
          let fator = Number(item.porcoesPorPax) || 1;
          if (categoria !== "outro" && referencia > 0) {
            const alvo = (categoria === "proteina" ? proteina : acompanhamento) * (percentual / 100);
            fator = alvo / referencia;
          }
          for (const insumo of listaFicha) {
            const quantidade = Number(insumo.quantidadePorPorcao) * fator * previsao.ocupacao * (Number(insumo.fatorCorrecao) || 1);
            const chave = `${insumo.insumoId ?? insumo.insumoNome}|${insumo.unidadeBase}`;
            const atual = acumulado.get(chave) ?? {
              insumoId: insumo.insumoId ?? insumo.insumoNome,
              insumoNome: insumo.insumoNome,
              unidade: insumo.unidadeBase,
              necessario: 0,
              disponivel: insumo.insumoId ? saldoPorInsumo.get(insumo.insumoId) ?? 0 : 0,
              comprar: 0,
            };
            atual.necessario += quantidade;
            acumulado.set(chave, atual);
          }
        }
      }

      const necessidades = [...acumulado.values()].map((item) => ({
        ...item,
        necessario: Number(item.necessario.toFixed(3)),
        disponivel: Number(item.disponivel.toFixed(3)),
        comprar: Number(Math.max(0, item.necessario - item.disponivel).toFixed(3)),
      })).sort((a, b) => a.insumoNome.localeCompare(b.insumoNome));

      return { dias, necessidades, proteinaPorAdulto: proteina, acompanhamentoPorAdulto: acompanhamento };
    });
    return res.json(resultado);
  } catch (erro) {
    console.error("[ab-planejamento] necessidades", erro);
    return res.status(500).json({ error: "Não foi possível calcular as necessidades" });
  }
});

export default router;
