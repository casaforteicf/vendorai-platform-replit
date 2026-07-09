import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULT_PREFERENCE = {
  mode: "light",
  accent: "violet",
  useDarkRenderWorkspace: true,
};

async function getThemePreference(tenantId: string | null, userId: string | null) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`tenant_id = '${tenantId}'`);
  }
  if (userId) {
    values.push(userId);
    conditions.push(`user_id = '${userId}'`);
  }

  const where = conditions.length > 0 ? conditions.join(" AND ") : "1=1";

  try {
    const result = await db.execute(
      sql.raw(`SELECT * FROM arch_theme_preferences WHERE ${where} ORDER BY updated_at DESC LIMIT 1`),
    );

    const rows = result.rows as Array<Record<string, unknown>>;
    const row = rows[0];

    if (!row) return DEFAULT_PREFERENCE;

    return {
      mode: (row.mode as string) || DEFAULT_PREFERENCE.mode,
      accent: (row.accent as string) || DEFAULT_PREFERENCE.accent,
      useDarkRenderWorkspace:
        row.use_dark_render_workspace !== undefined && row.use_dark_render_workspace !== null
          ? Boolean(row.use_dark_render_workspace)
          : DEFAULT_PREFERENCE.useDarkRenderWorkspace,
      updatedAt: (row.updated_at as string) || null,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

async function upsertThemePreference(
  tenantId: string | null,
  userId: string | null,
  payload: Record<string, unknown>,
) {
  const current = await getThemePreference(tenantId, userId);

  const next = {
    mode: (payload.mode as string) || current.mode || DEFAULT_PREFERENCE.mode,
    accent: (payload.accent as string) || current.accent || DEFAULT_PREFERENCE.accent,
    useDarkRenderWorkspace:
      payload.useDarkRenderWorkspace !== undefined
        ? Boolean(payload.useDarkRenderWorkspace)
        : (current.useDarkRenderWorkspace ?? DEFAULT_PREFERENCE.useDarkRenderWorkspace),
  };

  const tid = tenantId ?? null;
  const uid = userId ?? null;

  try {
    await db.execute(
      sql`
        INSERT INTO arch_theme_preferences (
          id, tenant_id, user_id, mode, accent, use_dark_render_workspace, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${tid}, ${uid}, ${next.mode}, ${next.accent}, ${next.useDarkRenderWorkspace}, now(), now()
        )
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          mode = EXCLUDED.mode,
          accent = EXCLUDED.accent,
          use_dark_render_workspace = EXCLUDED.use_dark_render_workspace,
          updated_at = now()
      `,
    );
  } catch {
  }

  return { ...next, updatedAt: new Date().toISOString() };
}

const archThemePreferencesRouter = Router();

archThemePreferencesRouter.get("/arch/theme-preference", async (req, res, next) => {
  try {
    const r = req as any;
    const tenantId: string | null = r.tenant?.id ?? r.user?.tenantId ?? null;
    const userId: string | null = r.user?.id ?? null;

    const preference = await getThemePreference(tenantId, userId);
    res.json({ preference });
  } catch (err) {
    next(err);
  }
});

archThemePreferencesRouter.patch("/arch/theme-preference", async (req, res, next) => {
  try {
    const r = req as any;
    const tenantId: string | null = r.tenant?.id ?? r.user?.tenantId ?? null;
    const userId: string | null = r.user?.id ?? null;

    const preference = await upsertThemePreference(tenantId, userId, req.body as Record<string, unknown>);
    res.json({ preference });
  } catch (err) {
    next(err);
  }
});

export default archThemePreferencesRouter;
