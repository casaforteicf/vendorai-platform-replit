import { Router, type IRouter } from "express";
import { and, eq, desc, ilike, sql } from "drizzle-orm";
import {
  db,
  varejoColecaoTable,
  varejoFornecedorTable,
  varejoProdutoTable,
  varejoGradeTable,
  varejoPedidoCompraTable,
  varejoPedidoCompraItemTable,
  varejoFidelidadeTable,
  varejoComboTable,
  varejoComboItemTable,
  leadsTable,
  insertVarejoColecaoSchema,
  insertVarejoFornecedorSchema,
  insertVarejoProdutoSchema,
  insertVarejoGradeSchema,
  insertVarejoPedidoCompraSchema,
  insertVarejoPedidoCompraItemSchema,
  insertVarejoFidelidadeSchema,
  updateVarejoFidelidadeSchema,
  insertVarejoComboSchema,
  insertVarejoComboItemSchema,
  erpTitulosTable,
  compraRecebimentosTable,
  compraRecebimentoItensTable,
  erpAuditoriaTable,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

// ─── Coleções ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/colecoes", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(varejoColecaoTable)
    .where(eq(varejoColecaoTable.tenantId, tenantId))
    .orderBy(desc(varejoColecaoTable.ano), desc(varejoColecaoTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/varejo/colecoes", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoColecaoSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoColecaoTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/varejo/colecoes/:colecaoId", async (req, res) => {
  const { tenantId, colecaoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(varejoColecaoTable)
    .where(and(eq(varejoColecaoTable.id, colecaoId), eq(varejoColecaoTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Coleção not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/varejo/colecoes/:colecaoId", async (req, res) => {
  const { tenantId, colecaoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(varejoColecaoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(varejoColecaoTable.id, colecaoId), eq(varejoColecaoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Coleção not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/colecoes/:colecaoId", async (req, res) => {
  const { tenantId, colecaoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoColecaoTable)
    .where(and(eq(varejoColecaoTable.id, colecaoId), eq(varejoColecaoTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Fornecedores ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/fornecedores", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(varejoFornecedorTable)
    .where(eq(varejoFornecedorTable.tenantId, tenantId))
    .orderBy(desc(varejoFornecedorTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/varejo/fornecedores", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoFornecedorSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoFornecedorTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/varejo/fornecedores/:fornecedorId", async (req, res) => {
  const { tenantId, fornecedorId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(varejoFornecedorTable)
    .where(and(eq(varejoFornecedorTable.id, fornecedorId), eq(varejoFornecedorTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Fornecedor not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/varejo/fornecedores/:fornecedorId", async (req, res) => {
  const { tenantId, fornecedorId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(varejoFornecedorTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(varejoFornecedorTable.id, fornecedorId), eq(varejoFornecedorTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Fornecedor not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/fornecedores/:fornecedorId", async (req, res) => {
  const { tenantId, fornecedorId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoFornecedorTable)
    .where(and(eq(varejoFornecedorTable.id, fornecedorId), eq(varejoFornecedorTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Produtos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/produtos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(varejoProdutoTable.tenantId, tenantId)];
  if (req.query.colecaoId) filters.push(eq(varejoProdutoTable.colecaoId, req.query.colecaoId as string));
  if (req.query.fornecedorId) filters.push(eq(varejoProdutoTable.fornecedorId, req.query.fornecedorId as string));
  if (req.query.categoria) filters.push(eq(varejoProdutoTable.categoria, req.query.categoria as any));
  if (req.query.genero) filters.push(eq(varejoProdutoTable.genero, req.query.genero as any));

  const produtos = await db
    .select()
    .from(varejoProdutoTable)
    .where(and(...filters))
    .orderBy(desc(varejoProdutoTable.createdAt));

  const produtoIds = produtos.map((p) => p.id);
  const grades = produtoIds.length
    ? await db.select().from(varejoGradeTable).where(
        sql`${varejoGradeTable.produtoId} = ANY(${sql.raw(`ARRAY[${produtoIds.map(() => "?").join(",")}]::text[]`)})`
      ).catch(() => [] as any[])
    : [];

  const fornecedores = await db.select().from(varejoFornecedorTable).where(eq(varejoFornecedorTable.tenantId, tenantId));
  const colecoes = await db.select().from(varejoColecaoTable).where(eq(varejoColecaoTable.tenantId, tenantId));

  const fornMap = Object.fromEntries(fornecedores.map((f) => [f.id, f]));
  const colMap = Object.fromEntries(colecoes.map((c) => [c.id, c]));

  const result = produtos.map((p) => ({
    ...p,
    grades: grades.filter((g: any) => g.produtoId === p.id),
    fornecedor: p.fornecedorId ? fornMap[p.fornecedorId] ?? null : null,
    colecao: p.colecaoId ? colMap[p.colecaoId] ?? null : null,
  }));

  return res.json(result);
});

router.post("/tenants/:tenantId/varejo/produtos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoProdutoSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoProdutoTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/varejo/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [produto] = await db.select().from(varejoProdutoTable)
    .where(and(eq(varejoProdutoTable.id, produtoId), eq(varejoProdutoTable.tenantId, tenantId)));
  if (!produto) return res.status(404).json({ error: "Produto not found" });

  const grades = await db.select().from(varejoGradeTable).where(eq(varejoGradeTable.produtoId, produtoId));

  const fornecedor = produto.fornecedorId
    ? (await db.select().from(varejoFornecedorTable).where(eq(varejoFornecedorTable.id, produto.fornecedorId)))[0] ?? null
    : null;
  const colecao = produto.colecaoId
    ? (await db.select().from(varejoColecaoTable).where(eq(varejoColecaoTable.id, produto.colecaoId)))[0] ?? null
    : null;

  return res.json({ ...produto, grades, fornecedor, colecao });
});

router.put("/tenants/:tenantId/varejo/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(varejoProdutoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(varejoProdutoTable.id, produtoId), eq(varejoProdutoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoProdutoTable)
    .where(and(eq(varejoProdutoTable.id, produtoId), eq(varejoProdutoTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Grades ───────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/produtos/:produtoId/grades", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(varejoGradeTable)
    .where(and(eq(varejoGradeTable.produtoId, produtoId), eq(varejoGradeTable.tenantId, tenantId)));
  return res.json(rows);
});

router.post("/tenants/:tenantId/varejo/produtos/:produtoId/grades", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoGradeSchema.safeParse({ ...req.body, tenantId, produtoId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoGradeTable)
    .values(parsed.data)
    .returning();
  return res.status(201).json(row);
});

router.put("/tenants/:tenantId/varejo/produtos/:produtoId/grades/:gradeId", async (req, res) => {
  const { tenantId, produtoId, gradeId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(varejoGradeTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(
      eq(varejoGradeTable.id, gradeId),
      eq(varejoGradeTable.produtoId, produtoId),
      eq(varejoGradeTable.tenantId, tenantId),
    ))
    .returning();
  if (!row) return res.status(404).json({ error: "Grade not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/produtos/:produtoId/grades/:gradeId", async (req, res) => {
  const { tenantId, produtoId, gradeId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoGradeTable)
    .where(and(
      eq(varejoGradeTable.id, gradeId),
      eq(varejoGradeTable.produtoId, produtoId),
      eq(varejoGradeTable.tenantId, tenantId),
    ));
  return res.status(204).send();
});

// ─── Pedidos de Compra ────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/pedidos-compra", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(varejoPedidoCompraTable.tenantId, tenantId)];
  if (req.query.status) filters.push(eq(varejoPedidoCompraTable.status, req.query.status as any));
  if (req.query.fornecedorId) filters.push(eq(varejoPedidoCompraTable.fornecedorId, req.query.fornecedorId as string));

  const pedidos = await db.select().from(varejoPedidoCompraTable)
    .where(and(...filters))
    .orderBy(desc(varejoPedidoCompraTable.createdAt));

  const fornecedores = await db.select().from(varejoFornecedorTable).where(eq(varejoFornecedorTable.tenantId, tenantId));
  const colecoes = await db.select().from(varejoColecaoTable).where(eq(varejoColecaoTable.tenantId, tenantId));
  const fornMap = Object.fromEntries(fornecedores.map((f) => [f.id, f]));
  const colMap = Object.fromEntries(colecoes.map((c) => [c.id, c]));

  return res.json(pedidos.map((p) => ({
    ...p,
    fornecedor: p.fornecedorId ? fornMap[p.fornecedorId] ?? null : null,
    colecao: p.colecaoId ? colMap[p.colecaoId] ?? null : null,
  })));
});

router.post("/tenants/:tenantId/varejo/pedidos-compra", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoPedidoCompraSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoPedidoCompraTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [pedido] = await db.select().from(varejoPedidoCompraTable)
    .where(and(eq(varejoPedidoCompraTable.id, pedidoId), eq(varejoPedidoCompraTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const itens = await db.select().from(varejoPedidoCompraItemTable).where(eq(varejoPedidoCompraItemTable.pedidoId, pedidoId));

  const produtoIds = itens.map((i) => i.produtoId).filter(Boolean) as string[];
  const produtos = produtoIds.length
    ? await db.select().from(varejoProdutoTable).where(eq(varejoProdutoTable.tenantId, tenantId))
    : [];
  const prodMap = Object.fromEntries(produtos.map((p) => [p.id, p]));

  const fornecedor = pedido.fornecedorId
    ? (await db.select().from(varejoFornecedorTable).where(eq(varejoFornecedorTable.id, pedido.fornecedorId)))[0] ?? null
    : null;
  const colecao = pedido.colecaoId
    ? (await db.select().from(varejoColecaoTable).where(eq(varejoColecaoTable.id, pedido.colecaoId)))[0] ?? null
    : null;

  return res.json({
    ...pedido,
    fornecedor,
    colecao,
    itens: itens.map((i) => ({ ...i, produto: i.produtoId ? prodMap[i.produtoId] ?? null : null })),
  });
});

router.put("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [before] = await db.select().from(varejoPedidoCompraTable)
    .where(and(eq(varejoPedidoCompraTable.id, pedidoId), eq(varejoPedidoCompraTable.tenantId, tenantId)));
  if (!before) return res.status(404).json({ error: "Pedido not found" });
  if (before.status === "entregue" && req.body.status && req.body.status !== "entregue") {
    return res.status(409).json({ error: "Pedido já recebido. Faça um ajuste de estoque para estornar o recebimento." });
  }

  const [row] = await db.update(varejoPedidoCompraTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(varejoPedidoCompraTable.id, pedidoId), eq(varejoPedidoCompraTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });

  // O primeiro recebimento do pedido alimenta a grade de estoque. A checagem
  // do estado anterior torna a operação idempotente em reenvios da API.
  if (row.status === "entregue" && before.status !== "entregue") {
    const items = await db.select().from(varejoPedidoCompraItemTable)
      .where(eq(varejoPedidoCompraItemTable.pedidoId, pedidoId));
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (!item.produtoId) continue;
        const [grade] = await tx.select().from(varejoGradeTable).where(and(
          eq(varejoGradeTable.tenantId, tenantId),
          eq(varejoGradeTable.produtoId, item.produtoId),
          eq(varejoGradeTable.tamanho, item.tamanho),
          eq(varejoGradeTable.cor, item.cor),
        ));
        if (grade) {
          await tx.update(varejoGradeTable)
            .set({ estoque: sql`${varejoGradeTable.estoque} + ${item.quantidade}`, updatedAt: new Date() })
            .where(eq(varejoGradeTable.id, grade.id));
        } else {
          await tx.insert(varejoGradeTable).values({
            tenantId,
            produtoId: item.produtoId,
            tamanho: item.tamanho,
            cor: item.cor,
            estoque: item.quantidade,
          });
        }
      }
    });
  }
  if (row.status === "confirmado" && row.valorTotal) {
    const [supplier] = row.fornecedorId
      ? await db.select({ nome: varejoFornecedorTable.nome }).from(varejoFornecedorTable).where(eq(varejoFornecedorTable.id, row.fornecedorId))
      : [];
    const due = row.dataPrevista ? new Date(`${row.dataPrevista}T12:00:00`) : new Date();
    await db.insert(erpTitulosTable).values({
      tenantId,
      tipo: "pagar",
      categoria: "custo",
      descricao: `Pedido de compra ${row.id.slice(0, 8)}`,
      pessoa: supplier?.nome,
      valorOriginal: row.valorTotal,
      vencimento: due,
      origemTipo: "pedido_compra",
      origemId: row.id,
    }).onConflictDoNothing();
  }
  if (row.status === "cancelado") {
    await db.update(erpTitulosTable).set({ status: "cancelado", updatedAt: new Date() }).where(and(
      eq(erpTitulosTable.tenantId, tenantId),
      eq(erpTitulosTable.origemTipo, "pedido_compra"),
      eq(erpTitulosTable.origemId, row.id),
    ));
  }
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoPedidoCompraTable)
    .where(and(eq(varejoPedidoCompraTable.id, pedidoId), eq(varejoPedidoCompraTable.tenantId, tenantId)));
  return res.status(204).send();
});

router.get("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId/itens", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(varejoPedidoCompraItemTable)
    .where(eq(varejoPedidoCompraItemTable.pedidoId, pedidoId));
  return res.json(rows);
});

router.get("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId/recebimentos", async (req,res)=>{
  const {tenantId,pedidoId}=req.params;if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const recebimentos=await db.select().from(compraRecebimentosTable).where(and(eq(compraRecebimentosTable.tenantId,tenantId),eq(compraRecebimentosTable.pedidoId,pedidoId))).orderBy(desc(compraRecebimentosTable.recebidoEm));
  const ids=recebimentos.map(r=>r.id);const itens=ids.length?await db.select().from(compraRecebimentoItensTable).where(sql`${compraRecebimentoItensTable.recebimentoId} = ANY(${ids})`):[];
  return res.json(recebimentos.map(r=>({...r,itens:itens.filter(i=>i.recebimentoId===r.id)})));
});

router.post("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId/recebimentos", async (req,res)=>{
  const {tenantId,pedidoId}=req.params;if(!canAccess(req,tenantId))return res.status(403).json({error:"Forbidden"});
  const parsed=z.object({numeroDocumento:z.string().optional(),observacoes:z.string().optional(),itens:z.array(z.object({pedidoItemId:z.string(),quantidade:z.number().positive(),lote:z.string().optional(),validade:z.string().optional(),localizacao:z.string().optional(),custoUnitario:z.union([z.string(),z.number()]).transform(String).optional()})).min(1)}).safeParse(req.body);
  if(!parsed.success)return res.status(422).json({error:"Recebimento inválido",issues:parsed.error.issues});
  const [pedido]=await db.select().from(varejoPedidoCompraTable).where(and(eq(varejoPedidoCompraTable.id,pedidoId),eq(varejoPedidoCompraTable.tenantId,tenantId)));if(!pedido)return res.status(404).json({error:"Pedido não encontrado"});
  const orderItems=await db.select().from(varejoPedidoCompraItemTable).where(eq(varejoPedidoCompraItemTable.pedidoId,pedidoId));
  const previous=await db.execute(sql`SELECT cri.pedido_item_id,coalesce(sum(cri.quantidade),0)::numeric AS quantidade FROM compra_recebimento_itens cri JOIN compra_recebimentos cr ON cr.id=cri.recebimento_id WHERE cr.pedido_id=${pedidoId} GROUP BY cri.pedido_item_id`);
  const received=new Map(previous.rows.map((r:any)=>[String(r.pedido_item_id),Number(r.quantidade)]));
  for(const item of parsed.data.itens){const ordered=orderItems.find(i=>i.id===item.pedidoItemId);if(!ordered)return res.status(422).json({error:"Item não pertence ao pedido"});if((received.get(item.pedidoItemId)||0)+item.quantidade>ordered.quantidade)return res.status(409).json({error:`Quantidade recebida excede o pedido para ${ordered.tamanho}/${ordered.cor}`});}
  const result=await db.transaction(async tx=>{const [receipt]=await tx.insert(compraRecebimentosTable).values({tenantId,pedidoId,numeroDocumento:parsed.data.numeroDocumento,observacoes:parsed.data.observacoes,responsavelId:(req as any).user?.id??null}).returning();if(!receipt)throw new Error("Falha ao criar recebimento");
    for(const input of parsed.data.itens){const orderItem=orderItems.find(i=>i.id===input.pedidoItemId)!;await tx.insert(compraRecebimentoItensTable).values({...input,tenantId,quantidade:String(input.quantidade),recebimentoId:receipt.id});if(orderItem.produtoId){const [grade]=await tx.select().from(varejoGradeTable).where(and(eq(varejoGradeTable.tenantId,tenantId),eq(varejoGradeTable.produtoId,orderItem.produtoId),eq(varejoGradeTable.tamanho,orderItem.tamanho),eq(varejoGradeTable.cor,orderItem.cor)));if(grade)await tx.update(varejoGradeTable).set({estoque:sql`${varejoGradeTable.estoque}+${input.quantidade}`,updatedAt:new Date()}).where(eq(varejoGradeTable.id,grade.id));else await tx.insert(varejoGradeTable).values({tenantId,produtoId:orderItem.produtoId,tamanho:orderItem.tamanho,cor:orderItem.cor,estoque:input.quantidade});}}
    await tx.insert(erpAuditoriaTable).values({tenantId,usuarioId:(req as any).user?.id??null,modulo:"compras",acao:"recebimento_parcial",entidade:"pedido_compra",entidadeId:pedidoId,depois:parsed.data as any,ip:(req as any).ip});return receipt;});
  const totals=orderItems.every(i=>(received.get(i.id)||0)+(parsed.data.itens.find(x=>x.pedidoItemId===i.id)?.quantidade||0)>=i.quantidade);if(totals)await db.update(varejoPedidoCompraTable).set({status:"entregue",updatedAt:new Date()}).where(eq(varejoPedidoCompraTable.id,pedidoId));
  return res.status(201).json({...result,pedidoConcluido:totals});
});

router.post("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId/itens", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoPedidoCompraItemSchema.safeParse({ ...req.body, pedidoId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoPedidoCompraItemTable)
    .values(parsed.data)
    .returning();
  return res.status(201).json(row);
});

router.delete("/tenants/:tenantId/varejo/pedidos-compra/:pedidoId/itens/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoPedidoCompraItemTable).where(eq(varejoPedidoCompraItemTable.id, itemId));
  return res.status(204).send();
});

// ─── Fidelidade ───────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/fidelidade", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(varejoFidelidadeTable.tenantId, tenantId)];
  if (req.query.nivel) filters.push(eq(varejoFidelidadeTable.nivel, req.query.nivel as any));

  const rows = await db.select({
    id: varejoFidelidadeTable.id,
    tenantId: varejoFidelidadeTable.tenantId,
    leadId: varejoFidelidadeTable.leadId,
    pontos: varejoFidelidadeTable.pontos,
    totalGasto: varejoFidelidadeTable.totalGasto,
    nivel: varejoFidelidadeTable.nivel,
    ultimaCompra: varejoFidelidadeTable.ultimaCompra,
    observacoes: varejoFidelidadeTable.observacoes,
    createdAt: varejoFidelidadeTable.createdAt,
    updatedAt: varejoFidelidadeTable.updatedAt,
    leadNome: leadsTable.nome,
    leadTelefone: leadsTable.telefone,
  })
    .from(varejoFidelidadeTable)
    .leftJoin(leadsTable, eq(leadsTable.id, varejoFidelidadeTable.leadId))
    .where(and(...filters))
    .orderBy(desc(varejoFidelidadeTable.pontos));

  if (req.query.search) {
    const q = (req.query.search as string).toLowerCase();
    return res.json(rows.filter((r) => r.leadNome?.toLowerCase().includes(q) || r.leadTelefone?.includes(q)));
  }

  return res.json(rows);
});

router.get("/tenants/:tenantId/varejo/fidelidade/:leadId", async (req, res) => {
  const { tenantId, leadId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select({
    id: varejoFidelidadeTable.id,
    tenantId: varejoFidelidadeTable.tenantId,
    leadId: varejoFidelidadeTable.leadId,
    pontos: varejoFidelidadeTable.pontos,
    totalGasto: varejoFidelidadeTable.totalGasto,
    nivel: varejoFidelidadeTable.nivel,
    ultimaCompra: varejoFidelidadeTable.ultimaCompra,
    observacoes: varejoFidelidadeTable.observacoes,
    createdAt: varejoFidelidadeTable.createdAt,
    updatedAt: varejoFidelidadeTable.updatedAt,
    leadNome: leadsTable.nome,
    leadTelefone: leadsTable.telefone,
  })
    .from(varejoFidelidadeTable)
    .leftJoin(leadsTable, eq(leadsTable.id, varejoFidelidadeTable.leadId))
    .where(and(eq(varejoFidelidadeTable.leadId, leadId), eq(varejoFidelidadeTable.tenantId, tenantId)));

  if (!row) return res.status(404).json({ error: "Fidelidade not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/varejo/fidelidade/:leadId", async (req, res) => {
  const { tenantId, leadId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select({ id: varejoFidelidadeTable.id })
    .from(varejoFidelidadeTable)
    .where(and(eq(varejoFidelidadeTable.leadId, leadId), eq(varejoFidelidadeTable.tenantId, tenantId)));

  let row;
  if (existing) {
    const parsed = updateVarejoFidelidadeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
    [row] = await db.update(varejoFidelidadeTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(varejoFidelidadeTable.leadId, leadId), eq(varejoFidelidadeTable.tenantId, tenantId)))
      .returning();
  } else {
    const parsed = insertVarejoFidelidadeSchema.safeParse({ ...req.body, tenantId, leadId });
    if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
    [row] = await db.insert(varejoFidelidadeTable)
      .values(parsed.data)
      .returning();
  }

  return res.json(row);
});

// ─── Combos / Looks ───────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/varejo/combos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const combos = await db.select().from(varejoComboTable)
    .where(eq(varejoComboTable.tenantId, tenantId))
    .orderBy(desc(varejoComboTable.createdAt));

  const comboIds = combos.map((c) => c.id);
  const itens = comboIds.length
    ? await db.select().from(varejoComboItemTable)
        .where(sql`${varejoComboItemTable.comboId} IN (${sql.join(comboIds.map((id) => sql`${id}`), sql`, `)})`)
    : [];

  return res.json(combos.map((c) => ({
    ...c,
    itens: itens.filter((i) => i.comboId === c.id),
  })));
});

router.post("/tenants/:tenantId/varejo/combos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoComboSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoComboTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/varejo/combos/:comboId", async (req, res) => {
  const { tenantId, comboId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [combo] = await db.select().from(varejoComboTable)
    .where(and(eq(varejoComboTable.id, comboId), eq(varejoComboTable.tenantId, tenantId)));
  if (!combo) return res.status(404).json({ error: "Combo not found" });

  const itens = await db.select().from(varejoComboItemTable).where(eq(varejoComboItemTable.comboId, comboId));
  const produtoIds = itens.map((i) => i.produtoId).filter(Boolean) as string[];
  const produtos = produtoIds.length
    ? await db.select().from(varejoProdutoTable).where(eq(varejoProdutoTable.tenantId, tenantId))
    : [];
  const prodMap = Object.fromEntries(produtos.map((p) => [p.id, p]));

  return res.json({
    ...combo,
    itens: itens.map((i) => ({ ...i, produto: i.produtoId ? prodMap[i.produtoId] ?? null : null })),
  });
});

router.put("/tenants/:tenantId/varejo/combos/:comboId", async (req, res) => {
  const { tenantId, comboId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(varejoComboTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(varejoComboTable.id, comboId), eq(varejoComboTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Combo not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/varejo/combos/:comboId", async (req, res) => {
  const { tenantId, comboId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoComboTable)
    .where(and(eq(varejoComboTable.id, comboId), eq(varejoComboTable.tenantId, tenantId)));
  return res.status(204).send();
});

router.get("/tenants/:tenantId/varejo/combos/:comboId/itens", async (req, res) => {
  const { tenantId, comboId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db.select().from(varejoComboItemTable).where(eq(varejoComboItemTable.comboId, comboId));
  return res.json(rows);
});

router.post("/tenants/:tenantId/varejo/combos/:comboId/itens", async (req, res) => {
  const { tenantId, comboId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertVarejoComboItemSchema.safeParse({ ...req.body, comboId });
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [row] = await db.insert(varejoComboItemTable)
    .values(parsed.data)
    .returning();
  return res.status(201).json(row);
});

router.delete("/tenants/:tenantId/varejo/combos/:comboId/itens/:itemId", async (req, res) => {
  const { tenantId, itemId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(varejoComboItemTable).where(eq(varejoComboItemTable.id, itemId));
  return res.status(204).send();
});

export default router;
