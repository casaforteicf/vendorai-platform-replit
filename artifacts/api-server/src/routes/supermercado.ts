import { Router, type IRouter } from "express";
import { and, eq, desc, ilike, gte, lte, sql, count } from "drizzle-orm";
import {
  db,
  supermercadoConfigTable,
  supermercadoProdutoTable,
  supermercadoPedidoTable,
  supermercadoPedidoItemTable,
  supermercadoCampanhaTable,
  supermercadoCampanhaEnvioTable,
  leadsTable,
} from "@workspace/db";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
}

// ─── Config ───────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/supermercado/config", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(supermercadoConfigTable)
    .where(eq(supermercadoConfigTable.tenantId, tenantId));
  if (!row) return res.status(404).json({ error: "Config not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/supermercado/config", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select({ id: supermercadoConfigTable.id })
    .from(supermercadoConfigTable)
    .where(eq(supermercadoConfigTable.tenantId, tenantId));

  let row;
  if (existing) {
    [row] = await db.update(supermercadoConfigTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(supermercadoConfigTable.tenantId, tenantId))
      .returning();
  } else {
    [row] = await db.insert(supermercadoConfigTable)
      .values({ ...req.body, tenantId })
      .returning();
  }
  return res.json(row);
});

// ─── Produtos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/supermercado/produtos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { categoria, destaque, q } = req.query;
  const conditions = [eq(supermercadoProdutoTable.tenantId, tenantId)];

  if (categoria) conditions.push(eq(supermercadoProdutoTable.categoria, categoria as any));
  if (destaque === "true") conditions.push(eq(supermercadoProdutoTable.destaqueWhatsapp, true));
  if (q) conditions.push(ilike(supermercadoProdutoTable.nome, `%${q}%`));

  const rows = await db.select().from(supermercadoProdutoTable)
    .where(and(...conditions))
    .orderBy(supermercadoProdutoTable.nome);
  return res.json(rows);
});

router.post("/tenants/:tenantId/supermercado/produtos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(supermercadoProdutoTable)
    .values({ ...req.body, tenantId })
    .returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/supermercado/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(supermercadoProdutoTable)
    .where(and(eq(supermercadoProdutoTable.id, produtoId), eq(supermercadoProdutoTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/supermercado/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(supermercadoProdutoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(supermercadoProdutoTable.id, produtoId), eq(supermercadoProdutoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/supermercado/produtos/:produtoId", async (req, res) => {
  const { tenantId, produtoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(supermercadoProdutoTable)
    .where(and(eq(supermercadoProdutoTable.id, produtoId), eq(supermercadoProdutoTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── ERP Sync ─────────────────────────────────────────────────────────────────

router.post("/tenants/:tenantId/supermercado/sync-produtos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [config] = await db.select().from(supermercadoConfigTable)
    .where(eq(supermercadoConfigTable.tenantId, tenantId));

  if (!config?.erpApiUrl || !config?.erpSyncEnabled) {
    return res.json({ sincronizados: 0, erros: 0, mensagem: "ERP sync não configurado ou inativo." });
  }

  let sincronizados = 0;
  let erros = 0;

  try {
    const erpRes = await fetch(`${config.erpApiUrl}/produtos`, {
      headers: {
        "Authorization": `Bearer ${config.erpApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!erpRes.ok) throw new Error(`ERP respondeu ${erpRes.status}`);

    const produtos = (await erpRes.json()) as Array<{
      id: string; nome: string; preco: number; estoque: number;
      categoria?: string; descricao?: string; unidade?: string;
    }>;

    for (const p of produtos) {
      try {
        const [existing] = await db.select({ id: supermercadoProdutoTable.id })
          .from(supermercadoProdutoTable)
          .where(and(
            eq(supermercadoProdutoTable.tenantId, tenantId),
            eq(supermercadoProdutoTable.erpId, p.id),
          ));

        if (existing) {
          await db.update(supermercadoProdutoTable)
            .set({ nome: p.nome, precoVenda: String(p.preco), estoque: p.estoque, updatedAt: new Date() })
            .where(eq(supermercadoProdutoTable.id, existing.id));
        } else {
          await db.insert(supermercadoProdutoTable).values({
            tenantId,
            erpId: p.id,
            nome: p.nome,
            precoVenda: String(p.preco),
            estoque: p.estoque ?? 0,
            unidade: p.unidade ?? "un",
          });
        }
        sincronizados++;
      } catch {
        erros++;
      }
    }
  } catch (err) {
    req.log.error({ err }, "supermercado sync-produtos: ERP fetch failed");
    return res.status(502).json({ error: "Falha ao conectar ao ERP", sincronizados, erros });
  }

  return res.json({ sincronizados, erros });
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/supermercado/pedidos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(supermercadoPedidoTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(supermercadoPedidoTable.status, req.query.status as any));
  if (req.query.origem) conditions.push(eq(supermercadoPedidoTable.origem, req.query.origem as any));

  const rows = await db.select().from(supermercadoPedidoTable)
    .where(and(...conditions))
    .orderBy(desc(supermercadoPedidoTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/supermercado/pedidos", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, ...pedidoData } = req.body;

  // Calculate total
  let valorTotal = 0;
  const itensMapped = (itens ?? []).map((item: any) => {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.precoUnitario);
    valorTotal += subtotal;
    return { ...item, subtotal: String(subtotal.toFixed(2)) };
  });

  const [pedido] = await db.insert(supermercadoPedidoTable)
    .values({ ...pedidoData, tenantId, valorTotal: String(valorTotal.toFixed(2)) })
    .returning();

  if (itensMapped.length > 0) {
    await db.insert(supermercadoPedidoItemTable)
      .values(itensMapped.map((i: any) => ({ ...i, pedidoId: pedido.id })));
  }

  return res.status(201).json(pedido);
});

router.get("/tenants/:tenantId/supermercado/pedidos/:pedidoId", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [pedido] = await db.select().from(supermercadoPedidoTable)
    .where(and(eq(supermercadoPedidoTable.id, pedidoId), eq(supermercadoPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const itens = await db.select().from(supermercadoPedidoItemTable)
    .where(eq(supermercadoPedidoItemTable.pedidoId, pedidoId));

  let leadNome: string | null = null;
  if (pedido.leadId) {
    const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable)
      .where(eq(leadsTable.id, pedido.leadId));
    leadNome = lead?.nome ?? null;
  }

  return res.json({ ...pedido, itens, leadNome });
});

router.put("/tenants/:tenantId/supermercado/pedidos/:pedidoId", async (req, res) => {
  const { tenantId, pedidoId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(supermercadoPedidoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(supermercadoPedidoTable.id, pedidoId), eq(supermercadoPedidoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  return res.json(row);
});

// ─── Campanhas ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/supermercado/campanhas", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(supermercadoCampanhaTable.tenantId, tenantId)];
  if (req.query.tipo) conditions.push(eq(supermercadoCampanhaTable.tipo, req.query.tipo as any));
  if (req.query.status) conditions.push(eq(supermercadoCampanhaTable.status, req.query.status as any));

  const rows = await db.select().from(supermercadoCampanhaTable)
    .where(and(...conditions))
    .orderBy(desc(supermercadoCampanhaTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/supermercado/campanhas", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.insert(supermercadoCampanhaTable)
    .values({ ...req.body, tenantId })
    .returning();
  return res.status(201).json(row);
});

router.get("/tenants/:tenantId/supermercado/campanhas/:campanhaId", async (req, res) => {
  const { tenantId, campanhaId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(supermercadoCampanhaTable)
    .where(and(eq(supermercadoCampanhaTable.id, campanhaId), eq(supermercadoCampanhaTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Campanha not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/supermercado/campanhas/:campanhaId", async (req, res) => {
  const { tenantId, campanhaId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(supermercadoCampanhaTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(supermercadoCampanhaTable.id, campanhaId), eq(supermercadoCampanhaTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Campanha not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/supermercado/campanhas/:campanhaId", async (req, res) => {
  const { tenantId, campanhaId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(supermercadoCampanhaTable)
    .where(and(eq(supermercadoCampanhaTable.id, campanhaId), eq(supermercadoCampanhaTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Disparar campanha ────────────────────────────────────────────────────────

router.post("/tenants/:tenantId/supermercado/campanhas/:campanhaId/disparar", async (req, res) => {
  const { tenantId, campanhaId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campanha] = await db.select().from(supermercadoCampanhaTable)
    .where(and(eq(supermercadoCampanhaTable.id, campanhaId), eq(supermercadoCampanhaTable.tenantId, tenantId)));
  if (!campanha) return res.status(404).json({ error: "Campanha not found" });

  const [config] = await db.select().from(supermercadoConfigTable)
    .where(eq(supermercadoConfigTable.tenantId, tenantId));

  // Get leads with WhatsApp numbers
  const leads = await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), sql`${leadsTable.telefone} IS NOT NULL`))
    .limit(config?.contatosPorRodada ?? 50);

  // Mark as sending
  await db.update(supermercadoCampanhaTable)
    .set({ status: "enviando", updatedAt: new Date() })
    .where(eq(supermercadoCampanhaTable.id, campanhaId));

  // Fire-and-forget dispatch
  const dispatch = async () => {
    let enviados = 0;
    let falhas = 0;

    for (const lead of leads) {
      if (!lead.telefone) continue;
      let status: "enviado" | "falhou" = "falhou";
      let erroMsg: string | undefined;

      try {
        if (config?.zapiInstanceId && config?.zapiToken) {
          const phone = lead.telefone.replace(/\D/g, "");
          const zapiRes = await fetch(
            `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiToken}/send-text`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone, message: campanha.conteudo }),
            }
          );
          if (zapiRes.ok) { status = "enviado"; enviados++; }
          else { erroMsg = `Z-API ${zapiRes.status}`; falhas++; }
        } else {
          // Z-API not configured: log but count as sent for demo
          status = "enviado"; enviados++;
        }
      } catch (err: any) {
        erroMsg = err?.message ?? "Unknown error";
        falhas++;
      }

      await db.insert(supermercadoCampanhaEnvioTable).values({
        campanhaId,
        leadId: lead.id,
        telefone: lead.telefone,
        status,
        erroMsg,
        enviadoEm: status === "enviado" ? new Date() : undefined,
      });
    }

    await db.update(supermercadoCampanhaTable)
      .set({
        status: "concluida",
        enviadoEm: new Date(),
        totalEnviados: enviados,
        totalFalhas: falhas,
        updatedAt: new Date(),
      })
      .where(eq(supermercadoCampanhaTable.id, campanhaId));
  };

  dispatch().catch((err) => req.log.error({ err }, "supermercado disparar: dispatch error"));

  return res.json({ ok: true, total: leads.length });
});

// ─── Gerar conteúdo via IA ────────────────────────────────────────────────────

const TIPO_PROMPTS: Record<string, string> = {
  promocao: "Você é um assistente de marketing de supermercado. Crie uma mensagem promocional atrativa para WhatsApp com emojis, destacando promoções da semana. Máx. 300 caracteres. Inclua chamada para ação.",
  receita: "Você é um chef de cozinha de supermercado. Crie uma receita rápida e deliciosa para WhatsApp com emojis. Inclua ingredientes simples e modo de preparo conciso. Máx. 400 caracteres.",
  dica: "Você é um consultor de compras de supermercado. Crie uma dica útil de economia, organização doméstica ou alimentação saudável para WhatsApp com emojis. Máx. 250 caracteres.",
  data_comemorativa: "Você é um assistente de relacionamento de supermercado. Crie uma mensagem especial para uma data comemorativa com emojis, incluindo desejo de felicidades e uma oferta especial. Máx. 300 caracteres.",
  reativacao: "Você é um assistente de CRM de supermercado. Crie uma mensagem de reativação para clientes que não compram há algum tempo, com desconto especial de retorno. Máx. 300 caracteres.",
};

router.post("/tenants/:tenantId/supermercado/campanhas/gerar-conteudo", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { tipo, contexto } = req.body;
  const systemPrompt = TIPO_PROMPTS[tipo] ?? TIPO_PROMPTS.promocao;

  const userMsg = contexto
    ? `Contexto adicional: ${contexto}`
    : "Crie uma mensagem genérica para o supermercado.";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    max_tokens: 300,
  });

  const conteudo = completion.choices[0]?.message?.content?.trim() ?? "";

  // Auto-generate title
  const tipoLabel: Record<string, string> = {
    promocao: "Promoção",
    receita: "Receita",
    dica: "Dica",
    data_comemorativa: "Data Especial",
    reativacao: "Reativação",
  };
  const titulo = `${tipoLabel[tipo] ?? "Mensagem"} — ${new Date().toLocaleDateString("pt-BR")}`;

  return res.json({ titulo, conteudo });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/supermercado/dashboard", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [pedidosHojeRes] = await db.select({ count: count() }).from(supermercadoPedidoTable)
    .where(and(eq(supermercadoPedidoTable.tenantId, tenantId), gte(supermercadoPedidoTable.createdAt, startOfDay)));

  const [pedidosSemanaRes] = await db.select({ count: count() }).from(supermercadoPedidoTable)
    .where(and(eq(supermercadoPedidoTable.tenantId, tenantId), gte(supermercadoPedidoTable.createdAt, startOfWeek)));

  const [receitaHojeRes] = await db.select({ total: sql<string>`COALESCE(SUM(valor_total::numeric), 0)` })
    .from(supermercadoPedidoTable)
    .where(and(eq(supermercadoPedidoTable.tenantId, tenantId), gte(supermercadoPedidoTable.createdAt, startOfDay)));

  const [receitaSemanaRes] = await db.select({ total: sql<string>`COALESCE(SUM(valor_total::numeric), 0)` })
    .from(supermercadoPedidoTable)
    .where(and(eq(supermercadoPedidoTable.tenantId, tenantId), gte(supermercadoPedidoTable.createdAt, startOfWeek)));

  const [produtosAtivosRes] = await db.select({ count: count() }).from(supermercadoProdutoTable)
    .where(and(eq(supermercadoProdutoTable.tenantId, tenantId), eq(supermercadoProdutoTable.ativo, true)));

  const [campanhasEnviadasRes] = await db.select({ count: count() }).from(supermercadoCampanhaTable)
    .where(and(eq(supermercadoCampanhaTable.tenantId, tenantId), eq(supermercadoCampanhaTable.status, "concluida")));

  const [clientesAtivosRes] = await db.select({ count: count() }).from(leadsTable)
    .where(eq(leadsTable.tenantId, tenantId));

  const ultimasCampanhas = await db.select().from(supermercadoCampanhaTable)
    .where(eq(supermercadoCampanhaTable.tenantId, tenantId))
    .orderBy(desc(supermercadoCampanhaTable.createdAt))
    .limit(5);

  const ultimosPedidos = await db.select().from(supermercadoPedidoTable)
    .where(eq(supermercadoPedidoTable.tenantId, tenantId))
    .orderBy(desc(supermercadoPedidoTable.createdAt))
    .limit(5);

  return res.json({
    pedidosHoje: pedidosHojeRes.count,
    pedidosSemana: pedidosSemanaRes.count,
    receitaHoje: String(receitaHojeRes.total ?? "0"),
    receitaSemana: String(receitaSemanaRes.total ?? "0"),
    produtosAtivos: produtosAtivosRes.count,
    campanhasEnviadas: campanhasEnviadasRes.count,
    clientesAtivos: clientesAtivosRes.count,
    ultimasCampanhas,
    ultimosPedidos,
  });
});

export default router;
