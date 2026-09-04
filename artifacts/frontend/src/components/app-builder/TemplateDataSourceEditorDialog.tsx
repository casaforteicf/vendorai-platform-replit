import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Braces, DatabaseZap, Loader2, Save } from "lucide-react";

type JsonObject = Record<string, unknown>;
type TemplateLike = { id: string; name: string };
type TemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  status: string;
  definition: JsonObject;
};
type DataSourceRegistryItem = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  outputSchema: JsonObject;
  requiredPermissions: string[];
  status: string;
};
type RegistriesResponse = { dataSources?: DataSourceRegistryItem[] };
type TextTarget = { key: string; label: string };
type TokenOption = { key: string; label: string; sourceKey: string; token: string };

type Props = {
  template: TemplateLike | null;
  token: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const BLOCK_LABEL: Record<string, string> = {
  hero: "Hero",
  text: "Texto",
  callout: "Destaque / alerta",
  metrics: "Métricas",
  list: "Lista",
  cards: "Cards",
  divider: "Divisor",
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function isPrimitiveSchema(value: JsonObject): boolean {
  const type = value.type;
  if (typeof type === "string") return ["string", "number", "integer", "boolean"].includes(type);
  if (Array.isArray(type)) return type.some((item) => typeof item === "string" && ["string", "number", "integer", "boolean"].includes(item));
  return false;
}

function collectSchemaPaths(schemaValue: unknown, prefix = "", depth = 0): string[] {
  if (depth > 4) return [];
  const schema = asObject(schemaValue);
  if (prefix && isPrimitiveSchema(schema)) return [prefix];
  const properties = asObject(schema.properties);
  return Object.entries(properties).flatMap(([key, child]) => {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return collectSchemaPaths(child, path, depth + 1);
  });
}

function blockTextTargets(blockValue: unknown): TextTarget[] {
  const block = asObject(blockValue);
  const type = stringValue(block.type);
  const props = asObject(block.props);
  const targets: TextTarget[] = [];
  const add = (key: string, label: string) => targets.push({ key: `prop:${key}`, label });

  if (type === "hero") {
    add("title", "Título");
    add("eyebrow", "Eyebrow");
    add("badge", "Badge");
    add("body", "Texto");
  } else if (type === "text") {
    add("title", "Título");
    add("body", "Texto");
  } else if (type === "callout") {
    add("title", "Título");
    add("body", "Mensagem");
  } else if (type === "divider") {
    add("label", "Rótulo");
  } else if (["metrics", "list", "cards"].includes(type)) {
    add("title", "Título do bloco");
    objectArray(props.items).forEach((_item, index) => {
      if (type === "metrics") {
        targets.push({ key: `item:${index}:label`, label: `Indicador ${index + 1} · Rótulo` });
        targets.push({ key: `item:${index}:value`, label: `Indicador ${index + 1} · Valor` });
        targets.push({ key: `item:${index}:detail`, label: `Indicador ${index + 1} · Detalhe` });
      }
      if (type === "list") {
        targets.push({ key: `item:${index}:label`, label: `Item ${index + 1} · Rótulo` });
        targets.push({ key: `item:${index}:title`, label: `Item ${index + 1} · Título` });
        targets.push({ key: `item:${index}:body`, label: `Item ${index + 1} · Texto` });
      }
      if (type === "cards") {
        targets.push({ key: `item:${index}:badge`, label: `Card ${index + 1} · Badge` });
        targets.push({ key: `item:${index}:title`, label: `Card ${index + 1} · Título` });
        targets.push({ key: `item:${index}:body`, label: `Card ${index + 1} · Texto` });
      }
    });
  }
  return targets;
}

function readTarget(blockValue: unknown, targetKey: string): string {
  const block = asObject(blockValue);
  const props = asObject(block.props);
  const [kind, first, second] = targetKey.split(":");
  if (kind === "prop") return stringValue(props[first]);
  if (kind === "item") {
    const item = objectArray(props.items)[Number(first)];
    return stringValue(item?.[second]);
  }
  return "";
}

function writeTarget(block: JsonObject, targetKey: string, value: string) {
  const props = { ...asObject(block.props) };
  const [kind, first, second] = targetKey.split(":");
  if (kind === "prop") {
    props[first] = value;
    block.props = props;
    return;
  }
  if (kind === "item") {
    const items = objectArray(props.items).map((item) => ({ ...item }));
    const index = Number(first);
    if (!Number.isInteger(index) || !items[index]) return;
    items[index] = { ...items[index], [second]: value };
    props.items = items;
    block.props = props;
  }
}

function pagesFromDefinition(definition: JsonObject): JsonObject[] {
  return objectArray(asObject(definition.runtime).pages);
}

export default function TemplateDataSourceEditorDialog({ template, token, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceRegistryItem[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [definition, setDefinition] = useState<JsonObject>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [blockIndex, setBlockIndex] = useState(0);
  const [targetKey, setTargetKey] = useState("");
  const [tokenKey, setTokenKey] = useState("");
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
      const message = payload && typeof payload === "object" && "error" in payload && payload.error
        ? String(payload.error)
        : `Falha na operação (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  const hydrate = useCallback((version: TemplateVersion | null) => {
    setSourceVersionId(version?.id ?? "");
    setDefinition(cloneJson(version?.definition ?? {}));
    setPageIndex(0);
    setBlockIndex(0);
    setTargetKey("");
    setTokenKey("");
  }, []);

  const load = useCallback(async () => {
    if (!open || !template) return;
    setLoading(true);
    try {
      const [versionRows, registries] = await Promise.all([
        requestJson<TemplateVersion[]>(`/admin/app-builder/templates/${template.id}/versions`),
        requestJson<RegistriesResponse>("/admin/app-builder/registries"),
      ]);
      setVersions(versionRows);
      setDataSources((registries.dataSources ?? []).filter((source) => source.status === "active"));
      hydrate(versionRows[0] ?? null);
      setChangeLog("");
    } catch (error) {
      toast({
        title: "Não foi possível carregar os dados dinâmicos",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [hydrate, open, requestJson, template, toast]);

  useEffect(() => { void load(); }, [load]);

  const pages = useMemo(() => pagesFromDefinition(definition), [definition]);
  const selectedPage = pages[pageIndex] ?? null;
  const blocks = useMemo(() => objectArray(selectedPage?.blocks), [selectedPage]);
  const selectedBlock = blocks[blockIndex] ?? null;
  const selectedSourceKeys = useMemo(() => stringArray(selectedBlock?.dataSources), [selectedBlock]);
  const targets = useMemo(() => blockTextTargets(selectedBlock), [selectedBlock]);
  const tokenOptions = useMemo<TokenOption[]>(() => dataSources.flatMap((source) =>
    collectSchemaPaths(source.outputSchema).map((path) => ({
      key: `${source.key}:${path}`,
      label: `${source.name} · ${path}`,
      sourceKey: source.key,
      token: `{{data.${source.key}.${path}}}`,
    }))), [dataSources]);
  const selectedToken = tokenOptions.find((option) => option.key === tokenKey) ?? null;
  const selectedTarget = targets.find((target) => target.key === targetKey) ?? null;
  const targetPreview = selectedBlock && selectedTarget ? readTarget(selectedBlock, selectedTarget.key) : "";

  useEffect(() => {
    if (!targets.some((target) => target.key === targetKey)) setTargetKey(targets[0]?.key ?? "");
  }, [targetKey, targets]);

  function chooseVersion(versionId: string) {
    const version = versions.find((row) => row.id === versionId) ?? null;
    hydrate(version);
  }

  function choosePage(value: string) {
    setPageIndex(Number(value));
    setBlockIndex(0);
    setTargetKey("");
  }

  function patchSelectedBlock(mutator: (block: JsonObject) => void) {
    setDefinition((current) => {
      const next = cloneJson(current);
      const runtime = asObject(next.runtime);
      const nextPages = objectArray(runtime.pages).map((page) => ({ ...page }));
      const page = nextPages[pageIndex];
      if (!page) return current;
      const nextBlocks = objectArray(page.blocks).map((block) => ({ ...block }));
      const block = nextBlocks[blockIndex];
      if (!block) return current;
      mutator(block);
      nextBlocks[blockIndex] = block;
      page.blocks = nextBlocks;
      nextPages[pageIndex] = page;
      runtime.pages = nextPages;
      next.runtime = runtime;
      return next;
    });
  }

  function toggleSource(sourceKey: string) {
    patchSelectedBlock((block) => {
      const current = new Set(stringArray(block.dataSources));
      if (current.has(sourceKey)) current.delete(sourceKey);
      else current.add(sourceKey);
      block.dataSources = Array.from(current).slice(0, 20);
    });
  }

  function insertToken() {
    if (!selectedToken || !selectedTarget) return;
    patchSelectedBlock((block) => {
      const currentSources = new Set(stringArray(block.dataSources));
      currentSources.add(selectedToken.sourceKey);
      block.dataSources = Array.from(currentSources).slice(0, 20);
      const currentValue = readTarget(block, selectedTarget.key).trimEnd();
      writeTarget(block, selectedTarget.key, `${currentValue}${currentValue ? " " : ""}${selectedToken.token}`);
    });
    toast({ title: "Token inserido", description: "A fonte de dados necessária também foi vinculada ao bloco." });
  }

  async function saveVersion() {
    if (!template || !sourceVersionId) return;
    setSaving(true);
    try {
      const created = await requestJson<TemplateVersion>(`/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          definition,
          changeLog: changeLog.trim() || "Configura dados dinâmicos do runtime",
        }),
      });
      toast({
        title: `Versão ${created.version} criada em rascunho`,
        description: "A versão anterior foi preservada. Publique somente após revisar o runtime.",
      });
      await load();
    } catch (error) {
      toast({ title: "Erro ao salvar dados dinâmicos", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-[94vw] xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-primary" />
            Dados dinâmicos · {template?.name ?? "Template"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium">Versão base</span>
                  <Select value={sourceVersionId} onValueChange={chooseVersion} disabled={versions.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Sem versões" /></SelectTrigger>
                    <SelectContent>{versions.map((version) => <SelectItem key={version.id} value={version.id}>v{version.version} · {version.status}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Página</span>
                  <Select value={String(pageIndex)} onValueChange={choosePage} disabled={pages.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Sem páginas" /></SelectTrigger>
                    <SelectContent>{pages.map((page, index) => <SelectItem key={`${stringValue(page.id)}-${index}`} value={String(index)}>{stringValue(page.title) || stringValue(page.id) || `Página ${index + 1}`}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Bloco</span>
                  <Select value={String(blockIndex)} onValueChange={(value) => { setBlockIndex(Number(value)); setTargetKey(""); }} disabled={blocks.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Sem blocos" /></SelectTrigger>
                    <SelectContent>{blocks.map((block, index) => {
                      const rawType = stringValue(block.type);
                      const blockLabel = BLOCK_LABEL[rawType] || rawType || "Bloco";
                      return <SelectItem key={`${stringValue(block.id)}-${index}`} value={String(index)}>{blockLabel} · {stringValue(block.id) || index + 1}</SelectItem>;
                    })}</SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Registro da alteração</span>
                  <Input value={changeLog} onChange={(event) => setChangeLog(event.target.value)} placeholder="Ex.: personaliza home do cliente" />
                </label>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">O editor usa os Data Sources registrados pelo backend. SQL, URLs, executor_key e código não ficam disponíveis aqui.</p>
            </div>

            {!selectedBlock ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Selecione uma versão com página e bloco para configurar dados dinâmicos.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div><p className="text-sm font-semibold">Fontes do bloco</p><p className="text-[11px] text-muted-foreground">Somente fontes marcadas podem alimentar este bloco no runtime.</p></div>
                    <Badge variant="outline">{selectedSourceKeys.length}/20</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {dataSources.map((source) => {
                      const selected = selectedSourceKeys.includes(source.key);
                      return (
                        <button key={source.key} type="button" onClick={() => toggleSource(source.key)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "bg-muted/10 hover:bg-muted/30"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div><p className="text-xs font-semibold">{source.name}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{source.key}</p></div>
                            <Badge variant={selected ? "default" : "secondary"}>{selected ? "Ativa" : "Disponível"}</Badge>
                          </div>
                          {source.description && <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{source.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(source.requiredPermissions ?? []).length === 0
                              ? <Badge variant="outline" className="text-[9px]">Sem permissão extra</Badge>
                              : source.requiredPermissions.map((permission) => <Badge key={permission} variant="outline" className="text-[9px]">Exige {permission}</Badge>)}
                          </div>
                        </button>
                      );
                    })}
                    {dataSources.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhum Data Source ativo foi registrado.</p>}
                  </div>
                </section>

                <section className="rounded-xl border bg-card p-4">
                  <div><p className="text-sm font-semibold">Inserir valor dinâmico</p><p className="text-[11px] text-muted-foreground">Escolha um campo do Registry e o texto do bloco onde o token será inserido.</p></div>
                  <div className="mt-3 space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium">Campo dinâmico</span>
                      <Select value={tokenKey} onValueChange={setTokenKey} disabled={tokenOptions.length === 0}>
                        <SelectTrigger><SelectValue placeholder="Selecione um campo" /></SelectTrigger>
                        <SelectContent>{tokenOptions.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium">Destino no bloco</span>
                      <Select value={targetKey} onValueChange={setTargetKey} disabled={targets.length === 0}>
                        <SelectTrigger><SelectValue placeholder="Selecione um texto" /></SelectTrigger>
                        <SelectContent>{targets.map((target) => <SelectItem key={target.key} value={target.key}>{target.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </label>

                    {selectedToken && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Token seguro</p><p className="mt-1 break-all font-mono text-xs">{selectedToken.token}</p></div>}
                    {selectedTarget && <div className="rounded-lg border bg-muted/20 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Texto atual</p><p className="mt-1 whitespace-pre-wrap text-xs">{targetPreview || "Vazio"}</p></div>}

                    <Button onClick={insertToken} disabled={!selectedToken || !selectedTarget} className="w-full">
                      <Braces className="mr-2 h-4 w-4" />Inserir token no texto
                    </Button>
                    <p className="text-[11px] leading-5 text-muted-foreground">Ao inserir um token, a fonte correspondente é ativada automaticamente no bloco. URLs de imagem, IDs, rotas e ações não aparecem como destinos.</p>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => void saveVersion()} disabled={loading || saving || !sourceVersionId || !selectedBlock}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Criar nova versão em rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
