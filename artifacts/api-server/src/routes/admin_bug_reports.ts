import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, count } from "drizzle-orm";
import { z } from "zod/v4";
import { db, bugReportsTable, tenantsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// GET /admin/bug-reports
router.get("/admin/bug-reports", requireRole("super_admin"), async (req, res) => {
  const { status, prioridade, categoria, tenantId, startDate, endDate } = req.query;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status && status !== "all") conditions.push(eq(bugReportsTable.status, status as "aberto" | "em_analise" | "resolvido"));
  if (prioridade && prioridade !== "all") conditions.push(eq(bugReportsTable.prioridade, prioridade as "baixa" | "media" | "alta" | "critica"));
  if (categoria && categoria !== "all") conditions.push(eq(bugReportsTable.categoria, categoria as "bug" | "duvida" | "sugestao"));
  if (tenantId && tenantId !== "all") conditions.push(eq(bugReportsTable.tenantId, tenantId as string));
  if (startDate) conditions.push(gte(bugReportsTable.createdAt, new Date(startDate as string)));
  if (endDate) conditions.push(lte(bugReportsTable.createdAt, new Date(endDate as string)));

  const rows = await db
    .select({
      id: bugReportsTable.id,
      tenantId: bugReportsTable.tenantId,
      tenantName: tenantsTable.name,
      titulo: bugReportsTable.titulo,
      descricao: bugReportsTable.descricao,
      categoria: bugReportsTable.categoria,
      status: bugReportsTable.status,
      prioridade: bugReportsTable.prioridade,
      rotaAfetada: bugReportsTable.rotaAfetada,
      erroTecnico: bugReportsTable.erroTecnico,
      stackTrace: bugReportsTable.stackTrace,
      respostaSuporte: bugReportsTable.respostaSuporte,
      resolvidoAt: bugReportsTable.resolvidoAt,
      createdAt: bugReportsTable.createdAt,
      updatedAt: bugReportsTable.updatedAt,
    })
    .from(bugReportsTable)
    .leftJoin(tenantsTable, eq(bugReportsTable.tenantId, tenantsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bugReportsTable.createdAt));

  return res.json(rows);
});

// GET /admin/bug-reports/open-count — badge counter
router.get("/admin/bug-reports/open-count", requireRole("super_admin"), async (_req, res) => {
  const [result] = await db
    .select({ count: count() })
    .from(bugReportsTable)
    .where(eq(bugReportsTable.status, "aberto"));

  return res.json({ count: result?.count ?? 0 });
});

// PATCH /admin/bug-reports/:id
const patchSchema = z.object({
  status: z.enum(["em_analise", "resolvido"]),
  respostaSuporte: z.string().optional(),
});

router.patch("/admin/bug-reports/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { status, respostaSuporte } = parsed.data;

  const [existing] = await db
    .select()
    .from(bugReportsTable)
    .where(eq(bugReportsTable.id, req.params.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Bug report not found" });
    return;
  }

  const [updated] = await db
    .update(bugReportsTable)
    .set({
      status,
      ...(respostaSuporte !== undefined ? { respostaSuporte } : {}),
      ...(status === "resolvido" ? { resolvidoAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bugReportsTable.id, req.params.id))
    .returning();

  if (status === "resolvido") {
    try {
      const [adminUser] = await db
        .select({ telefone: usersTable.telefone })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.tenantId, existing.tenantId),
            eq(usersTable.platformRole, "tenant_admin")
          )
        )
        .limit(1);

      if (adminUser?.telefone) {
        const protocolo = `#${existing.id.substring(0, 8).toUpperCase()}`;
        const resposta = respostaSuporte ?? existing.respostaSuporte;
        const msg = [
          `✅ *VendorAI — Chamado Resolvido*`,
          ``,
          `Protocolo: ${protocolo}`,
          `Assunto: ${existing.titulo}`,
          ``,
          `Seu chamado foi analisado e resolvido pela nossa equipe.`,
          ...(resposta ? [``, `Resposta: ${resposta}`] : []),
          ``,
          `Obrigado por usar o VendorAI! 🚀`,
        ].join("\n");

        await sendDirectWhatsAppMessage(existing.tenantId, adminUser.telefone, msg, logger);
      }
    } catch (err) {
      logger.warn({ err, bugId: existing.id }, "admin_bug_reports: WhatsApp notification failed (non-critical)");
    }
  }

  return res.json(updated);
});

export default router;
