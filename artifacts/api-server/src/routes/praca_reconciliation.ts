import { Router,type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb.js";
import { generatePracaReconciliation } from "../services/pracaReconciliation.js";

const router:IRouter=Router();
function actor(req:Express.Request){const u=(req as any).user;return{id:u?.id??u?.sub??null,tenantId:u?.tenantId,platformRole:u?.platformRole,userFunction:u?.userFunction};}
function canManage(req:Express.Request,tenantId:string){const u=actor(req);return u.platformRole==="super_admin"||(u.tenantId===tenantId&&["financeiro","administrador"].includes(u.userFunction));}
const validDate=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);

router.get("/tenants/:tenantId/praca-reconciliations",async(req,res)=>{
 const tenantId=String(req.params.tenantId);if(!canManage(req,tenantId)){ res.status(403).json({error:"Forbidden"}); return; }
 const result=await vendorPool.query(
  `SELECT b.*,u.name AS created_by_name,r.name AS reviewed_by_name
   FROM praca_reconciliation_batches b LEFT JOIN users u ON u.id=b.created_by LEFT JOIN users r ON r.id=b.reviewed_by
   WHERE b.tenant_id=$1 ORDER BY b.created_at DESC LIMIT 100`,[tenantId],
 );
 res.json({batches:result.rows});
});

router.post("/tenants/:tenantId/praca-reconciliations",async(req,res)=>{
 const tenantId=String(req.params.tenantId),u=actor(req);if(!canManage(req,tenantId)){ res.status(403).json({error:"Forbidden"}); return; }
 const from=req.body?.from,to=req.body?.to;
 if(!validDate(from)||!validDate(to)||from>to){ res.status(422).json({error:"Período inválido."}); return; }
 const days=(new Date(to+"T00:00:00Z").getTime()-new Date(from+"T00:00:00Z").getTime())/86400000+1;
 if(days>366){ res.status(422).json({error:"O fechamento não pode exceder 366 dias."}); return; }
 const result=await generatePracaReconciliation({tenantId,from,to,actorId:u.id});
 res.status(201).json(result);
});

router.get("/tenants/:tenantId/praca-reconciliations/:batchId",async(req,res)=>{
 const tenantId=String(req.params.tenantId),batchId=String(req.params.batchId);if(!canManage(req,tenantId)){ res.status(403).json({error:"Forbidden"}); return; }
 const batch=await vendorPool.query("SELECT * FROM praca_reconciliation_batches WHERE id=$1 AND tenant_id=$2",[batchId,tenantId]);
 if(!batch.rowCount){ res.status(404).json({error:"Fechamento não encontrado."}); return; }
 const [items,events]=await Promise.all([
  vendorPool.query(`SELECT i.*,p.cliente_nome FROM praca_reconciliation_items i
   LEFT JOIN praca_pedidos p ON p.id=i.order_id WHERE i.batch_id=$1 ORDER BY
   CASE i.reconciliation_status WHEN 'blocked' THEN 0 WHEN 'divergent' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
   abs(i.difference_centavos) DESC`,[batchId]),
  vendorPool.query("SELECT e.*,u.name AS actor_name FROM praca_reconciliation_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.batch_id=$1 ORDER BY e.created_at,e.id",[batchId]),
 ]);
 res.json({batch:batch.rows[0],items:items.rows,events:events.rows});
});

router.patch("/tenants/:tenantId/praca-reconciliations/:batchId/items/:itemId",async(req,res)=>{
 const tenantId=String(req.params.tenantId),batchId=String(req.params.batchId),itemId=String(req.params.itemId),u=actor(req);
 if(!canManage(req,tenantId)||!u.id){ res.status(403).json({error:"Forbidden"}); return; }
 const resolution=typeof req.body?.resolution==="string"?req.body.resolution.trim():"";
 if(resolution.length<10){ res.status(422).json({error:"Descreva a conferência e a correção realizada."}); return; }
 const client=await vendorPool.connect();
 try{
  await client.query("BEGIN");
  const item=await client.query("SELECT * FROM praca_reconciliation_items WHERE id=$1 AND batch_id=$2 AND tenant_id=$3 FOR UPDATE",[itemId,batchId,tenantId]);
  if(!item.rowCount){await client.query("ROLLBACK");res.status(404).json({error:"Item não encontrado."}); return;}
  if(item.rows[0].reconciliation_status==="balanced"){await client.query("ROLLBACK");res.status(409).json({error:"Este item já está conciliado."}); return;}
  await client.query("UPDATE praca_reconciliation_items SET reconciliation_status='balanced',resolved_at=now(),resolved_by=$1,resolution=$2,updated_at=now() WHERE id=$3",[u.id,resolution,itemId]);
  await client.query("INSERT INTO praca_reconciliation_events (tenant_id,batch_id,item_id,event_type,actor_id,note,metadata) VALUES ($1,$2,$3,'item_resolved',$4,$5,$6::jsonb)",[tenantId,batchId,itemId,u.id,resolution,JSON.stringify({previousStatus:item.rows[0].reconciliation_status,differenceCentavos:item.rows[0].difference_centavos})]);
  const counts=await client.query(`SELECT count(*) FILTER (WHERE reconciliation_status='balanced')::int balanced,
   count(*) FILTER (WHERE reconciliation_status IN ('divergent','blocked'))::int divergent,
   count(*) FILTER (WHERE reconciliation_status='pending')::int pending FROM praca_reconciliation_items WHERE batch_id=$1`,[batchId]);
  await client.query("UPDATE praca_reconciliation_batches SET balanced_count=$1,divergent_count=$2,pending_count=$3,updated_at=now() WHERE id=$4",[counts.rows[0].balanced,counts.rows[0].divergent,counts.rows[0].pending,batchId]);
  await client.query("COMMIT");res.json({resolved:true});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

router.patch("/tenants/:tenantId/praca-reconciliations/:batchId/status",async(req,res)=>{
 const tenantId=String(req.params.tenantId),batchId=String(req.params.batchId),u=actor(req);
 if(!canManage(req,tenantId)||!u.id){ res.status(403).json({error:"Forbidden"}); return; }
 const status=String(req.body?.status||""),notes=typeof req.body?.notes==="string"?req.body.notes.trim():"";
 if(!["reviewed","closed","completed"].includes(status)){ res.status(422).json({error:"Status inválido."}); return; }
 const current=await vendorPool.query("SELECT * FROM praca_reconciliation_batches WHERE id=$1 AND tenant_id=$2",[batchId,tenantId]);
 if(!current.rowCount){ res.status(404).json({error:"Fechamento não encontrado."}); return; }
 if(status==="closed"&&(Number(current.rows[0].divergent_count)>0||Number(current.rows[0].pending_count)>0)){ res.status(409).json({error:"Resolva divergências e pendências antes de fechar."}); return; }
 const result=await vendorPool.query(`UPDATE praca_reconciliation_batches SET status=$1,notes=coalesce(nullif($2,''),notes),
  reviewed_by=CASE WHEN $1 IN ('reviewed','closed') THEN $3 ELSE reviewed_by END,
  reviewed_at=CASE WHEN $1 IN ('reviewed','closed') THEN coalesce(reviewed_at,now()) ELSE reviewed_at END,
  closed_at=CASE WHEN $1='closed' THEN now() ELSE NULL END,updated_at=now() WHERE id=$4 RETURNING *`,[status,notes,u.id,batchId]);
 const eventType=status==="completed"?"reopened":status;
 await vendorPool.query("INSERT INTO praca_reconciliation_events (tenant_id,batch_id,event_type,actor_id,note) VALUES ($1,$2,$3,$4,$5)",[tenantId,batchId,eventType,u.id,notes||null]);
 res.json({batch:result.rows[0]});
});

export default router;
