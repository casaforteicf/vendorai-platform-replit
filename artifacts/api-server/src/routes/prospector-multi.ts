import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { activitiesTable, db, leadsTable, prospectorConfigTable } from "@workspace/db";

const router: IRouter = Router();

function resolveTenantId(req: Express.Request, explicitTenantId?: string): string {
  const user = req.user;
  if (!user) throw Object.assign(new Error("Não autenticado"), { status: 401 });
  if (user.platformRole === "super_admin") {
    const tenantId = explicitTenantId ?? user.tenantId ?? undefined;
    if (!tenantId) throw Object.assign(new Error("tenantId é obrigatório para super_admin"), { status: 400 });
    return tenantId;
  }
  if (!user.tenantId) throw Object.assign(new Error("Usuário sem tenant associado"), { status: 403 });
  return user.tenantId;
}

function cleanUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length < 2) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

const multiConfigSchema = z.object({
  setores: z.array(z.string()).max(10),
  cidades: z.array(z.string()).max(20),
  ritmoDiario: z.number().int().min(1).max(500),
  ativo: z.boolean(),
  tenantId: z.string().optional(),
});

router.get("/prospector/config-multi", async (req, res) => {
  try {
    const explicitTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined;
    const tenantId = resolveTenantId(req, explicitTenantId);
    const rows = await db
      .select()
      .from(prospectorConfigTable)
      .where(eq(prospectorConfigTable.tenantId, tenantId))
      .orderBy(asc(prospectorConfigTable.createdAt));

    const setores = cleanUnique(rows.map((row) => row.setor ?? "").filter(Boolean));
    const cidades = cleanUnique(rows.map((row) => row.cidade ?? "").filter(Boolean));
    const ritmoDiario = rows[0]?.ritmoDiario ?? 10;
    const ativo = rows.some((row) => row.ativo);

    return res.status(200).json({
      config: {
        setores,
        cidades,
        ritmoDiario,
        ativo,
        combinacoes: rows
          .filter((row) => row.setor && row.cidade)
          .map((row) => ({ id: row.id, setor: row.setor, cidade: row.cidade, ativo: row.ativo })),
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao carregar configuração";
    return res.status(status).json({ error: message });
  }
});

router.get("/prospector/pilot-validation", async (req, res) => {
  try {
    // tenant-audit: reviewed explicit tenant is honored only for authenticated super_admin; all other users are bound to req.user.tenantId by resolveTenantId
    const explicitTenantId = typeof req.query["tenantId"] === "string" ? req.query["tenantId"] : undefined;
    const tenantId = resolveTenantId(req, explicitTenantId);
    const coldSources = ["prospector", "prospector_auto", "cnpj", "recem_aberta", "ad_library"];

    const leads = await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        telefone: leadsTable.telefone,
        email: leadsTable.email,
        source: leadsTable.source,
        mercadoSegmento: leadsTable.mercadoSegmento,
        endereco: leadsTable.endereco,
        enrichmentStatus: leadsTable.enrichmentStatus,
        propensityScore: leadsTable.propensityScore,
        intentScore: leadsTable.intentScore,
        priorityReason: leadsTable.priorityReason,
        proximaAcao: leadsTable.proximaAcao,
        metadata: leadsTable.metadata,
        createdAt: leadsTable.createdAt,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.source, coldSources)))
      .orderBy(desc(leadsTable.createdAt))
      .limit(5);

    const leadIds = leads.map((lead) => lead.id);
    const activities = leadIds.length
      ? await db
          .select({
            leadId: activitiesTable.leadId,
            tipo: activitiesTable.tipo,
            titulo: activitiesTable.titulo,
            descricao: activitiesTable.descricao,
            status: activitiesTable.status,
            createdAt: activitiesTable.createdAt,
          })
          .from(activitiesTable)
          .where(and(eq(activitiesTable.tenantId, tenantId), inArray(activitiesTable.leadId, leadIds)))
          .orderBy(desc(activitiesTable.createdAt))
      : [];

    const latestByLead = new Map<string, (typeof activities)[number]>();
    for (const activity of activities) {
      if (!latestByLead.has(activity.leadId)) latestByLead.set(activity.leadId, activity);
    }

    const prospects = leads.map((lead) => {
      const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
      const dossierRaw = metadata["coldProspectDossier"];
      const dossier = dossierRaw && typeof dossierRaw === "object" ? dossierRaw as Record<string, unknown> : {};
      const evidenceRaw = dossier["evidence"];
      const evidence = Array.isArray(evidenceRaw) ? evidenceRaw : [];
      const blockingReasons = Array.isArray(dossier["blockingReasons"])
        ? (dossier["blockingReasons"] as unknown[]).map(String)
        : [];
      const lastActivity = latestByLead.get(lead.id);
      const lpBrief = dossier["lpBrief"] && typeof dossier["lpBrief"] === "object"
        ? dossier["lpBrief"] as Record<string, unknown>
        : {};

      return {
        id: lead.id,
        name: lead.empresa ?? lead.nome,
        contact: lead.telefone ?? lead.email ?? null,
        city: typeof lpBrief["city"] === "string" ? lpBrief["city"] : lead.endereco,
        segment: lead.mercadoSegmento,
        source: lead.source,
        enrichmentStatus: lead.enrichmentStatus,
        propensityScore: lead.propensityScore ?? 0,
        fitScore: Number(dossier["fitScore"] ?? 0),
        painScore: Number(dossier["painScore"] ?? 0),
        intentScore: Number(lead.intentScore ?? dossier["intentScore"] ?? 0),
        dossierStatus: String(dossier["status"] ?? "aguardando_dossie"),
        evidenceCount: evidence.length,
        evidence: evidence.slice(0, 4),
        lpUrl: typeof dossier["lpUrl"] === "string" ? dossier["lpUrl"] : null,
        blockingReasons,
        priorityReason: lead.priorityReason,
        nextAction: lead.proximaAcao,
        lastActivity: lastActivity ? {
          type: lastActivity.tipo,
          title: lastActivity.titulo,
          description: lastActivity.descricao,
          status: lastActivity.status,
          at: lastActivity.createdAt,
        } : null,
        createdAt: lead.createdAt,
      };
    });

    return res.status(200).json({ prospects, limit: 5 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao carregar validação do piloto";
    return res.status(status).json({ error: message });
  }
});

router.put("/prospector/config-multi", async (req, res) => {
  const parsed = multiConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  try {
    const tenantId = resolveTenantId(req, parsed.data.tenantId);
    const setores = cleanUnique(parsed.data.setores);
    const cidades = cleanUnique(parsed.data.cidades);
    const totalCombinacoes = setores.length * cidades.length;

    if (parsed.data.ativo && (setores.length === 0 || cidades.length === 0)) {
      return res.status(400).json({ error: "Adicione pelo menos um nicho e uma localidade antes de ativar a busca automática." });
    }
    if (totalCombinacoes > 60) {
      return res.status(400).json({ error: "Use no máximo 60 combinações de nicho × localidade por configuração automática." });
    }

    await db.transaction(async (tx) => {
      await tx.delete(prospectorConfigTable).where(eq(prospectorConfigTable.tenantId, tenantId));

      if (setores.length > 0 && cidades.length > 0) {
        const combinations = setores.flatMap((setor) =>
          cidades.map((cidade) => ({
            tenantId,
            setor,
            cidade,
            ritmoDiario: parsed.data.ritmoDiario,
            ativo: parsed.data.ativo,
          })),
        );
        await tx.insert(prospectorConfigTable).values(combinations);
      } else {
        await tx.insert(prospectorConfigTable).values({
          tenantId,
          setor: setores[0] ?? null,
          cidade: cidades[0] ?? null,
          ritmoDiario: parsed.data.ritmoDiario,
          ativo: false,
        });
      }
    });

    return res.status(200).json({
      config: {
        setores,
        cidades,
        ritmoDiario: parsed.data.ritmoDiario,
        ativo: parsed.data.ativo && totalCombinacoes > 0,
        totalCombinacoes,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao salvar configuração";
    return res.status(status).json({ error: message });
  }
});

const leadTagsSchema = z.object({
  nichos: z.array(z.string()).max(20).default([]),
  localidades: z.array(z.string()).max(30).default([]),
  fonte: z.string().min(2).max(80).default("Prospector"),
  tenantId: z.string().optional(),
});

function stringsFromMetadata(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

router.post("/prospector/leads/:leadId/tags", async (req, res) => {
  const parsed = leadTagsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  try {
    const tenantId = resolveTenantId(req, parsed.data.tenantId);
    const leadId = req.params["leadId"]!;
    const [lead] = await db
      .select({ id: leadsTable.id, metadata: leadsTable.metadata, mercadoSegmento: leadsTable.mercadoSegmento })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: "Lead não encontrado para este tenant" });

    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const nichos = cleanUnique([...stringsFromMetadata(metadata, "prospector_nichos"), ...parsed.data.nichos]);
    const localidades = cleanUnique([...stringsFromMetadata(metadata, "prospector_localidades"), ...parsed.data.localidades]);
    const fontes = cleanUnique([...stringsFromMetadata(metadata, "prospector_fontes"), parsed.data.fonte]);
    const existingTags = stringsFromMetadata(metadata, "tags");
    const tags = cleanUnique([...existingTags, ...nichos, ...localidades, ...fontes]);

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      tags,
      prospector_nichos: nichos,
      prospector_localidades: localidades,
      prospector_fontes: fontes,
      prospector_tags: [
        ...nichos.map((valor) => ({ tipo: "atividade", valor })),
        ...localidades.map((valor) => ({ tipo: "localidade", valor })),
        ...fontes.map((valor) => ({ tipo: "fonte", valor })),
      ],
      prospector_tags_atualizadas_em: new Date().toISOString(),
    };

    await db
      .update(leadsTable)
      .set({
        metadata: nextMetadata,
        mercadoSegmento: lead.mercadoSegmento ?? nichos[0] ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    return res.status(200).json({ leadId, tags, nichos, localidades, fontes });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : "Falha ao atualizar tags do prospect";
    return res.status(status).json({ error: message });
  }
});

export default router;
