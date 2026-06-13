import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  propostasTable,
  produtosCatalogoTable,
  insertPropostaSchema,
  updatePropostaSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/propostas", async (req, res) => {
  const parsed = insertPropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [proposta] = await db
    .insert(propostasTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(proposta);
});

router.get("/tenants/:tenantId/propostas", async (req, res) => {
  const { leadId, dealId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(propostasTable.tenantId, String(req.params.tenantId))];
  if (leadId) conditions.push(eq(propostasTable.leadId, leadId));
  if (dealId) conditions.push(eq(propostasTable.dealId, dealId));

  const propostas = await db
    .select()
    .from(propostasTable)
    .where(and(...conditions))
    .orderBy(propostasTable.createdAt);

  res.json(propostas);
});

router.get("/propostas/:id", async (req, res) => {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  res.json(proposta);
});

router.patch("/propostas/:id", async (req, res) => {
  const parsed = updatePropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [proposta] = await db
    .update(propostasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(propostasTable.id, String(req.params.id)))
    .returning();

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  res.json(proposta);
});

const PROPOSTA_TRANSITIONS: Record<string, string[]> = {
  rascunho: ["enviada"],
  enviada: ["aceita", "rejeitada", "expirada"],
  aceita: [],
  rejeitada: [],
  expirada: [],
};

router.patch("/propostas/:id/status", async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status) {
    res.status(422).json({ error: "status is required" });
    return;
  }

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  const allowed = PROPOSTA_TRANSITIONS[proposta.status] ?? [];
  if (!allowed.includes(status)) {
    res.status(422).json({
      error: `Transition from "${proposta.status}" to "${status}" is not allowed. Allowed: [${allowed.join(", ") || "none"}]`,
    });
    return;
  }

  const [updated] = await db
    .update(propostasTable)
    .set({ status: status as typeof proposta.status, updatedAt: new Date() })
    .where(eq(propostasTable.id, String(req.params.id)))
    .returning();

  res.json(updated);
});

const fromCatalogoBodySchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1),
  dealId: z.string().optional(),
  validadeAte: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1),
        quantidade: z.number().positive(),
      })
    )
    .min(1, "At least one item is required"),
});

router.post(
  "/tenants/:tenantId/propostas/from-catalogo",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    const parsed = fromCatalogoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const { leadId, titulo, dealId, validadeAte, observacoes, itens } =
      parsed.data;

    const produtoIds = itens.map((i) => i.produtoId);

    const produtos = await db
      .select()
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.tenantId, tenantId),
          inArray(produtosCatalogoTable.id, produtoIds)
        )
      );

    const missingIds = produtoIds.filter(
      (id) => !produtos.find((p) => p.id === id)
    );
    if (missingIds.length > 0) {
      res.status(422).json({
        error: `Products not found or do not belong to this tenant: ${missingIds.join(", ")}`,
      });
      return;
    }

    const inactiveProdutos = produtos.filter((p) => !p.ativo);
    if (inactiveProdutos.length > 0) {
      res.status(422).json({
        error: `Inactive products cannot be added to a proposta: ${inactiveProdutos.map((p) => p.nome).join(", ")}`,
      });
      return;
    }

    const produtoMap = new Map(produtos.map((p) => [p.id, p]));

    let valorTotal = 0;
    const propostaItens = itens.map((item) => {
      const produto = produtoMap.get(item.produtoId)!;
      const valorUnitario = parseFloat(produto.precoBase);
      valorTotal += item.quantidade * valorUnitario;
      return {
        nome: produto.nome,
        quantidade: item.quantidade,
        valorUnitario,
      };
    });

    const [proposta] = await db
      .insert(propostasTable)
      .values({
        tenantId,
        leadId,
        titulo,
        ...(dealId ? { dealId } : {}),
        ...(validadeAte ? { validadeAte } : {}),
        ...(observacoes ? { observacoes } : {}),
        itens: propostaItens,
        valorTotal: valorTotal.toFixed(2),
      })
      .returning();

    res.status(201).json(proposta);
  }
);

router.delete("/propostas/:id", async (req, res) => {
  const [deleted] = await db
    .delete(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)))
    .returning({ id: propostasTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  res.status(204).send();
});

export default router;
