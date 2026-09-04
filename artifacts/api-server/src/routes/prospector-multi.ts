import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, eq } from "drizzle-orm";
import { db, leadsTable, prospectorConfigTable } from "@workspace/db";

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

// Configuração multi-nicho/multi-localidade do Prospector.
// Cada combinação é persistida como uma linha da tabela já existente. Isso
// preserva o scheduler oficial sem criar um segundo motor de prospecção.
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
        // Mantém preferências de ritmo mesmo enquanto a busca está vazia/desativada.
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
