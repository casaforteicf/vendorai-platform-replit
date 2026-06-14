import { useAuth } from "@/contexts/AuthContext";
import {
  useListSegmentTemplates,
  useApplySegmentTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAgentConfigByTenantQueryKey } from "@workspace/api-client-react";
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
} from "lucide-react";
import { useState } from "react";

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

          toast({
            title: `Template "${templateNome}" aplicado!`,
            description: parts.join(", ") || "Configurações atualizadas com sucesso.",
          });

          queryClient.invalidateQueries({
            queryKey: getGetAgentConfigByTenantQueryKey(tenantId),
          });
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates?.map((template) => {
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
                  {/* Stats */}
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

                  {/* Funil stages */}
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

                  {/* Categories */}
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

                  {/* Apply button */}
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
      )}

      {!isLoading && (!templates || templates.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Store className="h-12 w-12 text-muted-foreground/40" />
          <h3 className="font-semibold text-muted-foreground">Nenhum template disponível</h3>
          <p className="text-sm text-muted-foreground/70">
            Os templates de segmento aparecerão aqui em breve.
          </p>
        </div>
      )}
    </div>
  );
}
