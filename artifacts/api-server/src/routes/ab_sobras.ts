import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { AB_MOTIVOS_SOBRA, abSobrasTable, insertAbSobraSchema } from "@workspace/db";
import {
  abAllowed,
  camposInvalidos,
  isForeignKeyViolation,
  withTenantTx,
} from "../lib/ab/escopo.js";

const router: IRouter = Router();

/**
 * A&B — sobras e desperdício (AB-03 / FASE 1).
 *
 * `tenant_id` vem do JWT; o corpo nunca o informa. `registrado_por` também é
 * forçado para o usuário do token — aceitar do corpo deixaria alguém registrar
 * sobra no nome de outra pessoa.
 */
const corpoSobra = insertAbSobraSchema.omit({ registradoPor: true });

const filtros = z.object({
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  insumoId: z.string().uuid().optional(),
  motivo: z.enum(AB_MOTIVOS_SOBRA).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

function arredondar(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── POST /tenants/:tenantId/ab/sobras ────────────────────────────────────────
router.post("/tenants/:tenantId/ab/sobras", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = corpoSobra.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Sobra inválida", fields: camposInvalidos(parsed.error) });
  }

  try {
    const linha = await withTenantTx(t, async (tx) => {
      const [criada] = await tx
        .insert(abSobrasTable)
        .values({
          tenantId: t,
          data: parsed.data.data,
          insumoId: parsed.data.insumoId ?? null,
          insumoNome: parsed.data.insumoNome,
          pesoKg: parsed.data.pesoKg,
          motivo: parsed.data.motivo,
          fotoUrl: parsed.data.fotoUrl ?? null,
          observacao: parsed.data.observacao ?? null,
          registradoPor: req.user?.sub ?? null,
        })
        .returning();
      return criada;
    });
    return res.status(201).json(linha);
  } catch (e) {
    if (isForeignKeyViolation(e)) {
      return res.status(422).json({ error: "Insumo não pertence a este hotel" });
    }
    console.error("[ab-sobras] create", e);
    return res.status(500).json({ error: "Could not create sobra" });
  }
});

// ── GET /tenants/:tenantId/ab/sobras ────────────────────────────────────────
router.get("/tenants/:tenantId/ab/sobras", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!abAllowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const parsed = filtros.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Filtros inválidos", fields: camposInvalidos(parsed.error) });
  }
  const f = parsed.data;
  if (f.dataInicio && f.dataFim && f.dataFim < f.dataInicio) {
    return res.status(422).json({ error: "dataFim não pode ser anterior a dataInicio" });
  }

  const condicoes = [eq(abSobrasTable.tenantId, t)];
  if (f.dataInicio) condicoes.push(gte(abSobrasTable.data, f.dataInicio));
  if (f.dataFim) condicoes.push(lte(abSobrasTable.data, f.dataFim));
  if (f.insumoId) condicoes.push(eq(abSobrasTable.insumoId, f.insumoId));
  if (f.motivo) condicoes.push(eq(abSobrasTable.motivo, f.motivo));

  try {
    const linhas = await withTenantTx(t, async (tx) =>
      tx
        .select()
        .from(abSobrasTable)
        .where(and(...condicoes))
        .orderBy(desc(abSobrasTable.data), desc(abSobrasTable.createdAt))
        .limit(f.limite),
    );

    // O resumo evita uma segunda chamada só para o total na tela.
    const totalKg = arredondar(linhas.reduce((soma, l) => soma + Number(l.pesoKg), 0));
    const porMotivo = linhas.reduce<Record<string, number>>((acc, l) => {
      acc[l.motivo] = arredondar((acc[l.motivo] ?? 0) + Number(l.pesoKg));
      return acc;
    }, {});

    return res.json({
      sobras: linhas,
      resumo: { totalRegistros: linhas.length, totalKg, porMotivo },
    });
  } catch (e) {
    console.error("[ab-sobras] list", e);
    return res.status(500).json({ error: "Could not list sobras" });
  }
});

export default router;
