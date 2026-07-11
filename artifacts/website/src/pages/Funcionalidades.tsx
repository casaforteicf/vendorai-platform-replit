import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Bot, Target, MessageSquare, BarChart, FileText, 
  CreditCard, Smartphone, Workflow, CheckCircle2 
} from "lucide-react";

export default function Funcionalidades() {
  const modules = [
    {
      id: "crm",
      title: "CRM Completo",
      icon: <Target className="w-6 h-6 text-primary" />,
      desc: "Pipeline visual Kanban com funis personalizáveis. Gestão de leads, negócios, atividades, propostas e histórico completo por contato. Nunca perca um follow-up.",
      features: ["Funis Kanban", "Histórico 360º", "Gestão de Tarefas", "Pipeline Visual"]
    },
    {
      id: "agentes",
      title: "Agentes de IA Autônomos",
      icon: <Bot className="w-6 h-6 text-primary" />,
      desc: "7 agentes trabalhando por você: SDR para prospecção, Closer para negociações, Follow-up, Reativação, Agendador, Atendimento e Onboarding.",
      features: ["Qualificação Automática", "Recuperação de Leads", "Suporte 24/7", "Agendamento Inteligente"]
    },
    {
      id: "omnichannel",
      title: "Omnichannel Unificado",
      icon: <MessageSquare className="w-6 h-6 text-primary" />,
      desc: "WhatsApp Business, Instagram DM, Facebook Messenger, Email e SMS — tudo em uma caixa de entrada unificada. Zero alternância de abas.",
      features: ["WhatsApp Oficial", "Caixa de Entrada Única", "Histórico Centralizado", "Templates Rápidos"]
    },
    {
      id: "intelligence",
      title: "Customer Intelligence",
      icon: <BarChart className="w-6 h-6 text-primary" />,
      desc: "Pontuação de churn preditiva, análise de engajamento, next best action e segmentação automática. Antecipe quem vai cancelar.",
      features: ["Previsão de Churn", "Lead Scoring", "Métricas Avançadas", "Ações Sugeridas"]
    },
    {
      id: "conteudo",
      title: "Conteúdo com IA",
      icon: <FileText className="w-6 h-6 text-primary" />,
      desc: "Geração automática de posts para Instagram (Feed, Stories, Reels), emails de prospecção e mensagens personalizadas.",
      features: ["Posts para Redes", "Emails Frios", "Copywriting", "Personalização"]
    },
    {
      id: "faturamento",
      title: "Faturamento Integrado",
      icon: <CreditCard className="w-6 h-6 text-primary" />,
      desc: "Cobrança por PIX, boleto e cartão (via Asaas). Planos, faturas e régua de cobrança automática — tudo dentro do VendorAI.",
      features: ["PIX Automático", "Gestão de Assinaturas", "Régua de Cobrança", "Conciliação"]
    },
    {
      id: "mobile",
      title: "App Mobile",
      icon: <Smartphone className="w-6 h-6 text-primary" />,
      desc: "Acesse seu CRM, converse com leads e feche negócios direto do celular. Disponível para iOS e Android.",
      features: ["Notificações Push", "Acesso Offline", "Chat em Tempo Real", "Gestão em Trânsito"]
    },
    {
      id: "api",
      title: "Integrações e API",
      icon: <Workflow className="w-6 h-6 text-primary" />,
      desc: "Webhooks, n8n, Zapier e API REST documentada. Conecte qualquer sistema que seu negócio já usa com facilidade.",
      features: ["API REST", "Webhooks", "Zapier / n8n", "Documentação Clara"]
    }
  ];

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-slate-900 py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Funcionalidades que entregam resultados
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Uma plataforma robusta desenhada para eliminar o trabalho manual e focar sua equipe no que importa: vender.
          </p>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="container mx-auto px-4 mt-16">
        <div className="grid md:grid-cols-2 gap-12">
          {modules.map((mod, idx) => (
            <motion.div 
              key={mod.id}
              id={mod.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm scroll-mt-24"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  {mod.icon}
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{mod.title}</h2>
              </div>
              <p className="text-slate-600 mb-8 leading-relaxed">
                {mod.desc}
              </p>
              <ul className="grid grid-cols-2 gap-3">
                {mod.features.map((feat, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-24 text-center bg-slate-50 rounded-3xl p-12 border border-slate-100">
          <h3 className="text-3xl font-bold text-slate-900 mb-4">Veja tudo isso em ação</h3>
          <p className="text-slate-600 mb-8 max-w-xl mx-auto">
            Nossos especialistas estão prontos para montar uma demonstração personalizada para o seu processo comercial.
          </p>
          <Button size="lg" className="h-14 px-8" asChild data-testid="features-btn-demo">
            <Link href="/demo">Experimentar grátis por 5 dias</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
