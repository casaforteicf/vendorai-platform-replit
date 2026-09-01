import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock3, Sparkles, TrendingUp } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type TrialStatus = {
  isTrial: boolean;
  status?: "active" | "suspended" | "cancelled";
  companyName?: string;
  day?: number;
  daysRemaining?: number;
  expiresAt?: string | null;
  score?: number;
  tier?: "baixo" | "medio" | "alto" | "muito_alto";
  nextAction?: string;
  milestones?: {
    firstLogin: boolean;
    onboardingComplete: boolean;
    integrationsComplete: boolean;
    realLeads: number;
    messages: number;
    deals: number;
  };
  upgradeRequested?: boolean;
  upgradeRequestedAt?: string | null;
};

function Milestone({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div className={`flex items-center gap-1.5 text-xs ${done ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

export function TrialActivationCard() {
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { data, isLoading } = useQuery<TrialStatus>({
    queryKey: ["trial-status"],
    queryFn: async () => {
      const response = await fetch("/api/trial/status", { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar o status do trial");
      return response.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data?.isTrial) return null;

  const score = data.score ?? 0;
  const m = data.milestones;
  const days = data.daysRemaining ?? 0;

  async function requestUpgrade() {
    setRequesting(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/trial/request-upgrade", {
        method: "POST",
        headers: authHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Não foi possível solicitar continuidade");
      await queryClient.invalidateQueries({ queryKey: ["trial-status"] });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Erro ao solicitar continuidade");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.025] overflow-hidden" data-testid="trial-activation-card">
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1"><Clock3 className="h-3 w-3" />Dia {data.day ?? 1} de 5</Badge>
              <Badge variant={score >= 70 ? "default" : "secondary"}>Activation Score {score}/100</Badge>
              <span className="text-xs text-muted-foreground">{days > 0 ? `${days} dia(s) restante(s)` : "Trial encerrando/encerrado"}</span>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Seu progresso no trial</div>
                <span className="text-xs text-muted-foreground">{data.tier?.replace("_", " ")}</span>
              </div>
              <Progress value={score} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
              <Milestone done={Boolean(m?.firstLogin)} label="Primeiro acesso" />
              <Milestone done={Boolean(m?.onboardingComplete)} label="Onboarding" />
              <Milestone done={Boolean(m?.integrationsComplete)} label="Integração/canal" />
              <Milestone done={(m?.realLeads ?? 0) > 0} label={`${m?.realLeads ?? 0} lead(s) real(is)`} />
              <Milestone done={(m?.messages ?? 0) > 0} label={`${m?.messages ?? 0} mensagem(ns)`} />
              <Milestone done={(m?.deals ?? 0) > 0} label={`${m?.deals ?? 0} oportunidade(s)`} />
            </div>

            <div className="rounded-md border bg-background/80 p-3 text-sm">
              <strong>Próximo passo:</strong> {data.nextAction}
            </div>
          </div>

          <div className="lg:w-56 shrink-0 space-y-2">
            <Button
              className="w-full gap-2"
              onClick={requestUpgrade}
              disabled={requesting || data.upgradeRequested}
            >
              <TrendingUp className="h-4 w-4" />
              {data.upgradeRequested ? "Continuidade solicitada" : requesting ? "Enviando..." : "Quero continuar"}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Mantém a mesma conta e os dados criados durante o trial.
            </p>
            {requestError && <p className="text-xs text-destructive text-center">{requestError}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
