import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pool, propostasTable, leadProposalsTable, leadsTable } from "@workspace/db";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { clientFinalDecision, clientItemDecision, getPublicProposal } from "./arch_client_portal_approval";

const router: IRouter = Router();
const proposalStorage = new ObjectStorageService();

const portalRegisterSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(240),
  telefone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(200),
});

const portalLoginSchema = z.object({
  email: z.string().trim().email().max(240),
  password: z.string().min(1).max(200),
});

type PublicProposalPortalContext = {
  tenantId: string;
  leadId: string | null;
  sourceKind: "budget_proposal" | "generated_proposal";
  sourceId: string;
};

function publicProposalAssetUrl(token: string, url: unknown) {
  const raw = String(url || "");
  if (raw.startsWith("/api/storage/objects/")) {
    return `/api/public/proposals/${encodeURIComponent(token)}/assets/${raw.slice("/api/storage/objects/".length)}`;
  }
  if (raw.startsWith("/objects/")) {
    return `/api/public/proposals/${encodeURIComponent(token)}/assets/${raw.slice("/objects/".length)}`;
  }
  return raw;
}

function sanitizePublicProposalItems(items: unknown, token: string) {
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const source = item?.sourceSnapshot && typeof item.sourceSnapshot === "object"
      ? {
          sourceType: item.sourceSnapshot.sourceType,
          sourceId: item.sourceSnapshot.sourceId,
          nome: item.sourceSnapshot.nome,
          sku: item.sourceSnapshot.sku,
          descricao: item.sourceSnapshot.descricao,
          unidade: item.sourceSnapshot.unidade,
          marca: item.sourceSnapshot.marca,
          imagemUrl: publicProposalAssetUrl(token, item.sourceSnapshot.imagemUrl),
          imagens: Array.isArray(item.sourceSnapshot.imagens)
            ? item.sourceSnapshot.imagens.map((url: unknown) => publicProposalAssetUrl(token, url)).filter(Boolean)
            : [],
        }
      : undefined;

    return {
      nome: item?.nome,
      quantidade: item?.quantidade,
      valorUnitario: item?.valorUnitario,
      sku: item?.sku,
      descricao: item?.descricao,
      unidade: item?.unidade,
      etapaNome: item?.etapaNome,
      etapaOrdem: item?.etapaOrdem,
      faseNome: item?.faseNome,
      faseOrdem: item?.faseOrdem,
      produtoId: item?.produtoId,
      ...(source ? { sourceSnapshot: source } : {}),
    };
  });
}

function proposalItemsReferenceAsset(items: unknown, assetPath: string) {
  const normalized = decodeURIComponent(assetPath).replace(/^\/+/, "");
  const serialized = JSON.stringify(items ?? []);
  return serialized.includes(`/api/storage/objects/${normalized}`)
    || serialized.includes(`/objects/${normalized}`);
}

function hashPortalSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createCustomerPortalSession(userId: string) {
  const raw = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO customer_portal_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1,$2,$3,now() + interval '30 days')`,
    [randomUUID(), userId, hashPortalSessionToken(raw)],
  );
  return raw;
}

async function resolvePublicProposalPortalContext(token: string): Promise<PublicProposalPortalContext | null> {
  const [budget] = await db
    .select({
      id: propostasTable.id,
      tenantId: propostasTable.tenantId,
      leadId: propostasTable.leadId,
    })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  if (budget?.tenantId) {
    return {
      tenantId: String(budget.tenantId),
      leadId: budget.leadId ? String(budget.leadId) : null,
      sourceKind: "budget_proposal",
      sourceId: String(budget.id),
    };
  }

  const [generated] = await db
    .select({
      id: leadProposalsTable.id,
      tenantId: leadProposalsTable.tenantId,
      leadId: leadProposalsTable.leadId,
    })
    .from(leadProposalsTable)
    .where(eq(leadProposalsTable.id, token))
    .limit(1);

  if (!generated?.tenantId) return null;
  return {
    tenantId: String(generated.tenantId),
    leadId: generated.leadId ? String(generated.leadId) : null,
    sourceKind: "generated_proposal",
    sourceId: String(generated.id),
  };
}

async function attachCustomerPortalAccess(userId: string, context: PublicProposalPortalContext) {
  await pool.query(
    `INSERT INTO customer_portal_access (id, tenant_id, user_id, lead_id, source_kind, source_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, source_kind, source_id) DO NOTHING`,
    [randomUUID(), context.tenantId, userId, context.leadId, context.sourceKind, context.sourceId],
  );
}


function publicizeGeneratedProposalAssets(id: string, html: string) {
  const prefix = `/api/public/generated-proposals/${encodeURIComponent(id)}/assets/`;
  return String(html || "")
    .replace(/(src|href)="\/api\/storage\/objects\//g, `$1="${prefix}`)
    .replace(/(src|href)="\/objects\//g, `$1="${prefix}`);
}

function proposalHtmlReferencesAsset(html: string, assetPath: string) {
  const normalized = decodeURIComponent(assetPath).replace(/^\/+/, "");
  return String(html || "").includes(`/api/storage/objects/${normalized}`)
    || String(html || "").includes(`/objects/${normalized}`);
}


// ARQDOR proposal portal — public token endpoints live in the central public proposals router.
router.get("/arch/portal/proposta/:token", async (req, res, next) => {
  try {
    res.json(await getPublicProposal(String(req.params.token ?? "")));
  } catch (err) {
    next(err);
  }
});

router.post("/arch/portal/proposta/:token/items/:itemId/decision", async (req, res, next) => {
  try {
    res.json(await clientItemDecision(String(req.params.token ?? ""), String(req.params.itemId ?? ""), req.body));
  } catch (err) {
    next(err);
  }
});

router.post("/arch/portal/proposta/:token/decision", async (req, res, next) => {
  try {
    res.json(await clientFinalDecision(String(req.params.token ?? ""), req.body));
  } catch (err) {
    next(err);
  }
});

const acceptPublicBodySchema = z.object({
  nome: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(240).optional(),
  telefone: z.string().trim().max(40).optional(),
  documento: z.string().trim().max(40).optional(),
});


router.post("/public/proposals/:token/portal/register", async (req, res) => {
  const token = String(req.params.token ?? "");
  const context = await resolvePublicProposalPortalContext(token);
  if (!context) {
    res.status(404).json({ error: "Proposta não encontrada ou link inválido." });
    return;
  }

  const parsed = portalRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Informe nome, e-mail válido e senha com ao menos 8 caracteres." });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await pool.query(
    `SELECT id FROM customer_portal_users
      WHERE tenant_id=$1 AND lower(email)=lower($2) LIMIT 1`,
    [context.tenantId, email],
  );
  if (existing.rows[0]) {
    res.status(409).json({ error: "Já existe uma conta para este e-mail nesta empresa. Entre com sua senha." });
    return;
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await pool.query(
    `INSERT INTO customer_portal_users
      (id, tenant_id, nome, email, telefone, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      userId,
      context.tenantId,
      parsed.data.nome,
      email,
      parsed.data.telefone?.trim() || null,
      passwordHash,
    ],
  );
  await attachCustomerPortalAccess(userId, context);
  const sessionToken = await createCustomerPortalSession(userId);

  res.status(201).json({
    sessionToken,
    user: { id: userId, nome: parsed.data.nome, email, tenantId: context.tenantId },
    proposal: { sourceKind: context.sourceKind, sourceId: context.sourceId, leadId: context.leadId },
  });
});

router.post("/public/proposals/:token/portal/login", async (req, res) => {
  const token = String(req.params.token ?? "");
  const context = await resolvePublicProposalPortalContext(token);
  if (!context) {
    res.status(404).json({ error: "Proposta não encontrada ou link inválido." });
    return;
  }

  const parsed = portalLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Informe e-mail e senha." });
    return;
  }

  const result = await pool.query(
    `SELECT id, nome, email, password_hash, status
       FROM customer_portal_users
      WHERE tenant_id=$1 AND lower(email)=lower($2)
      LIMIT 1`,
    [context.tenantId, parsed.data.email.toLowerCase()],
  );
  const user = result.rows[0];
  if (!user || user.status !== "ativo" || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  await attachCustomerPortalAccess(String(user.id), context);
  await pool.query(
    `UPDATE customer_portal_users SET ultimo_login_em=now(), updated_at=now() WHERE id=$1`,
    [user.id],
  );
  const sessionToken = await createCustomerPortalSession(String(user.id));

  res.json({
    sessionToken,
    user: { id: user.id, nome: user.nome, email: user.email, tenantId: context.tenantId },
    proposal: { sourceKind: context.sourceKind, sourceId: context.sourceId, leadId: context.leadId },
  });
});

router.get("/public/proposals/:token/portal/me", async (req, res) => {
  const token = String(req.params.token ?? "");
  const context = await resolvePublicProposalPortalContext(token);
  if (!context) {
    res.status(404).json({ error: "Proposta não encontrada ou link inválido." });
    return;
  }

  const authHeader = String(req.headers.authorization ?? "");
  const rawSession = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!rawSession) {
    res.status(401).json({ error: "Sessão do portal ausente." });
    return;
  }

  const result = await pool.query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.tenant_id
       FROM customer_portal_sessions s
       INNER JOIN customer_portal_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()
        AND u.tenant_id=$2 AND u.status='ativo'
      LIMIT 1`,
    [hashPortalSessionToken(rawSession), context.tenantId],
  );
  const user = result.rows[0];
  if (!user) {
    res.status(401).json({ error: "Sessão inválida ou expirada." });
    return;
  }

  await attachCustomerPortalAccess(String(user.id), context);
  res.json({
    user: { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone, tenantId: user.tenant_id },
    proposal: { sourceKind: context.sourceKind, sourceId: context.sourceId, leadId: context.leadId },
  });
});

// ── GET /public/proposals/:token — fetch summary for the accept page ───────────
router.get("/public/proposals/:token", async (req, res) => {
  const token = String(req.params.token);
  const [proposta] = await db
    .select({
      id: propostasTable.id,
      titulo: propostasTable.titulo,
      itens: propostasTable.itens,
      valorTotal: propostasTable.valorTotal,
      status: propostasTable.status,
      validadeAte: propostasTable.validadeAte,
      numero: propostasTable.numero,
      observacoes: propostasTable.observacoes,
      condPagamento: propostasTable.condPagamento,
    })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  if (proposta) {
    res.json({
      kind: "budget",
      ...proposta,
      itens: sanitizePublicProposalItems(proposta.itens, token),
    });
    return;
  }

  // Proposal Builder versions (v1, v2, v3...) live in lead_proposals rather
  // than propostas. Their row id is already an opaque UUID, so it is a stable,
  // unique public token for exactly one generated proposal version.
  const [generatedProposal] = await db
    .select({
      id: leadProposalsTable.id,
      version: leadProposalsTable.version,
      status: leadProposalsTable.status,
      createdAt: leadProposalsTable.createdAt,
      jsonContent: leadProposalsTable.jsonContent,
      leadId: leadProposalsTable.leadId,
    })
    .from(leadProposalsTable)
    .where(eq(leadProposalsTable.id, token))
    .limit(1);

  if (!generatedProposal) {
    res.status(404).json({ error: "Proposta não encontrada" });
    return;
  }

  let sourceStatus: string | null = null;
  let validadeAte: Date | string | null = null;
  let acceptedAt: Date | null = null;
  try {
    const payload = generatedProposal.jsonContent
      ? JSON.parse(generatedProposal.jsonContent) as { _proposalMeta?: { sourcePropostaId?: string | null } }
      : null;
    const sourcePropostaId = payload?._proposalMeta?.sourcePropostaId;
    if (sourcePropostaId) {
      const [source] = await db
        .select({
          status: propostasTable.status,
          validadeAte: propostasTable.validadeAte,
          acceptedAt: propostasTable.acceptedAt,
        })
        .from(propostasTable)
        .where(eq(propostasTable.id, sourcePropostaId))
        .limit(1);
      sourceStatus = source?.status ?? null;
      validadeAte = source?.validadeAte ?? null;
      acceptedAt = source?.acceptedAt ?? null;
    }
  } catch {
    // Legacy generated proposals may not carry source metadata.
  }

  const [lead] = generatedProposal.leadId
    ? await db
        .select({
          nome: leadsTable.nome,
          email: leadsTable.email,
          telefone: leadsTable.telefone,
          documento: leadsTable.documento,
        })
        .from(leadsTable)
        .where(eq(leadsTable.id, generatedProposal.leadId))
        .limit(1)
    : [undefined];

  res.json({
    kind: "generated",
    id: generatedProposal.id,
    version: generatedProposal.version,
    status: generatedProposal.status,
    createdAt: generatedProposal.createdAt,
    sourceStatus,
    validadeAte,
    acceptedAt,
    client: lead ?? null,
  });
});

router.get("/public/proposals/:token/assets/*path", async (req, res, next) => {
  try {
    const token = String(req.params.token || "");
    const raw = req.params.path;
    const assetPath = Array.isArray(raw) ? raw.join("/") : String(raw || "");
    if (!assetPath) return res.status(404).send("Arquivo não encontrado.");

    const [proposal] = await db
      .select({
        id: propostasTable.id,
        itens: propostasTable.itens,
      })
      .from(propostasTable)
      .where(eq(propostasTable.publicToken, token))
      .limit(1);

    if (!proposal || !proposalItemsReferenceAsset(proposal.itens, assetPath)) {
      return res.status(404).send("Arquivo não encontrado.");
    }

    const objectPath = `/objects/${decodeURIComponent(assetPath).replace(/^\/+/, "")}`;
    const file = await proposalStorage.getObjectEntityFile(objectPath);
    const objectResponse = await proposalStorage.downloadObject(file, 300);
    objectResponse.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(objectResponse.status);
    return res.send(Buffer.from(await objectResponse.arrayBuffer()));
  } catch (err) {
    next(err);
  }
});

// ── GET /public/generated-proposals/:id/html — stream exact proposal HTML ────
// Keep the large proposal document out of JSON. Some generated HTML contains
// characters/embedded data that should be delivered as text/html, not parsed as
// a JSON property by the browser.
router.get("/public/generated-proposals/:id/html", async (req, res) => {
  const id = String(req.params.id);
  const [proposal] = await db
    .select({
      id: leadProposalsTable.id,
      htmlContent: leadProposalsTable.htmlContent,
    })
    .from(leadProposalsTable)
    .where(eq(leadProposalsTable.id, id))
    .limit(1);

  if (!proposal) {
    res.status(404).type("text/plain; charset=utf-8").send("Proposta não encontrada");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(publicizeGeneratedProposalAssets(proposal.id, proposal.htmlContent));
});

router.get("/public/generated-proposals/:id/assets/*path", async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    const raw = req.params.path;
    const assetPath = Array.isArray(raw) ? raw.join("/") : String(raw || "");
    if (!assetPath) return res.status(404).send("Arquivo não encontrado.");

    const [proposal] = await db
      .select({
        id: leadProposalsTable.id,
        htmlContent: leadProposalsTable.htmlContent,
      })
      .from(leadProposalsTable)
      .where(eq(leadProposalsTable.id, id))
      .limit(1);

    if (!proposal || !proposalHtmlReferencesAsset(proposal.htmlContent, assetPath)) {
      return res.status(404).send("Arquivo não encontrado.");
    }

    const objectPath = `/objects/${decodeURIComponent(assetPath).replace(/^\/+/, "")}`;
    const file = await proposalStorage.getObjectEntityFile(objectPath);
    const objectResponse = await proposalStorage.downloadObject(file, 300);
    objectResponse.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(objectResponse.status);
    return res.send(Buffer.from(await objectResponse.arrayBuffer()));
  } catch (err) {
    next(err);
  }
});

// ── POST /public/proposals/:token/accept — public accept (no auth) ─────────────
router.post("/public/proposals/:token/accept", async (req, res) => {
  const token = String(req.params.token);

  const parsed = acceptPublicBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  let [proposta] = await db
    .select({ id: propostasTable.id, status: propostasTable.status, validadeAte: propostasTable.validadeAte, leadId: propostasTable.leadId })
    .from(propostasTable)
    .where(eq(propostasTable.publicToken, token))
    .limit(1);

  // Generated proposal versions use lead_proposals.id as their exclusive public
  // link token. Resolve the source orçamento saved in jsonContent so the
  // interactive microsite can use the same acceptance pipeline as the budget.
  if (!proposta) {
    const [generated] = await db
      .select({ jsonContent: leadProposalsTable.jsonContent })
      .from(leadProposalsTable)
      .where(eq(leadProposalsTable.id, token))
      .limit(1);

    if (generated?.jsonContent) {
      try {
        const parsed = JSON.parse(generated.jsonContent) as {
          _proposalMeta?: { sourcePropostaId?: string | null };
        };
        const sourcePropostaId = parsed?._proposalMeta?.sourcePropostaId;
        if (sourcePropostaId) {
          [proposta] = await db
            .select({ id: propostasTable.id, status: propostasTable.status, validadeAte: propostasTable.validadeAte, leadId: propostasTable.leadId })
            .from(propostasTable)
            .where(eq(propostasTable.id, sourcePropostaId))
            .limit(1);
        }
      } catch {
        // Invalid legacy jsonContent simply means this old generated proposal
        // cannot resolve to a source budget for acceptance.
      }
    }
  }

  if (!proposta) {
    res.status(400).json({ error: "Proposta não encontrada ou link inválido" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente" && proposta.status !== "aceita" && proposta.status !== "rascunho") {
    res.status(400).json({ error: `Esta proposta não pode mais ser aceita (status: ${proposta.status})` });
    return;
  }

  if (proposta.validadeAte && new Date(proposta.validadeAte) < new Date()) {
    res.status(400).json({ error: "Esta proposta expirou e não pode mais ser aceita" });
    return;
  }

  if (proposta.leadId && (parsed.data.nome || parsed.data.email || parsed.data.telefone || parsed.data.documento)) {
    const leadPatch: Partial<typeof leadsTable.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.nome) leadPatch.nome = parsed.data.nome;
    if (parsed.data.email) leadPatch.email = parsed.data.email.toLowerCase();
    if (parsed.data.telefone) leadPatch.telefone = parsed.data.telefone;
    if (parsed.data.documento) leadPatch.documento = parsed.data.documento;
    await db
      .update(leadsTable)
      .set(leadPatch)
      .where(eq(leadsTable.id, proposta.leadId));
  }

  const ip = (req.headers["x-forwarded-for"] as string) ?? req.ip ?? undefined;

  const result = await proposalAccepted(proposta.id, "link", {
    ip,
    nome: parsed.data.nome,
    documento: parsed.data.documento,
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(409).json({ error: "Esta proposta já foi aceita anteriormente" });
    return;
  }

  res.status(200).json({ message: "Proposta aceita com sucesso", propostaId: result.propostaId });
});

export default router;
