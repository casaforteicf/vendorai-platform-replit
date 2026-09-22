import { useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Building2, Clipboard, FileQuestion, LayoutTemplate, Megaphone, Presentation, Route, Smartphone, Sparkles, Target } from "lucide-react";


const actionBriefs = {
  marketing: {
    title: "Usar no Marketing",
    instruction: "Crie um plano de marketing para uma construtora usando este escopo como referência central. Priorize geração de demanda, Pré-Projeto Arqdor.ai como isca de captação, conteúdo de obras reais, Reels, provas sociais, nutrição e remarketing.",
    href: "/content?tab=planejamento&source=superadmin-scope&scope=construtoras",
  },
  lp: {
    title: "Gerar LP",
    instruction: "Crie uma Landing Page de alta conversão para construtoras. A oferta principal deve ser: o visitante cria uma prévia da casa, fachada ou ambiente antes de falar com a construtora. A LP deve capturar briefing, intenção, faixa de investimento e referências para o CRM.",
    href: "/content?tab=campanhas&view=lp&source=superadmin-scope&scope=construtoras",
  },
  campaign: {
    title: "Gerar campanha",
    instruction: "Crie uma campanha completa para construtoras baseada no Pré-Projeto Arqdor.ai como porta de entrada. Defina público, promessa, canais, criativos, CTA, Landing Page, sequência de nutrição e indicadores.",
    href: "/content?tab=campanhas&source=superadmin-scope&scope=construtoras",
  },
  presentation: {
    title: "Gerar apresentação comercial",
    instruction: "Monte uma apresentação comercial para vender Vendor.ai + Arqdor.ai a construtoras. Estruture a narrativa da captação até o pós-venda, mostrando Pré-Projeto, marketing, CRM, agentes, orçamento, planejamento, obra, app e Revenue Scout. Linguagem comercial, não técnica.",
  },
  faq: {
    title: "Gerar FAQ",
    instruction: "Crie um FAQ comercial para construtoras com perguntas e respostas sobre Pré-Projeto, captação de leads, Marketing, CRM, orçamento, planejamento, gestão de obras, compras, custos, app, portal e pós-venda. Respostas simples, comerciais e orientadas a benefícios.",
  },
  audit: {
    title: "Auditar produto contra o escopo",
    instruction: "Audite o produto Vendor.ai + Arqdor.ai contra este escopo de Construtoras. Para cada requisito, classifique como: pronto, parcial, ausente ou precisa validar. Liste evidência esperada, impacto comercial, prioridade e próximo passo. Não considere uma função pronta apenas por existir visualmente.",
  },
} as const;

type ActionKey = keyof typeof actionBriefs;

const scopeContext = `ESCOPO: Construtoras
- Pré-Projeto Arqdor.ai como ferramenta de aquisição e qualificação
- Landing Pages por campanha, modelo, região, faixa de investimento ou empreendimento
- Marketing ativo: planejamento, conteúdo, Reels, campanhas, nutrição e remarketing
- CRM, Cliente 360, Pipeline, SDR, Closer, Follow-up e Agenda
- Orçamento, composições, proposta e contrato
- Planejamento comercial, marketing, lead, obra e relacionamento
- Gestão de obra, diário, equipe por perfil, insumos, compras, cotações e custos
- App e Portal do Cliente
- Revenue Scout e pós-venda
- Jornada integrada da campanha à entrega da obra`;

const sections = [
  {
    title: "Posicionamento",
    icon: Sparkles,
    body: [
      "Vendor.ai + Arqdor.ai para construtoras é uma plataforma de crescimento e operação que acompanha toda a jornada: atrai o cliente, permite que ele experimente seu futuro projeto, qualifica a oportunidade, organiza a venda, gera planejamento, apoia orçamento e proposta, conecta a execução da obra e mantém o cliente dentro do ecossistema da construtora.",
      "A mensagem central é: o cliente não entra apenas para pedir orçamento. Ele entra para começar a criar a casa que deseja."
    ],
  },
  {
    title: "Pré-Projeto Arqdor.ai como captação de leads",
    icon: Building2,
    body: [
      "O Pré-Projeto deve ser tratado como ferramenta de aquisição, não apenas como recurso de arquitetura.",
      "A construtora pode disponibilizá-lo em Landing Pages, site, anúncios, campanhas, QR Codes, WhatsApp ou aplicativo.",
      "O lead informa terreno, metragem, estilo, necessidades, orçamento e preferências; cria fachadas e ambientações; envia referências, fotos, plantas ou croquis.",
      "A construtora recebe um lead enriquecido, com briefing inicial, preferências visuais, faixa de investimento, estágio de compra e material para uma abordagem comercial contextualizada."
    ],
  },
  {
    title: "Marketing ativo",
    icon: Megaphone,
    body: [
      "O marketing deve gerar demanda e não apenas organizar contatos existentes.",
      "Planejamento de conteúdo por objetivo: captar obras, divulgar projetos, mostrar andamento, reforçar autoridade técnica, divulgar diferenciais e trabalhar pós-venda.",
      "Geração assistida de posts, legendas, CTAs, imagens, roteiros, Reels e vídeos.",
      "Campanhas por tipo de obra, região, ticket, público, modelo construtivo, empreendimento ou objetivo comercial.",
      "Nutrição automática e remarketing de contatos antigos, propostas não fechadas e clientes.",
      "Fotos, marcos e diário de obra podem alimentar conteúdo e prova social."
    ],
  },
  {
    title: "Planejamento gerado",
    icon: Route,
    body: [
      "Plano comercial: metas, públicos, produtos, territórios, prioridades e ações.",
      "Plano de prospecção: perfis de leads, regiões, fontes, cadência, sinais e abordagem.",
      "Plano de marketing: calendário, campanhas, temas, canais, CTAs e Landing Pages.",
      "Plano por lead: próxima melhor ação, follow-up, objeções, proposta e momento ideal de contato.",
      "Plano de obra: etapas, responsáveis, metas, cronograma, custos, compras e atividades.",
      "Plano de relacionamento: pós-venda, avaliações, indicações, recompra e novas oportunidades."
    ],
  },
  {
    title: "Jornada comercial integrada",
    icon: Route,
    body: [
      "Marketing define público e objetivo → IA ajuda no planejamento → conteúdo, anúncios e LP são criados → lead entra pelo Pré-Projeto → Arqdor.ai cria fachada, ambientes e referências → CRM recebe lead enriquecido → Customer Intelligence prioriza → SDR atende → Agenda organiza reunião → Arqdor aprofunda projeto → orçamento e composições transformam a ideia em valor → Closer acompanha proposta → contrato cria a transição para a obra → planejamento organiza execução → app/portal acompanha → pós-venda gera avaliação, indicação e novas oportunidades."
    ],
  },
  {
    title: "CRM, vendas e agentes",
    icon: Sparkles,
    body: [
      "Cliente 360 centraliza contato, origem, briefing, conversas, documentos, preferências, oportunidades, propostas e próximos passos.",
      "Pipeline organiza etapas, responsáveis, valores, próxima ação e histórico.",
      "SDR qualifica e prepara o lead; Closer acompanha negociação e objeções; Follow-up evita oportunidades esquecidas; Suporte acompanha o pós-venda até a avaliação final.",
      "Agenda organiza reuniões, visitas técnicas, medições, apresentações e compromissos."
    ],
  },
  {
    title: "Orçamento, planejamento e obra",
    icon: Building2,
    body: [
      "Orçamento conectado a etapas, composições, insumos, mão de obra, preços, revisões e custo real posterior.",
      "Planejamento transforma o contrato fechado em etapas, responsáveis, dependências, atividades, prazos, metas e necessidades de compra.",
      "Cada obra funciona como unidade de operação com equipe, custos, compras, documentos, ocorrências e progresso.",
      "Diário de obra registra fotos, ocorrências, avanço, decisões, responsáveis e evidências com acesso por perfil.",
      "Compras passam por solicitação, cotação, comparação, escolha, pedido e acompanhamento.",
      "Previsto x realizado permite identificar desvios antes que consumam a margem."
    ],
  },
  {
    title: "App e Portal do Cliente",
    icon: Smartphone,
    body: [
      "O app é a continuidade digital da experiência iniciada na captação.",
      "Pode reunir Pré-Projeto, projeto e aprovações, propostas, documentos, acompanhamento da obra, comunicação, informações financeiras liberadas, escolha de acabamentos, assistência técnica e pós-venda.",
      "O Portal do Cliente apresenta somente as informações que a construtora decidir liberar."
    ],
  },
  {
    title: "Revenue Scout e pós-venda",
    icon: Sparkles,
    body: [
      "Revenue Scout identifica receita escondida na base: reativação, indicação, cross-sell, novas obras, recompra e oportunidades futuras.",
      "O pós-venda organiza assistência técnica, chamados, responsáveis, prazos, acompanhamento, solução e avaliação do cliente."
    ],
  },
];

export default function AdminKnowledgeBaseInternal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [preparedBrief, setPreparedBrief] = useState("");
  const [preparedTitle, setPreparedTitle] = useState("");

  function prepareAction(key: ActionKey) {
    const action = actionBriefs[key];
    const brief = `${scopeContext}\n\nOBJETIVO\n${action.instruction}`;
    sessionStorage.setItem("vendorai_superadmin_internal_scope_v1", JSON.stringify({
      scope: "construtoras",
      title: "Escopo Comercial — Construtoras",
      action: key,
      brief,
      createdAt: new Date().toISOString(),
    }));
    setPreparedTitle(action.title);
    setPreparedBrief(brief);

    if ("href" in action && action.href) {
      setLocation(action.href);
      return;
    }

    toast({
      title: action.title,
      description: "Brief preparado abaixo. Você pode copiar e usar onde quiser dentro do Superadmin.",
    });
  }

  async function copyPreparedBrief() {
    if (!preparedBrief) return;
    await navigator.clipboard.writeText(preparedBrief);
    toast({ title: "Brief copiado" });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <Badge variant="secondary">Somente Superadmin</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Base Interna da Empresa</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Material estratégico interno. Este conteúdo não é compartilhado com tenants, usuários de clientes ou agentes dos tenants.
            </p>
          </div>
          <Badge variant="outline">Atualizado em 22/09/2026</Badge>
        </div>
      </div>


      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Centro de comando — Construtoras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Use este escopo como contexto para criar materiais e orientar o produto. As ações abaixo continuam privadas no Superadmin.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("marketing")}>
              <Megaphone className="h-5 w-5 shrink-0" />
              <span><strong className="block">Usar no Marketing</strong><span className="text-xs text-muted-foreground">Abrir planejamento com contexto do segmento</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("lp")}>
              <LayoutTemplate className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar LP</strong><span className="text-xs text-muted-foreground">Pré-Projeto como porta de entrada</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("campaign")}>
              <Megaphone className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar campanha</strong><span className="text-xs text-muted-foreground">Campanha conectada ao escopo</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("presentation")}>
              <Presentation className="h-5 w-5 shrink-0" />
              <span><strong className="block">Apresentação comercial</strong><span className="text-xs text-muted-foreground">Preparar narrativa para venda</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("faq")}>
              <FileQuestion className="h-5 w-5 shrink-0" />
              <span><strong className="block">Gerar FAQ</strong><span className="text-xs text-muted-foreground">Perguntas comerciais do segmento</span></span>
            </Button>
            <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" onClick={() => prepareAction("audit")}>
              <Clipboard className="h-5 w-5 shrink-0" />
              <span><strong className="block">Auditar produto</strong><span className="text-xs text-muted-foreground">Comparar sistema x escopo</span></span>
            </Button>
          </div>

          {preparedBrief && (
            <div className="mt-5 rounded-xl border bg-muted/30 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{preparedTitle}</p>
                  <p className="text-xs text-muted-foreground">Brief interno preparado com o contexto de Construtoras.</p>
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
            Escopo Comercial — Construtoras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            Referência oficial para posicionamento, desenvolvimento comercial, demonstrações, materiais de marketing e evolução do produto para o segmento de construtoras.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {sections.map(({ title, icon: Icon, body }, index) => (
          <Card key={title}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <Icon className="h-4 w-4 text-primary" />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Frase de abertura comercial</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium leading-6">
            “Imagine o seu anúncio não levando o cliente apenas para um formulário, mas para uma experiência onde ele começa a criar a casa que deseja. Quando esse cliente chega à sua equipe, vocês já sabem o estilo, a necessidade, a faixa de investimento e o que ele imaginou. A partir daí, o mesmo sistema conduz atendimento, projeto, orçamento, proposta, planejamento, obra, aplicativo e pós-venda.”
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
