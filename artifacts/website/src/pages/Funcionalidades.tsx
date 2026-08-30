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
];

export default function Funcionalidades() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-white md:py-28">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Uma licença. Experiência completa.</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Toda a operação comercial conectada.</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
            O VendorAI não é apenas um CRM de follow-up. É uma plataforma para captar, atender, vender, comunicar, gerir e acompanhar o cliente durante toda a jornada.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">Funções disponíveis no mesmo sistema</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Todos os usuários acessam os módulos liberados para sua operação. O formato de contratação altera o período de uso, não cria uma versão reduzida do produto.
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

        <div className="mt-16 rounded-[28px] bg-slate-950 p-8 text-center text-white md:p-12">
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">Veja o VendorAI completo na sua operação</h2>
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
