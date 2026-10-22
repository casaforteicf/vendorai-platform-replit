import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed tenant route; handlers enforce canAccess before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}

const ORDER_TRANSITIONS: Record<string, string[]> = {
  recebido: ["pagamento_pendente", "pago", "cancelado"],
  pagamento_pendente: ["pago", "cancelado"],
  pago: ["em_separacao", "cancelado"],
  em_separacao: ["pronto_coleta", "cancelado"],
  pronto_coleta: ["coleta_agendada", "coletado", "cancelado"],
  coleta_agendada: ["coletado", "falha_entrega", "cancelado"],
  coletado: ["em_rota", "falha_entrega"],
  em_rota: ["entregue", "falha_entrega"],
  falha_entrega: ["coleta_agendada", "em_rota", "devolucao_solicitada", "cancelado"],
  entregue: ["devolucao_solicitada"],
  devolucao_solicitada: ["devolvido"],
  devolvido: [],
  cancelado: [],
};

const VOLUME_EVENTS: Record<string, string> = {
  etiquetado: "etiquetado",
  pronto_coleta: "pronto_coleta",
  coletado: "coletado",
  em_rota: "em_rota",
  entregue: "entregue",
  falha_entrega: "falha_entrega",
  devolvido: "devolvido",
  cancelado: "cancelado",
};

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function actor(req: Express.Request) {
  const user = (req as any).user;
  return {
    type: user?.userFunction === "entrega" ? "entregador" : "tenant",
    id: user?.sub ?? user?.id ?? null,
  };
}

function integerMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function normalizeCoupon(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  return normalized.length >= 3 && normalized.length <= 40 ? normalized : null;
}

router.post("/tenants/:tenantId/praca-orders", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const idempotencyKey = String(req.header("Idempotency-Key") || req.body?.idempotencyKey || "").trim();
  const itens: unknown[] = Array.isArray(req.body?.itens) ? req.body.itens : [];
  const clienteNome = typeof req.body?.clienteNome === "string" ? req.body.clienteNome.trim() : "";
  const clienteDocumento = typeof req.body?.clienteDocumento === "string" ? req.body.clienteDocumento.replace(/\D/g, "") : "";
  const endereco = req.body?.enderecoEntrega;

  if (!idempotencyKey || idempotencyKey.length > 200) {
    return res.status(422).json({ error: "Idempotency-Key obrigatório, com até 200 caracteres." });
  }
  if (!clienteNome || (clienteDocumento && ![11,14].includes(clienteDocumento.length)) || !endereco || typeof endereco !== "object" || Array.isArray(endereco)) {
    return res.status(422).json({ error: "Cliente e endereço de entrega são obrigatórios." });
  }
  if (itens.length === 0 || itens.length > 500) {
    return res.status(422).json({ error: "O pedido precisa ter entre 1 e 500 itens." });
  }

  const normalized = itens.map((item: any) => ({
    produtoId: typeof item?.produtoId === "string" ? item.produtoId : "",
    quantidade: Number(item?.quantidade),
    unidade: typeof item?.unidade === "string" ? item.unidade.trim() : "",
    valorUnitarioCentavos: Number(item?.valorUnitarioCentavos),
  }));
  if (normalized.some((item) =>
    !item.produtoId || !item.unidade || !Number.isFinite(item.quantidade) ||
    item.quantidade <= 0 || !integerMoney(item.valorUnitarioCentavos)
  )) {
    return res.status(422).json({ error: "Itens possuem produto, quantidade, unidade ou valor inválido." });
  }

  const subtotal = normalized.reduce(
    (sum, item) => sum + Math.round(item.quantidade * item.valorUnitarioCentavos), 0,
  );
  const frete = Number(req.body?.freteCentavos ?? 0);
  let desconto = Number(req.body?.descontoCentavos ?? 0);
  if (!integerMoney(frete) || !integerMoney(desconto) || desconto > subtotal + frete) {
    return res.status(422).json({ error: "Frete ou desconto inválido." });
  }
  let total = subtotal + frete - desconto;

  const couponCode = normalizeCoupon(
    req.body?.cupomCodigo ?? req.body?.couponCode ?? req.body?.referralCode ?? req.body?.ref,
  );
  const attributionSource = typeof req.body?.origemAtribuicao === "string"
    ? req.body.origemAtribuicao.trim().slice(0, 80) || null
    : typeof req.body?.canal === "string"
      ? req.body.canal.trim().slice(0, 80) || null
      : "praca_ai";
  const attributionMetadata = req.body?.attributionMetadata && typeof req.body.attributionMetadata === "object" && !Array.isArray(req.body.attributionMetadata)
    ? req.body.attributionMetadata
    : {};

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status, total_centavos AS "totalCentavos",
              partner_id AS "partnerId", cupom_codigo AS "cupomCodigo",
              desconto_cupom_percentual AS "descontoCupomPercentual"
         FROM praca_pedidos WHERE tenant_id=$1 AND idempotency_key=$2`,
      [tenantId, idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return res.status(200).json({ ...existing.rows[0], idempotentReplay: true });
    }

    let attribution: {
      partnerId: string;
      code: string;
      discountPercent: number;
      partnerType: string | null;
    } | null = null;

    if (couponCode) {
      const partnerQ = await client.query(
        `SELECT id, tipo_parceiro, cupom_codigo, desconto_cupom_percentual,
                cupom_ativo, cupom_valido_ate, cupom_aplicacao, status
           FROM partners
          WHERE cupom_codigo=$1
          LIMIT 1`,
        [couponCode],
      );
      const partner = partnerQ.rows[0];
      if (!partner || !partner.cupom_ativo || partner.status !== "ativo") {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "Cupom não encontrado ou inativo." });
      }
      if (partner.cupom_valido_ate && new Date(partner.cupom_valido_ate).getTime() < Date.now()) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "Cupom expirado." });
      }
      if (!["geral", "produto", "marketplace"].includes(String(partner.cupom_aplicacao || "geral"))) {
        await client.query("ROLLBACK");
        return res.status(422).json({ error: "Este cupom não é válido para compras no Marketplace." });
      }

      const discountPercent = Math.max(0, Math.min(100, Number(partner.desconto_cupom_percentual ?? 0)));
      const couponDiscount = Math.round(subtotal * (discountPercent / 100));
      desconto = Math.min(subtotal + frete, desconto + couponDiscount);
      total = subtotal + frete - desconto;
      attribution = {
        partnerId: String(partner.id),
        code: String(partner.cupom_codigo),
        discountPercent,
        partnerType: partner.tipo_parceiro ? String(partner.tipo_parceiro) : null,
      };
    }

    const productIds = [...new Set(normalized.map((item) => item.produtoId))];
    const products = await client.query(
      `SELECT id, nome, sku FROM produtos_catalogo
        WHERE tenant_id=$1 AND id=ANY($2::text[])`,
      [tenantId, productIds],
    );
    if (products.rowCount !== productIds.length) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Um ou mais produtos não pertencem ao tenant." });
    }
    const productMap = new Map(products.rows.map((p) => [p.id, p]));

    const inserted = await client.query(
      `INSERT INTO praca_pedidos
        (tenant_id,id_externo,idempotency_key,canal,status,moeda,
         subtotal_centavos,frete_centavos,desconto_centavos,total_centavos,
         cliente_id,cliente_nome,cliente_documento,cliente_email,cliente_whatsapp,endereco_entrega,observacoes,
         partner_id,cupom_codigo,desconto_cupom_percentual,origem_atribuicao,attribution_metadata)
       VALUES ($1,$2,$3,$4,'recebido',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21::jsonb)
       RETURNING id,status,total_centavos AS "totalCentavos",created_at AS "createdAt",
                 partner_id AS "partnerId",cupom_codigo AS "cupomCodigo",
                 desconto_cupom_percentual AS "descontoCupomPercentual",
                 origem_atribuicao AS "origemAtribuicao"`,
      [
        tenantId,
        typeof req.body?.idExterno === "string" ? req.body.idExterno.trim() || null : null,
        idempotencyKey,
        typeof req.body?.canal === "string" ? req.body.canal : "praca_ai",
        typeof req.body?.moeda === "string" ? req.body.moeda.toUpperCase() : "BRL",
        subtotal, frete, desconto, total,
        typeof req.body?.clienteId === "string" ? req.body.clienteId : null,
        clienteNome,
        clienteDocumento || null,
        typeof req.body?.clienteEmail === "string" ? req.body.clienteEmail.trim() || null : null,
        typeof req.body?.clienteWhatsapp === "string" ? req.body.clienteWhatsapp.trim() || null : null,
        JSON.stringify(endereco),
        typeof req.body?.observacoes === "string" ? req.body.observacoes.trim() || null : null,
        attribution?.partnerId ?? null,
        attribution?.code ?? null,
        attribution ? String(attribution.discountPercent) : null,
        attribution ? attributionSource : null,
        JSON.stringify({ ...attributionMetadata, partnerType: attribution?.partnerType ?? undefined }),
      ],
    );
    const pedido = inserted.rows[0];

    for (const item of normalized) {
      const product = productMap.get(item.produtoId);
      const itemTotal = Math.round(item.quantidade * item.valorUnitarioCentavos);
      await client.query(
        `INSERT INTO praca_pedido_itens
          (tenant_id,pedido_id,produto_id,sku,nome_snapshot,quantidade,unidade,
           valor_unitario_centavos,total_centavos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [tenantId,pedido.id,item.produtoId,product.sku,product.nome,item.quantidade,
         item.unidade,item.valorUnitarioCentavos,itemTotal],
      );
    }

    const who = actor(req);
    await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,tipo,status_novo,ator_tipo,ator_id,metadata)
       VALUES ($1,$2,'pedido_recebido','recebido',$3,$4,$5::jsonb)`,
      [tenantId,pedido.id,who.type,who.id,JSON.stringify({
        canal: req.body?.canal ?? "praca_ai",
        attribution: attribution ? {
          partnerId: attribution.partnerId,
          couponCode: attribution.code,
          discountPercent: attribution.discountPercent,
          source: attributionSource,
        } : null,
      })],
    );

    await client.query("COMMIT");
    return res.status(201).json({
      ...pedido,
      subtotalCentavos: subtotal,
      freteCentavos: frete,
      descontoCentavos: desconto,
      couponApplied: Boolean(attribution),
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Pedido externo ou chave de idempotência já cadastrada." });
    }
    throw error;
  } finally {
    client.release();
  }
});

router.get("/tenants/:tenantId/praca-orders", async (req, res) => {
  const tenantId = routeTenantId(req);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const values: unknown[] = [tenantId];
  let statusFilter = "";
  if (typeof req.query.status === "string" && req.query.status) {
    values.push(req.query.status);
    statusFilter = ` AND status=$${values.length}`;
  }
  const result = await vendorPool.query(
    `SELECT id,id_externo AS "idExterno",canal,status,moeda,
            subtotal_centavos AS "subtotalCentavos",frete_centavos AS "freteCentavos",
            desconto_centavos AS "descontoCentavos",total_centavos AS "totalCentavos",
            cliente_nome AS "clienteNome",partner_id AS "partnerId",cupom_codigo AS "cupomCodigo",
            desconto_cupom_percentual AS "descontoCupomPercentual",origem_atribuicao AS "origemAtribuicao",
            created_at AS "createdAt",updated_at AS "updatedAt"
       FROM praca_pedidos WHERE tenant_id=$1${statusFilter}
      ORDER BY created_at DESC LIMIT 500`,
    values,
  );
  return res.json(result.rows);
});

router.get("/tenants/:tenantId/praca-orders/:orderId", async (req, res) => {
  const tenantId = routeTenantId(req);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [order, items, volumes, events] = await Promise.all([
    vendorPool.query(`SELECT * FROM praca_pedidos WHERE tenant_id=$1 AND id=$2`, [tenantId, orderId]),
    vendorPool.query(`SELECT * FROM praca_pedido_itens WHERE tenant_id=$1 AND pedido_id=$2 ORDER BY created_at`, [tenantId, orderId]),
    vendorPool.query(`SELECT id,numero,qr_code AS "qrCode",status,peso_gramas AS "pesoGramas",
                             dimensoes,created_at AS "createdAt",updated_at AS "updatedAt"
                        FROM praca_pedido_volumes WHERE tenant_id=$1 AND pedido_id=$2 ORDER BY numero`, [tenantId, orderId]),
    vendorPool.query(`SELECT id,volume_id AS "volumeId",tipo,status_anterior AS "statusAnterior",
                             status_novo AS "statusNovo",ator_tipo AS "atorTipo",ator_id AS "atorId",
                             latitude,longitude,motivo_codigo AS "motivoCodigo",descricao,evidencia,
                             metadata,ocorrido_em AS "ocorridoEm",recebido_em AS "recebidoEm"
                        FROM praca_pedido_eventos WHERE tenant_id=$1 AND pedido_id=$2
                       ORDER BY ocorrido_em,id`, [tenantId, orderId]),
  ]);
  if (!order.rowCount) return res.status(404).json({ error: "Pedido não encontrado." });
  return res.json({ ...order.rows[0], items: items.rows, volumes: volumes.rows, events: events.rows });
});

router.post("/tenants/:tenantId/praca-orders/:orderId/status", async (req, res) => {
  const tenantId = routeTenantId(req);
  const orderId = String(req.params.orderId);
  const next = typeof req.body?.status === "string" ? req.body.status : "";
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status,total_centavos,partner_id
         FROM praca_pedidos WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, orderId],
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pedido não encontrado." });
    }
    const previous = current.rows[0].status;
    if (!(ORDER_TRANSITIONS[previous] ?? []).includes(next)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Transição inválida: ${previous} -> ${next}.` });
    }
    const updated = await client.query(
      `UPDATE praca_pedidos SET status=$1,updated_at=now()
        WHERE tenant_id=$2 AND id=$3 RETURNING id,status,updated_at AS "updatedAt"`,
      [next, tenantId, orderId],
    );

    if (next === "pago" && current.rows[0].partner_id) {
      const partnerQ = await client.query(
        `SELECT comissao_percentual FROM partners WHERE id=$1 AND status='ativo' LIMIT 1`,
        [current.rows[0].partner_id],
      );
      const commissionPercent = Math.max(0, Math.min(100, Number(partnerQ.rows[0]?.comissao_percentual ?? 0)));
      if (commissionPercent > 0) {
        const base = Number(current.rows[0].total_centavos) / 100;
        const value = Math.round(base * (commissionPercent / 100) * 100) / 100;
        await client.query(
          `INSERT INTO partner_commissions
            (id,partner_id,tenant_id,tipo,valor_base,percentual,valor,data_referencia,status,source_type,source_id)
           VALUES (gen_random_uuid()::text,$1,$2,'marketplace',$3,$4,$5,current_date,'pendente','praca_order',$6)
           ON CONFLICT (partner_id,source_type,source_id)
             WHERE source_type IS NOT NULL AND source_id IS NOT NULL
           DO NOTHING`,
          [current.rows[0].partner_id, tenantId, String(base), String(commissionPercent), String(value), orderId],
        );
      }
    }

    const who = actor(req);
    await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,
         motivo_codigo,descricao,metadata)
       VALUES ($1,$2,'status_alterado',$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [tenantId,orderId,previous,next,who.type,who.id,
       typeof req.body?.motivoCodigo === "string" ? req.body.motivoCodigo : null,
       typeof req.body?.descricao === "string" ? req.body.descricao : null,
       JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {})],
    );
    await client.query("COMMIT");
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/tenants/:tenantId/praca-orders/:orderId/volumes", async (req, res) => {
  const tenantId = routeTenantId(req);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const numero = Number(req.body?.numero);
  const itens: unknown[] = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!Number.isInteger(numero) || numero < 1 || itens.length === 0) {
    return res.status(422).json({ error: "Número do volume e itens são obrigatórios." });
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query(
      `SELECT id FROM praca_pedidos WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, orderId],
    );
    if (!order.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pedido não encontrado." });
    }

    const normalized = itens.map((item: any) => ({ itemId: String(item?.itemId ?? ""), quantidade: Number(item?.quantidade) }));
    if (normalized.some((item) => !item.itemId || !Number.isFinite(item.quantidade) || item.quantidade <= 0)) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Itens do volume são inválidos." });
    }
    const itemIds = normalized.map((item) => item.itemId);
    const validItems = await client.query(
      `SELECT id FROM praca_pedido_itens WHERE tenant_id=$1 AND pedido_id=$2 AND id=ANY($3::text[])`,
      [tenantId, orderId, itemIds],
    );
    if (validItems.rowCount !== new Set(itemIds).size) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "Um ou mais itens não pertencem ao pedido." });
    }

    const volume = await client.query(
      `INSERT INTO praca_pedido_volumes
        (tenant_id,pedido_id,numero,peso_gramas,dimensoes)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING id,numero,qr_code AS "qrCode",status,peso_gramas AS "pesoGramas",
                 dimensoes,created_at AS "createdAt"`,
      [tenantId,orderId,numero,
       Number.isInteger(req.body?.pesoGramas) ? req.body.pesoGramas : null,
       JSON.stringify(req.body?.dimensoes && typeof req.body.dimensoes === "object" ? req.body.dimensoes : null)],
    );
    for (const item of normalized) {
      await client.query(
        `INSERT INTO praca_pedido_volume_itens (tenant_id,volume_id,item_id,quantidade)
         VALUES ($1,$2,$3,$4)`,
        [tenantId,volume.rows[0].id,item.itemId,item.quantidade],
      );
    }
    const who = actor(req);
    await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,volume_id,tipo,status_novo,ator_tipo,ator_id,metadata)
       VALUES ($1,$2,$3,'volume_criado','criado',$4,$5,$6::jsonb)`,
      [tenantId,orderId,volume.rows[0].id,who.type,who.id,JSON.stringify({ numero })],
    );
    await client.query("COMMIT");
    return res.status(201).json(volume.rows[0]);
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.status(409).json({ error: "Número de volume já utilizado neste pedido." });
    throw error;
  } finally {
    client.release();
  }
});

router.post("/tenants/:tenantId/logistics/volumes/:qrCode/scan", async (req, res) => {
  const tenantId = routeTenantId(req);
  const qrCode = String(req.params.qrCode);
  const eventType = typeof req.body?.tipo === "string" ? req.body.tipo : "";
  const nextStatus = VOLUME_EVENTS[eventType];
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!nextStatus) return res.status(422).json({ error: "Tipo de leitura inválido." });

  const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
  if ((latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    return res.status(422).json({ error: "Coordenadas inválidas." });
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id,pedido_id,status FROM praca_pedido_volumes
        WHERE tenant_id=$1 AND qr_code=$2 FOR UPDATE`,
      [tenantId, qrCode],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Volume não encontrado." });
    }
    const volume = found.rows[0];
    await client.query(
      `UPDATE praca_pedido_volumes SET status=$1,updated_at=now() WHERE id=$2`,
      [nextStatus, volume.id],
    );
    const who = actor(req);
    const event = await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,volume_id,tipo,status_anterior,status_novo,ator_tipo,
         ator_id,latitude,longitude,motivo_codigo,descricao,evidencia,metadata,ocorrido_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,
               coalesce($15::timestamptz,now()))
       RETURNING id,tipo,status_novo AS "statusNovo",ocorrido_em AS "ocorridoEm"`,
      [tenantId,volume.pedido_id,volume.id,eventType,volume.status,nextStatus,who.type,who.id,
       latitude,longitude,
       typeof req.body?.motivoCodigo === "string" ? req.body.motivoCodigo : null,
       typeof req.body?.descricao === "string" ? req.body.descricao : null,
       JSON.stringify(req.body?.evidencia && typeof req.body.evidencia === "object" ? req.body.evidencia : {}),
       JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
       typeof req.body?.ocorridoEm === "string" ? req.body.ocorridoEm : null],
    );
    await client.query("COMMIT");
    return res.status(201).json({ volumeId: volume.id, orderId: volume.pedido_id, event: event.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export default router;
