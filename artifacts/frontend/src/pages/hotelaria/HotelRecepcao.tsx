import {useEffect,useState} from "react";
import {useAuth} from "@/contexts/AuthContext";
type Room={id:string;code:string;name:string;capacity:number;status:string};
type Booking={id:string;room_id:string;primary_guest_id:string;room_code:string;guest_name:string;arrival_date:string;departure_date:string;guest_count:number;status:string};
const day=(s:string)=>String(s).slice(0,10);
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
export default function HotelRecepcao(){
 const {token,user}=useAuth();const tenantId=user?.tenantId;
 const [rooms,setRooms]=useState<Room[]>([]),[bookings,setBookings]=useState<Booking[]>([]);
 const [date,setDate]=useState(today()),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const base=tenantId?`/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/hospedagem`:"";
 async function api<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options?.body?{"Content-Type":"application/json"}:{}),...options?.headers}});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.error??`HTTP ${response.status}`);
  return data as T;
 }
 async function load(){
  if(!tenantId||!token)return;
  try{const [r,b]=await Promise.all([api<Room[]>("/quartos"),api<Booking[]>("/reservas")]);setRooms(r);setBookings(b);}
  catch(e){setMessage(String(e));}
 }
 useEffect(()=>{void load();},[tenantId,token]);
 async function action(id:string,kind:"checkin"|"checkout"|"cancel"){
  if(!window.confirm("Confirmar esta alteração na hospedagem?"))return;
  setBusy(true);setMessage("");
  try{await api("/reservas/"+encodeURIComponent(id)+"/"+kind,{method:"POST"});await load();setMessage("Hospedagem atualizada.");}
  catch(e){setMessage(String(e));}finally{setBusy(false);}
 }
 const visible=bookings.filter(b=>day(b.arrival_date)<=date&&day(b.departure_date)>date&&["reserved","checked_in"].includes(b.status));
 const gridDays=Array.from({length:7},(_,i)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+i);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});});
 return <main className="space-y-5 p-4 md:p-6">
  <header><h1 className="text-2xl font-semibold">Recepção · Hotelaria</h1><p className="text-sm text-muted-foreground">Mapa de ocupação, reservas e movimentações. Dados do hotel atual.</p></header>
  {message&&<div role="status" className="rounded-md border p-3 text-sm">{message}</div>}
  <div className="flex flex-wrap items-center gap-3"><label htmlFor="hotel-occupancy-date">Data de consulta</label><input id="hotel-occupancy-date" className="rounded-md border p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/><span className="text-sm text-muted-foreground">{visible.length} apartamento(s) ocupado(s) ou reservado(s) · {rooms.length} cadastrados</span></div>
  <section className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-medium">Mapa de apartamentos</h2>
   {!rooms.length&&<p>Nenhum apartamento cadastrado.</p>}
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{rooms.map(room=>{const booking=visible.find(b=>b.room_id===room.id);return <article key={room.id} className="rounded-lg border p-3">
    <strong>{room.code} · {room.name}</strong><p className="text-sm">Capacidade: {room.capacity}</p>
    <p className="text-sm">{room.status!=="active"?"Indisponível":booking?(booking.status==="checked_in"?"Ocupado":"Reservado"):"Livre"}</p>
    {booking&&<><p className="text-sm">{booking.guest_name}</p><p className="text-xs">{day(booking.arrival_date)} até {day(booking.departure_date)}</p></>}
   </article>})}</div>
  </section>
  <section className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-medium">Próximas reservas</h2>
   <div className="space-y-2">{bookings.filter(b=>["reserved","checked_in"].includes(b.status)).slice(0,60).map(b=><div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
    <div className="text-sm"><strong>{b.room_code} · {b.guest_name}</strong><p>{day(b.arrival_date)} a {day(b.departure_date)} · {b.guest_count} hóspede(s) · {b.status}</p></div>
    <div className="flex gap-2">{b.status==="reserved"&&<><button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={()=>void action(b.id,"checkin")}>Check-in</button><button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={()=>void action(b.id,"cancel")}>Cancelar</button></>}{b.status==="checked_in"&&<button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={()=>void action(b.id,"checkout")}>Check-out</button>}</div>
   </div>)}</div>
  </section>
  <section className="rounded-lg border p-4"><h2 className="mb-3 text-lg font-medium">Ocupação nos próximos sete dias</h2>
   <div className="grid grid-cols-2 gap-2 md:grid-cols-7">{gridDays.map((label,i)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+i);const iso=d.toISOString().slice(0,10);const count=bookings.filter(b=>day(b.arrival_date)<=iso&&day(b.departure_date)>iso&&["reserved","checked_in"].includes(b.status)).length;return <div key={iso} className="rounded border p-2 text-center text-sm"><strong>{label}</strong><p>{count} / {rooms.filter(r=>r.status==="active").length}</p></div>})}</div>
  </section>
 </main>;
}
