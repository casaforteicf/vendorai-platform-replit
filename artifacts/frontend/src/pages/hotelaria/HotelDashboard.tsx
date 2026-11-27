import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { BedDouble, CalendarDays, ChevronRight, ClipboardList, ReceiptText, Upload, UtensilsCrossed, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HotelSectorNav from "./HotelSectorNav";

type Room = { id: string; status: string; housekeeping_status: string };
type Booking = { id: string; status: string; arrival_date: string; departure_date: string };
type Folio = { folio_id: string; balance: string; reservation_status: string };
type Ficha = { id: string; ativo: boolean };
type Cardapio = { id: string };

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const day = (value: string) => String(value).slice(0, 10);

export default function HotelDashboard() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [folios, setFolios] = useState<Folio[]>([]);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}` }), [token]);

  useEffect(() => {
    if (!tenantId || !token) return;
    let cancelled = false;
    const base = `/api/tenants/${encodeURIComponent(tenantId)}`;
    async function load<T>(path: string, fallback: T): Promise<T> {
      try {
        const response = await fetch(`${base}${path}`, { headers, cache: "no-store" });
        if (!response.ok) return fallback;
        return await response.json() as T;
      } catch {
        return fallback;
      }
    }
    void Promise.all([
      load<Room[]>("/hotelaria/hospedagem/quartos", []),
      load<Booking[]>("/hotelaria/hospedagem/reservas", []),
      load<Folio[]>("/hotelaria/hospedagem/contas", []),
      load<{ fichas: Ficha[] }>("/ab/fichas-tecnicas", { fichas: [] }),
      load<{ cardapios: Cardapio[] }>(`/ab/cardapios?data=${today()}`, { cardapios: [] }),
    ]).then(([roomList, bookingList, folioList, fichaList, menuList]) => {
      if (cancelled) return;
      setRooms(roomList);
      setBookings(bookingList);
      setFolios(folioList);
      setFichas(fichaList.fichas ?? []);
      setCardapios(menuList.cardapios ?? []);
    }).catch((error) => {
      if (!cancelled) setErro(String(error));
    });
    return () => { cancelled = true; };
  }, [headers, tenantId, token]);

  const activeRooms = rooms.filter((room) => room.status === "active");
  const occupiedToday = bookings.filter((booking) => day(booking.arrival_date) <= today()
    && day(booking.departure_date) > today()
    && ["reserved", "checked_in"].includes(booking.status));
  const maintenanceRooms = rooms.filter((room) => room.status === "maintenance");
  const dirtyRooms = rooms.filter((room) => room.housekeeping_status !== "clean");
  const openFolios = folios.filter((folio) => ["reserved", "checked_in"].includes(folio.reservation_status));
  const openBalance = openFolios.reduce((sum, folio) => sum + Number(folio.balance ?? 0), 0);
  const activeFichas = fichas.filter((ficha) => ficha.ativo).length;

  const cards = [
    {
      href: "/hotelaria/hospedagem",
      icon: BedDouble,
      title: "Hospedagem",
      description: "Reservas, quartos, hóspedes, conta e check-in/check-out.",
      stats: [`${occupiedToday.length} ocupado(s) hoje`, `${activeRooms.length} quarto(s) ativo(s)`, `${openFolios.length} conta(s) aberta(s)`],
    },
    {
      href: "/hotelaria/diarias",
      icon: ReceiptText,
      title: "Diárias",
      description: "Planos tarifários, períodos especiais e cotações por noite.",
      stats: ["Tarifas por categoria", "Cálculo por período", "Sem cobrança automática"],
    },
    {
      href: "/hotelaria/restaurante",
      icon: UtensilsCrossed,
      title: "Restaurante",
      description: "Receitas, ingredientes, cardápios, briffing, compras e CMV.",
      stats: [`${activeFichas} ficha(s) ativa(s)`, `${cardapios.length} cardápio(s) hoje`, "A&B completo"],
    },
    {
      href: "/hotelaria/escalas",
      icon: CalendarDays,
      title: "Escalas",
      description: "Equipe, folgas, ocupação, metas por turno, extras e cobertura.",
      stats: ["5x2, 12x36 e parcial", "Metas por Pax", "Histórico versionado"],
    },
    {
      href: "/hotelaria/manutencao",
      icon: Wrench,
      title: "Manutenção",
      description: "Quartos em manutenção, governança e histórico de operações.",
      stats: [`${maintenanceRooms.length} em manutenção`, `${dirtyRooms.length} pendente(s) de limpeza`, "Histórico auditável"],
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <HotelSectorNav />
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hotelaria</p>
        <h1 className="text-3xl font-semibold tracking-tight">Painel da Hotelaria</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Escolha o setor. Hospedagem e diárias cuidam da estadia; o Restaurante concentra receitas,
          ingredientes, cardápios e A&amp;B; a Manutenção cuida da disponibilidade dos quartos.
        </p>
      </header>

      {erro && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{erro}</div>}

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{card.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{card.description}</p>
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {card.stats.map((stat) => <li key={stat}>• {stat}</li>)}
              </ul>
            </Link>
          );
        })}
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumo financeiro da estadia</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Contas abertas</p>
            <p className="mt-1 text-2xl font-semibold">{openFolios.length}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Saldo em aberto</p>
            <p className="mt-1 text-2xl font-semibold">R$ {openBalance.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Quartos para limpar/inspecionar</p>
            <p className="mt-1 text-2xl font-semibold">{dirtyRooms.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ações rápidas</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/hotelaria/hospedagem" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <CalendarDays className="h-4 w-4" /> Nova reserva / check-in
          </Link>
          <Link href="/hotelaria/restaurante/cardapios" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <ClipboardList className="h-4 w-4" /> Novo cardápio
          </Link>
          <Link href="/hotelaria/restaurante/importar" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> Importar receitas
          </Link>
          <Link href="/hotelaria/manutencao" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
            <Wrench className="h-4 w-4" /> Abrir manutenção
          </Link>
        </div>
      </section>
    </main>
  );
}
