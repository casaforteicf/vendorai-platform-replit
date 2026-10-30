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
 const [roomCode,setRoomCode]=useState(""),[roomName,setRoomName]=useState(""),[roomCapacity,setRoomCapacity]=useState(2);
 const [guestName,setGuestName]=useState(""),[guestEmail,setGuestEmail]=useState(""),[guestPhone,setGuestPhone]=useState("");
 const [guestId,setGuestId]=useState(""),[roomId,setRoomId]=useState(""),[arrival,setArrival]=useState(today()),[departure,setDeparture]=useState(""),[guestCount,setGuestCount]=useState(1);
 const [guests,setGuests]=useState<{id:string;full_name:string}[]>([]);

 const base=tenantId?`/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/hospedagem`:"";
 async function api<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options?.body?{"Content-Type":"application/json"}:{}),...options?.headers}});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.error??`HTTP ${response.status}`);
  return data as T;
 }
 async function load(){
  if(!tenantId||!token)return;
  try{const [r,b,g]=await Promise.all([api<Room[]>("/quartos"),api<Booking[]>("/reservas"),api<{id:string;full_name:string}[]>("/hospedes")]);setRooms(r);setBookings(b);setGuests(g);}
  catch(e){setMessage(String(e));}
 }
 useEffect(()=>{void load();},[tenantId,token]);
 async function submit(path:string,body:Record<string,unknown>,success:string){
  setBusy(true);setMessage("");
  try{await api(path,{method:"POST",body:JSON.stringify(body)});await load();setMessage(success);}
  catch(e){setMessage(String(e));}finally{setBusy(false);}
 }
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
  <div className="grid gap-4 lg:grid-cols-3">
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void submit("/quartos",{code:roomCode.trim(),name:roomName.trim(),capacity:roomCapacity},"Apartamento cadastrado.");}}>
    <h2 className="font-semibold">Cadastrar apartamento</h2>
    <input required maxLength={32} className="w-full rounded border p-2" placeholder="Número / código" value={roomCode} onChange={e=>setRoomCode(e.target.value)}/>
    <input required maxLength={100} className="w-full rounded border p-2" placeholder="Nome" value={roomName} onChange={e=>setRoomName(e.target.value)}/>
    <label className="block text-sm">Capacidade<input type="number" min={1} max={30} required className="w-full rounded border p-2" value={roomCapacity} onChange={e=>setRoomCapacity(Number(e.target.value))}/></label>
    <button disabled={busy} className="rounded border px-3 py-2">Cadastrar apartamento</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void submit("/hospedes",{fullName:guestName.trim(),...(guestEmail.trim()?{contactEmail:guestEmail.trim()}:{}),...(guestPhone.trim()?{contactPhone:guestPhone.trim()}:{} )},"Hóspede cadastrado.");}}>
    <h2 className="font-semibold">Cadastrar hóspede</h2>
    <input required minLength={2} maxLength={180} className="w-full rounded border p-2" placeholder="Nome completo" value={guestName} onChange={e=>setGuestName(e.target.value)}/>
    <input type="email" className="w-full rounded border p-2" placeholder="E-mail (opcional)" value={guestEmail} onChange={e=>setGuestEmail(e.target.value)}/>
    <input className="w-full rounded border p-2" placeholder="Telefone (opcional)" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)}/>
    <button disabled={busy} className="rounded border px-3 py-2">Cadastrar hóspede</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();if(departure<=arrival){setMessage("A saída deve ser posterior à entrada.");return;}void submit("/reservas",{roomId,guestId,arrivalDate:arrival,departureDate:departure,guestCount},"Reserva criada.");}}>
    <h2 className="font-semibold">Nova reserva</h2>
    <select required className="w-full rounded border p-2" value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Selecione o apartamento</option>{rooms.filter(r=>r.status==="active").map(r=><option value={r.id} key={r.id}>{r.code} · {r.name} ({r.capacity} pessoas)</option>)}</select>
    <select required className="w-full rounded border p-2" value={guestId} onChange={e=>setGuestId(e.target.value)}><option value="">Selecione o hóspede</option>{guests.map(g=><option value={g.id} key={g.id}>{g.full_name}</option>)}</select>
    <label className="block text-sm">Entrada<input required type="date" className="w-full rounded border p-2" value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
    <label className="block text-sm">Saída<input required type="date" className="w-full rounded border p-2" value={departure} min={arrival} onChange={e=>setDeparture(e.target.value)}/></label>
    <label className="block text-sm">Número de hóspedes<input required type="number" min={1} max={rooms.find(r=>r.id===roomId)?.capacity??30} className="w-full rounded border p-2" value={guestCount} onChange={e=>setGuestCount(Number(e.target.value))}/></label>
    <button disabled={busy} className="rounded border px-3 py-2">Confirmar reserva</button>
   </form>
  </div>
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
