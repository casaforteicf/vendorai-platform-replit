import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Building2, Megaphone, Route, Smartphone, Sparkles } from "lucide-react";

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
