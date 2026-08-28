import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, partnersTable, usersTable } from "@workspace/db";
import { signToken } from "../lib/jwt.js";

const router: IRouter = Router();

function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    callbackUrl: process.env.GOOGLE_CALLBACK_URL?.trim() ?? "",
  };
}

function appUrl() {
  const configuredFrontend = process.env.FRONTEND_APP_URL?.trim();
  if (configuredFrontend) return configuredFrontend.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return "https://app.appvendorai.com";
  }

  return (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
}

function stateSecret() {
  return process.env.JWT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}

function createState(): string {
  const secret = stateSecret();
  const payload = `${Date.now()}.${randomBytes(18).toString("hex")}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`, "utf8").toString("base64url");
}

function isValidState(encoded: string): boolean {
  try {
    const secret = stateSecret();
    if (!secret) return false;

    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return false;

    const [timestampRaw, nonce, signature] = parts;
    const timestamp = Number(timestampRaw);
    if (!timestampRaw || !nonce || !signature || !Number.isFinite(timestamp)) return false;

    // Estado válido por 10 minutos.
    if (Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) return false;

    const payload = `${timestampRaw}.${nonce}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const actualBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function redirectWithError(res: Response, code: string) {
  res.redirect(`${appUrl()}/auth/success?google_error=${encodeURIComponent(code)}`);
}

router.get("/auth/google", (req: Request, res) => {
  const { clientId, clientSecret, callbackUrl } = googleConfig();

  if (!clientId || !clientSecret || !callbackUrl || !stateSecret()) {
    req.log?.error("google-login: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/JWT_SECRET ausentes");
    redirectWithError(res, "not_configured");
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account",
    state: createState(),
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/auth/google/callback", async (req: Request, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const oauthError = typeof req.query.error === "string" ? req.query.error : "";
  const { clientId, clientSecret, callbackUrl } = googleConfig();

  if (oauthError) {
    redirectWithError(res, oauthError === "access_denied" ? "access_denied" : "oauth_error");
    return;
  }

  if (!clientId || !clientSecret || !callbackUrl || !code || !state || !isValidState(state)) {
    redirectWithError(res, "invalid_callback");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      req.log?.error({ status: tokenResponse.status }, "google-login: falha ao trocar authorization code");
      redirectWithError(res, "token_exchange_failed");
      return;
    }

    const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenPayload.access_token) {
      redirectWithError(res, "token_exchange_failed");
      return;
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!profileResponse.ok) {
      redirectWithError(res, "profile_failed");
      return;
    }

    const profile = (await profileResponse.json()) as {
      email?: string;
      verified_email?: boolean;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };

    const email = profile.email?.trim().toLowerCase();
    if (!email || profile.verified_email === false) {
      redirectWithError(res, "email_not_verified");
      return;
    }

    // Preserva integralmente o modelo multi-tenant atual: Google autentica
    // apenas usuários que já existem. Não cria tenant nem usuário implícito.
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (!user || !user.active) {
      redirectWithError(res, "account_not_found");
      return;
    }

    let partnerId: string | undefined;
    if (user.platformRole === "partner") {
      const [partnerRow] = await db
        .select({ id: partnersTable.id })
        .from(partnersTable)
        .where(eq(partnersTable.userId, user.id));
      partnerId = partnerRow?.id;
    }

    const vendorToken = signToken({
      sub: user.id,
      email: user.email,
      platformRole: user.platformRole,
      tenantId: user.tenantId,
      role: user.role,
      userFunction: user.userFunction ?? undefined,
      ...(partnerId ? { partnerId } : {}),
    });

    res.redirect(`${appUrl()}/auth/success?token=${encodeURIComponent(vendorToken)}`);
  } catch (error) {
    req.log?.error({ error }, "google-login: callback falhou");
    redirectWithError(res, "callback_failed");
  }
});

export default router;
