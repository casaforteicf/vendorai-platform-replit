import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, CircleAlert, ClipboardList, FlaskConical, Plus, Search, ShieldCheck, Sparkles, Target, XCircle } from "lucide-react";

type CapabilityStatus = "available" | "partial" | "missing";

type Capability = {
  id: string;
  name: string;
  module: string;
  status: CapabilityStatus;
  keywords: string[];
};

type PromiseItem = {
  id: string;
  promise: string;
  capabilities: string[];
  lp: string;
  source?: "catalog" | "manual";
  createdAt?: string;
};

type BacklogItem = {
  capability: Capability;
  affectedPromises: PromiseItem[];
  priority: number;
};

const STORAGE_KEY = "vendorai_growth_lab_promises_v2";

const CAPABILITIES: Capability[] = [
  { id: "crm", name: "CRM e pipeline", module: "CRM", status: "available", keywords: ["crm", "pipeline", "oportunidade", "negocio", "lead"] },
  { id: "visitor", name: "Visitor Intelligence", module: "Inteligência", status: "available", keywords: ["visitante", "origem", "cidade", "campanha", "sessao", "site"] },
  { id: "revenue", name: "Revenue Scout", module: "Receita", status: "available", keywords: ["receita", "reativar", "cliente inativo", "oportunidade escondida"] },
  { id: "followup", name: "Follow-up com IA", module: "Agentes", status: "available", keywords: ["follow-up", "followup", "acompanhar", "retomar", "cobrar retorno"] },
  { id: "agenda", name: "Agenda inteligente", module: "Agenda", status: "available", keywords: ["agenda", "agendar", "reuniao", "compromisso"] },
  { id: "content", name: "Conteúdo e criativos", module: "Marketing", status: "available", keywords: ["conteudo", "criativo", "post", "imagem", "roteiro"] },
  { id: "ads", name: "Gestão de anúncios", module: "Marketing", status: "partial", keywords: ["anuncio", "meta ads", "google ads", "campanha paga"] },
  { id: "seo", name: "SEO e Search Console", module: "Marketing", status: "available", keywords: ["seo", "google", "search console", "busca organica"] },
  { id: "lp", name: "Sites e landing pages", module: "Marketing", status: "available", keywords: ["landing page", "lp", "site", "pagina"] },
  { id: "whatsapp", name: "WhatsApp conectado ao CRM", module: "Conversas", status: "available", keywords: ["whatsapp", "mensagem", "conversa"] },
  { id: "social", name: "Publicação multicanal", module: "Marketing", status: "partial", keywords: ["instagram", "facebook", "tiktok", "publicar", "rede social"] },
  { id: "payment", name: "Cobrança e pagamento", module: "Financeiro", status: "partial", keywords: ["cobranca", "pagamento", "pix", "cartao"] },
  { id: "proposal", name: "Orçamentos e propostas", module: "Comercial", status: "available", keywords: ["orcamento", "proposta", "cotacao"] },
  { id: "automation", name: "Automações por evento", module: "Automação", status: "partial", keywords: ["automatico", "automacao", "gatilho", "evento"] },
];

const CATALOG_PROMISES: PromiseItem[] = [
  {
    id: "catalog-institutional-visitor",
    promise: "Identifique visitantes, entenda a origem e transforme intenção em oportunidade comercial.",
    capabilities: ["visitor", "crm"],
    lp: "LP institucional",
    source: "catalog",
  },
  {
    id: "catalog-sales-revenue",
    promise: "Encontre receita escondida na base e reative clientes com follow-up inteligente.",
    capabilities: ["revenue", "followup", "crm"],
    lp: "LP vendas",
    source: "catalog",
  },
  {
    id: "catalog-marketing-campaign",
    promise: "Crie campanhas, conteúdos e landing pages conectados ao CRM e aos resultados.",
    capabilities: ["content", "lp", "crm", "ads"],
    lp: "LP marketing",
    source: "catalog",
  },
  {
    id: "catalog-marketing-social",
    promise: "Publique automaticamente em todas as redes sociais.",
    capabilities: ["social", "automation"],
    lp: "LP marketing",
    source: "catalog",
  },
  {
    id: "catalog-clinics-growth",
    promise: "Conecte conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM para acompanhar campanhas até a conversão.",
    capabilities: ["content", "ads", "seo", "lp", "visitor", "whatsapp", "crm"],
    lp: "LP Clínicas / Odonto / Estética",
    source: "catalog",
  },
  {
    id: "catalog-academies-agents",
    promise: "Use agentes de IA para qualificação, follow-up, agendamento, reativação e pós-venda.",
    capabilities: ["followup", "agenda", "revenue", "crm", "automation"],
    lp: "LP Academias",
    source: "catalog",
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function statusLabel(status: CapabilityStatus) {
  if (status === "available") return "Disponível";
  if (status === "partial") return "Parcial";
  return "Não disponível";
}

function coverage(capabilities: string[]) {
  if (!capabilities.length) return 0;
  const score = capabilities.reduce((sum, id) => {
    const capability = CAPABILITIES.find((item) => item.id === id);
    if (!capability) return sum;
    return sum + (capability.status === "available" ? 100 : capability.status === "partial" ? 50 : 0);
  }, 0);
  return Math.round(score / capabilities.length);
}

function statusIcon(status: CapabilityStatus) {
  if (status === "available") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "partial") return <CircleAlert className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function loadStoredPromises() {
  if (typeof window === "undefined") return CATALOG_PROMISES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return CATALOG_PROMISES;
    const parsed = JSON.parse(raw) as PromiseItem[];
    if (!Array.isArray(parsed)) return CATALOG_PROMISES;
    const manual = parsed.filter((item) => item?.source === "manual" && item.promise?.trim());
    return [...CATALOG_PROMISES, ...manual];
  } catch {
    return CATALOG_PROMISES;
  }
}

export default function GrowthLab() {
  const [promises, setPromises] = useState<PromiseItem[]>(loadStoredPromises);
  const [query, setQuery] = useState("");
  const [newPromise, setNewPromise] = useState("");
  const [newLp, setNewLp] = useState("Nova promessa");

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(promises));
    } catch {
      // Persistência local é auxiliar e nunca pode impedir o Growth Lab de abrir.
    }
  }, [promises]);

  const filtered = useMemo(() => {
    const normalized = normalize(query.trim());
    if (!normalized) return promises;
    return promises.filter((item) => normalize(item.promise).includes(normalized) || normalize(item.lp).includes(normalized));
  }, [promises, query]);

  const detected = useMemo(() => {
    const text = normalize(newPromise);
    return CAPABILITIES.filter((capability) => capability.keywords.some((keyword) => text.includes(normalize(keyword))));
  }, [newPromise]);

  const overallCoverage = useMemo(() => {
    if (!promises.length) return 0;
    return Math.round(promises.reduce((sum, item) => sum + coverage(item.capabilities), 0) / promises.length);
  }, [promises]);

  const backlog = useMemo<BacklogItem[]>(() => {
    return CAPABILITIES
      .filter((capability) => capability.status !== "available")
      .map((capability) => {
        const affectedPromises = promises.filter((item) => item.capabilities.includes(capability.id));
        const base = capability.status === "missing" ? 60 : 35;
        const priority = Math.min(100, base + affectedPromises.length * 12);
        return { capability, affectedPromises, priority };
      })
      .filter((item) => item.affectedPromises.length > 0)
      .sort((a, b) => b.priority - a.priority);
  }, [promises]);

  function addPromise() {
    const text = newPromise.trim();
    if (!text) return;
    setPromises((current) => [
      ...current,
      {
        id: `promise-${Date.now()}`,
        promise: text,
        capabilities: detected.map((item) => item.id),
        lp: newLp.trim() || "Nova promessa",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewPromise("");
    setNewLp("Nova promessa");
  }

  return (
    <div className="min-h-screen bg-muted/20 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border bg-background p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <FlaskConical className="h-3.5 w-3.5" /> Growth Lab
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Promessa comercial só entra na LP se o produto sustentar.</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              O catálogo das LPs inicia o registro automaticamente; novas promessas ficam persistidas e toda lacuna gera backlog de produto.
            </p>
          </div>
          <div className="min-w-[190px] rounded-xl border bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobertura média</div>
            <div className="mt-1 text-3xl font-bold">{overallCoverage}%</div>
            <div className="mt-1 text-xs text-muted-foreground">das promessas cadastradas</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <div className="rounded-xl border bg-background p-4"><Target className="mb-3 h-5 w-5 text-primary" /><div className="text-2xl font-bold">{promises.length}</div><div className="text-sm text-muted-foreground">promessas registradas</div></div>
          <div className="rounded-xl border bg-background p-4"><ShieldCheck className="mb-3 h-5 w-5 text-emerald-600" /><div className="text-2xl font-bold">{promises.filter((item) => coverage(item.capabilities) === 100).length}</div><div className="text-sm text-muted-foreground">prontas para anunciar</div></div>
          <div className="rounded-xl border bg-background p-4"><CircleAlert className="mb-3 h-5 w-5 text-amber-600" /><div className="text-2xl font-bold">{promises.filter((item) => coverage(item.capabilities) > 0 && coverage(item.capabilities) < 100).length}</div><div className="text-sm text-muted-foreground">precisam completar produto</div></div>
          <div className="rounded-xl border bg-background p-4"><ClipboardList className="mb-3 h-5 w-5 text-primary" /><div className="text-2xl font-bold">{backlog.length}</div><div className="text-sm text-muted-foreground">lacunas no backlog</div></div>
          <div className="rounded-xl border bg-background p-4"><BrainCircuit className="mb-3 h-5 w-5 text-primary" /><div className="text-2xl font-bold">{CAPABILITIES.length}</div><div className="text-sm text-muted-foreground">capacidades mapeadas</div></div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_1.95fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-5">
              <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="font-semibold">Já temos isso?</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Escreva uma nova promessa. O sistema identifica as capacidades relacionadas e registra a lacuna.</p>
              <input
                value={newLp}
                onChange={(event) => setNewLp(event.target.value)}
                placeholder="Nome da LP ou campanha"
                className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={newPromise}
                onChange={(event) => setNewPromise(event.target.value)}
                placeholder="Ex.: Encontre visitantes quentes, crie a oportunidade e faça follow-up automático pelo WhatsApp."
                className="mt-3 min-h-32 w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-4 space-y-2">
                {detected.length ? detected.map((capability) => (
                  <div key={capability.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">{statusIcon(capability.status)}<span>{capability.name}</span></div>
                    <span className="text-xs text-muted-foreground">{statusLabel(capability.status)}</span>
                  </div>
                )) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Digite uma promessa para detectar as funções necessárias.</div>}
              </div>
              <button onClick={addPromise} disabled={!newPromise.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <Plus className="h-4 w-4" /> Registrar promessa
              </button>
            </div>

            <div className="rounded-xl border bg-background p-5">
              <h2 className="font-semibold">Backlog automático</h2>
              <p className="mt-1 text-sm text-muted-foreground">Capacidades parciais ou ausentes sobem de prioridade conforme aparecem nas LPs.</p>
              <div className="mt-4 space-y-3">
                {backlog.map((item) => (
                  <div key={item.capability.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-medium">{item.capability.name}</div><div className="text-xs text-muted-foreground">{item.capability.module} · {item.affectedPromises.length} promessa(s) afetada(s)</div></div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">P{item.priority}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Ação: completar a função antes de liberar todas as promessas relacionadas.</div>
                  </div>
                ))}
                {!backlog.length && <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma lacuna ativa.</div>}
              </div>
            </div>

            <div className="rounded-xl border bg-background p-5">
              <h2 className="font-semibold">Mapa de capacidades</h2>
              <div className="mt-4 space-y-2">
                {CAPABILITIES.map((capability) => (
                  <div key={capability.id} className="flex items-center justify-between gap-3 text-sm">
                    <div><div className="font-medium">{capability.name}</div><div className="text-xs text-muted-foreground">{capability.module}</div></div>
                    <div className="flex items-center gap-1.5">{statusIcon(capability.status)}<span className="text-xs">{statusLabel(capability.status)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-background p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><h2 className="font-semibold">Registro de Promessas</h2><p className="text-sm text-muted-foreground">Cada promessa mostra exatamente o que a sustenta.</p></div>
              <div className="relative md:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar promessa ou LP" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" /></div>
            </div>

            <div className="mt-5 space-y-3">
              {filtered.map((item) => {
                const itemCoverage = coverage(item.capabilities);
                const canAdvertise = itemCoverage === 100;
                return (
                  <div key={item.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <span>{item.lp}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 normal-case tracking-normal">{item.source === "catalog" ? "Catálogo LP" : "Manual"}</span>
                        </div>
                        <div className="mt-1 font-semibold leading-snug">{item.promise}</div>
                      </div>
                      <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${canAdvertise ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {canAdvertise ? "Pode anunciar" : "Completar produto"}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${itemCoverage}%` }} /></div><div className="w-12 text-right text-sm font-semibold">{itemCoverage}%</div></div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.capabilities.length ? item.capabilities.map((id) => {
                        const capability = CAPABILITIES.find((candidate) => candidate.id === id);
                        if (!capability) return null;
                        return <span key={id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">{statusIcon(capability.status)}{capability.name}</span>;
                      }) : <span className="text-xs text-red-600">Nenhuma capacidade detectada — revisar promessa antes de publicar.</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
