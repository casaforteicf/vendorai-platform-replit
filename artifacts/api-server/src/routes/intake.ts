import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, tenantsTable, leadsTable } from "@workspace/db";

export const intakeRouter: IRouter = Router();

const intakeSchema = z.object({
  nome: z.string().min(1),
  email: z.string().optional(),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  cargo: z.string().optional(),
  objetivo: z.string().optional(),
  observacoes: z.string().optional(),
});

intakeRouter.get("/public/:tenantSlug/intake", async (req, res) => {
  const slug = String(req.params["tenantSlug"]);
  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (!tenant) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }

  res.json({ name: tenant.name, slug: tenant.slug });
});

intakeRouter.post("/public/:tenantSlug/intake", async (req, res) => {
  const slug = String(req.params["tenantSlug"]);

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));

  if (!tenant) {
    res.status(404).json({ error: "Empresa não encontrada" });
    return;
  }

  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { nome, email, telefone, empresa, objetivo, observacoes, cargo } = parsed.data;

  const obs = [cargo ? `Cargo: ${cargo}` : null, observacoes ?? null]
    .filter(Boolean)
    .join("\n");

  const [lead] = await db
    .insert(leadsTable)
    .values({
      tenantId: tenant.id,
      nome,
      email: email || null,
      telefone: telefone || null,
      empresa: empresa || null,
      objetivo: objetivo || null,
      dorPrincipal: obs || null,
      status: "novo",
    })
    .returning({ id: leadsTable.id });

  res.status(201).json({ ok: true, leadId: lead?.id });
});
