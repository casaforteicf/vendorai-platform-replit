import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, agendasTable, insertAgendaSchema, updateAgendaSchema } from "@workspace/db";
import {
  buildAuthUrl,
  exchangeCodeAndStore,
  getGoogleRedirectUri,
} from "../lib/google-calendar";

const router: IRouter = Router();

// ── List agendas ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/agendas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const agendas = await db
    .select({
      id: agendasTable.id,
      tenantId: agendasTable.tenantId,
      nome: agendasTable.nome,
      cor: agendasTable.cor,
      isDefault: agendasTable.isDefault,
      googleCalendarId: agendasTable.googleCalendarId,
      googleEmail: agendasTable.googleEmail,
      createdAt: agendasTable.createdAt,
      updatedAt: agendasTable.updatedAt,
    })
    .from(agendasTable)
    .where(eq(agendasTable.tenantId, tenantId))
    .orderBy(agendasTable.createdAt);

  res.json(agendas);
});

// ── Create agenda ─────────────────────────────────────────────────────────────

router.post("/tenants/:tenantId/agendas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = insertAgendaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // If this is set as default, unset any existing default
  if (parsed.data.isDefault) {
    await db
      .update(agendasTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(agendasTable.tenantId, tenantId), eq(agendasTable.isDefault, true)));
  }

  const [agenda] = await db
    .insert(agendasTable)
    .values(parsed.data)
    .returning({
      id: agendasTable.id,
      tenantId: agendasTable.tenantId,
      nome: agendasTable.nome,
      cor: agendasTable.cor,
      isDefault: agendasTable.isDefault,
      googleCalendarId: agendasTable.googleCalendarId,
      googleEmail: agendasTable.googleEmail,
      createdAt: agendasTable.createdAt,
      updatedAt: agendasTable.updatedAt,
    });

  res.status(201).json(agenda);
});

// ── Get agenda ────────────────────────────────────────────────────────────────

router.get("/agendas/:id", async (req, res) => {
  const [agenda] = await db
    .select({
      id: agendasTable.id,
      tenantId: agendasTable.tenantId,
      nome: agendasTable.nome,
      cor: agendasTable.cor,
      isDefault: agendasTable.isDefault,
      googleCalendarId: agendasTable.googleCalendarId,
      googleEmail: agendasTable.googleEmail,
      createdAt: agendasTable.createdAt,
      updatedAt: agendasTable.updatedAt,
    })
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (!agenda) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== agenda.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(agenda);
});

// ── Update agenda ─────────────────────────────────────────────────────────────

router.patch("/agendas/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== existing.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = updateAgendaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // If setting as default, unset others
  if (parsed.data.isDefault) {
    await db
      .update(agendasTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(agendasTable.tenantId, existing.tenantId), eq(agendasTable.isDefault, true)));
  }

  const [updated] = await db
    .update(agendasTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agendasTable.id, existing.id))
    .returning({
      id: agendasTable.id,
      tenantId: agendasTable.tenantId,
      nome: agendasTable.nome,
      cor: agendasTable.cor,
      isDefault: agendasTable.isDefault,
      googleCalendarId: agendasTable.googleCalendarId,
      googleEmail: agendasTable.googleEmail,
      createdAt: agendasTable.createdAt,
      updatedAt: agendasTable.updatedAt,
    });

  res.json(updated);
});

// ── Delete agenda ─────────────────────────────────────────────────────────────

router.delete("/agendas/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: agendasTable.id, tenantId: agendasTable.tenantId })
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== existing.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await db.delete(agendasTable).where(eq(agendasTable.id, existing.id));
  res.status(204).send();
});

// ── Google Calendar: get auth URL ─────────────────────────────────────────────

router.get("/agendas/:id/google-auth-url", async (req, res) => {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  if (!clientId) {
    res.status(503).json({
      error:
        "Google Calendar integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
    return;
  }

  const [agenda] = await db
    .select({ id: agendasTable.id, tenantId: agendasTable.tenantId })
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (!agenda) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== agenda.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const host = req.get("host") ?? undefined;
  const url = buildAuthUrl(agenda.id, undefined, host);
  res.json({ url });
});

// ── Google Calendar: disconnect ───────────────────────────────────────────────

router.post("/agendas/:id/google/disconnect", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== existing.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [updated] = await db
    .update(agendasTable)
    .set({
      googleCalendarId: null,
      googleEmail: null,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(agendasTable.id, existing.id))
    .returning({
      id: agendasTable.id,
      tenantId: agendasTable.tenantId,
      nome: agendasTable.nome,
      cor: agendasTable.cor,
      isDefault: agendasTable.isDefault,
      googleCalendarId: agendasTable.googleCalendarId,
      googleEmail: agendasTable.googleEmail,
      createdAt: agendasTable.createdAt,
      updatedAt: agendasTable.updatedAt,
    });

  res.json(updated);
});

// ── Google Calendar OAuth callback (PUBLIC — browser redirect from Google) ────

export const googleCallbackRouter: IRouter = Router();

googleCallbackRouter.get("/auth/google/calendar/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  // Determine the app URL for the post-auth redirect.
  // Prefer the actual request host so the user lands back on the same domain
  // they started from (appvendorai.com in prod, spock.replit.dev in dev).
  const reqHost = req.get("host") ?? "";
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const appUrl = reqHost
    ? `https://${reqHost}`
    : domain
      ? `https://${domain}`
      : `http://localhost:3000`;

  if (error || !code || !state) {
    res.redirect(`${appUrl}/configuracoes?googleError=access_denied`);
    return;
  }

  let agendaId: string;
  let returnTo: string = "/configuracoes";
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8")
    ) as { agendaId: string; returnTo?: string };
    agendaId = decoded.agendaId;
    if (decoded.returnTo) returnTo = decoded.returnTo;
  } catch {
    res.redirect(`${appUrl}/configuracoes?googleError=invalid_state`);
    return;
  }

  try {
    await exchangeCodeAndStore(code, agendaId);
    res.redirect(`${appUrl}${returnTo}?googleConnected=1`);
  } catch (err) {
    req.log.error({ err }, "Google Calendar OAuth exchange failed");
    res.redirect(`${appUrl}${returnTo}?googleError=exchange_failed`);
  }
});

export default router;
