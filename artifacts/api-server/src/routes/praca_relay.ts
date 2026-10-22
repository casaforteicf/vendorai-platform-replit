import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed tenant route; handlers enforce canAccess before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}
function actor(req:Express.Request){const u=(req as any).user;return{id:u?.sub??u?.id??null,tenantId:u?.tenantId,role:u?.platformRole,fn:u?.userFunction};}
function canAccess(req:Express.Request,tenantId:string){const a=actor(req);return a.role==="super_admin"||a.tenantId===tenantId;}
function point(value:any){const latitude=Number(value?.latitude??value?.lat),longitude=Number(value?.longitude??value?.lng??value?.lon);return Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180?{latitude,longitude}:null;}
function validDate(value:unknown):value is string{return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);}
function money(value:unknown){const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}

router.get("/tenants/:tenantId/praca-relay-points",async(req,res)=>{
 const tenantId=routeTenantId(req);if(!canAccess(req,tenantId)){ res.status(403).json({error:"Forbidden"}); return; }
 const result=await vendorPool.query("SELECT * FROM praca_pontos_redespacho WHERE tenant_id=$1 ORDER BY ativo DESC,nome",[tenantId]);res.json({points:result.rows});
});
router.post("/tenants/:tenantId/praca-relay-points",async(req,res)=>{
 const tenantId=routeTenantId(req),a=actor(req);if(!canAccess(req,tenantId)||a.fn==="entrega"){ res.status(403).json({error:"Somente a operação pode cadastrar pontos."}); return; }
 const nome=typeof req.body?.nome==="string"?req.body.nome.trim():"",location=point(req.body),endereco=req.body?.endereco;
 if(!nome||!location||!endereco||typeof endereco!=="object"){ res.status(422).json({error:"Nome, endereço e coordenadas válidas são obrigatórios."}); return; }
 const result=await vendorPool.query(`INSERT INTO praca_pontos_redespacho(tenant_id,nome,endereco,latitude,longitude,horario_operacao) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[tenantId,nome,endereco,location.latitude,location.longitude,req.body?.horarioOperacao??{}]);
 res.status(201).json({point:result.rows[0]});
});
router.patch("/tenants/:tenantId/praca-relay-points/:pointId",async(req,res)=>{
 const tenantId=routeTenantId(req),a=actor(req);if(!canAccess(req,tenantId)||a.fn==="entrega"){ res.status(403).json({error:"Forbidden"}); return; }
 const result=await vendorPool.query("UPDATE praca_pontos_redespacho SET ativo=$3,updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *",[String(req.params.pointId),tenantId,req.body?.ativo===true]);
 if(!result.rowCount){ res.status(404).json({error:"Ponto não encontrado."}); return; }res.json({point:result.rows[0]});
});

router.post("/tenants/:tenantId/praca-orders/:orderId/relay-plan",async(req,res)=>{
 const tenantId=routeTenantId(req),a=actor(req);if(!canAccess(req,tenantId)||!a.id||a.fn==="entrega"){ res.status(403).json({error:"Somente a operação pode planejar o redespacho."}); return; }
 const serviceDate=req.body?.dataServico,pickupValue=money(req.body?.freteColetaCentavos),lastMileValue=money(req.body?.freteUltimaMilhaCentavos);
 if(!validDate(serviceDate)||pickupValue===null||lastMileValue===null){ res.status(422).json({error:"Data e valores de cada trecho, em centavos, são obrigatórios."}); return; }
 const client=await vendorPool.connect();
 try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`relay:${tenantId}:${req.params.orderId}`]);
  const orderResult=await client.query(`SELECT p.*,c.timezone,c.horario_corte,c.horario_despacho,c.dias_semana,c.endereco_coleta FROM praca_pedidos p JOIN praca_logistica_config c ON c.tenant_id=p.tenant_id AND c.ativo=true WHERE p.id=$1 AND p.tenant_id=$2 AND p.status='pronto_coleta' FOR UPDATE OF p`,[String(req.params.orderId),tenantId]);
  if(!orderResult.rowCount){await client.query("ROLLBACK");res.status(409).json({error:"Pedido não está pronto ou a logística não foi configurada."}); return;}
  const order=orderResult.rows[0],pickupPoint=point(order.endereco_coleta),deliveryPoint=point(order.endereco_entrega);
  if(!pickupPoint||!deliveryPoint){await client.query("ROLLBACK");res.status(422).json({error:"Origem e destino precisam de coordenadas reais."}); return;}
  if(pickupValue+lastMileValue!==Number(order.frete_centavos)){await client.query("ROLLBACK");res.status(422).json({error:"A soma dos dois trechos deve ser igual ao frete do pedido."}); return;}
  const hubResult=await client.query("SELECT * FROM praca_pontos_redespacho WHERE id=$1 AND tenant_id=$2 AND ativo=true",[String(req.body?.pontoRedespachoId??""),tenantId]);
  if(!hubResult.rowCount){await client.query("ROLLBACK");res.status(422).json({error:"Ponto de redespacho ativo é obrigatório."}); return;}const hub=hubResult.rows[0];
  if(order.modelo_logistico==="redespacho"&&order.ponto_redespacho_id&&order.ponto_redespacho_id!==hub.id){
   await client.query("ROLLBACK");res.status(409).json({error:"O ponto difere do split financeiro já criado para o pedido."}); return;
  }
  const day=await client.query(`SELECT extract(isodow FROM $2::date)::int=ANY(dias_semana) AS valid FROM praca_logistica_config WHERE tenant_id=$1 AND $2::date >= (now() AT TIME ZONE timezone)::date`,[tenantId,serviceDate]);
  if(!day.rows[0]?.valid){await client.query("ROLLBACK");res.status(422).json({error:"Data fora dos dias de operação."}); return;}
  let pickupCourier=String(req.body?.entregadorColetaId??""),deliveryCourier=String(req.body?.entregadorEntregaId??"");
  const financialPlan=await client.query(
   `SELECT a.beneficiary_id,a.amount_centavos,a.basis
      FROM praca_payment_intents i JOIN praca_payment_allocations a ON a.payment_intent_id=i.id
     WHERE i.order_id=$1 AND i.tenant_id=$2 AND i.status NOT IN ('failed','cancelled','refunded')
       AND a.beneficiary_type='courier' ORDER BY a.basis`,[order.id,tenantId]);
  if(financialPlan.rowCount){
   const pickup=financialPlan.rows.find((item:any)=>item.basis==='order_freight_coleta_redespacho');
   const lastMile=financialPlan.rows.find((item:any)=>item.basis==='order_freight_ultima_milha');
   if(!pickup||!lastMile||Number(pickup.amount_centavos)!==pickupValue||Number(lastMile.amount_centavos)!==lastMileValue){
    await client.query("ROLLBACK");res.status(409).json({error:"Entregadores ou valores divergem do split financeiro do pedido."}); return;
   }
   pickupCourier=pickup.beneficiary_id;deliveryCourier=lastMile.beneficiary_id;
  }else if(req.body?.automatico===true){const available=await client.query(`SELECT u.id FROM users u WHERE u.tenant_id=$1 AND u.active=true AND u.user_function='entrega' AND NOT EXISTS(SELECT 1 FROM praca_rotas_entrega r JOIN praca_ondas_coleta o ON o.id=r.onda_id WHERE r.entregador_id=u.id AND o.data_servico=$2::date AND r.status<>'cancelada') ORDER BY u.last_assigned_at ASC NULLS FIRST,u.id LIMIT 2`,[tenantId,serviceDate]);if((available.rowCount ?? 0)<2){await client.query("ROLLBACK");res.status(409).json({error:"Redespacho exige dois entregadores ativos distintos."}); return;}pickupCourier=available.rows[0].id;deliveryCourier=available.rows[1].id;}
  if(!pickupCourier||!deliveryCourier||pickupCourier===deliveryCourier){await client.query("ROLLBACK");res.status(422).json({error:"Selecione dois entregadores diferentes ou use distribuição automática."}); return;}
  const couriers=await client.query("SELECT u.id FROM users u WHERE u.tenant_id=$1 AND u.active=true AND u.user_function='entrega' AND u.id=ANY($2::text[]) AND NOT EXISTS(SELECT 1 FROM praca_rotas_entrega r JOIN praca_ondas_coleta o ON o.id=r.onda_id WHERE r.entregador_id=u.id AND o.data_servico=$3::date AND r.status<>'cancelada')",[tenantId,[pickupCourier,deliveryCourier],serviceDate]);
  if(couriers.rowCount!==2){await client.query("ROLLBACK");res.status(422).json({error:"Entregadores inválidos ou inativos."}); return;}
  const times=await client.query(`SELECT (($2::date+c.horario_corte)::timestamp AT TIME ZONE c.timezone) AS cutoff,(($2::date+c.horario_despacho)::timestamp AT TIME ZONE c.timezone) AS dispatch FROM praca_logistica_config c WHERE tenant_id=$1`,[tenantId,serviceDate]);
  const wave=await client.query(`INSERT INTO praca_ondas_coleta(tenant_id,data_servico,corte_em,despacho_em) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,data_servico) DO UPDATE SET updated_at=now() RETURNING id`,[tenantId,serviceDate,times.rows[0].cutoff,times.rows[0].dispatch]);
  const nextNumber=await client.query("SELECT coalesce(max(numero),0)::int+1 AS n FROM praca_rotas_entrega WHERE onda_id=$1",[wave.rows[0].id]);const first=nextNumber.rows[0].n;
  const pickupRoute=await client.query(`INSERT INTO praca_rotas_entrega(tenant_id,onda_id,entregador_id,numero,status,total_paradas,modalidade) VALUES($1,$2,$3,$4,'planejada',2,'coleta_redespacho') RETURNING id`,[tenantId,wave.rows[0].id,pickupCourier,first]);
  const deliveryRoute=await client.query(`INSERT INTO praca_rotas_entrega(tenant_id,onda_id,entregador_id,numero,status,total_paradas,modalidade) VALUES($1,$2,$3,$4,'aguardando_transferencia',2,'ultima_milha') RETURNING id`,[tenantId,wave.rows[0].id,deliveryCourier,first+1]);
  const leg1=await client.query(`INSERT INTO praca_trechos_logisticos(tenant_id,pedido_id,onda_id,rota_id,ordem,tipo,origem_tipo,destino_tipo,origem_snapshot,destino_snapshot,entregador_id,valor_frete_centavos) VALUES($1,$2,$3,$4,1,'coleta_redespacho','vendedor','redespacho',$5,$6,$7,$8) RETURNING id`,[tenantId,order.id,wave.rows[0].id,pickupRoute.rows[0].id,order.endereco_coleta,hub.endereco,pickupCourier,pickupValue]);
  const leg2=await client.query(`INSERT INTO praca_trechos_logisticos(tenant_id,pedido_id,onda_id,rota_id,ordem,tipo,origem_tipo,destino_tipo,origem_snapshot,destino_snapshot,entregador_id,status,valor_frete_centavos) VALUES($1,$2,$3,$4,2,'ultima_milha','redespacho','cliente',$5,$6,$7,'aguardando_transferencia',$8) RETURNING id`,[tenantId,order.id,wave.rows[0].id,deliveryRoute.rows[0].id,hub.endereco,order.endereco_entrega,deliveryCourier,lastMileValue]);
  const stops=[];stops.push((await client.query(`INSERT INTO praca_rota_paradas(tenant_id,rota_id,pedido_id,trecho_id,tipo,sequencia,endereco_snapshot,latitude,longitude) VALUES($1,$2,$3,$4,'coleta',1,$5,$6,$7) RETURNING id`,[tenantId,pickupRoute.rows[0].id,order.id,leg1.rows[0].id,order.endereco_coleta,pickupPoint.latitude,pickupPoint.longitude])).rows[0].id);
  stops.push((await client.query(`INSERT INTO praca_rota_paradas(tenant_id,rota_id,pedido_id,trecho_id,tipo,sequencia,endereco_snapshot,latitude,longitude) VALUES($1,$2,$3,$4,'redespacho_saida',2,$5,$6,$7) RETURNING id`,[tenantId,pickupRoute.rows[0].id,order.id,leg1.rows[0].id,hub.endereco,hub.latitude,hub.longitude])).rows[0].id);
  stops.push((await client.query(`INSERT INTO praca_rota_paradas(tenant_id,rota_id,pedido_id,trecho_id,tipo,sequencia,endereco_snapshot,latitude,longitude) VALUES($1,$2,$3,$4,'redespacho_recebimento',1,$5,$6,$7) RETURNING id`,[tenantId,deliveryRoute.rows[0].id,order.id,leg2.rows[0].id,hub.endereco,hub.latitude,hub.longitude])).rows[0].id);
  stops.push((await client.query(`INSERT INTO praca_rota_paradas(tenant_id,rota_id,pedido_id,trecho_id,tipo,sequencia,endereco_snapshot,contato_snapshot,latitude,longitude) VALUES($1,$2,$3,$4,'entrega',2,$5,$6,$7,$8) RETURNING id`,[tenantId,deliveryRoute.rows[0].id,order.id,leg2.rows[0].id,order.endereco_entrega,{nome:order.cliente_nome,whatsapp:order.cliente_whatsapp},deliveryPoint.latitude,deliveryPoint.longitude])).rows[0].id);
  const volumes=await client.query("SELECT id FROM praca_pedido_volumes WHERE pedido_id=$1 AND status IN ('etiquetado','pronto_coleta')",[order.id]);if(!volumes.rowCount){await client.query("ROLLBACK");res.status(409).json({error:"Pedido não possui volumes prontos."}); return;}
  for(const volume of volumes.rows){for(const stopId of stops)await client.query("INSERT INTO praca_rota_parada_volumes(tenant_id,parada_id,volume_id) VALUES($1,$2,$3)",[tenantId,stopId,volume.id]);await client.query(`INSERT INTO praca_transferencias_custodia(tenant_id,pedido_id,volume_id,ponto_redespacho_id,trecho_origem_id,trecho_destino_id,entregador_saida_id,entregador_entrada_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[tenantId,order.id,volume.id,hub.id,leg1.rows[0].id,leg2.rows[0].id,pickupCourier,deliveryCourier]);await client.query("UPDATE praca_pedido_volumes SET trecho_atual_id=$2,updated_at=now() WHERE id=$1",[volume.id,leg1.rows[0].id]);}
  await client.query("UPDATE praca_pedidos SET modelo_logistico='redespacho',ponto_redespacho_id=$2,status='coleta_agendada',updated_at=now() WHERE id=$1",[order.id,hub.id]);
  await client.query(`INSERT INTO praca_pedido_eventos(tenant_id,pedido_id,tipo,status_anterior,status_novo,ator_tipo,ator_id,metadata) VALUES($1,$2,'redespacho_planejado','pronto_coleta','coleta_agendada','tenant',$3,$4)`,[tenantId,order.id,a.id,{pontoRedespachoId:hub.id,trechos:[leg1.rows[0].id,leg2.rows[0].id],rotas:[pickupRoute.rows[0].id,deliveryRoute.rows[0].id]}]);
  await client.query("UPDATE users SET last_assigned_at=now() WHERE id=ANY($1::text[])",[[pickupCourier,deliveryCourier]]);await client.query("COMMIT");
  res.status(201).json({pedidoId:order.id,pontoRedespacho:hub,coleta:{rotaId:pickupRoute.rows[0].id,entregadorId:pickupCourier,freteCentavos:pickupValue},ultimaMilha:{rotaId:deliveryRoute.rows[0].id,entregadorId:deliveryCourier,freteCentavos:lastMileValue}});
 }catch(error:any){await client.query("ROLLBACK");if(error?.code==="23505"){ res.status(409).json({error:"Redespacho já planejado para este pedido."}); return; }throw error;}finally{client.release();}
});

router.post("/tenants/:tenantId/praca-relay/scan",async(req,res)=>{
 const tenantId=routeTenantId(req),a=actor(req);if(!canAccess(req,tenantId)||!a.id||a.fn!=="entrega"){ res.status(403).json({error:"Somente entregadores podem transferir custódia."}); return; }
 const raw=typeof req.body?.qrCode==="string"?req.body.qrCode.trim():"",qr=raw.replace(/^APPVENDOR:V1:/,""),acao=String(req.body?.acao??""),location=point(req.body);
 if(!qr||!location||!["transferir_saida","receber_redespacho"].includes(acao)){ res.status(422).json({error:"QR, ação e localização são obrigatórios."}); return; }
 const client=await vendorPool.connect();try{await client.query("BEGIN");
  const found=await client.query(`SELECT t.*,v.status AS volume_status FROM praca_transferencias_custodia t JOIN praca_pedido_volumes v ON v.id=t.volume_id WHERE t.tenant_id=$1 AND v.qr_code=$2 AND t.status IN ('aguardando_saida','aguardando_recebimento') ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE OF t,v`,[tenantId,qr]);
  if(!found.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"Transferência pendente não encontrada."}); return;}const t=found.rows[0];
  if(acao==="transferir_saida"){if(t.volume_status!=="em_rota"){await client.query("ROLLBACK");res.status(409).json({error:"Registre a saída da coleta em rota antes de entregar no redespacho."}); return;}if(t.entregador_saida_id!==a.id||t.status!=="aguardando_saida"){await client.query("ROLLBACK");res.status(409).json({error:"Saída não permitida para este entregador ou estado."}); return;}
   await client.query(`UPDATE praca_transferencias_custodia SET status='aguardando_recebimento',saida_confirmada_em=now(),saida_latitude=$2,saida_longitude=$3,updated_at=now() WHERE id=$1`,[t.id,location.latitude,location.longitude]);
   await client.query("UPDATE praca_trechos_logisticos SET status='concluido',concluido_em=now(),updated_at=now() WHERE id=$1",[t.trecho_origem_id]);
   await client.query("UPDATE praca_pedido_volumes SET custodia_tipo='redespacho',custodia_id=$2,updated_at=now() WHERE id=$1",[t.volume_id,t.ponto_redespacho_id]);
   const remaining=await client.query("SELECT 1 FROM praca_transferencias_custodia WHERE trecho_origem_id=$1 AND status='aguardando_saida' LIMIT 1",[t.trecho_origem_id]);
   if(!remaining.rowCount){
    await client.query("UPDATE praca_rota_paradas SET status='concluida',ocorreu_em=now(),updated_at=now() WHERE trecho_id=$1 AND tipo='redespacho_saida'",[t.trecho_origem_id]);
    await client.query("UPDATE praca_rotas_entrega SET status='concluida',concluida_em=now(),updated_at=now() WHERE id=(SELECT rota_id FROM praca_trechos_logisticos WHERE id=$1)",[t.trecho_origem_id]);
    const interaction=await client.query(`INSERT INTO praca_entrega_interacoes(tenant_id,pedido_id,remetente_tipo,canal,mensagem,metadata) VALUES($1,$2,'sistema','vendorai','Volumes recebidos no ponto de redespacho. Aguardando confirmação do próximo entregador.',$3) RETURNING id`,[tenantId,t.pedido_id,{pontoRedespachoId:t.ponto_redespacho_id}]);
    const order=await client.query("SELECT cliente_whatsapp,tracking_token FROM praca_pedidos WHERE id=$1",[t.pedido_id]);
    if(order.rows[0]?.cliente_whatsapp)await client.query(`INSERT INTO praca_entrega_notificacoes(tenant_id,pedido_id,interacao_id,destinatario_whatsapp,template,payload) VALUES($1,$2,$3,$4,'redespacho_chegada',$5)`,[tenantId,t.pedido_id,interaction.rows[0].id,order.rows[0].cliente_whatsapp,{trackingToken:order.rows[0].tracking_token}]);
   }
  }else{if(t.entregador_entrada_id!==a.id||t.status!=="aguardando_recebimento"){await client.query("ROLLBACK");res.status(409).json({error:"Recebimento exige saída anterior e entregador de destino."}); return;}
   await client.query(`UPDATE praca_transferencias_custodia SET status='concluida',entrada_confirmada_em=now(),entrada_latitude=$2,entrada_longitude=$3,updated_at=now() WHERE id=$1`,[t.id,location.latitude,location.longitude]);
   await client.query("UPDATE praca_trechos_logisticos SET status='aceito',updated_at=now() WHERE id=$1",[t.trecho_destino_id]);
   await client.query("UPDATE praca_rotas_entrega SET status='aceita',updated_at=now() WHERE id=(SELECT rota_id FROM praca_trechos_logisticos WHERE id=$1)",[t.trecho_destino_id]);
   await client.query("UPDATE praca_pedido_volumes SET custodia_tipo='entregador',custodia_id=$2,trecho_atual_id=$3,updated_at=now() WHERE id=$1",[t.volume_id,a.id,t.trecho_destino_id]);
   const pending=await client.query("SELECT 1 FROM praca_transferencias_custodia WHERE trecho_destino_id=$1 AND status<>'concluida' LIMIT 1",[t.trecho_destino_id]);
   if(!pending.rowCount){
    await client.query("UPDATE praca_rota_paradas SET status='concluida',ocorreu_em=now(),updated_at=now() WHERE trecho_id=$1 AND tipo='redespacho_recebimento'",[t.trecho_destino_id]);
    const interaction=await client.query(`INSERT INTO praca_entrega_interacoes(tenant_id,pedido_id,rota_id,remetente_tipo,canal,mensagem,metadata) SELECT $1,$2,rota_id,'sistema','vendorai','Custódia confirmada pelo entregador da última milha. Entrega seguirá para o cliente.',$3 FROM praca_trechos_logisticos WHERE id=$4 RETURNING id`,[tenantId,t.pedido_id,{pontoRedespachoId:t.ponto_redespacho_id},t.trecho_destino_id]);
    const order=await client.query("SELECT cliente_whatsapp,tracking_token FROM praca_pedidos WHERE id=$1",[t.pedido_id]);
    if(order.rows[0]?.cliente_whatsapp)await client.query(`INSERT INTO praca_entrega_notificacoes(tenant_id,pedido_id,interacao_id,destinatario_whatsapp,template,payload) VALUES($1,$2,$3,$4,'redespacho_recebido',$5)`,[tenantId,t.pedido_id,interaction.rows[0].id,order.rows[0].cliente_whatsapp,{trackingToken:order.rows[0].tracking_token}]);
   }
  }
  await client.query(`INSERT INTO praca_pedido_eventos(tenant_id,pedido_id,volume_id,tipo,ator_tipo,ator_id,latitude,longitude,metadata) VALUES($1,$2,$3,$4,'entregador',$5,$6,$7,$8)`,[tenantId,t.pedido_id,t.volume_id,acao,a.id,location.latitude,location.longitude,{transferenciaId:t.id,pontoRedespachoId:t.ponto_redespacho_id}]);
  await client.query("COMMIT");res.json({ok:true,transferenciaId:t.id,status:acao==="transferir_saida"?"aguardando_recebimento":"concluida"});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

export default router;
