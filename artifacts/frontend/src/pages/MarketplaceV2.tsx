import { useMemo, useState } from "react";
import { useListSegmentTemplates, getGetAgentConfigByTenantQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, CheckCircle2, ChevronRight, Tag, GitBranch, Bot, Loader2, Sparkles, Shirt, HardHat, ShoppingCart, Search, Layers3, PackageCheck, AlertTriangle, Pencil, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, ShieldCheck, RefreshCw } from "lucide-react";

const VERTICAL_MODULES: Record<string, { icon: React.ElementType; color: string }> = {
  "Construção & Reforma": { icon: HardHat, color: "bg-orange-50 text-orange-700 border-orange-200" },
  "Varejo de Roupas & Acessórios": { icon: Shirt, color: "bg-purple-50 text-purple-700 border-purple-200" },
  Supermercado: { icon: ShoppingCart, color: "bg-green-50 text-green-700 border-green-200" },
};

type Strategy = "keep" | "merge" | "replace";
type AgentDraft = Record<string, { enabled: boolean; prompt: string }>;
type ExistingState = {
  agentConfig: any | null;
  funis: any[];
  categorias: any[];
};

function norm(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function friendlyAgentName(key: string) {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/55 px-3 py-2.5 min-w-0">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0 leading-none">
        <div className="text-sm font-semibold">{value}</div>
        <div className="text-[10px] text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function StrategySelect({ value, onChange, allowReplace = true }: { value: Strategy; onChange: (value: Strategy) => void; allowReplace?: boolean }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as Strategy)}
      className="h-9 rounded-md border bg-background px-2 text-xs font-medium"
    >
      <option value="keep">Manter atual</option>
      <option value="merge">Mesclar</option>
      <option value="replace" disabled={!allowReplace}>Substituir{allowReplace ? "" : " (bloqueado)"}</option>
    </select>
  );
}

export default function MarketplaceV2() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useListSegmentTemplates();

  const [view, setView] = useState<"modules" | "templates">("modules");
  const [search, setSearch] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [applying, setApplying] = useState(false);
  const [existing, setExisting] = useState<ExistingState>({ agentConfig: null, funis: [], categorias: [] });
  const [agentDraft, setAgentDraft] = useState<AgentDraft>({});
  const [funilDraft, setFunilDraft] = useState<string[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [newStage, setNewStage] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [agentStrategy, setAgentStrategy] = useState<Strategy>("merge");
  const [funilStrategy, setFunilStrategy] = useState<Strategy>("merge");
  const [categoryStrategy, setCategoryStrategy] = useState<Strategy>("merge");

  const verticalTemplates = useMemo(() => templates?.filter((t) => t.nome in VERTICAL_MODULES) ?? [], [templates]);
  const regularTemplates = useMemo(() => templates?.filter((t) => !(t.nome in VERTICAL_MODULES)) ?? [], [templates]);
  const currentList = view === "modules" ? verticalTemplates : regularTemplates;
  const filteredList = useMemo(() => {
    const q = norm(search);
    if (!q) return currentList;
    return currentList.filter((template) => [template.nome, template.descricao, ...(template.funilPadrao ?? []), ...(template.categoriasProdutoSugeridas ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(q));
  }, [currentList, search]);

  function authHeaders(extra: Record<string, string> = {}) {
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }

  function initializeEditor(template: any) {
    setFunilDraft([...(template.funilPadrao ?? [])]);
    setCategoryDraft([...(template.categoriasProdutoSugeridas ?? [])]);
    setAgentDraft(Object.fromEntries(Object.entries(template.promptsSugeridos ?? {}).filter(([, prompt]) => typeof prompt === "string" && String(prompt).trim()).map(([key, prompt]) => [key, { enabled: true, prompt: String(prompt) }])));
    setNewStage("");
    setNewCategory("");
    setAgentStrategy("merge");
    setFunilStrategy("merge");
    setCategoryStrategy("merge");
  }

  async function loadImpact(template: any) {
    if (!tenantId) return;
    setLoadingImpact(true);
    try {
      const [agentRes, funisRes, catRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/agent-config`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/funis`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/categorias-produto`, { headers: authHeaders() }),
      ]);
      const agentConfig = agentRes.ok ? await agentRes.json() : null;
      const funis = funisRes.ok ? await funisRes.json() : [];
      const categorias = catRes.ok ? await catRes.json() : [];
      setExisting({ agentConfig, funis: Array.isArray(funis) ? funis : [], categorias: Array.isArray(categorias) ? categorias : [] });
    } catch {
      setExisting({ agentConfig: null, funis: [], categorias: [] });
      toast({ title: "Impacto parcial", description: "Não foi possível ler toda a configuração atual. A aplicação continuará preservadora por padrão." });
    } finally {
      setLoadingImpact(false);
    }
  }

  async function openPreview(template: any) {
    initializeEditor(template);
    setEditing(false);
    setPreviewTemplate(template);
    await loadImpact(template);
  }

  function resetEditor() {
    if (previewTemplate) initializeEditor(previewTemplate);
  }

  function moveStage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= funilDraft.length) return;
    setFunilDraft((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addStage() {
    const value = newStage.trim();
    if (!value) return;
    setFunilDraft((current) => [...current, value]);
    setNewStage("");
  }

  function addCategory() {
    const value = newCategory.trim();
    if (!value || categoryDraft.some((item) => norm(item) === norm(value))) return;
    setCategoryDraft((current) => [...current, value]);
    setNewCategory("");
  }

  const enabledAgents = Object.entries(agentDraft).filter(([, value]) => value.enabled && value.prompt.trim());
  const currentAgents = (existing.agentConfig?.agents ?? {}) as Record<string, { enabled?: boolean; prompt?: string }>;
  const agentConflicts = enabledAgents.filter(([key]) => currentAgents[key]?.prompt?.trim()).length;
  const agentCreates = enabledAgents.length - agentConflicts;
  const funilName = previewTemplate ? `Funil — ${previewTemplate.nome}` : "";
  const existingTargetFunil = existing.funis.find((item) => item.nome === funilName);
  const existingCategoryNames = new Set(existing.categorias.map((item) => norm(item.nome ?? "")));
  const categoryConflicts = categoryDraft.filter((item) => existingCategoryNames.has(norm(item))).length;
  const categoryCreates = categoryDraft.length - categoryConflicts;
  const protectedCategories = existing.categorias.filter((item) => item.oficial).length;
  const isVerticalPreview = !!previewTemplate && previewTemplate.nome in VERTICAL_MODULES;
  const isAlreadyActive = !!previewTemplate && ((isVerticalPreview && user?.tenantVertical === previewTemplate.nome) || !!existingTargetFunil);

  async function patchJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Falha ao atualizar configuração existente.");
    return data;
  }

  async function applyConfiguration() {
    if (!previewTemplate || !tenantId) return;
    if ((agentStrategy === "replace" || funilStrategy === "replace") && !window.confirm("Substituir pode alterar configurações já em uso. Confirma a substituição explícita dos grupos selecionados?")) return;

    setApplying(true);
    try {
      const agentsForApply: AgentDraft = agentStrategy === "merge" ? agentDraft : {};
      const funilForApply = funilStrategy === "merge" || (funilStrategy === "replace" && !existingTargetFunil) ? funilDraft.filter((item) => item.trim()) : [];
      const categoriesForApply = categoryStrategy === "merge" ? categoryDraft.filter((item) => item.trim()) : [];

      if (agentStrategy === "replace" && existing.agentConfig?.id) {
        const replacementAgents = Object.fromEntries(enabledAgents.map(([key, value]) => [key, { enabled: value.enabled, prompt: value.prompt.trim() }]));
        await patchJson(`/api/agent-configs/${existing.agentConfig.id}`, { agents: replacementAgents });
      }

      if (funilStrategy === "replace" && existingTargetFunil?.id) {
        await patchJson(`/api/funis/${existingTargetFunil.id}`, { etapas: funilDraft.filter((item) => item.trim()) });
      }

      const response = await fetch(`/api/tenants/${tenantId}/segment-templates/${previewTemplate.id}/apply`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ customization: { agents: agentsForApply, funilPadrao: funilForApply, categoriasProduto: categoriesForApply } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível aplicar o módulo.");

      const summary = [
        data.promptsApplied?.length ? `${data.promptsApplied.length} agentes adicionados` : null,
        agentStrategy === "replace" ? `${enabledAgents.length} agentes substituídos` : null,
        data.funilCreated ? "funil criado" : null,
        funilStrategy === "replace" && existingTargetFunil ? "funil substituído" : null,
        data.categoriesCreated?.length ? `${data.categoriesCreated.length} categorias adicionadas` : null,
        data.promptsPreserved?.length ? `${data.promptsPreserved.length} agentes preservados` : null,
        data.categoriesSkipped?.length ? `${data.categoriesSkipped.length} categorias preservadas` : null,
      ].filter(Boolean).join(", ");

      toast({ title: isAlreadyActive ? "Configuração atualizada" : isVerticalPreview ? "Módulo ativado" : "Template aplicado", description: summary || "Configuração concluída com segurança." });
      setPreviewTemplate(null);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetAgentConfigByTenantQueryKey(tenantId) });
      if (isVerticalPreview) queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: error instanceof Error ? error.message : "Nenhuma alteração adicional foi aplicada.", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-28 md:pb-8 px-1 sm:px-0">
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10"><Store className="h-5 w-5 text-primary" /></div>
          <div><h1 className="text-xl sm:text-2xl font-bold">Central de Soluções</h1><p className="text-sm text-muted-foreground mt-1">Instale, personalize e reconfigure módulos e templates sem perder sua configuração atual.</p></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button variant={view === "modules" ? "default" : "outline"} onClick={() => { setView("modules"); setSearch(""); }}><Layers3 className="h-4 w-4 mr-2" />Módulos</Button>
          <Button variant={view === "templates" ? "default" : "outline"} onClick={() => { setView("templates"); setSearch(""); }}><PackageCheck className="h-4 w-4 mr-2" />Templates</Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
        <div><h2 className="font-semibold flex items-center gap-2">{view === "modules" ? <Sparkles className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-primary" />}{view === "modules" ? "Módulos" : "Templates de segmento"}</h2><p className="text-xs text-muted-foreground mt-1">Todos podem ser revisados antes de aplicar.</p></div>
        <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" /></div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredList.map((template) => {
            const isVertical = template.nome in VERTICAL_MODULES;
            const meta = isVertical ? VERTICAL_MODULES[template.nome] : null;
            const Icon = meta?.icon ?? Store;
            const active = isVertical && user?.tenantVertical === template.nome;
            const promptCount = Object.values(template.promptsSugeridos ?? {}).filter(Boolean).length;
            return (
              <Card key={template.id} className={active ? "border-green-400 ring-1 ring-green-200" : "hover:shadow-md"}>
                <CardHeader className="p-4 pb-3"><div className="flex gap-2.5"><div className={`p-2 rounded-xl border h-fit ${meta?.color ?? "bg-muted/50 text-primary"}`}><Icon className="h-4 w-4" /></div><div className="min-w-0"><CardTitle className="text-base">{template.nome}</CardTitle><div className="flex gap-1 mt-1.5"><Badge variant="outline" className="text-[10px]">{isVertical ? "Módulo" : "Template"}</Badge>{active && <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Ativo</Badge>}</div></div></div>{template.descricao && <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{template.descricao}</p>}</CardHeader>
                <CardContent className="p-4 pt-0 space-y-3"><div className="grid grid-cols-3 gap-2"><Metric icon={Bot} value={promptCount} label="agentes" /><Metric icon={GitBranch} value={template.funilPadrao?.length ?? 0} label="etapas" /><Metric icon={Tag} value={template.categoriasProdutoSugeridas?.length ?? 0} label="categorias" /></div><Button className="w-full" variant={active ? "outline" : "default"} onClick={() => openPreview(template)}>{active ? <><RefreshCw className="h-4 w-4 mr-2" />Configurar novamente</> : <>{isVertical ? "Configurar e ativar" : "Configurar e usar"}<ChevronRight className="h-4 w-4 ml-1" /></>}</Button></CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[88dvh] overflow-y-auto p-4 sm:p-6 pb-24">
          {previewTemplate && <>
            <DialogHeader className="pr-7"><DialogTitle>{previewTemplate.nome}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/35 p-3"><p className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Impacto antes de aplicar</p><p className="text-xs text-muted-foreground mt-1">Preservar é o padrão. Substituição só acontece com sua escolha explícita.</p></div>

              {loadingImpact ? <Skeleton className="h-28 w-full" /> : <div className="grid gap-3">
                <div className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Agentes</p><p className="text-xs text-muted-foreground">{agentCreates} novos · {agentConflicts} conflitos existentes</p></div><StrategySelect value={agentStrategy} onChange={setAgentStrategy} /></div><div className="mt-2 text-xs">{agentStrategy === "keep" ? "Nenhum agente será alterado." : agentStrategy === "merge" ? "Novos agentes entram e prompts existentes são preservados." : "A seleção abaixo substituirá a configuração atual de agentes."}</div></div>
                <div className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Funil</p><p className="text-xs text-muted-foreground">{existingTargetFunil ? "Já existe um funil deste módulo" : "Será criado um novo funil"}</p></div><StrategySelect value={funilStrategy} onChange={setFunilStrategy} /></div><div className="mt-2 text-xs">{funilStrategy === "keep" ? "O funil atual fica intacto." : funilStrategy === "merge" ? "Se ainda não existir, o funil será criado; se existir, será preservado." : "As etapas do funil deste módulo serão substituídas pela seleção abaixo."}</div></div>
                <div className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Categorias</p><p className="text-xs text-muted-foreground">{categoryCreates} novas · {categoryConflicts} já existem · {protectedCategories} oficiais protegidas</p></div><StrategySelect value={categoryStrategy} onChange={setCategoryStrategy} allowReplace={false} /></div><div className="mt-2 text-xs">Categorias podem estar ligadas a produtos. Por segurança, substituição destrutiva fica bloqueada aqui; use Manter ou Mesclar.</div></div>
              </div>}

              <Button variant="outline" className="w-full" onClick={() => setEditing((value) => !value)}><Pencil className="h-4 w-4 mr-2" />{editing ? "Fechar edição" : "Editar configuração"}</Button>

              {editing && <div className="space-y-4">
                <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-semibold">Agentes</p>{Object.entries(agentDraft).map(([key, agent]) => <div key={key} className="rounded-lg border p-2.5 space-y-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={agent.enabled} onChange={(e) => setAgentDraft((current) => ({ ...current, [key]: { ...current[key], enabled: e.target.checked } }))} />{friendlyAgentName(key)}</label>{agent.enabled && <textarea rows={3} value={agent.prompt} onChange={(e) => setAgentDraft((current) => ({ ...current, [key]: { ...current[key], prompt: e.target.value } }))} className="w-full rounded-md border bg-background px-3 py-2 text-xs" />}</div>)}</div>
                <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-semibold">Funil</p>{funilDraft.map((stage, index) => <div key={`${stage}-${index}`} className="flex gap-1.5"><Input value={stage} onChange={(e) => setFunilDraft((current) => current.map((item, i) => i === index ? e.target.value : item))} /><Button size="icon" variant="outline" disabled={index === 0} onClick={() => moveStage(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={index === funilDraft.length - 1} onClick={() => moveStage(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => setFunilDraft((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}<div className="flex gap-2"><Input value={newStage} onChange={(e) => setNewStage(e.target.value)} placeholder="Nova etapa" /><Button variant="outline" onClick={addStage}><Plus className="h-4 w-4 mr-1" />Adicionar</Button></div></div>
                <div className="rounded-xl border p-3 space-y-2"><p className="text-sm font-semibold">Categorias</p><div className="flex flex-wrap gap-2">{categoryDraft.map((category, index) => <Badge key={`${category}-${index}`} variant="outline" className="gap-1.5 py-1.5">{category}<button onClick={() => setCategoryDraft((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-3 w-3" /></button></Badge>)}</div><div className="flex gap-2"><Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova categoria" /><Button variant="outline" onClick={addCategory}><Plus className="h-4 w-4 mr-1" />Adicionar</Button></div></div>
                <Button variant="ghost" className="w-full" onClick={resetEditor}><RotateCcw className="h-4 w-4 mr-2" />Restaurar padrão</Button>
              </div>}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" /><p className="text-xs">Revise o impacto acima. Operações de substituição exigem confirmação adicional. Categorias oficiais e vínculos de catálogo são protegidos.</p></div></div>

              <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background border-t grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setPreviewTemplate(null)}>Cancelar</Button><Button disabled={applying || loadingImpact} onClick={applyConfiguration}>{applying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aplicando...</> : isAlreadyActive ? "Salvar reconfiguração" : isVerticalPreview ? "Ativar módulo" : "Usar template"}</Button></div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
