import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  propostasTable,
  produtosCatalogoTable,
  composicoesTable,
  categoriasProdutoTable,
  propostaTemplatesTable,
  businessProfilesTable,
  insertPropostaSchema,
  updatePropostaSchema,
  tenantsTable,
  dealsTable,
  leadsTable,
  type PropostaItem,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { renderOrcamentoPdf, generateProposalPDF } from "../lib/proposal-engine.js";
import { calcularOrcamentoProdutoArea, ErroCalculoOrcamento, type ProdutoCalculo, type TipoCalculo } from "../lib/calculoOrcamentoM2.js";
import { resolverECalcularOrcamento, ErroResolucaoOrcamento } from "../lib/calculoOrcamentoM2Resolver.js";
import { buildProposalProductContext, proposalProductPromptRules } from "../lib/proposal-catalog-context.js";
const router: IRouter = Router();

// ── Proposal number generation ────────────────────────────────────────────────
function normalizarItensExecucao(itens: PropostaItem[]): PropostaItem[] {
  return itens.map((item, index) => ({
    ...item,
    ordemExecucao: item.ordemExecucao ?? index + 1,
    statusExecucao: item.statusExecucao ?? "pendente",
  }));
}

async function generateNumero(tenantId: string): Promise<string> {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const datePart =
    String(now.getFullYear()) +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate());
  const timePart = pad2(now.getHours()) + pad2(now.getMinutes());
  const prefix = `ORC-${datePart}-${timePart}`;

  // Count proposals created today for this tenant to get sequence number
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(propostasTable)
    .where(
      and(
        eq(propostasTable.tenantId, tenantId),
        sql`${propostasTable.createdAt} >= ${startOfDay}`
      )
    );
  const seq = ((result[0]?.count ?? 0) + 1).toString().padStart(3, "0");
  return `${prefix}-${seq}`;
}

router.post("/propostas", async (req, res) => {
  const parsed = insertPropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const numero = await generateNumero(parsed.data.tenantId);

  const itensNormalizados = normalizarItensExecucao((parsed.data.itens ?? []) as PropostaItem[]);

  const [proposta] = await db
    .insert(propostasTable)
    .values({ ...parsed.data, itens: itensNormalizados, numero })
    .returning();
  res.status(201).json(proposta);
});

router.get("/tenants/:tenantId/propostas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { leadId, dealId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(propostasTable.tenantId, tenantId)];
  if (leadId) conditions.push(eq(propostasTable.leadId, leadId));
  if (dealId) conditions.push(eq(propostasTable.dealId, dealId));

  let propostas = await db
    .select()
    .from(propostasTable)
    .where(and(...conditions))
    .orderBy(propostasTable.createdAt);

  // Recompõe dados legados: havia negócios que chegaram à etapa Orçamento
  // antes da criação obrigatória do registro em propostas. Ao consultar os
  // orçamentos do lead, recuperamos o negócio mais recente nessa etapa e
  // materializamos um rascunho único, vinculado ao lead e ao deal.
  if (leadId && !dealId && propostas.length === 0) {
    const [legacyDeal] = await db
      .select()
      .from(dealsTable)
      .where(and(
        eq(dealsTable.tenantId, tenantId),
        eq(dealsTable.leadId, leadId),
        eq(dealsTable.etapa, "proposta"),
      ))
      .orderBy(desc(dealsTable.createdAt))
      .limit(1);

    if (legacyDeal) {
      const numero = await generateNumero(tenantId);
      const [recovered] = await db
        .insert(propostasTable)
        .values({
          tenantId,
          leadId,
          dealId: legacyDeal.id,
          titulo: `Orçamento — ${legacyDeal.titulo}`,
          itens: legacyDeal.valor
            ? [{
                nome: "Valor comercial do negócio",
                descricao: "Valor recuperado da oportunidade comercial na pipeline.",
                quantidade: 1,
                valorUnitario: Number(legacyDeal.valor),
                unidade: "un",
                ordemExecucao: 1,
                statusExecucao: "pendente",
              }]
            : [],
          valorTotal: legacyDeal.valor ? String(legacyDeal.valor) : null,
          status: "rascunho",
          numero,
          autoGenerated: true,
          observacoes: "Orçamento recuperado automaticamente a partir de um negócio legado já na etapa Orçamento.",
        })
        .returning();

      if (recovered) propostas = [recovered];
    }
  }

  res.json(propostas);
});

router.get("/propostas/:id", async (req, res) => {
  let [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Orçamentos recuperados anteriormente podiam existir sem itens e até com
  // valorTotal zerado, enquanto o negócio na pipeline já possuía valor. Repara
  // os dois lados usando o valor atual do deal sem criar outro orçamento.
  const itensAtuais = (proposta.itens ?? []) as PropostaItem[];
  if (
    itensAtuais.length === 0
    && proposta.dealId
    && proposta.autoGenerated
  ) {
    const [dealAtual] = await db
      .select({ valor: dealsTable.valor })
      .from(dealsTable)
      .where(and(
        eq(dealsTable.id, proposta.dealId),
        eq(dealsTable.tenantId, proposta.tenantId),
      ))
      .limit(1);

    const valorProposta = Number(proposta.valorTotal ?? 0);
    const valorDeal = Number(dealAtual?.valor ?? 0);
    const valor = valorProposta > 0 ? valorProposta : valorDeal;

    if (Number.isFinite(valor) && valor > 0) {
      const [repaired] = await db
        .update(propostasTable)
        .set({
          itens: [{
            nome: "Valor comercial do negócio",
            descricao: "Valor recuperado da oportunidade comercial na pipeline.",
            quantidade: 1,
            valorUnitario: valor,
            unidade: "un",
            ordemExecucao: 1,
            statusExecucao: "pendente",
          }],
          valorTotal: valor.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(propostasTable.id, proposta.id))
        .returning();
      if (repaired) proposta = repaired;
    }
  }

  res.json(proposta);
});

// ── GET /propostas/:id/pdf — capa + tabela A4 ─────────────────────────────
router.get("/propostas/:id/pdf", async (req, res) => {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, proposta.tenantId));

  const catalogItems = await db
    .select({
      nome: produtosCatalogoTable.nome,
      descricao: produtosCatalogoTable.descricao,
      categoria: categoriasProdutoTable.nome,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      imagemUrl: produtosCatalogoTable.imagemUrl,
    })
    .from(produtosCatalogoTable)
    .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
    .where(and(
      eq(produtosCatalogoTable.tenantId, proposta.tenantId),
      eq(produtosCatalogoTable.ativo, true),
    ))
    .limit(6);

  const [lead] = proposta.leadId
    ? await db
        .select({ nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone, email: leadsTable.email })
        .from(leadsTable)
        .where(eq(leadsTable.id, proposta.leadId))
    : [null];

  const port = process.env.PORT ?? "5000";
  const basePath = process.env.BASE_PATH ?? "";
  const resolveUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith("/objects/")) return `http://localhost:${port}${basePath}/api/storage${url}`;
    return url;
  };

  const profileResolved = profile ? { ...profile, logoUrl: resolveUrl(profile.logoUrl) } : null;

  const html = renderOrcamentoPdf({
    proposta: {
      ...proposta,
      itens: (proposta.itens ?? []) as Array<{ nome: string; quantidade: number; valorUnitario: number; sku?: string | null; descricao?: string | null }>,
    },
    profile: profileResolved,
    catalogItems,
    lead: lead ?? null,
  });

  const pdfBuffer = await generateProposalPDF(html);
  const safe = (proposta.numero ?? proposta.id.slice(-8)).replace(/[^a-zA-Z0-9\-_]/g, "_");
  const fileName = `Orcamento_${safe}.pdf`;

  const isPdf = pdfBuffer.length >= 4 && pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50;
  if (isPdf) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
  }
  return res.send(pdfBuffer);
});

router.patch("/propostas/:id", async (req, res) => {
  const parsed = updatePropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId, status: propostasTable.status })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const propostaAceita = existing.status === "aceita";
  const isGerente = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";

  if (propostaAceita && !isGerente) {
    res.status(403).json({ error: "Orçamento vendido. Apenas usuário gerencial pode alterar os itens." });
    return;
  }

  const [proposta] = await db
    .update(propostasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(propostasTable.id, existing.id))
    .returning();

  if (proposta?.dealId && parsed.data.valorTotal !== undefined && parsed.data.valorTotal !== null) {
    await db
      .update(dealsTable)
      .set({ valor: String(parsed.data.valorTotal), updatedAt: new Date() })
      .where(and(
        eq(dealsTable.id, proposta.dealId),
        eq(dealsTable.tenantId, proposta.tenantId),
      ));
  }

  res.json(proposta);
});

const propostaItemExecucaoBodySchema = z.object({
  status: z.enum(["em_execucao", "concluida"]),
});

router.patch("/propostas/:id/execucao/:itemIndex", async (req, res) => {
  const parsed = propostaItemExecucaoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const itemIndex = Number.parseInt(String(req.params.itemIndex), 10);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    res.status(422).json({ error: "itemIndex inválido" });
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

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (proposta.status !== "aceita") {
    res.status(422).json({ error: "A execução só pode avançar depois que o orçamento estiver vendido/aceito." });
    return;
  }

  const itens = normalizarItensExecucao((proposta.itens ?? []) as PropostaItem[]);
  if (itemIndex >= itens.length) {
    res.status(404).json({ error: "Item do orçamento não encontrado." });
    return;
  }

  const pendentes = itens
    .map((item, index) => ({
      item,
      index,
      etapaOrdem: item.etapaOrdem ?? item.ordemExecucao ?? index + 1,
      etapaNome: item.etapaNome ?? item.nome,
    }))
    .filter(({ item }) => item.statusExecucao !== "concluida");

  if (pendentes.length === 0) {
    res.status(422).json({ error: "Todas as etapas deste orçamento já foram concluídas." });
    return;
  }

  const etapaAtualOrdem = Math.min(...pendentes.map((entry) => entry.etapaOrdem));
  const etapaAtual = pendentes.find((entry) => entry.etapaOrdem === etapaAtualOrdem)!;
  const itemAlvo = itens[itemIndex];
  const itemEtapaOrdem = itemAlvo.etapaOrdem ?? itemAlvo.ordemExecucao ?? itemIndex + 1;

  // Vários produtos/composições podem ser executados dentro da mesma etapa.
  // A próxima etapa só é liberada quando todos os itens da etapa atual terminarem.
  if (itemEtapaOrdem !== etapaAtualOrdem) {
    res.status(409).json({
      error: `Conclua primeiro a etapa ${etapaAtualOrdem}: ${etapaAtual.etapaNome}.`,
    });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const itensAtualizados = itens.map((item, index) => {
    if (index !== itemIndex) return item;

    if (parsed.data.status === "em_execucao") {
      return {
        ...item,
        statusExecucao: "em_execucao" as const,
        iniciadoEm: item.iniciadoEm ?? nowIso,
      };
    }

    return {
      ...item,
      statusExecucao: "concluida" as const,
      iniciadoEm: item.iniciadoEm ?? nowIso,
      executadoEm: nowIso,
    };
  });

  const [updated] = await db
    .update(propostasTable)
    .set({ itens: itensAtualizados, updatedAt: now })
    .where(eq(propostasTable.id, proposta.id))
    .returning();

  const restantes = itensAtualizados.filter((item) => item.statusExecucao !== "concluida");
  const concluidas = itensAtualizados.length - restantes.length;

  if (proposta.dealId) {
    const targetEtapa = restantes.length === 0 ? "entregue" : "em_execucao";
    await db
      .update(dealsTable)
      .set({
        etapa: targetEtapa as typeof dealsTable.$inferSelect.etapa,
        updatedAt: now,
      })
      .where(eq(dealsTable.id, proposta.dealId));
  }

  res.json({
    proposta: updated,
    execucao: {
      concluidas,
      restantes: restantes.length,
      finalizada: restantes.length === 0,
      proximaOrdem: restantes.length
        ? Math.min(...restantes.map((item, index) => item.ordemExecucao ?? index + 1))
        : null,
      proximaEtapaOrdem: restantes.length
        ? Math.min(...restantes.map((item, index) => item.etapaOrdem ?? item.ordemExecucao ?? index + 1))
        : null,
      proximaEtapaNome: restantes.length
        ? (() => {
            const ordem = Math.min(...restantes.map((item, index) => item.etapaOrdem ?? item.ordemExecucao ?? index + 1));
            return restantes.find((item, index) => (item.etapaOrdem ?? item.ordemExecucao ?? index + 1) === ordem)?.etapaNome ?? null;
          })()
        : null,
    },
  });
});

const PROPOSTA_TRANSITIONS: Record<string, string[]> = {
  rascunho: ["enviada", "pendente"],
  enviada: ["pendente", "aceita", "rejeitada", "expirada"],
  pendente: ["aceita", "rejeitada", "expirada"],
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

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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

  // ── Central funnel: proposalAccepted handles deal ganho + automation ───────
  if (status === "aceita" && proposta.dealId) {
    const result = await proposalAccepted(proposta.id, "manual");
    if (!result.ok) {
      req.log.warn({ propostaId: proposta.id, error: result.error }, "proposalAccepted failed during status transition");
    } else {
      req.log.info({ propostaId: proposta.id, dealId: result.dealId, alreadyProcessed: result.alreadyProcessed }, "proposalAccepted executed via status transition");
    }
  } else if (status === "aceita" && !proposta.dealId && proposta.leadId) {
    // No deal linked — move lead directly to convertido so the card reaches "ganho"
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, proposta.leadId));
    req.log.info({ propostaId: proposta.id, leadId: proposta.leadId }, "proposta aceita sem deal: lead movido para convertido");
  } else if (proposta.dealId && status !== "aceita") {
    // Auto-sync deal stage for non-aceita transitions (rejeitada, expirada, pendente)
    const dealEtapaMap: Record<string, string> = {
      pendente: "proposta",
      rejeitada: "perdido",
      expirada: "perdido",
    };
    const targetEtapa = dealEtapaMap[status];
    if (targetEtapa) {
      await db
        .update(dealsTable)
        .set({ etapa: targetEtapa as typeof dealsTable.$inferSelect.etapa, updatedAt: new Date() })
        .where(eq(dealsTable.id, proposta.dealId));
      req.log.info({ dealId: proposta.dealId, from: proposta.status, to: status, etapa: targetEtapa }, "proposta: auto-synced deal stage");
    }
  }

  res.json(updated);
});

const paymentCompositionLineSchema = z.object({
  forma: z.string().min(1),
  valor: z.number().positive(),
  comprovanteUrl: z.string().optional(),
});

const fromCatalogoBodySchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1),
  dealId: z.string().optional(),
  validadeAte: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
  recorrente: z.boolean().optional(),
  valorMensal: z.number().optional(),
  prazoContratoMeses: z.number().int().optional(),
  numParcelas: z.number().int().min(1).optional(),
  paymentCompositions: z.array(paymentCompositionLineSchema).optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1).optional(),
        composicaoId: z.string().min(1).optional(),
        quantidade: z.number().positive(),
        precoUnitario: z.number().nonnegative().optional(),
        nome: z.string().optional(),
        etapaId: z.string().min(1).optional(),
        etapaNome: z.string().min(1).optional(),
        etapaOrdem: z.number().int().positive().optional(),
        ordemExecucao: z.number().int().positive().optional(),
      }).refine(
        (item) => Boolean(item.produtoId) !== Boolean(item.composicaoId),
        { message: "Informe produtoId ou composicaoId, mas não os dois." },
      )
    )
    .min(1, "At least one item is required"),
});

router.post(
  "/tenants/:tenantId/propostas/from-catalogo",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = fromCatalogoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const {
      leadId, titulo, dealId, validadeAte, observacoes, itens,
      formaPagamento, condPagamento, prazoEntrega,
      recorrente, valorMensal, prazoContratoMeses, numParcelas,
      paymentCompositions,
    } = parsed.data;

    const produtoIds = itens.flatMap((item) => item.produtoId ? [item.produtoId] : []);
    const composicaoIds = itens.flatMap((item) => item.composicaoId ? [item.composicaoId] : []);

    const produtos = produtoIds.length > 0
      ? await db
          .select()
          .from(produtosCatalogoTable)
          .where(
            and(
              eq(produtosCatalogoTable.tenantId, tenantId),
              inArray(produtosCatalogoTable.id, produtoIds)
            )
          )
      : [];

    const composicoes = composicaoIds.length > 0
      ? await db
          .select()
          .from(composicoesTable)
          .where(
            and(
              eq(composicoesTable.tenantId, tenantId),
              inArray(composicoesTable.id, composicaoIds)
            )
          )
      : [];

    const missingProductIds = produtoIds.filter(
      (id) => !produtos.find((produto) => produto.id === id)
    );
    if (missingProductIds.length > 0) {
      res.status(422).json({
        error: `Products not found or do not belong to this tenant: ${missingProductIds.join(", ")}`,
      });
      return;
    }

    const missingCompositionIds = composicaoIds.filter(
      (id) => !composicoes.find((composicao) => composicao.id === id)
    );
    if (missingCompositionIds.length > 0) {
      res.status(422).json({
        error: `Compositions not found or do not belong to this tenant: ${missingCompositionIds.join(", ")}`,
      });
      return;
    }

    const inactiveProdutos = produtos.filter((produto) => !produto.ativo);
    if (inactiveProdutos.length > 0) {
      res.status(422).json({
        error: `Inactive products cannot be added to a proposta: ${inactiveProdutos.map((produto) => produto.nome).join(", ")}`,
      });
      return;
    }

    const produtoMap = new Map(produtos.map((produto) => [produto.id, produto]));
    const composicaoMap = new Map(composicoes.map((composicao) => [composicao.id, composicao]));

    let valorTotal = 0;
    const propostaItens = itens.map((item) => {
      if (item.produtoId) {
        const produto = produtoMap.get(item.produtoId)!;
        const valorUnitario = item.precoUnitario !== undefined
          ? item.precoUnitario
          : parseFloat(produto.precoBase);
        valorTotal += item.quantidade * valorUnitario;
        return {
          nome: item.nome || produto.nome,
          quantidade: item.quantidade,
          valorUnitario,
          produtoId: produto.id,
          sku: produto.sku ?? undefined,
          unidade: produto.unidade ?? undefined,
          etapaId: item.etapaId,
          etapaNome: item.etapaNome,
          etapaOrdem: item.etapaOrdem,
          ordemExecucao: item.ordemExecucao,
        };
      }

      const composicao = composicaoMap.get(item.composicaoId!)!;
      const valorUnitario = item.precoUnitario !== undefined
        ? item.precoUnitario
        : Number(composicao.custoTotal ?? 0);
      valorTotal += item.quantidade * valorUnitario;
      return {
        nome: item.nome || composicao.nome,
        quantidade: item.quantidade,
        valorUnitario,
        composicaoId: composicao.id,
        sku: composicao.codigo ?? undefined,
        descricao: composicao.descricao ?? undefined,
        unidade: composicao.unidade,
        etapaId: item.etapaId,
        etapaNome: item.etapaNome,
        etapaOrdem: item.etapaOrdem,
        ordemExecucao: item.ordemExecucao,
      };
    });

    const numero = await generateNumero(tenantId);

    const [proposta] = await db
      .insert(propostasTable)
      .values({
        tenantId,
        leadId,
        titulo,
        numero,
        ...(dealId ? { dealId } : {}),
        ...(validadeAte ? { validadeAte } : {}),
        ...(observacoes ? { observacoes } : {}),
        ...(formaPagamento ? { formaPagamento: formaPagamento as typeof propostasTable.$inferInsert.formaPagamento } : {}),
        ...(condPagamento ? { condPagamento } : {}),
        ...(prazoEntrega ? { prazoEntrega } : {}),
        ...(recorrente !== undefined ? { recorrente } : {}),
        ...(valorMensal !== undefined ? { valorMensal: String(valorMensal) } : {}),
        ...(prazoContratoMeses !== undefined ? { prazoContratoMeses } : {}),
        ...(numParcelas !== undefined ? { numParcelas } : {}),
        ...(paymentCompositions ? {
          paymentCompositions: paymentCompositions.map((pc) => ({
            forma: pc.forma,
            valor: String(pc.valor),
            comprovanteUrl: pc.comprovanteUrl ?? null,
          })),
        } : {}),
        itens: normalizarItensExecucao(propostaItens as PropostaItem[]),
        valorTotal: valorTotal.toFixed(2),
      })
      .returning();

    res.status(201).json(proposta);
  }
);

// ─── AI item suggestion ───────────────────────────────────────────────────────
const suggestBodySchema = z.object({
  titulo: z.string().min(1),
  leadNome: z.string().optional(),
  contexto: z.string().optional(),
});

router.post("/tenants/:tenantId/propostas/suggest-items", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = suggestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const catalog = await db
    .select({
      nome: produtosCatalogoTable.nome,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      categoria: categoriasProdutoTable.nome,
    })
    .from(produtosCatalogoTable)
    .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
    .limit(20);

  const productContext = buildProposalProductContext(
    catalog,
    (profile?.produtos as Array<{ nome?: string | null; preco?: number | null }> | null | undefined),
  );

  const contextParts: string[] = [`Título do orçamento: ${parsed.data.titulo}`];
  if (parsed.data.leadNome) contextParts.push(`Cliente: ${parsed.data.leadNome}`);
  if (parsed.data.contexto) contextParts.push(`Contexto adicional: ${parsed.data.contexto}`);
  if (profile?.nomeFantasia) contextParts.push(`Empresa vendedora: ${profile.nomeFantasia}`);
  if (profile?.vertical) contextParts.push(`Segmento: ${profile.vertical}`);
  if (profile?.urlLinhaProdutos) contextParts.push(`Fonte externa complementar: ${profile.urlLinhaProdutos}`);
  contextParts.push(productContext.context);

  try {
    const sourceRules = proposalProductPromptRules(productContext.source)
      .map((rule) => `- ${rule}`)
      .join("\n");
    const aiResult = await gatewayCallOpenAI(
      tenantId,
      "proposal_generator",
      [
        {
          role: "system",
          content: `Você é um assistente especializado em criar orçamentos comerciais brasileiros.
Com base nas informações fornecidas, sugira uma lista de itens para o orçamento.
Retorne APENAS JSON válido:
{"itens":[{"nome":"nome do item","quantidade":número,"valorUnitario":número_decimal}]}
Regras:
- Sugira entre 3 e 7 itens relevantes ao contexto
${sourceRules}
- Retorne SOMENTE o JSON, sem texto extra`,
        },
        { role: "user", content: contextParts.join("\n") },
      ],
      { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 800, temperature: 0.7, log: req.log },
    );

    const raw = aiResult.content || "{}";
    res.json(JSON.parse(raw));
  } catch (err) {
    req.log.error({ err }, "suggest-items: OpenAI error");
    res.status(500).json({ error: "Erro ao gerar sugestão" });
  }
});

router.delete("/propostas/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(propostasTable).where(eq(propostasTable.id, existing.id));

  res.status(204).send();
});

// ── Canal A: Link público de aceite ───────────────────────────────────────────

router.get("/propostas/:id/public", async (req, res) => {
  const [proposta] = await db
    .select({
      id: propostasTable.id,
      tenantId: propostasTable.tenantId,
      leadId: propostasTable.leadId,
      titulo: propostasTable.titulo,
      numero: propostasTable.numero,
      itens: propostasTable.itens,
      valorTotal: propostasTable.valorTotal,
      formaPagamento: propostasTable.formaPagamento,
      condPagamento: propostasTable.condPagamento,
      prazoEntrega: propostasTable.prazoEntrega,
      validadeAte: propostasTable.validadeAte,
      status: propostasTable.status,
      observacoes: propostasTable.observacoes,
    })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente") {
    res.status(422).json({ error: "Proposta cannot be accepted in current status" });
    return;
  }

  const [lead] = await db
    .select({ nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(eq(leadsTable.id, proposta.leadId));

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, proposta.tenantId));

  res.json({
    proposta,
    lead: lead ?? null,
    tenant: tenant ?? null,
  });
});

const acceptBodySchema = z.object({
  nome: z.string().min(1).optional(),
  documento: z.string().optional(),
});

router.post("/propostas/:id/accept", async (req, res) => {
  const parsed = acceptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const propostaId = String(req.params.id);
  const ip = req.ip ?? req.headers["x-forwarded-for"] as string ?? undefined;

  const result = await proposalAccepted(propostaId, "link", {
    ip,
    nome: parsed.data.nome,
    documento: parsed.data.documento,
  });

  if (!result.ok) {
    res.status(404).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: "Proposta accepted successfully",
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

// ── Canal C: Marcação manual pelo vendedor (manual ou via WhatsApp) ─────────

const acceptManualBodySchema = z.object({
  via: z.enum(["manual", "whatsapp"]).optional().default("manual"),
});

router.post("/propostas/:id/accept-manual", async (req, res) => {
  const bodyParsed = acceptManualBodySchema.safeParse(req.body);
  const via = bodyParsed.success ? bodyParsed.data.via : "manual";

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (proposta.status === "aceita") {
    res.status(409).json({ error: "Proposta já aceita", propostaId: proposta.id });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const result = await proposalAccepted(proposta.id, via as "manual" | "whatsapp", {
    nome: req.user?.email ?? undefined,
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: `Proposta accepted via ${via}`,
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

// ── GET /tenants/:tenantId/proposta-templates ─────────────────────────────────
router.get("/tenants/:tenantId/proposta-templates", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templates = await db
    .select()
    .from(propostaTemplatesTable)
    .where(eq(propostaTemplatesTable.isActive, true))
    .orderBy(propostaTemplatesTable.name);

  res.json(templates);
});

// ── POST /tenants/:tenantId/propostas/from-template ───────────────────────────
const fromTemplateBody = z.object({
  templateSlug: z.string(),
  leadId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  extraItens: z.array(
    z.object({
      nome: z.string(),
      quantidade: z.number().positive(),
      valorUnitario: z.number().nonnegative(),
      sku: z.string().optional(),
      descricao: z.string().optional(),
    })
  ).optional(),
});

router.post("/tenants/:tenantId/propostas/from-template", async (req, res) => {
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = fromTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { templateSlug, leadId, dealId, extraItens } = parsed.data;

  const [template] = await db
    .select()
    .from(propostaTemplatesTable)
    .where(and(eq(propostaTemplatesTable.slug, templateSlug), eq(propostaTemplatesTable.isActive, true)))
    .limit(1);

  if (!template) {
    res.status(404).json({ error: "Template not found or inactive" });
    return;
  }

  const [lead] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const itens = [
    ...(template.itens as Array<{ nome: string; quantidade: number; valorUnitario: number; sku?: string; descricao?: string }>),
    ...(extraItens ?? []),
  ];

  const valorTotal = itens.reduce((sum, i) => sum + i.quantidade * i.valorUnitario, 0);
  const numero = await generateNumero(tenantId);
  const validadeAte = new Date();
  validadeAte.setDate(validadeAte.getDate() + 15);

  const [proposta] = await db
    .insert(propostasTable)
    .values({
      tenantId,
      leadId,
      dealId: dealId ?? null,
      titulo: `${template.name} — ${lead.nome}`,
      numero,
      itens: normalizarItensExecucao(itens as PropostaItem[]),
      valorTotal: String(valorTotal.toFixed(2)),
      status: "rascunho",
      validadeAte,
      recorrente: template.cycle !== "annual" && template.planSlug !== "",
    })
    .returning();

  res.status(201).json({ proposta, template: { slug: template.slug, name: template.name } });
});
// — Cálculo de orçamento por m² (teto vinílico, revestimento) ——————————
const calcularOrcamentoBodySchema = z.object({
  produtoId: z.string().min(1),
  superficies: z
    .array(
      z.object({
        nome: z.string().optional(),
        largura: z.number().positive().optional(),
        comprimento: z.number().positive().optional(),
        altura: z.number().positive().optional(),
        m2Direto: z.number().positive().optional(),
        perimetroManual: z.number().positive().optional(),
      })
    )
    .min(1, "Informe ao menos uma superfície (ambiente ou parede)."),
  acessorioProdutoId: z.string().optional(),
});

router.post("/tenants/:tenantId/propostas/calcular-orcamento", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = calcularOrcamentoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const { resultado, acessorioSugeridoAutomaticamente, itensComposicao } = await resolverECalcularOrcamento(tenantId, parsed.data);
    res.status(200).json({ ...resultado, acessorioSugeridoAutomaticamente, itensComposicao });
  } catch (err) {
    if (err instanceof ErroResolucaoOrcamento) {
      const status = err.message.startsWith("Produto not found") ? 404 : 422;
      res.status(status).json({ error: err.message });
      return;
    }
    if (err instanceof ErroCalculoOrcamento) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});
export default router;
