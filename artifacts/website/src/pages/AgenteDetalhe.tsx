import { Link, useParams } from "wouter";
import { ArrowRight, ArrowLeft, CheckCircle2, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENTS, localizeAgentDetail } from "@/data/agents";
import { ChatMockup } from "@/components/FeatureMockups";
import NotFound from "@/pages/not-found";
import { usePublicCountry } from "@/lib/publicCountry";

type ChatSample = { from: "lead" | "agent"; text: string };

const CHAT_SAMPLES_PT: Record<string, ChatSample[]> = {
  recepcao: [
    { from: "lead", text: "Oi, vi o anúncio de vocês, queria saber mais" },
    { from: "agent", text: "Oi! Que bom que você chegou até aqui 😊 Me conta rapidinho: o que você está buscando resolver?" },
    { from: "lead", text: "Preciso organizar melhor o atendimento da minha loja" },
    { from: "agent", text: "Perfeito, vou te passar pro time certo agora mesmo pra entender direitinho o seu caso." },
  ],
  sdr: [
    { from: "agent", text: "Hoje como vocês costumam receber pedido de orçamento — WhatsApp, telefone, presencial?" },
    { from: "lead", text: "Só WhatsApp mesmo, mas fica bagunçado" },
    { from: "agent", text: "Entendi. E isso já fez você perder algum orçamento por demorar a responder?" },
    { from: "lead", text: "Já sim, mais de uma vez" },
  ],
  closer: [
    { from: "agent", text: "Vi que você comparou nosso plano com outra opção — posso te mostrar como fica o custo real considerando o tempo que sua equipe economiza?" },
    { from: "lead", text: "Pode sim, isso ajuda a decidir" },
    { from: "agent", text: "Fechado. Te mando agora um comparativo direto, sem enrolação." },
  ],
  "follow-up": [
    { from: "agent", text: "Oi! Vimos que você tinha interesse no orçamento de terça — ainda faz sentido pra você?" },
    { from: "lead", text: "Ah, acabei esquecendo desse assunto" },
    { from: "agent", text: "Sem problema! Quer que eu retome de onde paramos?" },
  ],
  agendamento: [
    { from: "lead", text: "Dá pra marcar uma reunião essa semana?" },
    { from: "agent", text: "Dá sim! Tenho quinta às 14h ou sexta às 10h livres na agenda. Qual fica melhor?" },
    { from: "lead", text: "Quinta às 14h" },
    { from: "agent", text: "Confirmado! Já te mando o link da reunião." },
  ],
  suporte: [
    { from: "lead", text: "Como eu mudo o valor do meu plano?" },
    { from: "agent", text: "Vai em Configurações → Assinatura, lá dá pra ver as opções disponíveis pro seu caso. Quer que eu te explique passo a passo?" },
    { from: "lead", text: "Quero sim" },
  ],
  "pos-venda": [
    { from: "agent", text: "Faz um mês que fechamos negócio — como está sendo a experiência até aqui?" },
    { from: "lead", text: "Muito boa, já economizei bastante tempo" },
    { from: "agent", text: "Que ótimo ouvir isso! Alguma coisa que a gente possa melhorar?" },
  ],
  "revenue-scout": [
    { from: "agent", text: "Notei que você comprou X mês passado, mas ainda não levou Y — costuma ser usado junto. Quer que eu monte uma condição especial?" },
    { from: "lead", text: "Manda aí" },
    { from: "agent", text: "Já te enviei — é só confirmar quando quiser." },
  ],
};

const CHAT_SAMPLES_ES: Record<string, ChatSample[]> = {
  recepcao: [
    { from: "lead", text: "Hola, vi su anuncio y quería saber más" },
    { from: "agent", text: "¡Hola! Qué bueno que llegaste 😊 Cuéntame brevemente: ¿qué necesitas resolver?" },
    { from: "lead", text: "Necesito organizar mejor la atención de mi tienda" },
    { from: "agent", text: "Perfecto. Te voy a derivar al equipo correcto con este contexto para que podamos entender bien tu caso." },
  ],
  sdr: [
    { from: "agent", text: "¿Cómo reciben hoy las solicitudes de cotización: WhatsApp, teléfono o presencial?" },
    { from: "lead", text: "Casi todo por WhatsApp, pero se desordena" },
    { from: "agent", text: "Entiendo. ¿Eso ya hizo que perdieran alguna cotización por tardar en responder?" },
    { from: "lead", text: "Sí, más de una vez" },
  ],
  closer: [
    { from: "agent", text: "Vi que comparaste nuestro plan con otra opción. ¿Quieres que te muestre el costo real considerando el tiempo que ahorra tu equipo?" },
    { from: "lead", text: "Sí, eso me ayuda a decidir" },
    { from: "agent", text: "Perfecto. Te envío ahora una comparación directa para que puedas evaluarlo." },
  ],
  "follow-up": [
    { from: "agent", text: "¡Hola! Habías mostrado interés en la cotización del martes. ¿Todavía tiene sentido para ti?" },
    { from: "lead", text: "La verdad, me había olvidado del tema" },
    { from: "agent", text: "No hay problema. ¿Quieres que retomemos desde donde quedamos?" },
  ],
  agendamento: [
    { from: "lead", text: "¿Podemos agendar una reunión esta semana?" },
    { from: "agent", text: "Claro. Tengo jueves a las 14:00 o viernes a las 10:00 disponibles. ¿Cuál te conviene más?" },
    { from: "lead", text: "Jueves a las 14:00" },
    { from: "agent", text: "Confirmado. Ya te envío el enlace de la reunión." },
  ],
  suporte: [
    { from: "lead", text: "¿Cómo cambio el valor de mi plan?" },
    { from: "agent", text: "Ve a Configuración → Suscripción. Allí puedes ver las opciones disponibles. ¿Quieres que te explique paso a paso?" },
    { from: "lead", text: "Sí, por favor" },
  ],
  "pos-venda": [
    { from: "agent", text: "Hace un mes cerramos el negocio. ¿Cómo está siendo la experiencia hasta ahora?" },
    { from: "lead", text: "Muy buena, ya ahorramos bastante tiempo" },
    { from: "agent", text: "¡Qué bueno saberlo! ¿Hay algo que podamos mejorar?" },
  ],
  "revenue-scout": [
    { from: "agent", text: "Vi que compraste X el mes pasado, pero todavía no Y, que suele utilizarse en conjunto. ¿Quieres que prepare una condición especial?" },
    { from: "lead", text: "Sí, envíamela" },
    { from: "agent", text: "Ya te la envié. Puedes confirmarla cuando quieras." },
  ],
};

const UI_PT = {
  back: "Todos os agentes",
  howKicker: "Como este agente age",
  howTitle: "Dentro da jornada, não num menu à parte",
  learning: "Aprendizado e melhoria contínua",
  others: "Outros agentes da equipe",
  finalTitle: "Veja este agente trabalhando na sua própria operação",
  finalCta: "Começar meus 5 dias grátis",
} as const;

const UI_ES = {
  back: "Todos los agentes",
  howKicker: "Cómo actúa este agente",
  howTitle: "Dentro de la jornada, no en un menú separado",
  learning: "Aprendizaje y mejora continua",
  others: "Otros agentes del equipo",
  finalTitle: "Mira este agente trabajando en tu propia operación",
  finalCta: "Comenzar mis 5 días gratis",
} as const;

export default function AgenteDetalhe() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? UI_ES : UI_PT;
  const chatSamples = isSpanish ? CHAT_SAMPLES_ES : CHAT_SAMPLES_PT;
  const { slug } = useParams<{ slug: string }>();
  const baseAgent = AGENTS.find((a) => a.slug === slug);
  if (!baseAgent) return <NotFound />;

  const agent = localizeAgentDetail(baseAgent, isSpanish);
  const Icon = agent.icon;
  const others = AGENTS.filter((a) => a.slug !== agent.slug).map((item) => localizeAgentDetail(item, isSpanish));

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#070b14] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.25),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#0a1020_0%,#070b14_76%)]" />
        <div className="container relative mx-auto grid gap-12 px-4 py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center md:py-24">
          <div>
            <Link href="/funcionalidades#agentes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> {copy.back}
            </Link>
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
              <Icon className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{agent.eyebrow}</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl">{agent.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">{agent.subtitle}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-xl bg-blue-500 px-7 text-base font-semibold text-white hover:bg-blue-400">
                <Link href="/demo">{agent.ctaLabel} <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-10 rounded-[48px] bg-blue-500/10 blur-3xl" />
            <div className="relative"><ChatMockup agentName={agent.title} messages={chatSamples[agent.slug] ?? []} /></div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.howKicker}</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">{copy.howTitle}</h2>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
            {agent.howItWorks.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{i + 1}</div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl rounded-[28px] border border-emerald-200 bg-emerald-50 p-8 md:p-10">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Sparkles className="h-5 w-5" /></div>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">{copy.learning}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{agent.learning.title}</h3>
            <p className="mt-4 leading-7 text-slate-700">{agent.learning.desc}</p>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <p className="flex items-center justify-center gap-2 text-center text-sm font-bold uppercase tracking-[0.18em] text-blue-600"><Bot className="h-4 w-4" /> {copy.others}</p>
          <div className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3 lg:grid-cols-4">
            {others.map((a) => (
              <Link key={a.slug} href={`/agentes/${a.slug}`} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-blue-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><a.icon className="h-4 w-4" /></div>
                <h3 className="mt-4 text-sm font-semibold text-slate-950">{a.title}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 md:pb-28">
        <div className="container mx-auto overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 py-14 text-center text-white shadow-[0_35px_100px_rgba(37,99,235,0.28)] md:px-12 md:py-16">
          <CheckCircle2 className="mx-auto h-10 w-10 text-blue-100" />
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{copy.finalTitle}</h2>
          <Button asChild size="lg" className="mt-8 h-14 rounded-xl bg-white px-8 text-blue-700 hover:bg-blue-50">
            <Link href="/demo">{copy.finalCta} <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
