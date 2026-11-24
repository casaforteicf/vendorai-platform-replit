import HotelModulesNav from "./HotelModulesNav";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ForecastDay = { service_date: string; checked_in_guests: number; reserved_guests: number; occupied_or_reserved_rooms: number };
type Room = { id: string; code: string; name: string; capacity: number; category: string; status: string; housekeeping_status: string };
type RatePlan = { id: string; name: string; currency: string; standard_amount: string; extra_guest_amount: string; room_category: string | null; active: boolean };
type Booking = {
  id: string;
  room_id: string;
  primary_guest_id: string;
  room_code: string;
  room_category?: string;
  guest_name: string;
  arrival_date: string;
  departure_date: string;
  guest_count: number;
  status: string;
  rate_plan_id?: string | null;
  total_amount?: string;
  currency?: string;
  folio_id?: string | null;
  folio_status?: string | null;
  folio_balance?: string | null;
};
type FolioItem = { id: string; kind: "room" | "extra" | "discount" | "tax"; description: string; service_date: string | null; quantity: string; unit_amount: string; total_amount: string };
type FolioPayment = { id: string; method: string; amount: string; notes: string | null; paid_at: string };
type Folio = { id: string; status: "open" | "closed"; currency: string; charges_total: string; payments_total: string; balance: string };
type FolioDetail = { reservation: Booking; folio: Folio | null; items: FolioItem[]; payments: FolioPayment[] };

const day = (value: string) => String(value).slice(0, 10);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const brl = (value: string | number | null | undefined) => `R$ ${Number(value ?? 0).toFixed(2)}`;
const nightsBetween = (arrival: string, departure: string) => {
  if (!arrival || !departure) return 0;
  return Math.max(0, Math.round((Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86400000));
};
const mealLabels: Record<string, string> = {
  extra: "Extra",
  discount: "Desconto",
  tax: "Imposto/taxa",
  room: "Diária",
};
const paymentLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  transfer: "Transferência",
  other: "Outro",
};

export default function HotelRecepcao() {
  const { token, user } = useAuth();
  const tenantId = user?.tenantId;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [guests, setGuests] = useState<{ id: string; full_name: string }[]>([]);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState(today());
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState(2);
  const [roomCategory, setRoomCategory] = useState("standard");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [guestId, setGuestId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [arrival, setArrival] = useState(today());
  const [departure, setDeparture] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [ratePlanId, setRatePlanId] = useState("");
  const [nightlyAmount, setNightlyAmount] = useState("");

  const [folioDetail, setFolioDetail] = useState<FolioDetail | null>(null);
  const [itemKind, setItemKind] = useState<"extra" | "discount" | "tax">("extra");
  const [itemDescription, setItemDescription] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemUnitAmount, setItemUnitAmount] = useState("");
  const [itemDate, setItemDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/hospedagem` : "";
  const ratesUrl = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/tarifas` : "";

  async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path.startsWith("/api/") ? path : base + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error ?? `HTTP ${response.status}`) as Error & { data?: Record<string, unknown>; status?: number };
      error.data = data ?? undefined;
      error.status = response.status;
      throw error;
    }
    return data as T;
  }

  async function load() {
    if (!tenantId || !token) return;
    try {
      const [roomList, bookingList, guestList, planList] = await Promise.all([
        api<Room[]>("/quartos"),
        api<Booking[]>("/reservas"),
        api<{ id: string; full_name: string }[]>("/hospedes"),
        api<RatePlan[]>(ratesUrl).catch(() => [] as RatePlan[]),
      ]);
      setRooms(roomList);
      setBookings(bookingList);
      setGuests(guestList);
      setRatePlans(planList.filter((plan) => plan.active));
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, token]);

  async function loadForecast() {
    if (!tenantId || !token || !date) return;
    const end = new Date(`${date}T12:00:00`);
    end.setDate(end.getDate() + 6);
    try {
      const data = await api<{ days: ForecastDay[] }>(`/previsao-refeicoes?start=${encodeURIComponent(date)}&end=${end.toISOString().slice(0, 10)}`);
      setForecast(data.days);
    } catch (error) {
      setMessage(String(error));
    }
  }

  useEffect(() => {
    void loadForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, token, date, bookings]);

  async function findAvailability() {
    if (!arrival || !departure || departure <= arrival) {
      setMessage("Escolha datas válidas.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const category = rooms.find((room) => room.id === roomId)?.category;
      const query = new URLSearchParams({ arrivalDate: arrival, departureDate: departure, guestCount: String(guestCount) });
      if (category) query.set("category", category);
      const data = await api<{ rooms: Room[] }>(`/disponibilidade?${query.toString()}`);
      setAvailableRooms(data.rooms);
      if (!data.rooms.some((room) => room.id === roomId)) {
        setRoomId("");
        setRatePlanId("");
      }
    } catch (error) {
      setAvailableRooms(null);
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit(path: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await load();
      if (path === "/reservas") setAvailableRooms(null);
      setMessage(success);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function roomOperation(id: string, operation: "dirty" | "cleaning" | "inspection" | "clean" | "maintenance" | "release") {
    if (!window.confirm("Confirmar alteração da situação do apartamento?")) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/quartos/${encodeURIComponent(id)}/operacao`, { method: "POST", body: JSON.stringify({ action: operation }) });
      await load();
      setMessage("Situação do apartamento atualizada e registrada no histórico.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function action(booking: Booking, kind: "checkin" | "checkout" | "cancel") {
    if (!window.confirm("Confirmar esta alteração na hospedagem?")) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/reservas/${encodeURIComponent(booking.id)}/${kind}`, { method: "POST" });
      await load();
      if (folioDetail?.reservation.id === booking.id) await loadFolio(booking.id);
      setMessage("Hospedagem atualizada.");
    } catch (error) {
      setMessage(String(error));
      if (kind === "checkout") await loadFolio(booking.id);
    } finally {
      setBusy(false);
    }
  }

  async function loadFolio(bookingId: string) {
    if (!tenantId || !token) return;
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(bookingId)}/conta`);
      setFolioDetail(data);
      setPaymentAmount(data.folio?.balance && Number(data.folio.balance) > 0 ? Number(data.folio.balance).toFixed(2) : "");
    } catch (error) {
      setMessage(String(error));
    }
  }

  async function addItem() {
    if (!folioDetail) return;
    const quantity = Number(itemQuantity.replace(",", "."));
    const unitAmount = Number(itemUnitAmount.replace(",", "."));
    if (!itemDescription.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitAmount) || unitAmount < 0) {
      setMessage("Informe descrição, quantidade e valor do item.");
      return;
    }
    setBusy(true);
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(folioDetail.reservation.id)}/conta/itens`, {
        method: "POST",
        body: JSON.stringify({
          kind: itemKind,
          description: itemDescription.trim(),
          quantity,
          unitAmount,
          ...(itemDate ? { serviceDate: itemDate } : {}),
        }),
      });
      setFolioDetail(data);
      setItemDescription("");
      setItemQuantity("1");
      setItemUnitAmount("");
      setMessage("Item lançado na conta.");
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!folioDetail || !window.confirm("Remover este item da conta?")) return;
    setBusy(true);
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(folioDetail.reservation.id)}/conta/itens/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      setFolioDetail(data);
      setMessage("Item removido da conta.");
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function addPayment() {
    if (!folioDetail) return;
    const amount = Number(paymentAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor de pagamento maior que zero.");
      return;
    }
    setBusy(true);
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(folioDetail.reservation.id)}/conta/pagamentos`, {
        method: "POST",
        body: JSON.stringify({ method: paymentMethod, amount, ...(paymentNotes.trim() ? { notes: paymentNotes.trim() } : {}) }),
      });
      setFolioDetail(data);
      setPaymentAmount("");
      setPaymentNotes("");
      setMessage("Pagamento registrado na conta.");
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(paymentId: string) {
    if (!folioDetail || !window.confirm("Remover este pagamento?")) return;
    setBusy(true);
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(folioDetail.reservation.id)}/conta/pagamentos/${encodeURIComponent(paymentId)}`, { method: "DELETE" });
      setFolioDetail(data);
      setMessage("Pagamento removido.");
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  async function closeFolio() {
    if (!folioDetail || !window.confirm("Fechar a conta? Depois disso ela não aceita novos lançamentos.")) return;
    setBusy(true);
    try {
      const data = await api<FolioDetail>(`/reservas/${encodeURIComponent(folioDetail.reservation.id)}/conta/fechar`, { method: "POST" });
      setFolioDetail(data);
      setMessage("Conta fechada.");
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  const visible = bookings.filter((booking) => day(booking.arrival_date) <= date && day(booking.departure_date) > date && ["reserved", "checked_in"].includes(booking.status));
  const gridDays = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + index);
    return value.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  });
  const stayNights = nightsBetween(arrival, departure);
  const selectedRoom = (availableRooms ?? rooms).find((room) => room.id === roomId);
  const eligiblePlans = selectedRoom
    ? ratePlans.filter((plan) => !plan.room_category || plan.room_category.toLowerCase() === selectedRoom.category.toLowerCase())
    : ratePlans;
  const manualTotal = nightlyAmount && stayNights > 0 ? Number(nightlyAmount.replace(",", ".")) * stayNights : null;

  return <main className="space-y-5 p-4 md:p-6">
    <HotelModulesNav />
    <header>
      <h1 className="text-2xl font-semibold">Recepção · Hotelaria</h1>
      <p className="text-sm text-muted-foreground">Mapa de ocupação, reservas, conta, pagamentos e check-out do hotel atual.</p>
    </header>
    {message && <div role="status" className="rounded-md border p-3 text-sm">{message}</div>}

    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="hotel-occupancy-date">Data de consulta</label>
      <input id="hotel-occupancy-date" className="rounded-md border p-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <span className="text-sm text-muted-foreground">{visible.length} apartamento(s) ocupado(s) ou reservado(s) · {rooms.length} cadastrados</span>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
        event.preventDefault();
        void submit("/quartos", { code: roomCode.trim(), name: roomName.trim(), capacity: roomCapacity, category: roomCategory.trim() || "standard" }, "Apartamento cadastrado.");
      }}>
        <h2 className="font-semibold">Cadastrar apartamento</h2>
        <input required maxLength={32} className="w-full rounded border p-2" placeholder="Número / código" value={roomCode} onChange={(event) => setRoomCode(event.target.value)} />
        <input required maxLength={100} className="w-full rounded border p-2" placeholder="Nome" value={roomName} onChange={(event) => setRoomName(event.target.value)} />
        <label className="block text-sm">Capacidade<input type="number" min={1} max={30} required className="w-full rounded border p-2" value={roomCapacity} onChange={(event) => setRoomCapacity(Number(event.target.value))} /></label>
        <label className="block text-sm">Categoria<input maxLength={40} className="w-full rounded border p-2" placeholder="standard, luxo, suíte..." value={roomCategory} onChange={(event) => setRoomCategory(event.target.value)} /></label>
        <button disabled={busy} className="rounded border px-3 py-2">Cadastrar apartamento</button>
      </form>

      <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
        event.preventDefault();
        void submit("/hospedes", { fullName: guestName.trim(), ...(guestEmail.trim() ? { contactEmail: guestEmail.trim() } : {}), ...(guestPhone.trim() ? { contactPhone: guestPhone.trim() } : {}) }, "Hóspede cadastrado.");
      }}>
        <h2 className="font-semibold">Cadastrar hóspede</h2>
        <input required minLength={2} maxLength={180} className="w-full rounded border p-2" placeholder="Nome completo" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
        <input type="email" className="w-full rounded border p-2" placeholder="E-mail (opcional)" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
        <input className="w-full rounded border p-2" placeholder="Telefone (opcional)" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} />
        <button disabled={busy} className="rounded border px-3 py-2">Cadastrar hóspede</button>
      </form>

      <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
        event.preventDefault();
        if (departure <= arrival) {
          setMessage("A saída deve ser posterior à entrada.");
          return;
        }
        if (!ratePlanId && !nightlyAmount) {
          setMessage("Escolha uma tarifa ou informe o valor manual da diária.");
          return;
        }
        void submit("/reservas", {
          roomId,
          guestId,
          arrivalDate: arrival,
          departureDate: departure,
          guestCount,
          ...(ratePlanId ? { ratePlanId } : { nightlyAmount: Number(nightlyAmount.replace(",", ".")) }),
        }, "Reserva criada com conta e diárias.");
      }}>
        <h2 className="font-semibold">Nova reserva</h2>
        <select required className="w-full rounded border p-2" value={roomId} onChange={(event) => { setRoomId(event.target.value); setRatePlanId(""); setAvailableRooms(null); }}>
          <option value="">Selecione o apartamento</option>
          {(availableRooms ?? rooms.filter((room) => room.status === "active")).map((room) => (
            <option value={room.id} key={room.id}>{room.code} · {room.name} · {room.category} ({room.capacity} pessoas)</option>
          ))}
        </select>
        <select required className="w-full rounded border p-2" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
          <option value="">Selecione o hóspede</option>
          {guests.map((guest) => <option value={guest.id} key={guest.id}>{guest.full_name}</option>)}
        </select>
        <label className="block text-sm">Entrada<input required type="date" className="w-full rounded border p-2" value={arrival} onChange={(event) => { setArrival(event.target.value); setAvailableRooms(null); }} /></label>
        <label className="block text-sm">Saída<input required type="date" className="w-full rounded border p-2" value={departure} min={arrival} onChange={(event) => { setDeparture(event.target.value); setAvailableRooms(null); }} /></label>
        <label className="block text-sm">Número de hóspedes<input required type="number" min={1} max={selectedRoom?.capacity ?? 30} className="w-full rounded border p-2" value={guestCount} onChange={(event) => { setGuestCount(Number(event.target.value)); setAvailableRooms(null); }} /></label>
        <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => void findAvailability()}>Consultar disponibilidade</button>
        <p className="text-xs text-muted-foreground">{availableRooms === null ? "Verifique as datas e consulte a disponibilidade antes de reservar." : `${availableRooms.length} apartamento(s) disponível(is) no período.`}</p>

        <label className="block text-sm">Tarifa
          <select className="w-full rounded border p-2" value={ratePlanId} onChange={(event) => setRatePlanId(event.target.value)}>
            <option value="">Sem tarifa (valor manual)</option>
            {eligiblePlans.map((plan) => (
              <option value={plan.id} key={plan.id}>
                {plan.name} — {brl(plan.standard_amount)}/noite + {brl(plan.extra_guest_amount)}/hóspede{plan.room_category ? ` · ${plan.room_category}` : ""}
              </option>
            ))}
          </select>
        </label>
        {!ratePlanId && (
          <label className="block text-sm">Valor manual da diária (R$)
            <input type="number" min="0" step=".01" className="w-full rounded border p-2" value={nightlyAmount} onChange={(event) => setNightlyAmount(event.target.value)} />
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          {stayNights > 0 ? `${stayNights} noite(s). ` : ""}
          {ratePlanId ? "O total final é calculado pelo servidor com os períodos especiais." : manualTotal !== null ? `Total manual: ${brl(manualTotal)}.` : "Informe a tarifa ou o valor manual."}
        </p>
        <button disabled={busy || availableRooms === null || !availableRooms.some((room) => room.id === roomId)} className="rounded border px-3 py-2">Confirmar reserva</button>
      </form>
    </div>

    {folioDetail && (
      <section className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Conta da hospedagem · {folioDetail.reservation.room_code} · {folioDetail.reservation.guest_name}</h2>
            <p className="text-sm text-muted-foreground">
              {day(folioDetail.reservation.arrival_date)} a {day(folioDetail.reservation.departure_date)} · {folioDetail.reservation.guest_count} hóspede(s) · reserva {folioDetail.reservation.status}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={() => void loadFolio(folioDetail.reservation.id)}>Atualizar</button>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setFolioDetail(null)}>Fechar painel</button>
          </div>
        </div>

        {!folioDetail.folio && <p className="text-sm">Esta reserva ainda não tem conta.</p>}

        {folioDetail.folio && (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded border p-3"><span className="text-xs text-muted-foreground">Lançamentos</span><p className="text-lg font-semibold">{brl(folioDetail.folio.charges_total)}</p></div>
              <div className="rounded border p-3"><span className="text-xs text-muted-foreground">Pagamentos</span><p className="text-lg font-semibold">{brl(folioDetail.folio.payments_total)}</p></div>
              <div className="rounded border p-3"><span className="text-xs text-muted-foreground">Saldo</span><p className={`text-lg font-semibold ${Number(folioDetail.folio.balance) > 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(folioDetail.folio.balance)}</p></div>
            </div>

            <div>
              <h3 className="mb-2 font-medium">Lançamentos</h3>
              <div className="space-y-1">
                {folioDetail.items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>}
                {folioDetail.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
                    <span><strong>{mealLabels[item.kind] ?? item.kind}</strong> · {item.description} {item.service_date ? `· ${day(item.service_date)}` : ""} · {Number(item.quantity)} × {brl(item.unit_amount)}</span>
                    <span className="flex items-center gap-3">
                      <strong>{brl(item.total_amount)}</strong>
                      {folioDetail.folio?.status === "open" && item.kind !== "room" && (
                        <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void removeItem(item.id)}>Remover</button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {folioDetail.folio.status === "open" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <form className="space-y-2 rounded border p-3" onSubmit={(event) => { event.preventDefault(); void addItem(); }}>
                  <h3 className="font-medium">Lançar extra, desconto ou imposto</h3>
                  <select className="w-full rounded border p-2" value={itemKind} onChange={(event) => setItemKind(event.target.value as "extra" | "discount" | "tax")}>
                    <option value="extra">Extra</option>
                    <option value="discount">Desconto</option>
                    <option value="tax">Imposto/taxa</option>
                  </select>
                  <input required maxLength={180} className="w-full rounded border p-2" placeholder="Descrição" value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">Quantidade<input type="number" min="0.01" step=".01" className="w-full rounded border p-2" value={itemQuantity} onChange={(event) => setItemQuantity(event.target.value)} /></label>
                    <label className="block text-sm">Valor unitário (R$)<input type="number" min="0" step=".01" className="w-full rounded border p-2" value={itemUnitAmount} onChange={(event) => setItemUnitAmount(event.target.value)} /></label>
                  </div>
                  <label className="block text-sm">Data do serviço<input type="date" className="w-full rounded border p-2" value={itemDate} onChange={(event) => setItemDate(event.target.value)} /></label>
                  <button disabled={busy} className="rounded border px-3 py-2">Lançar na conta</button>
                </form>

                <form className="space-y-2 rounded border p-3" onSubmit={(event) => { event.preventDefault(); void addPayment(); }}>
                  <h3 className="font-medium">Registrar pagamento</h3>
                  <select className="w-full rounded border p-2" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    {Object.entries(paymentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  <label className="block text-sm">Valor (R$)<input required type="number" min="0.01" step=".01" className="w-full rounded border p-2" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
                  <input maxLength={500} className="w-full rounded border p-2" placeholder="Observação (opcional)" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
                  <button disabled={busy} className="rounded border px-3 py-2">Registrar pagamento</button>
                </form>
              </div>
            )}

            <div>
              <h3 className="mb-2 font-medium">Pagamentos</h3>
              {folioDetail.payments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>}
              {folioDetail.payments.map((payment) => (
                <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
                  <span><strong>{paymentLabels[payment.method] ?? payment.method}</strong> · {new Date(payment.paid_at).toLocaleString("pt-BR")} {payment.notes ? `· ${payment.notes}` : ""}</span>
                  <span className="flex items-center gap-3">
                    <strong>{brl(payment.amount)}</strong>
                    {folioDetail.folio?.status === "open" && (
                      <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void removePayment(payment.id)}>Remover</button>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {folioDetail.folio.status === "open" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={() => void closeFolio()}>Fechar conta</button>
                <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={() => void action(folioDetail.reservation, "checkout")}>Fechar conta e check-out</button>
              </div>
            )}
            {folioDetail.folio.status === "closed" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">Conta fechada.</p>
                {folioDetail.reservation.status === "checked_in" && (
                  <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={() => void action(folioDetail.reservation, "checkout")}>Fazer check-out</button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    )}

    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-medium">Mapa de apartamentos</h2>
      {rooms.length === 0 && <p>Nenhum apartamento cadastrado.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rooms.map((room) => {
          const booking = visible.find((candidate) => candidate.room_id === room.id);
          return <article key={room.id} className="rounded-lg border p-3">
            <strong>{room.code} · {room.name}</strong>
            <p className="text-sm">Categoria: {room.category} · Capacidade: {room.capacity}</p>
            <p className="text-sm">{room.status !== "active" ? "Indisponível" : booking ? (booking.status === "checked_in" ? "Ocupado" : "Reservado") : "Livre"}</p>
            <p className="text-sm">Limpeza: {room.housekeeping_status}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {room.status === "active" && <>
                {(["dirty", "cleaning", "inspection", "clean"] as const).filter((operation) => operation !== room.housekeeping_status).map((operation) => (
                  <button key={operation} type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void roomOperation(room.id, operation)}>
                    {({ dirty: "Sinalizar sujo", cleaning: "Em limpeza", inspection: "Inspeção", clean: "Liberar limpeza" })[operation]}
                  </button>
                ))}
                {!booking && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void roomOperation(room.id, "maintenance")}>Manutenção</button>}
              </>}
              {room.status === "maintenance" && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void roomOperation(room.id, "release")}>Liberar manutenção</button>}
            </div>
            {booking && <>
              <p className="mt-2 text-sm">{booking.guest_name}</p>
              <p className="text-xs">{day(booking.arrival_date)} até {day(booking.departure_date)} · {booking.guest_count} hóspede(s)</p>
              <p className="text-xs">Total: {brl(booking.total_amount)}</p>
              <button type="button" disabled={busy} className="mt-2 rounded border px-2 py-1 text-xs" onClick={() => void loadFolio(booking.id)}>Abrir conta</button>
            </>}
          </article>;
        })}
      </div>
    </section>

    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-medium">Próximas reservas</h2>
      <div className="space-y-2">
        {bookings.filter((booking) => ["reserved", "checked_in"].includes(booking.status)).slice(0, 60).map((booking) => (
          <div key={booking.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
            <div className="text-sm">
              <strong>{booking.room_code} · {booking.guest_name}</strong>
              <p>{day(booking.arrival_date)} a {day(booking.departure_date)} · {booking.guest_count} hóspede(s) · {booking.status} · total {brl(booking.total_amount)}</p>
              {booking.folio_balance !== null && booking.folio_balance !== undefined && Number(booking.folio_balance) > 0 && (
                <p className="text-xs text-red-700">Conta em aberto: {brl(booking.folio_balance)}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => void loadFolio(booking.id)}>Conta</button>
              {booking.status === "reserved" && <>
                <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => void action(booking, "checkin")}>Check-in</button>
                <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => void action(booking, "cancel")}>Cancelar</button>
              </>}
              {booking.status === "checked_in" && (
                <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => void action(booking, "checkout")}>Check-out</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>

    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-medium">Previsão de hóspedes para refeições</h2>
      <p className="mb-3 text-sm text-muted-foreground">Estimativa pelas reservas e check-ins. Não cria cardápios nem refeições automaticamente; a quantidade de pessoas que efetivamente fará cada refeição deve ser conferida.</p>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-7">
        {forecast.map((value) => <div className="rounded border p-2 text-sm" key={value.service_date}>
          <strong>{value.service_date.slice(8, 10)}/{value.service_date.slice(5, 7)}</strong>
          <p>{value.checked_in_guests} hóspedes em check-in</p>
          <p>{value.reserved_guests} hóspedes previstos</p>
          <p>{value.checked_in_guests + value.reserved_guests} pessoas no total</p>
        </div>)}
      </div>
    </section>

    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-medium">Ocupação nos próximos sete dias</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
        {gridDays.map((label, index) => {
          const value = new Date(`${date}T12:00:00`);
          value.setDate(value.getDate() + index);
          const iso = value.toISOString().slice(0, 10);
          const count = bookings.filter((booking) => day(booking.arrival_date) <= iso && day(booking.departure_date) > iso && ["reserved", "checked_in"].includes(booking.status)).length;
          return <div key={iso} className="rounded border p-2 text-center text-sm">
            <strong>{label}</strong>
            <p>{count} / {rooms.filter((room) => room.status === "active").length}</p>
          </div>;
        })}
      </div>
    </section>
  </main>;
}
