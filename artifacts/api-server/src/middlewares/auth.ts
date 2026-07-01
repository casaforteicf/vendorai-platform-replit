import { type RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import { db, tenantsTable, invoicesTable } from "@workspace/db";
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
    if (!roles.includes(req.user.platformRole)) {
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
