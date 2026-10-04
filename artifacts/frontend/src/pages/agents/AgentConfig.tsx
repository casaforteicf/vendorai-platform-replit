import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { isAgentAllowedForVertical } from "@/lib/verticalAgentPolicy";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, CheckCircle2, Sparkles, Users } from "lucide-react";
import LegacyAgentConfig from "./AgentConfigLegacy";
import AgentGuidedSetup, { type GuidedAgentData } from "./AgentGuidedSetup";
import BrowserAgentPanel from "./BrowserAgentPanel";

const FLOW_ORDER = [
  "prospector",
  "recepcao",
  "sdr",
  "closer",
  "agendamento",
  "pos_venda",
  "financeiro",
  "cobranca",
  "suporte",
  "farmacia",
];

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAgentConfigs(): Promise<GuidedAgentData[]> {
  const res = await fetch("/api/agent-configs", { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ao buscar agentes: ${res.status}`);
  return res.json();
}

function isGuidedConfigured(agent: GuidedAgentData) {
  const setup = agent.parametros?.["guidedSetup"];
  if (!setup || typeof setup !== "object") return false;
  return Boolean((setup as { configuredAt?: string }).configuredAt);
}

export default function AgentConfig() {
  const { user, tenantOverride } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["agent-configs", user?.tenantId];

  const { data: agents = [] } = useQuery<GuidedAgentData[]>({
    queryKey,
    queryFn: fetchAgentConfigs,
    enabled: Boolean(user?.tenantId),
  });

  const effectiveVertical = tenantOverride?.vertical ?? user?.tenantVertical;
  const visibleAgents = useMemo(
    () => agents.filter((agent) => isAgentAllowedForVertical(agent.agentKey, effectiveVertical)),
    [agents, effectiveVertical],
  );

  const orderedAgents = useMemo(() => {
    const order = new Map(FLOW_ORDER.map((key, index) => [key, index]));
    return [...visibleAgents].sort((a, b) => (order.get(a.agentKey) ?? 999) - (order.get(b.agentKey) ?? 999));
  }, [visibleAgents]);

  const configuredCount = visibleAgents.filter(isGuidedConfigured).length;
  const [selectedKey, setSelectedKey] = useState("");
  const [guidedAgent, setGuidedAgent] = useState<GuidedAgentData | null>(null);
  const [teamMode, setTeamMode] = useState(false);
  const [teamIndex, setTeamIndex] = useState(0);
  const [teamQueue, setTeamQueue] = useState<GuidedAgentData[]>([]);

  const selectedAgent = visibleAgents.find((agent) => agent.agentKey === selectedKey)
    ?? visibleAgents.find((agent) => !isGuidedConfigured(agent))
    ?? visibleAgents[0]
    ?? null;

  function openSingle() {
    if (!selectedAgent) return;
    setTeamMode(false);
    setTeamQueue([]);
    setTeamIndex(0);
    setGuidedAgent(selectedAgent);
  }

  function openTeam() {
    if (orderedAgents.length === 0) return;
    const pendingFirst = [
      ...orderedAgents.filter((agent) => !isGuidedConfigured(agent)),
      ...orderedAgents.filter(isGuidedConfigured),
    ];
    setTeamQueue(pendingFirst);
    setTeamIndex(0);
    setTeamMode(true);
    setGuidedAgent(pendingFirst[0]);
  }

  function updateCachedAgent(agentKey: string, updated: Partial<GuidedAgentData>) {
    queryClient.setQueryData<GuidedAgentData[]>(queryKey, (current) =>
      current?.map((agent) => agent.agentKey === agentKey ? { ...agent, ...updated } : agent) ?? [],
    );
    void queryClient.invalidateQueries({ queryKey });
  }

  function handleGuidedComplete(updated: Partial<GuidedAgentData>, moveNext: boolean) {
    if (!guidedAgent) return;
    updateCachedAgent(guidedAgent.agentKey, updated);

    if (teamMode && moveNext) {
      const nextIndex = teamIndex + 1;
      const nextAgent = teamQueue[nextIndex];
      if (nextAgent) {
        setTeamIndex(nextIndex);
        setGuidedAgent({ ...nextAgent, ...(
          nextAgent.agentKey === guidedAgent.agentKey ? updated : {}
        ) });
        return;
      }
    }

    setGuidedAgent(null);
    if (teamMode) {
      setTeamMode(false);
      setTeamQueue([]);
      setTeamIndex(0);
      toast({ title: "Equipe configurada", description: "A configuração guiada foi concluída. Você pode revisar qualquer agente no modo avançado." });
    }
  }

  function openAdvancedFromGuide() {
    setGuidedAgent(null);
    setTeamMode(false);
    setTeamQueue([]);
    setTeamIndex(0);
    toast({
      title: "Modo avançado",
      description: "Use o botão Configurar no card do agente abaixo para editar prompt, arquivos, conhecimento e demais detalhes técnicos.",
    });
  }

  return (
    <div className="vendor-product-page vendor-page-canvas vendor-agents-page" data-ai-accent="true">
      <div className="mx-auto w-full max-w-6xl pt-1">
        <Card className="overflow-hidden border-primary/20 bg-primary/[0.025] shadow-sm">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">Configure sua equipe com IA</h2>
                  <Badge variant="secondary" className="text-[10px]">Recomendado</Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  O VendorAI usa o Perfil do Negócio, catálogo e Base de Conhecimento para preparar cada agente em 7 etapas simples — sem exigir que o usuário escreva prompts.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{configuredCount} de {visibleAgents.length} com configuração guiada</span>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Objetivo, autonomia, handoff e comunicação</span>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Select value={selectedKey || selectedAgent?.agentKey || ""} onValueChange={setSelectedKey}>
                <SelectTrigger className="w-full bg-background sm:w-[220px]">
                  <SelectValue placeholder="Escolher agente" />
                </SelectTrigger>
                <SelectContent>
                  {orderedAgents.map((agent) => (
                    <SelectItem key={agent.agentKey} value={agent.agentKey}>
                      {agent.nomePerfil || agent.nome}{isGuidedConfigured(agent) ? " · configurado" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openSingle} disabled={!selectedAgent}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Configurar com IA
              </Button>
              <Button variant="outline" onClick={openTeam} disabled={orderedAgents.length === 0} className="bg-background">
                <Bot className="mr-1.5 h-4 w-4" />
                Configurar equipe
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <LegacyAgentConfig />

      <details className="mx-auto mt-4 w-full max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Ferramentas avançadas</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Vendi, conhecimento compartilhado e Browser Agent ficam disponíveis sob demanda.</p>
          </div>
          <span className="text-xs font-medium text-primary">Abrir</span>
        </summary>
        <div className="space-y-4 border-t border-border/60 p-4">
          <Card className="flex flex-col gap-3 border-primary/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Vendi · Central de Operações</h3>
              <p className="mt-1 text-sm text-muted-foreground">Crie missões para o Vendi coordenar CRM, Marketing, Prospector, agentes, Agenda, propostas, obras, compras, Arqdor, omnichannel e web.</p>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/vendi/operacoes"><Bot className="mr-2 h-4 w-4" />Abrir Vendi</Link>
            </Button>
          </Card>

          <Card className="space-y-2 p-4">
            <h3 className="font-semibold">Conhecimento compartilhado da empresa</h3>
            <p className="text-sm text-muted-foreground">Os blocos aprovados em Marca e Negócio complementam o conhecimento de cada agente, conforme sua função.</p>
            <a href="/configuracoes?tab=marketing" className="inline-block text-sm font-medium text-primary underline">Visualizar base dos agentes</a>
          </Card>

          <BrowserAgentPanel />
        </div>
      </details>

      {guidedAgent && user?.tenantId && (
        <AgentGuidedSetup
          key={`${guidedAgent.agentKey}-${teamMode ? teamIndex : "single"}`}
          agent={guidedAgent}
          tenantId={user.tenantId}
          teamPosition={teamMode ? { index: teamIndex, total: teamQueue.length } : null}
          onClose={() => {
            setGuidedAgent(null);
            setTeamMode(false);
            setTeamQueue([]);
            setTeamIndex(0);
          }}
          onOpenAdvanced={openAdvancedFromGuide}
          onComplete={handleGuidedComplete}
        />
      )}
    </div>
  );
}

