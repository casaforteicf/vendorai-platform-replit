import {Router,type IRouter} from "express";
import {pool} from "@workspace/db";
import {z} from "zod/v4";
import {validStay} from "../lib/hotel-stay-rules.js";
const router:IRouter=Router();
function allowed(req:Express.Request,tenantId:string,write=false){
 const u=req.user;
 return !!(u?.sub&&u.tenantId===tenantId&&u.actorType!=="ai"&&u.actorType!=="system"&&(!write||u.platformRole==="tenant_admin"||u.role==="admin"||u.userFunction==="administrador"));
}
const id=z.string().uuid();
const roomInput=z.object({code:z.string().trim().min(1).max(32),name:z.string().trim().min(1).max(100),capacity:z.number().int().min(1).max(30)}).strict();
const guestInput=z.object({fullName:z.string().trim().min(2).max(180),contactEmail:z.email().optional(),contactPhone:z.string().max(40).optional()}).strict();
const bookingInput=z.object({roomId:id,guestId:id,arrivalDate:z.iso.date(),departureDate:z.iso.date(),guestCount:z.number().int().min(1).max(30)}).strict();
async function transact<T>(tenantId:string,action:(client:any)=>Promise<T>):Promise<T>{
 const client=await pool.connect();
 try{await client.query("BEGIN");await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const out=await action(client);await client.query("COMMIT");return out;}
 catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
router.get("/tenants/:tenantId/hotelaria/hospedagem/quartos",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 try{return res.json(await transact(t,async c=>(await c.query("SELECT id,code,name,capacity,status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 ORDER BY code",[t])).rows));}
 catch(e){return res.status(500).json({error:"Could not list rooms"});}
});
router.post("/tenants/:tenantId/hotelaria/hospedagem/quartos/:id/operacao",async(req,res)=>{
 const t=String(req.params.tenantId),roomId=String(req.params.id);
 if(!allowed(req,t,true))return res.status(403).json({error:"Forbidden"});
 const v=z.object({action:z.enum(["dirty","cleaning","inspection","clean","maintenance","release"]),notes:z.string().max(1000).optional()}).strict().safeParse(req.body);
 if(!id.safeParse(roomId).success||!v.success)return res.status(422).json({error:"Invalid room operation"});
 try{
  const result=await transact(t,async c=>{
   const current=await c.query("SELECT id,status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[t,roomId]);
   if(!current.rowCount)return null;
   const room=current.rows[0];
   const maintenance=["maintenance","release"].includes(v.data.action);
   if(v.data.action==="release"&&room.status!=="maintenance")return null;
   if(v.data.action==="maintenance"&&room.status!=="active")return null;
   if(!maintenance&&room.status!=="active")return null;
   const nextHousekeeping:Record<string,string>={dirty:"cleaning",cleaning:"inspection",inspection:"clean",clean:"dirty"};
   if(!maintenance&&(v.data.action!==nextHousekeeping[room.housekeeping_status]))return null;
   if(v.data.action==="maintenance"){
    const occupied=await c.query("SELECT 1 FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND status='checked_in' LIMIT 1",[t,roomId]);
    if(occupied.rowCount)return null;
   }
   const from=maintenance?room.status:room.housekeeping_status;
   const to=v.data.action==="release"?"active":v.data.action;
   if(from===to)return null;
   if(maintenance)await c.query("UPDATE hotel_rooms SET status=$3 WHERE tenant_id=$1 AND id=$2",[t,roomId,to]);
   else await c.query("UPDATE hotel_rooms SET housekeeping_status=$3 WHERE tenant_id=$1 AND id=$2",[t,roomId,to]);
   await c.query("INSERT INTO hotel_room_operational_events(id,tenant_id,room_id,event_type,previous_status,new_status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
     [crypto.randomUUID(),t,roomId,maintenance?(v.data.action==="maintenance"?"maintenance":"release"):"housekeeping",from,to,v.data.notes??null,req.user!.sub]);
   return {id:roomId,status:maintenance?to:room.status,housekeepingStatus:maintenance?room.housekeeping_status:to};
  });
  if(!result)return res.status(409).json({error:"Room absent or operation not permitted"});
  return res.json(result);
 }catch(e){console.error("[hotel-04] room operation",e);return res.status(500).json({error:"Room operation failed"});}
});
router.get("/tenants/:tenantId/hotelaria/hospedagem/quartos/:id/historico",async(req,res)=>{
 const t=String(req.params.tenantId),roomId=String(req.params.id);
 if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 if(!id.safeParse(roomId).success)return res.status(422).json({error:"Invalid room"});
 try{return res.json(await transact(t,async c=>(await c.query("SELECT event_type,previous_status,new_status,notes,created_by,created_at FROM hotel_room_operational_events WHERE tenant_id=$1 AND room_id=$2 ORDER BY created_at DESC LIMIT 100",[t,roomId])).rows));}
 catch(e){return res.status(500).json({error:"Could not list room history"});}
});
router.post("/tenants/:tenantId/hotelaria/hospedagem/quartos",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t,true))return res.status(403).json({error:"Forbidden"});
 const v=roomInput.safeParse(req.body);if(!v.success)return res.status(422).json({error:"Invalid room"});
 try{const result=await transact(t,async c=>await c.query("INSERT INTO hotel_rooms(id,tenant_id,code,name,capacity) VALUES($1,$2,$3,$4,$5) RETURNING id,code,name,capacity,status",[crypto.randomUUID(),t,v.data.code,v.data.name,v.data.capacity]));return res.status(201).json(result.rows[0]);}
 catch(e){return res.status(409).json({error:"Could not create room; code may already exist"});}
});
router.get("/tenants/:tenantId/hotelaria/hospedagem/hospedes",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 try{return res.json(await transact(t,async c=>(await c.query("SELECT id,full_name FROM hotel_guests WHERE tenant_id=$1 ORDER BY full_name LIMIT 500",[t])).rows));}
 catch(e){return res.status(500).json({error:"Could not list guests"});}
});
router.post("/tenants/:tenantId/hotelaria/hospedagem/hospedes",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t,true))return res.status(403).json({error:"Forbidden"});
 const v=guestInput.safeParse(req.body);if(!v.success)return res.status(422).json({error:"Invalid guest"});
 try{const result=await transact(t,async c=>await c.query("INSERT INTO hotel_guests(id,tenant_id,full_name,contact_email,contact_phone) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,contact_email,contact_phone",[crypto.randomUUID(),t,v.data.fullName,v.data.contactEmail??null,v.data.contactPhone??null]));return res.status(201).json(result.rows[0]);}
 catch(e){return res.status(500).json({error:"Could not register guest"});}
});
router.get("/tenants/:tenantId/hotelaria/hospedagem/reservas",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 try{return res.json(await transact(t,async c=>(await c.query("SELECT r.id,r.room_id,r.primary_guest_id,r.arrival_date,r.departure_date,r.guest_count,r.status,rm.code AS room_code,g.full_name AS guest_name FROM hotel_reservations r JOIN hotel_rooms rm ON rm.tenant_id=r.tenant_id AND rm.id=r.room_id JOIN hotel_guests g ON g.tenant_id=r.tenant_id AND g.id=r.primary_guest_id WHERE r.tenant_id=$1 ORDER BY r.arrival_date DESC LIMIT 500",[t])).rows));}
 catch(e){return res.status(500).json({error:"Could not list bookings"});}
});
router.get("/tenants/:tenantId/hotelaria/hospedagem/disponibilidade",async(req,res)=>{
 const t=String(req.params.tenantId);
 if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 const input=z.object({arrivalDate:z.iso.date(),departureDate:z.iso.date(),guestCount:z.coerce.number().int().min(1).max(30)}).safeParse(req.query);
 if(!input.success||!validStay(input.data.arrivalDate,input.data.departureDate))return res.status(422).json({error:"Invalid search period"});
 const days=(Date.parse(input.data.departureDate+"T00:00:00Z")-Date.parse(input.data.arrivalDate+"T00:00:00Z"))/86400000;
 if(days>365)return res.status(422).json({error:"Maximum 365 nights"});
 try{
  const rooms=await transact(t,async c=>(await c.query(
   `SELECT rm.id,rm.code,rm.name,rm.capacity,rm.status,rm.housekeeping_status
    FROM hotel_rooms rm WHERE rm.tenant_id=$1 AND rm.status='active' AND rm.capacity>=$4
     AND NOT EXISTS (
      SELECT 1 FROM hotel_reservations r WHERE r.tenant_id=rm.tenant_id
       AND r.room_id=rm.id AND r.status IN ('reserved','checked_in')
       AND r.arrival_date<$3::date AND r.departure_date>$2::date)
    ORDER BY rm.code`,[t,input.data.arrivalDate,input.data.departureDate,input.data.guestCount])).rows);
  return res.json({arrivalDate:input.data.arrivalDate,departureDate:input.data.departureDate,rooms,availabilitySubjectToRecheck:true});
 }catch(e){return res.status(500).json({error:"Could not check availability"});}
});
router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas",async(req,res)=>{
 const t=String(req.params.tenantId);if(!allowed(req,t,true))return res.status(403).json({error:"Forbidden"});
 const v=bookingInput.safeParse(req.body);if(!v.success||!validStay(v.data.arrivalDate,v.data.departureDate))return res.status(422).json({error:"Invalid booking dates or party"});
 const nights=(Date.parse(v.data.departureDate+"T00:00:00Z")-Date.parse(v.data.arrivalDate+"T00:00:00Z"))/86400000;
 if(!Number.isFinite(nights)||nights>365)return res.status(422).json({error:"Maximum 365 nights"});
 try{
  const result=await transact(t,async c=>{
   const room=await c.query("SELECT id,capacity FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 AND status='active' FOR UPDATE",[t,v.data.roomId]);
   if(!room.rowCount||v.data.guestCount>room.rows[0].capacity)return null;
   const guest=await c.query("SELECT id FROM hotel_guests WHERE tenant_id=$1 AND id=$2",[t,v.data.guestId]);
   if(!guest.rowCount)return null;
   const conflict=await c.query("SELECT id FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND status IN ('reserved','checked_in') AND arrival_date<$4 AND departure_date>$3 LIMIT 1",[t,v.data.roomId,v.data.arrivalDate,v.data.departureDate]);
   if(conflict.rowCount)return null;
   return await c.query("INSERT INTO hotel_reservations(id,tenant_id,room_id,primary_guest_id,arrival_date,departure_date,guest_count,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status",[crypto.randomUUID(),t,v.data.roomId,v.data.guestId,v.data.arrivalDate,v.data.departureDate,v.data.guestCount,req.user!.sub]);
  });
  if(!result)return res.status(409).json({error:"Room unavailable, occupied or guest missing"});
  return res.status(201).json(result.rows[0]);
 }catch(e){return res.status(500).json({error:"Could not create booking"});}
});
router.post("/tenants/:tenantId/hotelaria/hospedagem/reservas/:id/:action",async(req,res)=>{
 const t=String(req.params.tenantId),reservationId=String(req.params.id),action=String(req.params.action);
 if(!allowed(req,t,true))return res.status(403).json({error:"Forbidden"});
 if(!id.safeParse(reservationId).success||!["checkin","checkout","cancel"].includes(action))return res.status(422).json({error:"Invalid operation"});
 const from=action==="checkin"?"reserved":action==="checkout"?"checked_in":"reserved";
 const to=action==="checkin"?"checked_in":action==="checkout"?"checked_out":"cancelled";
 const column=action==="checkin"?"checked_in_at":action==="checkout"?"checked_out_at":null;
 try{const result=await transact(t,async c=>{
  const existing=await c.query("SELECT room_id,status FROM hotel_reservations WHERE tenant_id=$1 AND id=$2",[t,reservationId]);
  if(!existing.rowCount||existing.rows[0].status!==from)return null;
  const room=await c.query("SELECT status,housekeeping_status FROM hotel_rooms WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[t,existing.rows[0].room_id]);
  if(!room.rowCount)return null;
  if(action==="checkin"&&(room.rows[0].status!=="active"||room.rows[0].housekeeping_status!=="clean"))return null;
  if(action==="checkin"){
   const already=await c.query("SELECT 1 FROM hotel_reservations WHERE tenant_id=$1 AND room_id=$2 AND id<>$3 AND status='checked_in' LIMIT 1",[t,existing.rows[0].room_id,reservationId]);
   if(already.rowCount)return null;
  }
  const changed=await c.query(`UPDATE hotel_reservations SET status=$3${column?", "+column+"=now()":""} WHERE tenant_id=$1 AND id=$2 AND status=$4 RETURNING id,status`,[t,reservationId,to,from]);
  if(!changed.rowCount)return null;
  if(action==="checkout"){
   await c.query("UPDATE hotel_rooms SET housekeeping_status='dirty' WHERE tenant_id=$1 AND id=$2",[t,existing.rows[0].room_id]);
   await c.query("INSERT INTO hotel_room_operational_events(id,tenant_id,room_id,event_type,previous_status,new_status,created_by) VALUES($1,$2,$3,'housekeeping',$4,'dirty',$5)",[crypto.randomUUID(),t,existing.rows[0].room_id,room.rows[0].housekeeping_status,req.user!.sub]);
  }
  return changed.rows[0];
 });if(!result)return res.status(409).json({error:"Room unavailable, not clean or invalid booking transition"});return res.json(result);}
 catch(e){return res.status(500).json({error:"Could not update booking"});}
});
router.get("/tenants/:tenantId/hotelaria/hospedagem/previsao-refeicoes",async(req,res)=>{
 const t=String(req.params.tenantId);
 if(!allowed(req,t))return res.status(403).json({error:"Forbidden"});
 const query=z.object({start:z.iso.date(),end:z.iso.date()}).safeParse(req.query);
 if(!query.success||query.data.end<query.data.start)return res.status(422).json({error:"Invalid date range"});
 const start=new Date(query.data.start+"T12:00:00Z"),end=new Date(query.data.end+"T12:00:00Z");
 if((end.getTime()-start.getTime())/86400000>30)return res.status(422).json({error:"Maximum 31 days"});
 try{
  const rows=await transact(t,async c=>(await c.query(
   `SELECT gs.day::date::text AS service_date,
       COALESCE(sum(r.guest_count) FILTER(WHERE r.status='checked_in'),0)::int AS checked_in_guests,
       COALESCE(sum(r.guest_count) FILTER(WHERE r.status='reserved'),0)::int AS reserved_guests,
       COALESCE(count(r.id),0)::int AS occupied_or_reserved_rooms
    FROM generate_series($2::date,$3::date,interval '1 day') gs(day)
    LEFT JOIN hotel_reservations r ON r.tenant_id=$1 AND r.status IN ('reserved','checked_in')
      AND r.arrival_date<=gs.day::date AND r.departure_date>gs.day::date
    GROUP BY gs.day ORDER BY gs.day`,[t,query.data.start,query.data.end])).rows);
  return res.json({start:query.data.start,end:query.data.end,source:"hotel_reservations",automaticMealCreation:false,days:rows});
 }catch(error){console.error("[hotel-04] meal occupancy",error);return res.status(500).json({error:"Unable to calculate occupancy"});}
});

export default router;
