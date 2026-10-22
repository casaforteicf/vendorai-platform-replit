import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import { evidenceObjectExists, evidencePathBelongsTo } from "../services/pracaEvidenceStorage.js";

const router: IRouter = Router();

function userId(req: Express.Request): string | null {
  const user = (req as any).user;
  return user?.sub ?? user?.id ?? null;
}

function canTenantAccess(req: Express.Request, tenantId: string): boolean {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function point(body: any): { latitude: number; longitude: number } | null {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addressLine(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const a = value as Record<string, unknown>;
  return [
    a.logradouro ?? a.rua ?? a.endereco,
    a.numero,
    a.complemento,
    a.bairro,
    a.cidade,
    a.uf,
    a.cep,
  ].filter((part) => part != null && String(part).trim()).join(", ");
}

router.get("/tenants/:tenantId/praca-courier/returns/current", async (req,res)=>{
  const tenantId=String(req.params.tenantId),actorId=userId(req),actor=(req as any).user;
  if(!canTenantAccess(req,tenantId)||!actorId||actor?.userFunction!=="entrega"){ res.status(403).json({error:"Somente entregadores podem consultar devoluções."}); return; }
  const result=await vendorPool.query(
    "SELECT d.id,d.pedido_id,d.modelo_logistico,d.status,d.data_servico,d.endereco_coleta,d.endereco_destino,d.sequencia_coleta,d.sequencia_destino,d.motivo_descricao,hub.nome AS ponto_redespacho_nome,p.cliente_nome,p.cliente_whatsapp,CASE WHEN d.entregador_coleta_id=$2 THEN 'coleta' ELSE 'destino' END AS responsabilidade FROM praca_devolucoes d JOIN praca_pedidos p ON p.id=d.pedido_id LEFT JOIN praca_pontos_redespacho hub ON hub.id=d.ponto_redespacho_id WHERE d.tenant_id=$1 AND (d.entregador_coleta_id=$2 OR d.entregador_destino_id=$2) AND d.status NOT IN ('recebida_vendedor','cancelada','divergencia') ORDER BY d.data_servico,d.sequencia_coleta",
    [tenantId,actorId],
  );
  res.json({returns:result.rows});
});

router.get("/tenants/:tenantId/praca-courier/return-labels/:returnId",async(req,res)=>{
  const tenantId=String(req.params.tenantId);
  if(!canTenantAccess(req,tenantId)){ res.status(403).send("Forbidden"); return; }
  const result=await vendorPool.query("SELECT d.*,p.cliente_nome FROM praca_devolucoes d JOIN praca_pedidos p ON p.id=d.pedido_id WHERE d.id=$1 AND d.tenant_id=$2",[String(req.params.returnId),tenantId]);
  if(!result.rowCount){ res.status(404).send("Etiqueta não encontrada."); return; }
  const row=result.rows[0],actor=(req as any).user,actorId=userId(req);
  if(actor?.userFunction==="entrega"&&![row.entregador_coleta_id,row.entregador_destino_id].includes(actorId)){ res.status(403).send("Devolução pertence a outro entregador."); return; }
  const payload="APPVENDOR:RETURN:"+row.qr_code;
  const qrImage="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data="+encodeURIComponent(payload);
  res.setHeader("Content-Type","text/html; charset=utf-8");res.setHeader("Cache-Control","private, no-store");
  res.send("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Etiqueta de devolução</title><style>@page{size:100mm 150mm;margin:4mm}body{font-family:Arial;margin:0}.label{border:2px solid #111;padding:6mm;width:88mm;min-height:138mm}.top{border-bottom:2px solid #111;padding-bottom:3mm}.brand{font-size:22px;font-weight:800}.qr{text-align:center;margin:5mm}.qr img{width:52mm;height:52mm}.block{border-top:1px solid #555;padding-top:3mm;margin-top:3mm;font-size:13px}.block strong{display:block;font-size:10px}.code{font:10px monospace;word-break:break-all}.print{margin:12px}@media print{.print{display:none}}</style></head><body><button class='print' onclick='window.print()'>Imprimir etiqueta</button><section class='label'><div class='top'><div class='brand'>DEVOLUÇÃO PRAÇA.AI</div><div>Vendor.ai Logística Reversa</div></div><div class='qr'><img src='"+qrImage+"' alt='QR Code'><div class='code'>"+escapeHtml(payload)+"</div></div><div class='block'><strong>PEDIDO</strong>"+escapeHtml(row.pedido_id)+"</div><div class='block'><strong>CLIENTE / ORIGEM</strong>"+escapeHtml(row.cliente_nome)+" · "+escapeHtml(addressLine(row.endereco_coleta))+"</div><div class='block'><strong>DESTINO</strong>"+escapeHtml(addressLine(row.endereco_destino))+"</div><div class='block'><strong>MODELO</strong>"+escapeHtml(row.modelo_logistico)+"</div><div class='block'><strong>MOTIVO</strong>"+escapeHtml(row.motivo_descricao)+"</div><p><b>ESCANEAR EM TODA MOVIMENTAÇÃO</b></p></section></body></html>");
});

router.get("/tenants/:tenantId/praca-courier/routes/current", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canTenantAccess(req, tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const actorId = userId(req);
  if (!actorId) { res.status(401).json({ error: "Usuário não identificado." }); return; }

  const result = await vendorPool.query(
    `SELECT r.*, o.data_servico,
            coalesce(jsonb_agg(jsonb_build_object(
              'id',p.id,'pedidoId',p.pedido_id,'tipo',p.tipo,'sequencia',p.sequencia,
              'status',p.status,'endereco',p.endereco_snapshot,'contato',p.contato_snapshot,
              'latitude',p.latitude,'longitude',p.longitude,
              'motivoFalhaCodigo',p.motivo_falha_codigo,
              'motivoFalhaDescricao',p.motivo_falha_descricao
            ) ORDER BY p.sequencia) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS paradas
       FROM praca_rotas_entrega r
       JOIN praca_ondas_coleta o ON o.id=r.onda_id
       LEFT JOIN praca_rota_paradas p ON p.rota_id=r.id
      WHERE r.tenant_id=$1 AND r.entregador_id=$2
        AND r.status IN ('planejada','aguardando_transferencia','aceita','coletando','em_rota','parcial')
      GROUP BY r.id,o.data_servico
      ORDER BY o.data_servico,r.numero`,
    [tenantId, actorId],
  );
  res.json({ routes: result.rows });
});

router.post("/tenants/:tenantId/praca-courier/routes/:routeId/accept", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const actorId = userId(req);
  const actor = (req as any).user;
  if (!canTenantAccess(req, tenantId) || !actorId || actor?.userFunction !== "entrega") {
    res.status(403).json({ error: "Somente o entregador da rota pode aceitá-la." }); return;
  }
  const result = await vendorPool.query(
    `UPDATE praca_rotas_entrega
        SET status='aceita',updated_at=now()
      WHERE id=$1 AND tenant_id=$2 AND entregador_id=$3 AND status='planejada'
      RETURNING *`,
    [String(req.params.routeId), tenantId, actorId],
  );
  if (!result.rowCount) {
    res.status(409).json({ error: "Rota não encontrada, já aceita ou indisponível." }); return;
  }
  await vendorPool.query(
    "UPDATE praca_trechos_logisticos SET status='aceito',updated_at=now() WHERE rota_id=$1 AND status='planejado'",
    [result.rows[0].id],
  );
  res.json({ route: result.rows[0] });
});

router.get("/tenants/:tenantId/praca-courier/labels/:volumeId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canTenantAccess(req, tenantId)) { res.status(403).send("Forbidden"); return; }
  const result = await vendorPool.query(
    `SELECT v.id AS volume_id,v.numero AS volume_numero,v.qr_code,
            p.id AS pedido_id,p.cliente_nome,p.endereco_entrega,
            r.numero AS rota_numero,r.entregador_id,
            s.sequencia AS entrega_sequencia
       FROM praca_pedido_volumes v
       JOIN praca_pedidos p ON p.id=v.pedido_id
       JOIN praca_rota_parada_volumes pv ON pv.volume_id=v.id
       JOIN praca_rota_paradas s ON s.id=pv.parada_id AND s.tipo='entrega'
       JOIN praca_rotas_entrega r ON r.id=s.rota_id
      WHERE v.id=$1 AND v.tenant_id=$2`,
    [String(req.params.volumeId), tenantId],
  );
  if (!result.rowCount) { res.status(404).send("Etiqueta não encontrada."); return; }
  const row = result.rows[0];
  const actor = (req as any).user;
  if (actor?.userFunction === "entrega" && userId(req) !== row.entregador_id) {
    res.status(403).send("Volume pertence a outro entregador."); return;
  }

  const payload = `APPVENDOR:V1:${row.qr_code}`;
  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(payload)}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Etiqueta ${escapeHtml(row.pedido_id)} / ${row.volume_numero}</title>
<style>
@page{size:100mm 150mm;margin:4mm}*{box-sizing:border-box}
body{font-family:Arial,sans-serif;margin:0;color:#111}.label{border:2px solid #111;padding:6mm;width:92mm;min-height:142mm}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:4mm}
.brand{font-size:21px;font-weight:800}.route{text-align:right;font-size:16px}.route strong{display:block;font-size:34px}
.qr{text-align:center;margin:5mm 0}.qr img{width:52mm;height:52mm}.code{font:12px monospace;word-break:break-all}
.block{border-top:1px solid #555;padding-top:3mm;margin-top:3mm;font-size:14px}.block strong{display:block;font-size:11px;text-transform:uppercase}
.footer{margin-top:5mm;font-weight:700;text-align:center}.print{margin:12px}
@media print{.print{display:none}.label{border:2px solid #111}}
</style></head><body><button class="print" onclick="window.print()">Imprimir etiqueta</button>
<section class="label"><div class="top"><div><div class="brand">PRAÇA.AI</div><div>Vendor.ai Logística</div></div>
<div class="route">ROTA <strong>${escapeHtml(row.rota_numero)}</strong>ENTREGA Nº ${escapeHtml(row.entrega_sequencia - 1)}</div></div>
<div class="qr"><img alt="QR Code do volume" src="${qrImage}"><div class="code">${escapeHtml(payload)}</div></div>
<div class="block"><strong>Pedido</strong>${escapeHtml(row.pedido_id)}</div>
<div class="block"><strong>Volume</strong>${escapeHtml(row.volume_numero)}</div>
<div class="block"><strong>Cliente</strong>${escapeHtml(row.cliente_nome)}</div>
<div class="block"><strong>Destino</strong>${escapeHtml(addressLine(row.endereco_entrega))}</div>
<div class="footer">ESCANEAR EM TODA MOVIMENTAÇÃO</div></section></body></html>`);
});

router.get("/tenants/:tenantId/praca-courier/resolve-volume", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const actorId = userId(req);
  const actor = (req as any).user;
  if (!canTenantAccess(req, tenantId) || !actorId || actor?.userFunction !== "entrega") {
    res.status(403).json({ error: "Somente o entregador pode consultar o volume." }); return;
  }
  const raw = typeof req.query.qrCode === "string" ? req.query.qrCode.trim() : "";
  const qrCode = raw.startsWith("APPVENDOR:V1:") ? raw.slice(13) : raw;
  if (!qrCode) { res.status(422).json({ error: "QR Code obrigatório." }); return; }
  const result = await vendorPool.query(
    `SELECT v.id AS volume_id,v.status,p.id AS pedido_id,r.id AS rota_id,r.modalidade
       FROM praca_pedido_volumes v
       JOIN praca_pedidos p ON p.id=v.pedido_id
       JOIN LATERAL (
         SELECT route.id,route.modalidade
           FROM praca_rota_parada_volumes pv
           JOIN praca_rota_paradas stop ON stop.id=pv.parada_id
           JOIN praca_rotas_entrega route ON route.id=stop.rota_id
          WHERE pv.volume_id=v.id AND route.entregador_id=$3
            AND route.status IN ('aceita','coletando','em_rota','parcial')
          ORDER BY CASE route.modalidade WHEN 'ultima_milha' THEN 0 ELSE 1 END,route.created_at DESC
          LIMIT 1
       ) r ON true
      WHERE v.tenant_id=$1 AND v.qr_code=$2`,
    [tenantId, qrCode, actorId],
  );
  if (!result.rowCount) { res.status(404).json({ error: "Volume não pertence à sua rota." }); return; }
  const row = result.rows[0];
  res.json({ volumeId: row.volume_id, pedidoId: row.pedido_id, rotaId: row.rota_id, status: row.status });
});

router.post("/tenants/:tenantId/praca-courier/scan", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canTenantAccess(req, tenantId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const actor = (req as any).user;
  const actorId = userId(req);
  if (!actorId || actor?.userFunction !== "entrega") {
    res.status(403).json({ error: "Somente o entregador pode registrar movimentações." }); return;
  }

  const rawCode = typeof req.body?.qrCode === "string" ? req.body.qrCode.trim() : "";
  const qrCode = rawCode.startsWith("APPVENDOR:V1:") ? rawCode.slice(13) : rawCode;
  const action = String(req.body?.acao ?? "");
  const location = point(req.body);
  if (!qrCode || !["coletado","em_rota","entregue","falha_entrega"].includes(action)) {
    res.status(422).json({ error: "QR Code e ação válida são obrigatórios." }); return;
  }
  if (!location) { res.status(422).json({ error: "Latitude e longitude reais são obrigatórias." }); return; }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT v.id AS volume_id,v.status AS volume_status,p.id AS pedido_id,p.tracking_token,p.cliente_whatsapp,
              r.id AS rota_id,r.entregador_id,r.modalidade,
              pickup.id AS coleta_parada_id,delivery.id AS entrega_parada_id,relay_out.id AS redespacho_saida_parada_id
         FROM praca_pedido_volumes v
         JOIN praca_pedidos p ON p.id=v.pedido_id
         JOIN LATERAL (
           SELECT route.*
             FROM praca_rota_parada_volumes pv
             JOIN praca_rota_paradas stop ON stop.id=pv.parada_id
             JOIN praca_rotas_entrega route ON route.id=stop.rota_id
            WHERE pv.volume_id=v.id AND route.entregador_id=$3
              AND route.status IN ('aceita','coletando','em_rota','parcial')
            ORDER BY CASE route.modalidade WHEN 'ultima_milha' THEN 0 ELSE 1 END,route.created_at DESC
            LIMIT 1
         ) r ON true
         LEFT JOIN LATERAL (
           SELECT id FROM praca_rota_paradas WHERE rota_id=r.id AND tipo='coleta' ORDER BY sequencia LIMIT 1
         ) pickup ON true
         LEFT JOIN LATERAL (
           SELECT id FROM praca_rota_paradas WHERE rota_id=r.id AND tipo='entrega' ORDER BY sequencia DESC LIMIT 1
         ) delivery ON true
         LEFT JOIN LATERAL (
           SELECT id FROM praca_rota_paradas WHERE rota_id=r.id AND tipo='redespacho_saida' ORDER BY sequencia DESC LIMIT 1
         ) relay_out ON true
        WHERE v.tenant_id=$1 AND v.qr_code=$2
        FOR UPDATE OF v,p`,
      [tenantId, qrCode, actorId],
    );
    if (!found.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Volume não localizado nesta operação." }); return;
    }
    const row = found.rows[0];
    if (row.entregador_id !== actorId) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Este volume pertence à rota de outro entregador." }); return;
    }

    const allowed: Record<string, string[]> = {
      coletado: ["etiquetado","pronto_coleta"],
      em_rota: ["coletado"],
      entregue: ["em_rota"],
      falha_entrega: ["em_rota"],
    };
    if (!allowed[action].includes(row.volume_status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `Movimento ${action} não permitido após ${row.volume_status}.` }); return;
    }

    const stopId = action === "coletado"
      ? row.coleta_parada_id
      : action === "em_rota"
        ? (row.redespacho_saida_parada_id ?? row.entrega_parada_id)
        : row.entrega_parada_id;
    if (!stopId) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Esta ação não pertence ao trecho logístico atual do entregador." }); return;
    }
    if (action === "entregue") {
      const proof = req.body?.prova;
      if (!proof || !["documento","pessoa"].includes(proof.tipo) || typeof proof.fotoUrl !== "string" ||
          !evidencePathBelongsTo(proof.fotoUrl, tenantId, row.pedido_id, row.volume_id)) {
        await client.query("ROLLBACK");
        res.status(422).json({ error: "Entrega exige foto privada previamente autorizada e tipo documento ou pessoa." }); return;
      }
      if (!(await evidenceObjectExists(proof.fotoUrl))) {
        await client.query("ROLLBACK");
        res.status(422).json({ error: "A foto ainda não foi enviada ou não foi localizada." }); return;
      }
      await client.query(
        `INSERT INTO praca_entrega_provas
          (tenant_id,rota_id,parada_id,pedido_id,volume_id,tipo,foto_url,
           recebedor_nome,documento_final,latitude,longitude,entregador_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId,row.rota_id,stopId,row.pedido_id,row.volume_id,proof.tipo,proof.fotoUrl.trim(),
         proof.recebedorNome ?? null,proof.documentoFinal ?? null,location.latitude,location.longitude,actorId],
      );
    }

    if (action === "falha_entrega") {
      const reasonCode = typeof req.body?.motivoCodigo === "string" ? req.body.motivoCodigo.trim() : "";
      const description = typeof req.body?.descricao === "string" ? req.body.descricao.trim() : "";
      if (!reasonCode || !description) {
        await client.query("ROLLBACK");
        res.status(422).json({ error: "Falha exige código e descrição do motivo." }); return;
      }
      const failurePhoto = req.body?.fotoUrl;
      if (failurePhoto && !evidencePathBelongsTo(failurePhoto, tenantId, row.pedido_id, row.volume_id)) {
        await client.query("ROLLBACK");
        res.status(422).json({ error: "A foto da falha não pertence ao upload privado autorizado." }); return;
      }
      if (failurePhoto && !(await evidenceObjectExists(failurePhoto))) {
        await client.query("ROLLBACK");
        res.status(422).json({ error: "A foto da falha ainda não foi enviada ou não foi localizada." }); return;
      }
      await client.query(
        `INSERT INTO praca_entrega_falhas
          (tenant_id,rota_id,parada_id,pedido_id,volume_id,motivo_codigo,descricao,
           foto_url,latitude,longitude,entregador_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [tenantId,row.rota_id,stopId,row.pedido_id,row.volume_id,reasonCode,description,
         failurePhoto ?? null,location.latitude,location.longitude,actorId],
      );
      const interaction = await client.query(
        `INSERT INTO praca_entrega_interacoes
          (tenant_id,pedido_id,rota_id,remetente_tipo,remetente_id,canal,mensagem,metadata)
         VALUES ($1,$2,$3,'sistema',NULL,'vendorai',$4,$5) RETURNING id`,
        [tenantId,row.pedido_id,row.rota_id,`Entrega não concluída: ${description}`,{ motivoCodigo: reasonCode }],
      );
      if (row.cliente_whatsapp) {
        await client.query(
          `INSERT INTO praca_entrega_notificacoes
            (tenant_id,pedido_id,interacao_id,destinatario_whatsapp,template,payload)
           VALUES ($1,$2,$3,$4,'falha_entrega',$5)`,
          [tenantId,row.pedido_id,interaction.rows[0].id,row.cliente_whatsapp,
           { motivo: description, trackingToken: row.tracking_token }],
        );
      }
      await client.query(
        `UPDATE praca_rota_paradas SET status='falhou',motivo_falha_codigo=$2,
          motivo_falha_descricao=$3,ocorreu_em=now(),updated_at=now() WHERE id=$1`,
        [stopId, reasonCode, description],
      );
    }

    await client.query("UPDATE praca_pedido_volumes SET status=$2,updated_at=now() WHERE id=$1", [row.volume_id, action]);
    await client.query(
      `INSERT INTO praca_pedido_eventos
        (tenant_id,pedido_id,volume_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,
         latitude,longitude,motivo_codigo,descricao,evidencia,metadata)
       VALUES ($1,$2,$3,$4,$5,$4,'entregador',$6,$7,$8,$9,$10,$11,$12)`,
      [tenantId,row.pedido_id,row.volume_id,action,row.volume_status,actorId,
       location.latitude,location.longitude,req.body?.motivoCodigo ?? null,req.body?.descricao ?? null,
       action === "entregue" ? req.body.prova : {},{ rotaId: row.rota_id, paradaId: stopId }],
    );

    if (action === "coletado") {
      await client.query("UPDATE praca_rotas_entrega SET status='coletando',updated_at=now() WHERE id=$1 AND status IN ('planejada','aceita')", [row.rota_id]);
    } else if (action === "em_rota") {
      await client.query("UPDATE praca_trechos_logisticos SET status='em_execucao',iniciado_em=coalesce(iniciado_em,now()),updated_at=now() WHERE rota_id=$1 AND status IN ('planejado','aceito')", [row.rota_id]);
      await client.query("UPDATE praca_rotas_entrega SET status='em_rota',iniciada_em=coalesce(iniciada_em,now()),updated_at=now() WHERE id=$1", [row.rota_id]);
      await client.query("UPDATE praca_pedidos SET status='em_rota',updated_at=now() WHERE id=$1", [row.pedido_id]);
    } else if (action === "falha_entrega") {
      await client.query("UPDATE praca_rotas_entrega SET status='parcial',updated_at=now() WHERE id=$1", [row.rota_id]);
      await client.query("UPDATE praca_pedidos SET status='falha_entrega',updated_at=now() WHERE id=$1", [row.pedido_id]);
    }

    if (action === "coletado") {
      await client.query(
        `UPDATE praca_rota_paradas s SET status='concluida',ocorreu_em=now(),updated_at=now()
          WHERE s.id=$1 AND NOT EXISTS (
            SELECT 1 FROM praca_rota_parada_volumes pv
            JOIN praca_pedido_volumes v ON v.id=pv.volume_id
            WHERE pv.parada_id=s.id AND v.status NOT IN ('coletado','em_rota','entregue'))`,
        [stopId],
      );
      await client.query(
        `UPDATE praca_pedidos p SET status='coletado',updated_at=now()
          WHERE p.id=$1 AND NOT EXISTS (
            SELECT 1 FROM praca_pedido_volumes v WHERE v.pedido_id=p.id AND v.status NOT IN ('coletado','em_rota','entregue'))`,
        [row.pedido_id],
      );
    }

    if (action === "entregue") {
      await client.query("UPDATE praca_trechos_logisticos SET status='concluido',concluido_em=now(),updated_at=now() WHERE rota_id=$1", [row.rota_id]);
      await client.query(
        `UPDATE praca_rota_paradas s SET status='concluida',ocorreu_em=now(),updated_at=now()
          WHERE s.id=$1 AND NOT EXISTS (
            SELECT 1 FROM praca_rota_parada_volumes pv
            JOIN praca_pedido_volumes v ON v.id=pv.volume_id
            WHERE pv.parada_id=s.id AND v.status<>'entregue')`,
        [stopId],
      );
      await client.query(
        `UPDATE praca_pedidos p SET status='entregue',updated_at=now()
          WHERE p.id=$1 AND NOT EXISTS (
            SELECT 1 FROM praca_pedido_volumes v WHERE v.pedido_id=p.id AND v.status<>'entregue')`,
        [row.pedido_id],
      );
      await client.query(
        `UPDATE praca_rotas_entrega r SET status='concluida',concluida_em=now(),updated_at=now()
          WHERE r.id=$1 AND NOT EXISTS (
            SELECT 1 FROM praca_rota_paradas s
             WHERE s.rota_id=r.id AND s.tipo='entrega' AND s.status NOT IN ('concluida','ignorada'))`,
        [row.rota_id],
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, volumeId: row.volume_id, pedidoId: row.pedido_id, rotaId: row.rota_id, status: action });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export default router;
