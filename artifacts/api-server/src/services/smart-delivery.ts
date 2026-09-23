import jwt from "jsonwebtoken";

const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
if (!secret) throw new Error("JWT_SECRET (or SESSION_SECRET as fallback) is required");

export type SmartDeliveryTokenPayload = {
  purpose: "smart_delivery";
  tenantId: string;
  campaignId: string;
  leadId: string;
  toolRef: string;
  toolName?: string;
};

function publicBaseUrl(): string {
  const value = (process.env["PUBLIC_APP_URL"] ?? process.env["APP_URL"] ?? "").replace(/\/$/, "");
  if (!value) throw new Error("PUBLIC_APP_URL não configurada para Entrega Inteligente.");
  return value;
}

export function signSmartDeliveryToken(payload: SmartDeliveryTokenPayload): string {
  return jwt.sign(payload, secret!, {
    expiresIn: "7d",
    issuer: "vendorai",
    audience: "smart-delivery",
  });
}

export function verifySmartDeliveryToken(token: string): SmartDeliveryTokenPayload {
  const decoded = jwt.verify(token, secret!, {
    issuer: "vendorai",
    audience: "smart-delivery",
  }) as SmartDeliveryTokenPayload;

  if (decoded.purpose !== "smart_delivery") throw new Error("Token de entrega inválido");
  return decoded;
}

export function buildSmartDeliveryUrl(payload: SmartDeliveryTokenPayload): string {
  const token = signSmartDeliveryToken(payload);
  return `${publicBaseUrl()}/api/public/smart-delivery/${encodeURIComponent(token)}`;
}

export function safeToolTarget(toolRef: string, params: Record<string, string>): string {
  const ref = toolRef.trim();
  if (!ref.startsWith("/") || ref.startsWith("//")) {
    throw new Error("toolRef deve ser uma rota interna iniciada por /");
  }

  const base = new URL(publicBaseUrl());
  const target = new URL(ref, base);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target.toString();
}
