import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { siteVerticaisTable, siteContatosTable, leadsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { Resend } from "resend";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const INSTITUTIONAL_TENANT_ID = "vendorai-institucional";

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
const contatoSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  mensagem: z.string().min(5, "Mensagem obrigatória"),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  origem: z
    .enum([
      "cta_final",
      "formulario_contato",
      "plano_growth",
      "plano_pme",
      "plano_enterprise",
      "parceiro_interesse",
    ])
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

  // 1 — Gravar em site_contatos
  await db.insert(siteContatosTable).values({
    nome,
    email,
    mensagem,
    telefone: telefone ?? null,
    empresa: empresa ?? null,
    origem: origem ?? null,
    status: "novo",
  });

  // 2 — Gravar como lead no tenant institucional
  try {
    await db.insert(leadsTable).values({
      tenantId: INSTITUTIONAL_TENANT_ID,
      nome,
      email,
      telefone: telefone ?? null,
      empresa: empresa ?? null,
      notasNutricao: mensagem,
      source: origem ? `site_${origem}` : "site_institucional",
      status: "novo",
    });
  } catch (err) {
    logger.warn({ err }, "site/contato: falha ao inserir lead institucional (não bloqueia resposta)");
  }

  // 3 — Notificar por e-mail
  if (resend) {
    try {
      await resend.emails.send({
        from: "VendorAI Site <noreply@vendorai.app>",
        to: "vendorai@appvendorai.com",
        subject: `[Site] Novo contato: ${nome}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="font-size:18px;color:#111;margin-bottom:16px;">📬 Novo contato recebido pelo site institucional</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;color:#333;">
              <tr><td style="padding:8px 0;font-weight:600;width:120px;">Nome</td><td style="padding:8px 0;">${nome}</td></tr>
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">E-mail</td><td style="padding:8px;"><a href="mailto:${email}" style="color:#2563eb;">${email}</a></td></tr>
              ${telefone ? `<tr><td style="padding:8px 0;font-weight:600;">Telefone</td><td style="padding:8px 0;">${telefone}</td></tr>` : ""}
              ${empresa ? `<tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;">Empresa</td><td style="padding:8px;">${empresa}</td></tr>` : ""}
              ${origem ? `<tr><td style="padding:8px 0;font-weight:600;">Origem</td><td style="padding:8px 0;">${origem}</td></tr>` : ""}
              <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:600;vertical-align:top;">Mensagem</td><td style="padding:8px;">${mensagem.replace(/\n/g, "<br>")}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#888;">Enviado automaticamente pelo site VendorAI.</p>
          </div>
        `,
      });
    } catch (err) {
      logger.warn({ err }, "site/contato: falha ao enviar e-mail de notificação (não bloqueia resposta)");
    }
  } else {
    logger.warn("site/contato: RESEND_API_KEY não configurada — e-mail de notificação ignorado");
  }

  return res.json({
    success: true,
    mensagem: "Recebemos seu contato! Retornamos em breve.",
  });
});

export default router;
