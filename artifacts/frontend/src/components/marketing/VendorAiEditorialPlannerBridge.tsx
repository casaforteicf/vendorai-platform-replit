import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Copy, Sparkles, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const episodes = [
  { id: "lost-money-01", title: "Lead pago sem próxima ação", hook: "Você pagou por esse lead. Quem decidiu o que acontece depois?", problem: "O contato entra, recebe uma resposta e desaparece do radar quando não existe próxima ação estruturada.", demo: "Mostrar CRM, oportunidade e criação/acompanhamento da próxima ação.", capabilities: ["CRM", "Follow-up IA", "Next Best Action"], cta: "Descubra onde seus leads estão parando.", format: "reel", lp: "/lp/recuperar-vendas" },
  { id: "lost-money-02", title: "Propostas esquecidas", hook: "Quantas propostas abertas hoje ninguém está acompanhando?", problem: "A negociação existe, mas perde prioridade e esfria sem cadência.", demo: "Mostrar pipeline filtrando oportunidades paradas e follow-up preparado pelo sistema.", capabilities: ["Pipeline", "Follow-up IA", "Agenda"], cta: "Encontre oportunidades paradas no seu negócio.", format: "reel", lp: "/lp/recuperar-vendas" },
  { id: "lost-money-03", title: "Cliente que já comprou e nunca voltou", hook: "Você já pagou para conquistar esse cliente uma vez. Por que começar do zero?", problem: "Clientes inativos ficam esquecidos enquanto a empresa continua pagando por aquisição nova.", demo: "Mostrar Revenue Scout identificando recompra, reativação, upsell ou cross-sell.", capabilities: ["Revenue Scout", "CRM", "Campanhas"], cta: "Procure receita dentro da sua própria base.", format: "reel", lp: "/lp/recuperar-vendas" },
  { id: "lost-money-04", title: "Marketing sem venda", hook: "Seu relatório mostra clique. Onde está a venda?", problem: "Marketing e comercial trabalham com métricas diferentes e não compartilham a mesma jornada.", demo: "Mostrar origem/campanha chegando ao lead, oportunidade e resultado comercial.", capabilities: ["Marketing", "CRM", "Analytics"], cta: "Conecte marketing ao resultado comercial.", format: "carousel", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-05", title: "WhatsApp sem memória comercial", hook: "A conversa aconteceu. Seu CRM sabe o que foi decidido?", problem: "Histórico fica espalhado e a próxima pessoa precisa reconstruir o contexto do cliente.", demo: "Mostrar Omnichannel, histórico do contato e oportunidade no CRM.", capabilities: ["Omnichannel", "WhatsApp", "CRM"], cta: "Pare de vender com contexto espalhado.", format: "reel", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-06", title: "Visitante interessado que some", hook: "Alguém voltou à sua página de preço. Sua equipe ficou sabendo?", problem: "Sinais de intenção existem no site, mas não chegam à operação comercial.", demo: "Mostrar Visitor Intelligence, jornada, origem e sinal de interesse.", capabilities: ["Visitor Intelligence", "CRM", "Alertas"], cta: "Veja os sinais que sua operação está ignorando.", format: "reel", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-07", title: "Conteúdo que gera atenção e morre ali", hook: "Seu post performou. O que o sistema fez com essa informação?", problem: "Conteúdo é tratado como peça isolada e não alimenta a próxima decisão de marketing.", demo: "Mostrar conteúdo vencedor, variações, pauta diária e decisão de replicar/testar mídia.", capabilities: ["Content Performance", "Motor de Conteúdo", "Meta Growth"], cta: "Transforme resultado de conteúdo em próxima ação.", format: "short", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-08", title: "Ferramentas demais", hook: "Quantas telas precisam estar abertas para uma única venda acontecer?", problem: "Cada ferramenta cria atividade, mas alguém continua transportando contexto entre elas.", demo: "Mostrar campanha → lead → CRM → follow-up → pipeline → resultado.", capabilities: ["Marketing", "CRM", "Agentes IA", "Analytics"], cta: "Veja sua operação trabalhando como um só sistema.", format: "reel", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-09", title: "Equipe ocupada com trabalho repetitivo", hook: "Seu vendedor está vendendo ou atualizando sistema?", problem: "Rotinas repetitivas consomem tempo que deveria estar concentrado em negociação e relacionamento.", demo: "Mostrar agentes de IA preparando atendimento, qualificação, follow-up e tarefas.", capabilities: ["Agentes IA", "Automação", "CRM"], cta: "Automatize a rotina sem perder o contexto.", format: "reel", lp: "/lp/ferramentas-conectadas" },
  { id: "lost-money-10", title: "Relatório sem próxima ação", hook: "Se o relatório diz o que aconteceu, quem diz o que fazer agora?", problem: "Indicadores são consumidos como retrospectiva e não viram prioridade operacional.", demo: "Mostrar dashboard, recomendação, missão e ação preparada.", capabilities: ["Analytics", "JARVIS", "Missões"], cta: "Transforme indicador em ação.", format: "carousel", lp: "/lp/ferramentas-conectadas" },
] as const;

type Episode = (typeof episodes)[number];

function isPlannerPath() {
  const params = new URLSearchParams(window.location.search);
  return window.location.pathname === "/content" && (params.get("tab") ?? "gerador") === "planejamento";
}

function trackedDestination(item: Episode, channel: "instagram" | "tiktok" | "linkedin") {
  const params = new URLSearchParams({
    utm_source: channel,
    utm_medium: "organic_social",
    utm_campaign: "onde-seu-negocio-perde-dinheiro",
    utm_content: item.id,
    vendorai_tese: item.title,
  });
  return `https://appvendorai.com${item.lp}?${params.toString()}`;
}

function buildBrief(item: Episode, channel: "instagram" | "tiktok" | "linkedin") {
  return [
    `Série: Onde seu negócio está perdendo dinheiro?`,
    `Tema: ${item.title}`,
    `Canal: ${channel}`,
    `Formato: ${item.format}`,
    `Gancho: ${item.hook}`,
    `Problema: ${item.problem}`,
    `Demonstração obrigatória: ${item.demo}`,
    `Capacidades reais que podem aparecer: ${item.capabilities.join(", ")}`,
    `CTA: ${item.cta}`,
    `Destino rastreável: ${trackedDestination(item, channel)}`,
    `Estrutura: dor → quebra de expectativa → demonstração real do VendorAI → evidência possível → CTA.`,
    `Regras: não prometer resultado garantido; não atacar concorrentes nominalmente; não inventar função; priorizar gravação de tela/prova operacional em vez de institucional genérico.`,
    `Roteiro: 0-3s gancho forte; 3-8s problema/custo; 8-20s demonstração de tela; 20-25s consequência/benefício; 25-30s CTA.`,
  ].join("\n");
}

export function VendorAiEditorialPlannerBridge() {
  const [visible, setVisible] = useState(() => isPlannerPath());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState<string>(episodes[0].id);
  const [channel, setChannel] = useState<"instagram" | "tiktok" | "linkedin">("instagram");
  const selected = useMemo(() => episodes.find((item) => item.id === selectedId) ?? episodes[0], [selectedId]);
  const brief = useMemo(() => buildBrief(selected, channel), [selected, channel]);

  useEffect(() => {
    const sync = () => setVisible(isPlannerPath());
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 400);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    const attach = () => {
      const main = document.querySelector("main") ?? document.querySelector("[role='main']");
      if (!(main instanceof HTMLElement)) return false;
      let node = document.getElementById("vendorai-editorial-planner-bridge");
      if (!(node instanceof HTMLElement)) {
        node = document.createElement("section");
        node.id = "vendorai-editorial-planner-bridge";
        node.className = "mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6";
        main.appendChild(node);
      }
      setHost(node);
      return true;
    };
    if (attach()) return;
    const timer = window.setInterval(() => { if (attach()) window.clearInterval(timer); }, 300);
    return () => window.clearInterval(timer);
  }, [visible]);

  function openGenerator() {
    try { localStorage.setItem("vendorai_editorial_brief_v1", JSON.stringify({ brief, selectedId: selected.id, channel, savedAt: new Date().toISOString() })); } catch {}
    const params = new URLSearchParams({
      tab: "gerador",
      from: "vendorai-editorial-strategy",
      editorialId: selected.id,
      channel,
      format: selected.format,
      objective: "growth",
      landingPage: selected.lp,
      brief,
    });
    window.location.assign(`/content?${params.toString()}`);
  }

  async function copyBrief() {
    await navigator.clipboard?.writeText(brief);
  }

  if (!visible || !host) return null;
  return createPortal(
    <div className="rounded-2xl border border-orange-500/25 bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-600" /><h2 className="text-base font-semibold">Estratégia editorial VendorAI</h2><Badge variant="outline">Oficial</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">Gere conteúdos no padrão aprovado: problema → ação → execução → resultado. Cada peça já recebe CTA e destino rastreável.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><Badge>40% dor</Badge><Badge variant="outline">30% demonstração</Badge><Badge variant="outline">20% prova</Badge><Badge variant="outline">10% convite</Badge></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {episodes.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`rounded-xl border p-3 text-left transition ${selected.id === item.id ? "border-orange-500 bg-orange-500/5" : "hover:border-orange-500/40"}`}><span className="text-[10px] font-bold text-orange-600">{item.id.replace("lost-money-", "EP ")}</span><p className="mt-1 text-xs font-semibold leading-5">{item.title}</p></button>)}
        </div>
        <div className="rounded-xl border bg-muted/20 p-3">
          <p className="text-xs font-semibold">Canal</p>
          <div className="mt-2 grid gap-2">{(["instagram", "tiktok", "linkedin"] as const).map((item) => <Button key={item} type="button" size="sm" variant={channel === item ? "default" : "outline"} onClick={() => setChannel(item)}>{item === "instagram" ? "Instagram" : item === "tiktok" ? "TikTok" : "LinkedIn"}</Button>)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2"><Target className="h-4 w-4 text-orange-600" /><strong className="text-sm">{selected.hook}</strong><Badge variant="outline">{selected.format}</Badge></div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.demo}</p>
        <p className="mt-2 text-xs"><strong>CTA:</strong> {selected.cta}</p>
        <p className="mt-1 break-all text-[11px] text-muted-foreground"><strong>Destino:</strong> {trackedDestination(selected, channel)}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={openGenerator}>Criar roteiro no gerador <ArrowRight className="ml-1.5 h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => void copyBrief()}><Copy className="mr-1.5 h-4 w-4" />Copiar briefing</Button></div>
      </div>
    </div>,
    host,
  );
}
