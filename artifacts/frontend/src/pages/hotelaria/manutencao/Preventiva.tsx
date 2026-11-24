import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarCheck, Plus, RefreshCw, Wrench } from "lucide-react";
import type { Asset, MaintenanceApi, Plan } from "./api";
import { Card, DueBadge, Empty, ErrorBox, Field, SectionTitle, fmtDate, inputClass, todayISO } from "./components";

const emptyForm = { assetId: "", title: "", intervalDays: "90", lastDoneOn: "", nextDueOn: todayISO(), notes: "" };

export default function Preventiva({ api, onGoEquipments }: { api: MaintenanceApi; onGoEquipments: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [planRows, assetRows] = await Promise.all([
        api.get<Plan[]>("/planos"),
        api.get<Asset[]>("/equipamentos"),
      ]);
      setPlans(planRows);
      setAssets(assetRows.filter((asset) => asset.status === "active"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.assetId || !form.title.trim() || !form.nextDueOn) { setError("Escolha o equipamento, o título e a próxima data."); return; }
    setBusy(true); setError(null);
    try {
      await api.post("/planos", {
        assetId: form.assetId,
        title: form.title,
        intervalDays: Number(form.intervalDays) || 90,
        lastDoneOn: form.lastDoneOn || null,
        nextDueOn: form.nextDueOn,
        notes: form.notes || null,
      });
      setForm({ ...emptyForm, nextDueOn: todayISO() });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function execute(plan: Plan) {
    const performedOn = window.prompt(`Registrar execução de “${plan.title}”. Data (AAAA-MM-DD):`, todayISO());
    if (performedOn === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn)) { setError("Data inválida. Use AAAA-MM-DD."); return; }
    const notes = window.prompt("Observação da execução (opcional):", "");
    if (notes === null) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await api.post<{ nextDueOn: string }>(`/planos/${plan.id}/executar`, {
        performedOn,
        performedBy: null,
        notes: notes || null,
      });
      setNotice(`Execução registrada. Próxima manutenção em ${fmtDate(result.nextDueOn)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(plan: Plan) {
    setBusy(true); setError(null);
    try {
      await api.patch(`/planos/${plan.id}`, { active: !plan.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const overdue = plans.filter((plan) => plan.active && plan.next_due_on < todayISO()).length;
  const next7 = plans.filter((plan) => plan.active && plan.next_due_on >= todayISO() && plan.next_due_on <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)).length;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Preventiva"
          subtitle="Planos por equipamento, com próxima data e registro de execução."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo plano</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}
        {notice && <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-800">{overdue} atrasada(s)</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">{next7} nos próximos 7 dias</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{plans.filter((plan) => plan.active).length} ativa(s)</span>
        </div>

        {assets.length === 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Cadastre um equipamento antes de criar o plano preventivo.
            <button type="button" onClick={onGoEquipments} className="ml-2 font-semibold underline">Abrir equipamentos</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={create} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Equipamento" className="sm:col-span-2">
              <select className={inputClass} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
                <option value="">Selecione…</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name}</option>)}
              </select>
            </Field>
            <Field label="Plano / tarefa" className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Limpeza do filtro, troca de óleo…" required /></Field>
            <Field label="Intervalo (dias)"><input type="number" min={1} max={3650} className={inputClass} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} required /></Field>
            <Field label="Última execução"><input type="date" className={inputClass} value={form.lastDoneOn} onChange={(e) => setForm({ ...form, lastDoneOn: e.target.value })} /></Field>
            <Field label="Próxima execução"><input type="date" className={inputClass} value={form.nextDueOn} onChange={(e) => setForm({ ...form, nextDueOn: e.target.value })} required /></Field>
            <Field label="Observações"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Instruções, peças, fornecedor…" /></Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={busy || assets.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Salvar plano</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        {plans.length === 0 ? <Empty>Nenhum plano preventivo cadastrado.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {plans.map((plan) => {
              const late = plan.active && plan.next_due_on < todayISO();
              return (
                <article key={plan.id} className={`rounded-lg border p-4 ${late ? "border-red-200 bg-red-50/40" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{plan.title}</p>
                      <p className="text-xs text-muted-foreground">{plan.asset_code} · {plan.asset_name} · {plan.room_code ? `UH ${plan.room_code}` : plan.area_name ?? "Sem local"}</p>
                    </div>
                    <DueBadge date={plan.next_due_on} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" />A cada {plan.interval_days} dias</span>
                    <span>Última: {fmtDate(plan.last_done_on)}</span>
                    {!plan.active && <span className="font-semibold text-slate-600">Inativo</span>}
                  </div>
                  {plan.notes && <p className="mt-2 text-xs text-muted-foreground">{plan.notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void execute(plan)} disabled={busy || !plan.active} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"><Wrench className="h-3.5 w-3.5" />Registrar execução</button>
                    <button type="button" onClick={() => void toggle(plan)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs">{plan.active ? "Desativar" : "Ativar"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
