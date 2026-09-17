import { Router, type IRouter } from "express";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, erpTitulosTable, erpPagamentosTable, erpDocumentosFiscaisTable,
  insertErpTituloSchema, updateErpTituloSchema, insertErpPagamentoSchema, insertErpDocumentoFiscalSchema,
  propostasTable, leadsTable, varejoPedidoCompraTable, varejoFornecedorTable,
  erpContasBancariasTable, erpExtratosBancariosTable, estoqueLotesTable,
  compraCotacoesTable, compraCotacaoPropostasTable, erpAuditoriaTable,
  tenantNavModulesTable, dealsTable,
} from "@workspace/db";
import { createCharge, createOrGetCustomer, getTenantAsaasApiKey } from "../lib/asaas.js";
import { emitirDocumentoFiscal, isNuvemFiscalConfigured } from "../lib/nuvem-fiscal.js";
import { evaluateCommission, resolveDealIdFromFinancialOrigin } from "../services/commission-engine.js";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

router.use("/tenants/:tenantId/erp", async (req, res, next) => {
  const tenantId = String(req.params.tenantId);
  const user = (req as any).user;
  if (!canAccess(req, tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (user?.platformRole === "super_admin") { next(); return; }
  try {
    const [entitlement] = await db.select({ isEnabled: tenantNavModulesTable.isEnabled }).from(tenantNavModulesTable).where(and(eq(tenantNavModulesTable.tenantId, tenantId), eq(tenantNavModulesTable.moduleKey, "financeiro"))).limit(1);
    if (!entitlement?.isEnabled) { res.status(403).json({ error: "ERP_ADDON_REQUIRED", message: "A Gestão ERP é um add-on contratado separadamente por R$ 299/mês." }); return; }
    next();
  } catch (error) {
    req.log.error({ error, tenantId }, "Falha ao validar entitlement do ERP");
    res.status(503).json({ error: "ERP_ENTITLEMENT_CHECK_FAILED", message: "Não foi possível validar o acesso à Gestão ERP." });
  }
});

async function audit(req: Express.Request, tenantId: string, acao: string, entidade: string, entidadeId?: string, depois?: unknown) {
  await db.insert(erpAuditoriaTable).values({ tenantId, usuarioId:(req as any).user?.id ?? null, modulo:"erp", acao, entidade, entidadeId, depois:depois as any, ip:(req as any).ip }).catch(()=>undefined);
}

async function emitCommissionForPayment(tenantId: string, title: typeof erpTitulosTable.$inferSelect, payment: typeof erpPagamentosTable.$inferSelect, trigger: "payment_received" | "payment_reconciled", correlationId: string, extra?: Record<string, unknown>) {
  if (title.tipo !== "receber") return;
  const dealId = await resolveDealIdFromFinancialOrigin(tenantId, title.origemTipo, title.origemId);
  if (!dealId) return;
  const [deal] = await db.select({ assignedTo: dealsTable.assignedTo }).from(dealsTable).where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId))).limit(1);
  if (!deal?.assignedTo) return;
  await evaluateCommission({
    tenantId,
    trigger,
    dealId,
    sellerUserId: deal.assignedTo,
    sourceType: trigger === "payment_received" ? "erp_payment" : "erp_reconciliation",
    sourceId: payment.id,
    baseAmountCents: Math.max(0, Math.round(Number(payment.valor) * 100)),
    receiptPercent: 100,
    correlationId,
    metadata: { tituloId: title.id, pagamentoId: payment.id, origemTipo: title.origemTipo, origemId: title.origemId, ...extra },
  });
}

router.get("/tenants/:tenantId/erp/configuracao", async (req, res) => {
  const tenantId=String(req.params.tenantId); if(!canAccess(req,tenantId)) return void res.status(403).json({error:"Access denied"});
  res.json({ asaas:Boolean(await getTenantAsaasApiKey(tenantId)), nuvemFiscal:isNuvemFiscalConfigured(), ambienteFiscal:process.env.NUVEM_FISCAL_AMBIENTE ?? "homologacao" });
});

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
  await audit(req, tenantId, "criar", "titulo", row?.id, row);
  res.status(201).json(row);
});

router.patch("/tenants/:tenantId/erp/titulos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const [existing] = await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.id, String(req.params.id)), eq(erpTitulosTable.tenantId, tenantId))).limit(1);
  if (!existing) return void res.status(404).json({ error: "Título não encontrado" });
  const parsed = updateErpTituloSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
  const nextStatus = parsed.data.status ?? existing.status;
  if (existing.valorPago !== "0" && nextStatus === "cancelado") return void res.status(409).json({ error: "Título com baixa registrada não pode ser cancelado diretamente." });
  const [row] = await db.update(erpTitulosTable).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(erpTitulosTable.id, existing.id), eq(erpTitulosTable.tenantId, tenantId))).returning();
  await audit(req, tenantId, "editar", "titulo", existing.id, { antes: existing, depois: row });
  res.json(row);
});

router.delete("/tenants/:tenantId/erp/titulos/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const id = String(req.params.id);
  const [existing] = await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.id, id), eq(erpTitulosTable.tenantId, tenantId))).limit(1);
  if (!existing) return void res.status(404).json({ error: "Título não encontrado" });
  const payments = await db.select({ id: erpPagamentosTable.id }).from(erpPagamentosTable).where(and(eq(erpPagamentosTable.tenantId, tenantId), eq(erpPagamentosTable.tituloId, id))).limit(1);
  if (payments.length || Number(existing.valorPago) > 0) {
    const [row] = await db.update(erpTitulosTable).set({ status: "cancelado", updatedAt: new Date() }).where(eq(erpTitulosTable.id, id)).returning();
    await audit(req, tenantId, "cancelar", "titulo", id, { antes: existing, depois: row, motivo: "possui_baixa" });
    return void res.json({ mode: "cancelled", title: row });
  }
  await audit(req, tenantId, "excluir", "titulo", id, existing);
  await db.delete(erpTitulosTable).where(and(eq(erpTitulosTable.id, id), eq(erpTitulosTable.tenantId, tenantId)));
  res.json({ mode: "deleted", id });
});

// Achado real de auditoria (removido 17/09): existia aqui uma rota
// /erp/extrair-lancamento dedicada, com upload pro storage, que nenhuma
// tela do frontend chamava — a captura de documento real
// (ErpCaptureContent.tsx) sempre usou /deals/extract-quote, um endpoint
// diferente e preexistente. Código duplicado morto, removido.

router.post("/tenants/:tenantId/erp/titulos/:id/cobranca", async (req,res)=>{
  const tenantId=String(req.params.tenantId); if(!canAccess(req,tenantId)) return void res.status(403).json({error:"Access denied"});
  const body=z.object({ billingType:z.enum(["PIX","BOLETO"]).default("PIX"), email:z.string().email().optional(), cpfCnpj:z.string().optional() }).safeParse(req.body);
  if(!body.success) return void res.status(422).json({error:"Dados da cobrança inválidos"});
  const [title]=await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.id,String(req.params.id)),eq(erpTitulosTable.tenantId,tenantId)));
  if(!title || title.tipo!=="receber") return void res.status(404).json({error:"Conta a receber não encontrada"});
  if(title.provedorCobrancaId) return void res.json(title);
  const key=await getTenantAsaasApiKey(tenantId); if(!key) return void res.status(409).json({error:"Conecte a conta Asaas nas Integrações antes de gerar cobranças."});
  const customer=await createOrGetCustomer({name:title.pessoa||"Cliente",email:body.data.email,cpfCnpj:body.data.cpfCnpj||title.documento||undefined},key);
  const total=Number(title.valorOriginal)+Number(title.juros)+Number(title.multa)-Number(title.desconto)-Number(title.valorPago);
  const charge=await createCharge({customer:customer.id,billingType:body.data.billingType,value:total,dueDate:title.vencimento.toISOString().slice(0,10),description:title.descricao,externalReference:`erp_titulo:${title.id}`},key);
  const [updated]=await db.update(erpTitulosTable).set({provedorCobranca:"asaas",provedorCobrancaId:charge.id,urlCobranca:charge.invoiceUrl,updatedAt:new Date()}).where(eq(erpTitulosTable.id,title.id)).returning();
  await audit(req,tenantId,"gerar_cobranca","titulo",title.id,{chargeId:charge.id,billingType:body.data.billingType}); res.status(201).json(updated);
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
    const [payment] = await tx.insert(erpPagamentosTable).values({ ...parsed.data, tenantId, tituloId: existing.id }).returning();
    const [title] = await tx.update(erpTitulosTable).set({ valorPago: String(totalPaid), status: totalPaid >= totalDue ? "pago" : existing.status, pagoEm: totalPaid >= totalDue ? (parsed.data.pagoEm ?? new Date()) : existing.pagoEm, contaBancaria: parsed.data.contaBancaria ?? existing.contaBancaria, updatedAt: new Date() }).where(eq(erpTitulosTable.id, existing.id)).returning();
    return { title, payment };
  });
  if (result.title && result.payment) {
    await emitCommissionForPayment(tenantId, result.title, result.payment, "payment_received", `erp:payment:${result.payment.id}`).catch((error) => req.log.error({ error, tenantId, paymentId: result.payment?.id }, "Falha ao processar comissão do recebimento"));
  }
  await audit(req, tenantId, "baixar", "titulo", existing.id, result.title);
  res.json(result.title);
});

router.get("/tenants/:tenantId/erp/fluxo-caixa",async(req,res)=>{
  const tenantId=String(req.params.tenantId); if(!canAccess(req,tenantId)) return void res.status(403).json({error:"Access denied"});
  const days=Math.min(Number(req.query.dias)||30,180);
  const rows=await db.execute(sql`SELECT date_trunc('day', vencimento)::date AS data,
    COALESCE(sum(CASE WHEN tipo='receber' THEN valor_original+juros+multa-desconto ELSE 0 END),0) AS entradas,
    COALESCE(sum(CASE WHEN tipo='pagar' THEN valor_original+juros+multa-desconto ELSE 0 END),0) AS saidas,
    COALESCE(sum(CASE WHEN tipo='receber' THEN valor_pago ELSE -valor_pago END),0) AS realizado
    FROM erp_titulos WHERE tenant_id=${tenantId} AND status<>'cancelado' AND vencimento < now()+(${days} || ' days')::interval GROUP BY 1 ORDER BY 1`);
  res.json(rows.rows);
});

router.get("/tenants/:tenantId/erp/contas-bancarias",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});res.json(await db.select().from(erpContasBancariasTable).where(eq(erpContasBancariasTable.tenantId,tenantId)));});
router.post("/tenants/:tenantId/erp/contas-bancarias",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});const parsed=z.object({nome:z.string().min(2),banco:z.string().optional(),agencia:z.string().optional(),conta:z.string().optional(),saldoInicial:z.union([z.string(),z.number()]).transform(String).optional()}).safeParse(req.body);if(!parsed.success)return void res.status(422).json({error:"Conta inválida"});const [row]=await db.insert(erpContasBancariasTable).values({...parsed.data,tenantId}).returning();await audit(req,tenantId,"criar","conta_bancaria",row?.id,row);res.status(201).json(row);});
router.get("/tenants/:tenantId/erp/extratos",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});res.json(await db.select().from(erpExtratosBancariosTable).where(eq(erpExtratosBancariosTable.tenantId,tenantId)).orderBy(desc(erpExtratosBancariosTable.data)));});
router.post("/tenants/:tenantId/erp/extratos/:id/conciliar",async(req,res)=>{
  const tenantId=String(req.params.tenantId); if(!canAccess(req,tenantId)) return void res.status(403).json({error:"Access denied"});
  const parsed=z.object({pagamentoId:z.string()}).safeParse(req.body); if(!parsed.success) return void res.status(422).json({error:"Pagamento obrigatório"});
  // Achado real de auditoria: antes marcava o extrato como conciliado sem
  // confirmar que o pagamento existia de verdade -- um pagamentoId inválido
  // deixava o extrato "conciliado" apontando pra nada, sem erro nenhum.
  const [payment]=await db.select().from(erpPagamentosTable).where(and(eq(erpPagamentosTable.id,parsed.data.pagamentoId),eq(erpPagamentosTable.tenantId,tenantId))).limit(1);
  if (!payment) return void res.status(404).json({ error: "Pagamento não encontrado" });
  const [row]=await db.update(erpExtratosBancariosTable).set({status:"conciliado",pagamentoId:parsed.data.pagamentoId}).where(and(eq(erpExtratosBancariosTable.id,String(req.params.id)),eq(erpExtratosBancariosTable.tenantId,tenantId))).returning();
  if (!row) return void res.status(404).json({ error: "Extrato não encontrado" });
  const [title]=await db.select().from(erpTitulosTable).where(and(eq(erpTitulosTable.id,payment.tituloId),eq(erpTitulosTable.tenantId,tenantId))).limit(1);
  if (title) await emitCommissionForPayment(tenantId,title,payment,"payment_reconciled",`erp:reconciliation:${row.id}:${payment.id}`,{extratoId:row.id}).catch((error)=>req.log.error({error,tenantId,extratoId:row.id},"Falha ao processar comissão da conciliação"));
  await audit(req,tenantId,"conciliar","extrato",row.id,row); res.json(row);
});

router.get("/tenants/:tenantId/erp/lotes",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});res.json(await db.select().from(estoqueLotesTable).where(eq(estoqueLotesTable.tenantId,tenantId)).orderBy(estoqueLotesTable.validade));});
router.post("/tenants/:tenantId/erp/lotes",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});const parsed=z.object({inventoryItemId:z.string(),lote:z.string().min(1),validade:z.string().optional(),localizacao:z.string().optional(),quantidade:z.union([z.string(),z.number()]).transform(String),custoUnitario:z.union([z.string(),z.number()]).transform(String).optional()}).safeParse(req.body);if(!parsed.success)return void res.status(422).json({error:"Lote inválido"});const [row]=await db.insert(estoqueLotesTable).values({...parsed.data,tenantId}).returning();await audit(req,tenantId,"criar","lote",row?.id,row);res.status(201).json(row);});

router.get("/tenants/:tenantId/erp/cotacoes",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});const rows=await db.select().from(compraCotacoesTable).where(eq(compraCotacoesTable.tenantId,tenantId)).orderBy(desc(compraCotacoesTable.createdAt));res.json(rows);});
router.post("/tenants/:tenantId/erp/cotacoes",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});const parsed=z.object({titulo:z.string().min(2),prazoResposta:z.string().optional()}).safeParse(req.body);if(!parsed.success)return void res.status(422).json({error:"Cotação inválida"});const [row]=await db.insert(compraCotacoesTable).values({...parsed.data,tenantId}).returning();await audit(req,tenantId,"criar","cotacao",row?.id,row);res.status(201).json(row);});
router.post("/tenants/:tenantId/erp/cotacoes/:id/propostas",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});const parsed=z.object({fornecedorId:z.string(),valorTotal:z.union([z.string(),z.number()]).transform(String),prazoDias:z.number().int().optional(),condicaoPagamento:z.string().optional(),observacoes:z.string().optional()}).safeParse(req.body);if(!parsed.success)return void res.status(422).json({error:"Proposta inválida"});const [row]=await db.insert(compraCotacaoPropostasTable).values({...parsed.data,tenantId,cotacaoId:String(req.params.id)}).onConflictDoUpdate({target:[compraCotacaoPropostasTable.cotacaoId,compraCotacaoPropostasTable.fornecedorId],set:parsed.data}).returning();await audit(req,tenantId,"registrar_proposta","cotacao",String(req.params.id),row);res.status(201).json(row);});

router.get("/tenants/:tenantId/erp/auditoria",async(req,res)=>{const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});res.json(await db.select().from(erpAuditoriaTable).where(eq(erpAuditoriaTable.tenantId,tenantId)).orderBy(desc(erpAuditoriaTable.createdAt)).limit(200));});

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
  await audit(req, tenantId, "criar", "documento_fiscal", row?.id, row);
  res.status(201).json(row);
});

router.post("/tenants/:tenantId/erp/documentos-fiscais/:id/emitir",async(req,res)=>{
  const tenantId=String(req.params.tenantId);if(!canAccess(req,tenantId))return void res.status(403).json({error:"Access denied"});
  const [doc]=await db.select().from(erpDocumentosFiscaisTable).where(and(eq(erpDocumentosFiscaisTable.id,String(req.params.id)),eq(erpDocumentosFiscaisTable.tenantId,tenantId)));
  if(!doc || doc.tipo==="boleto")return void res.status(404).json({error:"Documento fiscal não encontrado"});
  if(!isNuvemFiscalConfigured())return void res.status(409).json({error:"Configure NUVEM_FISCAL_CLIENT_ID e NUVEM_FISCAL_CLIENT_SECRET para emitir."});
  await db.update(erpDocumentosFiscaisTable).set({status:"processando",provedor:"nuvem_fiscal",updatedAt:new Date()}).where(eq(erpDocumentosFiscaisTable.id,doc.id));
  try { const result=await emitirDocumentoFiscal(doc.tipo,req.body as Record<string,unknown>); const status=result.status==="autorizado"?"autorizado":"processando"; const [updated]=await db.update(erpDocumentosFiscaisTable).set({status,provedorId:result.id??null,numero:result.numero??null,chave:result.chave??null,url:result.pdf??null,emitidoEm:status==="autorizado"?new Date():null,erro:null,updatedAt:new Date()}).where(eq(erpDocumentosFiscaisTable.id,doc.id)).returning();await audit(req,tenantId,"emitir",doc.tipo,doc.id,result);res.json(updated); }
  catch(error){const message=error instanceof Error?error.message:String(error);await db.update(erpDocumentosFiscaisTable).set({status:"rejeitado",erro:message,updatedAt:new Date()}).where(eq(erpDocumentosFiscaisTable.id,doc.id));res.status(422).json({error:message});}
});

export default router;
