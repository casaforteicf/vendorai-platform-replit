import { Link, useParams } from "wouter";
import { useEffect } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Megaphone,
  MessageCircle,
  Radar,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { MARKETING_VERTICALS } from "@workspace/vendor-brain/marketing-verticals";
import publicVerticalSlugs from "@/data/publicVerticalSlugs.json";
import { findWrittenSegment, type IntentKey } from "./intentLpOverrides";
import { findAdditionalIntentSegment } from "./intentLpAdditional";

const publicSlugOverrides = publicVerticalSlugs as Record<string, string>;
type Intent = IntentKey;

type ViewProfile = {
  id?: string;
  slug: string;
  publicSlug: string;
  name: string;
  audience: string;
  decisionMakers: string[];
  corePain: string;
  promise: string;
  priorityAgents: string[];
  kpis: string[];
  painMap: string[];
  creativeAngles: string[];
};

const INTENT_META: Record<Intent, { label: string; kicker: string; icon: typeof Target }> = {
  dor: { label: "Dor / Descoberta", kicker: "Descubra onde a receita está escapando", icon: Radar },
  marketing: { label: "Marketing / Crescimento", kicker: "Transforme marketing em oportunidade comercial", icon: Megaphone },
  crm: { label: "CRM / Alta intenção", kicker: "CRM com IA aplicado ao seu processo real", icon: Bot },
};

function findCustomSegment(slug: string) {
  return findWrittenSegment(slug) ?? findAdditionalIntentSegment(slug);
}

function findOfficialProfile(slug: string) {
  return MARKETING_VERTICALS.find((profile) => {
    const publicSlug = publicSlugOverrides[profile.id] ?? profile.slug;
    return publicSlug === slug || profile.slug === slug || profile.id === slug;
  });
}

function resolveViewProfile(slug: string): ViewProfile | null {
  const custom = findCustomSegment(slug);
  if (custom) {
    return {
      slug: custom.slug,
      publicSlug: custom.slug,
      name: custom.name,
      audience: custom.audience,
      decisionMakers: custom.decisionMakers,
      corePain: custom.corePain,
      promise: custom.promise,
      priorityAgents: custom.priorityAgents,
      kpis: custom.kpis,
      painMap: custom.intents.dor.bullets.slice(0, 4),
      creativeAngles: custom.intents.marketing.bullets.slice(0, 3),
    };
  }

  const profile = findOfficialProfile(slug);
  if (!profile) return null;
  return {
    id: profile.id,
    slug: profile.slug,
    publicSlug: publicSlugOverrides[profile.id] ?? profile.slug,
    name: profile.name,
    audience: profile.audience,
    decisionMakers: profile.decisionMakers,
    corePain: profile.corePain,
    promise: profile.promise,
    priorityAgents: profile.priorityAgents,
    kpis: profile.kpis,
    painMap: profile.lp.painMap,
    creativeAngles: profile.creativeAngles,
  };
}

function genericCopy(profile: ViewProfile, intent: Intent) {
  if (intent === "dor") {
    return {
      title: `Quantas oportunidades ${profile.name.toLowerCase()} perde sem perceber?`,
      subtitle: `${profile.corePain} O VendorAI organiza sinais, prioridades e próximas ações para a equipe agir antes que a oportunidade esfrie.`,
      sectionTitle: "Problemas que merecem atenção agora",
      bullets: [
        ...profile.painMap,
        "Follow-ups importantes dependem da memória da equipe",
        "Leads antigos deixam de ser reativados no momento certo",
        "A gestão descobre perdas quando o resultado já caiu",
        "Dados existem, mas não viram uma próxima ação clara",
        "Marketing e vendas não compartilham o mesmo contexto",
        "Oportunidades de recompra, expansão ou recuperação ficam escondidas",
      ].slice(0, 10),
      flow: ["Sinal", "Prioridade", "Próxima ação", "Follow-up", "Oportunidade", "Receita"],
    };
  }
  if (intent === "marketing") {
    return {
      title: `Marketing para ${profile.name} que termina em venda, não em curtida`,
      subtitle: "Planejamento, conteúdo, Meta, Google, landing pages, WhatsApp e CRM conectados para transformar tráfego em oportunidades acompanhadas até o resultado.",
      sectionTitle: "Uma campanha completa, do anúncio ao comercial",
      bullets: [
        `Campanhas específicas para ${profile.name.toLowerCase()}`,
        "Conteúdo e criativos alinhados à intenção do público",
        "Meta Ads para descoberta, demanda e remarketing",
        "Google Ads para capturar procura ativa",
        "Landing pages coerentes com cada campanha",
        "WhatsApp conectado ao contexto de origem",
        "Lead entrando no CRM com campanha e interesse identificados",
        "Follow-up estruturado até a oportunidade",
        "Medição por leads, oportunidades e vendas",
        `Ângulos criativos baseados em ${profile.creativeAngles.slice(0, 3).join(", ")}`,
      ],
      flow: ["Planejamento", "Conteúdo", "Meta / Google", "Landing Page", "CRM", "Venda"],
    };
  }
  return {
    title: `CRM com IA para ${profile.name}`,
    subtitle: `${profile.promise} Centralize pipeline, WhatsApp, follow-up, agentes de IA e inteligência comercial em uma jornada única.`,
    sectionTitle: "O CRM acompanha como a venda realmente acontece",
    bullets: [
      `Pipeline adaptado a ${profile.name.toLowerCase()}`,
      "Leads, clientes e oportunidades no mesmo histórico",
      "Próxima ação, responsável e prazo visíveis",
      "Follow-up apoiado por automação e IA",
      `Agentes prioritários: ${profile.priorityAgents.slice(0, 4).join(", ")}`,
      "WhatsApp conectado ao contexto comercial",
      "Revenue Scout para encontrar receita escondida na base",
      "Visitor Intelligence para enriquecer intenção e origem",
      "Marketing conectado ao CRM e à venda",
      `Indicadores como ${profile.kpis.slice(0, 4).join(", ")}`,
    ],
    flow: ["Lead", "Qualificação", "Pipeline", "Follow-up", "Venda", "Pós-venda"],
  };
}

function Cta({ profile, secondary = false }: { profile: ViewProfile; secondary?: boolean }) {
  const href = secondary
    ? `/demo?vertical=${encodeURIComponent(profile.slug)}`
    : `/demo?vertical=${encodeURIComponent(profile.slug)}&intent=trial-5-dias`;
  return (
    <a href={href} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold transition ${secondary ? "border border-slate-300 bg-white text-slate-800 hover:border-orange-300 hover:text-orange-700" : "bg-orange-500 text-white shadow-[0_12px_32px_rgba(249,115,22,.22)] hover:bg-orange-600"}`}>
      {secondary ? "Ver demonstração" : "Testar 5 dias grátis"}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

export default function IntentVerticalLp() {
  const params = useParams<{ slug: string; intent: string }>();
  const rawSlug = params.slug ?? "";
  const intent = (params.intent ?? "") as Intent;
  const profile = resolveViewProfile(rawSlug);
  const meta = INTENT_META[intent];
  const custom = findCustomSegment(rawSlug);
  const copy = custom?.intents[intent] ?? (profile && meta ? genericCopy(profile, intent) : null);

  useEffect(() => {
    if (!profile || !copy || !meta) return;
    document.title = `${copy.title} | VendorAI`;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", copy.subtitle.slice(0, 155));
  }, [profile, copy, meta]);

  if (!profile || !copy || !meta) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-24 text-center text-slate-900">
        <h1 className="text-3xl font-black">Landing page não encontrada</h1>
        <Link href="/" className="mt-6 inline-flex text-orange-600">Voltar ao site</Link>
      </div>
    );
  }

  const Icon = meta.icon;
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950 antialiased">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-white">V</div>
            <div><div className="text-base font-extrabold tracking-tight">VendorAI</div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Business OS</div></div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={`/lp/${profile.publicSlug}`} className="hidden text-xs font-semibold text-slate-500 transition hover:text-orange-600 sm:block">Visão geral</Link>
            <a href={`/demo?vertical=${encodeURIComponent(profile.slug)}&intent=trial-5-dias`} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-600">Testar 5 dias</a>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-white px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.14),transparent_38%),radial-gradient(circle_at_90%_30%,rgba(59,130,246,.08),transparent_32%)]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-orange-700"><Icon className="h-3.5 w-3.5" /> {meta.label}</div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-slate-400">{meta.kicker}</p>
            <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">{copy.title}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-base leading-8 text-slate-600 sm:text-xl">{copy.subtitle}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><Cta profile={profile} /><Cta profile={profile} secondary /></div>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{profile.audience}</span>
              {profile.decisionMakers.map((role) => <span key={role} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{role}</span>)}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl"><div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{meta.label}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.sectionTitle}</h2></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {copy.bullets.map((item, index) => <div key={`${item}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-xs font-black text-orange-700">{String(index + 1).padStart(2, "0")}</div><p className="font-bold leading-snug text-slate-900">{item}</p></div>)}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl"><div className="mb-10 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Jornada conectada</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">Do primeiro sinal até a receita</h2></div>
            <div className="grid gap-3 md:grid-cols-6">{copy.flow.map((step, index) => <div key={step} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center"><div className="mb-3 text-xs font-black text-orange-600">0{index + 1}</div><div className="font-extrabold">{step}</div>{index < copy.flow.length - 1 && <ChevronRightVisual />}</div>)}</div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
            <FeatureCard icon={MessageCircle} title="WhatsApp + CRM" description="A conversa deixa de ser isolada e passa a carregar origem, histórico, oportunidade e próxima ação." />
            <FeatureCard icon={Bot} title="Agentes de IA" description={`Apoio de ${profile.priorityAgents.slice(0, 4).join(", ")} conforme etapa, contexto e regras da empresa.`} />
            <FeatureCard icon={Radar} title="Revenue Scout" description="Encontra sinais de recuperação, recompra, expansão e oportunidades escondidas na própria base." />
            <FeatureCard icon={Search} title="Visitor Intelligence" description="Origem, campanha e comportamento digital ajudam a enriquecer a intenção comercial." />
            <FeatureCard icon={BarChart3} title="Resultado comercial" description={`Acompanhe ${profile.kpis.slice(0, 4).join(", ")} e aproxime marketing do resultado real.`} />
            <FeatureCard icon={Target} title="Próxima melhor ação" description="A equipe trabalha com prioridade clara, em vez de depender de listas e memória." />
          </div>
        </section>

        <section className="bg-slate-950 px-4 py-20 text-white sm:px-6"><div className="mx-auto max-w-5xl text-center"><Sparkles className="mx-auto h-8 w-8 text-orange-400" /><h2 className="mx-auto mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Transforme a jornada de {profile.name.toLowerCase()} em uma operação acompanhada por IA.</h2><p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-300">Teste com sua própria operação e veja como contexto, automação e inteligência comercial trabalham juntos.</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><Cta profile={profile} /><Cta profile={profile} secondary /></div></div></section>

        <section className="px-4 py-16 sm:px-6"><div className="mx-auto max-w-5xl"><h2 className="text-2xl font-black">Perguntas frequentes</h2><div className="mt-6 grid gap-3 md:grid-cols-2">{[
          [`O VendorAI funciona para ${profile.name.toLowerCase()}?`, "Sim. A página e a jornada usam o contexto comercial do segmento, com pipeline, sinais e agentes alinhados ao processo."],
          ["Preciso trocar meu WhatsApp?", "Não. O objetivo é conectar o canal ao contexto comercial e ao CRM."],
          ["Consigo acompanhar origem de campanhas?", "Sim. A jornada pode preservar origem, campanha, lead, oportunidade e resultado."],
          ["A IA pode ajudar no follow-up?", "Sim. O nível de automação pode ser configurado conforme regras e permissões da empresa."],
          ["Posso começar com meus dados atuais?", "Sim. O onboarding pode partir de leads, usuários, catálogo e integrações disponíveis."],
          ["Essas páginas substituem a LP principal?", "Não. Dor, Marketing e CRM são páginas complementares. A LP principal continua como visão geral do segmento."],
        ].map(([q,a]) => <div key={q} className="rounded-2xl border border-slate-200 bg-white p-6"><h3 className="font-extrabold">{q}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{a}</p></div>)}</div></div></section>
      </main>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: typeof CheckCircle2; title: string; description: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Icon className="h-5 w-5" /></div><h3 className="text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>;
}

function ChevronRightVisual() {
  return <span className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-orange-300 md:block">›</span>;
}
