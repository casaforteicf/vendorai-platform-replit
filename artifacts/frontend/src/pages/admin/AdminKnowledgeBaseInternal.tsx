import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen,
  Building2,
  CheckCircle2,
  Clipboard,
  FileQuestion,
  LayoutTemplate,
  Megaphone,
  Presentation,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

type ScopeModule = {
  id: string;
  group: string;
  title: string;
  summary: string;
  bullets: string[];
  angle: string;
};

const scopeModules: ScopeModule[] = [
  {
    id: "pre-projeto-arqdor",
    group: "Aquisição",
    title: "Pré-Projeto Arqdor.ai",
    summary: "Transforma a experiência de projeto em ferramenta de captação e qualificação de leads.",
    bullets: [
      "Lead cria pré-ideia de casa, fachada ou ambiente antes do contato comercial.",
      "Coleta terreno, metragem, estilo, necessidades, orçamento e preferências.",
      "Aceita referências, fotos, plantas e croquis.",
      "Entrega ao comercial um lead enriquecido com contexto e intenção.",
    ],
    angle: "Use o Pré-Projeto como principal diferencial para captar leads mais preparados e aumentar o envolvimento emocional antes da reunião.",
  },
  {
    id: "landing-pages",
    group: "Aquisição",
    title: "Landing Pages por objetivo",
    summary: "Cria páginas específicas para converter campanhas, modelos, regiões e ofertas em leads rastreáveis.",
    bullets: [
      "LP de Pré-Projeto.",
      "LP por modelo de casa, estilo, cidade, região ou empreendimento.",
      "LP por faixa de investimento, campanha ou simulação.",
      "Origem, campanha e interesse chegam ao CRM.",
    ],
    angle: "Destaque a possibilidade de criar uma LP específica para cada oferta e conectar o tráfego diretamente ao CRM.",
  },
  {
    id: "marketing-ativo",
    group: "Marketing",
    title: "Marketing Ativo",
    summary: "Transforma o sistema em motor de geração de demanda e não apenas em organizador de contatos.",
    bullets: [
      "Planejamento de conteúdo por objetivo.",
      "Campanhas por público, região, ticket, modelo construtivo ou empreendimento.",
      "Nutrição e remarketing.",
      "Marketing conectado à origem, lead, oportunidade e venda.",
    ],
    angle: "Venda o marketing como uma máquina contínua de geração, nutrição e recuperação de demanda.",
  },
  {
    id: "conteudo-reels-video",
    group: "Marketing",
    title: "Conteúdo, Reels e Vídeos",
    summary: "Ajuda a produzir material comercial e institucional continuamente a partir das atividades reais da construtora.",
    bullets: [
      "Posts, legendas, CTAs e variações.",
      "Roteiros para Reels, vídeos, bastidores e antes/depois.",
      "Conteúdo técnico e comercial.",
      "Reaproveitamento de fotos, marcos e diário de obra.",
    ],
    angle: "Mostre como a operação real da construtora pode virar conteúdo e prova social sem depender de produção manual diária.",
  },
  {
    id: "campanhas",
    group: "Marketing",
    title: "Campanhas",
    summary: "Organiza campanhas completas com público, mensagem, canais, criativos, LP, nutrição e indicadores.",
    bullets: [
      "Campanhas por tipo de obra e perfil de cliente.",
      "Campanhas por território ou faixa de investimento.",
      "Integração com conteúdo, anúncios e Landing Pages.",
      "Rastreamento até a oportunidade comercial.",
    ],
    angle: "Destaque o fluxo campanha → lead → oportunidade → venda, evitando campanhas desconectadas do resultado comercial.",
  },
  {
    id: "planejamento-gerado",
    group: "Inteligência",
    title: "Planejamento Gerado",
    summary: "Transforma objetivos em planos comerciais, de prospecção, marketing, lead, obra e relacionamento.",
    bullets: [
      "Plano comercial com metas, públicos, produtos e prioridades.",
      "Plano de prospecção com perfis, regiões, sinais e cadência.",
      "Plano de marketing com calendário, temas, canais e CTAs.",
      "Plano por lead, obra e relacionamento.",
    ],
    angle: "Venda o planejamento como a ponte entre estratégia e execução: o sistema não só analisa, ele organiza o que deve ser feito.",
  },
  {
    id: "prospector",
    group: "Comercial",
    title: "Prospector",
    summary: "Busca e organiza oportunidades com base em perfis e sinais observáveis antes da abordagem.",
    bullets: [
      "Pesquisa por perfil de cliente e região.",
      "Uso de sinais de oportunidade.",
      "Fila de prospecção.",
      "Pré-qualificação antes do SDR.",
    ],
    angle: "Mostre que a construtora deixa de depender somente de indicação e demanda espontânea para encontrar oportunidades.",
  },
  {
    id: "crm-cliente-360",
    group: "Comercial",
    title: "CRM e Cliente 360",
    summary: "Centraliza toda a memória comercial e o contexto do cliente em um único lugar.",
    bullets: [
      "Dados, origem, briefing e preferências.",
      "Histórico de conversas, documentos e atividades.",
      "Oportunidades, propostas e próximos passos.",
      "Relacionamentos e decisores.",
    ],
    angle: "Destaque que o conhecimento do cliente deixa de ficar preso no celular do vendedor.",
  },
  {
    id: "pipeline",
    group: "Comercial",
    title: "Pipeline de Vendas",
    summary: "Mostra onde estão as oportunidades, quanto valem e qual é o próximo passo de cada uma.",
    bullets: [
      "Etapas configuráveis.",
      "Valor, probabilidade e responsável.",
      "Motivos de perda.",
      "Próxima ação obrigatória.",
    ],
    angle: "Material ideal para falar de previsibilidade comercial, gestão de carteira e redução de propostas esquecidas.",
  },
  {
    id: "omnichannel",
    group: "Comercial",
    title: "Conversas Omnichannel",
    summary: "Mantém atendimento e mensagens ligados ao cliente e à oportunidade, em vez de espalhados por canais isolados.",
    bullets: [
      "WhatsApp, Instagram e demais canais no contexto do cliente.",
      "Transferência preservando histórico.",
      "Registro de decisões e tarefas.",
      "IA assistindo respostas e continuidade.",
    ],
    angle: "Mostre como o WhatsApp deixa de ser uma ilha e passa a fazer parte do processo comercial.",
  },
  {
    id: "agentes-ia",
    group: "IA",
    title: "Agentes de IA",
    summary: "SDR, Closer, Follow-up e Suporte atuam em etapas diferentes da jornada comercial e de relacionamento.",
    bullets: [
      "SDR qualifica e entende necessidade.",
      "Closer trabalha negociação e objeções.",
      "Follow-up reduz oportunidades esquecidas.",
      "Suporte acompanha atendimento até a avaliação final.",
    ],
    angle: "Crie materiais separados para cada agente ou um material mostrando o time de IA funcionando em sequência.",
  },
  {
    id: "agenda-visitas",
    group: "Comercial",
    title: "Agenda e Visitas",
    summary: "Organiza reuniões, visitas técnicas, medições e compromissos conectados ao contexto do cliente.",
    bullets: [
      "Reuniões e visitas.",
      "Lembretes e responsáveis.",
      "Agenda por equipe.",
      "Contexto do lead e da obra no compromisso.",
    ],
    angle: "Destaque a redução de faltas, esquecimentos e visitas sem informação suficiente.",
  },
  {
    id: "orcamento-composicoes",
    group: "Engenharia Comercial",
    title: "Orçamento e Composições",
    summary: "Transforma o orçamento vendido na base econômica da futura obra.",
    bullets: [
      "Etapas, composições e insumos.",
      "Mão de obra por m², hora, dia, mês ou unidade.",
      "Margem, frete, comissão e custos adicionais.",
      "Versões e revisões.",
    ],
    angle: "Mostre o ganho de sair de planilhas isoladas para um orçamento estruturado e conectado à execução.",
  },
  {
    id: "propostas-contratos",
    group: "Engenharia Comercial",
    title: "Propostas e Contratos",
    summary: "Mantém orçamento, proposta, aceite e contrato dentro da mesma linha comercial.",
    bullets: [
      "Proposta profissional.",
      "Versões e histórico.",
      "Aceite e documentação.",
      "Transição para contrato e obra.",
    ],
    angle: "Destaque continuidade: o que foi vendido permanece ligado ao que será executado.",
  },
  {
    id: "arqdor-projeto-render",
    group: "Arqdor.ai",
    title: "Projeto, Fachadas, Ambientes e Render",
    summary: "Ajuda a apresentar, aprofundar e visualizar o projeto para acelerar entendimento e decisão.",
    bullets: [
      "Modelagem e estudo de ambientes.",
      "Fachadas e ambientações.",
      "Materiais e referências.",
      "Render e apresentação ao cliente.",
    ],
    angle: "Ideal para material visual mostrando como o cliente deixa de imaginar e passa a visualizar o que está comprando.",
  },
  {
    id: "planejamento-obra",
    group: "Obra",
    title: "Planejamento da Obra",
    summary: "Transforma o contrato fechado em sequência executável de etapas, atividades, responsáveis e prazos.",
    bullets: [
      "Etapas e dependências.",
      "Responsáveis e metas.",
      "Cronograma e marcos.",
      "Necessidades de compra e replanejamento.",
    ],
    angle: "Destaque o planejamento como guia vivo da execução, e não como cronograma estático.",
  },
  {
    id: "gestao-obras",
    group: "Obra",
    title: "Gestão de Obras",
    summary: "Cada obra se torna uma unidade de operação com informação comercial, técnica e financeira conectada.",
    bullets: [
      "Cliente, endereço, responsáveis e contrato.",
      "Progresso, equipe e documentos.",
      "Pendências e ocorrências.",
      "Integração com orçamento e custos.",
    ],
    angle: "Material focado em centralização: uma obra, uma visão operacional completa.",
  },
  {
    id: "diario-acessos",
    group: "Obra",
    title: "Diário de Obras e Acessos por Perfil",
    summary: "Registra o que aconteceu no campo e entrega acesso adequado para cada participante da obra.",
    bullets: [
      "Atividades, equipe, clima, materiais e equipamentos.",
      "Fotos, ocorrências e evidências.",
      "Acessos diferentes para mestre, engenheiro, arquiteto, eletricista, pedreiro e outros.",
      "Metas e responsabilidades por executor.",
    ],
    angle: "Destaque rastreabilidade, evidência e organização do campo sem depender de grupos de WhatsApp.",
  },
  {
    id: "insumos",
    group: "Obra",
    title: "Insumos e Materiais",
    summary: "Liga materiais às etapas e composições para antecipar necessidade, consumo e disponibilidade.",
    bullets: [
      "Cadastro padronizado.",
      "Vínculo com etapa e composição.",
      "Necessidade x disponível.",
      "Entrada, saída, fornecedor e preço.",
    ],
    angle: "Material exclusivo sobre redução de falta, excesso e compra emergencial de material.",
  },
  {
    id: "compras-cotacoes",
    group: "Suprimentos",
    title: "Compras e Cotações",
    summary: "Organiza a tomada de preços desde a solicitação até o pedido e a entrega.",
    bullets: [
      "Solicitação de compra.",
      "Importação de orçamentos de fornecedores.",
      "Mapa comparativo de preço, prazo, frete e condição.",
      "Aprovação, pedido e acompanhamento.",
    ],
    angle: "Destaque economia, governança e rastreabilidade na compra de materiais e serviços.",
  },
  {
    id: "custos-margem",
    group: "Financeiro",
    title: "Custos, Previsto x Real e Margem",
    summary: "Permite acompanhar se a obra está consumindo a margem enquanto ainda há tempo para corrigir.",
    bullets: [
      "Orçado x comprometido x realizado.",
      "Custo por etapa.",
      "Despesas e comprovantes.",
      "Margem projetada e resultado por obra.",
    ],
    angle: "Material forte para direção e financeiro: descobrir o desvio antes do fim da obra.",
  },
  {
    id: "portal-app",
    group: "Cliente",
    title: "App e Portal do Cliente",
    summary: "Entrega uma experiência digital contínua desde o Pré-Projeto até o pós-venda.",
    bullets: [
      "Projeto, renders e aprovações.",
      "Propostas, documentos e informações liberadas.",
      "Andamento, fotos e marcos da obra.",
      "Comunicação, acabamentos e assistência técnica.",
    ],
    angle: "Destaque experiência, transparência e diferenciação comercial da construtora.",
  },
  {
    id: "revenue-scout",
    group: "Inteligência",
    title: "Revenue Scout",
    summary: "Encontra novas oportunidades dentro da própria base de contatos e clientes.",
    bullets: [
      "Reativação de contatos.",
      "Indicações e novas obras.",
      "Cross-sell e novas necessidades.",
      "Priorização de oportunidades futuras.",
    ],
    angle: "Material focado em receita escondida: vender mais antes de comprar mais leads.",
  },
  {
    id: "pos-venda",
    group: "Cliente",
    title: "Pós-venda e Assistência",
    summary: "Organiza atendimento depois da entrega e transforma assistência em experiência e relacionamento.",
    bullets: [
      "Chamados com fotos e descrição.",
      "Responsável e prazo.",
      "Follow-up até solução.",
      "Avaliação, indicação e novas oportunidades.",
    ],
    angle: "Destaque proteção da marca, organização da assistência e geração de indicação.",
  },
];

const actionBriefs = {
  marketing: {
    title: "Usar no Marketing",
    instruction: "Crie um plano de marketing usando somente o escopo selecionado. Defina posicionamento, público, dores, promessa, temas, formatos, canais, frequência e CTAs.",
    href: "/content?tab=planejamento&source=superadmin-scope",
  },
  lp: {
    title: "Gerar LP",
    instruction: "Crie uma Landing Page de alta conversão usando somente o escopo selecionado. Estruture headline, promessa, problema, benefícios, funcionamento, prova, CTA e captura de lead.",
    href: "/content?tab=campanhas&view=lp&source=superadmin-scope",
  },
  campaign: {
    title: "Gerar campanha",
    instruction: "Crie uma campanha completa usando somente o escopo selecionado. Defina público, promessa, canais, criativos, CTA, Landing Page, nutrição e indicadores.",
    href: "/content?tab=campanhas&source=superadmin-scope",
  },
  presentation: {
    title: "Gerar apresentação comercial",
    instruction: "Monte uma apresentação comercial exclusiva sobre o escopo selecionado. Linguagem comercial, não técnica. Explique a dor, como funciona, aplicação prática, benefícios, exemplo de uso e resultado esperado.",
  },
  faq: {
    title: "Gerar FAQ",
    instruction: "Crie um FAQ exclusivamente sobre o escopo selecionado, com perguntas comerciais e respostas simples, objetivas e orientadas a benefícios.",
  },
  audit: {
    title: "Auditar produto contra o escopo",
    instruction: "Audite somente o escopo selecionado no produto. Classifique os requisitos como pronto, parcial, ausente ou precisa validar. Liste evidência esperada, impacto comercial, prioridade e próximo passo.",
  },
} as const;

type ActionKey = keyof typeof actionBriefs;

function moduleContext(module: ScopeModule | null) {
  if (!module) {
    return [
      "ESCOPO: Construtoras — visão completa",
      ...scopeModules.map((item) => `- ${item.title}: ${item.summary}`),
    ].join("\n");
  }

  return [
    `ESCOPO PONTUAL: ${module.title}`,
    `GRUPO: ${module.group}`,
    `RESUMO: ${module.summary}`,
    "CARACTERÍSTICAS:",
    ...module.bullets.map((item) => `- ${item}`),
    `ÂNGULO COMERCIAL: ${module.angle}`,
    "",
    "REGRA: use somente este escopo como tema principal. Não transforme o material em uma apresentação geral de todo o sistema.",
  ].join("\n");
}

export default function AdminKnowledgeBaseInternal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("Todos");
  const [preparedBrief, setPreparedBrief] = useState("");
  const [preparedTitle, setPreparedTitle] = useState("");

  const groups = useMemo(
    () => ["Todos", ...Array.from(new Set(scopeModules.map((item) => item.group)))],
    [],
  );

  const selectedScope = useMemo(
    () => scopeModules.find((item) => item.id === selectedScopeId) ?? null,
    [selectedScopeId],
  );

  const filteredScopes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopeModules.filter((item) => {
      if (group !== "Todos" && item.group !== group) return false;
      if (!query) return true;
      const haystack = [item.title, item.group, item.summary, item.angle, ...item.bullets].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [group, search]);

  function selectScope(scopeId: string | null) {
    setSelectedScopeId(scopeId);
    setPreparedBrief("");
    setPreparedTitle("");
    const module = scopeModules.find((item) => item.id === scopeId);
    toast({
      title: module ? `Escopo selecionado: ${module.title}` : "Escopo completo selecionado",
      description: module
        ? "As próximas ações usarão somente esta característica."
        : "As próximas ações poderão usar a visão completa de Construtoras.",
    });
  }

  function prepareAction(key: ActionKey) {
    const action = actionBriefs[key];
    const context = moduleContext(selectedScope);
    const brief = `${context}\n\nOBJETIVO\n${action.instruction}`;
    const scopeSlug = selectedScope?.id ?? "construtoras-completo";

    sessionStorage.setItem("vendorai_superadmin_internal_scope_v1", JSON.stringify({
      scope: scopeSlug,
      title: selectedScope?.title ?? "Escopo Comercial — Construtoras",
      group: selectedScope?.group ?? "Completo",
      action: key,
      brief,
      createdAt: new Date().toISOString(),
    }));

    setPreparedTitle(`${action.title} — ${selectedScope?.title ?? "Construtoras"}`);
    setPreparedBrief(brief);

    if ("href" in action && action.href) {
      const separator = action.href.includes("?") ? "&" : "?";
      setLocation(`${action.href}${separator}scope=${encodeURIComponent(scopeSlug)}`);
      return;
    }

    toast({
      title: action.title,
      description: selectedScope
        ? `Brief preparado usando somente “${selectedScope.title}”.`
        : "Brief preparado usando o escopo completo.",
    });
  }

  async function copyPreparedBrief() {
    if (!preparedBrief) return;
    await navigator.clipboard.writeText(preparedBrief);
    toast({ title: "Brief copiado" });
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <Badge variant="secondary">Somente Superadmin</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Base Interna da Empresa</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Biblioteca estratégica modular. Selecione uma característica específica do sistema e gere material exclusivo sobre ela, sem precisar usar o escopo completo.
            </p>
          </div>
          <Badge variant="outline">Construtoras · Biblioteca modular</Badge>
        </div>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Centro de comando
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contexto ativo</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge>{selectedScope?.title ?? "Escopo Completo — Construtoras"}</Badge>
              {selectedScope && <Badge variant="outline">{selectedScope.group}</Badge>}
              {selectedScope && (
                <Button variant="ghost" size="sm" onClick={() => selectScope(null)}>
                  Usar escopo completo
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {selectedScope?.summary ?? "As ações abaixo considerarão toda a proposta comercial e operacional do segmento."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("marketing")}>
              <Megaphone className="h-5 w-5 shrink-0" />
              <span><strong className="block">Usar no Marketing</strong><span className="text-xs text-muted-foreground">Planejamento focado no escopo ativo</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("lp")}>
              <LayoutTemplate className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar LP</strong><span className="text-xs text-muted-foreground">Página exclusiva sobre a característica</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("campaign")}>
              <Megaphone className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar campanha</strong><span className="text-xs text-muted-foreground">Campanha focada no escopo ativo</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("presentation")}>
              <Presentation className="h-5 w-5 shrink-0" />
              <span><strong className="block">Apresentação comercial</strong><span className="text-xs text-muted-foreground">Material exclusivo da função</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("faq")}>
              <FileQuestion className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar FAQ</strong><span className="text-xs text-muted-foreground">FAQ somente desta função</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("audit")}>
              <Clipboard className="h-5 w-5 shrink-0" />
              <span><strong className="block">Auditar produto</strong><span className="text-xs text-muted-foreground">Validar somente este escopo</span></span>
            </Button>
          </div>

          {preparedBrief && (
            <div className="mt-5 rounded-xl border bg-muted/30 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{preparedTitle}</p>
                  <p className="text-xs text-muted-foreground">Brief interno preparado com escopo pontual.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={copyPreparedBrief}>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copiar brief
                </Button>
              </div>
              <Textarea value={preparedBrief} readOnly className="min-h-48 resize-y text-xs leading-5" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Biblioteca de Escopos — Construtoras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar: pré-projeto, orçamento, compras, Revenue Scout..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {groups.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={group === item ? "default" : "outline"}
                  onClick={() => setGroup(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredScopes.map((item) => {
          const active = selectedScopeId === item.id;
          return (
            <Card key={item.id} className={active ? "border-primary shadow-sm" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge variant="outline" className="mb-2">{item.group}</Badge>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </div>
                  {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">{item.summary}</p>
                <div className="space-y-1.5">
                  {item.bullets.map((bullet) => (
                    <p key={bullet} className="text-xs leading-5 text-muted-foreground">• {bullet}</p>
                  ))}
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-semibold">Ângulo para material</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.angle}</p>
                </div>
                <Button
                  className="w-full"
                  variant={active ? "secondary" : "outline"}
                  onClick={() => selectScope(item.id)}
                >
                  {active ? "Escopo selecionado" : "Usar somente este escopo"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredScopes.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum escopo encontrado para esta busca.
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Como usar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>1. Escolha uma característica na Biblioteca de Escopos.</p>
          <p>2. Clique em “Usar somente este escopo”.</p>
          <p>3. No Centro de Comando, escolha Marketing, LP, Campanha, Apresentação, FAQ ou Auditoria.</p>
          <p>4. O material será preparado com foco naquela função, sem transformar o conteúdo em uma apresentação geral do sistema.</p>
        </CardContent>
      </Card>
    </div>
  );
}
