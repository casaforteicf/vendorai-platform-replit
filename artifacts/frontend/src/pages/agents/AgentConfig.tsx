import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  UserSearch,
  Handshake,
  BarChart2,
  AlertCircle,
  Headphones,
  CalendarCheck,
  Star,
  Telescope,
  type LucideIcon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

type AgentCardData = {
  agentKey: string;
  nome: string;
  descricao: string;
  categoria: string;
  ativo: boolean;
  nomePerfil: string | null;
};

// ── Metadados estáticos por agentKey ──────────────────────────────────────────

const AGENT_META: Record<string, { icon: LucideIcon; descricaoFallback: string }> = {
  sdr:          { icon: UserSearch,    descricaoFallback: "Prospecção ativa e primeiro contato com novos leads" },
  closer:       { icon: Handshake,     descricaoFallback: "Fechamento de negócios e tratamento de objeções" },
  financeiro:   { icon: BarChart2,     descricaoFallback: "Suporte financeiro e esclarecimento de dúvidas" },
  cobranca:     { icon: AlertCircle,   descricaoFallback: "Acompanhamento de inadimplências e cobranças" },
  suporte:      { icon: Headphones,    descricaoFallback: "Atendimento pós-venda e resolução de problemas" },
  agendamento:  { icon: CalendarCheck, descricaoFallback: "Agendamento de reuniões e visitas comerciais" },
  pos_venda:    { icon: Star,          descricaoFallback: "Relacionamento e fidelização de clientes ativos" },
  prospector:   { icon: Telescope,     descricaoFallback: "Descoberta e captação de novos prospects" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAgentConfigs(): Promise<AgentCardData[]> {
  const res = await fetch("/api/agent-configs", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ao buscar agentes: ${res.status}`);
  return res.json();
}

async function toggleAgent(agentKey: string, activate: boolean): Promise<{ agentKey: string; ativo: boolean }> {
  const action = activate ? "activate" : "deactivate";
  const res = await fetch(`/api/agent-configs/${agentKey}/${action}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ao ${activate ? "ativar" : "desativar"} agente`);
  return res.json();
}

// ── Skeleton de carregamento ───────────────────────────────────────────────────

function AgentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <Skeleton className="h-5 w-8 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </Card>
  );
}

// ── Card individual ────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onToggle,
  toggling,
  onConfigure,
}: {
  agent: AgentCardData;
  onToggle: (agentKey: string, activate: boolean) => void;
  toggling: boolean;
  onConfigure: (agent: AgentCardData) => void;
}) {
  const meta = AGENT_META[agent.agentKey];
  const Icon = meta?.icon ?? UserSearch;
  const descricao = agent.descricao || meta?.descricaoFallback || "";
  const nome = agent.nomePerfil || agent.nome;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{nome}</p>
            <p className="text-xs text-muted-foreground capitalize">{agent.categoria}</p>
          </div>
          <Badge
            variant={agent.ativo ? "default" : "secondary"}
            className={agent.ativo ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
          >
            {agent.ativo ? "Ativo" : "Inativo"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-0">
        <p className="text-sm text-muted-foreground leading-snug">{descricao}</p>

        <div className="flex items-center justify-between">
          <Switch
            checked={agent.ativo}
            disabled={toggling}
            onCheckedChange={(checked) => onToggle(agent.agentKey, checked)}
            aria-label={`${agent.ativo ? "Desativar" : "Ativar"} agente ${nome}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigure(agent)}
          >
            Configurar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AgentConfig() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<AgentCardData | null>(null);
  const [togglingKeys, setTogglingKeys] = useState<Set<string>>(new Set());

  const QUERY_KEY = ["agent-configs", user?.tenantId];

  const { data: agents, isLoading, isError, error } = useQuery<AgentCardData[]>({
    queryKey: QUERY_KEY,
    queryFn: fetchAgentConfigs,
    enabled: !!user?.tenantId,
  });

  const mutation = useMutation({
    mutationFn: ({ agentKey, activate }: { agentKey: string; activate: boolean }) =>
      toggleAgent(agentKey, activate),
    onMutate: async ({ agentKey, activate }) => {
      setTogglingKeys((prev) => new Set(prev).add(agentKey));
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<AgentCardData[]>(QUERY_KEY);
      queryClient.setQueryData<AgentCardData[]>(QUERY_KEY, (old) =>
        old?.map((a) => (a.agentKey === agentKey ? { ...a, ativo: activate } : a)) ?? []
      );
      return { prev };
    },
    onError: (_err, { agentKey }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      toast({
        title: "Erro ao atualizar agente",
        description: "Não foi possível alterar o status. Tente novamente.",
        variant: "destructive",
      });
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
    },
    onSettled: (_data, _err, { agentKey }) => {
      setTogglingKeys((prev) => { const s = new Set(prev); s.delete(agentKey); return s; });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onSuccess: (_data, { activate }) => {
      toast({
        title: activate ? "Agente ativado" : "Agente desativado",
        description: activate
          ? "O agente está ativo e pode ser usado nas conversas."
          : "O agente foi desativado.",
      });
    },
  });

  function handleToggle(agentKey: string, activate: boolean) {
    mutation.mutate({ agentKey, activate });
  }

  function handleConfigure(agent: AgentCardData) {
    setSelectedAgent(agent);
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agentes de IA</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie e configure os agentes de inteligência artificial disponíveis para o seu time.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Erro ao carregar agentes. Tente recarregar a página."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <AgentCardSkeleton key={i} />)
          : (agents ?? []).map((agent) => (
              <AgentCard
                key={agent.agentKey}
                agent={agent}
                onToggle={handleToggle}
                toggling={togglingKeys.has(agent.agentKey)}
                onConfigure={handleConfigure}
              />
            ))}
      </div>

      {selectedAgent && (
        <p className="text-xs text-muted-foreground text-center">
          Configuração avançada de <strong>{selectedAgent.nomePerfil ?? selectedAgent.nome}</strong> disponível em breve.
        </p>
      )}
    </div>
  );
}
