import { type Request, type RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import {
  db,
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

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
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
    if (isTrustedInternalActor(req.user)) {
      next();
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

export type UserFunction = "vendedor" | "financeiro" | "suporte" | "entrega" | "administrador" | "outro";

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
    const isAdmin = req.user.platformRole === "super_admin" || req.user.platformRole === "tenant_admin";
    const userFn = req.user.userFunction as UserFunction | undefined;
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
  [/^\/(?:entregas|fretes|work-cards|support-cases)(?:\/|$)/, "deliveries"],
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

  const userFn = req.user?.userFunction as UserFunction | undefined;
  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const isSeller = req.user?.platformRole === "tenant_seller";
  const userId = req.user?.sub;

  if (!isAdmin && userId && (userFn === "vendedor" || userFn === "entrega" || isSeller)) {
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