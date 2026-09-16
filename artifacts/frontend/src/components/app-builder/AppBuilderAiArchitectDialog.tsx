import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BrainCircuit, CheckCircle2, Loader2, ShieldCheck, Sparkles, TriangleAlert, WandSparkles } from "lucide-react";
import { MOBILE_APP_ARCHITECT_REQUIREMENT } from "./mobileAppStandard";

type JsonObject = Record<string, unknown>;
type TemplateLike = { id: string; name: string } | null;
type AppContext = {
  id?: string;
  tenantId?: string | null;
  name?: string;
  slug?: string;
  status?: string;
  ownerType?: "tenant" | "prospect" | "internal";
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerCompany?: string | null;
} | null;

type AiProposal = {
  summary: string;
  assumptions: string[];
  questions: string[];
  warnings: string[];
  architecture: {
    pages: Array<{ id: string; title: string; purpose?: string }>;
    roles: Array<{ key: string; name: string; purpose?: string }>;
    dataModel: Array<{ entity: string; purpose?: string; source?: string }>;
    integrations: string[];
    risks: string[];
  };
  definition: JsonObject;
  gaps: Array<{ type: string; key?: string; description: string; severity: string }>;
  recommendedActions: string[];
  quality: { completeness: number; ux: number; security: number; data: number; integration: number };
};

type AiResponse = {
  proposal: AiProposal;
  validation: { ok: boolean; findings: string[] };
  usage: { inputTokens: number; outputTokens: number; costUsd: number; passes: number };
};

type ValueAgentSpec = {
  enabled?: boolean;
  name?: string;
  promise?: string;
  preLeadServices?: string[];
  publicDataSources?: Array<{ name?: string; purpose?: string; availability?: "registry" | "gap" | "unknown" }>;
  intakeQuestions?: string[];
  qualification?: { signals?: string[]; scores?: string[]; routing?: string[] };
  handoff?: { triggers?: string[]; destination?: string; sla?: string };
  crm?: { createLead?: boolean; pipeline?: string; fields?: string[]; artifacts?: string[] };
  safeguards?: string[];
  missingCapabilities?: string[];
};

type ProductModelSpec = {
  appProduct?: {
    valueProposition?: string;
    nativeFunctions?: string[];
    userJourneys?: string[];
    channels?: string[];
  };
  appAdmin?: {
    nativeFunctions?: string[];
    manages?: string[];
  };
  vendorAiSaas?: {
    valueProposition?: string;
    capabilities?: string[];
    consumes?: string[];
    returns?: string[];
  };
  boundaries?: string[];
  monetization?: {
    appSale?: string;
    saasSubscription?: string;
    addons?: string[];
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null | undefined;
  template: TemplateLike;
  app: AppContext;
  onVersionCreated?: () => void | Promise<void>;
};

const STARTER = "Descreva o app que precisamos construir. Inclua objetivo do negócio, usuários, principais operações, dados, integrações, restrições e o que seria sucesso. A IA vai completar a arquitetura, separar App Product / App Admin / VendorAI SaaS, criar o Agente de Valor + Captação e apontar o que estiver faltando.";

const PRODUCT_MODEL_REQUIREMENT = `REGRA OBRIGATÓRIA DO VENDORAI APP BUILDER — MODELO COMERCIAL E FUNCIONAL
Todo projeto deve separar claramente três produtos conectados:
1. APP PRODUCT: produto que será vendido ao cliente e usado pelo público/usuário final. Precisa ter valor próprio e cumprir sua promessa principal sem depender da assinatura VendorAI SaaS.
2. APP ADMIN: painel nativo básico para o comprador administrar o próprio app. Não transforme esse painel em uma cópia do VendorAI.
3. VENDORAI SaaS: produto recorrente vendido separadamente para administrar o negócio e ampliar o app com CRM, marketing, conteúdo, automações, IA, analytics, Revenue Scout, financeiro, Customer Intelligence e demais capacidades disponíveis.

Inclua obrigatoriamente dentro de definition.productModel:
{
  "appProduct": {
    "valueProposition": "por que alguém compra este app como produto",
    "nativeFunctions": ["funções que fazem parte do produto vendido"],
    "userJourneys": ["jornadas principais do usuário final"],
    "channels": ["mobile|web|portal|site|lp|ecommerce|outro conforme o caso"]
  },
  "appAdmin": {
    "nativeFunctions": ["administração básica que acompanha o app"],
    "manages": ["o que o comprador consegue administrar sem contratar o SaaS"]
  },
  "vendorAiSaas": {
    "valueProposition": "por que o cliente paga a mensalidade recorrente",
    "capabilities": ["capacidades SaaS existentes ou gaps explicitamente marcados"],
    "consumes": ["dados/eventos recebidos do app"],
    "returns": ["ações, inteligência ou automações devolvidas ao app/operação"]
  },
  "boundaries": ["fronteiras que evitam duplicar módulos entre App Admin e VendorAI SaaS"],
  "monetization": {
    "appSale": "como o App Product pode ser vendido/licenciado",
    "saasSubscription": "como o VendorAI SaaS entra como recorrência",
    "addons": ["integrações, consumo, canais ou capacidades adicionais"]
  }
}

REGRA DE VALOR: nenhuma função essencial para a promessa comercial do APP PRODUCT pode ficar escondida atrás do VendorAI SaaS. O app deve continuar sendo um produto legítimo e utilizável. O SaaS administra o negócio de forma mais ampla e adiciona inteligência, gestão e automação recorrente.

REUSO OBRIGATÓRIO: use tecnologias já existentes nos registries e módulos VendorAI. Não crie módulos paralelos. Se uma capacidade necessária não existir, registre em gaps em vez de fingir disponibilidade.`;

const VALUE_AGENT_REQUIREMENT = `REGRA OBRIGATÓRIA DO VENDORAI APP BUILDER — AGENTE DE VALOR + CAPTAÇÃO
Todo app deve nascer com um agente especializado no segmento que entregue valor real ANTES de pedir os dados do lead. Não crie um formulário disfarçado de chat.

Inclua obrigatoriamente dentro de definition.valueAgent este objeto:
{
  "enabled": true,
  "name": "nome adequado ao segmento",
  "promise": "qual valor útil o agente entrega antes da captação",
  "preLeadServices": ["serviços úteis gratuitos ou de pré-análise que gerem confiança"],
  "publicDataSources": [{"name":"fonte ou integração","purpose":"para que serve","availability":"registry|gap|unknown"}],
  "intakeQuestions": ["perguntas adaptativas mínimas para entender necessidade, urgência e contexto"],
  "qualification": {"signals":[],"scores":[],"routing":[]},
  "handoff": {"triggers":[],"destination":"responsável humano/equipe","sla":"quando aplicável"},
  "crm": {"createLead":true,"pipeline":"pipeline sugerida","fields":[],"artifacts":[]},
  "safeguards": ["limites regulatórios, profissionais, privacidade e quando não responder"],
  "missingCapabilities": ["integrações ou capacidades necessárias que ainda não existem"]
}

O agente deve usar o segmento para descobrir o melhor serviço pré-lead. Exemplos: jurídico pode consultar/explicar andamento processual e legislação pública quando houver fonte permitida; construção pode fazer pré-estudo de obra/custo; seguros pode fazer diagnóstico de cobertura; imobiliário pode analisar perfil e opções. Estes são exemplos, não uma lista fechada.

NUNCA finja que uma integração existe. Só marque availability=registry quando a capacidade estiver nos registries fornecidos. Caso contrário marque gap e também registre a necessidade em proposal.gaps. Em áreas reguladas, o agente pode informar, organizar, fazer pré-análise e qualificar, mas não deve se apresentar como profissional habilitado nem produzir decisão profissional conclusiva quando isso exigir humano.

A jornada padrão deve ser: VALOR ÚTIL -> EXPLICAÇÃO/RESULTADO -> IDENTIFICAÇÃO DA NECESSIDADE -> TRIAGEM DINÂMICA -> QUALIFICAÇÃO -> CAPTURA CONSENTIDA -> CRM -> AGENDAMENTO/HANDOFF. Preserve este agente nas revisões futuras, melhorando-o em vez de removê-lo.`;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export default function AppBuilderAiArchitectDialog({ open, onOpenChange, token, template, app, onVersionCreated }: Props) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"generate" | "revise" | "analyze">("generate");
  const [depth, setDepth] = useState<"fast" | "deep">("deep");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AiResponse | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const targetLabel = useMemo(() => {
    if (!app) return "Projeto sem app selecionado";
    if (app.tenantId) return `Tenant · ${app.name ?? "App"}`;
    return `${app.ownerType === "internal" ? "Interno" : "Pré-tenant"} · ${app.ownerCompany || app.ownerName || app.name || "Projeto"}`;
  }, [app]);

  const valueAgent = useMemo(() => {
    const raw = result?.proposal.definition?.valueAgent;
    return Object.keys(asObject(raw)).length ? asObject(raw) as ValueAgentSpec : null;
  }, [result]);

  const productModel = useMemo(() => {
    const raw = result?.proposal.definition?.productModel;
    return Object.keys(asObject(raw)).length ? asObject(raw) as ProductModelSpec : null;
  }, [result]);

  const valueAgentReady = Boolean(
    valueAgent?.enabled !== false &&
    valueAgent?.name?.trim() &&
    valueAgent?.promise?.trim() &&
    asStrings(valueAgent?.preLeadServices).length > 0 &&
    (valueAgent?.handoff?.destination?.trim() || asStrings(valueAgent?.handoff?.triggers).length > 0),
  );

  const productModelReady = Boolean(
    productModel?.appProduct?.valueProposition?.trim() &&
    asStrings(productModel?.appProduct?.nativeFunctions).length > 0 &&
    asStrings(productModel?.appAdmin?.nativeFunctions).length > 0 &&
    productModel?.vendorAiSaas?.valueProposition?.trim() &&
    asStrings(productModel?.vendorAiSaas?.capabilities).length > 0,
  );

  const proposalReady = Boolean(result?.validation.ok && valueAgentReady && productModelReady);

  async function runArchitect(nextRequest?: string) {
    const rawRequest = (nextRequest ?? prompt).trim();
    if (!token || !rawRequest) return;
    const request = `${MOBILE_APP_ARCHITECT_REQUIREMENT}\n\n${PRODUCT_MODEL_REQUIREMENT}\n\n${VALUE_AGENT_REQUIREMENT}\n\nPEDIDO DO USUÁRIO:\n${rawRequest}`;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/app-builder/ai/architect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          depth,
          request,
          templateId: template?.id,
          tenantId: app?.tenantId ?? undefined,
          appContext: app ? {
            id: app.id,
            name: app.name,
            slug: app.slug,
            status: app.status,
            ownerType: app.ownerType ?? (app.tenantId ? "tenant" : "prospect"),
            ownerName: app.ownerName,
            ownerEmail: app.ownerEmail,
            ownerCompany: app.ownerCompany,
          } : undefined,
          currentDefinition: result?.proposal.definition,
          conversation,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível gerar a arquitetura");
      const next = payload as AiResponse;
      setResult(next);
      setConversation((current) => [
        ...current.slice(-8),
        { role: "user", content: rawRequest },
        { role: "assistant", content: next.proposal.summary },
      ]);
      setPrompt("");
    } catch (error) {
      toast({ title: "Erro no Arquiteto IA", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function applyAsVersion() {
    if (!token || !template || !result?.proposal.definition || !proposalReady) return;
    setApplying(true);
    try {
      const response = await fetch(`/api/admin/app-builder/templates/${template.id}/versions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: result.proposal.definition,
          changeLog: `Arquiteto IA · ${result.proposal.summary.slice(0, 240)}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Não foi possível criar a nova versão");
      toast({ title: `Versão ${payload?.version ?? "nova"} criada`, description: "A versão usa o padrão Mobile V2.2, separa App Product, App Admin e VendorAI SaaS, inclui o Agente de Valor + Captação e ficou em rascunho para revisão." });
      await onVersionCreated?.();
    } catch (error) {
      toast({ title: "Erro ao aplicar arquitetura", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  const quality = result?.proposal.quality;
  const qualityRows = quality ? [
    ["Completude", quality.completeness], ["UX", quality.ux], ["Segurança", quality.security], ["Dados", quality.data], ["Integração", quality.integration],
  ] as const : [];

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[96vh] overflow-y-auto sm:max-w-[96vw] xl:max-w-6xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Arquiteto IA · App Builder</DialogTitle>
        <DialogDescription>Arquitetura em duas passagens, Mobile V2.2, separação App Product / App Admin / VendorAI SaaS, Agente de Valor + Captação obrigatório, registries reais e aplicação somente como nova versão em rascunho.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-2"><Badge variant="outline">{targetLabel}</Badge><Badge variant="outline">Template: {template?.name ?? "não selecionado"}</Badge><Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3" />Nunca publica sozinho</Badge><Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />Mobile V2.2</Badge><Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />App vendável + SaaS recorrente</Badge><Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />Valor antes do lead</Badge></div>

      <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[180px_180px_1fr]">
        <div><p className="mb-1 text-xs font-medium text-muted-foreground">Modo</p><Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="generate">Projetar</SelectItem><SelectItem value="revise">Revisar e melhorar</SelectItem><SelectItem value="analyze">Auditar</SelectItem></SelectContent></Select></div>
        <div><p className="mb-1 text-xs font-medium text-muted-foreground">Profundidade</p><Select value={depth} onValueChange={(value) => setDepth(value as typeof depth)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deep">Profunda · 2 passagens</SelectItem><SelectItem value="fast">Rápida · 1 passagem</SelectItem></SelectContent></Select></div>
        <div className="rounded-lg border bg-background p-3 text-xs leading-5 text-muted-foreground"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />A IA deve criar um App Product que tenha valor próprio, um App Admin nativo e uma proposta separada de VendorAI SaaS para a recorrência, reutilizando a tecnologia já existente.</div>
      </div>

      <div className="space-y-2"><p className="text-sm font-semibold">O que vamos construir ou melhorar?</p><Textarea rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={STARTER} /><div className="flex justify-end"><Button onClick={() => void runArchitect()} disabled={busy || !prompt.trim()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}{busy ? "Arquitetando..." : result ? "Refinar com IA" : "Arquitetar com IA"}</Button></div></div>

      {result && <div className="space-y-4">
        <div className={`rounded-xl border p-4 ${proposalReady ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}><div className="flex items-start gap-3">{proposalReady ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-600" />}<div><p className="font-semibold">{proposalReady ? "Arquitetura validada" : "Arquitetura com pendências"}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{result.proposal.summary}</p>{!productModelReady && <p className="mt-2 text-xs font-medium text-amber-800">Falta separar completamente App Product, App Admin e VendorAI SaaS. A versão não pode ser aplicada enquanto o app vendido depender do SaaS para sua função principal.</p>}{!valueAgentReady && <p className="mt-2 text-xs font-medium text-amber-800">Falta completar o Agente de Valor + Captação com valor pré-lead e handoff.</p>}</div></div></div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{qualityRows.map(([label, value]) => <div key={label} className="rounded-xl border p-3 text-center"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{Math.round(value)}</p></div>)}</div>

        {productModel && <section className="rounded-xl border p-4"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">Modelo do produto</p><Badge variant={productModelReady ? "default" : "secondary"}>{productModelReady ? "Separação completa" : "Incompleto"}</Badge></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold">1 · APP PRODUCT</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{productModel.appProduct?.valueProposition || "Proposta de valor não definida."}</p><div className="mt-2 space-y-1">{asStrings(productModel.appProduct?.nativeFunctions).slice(0, 8).map((item) => <p key={item} className="text-xs">• {item}</p>)}</div></div><div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold">2 · APP ADMIN</p><p className="mt-1 text-xs text-muted-foreground">Administração nativa que acompanha o produto vendido.</p><div className="mt-2 space-y-1">{asStrings(productModel.appAdmin?.nativeFunctions).slice(0, 8).map((item) => <p key={item} className="text-xs">• {item}</p>)}</div></div><div className="rounded-lg border bg-background p-3"><p className="text-xs font-semibold">3 · VENDORAI SaaS</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{productModel.vendorAiSaas?.valueProposition || "Proposta recorrente não definida."}</p><div className="mt-2 space-y-1">{asStrings(productModel.vendorAiSaas?.capabilities).slice(0, 8).map((item) => <p key={item} className="text-xs">• {item}</p>)}</div></div></div>{asStrings(productModel.boundaries).length > 0 && <div className="mt-3 rounded-lg bg-muted/40 p-3"><p className="text-xs font-semibold">Fronteiras para não duplicar tecnologia</p>{asStrings(productModel.boundaries).map((item) => <p key={item} className="mt-1 text-xs text-muted-foreground">• {item}</p>)}</div>}</section>}

        {valueAgent && <section className="rounded-xl border border-primary/20 bg-primary/[0.025] p-4"><div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Agente de Valor + Captação</p><Badge variant={valueAgentReady ? "default" : "secondary"}>{valueAgentReady ? "Completo" : "Incompleto"}</Badge></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="text-sm font-medium">{valueAgent.name || "Agente do app"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{valueAgent.promise || "Valor pré-lead ainda não definido."}</p><p className="mt-3 text-xs font-semibold">Entrega antes de captar</p><div className="mt-1 space-y-1">{asStrings(valueAgent.preLeadServices).map((item) => <p key={item} className="text-xs text-muted-foreground">• {item}</p>)}</div></div><div><p className="text-xs font-semibold">Fontes e integrações</p><div className="mt-1 space-y-1.5">{(valueAgent.publicDataSources ?? []).map((source, index) => <div key={`${source.name}-${index}`} className="flex items-start justify-between gap-2 rounded-lg border bg-background p-2"><div><p className="text-xs font-medium">{source.name || "Fonte"}</p>{source.purpose && <p className="text-[11px] text-muted-foreground">{source.purpose}</p>}</div><Badge variant={source.availability === "registry" ? "default" : "outline"} className="text-[9px]">{source.availability === "registry" ? "Disponível" : source.availability === "gap" ? "Gap" : "Validar"}</Badge></div>)}</div><p className="mt-3 text-xs font-semibold">Handoff</p><p className="mt-1 text-xs text-muted-foreground">{valueAgent.handoff?.destination || "Destino ainda não definido"}{valueAgent.handoff?.sla ? ` · ${valueAgent.handoff.sla}` : ""}</p></div></div>{asStrings(valueAgent.missingCapabilities).length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3"><p className="text-xs font-semibold">Capacidades ainda necessárias</p>{asStrings(valueAgent.missingCapabilities).map((item) => <p key={item} className="mt-1 text-xs text-amber-800">• {item}</p>)}</div>}</section>}

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-xl border p-4"><p className="text-sm font-semibold">Arquitetura proposta</p><div className="mt-3 space-y-2">{result.proposal.architecture.pages.map((page) => <div key={page.id} className="rounded-lg bg-muted/40 p-2"><p className="text-sm font-medium">{page.title}</p><p className="font-mono text-[10px] text-muted-foreground">{page.id}</p>{page.purpose && <p className="mt-1 text-xs text-muted-foreground">{page.purpose}</p>}</div>)}</div>{result.proposal.architecture.pages.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Nenhuma página proposta.</p>}</section>
          <section className="rounded-xl border p-4"><p className="text-sm font-semibold">Papéis e dados</p><div className="mt-3 flex flex-wrap gap-1.5">{result.proposal.architecture.roles.map((role) => <Badge key={role.key} variant="outline">{role.name}</Badge>)}</div><div className="mt-3 space-y-1">{result.proposal.architecture.dataModel.map((entity) => <p key={entity.entity} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{entity.entity}</span>{entity.purpose ? ` · ${entity.purpose}` : ""}</p>)}</div></section>
        </div>

        {(result.proposal.gaps.length > 0 || result.proposal.warnings.length > 0) && <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4"><p className="text-sm font-semibold">Gaps e alertas</p><div className="mt-2 space-y-1.5">{result.proposal.gaps.map((gap, index) => <p key={`${gap.type}-${index}`} className="text-xs leading-5"><Badge variant="outline" className="mr-2 text-[9px]">{gap.severity}</Badge>{gap.description}</p>)}{result.proposal.warnings.map((warning, index) => <p key={`warning-${index}`} className="text-xs leading-5 text-amber-800">• {warning}</p>)}</div></section>}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{result.usage.passes} passagem(ns) · {result.usage.inputTokens + result.usage.outputTokens} tokens · custo estimado US$ {result.usage.costUsd.toFixed(4)}</span><Badge variant={proposalReady ? "default" : "secondary"}>{proposalReady ? "Pronta para versionar" : "Requer ajuste"}</Badge></div>
      </div>}

      <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button><Button onClick={() => void applyAsVersion()} disabled={!template || !proposalReady || applying}>{applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aplicar como nova versão</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
