import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, dealsTable, leadsTable, contractsTable } from "@workspace/db";
import { createDocument, isZapSignConfigured } from "../lib/zapsign.js";
import { createCharge, createOrGetCustomer, isAsaasConfigured } from "../lib/asaas.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

const router = Router();

// ─── POST /deals/:dealId/confirm-closure ────────────────────────────────────
// Comprehensive deal closure:
//  1. Marks deal as ganho + lead as convertido
//  2. Generates contract PDF from tenant template + sends to ZapSign
//  3. Sends WhatsApp with sign link
//  4. Creates Asaas charge(s) if configured
//  5. Sends WhatsApp with payment link(s)
router.post("/deals/:dealId/confirm-closure", async (req, res) => {
  const dealId = String(req.params.dealId);
  const {
    valor,
    valorImplantacao,
    valorMensalidade,
    planoContratado,
    condPagamento,
    prazoEntrega,
    observacoes,
    numParcelas,
    servicos,
  } = req.body as {
    valor?: number;
    valorImplantacao?: number;
    valorMensalidade?: number;
    planoContratado?: string;
    condPagamento?: string;
    prazoEntrega?: string;
    observacoes?: string;
    numParcelas?: number;
    servicos?: string;
  };

  if (!planoContratado) {
    res.status(400).json({ error: "planoContratado é obrigatório" });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) {
    res.status(404).json({ error: "Negócio não encontrado" });
    return;
  }

  const tenantId = deal.tenantId;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const valorImplantacaoNum = typeof valorImplantacao === "number" ? valorImplantacao : 0;
  const valorMensalidadeNum = typeof valorMensalidade === "number" ? valorMensalidade : 0;
  const valorNum = typeof valor === "number" && valor > 0
    ? valor
    : (valorImplantacaoNum + valorMensalidadeNum) > 0
      ? valorImplantacaoNum + valorMensalidadeNum
      : deal.valor ? parseFloat(String(deal.valor)) : 0;

  // ── 1. Update deal to ganho ─────────────────────────────────────────────
  await db
    .update(dealsTable)
    .set({
      etapa: "ganho",
      valor: String(valorNum),
      planoContratado: planoContratado ?? deal.planoContratado,
      tipoFechamento: "contrato",
      wonAt: new Date(),
      dataFechamento: new Date(),
      skipAsaasBilling: "true", // prevent double-billing from PATCH hook
      ...(valorMensalidadeNum > 0 ? { mrr: String(valorMensalidadeNum) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, dealId));

  // ── 2. Update lead to convertido ────────────────────────────────────────
  if (deal.leadId) {
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, deal.leadId));
  }

  // Load lead and tenant for subsequent steps
  const [lead] = deal.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, deal.leadId))
    : [null];

  const tenantResult = await db.execute(
    sql`SELECT id, name, nome_empresa, cnpj, contract_template_html, asaas_api_key FROM tenants WHERE id = ${tenantId}`
  );
  const tenant = tenantResult.rows?.[0] as Record<string, unknown> | undefined;

  const result: {
    ganho: boolean;
    signUrl?: string | null;
    chargeLinks?: string[];
    errors: string[];
  } = { ganho: true, errors: [] };

  // ── 3. ZapSign contract generation ──────────────────────────────────────
  if (isZapSignConfigured() && lead) {
    try {
      const customHtml = tenant?.contract_template_html as string | null;
      const valorFmt = valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const dataHoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const tenantNome = ((tenant?.nome_empresa as string) || (tenant?.name as string) || "").trim();

      const implFmt = valorImplantacaoNum > 0
        ? valorImplantacaoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";
      const mrrFmt = valorMensalidadeNum > 0
        ? valorMensalidadeNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";

      const vars: Record<string, string> = {
        "{{cliente_nome}}": lead.nome ?? lead.empresa ?? "Cliente",
        "{{cliente_cnpj}}": lead.documento ?? "",
        "{{cliente_endereco}}": lead.endereco ?? "",
        "{{valor_total}}": valorFmt,
        "{{valor_implantacao}}": implFmt,
        "{{valor_mensalidade}}": mrrFmt,
        "{{condicao_pagamento}}": condPagamento ?? "",
        "{{prazo_entrega}}": prazoEntrega ?? "",
        "{{servicos}}": servicos ?? deal.titulo,
        "{{data_contrato}}": dataHoje,
        "{{vendedor_nome}}": (req.user as any)?.name ?? "",
        "{{empresa_nome}}": tenantNome,
        "{{empresa_cnpj}}": (tenant?.cnpj as string) ?? "",
        // Legacy compat vars
        "{{cliente_razao_social}}": lead.empresa ?? lead.nome ?? "Cliente",
        "{{deal_valor}}": valorFmt,
        "{{valor_mensal}}": mrrFmt || valorFmt,
        "{{data_hoje}}": dataHoje,
      };

      const html = renderTemplate(customHtml ?? DEFAULT_MINIMAL_TEMPLATE, vars);

      let pdfB64: string | undefined;
      try {
        const buf = await renderHtmlToPdf(html);
        pdfB64 = buf.toString("base64");
      } catch (pdfErr) {
        req.log.warn({ err: pdfErr, dealId }, "confirm-closure: PDF render failed, sending without PDF");
      }

      const clientName = lead.nome ?? lead.empresa ?? "Cliente";
      if (!lead.email) throw new Error("Lead não tem e-mail para assinatura via ZapSign");

      const doc = await createDocument({
        name: `Contrato — ${clientName}`,
        lang: "pt-BR",
        signers: [{ name: clientName, email: lead.email }],
        content_base64: pdfB64,
      });

      const signUrl = doc.signers?.[0]?.sign_url ?? null;

      await db
        .update(dealsTable)
        .set({ zapsignDocId: doc.token, contractStatus: "sent", contractError: null, updatedAt: new Date() })
        .where(eq(dealsTable.id, dealId));

      await db
        .insert(contractsTable)
        .values({
          tenantId,
          dealId,
          contractType: "1 parte",
          status: "sent_for_signature",
          zapsignDocId: doc.token,
          zapsignSignUrl: signUrl,
          sentAt: new Date(),
        })
        .onConflictDoNothing();

      result.signUrl = signUrl;

      // WhatsApp — sign link notification
      if (lead.telefone && signUrl) {
        try {
          const msg = `Olá, ${clientName}! 👋\n\nSeu contrato está pronto para assinatura digital. 📄\n\nAcesse o link abaixo para assinar (leva menos de 1 minuto):\n${signUrl}\n\nQualquer dúvida estamos à disposição!`;
          await sendDirectWhatsAppMessage(tenantId, lead.telefone, msg, req.log);
          req.log.info({ dealId }, "confirm-closure: WhatsApp sign link sent");
        } catch (wErr) {
          req.log.warn({ err: wErr }, "confirm-closure: WhatsApp sign notification failed (non-fatal)");
        }
      }

      req.log.info({ dealId, docToken: doc.token }, "confirm-closure: ZapSign OK");
    } catch (zErr) {
      const msg = zErr instanceof Error ? zErr.message : String(zErr);
      req.log.error({ err: zErr, dealId }, "confirm-closure: ZapSign failed");
      result.errors.push(`Contrato: ${msg}`);
      await db
        .update(dealsTable)
        .set({ contractStatus: "failed", contractError: msg.slice(0, 500), updatedAt: new Date() })
        .where(eq(dealsTable.id, dealId));
    }
  }

  // ── 4. Asaas billing ────────────────────────────────────────────────────
  const tenantAsaasKey = (tenant?.asaas_api_key as string) || null;
  const asaasReady = tenantAsaasKey || isAsaasConfigured();

  if (asaasReady && valorNum > 0 && lead) {
    const prevKey = process.env["ASAAS_API_KEY"];
    if (tenantAsaasKey) process.env["ASAAS_API_KEY"] = tenantAsaasKey;
    try {
      const customer = await createOrGetCustomer({
        name: lead.nome ?? lead.empresa ?? "Cliente",
        email: lead.email ?? undefined,
        cpfCnpj: lead.documento?.replace(/\D/g, "") || undefined,
        phone: lead.telefone ?? undefined,
      });

      const parcelas = numParcelas && numParcelas > 1 ? numParcelas : 1;
      const today = new Date();
      const dueDateStr = today.toISOString().split("T")[0]!;
      const chargeLinks: string[] = [];

      if (parcelas === 1) {
        // Single payment
        const charge = await createCharge({
          customer: customer.id,
          billingType: "BOLETO",
          value: Math.round(valorNum * 100) / 100,
          dueDate: dueDateStr,
          description: deal.titulo,
          externalReference: dealId,
        });
        if (charge.invoiceUrl) chargeLinks.push(charge.invoiceUrl);
        else if (charge.bankSlipUrl) chargeLinks.push(charge.bankSlipUrl);
        await db
          .update(dealsTable)
          .set({ asaasChargeId: charge.id, chargeLink: chargeLinks[0] ?? null, chargeStatus: "pending", updatedAt: new Date() })
          .where(eq(dealsTable.id, dealId));
      } else {
        // Installment payments — create N separate charges with monthly due dates
        const valorParcela = Math.round((valorNum / parcelas) * 100) / 100;
        const firstChargeId = await (async () => {
          let firstId = "";
          for (let i = 0; i < parcelas; i++) {
            const due = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
            const charge = await createCharge({
              customer: customer.id,
              billingType: "BOLETO",
              value: valorParcela,
              dueDate: due.toISOString().split("T")[0]!,
              description: `${deal.titulo} — Parcela ${i + 1}/${parcelas}`,
              externalReference: `${dealId}-${i + 1}`,
            });
            if (i === 0) firstId = charge.id;
            if (charge.invoiceUrl) chargeLinks.push(charge.invoiceUrl);
            else if (charge.bankSlipUrl) chargeLinks.push(charge.bankSlipUrl);
          }
          return firstId;
        })();
        await db
          .update(dealsTable)
          .set({ asaasChargeId: firstChargeId, chargeLink: chargeLinks[0] ?? null, chargeStatus: "pending", updatedAt: new Date() })
          .where(eq(dealsTable.id, dealId));
      }

      result.chargeLinks = chargeLinks;

      // WhatsApp — payment link notification
      if (lead.telefone && chargeLinks.length > 0) {
        try {
          const valorFmt = valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const nome = lead.nome ?? "";
          const msg = parcelas === 1
            ? `Olá, ${nome}! 💳\n\nSeu boleto de ${valorFmt} foi gerado:\n\n${chargeLinks[0]}\n\nAny questions, just ask!`
            : `Olá, ${nome}! 💳\n\nSeu parcelamento em ${parcelas}x foi criado!\n\nBoletos:\n${chargeLinks.map((l, i) => `${i + 1}ª parcela: ${l}`).join("\n")}\n\nVencimentos mensais a partir de hoje.`;
          await sendDirectWhatsAppMessage(tenantId, lead.telefone, msg, req.log);
          req.log.info({ dealId, parcelas }, "confirm-closure: WhatsApp charge links sent");
        } catch (wErr) {
          req.log.warn({ err: wErr }, "confirm-closure: WhatsApp charge notification failed (non-fatal)");
        }
      }

      req.log.info({ dealId, parcelas }, "confirm-closure: Asaas OK");
    } catch (asaasErr) {
      const msg = asaasErr instanceof Error ? asaasErr.message : String(asaasErr);
      req.log.error({ err: asaasErr, dealId }, "confirm-closure: Asaas failed");
      result.errors.push(`Cobrança: ${msg}`);
    } finally {
      if (tenantAsaasKey) {
        if (prevKey !== undefined) process.env["ASAAS_API_KEY"] = prevKey;
        else delete process.env["ASAAS_API_KEY"];
      }
    }
  }

  res.json(result);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

const DEFAULT_MINIMAL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Contrato</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.7;color:#222}
h1{text-align:center;font-size:20px;letter-spacing:1px}h2{font-size:15px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:28px}
</style></head><body>
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<hr>
<p><strong>CONTRATANTE:</strong> {{cliente_nome}}, CNPJ/CPF: {{cliente_cnpj}}, endereço: {{cliente_endereco}}.</p>
<p><strong>CONTRATADA:</strong> {{empresa_nome}}, CNPJ: {{empresa_cnpj}}.</p>
<h2>1. OBJETO</h2><p>{{servicos}}</p>
<h2>2. VALOR E PAGAMENTO</h2><p>Valor total: <strong>{{valor_total}}</strong>. {{condicao_pagamento}}</p>
<h2>3. PRAZO</h2><p>{{prazo_entrega}}</p>
<h2>4. DISPOSIÇÕES GERAIS</h2>
<p>As partes concordam com os termos deste instrumento, elegendo o foro de domicílio do CONTRATANTE para dirimir controvérsias.</p>
<div style="margin-top:70px;display:flex;justify-content:space-between;gap:40px">
<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:8px"><strong>{{cliente_nome}}</strong><br><small>CONTRATANTE</small></div>
<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:8px"><strong>{{vendedor_nome}}</strong><br><small>{{empresa_nome}} — CONTRATADA</small></div>
</div>
<p style="text-align:center;margin-top:40px">{{data_contrato}}</p>
</body></html>`;

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env["PUPPETEER_EXECUTABLE_PATH"] ?? "/usr/bin/chromium",
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
}

export default router;
