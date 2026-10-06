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
  accessScope?: "tenant" | "obra" | "preprojeto";
  /** Acesso do cliente final pelo link público: só este pré-projeto. */
  conceptId?: string;
  leadId?: string | null;
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

/**
 * Acesso do cliente final vindo do link público do pré-projeto. O `sub` é o profissional dono
 * do link (os pré-projetos aparecem na lista dele), mas o escopo "preprojeto" limita o token a
 * este único pré-projeto (ver enforceAccessScope).
 */
export function signGuestConceptToken(input: {
  ownerUserId: string;
  tenantId: string;
  conceptId: string;
  leadId: string | null;
  email: string;
}): string {
  const payload: JwtPayload = {
    sub: input.ownerUserId,
    email: `cliente+${input.conceptId.slice(0, 8)}@preprojeto.appvendorai.com`,
    platformRole: "member",
    tenantId: input.tenantId,
    role: "member",
    actorType: "human",
    accessScope: "preprojeto",
    conceptId: input.conceptId,
    leadId: input.leadId,
  };
  return jwt.sign(payload, secret!, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret!) as JwtPayload;
}

export interface AttachmentFolderUnlockPayload {
  purpose: "attachment_folder_unlock";
  sub: string;
  tenantId: string;
  leadId: string;
  lockId: string;
  folderPath: string;
}

export function signAttachmentFolderUnlockToken(payload: AttachmentFolderUnlockPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, secret!, { expiresIn: Math.max(60, Math.min(expiresInSeconds, 4 * 60 * 60)) });
}

export function verifyAttachmentFolderUnlockToken(token: string): AttachmentFolderUnlockPayload {
  const payload = jwt.verify(token, secret!) as AttachmentFolderUnlockPayload;
  if (payload.purpose !== "attachment_folder_unlock") throw new Error("Invalid attachment unlock token");
  return payload;
}
