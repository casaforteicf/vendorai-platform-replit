import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { Asset, MaintenanceApi } from "./api";
import { Card, Empty, ErrorBox, Field, SectionTitle, fmtDate, inputClass } from "./components";

type FormState = {
  code: string; name: string; category: string; locationType: "room" | "area"; areaName: string;
  brand: string; model: string; serialNumber: string; status: "active" | "inactive"; notes: string;
};

const emptyForm: FormState = {
  code: "", name: "", category: "Geral", locationType: "area", areaName: "", brand: "", model: "", serialNumber: "", status: "active", notes: "",
};

export default function Equipamentos({ api }: { api: MaintenanceApi }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAssets(await api.get<Asset[]>("/equipamentos"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  function openNew() {
    setEditingId(null); setForm({ ...emptyForm, code: `EQ-${String(assets.length + 1).padStart(3, "0")}` }); setShowForm(true); setError(null);
  }

  function openEdit(asset: Asset) {
    setEditingId(asset.id);
    setForm({
      code: asset.code, name: asset.name, category: asset.category, locationType: asset.location_type,
      areaName: asset.area_name ?? "", brand: asset.brand ?? "", model: asset.model ?? "",
      serialNumber: asset.serial_number ?? "", status: asset.status, notes: asset.notes ?? "",
    });
    setShowForm(true); setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError("Informe o código e o nome do equipamento."); return; }
    setBusy(true); setError(null);
    const body = {
      code: form.code.trim(), name: form.name.trim(), category: form.category || "Geral",
      locationType: form.locationType, areaName: form.areaName || null, brand: form.brand || null,
      model: form.model || null, serialNumber: form.serialNumber || null, status: form.status,
      notes: form.notes || null,
    };
    try {
      if (editingId) await api.patch(`/equipamentos/${editingId}`, body);
      else await api.post("/equipamentos", body);
      setShowForm(false); setEditingId(null); setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`Excluir o equipamento “${asset.name}”? Os planos e chamados vinculados perdem o vínculo.`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/equipamentos/${asset.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const visible = assets.filter((asset) => {
    const term = search.trim().toLowerCase();
    return !term || `${asset.code} ${asset.name} ${asset.category} ${asset.area_name ?? ""}`.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Equipamentos"
          subtitle="Base para preventiva e chamados: identificação, local e situação."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={openNew} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo equipamento</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}

        {showForm && (
          <form onSubmit={save} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4"><h3 className="text-sm font-semibold">{editingId ? "Editar equipamento" : "Novo equipamento"}</h3></div>
            <Field label="Código"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EQ-001" required /></Field>
            <Field label="Nome" className="sm:col-span-2"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ar-condicionado split 12.000 BTUs" required /></Field>
            <Field label="Categoria"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Climatização" /></Field>
            <Field label="Tipo de local">
              <select className={inputClass} value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value as "room" | "area" })}>
                <option value="area">Área comum</option><option value="room">UH</option>
              </select>
            </Field>
            <Field label={form.locationType === "room" ? "UH / local" : "Área"} className="sm:col-span-2"><input className={inputClass} value={form.areaName} onChange={(e) => setForm({ ...form, areaName: e.target.value })} placeholder={form.locationType === "room" ? "UH 204" : "Restaurante, piscina, lavanderia…"} /></Field>
            <Field label="Situação">
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}>
                <option value="active">Ativo</option><option value="inactive">Inativo</option>
              </select>
            </Field>
            <Field label="Marca"><input className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modelo"><input className={inputClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Número de série"><input className={inputClass} value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></Field>
            <Field label="Observações" className="sm:col-span-2 lg:col-span-4"><textarea className={`${inputClass} min-h-16`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{editingId ? "Salvar alterações" : "Cadastrar"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className={`${inputClass} max-w-xs`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, nome ou local…" />
          <span className="text-xs text-muted-foreground">{visible.length} de {assets.length} equipamento(s)</span>
        </div>

        {visible.length === 0 ? <Empty>Nenhum equipamento encontrado.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((asset) => (
              <article key={asset.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{asset.code} · {asset.name}</p>
                    <p className="text-xs text-muted-foreground">{asset.category} · {asset.location_type === "room" ? "UH" : "Área"} {asset.area_name ?? ""}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${asset.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{asset.status === "active" ? "Ativo" : "Inativo"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {asset.brand && <span>{asset.brand}{asset.model ? ` ${asset.model}` : ""}</span>}
                  {asset.serial_number && <span>Série {asset.serial_number}</span>}
                  <span>{asset.planos_ativos} plano(s) ativo(s)</span>
                  {asset.proxima_manutencao && <span>Próxima: {fmtDate(asset.proxima_manutencao)}</span>}
                </div>
                {asset.notes && <p className="mt-2 text-xs text-muted-foreground">{asset.notes}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => openEdit(asset)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Editar</button>
                  <button type="button" onClick={() => void remove(asset)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
