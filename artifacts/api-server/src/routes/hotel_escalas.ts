import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { hotelEscalaConfigTable, hotelEscalaVersoesTable } from "@workspace/db";
import { camposInvalidos, withTenantTx } from "../lib/ab/escopo.js";

const router: IRouter = Router();

function allowed(req: Express.Request, tenantId: string, write = false) {
  const u = req.user;
  return !!(
    u?.sub &&
    u.tenantId === tenantId &&
    u.actorType !== "ai" &&
    u.actorType !== "system" &&
    (!write || u.platformRole === "tenant_admin" || u.role === "admin" || u.userFunction === "administrador")
  );
}

const stateSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost: z.number().finite().min(0).max(1000000).default(120),
  staff: z.array(z.record(z.string(), z.unknown())).max(500),
  days: z.array(z.record(z.string(), z.unknown())).length(35),
  criticalPairs: z.array(z.array(z.string())).max(100).optional().default([]),
  rates: z.record(z.string(), z.number()).optional(),
  holidays: z.record(z.string(), z.boolean()).optional(),
  extraPeople: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
}).passthrough();

const bodySchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  state: stateSchema,
}).strict();

function serializar(state: unknown): string {
  return JSON.stringify(state ?? {});
}

router.get("/tenants/:tenantId/hotelaria/escalas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!allowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const config = await withTenantTx(tenantId, async (tx) => {
      const [row] = await tx.select().from(hotelEscalaConfigTable).where(eq(hotelEscalaConfigTable.tenantId, tenantId));
      return row ?? null;
    });
    return res.json({ config });
  } catch (erro) {
    console.error("[hotel-escalas] get", erro);
    return res.status(500).json({ error: "Não foi possível carregar a escala" });
  }
});

router.put("/tenants/:tenantId/hotelaria/escalas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!allowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Escala inválida", fields: camposInvalidos(parsed.error) });
  if (serializar(parsed.data.state).length > 2_000_000) return res.status(413).json({ error: "Escala muito grande" });

  try {
    const salvo = await withTenantTx(tenantId, async (tx) => {
      const [existente] = await tx.select().from(hotelEscalaConfigTable).where(eq(hotelEscalaConfigTable.tenantId, tenantId));
      const now = new Date();
      let config;
      if (existente) {
        const [atualizado] = await tx.update(hotelEscalaConfigTable).set({
          nome: parsed.data.nome ?? existente.nome,
          state: parsed.data.state as Record<string, unknown>,
          version: existente.version + 1,
          updatedBy: req.user?.sub ?? null,
          updatedAt: now,
        }).where(eq(hotelEscalaConfigTable.id, existente.id)).returning();
        config = atualizado;
      } else {
        const [criado] = await tx.insert(hotelEscalaConfigTable).values({
          tenantId,
          nome: parsed.data.nome ?? "Escala A&B",
          state: parsed.data.state as Record<string, unknown>,
          version: 1,
          updatedBy: req.user?.sub ?? null,
        }).returning();
        config = criado;
      }
      if (!config) throw new Error("Falha ao salvar configuração");
      await tx.insert(hotelEscalaVersoesTable).values({
        tenantId,
        configId: config.id,
        version: config.version,
        state: parsed.data.state as Record<string, unknown>,
        savedBy: req.user?.sub ?? null,
      });
      return config;
    });
    return res.json({ config: salvo });
  } catch (erro) {
    console.error("[hotel-escalas] put", erro);
    return res.status(500).json({ error: "Não foi possível salvar a escala" });
  }
});

router.get("/tenants/:tenantId/hotelaria/escalas/historico", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!allowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const limite = Number(req.query.limite ?? 20);
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) return res.status(422).json({ error: "Limite inválido" });
  try {
    const versoes = await withTenantTx(tenantId, async (tx) => tx
      .select({
        id: hotelEscalaVersoesTable.id,
        version: hotelEscalaVersoesTable.version,
        savedBy: hotelEscalaVersoesTable.savedBy,
        createdAt: hotelEscalaVersoesTable.createdAt,
        inicio: sql<string | null>`${hotelEscalaVersoesTable.state}->>'start'`.as("inicio"),
      })
      .from(hotelEscalaVersoesTable)
      .where(eq(hotelEscalaVersoesTable.tenantId, tenantId))
      .orderBy(desc(hotelEscalaVersoesTable.createdAt))
      .limit(limite));
    return res.json({ versoes });
  } catch (erro) {
    console.error("[hotel-escalas] historico", erro);
    return res.status(500).json({ error: "Não foi possível carregar o histórico" });
  }
});

router.get("/tenants/:tenantId/hotelaria/escalas/historico/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!allowed(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Versão inválida" });
  try {
    const [versao] = await withTenantTx(tenantId, async (tx) => tx
      .select()
      .from(hotelEscalaVersoesTable)
      .where(and(eq(hotelEscalaVersoesTable.tenantId, tenantId), eq(hotelEscalaVersoesTable.id, String(req.params.id)))));
    return versao ? res.json({ versao }) : res.status(404).json({ error: "Versão não encontrada" });
  } catch (erro) {
    console.error("[hotel-escalas] versao", erro);
    return res.status(500).json({ error: "Não foi possível carregar a versão" });
  }
});

router.post("/tenants/:tenantId/hotelaria/escalas/historico/:id/restaurar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!allowed(req, tenantId, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Versão inválida" });
  try {
    const restaurado = await withTenantTx(tenantId, async (tx) => {
      const [versao] = await tx.select().from(hotelEscalaVersoesTable).where(and(
        eq(hotelEscalaVersoesTable.tenantId, tenantId),
        eq(hotelEscalaVersoesTable.id, String(req.params.id)),
      ));
      if (!versao) return null;
      const [existente] = await tx.select().from(hotelEscalaConfigTable).where(eq(hotelEscalaConfigTable.tenantId, tenantId));
      if (!existente) return null;
      const [config] = await tx.update(hotelEscalaConfigTable).set({
        state: versao.state,
        version: existente.version + 1,
        updatedBy: req.user?.sub ?? null,
        updatedAt: new Date(),
      }).where(eq(hotelEscalaConfigTable.id, existente.id)).returning();
      if (config) {
        await tx.insert(hotelEscalaVersoesTable).values({
          tenantId,
          configId: config.id,
          version: config.version,
          state: versao.state,
          savedBy: req.user?.sub ?? null,
        });
      }
      return config;
    });
    return restaurado ? res.json({ config: restaurado }) : res.status(404).json({ error: "Versão não encontrada" });
  } catch (erro) {
    console.error("[hotel-escalas] restaurar", erro);
    return res.status(500).json({ error: "Não foi possível restaurar a versão" });
  }
});

export default router;
