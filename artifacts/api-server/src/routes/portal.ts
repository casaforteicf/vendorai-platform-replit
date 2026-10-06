import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { authenticate } from "../middlewares/auth.js";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import {
  db,
  pool,
  obrasTable,
  tenantsTable,
  obraEtapasTable,
  obraOrcamentosTable,
  obraOrcamentoEtapasTable,
  obraOrcamentoItensTable,
  obraDiarioTable,
  archProjetosTable,
  archCenasTable,
  archAiRendersTable,
  archRenderSolicitacoesTable,
  DEFAULT_OBRA_PORTAL_CONFIG,
  type ObraPortalConfig,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const portalStorage = new ObjectStorageService();

function portalConfig(raw: unknown): ObraPortalConfig {
  const value = raw && typeof raw === "object" ? raw as Partial<ObraPortalConfig> : {};
  return { ...DEFAULT_OBRA_PORTAL_CONFIG, ...value };
}

function portalBearer(req: any) {
  const header = String(req.headers?.authorization ?? "");
  if (header.startsWith("Bearer ")) return header.slice(7).trim();

  const cookieHeader = String(req.headers?.cookie ?? "");
  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("vendorai_obra_portal_session="));
  return sessionCookie ? decodeURIComponent(sessionCookie.split("=").slice(1).join("=")) : "";
}

function setPortalSessionCookie(res: any, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `vendorai_obra_portal_session=${encodeURIComponent(token)}; Path=/api/portal/obra/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
  );
}

function hashPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function resolvePortalUser(req: any, obraId: string) {
  const token = portalBearer(req);
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.obra_id, u.tenant_id
       FROM obra_portal_sessions s
       INNER JOIN obra_portal_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
        AND u.obra_id = $2 AND u.status = 'ativo'
      LIMIT 1`,
    [hashPortalToken(token), obraId],
  );
  return result.rows[0] ?? null;
}

async function createPortalSession(userId: string) {
  const raw = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO obra_portal_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1,$2,$3,now() + interval '30 days')`,
    [crypto.randomUUID(), userId, hashPortalToken(raw)],
  );
  return raw;
}

function portalObjectPath(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return raw;
  if (raw.startsWith("/api/storage/objects/")) {
    return `/objects/${raw.slice("/api/storage/objects/".length)}`;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/api/storage/objects/")) {
      return `/objects/${parsed.pathname.slice("/api/storage/objects/".length)}`;
    }
    if (parsed.pathname.startsWith("/objects/")) return parsed.pathname;
  } catch {
    // not an absolute URL
  }
  return null;
}

async function requirePortalAssetAccess(req: any, res: any, obra: any, config: ObraPortalConfig) {
  if (!config.requireLogin) return true;
  const user = await resolvePortalUser(req, obra.id);
  if (user) return true;
  res.status(401).send("Faça login para acessar este arquivo.");
  return false;
}

async function streamPortalObject(res: any, value: unknown) {
  const objectPath = portalObjectPath(value);
  if (!objectPath) return false;
  const file = await portalStorage.getObjectEntityFile(objectPath);
  const objectResponse = await portalStorage.downloadObject(file, 300);
  objectResponse.headers.forEach((headerValue, key) => res.setHeader(key, headerValue));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(objectResponse.status);
  res.send(Buffer.from(await objectResponse.arrayBuffer()));
  return true;
}

async function getArqdorPortalProject(token: string) {
  const [project] = await db.select().from(archProjetosTable)
    .where(and(eq(archProjetosTable.portalToken, token), eq(archProjetosTable.portalAtivo, true)))
    .limit(1);
  return project ?? null;
}

router.get("/portal/arqdor/:token/versions", async (req, res) => {
  const token = String(req.params.token ?? "");
  const project = await getArqdorPortalProject(token);
  if (!project) return res.status(404).json({ error: "Portal não encontrado ou inativo." });

  const versions = await db.select({
    id: archAiRendersTable.id,
    parentRenderId: archAiRendersTable.parentRenderId,
    ambiente: archAiRendersTable.ambiente,
    operationType: archAiRendersTable.operationType,
    materialId: archAiRendersTable.materialId,
    materialName: archAiRendersTable.materialName,
    resultImageUrl: archAiRendersTable.resultImageUrl,
    originalImageUrl: archAiRendersTable.originalImageUrl,
    versionTag: archAiRendersTable.versionTag,
    status: archAiRendersTable.status,
    approvedAt: archAiRendersTable.approvedAt,
    approvalNote: archAiRendersTable.approvalNote,
    createdAt: archAiRendersTable.createdAt,
    concluidoEm: archAiRendersTable.concluidoEm,
  }).from(archAiRendersTable).where(and(
    eq(archAiRendersTable.tenantId, project.tenantId),
    eq(archAiRendersTable.projectId, project.id),
    eq(archAiRendersTable.status, "concluido"),
  )).orderBy(asc(archAiRendersTable.createdAt));

  const numbered = versions.map((version, index) => ({
    ...version,
    resultImageUrl: version.resultImageUrl
      ? `/api/portal/arqdor/${encodeURIComponent(token)}/renders/${encodeURIComponent(version.id)}/result`
      : null,
    originalImageUrl: version.originalImageUrl
      ? `/api/portal/arqdor/${encodeURIComponent(token)}/renders/${encodeURIComponent(version.id)}/original`
      : null,
    versionNumber: index + 1,
  }));
  const byEnvironment = numbered.reduce<Record<string, typeof numbered>>((acc, version) => {
    const key = version.ambiente || "sem_ambiente";
    (acc[key] ??= []).push(version);
    return acc;
  }, {});

  return res.json({ project: { id: project.id, title: project.titulo, clientName: project.clienteNome }, versions: numbered, byEnvironment });
});

router.get("/portal/arqdor/:token/renders/:renderId/:variant", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const renderId = String(req.params.renderId ?? "");
    const variant = String(req.params.variant ?? "");
    if (!["result","original"].includes(variant)) return res.status(404).send("Arquivo não encontrado.");

    const project = await getArqdorPortalProject(token);
    if (!project) return res.status(404).send("Portal não encontrado ou inativo.");

    const [render] = await db.select({
      id: archAiRendersTable.id,
      resultImageUrl: archAiRendersTable.resultImageUrl,
      originalImageUrl: archAiRendersTable.originalImageUrl,
      status: archAiRendersTable.status,
    }).from(archAiRendersTable).where(and(
      eq(archAiRendersTable.id, renderId),
      eq(archAiRendersTable.tenantId, project.tenantId),
      eq(archAiRendersTable.projectId, project.id),
    )).limit(1);

    if (!render || render.status !== "concluido") return res.status(404).send("Render não encontrado.");
    const source = variant === "original" ? render.originalImageUrl : render.resultImageUrl;
    if (!source) return res.status(404).send("Arquivo não encontrado.");

    if (await streamPortalObject(res, source)) return;
    if (/^https:\/\//i.test(String(source))) return res.redirect(302, String(source));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.post("/portal/arqdor/:token/revisions", async (req, res) => {
  const token = String(req.params.token ?? "");
  const project = await getArqdorPortalProject(token);
  if (!project) return res.status(404).json({ error: "Portal não encontrado ou inativo." });

  const cenaId = String(req.body?.cenaId ?? "").trim();
  const sourceAiRenderId = String(req.body?.sourceAiRenderId ?? "").trim();
  const observacoes = typeof req.body?.observacoes === "string" ? req.body.observacoes.trim() : "";
  const clienteNome = typeof req.body?.clienteNome === "string" && req.body.clienteNome.trim()
    ? req.body.clienteNome.trim()
    : project.clienteNome ?? null;

  if (!cenaId || !sourceAiRenderId) return res.status(400).json({ error: "cenaId e sourceAiRenderId são obrigatórios." });
  if (!observacoes && !Array.isArray(req.body?.itensAdicionados) && !Array.isArray(req.body?.texturasAlteradas)) {
    return res.status(400).json({ error: "Descreva a revisão solicitada." });
  }

  const [scene] = await db.select({ id: archCenasTable.id, projetoId: archCenasTable.projetoId })
    .from(archCenasTable)
    .where(and(eq(archCenasTable.id, cenaId), eq(archCenasTable.projetoId, project.id)))
    .limit(1);
  if (!scene) return res.status(404).json({ error: "Cena não pertence a este projeto." });

  const [sourceVersion] = await db.select({ id: archAiRendersTable.id, status: archAiRendersTable.status })
    .from(archAiRendersTable)
    .where(and(
      eq(archAiRendersTable.id, sourceAiRenderId),
      eq(archAiRendersTable.tenantId, project.tenantId),
      eq(archAiRendersTable.projectId, project.id),
    )).limit(1);
  if (!sourceVersion) return res.status(404).json({ error: "Versão do render não pertence a este projeto." });
  if (sourceVersion.status !== "concluido") return res.status(409).json({ error: "Somente versões concluídas podem receber pedido de revisão." });

  const [revision] = await db.insert(archRenderSolicitacoesTable).values({
    cenaId,
    clienteNome,
    status: "pendente",
    sourceAiRenderId,
    itensAdicionados: Array.isArray(req.body?.itensAdicionados) ? req.body.itensAdicionados : [],
    texturasAlteradas: Array.isArray(req.body?.texturasAlteradas) ? req.body.texturasAlteradas : [],
    observacoes: observacoes || null,
  } as any).returning();

  return res.status(201).json({ revision, projectId: project.id, sourceAiRenderId, nextAction: "revisao_pendente" });
});

router.post("/portal/obra/:token/register", async (req, res) => {
  const token = String(req.params.token ?? "");
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const config = portalConfig(obra.portalConfig);
  if (!config.allowSelfRegistration) return res.status(403).json({ error: "Cadastro pelo cliente está desativado." });

  const nome = String(req.body?.nome ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const telefone = String(req.body?.telefone ?? "").trim() || null;
  const password = String(req.body?.password ?? "");
  if (!nome || !email || !email.includes("@") || password.length < 8) {
    return res.status(422).json({ error: "Informe nome, e-mail válido e senha com ao menos 8 caracteres." });
  }

  const existing = await pool.query(
    `SELECT id FROM obra_portal_users WHERE obra_id=$1 AND lower(email)=lower($2) LIMIT 1`,
    [obra.id, email],
  );
  if (existing.rows[0]) return res.status(409).json({ error: "Já existe uma conta para este e-mail nesta obra." });

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO obra_portal_users (id, tenant_id, obra_id, nome, email, telefone, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, obra.tenantId, obra.id, nome, email, telefone, passwordHash],
  );
  const sessionToken = await createPortalSession(userId);
  setPortalSessionCookie(res, sessionToken);
  return res.status(201).json({ token: sessionToken, user: { id: userId, nome, email, telefone } });
});

router.post("/portal/obra/:token/login", async (req, res) => {
  const token = String(req.params.token ?? "");
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const result = await pool.query(
    `SELECT * FROM obra_portal_users WHERE obra_id=$1 AND lower(email)=lower($2) AND status='ativo' LIMIT 1`,
    [obra.id, email],
  );
  const user = result.rows[0];
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ error: "E-mail ou senha inválidos." });
  }
  await pool.query(`UPDATE obra_portal_users SET ultimo_login_em=now(), updated_at=now() WHERE id=$1`, [user.id]);
  const sessionToken = await createPortalSession(user.id);
  setPortalSessionCookie(res, sessionToken);
  return res.json({ token: sessionToken, user: { id: user.id, nome: user.nome, email: user.email, telefone: user.telefone } });
});

router.get("/portal/obra/:token/me", async (req, res) => {
  const token = String(req.params.token ?? "");
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const user = await resolvePortalUser(req, obra.id);
  if (!user) return res.status(401).json({ error: "Sessão inválida ou expirada." });
  return res.json({ user });
});

router.post("/portal/obra/:token/support", async (req, res) => {
  const token = String(req.params.token ?? "");
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const user = await resolvePortalUser(req, obra.id);
  if (!user) return res.status(401).json({ error: "Faça login para abrir uma solicitação." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showSupport) return res.status(403).json({ error: "Suporte não está habilitado neste portal." });

  const assunto = String(req.body?.assunto ?? "").trim();
  const descricao = String(req.body?.descricao ?? "").trim();
  const prioridade = ["baixa","normal","alta","urgente"].includes(String(req.body?.prioridade))
    ? String(req.body.prioridade) : "normal";
  if (!assunto || !descricao) return res.status(422).json({ error: "Assunto e descrição são obrigatórios." });

  const result = await pool.query(
    `INSERT INTO obra_portal_support_tickets
       (id,tenant_id,obra_id,portal_user_id,assunto,descricao,prioridade,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'aberto') RETURNING *`,
    [crypto.randomUUID(), obra.tenantId, obra.id, user.id, assunto, descricao, prioridade],
  );
  return res.status(201).json({ ticket: result.rows[0] });
});

router.post("/portal/obra/:token/messages", async (req, res) => {
  const token = String(req.params.token ?? "");
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const user = await resolvePortalUser(req, obra.id);
  if (!user) return res.status(401).json({ error: "Faça login para enviar mensagens." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showChat) return res.status(403).json({ error: "Chat não está habilitado neste portal." });

  const mensagem = String(req.body?.mensagem ?? "").trim();
  if (!mensagem) return res.status(422).json({ error: "Mensagem vazia." });
  const result = await pool.query(
    `INSERT INTO obra_portal_messages
       (id,tenant_id,obra_id,portal_user_id,autor_tipo,autor_nome,mensagem)
     VALUES ($1,$2,$3,$4,'cliente',$5,$6) RETURNING *`,
    [crypto.randomUUID(), obra.tenantId, obra.id, user.id, user.nome, mensagem],
  );
  return res.status(201).json({ message: result.rows[0] });
});

router.get("/portal/obra/:token", async (req, res) => {
  const { token } = req.params;
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });

  const config = portalConfig(obra.portalConfig);
  const portalUser = await resolvePortalUser(req, obra.id);
  const authenticated = Boolean(portalUser);
  const [tenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable).where(eq(tenantsTable.id, obra.tenantId));

  if (config.requireLogin && !authenticated) {
    return res.json({
      publication: config,
      auth: {
        required: true,
        authenticated: false,
        allowSelfRegistration: config.allowSelfRegistration,
        user: null,
      },
      obra: {
        id: obra.id,
        nome: obra.nome,
        clienteNome: obra.clienteNome,
        status: obra.status,
      },
      tenant: tenant ?? { id: obra.tenantId, name: "Construtora" },
      locked: true,
    });
  }

  const etapas = await db.select().from(obraEtapasTable)
    .where(eq(obraEtapasTable.obraId, obra.id))
    .orderBy(asc(obraEtapasTable.ordem));

  const fases = config.showSchedule
    ? (await pool.query(
        `SELECT f.id, f.obra_id, f.etapa_id, f.origem_fase_id, f.nome, f.ordem,
                f.data_inicio_prevista, f.data_fim_prevista, f.data_inicio_real, f.data_fim_real,
                f.status, f.percentual_etapa, f.percentual_executado, f.custo_previsto
           FROM obra_etapa_fases f
          WHERE f.obra_id = $1
          ORDER BY f.etapa_id, f.ordem`,
        [obra.id],
      )).rows
    : [];

  let orcamentoComEtapas: any = null;
  if (config.showBudget) {
    const orcamentos = await db.select().from(obraOrcamentosTable)
      .where(and(eq(obraOrcamentosTable.obraId, obra.id), eq(obraOrcamentosTable.tenantId, obra.tenantId)))
      .orderBy(desc(obraOrcamentosTable.versao));
    const orcamento = orcamentos.find((o) => o.status === "aprovado") ?? orcamentos.find((o) => o.status === "enviado") ?? null;
    if (orcamento) {
      const orcEtapas = await db.select().from(obraOrcamentoEtapasTable)
        .where(eq(obraOrcamentoEtapasTable.orcamentoId, orcamento.id)).orderBy(asc(obraOrcamentoEtapasTable.ordem));
      const etapaIds = orcEtapas.map((e) => e.id);
      const allItens = etapaIds.length > 0
        ? await db.select().from(obraOrcamentoItensTable).where(inArray(obraOrcamentoItensTable.etapaId, etapaIds)).orderBy(asc(obraOrcamentoItensTable.ordem))
        : [];
      const byEtapa: Record<string, typeof allItens> = {};
      for (const item of allItens) (byEtapa[item.etapaId] ??= []).push(item);
      orcamentoComEtapas = { ...orcamento, etapas: orcEtapas.map((e) => ({ ...e, itens: byEtapa[e.id] ?? [] })) };
    }
  }

  let diario: any[] = [];
  if (config.showDiary || config.showDocuments || config.showDiaryPhotos) {
    diario = await db.select().from(obraDiarioTable)
      .where(and(eq(obraDiarioTable.obraId, obra.id), eq(obraDiarioTable.status, "aprovado")))
      .orderBy(desc(obraDiarioTable.data)).limit(12);

    diario = diario.map((entry: any) => ({
      ...entry,
      fotos: config.showDiaryPhotos
        ? (Array.isArray(entry.fotos) ? entry.fotos : []).map((foto: any, index: number) => ({
            ...foto,
            url: `/api/portal/obra/${encodeURIComponent(String(token))}/diary/${encodeURIComponent(String(entry.id))}/foto/${index}`,
          }))
        : [],
      videos: config.showDiaryPhotos
        ? (Array.isArray(entry.videos) ? entry.videos : []).map((video: any, index: number) => ({
            ...video,
            url: `/api/portal/obra/${encodeURIComponent(String(token))}/diary/${encodeURIComponent(String(entry.id))}/video/${index}`,
          }))
        : [],
      anexos: config.showDocuments
        ? (Array.isArray(entry.anexos) ? entry.anexos : []).map((anexo: any, index: number) => ({
            ...anexo,
            url: `/api/portal/obra/${encodeURIComponent(String(token))}/diary/${encodeURIComponent(String(entry.id))}/anexo/${index}`,
          }))
        : [],
    }));
  }

  const ocorrencias = config.showDiary
    ? diario.filter((entry) => Boolean(entry.observacoes)).slice(0, 10).map((entry) => ({
        id: entry.id,
        data: entry.data,
        observacoes: entry.observacoes,
        status: entry.status,
        responsavelNome: entry.responsavelNome,
      }))
    : [];

  let decisions: any[] = [];
  if (config.showClientDecisions) {
    const result = await pool.query(
      `SELECT id, title, description, category, priority, due_date, options, financial_impact, schedule_impact_days
         FROM arch_project_decisions
        WHERE obra_id = $1
          AND tenant_id::text = $2
          AND decision_type = 'client'
          AND status = 'pending'
        ORDER BY
          CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
          due_date ASC NULLS LAST,
          created_at DESC
        LIMIT 30`,
      [obra.id, obra.tenantId],
    );
    decisions = result.rows;
  }

  const etapaRows = etapas as any[];
  const weightedBase = etapaRows.reduce((sum, item) => sum + Number(item.pesoFisico ?? item.peso_fisico ?? 0), 0);
  const progressoGeral = etapaRows.length
    ? weightedBase > 0
      ? etapaRows.reduce((sum, item) => sum + Number(item.percentualExecutado ?? item.percentual_executado ?? 0) * Number(item.pesoFisico ?? item.peso_fisico ?? 0), 0) / weightedBase
      : etapaRows.reduce((sum, item) => sum + Number(item.percentualExecutado ?? item.percentual_executado ?? 0), 0) / etapaRows.length
    : 0;

  const etapaAtual = config.showOverview && etapaRows.length
    ? etapaRows
        .filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) > 0 && Number(item.percentualExecutado ?? item.percentual_executado ?? 0) < 100)
        .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))[0] ?? null
    : null;

  const proximasEtapas = config.showOverview
    ? etapaRows
        .filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) <= 0)
        .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))
        .slice(0, 4)
    : [];

  const marcos = config.showMilestones
    ? etapaRows.filter((item) => Boolean(item.marco)).map((item) => ({
        id: item.id,
        nome: item.nome,
        status: item.status,
        percentualExecutado: item.percentualExecutado ?? item.percentual_executado,
        dataInicioPrevista: item.dataInicioPrevista ?? item.data_inicio_prevista,
        dataFimPrevista: item.dataFimPrevista ?? item.data_fim_prevista,
        dataFimReal: item.dataFimReal ?? item.data_fim_real,
      }))
    : [];

  let medicoes: any[] = [];
  if (config.showMeasurements && config.showSchedule) {
    const stageResult = await pool.query(
      `SELECT m.id, m.etapa_id, e.nome AS etapa_nome, NULL::text AS fase_id, NULL::text AS fase_nome,
              m.data, m.percentual_anterior, m.percentual_novo, m.observacao, m.created_at,
              NULL::numeric AS valor_bruto, NULL::numeric AS amortizacao_entrada,
              NULL::numeric AS valor_liquido, NULL::numeric AS saldo_entrada_apos
         FROM obra_etapa_medicoes m
         INNER JOIN obra_etapas e ON e.id = m.etapa_id
        WHERE e.obra_id = $1
        ORDER BY m.data DESC, m.created_at DESC
        LIMIT 80`,
      [obra.id],
    );
    const phaseResult = await pool.query(
      `SELECT m.id, f.etapa_id, e.nome AS etapa_nome, m.fase_id, f.nome AS fase_nome,
              m.data, m.percentual_anterior, m.percentual_novo, m.observacao, m.created_at,
              m.valor_bruto, m.amortizacao_entrada, m.valor_liquido, m.saldo_entrada_apos
         FROM obra_etapa_fase_medicoes m
         INNER JOIN obra_etapa_fases f ON f.id = m.fase_id
         INNER JOIN obra_etapas e ON e.id = f.etapa_id
        WHERE f.obra_id = $1
        ORDER BY m.data DESC, m.created_at DESC
        LIMIT 120`,
      [obra.id],
    );
    medicoes = [...stageResult.rows, ...phaseResult.rows]
      .sort((a, b) => String(b.data ?? b.created_at).localeCompare(String(a.data ?? a.created_at)))
      .slice(0, 120);
  }

  let documentos: any[] = config.showDocuments
    ? diario.flatMap((entry: any) => {
        const anexos = Array.isArray(entry.anexos) ? entry.anexos : [];
        return anexos.map((anexo: any, index: number) => ({
          id: `${entry.id}-${index}`,
          diarioId: entry.id,
          data: entry.data,
          nome: anexo.name ?? anexo.caption ?? `Documento ${index + 1}`,
          url: anexo.url,
          mimeType: anexo.mimeType ?? null,
          tipo: "diario",
        }));
      })
    : [];

  let compras: any[] = [];
  if (config.showProcurementSummary) {
    const result = await pool.query(
      `SELECT c.id, c.descricao, c.fornecedor, c.status, c.prioridade,
              c.data_prevista, c.data_efetuada, c.data_necessidade,
              c.prazo_fornecedor_dias,
              CASE WHEN $3::boolean THEN c.valor_total ELSE NULL END AS valor_total,
              e.nome AS etapa_nome
         FROM compras_obras c
         LEFT JOIN obra_etapas e ON e.id = c.etapa_id AND e.obra_id = c.obra_id
        WHERE c.obra_id = $1 AND c.tenant_id = $2
        ORDER BY
          CASE c.status WHEN 'recebido' THEN 2 WHEN 'cancelado' THEN 3 ELSE 0 END,
          COALESCE(c.data_necessidade, e.data_inicio_prevista) ASC NULLS LAST,
          c.created_at DESC
        LIMIT 60`,
      [obra.id, obra.tenantId, config.showFinancialSummary],
    );
    compras = result.rows;
  }

  const comprasRecebidas = config.showFinancialSummary
    ? await pool.query(
        `SELECT COALESCE(SUM(valor_total),0)::numeric AS total
           FROM compras_obras
          WHERE obra_id = $1 AND tenant_id = $2
            AND lower(status) IN ('recebido','parcial')`,
        [obra.id, obra.tenantId],
      )
    : null;

  const maoObraExecutada = config.showFinancialSummary
    ? etapaRows.reduce((sum: number, item: any) => {
        const percentual = Math.max(0, Math.min(100, Number(item.percentualExecutado ?? item.percentual_executado ?? 0))) / 100;
        if (percentual <= 0) return sum;
        const inicio = item.dataInicioPrevista ?? item.data_inicio_prevista;
        const fim = item.dataFimPrevista ?? item.data_fim_prevista;
        if (!inicio || !fim) return sum;
        const start = new Date(`${inicio}T12:00:00Z`);
        const end = new Date(`${fim}T12:00:00Z`);
        const dias = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
        const planejado = dias
          * Math.max(1, Number(item.equipeQuantidade ?? item.equipe_quantidade ?? 1))
          * Math.max(0, Number(item.horasDia ?? item.horas_dia ?? 8))
          * Math.max(0, Number(item.custoHoraPessoa ?? item.custo_hora_pessoa ?? 0));
        return sum + planejado * percentual;
      }, 0)
    : 0;

  const custoRealizadoCalculado = config.showFinancialSummary
    ? Number(comprasRecebidas?.rows?.[0]?.total ?? 0) + maoObraExecutada
    : Number(obra.custoRealizado ?? 0);

  let financeiro: any = null;
  if (config.showFinancialSummary) {
    const result = config.showFinancialDetails
      ? await pool.query(
          `SELECT id, tipo, fornecedor, numero, valor, data_emissao, data_vencimento,
                  descricao, status, documento_url, observacoes
             FROM obra_lancamentos
            WHERE obra_id = $1 AND tenant_id = $2
            ORDER BY COALESCE(data_vencimento, data_emissao) DESC NULLS LAST, created_at DESC
            LIMIT 100`,
          [obra.id, obra.tenantId],
        )
      : { rows: [] as any[] };

    const lancamentos = result.rows;
    const totalLancado = lancamentos.reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);
    const totalPago = lancamentos
      .filter((item: any) => ["pago", "recebido", "quitado"].includes(String(item.status ?? "").toLowerCase()))
      .reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);
    const totalPendente = lancamentos
      .filter((item: any) => !["pago", "recebido", "quitado", "cancelado"].includes(String(item.status ?? "").toLowerCase()))
      .reduce((sum: number, item: any) => sum + Number(item.valor ?? 0), 0);

    if (config.showDocuments && config.showFinancialDetails) {
      const financialDocs = result.rows
        .filter((item: any) => Boolean(item.documento_url))
        .map((item: any) => ({
          id: `financeiro-${item.id}`,
          nome: item.descricao ?? item.numero ?? item.tipo ?? "Documento financeiro",
          url: `/api/portal/obra/${encodeURIComponent(String(token))}/financial/${encodeURIComponent(String(item.id))}/document`,
          mimeType: null,
          data: item.data_emissao ?? item.data_vencimento ?? null,
          tipo: "financeiro",
        }));
      documentos = [...documentos, ...financialDocs];
    }

    financeiro = {
      orcamentoTotal: Number(obra.orcamentoTotal ?? 0),
      custoRealizado: custoRealizadoCalculado,
      percentualConsumido: Number(obra.orcamentoTotal ?? 0) > 0
        ? custoRealizadoCalculado / Number(obra.orcamentoTotal ?? 0) * 100
        : 0,
      totalLancado: config.showFinancialDetails ? totalLancado : null,
      totalPago: config.showFinancialDetails ? totalPago : null,
      totalPendente: config.showFinancialDetails ? totalPendente : null,
      lancamentos: config.showFinancialDetails
        ? lancamentos.map((item: any) => ({
            ...item,
            documento_url: item.documento_url
              ? `/api/portal/obra/${encodeURIComponent(String(token))}/financial/${encodeURIComponent(String(item.id))}/document`
              : null,
          }))
        : [],
    };
  }

  let galeriaProjeto: any[] = [];
  if (config.showProjectGallery) {
    const projectResult = await pool.query(
      `SELECT id, titulo
         FROM arch_projetos
        WHERE obra_id = $1 AND tenant_id = $2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [obra.id, obra.tenantId],
    );
    const project = projectResult.rows[0];
    if (project) {
      const renders = await pool.query(
        `SELECT id, ambiente, material_name, result_image_url, version_tag,
                status, approved_at, approval_note, created_at
           FROM arch_ai_renders
          WHERE project_id = $1
            AND tenant_id = $2
            AND status = 'concluido'
            AND approved_at IS NOT NULL
            AND result_image_url IS NOT NULL
          ORDER BY
            CASE WHEN approved_at IS NOT NULL THEN 0 ELSE 1 END,
            created_at DESC
          LIMIT 40`,
        [project.id, obra.tenantId],
      );
      galeriaProjeto = renders.rows.map((render: any) => ({
        ...render,
        result_image_url: `/api/portal/obra/${encodeURIComponent(String(token))}/renders/${encodeURIComponent(String(render.id))}`,
      }));
    }
  }

  const fotosRecentes = config.showDiaryPhotos
    ? diario.flatMap((entry: any) => {
        const fotos = Array.isArray(entry.fotos) ? entry.fotos : [];
        return fotos.map((foto: any, index: number) => ({
          id: `${entry.id}-foto-${index}`,
          diarioId: entry.id,
          data: entry.data,
          url: foto.url,
          caption: foto.caption ?? null,
        }));
      }).slice(0, 30)
    : [];

  const previsaoEntrega = config.showOverview
    ? (
        obra.dataFimPrevista
        ?? etapaRows.map((item) => item.dataFimPrevista ?? item.data_fim_prevista).filter(Boolean).sort().at(-1)
        ?? null
      )
    : null;

  const today = new Date();
  const executiveStages = etapaRows.map((item: any) => {
    const startRaw = item.dataInicioPrevista ?? item.data_inicio_prevista;
    const endRaw = item.dataFimPrevista ?? item.data_fim_prevista;
    const start = startRaw ? new Date(`${String(startRaw).slice(0,10)}T12:00:00Z`) : null;
    const end = endRaw ? new Date(`${String(endRaw).slice(0,10)}T12:00:00Z`) : null;
    let plannedPercent = 0;
    if (start && end) {
      if (today >= end) plannedPercent = 100;
      else if (today > start) plannedPercent = Math.max(0, Math.min(100, ((today.getTime() - start.getTime()) / Math.max(1, end.getTime() - start.getTime())) * 100));
    }
    const actualPercent = Math.max(0, Math.min(100, Number(item.percentualExecutado ?? item.percentual_executado ?? 0)));
    const plannedCost = Number(item.custoPrevisto ?? item.custo_previsto ?? 0);
    return {
      etapaId: item.id,
      nome: item.nome,
      plannedPercent,
      actualPercent,
      variancePoints: actualPercent - plannedPercent,
      plannedCost,
      earnedValue: plannedCost * actualPercent / 100,
      status: item.status,
      dataInicioPrevista: startRaw ?? null,
      dataFimPrevista: endRaw ?? null,
    };
  });
  const plannedProgress = weightedBase > 0
    ? executiveStages.reduce((sum, stage, index) => sum + stage.plannedPercent * Number(etapaRows[index]?.pesoFisico ?? etapaRows[index]?.peso_fisico ?? 0), 0) / weightedBase
    : executiveStages.length ? executiveStages.reduce((sum, stage) => sum + stage.plannedPercent, 0) / executiveStages.length : 0;

  const executiveBalance = config.showExecutiveBalance ? {
    plannedProgress,
    actualProgress: progressoGeral,
    progressVariancePoints: progressoGeral - plannedProgress,
    plannedCost: etapaRows.reduce((sum, item) => sum + Number(item.custoPrevisto ?? item.custo_previsto ?? 0), 0),
    actualCost: custoRealizadoCalculado,
    forecastDelivery: previsaoEntrega,
    stages: executiveStages,
  } : null;

  let commercial: any = null;
  if (config.showProposals) {
    const projectResult = await pool.query(
      `SELECT id, titulo, proposta_id FROM arch_projetos
        WHERE obra_id=$1 AND tenant_id=$2
        ORDER BY updated_at DESC LIMIT 1`,
      [obra.id, obra.tenantId],
    );
    const project = projectResult.rows[0];
    if (project) {
      const [budgetResult, proposalResult] = await Promise.all([
        pool.query(
          `SELECT id,title,status,version,subtotal,discount_total,grand_total,client_notes,updated_at
             FROM arch_budgets
            WHERE project_id=$1::uuid AND tenant_id::text=$2 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1`,
          [project.id, obra.tenantId],
        ),
        pool.query(
          `SELECT id,title,status,version,grand_total,expires_at,sent_at,viewed_at,approved_at,rejected_at,client_notes
             FROM arch_proposals
            WHERE project_id=$1::uuid AND tenant_id::text=$2 AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 1`,
          [project.id, obra.tenantId],
        ),
      ]);
      const budget = budgetResult.rows[0] ?? null;
      const proposal = proposalResult.rows[0] ?? null;
      const proposalItems = proposal
        ? (await pool.query(
            `SELECT id,item,description,quantity,unit,total,approval_status,client_comment
               FROM arch_proposal_items
              WHERE proposal_id=$1 AND visible_to_client=true
              ORDER BY sort_order ASC, created_at ASC`,
            [proposal.id],
          )).rows
        : [];
      commercial = { project: { id: project.id, titulo: project.titulo }, budget, proposal, proposalItems };
    }
  }

  const canReadPrivateLibrary = !config.requireLogin || authenticated;
  const privateDocuments = (canReadPrivateLibrary && (config.showDocuments || config.showContracts || config.showManuals))
    ? (await pool.query(
        `SELECT id,categoria,titulo,descricao,url,mime_type,versao,created_at
           FROM obra_portal_documents
          WHERE obra_id=$1 AND tenant_id=$2 AND publicado_cliente=true
          ORDER BY categoria ASC, created_at DESC`,
        [obra.id, obra.tenantId],
      )).rows.map((item: any) => ({
        ...item,
        url: `/api/portal/obra/${encodeURIComponent(String(token))}/documents/${encodeURIComponent(String(item.id))}`,
      }))
    : [];

  const contracts = config.showContracts ? privateDocuments.filter((item: any) => item.categoria === "contrato") : [];
  const manuals = config.showManuals ? privateDocuments.filter((item: any) => ["manual","garantia"].includes(item.categoria)) : [];
  const projectDocuments = config.showDocuments ? privateDocuments.filter((item: any) => !["contrato","manual","garantia"].includes(item.categoria)) : [];

  const invoices = (canReadPrivateLibrary && config.showInvoices)
    ? (await pool.query(
        `SELECT id,numero,fornecedor,valor,data_emissao,data_vencimento,status,descricao,documento_url
           FROM obra_lancamentos
          WHERE obra_id=$1 AND tenant_id=$2 AND tipo='nota_fiscal'
          ORDER BY data_emissao DESC NULLS LAST, created_at DESC LIMIT 100`,
        [obra.id, obra.tenantId],
      )).rows.map((item: any) => ({
        ...item,
        documento_url: item.documento_url
          ? `/api/portal/obra/${encodeURIComponent(String(token))}/invoices/${encodeURIComponent(String(item.id))}/document`
          : null,
      }))
    : [];

  const supportTickets = (authenticated && config.showSupport)
    ? (await pool.query(
        `SELECT id,assunto,descricao,prioridade,status,created_at,updated_at,closed_at
           FROM obra_portal_support_tickets
          WHERE obra_id=$1 AND tenant_id=$2 AND portal_user_id=$3
          ORDER BY created_at DESC LIMIT 100`,
        [obra.id, obra.tenantId, portalUser.id],
      )).rows
    : [];

  const chatMessages = (authenticated && config.showChat)
    ? (await pool.query(
        `SELECT id,autor_tipo,autor_nome,mensagem,created_at
           FROM obra_portal_messages
          WHERE obra_id=$1 AND tenant_id=$2
          ORDER BY created_at ASC LIMIT 300`,
        [obra.id, obra.tenantId],
      )).rows
    : [];

  return res.json({
    publication: config,
    auth: {
      required: config.requireLogin,
      authenticated,
      allowSelfRegistration: config.allowSelfRegistration,
      user: portalUser ? { id: portalUser.id, nome: portalUser.nome, email: portalUser.email, telefone: portalUser.telefone } : null,
    },
    locked: false,
    obra: {
      id: obra.id,
      nome: obra.nome,
      descricao: config.showOverview ? obra.descricao : null,
      clienteNome: obra.clienteNome,
      endereco: config.showOverview ? obra.endereco : null,
      status: obra.status,
      dataInicio: config.showOverview ? obra.dataInicio : null,
      dataFimPrevista: config.showOverview ? obra.dataFimPrevista : null,
      dataFimReal: config.showOverview ? obra.dataFimReal : null,
      orcamentoTotal: config.showFinancialSummary ? obra.orcamentoTotal : null,
      custoRealizado: config.showFinancialSummary ? String(custoRealizadoCalculado) : null,
    },
    tenant: tenant ?? { id: obra.tenantId, name: "Construtora" },
    orcamento: orcamentoComEtapas,
    etapas: config.showSchedule ? etapas : [],
    fases,
    diario: config.showDiary ? diario : [],
    ocorrencias,
    decisions,
    resumo: config.showOverview ? {
      progressoGeral,
      etapaAtual,
      proximasEtapas,
      previsaoEntrega,
      etapasConcluidas: etapaRows.filter((item) => Number(item.percentualExecutado ?? item.percentual_executado ?? 0) >= 100).length,
      totalEtapas: etapaRows.length,
      decisoesPendentes: decisions.length,
      ocorrenciasAbertas: ocorrencias.length,
    } : null,
    marcos,
    medicoes,
    documentos,
    compras,
    financeiro,
    galeriaProjeto,
    fotosRecentes,
    executiveBalance,
    commercial,
    contracts,
    manuals,
    projectDocuments,
    invoices,
    supportTickets,
    chatMessages,
  });
});

router.get("/portal/obra/:token/renders/:renderId", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const renderId = String(req.params.renderId ?? "");
    const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
    if (!obra) return res.status(404).send("Portal não encontrado.");

    const config = portalConfig(obra.portalConfig);
    if (!(await requirePortalAssetAccess(req, res, obra, config))) return;
    if (!config.showProjectGallery) return res.status(403).send("Galeria não publicada.");

    const projectResult = await pool.query(
      `SELECT id
         FROM arch_projetos
        WHERE obra_id=$1 AND tenant_id=$2
        ORDER BY updated_at DESC
        LIMIT 1`,
      [obra.id, obra.tenantId],
    );
    const project = projectResult.rows[0];
    if (!project) return res.status(404).send("Projeto não encontrado.");

    const [render] = await db.select({
      id: archAiRendersTable.id,
      resultImageUrl: archAiRendersTable.resultImageUrl,
      status: archAiRendersTable.status,
      approvedAt: archAiRendersTable.approvedAt,
    }).from(archAiRendersTable).where(and(
      eq(archAiRendersTable.id, renderId),
      eq(archAiRendersTable.tenantId, obra.tenantId),
      eq(archAiRendersTable.projectId, project.id),
    )).limit(1);

    if (!render || render.status !== "concluido" || !render.approvedAt || !render.resultImageUrl) {
      return res.status(404).send("Render não publicado.");
    }

    if (await streamPortalObject(res, render.resultImageUrl)) return;
    if (/^https:\/\//i.test(String(render.resultImageUrl))) return res.redirect(302, String(render.resultImageUrl));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.get("/portal/obra/:token/diary/:entryId/:kind/:index", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const entryId = String(req.params.entryId ?? "");
    const kind = String(req.params.kind ?? "");
    const index = Number(req.params.index);
    if (!["foto","video","anexo"].includes(kind) || !Number.isInteger(index) || index < 0) {
      return res.status(404).send("Arquivo não encontrado.");
    }

    const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
    if (!obra) return res.status(404).send("Portal não encontrado.");
    const config = portalConfig(obra.portalConfig);
    if (!(await requirePortalAssetAccess(req, res, obra, config))) return;
    if ((kind === "foto" || kind === "video") && !config.showDiaryPhotos) return res.status(403).send("Mídia não publicada.");
    if (kind === "anexo" && !config.showDocuments) return res.status(403).send("Documento não publicado.");

    const [entry] = await db.select().from(obraDiarioTable).where(and(
      eq(obraDiarioTable.id, entryId),
      eq(obraDiarioTable.obraId, obra.id),
      eq(obraDiarioTable.status, "aprovado"),
    )).limit(1);
    if (!entry) return res.status(404).send("Registro não encontrado.");

    const collection = kind === "foto"
      ? (Array.isArray((entry as any).fotos) ? (entry as any).fotos : [])
      : kind === "video"
        ? (Array.isArray((entry as any).videos) ? (entry as any).videos : [])
        : (Array.isArray((entry as any).anexos) ? (entry as any).anexos : []);
    const asset = collection[index];
    const source = asset?.url;
    if (!source) return res.status(404).send("Arquivo não encontrado.");

    if (await streamPortalObject(res, source)) return;
    if (/^https:\/\//i.test(String(source))) return res.redirect(302, String(source));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.get("/portal/obra/:token/documents/:documentId", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const documentId = String(req.params.documentId ?? "");
    const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
    if (!obra) return res.status(404).send("Portal não encontrado.");
    const config = portalConfig(obra.portalConfig);
    if (!(await requirePortalAssetAccess(req, res, obra, config))) return;

    const result = await pool.query(
      `SELECT id,categoria,url
         FROM obra_portal_documents
        WHERE id=$1 AND obra_id=$2 AND tenant_id=$3 AND publicado_cliente=true
        LIMIT 1`,
      [documentId, obra.id, obra.tenantId],
    );
    const doc = result.rows[0];
    if (!doc) return res.status(404).send("Documento não encontrado.");

    const allowed = doc.categoria === "contrato"
      ? config.showContracts
      : ["manual","garantia"].includes(String(doc.categoria))
        ? config.showManuals
        : config.showDocuments;
    if (!allowed) return res.status(403).send("Documento não publicado.");

    if (await streamPortalObject(res, doc.url)) return;
    if (/^https:\/\//i.test(String(doc.url))) return res.redirect(302, String(doc.url));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.get("/portal/obra/:token/financial/:entryId/document", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const entryId = String(req.params.entryId ?? "");
    const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
    if (!obra) return res.status(404).send("Portal não encontrado.");
    const config = portalConfig(obra.portalConfig);
    if (!(await requirePortalAssetAccess(req, res, obra, config))) return;
    if (!config.showDocuments || !config.showFinancialDetails) {
      return res.status(403).send("Documento financeiro não publicado.");
    }

    const result = await pool.query(
      `SELECT documento_url
         FROM obra_lancamentos
        WHERE id=$1 AND obra_id=$2 AND tenant_id=$3
        LIMIT 1`,
      [entryId, obra.id, obra.tenantId],
    );
    const source = result.rows[0]?.documento_url;
    if (!source) return res.status(404).send("Documento não encontrado.");

    if (await streamPortalObject(res, source)) return;
    if (/^https:\/\//i.test(String(source))) return res.redirect(302, String(source));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.get("/portal/obra/:token/invoices/:invoiceId/document", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const invoiceId = String(req.params.invoiceId ?? "");
    const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
    if (!obra) return res.status(404).send("Portal não encontrado.");
    const config = portalConfig(obra.portalConfig);
    if (!(await requirePortalAssetAccess(req, res, obra, config))) return;
    if (!config.showInvoices) return res.status(403).send("Notas fiscais não publicadas.");

    const result = await pool.query(
      `SELECT documento_url
         FROM obra_lancamentos
        WHERE id=$1 AND obra_id=$2 AND tenant_id=$3 AND tipo='nota_fiscal'
        LIMIT 1`,
      [invoiceId, obra.id, obra.tenantId],
    );
    const source = result.rows[0]?.documento_url;
    if (!source) return res.status(404).send("Documento não encontrado.");

    if (await streamPortalObject(res, source)) return;
    if (/^https:\/\//i.test(String(source))) return res.redirect(302, String(source));
    return res.status(404).send("Arquivo não disponível.");
  } catch (err) {
    next(err);
  }
});

router.post("/portal/obra/:token/decisions/:decisionId/respond", async (req, res) => {
  const token = String(req.params.token ?? "");
  const decisionId = String(req.params.decisionId ?? "");
  const action = String(req.body?.action ?? "");
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 15000) : "";
  const selectedOption = typeof req.body?.selectedOption === "string" ? req.body.selectedOption.trim().slice(0, 1000) : "";

  if (!decisionId) return res.status(400).json({ error: "decisionId é obrigatório." });
  if (!['approve', 'reject'].includes(action)) return res.status(422).json({ error: "Ação inválida." });
  if (action === 'reject' && !comment) return res.status(422).json({ error: "Informe o motivo da rejeição." });

  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showClientDecisions) return res.status(403).json({ error: "Decisões do cliente não estão publicadas neste portal." });

  const current = await pool.query(
    `SELECT id, status, decision_type, options
       FROM arch_project_decisions
      WHERE id = $1::uuid
        AND obra_id = $2
        AND tenant_id::text = $3
      LIMIT 1`,
    [decisionId, obra.id, obra.tenantId],
  );
  const decision = current.rows[0];
  if (!decision) return res.status(404).json({ error: "Decisão não encontrada neste portal." });
  if (decision.decision_type !== 'client') return res.status(403).json({ error: "Esta decisão não está disponível para o cliente." });
  if (decision.status !== 'pending') return res.status(409).json({ error: "Esta decisão já foi respondida." });

  const options = Array.isArray(decision.options) ? decision.options : [];
  if (selectedOption && options.length > 0 && !options.includes(selectedOption)) {
    return res.status(422).json({ error: "Opção selecionada não pertence a esta decisão." });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const result = await pool.query(
    `UPDATE arch_project_decisions
        SET status = $1,
            selected_option = $2::jsonb,
            decision_comment = $3,
            decided_by_name = $4,
            decided_at = now(),
            updated_at = now()
      WHERE id = $5::uuid
        AND obra_id = $6
        AND tenant_id::text = $7
        AND decision_type = 'client'
        AND status = 'pending'
      RETURNING id, status, selected_option, decision_comment, decided_at`,
    [status, selectedOption ? JSON.stringify(selectedOption) : null, comment || null, obra.clienteNome ?? 'Cliente', decisionId, obra.id, obra.tenantId],
  );
  if (!result.rows[0]) return res.status(409).json({ error: "A decisão foi alterada antes desta resposta. Atualize o portal." });

  return res.json({ ok: true, decision: result.rows[0] });
});

function canManagePortal(req: any, tenantId: string) {
  return req?.user?.platformRole === "super_admin" || req?.user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/obras/:obraId/portal/documents", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const result = await pool.query(
    `SELECT * FROM obra_portal_documents WHERE tenant_id=$1 AND obra_id=$2 ORDER BY categoria, created_at DESC`,
    [tenantId, obraId],
  );
  return res.json({ documents: result.rows });
});

router.post("/tenants/:tenantId/obras/:obraId/portal/documents", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const categoria = String(req.body?.categoria ?? "documento").trim();
  const titulo = String(req.body?.titulo ?? "").trim();
  const url = String(req.body?.url ?? "").trim();
  if (!titulo || !url) return res.status(422).json({ error: "Título e URL são obrigatórios." });
  const result = await pool.query(
    `INSERT INTO obra_portal_documents
      (id,tenant_id,obra_id,categoria,titulo,descricao,url,mime_type,versao,publicado_cliente)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      crypto.randomUUID(), tenantId, obraId, categoria, titulo,
      req.body?.descricao ?? null, url, req.body?.mimeType ?? null,
      req.body?.versao ?? null, req.body?.publicadoCliente === true,
    ],
  );
  return res.status(201).json({ document: result.rows[0] });
});

router.patch("/tenants/:tenantId/obras/:obraId/portal/documents/:documentId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  const documentId = String(req.params.documentId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const result = await pool.query(
    `UPDATE obra_portal_documents
        SET categoria=COALESCE($1,categoria),
            titulo=COALESCE($2,titulo),
            descricao=COALESCE($3,descricao),
            url=COALESCE($4,url),
            mime_type=COALESCE($5,mime_type),
            versao=COALESCE($6,versao),
            publicado_cliente=COALESCE($7,publicado_cliente),
            updated_at=now()
      WHERE id=$8 AND tenant_id=$9 AND obra_id=$10
      RETURNING *`,
    [
      req.body?.categoria ?? null, req.body?.titulo ?? null, req.body?.descricao ?? null,
      req.body?.url ?? null, req.body?.mimeType ?? null, req.body?.versao ?? null,
      typeof req.body?.publicadoCliente === "boolean" ? req.body.publicadoCliente : null,
      documentId, tenantId, obraId,
    ],
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Documento não encontrado." });
  return res.json({ document: result.rows[0] });
});

router.get("/tenants/:tenantId/obras/:obraId/portal/support", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const [tickets, messages] = await Promise.all([
    pool.query(
      `SELECT t.*, u.nome AS cliente_nome, u.email AS cliente_email
         FROM obra_portal_support_tickets t
         LEFT JOIN obra_portal_users u ON u.id=t.portal_user_id
        WHERE t.tenant_id=$1 AND t.obra_id=$2 ORDER BY t.created_at DESC`,
      [tenantId, obraId],
    ),
    pool.query(
      `SELECT * FROM obra_portal_messages WHERE tenant_id=$1 AND obra_id=$2 ORDER BY created_at ASC LIMIT 500`,
      [tenantId, obraId],
    ),
  ]);
  return res.json({ tickets: tickets.rows, messages: messages.rows });
});

router.patch("/tenants/:tenantId/obras/:obraId/portal/support/:ticketId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  const ticketId = String(req.params.ticketId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const status = ["aberto","em_atendimento","aguardando_cliente","resolvido","fechado"].includes(String(req.body?.status))
    ? String(req.body.status) : null;
  if (!status) return res.status(422).json({ error: "Status inválido." });
  const result = await pool.query(
    `UPDATE obra_portal_support_tickets
        SET status=$1, updated_at=now(),
            closed_at=CASE WHEN $1 IN ('resolvido','fechado') THEN now() ELSE NULL END
      WHERE id=$2 AND tenant_id=$3 AND obra_id=$4 RETURNING *`,
    [status, ticketId, tenantId, obraId],
  );
  return res.json({ ticket: result.rows[0] ?? null });
});

router.post("/tenants/:tenantId/obras/:obraId/portal/messages", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId ?? ""); // tenant-audit: reviewed authenticated route validates tenant with canManagePortal before tenant-scoped access
  const obraId = String(req.params.obraId ?? "");
  if (!canManagePortal(req, tenantId)) return res.status(403).json({ error: "Sem permissão." });
  const mensagem = String(req.body?.mensagem ?? "").trim();
  if (!mensagem) return res.status(422).json({ error: "Mensagem vazia." });
  const autorNome = String(req.user?.nome ?? req.user?.email ?? "Equipe");
  const result = await pool.query(
    `INSERT INTO obra_portal_messages
      (id,tenant_id,obra_id,portal_user_id,autor_tipo,autor_nome,mensagem)
     VALUES ($1,$2,$3,null,'equipe',$4,$5) RETURNING *`,
    [crypto.randomUUID(), tenantId, obraId, autorNome, mensagem],
  );
  return res.status(201).json({ message: result.rows[0] });
});

router.post("/portal/obra/:token/aprovar-orcamento", async (req, res) => {
  const { token } = req.params;
  const [obra] = await db.select().from(obrasTable).where(eq(obrasTable.portalToken, token));
  if (!obra) return res.status(404).json({ error: "Portal não encontrado." });
  const config = portalConfig(obra.portalConfig);
  if (!config.showBudget) return res.status(403).json({ error: "Orçamento não está publicado neste portal." });

  const [orcamento] = await db.select().from(obraOrcamentosTable)
    .where(and(eq(obraOrcamentosTable.obraId, obra.id), eq(obraOrcamentosTable.status, "enviado")));
  if (!orcamento) return res.status(404).json({ error: "Nenhum orçamento aguardando aprovação." });

  const [updated] = await db.update(obraOrcamentosTable)
    .set({ status: "aprovado", updatedAt: new Date() })
    .where(eq(obraOrcamentosTable.id, orcamento.id)).returning();
  return res.json({ ok: true, orcamento: updated });
});

export default router;
