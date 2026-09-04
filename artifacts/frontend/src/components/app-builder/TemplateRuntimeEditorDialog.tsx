import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Layers3, Loader2, Plus, Save, Trash2 } from "lucide-react";

type JsonObject = Record<string, unknown>;
type BlockType = "hero" | "text" | "callout" | "metrics" | "list" | "cards" | "divider";
type PermissionMode = "all" | "any";

type TemplateLike = { id: string; name: string };
type TemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  definition: JsonObject;
  changeLog?: string | null;
  publishedAt?: string | null;
};

type VisibilityForm = { roles: string; permissions: string; permissionMode: PermissionMode };
type BlockForm = { id: string; type: BlockType; visibility: VisibilityForm; props: JsonObject };
type PageForm = { id: string; title: string; subtitle: string; visibility: VisibilityForm; blocks: BlockForm[] };

type Props = {
  template: TemplateLike | null;
  token: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const BLOCK_LABEL: Record<BlockType, string> = {
  hero: "Hero",
  text: "Texto",
  callout: "Destaque / alerta",
  metrics: "Métricas",
  list: "Lista",
  cards: "Cards",
  divider: "Divisor",
};

const EMPTY_VISIBILITY: VisibilityForm = { roles: "", permissions: "", permissionMode: "all" };

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function parseList(value: string) {
  return Array.from(new Set(value.split(/[\n,]/g).map((item) => item.trim()).filter(Boolean)));
}

function newId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${suffix}`;
}

function visibilityFrom(value: unknown): VisibilityForm {
  const source = asObject(value);
  return {
    roles: stringArray(source.roles).join(", "),
    permissions: stringArray(source.permissions).join(", "),
    permissionMode: source.permissionMode === "any" ? "any" : "all",
  };
}

function visibilityTo(value: VisibilityForm) {
  const roles = parseList(value.roles);
  const permissions = parseList(value.permissions);
  if (roles.length === 0 && permissions.length === 0) return undefined;
  return { roles, permissions, permissionMode: value.permissionMode };
}

function normalizeBlock(value: unknown, index: number): BlockForm | null {
  const source = asObject(value);
  const type = stringValue(source.type) as BlockType;
  if (!Object.prototype.hasOwnProperty.call(BLOCK_LABEL, type)) return null;
  const props = { ...asObject(source.props) };
  if (Array.isArray(props.items)) props.items = objectArray(props.items).map((item) => ({ ...item }));
  return {
    id: stringValue(source.id) || `block-${index + 1}`,
    type,
    visibility: visibilityFrom(source.visibility),
    props,
  };
}

function normalizePages(definition: JsonObject): { pages: PageForm[]; defaultPageId: string } {
  const runtime = asObject(definition.runtime);
  const pages = objectArray(runtime.pages).map((page, pageIndex) => ({
    id: stringValue(page.id) || `page-${pageIndex + 1}`,
    title: stringValue(page.title) || `Página ${pageIndex + 1}`,
    subtitle: stringValue(page.subtitle),
    visibility: visibilityFrom(page.visibility),
    blocks: objectArray(page.blocks).map((block, blockIndex) => normalizeBlock(block, blockIndex)).filter((block): block is BlockForm => Boolean(block)),
  }));
  const requestedDefault = stringValue(runtime.defaultPageId);
  return {
    pages,
    defaultPageId: pages.some((page) => page.id === requestedDefault) ? requestedDefault : pages[0]?.id ?? "",
  };
}

function blockToJson(block: BlockForm): JsonObject {
  const visibility = visibilityTo(block.visibility);
  return {
    id: block.id.trim(),
    type: block.type,
    props: block.props,
    ...(visibility ? { visibility } : {}),
  };
}

function pageToJson(page: PageForm): JsonObject {
  const visibility = visibilityTo(page.visibility);
  return {
    id: page.id.trim(),
    title: page.title.trim(),
    ...(page.subtitle.trim() ? { subtitle: page.subtitle.trim() } : {}),
    blocks: page.blocks.map(blockToJson),
    ...(visibility ? { visibility } : {}),
  };
}

function defaultProps(type: BlockType): JsonObject {
  if (type === "hero") return { title: "Título principal", body: "Descrição principal desta página.", align: "left" };
  if (type === "text") return { title: "Título", body: "Conteúdo do bloco." };
  if (type === "callout") return { title: "Atenção", body: "Mensagem em destaque.", tone: "info" };
  if (type === "metrics") return { title: "Indicadores", items: [{ label: "Indicador", value: "0", detail: "" }] };
  if (type === "list") return { title: "Lista", items: [{ label: "", title: "Item", body: "Descrição" }] };
  if (type === "cards") return { title: "Cards", items: [{ badge: "", title: "Card", body: "Descrição", imageUrl: "" }] };
  return { label: "" };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  return copy;
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
  const [newBlockType, setNewBlockType] = useState<BlockType>("hero");
  const [changeLog, setChangeLog] = useState("");

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error("Sessão SuperAdmin não disponível.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload && payload.error ? String(payload.error) : `Falha na operação (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  function hydrate(definition: JsonObject, versionId: string) {
    const normalized = normalizePages(definition);
    setSourceDefinition(definition);
    setPages(normalized.pages);
    setDefaultPageId(normalized.defaultPageId);
    setSelectedPageId(normalized.pages[0]?.id ?? "");
    setSelectedBlockId(normalized.pages[0]?.blocks[0]?.id ?? "");
    setSourceVersionId(versionId);
  }

  const loadVersions = useCallback(async () => {
    if (!template || !open) return;
    setLoading(true);
    try {
      const rows = await requestJson<TemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`);
      setVersions(rows);
      if (rows[0]) hydrate(rows[0].definition ?? {}, rows[0].id);
      else hydrate({}, "__empty__");
    } catch (error) {
      toast({ title: "Não foi possível carregar as versões", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [open, requestJson, template, toast]);

  useEffect(() => {
    if (!open) return;
    setChangeLog("");
    void loadVersions();
  }, [loadVersions, open]);

  const selectedPage = useMemo(() => pages.find((page) => page.id === selectedPageId) ?? null, [pages, selectedPageId]);
  const selectedBlock = useMemo(() => selectedPage?.blocks.find((block) => block.id === selectedBlockId) ?? null, [selectedBlockId, selectedPage]);

  function chooseSource(versionId: string) {
    if (versionId === "__empty__") {
      hydrate({}, versionId);
      return;
    }
    const version = versions.find((item) => item.id === versionId);
    if (version) hydrate(version.definition ?? {}, version.id);
  }

  function updatePage(patch: Partial<PageForm>) {
    if (!selectedPage) return;
    const oldId = selectedPage.id;
    const nextId = patch.id ?? oldId;
    setPages((current) => current.map((page) => page.id === oldId ? { ...page, ...patch } : page));
    if (patch.id && patch.id !== oldId) {
      setSelectedPageId(nextId);
      if (defaultPageId === oldId) setDefaultPageId(nextId);
    }
  }

  function addPage() {
    const page: PageForm = { id: newId("page"), title: "Nova página", subtitle: "", visibility: { ...EMPTY_VISIBILITY }, blocks: [] };
    setPages((current) => [...current, page]);
    setSelectedPageId(page.id);
    setSelectedBlockId("");
    if (!defaultPageId) setDefaultPageId(page.id);
  }

  function removePage() {
    if (!selectedPage) return;
    const remaining = pages.filter((page) => page.id !== selectedPage.id);
    setPages(remaining);
    setSelectedPageId(remaining[0]?.id ?? "");
    setSelectedBlockId(remaining[0]?.blocks[0]?.id ?? "");
    if (defaultPageId === selectedPage.id) setDefaultPageId(remaining[0]?.id ?? "");
  }

  function movePage(index: number, direction: -1 | 1) {
    setPages((current) => moveItem(current, index, direction));
  }

  function addBlock() {
    if (!selectedPage) return;
    const block: BlockForm = { id: newId(newBlockType), type: newBlockType, visibility: { ...EMPTY_VISIBILITY }, props: defaultProps(newBlockType) };
    setPages((current) => current.map((page) => page.id === selectedPage.id ? { ...page, blocks: [...page.blocks, block] } : page));
    setSelectedBlockId(block.id);
  }

  function updateBlock(patch: Partial<BlockForm>) {
    if (!selectedPage || !selectedBlock) return;
    setPages((current) => current.map((page) => page.id === selectedPage.id ? { ...page, blocks: page.blocks.map((block) => block.id === selectedBlock.id ? { ...block, ...patch } : block) } : page));
  }

  function updateBlockProp(key: string, value: unknown) {
    if (!selectedBlock) return;
    updateBlock({ props: { ...selectedBlock.props, [key]: value } });
  }

  function updateBlockItem(index: number, key: string, value: string) {
    if (!selectedBlock) return;
    const items = objectArray(selectedBlock.props.items).map((item) => ({ ...item }));
    items[index] = { ...items[index], [key]: value };
    updateBlockProp("items", items);
  }

  function addBlockItem() {
    if (!selectedBlock) return;
    const items = objectArray(selectedBlock.props.items).map((item) => ({ ...item }));
    if (selectedBlock.type === "metrics") items.push({ label: "Indicador", value: "0", detail: "" });
    if (selectedBlock.type === "list") items.push({ label: "", title: "Item", body: "" });
    if (selectedBlock.type === "cards") items.push({ badge: "", title: "Card", body: "", imageUrl: "" });
    updateBlockProp("items", items);
  }

  function removeBlockItem(index: number) {
    if (!selectedBlock) return;
    updateBlockProp("items", objectArray(selectedBlock.props.items).filter((_, itemIndex) => itemIndex !== index));
  }

  function moveBlock(blockIndex: number, direction: -1 | 1) {
    if (!selectedPage) return;
    setPages((current) => current.map((page) => page.id === selectedPage.id ? { ...page, blocks: moveItem(page.blocks, blockIndex, direction) } : page));
  }

  function removeBlock() {
    if (!selectedPage || !selectedBlock) return;
    const remaining = selectedPage.blocks.filter((block) => block.id !== selectedBlock.id);
    setPages((current) => current.map((page) => page.id === selectedPage.id ? { ...page, blocks: remaining } : page));
    setSelectedBlockId(remaining[0]?.id ?? "");
  }

  async function saveVersion() {
    if (!template) return;
    const pageIds = pages.map((page) => page.id.trim());
    if (pageIds.some((id) => !id)) {
      toast({ title: "Todas as páginas precisam de um ID", variant: "destructive" });
      return;
    }
    if (new Set(pageIds).size !== pageIds.length) {
      toast({ title: "Os IDs das páginas precisam ser únicos", variant: "destructive" });
      return;
    }
    if (pages.some((page) => !page.title.trim())) {
      toast({ title: "Todas as páginas precisam de título", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const definition = JSON.parse(JSON.stringify(sourceDefinition ?? {})) as JsonObject;
      definition.runtime = {
        version: 1,
        defaultPageId: defaultPageId || pages[0]?.id || null,
        pages: pages.map(pageToJson),
      };
      const created = await requestJson<TemplateVersion>(`/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ definition, changeLog: changeLog.trim() || "Runtime atualizado pelo editor visual" }),
      });
      toast({ title: `Versão ${created.version} criada em rascunho`, description: "Revise e publique em Versões quando estiver pronta para originar novos apps." });
      setChangeLog("");
      await loadVersions();
    } catch (error) {
      toast({ title: "Erro ao criar versão", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const selectedItems = selectedBlock ? objectArray(selectedBlock.props.items) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[96vw] xl:max-w-7xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers3 className="h-5 w-5 text-primary" />Editor visual · {template?.name ?? "Template"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-[260px_1fr]">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Usar como base</p>
              <Select value={sourceVersionId} onValueChange={chooseSource} disabled={loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Começar vazio</SelectItem>
                  {versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Registro da alteração</p>
              <Input value={changeLog} onChange={(event) => setChangeLog(event.target.value)} placeholder="Ex.: reorganiza home e adiciona indicadores" />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Este editor nunca altera uma versão existente. Salvar sempre cria uma nova versão em rascunho e preserva as demais chaves da Definition de origem.</p>
        </div>

        {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="grid min-h-[560px] gap-4 lg:grid-cols-[220px_260px_minmax(0,1fr)]">
            <aside className="rounded-xl border bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Páginas</p><Button size="icon" variant="outline" className="h-8 w-8" onClick={addPage}><Plus className="h-3.5 w-3.5" /></Button></div>
              <div className="mt-3 space-y-2">
                {pages.map((page, index) => (
                  <div key={`${page.id}-${index}`} className={`rounded-lg border p-2 ${page.id === selectedPageId ? "border-primary bg-primary/5" : "bg-card"}`}>
                    <button type="button" className="w-full text-left" onClick={() => { setSelectedPageId(page.id); setSelectedBlockId(page.blocks[0]?.id ?? ""); }}><p className="truncate text-sm font-medium">{page.title}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{page.id}</p></button>
                    <div className="mt-2 flex gap-1"><Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => movePage(index, -1)}><ArrowUp className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === pages.length - 1} onClick={() => movePage(index, 1)}><ArrowDown className="h-3 w-3" /></Button>{defaultPageId === page.id && <Badge variant="secondary" className="ml-auto text-[9px]">Inicial</Badge>}</div>
                  </div>
                ))}
                {pages.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Adicione a primeira página.</p>}
              </div>
            </aside>

            <aside className="rounded-xl border bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Blocos</p>{selectedPage && <Badge variant="outline" className="text-[9px]">{selectedPage.blocks.length}</Badge>}</div>
              {selectedPage && <div className="mt-3 flex gap-2"><Select value={newBlockType} onValueChange={(value) => setNewBlockType(value as BlockType)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(BLOCK_LABEL) as BlockType[]).map((type) => <SelectItem key={type} value={type}>{BLOCK_LABEL[type]}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-8" onClick={addBlock}><Plus className="h-3.5 w-3.5" /></Button></div>}
              <div className="mt-3 space-y-2">
                {selectedPage?.blocks.map((block, index) => (
                  <div key={block.id} className={`rounded-lg border p-2 ${block.id === selectedBlockId ? "border-primary bg-primary/5" : "bg-card"}`}>
                    <button type="button" className="w-full text-left" onClick={() => setSelectedBlockId(block.id)}><p className="text-xs font-semibold">{BLOCK_LABEL[block.type]}</p><p className="truncate font-mono text-[9px] text-muted-foreground">{block.id}</p></button>
                    <div className="mt-1 flex gap-1"><Button size="icon" variant="ghost" className="h-6 w-6" disabled={index === 0} onClick={() => moveBlock(index, -1)}><ArrowUp className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-6 w-6" disabled={index === selectedPage.blocks.length - 1} onClick={() => moveBlock(index, 1)}><ArrowDown className="h-3 w-3" /></Button></div>
                  </div>
                ))}
                {selectedPage && selectedPage.blocks.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Adicione um bloco.</p>}
              </div>
            </aside>

            <section className="space-y-4 rounded-xl border bg-card p-4">
              {!selectedPage ? <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">Selecione ou crie uma página.</div> : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Configuração da página</p><p className="text-[11px] text-muted-foreground">IDs estáveis facilitam navegação entre App Instances.</p></div><Button size="sm" variant="destructive" onClick={removePage}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover página</Button></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1"><span className="text-xs font-medium">ID</span><Input value={selectedPage.id} onChange={(event) => updatePage({ id: event.target.value })} /></label>
                    <label className="space-y-1"><span className="text-xs font-medium">Página inicial</span><Select value={defaultPageId || selectedPage.id} onValueChange={setDefaultPageId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pages.map((page) => <SelectItem key={page.id} value={page.id}>{page.title}</SelectItem>)}</SelectContent></Select></label>
                    <label className="space-y-1"><span className="text-xs font-medium">Título</span><Input value={selectedPage.title} onChange={(event) => updatePage({ title: event.target.value })} /></label>
                    <label className="space-y-1"><span className="text-xs font-medium">Subtítulo</span><Input value={selectedPage.subtitle} onChange={(event) => updatePage({ subtitle: event.target.value })} /></label>
                  </div>
                  <VisibilityEditor value={selectedPage.visibility} onChange={(visibility) => updatePage({ visibility })} label="Visibilidade da página" />

                  {selectedBlock && <div className="border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{BLOCK_LABEL[selectedBlock.type]}</p><p className="font-mono text-[10px] text-muted-foreground">{selectedBlock.id}</p></div><Button size="sm" variant="destructive" onClick={removeBlock}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover bloco</Button></div>
                    <div className="mt-4 space-y-3">
                      <label className="block space-y-1"><span className="text-xs font-medium">ID do bloco</span><Input value={selectedBlock.id} onChange={(event) => updateBlock({ id: event.target.value })} /></label>
                      <BlockFields block={selectedBlock} onProp={updateBlockProp} />
                      {(selectedBlock.type === "metrics" || selectedBlock.type === "list" || selectedBlock.type === "cards") && <ItemsEditor type={selectedBlock.type} items={selectedItems} onChange={updateBlockItem} onAdd={addBlockItem} onRemove={removeBlockItem} />}
                      <VisibilityEditor value={selectedBlock.visibility} onChange={(visibility) => updateBlock({ visibility })} label="Visibilidade do bloco" />
                    </div>
                  </div>}
                </>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => void saveVersion()} disabled={saving || loading || !template}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Criar nova versão em rascunho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityEditor({ value, onChange, label }: { value: VisibilityForm; onChange: (value: VisibilityForm) => void; label: string }) {
  return <div className="rounded-lg border bg-muted/10 p-3"><p className="text-xs font-semibold">{label}</p><div className="mt-2 grid gap-3 md:grid-cols-3"><label className="space-y-1"><span className="text-[11px] text-muted-foreground">Papéis permitidos</span><Input value={value.roles} onChange={(event) => onChange({ ...value, roles: event.target.value })} placeholder="customer, manager" /></label><label className="space-y-1"><span className="text-[11px] text-muted-foreground">Permissões exigidas</span><Input value={value.permissions} onChange={(event) => onChange({ ...value, permissions: event.target.value })} placeholder="orders.read, support.create" /></label><label className="space-y-1"><span className="text-[11px] text-muted-foreground">Modo das permissões</span><Select value={value.permissionMode} onValueChange={(permissionMode) => onChange({ ...value, permissionMode: permissionMode as PermissionMode })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="any">Qualquer uma</SelectItem></SelectContent></Select></label></div></div>;
}

function BlockFields({ block, onProp }: { block: BlockForm; onProp: (key: string, value: unknown) => void }) {
  const props = block.props;
  if (block.type === "hero") return <div className="grid gap-3 md:grid-cols-2"><Field label="Título" value={stringValue(props.title)} onChange={(value) => onProp("title", value)} /><Field label="Eyebrow" value={stringValue(props.eyebrow)} onChange={(value) => onProp("eyebrow", value)} /><Field label="Badge" value={stringValue(props.badge)} onChange={(value) => onProp("badge", value)} /><Field label="Imagem URL" value={stringValue(props.imageUrl)} onChange={(value) => onProp("imageUrl", value)} /><label className="space-y-1"><span className="text-xs font-medium">Alinhamento</span><Select value={props.align === "center" ? "center" : "left"} onValueChange={(value) => onProp("align", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="left">Esquerda</SelectItem><SelectItem value="center">Centro</SelectItem></SelectContent></Select></label><LongField label="Texto" value={stringValue(props.body)} onChange={(value) => onProp("body", value)} /></div>;
  if (block.type === "text") return <div className="space-y-3"><Field label="Título" value={stringValue(props.title)} onChange={(value) => onProp("title", value)} /><LongField label="Texto" value={stringValue(props.body)} onChange={(value) => onProp("body", value)} /></div>;
  if (block.type === "callout") return <div className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><Field label="Título" value={stringValue(props.title)} onChange={(value) => onProp("title", value)} /><label className="space-y-1"><span className="text-xs font-medium">Tom</span><Select value={stringValue(props.tone) || "neutral"} onValueChange={(value) => onProp("tone", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["neutral", "info", "success", "warning", "danger"].map((tone) => <SelectItem key={tone} value={tone}>{tone}</SelectItem>)}</SelectContent></Select></label></div><LongField label="Mensagem" value={stringValue(props.body)} onChange={(value) => onProp("body", value)} /></div>;
  if (block.type === "divider") return <Field label="Rótulo opcional" value={stringValue(props.label)} onChange={(value) => onProp("label", value)} />;
  return <Field label="Título da seção" value={stringValue(props.title)} onChange={(value) => onProp("title", value)} />;
}

function ItemsEditor({ type, items, onChange, onAdd, onRemove }: { type: "metrics" | "list" | "cards"; items: JsonObject[]; onChange: (index: number, key: string, value: string) => void; onAdd: () => void; onRemove: (index: number) => void }) {
  const fields = type === "metrics" ? ["label", "value", "detail"] : type === "list" ? ["label", "title", "body"] : ["badge", "title", "body", "imageUrl"];
  return <div className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Itens</p><Button size="sm" variant="outline" onClick={onAdd}><Plus className="mr-1 h-3 w-3" />Adicionar</Button></div><div className="mt-3 space-y-3">{items.map((item, index) => <div key={index} className="rounded-lg bg-muted/20 p-3"><div className="grid gap-2 md:grid-cols-2">{fields.map((field) => field === "body" || field === "detail" ? <LongField key={field} label={field} value={stringValue(item[field])} onChange={(value) => onChange(index, field, value)} /> : <Field key={field} label={field} value={stringValue(item[field])} onChange={(value) => onChange(index, field, value)} />)}</div><Button size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => onRemove(index)}><Trash2 className="mr-1 h-3 w-3" />Remover item</Button></div>)}{items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item.</p>}</div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1"><span className="text-xs font-medium">{label}</span><Input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function LongField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1"><span className="text-xs font-medium">{label}</span><Textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
