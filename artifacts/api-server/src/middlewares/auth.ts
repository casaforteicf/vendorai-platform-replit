import { type RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import {
  db,
  tenantsTable,
  invoicesTable,
  usersTable,
  dealsTable,
  pipelineStagesTable,
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
  [/^\/(?:entregas|fretes)(?:\/|$)/, "deliveries"],
  [/^\/(?:propostas|lead-proposals|solicitacoes-compra)(?:\/|$)/, "proposals"],
  [/^\/(?:produtos-catalogo|categorias-produto|inventory|varejo)(?:\/|$)/, "catalog"],
  [/^\/(?:erp|invoices|subscriptions)(?:\/|$)/, "erp"],
  [/^\/(?:agents|agent-configs|agent-tasks)(?:\/|$)/, "agents"],
  [/^\/knowledge-base(?:\/|$)/, "knowledge"],
  [/^\/(?:analytics|dashboard)(?:\/|$)/, "analytics"],
  [/^\/(?:campaigns|content|content-studio|video-processing)(?:\/|$)/, "content"],
  [/^\/scout(?:\/|$)/, "revenue_scout"],
  [/^\/farmacia(?:\/|$)/, "pharmacy"],
];

type AccessRow = {
  permissions: string[] | null;
  userFunction: string | null;
  customFunctionId: string | null;
};

async function canExecuteCurrentPipelineStage(
  req: Express.Request,
  current: JwtPayload,
  row: AccessRow | undefined,
): Promise<boolean> {
  if (req.method !== "PATCH") return true;
  const match = req.path.match(/^\/deals\/([^/]+)$/);
  if (!match) return true;

  const dealId = match[1];
  const [deal] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa })
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId));
  if (!deal || deal.tenantId !== current.tenantId) return true;

  const requestedStage =
    typeof req.body?.etapa === "string" && req.body.etapa.trim()
      ? req.body.etapa.trim()
      : deal.etapa;

  const [stage] = await db
    .select({ responsaveisFuncoes: pipelineStagesTable.responsaveisFuncoes })
    .from(pipelineStagesTable)
    .where(
      and(
        eq(pipelineStagesTable.tenantId, deal.tenantId),
        eq(pipelineStagesTable.key, requestedStage),
      ),
    );

  const responsibleFunctions = stage?.responsaveisFuncoes ?? [];
  if (responsibleFunctions.length === 0) return true;
  if (!row) return false;

  const callerFunctions = new Set<string>();
  if (row.userFunction) callerFunctions.add(`builtin:${row.userFunction}`);
  if (row.customFunctionId) callerFunctions.add(`custom:${row.customFunctionId}`);

  return responsibleFunctions.some((responsible) => callerFunctions.has(responsible));
}

/** Enforces explicit per-user module permissions on protected APIs. */
export const enforceModulePermission: RequestHandler = async (req, res, next) => {
  const current = req.user;
  if (!current || current.platformRole === "super_admin" || current.platformRole === "tenant_admin" || current.userFunction === "administrador") {
    next();
    return;
  }

  const requiredModule = API_MODULE_RULES.find(([pattern]) => pattern.test(req.path))?.[1];
  if (!requiredModule) {
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
  if (row?.permissions != null && !row.permissions.includes(requiredModule)) {
    res.status(403).json({
      error: "MODULE_ACCESS_DENIED",
      message: "Seu usuário não possui acesso a este módulo.",
      module: requiredModule,
    });
    return;
  }

  if (requiredModule === "deals") {
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
