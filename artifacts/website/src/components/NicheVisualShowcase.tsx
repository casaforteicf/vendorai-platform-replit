import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  Instagram,
  MapPinned,
  Megaphone,
  MessageCircle,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

const NICHE_VISUALS = [
  { src: "/niches/materials.jpg", label: "Materiais de construção", alt: "Atendimento em loja de materiais de construção" },
  { src: "/niches/insurance.jpg", label: "Seguros", alt: "Atendimento em corretora de seguros" },
  { src: "/niches/pools.jpg", label: "Piscinas", alt: "Atendimento especializado em piscinas" },
  { src: "/niches/windows.jpg", label: "Esquadrias", alt: "Equipe trabalhando em fábrica de esquadrias" },
  { src: "/niches/autoparts.jpg", label: "Distribuição", alt: "Atendimento em distribuidora de autopeças" },
] as const;

const pipeline = [
  { label: "Novos leads", value: "142", dot: "bg-blue-400" },
  { label: "Qualificação", value: "96", dot: "bg-amber-400" },
  { label: "Proposta", value: "54", dot: "bg-violet-400" },
  { label: "Fechamento", value: "28", dot: "bg-emerald-400" },
] as const;

function CaptureVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423] p-5 shadow-[0_32px_90px_rgba(0,0,0,0.28)] md:p-6">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">Captação + IA</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Conversas viram oportunidades</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-400/10 text-orange-300"><Bot className="h-5 w-5" /></div>
      </div>

      <div className="relative mt-6 grid gap-3 sm:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-2.5">
          {[
            [MessageCircle, "WhatsApp", "423 conversas", "text-emerald-300 bg-emerald-400/10"],
            [Instagram, "Instagram", "187 conversas", "text-pink-300 bg-pink-400/10"],
            [Megaphone, "Campanhas", "96 novos leads", "text-orange-300 bg-orange-400/10"],
          ].map(([Icon, label, meta, tone]) => {
            const ItemIcon = Icon as typeof MessageCircle;
            return (
              <div key={label as string} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone as string}`}><ItemIcon className="h-4 w-4" /></div>
                <div className="min-w-0"><p className="text-xs font-semibold text-white">{label as string}</p><p className="truncate text-[10px] text-slate-500">{meta as string}</p></div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">Pipeline em tempo real</p><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">IA ativa</span></div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {pipeline.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3">
                <div className={`h-1 w-7 rounded-full ${item.dot}`} />
                <p className="mt-2 text-[10px] text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-orange-400/10 bg-orange-400/[0.06] p-3"><Sparkles className="h-4 w-4 shrink-0 text-orange-300" /><div><p className="text-[10px] text-slate-500">Próxima ação sugerida</p><p className="text-xs font-semibold text-white">Agendar demonstração</p></div></div>
        </div>
      </div>
    </div>
  );
}

function ScoutVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#101827] p-5 shadow-[0_32px_90px_rgba(0,0,0,0.25)] md:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_52%,rgba(249,115,22,.14),transparent_20%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">Revenue Scout + Observador</p><h3 className="mt-2 text-xl font-semibold text-white">A IA observa o negócio inteiro</h3></div>
        <Radar className="h-6 w-6 text-orange-300" />
      </div>

      <div className="relative mt-6 grid gap-3 sm:grid-cols-[1.12fr_.88fr]">
        <div className="relative min-h-[245px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a101c] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><MapPinned className="h-4 w-4 text-orange-300" /> Mapa de oportunidades</div>
          <div className="absolute left-[19%] top-[27%] h-[60%] w-[55%] rotate-[-8deg] bg-slate-800/90 [clip-path:polygon(38%_0,62%_7%,80%_22%,89%_43%,74%_59%,67%_78%,51%_100%,40%_79%,23%_70%,10%_48%,21%_24%)]" />
          <span className="absolute right-[31%] top-[43%] h-3 w-3 rounded-full bg-orange-400 shadow-[0_0_22px_10px_rgba(251,146,60,.35)]" />
          <span className="absolute left-[40%] top-[57%] h-2.5 w-2.5 rounded-full bg-orange-400/80 shadow-[0_0_18px_7px_rgba(251,146,60,.25)]" />
          <span className="absolute right-[43%] top-[31%] h-2 w-2 rounded-full bg-amber-300/80 shadow-[0_0_15px_6px_rgba(252,211,77,.2)]" />
          <div className="absolute bottom-4 right-4 rounded-xl border border-orange-300/20 bg-slate-950/90 px-3 py-2"><p className="text-[9px] uppercase tracking-wider text-orange-300">Alto potencial</p><p className="mt-1 text-xs font-semibold text-white">+320 oportunidades</p></div>
        </div>
        <div className="space-y-2.5">
          {[
            [TrendingUp, "Ticket médio", "+18%"],
            [Users, "Vendedores", "312"],
            [BarChart3, "Produtos", "842"],
            [Target, "Cidades em alta", "12"],
          ].map(([Icon, label, value]) => {
            const ItemIcon = Icon as typeof TrendingUp;
            return <div key={label as string} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-400/10 text-orange-300"><ItemIcon className="h-4 w-4" /></div><div><p className="text-[10px] text-slate-500">{label as string}</p><p className="text-sm font-semibold text-white">{value as string}</p></div><ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-600" /></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function MarketingVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423] p-5 shadow-[0_32px_90px_rgba(0,0,0,0.24)] md:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">Marketing com IA</p><h3 className="mt-2 text-xl font-semibold text-white">Do planejamento ao resultado</h3></div><CalendarDays className="h-6 w-6 text-orange-300" /></div>
      <div className="mt-6 grid gap-3 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">Plano de mídia</p><span className="text-[10px] font-semibold text-orange-300">30 / 60 / 90 dias</span></div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 28 }).map((_, index) => <div key={index} className={`aspect-square rounded-md border ${[2,5,8,12,16,19,23,26].includes(index) ? "border-orange-400/30 bg-orange-400/15" : "border-white/[0.05] bg-white/[0.025]"}`}>{[2,5,8,12,16,19,23,26].includes(index) && <div className="m-auto mt-[38%] h-1.5 w-1.5 rounded-full bg-orange-300" />}</div>)}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 text-[10px] text-slate-500"><span>Estratégia</span><ArrowRight className="h-3 w-3" /><span>Conteúdo</span><ArrowRight className="h-3 w-3" /><span>Aprovação</span><ArrowRight className="h-3 w-3" /><span>Publicação</span></div>
        </div>
        <div className="space-y-2.5">
          {["Posts e anúncios", "Vídeos e landing pages", "E-mails e campanhas"].map((label, index) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><p className="text-xs font-semibold text-white">{label}</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300" style={{ width: `${72 + index * 10}%` }} /></div></div>)}
        </div>
      </div>
    </div>
  );
}

export default function NicheVisualShowcase() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-[#070b14] py-20 text-white md:py-28">
      <div className="absolute left-1/2 top-0 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-orange-500/[0.07] blur-3xl" />
      <div className="container relative mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-400">Veja o negócio funcionando</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Não é uma lista de ferramentas. É uma operação conectada.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">A mesma informação atravessa atendimento, vendas, inteligência e marketing. Cada etapa alimenta a próxima para a equipe saber o que fazer — e a IA executar o que puder.</p>
        </motion.div>

        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }}><CaptureVisual /></motion.div>
          <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ delay: 0.06 }}><ScoutVisual /></motion.div>
          <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ delay: 0.08 }} className="lg:col-span-2"><MarketingVisual /></motion.div>
        </div>

        <div className="mx-auto mt-16 max-w-7xl border-t border-white/10 pt-12">
          <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-400">Aplicado à realidade de cada empresa</p><h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">A tecnologia é a mesma. A operação muda por mercado.</h3></div><p className="max-w-xl text-sm leading-6 text-slate-400">Os agentes, sinais, jornadas e oportunidades se adaptam ao tipo de negócio — sem transformar o site em imagens genéricas de tecnologia.</p></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {NICHE_VISUALS.map((item, index) => (
              <motion.figure key={item.src} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, delay: index * 0.04 }} className="group relative overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03] shadow-[0_18px_44px_rgba(0,0,0,0.18)]">
                <img src={item.src} alt={item.alt} loading="lazy" decoding="async" width={320} height={220} className="aspect-[4/3] h-full w-full object-cover opacity-75 transition duration-500 group-hover:scale-[1.035] group-hover:opacity-90" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-3 pt-8"><figcaption className="text-xs font-semibold text-white md:text-sm">{item.label}</figcaption></div>
              </motion.figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
