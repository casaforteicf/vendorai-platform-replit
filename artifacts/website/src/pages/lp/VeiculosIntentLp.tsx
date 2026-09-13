import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, BarChart3, CarFront, Check, ChevronDown, CircleDollarSign, Gauge, Megaphone, MessageCircle, Search, ShieldCheck, Sparkles, Target, Users, WalletCards } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";

const PHOTO = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=82";

const THEMES = {
  dor: {
    badge: "Dor / Descoberta",
    title: "Quantos leads sua loja recebe e perde antes do test-drive?",
    subtitle: "Organize resposta, qualificação, troca, financiamento, visita, proposta e follow-up para não deixar oportunidades de alto valor escaparem.",
    section: "Onde as vendas de veículos mais se perdem",
    image: "/lp/veiculos/dor-dashboard.svg",
    cards: [
      ["Lead sem resposta rápida", "O cliente fala com várias lojas ao mesmo tempo e compra de quem acompanha melhor.", MessageCircle],
      ["Curioso e comprador recebem o mesmo tratamento", "Sem qualificação, o vendedor perde tempo e prioridade.", Users],
      ["Troca mal acompanhada", "Avaliação do usado, diferença e condição ficam espalhadas em conversas.", CarFront],
      ["Financiamento parado", "Proposta aprovada ou pendente não gera próxima ação clara.", WalletCards],
      ["Test-drive sem follow-up", "A visita acontece, mas a negociação esfria depois.", Gauge],
      ["Propostas esquecidas", "Negociações de alto valor ficam sem prazo e responsável.", CircleDollarSign],
    ],
    metrics: [["18","leads sem retorno"],["7","test-drives pendentes"],["11","propostas paradas"],["9","trocas a avaliar"]],
  },
  marketing: {
    badge: "Marketing / Crescimento",
    title: "Transforme anúncios de veículos em visitas, test-drives e vendas.",
    subtitle: "Meta, Google, landing pages, criativos, WhatsApp e CRM conectados para vender estoque, lançamentos, seminovos e campanhas especiais.",
    section: "Campanhas que realmente movimentam o estoque",
    image: "/lp/veiculos/marketing-dashboard.svg",
    cards: [
      ["Meta Ads", "Vídeos, carrosséis, ofertas e remarketing para despertar desejo e gerar conversa.", Megaphone],
      ["Google Ads", "Capture quem já busca modelo, versão, seminovo, financiamento ou concessionária na região.", Search],
      ["Landing Pages", "Crie páginas por modelo, categoria, cidade, condição, campanha ou lançamento.", Target],
      ["Criativos com IA", "Gere anúncios, roteiros, comparativos, vídeos e variações por campanha.", Sparkles],
      ["Origem até venda", "Acompanhe campanha, lead, test-drive, proposta e fechamento.", BarChart3],
      ["Estoque com prioridade", "Direcione campanhas para veículos, linhas e condições que precisam girar.", CarFront],
    ],
    metrics: [["428","leads"],["96","test-drives"],["41","vendas"],["5,2x","ROAS"]],
  },
  crm: {
    badge: "CRM / Alta intenção",
    title: "CRM com IA para concessionárias e lojas de veículos.",
    subtitle: "Centralize leads, origem, veículo de interesse, troca, financiamento, test-drive, proposta, vendedor responsável e próxima ação.",
    section: "Tudo que a operação comercial precisa em um só fluxo",
    image: "/lp/veiculos/crm-dashboard.svg",
    cards: [
      ["Lead + veículo de interesse", "Registre modelo, versão, faixa de preço, origem e urgência.", CarFront],
      ["Troca e avaliação", "Organize o veículo usado, avaliação e diferença negociada.", CircleDollarSign],
      ["Financiamento", "Acompanhe condição, análise, aprovação, pendência e retorno.", WalletCards],
      ["Test-drive", "Agende, registre resultado e defina próximo passo imediatamente.", Gauge],
      ["WhatsApp integrado", "Conversa, histórico e contexto comercial no mesmo lugar.", MessageCircle],
      ["Inteligência comercial", "Veja leads quentes, propostas paradas, fontes e desempenho por vendedor.", ShieldCheck],
    ],
    metrics: [["34","novos leads"],["21","qualificados"],["13","test-drives"],["8","negociações"]],
  },
} as const;

const FAQ = [
  ["Serve para concessionárias e lojas de seminovos?", "Sim. A estrutura funciona para veículos novos, seminovos e operações independentes."],
  ["Consigo registrar veículo dado na troca?", "Sim. O lead pode carregar contexto da troca, avaliação e diferença negociada."],
  ["Dá para acompanhar financiamento?", "Sim. É possível organizar condição, status, pendências e próxima ação comercial."],
  ["Posso acompanhar test-drive?", "Sim. Test-drive pode ser uma etapa do pipeline com data, responsável e follow-up."],
  ["O WhatsApp entra no histórico?", "Sim. A conversa pode fazer parte do contexto comercial do cliente."],
  ["Consigo medir campanha até venda?", "A jornada pode preservar origem, campanha, lead, proposta e resultado."],
];

export default function VeiculosIntentLp() {
  const params = useParams<{ intent: string }>();
  const intent = ((params.intent ?? "dor") in THEMES ? params.intent : "dor") as Intent;
  const theme = THEMES[intent];

  useEffect(() => {
    document.title = `${theme.title} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name","description"); document.head.appendChild(meta); }
    meta.setAttribute("content", theme.subtitle.slice(0,155));
  }, [theme]);

  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#desafios">Desafios</a><a href="#sistema">Sistema</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=veiculos&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>

    <main>
      <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="absolute inset-0"><img src={PHOTO} alt="Veículo em destaque" className="h-full w-full object-cover opacity-45"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b] via-[#07101b]/92 to-[#07101b]/35"/></div><div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_.8fr] lg:py-24"><div><span className="inline-flex rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black tracking-[.22em] text-orange-400">CONCESSIONÁRIAS E LOJAS DE VEÍCULOS</p><h1 className="mt-4 max-w-4xl text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}</h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><a href="/demo?vertical=veiculos&intent=trial-5-dias" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-black">Testar 5 dias grátis<ArrowRight className="h-4 w-4"/></a><a href="/demo?vertical=veiculos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-6 py-3.5 text-sm font-black">Ver demonstração</a></div></div><div className="hidden lg:block"><div className="rounded-[28px] border border-white/10 bg-black/25 p-6 backdrop-blur"><div className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Lead de alto valor</div><div className="mt-4 grid grid-cols-2 gap-3">{theme.metrics.map(([v,l]) => <div key={l} className="rounded-2xl bg-white/10 p-4"><div className="text-3xl font-black">{v}</div><div className="mt-1 text-xs text-slate-300">{l}</div></div>)}</div></div></div></div></section>

      <section id="desafios" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Processo comercial</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.section}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(([title,text,Icon]) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="sistema" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1.35fr_.65fr]"><img src={theme.image} alt="VendorAI para operação de veículos" className="w-full rounded-[28px] shadow-2xl"/><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI na prática</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Do primeiro contato ao fechamento, tudo conectado.</h2><div className="mt-6 space-y-4 text-sm font-bold text-slate-700">{["Origem e campanha do lead","Veículo de interesse e troca","Financiamento e test-drive","Proposta, responsável e próxima ação","Follow-up e reativação"].map(item => <div key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white"><Check className="h-3.5 w-3.5"/></span>{item}</div>)}</div></div></div></section>

      <section className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada</p><h2 className="mt-3 text-3xl font-black">Anúncio → Lead → WhatsApp → Test-drive → Proposta → Venda</h2></div><div className="grid gap-3 md:grid-cols-6">{["Anúncio","Lead","WhatsApp","Test-drive","Proposta","Venda"].map((step,i)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{i+1}</div><div className="text-sm font-black">{step}</div></div>)}</div></div></section>

      <section className="bg-[#07101b] px-4 py-16 text-white sm:px-6"><div className="mx-auto max-w-7xl"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{theme.metrics.map(([v,l]) => <div key={l} className="rounded-2xl border border-white/10 bg-white/[.04] p-6 text-center"><div className="text-3xl font-black text-orange-400">{v}</div><div className="mt-2 text-sm font-bold text-slate-300">{l}</div></div>)}</div></div></section>

      <section id="faq" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-5xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Dúvidas?</p><h2 className="mt-3 text-3xl font-black">Perguntas frequentes</h2></div><div className="grid gap-3 md:grid-cols-2">{FAQ.map(([q,a]) => <details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black"><span>{q}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>

      <section className="bg-orange-500 px-4 py-14 text-white sm:px-6"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black sm:text-4xl">Venda mais veículos com menos oportunidades perdidas.</h2><p className="mt-2 max-w-2xl text-sm text-orange-50">Teste o VendorAI por 5 dias e veja a operação comercial de ponta a ponta.</p></div><a href="/demo?vertical=veiculos&intent=trial-5-dias" className="rounded-xl bg-white px-6 py-3.5 text-sm font-black text-orange-600">Testar 5 dias grátis</a></div></section>
    </main>
  </div>;
}