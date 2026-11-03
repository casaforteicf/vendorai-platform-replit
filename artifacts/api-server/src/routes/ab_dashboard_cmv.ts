import { Router, type IRouter } from "express";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod/v4";
import {
  abEstoqueSaldosTable,
  abInsumoProdutoTable,
  abRecebimentosTable,
  abSobrasTable,
  insumosTable,
} from "@workspace/db";
import { abAllowed, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * A&B — dashboard de CMV (AB-09).
 *
 * O que dá para calcular com o dado que existe hoje, e o que não dá:
 *
 *  - **Compras**: `ab_recebimentos` NÃO grava valor. O custo é ESTIMADO pelo
 *    preço do insumo mapeado (`ab_insumo_produto` → `insumos.preco_unitario`),
 *    interpretado como preço por unidade base. Sem preço/mapeamento, o
 *    recebimento entra em `semCusto` — o card mostra a ressalva em vez de
 *    inventar número.
 *  - **Produção**: o briffing não é persistido (é cálculo de tela) e a ocupação
 *    não é guardada; sem isso não existe custo de produção real. Devolvemos
 *    `null` com o motivo, em vez de um valor fictício.
 *  - **Desperdício**: `ab_sobras.peso_kg` é sempre massa; só é precificável
 *    quando o insumo está em g. Os demais entram em `semCusto`.
 *  - **Estoque final**: `ab_estoque_saldos.saldo_atual` × preço do insumo.
 *  - **Receita**: mock (vem do PMS). Aceita `?receita=` para simulação.
 */

function mesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

function inicioDoMes(mes: string): string {
  return `${mes}-01`;
}

function inicioDoMesSeguinte(mes: string): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
  return `${proximo}-01`;
}

function hojeISO(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function diasAtras(iso: string, dias: number): string {
  const base = new Date(`${iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

function arredondar(valor: number, casas = 2): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

const consulta = z
  .object({
    mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    receita: z.coerce.number().min(0).max(1_000_000_000).optional(),
  })
  .strict();

router.get("/tenants/:tenantId/ab/dashboard/cmv", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const parsed = consulta.safeParse(req.query);
  if (!parsed.success) {
    return res.status(422).json({ error: "Parâmetros inválidos", fields: ["mes", "receita"] });
  }

  const hoje = hojeISO();
  const mes = parsed.data.mes ?? hoje.slice(0, 7);
  if (!mesValido(mes)) return res.status(422).json({ error: "Mês inválido (use AAAA-MM)" });

  const inicio = inicioDoMes(mes);
  const fim = inicioDoMesSeguinte(mes);
  const inicioSemana = diasAtras(hoje, 6);

  try {
    const dados = await withTenantTx(t, async (tx) => {
      const [recebimentos, mapeamentos, insumos, sobras, saldos] = await Promise.all([
        tx
          .select({
            quantidade: abRecebimentosTable.quantidade,
            unidade: abRecebimentosTable.unidade,
            produtoCatalogoId: abRecebimentosTable.produtoCatalogoId,
            status: abRecebimentosTable.status,
          })
          .from(abRecebimentosTable)
          .where(
            and(
              eq(abRecebimentosTable.tenantId, t),
              gte(abRecebimentosTable.createdAt, new Date(`${inicio}T00:00:00Z`)),
              lt(abRecebimentosTable.createdAt, new Date(`${fim}T00:00:00Z`)),
            ),
          ),
        tx
          .select({
            produtoCatalogoId: abInsumoProdutoTable.produtoCatalogoId,
            insumoId: abInsumoProdutoTable.insumoId,
            fator: abInsumoProdutoTable.fatorEmbalagem,
          })
          .from(abInsumoProdutoTable)
          .where(eq(abInsumoProdutoTable.tenantId, t)),
        tx
          .select({
            id: insumosTable.id,
            unidade: insumosTable.unidade,
            preco: insumosTable.precoUnitario,
          })
          .from(insumosTable)
          .where(eq(insumosTable.tenantId, t)),
        tx
          .select({
            data: abSobrasTable.data,
            pesoKg: abSobrasTable.pesoKg,
            insumoId: abSobrasTable.insumoId,
          })
          .from(abSobrasTable)
          .where(and(eq(abSobrasTable.tenantId, t), gte(abSobrasTable.data, inicioSemana))),
        tx
          .select({
            insumoId: abEstoqueSaldosTable.insumoId,
            saldo: abEstoqueSaldosTable.saldoAtual,
          })
          .from(abEstoqueSaldosTable)
          .where(eq(abEstoqueSaldosTable.tenantId, t)),
      ]);

      return { recebimentos, mapeamentos, insumos, sobras, saldos };
    });

    const precoPorInsumo = new Map<string, number>();
    const unidadePorInsumo = new Map<string, string>();
    for (const insumo of dados.insumos) {
      if (insumo.preco !== null && insumo.preco !== undefined) {
        const preco = Number(insumo.preco);
        if (Number.isFinite(preco) && preco >= 0) precoPorInsumo.set(insumo.id, preco);
      }
      unidadePorInsumo.set(insumo.id, (insumo.unidade ?? "").toLowerCase());
    }

    const insumoPorProduto = new Map<string, string>();
    for (const mapa of dados.mapeamentos) insumoPorProduto.set(mapa.produtoCatalogoId, mapa.insumoId);

    // ── Compras do mês ───────────────────────────────────────────────────────
    let valorCompras = 0;
    let recebimentosSemCusto = 0;
    let recebimentos = 0;
    for (const recebimento of dados.recebimentos) {
      recebimentos += 1;
      const insumoId = insumoPorProduto.get(recebimento.produtoCatalogoId);
      const preco = insumoId ? precoPorInsumo.get(insumoId) : undefined;
      if (preco === undefined) {
        recebimentosSemCusto += 1;
        continue;
      }
      valorCompras += Number(recebimento.quantidade) * preco;
    }

    // ── Estoque final (valor) ────────────────────────────────────────────────
    let valorEstoque = 0;
    let insumosSemPreco = 0;
    for (const saldo of dados.saldos) {
      const preco = precoPorInsumo.get(saldo.insumoId);
      if (preco === undefined) {
        insumosSemPreco += 1;
        continue;
      }
      valorEstoque += Number(saldo.saldo) * preco;
    }

    // ── Desperdício dos últimos 7 dias ───────────────────────────────────────
    const porDia = new Map<string, { kg: number; valor: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      porDia.set(diasAtras(hoje, i), { kg: 0, valor: 0 });
    }

    let desperdicioValor = 0;
    let desperdicioKg = 0;
    let sobrasSemPreco = 0;

    for (const sobra of dados.sobras) {
      const kg = Number(sobra.pesoKg);
      const dia = porDia.get(sobra.data) ?? { kg: 0, valor: 0 };
      dia.kg = arredondar(dia.kg + kg, 3);
      desperdicioKg = arredondar(desperdicioKg + kg, 3);

      const insumoId = sobra.insumoId;
      const preco = insumoId ? precoPorInsumo.get(insumoId) : undefined;
      const unidade = insumoId ? unidadePorInsumo.get(insumoId) : undefined;
      // Só precifica quando o insumo é massa (preço por g) — sobra é sempre kg.
      if (preco !== undefined && unidade === "g") {
        const valor = arredondar(kg * 1000 * preco, 2);
        dia.valor = arredondar(dia.valor + valor, 2);
        desperdicioValor = arredondar(desperdicioValor + valor, 2);
      } else {
        sobrasSemPreco += 1;
      }

      if (porDia.has(sobra.data)) porDia.set(sobra.data, dia);
    }

    const receita = parsed.data.receita ?? 0;
    const cmv = receita > 0 ? arredondar(((valorCompras - valorEstoque) / receita) * 100, 2) : null;

    return res.json({
      mes,
      competencia: { inicio, fim },
      compras: {
        valor: arredondar(valorCompras),
        recebimentos,
        semCusto: recebimentosSemCusto,
        estimado: true,
        observacao:
          "ab_recebimentos não grava valor: o custo é estimado pelo preço do insumo mapeado.",
      },
      producao: {
        valor: null,
        motivo:
          "Briffing não é persistido e a ocupação não é guardada — sem isso não há custo de produção real.",
      },
      desperdicio: {
        valor: arredondar(desperdicioValor),
        kg: desperdicioKg,
        semCusto: sobrasSemPreco,
        porDia: [...porDia.entries()].map(([data, valores]) => ({
          data,
          kg: valores.kg,
          valor: valores.valor,
        })),
      },
      estoque: {
        valor: arredondar(valorEstoque),
        insumosSemPreco,
      },
      receita: {
        valor: receita,
        mock: true,
        observacao: "Receita vem do PMS; aqui é parâmetro (?receita=) para simulação.",
      },
      cmv: {
        valor: cmv,
        formula: "(compras - estoque final) / receita",
        percentual: cmv,
      },
    });
  } catch (e) {
    console.error("[ab-cmv] dashboard", e);
    return res.status(500).json({ error: "Could not build CMV dashboard" });
  }
});

export default router;
