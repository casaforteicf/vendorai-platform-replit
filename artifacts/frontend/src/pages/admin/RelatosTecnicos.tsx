import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle, CheckCircle2, XCircle, ArrowRightCircle,
  Clock, ChevronDown, ChevronUp, Building2, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RelatoTecnico {
  id: string;
  tenantId: string;
  tenantName: string | null;
  leadId: string | null;
  conversationId: string | null;
  descricaoProblema: string;
  transcriptRelevante: string | null;
  status: "pendente_revisao" | "confirmado_bug" | "nao_e_bug" | "encaminhado";
  criadoEm: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pendente_revisao: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <Clock className="h-3 w-3" />,
  },
  confirmado_bug: {
    label: "Bug Confirmado",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  nao_e_bug: {
    label: "Não é Bug",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: <XCircle className="h-3 w-3" />,
  },
  encaminhado: {
    label: "Encaminhado",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <ArrowRightCircle className="h-3 w-3" />,
  },
};

const STATUS_TABS = [
  { value: "all", label: "Todos" },
  { value: "pendente_revisao", label: "Pendentes" },
  { value: "confirmado_bug", label: "Bugs Confirmados" },
  { value: "encaminhado", label: "Encaminhados" },
  { value: "nao_e_bug", label: "Arquivados" },
];

export default function RelatosTecnicos() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("pendente_revisao");
  const [selectedRelato, setSelectedRelato] = useState<RelatoTecnico | null>(null);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());

  const { data: relatos = [], isLoading } = useQuery<RelatoTecnico[]>({
    queryKey: ["admin", "relatos-tecnicos", activeTab],
    queryFn: async () => {
      const params = activeTab !== "all" ? `?status=${activeTab}` : "";
      const r = await fetch(`/api/admin/relatos-tecnicos${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch relatos");
      return r.json();
    },
    enabled: !!token,
    refetchInterval: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/admin/relatos-tecnicos/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "relatos-tecnicos"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "relatos-tecnicos-count"] });
      setSelectedRelato(null);
      toast({ title: "Status atualizado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    },
  });

  function toggleTranscript(id: string) {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertCircle className="h-6 w-6 text-yellow-500" />
          Relatos Técnicos Pendentes
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Registros gerados automaticamente quando o agente de Suporte identifica um possível bug relatado por clientes. Requerem revisão humana antes de qualquer ação.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-t-md transition-colors",
              activeTab === tab.value
                ? "border border-b-0 border-slate-200 bg-white text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : relatos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-300" />
          <p>Nenhum relato nesta categoria</p>
        </div>
      ) : (
        <div className="space-y-3">
          {relatos.map((relato) => {
            const statusCfg = STATUS_CONFIG[relato.status] ?? STATUS_CONFIG.pendente_revisao!;
            const expanded = expandedTranscripts.has(relato.id);
            return (
              <Card
                key={relato.id}
                className={cn(
                  "border transition-shadow hover:shadow-md",
                  relato.status === "confirmado_bug" && "border-red-200 bg-red-50/30",
                  relato.status === "pendente_revisao" && "border-yellow-200"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={cn("text-xs flex items-center gap-1", statusCfg.className)}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                        {relato.tenantName && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Building2 className="h-3 w-3" />
                            {relato.tenantName}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {format(new Date(relato.criadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug">
                        {relato.descricaoProblema}
                      </p>
                    </div>

                    {/* Actions for pending */}
                    {relato.status === "pendente_revisao" && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-2 h-7"
                          onClick={() => updateStatus.mutate({ id: relato.id, status: "confirmado_bug" })}
                          disabled={updateStatus.isPending}
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          É Bug
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs px-2 h-7"
                          onClick={() => updateStatus.mutate({ id: relato.id, status: "encaminhado" })}
                          disabled={updateStatus.isPending}
                        >
                          <ArrowRightCircle className="h-3 w-3 mr-1" />
                          Encaminhar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-500 text-xs px-2 h-7"
                          onClick={() => updateStatus.mutate({ id: relato.id, status: "nao_e_bug" })}
                          disabled={updateStatus.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Não é Bug
                        </Button>
                      </div>
                    )}

                    {/* Re-open / change for non-pending */}
                    {relato.status !== "pendente_revisao" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-slate-400 shrink-0"
                        onClick={() => setSelectedRelato(relato)}
                      >
                        Alterar
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {relato.transcriptRelevante && (
                  <CardContent className="pt-0 pb-3">
                    <button
                      onClick={() => toggleTranscript(relato.id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-2"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {expanded ? "Ocultar trecho da conversa" : "Ver trecho da conversa"}
                      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {expanded && (
                      <pre className="text-xs text-slate-600 bg-slate-50 rounded-md p-3 whitespace-pre-wrap font-mono leading-relaxed border border-slate-100">
                        {relato.transcriptRelevante}
                      </pre>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog for changing status of non-pending relatos */}
      {selectedRelato && (
        <Dialog open={!!selectedRelato} onOpenChange={() => setSelectedRelato(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Alterar status do relato</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600 mb-4">{selectedRelato.descricaoProblema}</p>
            <div className="flex flex-col gap-2">
              {["confirmado_bug", "encaminhado", "nao_e_bug"].map((s) => {
                const cfg = STATUS_CONFIG[s]!;
                return (
                  <Button
                    key={s}
                    variant="outline"
                    className={cn("justify-start gap-2", selectedRelato.status === s && "opacity-50 cursor-not-allowed")}
                    disabled={selectedRelato.status === s || updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: selectedRelato.id, status: s })}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </Button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
