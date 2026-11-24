import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  abInsumoProdutoTable,
  insertAbInsumoProdutoSchema,
  insumosTable,
  produtosCatalogoTable,
} from "@workspace/db";
import {
  abAllowed,
  camposInvalidos,
  isForeignKeyViolation,
  withTenantTx,
} from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * A&B — catálogo de insumos e mapa produto → insumo (AB-05).
 *
 * Este é o par que faltava entre o estoque do hotel (`produtos_catalogo`, via
 * `inventory_items`) e o motor preditivo (`insumos`). A tela de mapeamento lê o
 * catálogo de insumos daqui e grava o de-para aqui.
 */

const produtoId = z.uuid();
const insumoId = z.uuid();

// ── GET /tenants/:tenantId/ab/insumos ────────────────────────────────────────
router.get("/tenants/:tenantId/ab/insumos", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  try {
    const insumos = await withTenantTx(t, async (tx) =>
      tx
        .select({
          id: insumosTable.id,
          nome: insumosTable.nome,
          unidade: insumosTable.unidade,
          codigo: insumosTable.codigo,
        })
        .from(insumosTable)
        .where(eq(insumosTable.tenantId, t))
        .orderBy(asc(insumosTable.nome)),
    );
    return res.json({ insumos });
  } catch (e) {
    console.error("[ab-insumos] list", e);
    return res.status(500).json({ error: "Could not list insumos" });
  }
});

// ── GET /tenants/:tenantId/ab/insumo-produto ─────────────────────────────────
router.get("/tenants/:tenantId/ab/insumo-produto", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  try {
    const mapeamentos = await withTenantTx(t, async (tx) =>
      tx
        .select({
          id: abInsumoProdutoTable.id,
          insumoId: abInsumoProdutoTable.insumoId,
          produtoCatalogoId: abInsumoProdutoTable.produtoCatalogoId,
          fatorEmbalagem: abInsumoProdutoTable.fatorEmbalagem,
          insumoNome: insumosTable.nome,
          insumoUnidade: insumosTable.unidade,
          produtoNome: produtosCatalogoTable.nome,
          produtoSku: produtosCatalogoTable.sku,
          produtoUnidade: produtosCatalogoTable.unidade,
        })
        .from(abInsumoProdutoTable)
        .leftJoin(
          insumosTable,
          and(
            eq(insumosTable.tenantId, abInsumoProdutoTable.tenantId),
            eq(insumosTable.id, abInsumoProdutoTable.insumoId),
          ),
        )
        .leftJoin(
          produtosCatalogoTable,
          and(
            eq(produtosCatalogoTable.tenantId, abInsumoProdutoTable.tenantId),
            eq(produtosCatalogoTable.id, abInsumoProdutoTable.produtoCatalogoId),
          ),
        )
        .where(eq(abInsumoProdutoTable.tenantId, t))
        .orderBy(asc(produtosCatalogoTable.nome)),
    );
    return res.json({ mapeamentos });
  } catch (e) {
    console.error("[ab-insumo-produto] list", e);
    return res.status(500).json({ error: "Could not list mappings" });
  }
});

// ── POST /tenants/:tenantId/ab/insumo-produto ────────────────────────────────
//
// Upsert pela chave de negócio: um produto mapeia para UM insumo (unique
// (tenant_id, produto_catalogo_id)). Reenviar o mesmo produto troca o insumo ou
// o fator — não cria linha duplicada, o que é o que a tela espera ao "salvar"
// novamente depois de corrigir.
router.post("/tenants/:tenantId/ab/insumo-produto", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const corpo = insertAbInsumoProdutoSchema.extend({
    produtoCatalogoId: produtoId,
    insumoId,
  });

  const parsed = corpo.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Mapeamento inválido", fields: camposInvalidos(parsed.error) });
  }

  try {
    const mapeamento = await withTenantTx(t, async (tx) => {
      const [salvo] = await tx
        .insert(abInsumoProdutoTable)
        .values({
          tenantId: t,
          insumoId: parsed.data.insumoId,
          produtoCatalogoId: parsed.data.produtoCatalogoId,
          fatorEmbalagem:
            parsed.data.fatorEmbalagem === undefined ? null : parsed.data.fatorEmbalagem,
        })
        .onConflictDoUpdate({
          target: [abInsumoProdutoTable.tenantId, abInsumoProdutoTable.produtoCatalogoId],
          set: {
            insumoId: parsed.data.insumoId,
            fatorEmbalagem:
              parsed.data.fatorEmbalagem === undefined ? null : parsed.data.fatorEmbalagem,
            updatedAt: new Date(),
          },
        })
        .returning();
      return salvo;
    });

    return res.status(201).json(mapeamento);
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      return res
        .status(422)
        .json({ error: "Insumo ou produto não pertence a este hotel" });
    }
    console.error("[ab-insumo-produto] save", e);
    return res.status(500).json({ error: "Could not save mapping" });
  }
});

// ── DELETE /tenants/:tenantId/ab/insumo-produto/:produtoId ───────────────────
router.delete("/tenants/:tenantId/ab/insumo-produto/:produtoId", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const id = produtoId.safeParse(req.params.produtoId);
  if (!id.success) return res.status(422).json({ error: "Id inválido" });

  try {
    const removidos = await withTenantTx(t, async (tx) =>
      tx
        .delete(abInsumoProdutoTable)
        .where(
          and(
            eq(abInsumoProdutoTable.tenantId, t),
            eq(abInsumoProdutoTable.produtoCatalogoId, id.data),
          ),
        )
        .returning({ id: abInsumoProdutoTable.id }),
    );

    if (removidos.length === 0) return res.status(404).json({ error: "Mapeamento não encontrado" });
    return res.status(204).send();
  } catch (e) {
    console.error("[ab-insumo-produto] delete", e);
    return res.status(500).json({ error: "Could not delete mapping" });
  }
});

export default router;
