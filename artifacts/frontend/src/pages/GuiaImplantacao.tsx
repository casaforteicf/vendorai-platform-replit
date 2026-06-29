import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Rocket,
  Users,
  Bot,
  MessageCircle,
  Instagram,
  Webhook,
  Brain,
  Settings,
  Package,
  Target,
  FileText,
  Zap,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type StepAction = {
  label: string;
  link?: string;
};

type Step = {
  id: string;
  phase: number;
  title: string;
  duration: string;
  icon: React.ElementType;
  color: string;
  description: string;
  actions: StepAction[];
  tips?: string;
  responsible: "cliente" | "equipe" | "ambos";
};

const STEPS: Step[] = [
  {
    id: "1",
    phase: 1,
    title: "Cadastro e Acesso Inicial",
    duration: "5 min",
    icon: Rocket,
    color: "text-blue-500",
    description:
      "O cliente recebe o link de cadastro ou convite e cria sua conta de administrador na plataforma.",
    actions: [
      { label: "Enviar link de convite ao e-mail do responsável técnico/administrativo do cliente" },
      { label: "Cliente acessa o link, cria senha e confirma o e-mail", link: "/onboarding" },
      { label: "Login pela primeira vez — sistema detecta setup pendente e redireciona ao Onboarding", link: "/onboarding" },
    ],
    responsible: "ambos",
  },
  {
    id: "2",
    phase: 1,
    title: "Identidade e Cadastro da Empresa",
    duration: "10 min",
    icon: FileText,
    color: "text-violet-500",
    description:
      "Dados básicos da empresa para alimentar a IA: nome, segmento, logotipo, contato e identidade institucional.",
    actions: [
      { label: "Nome fantasia, segmento de atuação e upload do logotipo", link: "/configuracoes?tab=perfil" },
      { label: "CNPJ/CPF, ano de fundação, responsável, telefone, e-mail e endereço", link: "/configuracoes?tab=perfil" },
      { label: "Missão, visão, slogan e valores da empresa", link: "/configuracoes?tab=perfil" },
    ],
    tips:
      "Dica: o campo 'Vertical' define quais templates de funil e prompt-padrão serão usados. Escolher o segmento correto é essencial.",
    responsible: "cliente",
  },
  {
    id: "3",
    phase: 1,
    title: "Marca, Produtos e Audiência",
    duration: "15 min",
    icon: Target,
    color: "text-pink-500",
    description:
      "Define a personalidade da marca, portfólio de produtos/serviços e perfis de clientes ideais.",
    actions: [
      { label: "História da empresa e personalidade da marca (ex: moderno, sério, descontraído)", link: "/configuracoes?tab=perfil" },
      { label: "Cadastro de produtos/serviços com nome, descrição e preço", link: "/estoque" },
      { label: "Segmentos de audiência: nome do perfil, quem são, dores e motivações", link: "/configuracoes?tab=perfil" },
    ],
    tips:
      "Dica: quanto mais detalhada a audiência, mais personalizado fica o atendimento automático da IA com cada tipo de lead.",
    responsible: "cliente",
  },
  {
    id: "4",
    phase: 1,
    title: "Concorrentes, Jornada e Canais",
    duration: "15 min",
    icon: Brain,
    color: "text-amber-500",
    description:
      "Configura análise competitiva, jornada de compra e canais de atendimento da empresa.",
    actions: [
      { label: "Perfil demográfico (faixa etária, gênero, renda, localização)", link: "/configuracoes?tab=perfil" },
      { label: "Concorrentes e análise SWOT (forças, fraquezas, oportunidades, ameaças)", link: "/configuracoes?tab=perfil" },
      { label: "Jornada de compra: etapas, tempo de decisão, objeções e motivadores", link: "/configuracoes?tab=perfil" },
      { label: "Canais de atendimento ativos (WhatsApp, Instagram, Site, etc.)", link: "/configuracoes?tab=integracoes" },
      { label: "Processo comercial: tipo de fechamento, ticket médio, ciclo de venda, equipe", link: "/configuracoes?tab=perfil" },
      { label: "Tecnologia atual (CRM, ERP) e integrações desejadas", link: "/configuracoes?tab=integracoes" },
    ],
    responsible: "cliente",
  },
  {
    id: "5",
    phase: 1,
    title: "IA, FAQ e Ativação dos Agentes",
    duration: "10 min",
    icon: Bot,
    color: "text-emerald-500",
    description:
      "Define métricas, tom de voz, FAQ e ativa os agentes automáticos.",
    actions: [
      { label: "Métricas: metas de faturamento, novos clientes e taxa de conversão", link: "/configuracoes?tab=analise" },
      { label: "Tom de voz, regras de atendimento e perguntas frequentes (FAQ)", link: "/agents/config" },
      { label: "Links para materiais, manuais e políticas internas", link: "/configuracoes?tab=perfil" },
      { label: "Seleção dos agentes IA a ativar (SDR, Closer, Follow-up, Reativação, etc.)", link: "/agents/config" },
    ],
    tips:
      "Ao concluir, a plataforma gera prompts, base de conhecimento e funil de vendas padrão do segmento automaticamente.",
    responsible: "cliente",
  },
  {
    id: "6",
    phase: 2,
    title: "Conectar WhatsApp",
    duration: "15 min",
    icon: MessageCircle,
    color: "text-green-500",
    description:
      "Conecta o número de WhatsApp da empresa para envio e recebimento de mensagens pelos agentes.",
    actions: [
      { label: "Acessar o Meta Business Suite e criar um App com produto WhatsApp Business" },
      { label: "Copiar o Phone Number ID e gerar um Token de Acesso Permanente" },
      { label: "Acessar Configurações → Integrações e colar as credenciais Meta Cloud API", link: "/configuracoes?tab=integracoes" },
      { label: "Registrar o webhook '/webhooks/meta/whatsapp' no painel Meta Developers" },
      { label: "Clicar em 'Testar conexão' para verificar se o WhatsApp está ativo", link: "/configuracoes?tab=integracoes" },
    ],
    tips:
      "Atenção: utilize um Token de Acesso Permanente (gerado via conta de sistema no Meta Business) para evitar expiração.",
    responsible: "equipe",
  },
  {
    id: "7",
    phase: 2,
    title: "Configurar Webhook de Entrada",
    duration: "10 min",
    icon: Webhook,
    color: "text-orange-500",
    description:
      "Configura o n8n (ou qualquer gateway) para redirecionar mensagens recebidas do WhatsApp para a plataforma.",
    actions: [
      { label: "Em Configurações → Integrações, copiar o Tenant ID", link: "/configuracoes?tab=integracoes" },
      { label: "Gerar um Webhook Secret (botão 'Gerar secret')", link: "/configuracoes?tab=integracoes" },
      { label: "No n8n, criar um webhook que receba mensagens do WhatsApp e envie para: POST /api/tenants/{tenantId}/webhooks/whatsapp" },
      { label: "Configurar o header X-Webhook-Secret com o secret gerado" },
      { label: "Testar enviando uma mensagem de teste e verificar em Conversas", link: "/conversations" },
    ],
    tips:
      "Estrutura do payload esperado: { telefone, mensagem, nome }. Qualquer campo adicional é ignorado.",
    responsible: "equipe",
  },
  {
    id: "8",
    phase: 2,
    title: "Conectar Instagram (opcional)",
    duration: "15 min",
    icon: Instagram,
    color: "text-pink-600",
    description:
      "Conecta a conta do Instagram da empresa para responder DMs e publicar conteúdo.",
    actions: [
      { label: "A conta Instagram deve ser Profissional (Empresa ou Criador) vinculada a uma Página do Facebook" },
      { label: "Em Configurações → Agentes, na seção Instagram, clicar em 'Conectar com Facebook'", link: "/configuracoes?tab=agentes" },
      { label: "Autorizar o acesso à Página e à conta Instagram", link: "/configuracoes?tab=agentes" },
      { label: "Verificar se o username do Instagram aparece como 'Conectado'", link: "/configuracoes?tab=agentes" },
      { label: "Configurar o webhook do Instagram Graph API em Configurações → Integrações", link: "/configuracoes?tab=integracoes" },
    ],
    responsible: "equipe",
  },
  {
    id: "9",
    phase: 2,
    title: "Revisar Agentes e Prompts",
    duration: "20 min",
    icon: Bot,
    color: "text-indigo-500",
    description:
      "Revisar e ajustar os prompts dos agentes gerados automaticamente pelo onboarding.",
    actions: [
      { label: "Acessar Configurações → Agentes e verificar os agentes ativos", link: "/configuracoes?tab=agentes" },
      { label: "Verificar e ajustar o prompt de cada agente (SDR, Closer, Follow-up, etc.)", link: "/agents/config" },
      { label: "Ajustar tom de voz, regras específicas e restrições de atendimento", link: "/agents/config" },
      { label: "Definir os limites de mensagens/dia e tokens/mês por agente", link: "/agents/config" },
      { label: "Ativar a opção 'Reativação automática por WhatsApp' se desejado", link: "/agents/config" },
    ],
    tips:
      "Os prompts gerados pelo onboarding são um ponto de partida. A qualidade aumenta muito com ajustes manuais.",
    responsible: "equipe",
  },
  {
    id: "10",
    phase: 2,
    title: "Cadastrar Produtos no Catálogo",
    duration: "10 min",
    icon: Package,
    color: "text-teal-500",
    description:
      "Cadastrar os produtos no Estoque para que os agentes possam consultá-los nas conversas.",
    actions: [
      { label: "Acessar Estoque no menu lateral", link: "/estoque" },
      { label: "Adicionar cada produto com nome, descrição, preço e unidade", link: "/estoque" },
      { label: "Verificar se os produtos cadastrados no onboarding já estão listados", link: "/estoque" },
      { label: "Opcional: configurar webhook de sincronização com ERP em Configurações → Integrações", link: "/configuracoes?tab=integracoes" },
    ],
    responsible: "cliente",
  },
  {
    id: "11",
    phase: 3,
    title: "Convidar a Equipe de Vendas",
    duration: "10 min",
    icon: Users,
    color: "text-blue-600",
    description:
      "Adicionar os vendedores ao sistema para que possam acompanhar leads e negócios.",
    actions: [
      { label: "Acessar Configurações → Equipe", link: "/configuracoes?tab=equipe" },
      { label: "Inserir o e-mail do vendedor e clicar em 'Gerar convite'", link: "/configuracoes?tab=equipe" },
      { label: "Copiar e enviar o link de convite gerado para o vendedor" },
      { label: "O vendedor acessa o link, cria senha e já entra com perfil de vendedor" },
      { label: "Repetir para cada membro da equipe", link: "/configuracoes?tab=equipe" },
    ],
    responsible: "cliente",
  },
  {
    id: "12",
    phase: 3,
    title: "Cadastrar os Primeiros Leads",
    duration: "15 min",
    icon: Target,
    color: "text-violet-600",
    description:
      "Importar ou cadastrar manualmente os primeiros leads para validar o fluxo completo.",
    actions: [
      { label: "Acessar Leads → botão 'Novo Lead' para cadastro manual", link: "/leads" },
      { label: "Ou usar o botão 'Importar CSV' para importar uma lista (formato: nome, telefone, email, canal)", link: "/leads" },
      { label: "Verificar se os leads aparecem no Kanban em Negócios", link: "/deals" },
      { label: "Atribuir um lead a um vendedor para teste", link: "/leads" },
      { label: "Enviar uma mensagem de teste pelo WhatsApp e verificar em Conversas", link: "/conversations" },
    ],
    tips:
      "Use 2 a 3 leads de teste reais (membros da equipe) para validar o fluxo completo antes de ativar com leads de clientes.",
    responsible: "equipe",
  },
  {
    id: "13",
    phase: 3,
    title: "Ativar Autonomia dos Agentes",
    duration: "5 min",
    icon: Zap,
    color: "text-yellow-500",
    description:
      "Liberar os agentes para agir autonomamente sem precisar de aprovação manual.",
    actions: [
      { label: "Acessar Configurações → Agentes", link: "/agents/config" },
      { label: "Clicar em 'Marcar Setup como Concluído'", link: "/agents/config" },
      { label: "A autonomia é habilitada 5 dias após a conclusão (período de observação)" },
      { label: "Durante os 5 dias, as ações dos agentes ficam como 'pendentes' para aprovação manual", link: "/agents/config" },
      { label: "Após o período, os agentes executam automaticamente" },
    ],
    tips:
      "Recomendamos monitorar o Painel de Análise durante os 5 dias para validar que os agentes estão se comportando conforme o esperado.",
    responsible: "equipe",
  },
  {
    id: "14",
    phase: 3,
    title: "Validação Final e Entrega",
    duration: "30 min",
    icon: CheckCircle2,
    color: "text-emerald-600",
    description:
      "Testar todo o fluxo end-to-end e documentar o que foi configurado para o cliente.",
    actions: [
      { label: "Enviar mensagem pelo WhatsApp e verificar se o agente SDR responde automaticamente" },
      { label: "Verificar se o lead criado pelo WhatsApp aparece em Leads", link: "/leads" },
      { label: "Testar envio de orçamento pelo módulo Orçamentos", link: "/propostas" },
      { label: "Confirmar que o Dashboard mostra os KPIs corretamente", link: "/dashboard" },
      { label: "Verificar Configurações → Análise IA para confirmar que as análises estão rodando", link: "/configuracoes?tab=analise" },
      { label: "Revisar limites de tokens/mensagens com o cliente e ajustar se necessário", link: "/configuracoes?tab=ai" },
      { label: "Documentar credenciais e acessos entregues ao cliente" },
    ],
    tips:
      "Recomendamos uma sessão de treinamento de 30-60 min com o responsável do cliente mostrando como usar o Dashboard, Leads, Conversas e Configurações.",
    responsible: "equipe",
  },
];

const PHASES = [
  { id: 1, title: "Configuração Base", color: "bg-blue-500", description: "Dados da empresa e ativação da IA" },
  { id: 2, title: "Integrações", color: "bg-orange-500", description: "WhatsApp, Instagram e webhooks" },
  { id: 3, title: "Ativação", color: "bg-emerald-500", description: "Equipe, leads e autonomia" },
];

const RESPONSIBLE_LABELS = {
  cliente: { label: "Cliente", color: "bg-blue-100 text-blue-700" },
  equipe:  { label: "Equipe VendorAI", color: "bg-violet-100 text-violet-700" },
  ambos:   { label: "Cliente + Equipe", color: "bg-amber-100 text-amber-700" },
};

function StepCard({ step, defaultOpen = false }: { step: Step; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [, navigate] = useLocation();
  const Icon = step.icon;
  const responsible = RESPONSIBLE_LABELS[step.responsible];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("shrink-0 rounded-full p-2.5 bg-muted/60", step.color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{step.title}</h3>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", responsible.color)}>
              {responsible.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{step.duration}</span>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t px-5 py-4 space-y-4 bg-muted/10">
          <div className="space-y-2">
            {step.actions.map((action, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                  {i + 1}
                </div>
                {action.link ? (
                  <button
                    onClick={() => navigate(action.link!)}
                    className="flex-1 flex items-start gap-1.5 text-left group"
                  >
                    <span className="text-sm text-primary underline-offset-2 group-hover:underline leading-relaxed">
                      {action.label}
                    </span>
                    <ExternalLink className="shrink-0 h-3.5 w-3.5 text-primary/60 mt-0.5" />
                  </button>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">{action.label}</p>
                )}
              </div>
            ))}
          </div>

          {step.tips && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>💡 {step.tips}</strong>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GuiaImplantacao() {
  const [expandAll, setExpandAll] = useState(false);

  const totalMinutes = STEPS.reduce((acc, s) => {
    const m = parseInt(s.duration);
    return acc + (isNaN(m) ? 0 : m);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Guia de Implantação</h1>
              <p className="text-sm text-muted-foreground">
                Clique em qualquer ação sublinhada para ir direto à tela correspondente
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpandAll((v) => !v)}>
            {expandAll ? "Recolher tudo" : "Expandir tudo"}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{STEPS.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Etapas no total</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold">~{Math.ceil(totalMinutes / 60)}h</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tempo estimado</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold">{PHASES.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Fases de entrega</p>
          </div>
        </div>
      </div>

      {/* Phases */}
      {PHASES.map((phase) => {
        const phaseSteps = STEPS.filter((s) => s.phase === phase.id);
        const phaseMins = phaseSteps.reduce((acc, s) => acc + (parseInt(s.duration) || 0), 0);

        return (
          <div key={phase.id} className="space-y-3">
            {/* Phase header */}
            <div className="flex items-center gap-3">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", phase.color)}>
                {phase.id}
              </div>
              <div>
                <h2 className="font-semibold text-base">
                  Fase {phase.id} — {phase.title}
                </h2>
                <p className="text-xs text-muted-foreground">{phase.description} · ~{phaseMins} min</p>
              </div>
            </div>

            {/* Steps */}
            <div className="ml-4 pl-6 border-l-2 border-muted space-y-3">
              {phaseSteps.map((step, i) => (
                <StepCard key={step.id} step={step} defaultOpen={expandAll || (phase.id === 1 && i === 0)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer note */}
      <div className="rounded-xl border bg-muted/30 p-5 space-y-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Suporte pós-implantação
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Monitorar Configurações → Análise IA nos primeiros 30 dias para calibrar os agentes</li>
          <li>Revisar e ajustar os prompts dos agentes conforme feedback da equipe de vendas</li>
          <li>Verificar os limites de tokens/mensagens mensalmente e ajustar conforme o volume</li>
          <li>Usar Campanhas para ações de reativação de leads inativos</li>
          <li>Consultar o Painel de Análise IA para entender o comportamento dos leads</li>
        </ul>
      </div>
    </div>
  );
}
