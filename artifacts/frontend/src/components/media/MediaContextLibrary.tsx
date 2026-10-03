import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, FilePlus2, Image as ImageIcon, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";
import { toast } from "sonner";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type EntryStatus = "draft" | "approved" | "archived";
type Entry = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  details?: string | null;
  tags?: string[];
  assetIds?: string[];
  status: EntryStatus;
  updatedAt: string;
};
type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };
type FonteInteligencia = {
  id: string;
  tipo: "perfil_negocio" | "produto_catalogo" | "biblioteca_contexto" | "base_conhecimento";
  categoria: string;
  titulo: string;
  resumo: string;
  pontuacao: number;
  aprovado: boolean;
};
type ContextoNegocioResolvido = {
  blocoPrompt: string;
  fontes: FonteInteligencia[];
  idsProdutos: string[];
  idsMidias: string[];
};

const KINDS = [
  ["assunto", "Assunto / conhecimento"],
  ["empresa", "Empresa"],
  ["marca", "Marca / identidade"],
  ["produto", "Produto do catálogo"],
  ["servico", "Serviço"],
  ["obra", "Obra"],
  ["projeto", "Projeto"],
  ["case", "Case / resultado"],
  ["equipe", "Equipe / pessoa"],
  ["campanha", "Campanha"],
  ["conteudo", "Conteúdo / rede social"],
  ["processo", "Processo"],
  ["diferencial", "Diferencial"],
  ["promocao", "Promoção / oferta"],
  ["prova", "Prova / comprovação"],
  ["documento", "Documento"],
  ["referencia", "Referência"],
] as const;

const KIND_HELP: Record<string, string> = {
  empresa: "Fatos institucionais, história, posicionamento e informações da empresa.",
  marca: "Logo, identidade, aplicações, referências visuais e regras da marca.",
  produto: "Selecione fotos e materiais do produto. Os dados oficiais continuam vindo do Catálogo.",
  servico: "Explique como o serviço funciona e vincule provas, fotos ou documentos.",
  obra: "Cadastre a obra e selecione fotos, vídeos, documentos e etapas relacionadas.",
  projeto: "Vincule imagens, plantas, renders, documentos e contexto do projeto.",
  case: "Registre situação, solução, resultado e mídias que comprovam o case.",
  equipe: "Vincule fotos, vídeos, apresentação e materiais da pessoa ou equipe.",
  campanha: "Associe peças, anúncios, vídeos e referências de uma campanha.",
  conteudo: "Associe posts, reels, stories, vídeos ou materiais já produzidos.",
  processo: "Documente etapas, padrões, regras e arquivos de apoio.",
  diferencial: "Explique o diferencial e associe evidências visuais ou documentos.",
  promocao: "Registre oferta, condição e materiais relacionados.",
  prova: "Adicione depoimentos, resultados, laudos, antes/depois ou comprovações.",
  documento: "Explique o que o documento representa e vincule o arquivo correspondente.",
  referencia: "Use como inspiração ou referência que a IA pode consultar.",
  assunto: "Cadastre um conhecimento importante e associe materiais que ajudem a IA a entendê-lo.",
};

function currentTenantId(): string {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as CachedOverride;
      if (value.id) return value.id;
    }
  } catch {}
  try {
    const value = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? "{}") as CachedUser;
    return value.tenantId ?? "";
  } catch { return ""; }
}

function headers(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function navigate(path: string) {
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const emptyForm = {
  title: "",
  kind: "assunto",
  summary: "",
  details: "",
  tags: "",
  status: "approved" as EntryStatus,
  assetIds: [] as string[],
};

export function MediaContextLibrary() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const tenantId = currentTenantId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedAssets, setPickedAssets] = useState<MediaPickerAsset[]>([]);
  const [testeInteligencia, setTesteInteligencia] = useState("");
  const [resultadoInteligencia, setResultadoInteligencia] = useState<ContextoNegocioResolvido | null>(null);
  const [testandoInteligencia, setTestandoInteligencia] = useState(false);
  const [mostrarTesteInteligencia, setMostrarTesteInteligencia] = useState(false);
  const active = pathname === "/midias/informacoes";

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 400);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  const load = useCallback(async () => {
    if (!tenantId || !active) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/context-library`, { headers: headers() });
      const body = await response.json().catch(() => ({})) as { entries?: Entry[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a biblioteca.");
      setEntries(body.entries ?? []);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao carregar a biblioteca.");
    } finally { setLoading(false); }
  }, [active, tenantId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return entries;
    return entries.filter((entry) => [entry.title, entry.kind, entry.summary, ...(entry.tags ?? [])].join(" ").toLocaleLowerCase("pt-BR").includes(query));
  }, [entries, search]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setPickedAssets([]);
  };

  const edit = (entry: Entry) => {
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      kind: entry.kind,
      summary: entry.summary,
      details: entry.details ?? "",
      tags: (entry.tags ?? []).join(", "),
      status: entry.status,
      assetIds: entry.assetIds ?? [],
    });
    setPickedAssets([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!form.title.trim() || form.summary.trim().length < 5) {
      window.alert("Informe um título e a informação que a IA deve conhecer.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
        assetIds: [...new Set(form.assetIds)],
      };
      const response = await fetch(
        editingId ? `/api/tenants/${tenantId}/context-library/${editingId}` : `/api/tenants/${tenantId}/context-library`,
        { method: editingId ? "PATCH" : "POST", headers: headers(true), body: JSON.stringify(payload) },
      );
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      reset();
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  };

  async function testarInteligenciaNegocio() {
    if (!tenantId || !testeInteligencia.trim()) return;
    setTestandoInteligencia(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/inteligencia-negocio/resolver`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ query: testeInteligencia.trim(), limit: 12 }),
      });
      const body = await response.json().catch(() => ({})) as ContextoNegocioResolvido & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível testar a inteligência.");
      setResultadoInteligencia(body);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível testar a inteligência do negócio.");
    } finally {
      setTestandoInteligencia(false);
    }
  }

  const remove = async (entry: Entry) => {
    if (!window.confirm(`Excluir “${entry.title}” da Biblioteca de Informações?`)) return;
    const response = await fetch(`/api/tenants/${tenantId}/context-library/${entry.id}`, { method: "DELETE", headers: headers() });
    if (!response.ok) {
      toast("Não foi possível excluir a informação da Biblioteca.");
      return;
    }
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    if (editingId === entry.id) reset();
  };

  function applyPickedAssets(assets: MediaPickerAsset[]) {
    setPickedAssets(assets);
    setForm((current) => ({ ...current, assetIds: assets.map((asset) => asset.id) }));
  }

  function removePickedAsset(assetId: string) {
    setPickedAssets((current) => current.filter((asset) => asset.id !== assetId));
    setForm((current) => ({ ...current, assetIds: current.assetIds.filter((id) => id !== assetId) }));
  }

  if (!active || !tenantId) return null;

  const linkedCount = form.assetIds.length;

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
          <button type="button" onClick={() => navigate("/midias")} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Mídias
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">Biblioteca de Informações</h1>
            <p className="hidden text-xs text-muted-foreground sm:block">Conhecimento aprovado + itens da Biblioteca de Mídias que a IA consulta antes de gerar conteúdo.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarTesteInteligencia((value) => !value)}
              className="hidden h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted sm:inline-flex"
            >
              <BookOpen className="h-3.5 w-3.5" /> Testar inteligência
            </button>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {entries.filter((item) => item.status === "approved").length} aprovadas
            </div>
          </div>
        </div>
      </header>

      {mostrarTesteInteligencia && (
        <section className="mx-auto mt-5 w-full max-w-7xl px-4 md:px-6">
          <div className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Como o Vendi interpreta este cenário</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Descreva uma necessidade, objeção ou momento da jornada. O teste mostra quais fontes aprovadas seriam usadas antes de gerar uma resposta.
                </p>
                <textarea
                  value={testeInteligencia}
                  onChange={(event) => setTesteInteligencia(event.target.value)}
                  placeholder="Ex.: cliente está analisando a proposta, achou o preço alto e demonstrou preocupação com isolamento acústico."
                  rows={3}
                  className="mt-3 w-full resize-y rounded-xl border bg-background p-3 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={testandoInteligencia || !testeInteligencia.trim()}
                onClick={() => void testarInteligenciaNegocio()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {testandoInteligencia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Resolver contexto
              </button>
            </div>

            {resultadoInteligencia && (
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs font-semibold">Contexto entregue ao agente</p>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                    {resultadoInteligencia.blocoPrompt || "Nenhum contexto relevante encontrado para este cenário."}
                  </pre>
                </div>
                <div className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Fontes utilizadas</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                      {resultadoInteligencia.fontes.length}
                    </span>
                  </div>
                  <div className="mt-2 max-h-80 space-y-2 overflow-auto">
                    {resultadoInteligencia.fontes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma fonte correspondente.</p>
                    ) : resultadoInteligencia.fontes.map((fonte) => (
                      <div key={`${fonte.tipo}:${fonte.id}`} className="rounded-lg border bg-muted/20 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold">{fonte.titulo}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{fonte.pontuacao}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-primary">{fonte.categoria.replace(/_/g, " ")}</p>
                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{fonte.resumo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6 lg:grid-cols-[410px_minmax(0,1fr)]">
        <section className="h-fit rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-20">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{editingId ? "Editar informação" : "Adicionar informação"}</p>
              <p className="text-xs text-muted-foreground">Cadastre o contexto e escolha na Biblioteca as mídias que pertencem a ele.</p>
            </div>
            {editingId && <button type="button" onClick={reset} className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>}
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium">Tipo
              <select value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <div className="rounded-xl border bg-muted/25 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {KIND_HELP[form.kind] ?? KIND_HELP.assunto}
            </div>

            <label className="block text-xs font-medium">Título
              <input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="Ex.: Casa ICF concluída em Chapecó" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" />
            </label>

            <label className="block text-xs font-medium">Informação principal
              <textarea value={form.summary} onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))} placeholder="Explique o que a IA deve saber e usar..." rows={4} className="mt-1 w-full resize-y rounded-lg border bg-background p-3 text-sm" />
            </label>

            <label className="block text-xs font-medium">Complementos
              <textarea value={form.details} onChange={(event) => setForm((value) => ({ ...value, details: event.target.value }))} placeholder="Aplicações, contexto, comprovações, restrições, resultados..." rows={3} className="mt-1 w-full resize-y rounded-lg border bg-background p-3 text-sm" />
            </label>

            <label className="block text-xs font-medium">Palavras-chave
              <input value={form.tags} onChange={(event) => setForm((value) => ({ ...value, tags: event.target.value }))} placeholder="produto, obra, equipe, aplicação, benefício" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" />
            </label>

            <div className="rounded-xl border border-dashed p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">Itens da Biblioteca de Mídias</p>
                  <p className="text-[11px] text-muted-foreground">Selecione fotos, vídeos, documentos ou referências relacionadas.</p>
                </div>
                <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">
                  <FilePlus2 className="h-3.5 w-3.5" /> Selecionar
                </button>
              </div>

              {pickedAssets.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {pickedAssets.slice(0, 9).map((asset) => (
                    <div key={asset.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                      <div className="aspect-square">
                        {asset.type === "image" ? <img src={mediaAssetUrl(asset.storageUrl)} alt={asset.originalFilename || "Imagem"} className="h-full w-full object-cover" /> : asset.type === "video" ? <video src={mediaAssetUrl(asset.storageUrl)} muted preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
                      </div>
                      <button type="button" onClick={() => removePickedAsset(asset.id)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white" title="Remover vínculo"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              ) : linkedCount > 0 ? (
                <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{linkedCount} item(ns) já vinculado(s). Toque em <strong>Selecionar</strong> para revisar, adicionar ou remover.</div>
              ) : (
                <div className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum item selecionado. O texto pode ser salvo sozinho, mas imagens e documentos deixam o contexto mais completo.</div>
              )}
            </div>

            <label className="block text-xs font-medium">Estado
              <select value={form.status} onChange={(event) => setForm((value) => ({ ...value, status: event.target.value as EntryStatus }))} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
                <option value="approved">Aprovada — IA pode usar</option>
                <option value="draft">Rascunho — IA não usa</option>
                <option value="archived">Arquivada</option>
              </select>
            </label>

            <button disabled={saving} type="button" onClick={() => void save()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Salvar alterações" : "Adicionar à Biblioteca"}
            </button>
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Contexto que a IA pode consultar</p>
                <p className="text-xs text-muted-foreground">Cada registro pode reunir texto + fotos + vídeos + documentos da Biblioteca de Mídias.</p>
              </div>
            </div>
            <label className="relative block sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar informação..." className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" /></label>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando...</div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed text-center">
              <BookOpen className="h-9 w-9 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhuma informação encontrada</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Adicione empresa, produtos, serviços, obras, projetos, equipe, cases, provas e referências para a IA produzir materiais menos genéricos.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map((entry) => (
                <article key={entry.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase">{KINDS.find(([value]) => value === entry.kind)?.[1] ?? entry.kind}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${entry.status === "approved" ? "bg-emerald-50 text-emerald-700" : entry.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground"}`}>{entry.status === "approved" ? "IA pode usar" : entry.status === "draft" ? "Rascunho" : "Arquivada"}</span>
                      </div>
                      <h2 className="mt-3 text-sm font-semibold">{entry.title}</h2>
                      <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
                      {!!entry.tags?.length && <div className="mt-3 flex flex-wrap gap-1">{entry.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">#{tag}</span>)}</div>}
                      {!!entry.assetIds?.length && <p className="mt-2 text-[10px] font-medium text-primary">{entry.assetIds.length} item(ns) da Biblioteca de Mídias vinculado(s)</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => edit(entry)} className="rounded-lg p-2 hover:bg-muted" title="Editar"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void remove(entry)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image", "video", "audio", "document"]}
        maxSelection={30}
        initialSelectedIds={form.assetIds}
        title="Selecionar itens da Biblioteca de Mídias"
        confirmLabel="Usar itens selecionados"
        onConfirm={applyPickedAssets}
      />
    </div>
  );
}
