import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, ClipboardCheck, FileSearch, Loader2, Megaphone, Search, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import ProspectorClassic from "../ProspectorClassic";

type Section = "empresas" | "oportunidades";
type ClassicTab = "busca" | "cnpj" | "anunciantes" | "fila" | "aprovacoes";

type Props = {
  section: Section;
};

type VendiMissionResponse = {
  missionId: string;
  status?: string;
  execution?: {
    status?: string;
    pending?: { toolId?: string; reason?: string };
  };
};

const COMPANY_TABS: Array<{ value: ClassicTab; label: string; icon: typeof Search }> = [
  { value: "busca", label: "Busca local", icon: Search },
  { value: "cnpj", label: "CNPJ / CNAE", icon: FileSearch },
  { value: "anunciantes", label: "Anunciantes", icon: Megaphone },
];

const OPPORTUNITY_TABS: Array<{ value: ClassicTab; label: string; icon: typeof TrendingUp }> = [
  { value: "fila", label: "Fila priorizada", icon: TrendingUp },
  { value: "aprovacoes", label: "Aprovações", icon: ClipboardCheck },
];

function initialTab(section: Section): ClassicTab {
  if (typeof window === "undefined") return section === "empresas" ? "busca" : "fila";
  const requested = new URLSearchParams(window.location.search).get("tab") as ClassicTab | null;
  const allowed = section === "empresas" ? COMPANY_TABS.map((item) => item.value) : OPPORTUNITY_TABS.map((item) => item.value);
  return requested && allowed.includes(requested) ? requested : section === "empresas" ? "busca" : "fila";
}

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ProspectorClassicWorkspace({ section }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<ClassicTab>(() => initialTab(section));
  const [classicKey, setClassicKey] = useState(0);
  const [vendiRequest, setVendiRequest] = useState("");
  const [lastMissionId, setLastMissionId] = useState("");
  const options = section === "empresas" ? COMPANY_TABS : OPPORTUNITY_TABS;

  const vendiMission = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/vendi/missions", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          objective: vendiRequest.trim(),
          source: "module",
          sourceRefId: "prospector",
          priority: 60,
          riskPolicy: "standard",
          autoExecute: true,
          context: {
            module: "prospector",
            section,
            tab,
            route: window.location.pathname + window.location.search,
            instruction: "Execute esta solicitação usando primeiro as capabilities internas do Prospector/CRM. Use Web Engine apenas quando necessário. Preserve deduplicação e origem dos prospects.",
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Não foi possível iniciar a missão do Vendi");
      return body as VendiMissionResponse;
    },
    onSuccess: (data) => {
      setLastMissionId(data.missionId);
      setVendiRequest("");
      if (data.execution?.status === "paused_approval") {
        toast({
          title: "Vendi iniciou a prospecção",
          description: "A missão avançou até uma ação que precisa da sua aprovação.",
        });
      } else if (data.status === "queued") {
        toast({
          title: "Vendi recebeu a solicitação",
          description: "A missão foi salva e entrou na fila de execução.",
        });
      } else {
        toast({
          title: "Vendi assumiu a solicitação",
          description: "A missão foi criada e executada diretamente pelo Prospector.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Não foi possível iniciar o Vendi",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function changeTab(next: ClassicTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setTab(next);
    setClassicKey((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <Card className="border-primary/20 bg-primary/[0.025] shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">Solicitar ao Vendi</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <Sparkles className="h-3 w-3" /> atua direto
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Descreva o trabalho. O Vendi cria e executa a missão dentro do Prospector; você não precisa repetir a solicitação na Central de Operações.
                </p>
                <Textarea
                  value={vendiRequest}
                  onChange={(event) => setVendiRequest(event.target.value)}
                  className="mt-3 min-h-[82px]"
                  placeholder="Ex.: encontre construtoras no Oeste de SC com sinais de obra ativa, enriqueça os dados, remova duplicados e priorize as melhores oportunidades."
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={vendiRequest.trim().length < 3 || vendiMission.isPending}
                    onClick={() => vendiMission.mutate()}
                  >
                    {vendiMission.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                    Vendi, executar
                  </Button>
                  {lastMissionId && (
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href="/vendi/operacoes">Acompanhar missão</Link>
                    </Button>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    Ações externas de alto risco continuam exigindo aprovação.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{section === "empresas" ? "Fontes para encontrar empresas" : "Gestão das oportunidades"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {section === "empresas"
                ? "Escolha uma fonte. A empresa só vira oportunidade depois da qualificação."
                : "Trabalhe a fila priorizada e aprove somente o que deve seguir para a operação comercial."}
            </p>
          </div>
          <div className={`grid gap-1 rounded-lg bg-muted p-1 ${section === "empresas" ? "grid-cols-3" : "grid-cols-2"}`}>
            {options.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={tab === item.value ? "default" : "ghost"}
                  onClick={() => changeTab(item.value)}
                  className="h-8 gap-1.5 px-2 sm:px-3"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="[&_[role=tablist]]:hidden">
        <ProspectorClassic key={`${section}-${tab}-${classicKey}`} />
      </div>
    </div>
  );
}
