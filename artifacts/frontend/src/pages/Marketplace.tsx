import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListSegmentTemplates,
  getGetAgentConfigByTenantQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Store,
  CheckCircle2,
  ChevronRight,
  Tag,
  GitBranch,
  Bot,
  Loader2,
  Sparkles,
  Shirt,
  HardHat,
  ShoppingCart,
  Search,
  Layers3,
  PackageCheck,
  AlertTriangle,
  Pencil,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";

const VERTICAL_MODULES: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  "Construção & Reforma": {
    label: "Módulo Vertical",
    icon: HardHat,
    color: "bg-orange-50 text-orange-700 border-orange-200",
  },
  "Varejo de Roupas & Acessórios": {
    label: "Módulo Vertical",
    icon: Shirt,
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  Supermercado: {
    label: "Módulo Vertical",
    icon: ShoppingCart,
    color: "bg-green-50 text-green-700 border-green-200",
  },
};

type MarketplaceView = "modules" | "templates";
type AgentDraft = Record<string, { enabled: boolean; prompt: string }>;

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
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

function friendlyAgentName(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function Marketplace() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useListSegmentTemplates();

  const [view, setView] = useState<MarketplaceView>("modules");
  const [search, setSearch] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [funilDraft, setFunilDraft] = useState<string[]>([]);
  const [categoryDraft, setCategoryDraft] = useState<string[]>([]);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>({});
  const [newStage, setNewStage] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const verticalTemplates = useMemo(
    () => templates?.filter((t) => t.nome in VERTICAL_MODULES) ?? [],
    [templates]
  );

  const regularTemplates = useMemo(
    () => templates?.filter((t) => !(t.nome in VERTICAL_MODULES)) ?? [],
    [templates]
  );

  const currentList = view === "modules" ? verticalTemplates : regularTemplates;

  const filteredList = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return currentList;

    return currentList.filter((template) => {
      const haystack = [
        template.nome,
        template.descricao,
        ...(template.funilPadrao ?? []),
        ...(template.categoriasProdutoSugeridas ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return haystack.includes(q);
    });
  }, [currentList, search]);

  function initializeEditor(template: any) {
    setFunilDraft([...(template.funilPadrao ?? [])]);
    setCategoryDraft([...(template.categoriasProdutoSugeridas ?? [])]);
    setAgentDraft(
      Object.fromEntries(
        Object.entries(template.promptsSugeridos ?? {})
          .filter(([, prompt]) => typeof prompt === "string" && prompt.trim())
          .map(([key, prompt]) => [
            key,
            { enabled: true, prompt: String(prompt) },
          ])
      )
    );
    setNewStage("");
    setNewCategory("");
  }

  function openPreview(template: any) {
    initializeEditor(template);
    setEditing(false);
    setPreviewTemplate(template);
  }

  function resetEditor() {
    if (!previewTemplate) return;
    initializeEditor(previewTemplate);
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
    if (!value) return;
    if (
      categoryDraft.some(
        (item) => item.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR")
      )
    ) {
      setNewCategory("");
      return;
    }
    setCategoryDraft((current) => [...current, value]);
    setNewCategory("");
  }

  async function handleApply(templateId: string, templateNome: string) {
    if (!tenantId) return;
    setApplyingId(templateId);

    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/segment-templates/${templateId}/apply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            customization: {
              funilPadrao: funilDraft,
              categoriasProduto: categoryDraft,
              agents: agentDraft,
            },
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível aplicar o módulo.");
      }

      setAppliedId(templateId);
      setApplyingId(null);
      setPreviewTemplate(null);
      setEditing(false);

      const parts: string[] = [];
      if (data.agentConfigUpdated && data.promptsApplied?.length > 0) {
        parts.push(`${data.promptsApplied.length} agentes configurados`);
      }
      if (data.funilCreated) parts.push("funil criado");
      if (data.categoriesCreated?.length > 0) {
        parts.push(`${data.categoriesCreated.length} categorias adicionadas`);
      }
      if (data.promptsPreserved?.length > 0) {
        parts.push(`${data.promptsPreserved.length} agentes existentes preservados`);
      }
      if (data.categoriesSkipped?.length > 0) {
        parts.push(`${data.categoriesSkipped.length} categorias existentes preservadas`);
      }

      const isVertical = templateNome in VERTICAL_MODULES;
      toast({
        title: isVertical
          ? `Módulo "${templateNome}" ativado!`
          : `Template "${templateNome}" aplicado!`,
        description:
          parts.join(", ") || "Configuração aplicada com sucesso sem substituir dados existentes.",
      });

      queryClient.invalidateQueries({
        queryKey: getGetAgentConfigByTenantQueryKey(tenantId),
      });
      if (isVertical) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
    } catch (error) {
      setApplyingId(null);
      toast({
        title: "Não foi possível concluir",
        description:
          error instanceof Error
            ? error.message
            : "Nada foi alterado. Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const previewIsVertical = previewTemplate
    ? previewTemplate.nome in VERTICAL_MODULES
    : false;
  const previewPromptCount = previewTemplate
    ? Object.values(previewTemplate.promptsSugeridos ?? {}).filter(Boolean).length
    : 0;
  const enabledAgentCount = Object.values(agentDraft).filter((agent) => agent.enabled).length;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-24 md:pb-8 px-1 sm:px-0">
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Marketplace</h1>
            <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
              Adicione recursos ao VendorAI sem precisar montar tudo do zero.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted/45 p-3">
          <p className="text-sm font-medium">O que você quer adicionar?</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              type="button"
              variant={view === "modules" ? "default" : "outline"}
              className="h-auto min-h-11 justify-start gap-2 px-3 whitespace-normal text-left"
              onClick={() => {
                setView("modules");
                setSearch("");
              }}
            >
              <Layers3 className="h-4 w-4 shrink-0" />
              <span className="leading-tight">Módulos</span>
            </Button>
            <Button
              type="button"
              variant={view === "templates" ? "default" : "outline"}
              className="h-auto min-h-11 justify-start gap-2 px-3 whitespace-normal text-left"
              onClick={() => {
                setView("templates");
                setSearch("");
              }}
            >
              <PackageCheck className="h-4 w-4 shrink-0" />
              <span className="leading-tight">Templates</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {view === "modules" ? (
              <Sparkles className="h-4 w-4 text-primary" />
            ) : (
              <Store className="h-4 w-4 text-primary" />
            )}
            <h2 className="text-lg font-semibold">
              {view === "modules" ? "Módulos" : "Templates de segmento"}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {view === "modules"
              ? "Adicionam páginas, fluxos e funcionalidades específicas ao sistema."
              : "Configuram agentes, funil e categorias para um tipo de negócio."}
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "modules" ? "Buscar módulo..." : "Buscar segmento..."}
            className="pl-9 h-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Search className="h-7 w-7 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Nenhum resultado encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tente outro nome ou limpe a busca.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredList.map((template) => {
            const isVertical = template.nome in VERTICAL_MODULES;
            const isApplied = appliedId === template.id;
            const isApplying = applyingId === template.id;
            const promptCount = Object.values(template.promptsSugeridos ?? {}).filter(Boolean).length;
            const isActive = isVertical && user?.tenantVertical === template.nome;
            const verticalMeta = isVertical ? VERTICAL_MODULES[template.nome] : null;
            const VerticalIcon = verticalMeta?.icon;

            return (
              <Card
                key={template.id}
                className={`flex flex-col overflow-hidden transition-all ${
                  isApplied || isActive
                    ? "border-green-400 ring-1 ring-green-200"
                    : "hover:shadow-md"
                }`}
              >
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {VerticalIcon ? (
                      <div className={`shrink-0 p-2 rounded-xl border ${verticalMeta!.color}`}>
                        <VerticalIcon className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="shrink-0 p-2 rounded-xl border bg-muted/50 text-primary">
                        <Store className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base sm:text-lg font-semibold leading-snug">
                        {template.nome}
                      </CardTitle>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant={isVertical ? "secondary" : "outline"} className="text-[10px]">
                          {isVertical ? "Módulo" : "Template"}
                        </Badge>
                        {(isApplied || isActive) && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Instalado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {template.descricao && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-2 line-clamp-3">
                      {template.descricao}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-0 flex-1 flex flex-col gap-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Metric icon={Bot} value={promptCount} label="agentes" />
                    <Metric icon={GitBranch} value={template.funilPadrao?.length ?? 0} label="etapas" />
                    <Metric icon={Tag} value={template.categoriasProdutoSugeridas?.length ?? 0} label="categorias" />
                  </div>

                  {template.funilPadrao?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Inclui no funil
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {template.funilPadrao.slice(0, 3).map((etapa: string) => (
                          <Badge key={etapa} variant="secondary" className="max-w-full text-[10px] px-2 py-1 font-medium">
                            <span className="truncate">{etapa}</span>
                          </Badge>
                        ))}
                        {template.funilPadrao.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-2 py-1">
                            +{template.funilPadrao.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <Button type="button" variant="outline" className="w-full" onClick={() => openPreview(template)}>
                      Ver detalhes
                    </Button>
                    <Button
                      type="button"
                      className="w-full gap-1.5"
                      variant={isApplied || isActive ? "outline" : "default"}
                      disabled={isApplying || isApplied || isActive}
                      onClick={() => openPreview(template)}
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Aplicando...
                        </>
                      ) : isApplied || isActive ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Instalado
                        </>
                      ) : (
                        <>
                          {isVertical ? "Ativar" : "Usar template"}
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!previewTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewTemplate(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[88dvh] overflow-y-auto p-4 sm:p-6">
          {previewTemplate && (
            <>
              <DialogHeader className="pr-7">
                <DialogTitle className="text-xl">{previewTemplate.nome}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/35 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {previewIsVertical ? (
                      <Layers3 className="h-4 w-4 text-primary" />
                    ) : (
                      <PackageCheck className="h-4 w-4 text-primary" />
                    )}
                    <p className="font-medium text-sm">
                      {previewIsVertical ? "Módulo funcional" : "Template de configuração"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {previewIsVertical
                      ? "Libera recursos do segmento e permite personalizar agentes, funil e categorias antes da ativação."
                      : "Permite personalizar agentes, etapas do funil e categorias antes de aplicar."}
                  </p>
                </div>

                {previewTemplate.descricao && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {previewTemplate.descricao}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Metric icon={Bot} value={editing ? enabledAgentCount : previewPromptCount} label="agentes" />
                  <Metric icon={GitBranch} value={editing ? funilDraft.length : previewTemplate.funilPadrao?.length ?? 0} label="etapas" />
                  <Metric icon={Tag} value={editing ? categoryDraft.length : previewTemplate.categoriasProdutoSugeridas?.length ?? 0} label="categorias" />
                </div>

                {!editing ? (
                  <>
                    {previewTemplate.funilPadrao?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Funil que será criado</p>
                        <div className="flex flex-wrap gap-1.5">
                          {previewTemplate.funilPadrao.map((etapa: string) => (
                            <Badge key={etapa} variant="secondary" className="text-xs py-1">
                              {etapa}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {previewTemplate.categoriasProdutoSugeridas?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Categorias que serão adicionadas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {previewTemplate.categoriasProdutoSugeridas.map((categoria: string) => (
                            <Badge key={categoria} variant="outline" className="text-xs py-1">
                              {categoria}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4" />
                      Editar configuração antes de ativar
                    </Button>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-xl border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">Agentes</p>
                          <p className="text-xs text-muted-foreground">Escolha quais agentes entram e ajuste as instruções.</p>
                        </div>
                        <Badge variant="secondary">{enabledAgentCount} ativos</Badge>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(agentDraft).map(([key, agent]) => (
                          <div key={key} className="rounded-lg border bg-background p-2.5 space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                checked={agent.enabled}
                                onChange={(event) =>
                                  setAgentDraft((current) => ({
                                    ...current,
                                    [key]: { ...current[key], enabled: event.target.checked },
                                  }))
                                }
                                className="h-4 w-4"
                              />
                              {friendlyAgentName(key)}
                            </label>
                            {agent.enabled && (
                              <textarea
                                value={agent.prompt}
                                onChange={(event) =>
                                  setAgentDraft((current) => ({
                                    ...current,
                                    [key]: { ...current[key], prompt: event.target.value },
                                  }))
                                }
                                rows={3}
                                className="w-full rounded-md border bg-background px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
                                placeholder="Instruções do agente"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Funil</p>
                        <p className="text-xs text-muted-foreground">Renomeie, exclua, adicione e altere a ordem das etapas.</p>
                      </div>

                      <div className="space-y-2">
                        {funilDraft.map((stage, index) => (
                          <div key={`${stage}-${index}`} className="flex items-center gap-1.5">
                            <Input
                              value={stage}
                              onChange={(event) =>
                                setFunilDraft((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? event.target.value : item
                                  )
                                )
                              }
                              className="h-10 flex-1"
                            />
                            <Button type="button" size="icon" variant="outline" disabled={index === 0} onClick={() => moveStage(index, -1)} aria-label="Mover etapa para cima">
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="outline" disabled={index === funilDraft.length - 1} onClick={() => moveStage(index, 1)} aria-label="Mover etapa para baixo">
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="outline" onClick={() => setFunilDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Excluir etapa">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={newStage}
                          onChange={(event) => setNewStage(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addStage();
                            }
                          }}
                          placeholder="Nova etapa"
                          className="h-10"
                        />
                        <Button type="button" variant="outline" onClick={addStage} className="shrink-0 gap-1">
                          <Plus className="h-4 w-4" />
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Categorias</p>
                        <p className="text-xs text-muted-foreground">Remova as que não servem e adicione categorias do seu negócio.</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {categoryDraft.map((category, index) => (
                          <Badge key={`${category}-${index}`} variant="outline" className="gap-1.5 py-1.5 pl-2.5 pr-1.5">
                            <span>{category}</span>
                            <button
                              type="button"
                              className="rounded-full p-0.5 hover:bg-muted"
                              onClick={() => setCategoryDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              aria-label={`Remover ${category}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={newCategory}
                          onChange={(event) => setNewCategory(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addCategory();
                            }
                          }}
                          placeholder="Nova categoria"
                          className="h-10"
                        />
                        <Button type="button" variant="outline" onClick={addCategory} className="shrink-0 gap-1">
                          <Plus className="h-4 w-4" />
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    <Button type="button" variant="ghost" className="w-full gap-2" onClick={resetEditor}>
                      <RotateCcw className="h-4 w-4" />
                      Restaurar configuração padrão
                    </Button>
                  </div>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold">Aplicação segura</p>
                      <p className="text-xs mt-1 leading-relaxed">
                        Configurações existentes são preservadas. O VendorAI adiciona somente o que estiver faltando e evita duplicar categorias já cadastradas.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 bg-background border-t -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-1 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPreviewTemplate(null);
                      setEditing(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={applyingId === previewTemplate.id}
                    onClick={() => handleApply(previewTemplate.id, previewTemplate.nome)}
                  >
                    {applyingId === previewTemplate.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Aplicando...
                      </>
                    ) : previewIsVertical ? (
                      "Ativar módulo"
                    ) : (
                      "Usar template"
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
