import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = {
  id: string;
  phase: number;
  title: string;
  duration: string;
  icon: React.ElementType;
  color: string;
  description: string;
  actions: string[];
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
      "Enviar link de convite ao e-mail do responsável técnico/administrativo do cliente",
      "Cliente acessa o link, cria senha e confirma o e-mail",
      "Login pela primeira vez — sistema detecta setup pendente e redireciona ao Onboarding",
    ],
    responsible: "ambos",
  },
  {
    id: "2",
    phase: 1,
    title: "Onboarding: Identidade e Cadastro",
    duration: "10 min",
    icon: FileText,
    color: "text-violet-500",
    description:
      "Primeiros 3 passos do wizard de onboarding. Coleta os dados básicos da empresa para alimentar a IA.",
    actions: [
      "Etapa 1 — Nome fantasia, segmento de atuação, upload do logotipo",
      "Etapa 2 — CNPJ/CPF, ano de fundação, responsável, telefone, e-mail comercial, endereço e site",
      "Etapa 3 — Missão, visão, slogan e valores da empresa",
    ],
    tips:
      "Dica: o campo 'Vertical' define quais templates de funil e prompt-padrão serão usados. Escolher o segmento correto é essencial.",
    responsible: "cliente",
  },
  {
    id: "3",
    phase: 1,
    title: "Onboarding: Marca, Produtos e Audiência",
    duration: "15 min",
    icon: Target,
    color: "text-pink-500",
    description:
      "Etapas 4 a 6 do wizard. Define a personalidade da marca, portfólio e perfis de clientes ideais.",
    actions: [
      "Etapa 4 — História da empresa e personalidade da marca (ex: moderno, sério, descontraído)",
      "Etapa 5 — Cadastro de produtos/serviços com nome, descrição e preço",
      "Etapa 6 — Segmentos de audiência: nome do perfil, quem são, dores e motivações (pode adicionar múltiplos perfis)",
    ],
    tips:
      "Dica: quanto mais detalhada a Etapa 6, mais personalizado fica o atendimento automático da IA com cada tipo de lead.",
    responsible: "cliente",
  },
  {
    id: "4",
    phase: 1,
    title: "Onboarding: Concorrentes, Jornada e Canais",
    duration: "15 min",
    icon: Brain,
    color: "text-amber-500",
    description:
      "Etapas 7 a 12 do wizard. Configura análise competitiva, jornada de compra e canais de atendimento.",
    actions: [
      "Etapa 7 — Perfil demográfico (faixa etária, gênero, renda, localização)",
      "Etapa 8 — Concorrentes e análise SWOT (forças, fraquezas, oportunidades, ameaças)",
      "Etapa 9 — Jornada de compra: etapas, tempo de decisão, objeções comuns e motivadores",
      "Etapa 10 — Canais de atendimento ativos (WhatsApp, Instagram, Site, etc.)",
      "Etapa 11 — Processo comercial: tipo de fechamento, ticket médio, ciclo de venda, equipe",
      "Etapa 12 — Tecnologia atual (CRM, ERP) e integrações desejadas",
    ],
    responsible: "cliente",
  },
  {
    id: "5",
    phase: 1,
    title: "Onboarding: IA, FAQ e Conclusão",
    duration: "10 min",
    icon: Bot,
    color: "text-emerald-500",
    description:
      "Etapas 13 a 17. Define métricas, tom de voz, FAQ e ativa os agentes automáticos.",
    actions: [
      "Etapa 13 — Métricas: metas de faturamento, novos clientes, taxa de conversão e NPS",
      "Etapa 14 — Tom de voz, regras de atendimento e perguntas frequentes (FAQ)",
      "Etapa 15 — Links para materiais, manuais e políticas internas",
      "Etapa 16 — Seleção dos agentes IA a ativar (SDR, Closer, Follow-up, Reativação, etc.)",
      "Etapa 17 — Conclusão: IA processa tudo, gera prompts, base de conhecimento e funil padrão",
    ],
    tips:
      "Ao concluir o wizard, a plataforma cria automaticamente: perfil da empresa, prompts dos agentes, artigos na base de conhecimento e o funil de vendas padrão do segmento.",
    responsible: "cliente",
  },
  {
    id: "6",
    phase: 2,
    title: "Conectar WhatsApp via Z-API",
    duration: "15 min",
    icon: MessageCircle,
    color: "text-green-500",
    description:
      "Conecta o número de WhatsApp da empresa para envio e recebimento de mensagens pelos agentes.",
    actions: [
      "Criar uma instância em app.z-api.io e copiar: Instance ID, Token da instância e Client-Token",
      "Acessar Configurações → Integrações (requer senha do usuário master)",
      "Na seção WhatsApp — Z-API, colar as credenciais e salvar",
      "Clicar em 'Testar conexão' para verificar se o WhatsApp está ativo",
      "Clicar em 'Registrar webhook no Z-API' para ativar recebimento automático de mensagens",
    ],
    tips:
      "Atenção: o número do WhatsApp deve estar ativo no celular com a sessão autenticada na Z-API (escanear QR Code no painel da Z-API).",
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
      "Em Configurações → Integrações, copiar o Tenant ID",
      "Gerar um Webhook Secret (botão 'Gerar secret')",
      "No n8n, criar um webhook que receba mensagens do WhatsApp e envie para: POST /api/tenants/{tenantId}/webhooks/whatsapp",
      "Configurar o header X-Webhook-Secret com o secret gerado",
      "Testar enviando uma mensagem de teste para o WhatsApp e verificando se aparece em Conversas",
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
      "A conta Instagram deve ser Profissional (Empresa ou Criador) vinculada a uma Página do Facebook",
      "Em Configurações → Agentes, na seção Instagram, clicar em 'Conectar com Facebook'",
      "Autorizar o acesso à Página e à conta Instagram",
      "Verificar se o username do Instagram aparece como 'Conectado'",
      "Configurar o webhook do Instagram Graph API para apontar para: POST /api/tenants/{tenantId}/webhooks/instagram",
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
      "Acessar Configurações → Agentes",
      "Verificar o prompt de cada agente ativo (SDR, Closer, Follow-up, etc.)",
      "Ajustar tom de voz, regras específicas do negócio ou restrições de atendimento",
      "Definir os limites de mensagens/dia e tokens/mês por agente",
      "Ativar a opção 'Reativação automática por WhatsApp' se desejado",
    ],
    tips:
      "Os prompts gerados pelo onboarding são um ponto de partida. A qualidade aumenta muito com ajustes manuais baseados na realidade do negócio.",
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
      "Acessar Estoque no menu lateral",
      "Adicionar cada produto com nome, descrição, preço e unidade",
      "Verificar se os produtos cadastrados no onboarding já estão listados",
      "Opcional: configurar webhook de sincronização com ERP em Configurações → Integrações",
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
      "Acessar Configurações → Equipe",
      "Inserir o e-mail do vendedor e clicar em 'Gerar convite'",
      "Copiar e enviar o link de convite gerado para o vendedor",
      "O vendedor acessa o link, cria senha e já entra com perfil de vendedor",
      "Repetir para cada membro da equipe",
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
      "Acessar Leads → botão 'Novo Lead' para cadastro manual",
      "Ou usar o botão 'Importar CSV' para importar uma lista (formato: nome, telefone, email, canal)",
      "Verificar se os leads aparecem no Kanban em Negócios",
      "Atribuir um lead a um vendedor para teste",
      "Enviar uma mensagem de teste pelo WhatsApp e verificar se aparece em Conversas",
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
      "Acessar Configurações → Agentes",
      "Clicar em 'Marcar Setup como Concluído'",
      "A autonomia é habilitada 5 dias após a conclusão (período de observação)",
      "Durante os 5 dias, as ações dos agentes ficam como 'pendentes' para aprovação manual",
      "Após o período, os agentes executam automaticamente",
    ],
    tips:
      "O período de 5 dias é uma salvaguarda. Recomendamos monitorar o Painel de Análise durante esse período para validar que os agentes estão se comportando conforme o esperado.",
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
      "Enviar mensagem pelo WhatsApp e verificar se o agente SDR responde automaticamente",
      "Verificar se o lead criado pelo WhatsApp aparece em Leads",
      "Testar envio de proposta pelo módulo Propostas",
      "Confirmar que o Dashboard mostra os KPIs corretamente",
      "Verificar Configurações → Análise IA para confirmar que as análises estão rodando",
      "Revisar limites de tokens/mensagens com o cliente e ajustar se necessário",
      "Documentar credenciais e acessos entregues ao cliente",
    ],
    tips:
      "Recomendamos fazer uma sessão de treinamento de 30-60 min com o responsável do cliente mostrando como usar o Dashboard, Leads, Conversas e Configurações.",
    responsible: "equipe",
  },
];

const PHASES = [
  { id: 1, title: "Configuração Base", color: "bg-blue-500", description: "Onboarding e dados da empresa" },
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
        <div className="border-t px-5 py-4 space-y-3 bg-muted/10">
          <div className="space-y-2">
            {step.actions.map((action, i) => (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{action}</p>
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
                Fluxo executivo completo para ativação de um novo cliente na plataforma
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
