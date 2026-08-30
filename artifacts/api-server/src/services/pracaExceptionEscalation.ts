import { vendorPool } from "../lib/vendorDb.js";
import type { Logger } from "pino";

type AlertLevel="inicial"|"fora_sla"|"critico";

function recipientFunctions(incidentType:string):string[]{
  return ["pagamento_atrasado","pagamento_falhou","chargeback","split_bloqueado","estorno_pendente"].includes(incidentType)
    ?["financeiro","administrador"]
    :["suporte","administrador"];
}

export async function dispatchPracaExceptionAlerts(
  tenantIdFilter?:string,
  log?:Logger,
):Promise<{incidents:number;alerts:number;notifications:number}>{
  const incidents=await vendorPool.query(
    `SELECT i.*,c.escalonamento_minutos FROM praca_exception_incidents i
      JOIN praca_exception_config c ON c.tenant_id=i.tenant_id AND c.ativo=true
     WHERE i.status IN ('aberto','reconhecido')
       AND ($1::text IS NULL OR i.tenant_id=$1)
     ORDER BY i.first_detected_at`,
    [tenantIdFilter??null],
  );
  let alerts=0,notifications=0;
  for(const incident of incidents.rows){
    try{
      const levels:AlertLevel[]=["inicial"];
      if(incident.due_at&&new Date(incident.due_at).getTime()<=Date.now())levels.push("fora_sla");
      const escalatedAt=incident.due_at
        ?new Date(incident.due_at).getTime()+Number(incident.escalonamento_minutos)*60_000
        :Number.POSITIVE_INFINITY;
      if(incident.severity==="critica"||escalatedAt<=Date.now())levels.push("critico");
      const functions=recipientFunctions(incident.incident_type);
      const recipients=await vendorPool.query(
        `SELECT id FROM users
          WHERE tenant_id=$1 AND active=true AND user_function<>'entrega'
            AND (platform_role='tenant_admin' OR user_function=ANY($2::user_function[]))`,
        [incident.tenant_id,functions],
      );
      if(!recipients.rowCount)continue;
      for(const level of [...new Set(levels)]){
        const client=await vendorPool.connect();
        try{
          await client.query("BEGIN");
          let inserted=0;
          for(const recipient of recipients.rows){
            const row=await client.query(
              `INSERT INTO praca_exception_alerts
                (tenant_id,incident_id,user_id,alert_level,metadata)
               VALUES ($1,$2,$3,$4,$5::jsonb)
               ON CONFLICT (incident_id,user_id,alert_level) DO NOTHING RETURNING id`,
              [incident.tenant_id,incident.id,recipient.id,level,JSON.stringify({
                incidentType:incident.incident_type,severity:incident.severity,dueAt:incident.due_at,
              })],
            );
            inserted+=row.rowCount??0;
          }
          if(inserted>0){
            const type=level==="inicial"&&incident.severity!=="critica"?"warning":"error";
            const levelLabel=level==="fora_sla"?"Fora do SLA":level==="critico"?"Crítico":"Nova exceção";
            const notification=await client.query(
              `INSERT INTO notifications (tenant_id,title,message,type,category)
               VALUES ($1,$2,$3,$4,'praca_exception') RETURNING id`,
              [incident.tenant_id,`${levelLabel}: ${incident.title}`,
               `${incident.description} Abra a Central Executiva do Praça.ai para assumir e resolver.`,type],
            );
            await client.query(
              `INSERT INTO praca_exception_dispatches
                (tenant_id,incident_id,alert_level,notification_id,recipients)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (incident_id,alert_level) DO NOTHING`,
              [incident.tenant_id,incident.id,level,notification.rows[0].id,inserted],
            );
            alerts+=inserted;notifications++;
          }
          await client.query("COMMIT");
        }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
      }
    }catch(error){log?.error({error,incidentId:incident.id},"praca-exceptions: alert dispatch failed");}
  }
  return{incidents:incidents.rowCount??incidents.rows.length,alerts,notifications};
}
