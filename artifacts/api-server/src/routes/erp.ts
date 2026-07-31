import { Router, type IRouter } from "express";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, erpTitulosTable, erpPagamentosTable, erpDocumentosFiscaisTable,
  insertErpTituloSchema, insertErpPagamentoSchema, insertErpDocumentoFiscalSchema,
  propostasTable, leadsTable, varejoPedidoCompraTable, varejoFornecedorTable,
} from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/erp/titulos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  await db.update(erpTitulosTable).set({ status: "vencido", updatedAt: new Date() }).where(and(eq(erpTitulosTable.tenantId, tenantId), eq(erpTitulosTable.status, "pendente"), lte(erpTitulosTable.vencimento, new Date())));
  const rows = await db.select().from(erpTitulosTable).where(eq(erpTitulosTable.tenantId, tenantId)).orderBy(erpTitulosTable.vencimento);
  res.json(rows);
});

router.post("/tenants/:tenantId/erp/titulos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = insertErpTituloSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
  const [row] = await db.insert(erpTitulosTable).values(parsed.data).returning();
  res.status(201).json(row);
});

const paymentBody = insertErpPagamentoSchema.omit({ tenantId: true, tituloId: true });
router.post("/tenants/:tenantId/erp/titulos/:id/baixar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = paymentBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
  const [existing] = await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.id, String(req.params.id)), eq(erpTitulosTable.tenantId, tenantId)));
  if (!existing) return void res.status(404).json({ error: "Título não encontrado" });
  const paidNow = Number(parsed.data.valor);
  const totalPaid = Number(existing.valorPago) + paidNow;
  const totalDue = Number(existing.valorOriginal) + Number(existing.juros) + Number(existing.multa) - Number(existing.desconto);
  const result = await db.transaction(async (tx) => {
    await tx.insert(erpPagamentosTable).values({ ...parsed.data, tenantId, tituloId: existing.id });
    const [title] = await tx.update(erpTitulosTable).set({ valorPago: String(totalPaid), status: totalPaid >= totalDue ? "pago" : existing.status, pagoEm: totalPaid >= totalDue ? (parsed.data.pagoEm ?? new Date()) : existing.pagoEm, contaBancaria: parsed.data.contaBancaria ?? existing.contaBancaria, updatedAt: new Date() }).where(eq(erpTitulosTable.id, existing.id)).returning();
    return title;
  });
  res.json(result);
});

router.get("/tenants/:tenantId/erp/titulos/:id/pagamentos", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const rows = await db.select().from(erpPagamentosTable).where(and(eq(erpPagamentosTable.tenantId, tenantId), eq(erpPagamentosTable.tituloId, String(req.params.id)))).orderBy(desc(erpPagamentosTable.pagoEm));
  res.json(rows);
});

router.post("/tenants/:tenantId/erp/sincronizar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const sales = await db.select({ id: propostasTable.id, titulo: propostasTable.titulo, valor: propostasTable.valorTotal, acceptedAt: propostasTable.acceptedAt, lead: leadsTable.nome }).from(propostasTable).leftJoin(leadsTable, eq(leadsTable.id, propostasTable.leadId)).where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.status, "aceita")));
  const purchases = await db.select({ id: varejoPedidoCompraTable.id, valor: varejoPedidoCompraTable.valorTotal, due: varejoPedidoCompraTable.dataPrevista, supplier: varejoFornecedorTable.nome }).from(varejoPedidoCompraTable).leftJoin(varejoFornecedorTable, eq(varejoFornecedorTable.id, varejoPedidoCompraTable.fornecedorId)).where(and(eq(varejoPedidoCompraTable.tenantId, tenantId), eq(varejoPedidoCompraTable.status, "confirmado")));
  let imported = 0;
  for (const sale of sales) {
    if (!sale.valor) continue;
    const rows = await db.insert(erpTitulosTable).values({ tenantId, tipo: "receber", categoria: "receita", descricao: sale.titulo, pessoa: sale.lead, valorOriginal: sale.valor, vencimento: sale.acceptedAt ?? new Date(), origemTipo: "proposta", origemId: sale.id }).onConflictDoNothing().returning({ id: erpTitulosTable.id });
    imported += rows.length;
  }
  for (const purchase of purchases) {
    if (!purchase.valor) continue;
    const due = purchase.due ? new Date(`${purchase.due}T12:00:00`) : new Date();
    const rows = await db.insert(erpTitulosTable).values({ tenantId, tipo: "pagar", categoria: "custo", descricao: `Pedido de compra ${purchase.id.slice(0, 8)}`, pessoa: purchase.supplier, valorOriginal: purchase.valor, vencimento: due, origemTipo: "pedido_compra", origemId: purchase.id }).onConflictDoNothing().returning({ id: erpTitulosTable.id });
    imported += rows.length;
  }
  res.json({ imported, sales: sales.length, purchases: purchases.length });
});

router.get("/tenants/:tenantId/erp/resumo", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const titles = await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.tenantId, tenantId), sql`${erpTitulosTable.status} <> 'cancelado'`));
  const value = (t: typeof titles[number]) => Number(t.valorOriginal) + Number(t.juros) + Number(t.multa) - Number(t.desconto);
  const receitas = titles.filter((t) => t.categoria === "receita").reduce((a, t) => a + value(t), 0);
  const custos = titles.filter((t) => t.categoria === "custo").reduce((a, t) => a + value(t), 0);
  const despesas = titles.filter((t) => t.categoria === "despesa").reduce((a, t) => a + value(t), 0);
  const impostos = titles.filter((t) => t.categoria === "imposto").reduce((a, t) => a + value(t), 0);
  const recebido = titles.filter((t) => t.tipo === "receber").reduce((a, t) => a + Number(t.valorPago), 0);
  const pago = titles.filter((t) => t.tipo === "pagar").reduce((a, t) => a + Number(t.valorPago), 0);
  res.json({ receitas, custos, despesas, impostos, lucroLiquido: receitas - custos - despesas - impostos, saldoRealizado: recebido - pago, receberAberto: titles.filter((t) => t.tipo === "receber" && t.status !== "pago").reduce((a, t) => a + value(t) - Number(t.valorPago), 0), pagarAberto: titles.filter((t) => t.tipo === "pagar" && t.status !== "pago").reduce((a, t) => a + value(t) - Number(t.valorPago), 0) });
});

router.get("/tenants/:tenantId/erp/documentos-fiscais", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  res.json(await db.select().from(erpDocumentosFiscaisTable).where(eq(erpDocumentosFiscaisTable.tenantId, tenantId)).orderBy(desc(erpDocumentosFiscaisTable.createdAt)));
});

router.post("/tenants/:tenantId/erp/documentos-fiscais", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = insertErpDocumentoFiscalSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
  const [row] = await db.insert(erpDocumentosFiscaisTable).values(parsed.data).returning();
  res.status(201).json(row);
});

export default router;
