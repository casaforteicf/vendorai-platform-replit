import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock3, ImageIcon, Loader2, Wrench } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  orcamento_pendente: "Orçamento pendente",
  orcamento_enviado: "Orçamento enviado",
  aprovado: "Aprovado",
  agendado: "Agendado",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

type PortalActivity = {
  id: string;
  titulo: string;
  descricao?: string | null;
  concluido: boolean;
  observacao?: string | null;
  fotos: string[];
  concluidoPorNome?: string | null;
  concluidoEm?: string | null;
};

type PortalPayload = {
  id: string;
  cliente?: string | null;
  servico?: string | null;
  modeloExecucao: string;
  status?: string | null;
  atualizadoEm?: string | null;
  atividades: PortalActivity[];
};

export default function ServicoAcompanhamentoPublico() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<PortalPayload>({
    queryKey: ["servico-acompanhamento-publico", token],
    queryFn: async () => {
      const response = await fetch(`/api/portal/servicos/${encodeURIComponent(token ?? "")}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o acompanhamento.");
      return body;
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando acompanhamento...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardContent className="py-10 text-center">
            <Wrench className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Acompanhamento indisponível</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(error as Error | undefined)?.message ?? "Este link pode ter sido desativado."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = data.atividades.length;
  const concluidas = data.atividades.filter((atividade) => atividade.concluido).length;
  const percentual = total ? Math.round((concluidas / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="mx-auto max-w-3xl p-4 sm:p-6 space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">Acompanhamento da execução</p>
                <CardTitle className="mt-1">{data.servico ?? "Ordem de Serviço"}</CardTitle>
                {data.cliente && <p className="text-sm text-muted-foreground mt-1">{data.cliente}</p>}
              </div>
              {data.status && (
                <Badge variant="outline" className="text-sm">
                  {STATUS_LABELS[data.status] ?? data.status}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {total > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span>{concluidas} de {total} ações compartilhadas concluídas</span>
                  <span className="font-medium">{percentual}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${percentual}%` }} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                A equipe ainda não compartilhou atividades desta etapa.
              </p>
            )}

            {data.atualizadoEm && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                Atualizado em {new Date(data.atualizadoEm).toLocaleString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {data.atividades.map((atividade, index) => (
            <Card key={atividade.id}>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <div className={`mt-0.5 h-8 w-8 rounded-full border flex items-center justify-center shrink-0 ${atividade.concluido ? "bg-emerald-600 text-white border-emerald-600" : "bg-background"}`}>
                    {atividade.concluido ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-medium">{atividade.titulo}</p>
                      <Badge variant={atividade.concluido ? "secondary" : "outline"}>
                        {atividade.concluido ? "Concluída" : "Em andamento"}
                      </Badge>
                    </div>

                    {atividade.descricao && (
                      <p className="text-sm text-muted-foreground mt-1">{atividade.descricao}</p>
                    )}

                    {atividade.observacao && (
                      <p className="text-sm mt-3 whitespace-pre-wrap">{atividade.observacao}</p>
                    )}

                    {atividade.fotos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                        {atividade.fotos.map((src, photoIndex) => (
                          <a key={src} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted">
                            <img
                              src={src}
                              alt={`Evidência ${photoIndex + 1} de ${atividade.titulo}`}
                              className="aspect-square h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {atividade.fotos.length === 0 && atividade.concluido && (
                      <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" /> Conclusão registrada pela equipe.
                      </p>
                    )}

                    {atividade.concluidoEm && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Concluída
                        {atividade.concluidoPorNome ? ` por ${atividade.concluidoPorNome}` : ""}
                        {" · "}
                        {new Date(atividade.concluidoEm).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
