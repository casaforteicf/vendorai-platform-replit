import { Router, IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  solicitacoesCompraTable,
  fornecedoresTable,
  insertSolicitacaoCompraSchema,
  updateSolicitacaoCompraSchema,
  insertFornecedorSchema,
} from "@workspace/db";

const router: IRouter = Router();

function checkAccess(req: any, res: any, tenantId: string): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ── Fornecedores ────────────────────────────────────────────────────────────

// GET /tenants/:tenantId/fornecedores
router.get("/tenants/:tenantId/fornecedores", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!checkAccess(req, res, tenantId)) return;
  const rows = await db
    .select()
    .from(fornecedoresTable)
    .where(eq(fornecedoresTable.tenantId, tenantId))
    .orderBy(fornecedoresTable.nome);
  res.json(rows);
});

// POST /fornecedores
router.post("/fornecedores", async (req, res) => {
  const tenantId = String(req.body.tenantId ?? "");
  if (!checkAccess(req, res, tenantId)) return;
  const parsed = insertFornecedorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db.insert(fornecedoresTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// Encontra um fornecedor pelo nome (case-insensitive) ou cria um novo —
// usado pela opção "cadastrar automaticamente o fornecedor" na solicitação.
async function findOrCreateFornecedor(
  tenantId: string,
  nome: string,
  contato?: string | null,
  telefone?: string | null,
  email?: string | null,
) {
  const existing = await db
    .select()
    .from(fornecedoresTable)
    .where(eq(fornecedoresTable.tenantId, tenantId));
  const match = existing.find((f) => f.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (match) return match;

  const [created] = await db
    .insert(fornecedoresTable)
    .values({ tenantId, nome, contato: contato ?? null, telefone: telefone ?? null, email: email ?? null })
    .returning();
  return created;
}

// ── Solicitações de compra ──────────────────────────────────────────────────

// GET /tenants/:tenantId/solicitacoes-compra?status=pendente
router.get("/tenants/:tenantId/solicitacoes-compra", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!checkAccess(req, res, tenantId)) return;
  const status = req.query.status ? String(req.query.status) : null;

  const rows = await db
    .select()
    .from(solicitacoesCompraTable)
    .where(
      status
        ? and(eq(solicitacoesCompraTable.tenantId, tenantId), eq(solicitacoesCompraTable.status, status as any))
        : eq(solicitacoesCompraTable.tenantId, tenantId)
    )
    .orderBy(desc(solicitacoesCompraTable.createdAt));
  res.json(rows);
});

// POST /tenants/:tenantId/solicitacoes-compra
// Body pode incluir autoRegistrarFornecedor:true pra criar/atualizar o
// fornecedor genérico junto (não é uma coluna da tabela, só um flag de ação).
router.post("/tenants/:tenantId/solicitacoes-compra", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!checkAccess(req, res, tenantId)) return;

  const { autoRegistrarFornecedor, ...body } = req.body ?? {};
  let fornecedorId: string | null = body.fornecedorId ?? null;

  if (autoRegistrarFornecedor && body.fornecedorNome) {
    const fornecedor = await findOrCreateFornecedor(
      tenantId,
      String(body.fornecedorNome),
      body.fornecedorContato,
      body.fornecedorTelefone,
      body.fornecedorEmail,
    );
    fornecedorId = fornecedor.id;
  }

  const parsed = insertSolicitacaoCompraSchema.safeParse({ ...body, tenantId, fornecedorId });
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }

  const [row] = await db.insert(solicitacoesCompraTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// PATCH /solicitacoes-compra/:id
router.patch("/solicitacoes-compra/:id", async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(solicitacoesCompraTable).where(eq(solicitacoesCompraTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!checkAccess(req, res, existing.tenantId)) return;

  const parsed = updateSolicitacaoCompraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }
  const [row] = await db
    .update(solicitacoesCompraTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(solicitacoesCompraTable.id, id))
    .returning();
  res.json(row);
});

// POST /solicitacoes-compra/:id/aprovar  { aprovado: true|false }
router.post("/solicitacoes-compra/:id/aprovar", async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(solicitacoesCompraTable).where(eq(solicitacoesCompraTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!checkAccess(req, res, existing.tenantId)) return;

  const aprovado = !!req.body?.aprovado;
  const aprovadorNome = req.user?.email ?? "—";

  const [row] = await db
    .update(solicitacoesCompraTable)
    .set({
      status: aprovado ? "aprovado" : "reprovado",
      aprovadoPor: aprovadorNome,
      aprovadoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(solicitacoesCompraTable.id, id))
    .returning();

  // "Enviar pedido automático" — hoje só marca como enviado; o disparo de
  // fato (WhatsApp/e-mail pro fornecedor) fica pra uma etapa seguinte,
  // quando tivermos canal de contato confiável validado por fornecedor.
  if (aprovado && existing.enviarPedidoAutomatico) {
    await db
      .update(solicitacoesCompraTable)
      .set({ status: "enviado", enviadoEm: new Date(), updatedAt: new Date() })
      .where(eq(solicitacoesCompraTable.id, id));
    row.status = "enviado";
  }

  res.json(row);
});

// DELETE /solicitacoes-compra/:id
router.delete("/solicitacoes-compra/:id", async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(solicitacoesCompraTable).where(eq(solicitacoesCompraTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!checkAccess(req, res, existing.tenantId)) return;
  await db.delete(solicitacoesCompraTable).where(eq(solicitacoesCompraTable.id, id));
  res.status(204).send();
});

export default router;
