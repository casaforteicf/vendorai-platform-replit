import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Camera, CheckCircle2, Printer, RefreshCw, Ruler, TriangleAlert } from "lucide-react";
import PhotoMeasureEditor from "@/components/measure/PhotoMeasureEditor";
import SurveyElementsEditor, { type SurveyElement } from "@/components/measure/SurveyElementsEditor";

type ItemStatus = "nao_conferido" | "conferido" | "divergente" | "nao_executado" | "resolvido";
type ChecklistItem = {
  id: string;
  codigo?: string | null;
  tipo?: string | null;
  descricao: string;
  quantidade: number;
  larguraOriginal?: number | null;
  alturaOriginal?: number | null;
  larguraConferida?: number | null;
  alturaConferida?: number | null;
  diferencaLargura?: number | null;
  diferencaAltura?: number | null;
  unidadeMedida?: string | null;
  localizacao?: string | null;
  observacao?: string | null;
  imagemUrl?: string | null;
  fotos?: string[];
  photoMeasurements?: import("@/components/measure/PhotoMeasureEditor").PhotoMeasure[];
  surveyElements?: SurveyElement[];
  status: ItemStatus;
};
type ChecklistRun = {
  id: string;
  name: string;
  revision: number;
  status: string;
  toleranceMm: number;
  headerSnapshot: Record<string, unknown>;
  items: ChecklistItem[];
};
type CurrentPayload = {
  run: ChecklistRun | null;
  context: {
    deal?: { id: string; titulo?: string; etapa?: string };
    lead?: { nome?: string; empresa?: string };
    tenant?: { name?: string };
    propostaId?: string | null;
  };
};

function dealIdFromPath() {
  const match = window.location.pathname.match(/\/checklists\/medidas\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function statusLabel(status: ItemStatus) {
  if (status === "conferido") return "Conferido";
  if (status === "divergente") return "Divergente";
  if (status === "nao_executado") return "Não executado";
  if (status === "resolvido") return "Resolvido";
  return "Não conferido";
}

function statusClass(status: ItemStatus) {
  if (status === "conferido" || status === "resolvido") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "divergente") return "bg-red-50 text-red-700 border-red-200";
  if (status === "nao_executado") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function OperationalMeasurementChecklist() {
  const { token } = useAuth();
  const dealId = useMemo(dealIdFromPath, []);
  const [data, setData] = useState<CurrentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoItemId, setPhotoItemId] = useState<string | null>(null);
  const [photoAccess, setPhotoAccess] = useState<Record<string, Array<{ storageUrl: string; accessUrl: string }>>>({});

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || payload?.message || "Não foi possível concluir a operação.");
    return payload;
  }

  async function load() {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api(`/api/operational-checklists/deals/${dealId}/current`);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar checklist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [dealId, token]);

  async function loadPhoto(itemId: string, runId: string) {
    try {
      const result = await api(`/api/operational-checklists/runs/${runId}/items/${itemId}/photos`);
      setPhotoAccess((prev) => ({ ...prev, [itemId]: result.photos ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar fotos.");
    }
  }

  async function uploadPhoto(itemId: string, file: File): Promise<{ storageUrl: string; accessUrl: string }> {
    if (!data?.run) throw new Error("Conferência não iniciada.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Máximo de 5 MB por foto.");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler foto."));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
    const result = await api(`/api/operational-checklists/runs/${data.run.id}/items/${itemId}/photos`, {
      method: "POST",
      body: JSON.stringify({ name: file.name, contentType: file.type, dataBase64: base64 }),
    });
    setPhotoAccess((prev) => ({ ...prev, [itemId]: [...(prev[itemId] ?? []), { storageUrl: result.storageUrl, accessUrl: result.accessUrl }] }));
    return { storageUrl: result.storageUrl, accessUrl: result.accessUrl };
  }

  async function start() {
    setBusy("start");
    setError(null);
    try {
      const run = await api(`/api/operational-checklists/deals/${dealId}/start`, {
        method: "POST",
        body: JSON.stringify({ name: "Conferência de Medidas" }),
      });
      setData((prev) => prev ? { ...prev, run } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar conferência.");
    } finally {
      setBusy(null);
    }
  }

  async function saveItem(item: ChecklistItem, patch: Partial<ChecklistItem>) {
    if (!data?.run) return;
    setBusy(item.id);
    setError(null);
    try {
      const run = await api(`/api/operational-checklists/runs/${data.run.id}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setData((prev) => prev ? { ...prev, run } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar item.");
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    if (!data?.run) return;
    setBusy("complete");
    setError(null);
    try {
      const run = await api(`/api/operational-checklists/runs/${data.run.id}/complete`, { method: "POST", body: "{}" });
      setData((prev) => prev ? { ...prev, run } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando conferência...</div>;

  const run = data?.run;
  const items = run?.items ?? [];
  const pending = items.filter((item) => item.status === "nao_conferido").length;
  const divergent = items.filter((item) => item.status === "divergente").length;
  const completed = items.filter((item) => item.status === "conferido" || item.status === "resolvido" || item.status === "nao_executado").length;
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1500px] p-4 md:p-6 space-y-5 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => history.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Ruler className="h-5 w-5" /> Conferência de Medidas</h1>
            <p className="text-sm text-muted-foreground">Checklist operacional vinculado ao pedido e ao cliente.</p>
          </div>
        </div>
        {run && <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Gerar PDF</Button>
          <Button onClick={complete} disabled={busy === "complete" || run.status === "concluido" || pending > 0 || divergent > 0}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> {run.status === "concluido" ? "Concluído" : "Concluir conferência"}
          </Button>
        </div>}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><TriangleAlert className="h-4 w-4 mt-0.5" />{error}</div>}

      {!run ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <Ruler className="mx-auto h-10 w-10 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Nenhuma conferência iniciada</h2>
              <p className="mt-1 text-sm text-muted-foreground">O sistema buscará automaticamente os itens do pedido/orçamento vinculado a este negócio.</p>
            </div>
            <Button onClick={start} disabled={busy === "start"}>{busy === "start" ? "Criando..." : "Iniciar Conferência de Medidas"}</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="grid gap-px bg-border md:grid-cols-4">
                {[
                  ["Empresa", run.headerSnapshot?.empresa],
                  ["Cliente", run.headerSnapshot?.cliente],
                  ["Obra", run.headerSnapshot?.obra],
                  ["Pedido", run.headerSnapshot?.pedido],
                  ["Representante", run.headerSnapshot?.representante],
                  ["Revisão", "R" + run.revision],
                  ["Status", run.status === "concluido" ? "Concluído" : "Em andamento"],
                  ["Tolerância", run.toleranceMm + " mm"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-card px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{String(label)}</div>
                    <div className="mt-1 text-sm font-semibold">{String(value ?? "—")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-4 print:hidden">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Progresso</div><div className="text-2xl font-semibold">{progress}%</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Itens</div><div className="text-2xl font-semibold">{items.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pendentes</div><div className="text-2xl font-semibold">{pending}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Divergências</div><div className="text-2xl font-semibold text-red-600">{divergent}</div></CardContent></Card>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <Card key={item.id} className={item.status === "divergente" ? "border-red-300" : ""}>
                <CardContent className="p-4">
                  <div className="grid gap-4 lg:grid-cols-[110px_1fr_170px_170px_210px] items-start">
                    <div className="flex items-center justify-center min-h-24 rounded-lg border bg-muted/20 overflow-hidden">
                      {item.imagemUrl ? <img src={item.imagemUrl} alt={item.tipo ?? item.descricao} className="max-h-24 max-w-full object-contain" /> : <Ruler className="h-7 w-7 text-muted-foreground/50" />}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">ITEM {index + 1}</span>
                        {item.codigo && <Badge variant="outline">{item.codigo}</Badge>}
                        <Badge className={statusClass(item.status)} variant="outline">{statusLabel(item.status)}</Badge>
                      </div>
                      <div className="font-semibold">{item.tipo || item.descricao}</div>
                      {item.tipo && item.descricao !== item.tipo && <div className="text-sm text-muted-foreground">{item.descricao}</div>}
                      <div className="text-xs text-muted-foreground">Quantidade: {item.quantidade} · Localização: {item.localizacao || "não informada"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Medida original</div>
                      <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        <div>L: <strong>{item.larguraOriginal ?? "—"}</strong> mm</div>
                        <div>A: <strong>{item.alturaOriginal ?? "—"}</strong> mm</div>
                      </div>
                    </div>
                    <div className="print:hidden">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Medida conferida</div>
                      <div className="space-y-2">
                        <Input
                          type="number"
                          step="1"
                          defaultValue={item.larguraConferida ?? ""}
                          placeholder="Largura mm"
                          disabled={run.status === "concluido"}
                          onBlur={(e) => saveItem(item, { larguraConferida: e.target.value ? Number(e.target.value) : null })}
                        />
                        <Input
                          type="number"
                          step="1"
                          defaultValue={item.alturaConferida ?? ""}
                          placeholder="Altura mm"
                          disabled={run.status === "concluido"}
                          onBlur={(e) => saveItem(item, { alturaConferida: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Resultado</div>
                      <div className="text-sm">
                        Δ L: <strong className={Math.abs(item.diferencaLargura ?? 0) > run.toleranceMm ? "text-red-600" : ""}>{item.diferencaLargura ?? "—"}</strong> mm
                      </div>
                      <div className="text-sm">
                        Δ A: <strong className={Math.abs(item.diferencaAltura ?? 0) > run.toleranceMm ? "text-red-600" : ""}>{item.diferencaAltura ?? "—"}</strong> mm
                      </div>
                      <div className="flex flex-wrap gap-1.5 print:hidden">
                        <Button size="sm" variant="outline" disabled={run.status === "concluido" || busy === item.id} onClick={() => saveItem(item, { status: "nao_executado" })}>Não executado</Button>
                        {item.status === "divergente" && <Button size="sm" disabled={run.status === "concluido" || busy === item.id} onClick={() => saveItem(item, { status: "resolvido" })}>Marcar resolvido</Button>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 print:hidden">
                    <Button size="sm" variant="outline" onClick={() => { const next = photoItemId === item.id ? null : item.id; setPhotoItemId(next); if (next && data?.run) void loadPhoto(item.id, data.run.id); }}>
                      <Camera className="mr-2 h-4 w-4" /> {photoItemId === item.id ? "Fechar medição fotográfica" : "Medir na fotografia"}
                    </Button>
                    {photoItemId === item.id && (
                      <PhotoMeasureEditor itemId={item.id} imageUrl={item.imagemUrl} photos={photoAccess[item.id] ?? []} onUpload={(file) => uploadPhoto(item.id, file)} initialMeasurements={item.photoMeasurements ?? []} readOnly={run.status === "concluido"} onSave={async (measurements) => {
                        if (!data?.run) throw new Error("Conferência indisponível.");
                        const updated = await api(`/api/operational-checklists/runs/${data.run.id}/items/${item.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ photoMeasurements: measurements }),
                        });
                        setData((prev) => prev ? { ...prev, run: updated } : prev);
                      }} onClose={() => setPhotoItemId(null)} />
                    )}
                  </div>
                  {photoItemId === item.id && <SurveyElementsEditor key={item.id + "-" + (item.surveyElements?.length ?? 0)} elements={item.surveyElements ?? []} photos={item.fotos ?? []} disabled={run.status === "concluido"} onSave={async (surveyElements) => {
                    if (!data?.run) throw new Error("Checklist indisponível.");
                    const updated = await api(`/api/operational-checklists/runs/${data.run.id}/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ surveyElements }) });
                    setData((prev) => prev ? { ...prev, run: updated } : prev);
                  }} />}
                  <div className="mt-3 grid gap-3 md:grid-cols-2 print:hidden">
                    <Input
                      defaultValue={item.localizacao ?? ""}
                      placeholder="Localização / ambiente"
                      disabled={run.status === "concluido"}
                      onBlur={(e) => saveItem(item, { localizacao: e.target.value || null })}
                    />
                    <Input
                      defaultValue={item.observacao ?? ""}
                      placeholder="Observação da conferência"
                      disabled={run.status === "concluido"}
                      onBlur={(e) => saveItem(item, { observacao: e.target.value || null })}
                    />
                  </div>
                  <div className="hidden print:grid print:grid-cols-2 print:gap-4 print:mt-3 print:text-sm">
                    <div><span className="font-medium">Medida conferida:</span> {item.larguraConferida ?? "—"} × {item.alturaConferida ?? "—"} mm</div>
                    <div><span className="font-medium">Observação:</span> {item.observacao || "—"}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
