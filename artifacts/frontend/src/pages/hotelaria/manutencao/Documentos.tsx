import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { MaintenanceApi, MaintenanceDocument } from "./api";
import { Card, Empty, ErrorBox, Field, SectionTitle, fmtDate, inputClass, todayISO } from "./components";

const emptyForm = { title: "", kind: "Documento", issuer: "", validUntil: todayISO(), fileUrl: "", notes: "" };

export default function Documentos({ api }: { api: MaintenanceApi }) {
  const [documents, setDocuments] = useState<MaintenanceDocument[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDocuments(await api.get<MaintenanceDocument[]>("/documentos"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) { setError("Informe o título do documento."); return; }
    setBusy(true); setError(null);
    try {
      await api.post("/documentos", {
        title: form.title,
        kind: form.kind || "Documento",
        issuer: form.issuer || null,
        validUntil: form.validUntil || null,
        fileUrl: form.fileUrl || null,
        notes: form.notes || null,
      });
      setForm({ ...emptyForm, validUntil: todayISO() });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(document: MaintenanceDocument) {
    if (!window.confirm(`Excluir “${document.title}”?`)) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/documentos/${document.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function renew(document: MaintenanceDocument) {
    const next = window.prompt(`Nova validade de “${document.title}” (AAAA-MM-DD):`, document.valid_until ?? todayISO());
    if (next === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) { setError("Data inválida. Use AAAA-MM-DD."); return; }
    setBusy(true); setError(null);
    try {
      await api.patch(`/documentos/${document.id}`, { validUntil: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function tone(document: MaintenanceDocument): string {
    if (document.dias_para_vencer === null) return "bg-slate-100 text-slate-600";
    if (document.dias_para_vencer < 0) return "bg-red-100 text-red-800";
    if (document.dias_para_vencer <= 30) return "bg-amber-100 text-amber-900";
    return "bg-emerald-100 text-emerald-800";
  }

  function label(document: MaintenanceDocument): string {
    if (document.dias_para_vencer === null) return "Sem validade";
    if (document.dias_para_vencer < 0) return `Vencido há ${Math.abs(document.dias_para_vencer)}d`;
    if (document.dias_para_vencer === 0) return "Vence hoje";
    return `Vence em ${document.dias_para_vencer}d`;
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Documentação e vencimentos"
          subtitle="Alvarás, AVCB, laudos, certidões e contratos com aviso de renovação."
          action={
            <div className="flex gap-2">
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" />Atualizar</button>
              <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Novo documento</button>
            </div>
          }
        />
        {error && <div className="mb-3"><ErrorBox message={error} onRetry={() => void load()} /></div>}

        {showForm && (
          <form onSubmit={create} className="mb-4 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Título" className="sm:col-span-2"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="AVCB, alvará dos bombeiros…" required /></Field>
            <Field label="Tipo"><input className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="Laudo, alvará, contrato…" /></Field>
            <Field label="Validade"><input type="date" className={inputClass} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></Field>
            <Field label="Emissor" className="sm:col-span-2"><input className={inputClass} value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Órgão ou empresa" /></Field>
            <Field label="Link do arquivo" className="sm:col-span-2"><input className={inputClass} value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Observações" className="sm:col-span-2 lg:col-span-4"><textarea className={`${inputClass} min-h-16`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Salvar documento</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
            </div>
          </form>
        )}

        {documents.length === 0 ? <Empty>Nenhum documento cadastrado.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {documents.map((document) => (
              <article key={document.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{document.title}</p>
                    <p className="text-xs text-muted-foreground">{document.kind}{document.issuer ? ` · ${document.issuer}` : ""}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone(document)}`}>{label(document)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Validade: {fmtDate(document.valid_until)}</p>
                {document.notes && <p className="mt-1 text-xs text-muted-foreground">{document.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void renew(document)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Renovar validade</button>
                  {document.file_url && <a href={document.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><ExternalLink className="h-3.5 w-3.5" />Abrir arquivo</a>}
                  <button type="button" onClick={() => void remove(document)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
