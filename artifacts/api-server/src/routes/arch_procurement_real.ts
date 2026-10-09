import { Router, type IRouter } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import { extractQuoteData } from "../lib/document-extraction.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { sendJarvisEmail } from "../services/jarvis-email-provider.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function safeFilename(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "documento";
}

async function saveProcurementDocument(tid: string, obraId: string, file: Express.Multer.File) {
  const privateDir = process.env["PRIVATE_OBJECT_DIR"] || "/app-uploads/private";
  const storedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeFilename(file.originalname)}`;
  const fullPath = `${privateDir}/procurement/${tid}/${obraId}/${storedName}`;
  const parts = fullPath.split("/").filter(Boolean);
  const bucketName = parts.shift();
  if (!bucketName || !parts.length) throw new Error("PRIVATE_OBJECT_DIR inválido");
  const objectName = parts.join("/");
  await objectStorageClient.bucket(bucketName).file(objectName).save(file.buffer, { contentType: file.mimetype, resumable: false });
  return {
    name: file.originalname,
    storedName,
    mimeType: file.mimetype,
    size: file.size,
    url: `/objects/procurement/${tid}/${obraId}/${storedName}`,
    uploadedAt: new Date().toISOString(),
  };
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório para operar Compras do ARQDOR." });
    return null;
  }
  return tid;
}

async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(`SELECT * FROM obras WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [obraId, tid]);
  return result.rows[0] ?? null;
}

async function ownedRequest(tid: string, obraId: string, requestId: string) {
  const result = await pool.query(
    `SELECT * FROM compras_obras WHERE id = $1 AND obra_id = $2 AND tenant_id = $3 LIMIT 1`,
    [requestId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

async function ownedQuote(tid: string, obraId: string, requestId: string, quoteId: string) {
  const result = await pool.query(
    `SELECT * FROM arch_supplier_orders
      WHERE id = $1::uuid AND compra_id = $2 AND obra_id = $3 AND tenant_id::text = $4 AND deleted_at IS NULL
      LIMIT 1`,
    [quoteId, requestId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

async function ownedRfqDelivery(tid: string, obraId: string, requestId: string, deliveryId: string) {
  const result = await pool.query(
    `SELECT * FROM obra_compra_cotacao_envios
      WHERE id = $1::uuid AND compra_id = $2 AND obra_id = $3 AND tenant_id = $4
      LIMIT 1`,
    [deliveryId, requestId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

function rfqMessage(obra: any, request: any) {
  const needDate = request?.data_necessidade || request?.data_prevista;
  const dateText = needDate
    ? new Date(`${String(needDate).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
    : "a combinar";
  return [
    "SOLICITAÇÃO DE COTAÇÃO / TOMADA DE PREÇOS",
    `Obra: ${obra?.nome || "Obra"}`,
    `Solicitação: ${request?.codigo || request?.id || ""}`,
    "",
    `Item/serviço: ${request?.descricao || ""}`,
    `Quantidade: ${num(request?.quantidade, 1)} ${request?.unidade || "un"}`,
    request?.ambiente ? `Local/ambiente: ${request.ambiente}` : "",
    request?.disciplina ? `Disciplina: ${request.disciplina}` : "",
    `Necessário até: ${dateText}`,
    request?.observacoes ? `Observações: ${request.observacoes}` : "",
    "",
    "Favor informar:",
    "• preço unitário e valor total;",
    "• frete, impostos e descontos;",
    "• prazo de entrega;",
    "• validade da proposta;",
    "• condição de pagamento;",
    "• marca/modelo/especificação quando aplicável.",
    "",
    "A cotação será comparada com outras propostas antes da emissão do pedido de compra.",
  ].filter(Boolean).join("\n");
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function quoteTotal(quote: any) {
  const base = num(quote?.confirmed_value || quote?.estimated_value);
  return Math.max(0, base + num(quote?.freight_value) + num(quote?.tax_value) - num(quote?.discount_value));
}

function makeCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `COMP-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

router.post("/arch/procurement/:obraId/analyze-document", upload.single("documento"), async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const file = req.file;
    if (!file) { res.status(422).json({ error: "Anexe um orçamento, pedido ou cotação." }); return; }

    const lower = file.originalname.toLowerCase();
    const isPdf = file.mimetype === "application/pdf" || lower.endsWith(".pdf");
    const isImage = file.mimetype.startsWith("image/");
    const isText = file.mimetype.startsWith("text/") || /\.(txt|csv|xml)$/i.test(lower);
    const isSpreadsheet = /\.(xlsx|xls)$/i.test(lower);
    if (!isPdf && !isImage && !isText && !isSpreadsheet) {
      res.status(422).json({ error: "Use PDF, imagem, CSV, XLS/XLSX, TXT ou XML." });
      return;
    }

    const context = String(req.body?.context ?? "request");
    const document = await saveProcurementDocument(tid, obraId, file);
    if (isSpreadsheet) {
      res.json({ extracted: { tipo: "orcamento", itens: [] }, document, parseLocally: true });
      return;
    }
    const quote = await extractQuoteData([
      { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname },
    ], tid);

    const items = Array.isArray(quote.itens)
      ? quote.itens.map((item) => ({
          descricao: item.descricao,
          quantidade: item.quantidade ?? null,
          unidade: item.unidade ?? null,
          valorUnitario: item.valorUnitario ?? null,
          valorTotal: item.valorTotal ?? null,
        }))
      : [];

    const deliveryText = quote.prazoEntrega ?? null;
    const deliveryDaysMatch = deliveryText?.match(/(\d+)\s*(?:dia|dias)/i);
    const extracted = {
      tipo: context === "quote" ? "cotacao" : "orcamento",
      fornecedor: quote.fornecedor ?? null,
      numero: quote.numeroDocumento ?? null,
      dataPrevista: null,
      condicaoPagamento: quote.condPagamento ?? quote.formaPagamento ?? null,
      prazoEntregaDias: deliveryDaysMatch ? Number(deliveryDaysMatch[1]) : null,
      frete: quote.frete ?? null,
      desconto: quote.desconto ?? null,
      taxas: quote.impostos ?? quote.acrescimos ?? null,
      observacoes: [
        quote.observacoes,
        ...(quote.informacoesAdicionais ?? []),
      ].filter(Boolean).join("\n") || null,
      itens: items,
      confianca: quote.confianca ?? 0,
      cliente: quote.cliente ?? null,
      clienteDocumento: quote.clienteDocumento ?? null,
      clienteTelefone: quote.clienteTelefone ?? null,
      clienteEmail: quote.clienteEmail ?? null,
      clienteCidade: quote.clienteCidade ?? null,
      clienteEstado: quote.clienteEstado ?? null,
      clienteCep: quote.clienteCep ?? null,
      clienteEndereco: quote.clienteEndereco ?? null,
      valorTotal: quote.valorTotal ?? null,
    };

    res.json({ extracted, document });
  } catch (err) {
    logger.error({ err }, "arch procurement document analysis error");
    next(err);
  }
});

router.get("/arch/procurement/:obraId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const obra = await ownedObra(tid, obraId);
    if (!obra) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const [requests, quotes, receipts, stages, finance, rfqDeliveries] = await Promise.all([
      pool.query(`SELECT * FROM compras_obras WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [obraId, tid]),
      pool.query(`SELECT * FROM arch_supplier_orders WHERE obra_id = $1 AND tenant_id::text = $2 AND deleted_at IS NULL ORDER BY created_at DESC`, [obraId, tid]),
      pool.query(`SELECT * FROM obra_compra_recebimentos WHERE obra_id = $1 AND tenant_id = $2 ORDER BY data_recebimento DESC`, [obraId, tid]),
      pool.query(`SELECT id, nome, ordem FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`, [obraId]),
      pool.query(`SELECT id, fornecedor, valor, data_vencimento, status, descricao FROM obra_lancamentos WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [obraId, tid]),
      pool.query(`SELECT * FROM obra_compra_cotacao_envios WHERE obra_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [obraId, tid]),
    ]);

    res.json({ obra, requests: requests.rows, quotes: quotes.rows, receipts: receipts.rows, stages: stages.rows, finance: finance.rows, rfqDeliveries: rfqDeliveries.rows });
  } catch (err) {
    logger.error({ err }, "arch procurement GET error");
    next(err);
  }
});

router.post("/arch/procurement/:obraId/requests", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const descricao = String(req.body?.descricao ?? "").trim();
    if (!descricao) { res.status(400).json({ error: "Item/serviço é obrigatório" }); return; }
    const quantidade = Math.max(0, num(req.body?.quantidade, 1));
    const valorUnitario = Math.max(0, num(req.body?.valorUnitario));
    const valorTotal = req.body?.valorTotal == null ? quantidade * valorUnitario : Math.max(0, num(req.body.valorTotal));
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO compras_obras (
         id, tenant_id, obra_id, insumo_id, codigo, etapa_id, descricao, ambiente, disciplina, categoria,
         quantidade, unidade, valor_unitario, valor_total, prioridade, status, data_prevista, data_necessidade,
         solicitante_id, solicitante_nome, origem, observacoes, documentos, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23::jsonb,now(),now()
       ) RETURNING *`,
      [
        id, tid, obraId, req.body?.insumoId || null, req.body?.codigo || makeCode(), req.body?.etapaId || null,
        descricao, req.body?.ambiente || null, req.body?.disciplina || null, req.body?.categoria || null,
        String(quantidade), String(req.body?.unidade || "un"), String(valorUnitario), String(valorTotal),
        String(req.body?.prioridade || "media"), String(req.body?.status || "pendente"), req.body?.dataPrevista || null,
        req.body?.dataNecessidade || null, req.user?.sub ?? null, req.user?.email ?? null,
        String(req.body?.origem || "manual"), req.body?.observacoes || null,
        JSON.stringify(Array.isArray(req.body?.documentos) ? req.body.documentos : []),
      ],
    );
    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch procurement request POST error");
    next(err);
  }
});

router.patch("/arch/procurement/:obraId/requests/:requestId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const current = await ownedRequest(tid, obraId, requestId);
    if (!current) { res.status(404).json({ error: "Solicitação não encontrada" }); return; }

    const allowed: Record<string, { column: string; transform?: (value: any) => any }> = {
      descricao: { column: "descricao", transform: (v) => String(v).trim() },
      etapaId: { column: "etapa_id", transform: (v) => v || null },
      ambiente: { column: "ambiente", transform: (v) => v || null },
      disciplina: { column: "disciplina", transform: (v) => v || null },
      categoria: { column: "categoria", transform: (v) => v || null },
      quantidade: { column: "quantidade", transform: (v) => String(Math.max(0, num(v))) },
      unidade: { column: "unidade", transform: (v) => String(v || "un") },
      valorUnitario: { column: "valor_unitario", transform: (v) => String(Math.max(0, num(v))) },
      valorTotal: { column: "valor_total", transform: (v) => String(Math.max(0, num(v))) },
      prioridade: { column: "prioridade", transform: (v) => String(v || "media") },
      status: { column: "status", transform: (v) => String(v) },
      dataPrevista: { column: "data_prevista", transform: (v) => v || null },
      dataNecessidade: { column: "data_necessidade", transform: (v) => v || null },
      observacoes: { column: "observacoes", transform: (v) => v || null },
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, rule] of Object.entries(allowed)) {
      if (req.body?.[key] === undefined) continue;
      values.push(rule.transform ? rule.transform(req.body[key]) : req.body[key]);
      sets.push(`${rule.column} = $${values.length}`);
    }
    if (!sets.length) { res.json({ request: current }); return; }
    values.push(requestId, obraId, tid);
    const result = await pool.query(
      `UPDATE compras_obras SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 2} AND obra_id = $${values.length - 1} AND tenant_id = $${values.length}
        RETURNING *`, values,
    );
    res.json({ request: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch procurement request PATCH error");
    next(err);
  }
});

router.delete("/arch/procurement/:obraId/requests/:requestId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const current = await ownedRequest(tid, obraId, requestId);
    if (!current) { res.status(404).json({ error: "Solicitação não encontrada" }); return; }
    if (current.pedido_fornecedor_id || current.lancamento_financeiro_id) {
      res.status(409).json({ error: "Solicitação com pedido ou financeiro vinculado não pode ser excluída" }); return;
    }
    await pool.query(`DELETE FROM compras_obras WHERE id = $1 AND obra_id = $2 AND tenant_id = $3`, [requestId, obraId, tid]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch procurement request DELETE error");
    next(err);
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/rfq/send", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const [obra, request] = await Promise.all([ownedObra(tid, obraId), ownedRequest(tid, obraId, requestId)]);
    if (!obra || !request) { res.status(404).json({ error: "Obra ou solicitação não encontrada" }); return; }

    const channel = String(req.body?.channel ?? "").trim();
    const supplierName = String(req.body?.supplierName ?? "").trim();
    const destination = String(req.body?.destination ?? "").trim();
    if (!["whatsapp", "email"].includes(channel)) { res.status(400).json({ error: "Canal deve ser whatsapp ou email" }); return; }
    if (!supplierName) { res.status(400).json({ error: "Fornecedor é obrigatório" }); return; }
    if (!destination) { res.status(400).json({ error: "Telefone ou e-mail do fornecedor é obrigatório" }); return; }
    if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      res.status(400).json({ error: "E-mail do fornecedor inválido" }); return;
    }
    if (channel === "whatsapp" && destination.replace(/\D/g, "").length < 10) {
      res.status(400).json({ error: "Telefone do fornecedor inválido" }); return;
    }

    const message = String(req.body?.message ?? "").trim() || rfqMessage(obra, request);
    const draft = await pool.query(
      `INSERT INTO obra_compra_cotacao_envios (
         tenant_id, obra_id, compra_id, supplier_name, channel, destination, status, message, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,now(),now())
       RETURNING *`,
      [tid, obraId, requestId, supplierName, channel, destination, message],
    );
    const delivery = draft.rows[0];

    try {
      let providerMessageId: string | null = null;
      if (channel === "whatsapp") {
        providerMessageId = (await sendDirectWhatsAppMessage(tid, destination, message, logger)) ?? null;
      } else {
        const tenantResult = await pool.query(`SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [tid]);
        const email = await sendJarvisEmail({
          to: destination,
          subject: `Solicitação de cotação — ${obra.nome || "Obra"} — ${request.codigo || request.id}`,
          body: message,
          tenantName: tenantResult.rows[0]?.name ?? null,
        });
        providerMessageId = email.id;
      }

      const sent = await pool.query(
        `UPDATE obra_compra_cotacao_envios
           SET status = 'sent', provider_message_id = $1, sent_at = now(), error_message = null, updated_at = now()
         WHERE id = $2::uuid AND tenant_id = $3
         RETURNING *`,
        [providerMessageId, delivery.id, tid],
      );
      res.status(201).json({ delivery: sent.rows[0] });
    } catch (sendError) {
      const messageText = sendError instanceof Error ? sendError.message : "Falha no envio";
      const failed = await pool.query(
        `UPDATE obra_compra_cotacao_envios
           SET status = 'failed', error_message = $1, updated_at = now()
         WHERE id = $2::uuid AND tenant_id = $3
         RETURNING *`,
        [messageText, delivery.id, tid],
      );
      res.status(502).json({ error: messageText, delivery: failed.rows[0] });
    }
  } catch (err) {
    logger.error({ err }, "arch procurement RFQ send error");
    next(err);
  }
});

router.patch("/arch/procurement/:obraId/requests/:requestId/rfq/:deliveryId/status", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const deliveryId = String(req.params["deliveryId"] ?? "");
    const current = await ownedRfqDelivery(tid, obraId, requestId, deliveryId);
    if (!current) { res.status(404).json({ error: "Envio da cotação não encontrado" }); return; }

    const status = String(req.body?.status ?? "");
    if (!["sent", "viewed", "responded"].includes(status)) {
      res.status(400).json({ error: "Status permitido: sent, viewed ou responded" }); return;
    }

    const result = await pool.query(
      `UPDATE obra_compra_cotacao_envios
         SET status = $1,
             viewed_at = CASE WHEN $1 IN ('viewed','responded') THEN COALESCE(viewed_at, now()) ELSE viewed_at END,
             responded_at = CASE WHEN $1 = 'responded' THEN COALESCE(responded_at, now()) ELSE responded_at END,
             updated_at = now()
       WHERE id = $2::uuid AND compra_id = $3 AND obra_id = $4 AND tenant_id = $5
       RETURNING *`,
      [status, deliveryId, requestId, obraId, tid],
    );
    res.json({ delivery: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch procurement RFQ status error");
    next(err);
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/quotes", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const request = await ownedRequest(tid, obraId, requestId);
    if (!request) { res.status(404).json({ error: "Solicitação não encontrada" }); return; }
    const supplierName = String(req.body?.supplierName ?? "").trim();
    let projectId = String(req.body?.projectId ?? "").trim() || null;
    if (!supplierName) { res.status(400).json({ error: "Fornecedor é obrigatório" }); return; }
    if (!projectId) {
      const linkedProject = await pool.query(
        `SELECT id FROM arch_projetos WHERE obra_id = $1 AND tenant_id = $2 ORDER BY updated_at DESC LIMIT 1`,
        [obraId, tid],
      );
      projectId = linkedProject.rows[0]?.id ?? null;
    }

    const quantity = Math.max(0, num(req.body?.quantity, request.quantidade || 1));
    const estimatedValue = Math.max(0, num(req.body?.estimatedValue, request.valor_total || 0));
    const confirmedValue = Math.max(0, num(req.body?.confirmedValue, estimatedValue));
    const result = await pool.query(
      `INSERT INTO arch_supplier_orders (
         id, tenant_id, project_id, obra_id, compra_id, work_order_id,
         supplier_name, contact_name, contact_phone, contact_email,
         item, quantity, unit, estimated_value, confirmed_value,
         freight_value, discount_value, tax_value, payment_terms, quote_valid_until, lead_time_days,
         quote_number, status, requested_at, quoted_at, expected_delivery, notes, documents, created_at, updated_at
       ) VALUES (
         gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5::uuid,
         $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,'quoted',now(),now(),$22,$23,$24::jsonb,now(),now()
       ) RETURNING *`,
      [
        tid, projectId, obraId, requestId, req.body?.workOrderId || null,
        supplierName, req.body?.contactName || null, req.body?.contactPhone || null, req.body?.contactEmail || null,
        request.descricao, String(quantity), request.unidade || "un", String(estimatedValue), String(confirmedValue),
        String(Math.max(0, num(req.body?.freightValue))), String(Math.max(0, num(req.body?.discountValue))), String(Math.max(0, num(req.body?.taxValue))),
        req.body?.paymentTerms || null, req.body?.quoteValidUntil || null,
        req.body?.leadTimeDays == null ? null : Math.max(0, Math.round(num(req.body.leadTimeDays))),
        req.body?.quoteNumber || null, req.body?.expectedDelivery || null, req.body?.notes || null,
        JSON.stringify(Array.isArray(req.body?.documents) ? req.body.documents : []),
      ],
    );
    await pool.query(`UPDATE compras_obras SET status = CASE WHEN status IN ('pendente','rascunho') THEN 'cotacao' ELSE status END, updated_at = now() WHERE id = $1 AND obra_id = $2 AND tenant_id = $3`, [requestId, obraId, tid]);

    const deliveryId = String(req.body?.deliveryId ?? "").trim();
    if (deliveryId) {
      await pool.query(
        `UPDATE obra_compra_cotacao_envios
           SET status = 'quote_received', quote_id = $1::uuid,
               viewed_at = COALESCE(viewed_at, now()),
               responded_at = COALESCE(responded_at, now()),
               quote_received_at = now(), updated_at = now()
         WHERE id = $2::uuid AND compra_id = $3 AND obra_id = $4 AND tenant_id = $5`,
        [result.rows[0].id, deliveryId, requestId, obraId, tid],
      );
    } else {
      await pool.query(
        `UPDATE obra_compra_cotacao_envios
           SET status = 'quote_received', quote_id = $1::uuid,
               viewed_at = COALESCE(viewed_at, now()),
               responded_at = COALESCE(responded_at, now()),
               quote_received_at = now(), updated_at = now()
         WHERE id = (
           SELECT id FROM obra_compra_cotacao_envios
            WHERE compra_id = $2 AND obra_id = $3 AND tenant_id = $4
              AND lower(supplier_name) = lower($5)
              AND status IN ('sent','viewed','responded')
            ORDER BY created_at DESC LIMIT 1
         )`,
        [result.rows[0].id, requestId, obraId, tid, supplierName],
      );
    }

    res.status(201).json({ quote: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch procurement quote POST error");
    next(err);
  }
});

router.patch("/arch/procurement/:obraId/requests/:requestId/quotes/:quoteId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const quoteId = String(req.params["quoteId"] ?? "");
    const current = await ownedQuote(tid, obraId, requestId, quoteId);
    if (!current) { res.status(404).json({ error: "Cotação não encontrada" }); return; }

    const allowed: Record<string, string> = {
      supplierName: "supplier_name", contactName: "contact_name", contactPhone: "contact_phone", contactEmail: "contact_email",
      confirmedValue: "confirmed_value", freightValue: "freight_value", discountValue: "discount_value", taxValue: "tax_value",
      paymentTerms: "payment_terms", quoteValidUntil: "quote_valid_until", leadTimeDays: "lead_time_days",
      expectedDelivery: "expected_delivery", notes: "notes", quoteNumber: "quote_number",
    };
    const numericKeys = new Set(["confirmedValue", "freightValue", "discountValue", "taxValue", "leadTimeDays"]);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (req.body?.[key] === undefined) continue;
      values.push(numericKeys.has(key) ? Math.max(0, num(req.body[key])) : (req.body[key] || null));
      sets.push(`${column} = $${values.length}`);
    }
    if (!sets.length) { res.json({ quote: current }); return; }
    values.push(quoteId, requestId, obraId, tid);
    const result = await pool.query(
      `UPDATE arch_supplier_orders SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 3}::uuid AND compra_id = $${values.length - 2} AND obra_id = $${values.length - 1} AND tenant_id::text = $${values.length}
        RETURNING *`, values,
    );
    res.json({ quote: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch procurement quote PATCH error");
    next(err);
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/quotes/:quoteId/approve", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const quoteId = String(req.params["quoteId"] ?? "");
    const request = await ownedRequest(tid, obraId, requestId);
    const quote = await ownedQuote(tid, obraId, requestId, quoteId);
    if (!request || !quote) { res.status(404).json({ error: "Solicitação ou cotação não encontrada" }); return; }

    await client.query("BEGIN");
    await client.query(`UPDATE arch_supplier_orders SET status = 'rejected', updated_at = now() WHERE compra_id = $1 AND obra_id = $2 AND tenant_id::text = $3 AND id <> $4::uuid AND deleted_at IS NULL`, [requestId, obraId, tid, quoteId]);
    const approved = await client.query(`UPDATE arch_supplier_orders SET status = 'approved', approved_at = now(), updated_at = now() WHERE id = $1::uuid AND compra_id = $2 AND obra_id = $3 AND tenant_id::text = $4 RETURNING *`, [quoteId, requestId, obraId, tid]);
    await client.query(
      `UPDATE compras_obras SET status = 'aprovado', cotacao_selecionada_id = $1::uuid, aprovado_por_id = $2, aprovado_em = now(), fornecedor = $3, valor_total = $4, updated_at = now() WHERE id = $5 AND obra_id = $6 AND tenant_id = $7`,
      [quoteId, req.user?.sub ?? null, quote.supplier_name, String(quoteTotal(quote)), requestId, obraId, tid],
    );
    await client.query("COMMIT");
    res.json({ quote: approved.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "arch procurement quote approve error");
    next(err);
  } finally {
    client.release();
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/quotes/:quoteId/order", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const quoteId = String(req.params["quoteId"] ?? "");
    const request = await ownedRequest(tid, obraId, requestId);
    const quote = await ownedQuote(tid, obraId, requestId, quoteId);
    if (!request || !quote) { res.status(404).json({ error: "Solicitação ou cotação não encontrada" }); return; }
    if (String(request.cotacao_selecionada_id ?? "") !== quoteId || quote.status !== "approved") {
      res.status(409).json({ error: "A cotação precisa estar aprovada antes da emissão do pedido" }); return;
    }

    await client.query("BEGIN");
    const ordered = await client.query(
      `UPDATE arch_supplier_orders SET status = 'ordered', ordered_at = now(), expected_delivery = COALESCE($1::date, expected_delivery), updated_at = now() WHERE id = $2::uuid AND compra_id = $3 AND obra_id = $4 AND tenant_id::text = $5 RETURNING *`,
      [req.body?.expectedDelivery || null, quoteId, requestId, obraId, tid],
    );
    await client.query(`UPDATE compras_obras SET status = 'pedido_emitido', pedido_fornecedor_id = $1::uuid, fornecedor = $2, data_prevista = COALESCE($3, data_prevista), updated_at = now() WHERE id = $4 AND obra_id = $5 AND tenant_id = $6`, [quoteId, quote.supplier_name, req.body?.expectedDelivery || quote.expected_delivery || null, requestId, obraId, tid]);
    await client.query("COMMIT");
    res.json({ order: ordered.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "arch procurement order error");
    next(err);
  } finally {
    client.release();
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/finance", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const request = await ownedRequest(tid, obraId, requestId);
    if (!request) { res.status(404).json({ error: "Solicitação não encontrada" }); return; }
    if (!request.pedido_fornecedor_id) { res.status(409).json({ error: "Emita o pedido antes de enviar ao financeiro" }); return; }
    if (request.lancamento_financeiro_id) {
      const existing = await client.query(`SELECT * FROM obra_lancamentos WHERE id = $1 AND obra_id = $2 AND tenant_id = $3 LIMIT 1`, [request.lancamento_financeiro_id, obraId, tid]);
      res.json({ launch: existing.rows[0], alreadyLinked: true }); return;
    }
    const quote = await ownedQuote(tid, obraId, requestId, String(request.pedido_fornecedor_id));
    if (!quote) { res.status(404).json({ error: "Pedido do fornecedor não encontrado" }); return; }

    const launchId = crypto.randomUUID();
    const amount = quoteTotal(quote);
    await client.query("BEGIN");
    const launch = await client.query(
      `INSERT INTO obra_lancamentos (id, obra_id, tenant_id, tipo, fornecedor, numero, valor, data_emissao, data_vencimento, descricao, status, etapa_id, observacoes, created_at, updated_at)
       VALUES ($1,$2,$3,'compra',$4,$5,$6,CURRENT_DATE,$7,$8,'pendente',$9,$10,now(),now()) RETURNING *`,
      [launchId, obraId, tid, quote.supplier_name, quote.quote_number || `PED-${String(quote.id).slice(0, 8)}`, String(amount), req.body?.dueDate || quote.expected_delivery || null, request.descricao, request.etapa_id || null, `Gerado pelo fluxo de Compras ARQDOR. Solicitação ${request.codigo || request.id}.`],
    );
    await client.query(`UPDATE compras_obras SET lancamento_financeiro_id = $1, updated_at = now() WHERE id = $2 AND obra_id = $3 AND tenant_id = $4`, [launchId, requestId, obraId, tid]);
    await client.query("COMMIT");
    res.status(201).json({ launch: launch.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "arch procurement finance error");
    next(err);
  } finally {
    client.release();
  }
});

router.post("/arch/procurement/:obraId/requests/:requestId/receipts", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const requestId = String(req.params["requestId"] ?? "");
    const request = await ownedRequest(tid, obraId, requestId);
    if (!request || !request.pedido_fornecedor_id) { res.status(409).json({ error: "É necessário um pedido emitido para registrar recebimento" }); return; }
    const quoteId = String(request.pedido_fornecedor_id);
    const quote = await ownedQuote(tid, obraId, requestId, quoteId);
    if (!quote) { res.status(404).json({ error: "Pedido do fornecedor não encontrado" }); return; }

    const received = Math.max(0, num(req.body?.quantidadeRecebida));
    const approved = Math.max(0, num(req.body?.quantidadeAprovada, received));
    const rejected = Math.max(0, num(req.body?.quantidadeRejeitada, Math.max(0, received - approved)));
    if (received <= 0) { res.status(400).json({ error: "Quantidade recebida deve ser maior que zero" }); return; }
    if (approved + rejected > received) { res.status(400).json({ error: "A soma aprovada/rejeitada não pode superar a quantidade recebida" }); return; }

    await client.query("BEGIN");
    const receipt = await client.query(
      `INSERT INTO obra_compra_recebimentos (
         id, tenant_id, obra_id, compra_id, supplier_order_id, data_recebimento,
         quantidade_recebida, quantidade_aprovada, quantidade_rejeitada, status,
         responsavel_id, responsavel_nome, observacoes, fotos, created_at, updated_at
       ) VALUES (gen_random_uuid(),$1,$2,$3,$4::uuid,now(),$5,$6,$7,$8,$9,$10,$11,'[]'::jsonb,now(),now()) RETURNING *`,
      [tid, obraId, requestId, quoteId, String(received), String(approved), String(rejected), rejected > 0 ? "com_ressalva" : "aprovado", req.user?.sub ?? null, req.user?.email ?? null, req.body?.observacoes || null],
    );

    if (request.insumo_id && approved > 0) {
      const stock = await client.query(`SELECT id FROM estoque_obras WHERE obra_id = $1 AND insumo_id = $2 LIMIT 1 FOR UPDATE`, [obraId, request.insumo_id]);
      if (stock.rows[0]) {
        await client.query(`UPDATE estoque_obras SET quantidade_atual = COALESCE(quantidade_atual,0) + $1::numeric, updated_at = now() WHERE id = $2`, [String(approved), stock.rows[0].id]);
      } else {
        await client.query(`INSERT INTO estoque_obras (id, obra_id, insumo_id, quantidade_atual, quantidade_minima, updated_at) VALUES ($1,$2,$3,$4,'0',now())`, [crypto.randomUUID(), obraId, request.insumo_id, String(approved)]);
      }
      await client.query(
        `INSERT INTO movimentacoes_estoque_obras (id, tenant_id, insumo_id, tipo, quantia, origem_tipo, destino_tipo, destino_obra_id, responsavel_id, observacao, created_at)
         VALUES ($1,$2,$3,'entrada',$4,'compra','obra',$5,$6,$7,now())`,
        [crypto.randomUUID(), tid, request.insumo_id, String(approved), obraId, req.user?.sub ?? null, `Recebimento da compra ${request.codigo || request.id}`],
      );
    }

    const total = await client.query(`SELECT COALESCE(SUM(quantidade_aprovada),0)::numeric AS approved FROM obra_compra_recebimentos WHERE compra_id = $1 AND obra_id = $2 AND tenant_id = $3`, [requestId, obraId, tid]);
    const approvedTotal = num(total.rows[0]?.approved);
    const required = num(request.quantidade);
    const complete = required > 0 && approvedTotal >= required;
    await client.query(`UPDATE arch_supplier_orders SET status = $1, delivered_at = CASE WHEN $1 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = $2::uuid AND compra_id = $3 AND obra_id = $4 AND tenant_id::text = $5`, [complete ? "delivered" : "partial", quoteId, requestId, obraId, tid]);
    await client.query(`UPDATE compras_obras SET status = $1, data_efetuada = CASE WHEN $1 = 'recebido' THEN CURRENT_DATE::text ELSE data_efetuada END, updated_at = now() WHERE id = $2 AND obra_id = $3 AND tenant_id = $4`, [complete ? "recebido" : "parcial", requestId, obraId, tid]);
    await client.query("COMMIT");
    res.status(201).json({ receipt: receipt.rows[0], approvedTotal, complete });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "arch procurement receipt error");
    next(err);
  } finally {
    client.release();
  }
});

export default router;
