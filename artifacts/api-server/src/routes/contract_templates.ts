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
  propostasTable,
  businessProfilesTable,
} from "@workspace/db";
import {
  generateContractFromTemplate,
  generateContractPDF,
  interpolateTemplate,
  numberToWordsPTBR,
  dateToExtensoPTBR,
  DEFAULT_CONTRACT_SETTINGS,
  type ContractSettings,
} from "../lib/contract-generation.js";
import { VENDORAI_SAAS_CONTRACT_HTML } from "../lib/vendorai-contract-template.js";
import { createDocument, isZapSignConfigured } from "../lib/zapsign.js";
import { requireRole } from "../middlewares/auth.js";
import { resolveCanonicalDealValue } from "../lib/deal-value.js";

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

// ─── Get default (platform) contract template ─────────────────────────────────
router.get(
  "/tenants/:tenantId/contract-template/default",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    res.json({ templateHtml: VENDORAI_SAAS_CONTRACT_HTML });
  }
);

// ─── Upload / replace contract template ───────────────────────────────────────
router.post(
  "/tenants/:tenantId/contract-template",
  requireRole("tenant_admin", "super_admin"),
  (req, res, next) => {
    uploadTemplate.single("file")(req, res, (err) => {
      if (err) {
        const message =
          err instanceof Error ? err.message : "Erro no upload do arquivo";
        res.status(400).json({ error: message });
        return;
      }
      next();
    });
  },
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
router.get("/tenants/:tenantId/contract-template", async (req, res) => {
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
  "/tenants/:tenantId/contract-template",
  requireRole("tenant_admin", "super_admin"),
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

// ─── Save contract template via in-app editor (JSON body) ─────────────────────
router.put(
  "/tenants/:tenantId/contract-template/editor",
  requireRole("tenant_admin", "super_admin"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const { html, name } = req.body as { html?: string; name?: string };
    if (!html || typeof html !== "string") {
      res.status(400).json({ error: "Campo 'html' é obrigatório" });
      return;
    }

    const templateName = (typeof name === "string" && name.trim()) ? name.trim() : "Modelo personalizado";

    try {
      await db.execute(
        sql`UPDATE tenants
            SET contract_template_html = ${html},
                contract_template_name = ${templateName},
                updated_at = NOW()
            WHERE id = ${tenantId}`
      );
      req.log.info({ tenantId, templateName }, "contract-template/editor: saved");
      res.json({ success: true, name: templateName });
    } catch (err) {
      req.log.error({ err }, "contract-template/editor: save failed");
      res.status(500).json({ error: "Erro ao salvar modelo de contrato" });
    }
  }
);

// ─── Get contract settings ─────────────────────────────────────────────────────
router.get("/tenants/:tenantId/contract-settings", async (req, res) => {
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
      sql`SELECT contract_settings FROM tenants WHERE id = ${tenantId}`
    );
    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    const saved = (row?.contract_settings ?? {}) as Partial<ContractSettings>;

    res.json({ settings: { ...DEFAULT_CONTRACT_SETTINGS, ...saved } });
  } catch (err) {
    req.log.error({ err }, "contract-settings: get failed");
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// ─── Update contract settings ──────────────────────────────────────────────────
router.put(
  "/tenants/:tenantId/contract-settings",
  requireRole("tenant_admin", "super_admin"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const incoming = req.body as Partial<ContractSettings>;

    try {
      const current = await db.execute(
        sql`SELECT contract_settings FROM tenants WHERE id = ${tenantId}`
      );
      const currentRow = current.rows?.[0] as Record<string, unknown> | undefined;
      const existing = (currentRow?.contract_settings ?? {}) as Partial<ContractSettings>;
      const merged = { ...existing, ...incoming };

      await db.execute(
        sql`UPDATE tenants SET contract_settings = ${JSON.stringify(merged)}::jsonb, updated_at = NOW() WHERE id = ${tenantId}`
      );

      req.log.info({ tenantId }, "contract-settings: updated");
      res.json({ success: true, settings: { ...DEFAULT_CONTRACT_SETTINGS, ...merged } });
    } catch (err) {
      req.log.error({ err }, "contract-settings: update failed");
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  }
);

// ─── List active deals for a lead ─────────────────────────────────────────────
router.get("/tenants/:tenantId/leads/:leadId/active-deals", async (req, res) => {
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
router.post("/deals/:dealId/generate-contract", async (req, res) => {
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

    // Fetch tenant + contract settings
    const tenantResult = await db.execute(
      sql`SELECT id, name, nome_empresa, partner_id, contract_template_html, contract_template_name, contract_settings
          FROM tenants WHERE id = ${tenantId}`
    );
    const tenantRow = tenantResult.rows?.[0] as Record<string, unknown> | undefined;
    const customTemplateHtml = tenantRow?.contract_template_html as string | null;
    const rawSettings = (tenantRow?.contract_settings ?? {}) as Partial<ContractSettings>;
    const settings: ContractSettings = { ...DEFAULT_CONTRACT_SETTINGS, ...rawSettings };

    // Partner
    let partnerName: string | undefined;
    let partnerEmail: string | undefined;
    const partnerId = tenantRow?.partner_id as string | undefined;
    if (partnerId) {
      const [partner] = await db
        .select({ name: partnersTable.name, email: partnersTable.email })
        .from(partnersTable)
        .where(eq(partnersTable.id, partnerId));
      if (partner) {
        partnerName = partner.name ?? undefined;
        partnerEmail = partner.email ?? undefined;
      }
    }

    // Selected deals
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

    // ── Build signers ───────────────────────────────────────────────────────
    const signers: { name: string; email: string }[] = [];
    signers.push({ name: lead.nome ?? "Cliente", email: lead.email });
    if (partnerName && partnerEmail) {
      signers.push({ name: partnerName, email: partnerEmail });
    }
    const vendoraiEmail = process.env["VENDORAI_SIGNING_EMAIL"];
    if (vendoraiEmail) {
      signers.push({ name: tenantRow?.nome_empresa as string ?? tenantRow?.name as string ?? "Empresa", email: vendoraiEmail });
    }

    // ── Build values ────────────────────────────────────────────────────────
    const selectedDealsWithCanonicalValue = await Promise.all(
      selectedDeals.map(async (selectedDeal) => ({
        ...selectedDeal,
        valor: (await resolveCanonicalDealValue(selectedDeal.id, tenantId)).toFixed(2),
      })),
    );
    const pedidosHtml = buildPedidosTable(selectedDealsWithCanonicalValue);

    const totalValor = selectedDealsWithCanonicalValue.reduce(
      (sum, d) => sum + (d.valor ? Number(d.valor) : 0),
      0
    );
    const valorBruto = totalValor > 0
      ? totalValor
      : await resolveCanonicalDealValue(deal.id, tenantId);

    const valorMensalFormatado = valorBruto > 0
      ? valorBruto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "Valor a definir";

    const valorExtenso = valorBruto > 0 ? numberToWordsPTBR(valorBruto) : "";

    const dataHoje = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const dataExtensoPTBR = dateToExtensoPTBR(new Date());

    // ── Build client qualifications ─────────────────────────────────────────
    const clienteRazaoSocial = (lead.empresa ?? lead.nome ?? "Cliente").trim();
    const clienteEndereco = (lead.endereco ?? "").trim();

    // Forma de pagamento — puxada da proposta mais recente vinculada ao deal
    const FORMA_PAGAMENTO_LABELS: Record<string, string> = {
      pix: "PIX",
      boleto: "Boleto",
      cartao_credito: "Cartão de Crédito",
      cartao_debito: "Cartão de Débito",
      transferencia: "Transferência",
      dinheiro: "Dinheiro",
      a_combinar: "A Combinar",
    };
    const [proposta] = await db
      .select({ formaPagamento: propostasTable.formaPagamento })
      .from(propostasTable)
      .where(eq(propostasTable.dealId, deal.id))
      .orderBy(sql`${propostasTable.createdAt} desc`)
      .limit(1);
    const formaPagamento = proposta?.formaPagamento
      ? (FORMA_PAGAMENTO_LABELS[proposta.formaPagamento] ?? proposta.formaPagamento)
      : "";

    // Dados da empresa (CNPJ/endereço) — puxados do perfil da empresa do tenant
    const [businessProfile] = await db
      .select({ cnpj: businessProfilesTable.cnpj, endereco: businessProfilesTable.endereco })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId));
    const empresaCnpj = (businessProfile?.cnpj ?? "").trim();
    const empresaEndereco = (businessProfile?.endereco ?? "").trim();
    const empresaPerfilIncompleto = !empresaCnpj || !empresaEndereco;

    // Representative qualification (use what's in the system, flag missing parts)
    const repNome = (lead.nome ?? "").trim();
    const repCargo = (lead.representanteCargo ?? "").trim() || "Representante Legal";
    const repNacionalidade = (lead.representanteNacionalidade ?? "").trim();
    const repEstadoCivil = (lead.representanteEstadoCivil ?? lead.estadoCivil ?? "").trim();
    const repProfissao = (lead.representanteProfissao ?? "").trim();
    const repRg = (lead.representanteRg ?? "").trim();
    const repCpfCnpj = (lead.documento ?? "").trim();
    const qualParts: string[] = [repNome];
    if (repNacionalidade) qualParts.push(repNacionalidade);
    if (repEstadoCivil) qualParts.push(repEstadoCivil);
    if (repProfissao) qualParts.push(repProfissao);
    qualParts.push(repCargo);
    if (repRg) qualParts.push(`RG ${repRg}`);
    if (repCpfCnpj) qualParts.push(`CPF/CNPJ ${repCpfCnpj}`);
    const representanteLegalCompleto = qualParts.join(", ");

    const tenantNome = (tenantRow?.nome_empresa as string ?? tenantRow?.name as string ?? "Empresa").trim();

    // ── Assemble ContractData ───────────────────────────────────────────────
    const contractData = {
      dealTitulo: deal.titulo,
      dealValor: valorMensalFormatado,
      clienteNome: lead.nome ?? "Cliente",
      clienteEmail: lead.email ?? "",
      clienteTelefone: lead.telefone ?? "",
      clienteDocumento: lead.documento ?? undefined,
      clienteEmpresa: lead.empresa ?? undefined,
      tenantNome,
      dataHoje,
      produtosServicos: selectedDeals.map((d) => d.titulo).join(", "),
      partnerName,
      partnerEmail,
      pedidosHtml,
      // extended SaaS fields
      clienteRazaoSocial,
      clienteEndereco,
      representanteNome: repNome,
      representanteCargo: repCargo,
      representanteNacionalidade: repNacionalidade,
      representanteEstadoCivil: repEstadoCivil,
      representanteProfissao: repProfissao,
      representanteRg: repRg,
      representanteLegalCompleto,
      formaPagamento,
      empresaCnpj,
      empresaEndereco,
      valorMensalFormatado,
      valorExtenso,
      dataExtensoPTBR,
      // settings
      marcosEstadoCivil: settings.marcosEstadoCivil,
      diaVencimento: settings.diaVencimento,
      indiceReajuste: settings.indiceReajuste,
      slaInicioHoras: settings.slaInicioHoras,
      slaCriticoHoras: settings.slaCriticoHoras,
      slaAltoHoras: settings.slaAltoHoras,
      slaMedioHoras: settings.slaMedioHoras,
      diaLimiteBloqueio: settings.diaLimiteBloqueio,
      prazoQuarentena: settings.prazoQuarentena,
      taxaReativacao: settings.taxaReativacao,
      vigenciaContrato: settings.vigenciaContrato,
      multaCancelamento: settings.multaCancelamento,
      localAssinatura: settings.localAssinatura,
      finalidadeSistema: settings.finalidadeSistema,
      backupRetencaoDias: settings.backupRetencaoDias,
      provedorInfra: settings.provedorInfra,
      regiaoDatacenter: settings.regiaoDatacenter,
      servicoEmail: settings.servicoEmail,
      dpoNome: settings.dpoNome,
      dpoEmail: settings.dpoEmail,
      dpoTelefone: settings.dpoTelefone,
      clienteDpoNome: repNome,
    };

    // ── Render PDF ──────────────────────────────────────────────────────────
    let contentBase64: string | undefined;
    try {
      let pdfBuffer: Buffer;
      if (customTemplateHtml) {
        // User uploaded a custom HTML template — use it
        pdfBuffer = await generateContractFromTemplate(customTemplateHtml, contractData);
      } else {
        // Use the built-in VendorAI SaaS contract template
        const interpolated = interpolateTemplate(VENDORAI_SAAS_CONTRACT_HTML, contractData);
        const { renderHtmlToPdfBuffer } = await importPuppeteer();
        pdfBuffer = await renderHtmlToPdfBuffer(interpolated);
      }
      contentBase64 = pdfBuffer.toString("base64");
    } catch (pdfErr) {
      req.log.warn({ err: pdfErr, dealId }, "generate-contract: PDF generation failed, sending without PDF");
    }

    const partes = partnerId ? "3 partes" : "2 partes";

    const doc = await createDocument({
      name: `Contrato SaaS — ${clienteRazaoSocial}`,
      lang: "pt-BR",
      signers,
      content_base64: contentBase64,
    });

    // ── Persist ──────────────────────────────────────────────────────────────
    await db
      .update(dealsTable)
      .set({
        zapsignDocId: doc.token,
        contractStatus: "sent",
        contractError: null,
        updatedAt: new Date(),
      })
      .where(eq(dealsTable.id, dealId));

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
      warning: empresaPerfilIncompleto
        ? "Perfil da empresa incompleto: CNPJ e/ou endereço não cadastrados em Configurações → Perfil da Empresa. As variáveis {{empresa_cnpj}} / {{empresa_endereco}} ficaram em branco no contrato."
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, dealId }, "generate-contract: failed");
    res.status(500).json({ error: `Erro ao gerar contrato: ${msg}` });
  }
});

// ─── Helper: import puppeteer to render HTML ──────────────────────────────────
async function importPuppeteer() {
  const puppeteer = (await import("puppeteer-core")).default;
  return {
    async renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
      const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "30px", bottom: "30px", left: "40px", right: "40px" },
      });
      await browser.close();
      return Buffer.from(pdf);
    },
  };
}

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
