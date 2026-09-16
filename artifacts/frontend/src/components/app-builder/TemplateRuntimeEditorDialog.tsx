import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import MobilePresetBlock from "@/pages/app-runtime/MobilePresetBlocks";
import {
  Columns3,
  GripVertical,
  Layers3,
  Loader2,
  Monitor,
  Plus,
  Save,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";

type JsonObject = Record<string, unknown>;
type BlockType = "hero" | "text" | "callout" | "metrics" | "list" | "cards" | "divider" | "action_form";
type Device = "desktop" | "tablet" | "mobile";
type VisibilityForm = { roles: string; permissions: string; permissionMode: "all" | "any" };
type BlockForm = { id: string; type: BlockType; visibility: VisibilityForm; props: JsonObject };
type PageForm = { id: string; title: string; subtitle: string; icon: string; navigationEmphasis: boolean; visibility: VisibilityForm; blocks: BlockForm[] };
type TemplateLike = { id: string; name: string };
type TemplateVersion = { id: string; templateId: string; version: number; status: string; definition: JsonObject };
type Props = { template: TemplateLike | null; token: string | null | undefined; open: boolean; onOpenChange: (open: boolean) => void };

type PresetOption = { value: string; label: string; description: string };

const BLOCKS: Array<{ type: BlockType; label: string; description: string }> = [
  { type: "hero", label: "Hero", description: "Título, texto e destaque principal" },
  { type: "text", label: "Texto", description: "Conteúdo textual" },
  { type: "callout", label: "Destaque", description: "Aviso ou mensagem importante" },
  { type: "metrics", label: "Métricas", description: "Indicadores e KPIs" },
  { type: "list", label: "Lista", description: "Itens em sequência" },
  { type: "cards", label: "Cards", description: "Conteúdo em cartões" },
  { type: "action_form", label: "Formulário", description: "Campos ligados a uma Action" },
  { type: "divider", label: "Divisor", description: "Separação visual" },
];

const MOBILE_PRESETS: Partial<Record<BlockType, PresetOption[]>> = {
  hero: [{ value: "promo_banner", label: "Banner promocional", description: "Banner principal com imagem, texto e CTA" }],
  metrics: [{ value: "savings", label: "Indicador principal", description: "Card destacado para economia, saldo ou outro KPI" }],
  cards: [
    { value: "quick_actions", label: "Acessos rápidos", description: "Atalhos em grade para ações principais" },
    { value: "product_grid", label: "Catálogo / ofertas", description: "Busca, categorias e grade de itens" },
    { value: "product_detail", label: "Detalhe de item", description: "Imagem, preço, descrição e ação principal" },
  ],
  list: [
    { value: "history", label: "Histórico", description: "Períodos, compras, agendamentos ou atividades" },
    { value: "notifications", label: "Notificações", description: "Central de alertas e atualizações" },
    { value: "profile_fields", label: "Perfil", description: "Foto e campos editáveis do usuário" },
    { value: "menu", label: "Menu", description: "Conta, preferências, suporte e legal" },
    { value: "stores", label: "Unidades / locais", description: "Busca e cards de unidades ou pontos de atendimento" },
  ],
  callout: [{ value: "empty_state", label: "Estado vazio", description: "Sem resultados, indisponível ou primeira utilização" }],
};

const ALL_PRESETS = new Set(Object.entries(MOBILE_PRESETS).flatMap(([type, options]) => (options ?? []).map((option) => `${type}:${option.value}`)));
const EDITABLE_PROP_KEYS = ["title", "subtitle", "body", "label", "value", "detail", "eyebrow", "imageUrl", "ctaLabel", "pageId", "brand", "oldPrice", "price", "discount", "expiry", "actionLabel", "avatarUrl", "searchPlaceholder", "version", "actionKey", "submitLabel", "successMessage"];

const EMPTY_VISIBILITY: VisibilityForm = { roles: "", permissions: "", permissionMode: "all" };
const asObject = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const asObjects = (value: unknown): JsonObject[] => Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const str = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const parseList = (value: string) => Array.from(new Set(value.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean)));
const id = (prefix: string) => `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

function visibilityFrom(value: unknown): VisibilityForm {
  const source = asObject(value);
  return { roles: list(source.roles).join(", "), permissions: list(source.permissions).join(", "), permissionMode: source.permissionMode === "any" ? "any" : "all" };
}
function visibilityTo(value: VisibilityForm) {
  const roles = parseList(value.roles); const permissions = parseList(value.permissions);
  return roles.length || permissions.length ? { roles, permissions, permissionMode: value.permissionMode } : undefined;
}
function defaultProps(type: BlockType): JsonObject {
  if (type === "hero") return { title: "Título principal", body: "Descrição principal desta página.", align: "left" };
  if (type === "text") return { title: "Título", body: "Conteúdo do bloco." };
  if (type === "callout") return { title: "Atenção", body: "Mensagem em destaque.", tone: "info" };
  if (type === "metrics") return { title: "Indicadores", items: [{ label: "Indicador", value: "0", detail: "" }] };
  if (type === "list") return { title: "Lista", items: [{ title: "Item", body: "Descrição" }] };
  if (type === "cards") return { title: "Cards", items: [{ title: "Card", body: "Descrição", badge: "" }] };
  if (type === "action_form") return { title: "Formulário", body: "", actionKey: "", submitLabel: "Enviar", successMessage: "Dados salvos com sucesso.", fields: [] };
  return { label: "" };
}

function presetDefaults(variant: string): JsonObject {
  if (variant === "promo_banner") return { title: "Destaque da semana", eyebrow: "Novidade", body: "Apresente aqui a principal campanha ou benefício para o cliente.", ctaLabel: "Ver detalhes", imageUrl: "" };
  if (variant === "savings") return { label: "Seu resultado", value: "R$ 0,00", detail: "Atualizado agora" };
  if (variant === "quick_actions") return { title: "Acesso rápido", items: [{ title: "Ofertas", icon: "tag" }, { title: "Histórico", icon: "compras" }, { title: "Benefícios", icon: "ticket" }, { title: "Minha conta", icon: "user" }] };
  if (variant === "product_grid") return { searchPlaceholder: "Buscar produto, serviço ou categoria", categories: ["Todos", "Categoria A", "Categoria B"], items: [{ title: "Item exemplo A", category: "Categoria A", imageUrl: "", oldPrice: "R$ 19,90", price: "R$ 14,90", discount: "25%", expiry: "Válido por 7 dias" }, { title: "Item exemplo B", category: "Categoria B", imageUrl: "", oldPrice: "R$ 29,90", price: "R$ 24,90", discount: "17%", expiry: "Válido por 7 dias" }] };
  if (variant === "product_detail") return { title: "Item exemplo", brand: "Marca exemplo", imageUrl: "", oldPrice: "R$ 29,90", price: "R$ 24,90", discount: "17%", expiry: "Válido por 7 dias", actionLabel: "Adicionar", body: "Descrição completa do item, serviço ou benefício." };
  if (variant === "history") return { items: [{ title: "Período atual", body: "8 registros", value: "R$ 287,56" }, { title: "Período anterior", body: "15 registros", value: "R$ 412,90" }, { title: "Últimos três meses", body: "32 registros", value: "R$ 1.024,30" }] };
  if (variant === "notifications") return { items: [{ title: "Novidade disponível", body: "Confira a atualização mais recente.", time: "10:24", icon: "bell", unread: true }, { title: "Atividade concluída", body: "Seu processo foi concluído com sucesso.", time: "09:18", icon: "compras", unread: false }] };
  if (variant === "profile_fields") return { title: "Cliente Exemplo", subtitle: "Documento: ***.***.***-**", avatarUrl: "", items: [{ label: "Como gostaria de ser chamado?", value: "Cliente" }, { label: "Nome completo", value: "Cliente Exemplo" }, { label: "E-mail", value: "cliente@exemplo.com" }, { label: "Celular", value: "(00) 00000-0000" }] };
  if (variant === "menu") return { version: "1.0.0", items: [{ title: "Minha conta", icon: "user" }, { title: "Minhas atividades", icon: "compras" }, { title: "Minhas preferências", icon: "settings" }, { title: "Notificações", icon: "bell" }, { title: "Nossas unidades", icon: "store" }, { title: "Dúvidas frequentes", icon: "help" }, { title: "Privacidade e LGPD", icon: "shield" }, { title: "Termos de uso", icon: "document" }] };
  if (variant === "stores") return { searchPlaceholder: "Buscar cidade, bairro ou unidade", items: [{ title: "Unidade Centro", address: "Av. Exemplo, 100 - Centro", status: "Aberto até 22h", distance: "1,8 km", favorite: true }, { title: "Unidade Norte", address: "Rua Modelo, 250 - Bairro Norte", status: "Aberto até 21h", distance: "4,3 km", favorite: false }] };
  if (variant === "empty_state") return { icon: "info", title: "Nada por aqui ainda", body: "Quando houver novos resultados, eles aparecerão nesta tela.", actionLabel: "Voltar ao início" };
  return {};
}

function normalize(definition: JsonObject) {
  const runtime = asObject(definition.runtime);
  const pages = asObjects(runtime.pages).map((page, pageIndex): PageForm => ({
    id: str(page.id) || `page-${pageIndex + 1}`,
    title: str(page.title) || `Página ${pageIndex + 1}`,
    subtitle: str(page.subtitle),
    icon: str(page.icon),
    navigationEmphasis: page.navigationEmphasis === true,
    visibility: visibilityFrom(page.visibility),
    blocks: asObjects(page.blocks).map((block, blockIndex) => ({
      id: str(block.id) || `block-${blockIndex + 1}`,
      type: (BLOCKS.some((item) => item.type === block.type) ? block.type : "text") as BlockType,
      visibility: visibilityFrom(block.visibility),
      props: { ...asObject(block.props) },
    })),
  }));
  const requested = str(runtime.defaultPageId);
  return { pages, defaultPageId: pages.some((page) => page.id === requested) ? requested : pages[0]?.id ?? "" };
}
function toBlock(block: BlockForm): JsonObject {
  const visibility = visibilityTo(block.visibility);
  return { id: block.id.trim(), type: block.type, props: block.props, ...(visibility ? { visibility } : {}) };
}
function toPage(page: PageForm): JsonObject {
  const visibility = visibilityTo(page.visibility);
  return { id: page.id.trim(), title: page.title.trim(), ...(page.subtitle.trim() ? { subtitle: page.subtitle.trim() } : {}), ...(page.icon.trim() ? { icon: page.icon.trim() } : {}), ...(page.navigationEmphasis ? { navigationEmphasis: true } : {}), blocks: page.blocks.map(toBlock), ...(visibility ? { visibility } : {}) };
}

export default function TemplateRuntimeEditorDialog({ template, token, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState("__empty__");
  const [sourceDefinition, setSourceDefinition] = useState<JsonObject>({});
  const [pages, setPages] = useState<PageForm[]>([]);
  const [defaultPageId, setDefaultPageId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [changeLog, setChangeLog] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dragPageId, setDragPageId] = useState<string | null>(null);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão SuperAdmin não disponível.");
    const response = await fetch(`/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) } });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload && payload.error ? String(payload.error) : `Falha na operação (${response.status})`);
    return payload as T;
  }, [token]);

  function hydrate(definition: JsonObject, versionId: string) {
    const normalized = normalize(definition);
    setSourceDefinition(definition);
    setPages(normalized.pages);
    setDefaultPageId(normalized.defaultPageId);
    setSelectedPageId(normalized.pages[0]?.id ?? "");
    setSelectedBlockId(normalized.pages[0]?.blocks[0]?.id ?? "");
    setSourceVersionId(versionId);
  }
  const load = useCallback(async () => {
    if (!template || !open) return;
    setLoading(true);
    try {
      const rows = await request<TemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`);
      setVersions(rows);
      rows[0] ? hydrate(rows[0].definition ?? {}, rows[0].id) : hydrate({}, "__empty__");
    } catch (error) {
      toast({ title: "Não foi possível carregar o editor", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setLoading(false); }
  }, [open, request, template, toast]);
  useEffect(() => { if (open) { setChangeLog(""); void load(); } }, [load, open]);

  const page = useMemo(() => pages.find((item) => item.id === selectedPageId) ?? null, [pages, selectedPageId]);
  const block = useMemo(() => page?.blocks.find((item) => item.id === selectedBlockId) ?? null, [page, selectedBlockId]);

  function chooseSource(versionId: string) {
    if (versionId === "__empty__") return hydrate({}, versionId);
    const version = versions.find((item) => item.id === versionId); if (version) hydrate(version.definition ?? {}, version.id);
  }
  function addPage() {
    const next: PageForm = { id: id("page"), title: "Nova página", subtitle: "", icon: "", navigationEmphasis: false, visibility: { ...EMPTY_VISIBILITY }, blocks: [] };
    setPages((current) => [...current, next]); setSelectedPageId(next.id); setSelectedBlockId(""); if (!defaultPageId) setDefaultPageId(next.id);
  }
  function addBlock(type: BlockType) {
    if (!page) return;
    const next: BlockForm = { id: id(type), type, visibility: { ...EMPTY_VISIBILITY }, props: defaultProps(type) };
    setPages((current) => current.map((item) => item.id === page.id ? { ...item, blocks: [...item.blocks, next] } : item)); setSelectedBlockId(next.id);
  }
  function patchPage(patch: Partial<PageForm>) {
    if (!page) return; const oldId = page.id; const nextId = patch.id ?? oldId;
    setPages((current) => current.map((item) => {
      if (item.id === oldId) return { ...item, ...patch };
      if (patch.navigationEmphasis === true) return { ...item, navigationEmphasis: false };
      return item;
    }));
    if (patch.id && patch.id !== oldId) { setSelectedPageId(nextId); if (defaultPageId === oldId) setDefaultPageId(nextId); }
  }
  function patchBlock(patch: Partial<BlockForm>) {
    if (!page || !block) return;
    setPages((current) => current.map((item) => item.id === page.id ? { ...item, blocks: item.blocks.map((candidate) => candidate.id === block.id ? { ...candidate, ...patch } : candidate) } : item));
  }
  const patchProp = (key: string, value: unknown) => block && patchBlock({ props: { ...block.props, [key]: value } });

  function dropPage(targetId: string) {
    if (!dragPageId || dragPageId === targetId) return;
    setPages((current) => { const source = current.findIndex((item) => item.id === dragPageId); const target = current.findIndex((item) => item.id === targetId); const copy = [...current]; const [moved] = copy.splice(source, 1); copy.splice(target, 0, moved); return copy; });
    setDragPageId(null);
  }
  function dropBlock(targetId: string) {
    if (!page || !dragBlockId || dragBlockId === targetId) return;
    setPages((current) => current.map((item) => {
      if (item.id !== page.id) return item;
      const source = item.blocks.findIndex((candidate) => candidate.id === dragBlockId); const target = item.blocks.findIndex((candidate) => candidate.id === targetId); const blocks = [...item.blocks]; const [moved] = blocks.splice(source, 1); blocks.splice(target, 0, moved); return { ...item, blocks };
    }));
    setDragBlockId(null);
  }

  async function saveVersion() {
    if (!template) return;
    const pageIds = pages.map((item) => item.id.trim());
    if (!pageIds.length || pageIds.some((value) => !value) || new Set(pageIds).size !== pageIds.length || pages.some((item) => !item.title.trim())) {
      toast({ title: "Revise IDs e títulos das páginas antes de salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const definition = JSON.parse(JSON.stringify(sourceDefinition ?? {})) as JsonObject;
      definition.runtime = { version: 1, defaultPageId: defaultPageId || pages[0]?.id || null, pages: pages.map(toPage) };
      const created = await request<TemplateVersion>(`/admin/app-builder/templates/${template.id}/versions`, { method: "POST", body: JSON.stringify({ definition, changeLog: changeLog.trim() || "Layout atualizado no editor visual" }) });
      toast({ title: `Versão ${created.version} criada`, description: "A nova versão ficou em rascunho. Publique somente após revisar o preview." }); setChangeLog(""); await load();
    } catch (error) { toast({ title: "Erro ao salvar versão", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  const previewWidth = device === "mobile" ? "390px" : device === "tablet" ? "768px" : "100%";

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-[98vw] xl:max-w-[1500px]">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" />Editor visual · {template?.name ?? "Template"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[240px_1fr]">
        <div><p className="mb-1 text-xs font-medium text-muted-foreground">Base</p><Select value={sourceVersionId} onValueChange={chooseSource} disabled={loading}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__empty__">Começar vazio</SelectItem>{versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}</SelectContent></Select></div>
        <div><p className="mb-1 text-xs font-medium text-muted-foreground">Registro da alteração</p><Input value={changeLog} onChange={(event) => setChangeLog(event.target.value)} placeholder="Ex.: reorganiza home e melhora experiência mobile" /></div>
      </div>

      {loading ? <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="grid min-h-[650px] gap-3 xl:grid-cols-[210px_220px_minmax(420px,1fr)_300px]">
        <aside className="rounded-xl border bg-muted/10 p-3">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Páginas</p><Button size="icon" variant="outline" className="h-8 w-8" onClick={addPage}><Plus className="h-4 w-4" /></Button></div>
          <div className="mt-3 space-y-2">{pages.map((item) => <div key={item.id} draggable onDragStart={() => setDragPageId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropPage(item.id)} className={`rounded-lg border p-2 ${item.id === selectedPageId ? "border-primary bg-primary/5" : "bg-card"}`}><button className="flex w-full items-center gap-2 text-left" onClick={() => { setSelectedPageId(item.id); setSelectedBlockId(item.blocks[0]?.id ?? ""); }}><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="flex items-center gap-1 truncate text-sm font-medium">{item.title}{item.navigationEmphasis && <Badge variant="secondary" className="text-[8px]">central</Badge>}</span><span className="block truncate font-mono text-[10px] text-muted-foreground">{item.icon ? `${item.id} · ${item.icon}` : item.id}</span></span></button></div>)}</div>
        </aside>

        <aside className="rounded-xl border bg-muted/10 p-3">
          <p className="text-sm font-semibold">Biblioteca</p><p className="mt-1 text-[11px] text-muted-foreground">Clique para inserir na página selecionada. Depois escolha o layout mobile nas propriedades.</p>
          <div className="mt-3 grid gap-2">{BLOCKS.map((item) => <button key={item.type} type="button" disabled={!page} onClick={() => addBlock(item.type)} className="rounded-lg border bg-card p-2 text-left transition hover:border-primary disabled:opacity-40"><span className="text-xs font-semibold">{item.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{item.description}</span>{(MOBILE_PRESETS[item.type]?.length ?? 0) > 0 && <Badge variant="secondary" className="mt-1 text-[9px]">{MOBILE_PRESETS[item.type]?.length} layout(s) mobile</Badge>}</button>)}</div>
        </aside>

        <section className="rounded-xl border bg-muted/20 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Canvas</p><p className="text-[11px] text-muted-foreground">Arraste os blocos para reorganizar.</p></div><div className="flex rounded-lg border bg-card p-1"><Button size="icon" variant={device === "desktop" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setDevice("desktop")}><Monitor className="h-4 w-4" /></Button><Button size="icon" variant={device === "tablet" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setDevice("tablet")}><Tablet className="h-4 w-4" /></Button><Button size="icon" variant={device === "mobile" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setDevice("mobile")}><Smartphone className="h-4 w-4" /></Button></div></div>
          <div className="mx-auto min-h-[540px] rounded-xl border bg-background p-4 shadow-sm transition-all" style={{ width: previewWidth, maxWidth: "100%" }}>
            {!page ? <div className="flex h-[500px] items-center justify-center text-sm text-muted-foreground">Crie ou selecione uma página.</div> : <><div className="mb-5"><h2 className="text-xl font-bold">{page.title}</h2>{page.subtitle && <p className="mt-1 text-sm text-muted-foreground">{page.subtitle}</p>}</div><div className="space-y-3">{page.blocks.map((item) => <div key={item.id} draggable onDragStart={() => setDragBlockId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropBlock(item.id)} onClick={() => setSelectedBlockId(item.id)} className={`cursor-pointer rounded-xl border p-3 ${item.id === selectedBlockId ? "border-primary ring-2 ring-primary/10" : "bg-card"}`}><div className="mb-2 flex items-center gap-2"><GripVertical className="h-4 w-4 text-muted-foreground" /><Badge variant="outline" className="text-[10px]">{BLOCKS.find((candidate) => candidate.type === item.type)?.label}</Badge>{str(item.props.variant) && <Badge variant="secondary" className="text-[9px]">{str(item.props.variant)}</Badge>}</div><BlockPreview block={item} /></div>)}{page.blocks.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Adicione blocos pela biblioteca.</div>}</div></>}
          </div>
        </section>

        <aside className="rounded-xl border bg-card p-3">
          <div className="flex items-center gap-2"><Columns3 className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Propriedades</p></div>
          {!page ? <p className="mt-4 text-xs text-muted-foreground">Selecione uma página.</p> : !block ? <PageProperties page={page} defaultPageId={defaultPageId} pages={pages} onPatch={patchPage} onDefault={setDefaultPageId} onDelete={() => { const remaining = pages.filter((item) => item.id !== page.id); setPages(remaining); setSelectedPageId(remaining[0]?.id ?? ""); setSelectedBlockId(remaining[0]?.blocks[0]?.id ?? ""); if (defaultPageId === page.id) setDefaultPageId(remaining[0]?.id ?? ""); }} /> : <BlockProperties block={block} onPatch={patchBlock} onProp={patchProp} onDelete={() => { if (!page) return; const remaining = page.blocks.filter((item) => item.id !== block.id); setPages((current) => current.map((item) => item.id === page.id ? { ...item, blocks: remaining } : item)); setSelectedBlockId(remaining[0]?.id ?? ""); }} />}
        </aside>
      </div>}

      <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button><Button onClick={() => void saveVersion()} disabled={saving || loading || pages.length === 0}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar nova versão</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function PageProperties({ page, defaultPageId, pages, onPatch, onDefault, onDelete }: { page: PageForm; defaultPageId: string; pages: PageForm[]; onPatch: (patch: Partial<PageForm>) => void; onDefault: (value: string) => void; onDelete: () => void }) {
  return <div className="mt-4 space-y-3"><label className="block space-y-1"><span className="text-xs">ID</span><Input value={page.id} onChange={(e) => onPatch({ id: e.target.value })} /></label><label className="block space-y-1"><span className="text-xs">Título</span><Input value={page.title} onChange={(e) => onPatch({ title: e.target.value })} /></label><label className="block space-y-1"><span className="text-xs">Subtítulo</span><Input value={page.subtitle} onChange={(e) => onPatch({ subtitle: e.target.value })} /></label><label className="block space-y-1"><span className="text-xs">Ícone da navegação</span><Input value={page.icon} onChange={(e) => onPatch({ icon: e.target.value })} placeholder="Ex.: home, search, tag, bell, user, menu" /><span className="text-[10px] leading-4 text-muted-foreground">Usado na barra inferior quando não houver navegação personalizada.</span></label><label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={page.navigationEmphasis} onChange={(e) => onPatch({ navigationEmphasis: e.target.checked })} /><span><span className="block text-xs font-medium">Destacar como ação central</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Exibe esta página como botão circular elevado no menu inferior. Apenas uma página pode ficar destacada.</span></span></label><label className="block space-y-1"><span className="text-xs">Página inicial</span><Select value={defaultPageId || page.id} onValueChange={onDefault}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pages.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent></Select></label><Visibility value={page.visibility} onChange={(visibility) => onPatch({ visibility })} /><Button variant="destructive" className="w-full" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Remover página</Button></div>;
}

function BlockProperties({ block, onPatch, onProp, onDelete }: { block: BlockForm; onPatch: (patch: Partial<BlockForm>) => void; onProp: (key: string, value: unknown) => void; onDelete: () => void }) {
  const presets = MOBILE_PRESETS[block.type] ?? [];
  const variant = str(block.props.variant);
  function choosePreset(value: string) {
    if (value === "__standard__") {
      const next = { ...block.props };
      delete next.variant;
      onPatch({ props: next });
      return;
    }
    onPatch({ props: { ...block.props, ...presetDefaults(value), variant: value } });
  }
  return <div className="mt-4 space-y-3"><label className="block space-y-1"><span className="text-xs">ID</span><Input value={block.id} onChange={(e) => onPatch({ id: e.target.value })} /></label>{presets.length > 0 && <label className="block space-y-1"><span className="text-xs">Layout mobile</span><Select value={variant || "__standard__"} onValueChange={choosePreset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__standard__">Padrão genérico</SelectItem>{presets.map((preset) => <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>)}</SelectContent></Select>{variant && <p className="text-[10px] leading-4 text-muted-foreground">{presets.find((item) => item.value === variant)?.description}</p>}</label>}{EDITABLE_PROP_KEYS.map((key) => key in block.props ? <label key={key} className="block space-y-1"><span className="text-xs">{key}</span>{key === "body" ? <Textarea value={str(block.props[key])} onChange={(e) => onProp(key, e.target.value)} /> : <Input value={str(block.props[key])} onChange={(e) => onProp(key, e.target.value)} />}</label> : null)}{Array.isArray(block.props.categories) && <label className="block space-y-1"><span className="text-xs">Categorias</span><Input value={list(block.props.categories).join(", ")} onChange={(e) => onProp("categories", parseList(e.target.value))} /></label>}{Array.isArray(block.props.items) && <label className="block space-y-1"><span className="text-xs">Itens (JSON)</span><Textarea rows={10} value={JSON.stringify(block.props.items, null, 2)} onChange={(e) => { try { onProp("items", JSON.parse(e.target.value)); } catch { /* mantém último JSON válido */ } }} /></label>}<Visibility value={block.visibility} onChange={(visibility) => onPatch({ visibility })} /><Button variant="destructive" className="w-full" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Remover bloco</Button></div>;
}

function Visibility({ value, onChange }: { value: VisibilityForm; onChange: (value: VisibilityForm) => void }) {
  return <div className="space-y-2 rounded-lg border p-2"><p className="text-[11px] font-medium">Visibilidade</p><Input placeholder="Papéis: admin, vendedor" value={value.roles} onChange={(e) => onChange({ ...value, roles: e.target.value })} /><Input placeholder="Permissões" value={value.permissions} onChange={(e) => onChange({ ...value, permissions: e.target.value })} /></div>;
}

function BlockPreview({ block }: { block: BlockForm }) {
  const title = str(block.props.title); const body = str(block.props.body); const items = asObjects(block.props.items); const variant = str(block.props.variant);
  if (variant && ALL_PRESETS.has(`${block.type}:${variant}`)) return <MobilePresetBlock blockId={block.id} type={block.type} props={block.props} />;
  if (block.type === "divider") return <hr />;
  if (block.type === "metrics") return <div><p className="font-semibold">{title}</p><div className="mt-2 grid grid-cols-2 gap-2">{items.map((item, index) => <div key={index} className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">{str(item.label)}</p><p className="text-lg font-semibold">{str(item.value)}</p></div>)}</div></div>;
  if (block.type === "cards" || block.type === "list") return <div><p className="font-semibold">{title}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{items.map((item, index) => <div key={index} className="rounded-lg bg-muted p-2"><p className="text-sm font-medium">{str(item.title)}</p><p className="text-xs text-muted-foreground">{str(item.body)}</p></div>)}</div></div>;
  if (block.type === "action_form") return <div><p className="font-semibold">{title || "Formulário"}</p><p className="text-sm text-muted-foreground">{body}</p><Button size="sm" className="mt-2" disabled>{str(block.props.submitLabel) || "Enviar"}</Button></div>;
  return <div><p className={block.type === "hero" ? "text-xl font-bold" : "font-semibold"}>{title}</p>{body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}</div>;
}
