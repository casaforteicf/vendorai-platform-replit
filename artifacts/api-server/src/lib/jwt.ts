import jwt from "jsonwebtoken";

const secret = process.env["JWT_SECRET"];
if (!secret) throw new Error("JWT_SECRET is required");

export interface JwtPayload {
  sub: string;
  email: string;
  platformRole: "super_admin" | "tenant_admin" | "tenant_seller" | "partner" | "member";
  tenantId: string;
  role: "admin" | "member";
  partnerId?: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret!, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret!) as JwtPayload;
}
