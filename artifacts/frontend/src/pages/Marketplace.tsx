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
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import { useState } from "react";

const VERTICAL_MODULES: Record<string, { label: string; icon: React.ElementType; color: string }> = {
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
};

export default function Marketplace() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useListSegmentTemplates();
  const applyMutation = useApplySegmentTemplate();

  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  function handleApply(templateId: string, templateNome: string) {
    setApplyingId(templateId);
    applyMutation.mutate(
      { tenantId, id: templateId },
      {
        onSuccess: (data) => {
          setAppliedId(templateId);
          setApplyingId(null);

          const parts: string[] = [];
          if (data.agentConfigUpdated && data.promptsApplied.length > 0)
            parts.push(`${data.promptsApplied.length} agentes configurados`);
          if (data.funilCreated) parts.push("funil criado");
          if (data.businessProfileUpdated) parts.push("vertical atualizado");

          const isVertical = templateNome in VERTICAL_MODULES;

          toast({
            title: `Template "${templateNome}" aplicado!`,
            description: isVertical
              ? `${parts.join(", ")}. O módulo de ${templateNome} já está disponível no menu lateral.`
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
            title: "Erro ao aplicar template",
            description: "Tente novamente ou entre em contato com o suporte.",
            variant: "destructive",
          });
        },
      }
    );
  }

  const verticalTemplates = templates?.filter((t) => t.nome in VERTICAL_MODULES) ?? [];
  const regularTemplates = templates?.filter((t) => !(t.nome in VERTICAL_MODULES)) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Templates de segmento prontos para o seu negócio — aplique prompts de IA, funil de vendas e categorias de produto em segundos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* ── Módulos Verticais ─────────────────────────────────────── */}
          {verticalTemplates.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-base">Módulos Verticais</h2>
                <span className="text-xs text-muted-foreground">— desbloqueiam páginas e funcionalidades exclusivas no menu lateral</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {verticalTemplates.map((template) => {
                  const isApplied = appliedId === template.id;
                  const isApplying = applyingId === template.id;
                  const promptCount = Object.values(template.promptsSugeridos ?? {}).filter(Boolean).length;
                  const verticalMeta = VERTICAL_MODULES[template.nome];
                  const VerticalIcon = verticalMeta.icon;
                  const isActive = user?.tenantVertical === template.nome;

                  return (
                    <Card
                      key={template.id}
                      className={`flex flex-col transition-all ${
                        isApplied || isActive
                          ? "border-green-400 ring-1 ring-green-300"
                          : "hover:shadow-md border-primary/20"
                      }`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`shrink-0 p-1.5 rounded-md border ${verticalMeta.color}`}>
                              <VerticalIcon className="h-4 w-4" />
                            </div>
                            <CardTitle className="text-base font-semibold leading-snug">
                              {template.nome}
                            </CardTitle>
                          </div>
                          {(isApplied || isActive) && (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${verticalMeta.color}`}>
                            <Sparkles className="h-2.5 w-2.5" />
                            {verticalMeta.label}
                          </span>
                          {isActive && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                              Ativo no seu plano
                            </span>
                          )}
                        </div>
                        {template.descricao && (
                          <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                            {template.descricao}
                          </p>
                        )}
                      </CardHeader>

                      <CardContent className="flex-1 flex flex-col gap-4">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <Bot className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{promptCount}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">agentes</span>
                          </div>
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <GitBranch className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{template.funilPadrao?.length ?? 0}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">etapas</span>
                          </div>
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <Tag className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{template.categoriasProdutoSugeridas?.length ?? 0}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">categorias</span>
                          </div>
                        </div>

                        {template.funilPadrao && template.funilPadrao.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Funil Padrão
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {template.funilPadrao.slice(0, 4).map((etapa) => (
                                <Badge key={etapa} variant="secondary" className="text-[10px] px-2 py-0.5">
                                  {etapa}
                                </Badge>
                              ))}
                              {template.funilPadrao.length > 4 && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                  +{template.funilPadrao.length - 4}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        <Button
                          className="mt-auto w-full gap-2"
                          variant={isApplied || isActive ? "outline" : "default"}
                          disabled={isApplying || isApplied || isActive}
                          onClick={() => handleApply(template.id, template.nome)}
                        >
                          {isApplying ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Aplicando...
                            </>
                          ) : isApplied || isActive ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              {isActive ? "Módulo Ativo" : "Módulo Aplicado"}
                            </>
                          ) : (
                            <>
                              Ativar Módulo
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Templates de Segmento ─────────────────────────────────── */}
          {regularTemplates.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-base">Templates de Segmento</h2>
                <span className="text-xs text-muted-foreground">— prompts de IA, funil e categorias prontos</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {regularTemplates.map((template) => {
                  const isApplied = appliedId === template.id;
                  const isApplying = applyingId === template.id;
                  const promptCount = Object.values(template.promptsSugeridos ?? {}).filter(Boolean).length;

                  return (
                    <Card
                      key={template.id}
                      className={`flex flex-col transition-all ${isApplied ? "border-green-400 ring-1 ring-green-300" : "hover:shadow-md"}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base font-semibold leading-snug">
                            {template.nome}
                          </CardTitle>
                          {isApplied && (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          )}
                        </div>
                        {template.descricao && (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {template.descricao}
                          </p>
                        )}
                      </CardHeader>

                      <CardContent className="flex-1 flex flex-col gap-4">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <Bot className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{promptCount}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">agentes</span>
                          </div>
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <GitBranch className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{template.funilPadrao?.length ?? 0}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">etapas</span>
                          </div>
                          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 text-center">
                            <Tag className="h-4 w-4 text-primary mb-1" />
                            <span className="text-xs font-semibold">{template.categoriasProdutoSugeridas?.length ?? 0}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">categorias</span>
                          </div>
                        </div>

                        {template.funilPadrao && template.funilPadrao.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Funil Padrão
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {template.funilPadrao.slice(0, 4).map((etapa) => (
                                <Badge key={etapa} variant="secondary" className="text-[10px] px-2 py-0.5">
                                  {etapa}
                                </Badge>
                              ))}
                              {template.funilPadrao.length > 4 && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                  +{template.funilPadrao.length - 4}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {template.categoriasProdutoSugeridas && template.categoriasProdutoSugeridas.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Categorias de Produto
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {template.categoriasProdutoSugeridas.slice(0, 3).map((cat) => (
                                <Badge key={cat} variant="outline" className="text-[10px] px-2 py-0.5">
                                  {cat}
                                </Badge>
                              ))}
                              {template.categoriasProdutoSugeridas.length > 3 && (
                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">
                                  +{template.categoriasProdutoSugeridas.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        <Button
                          className="mt-auto w-full gap-2"
                          variant={isApplied ? "outline" : "default"}
                          disabled={isApplying || isApplied}
                          onClick={() => handleApply(template.id, template.nome)}
                        >
                          {isApplying ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Aplicando...
                            </>
                          ) : isApplied ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                              Template Aplicado
                            </>
                          ) : (
                            <>
                              Aplicar ao meu negócio
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {!templates || templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Store className="h-12 w-12 text-muted-foreground/40" />
              <h3 className="font-semibold text-muted-foreground">Nenhum template disponível</h3>
              <p className="text-sm text-muted-foreground/70">
                Os templates de segmento aparecerão aqui em breve.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
