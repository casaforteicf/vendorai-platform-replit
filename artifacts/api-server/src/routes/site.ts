import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { siteVerticaisTable, siteContatosTable, leadsTable, dealsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { Resend } from "resend";
import { logger } from "../lib/logger.js";
import { storePhone, findLeadByDedup } from "../lib/dedup.js";
import { pickNextVendedor } from "../lib/round-robin.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";

const router: IRouter = Router();

// Tenant real do Vendor.ai institucional (slug "vendorai") — não é o literal
// "vendorai-institucional" (esse id não existe na tabela tenants; usá-lo
// quebrava a FK e fazia todo lead do site cair silenciosamente).
const INSTITUTIONAL_TENANT_ID = "1d4ea673-58d0-413a-a554-c9aca72a3121";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ─── GET /site/verticais ────────────────────────────────────────────────────
router.get("/site/verticais", async (_req, res) => {
  const rows = await db
    .select()
    .from(siteVerticaisTable)
    .where(eq(siteVerticaisTable.ativo, true))
    .orderBy(asc(siteVerticaisTable.ordem));

  return res.json(rows);
});

// ─── GET /site/verticais/:slug ──────────────────────────────────────────────
router.get("/site/verticais/:slug", async (req, res) => {
  const [row] = await db
    .select()
    .from(siteVerticaisTable)
    .where(
      and(
        eq(siteVerticaisTable.slug, req.params.slug),
        eq(siteVerticaisTable.ativo, true),
      ),
    )
    .limit(1);

  if (!row) {
    return res.status(404).json({ error: "Vertical não encontrada." });
  }

  return res.json(row);
});

// ─── POST /site/contato ─────────────────────────────────────────────────────
// origem: aceita qualquer slug legível (ex: "formulario_contato", "lp_auto-pecas", "cta_final")
const contatoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  mensagem: z.string().min(5, "Mensagem obrigatória"),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  origem: z
    .string()
    .regex(/^[a-z0-9_-]+$/, "Origem inválida")
    .max(64)
    .optional(),
});

router.post("/site/contato", async (req, res) => {
  const parsed = contatoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados inválidos.",
      details: parsed.error.issues.map((i) => i.message),
    });
  }

  const { nome, email, mensagem, telefone, empresa, origem } = parsed.data;
  const telefoneSanitizado = telefone ? storePhone(telefone) : null;
  const sourceLabel = origem ? `site_${origem}` : "site_institucional";

  // 1 — Gravar em site_contatos (log bruto, sempre)
  await db.insert(siteContatosTable).values({
    nome,
    email,
    mensagem,
    telefone: telefoneSanitizado ?? null,
    empresa: empresa ?? null,
    origem: origem ?? null,
    status: "novo",
  });

  // 2 — Gravar lead + deal no pipeline institucional e disparar SDR (background, não bloqueia resposta)
  void (async () => {
    try {
      // 2a — Dedup: se já existe, não duplicar
      const dedup = await findLeadByDedup(
        INSTITUTIONAL_TENANT_ID,
        telefoneSanitizado,
        null,
        nome,
      );

      let leadId: string;

      if (dedup.found && dedup.lead) {
        leadId = dedup.lead.id;
        logger.info({ leadId, nome }, "site/contato: lead já existe — usando existente");
      } else {
        // 2b — Resolver vendedor responsável via round-robin
        const assignedTo = await pickNextVendedor(INSTITUTIONAL_TENANT_ID).catch(() => null);

        // Contexto da mensagem e origem no campo notasNutricao para o SDR
        const notasNutricao = [
          origem ? `Origem: ${origem}` : null,
          `Mensagem do site: "${mensagem}"`,
        ]
          .filter(Boolean)
          .join("\n");

        const [createdLead] = await db
          .insert(leadsTable)
          .values({
            tenantId: INSTITUTIONAL_TENANT_ID,
            nome,
            email,
            telefone: telefoneSanitizado ?? null,
            empresa: empresa ?? null,
            notasNutricao,
            source: sourceLabel,
            status: "novo",
            assignedTo: assignedTo ?? null,
          })
          .returning({ id: leadsTable.id });

        leadId = createdLead.id;

        // 2c — Criar deal no pipeline em "aquecimento"
        const [createdDeal] = await db
          .insert(dealsTable)
          .values({
            tenantId: INSTITUTIONAL_TENANT_ID,
            leadId,
            titulo: nome,
            etapa: "em_aquecimento",
            assignedTo: assignedTo ?? null,
          })
          .returning({ id: dealsTable.id });

        logger.info(
          { leadId, dealId: createdDeal.id, tenantId: INSTITUTIONAL_TENANT_ID },
          "site/contato: lead e deal criados no pipeline institucional",
        );

        // 2d — Disparar Recepção (primeira resposta via WhatsApp — ignora se não configurado)
        if (telefoneSanitizado) {
          // dispatchAgentBackground é fire-and-forget (void) — já loga erro
          // internamente via o `log` passado, não retorna Promise pra encadear.
          dispatchAgentBackground({
            tenantId: INSTITUTIONAL_TENANT_ID,
            leadId,
            mensagem: `[NOVO CONTATO PELO SITE] ${nome} preencheu o formulário "Fale com Especialistas".` +
              (empresa ? ` Empresa: ${empresa}.` : "") +
              ` Mensagem: "${mensagem}"` +
              (origem ? ` (origem: ${origem})` : "") +
              ` Dê boas-vindas e entenda o que precisa — a mensagem foi enviada pelo site, ainda não é uma conversa em andamento.`,
            log: logger,
            forcedAgent: "reception",
            scenario: { origem: "site_contato", origemDetalhe: origem ?? null },
          });
          logger.info({ leadId }, "site/contato: recepção disparada em background");
        } else {
          logger.info({ leadId }, "site/contato: sem telefone — recepção via WhatsApp não disparada");
        }
      }
    } catch (err) {
      logger.warn({ err }, "site/contato: falha ao criar lead/deal institucional (não bloqueia resposta)");
    }
  })();

  // 3 — Notificar por e-mail
  if (resend) {
    resend.emails
      .send({
        from: "VendorAI Site <noreply@vendorai.app>",
        to: "vendorai@appvendorai.com",
        subject: `[Site] Novo contato: ${nome}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="font-size:18px;color:#111;margin-bottom:16px;">📬 Novo contato recebido pelo site institucional</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
              <tr><td style="padding:8px 0;font-weight:600;width:120px;">Nome</td><td style="padding:8px 0;">${nome}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">E-mail</td><td style="padding:8px;"><a href="mailto:${email}" style="color:#2563eb;">${email}</a></td></tr>
              ${telefoneSanitizado ? `<tr><td style="padding:8px 0;font-weight:600;">Telefone</td><td style="padding:8px 0;">${telefoneSanitizado}</td></tr>` : ""}
              ${empresa ? `<tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">Empresa</td><td style="padding:8px;">${empresa}</td></tr>` : ""}
              ${origem ? `<tr><td style="padding:8px 0;font-weight:600;">Origem</td><td style="padding:8px 0;">${origem}</td></tr>` : ""}
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;vertical-align:top;">Mensagem</td><td style="padding:8px;">${mensagem.replace(/\n/g, "<br>")}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#888;">Enviado automaticamente pelo site VendorAI.</p>
          </div>
        `,
      })
      .catch((err) => {
        logger.warn({ err }, "site/contato: falha ao enviar e-mail de notificação");
      });
  } else {
    logger.warn("site/contato: RESEND_API_KEY não configurada — e-mail de notificação ignorado");
  }

  return res.json({
    success: true,
    mensagem: "Recebemos seu contato! Retornamos em breve.",
  });
});

export default router;
