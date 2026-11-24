import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, CircleAlert, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ChecklistRun, ChecklistTemplate, MaintenanceApi } from "./api";
import { Card, CheckItem, Empty, ErrorBox, Field, SectionTitle, fmtDate, inputClass, todayISO } from "./components";

type DraftItem = { key: string; title: string; requiresNote: boolean };
const newItem = (): DraftItem => ({ key: Math.random().toString(36).slice(2), title: "", requiresNote: false });

export default function Checklist({ api }: { api: MaintenanceApi }) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [runs, setRuns] = useState<ChecklistRun[]>([]);
  const [date, setDate] = useState(todayISO());
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [areaName, setAreaName] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [items, setItems] = useState<DraftItem[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [templateRows, runRows] = await Promise.all([
        api.get<ChecklistTemplate[]>("/checklists"),
        api.get<ChecklistRun[]>(`/checklists/execucoes?date=${encodeURIComponent(date)}`),
      ]);
      setTemplates(templateRows);
      setRuns(runRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    const cleanItems = items.filter((item) => item.title.trim());
    if (!title.trim() || cleanItems.length === 0) { setError("Informe o título e pelo menos um item."); return; }
    setBusy(true); setError(null);
    try {
      await api.post("/checklists", {
        title,
        areaName: areaName || "Geral",
        frequency,
        items: cleanItems.map((item) => ({ title: item.title.trim(), requiresNote: item.requiresNote })),
      });
      setTitle(""); setAreaName(""); setFrequency("daily"); setItems([newItem()]); setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function start(template: ChecklistTemplate) {
    setBusy(true); setError(null);
    try {
      await api.post(`/checklists/${template.id}/gerar`, { date });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function mark(run: ChecklistRun, itemId: string, status: "ok" | "problem") {
    let notes: string | null = null;
    if (status === "problem") {
      notes = window.prompt("Descreva o problema encontrado:", "");
      if (notes === null) return;
    }
    setBusy(true); setError(null);
    try {
      await api.patch(`/checklists/execucoes/${run.id}/itens/${itemId}`, {
        status,
        notes,
        createWorkOrder: status === "problem",
        priority: status === "problem" ? "high" : "normal",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function runFor(templateId: string): ChecklistRun | undefined {
    return runs.find((run) => run.template_id === templateId);
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Checklist de manutenção"
          subtitle="Rondas diárias, semanais e mensais com registro por item e abertura de chamado."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo checklist</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}

        {showForm && (
          <form onSubmit={createTemplate} className="mb-4 space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Título" className="sm:col-span-2"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ronda diária da casa de máquinas" required /></Field>
              <Field label="Área"><input className={inputClass} value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Casa de máquinas" /></Field>
              <Field label="Frequência">
                <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
                  <option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option>
                </select>
              </Field>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Itens de verificação</p>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={item.key} className="flex flex-wrap items-center gap-2">
                    <input className={`${inputClass} min-w-0 flex-1`} value={item.title} onChange={(e) => setItems(items.map((row) => row.key === item.key ? { ...row, title: e.target.value } : row))} placeholder={`Item ${index + 1}`} />
                    <label className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"><input type="checkbox" checked={item.requiresNote} onChange={(e) => setItems(items.map((row) => row.key === item.key ? { ...row, requiresNote: e.target.checked } : row))} />Exige observação</label>
                    <button type="button" onClick={() => setItems(items.length > 1 ? items.filter((row) => row.key !== item.key) : items)} className="rounded border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Remover item"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setItems([...items, newItem()])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" />Adicionar item</button>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Salvar checklist</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Dia da ronda</label>
          <input type="date" className={`${inputClass} max-w-40`} value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="text-xs text-muted-foreground">{runs.length} checklist(s) iniciado(s) em {fmtDate(date)}</span>
        </div>

        {templates.length === 0 ? <Empty>Nenhum checklist cadastrado.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((template) => {
              const run = runFor(template.id);
              const done = run?.items.filter((item) => item.status && item.status !== "pending").length ?? 0;
              return (
                <article key={template.id} className={`rounded-lg border p-4 ${run?.status === "done" ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{template.title}</p>
                      <p className="text-xs text-muted-foreground">{template.area_name} · {template.frequency === "daily" ? "Diário" : template.frequency === "weekly" ? "Semanal" : "Mensal"} · {template.items.length} item(ns)</p>
                    </div>
                    {run ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${run.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{run.status === "done" ? "Concluído" : `${done}/${run.items.length}`}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Não iniciado</span>}
                  </div>

                  {!run ? (
                    <button type="button" onClick={() => void start(template)} disabled={busy} className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Iniciar checklist</button>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {run.items.map((item) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2">
                          <CheckItem checked={item.status === "ok"} />
                          <span className={`min-w-0 flex-1 text-sm ${item.status === "ok" ? "text-muted-foreground line-through" : ""}`}>{item.title}{item.requiresNote ? " *" : ""}</span>
                          <button type="button" onClick={() => void mark(run, item.id, "ok")} disabled={busy} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${item.status === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "hover:bg-muted"}`}><Check className="h-3 w-3" />OK</button>
                          <button type="button" onClick={() => void mark(run, item.id, "problem")} disabled={busy} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${item.status === "problem" ? "border-red-300 bg-red-50 text-red-800" : "hover:bg-muted"}`}><CircleAlert className="h-3 w-3" />Problema</button>
                          {item.notes && <span className="w-full text-xs text-muted-foreground">{item.notes}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
