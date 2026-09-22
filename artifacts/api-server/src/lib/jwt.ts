import jwt from "jsonwebtoken";

const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
if (!secret) throw new Error("JWT_SECRET (or SESSION_SECRET as fallback) is required");

export interface JwtPayload {
  sub: string;
  email: string;
  platformRole: "super_admin" | "tenant_admin" | "tenant_seller" | "partner" | "member";
  tenantId: string;
  role: "admin" | "member";
  userFunction?: string;
  partnerId?: string;
  accessScope?: "tenant" | "obra";
  obraId?: string;
  obraExecutorId?: string;
  obraPermissions?: string[];
  obraProfile?: string;
  // Tokens de usuários existentes omitem este campo e são tratados como humanos.
  // Somente credenciais internas/confiáveis devem emitir `ai` ou `system`.
  actorType?: "human" | "ai" | "system";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret!, { expiresIn: "7d" });
}

/**
 * Emite uma credencial curta e exclusivamente server-side para agentes internos.
 * Ela não é exposta em login, payload do navegador ou configuração do usuário.
 * O tenant continua explícito: IA/sistema atravessam funções e pipelines, nunca tenants.
 */
export function signInternalActorToken(input: {
  sub: string;
  tenantId: string;
  actorType: "ai" | "system";
  email?: string;
}): string {
  const payload: JwtPayload = {
    sub: input.sub,
    email: input.email ?? `${input.actorType}@internal.vendorai`,
    platformRole: "member",
    tenantId: input.tenantId,
    role: "member",
    actorType: input.actorType,
  };
  return jwt.sign(payload, secret!, { expiresIn: "15m" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret!) as JwtPayload;
}
