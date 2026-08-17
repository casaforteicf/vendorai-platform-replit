import { Router, type IRouter } from "express";
import { and, eq, desc, ilike } from "drizzle-orm";
import {
  db,
  farmaciaProdutoTable,
  farmaciaBulasTable,
  farmaciaPedidoTable,
  farmaciaPedidoItemTable,
  leadsTable,
  receitasMedicasTable,
  insertReceitaMedicaSchema,
  updateReceitaMedicaSchema,
  produtosCatalogoTable,
  categoriasProdutoTable,
  tenantsTable,
  knowledgeBaseTable,
  type FarmaciaProduto,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { searchBulaAnvisa, downloadBulaPdf } from "../lib/anvisaBulario.js";
import { extractTextFromBuffer } from "../lib/document-extraction.js";
import { z } from "zod/v4";

const BULAS_BASE = [
  ["Paracetamol", "Dor e febre"], ["Dipirona", "Dor e febre"], ["Ibuprofeno", "Dor, enxaqueca e cólica menstrual"],
  ["Diclofenaco dietilamônio", "Dor muscular, articular e contusão"], ["Cloreto de sódio 0,9%", "Lavagem nasal e ocular"],
  ["Oximetazolina", "Congestão nasal"], ["Loratadina", "Alergia, coriza e urticária"], ["Cetirizina", "Alergia, coriza e urticária"],
  ["Dextrometorfano", "Tosse seca"], ["Acetilcisteína", "Tosse com catarro"], ["Ambroxol", "Tosse com catarro"],
  ["Hedera helix", "Tosse com catarro"], ["Benzidamina", "Garganta irritada"], ["Carboximetilcelulose", "Olho seco"],
  ["Hipromelose", "Olho seco"], ["Hialuronato de sódio", "Olho seco"],
  ["Hidróxido de alumínio + hidróxido de magnésio", "Azia e má digestão"], ["Carbonato de cálcio", "Azia"],
  ["Alginato de sódio", "Azia e refluxo"], ["Simeticona", "Gases"], ["Butilbrometo de escopolamina", "Cólica intestinal"],
  ["Dimenidrinato", "Enjoo de viagem"], ["Sais para reidratação oral", "Vômito, diarreia e desidratação"],
  ["Racecadotrila", "Diarreia"], ["Loperamida", "Diarreia"], ["Psyllium", "Prisão de ventre"],
  ["Lactulose", "Prisão de ventre"], ["Macrogol", "Prisão de ventre"], ["Lactase", "Intolerância à lactose"],
  ["Albendazol", "Suspeita de vermes"], ["Mebendazol", "Suspeita de vermes"], ["Clorexidina aquosa", "Cortes e escoriações"],
  ["Petrolato", "Queimadura superficial e pele rachada"], ["Dexpantenol", "Queimadura solar e pele rachada"],
  ["Óxido de zinco", "Assadura"], ["Calamina", "Brotoeja e picada de inseto"], ["Hidrocortisona tópica", "Dermatite de contato"],
  ["Ureia", "Pele ressecada"], ["Peróxido de benzoíla", "Acne leve"], ["Clotrimazol", "Micose e candidíase"],
  ["Miconazol", "Micose e candidíase"], ["Terbinafina", "Micose e frieira"], ["Amorolfina", "Micose de unha"],
  ["Ciclopirox", "Micose de unha"], ["Cetoconazol", "Caspa"], ["Piritionato de zinco", "Caspa"],
  ["Sulfeto de selênio", "Caspa"], ["Ácido hialurônico", "Afta"], ["Digluconato de clorexidina", "Gengiva irritada"],
  ["Nitrato de potássio", "Sensibilidade dentária"], ["Fluoreto estanoso", "Sensibilidade dentária"],
  ["Aciclovir tópico", "Herpes labial recorrente"], ["Levonorgestrel", "Contracepção de emergência"],
  ["Melatonina", "Insônia ocasional"],
] as const;

const router: IRouter = Router();
export const farmaciaSyncRouter: IRouter = Router();

const farmaciaSyncItemSchema = z.object({
  erpId: z.string().min(1).max(120),
  nome: z.string().min(1).max(300),
  principioAtivo: z.string().max(300).optional().nullable(),
  descricao: z.string().optional().nullable(),
  categoria: z.enum([
    "medicamento_generico", "medicamento_referencia", "medicamento_similar",
    "perfumaria", "higiene_pessoal", "dermocosmeticos", "infantil",
    "ortopedicos", "suplementos", "outros",
  ]).default("outros"),
  exigeReceita: z.boolean().default(false),
  unidade: z.string().min(1).max(30).default("un"),
  precoVenda: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
  precoPromocional: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional().nullable(),
  estoque: z.number().int().nonnegative().default(0),
  imagemUrl: z.string().url().optional().nullable(),
  ativo: z.boolean().default(true),
  vendeNoPracaAi: z.boolean().default(false),
  destaqueWhatsapp: z.boolean().default(false),
});

const farmaciaSyncSchema = z.object({
  items: z.array(farmaciaSyncItemSchema).min(1).max(1000),
});

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Express.Request, tenantId: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || tid(req) === tenantId;
}

async function canAccessPharmacyLeaflets(req: Express.Request, tenantId: string) {
  if (!canAccess(req, tenantId)) return false;
  if ((req as any).user?.platformRole === "super_admin") return true;
  const [tenant] = await db.select({ vertical: tenantsTable.vertical })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  return Boolean(tenant?.vertical?.toLocaleLowerCase("pt-BR").includes("farm"));
}

function normalizePosologyPayload(body: any) {
  const payload = { ...body };
  if (!payload.posologiaAprovada) {
    payload.posologiaAprovada = false;
    payload.posologiaRevisadaEm = null;
    return payload;
  }

  const p = payload.posologia ?? {};
  const required = [
    [payload.principioAtivo, "princípio ativo"],
    [p.concentracao, "concentração"],
    [p.formaFarmaceutica, "forma farmacêutica"],
    [p.viaAdministracao, "via de administração"],
    [p.faixaEtaria, "faixa etária"],
    [p.dosePorAdministracao, "dose por administração"],
    [p.intervaloMinimo, "intervalo mínimo"],
    [p.doseMaximaDiaria, "dose máxima diária"],
    [payload.posologiaFonteUrl, "fonte oficial da bula"],
    [payload.posologiaRevisadaPor, "farmacêutico responsável"],
  ];
  const missing = required.filter(([value]) => !String(value ?? "").trim()).map(([, label]) => label);
  if (missing.length) {
    const error = new Error(`Para aprovar a posologia, preencha: ${missing.join(", ")}`) as Error & { status: number };
    error.status = 400;
    throw error;
  }
  payload.posologiaRevisadaEm = new Date();
  return payload;
}

/** Sincroniza produto de farmácia com o catálogo genérico (Praça.ai/Scout). */
async function syncFarmaciaProdutoToProdutoCatalogo(tenantId: string, produto: FarmaciaProduto): Promise<void> {
  let [categoria] = await db.select().from(categoriasProdutoTable)
    .where(and(eq(categoriasProdutoTable.tenantId, tenantId), eq(categoriasProdutoTable.nome, "Farmácia")));
  if (!categoria) {
    [categoria] = await db.insert(categoriasProdutoTable).values({ tenantId, nome: "Farmácia" }).returning();
  }

  const payload = {
    tenantId,
    nome: produto.nome,
    descricao: produto.descricao,
    categoriaId: categoria!.id,
    sku: produto.erpId ?? undefined,
    precoBase: String(produto.precoPromocional ?? produto.precoVenda),
    imagemUrl: produto.imagemUrl,
    estoqueQuantidade: produto.estoque,
    ativo: produto.ativo && produto.estoque > 0,
  };

  if (produto.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set(payload as any).where(eq(produtosCatalogoTable.id, produto.produtoCatalogoId));
  } else {
    const [criado] = await db.insert(produtosCatalogoTable).values(payload as any).returning();
    await db.update(farmaciaProdutoTable).set({ produtoCatalogoId: criado!.id }).where(eq(farmaciaProdutoTable.id, produto.id));
  }
}

async function upsertFarmaciaProdutos(tenantId: string, items: z.infer<typeof farmaciaSyncItemSchema>[]) {
  let created = 0;
  let updated = 0;
  const errors: Array<{ erpId: string; error: string }> = [];

  for (const item of items) {
    try {
      const [existing] = await db.select().from(farmaciaProdutoTable)
        .where(and(eq(farmaciaProdutoTable.tenantId, tenantId), eq(farmaciaProdutoTable.erpId, item.erpId)))
        .limit(1);
      const values = {
        ...item,
        precoVenda: String(item.precoVenda),
        precoPromocional: item.precoPromocional == null ? null : String(item.precoPromocional),
        updatedAt: new Date(),
      };
      let produto: FarmaciaProduto;
      if (existing) {
        [produto] = await db.update(farmaciaProdutoTable)
          .set(values)
          .where(eq(farmaciaProdutoTable.id, existing.id))
          .returning();
        updated++;
      } else {
        [produto] = await db.insert(farmaciaProdutoTable)
          .values({ ...values, tenantId })
          .returning();
        created++;
      }
      await syncFarmaciaProdutoToProdutoCatalogo(tenantId, produto!);
    } catch (error) {
      errors.push({ erpId: item.erpId, error: error instanceof Error ? error.message : "Erro desconhecido" });
    }
  }
  return { created, updated, failed: errors.length, errors };
}

// Integração de ERP/POS da farmácia. Fica antes do middleware JWT e usa a
// mesma chave de integração gerada em Configurações → Integrações.
farmaciaSyncRouter.post("/tenants/:tenantId/farmacia/produtos/sync", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) return res.status(401).json({ error: "Informe x-api-key" });
  const [tenant] = await db.select({ apiKeyEstoque: tenantsTable.apiKeyEstoque, vertical: tenantsTable.vertical })
    .from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant || tenant.apiKeyEstoque !== apiKey) return res.status(401).json({ error: "API key inválida" });
  if (!tenant.vertical?.toLocaleLowerCase("pt-BR").includes("farm")) {
    return res.status(403).json({ error: "Endpoint disponível somente para a vertical Farmácia" });
  }
  const parsed = farmaciaSyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  return res.json(await upsertFarmaciaProdutos(tenantId, parsed.data.items));
});

// ─── Produtos ─────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/produtos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { categoria, destaque, q } = req.query;
  const conditions = [eq(farmaciaProdutoTable.tenantId, tenantId)];

  if (categoria) conditions.push(eq(farmaciaProdutoTable.categoria, categoria as any));
  if (destaque === "true") conditions.push(eq(farmaciaProdutoTable.destaqueWhatsapp, true));
  if (q) conditions.push(ilike(farmaciaProdutoTable.nome, `%${q}%`));

  const rows = await db.select().from(farmaciaProdutoTable)
    .where(and(...conditions))
    .orderBy(farmaciaProdutoTable.nome);
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/produtos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  let payload;
  try { payload = normalizePosologyPayload(req.body); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  const [row] = await db.insert(farmaciaProdutoTable).values({ ...payload, tenantId }).returning();
  await syncFarmaciaProdutoToProdutoCatalogo(tenantId, row);
  return res.status(201).json(row);
});

router.post("/tenants/:tenantId/farmacia/produtos/import", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = farmaciaSyncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  return res.json(await upsertFarmaciaProdutos(tenantId, parsed.data.items));
});

router.get("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.select().from(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)));
  if (!row) return res.status(404).json({ error: "Produto not found" });
  return res.json(row);
});

router.put("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  let payload;
  try { payload = normalizePosologyPayload(req.body); }
  catch (error: any) { return res.status(error.status ?? 400).json({ error: error.message }); }
  const [row] = await db.update(farmaciaProdutoTable)
    .set({ ...payload, updatedAt: new Date() })
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Produto not found" });
  await syncFarmaciaProdutoToProdutoCatalogo(tenantId, row);
  return res.json(row);
});

router.delete("/tenants/:tenantId/farmacia/produtos/:produtoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const produtoId = req.params.produtoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db.select({ produtoCatalogoId: farmaciaProdutoTable.produtoCatalogoId })
    .from(farmaciaProdutoTable).where(eq(farmaciaProdutoTable.id, produtoId));
  if (existing?.produtoCatalogoId) {
    await db.update(produtosCatalogoTable).set({ ativo: false }).where(eq(produtosCatalogoTable.id, existing.produtoCatalogoId));
  }

  await db.delete(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, produtoId), eq(farmaciaProdutoTable.tenantId, tenantId)));
  return res.status(204).send();
});

// ─── Biblioteca de bulas para revisão ───────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/bulas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!await canAccessPharmacyLeaflets(req, tenantId)) return res.status(403).json({ error: "Bulas disponíveis somente para a vertical Farmácia." });
  const conditions = [eq(farmaciaBulasTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(farmaciaBulasTable.status, req.query.status as any));
  const rows = await db.select().from(farmaciaBulasTable)
    .where(and(...conditions)).orderBy(farmaciaBulasTable.principioAtivo);
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/bulas/importar-base", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!await canAccessPharmacyLeaflets(req, tenantId)) return res.status(403).json({ error: "Bulas disponíveis somente para a vertical Farmácia." });
  await db.insert(farmaciaBulasTable).values(BULAS_BASE.map(([principioAtivo, sintomasReferencia]) => ({
    tenantId, principioAtivo, sintomasReferencia, status: "pendente" as const,
  }))).onConflictDoNothing();
  const rows = await db.select().from(farmaciaBulasTable)
    .where(eq(farmaciaBulasTable.tenantId, tenantId));
  return res.status(201).json({ imported: rows.length });
});

router.put("/tenants/:tenantId/farmacia/bulas/:bulaId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!await canAccessPharmacyLeaflets(req, tenantId)) return res.status(403).json({ error: "Bulas disponíveis somente para a vertical Farmácia." });
  const {
    principioAtivo,
    sintomasReferencia,
    tratamentoInicial,
    criteriosEncaminhamento,
    posologia,
    fonteUrl,
    observacoesRevisao,
  } = req.body;
  const [row] = await db.update(farmaciaBulasTable).set({
    principioAtivo,
    sintomasReferencia,
    tratamentoInicial,
    criteriosEncaminhamento,
    posologia,
    fonteUrl,
    observacoesRevisao,
    status: "pendente",
    responsavelNome: null,
    responsavelRegistro: null,
    revisadaEm: null,
    updatedAt: new Date(),
  }).where(and(eq(farmaciaBulasTable.id, req.params.bulaId as string), eq(farmaciaBulasTable.tenantId, tenantId))).returning();
  if (!row) return res.status(404).json({ error: "Bula não encontrada" });
  return res.json(row);
});

router.post("/tenants/:tenantId/farmacia/bulas/:bulaId/aprovar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!await canAccessPharmacyLeaflets(req, tenantId)) return res.status(403).json({ error: "Bulas disponíveis somente para a vertical Farmácia." });
  const { responsavelNome, responsavelRegistro, fonteUrl, posologia } = req.body;
  const required = [responsavelNome, responsavelRegistro, fonteUrl, posologia?.concentracao,
    posologia?.formaFarmaceutica, posologia?.viaAdministracao, posologia?.faixaEtaria,
    posologia?.dosePorAdministracao, posologia?.intervaloMinimo, posologia?.doseMaximaDiaria];
  if (required.some((value) => !String(value ?? "").trim())) {
    return res.status(400).json({ error: "Complete a apresentação, posologia, fonte oficial, nome e registro do farmacêutico." });
  }
  const [row] = await db.update(farmaciaBulasTable).set({
    posologia, fonteUrl, responsavelNome, responsavelRegistro,
    status: "aprovada", revisadaEm: new Date(), updatedAt: new Date(),
  }).where(and(eq(farmaciaBulasTable.id, req.params.bulaId as string), eq(farmaciaBulasTable.tenantId, tenantId))).returning();
  if (!row) return res.status(404).json({ error: "Bula não encontrada" });
  return res.json(row);
});

// ─── Pedidos ──────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(farmaciaPedidoTable.tenantId, tenantId)];
  if (req.query.status) conditions.push(eq(farmaciaPedidoTable.status, req.query.status as any));
  if (req.query.origem) conditions.push(eq(farmaciaPedidoTable.origem, req.query.origem as any));

  const rows = await db.select().from(farmaciaPedidoTable)
    .where(and(...conditions))
    .orderBy(desc(farmaciaPedidoTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/pedidos", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { itens, receitaUrl, receitaMedicaId, ...pedidoData } = req.body;

  let valorTotal = 0;
  let temItemControlado = false;
  const itensMapped = (itens ?? []).map((item: any) => {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.precoUnitario);
    valorTotal += subtotal;
    if (item.exigeReceita) temItemControlado = true;
    return { ...item, subtotal: String(subtotal.toFixed(2)) };
  });

  // Receita estruturada (validade/tipo/médico) também satisfaz a
  // exigência — precisa estar ativa, não vencida, e ser do mesmo cliente.
  let receitaValida = false;
  if (receitaMedicaId) {
    const [receita] = await db.select().from(receitasMedicasTable)
      .where(and(eq(receitasMedicasTable.id, receitaMedicaId), eq(receitasMedicasTable.tenantId, tenantId)));
    receitaValida = !!receita
      && receita.status === "ativa"
      && receita.clienteId === pedidoData.leadId
      && receita.dataValidade.getTime() >= Date.now();
  }

  // Validação real do setor: se tem item controlado e não veio nem foto
  // anexada nem receita estruturada válida, o pedido nasce preso em
  // 'aguardando_receita' — não confirma sozinho, mesmo que o resto do
  // pedido esteja completo.
  const status = temItemControlado && !receitaUrl && !receitaValida ? "aguardando_receita" : "aguardando_confirmacao";

  const [pedido] = await db.insert(farmaciaPedidoTable)
    .values({
      ...pedidoData,
      tenantId,
      valorTotal: String(valorTotal.toFixed(2)),
      temItemControlado,
      receitaUrl: receitaUrl ?? null,
      receitaMedicaId: receitaValida ? receitaMedicaId : null,
      status,
    })
    .returning();

  if (itensMapped.length > 0) {
    await db.insert(farmaciaPedidoItemTable)
      .values(itensMapped.map((i: any) => ({ ...i, pedidoId: pedido.id })));
  }

  // Receita usada num pedido confirmado passa pra "utilizada" — mesma
  // ideia de "Marcar utilizada" que já existia na tela, só que automático.
  if (receitaValida) {
    await db.update(receitasMedicasTable).set({ status: "utilizada", updatedAt: new Date() }).where(eq(receitasMedicasTable.id, receitaMedicaId));
  }

  return res.status(201).json(pedido);
});

router.get("/tenants/:tenantId/farmacia/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [pedido] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  const itens = await db.select().from(farmaciaPedidoItemTable)
    .where(eq(farmaciaPedidoItemTable.pedidoId, pedidoId));

  let leadNome: string | null = null;
  if (pedido.leadId) {
    const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable)
      .where(eq(leadsTable.id, pedido.leadId));
    leadNome = lead?.nome ?? null;
  }

  return res.json({ ...pedido, itens, leadNome });
});

router.put("/tenants/:tenantId/farmacia/pedidos/:pedidoId", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db.update(farmaciaPedidoTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Pedido not found" });
  return res.json(row);
});

// Anexar receita — destrava pedido preso em 'aguardando_receita'.
router.post("/tenants/:tenantId/farmacia/pedidos/:pedidoId/anexar-receita", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const pedidoId = req.params.pedidoId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { receitaUrl, receitaMedicaId } = req.body as { receitaUrl?: string; receitaMedicaId?: string };
  if (!receitaUrl && !receitaMedicaId) return res.status(422).json({ error: "receitaUrl ou receitaMedicaId é obrigatório" });

  const [pedido] = await db.select().from(farmaciaPedidoTable)
    .where(and(eq(farmaciaPedidoTable.id, pedidoId), eq(farmaciaPedidoTable.tenantId, tenantId)));
  if (!pedido) return res.status(404).json({ error: "Pedido not found" });

  let receitaValida = false;
  if (receitaMedicaId) {
    const [receita] = await db.select().from(receitasMedicasTable)
      .where(and(eq(receitasMedicasTable.id, receitaMedicaId), eq(receitasMedicasTable.tenantId, tenantId)));
    receitaValida = !!receita
      && receita.status === "ativa"
      && receita.clienteId === pedido.leadId
      && receita.dataValidade.getTime() >= Date.now();
    if (!receitaValida) return res.status(422).json({ error: "Receita inválida, vencida ou de outro cliente." });
  }

  const novoStatus = pedido.status === "aguardando_receita" ? "aguardando_confirmacao" : pedido.status;

  const [row] = await db.update(farmaciaPedidoTable)
    .set({
      ...(receitaUrl ? { receitaUrl } : {}),
      ...(receitaValida ? { receitaMedicaId } : {}),
      status: novoStatus,
      updatedAt: new Date(),
    })
    .where(eq(farmaciaPedidoTable.id, pedidoId))
    .returning();

  if (receitaValida) {
    await db.update(receitasMedicasTable).set({ status: "utilizada", updatedAt: new Date() }).where(eq(receitasMedicasTable.id, receitaMedicaId!));
  }

  return res.json(row);
});

// ─── Receitas médicas ───────────────────────────────────────────────────────

router.get("/tenants/:tenantId/farmacia/receitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const conditions = [eq(receitasMedicasTable.tenantId, tenantId)];
  if (req.query.clienteId) conditions.push(eq(receitasMedicasTable.clienteId, String(req.query.clienteId)));
  if (req.query.status) conditions.push(eq(receitasMedicasTable.status, req.query.status as any));

  const rows = await db.select().from(receitasMedicasTable)
    .where(and(...conditions))
    .orderBy(desc(receitasMedicasTable.dataValidade));
  return res.json(rows);
});

router.post("/tenants/:tenantId/farmacia/receitas", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertReceitaMedicaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.insert(receitasMedicasTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.patch("/farmacia/receitas/:id", async (req, res) => {
  const [existing] = await db.select({ tenantId: receitasMedicasTable.tenantId }).from(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Receita not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = updateReceitaMedicaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.update(receitasMedicasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(receitasMedicasTable.id, req.params.id as string))
    .returning();
  return res.json(row);
});

router.delete("/farmacia/receitas/:id", async (req, res) => {
  const [existing] = await db.select({ tenantId: receitasMedicasTable.tenantId }).from(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  if (!existing) return res.status(404).json({ error: "Receita not found" });
  if (!canAccess(req, existing.tenantId)) return res.status(403).json({ error: "Forbidden" });

  await db.delete(receitasMedicasTable).where(eq(receitasMedicasTable.id, req.params.id as string));
  return res.status(204).send();
});

// ─── Sincronização de bula (ANVISA Bulário) ───────────────────────────────────
//
// Busca a bula do produto no Bulário Eletrônico da ANVISA, extrai o texto do
// PDF e salva como item inativo da Base de Conhecimento. A referência também
// entra na fila de revisão; nada é vinculado ao agente antes da aprovação do
// farmacêutico responsável.
//
// Usa um endpoint não-documentado da ANVISA (ver lib/anvisaBulario.ts) — não
// rodar em lote sem antes confirmar que funciona pra 1-2 produtos reais.
router.post("/tenants/:tenantId/farmacia/produtos/:id/sincronizar-bula", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!await canAccessPharmacyLeaflets(req, tenantId)) return res.status(403).json({ error: "Bulas disponíveis somente para a vertical Farmácia." });

  const [produto] = await db.select().from(farmaciaProdutoTable)
    .where(and(eq(farmaciaProdutoTable.id, req.params.id as string), eq(farmaciaProdutoTable.tenantId, tenantId)));
  if (!produto) return res.status(404).json({ error: "Produto not found" });

  const resultados = await searchBulaAnvisa(produto.nome, logger);
  if (resultados === null) {
    return res.status(502).json({
      error: "Falha ao consultar o Bulário da ANVISA — ver logs do servidor para detalhes (endpoint não-oficial, formato pode ter mudado)",
    });
  }
  if (resultados.length === 0) {
    return res.status(404).json({ error: `Nenhuma bula encontrada na ANVISA para "${produto.nome}"` });
  }

  const bula = resultados[0]!;
  const pdfBuffer = await downloadBulaPdf(bula.id, logger);
  if (!pdfBuffer) {
    return res.status(502).json({ error: "Bula encontrada, mas o download do PDF falhou — ver logs do servidor" });
  }

  let texto: string;
  try {
    texto = await extractTextFromBuffer(pdfBuffer, "application/pdf", `bula-${produto.nome}.pdf`, tenantId);
  } catch (err) {
    logger.error({ err, produtoId: produto.id }, "farmacia: falha ao extrair texto da bula");
    return res.status(500).json({ error: "Falha ao extrair texto do PDF da bula" });
  }

  if (!texto?.trim()) {
    return res.status(502).json({ error: "PDF da bula baixado, mas sem texto extraível (pode ser um PDF escaneado/imagem)" });
  }

  const titulo = `Bula — ${bula.nomeProduto}`;

  // Upsert: se já existe um item de Base de Conhecimento pra esse produto
  // (mesmo título, mesmo tenant), atualiza em vez de duplicar.
  const [existingItem] = await db.select({ id: knowledgeBaseTable.id }).from(knowledgeBaseTable)
    .where(and(eq(knowledgeBaseTable.tenantId, tenantId), eq(knowledgeBaseTable.titulo, titulo)));

  let knowledgeItemId: string;
  if (existingItem) {
    await db.update(knowledgeBaseTable)
      .set({ conteudo: texto, ativo: false, updatedAt: new Date() })
      .where(eq(knowledgeBaseTable.id, existingItem.id));
    knowledgeItemId = existingItem.id;
  } else {
    const [criado] = await db.insert(knowledgeBaseTable).values({
      tenantId,
      titulo,
      conteudo: texto,
      categoria: "Bulário ANVISA",
      tags: ["bulario", "anvisa", "farmacia"],
      ativo: false,
    }).returning({ id: knowledgeBaseTable.id });
    knowledgeItemId = criado!.id;
  }

  const principioAtivo = produto.principioAtivo?.trim() || produto.nome;
  const fonteUrl = `https://consultas.anvisa.gov.br/api/consulta/downloadPDF/${encodeURIComponent(bula.id)}`;
  await db.insert(farmaciaBulasTable).values({
    tenantId,
    principioAtivo,
    sintomasReferencia: `Bula ANVISA encontrada para ${bula.nomeProduto}`,
    fonteUrl,
    status: "pendente",
  }).onConflictDoUpdate({
    target: [farmaciaBulasTable.tenantId, farmaciaBulasTable.principioAtivo],
    set: {
      fonteUrl,
      status: "pendente",
      responsavelNome: null,
      responsavelRegistro: null,
      revisadaEm: null,
      updatedAt: new Date(),
    },
  });

  logger.info({ tenantId, produtoId: produto.id, knowledgeItemId }, "farmacia: bula importada como pendente de revisão");
  return res.json({ ok: true, status: "pendente", knowledgeItemId, bulaEncontrada: bula.nomeProduto, tamanhoTexto: texto.length });
});

export default router;
