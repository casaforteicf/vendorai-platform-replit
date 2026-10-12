import { Router, type IRouter } from "express";
import { and, eq, or, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, agendasTable, agendaAccessGrantsTable, usersTable, insertAgendaSchema, updateAgendaSchema } from "@workspace/db";
import {
  buildAuthUrl,
  exchangeCodeAndStore,
  getGoogleRedirectUri,
} from "../lib/google-calendar";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";

const router: IRouter = Router();

async function googleCalendarSnapshot(agendaId: string) {
  return db.select({
    id: agendasTable.id,
    tenantId: agendasTable.tenantId,
    nome: agendasTable.nome,
    googleCalendarId: agendasTable.googleCalendarId,
    googleEmail: agendasTable.googleEmail,
    googleAccessToken: agendasTable.googleAccessToken,
    googleRefreshToken: agendasTable.googleRefreshToken,
    googleTokenExpiresAt: agendasTable.googleTokenExpiresAt,
    updatedAt: agendasTable.updatedAt,
  }).from(agendasTable).where(eq(agendasTable.id, agendaId)).limit(1).then((rows) => rows[0] ?? null);
}

async function auditGoogleCalendar(req: any, tenantId: string, agendaId: string, before: unknown, after: unknown, action: "criar" | "atualizar" | "excluir") {
  const audited = await writeConfigurationAudit({
    tenantId,
    action,
    entity: "google_calendar_connection",
    entityId: agendaId,
    before: action === "criar" ? undefined : before,
    after: action === "excluir" ? undefined : after,
    actor: { userId: req.user?.id ?? req.user?.sub ?? null, ip: req.ip ?? null },
  });
  if (!audited) req.log?.warn({ tenantId, agendaId }, "configuracoes: falha ao auditar Google Calendar");
}

// ── List agendas ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/agendas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userId = req.user?.sub;
  if (!isAdmin && !userId) return res.status(403).json({ error: "User identity required" });
  const authorizedIds = isAdmin ? [] : (await db.select({ agendaId: agendaAccessGrantsTable.agendaId })
    .from(agendaAccessGrantsTable).where(and(eq(agendaAccessGrantsTable.tenantId, tenantId), eq(agendaAccessGrantsTable.userId, userId!)))).map(x => x.agendaId);
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
    .where(isAdmin ? eq(agendasTable.tenantId, tenantId) : and(eq(agendasTable.tenantId, tenantId), or(eq(agendasTable.ownerUserId, userId!), ...(authorizedIds.length ? [inArray(agendasTable.id, authorizedIds)] : []))))
    .orderBy(agendasTable.createdAt);

  res.json(agendas);
});

// ── Create agenda ─────────────────────────────────────────────────────────────

router.post("/tenants/:tenantId/agendas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });
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
      ownerUserId: agendasTable.ownerUserId,
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

  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") {
    const userId = req.user?.sub;
    if (!userId) return res.status(403).json({ error: "User identity required" });
    if (agenda.ownerUserId !== userId) {
      const [grant] = await db.select({ userId: agendaAccessGrantsTable.userId }).from(agendaAccessGrantsTable)
        .where(and(eq(agendaAccessGrantsTable.tenantId, agenda.tenantId), eq(agendaAccessGrantsTable.agendaId, agenda.id), eq(agendaAccessGrantsTable.userId, userId))).limit(1);
      if (!grant) return res.status(403).json({ error: "Agenda access denied" });
    }
  }
  res.json(agenda);
});

// ── Update agenda ─────────────────────────────────────────────────────────────

router.patch("/agendas/:id", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });

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

  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });

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

  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });

  if (!agenda) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== agenda.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const host = req.get("host") ?? undefined;
  const url = buildAuthUrl(agenda.id, "/agenda", host);
  res.json({ url });
});

// ── Google Calendar: disconnect ───────────────────────────────────────────────

router.post("/agendas/:id/google/disconnect", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agendasTable)
    .where(eq(agendasTable.id, String(req.params.id)));

  if (req.user?.platformRole !== "super_admin" && req.user?.platformRole !== "tenant_admin") return res.status(403).json({ error: "Admin access required" });

  if (!existing) {
    res.status(404).json({ error: "Agenda not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== existing.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const before = await googleCalendarSnapshot(existing.id);
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

  await auditGoogleCalendar(req, existing.tenantId, existing.id, before, null, "excluir");
  res.json(updated);
});


const grantBodySchema = z.object({ userId: z.string().min(1) });

/** Administrative management only; grants do not themselves bypass route authorization. */
router.get("/agendas/:id/access", async (req, res) => {
  const [agenda] = await db.select({ id: agendasTable.id, tenantId: agendasTable.tenantId })
    .from(agendasTable).where(eq(agendasTable.id, String(req.params.id))).limit(1);
  if (!agenda) return res.status(404).json({ error: "Agenda not found" });
  if (!req.user || !["super_admin", "tenant_admin"].includes(req.user.platformRole) ||
      (req.user.platformRole !== "super_admin" && req.user.tenantId !== agenda.tenantId)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const grants = await db.select({ userId: agendaAccessGrantsTable.userId, grantedBy: agendaAccessGrantsTable.grantedBy, createdAt: agendaAccessGrantsTable.createdAt })
    .from(agendaAccessGrantsTable)
    .where(and(eq(agendaAccessGrantsTable.agendaId, agenda.id), eq(agendaAccessGrantsTable.tenantId, agenda.tenantId)));
  return res.json(grants);
});

router.post("/agendas/:id/access", async (req, res) => {
  const body = grantBodySchema.safeParse(req.body);
  if (!body.success) return res.status(422).json({ error: "userId is required" });
  const [agenda] = await db.select({ id: agendasTable.id, tenantId: agendasTable.tenantId })
    .from(agendasTable).where(eq(agendasTable.id, String(req.params.id))).limit(1);
  if (!agenda) return res.status(404).json({ error: "Agenda not found" });
  if (!req.user || !["super_admin", "tenant_admin"].includes(req.user.platformRole) ||
      (req.user.platformRole !== "super_admin" && req.user.tenantId !== agenda.tenantId)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const [member] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, body.data.userId), eq(usersTable.tenantId, agenda.tenantId))).limit(1);
  if (!member) return res.status(422).json({ error: "User does not belong to the agenda tenant" });
  await db.insert(agendaAccessGrantsTable).values({ agendaId: agenda.id, tenantId: agenda.tenantId, userId: member.id, grantedBy: req.user.sub ?? null })
    .onConflictDoNothing();
  await writeConfigurationAudit({ tenantId: agenda.tenantId, action: "criar", entity: "agenda_access_grant", entityId: `${agenda.id}:${member.id}`, after: { agendaId: agenda.id, userId: member.id }, actor: { userId: req.user.sub ?? null, ip: req.ip ?? null } });
  return res.status(201).json({ agendaId: agenda.id, userId: member.id });
});

router.delete("/agendas/:id/access/:userId", async (req, res) => {
  const [agenda] = await db.select({ id: agendasTable.id, tenantId: agendasTable.tenantId })
    .from(agendasTable).where(eq(agendasTable.id, String(req.params.id))).limit(1);
  if (!agenda) return res.status(404).json({ error: "Agenda not found" });
  if (!req.user || !["super_admin", "tenant_admin"].includes(req.user.platformRole) ||
      (req.user.platformRole !== "super_admin" && req.user.tenantId !== agenda.tenantId)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const userId = String(req.params.userId);
  await db.delete(agendaAccessGrantsTable).where(and(eq(agendaAccessGrantsTable.agendaId, agenda.id),
    eq(agendaAccessGrantsTable.tenantId, agenda.tenantId), eq(agendaAccessGrantsTable.userId, userId)));
  await writeConfigurationAudit({ tenantId: agenda.tenantId, action: "excluir", entity: "agenda_access_grant", entityId: `${agenda.id}:${userId}`, before: { agendaId: agenda.id, userId }, actor: { userId: req.user.sub ?? null, ip: req.ip ?? null } });
  return res.status(204).send();
});

// ── Google Calendar OAuth callback (PUBLIC — browser redirect from Google) ────

export const googleCallbackRouter: IRouter = Router();

googleCallbackRouter.get("/auth/google/calendar/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  // Determine the app URL for the post-auth redirect.
  // Prefer the actual request host so the user lands back on the same domain
  // they started from (appvendorai.com in prod, spock.replit.dev in dev).
  const reqHost = req.get("host") ?? "";
  const configuredFrontend = process.env["FRONTEND_APP_URL"]?.trim();
  const appUrl = configuredFrontend
    ? configuredFrontend.replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? "https://app.appvendorai.com"
      : reqHost
        ? `https://${reqHost}`
        : (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");

  if (error || !code || !state) {
    res.redirect(`${appUrl}/configuracoes?googleError=access_denied`);
    return;
  }

  let agendaId: string;
  let returnTo: string = "/agenda";
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8")
    ) as { agendaId: string; returnTo?: string };
    if (typeof decoded.agendaId !== "string" || !decoded.agendaId.trim()) throw new Error("Invalid agenda");
    agendaId = decoded.agendaId;
    if (decoded.returnTo === "/agenda" || decoded.returnTo === "/configuracoes") returnTo = decoded.returnTo;
  } catch {
    res.redirect(`${appUrl}/configuracoes?googleError=invalid_state`);
    return;
  }

  try {
    const before = await googleCalendarSnapshot(agendaId);
    await exchangeCodeAndStore(code, agendaId);
    const after = await googleCalendarSnapshot(agendaId);
    if (after) {
      await auditGoogleCalendar(req, after.tenantId, agendaId, before, after, before?.googleCalendarId ? "atualizar" : "criar");
    }
    res.redirect(`${appUrl}${returnTo}?googleConnected=1`);
  } catch (err) {
    req.log.error({ err }, "Google Calendar OAuth exchange failed");
    res.redirect(`${appUrl}${returnTo}?googleError=exchange_failed`);
  }
});

export default router;