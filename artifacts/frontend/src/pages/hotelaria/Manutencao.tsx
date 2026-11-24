import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ClipboardList, RefreshCw, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HotelSectorNav from "./HotelSectorNav";

type Room = { id: string; code: string; name: string; category: string; status: string; housekeeping_status: string };
type Event = { event_type: string; previous_status: string; new_status: string; notes: string | null; created_by: string; created_at: string };

const HOUSEKEEPING: Record<string, string> = {
  clean: "Limpo",
  dirty: "Sujo",
  cleaning: "Em limpeza",
  inspection: "Em inspeção",
};
const STATUS: Record<string, string> = {
  active: "Disponível",
  maintenance: "Em manutenção",
  inactive: "Inativo",
};

export default function Manutencao() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState<"all" | "maintenance" | "pending">("all");
  const [selected, setSelected] = useState<Room | null>(null);
  const [history, setHistory] = useState<Event[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ""}` }), [token]);
  const base = tenantId ? `/api/tenants/${encodeURIComponent(tenantId)}/hotelaria/hospedagem` : "";

  const loadRooms = useCallback(async () => {
    if (!tenantId || !token) return;
    try {
      const response = await fetch(`${base}/quartos`, { headers, cache: "no-store" });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível carregar os quartos.");
      setRooms(body as Room[]);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    }
  }, [base, headers, tenantId, token]);

  const loadHistory = useCallback(async (room: Room) => {
    try {
      const response = await fetch(`${base}/quartos/${encodeURIComponent(room.id)}/historico`, { headers, cache: "no-store" });
      const body = await response.json().catch(() => []);
      setHistory(response.ok ? body as Event[] : []);
    } catch {
      setHistory([]);
    }
  }, [base, headers]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);
  useEffect(() => { if (selected) void loadHistory(selected); }, [selected, loadHistory]);

  async function operation(room: Room, action: "maintenance" | "release" | "dirty" | "cleaning" | "inspection" | "clean") {
    if (!window.confirm("Confirmar esta alteração no quarto?")) return;
    setBusy(true);
    setErro(null);
    try {
      const response = await fetch(`${base}/quartos/${encodeURIComponent(room.id)}/operacao`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Operação não permitida.");
      await loadRooms();
      setSelected((current) => current?.id === room.id
        ? { ...current, status: body.status ?? current.status, housekeeping_status: body.housekeepingStatus ?? current.housekeeping_status }
        : current);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const visible = rooms.filter((room) => {
    if (filter === "maintenance") return room.status === "maintenance";
    if (filter === "pending") return room.housekeeping_status !== "clean";
    return true;
  });

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <HotelSectorNav />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/hotelaria" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Hotelaria</Link>
          <h1 className="mt-2 text-2xl font-semibold">Manutenção e governança</h1>
          <p className="text-sm text-muted-foreground">Disponibilidade dos quartos, limpeza, inspeção e histórico auditável.</p>
        </div>
        <button type="button" onClick={() => void loadRooms()} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </header>

      {erro && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      <div className="flex flex-wrap gap-2">
        {([["all", "Todos"], ["maintenance", "Em manutenção"], ["pending", "Limpeza pendente"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md border px-3 py-1.5 text-sm ${filter === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">{visible.length} quarto(s)</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="grid gap-3 sm:grid-cols-2">
          {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum quarto neste filtro.</p>}
          {visible.map((room) => (
            <article key={room.id} className={`rounded-xl border p-4 ${selected?.id === room.id ? "ring-2 ring-primary" : ""}`}>
              <button type="button" className="w-full text-left" onClick={() => setSelected(room)}>
                <div className="flex items-center justify-between gap-2">
                  <strong>{room.code} · {room.name}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${room.status === "maintenance" ? "bg-amber-100 text-amber-900" : room.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}`}>{STATUS[room.status] ?? room.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{room.category} · Limpeza: {HOUSEKEEPING[room.housekeeping_status] ?? room.housekeeping_status}</p>
              </button>
              <div className="mt-3 flex flex-wrap gap-1">
                {room.status === "active" ? (
                  <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "maintenance")}><Wrench className="mr-1 inline h-3 w-3" />Manutenção</button>
                ) : room.status === "maintenance" ? (
                  <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "release")}>Liberar manutenção</button>
                ) : null}
                {room.status === "active" && (
                  <>
                    {room.housekeeping_status !== "dirty" && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "dirty")}>Sujar</button>}
                    {room.housekeeping_status !== "cleaning" && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "cleaning")}>Em limpeza</button>}
                    {room.housekeeping_status !== "inspection" && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "inspection")}>Inspeção</button>}
                    {room.housekeeping_status !== "clean" && <button type="button" disabled={busy} className="rounded border px-2 py-1 text-xs" onClick={() => void operation(room, "clean")}>Liberar limpeza</button>}
                  </>
                )}
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setSelected(room)}><ClipboardList className="mr-1 inline h-3 w-3" />Histórico</button>
              </div>
            </article>
          ))}
        </section>

        <aside className="rounded-xl border p-4">
          <h2 className="font-semibold">Histórico do quarto</h2>
          {!selected && <p className="mt-2 text-sm text-muted-foreground">Selecione um quarto para ver as operações.</p>}
          {selected && <>
            <p className="mt-1 text-sm text-muted-foreground">{selected.code} · {selected.name}</p>
            {history.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma operação registrada.</p>}
            <div className="mt-3 max-h-[520px] space-y-2 overflow-auto">
              {history.map((event, index) => (
                <div key={`${event.created_at}-${index}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{event.event_type}</strong>
                    <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.previous_status} → {event.new_status}{event.notes ? ` · ${event.notes}` : ""}</p>
                </div>
              ))}
            </div>
          </>}
        </aside>
      </div>
    </main>
  );
}
