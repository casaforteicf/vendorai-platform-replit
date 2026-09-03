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
  // Tokens de usuários existentes omitem este campo e são tratados como humanos.
  // Somente credenciais internas/confiáveis devem emitir `ai` ou `system`.
  actorType?: "human" | "ai" | "system";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret!, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret!) as JwtPayload;
}
