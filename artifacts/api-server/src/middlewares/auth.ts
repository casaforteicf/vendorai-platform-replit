import { type Request, type RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import {
  db,
  pool,
  tenantsTable,
  invoicesTable,
  usersTable,
  dealsTable,
  pipelineStagesTable,
  workCardsTable,
  scoutOportunidadesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      partnerId?: string; // set by requirePartner
      tenantId?: string;  // set by subdomain middleware when request arrives via *.appvendorai.com or custom domain
    }
  }
}

function isTrustedInternalActor(user?: JwtPayload): boolean {
  return user?.actorType === "ai" || user?.actorType === "system";
}

const CRITICAL_CONFIGURATION_OAUTH_STARTS = new Set([
  "/auth/whatsapp",
  "/auth/instagram",
  "/auth/google-ads",
  "/auth/search-console",
  "/auth/meta-ads",
  "/auth/youtube",
  "/auth/linkedin",
  "/auth/tiktok",
]);

const CRITICAL_TENANT_INTEGRATION_KEYS = new Set([
  "asaasApiKey",
  "zapsignApiKey",
  "webhookEstoqueUrl",
  "apiKeyEstoque",
  "integrationType",
  "whatsappProvider",
  "instagramProvider",
  "googleAdsConversionId",
  "metaPixelId",
  "linkedinInsightTagId",
  "tiktokPixelId",
]);

function isConfigurationAdmin(user?: JwtPayload): boolean {
  return user?.platformRole === "super_admin"
    || user?.platformRole === "tenant_admin"
    || user?.userFunction === "administrador";
}

function isCriticalConfigurationMutation(req: Request): boolean {
  if (req.method === "GET" && CRITICAL_CONFIGURATION_OAUTH_STARTS.has(req.path)) return true;
  if (req.method === "GET" && /^\/agendas\/[^/]+\/google-auth-url$/.test(req.path)) return true;
  if (req.method === "POST" && /^\/agendas\/[^/]+\/google\/disconnect$/.test(req.path)) return true;

  if (req.method === "PATCH" && /^\/tenants\/[^/]+$/.test(req.path)) {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    if (Object.keys(body).some((key) => CRITICAL_TENANT_INTEGRATION_KEYS.has(key))) return true;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  if (/^\/tenants\/[^/]+\/social-connections\/(?:youtube|linkedin|tiktok)\/test$/.test(req.path)) return false;

  return /^\/tenants\/[^/]+\/(?:whatsapp-connections\/[^/]+|whatsapp-connection(?:\/refresh)?|instagram-connection(?:\/refresh)?|google-ads-connection(?:\/(?:select-account|refresh|data-manager))?|search-console-connection(?:\/(?:verify|refresh))?|meta-ads-connection(?:\/(?:select-account|refresh))?|social-connections\/(?:youtube|linkedin|tiktok))$/.test(req.path);
}


// ── Acesso do cliente final (link público do pré-projeto) ───────────────────────────────
// O token "preprojeto" só abre o pré-projeto dele. A checagem roda dentro de `authenticate`
// para valer também nas rotas que usam authenticate por conta própria antes do bloqueio geral.
const PREPROJECT_SPECIALIST_WINDOW_MS = 60 * 60 * 1000;
const PREPROJECT_SPECIALIST_MAX = 6;
const preProjectSpecialistCalls = new Map<string, number[]>();

function denyPreProject(res: Parameters<RequestHandler>[1]) {
  res.status(403).json({
    error: "PREPROJETO_SCOPE_DENIED",
    message: "Este acesso é restrito ao seu pré-projeto.",
  });
}

async function preProjectRenderQuotaReached(tenantId: string, conceptId: string) {
  const result = await pool.query<{ used: string; quota: number | null }>(
    `SELECT
       (SELECT count(*) FROM arch_ai_renders
         WHERE tenant_id = $1 AND concept_project_id = $2 AND created_at > now() - interval '1 day') AS used,
       (SELECT renders_per_day FROM arqdor_public_links WHERE tenant_id = $1) AS quota`,
    [tenantId, conceptId],
  );
  const row = result.rows[0];
  return Number(row?.used ?? 0) >= (row?.quota ?? 5);
}

export async function enforcePreProjectScope(req: Request, res: Parameters<RequestHandler>[1], next: () => void) {
  const user = req.user;
  const conceptId = user?.conceptId;
  if (!user || !conceptId) return denyPreProject(res);
  const path = req.path;
  const method = req.method;
  const own = `/arch/concept-projects/${conceptId}`;

  if (path === own && (method === "GET" || method === "PATCH")) return next();
  // Estudo de fachada e desenvolvimento com IA custam por chamada: mesmo limite da IA de plantas,
  // para um link público não virar consumo ilimitado de IA.
  if (method === "POST" && (path === `${own}/facade-study` || path === `${own}/develop-with-ai`)) {
    const now = Date.now();
    const key = `${conceptId}:${path.slice(own.length)}`;
    const recent = (preProjectSpecialistCalls.get(key) ?? []).filter((at) => now - at < PREPROJECT_SPECIALIST_WINDOW_MS);
    if (recent.length >= PREPROJECT_SPECIALIST_MAX) {
      res.status(429).json({ error: "Limite de uso da IA atingido. Tente novamente em uma hora." });
      return;
    }
    recent.push(now);
    preProjectSpecialistCalls.set(key, recent);
    return next();
  }
  if (path.startsWith(`${own}/`) && ["GET", "POST", "PATCH"].includes(method)) return next();
  if (method === "GET" && (path.startsWith("/arch/polyhaven/") || path === "/arch/catalogo")) return next();
  if (method === "GET" && path === "/arch/ai-renders" && String(req.query?.concept_project_id ?? "") === conceptId) return next();

  if (method === "POST" && path === "/arch/concept-plan-specialist") {
    const now = Date.now();
    const recent = (preProjectSpecialistCalls.get(conceptId) ?? []).filter((at) => now - at < PREPROJECT_SPECIALIST_WINDOW_MS);
    if (recent.length >= PREPROJECT_SPECIALIST_MAX) {
      res.status(429).json({ error: "Limite de plantas com IA atingido. Tente novamente em uma hora." });
      return;
    }
    recent.push(now);
    preProjectSpecialistCalls.set(conceptId, recent);
    return next();
  }

  try {
    if (method === "POST" && path === "/arch/ai-render") {
      const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      if (String(body.concept_project_id ?? "") !== conceptId) return denyPreProject(res);
      if (await preProjectRenderQuotaReached(user.tenantId, conceptId)) {
        res.status(429).json({ error: "Você atingiu o limite de imagens de hoje. Tente novamente amanhã." });
        return;
      }
      return next();
    }
    const renderMatch = path.match(/^\/arch\/ai-render\/([^/]+)(\/[^/]+)?$/);
    if (renderMatch && (method === "GET" || method === "POST")) {
      const owner = await pool.query<{ concept_project_id: string | null }>(
        `SELECT concept_project_id FROM arch_ai_renders WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [renderMatch[1], user.tenantId],
      );
      if (owner.rows[0]?.concept_project_id !== conceptId) return denyPreProject(res);
      if (method === "POST" && await preProjectRenderQuotaReached(user.tenantId, conceptId)) {
        res.status(429).json({ error: "Você atingiu o limite de imagens de hoje. Tente novamente amanhã." });
        return;
      }
      return next();
    }
  } catch {
    res.status(503).json({ error: "Não foi possível validar o acesso agora. Tente novamente." });
    return;
  }

  return denyPreProject(res);
}

export const enforceAccessScope: RequestHandler = (req, res, next) => {
  const user = req.user;
  if (!user || user.accessScope !== "obra") {
    next();
    return;
  }

  const allowed =
    req.path === "/auth/obra/session"
    || req.path === "/auth/obra/change-password"
    || req.path.startsWith("/arch/worksite/");

  if (!allowed) {
    res.status(403).json({
      error: "OBRA_SCOPE_DENIED",
      message: "Este acesso é restrito à obra vinculada e não pode abrir outros módulos do tenant.",
      obraId: user.obraId ?? null,
    });
    return;
  }

  next();
};

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `vendorai_storage_session=${encodeURIComponent(token)}; Path=/api/storage/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`,
    );
    if (req.user.accessScope === "preprojeto") {
      void enforcePreProjectScope(req, res, next);
      return;
    }
    if (isCriticalConfigurationMutation(req) && !isConfigurationAdmin(req.user)) {
      res.status(403).json({
        error: "CONFIGURATION_ADMIN_REQUIRED",
        message: "Esta alteração crítica de Configurações exige perfil administrador.",
      });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

type PlatformRole = "super_admin" | "tenant_admin" | "tenant_seller" | "partner" | "member";

export function requireRole(...roles: PlatformRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    const hasRole = roles.includes(req.user.platformRole);
    const isAdminFn = req.user.userFunction === "administrador";
    const grantedViaAdminFn = isAdminFn && roles.includes("tenant_admin");
    if (!hasRole && !grantedViaAdminFn) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export const requirePartner: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  if (req.user.platformRole !== "partner") {
    res.status(403).json({ error: "Requires partner role" });
    return;
  }
  if (!req.user.partnerId) {
    res.status(403).json({ error: "No partner record associated with this account" });
    return;
  }
  req.partnerId = req.user.partnerId;
  next();
};

export const blockPartnerFromCRM: RequestHandler = (req, res, next) => {
  if (req.user?.platformRole !== "partner") {
    next();
    return;
  }
  const allowed = ["/partner/", "/partners/", "/auth/", "/admin/partners", "/admin/commissions", "/healthz"];
  const isAllowed = allowed.some((prefix) => req.path.startsWith(prefix));
  if (!isAllowed) {
    res.status(403).json({ error: "Partners cannot access CRM endpoints" });
    return;
  }
  next();
};

export type UserFunction = "vendedor" | "representante_comercial" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";

export function requireUserFunction(...functions: UserFunction[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (isTrustedInternalActor(req.user)) {
      next();
      return;
    }
    const userFn = req.user.userFunction as UserFunction | undefined;
    if (!userFn || !functions.includes(userFn)) {
      res.status(403).json({ error: "Função do usuário não permite esta ação" });
      return;
    }
    next();
  };
}

export function requireAdminOrUserFunction(...functions: UserFunction[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (isTrustedInternalActor(req.user)) {
      next();
      return;
    }
    const userFn = req.user.userFunction as UserFunction | undefined;
    const isAdmin = isConfigurationAdmin(req.user);
    if (isAdmin || (userFn && functions.includes(userFn))) {
      next();
      return;
    }
    res.status(403).json({ error: "Função do usuário não permite esta ação" });
  };
}

const API_MODULE_RULES: Array<[RegExp, string]> = [
  [/^\/(?:tenants\/[^/]+\/)?users(?:\/|$)/, "team"],
  [/^\/leads(?:\/|$)/, "leads"],
  [/^\/prospector(?:-|\/|$)/, "prospector"],
  [/^\/(?:deals|funis|activities)(?:\/|$)/, "deals"],
  [/^\/(?:conversations|messages)(?:\/|$)/, "conversations"],
  [/^\/(?:agendas|agendamentos|bloqueios-agenda)(?:\/|$)/, "agenda"],
  [/^\/(?:tenants\/[^/]+\/)?(?:entregas|fretes|work-cards|support-cases)(?:\/|$)/, "deliveries"],
  [/^\/(?:propostas|lead-proposals|solicitacoes-compra)(?:\/|$)/, "proposals"],
  [/^\/(?:produtos-catalogo|categorias-produto|inventory|varejo)(?:\/|$)/, "catalog"],
  [/^\/(?:erp|invoices|subscriptions)(?:\/|$)/, "erp"],
  [/^\/(?:agents|agent-configs|agent-tasks)(?:\/|$)/, "agents"],
  [/^\/knowledge-base(?:\/|$)/, "knowledge"],
  [/^\/(?:analytics|dashboard)(?:\/|$)/, "analytics"],
  [/^\/(?:campaigns|content|content-studio|video-processing)(?:\/|$)/, "content"],
  [/^\/(?:tenants\/[^/]+\/)?scout(?:\/|$)/, "revenue_scout"],
  [/^\/farmacia(?:\/|$)/, "pharmacy"],
];

type AccessRow = {
  permissions: string[] | null;
  userFunction: string | null;
  customFunctionId: string | null;
};

function callerFunctionRefs(row: AccessRow | undefined): Set<string> {
  const refs = new Set<string>();
  if (row?.userFunction) refs.add(`builtin:${row.userFunction}`);
  if (row?.customFunctionId) refs.add(`custom:${row.customFunctionId}`);
  return refs;
}

async function isResponsibleForStage(input: {
  current: JwtPayload;
  row: AccessRow | undefined;
  tenantId: string;
  pipeline: string;
  stageKey: string;
}): Promise<boolean> {
  const { current, row, tenantId, pipeline, stageKey } = input;
  if (isTrustedInternalActor(current)) return true;
  if (current.platformRole === "super_admin" || current.platformRole === "tenant_admin" || current.userFunction === "administrador") return true;

  const [stage] = await db
    .select({ responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes })
    .from(pipelineStagesTable)
    .where(
      and(
        eq(pipelineStagesTable.tenantId, tenantId),
        eq(pipelineStagesTable.pipeline, pipeline),
        eq(pipelineStagesTable.key, stageKey),
      ),
    );

  // Ausência de configuração ou lista vazia mantém compatibilidade e acesso atual.
  const responsibleFunctions = stage?.responsaveisFuncoes ?? [];
  if (responsibleFunctions.length === 0) return true;
  const callerFunctions = callerFunctionRefs(row);
  return responsibleFunctions.some((responsible) => callerFunctions.has(responsible));
}

async function canExecuteCurrentPipelineStage(
  req: Request,
  current: JwtPayload,
  row: AccessRow | undefined,
): Promise<boolean> {
  if (isTrustedInternalActor(current)) return true;
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;

  // Comercial + relacionamento usam deals. Quando o negócio já está em
  // Aquecimento ou Parceiros, a responsabilidade é lida da pipeline real,
  // não da coluna comercial de transição.
  if (req.method === "PATCH") {
    const dealMatch = req.path.match(/^\/deals\/([^/]+)$/);
    if (dealMatch) {
      const [deal] = await db
        .select({
          id: dealsTable.id,
          tenantId: dealsTable.tenantId,
          etapa: dealsTable.etapa,
          aquecimentoTipo: dealsTable.aquecimentoTipo,
          relationshipStage: dealsTable.relationshipStage,
        })
        .from(dealsTable)
        .where(eq(dealsTable.id, dealMatch[1]));
      if (!deal || deal.tenantId !== current.tenantId) return true;

      let pipeline = "comercial";
      let stageKey = deal.etapa;
      if (deal.etapa === "em_aquecimento") {
        pipeline = "aquecimento";
        stageKey = deal.relationshipStage
          || (deal.aquecimentoTipo === "cliente" ? "aquecimento_cliente" : "aquecimento_lead");
      } else if (deal.etapa === "parceiro") {
        pipeline = "parceiros";
        stageKey = deal.relationshipStage || "parceiro_identificado";
      }

      return isResponsibleForStage({ current, row, tenantId: deal.tenantId, pipeline, stageKey });
    }
  }

  // Execução / Pedidos e Suporte / Assistência compartilham work_cards.
  // Qualquer ação de execução (mover, confirmar relatório, anexar resultado etc.)
  // é governada pela função responsável pela etapa atual.
  const workCardMatch = req.path.match(/^\/(?:tenants\/[^/]+\/)?work-cards\/([^/]+)(?:\/|$)/);
  if (workCardMatch && req.method !== "DELETE") {
    const [card] = await db
      .select({ id: workCardsTable.id, tenantId: workCardsTable.tenantId, pipeline: workCardsTable.pipeline, etapa: workCardsTable.etapa })
      .from(workCardsTable)
      .where(eq(workCardsTable.id, workCardMatch[1]));
    if (!card || card.tenantId !== current.tenantId) return true;
    if (card.pipeline === "execucao" || card.pipeline === "suporte") {
      return isResponsibleForStage({ current, row, tenantId: card.tenantId, pipeline: card.pipeline, stageKey: card.etapa });
    }
  }

  // Revenue Scout tem ações próprias, fora de deals. Confirmação, encaminhamento,
  // mudança de etapa e aprovação da IA respeitam a etapa atual para humanos.
  const scoutMatch = req.path.match(/^\/tenants\/([^/]+)\/scout\/oportunidades\/([^/]+)(?:\/([^/]+))?$/);
  if (scoutMatch && scoutMatch[1] === current.tenantId) {
    const action = scoutMatch[3] ?? "";
    const guardedActions = new Set(["encaminhar", "etapa", "confirmar", "aprovar"]);
    if (guardedActions.has(action)) {
      const [opportunity] = await db
        .select({ tenantId: scoutOportunidadesTable.tenantId, pipelineStage: scoutOportunidadesTable.pipelineStage })
        .from(scoutOportunidadesTable)
        .where(and(eq(scoutOportunidadesTable.id, scoutMatch[2]), eq(scoutOportunidadesTable.tenantId, scoutMatch[1])));
      if (!opportunity) return true;
      return isResponsibleForStage({
        current,
        row,
        tenantId: opportunity.tenantId,
        pipeline: "scout",
        stageKey: opportunity.pipelineStage || "identificada",
      });
    }
  }

  return true;
}

/** Enforces explicit per-user module permissions and pipeline-stage responsibilities. */
export const enforceModulePermission: RequestHandler = async (req, res, next) => {
  const current = req.user;
  if (!current || current.platformRole === "super_admin" || current.platformRole === "tenant_admin" || current.userFunction === "administrador" || isTrustedInternalActor(current)) {
    next();
    return;
  }

  const requiredModule = API_MODULE_RULES.find(([pattern]) => pattern.test(req.path))?.[1];
  const needsPipelineCheck =
    (req.method === "PATCH" && /^\/deals\/[^/]+$/.test(req.path))
    || /^\/(?:tenants\/[^/]+\/)?work-cards\/[^/]+(?:\/|$)/.test(req.path)
    || /^\/tenants\/[^/]+\/scout\/oportunidades\/[^/]+\/(?:encaminhar|etapa|confirmar|aprovar)$/.test(req.path);

  if (!requiredModule && !needsPipelineCheck) {
    next();
    return;
  }

  const [row] = await db
    .select({
      permissions: usersTable.permissions,
      userFunction: usersTable.userFunction,
      customFunctionId: usersTable.customFunctionId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, current.sub));

  // NULL means the tenant has not customized this user yet; preserve the
  // existing role/function policy for backwards compatibility.
  if (requiredModule && row?.permissions != null && !row.permissions.includes(requiredModule)) {
    res.status(403).json({
      error: "MODULE_ACCESS_DENIED",
      message: "Seu usuário não possui acesso a este módulo.",
      module: requiredModule,
    });
    return;
  }

  if (needsPipelineCheck) {
    const allowedAtStage = await canExecuteCurrentPipelineStage(req, current, row);
    if (!allowedAtStage) {
      res.status(403).json({
        error: "PIPELINE_STAGE_FUNCTION_DENIED",
        message: "Sua função não é responsável por executar esta etapa da pipeline.",
      });
      return;
    }
  }

  next();
};

export function buildUserFunctionFilter(req: Express.Request, table: { tenantId: any; assignedTo: any }): any[] {
  const conditions: any[] = [];
  if (isTrustedInternalActor(req.user)) return conditions;

  const isAdmin = isConfigurationAdmin(req.user);
  const userId = req.user?.sub;

  // Regra oficial de visibilidade: somente administrador enxerga toda a base.
  // Qualquer outra função humana recebe apenas registros explicitamente
  // atribuídos ao próprio usuário. Superadmin e atores internos continuam
  // como exceções técnicas da plataforma.
  if (!isAdmin && userId) {
    conditions.push(eq(table.assignedTo, userId));
  }

  return conditions;
}

export const blockExpiredDemo: RequestHandler = async (req, res, next) => {
  const user = req.user;
  if (!user || user.platformRole === "super_admin" || user.platformRole === "partner") {
    next();
    return;
  }

  if (!user.tenantId) {
    next();
    return;
  }

  try {
    const [tenant] = await db
      .select({
        status: tenantsTable.status,
        isDemo: tenantsTable.isDemo,
        demoExpiresAt: tenantsTable.demoExpiresAt,
        suspendedReason: tenantsTable.suspendedReason,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId));

    if (tenant?.isDemo && tenant?.demoExpiresAt && new Date(tenant.demoExpiresAt) < new Date()) {
      res.status(403).json({
        error: "DEMO_EXPIRADA",
        message: "Este per\u00edodo de demonstra\u00e7\u00e3o expirou. Entre em contato para continuar usando o Vendor.ai.",
        contato: "https://wa.me/5548999999999",
      });
      return;
    }
  } catch {
    // On DB failure, allow through
  }

  next();
};

/**
 * Blocks suspended tenants OR tenants with overdue invoices from accessing the API.
 * Super_admins and partners bypass this check.
 * Returns 402 Payment Required with a clear message.
 */
export const blockSuspendedTenants: RequestHandler = async (req, res, next) => {
  const user = req.user;
  if (!user || user.platformRole === "super_admin" || user.platformRole === "partner") {
    next();
    return;
  }

  if (!user.tenantId) {
    next();
    return;
  }

  try {
    const [tenant] = await db
      .select({ status: tenantsTable.status })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, user.tenantId));

    if (tenant?.status === "suspended") {
      res.status(402).json({
        error: "Acesso suspenso por inadimplência. Regularize o pagamento pendente para restaurar o acesso.",
        code: "TENANT_SUSPENDED",
      });
      return;
    }

    // Check for overdue invoices (atrasada)
    const [overdueInvoice] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.tenantId, user.tenantId),
          eq(invoicesTable.status, "atrasada")
        )
      )
      .limit(1);

    if (overdueInvoice) {
      res.status(402).json({
        error: "Acesso suspenso por inadimplência. Você possui 1 fatura em atraso. Regularize o pagamento para restaurar o acesso.",
        code: "TENANT_OVERDUE_INVOICE",
      });
      return;
    }
  } catch {
    // On DB failure, allow through — do not block legitimate users due to infra issue
  }

  next();
};

export function requireSameTenanOrSuperAdmin(): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }
    if (req.user.platformRole === "super_admin") {
      next();
      return;
    }
    const tenantId = req.params["tenantId"] ?? req.params["id"];
    if (tenantId && req.user.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }
    next();
  };
}