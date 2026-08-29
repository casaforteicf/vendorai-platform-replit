import type { RequestHandler } from "express";
import { getAccessLicense, hasActiveAccess } from "../services/accessLicense.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALWAYS_ALLOWED_PREFIXES = [
  "/access-license",
  "/auth",
  "/notifications",
  "/support",
];

export const enforceAccessLicense: RequestHandler = async (req, res, next) => {
  const user = req.user;
  if (!user || user.platformRole === "super_admin" || user.platformRole === "partner" || !user.tenantId) {
    next();
    return;
  }
  if (SAFE_METHODS.has(req.method) || ALWAYS_ALLOWED_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }

  try {
    const license = await getAccessLicense(user.tenantId);
    if (hasActiveAccess(license)) {
      next();
      return;
    }
    res.status(402).json({
      error: "ACCESS_READ_ONLY",
      code: "ACCESS_READ_ONLY",
      message: "Seu período de acesso terminou. Os dados continuam disponíveis para consulta, mas novas atividades estão pausadas.",
      actions: {
        activateMonthly: "/api/access-license/activate-monthly",
        buyFiveDays: "/api/access-license/purchases",
        annualContract: "/api/access-license/annual-contract",
      },
    });
  } catch (error) {
    req.log?.error?.({ error, tenantId: user.tenantId }, "access-license: verification failed");
    res.status(503).json({ error: "Não foi possível verificar a licença de acesso." });
  }
};
