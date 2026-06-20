import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, tenantsTable, leadsTable } from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";

export const intakeRouter: IRouter = Router();

const intakeSchema = z.object({
  nome: z.string().min(1),
  email: z.string().optional(),
  telefone: z.string().optional(),
  cargo: z.string().optional(),
  empresa: z.string().optional(),
  segmento: z.string().optional(),
  descricaoNegocio: z.string().optional(),
  produtos: z.string().optional(),
  diferenciais: z.string().optional(),
  publicoAlvo: z.string().optional(),
  concorrentes: z.string().optional(),
  temSite: z.string().optional(),
  urlSite: z.string().optional(),
  precisaCriar: z.array(z.string()).optional(),
  redesSociais: z.array(z.string()).optional(),
  canaisVenda: z.array(z.string()).optional(),
  temCrm: z.string().optional(),
  qualCrm: z.string().optional(),
  tamanhoEquipe: z.string().optional(),
  ticketMedio: z.string().optional(),
  leadsPerMes: z.string().optional(),
  desafioPrincipal: z.string().optional(),
  objetivo6meses: z.string().optional(),
  urgencia: z.string().optional(),
  orcamento: z.string().optional(),
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

  const d = parsed.data;

  const discoveryData: Record<string, unknown> = {
    segmento: d.segmento,
    descricaoNegocio: d.descricaoNegocio,
    produtos: d.produtos,
    diferenciais: d.diferenciais,
    publicoAlvo: d.publicoAlvo,
    concorrentes: d.concorrentes,
    temSite: d.temSite,
    urlSite: d.urlSite,
    precisaCriar: d.precisaCriar,
    redesSociais: d.redesSociais,
    canaisVenda: d.canaisVenda,
    temCrm: d.temCrm,
    qualCrm: d.qualCrm,
    leadsPerMes: d.leadsPerMes,
    ticketMedio: d.ticketMedio,
    objetivo6meses: d.objetivo6meses,
    cargo: d.cargo,
  };

  // Dedup: check for existing lead by phone or document
  const match = await findLeadByDedup(tenant.id, d.telefone, null, d.nome);
  let leadId: string | undefined;

  if (match.found) {
    leadId = match.lead.id;
    await db
      .update(leadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(leadsTable.id, leadId));
  } else {
    const insertData = {
      tenantId: tenant.id,
      nome: d.nome,
      email: d.email || null,
      telefone: storePhone(d.telefone),
      empresa: d.empresa || null,
      objetivo: d.objetivo6meses || null,
      dorPrincipal: d.desafioPrincipal || null,
      urgencia: d.urgencia || null,
      orcamento: d.orcamento || null,
      tamanhoEquipe: d.tamanhoEquipe || null,
      status: "novo" as const,
      discoveryData,
      possivelDuplicata: match.similar ? true : false,
      leadSimilarId: match.similar?.id ?? null,
    };
    const [lead] = await db.insert(leadsTable).values(insertData).returning({ id: leadsTable.id });
    leadId = lead?.id;
  }

  res.status(201).json({ ok: true, leadId, isDuplicate: match.found ? true : match.similar ? "possible" : false });
});
