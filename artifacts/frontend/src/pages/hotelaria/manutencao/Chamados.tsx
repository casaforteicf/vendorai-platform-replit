import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Filter, Plus, RefreshCw } from "lucide-react";
import type { MaintenanceApi, WorkOrder } from "./api";
import { Card, DueBadge, Empty, ErrorBox, Field, PriorityBadge, SectionTitle, StatusBadge, fmtDateTime, inputClass } from "./components";

const FILTERS = [
  { value: "abertos", label: "Em aberto" },
  { value: "todos", label: "Todos" },
  { value: "done", label: "Concluídos" },
] as const;

const emptyForm = {
  title: "", description: "", category: "Geral", priority: "normal", areaName: "", assignedTo: "", dueAt: "",
};

export default function Chamados({ api }: { api: MaintenanceApi }) {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("abertos");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = filter === "todos" ? "" : filter === "done" ? "?status=done" : "";
      const rows = await api.get<WorkOrder[]>(`/chamados${query}`);
      setOrders(filter === "abertos" ? rows.filter((row) => !["done", "cancelled"].includes(row.status)) : rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, filter]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Informe o título do chamado."); return; }
    setBusy(true); setError(null);
    try {
      await api.post("/chamados", {
        title: form.title,
        description: form.description || null,
        category: form.category || "Geral",
        priority: form.priority,
        areaName: form.areaName || null,
        assignedTo: form.assignedTo || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(order: WorkOrder, patch: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/chamados/${order.id}`, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function complete(order: WorkOrder) {
    const notes = window.prompt(`Concluir “${order.title}”. Observação (opcional):`, "");
    if (notes === null) return;
    void update(order, { status: "done", completionNotes: notes || null });
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Chamados e ordens de serviço"
          subtitle="Abra, atribua, acompanhe o prazo e conclua a manutenção."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo chamado</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}

        {showForm && (
          <form onSubmit={create} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Título" className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Ar-condicionado do quarto 204 pingando" required /></Field>
            <Field label="Categoria"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Climatização" /></Field>
            <Field label="Prioridade">
              <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Baixa</option><option value="normal">Média</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select>
            </Field>
            <Field label="Local / UH"><input className={inputClass} value={form.areaName} onChange={(e) => setForm({ ...form, areaName: e.target.value })} placeholder="UH 204, Restaurante, Piscina…" /></Field>
            <Field label="Responsável"><input className={inputClass} value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Técnico ou equipe" /></Field>
            <Field label="Prazo"><input type="datetime-local" className={inputClass} value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
            <Field label="Descrição" className="sm:col-span-2 lg:col-span-4"><textarea className={`${inputClass} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="O que precisa ser feito, sintomas e acesso ao local." /></Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Abrir chamado</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {FILTERS.map((option) => (
            <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === option.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{option.label}</button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{orders.length} chamado(s)</span>
        </div>

        {orders.length === 0 ? <Empty>Nenhum chamado neste filtro.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {orders.map((order) => (
              <article key={order.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{order.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{order.area_name ?? "Sem local"} · {order.category}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1"><StatusBadge value={order.status} /><PriorityBadge value={order.priority} /></div>
                </div>
                {order.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{order.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <DueBadge date={order.due_at} />
                  {order.assigned_to && <span>Responsável: {order.assigned_to}</span>}
                  <span>Aberto em {fmtDateTime(order.opened_at)}</span>
                  {order.asset_name && <span>Equipamento: {order.asset_name}</span>}
                </div>
                {order.status === "done" && order.completion_notes && <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-900">{order.completion_notes}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!["done", "cancelled"].includes(order.status) && (
                    <>
                      <select className="rounded-md border bg-background px-2 py-1 text-xs" value={order.status} onChange={(e) => void update(order, { status: e.target.value })} disabled={busy}>
                        <option value="open">Aberto</option><option value="in_progress">Em andamento</option><option value="waiting">Aguardando</option>
                      </select>
                      <button type="button" onClick={() => complete(order)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" />Concluir</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
