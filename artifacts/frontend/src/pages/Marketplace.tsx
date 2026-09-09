import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListSegmentTemplates,
  useApplySegmentTemplate,
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

export default function Marketplace() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useListSegmentTemplates();
  const applyMutation = useApplySegmentTemplate();

  const [view, setView] = useState<MarketplaceView>("modules");
  const [search, setSearch] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);

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

  function handleApply(templateId: string, templateNome: string) {
    setApplyingId(templateId);
    applyMutation.mutate(
      { tenantId, id: templateId },
      {
        onSuccess: (data) => {
          setAppliedId(templateId);
          setApplyingId(null);
          setPreviewTemplate(null);

          const parts: string[] = [];
          if (data.agentConfigUpdated && data.promptsApplied.length > 0) {
            parts.push(`${data.promptsApplied.length} agentes configurados`);
          }
          if (data.funilCreated) parts.push("funil criado");
          if (data.businessProfileUpdated) parts.push("segmento atualizado");

          const isVertical = templateNome in VERTICAL_MODULES;

          toast({
            title: isVertical
              ? `Módulo "${templateNome}" ativado!`
              : `Template "${templateNome}" aplicado!`,
            description: isVertical
              ? `${parts.join(", ")}. As funções do módulo já podem aparecer no menu lateral.`
              : parts.join(", ") || "Configurações atualizadas com sucesso.",
          });

          queryClient.invalidateQueries({
            queryKey: getGetAgentConfigByTenantQueryKey(tenantId),
          });

          if (isVertical) {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          }
        },
        onError: () => {
          setApplyingId(null);
          toast({
            title: "Não foi possível concluir",
            description: "Nada foi alterado. Tente novamente ou entre em contato com o suporte.",
            variant: "destructive",
          });
        },
      }
    );
  }

  function openPreview(template: any) {
    setPreviewTemplate(template);
  }

  const previewIsVertical = previewTemplate
    ? previewTemplate.nome in VERTICAL_MODULES
    : false;
  const previewPromptCount = previewTemplate
    ? Object.values(previewTemplate.promptsSugeridos ?? {}).filter(Boolean).length
    : 0;

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
                  <div className="flex items-start justify-between gap-3">
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

                  {template.funilPadrao && template.funilPadrao.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Inclui no funil
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {template.funilPadrao.slice(0, 3).map((etapa) => (
                          <Badge
                            key={etapa}
                            variant="secondary"
                            className="max-w-full text-[10px] px-2 py-1 font-medium"
                          >
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => openPreview(template)}
                    >
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

      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          {previewTemplate && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl pr-6">{previewTemplate.nome}</DialogTitle>
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
                      ? "Pode liberar páginas e funcionalidades específicas para este segmento."
                      : "Configura agentes, etapas do funil e categorias sugeridas para acelerar a implantação."}
                  </p>
                </div>

                {previewTemplate.descricao && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {previewTemplate.descricao}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Metric icon={Bot} value={previewPromptCount} label="agentes" />
                  <Metric icon={GitBranch} value={previewTemplate.funilPadrao?.length ?? 0} label="etapas" />
                  <Metric icon={Tag} value={previewTemplate.categoriasProdutoSugeridas?.length ?? 0} label="categorias" />
                </div>

                {previewTemplate.funilPadrao?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2">Funil que será sugerido</p>
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
                    <p className="text-xs font-semibold mb-2">Categorias sugeridas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewTemplate.categoriasProdutoSugeridas.map((categoria: string) => (
                        <Badge key={categoria} variant="outline" className="text-xs py-1">
                          {categoria}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold">Antes de aplicar</p>
                      <p className="text-xs mt-1 leading-relaxed">
                        Se o negócio já tiver funil, categorias ou agentes configurados, revise o impacto antes de confirmar para evitar substituir uma estrutura em uso.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setPreviewTemplate(null)}>
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
