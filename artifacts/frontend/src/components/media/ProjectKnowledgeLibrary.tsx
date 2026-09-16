import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, FileText, Image as ImageIcon, Loader2, MapPin, Plus, Search, Trash2, Upload, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ContextEntry = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  details?: string | null;
  tags?: string[] | null;
  sourceType?: string | null;
  sourceId?: string | null;
  assetIds?: string[] | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  updatedAt?: string | null;
};

type MediaAsset = {
  id: string;
  type: "image" | "video" | "audio" | "document";
  storageUrl: string;
  originalFilename?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ConstructionObra = {
  id: string;
  nome: string;
  descricao?: string | null;
  clienteNome?: string | null;
  endereco?: string | null;
  status?: string | null;
  dataInicio?: string | null;
};

type ConstructionDiaryPhoto = {
  url: string;
  caption?: string | null;
  uploadedAt?: string | null;
};

type ConstructionDiary = {
  id: string;
  data: string;
  status?: string | null;
  fotos?: ConstructionDiaryPhoto[] | null;
};

type ProjectForm = {
  nome: string;
  local: string;
  cliente: string;
  categoria: string;
  status: string;
  ano: string;
  resumo: string;
  detalhes: string;
  resultados: string;
  tags: string;
  aiEnabled: boolean;
};

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function mediaUrl(value: string) {
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

function inferType(file: File): MediaAsset["type"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/")) return "document";
  return null;
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function constructionStatusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    planejamento: "Planejamento",
    em_andamento: "Em andamento",
    concluida: "Concluída",
    pausada: "Pausada",
    cancelada: "Cancelada",
  };
  return labels[String(value ?? "")] ?? "Em andamento";
}

function diaryPhotoKey(obraId: string, diarioId: string, url: string) {
  return `${obraId}:${diarioId}:${url}`;
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((id) => left.has(id));
}

async function syncConstructionDiaryLibrary(tenantId: string, initialEntries: ContextEntry[], initialAssets: MediaAsset[]) {
  const obrasResponse = await fetch(`/api/tenants/${tenantId}/obras`, { headers: authHeaders(), cache: "no-store" });
  if (!obrasResponse.ok) return false;
  const obrasBody = await obrasResponse.json().catch(() => []);
  const obras = Array.isArray(obrasBody) ? obrasBody as ConstructionObra[] : [];
  if (obras.length === 0) return false;

  const entries = [...initialEntries];
  const assets = [...initialAssets];
  let changed = false;

  for (const obra of obras) {
    let entry = entries.find((item) => item.kind === "obra" && (
      String(item.metadata?.constructionObraId ?? "") === obra.id ||
      (item.sourceType === "construction_obra" && item.sourceId === obra.id)
    ));

    if (!entry) {
      const sameTitle = entries.find((item) => item.kind === "obra" && normalize(item.title) === normalize(obra.nome));
      if (sameTitle) {
        const metadata = {
          ...(sameTitle.metadata ?? {}),
          constructionObraId: obra.id,
          syncedFrom: "diario_obra",
          local: String(sameTitle.metadata?.local ?? obra.endereco ?? ""),
          cliente: String(sameTitle.metadata?.cliente ?? obra.clienteNome ?? ""),
          statusProjeto: constructionStatusLabel(obra.status),
          ano: String(sameTitle.metadata?.ano ?? obra.dataInicio?.slice(0, 4) ?? ""),
          aiEnabled: sameTitle.metadata?.aiEnabled !== false,
        };
        const patch = await fetch(`/api/tenants/${tenantId}/context-library/${sameTitle.id}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ metadata }),
        });
        if (patch.ok) {
          entry = await patch.json().catch(() => ({ ...sameTitle, metadata }));
          const index = entries.findIndex((item) => item.id === sameTitle.id);
          if (index >= 0) entries[index] = entry!;
          changed = true;
        } else {
          entry = sameTitle;
        }
      } else {
        const summary = obra.descricao?.trim() || `Obra ${obra.nome} acompanhada pelo Diário de Obra do VendorAI.`;
        const create = await fetch(`/api/tenants/${tenantId}/context-library`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            title: obra.nome,
            kind: "obra",
            summary,
            tags: ["obra", "diário de obra"],
            sourceType: "construction_obra",
            sourceId: obra.id,
            status: "approved",
            metadata: {
              local: obra.endereco ?? "",
              cliente: obra.clienteNome ?? "",
              categoria: "Obra",
              statusProjeto: constructionStatusLabel(obra.status),
              ano: obra.dataInicio?.slice(0, 4) ?? "",
              resultados: "",
              aiEnabled: true,
              constructionObraId: obra.id,
              syncedFrom: "diario_obra",
            },
          }),
        });
        if (create.ok) {
          entry = await create.json();
          entries.push(entry!);
          changed = true;
        }
      }
    }

    if (!entry) continue;

    const diariosResponse = await fetch(`/api/tenants/${tenantId}/obras/${obra.id}/diario`, { headers: authHeaders(), cache: "no-store" });
    if (!diariosResponse.ok) continue;
    const diariosBody = await diariosResponse.json().catch(() => []);
    const diarios = Array.isArray(diariosBody) ? diariosBody as ConstructionDiary[] : [];
    const linkedIds = [...new Set(entry.assetIds ?? [])];

    for (const diario of diarios) {
      for (const photo of Array.isArray(diario.fotos) ? diario.fotos : []) {
        if (!photo?.url) continue;
        const key = diaryPhotoKey(obra.id, diario.id, photo.url);
        const desiredAiUsage = diario.status === "aprovado" && entry.status === "approved" && entry.metadata?.aiEnabled !== false
          ? "approved"
          : "manual";

        let asset = assets.find((item) =>
          String(item.metadata?.constructionDiaryPhotoKey ?? "") === key ||
          (item.storageUrl === photo.url && String(item.metadata?.contextEntryId ?? "") === entry!.id),
        );

        if (asset) {
          const currentAiUsage = String(asset.metadata?.aiUsage ?? "");
          const currentDiaryStatus = String(asset.metadata?.diaryStatus ?? "");
          if (currentAiUsage !== desiredAiUsage || currentDiaryStatus !== String(diario.status ?? "")) {
            const patch = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
              method: "PATCH",
              headers: authHeaders(true),
              body: JSON.stringify({ metadata: { aiUsage: desiredAiUsage, diaryStatus: diario.status ?? "rascunho" } }),
            });
            if (patch.ok) {
              const body = await patch.json().catch(() => ({}));
              asset = body.asset ?? { ...asset, metadata: { ...(asset.metadata ?? {}), aiUsage: desiredAiUsage, diaryStatus: diario.status ?? "rascunho" } };
              const index = assets.findIndex((item) => item.id === asset!.id);
              if (index >= 0) assets[index] = asset!;
              changed = true;
            }
          }
        } else {
          const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({
              type: "image",
              role: "reference",
              source: "imported",
              storageUrl: photo.url,
              originalFilename: photo.caption || `Diário de Obra ${diario.data}`,
              metadata: {
                folderPath: "Obras e projetos",
                contextEntryId: entry.id,
                projectName: obra.nome,
                aiUsage: desiredAiUsage,
                aiCollection: `Obra:${entry.id}`,
                constructionObraId: obra.id,
                diarioId: diario.id,
                diaryDate: diario.data,
                diaryStatus: diario.status ?? "rascunho",
                constructionDiaryPhotoKey: key,
                uploadedFrom: "diario_obra",
                originalUploadedAt: photo.uploadedAt ?? null,
              },
            }),
          });
          if (register.ok) {
            const body = await register.json().catch(() => ({}));
            if (body.asset?.id) {
              asset = body.asset as MediaAsset;
              assets.push(asset);
              changed = true;
            }
          }
        }

        if (asset?.id && !linkedIds.includes(asset.id)) linkedIds.push(asset.id);
      }
    }

    const uniqueIds = [...new Set(linkedIds)];
    const currentIds = [...new Set(entry.assetIds ?? [])];
    if (!sameIds(currentIds, uniqueIds)) {
      const patch = await fetch(`/api/tenants/${tenantId}/context-library/${entry.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ assetIds: uniqueIds.slice(0, 100) }),
      });
      if (patch.ok) {
        const updated = await patch.json().catch(() => ({ ...entry, assetIds: uniqueIds.slice(0, 100) }));
        const index = entries.findIndex((item) => item.id === entry!.id);
        if (index >= 0) entries[index] = updated;
        entry = updated;
        changed = true;
      }
    }
  }

  return changed;
}

function emptyForm(): ProjectForm {
  return { nome: "", local: "", cliente: "", categoria: "", status: "Em andamento", ano: "", resumo: "", detalhes: "", resultados: "", tags: "", aiEnabled: true };
}

function formFromEntry(entry: ContextEntry): ProjectForm {
  const metadata = entry.metadata ?? {};
  return {
    nome: entry.title,
    local: String(metadata.local ?? ""),
    cliente: String(metadata.cliente ?? ""),
    categoria: String(metadata.categoria ?? ""),
    status: String(metadata.statusProjeto ?? "Em andamento"),
    ano: String(metadata.ano ?? ""),
    resumo: entry.summary ?? "",
    detalhes: entry.details ?? "",
    resultados: String(metadata.resultados ?? ""),
    tags: (entry.tags ?? []).join(", "),
    aiEnabled: metadata.aiEnabled !== false,
  };
}

export default function ProjectKnowledgeLibrary() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ProjectForm>(emptyForm);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const projectAssets = useMemo(() => {
    if (!selected) return [];
    const ids = new Set(selected.assetIds ?? []);
    return assets.filter((asset) => ids.has(asset.id) || asset.metadata?.contextEntryId === selected.id);
  }, [assets, selected]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return entries;
    return entries.filter((entry) => {
      const metadata = entry.metadata ?? {};
      return [entry.title, entry.summary, String(metadata.local ?? ""), String(metadata.cliente ?? ""), String(metadata.categoria ?? ""), ...(entry.tags ?? [])]
        .join(" ").toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [entries, search]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (!button?.closest("#biblioteca-midias") || !button.textContent?.includes("Obras e projetos")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (open) return;
      const container = document.getElementById("biblioteca-midias");
      const button = container ? Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Obras e projetos")) : null;
      if (button?.className.includes("border-orange-300")) setOpen(true);
    }, 250);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const mediaLibrary = Array.from(container.children).find((child) => !(child as HTMLElement).dataset.projectKnowledgeRoot && !(child as HTMLElement).dataset.productKnowledgeRoot) as HTMLElement | undefined;
    if (!mediaLibrary) return;
    const previous = mediaLibrary.style.display;
    if (open) mediaLibrary.style.display = "none";
    return () => { mediaLibrary.style.display = previous; };
  }, [open]);

  async function fetchLibraryState() {
    const [entriesResponse, assetsResponse] = await Promise.all([
      fetch(`/api/tenants/${tenantId}/context-library`, { headers: authHeaders(), cache: "no-store" }),
      fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: authHeaders(), cache: "no-store" }),
    ]);
    const entriesBody = await entriesResponse.json().catch(() => ({}));
    const assetsBody = await assetsResponse.json().catch(() => ({}));
    if (!entriesResponse.ok) throw new Error(entriesBody.error || "Não foi possível carregar obras e projetos.");
    return {
      entries: Array.isArray(entriesBody.entries) ? entriesBody.entries.filter((entry: ContextEntry) => entry.kind === "obra" || entry.kind === "case") as ContextEntry[] : [],
      assets: Array.isArray(assetsBody.assets) ? assetsBody.assets as MediaAsset[] : [],
    };
  }

  async function load(syncConstruction = false) {
    if (!tenantId) return;
    setLoading(true);
    try {
      let state = await fetchLibraryState();
      if (syncConstruction) {
        const changed = await syncConstructionDiaryLibrary(tenantId, state.entries, state.assets);
        if (changed) state = await fetchLibraryState();
      }
      setEntries(state.entries);
      setAssets(state.assets);
      if (selectedId && !state.entries.some((entry) => entry.id === selectedId)) setSelectedId(null);
    } catch (error) {
      toast({ title: "Obras e projetos indisponíveis", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (tenantId) void load(false); }, [tenantId]);
  useEffect(() => { if (open && tenantId) void load(true); }, [open, tenantId]);
  useEffect(() => { if (selected) setForm(formFromEntry(selected)); }, [selected?.id]);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Obras e projetos"));
    const numeric = button ? Array.from(button.querySelectorAll("span")).find((span) => /^\d+$/.test(span.textContent?.trim() ?? "")) : null;
    if (numeric) numeric.textContent = String(entries.length);
  }, [entries.length, open]);

  async function save() {
    if (!tenantId) return;
    if (form.nome.trim().length < 2 || form.resumo.trim().length < 5) {
      toast({ title: "Preencha nome e resumo da obra/projeto", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.nome.trim(),
        kind: "obra",
        summary: form.resumo.trim(),
        details: form.detalhes.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        status: form.aiEnabled ? "approved" : "draft",
        metadata: {
          ...(selected?.metadata ?? {}),
          local: form.local.trim(),
          cliente: form.cliente.trim(),
          categoria: form.categoria.trim(),
          statusProjeto: form.status,
          ano: form.ano.trim(),
          resultados: form.resultados.trim(),
          aiEnabled: form.aiEnabled,
        },
      };
      const url = selected && !creating
        ? `/api/tenants/${tenantId}/context-library/${selected.id}`
        : `/api/tenants/${tenantId}/context-library`;
      const response = await fetch(url, { method: selected && !creating ? "PATCH" : "POST", headers: authHeaders(true), body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar.");
      toast({ title: selected && !creating ? "Obra/projeto atualizado" : "Obra/projeto cadastrado" });
      setCreating(false);
      setSelectedId(body.id);
      await load(false);
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!selected || !files?.length || !tenantId) return;
    setUploading(true);
    try {
      const ids = [...(selected.assetIds ?? [])];
      for (const file of Array.from(files)) {
        const type = inferType(file);
        if (!type) continue;
        const request = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
        });
        const prepared = await request.json().catch(() => ({}));
        if (!request.ok) throw new Error(prepared.error || `Falha ao preparar ${file.name}`);
        const put = await fetch(prepared.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) throw new Error(`Falha ao enviar ${file.name}`);
        const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
          method: "POST", headers: authHeaders(true), body: JSON.stringify({
            type, role: "reference", source: "upload", storageUrl: prepared.objectPath, originalFilename: file.name, mimeType: file.type || null, fileSize: file.size,
            metadata: {
              folderPath: "Obras e projetos",
              contextEntryId: selected.id,
              projectName: selected.title,
              aiUsage: form.aiEnabled ? "approved" : "manual",
              aiCollection: `Obra:${selected.id}`,
            },
          }),
        });
        const registered = await register.json().catch(() => ({}));
        if (!register.ok) throw new Error(registered.error || `Falha ao vincular ${file.name}`);
        if (registered.asset?.id) ids.push(registered.asset.id);
      }
      const patch = await fetch(`/api/tenants/${tenantId}/context-library/${selected.id}`, {
        method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ assetIds: [...new Set(ids)].slice(0, 100) }),
      });
      if (!patch.ok) throw new Error("Arquivos enviados, mas não foi possível vinculá-los à obra.");
      toast({ title: "Arquivos vinculados à obra/projeto" });
      await load(false);
    } catch (error) {
      toast({ title: "Falha ao anexar arquivos", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeEntry() {
    if (!selected || !tenantId || !window.confirm(`Excluir “${selected.title}” da Biblioteca?`)) return;
    const response = await fetch(`/api/tenants/${tenantId}/context-library/${selected.id}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) { toast({ title: "Não foi possível excluir", variant: "destructive" }); return; }
    setSelectedId(null);
    setForm(emptyForm());
    await load(false);
  }

  if (!open) return null;

  return (
    <div data-project-knowledge-root="true" className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <input ref={inputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt" onChange={(event) => void upload(event.target.files)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => { setOpen(false); setSelectedId(null); setCreating(false); }} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-medium"><ArrowLeft className="h-4 w-4" />Voltar à Biblioteca</button>
        <button type="button" onClick={() => { setCreating(true); setSelectedId(null); setForm(emptyForm()); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Cadastrar obra/projeto</button>
      </div>

      {!selected && !creating ? (
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Obras e projetos</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre por nome, local e informações da obra. Fotos, vídeos e documentos ficam anexados à mesma referência e podem alimentar a IA.</p>
              <p className="mt-1 text-xs font-medium text-orange-700">Obras do módulo de Construção e fotos registradas no Diário de Obra são sincronizadas automaticamente aqui.</p>
            </div>
            <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, local ou cliente" className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300" /></div>
          </div>
          {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : filtered.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed p-10 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-semibold">Nenhuma obra ou projeto cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Use “Cadastrar obra/projeto” para criar a primeira referência estruturada.</p></div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((entry) => {
                const metadata = entry.metadata ?? {};
                return <button key={entry.id} type="button" onClick={() => { setSelectedId(entry.id); setCreating(false); }} className="rounded-2xl border bg-background p-4 text-left transition hover:border-orange-300 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Building2 className="h-5 w-5" /></div><span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium">{String(metadata.statusProjeto ?? "Projeto")}</span></div>
                  <h3 className="mt-3 font-semibold">{entry.title}</h3>
                  {metadata.local ? <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{String(metadata.local)}</p> : null}
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{entry.summary}</p>
                  {metadata.syncedFrom === "diario_obra" ? <p className="mt-2 text-[10px] font-semibold text-orange-700">Integrada ao Diário de Obra</p> : null}
                  <p className="mt-3 text-[11px] text-muted-foreground">{entry.assetIds?.length ?? 0} arquivo(s) anexado(s) · {entry.status === "approved" ? "Disponível para IA" : "Uso interno"}</p>
                </button>;
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{creating ? "Nova obra/projeto" : selected?.title}</h2><p className="mt-1 text-sm text-muted-foreground">Informações usadas como referência da empresa e, quando liberadas, pelos agentes de IA.</p></div>{selected && !creating ? <button type="button" onClick={() => void removeEntry()} className="rounded-xl border p-2 text-destructive"><Trash2 className="h-4 w-4" /></button> : null}</div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-medium text-muted-foreground">Nome da obra/projeto<input value={form.nome} onChange={(e) => setForm((v) => ({ ...v, nome: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Ex.: Residência Silva" /></label>
              <label className="text-xs font-medium text-muted-foreground">Local<input value={form.local} onChange={(e) => setForm((v) => ({ ...v, local: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Cidade, bairro, endereço ou região" /></label>
              <label className="text-xs font-medium text-muted-foreground">Cliente<input value={form.cliente} onChange={(e) => setForm((v) => ({ ...v, cliente: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Nome do cliente ou empresa" /></label>
              <label className="text-xs font-medium text-muted-foreground">Categoria / tipo<input value={form.categoria} onChange={(e) => setForm((v) => ({ ...v, categoria: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Casa, piscina, comercial, reforma..." /></label>
              <label className="text-xs font-medium text-muted-foreground">Status<select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"><option>Planejamento</option><option>Em andamento</option><option>Concluída</option><option>Pausada</option></select></label>
              <label className="text-xs font-medium text-muted-foreground">Ano / período<input value={form.ano} onChange={(e) => setForm((v) => ({ ...v, ano: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="Ex.: 2026" /></label>
            </div>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Resumo<textarea value={form.resumo} onChange={(e) => setForm((v) => ({ ...v, resumo: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border bg-background p-3 text-sm" placeholder="Descrição curta da obra, objetivo e principais características." /></label>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Detalhes técnicos / materiais / soluções<textarea value={form.detalhes} onChange={(e) => setForm((v) => ({ ...v, detalhes: e.target.value }))} rows={5} className="mt-1 w-full rounded-xl border bg-background p-3 text-sm" /></label>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Resultados / diferenciais do case<textarea value={form.resultados} onChange={(e) => setForm((v) => ({ ...v, resultados: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border bg-background p-3 text-sm" /></label>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Tags<input value={form.tags} onChange={(e) => setForm((v) => ({ ...v, tags: e.target.value }))} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm" placeholder="ICF, residencial, piscina, acabamento..." /></label>
            <label className="mt-4 flex items-center justify-between rounded-2xl border p-4"><div><p className="text-sm font-semibold">Disponível para IA</p><p className="mt-1 text-xs text-muted-foreground">Libera esta obra/case para atendimento, marketing e demais agentes que usam a Biblioteca.</p></div><input type="checkbox" checked={form.aiEnabled} onChange={(e) => setForm((v) => ({ ...v, aiEnabled: e.target.checked }))} className="h-5 w-5" /></label>
            <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar obra/projeto</button>
          </div>

          <aside className="h-fit rounded-3xl border bg-card p-4 shadow-sm">
            <h3 className="font-semibold">Arquivos da obra</h3>
            <p className="mt-1 text-xs text-muted-foreground">Fotos, vídeos, plantas, PDFs, apresentações e documentos ficam vinculados à obra/projeto.</p>
            {selected?.metadata?.constructionObraId ? <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-[11px] font-medium text-orange-800">Fotos registradas no Diário de Obra entram automaticamente nesta galeria. Registros aprovados também ficam liberados para a IA quando a obra estiver disponível para IA.</p> : null}
            {selected && !creating ? <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium"><Upload className="h-4 w-4" />{uploading ? "Enviando..." : "Adicionar arquivos"}</button> : <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">Salve a obra primeiro para poder anexar arquivos.</p>}
            <div className="mt-4 space-y-2">
              {projectAssets.map((asset) => <div key={asset.id} className="flex items-center gap-3 rounded-xl border p-2"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted">{asset.type === "image" ? <img src={mediaUrl(asset.storageUrl)} alt="" className="h-full w-full object-cover" /> : asset.type === "video" ? <Video className="h-4 w-4" /> : asset.type === "document" ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}</div><div className="min-w-0"><p className="truncate text-xs font-medium">{asset.originalFilename || "Arquivo"}</p><p className="text-[10px] text-muted-foreground">{asset.metadata?.uploadedFrom === "diario_obra" ? `Diário de Obra${asset.metadata?.diaryDate ? ` · ${String(asset.metadata.diaryDate).split("-").reverse().join("/")}` : ""}` : asset.type}</p></div></div>)}
              {selected && projectAssets.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum arquivo anexado ainda.</p> : null}
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}