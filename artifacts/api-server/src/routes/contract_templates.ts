import { Router } from "express";
import multer from "multer";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  db,
  dealsTable,
  leadsTable,
  tenantsTable,
  contractsTable,
  partnersTable,
} from "@workspace/db";
import { generateContractFromTemplate, generateContractPDF } from "../lib/contract-generation.js";
import { createDocument, isZapSignConfigured } from "../lib/zapsign.js";
import { requireRole } from "../middlewares/auth.js";

const router = Router();

const uploadTemplate = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["text/html", "application/octet-stream", "text/plain"];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.endsWith(".html") ||
      file.originalname.endsWith(".htm")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos HTML são aceitos como modelo de contrato"));
    }
  },
});

// ─── Upload / replace contract template ───────────────────────────────────────
router.post(
  "/api/tenants/:tenantId/contract-template",
  requireRole(["tenant_admin", "super_admin"]),
  uploadTemplate.single("file"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    const templateHtml = req.file.buffer.toString("utf-8");
    const templateName = req.file.originalname;

    try {
      await db.execute(
        sql`UPDATE tenants
            SET contract_template_html = ${templateHtml},
                contract_template_name = ${templateName},
                updated_at = NOW()
            WHERE id = ${tenantId}`
      );

      req.log.info({ tenantId, fileName: templateName }, "contract-template: saved");
      res.json({ success: true, name: templateName });
    } catch (err) {
      req.log.error({ err }, "contract-template: save failed");
      res.status(500).json({ error: "Erro ao salvar modelo de contrato" });
    }
  }
);

// ─── Get current contract template ────────────────────────────────────────────
router.get("/api/tenants/:tenantId/contract-template", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.tenantId !== tenantId
  ) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    const result = await db.execute(
      sql`SELECT contract_template_html, contract_template_name FROM tenants WHERE id = ${tenantId}`
    );
    const row = result.rows?.[0] as Record<string, unknown> | undefined;

    res.json({
      templateHtml: row?.contract_template_html ?? null,
      templateName: row?.contract_template_name ?? null,
      hasTemplate: !!(row?.contract_template_html),
    });
  } catch (err) {
    req.log.error({ err }, "contract-template: get failed");
    res.status(500).json({ error: "Erro ao buscar modelo" });
  }
});

// ─── Delete contract template ──────────────────────────────────────────────────
router.delete(
  "/api/tenants/:tenantId/contract-template",
  requireRole(["tenant_admin", "super_admin"]),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    await db.execute(
      sql`UPDATE tenants SET contract_template_html = NULL, contract_template_name = NULL, updated_at = NOW() WHERE id = ${tenantId}`
    );

    res.json({ success: true });
  }
);

// ─── List active deals for a lead (for pedido selection in contract) ──────────
router.get("/api/tenants/:tenantId/leads/:leadId/active-deals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);

  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.tenantId !== tenantId
  ) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    const deals = await db
      .select({
        id: dealsTable.id,
        titulo: dealsTable.titulo,
        valor: dealsTable.valor,
        etapa: dealsTable.etapa,
        tipoFechamento: dealsTable.tipoFechamento,
        planoContratado: dealsTable.planoContratado,
        createdAt: dealsTable.createdAt,
      })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.tenantId, tenantId),
          eq(dealsTable.leadId, leadId),
          ne(dealsTable.etapa, "perdido")
        )
      )
      .orderBy(dealsTable.createdAt);

    res.json(deals);
  } catch (err) {
    req.log.error({ err }, "active-deals: failed");
    res.status(500).json({ error: "Erro ao buscar negócios ativos" });
  }
});

// ─── Generate & send contract via ZapSign ─────────────────────────────────────
router.post("/api/deals/:dealId/generate-contract", async (req, res) => {
  const dealId = String(req.params.dealId);
  const { selectedDealIds }: { selectedDealIds?: string[] } = req.body ?? {};

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, dealId));

  if (!deal) {
    res.status(404).json({ error: "Negócio não encontrado" });
    return;
  }

  const tenantId = deal.tenantId;

  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.tenantId !== tenantId
  ) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  if (!isZapSignConfigured()) {
    res.status(422).json({ error: "ZapSign não configurado. Adicione ZAPSIGN_API_TOKEN nas configurações." });
    return;
  }

  try {
    // Fetch lead
    const [lead] = deal.leadId
      ? await db
          .select()
          .from(leadsTable)
          .where(eq(leadsTable.id, deal.leadId))
      : [null];

    if (!lead?.email) {
      res.status(422).json({ error: "O lead precisa ter um e-mail cadastrado para receber o contrato." });
      return;
    }

    // Fetch tenant
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    // Fetch selected deals (pedidos)
    let selectedDeals: typeof deal[] = [deal];
    if (selectedDealIds && selectedDealIds.length > 0) {
      selectedDeals = await db
        .select()
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.tenantId, tenantId),
            sql`${dealsTable.id} = ANY(${selectedDealIds})`
          )
        );
    }

    // Fetch partner if exists
    let partnerName: string | undefined;
    let partnerEmail: string | undefined;
    if (tenant?.partnerId) {
      const [partner] = await db
        .select({ name: partnersTable.name, email: partnersTable.email })
        .from(partnersTable)
        .where(eq(partnersTable.id, tenant.partnerId));
      if (partner) {
        partnerName = partner.name;
        partnerEmail = partner.email;
      }
    }

    // Build signers list
    const signers: { name: string; email: string }[] = [];
    signers.push({ name: lead.nome ?? "Cliente", email: lead.email });
    if (partnerName && partnerEmail) {
      signers.push({ name: partnerName, email: partnerEmail });
    }
    const vendoraiEmail = process.env["VENDORAI_SIGNING_EMAIL"];
    if (vendoraiEmail) {
      signers.push({ name: tenant?.nomeEmpresa ?? "Empresa", email: vendoraiEmail });
    }

    // Build pedidos HTML table
    const pedidosHtml = buildPedidosTable(selectedDeals);

    // Compute total value
    const totalValor = selectedDeals.reduce(
      (sum, d) => sum + (d.valor ? Number(d.valor) : 0),
      0
    );
    const valorFormatado = totalValor > 0
      ? totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : deal.valor
        ? Number(deal.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "Valor a definir";

    const dataHoje = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    // Fetch custom template
    const templateResult = await db.execute(
      sql`SELECT contract_template_html, contract_template_name FROM tenants WHERE id = ${tenantId}`
    );
    const templateRow = templateResult.rows?.[0] as Record<string, unknown> | undefined;
    const customTemplateHtml = templateRow?.contract_template_html as string | null;

    // Generate PDF
    const contractData = {
      dealTitulo: deal.titulo,
      dealValor: valorFormatado,
      clienteNome: lead.nome ?? "Cliente",
      clienteEmail: lead.email ?? "",
      clienteTelefone: lead.telefone ?? "",
      clienteDocumento: lead.documento ?? undefined,
      clienteEmpresa: lead.empresa ?? undefined,
      tenantNome: tenant?.nomeEmpresa ?? tenant?.name ?? "Empresa",
      dataHoje,
      produtosServicos: selectedDeals.map((d) => d.titulo).join(", "),
      partnerName,
      partnerEmail,
      pedidosHtml,
    };

    let contentBase64: string | undefined;
    try {
      let pdfBuffer: Buffer;
      if (customTemplateHtml) {
        pdfBuffer = await generateContractFromTemplate(customTemplateHtml, contractData);
      } else {
        pdfBuffer = await generateContractPDF(contractData, !!tenant?.partnerId);
      }
      contentBase64 = pdfBuffer.toString("base64");
    } catch (pdfErr) {
      req.log.warn({ err: pdfErr, dealId }, "generate-contract: PDF generation failed");
    }

    const partes = tenant?.partnerId ? "3 partes" : "2 partes";

    const doc = await createDocument({
      name: `Contrato — ${deal.titulo}`,
      lang: "pt-BR",
      signers,
      content_base64: contentBase64,
    });

    // Persist to deals table
    await db
      .update(dealsTable)
      .set({
        zapsignDocId: doc.token,
        contractStatus: "sent",
        contractError: null,
        updatedAt: new Date(),
      })
      .where(eq(dealsTable.id, dealId));

    // Insert into contracts table
    const signUrl = doc.signers?.[0]?.sign_url ?? null;
    await db
      .insert(contractsTable)
      .values({
        tenantId,
        dealId,
        contractType: partes,
        status: "sent_for_signature",
        zapsignDocId: doc.token,
        zapsignSignUrl: signUrl,
        sentAt: new Date(),
      })
      .onConflictDoNothing();

    req.log.info({ dealId, docToken: doc.token, signers: signers.length }, "generate-contract: sent");

    res.json({
      success: true,
      zapsignDocId: doc.token,
      signUrl,
      signers: doc.signers?.map((s) => ({ name: s.name, email: s.email, signUrl: s.sign_url })) ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, dealId }, "generate-contract: failed");
    res.status(500).json({ error: `Erro ao gerar contrato: ${msg}` });
  }
});

function buildPedidosTable(deals: { titulo: string; valor: string | null; planoContratado: string | null }[]): string {
  if (deals.length === 0) return "";
  const rows = deals
    .map((d) => {
      const val = d.valor
        ? Number(d.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "—";
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${d.titulo}${d.planoContratado ? ` (${d.planoContratado})` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${val}</td></tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;">Produto / Serviço</th><th style="padding:8px;text-align:right;">Valor</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export default router;
