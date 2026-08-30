import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart3, Bot, Boxes, BrainCircuit, CalendarDays, CheckCircle2,
  CreditCard, FileText, Megaphone, MessageSquare, PackageSearch,
  Target, UsersRound, Workflow,
} from "lucide-react";

const modules = [
  {
    id: "crm",
    title: "CRM e Pipeline Comercial",
    icon: Target,
    desc: "Organize leads, contatos, negócios, atividades, propostas e todo o histórico comercial em funis visuais adaptados à sua operação.",
    features: ["Leads e contatos", "Pipeline Kanban", "Tarefas e follow-ups", "Propostas e histórico"],
  },
  {
    id: "agentes",
    title: "Equipe de Agentes de IA",
    icon: Bot,
    desc: "Agentes especializados atuam em diferentes momentos da jornada, preservando contexto e seguindo as regras comerciais da empresa.",
    features: ["SDR e qualificação", "Closer e negociação", "Follow-up e reativação", "Suporte e pós-venda"],
  },
  {
    id: "omnichannel",
    title: "Conversas Omnichannel",
    icon: MessageSquare,
    desc: "Centralize conversas e dados dos canais conectados para que pessoas e agentes de IA trabalhem sobre o mesmo histórico.",
    features: ["WhatsApp oficial", "Instagram profissional", "Facebook Messenger", "Caixa de entrada unificada"],
  },
  {
    id: "intelligence",
    title: "Inteligência do Cliente",
    icon: BrainCircuit,
    desc: "Transforme comportamento, intenção e histórico em prioridades claras para a equipe comercial agir no momento certo.",
    features: ["Lead scoring", "Risco de churn", "Próxima melhor ação", "Segmentação inteligente"],
  },
  {
    id: "prospeccao",
    title: "Prospecção e Revenue Scout",
    icon: PackageSearch,
    desc: "Encontre oportunidades, organize aprovações e aplique regras comerciais para direcionar a prospecção com mais precisão.",
    features: ["Prospector inteligente", "Aprovação de contatos", "Regras por operação", "Relatórios de oportunidades"],
  },
  {
    id: "conteudo",
    title: "Conteúdo e Redes Sociais",
    icon: FileText,
    desc: "Crie conteúdo com IA, organize variações em uma biblioteca e publique nos canais conectados sem perder o vínculo com a estratégia comercial.",
    features: ["Feed, Stories e Reels", "Biblioteca de conteúdo", "Publicação no Instagram", "Textos e imagens com IA"],
  },
  {
    id: "campanhas",
    title: "Campanhas e Anúncios",
    icon: Megaphone,
    desc: "Planeje campanhas, reutilize conteúdos aprovados e acompanhe ações de divulgação dentro da mesma operação comercial.",
    features: ["Campanhas segmentadas", "Conteúdo patrocinável", "Integração Meta Ads", "Histórico das ações"],
  },
  {
    id: "agenda",
    title: "Agenda Inteligente",
    icon: CalendarDays,
    desc: "Conecte tarefas, compromissos, retornos comerciais e agendamentos aos leads e negócios correspondentes.",
    features: ["Compromissos e tarefas", "Lembretes comerciais", "Agendamento por agentes", "Visão da equipe"],
  },
  {
    id: "catalogo",
    title: "Catálogo, Estoque e Propostas",
    icon: Boxes,
    desc: "Cadastre produtos, categorias, fornecedores, insumos e regras de preço para criar propostas coerentes com a realidade do negócio.",
    features: ["Catálogo de produtos", "Estoque e fornecedores", "Composição de preços", "Propostas comerciais"],
  },
  {
    id: "financeiro",
    title: "Financeiro e Cobrança",
    icon: CreditCard,
    desc: "Acompanhe faturamento, cobranças, comissões e conciliação, com meios de pagamento integrados conforme a configuração da empresa.",
    features: ["PIX e cartão", "Faturas e cobrança", "Comissões", "Conciliação financeira"],
  },
  {
    id: "gestao",
    title: "Analytics e Gestão Executiva",
    icon: BarChart3,
    desc: "Acompanhe o desempenho da operação com painéis, relatórios e indicadores comerciais, financeiros e de uso da IA.",
    features: ["Dashboards", "Relatórios gerenciais", "Indicadores comerciais", "Consumo de IA"],
  },
  {
    id: "conhecimento",
    title: "Base de Conhecimento",
    icon: Workflow,
    desc: "Centralize informações, documentos e regras para orientar agentes de IA e manter respostas alinhadas ao negócio.",
    features: ["Documentos e informações", "Regras da empresa", "Contexto para agentes", "Integrações e webhooks"],
  },
  {
    id: "equipe",
    title: "Equipes, Parceiros e Comissões",
    icon: UsersRound,
    desc: "Gerencie usuários, vendedores, parceiros e influenciadores, vinculando indicações, cupons e comissões à origem correta.",
    features: ["Usuários e permissões", "Parceiros e indicados", "Cupons de desconto", "Comissões variáveis"],
  },
  {
    id: "sites",
    title: "Sites, Landing Pages e E-commerce",
    icon: Workflow,
    desc: "Crie presença digital conectada à operação, capturando oportunidades diretamente para o CRM e acompanhando toda a conversão.",
    features: ["Sites e páginas", "Formulários e captação", "E-commerce", "Integração com o CRM"],
  },
  {
    id: "projetos",
    title: "Projetos, Obras e Arqdor.ai",
    icon: Boxes,
    desc: "Gerencie projetos, ambientes, orçamentos, clientes e execução, com recursos de arquitetura, renderização e portal do cliente.",
    features: ["Gestão de projetos", "Orçamentos e etapas", "Renders com IA", "Portal do cliente"],
  },
  {
    id: "automacoes",
    title: "Automações e Integrações",
    icon: Workflow,
    desc: "Conecte eventos, sistemas e rotinas para reduzir digitação, atrasos e tarefas repetitivas em toda a empresa.",
    features: ["Fluxos automáticos", "Webhooks e APIs", "N8N e Typebot", "Alertas e notificações"],
  },
  {
    id: "governanca",
    title: "Administração e Segurança",
    icon: BrainCircuit,
    desc: "Controle empresas, usuários, acessos, permissões, licenças, auditoria e isolamento das informações entre operações.",
    features: ["Multiempresa", "Papéis e permissões", "Auditoria e proteção", "Gestão de licenças"],
  },
  {
    id: "verticais",
    title: "Operações Especializadas",
    icon: PackageSearch,
    desc: "Adapte processos, painéis, agentes e regras para construção, arquitetura, distribuição, varejo, serviços e outras verticais.",
    features: ["Regras por segmento", "Módulos configuráveis", "Agentes especializados", "Visões operacionais"],
  },

];

const benefits = [
  ["Mais vendas", "Oportunidades priorizadas, atendidas e acompanhadas até o fechamento."],
  ["Resposta mais rápida", "Canais e agentes trabalhando com o mesmo contexto do cliente."],
  ["Menos trabalho manual", "Rotinas, alertas, follow-ups e tarefas executados automaticamente."],
  ["Decisões melhores", "Dados comerciais, financeiros e operacionais transformados em indicadores."],
  ["Menos perdas", "Histórico centralizado, controle de churn, duplicidades e oportunidades esquecidas."],
  ["Mais produtividade", "Equipe concentrada em decisões e relacionamento, não em tarefas repetitivas."],
  ["Gestão centralizada", "Clientes, produtos, projetos, campanhas, finanças e equipes no mesmo ambiente."],
  ["Crescimento organizado", "Processos padronizados, permissões, regras e automações que acompanham a escala."],
];

const capabilityGroups = [
  {
    title: "Vendas e relacionamento",
    items: ["CRM completo", "Leads e contatos", "Negócios e pipeline", "Atividades e follow-ups", "Propostas e contratos", "Briefings", "Histórico 360°", "Lead scoring", "Próxima melhor ação", "Risco de churn"],
  },
  {
    title: "Agentes e inteligência artificial",
    items: ["SDR", "Closer", "Follow-up", "Prospecção", "Atendimento", "Suporte", "Agendamento", "Financeiro", "Cobrança", "Pós-venda", "Copilotos", "Memória e contexto"],
  },
  {
    title: "Atendimento omnichannel",
    items: ["WhatsApp oficial", "Instagram profissional", "Facebook Messenger", "Caixa de entrada unificada", "Distribuição de conversas", "Histórico por cliente", "Respostas assistidas", "Transferência para equipe"],
  },
  {
    title: "Prospecção e oportunidades",
    items: ["Revenue Scout", "Prospector inteligente", "Busca de empresas e contatos", "Qualificação", "Regras comerciais", "Aprovação pelo gestor", "Listas e segmentações", "Reativação de base"],
  },
  {
    title: "Marketing, conteúdo e anúncios",
    items: ["Planejamento de conteúdo", "Textos e imagens com IA", "Feed, Stories e Reels", "Biblioteca de conteúdo", "Publicação social", "Campanhas", "Meta Ads", "Patrocínio de conteúdo", "Segmentação", "Histórico e métricas"],
  },
  {
    title: "Produtos, preços e propostas",
    items: ["Catálogo", "Categorias", "Variações", "Fornecedores", "Estoque", "Insumos", "Composição de custos", "Margens e regras", "Tabelas de preço", "Propostas e orçamentos"],
  },
  {
    title: "Financeiro e monetização",
    items: ["Faturamento", "Contas a receber", "Cobrança", "PIX e cartão", "Conciliação", "Comissões", "Cupons", "Parceiros", "Influenciadores", "Indicadores financeiros"],
  },
  {
    title: "Agenda, tarefas e operação",
    items: ["Agenda inteligente", "Compromissos", "Tarefas", "Lembretes", "Agendamentos automáticos", "Visão por equipe", "Rotinas operacionais", "Alertas e notificações"],
  },
  {
    title: "Sites e presença digital",
    items: ["Sites", "Landing pages", "Formulários", "Captação de leads", "E-commerce", "Páginas de produtos", "Integração com CRM", "Jornadas digitais", "Vídeos e mídia"],
  },
  {
    title: "Projetos, construção e Arqdor.ai",
    items: ["Projetos e ambientes", "Clientes e portal", "Orçamentos por etapa", "Cronogramas", "Materiais e componentes", "Renders com IA", "Revisões e correções", "Memória de projeto", "Marketplace", "Gestão de obras"],
  },
  {
    title: "Dados, analytics e conhecimento",
    items: ["Dashboards", "Relatórios executivos", "Indicadores comerciais", "Indicadores operacionais", "Consumo de IA", "Base de conhecimento", "Documentos", "Regras da empresa", "Jornada do cliente", "Inteligência comportamental"],
  },
  {
    title: "Gestão, segurança e ecossistema",
    items: ["Multiempresa e multitenant", "Usuários e equipes", "Papéis e permissões", "Auditoria", "Proteção de dados", "Vendor Shield", "Licenças e acessos", "Administração central", "APIs e webhooks", "N8N e Typebot"],
  },
];

export default function Funcionalidades() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-white md:py-28">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Uma licença. Experiência completa.</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">O sistema inteligente que conecta toda a empresa.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
            VendorAI é a marca. TAD é o sistema: Tecnologia, Automação e Dados reunidos para captar, atender, vender, executar, gerir e acompanhar toda a empresa em uma única operação.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">Tudo o que o VendorAI TAD entrega</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Uma experiência completa, sem planos reduzidos. Os módulos trabalham conectados e o formato de contratação altera apenas o período de uso.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((mod, idx) => {
            const Icon = mod.icon;
            return (
              <motion.article
                key={mod.id}
                id={mod.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.18 }}
                transition={{ delay: Math.min(idx * 0.04, 0.24) }}
                className="scroll-mt-24 rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{mod.title}</h3>
                <p className="mt-3 min-h-[84px] leading-7 text-slate-600">{mod.desc}</p>
                <ul className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                  {mod.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>



        <section className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Mapa completo do sistema</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">As principais funções, sem esconder nenhuma área</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">O TAD reúne recursos comerciais, operacionais, administrativos e especializados. Cada empresa utiliza a mesma plataforma completa, configurada para sua realidade.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {capabilityGroups.map((group) => (
              <article key={group.title} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-950">{group.title}</h3>
                <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[28px] bg-blue-50 p-8 md:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Benefícios gerados pelo TAD</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">Funções conectadas para gerar resultado real</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map(([title, text]) => (
              <article key={title} className="rounded-2xl border border-blue-100 bg-white p-5">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="mt-4 font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-16 rounded-[28px] bg-slate-950 p-8 text-center text-white md:p-12">
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">Veja o VendorAI TAD completo na sua operação</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">
            Ative seus 5 dias gratuitos, mantenha todas as informações organizadas e escolha depois entre novas ativações ou a licença oficial.
          </p>
          <Button size="lg" className="mt-8 h-14 rounded-xl px-8" asChild>
            <Link href="/demo">Começar meus 5 dias gratuitos</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
