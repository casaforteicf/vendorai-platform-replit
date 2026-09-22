import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarRange,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSearch,
  Gauge,
  Globe,
  LayoutTemplate,
  Megaphone,
  Newspaper,
  Radar,
  RefreshCcw,
  Route,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePublicCountry } from "@/lib/publicCountry";
import {
  MARKETING_VERTICALS,
  OFFICIAL_TRIAL_5_DAYS,
  type MarketingMacrosegmentKey,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";

const MACROSEGMENTS_PT: Record<
  MarketingMacrosegmentKey,
  { label: string; short: string; description: string }
> = {
  retail: { label: "Lojas e Varejo", short: "Varejo", description: "Venda, recompra e relacionamento com consumidor final." },
  clinics: { label: "Clínicas e Saúde", short: "Clínicas", description: "Atendimento, agenda, retorno e continuidade administrativa." },
  dealerships: { label: "Concessionárias e Automotivo", short: "Automotivo", description: "Lead, avaliação, proposta, test-drive, venda e próxima troca." },
  distributors: { label: "Distribuidoras e Atacado", short: "Distribuição", description: "Carteira, frequência, mix, recompra e share of wallet." },
  services: { label: "Serviços Profissionais", short: "Serviços", description: "Diagnóstico, proposta, follow-up, contrato e expansão." },
  industries: { label: "Indústrias e B2B", short: "Indústrias", description: "Especificação, cotação técnica, negociação e próxima oportunidade." },
};

const MACROSEGMENTS_ES: typeof MACROSEGMENTS_PT = {
  retail: { label: "Tiendas y Retail", short: "Retail", description: "Venta, recompra y relación con el consumidor final." },
  clinics: { label: "Clínicas y Salud", short: "Clínicas", description: "Atención, agenda, retorno y continuidad administrativa." },
  dealerships: { label: "Concesionarias y Automotriz", short: "Automotriz", description: "Lead, evaluación, propuesta, test-drive, venta y próxima renovación." },
  distributors: { label: "Distribuidoras y Mayoristas", short: "Distribución", description: "Cartera, frecuencia, mix, recompra y share of wallet." },
  services: { label: "Servicios Profesionales", short: "Servicios", description: "Diagnóstico, propuesta, seguimiento, contrato y expansión." },
  industries: { label: "Industrias y B2B", short: "Industrias", description: "Especificación, cotización técnica, negociación y próxima oportunidad." },
};

const GROWTH_CYCLE_PT = [
  ["Atrair", "Campanhas, anúncios, conteúdo e LPs"],
  ["Captar", "Origem, campanha, criativo, produto e intenção"],
  ["Converter", "Atendimento, qualificação, agenda e follow-up"],
  ["Vender", "Pipeline, proposta, negociação e fechamento"],
  ["Entregar", "Pedido, projeto, produção, execução ou serviço"],
  ["Fidelizar", "Pós-venda, satisfação, suporte e retorno"],
  ["Expandir", "Revenue Scout, recompra, upsell e cross-sell"],
  ["Aprender", "Marketing e vendas alimentam a memória da IA"],
] as const;

const GROWTH_CYCLE_ES = [
  ["Atraer", "Campañas, anuncios, contenido y LPs"],
  ["Captar", "Origen, campaña, creativo, producto e intención"],
  ["Convertir", "Atención, calificación, agenda y seguimiento"],
  ["Vender", "Pipeline, propuesta, negociación y cierre"],
  ["Entregar", "Pedido, proyecto, producción, ejecución o servicio"],
  ["Fidelizar", "Posventa, satisfacción, soporte y retorno"],
  ["Expandir", "Revenue Scout, recompra, upsell y cross-sell"],
  ["Aprender", "Marketing y ventas alimentan la memoria de la IA"],
] as const;

const AGENT_FLOW_PT = [
  ["SDR IA", "Responde e entende a intenção", "recepcao"],
  ["Qualificação IA", "Identifica contexto e prioridade", "sdr"],
  ["Follow-up IA", "Detecta esfriamento e mantém a próxima ação", "follow-up"],
  ["Closer IA", "Apoia proposta, negociação e decisão", "closer"],
  ["Pós-venda IA", "Continua a jornada depois do fechamento", "pos-venda"],
  ["Revenue Scout", "Procura a próxima oportunidade na carteira", "revenue-scout"],
] as const;

const AGENT_FLOW_ES = [
  ["SDR IA", "Responde y entiende la intención", "recepcao"],
  ["Calificación IA", "Identifica contexto y prioridad", "sdr"],
  ["Follow-up IA", "Detecta enfriamiento y mantiene la próxima acción", "follow-up"],
  ["Closer IA", "Apoya propuesta, negociación y decisión", "closer"],
  ["Posventa IA", "Continúa la jornada después del cierre", "pos-venda"],
  ["Revenue Scout", "Busca la próxima oportunidad en la cartera", "revenue-scout"],
] as const;

const AI_TEAM_PT = [
  ["Prospector", "Encontra oportunidades por sinais reais antes de virar lead."],
  ["SDR", "Atende, entende contexto e qualifica a oportunidade."],
  ["Closer", "Conduz proposta, objeções, negociação e decisão."],
  ["Follow-up", "Mantém a oportunidade viva e executa a próxima ação."],
  ["Agenda", "Marca, confirma e reorganiza compromissos."],
  ["Marketing", "Planeja conteúdo, campanhas e presença digital."],
  ["Financeiro", "Acompanha pagamentos e indicadores comerciais."],
  ["Cobrança", "Atua sobre valores em aberto com contexto do cliente."],
  ["Suporte", "Resolve demandas sem perder histórico e prioridade."],
  ["Pós-venda", "Continua o relacionamento e identifica novas oportunidades."],
] as const;

const AI_TEAM_ES = [
  ["Prospector", "Encuentra oportunidades por señales reales antes de convertirse en lead."],
  ["SDR", "Atiende, entiende el contexto y califica la oportunidad."],
  ["Closer", "Conduce propuesta, objeciones, negociación y decisión."],
  ["Follow-up", "Mantiene viva la oportunidad y ejecuta la próxima acción."],
  ["Agenda", "Agenda, confirma y reorganiza compromisos."],
  ["Marketing", "Planifica contenido, campañas y presencia digital."],
  ["Finanzas", "Acompaña pagos e indicadores comerciales."],
  ["Cobranza", "Actúa sobre valores pendientes con contexto del cliente."],
  ["Soporte", "Resuelve demandas sin perder historial ni prioridad."],
  ["Posventa", "Continúa la relación e identifica nuevas oportunidades."],
] as const;

const HOME_PT = {
  heroBadge: "TAD + agentes especializados + CRM + execução",
  heroTitle: "Sua operação comercial",
  heroAccent: "trabalhando com IA.",
  heroDescription: "Prospecção, atendimento, vendas, marketing, propostas, follow-up, cobrança e pós-venda operando em um único sistema. Os agentes compartilham contexto, registram tudo no CRM e executam a próxima ação.",
  trialCta: "Testar 5 dias grátis",
  howCta: "Ver como funciona",
  heroBenefits: ["Equipe de IA coordenada pelo TAD", "CRM e canais na mesma operação", "5 dias para testar com seu contexto"],
  timelineTitle: "Timeline comercial",
  timelineSubtitle: "Demonstração da jornada do VendorAI",
  operating: "Em operação",
  timelineRows: [
    ["14:02", "Lead entrou pelo Meta", "Novo lead"],
    ["14:02:03", "IA respondeu", "Atendimento"],
    ["14:04", "Necessidade identificada", "Contexto"],
    ["14:06", "Lead qualificado", "Qualificado"],
    ["14:08", "Oportunidade criada", "Pipeline"],
    ["14:45", "Cliente parou de responder", "Lead cooling"],
    ["Dia seguinte", "IA executou follow-up", "Recuperação"],
    ["09:27", "Cliente respondeu", "Retomado"],
    ["09:32", "Próxima ação agendada", "NBA"],
  ],
  opportunityAlive: "Oportunidade continua viva",
  sellerMemory: "Sem depender da memória do vendedor.",
  spinKicker: "A mesma metodologia que nosso SDR usa pra qualificar seu lead",
  spinTitle: "Antes de falar de sistema, vamos falar da sua operação hoje.",
  spinCards: [
    { letter: "S", label: "Situação", color: "text-blue-600 bg-blue-50", title: "Como funciona hoje", desc: "O WhatsApp da empresa é o pessoal de alguém. Contato fica em planilha, agenda ou na cabeça do vendedor. Cada canal — site, Instagram, indicação — chega numa tela diferente." },
    { letter: "P", label: "Problema", color: "text-amber-600 bg-amber-50", title: "O que isso quebra", desc: "Lead que chega às 19h só recebe resposta no dia seguinte — se alguém lembrar. Follow-up depende da memória de quem está ocupado vendendo pra outro cliente." },
    { letter: "I", label: "Implicação", color: "text-red-600 bg-red-50", title: "O que isso custa de verdade", desc: "Cada lead sem resposta rápida é anúncio pago e desperdiçado. Cada follow-up esquecido é venda que ia fechar e esfriou sozinha. No fim do mês, ninguém sabe dizer qual campanha realmente gerou receita." },
    { letter: "N", label: "Necessidade", color: "text-emerald-600 bg-emerald-50", title: "O que precisa mudar", desc: "Não é mais um app pra abrir. É atendimento, follow-up, proposta e dado de campanha rodando no mesmo lugar — com IA fazendo o que humano esquece de fazer, 24 horas por dia." },
  ],
  spinCta: "Resolver isso na minha operação",
  marketsKicker: "Escolha como sua empresa vende",
  marketsTitle: "O site muda porque a operação muda.",
  marketsDescription: "O VendorAI usa os mesmos 50 perfis verticais do produto para explicar uma jornada diferente para cada mercado.",
  vendorFor: "VendorAI para",
  realJourney: "Jornada real desse mercado",
  priorityAgents: "Agentes prioritários",
  scoutLooksFor: "Revenue Scout procura",
  openExperience: "Abrir experiência completa",
  simulateCustomer: "Simular um cliente",
  growthKicker: "Não é uma lista de funcionalidades",
  growthTitle: "Veja a operação inteira trabalhando.",
  growthDescription: "A tecnologia aparece dentro da jornada: cada etapa gera contexto para a próxima, até a venda, o pós-venda e a próxima oportunidade.",
  marketingKicker: "Marketing rodando com IA de verdade",
  marketingTitle: "Enquanto a operação vende, a IA constrói presença digital sozinha.",
  marketingDescription: "Não é um checklist de funcionalidades. São ferramentas que fazem o trabalho de uma agência inteira, rodando dentro do mesmo sistema que já sabe tudo sobre o seu negócio.",
  marketingTools: [
    { icon: Globe, title: "Gerador de Sites com IA", desc: "Descreva sua empresa e a IA monta o site completo — textos, estrutura, SEO e identidade visual — pronto pra publicar em minutos, não em semanas de agência.", cta: "Ver o gerador de sites", slug: "gerador-de-sites" },
    { icon: FileSearch, title: "Análise do seu site atual", desc: "Cole a URL do site que você já tem. A IA audita estrutura, conteúdo e SEO, e aponta exatamente o que está custando visita e conversão.", cta: "Ver como funciona a análise", slug: "analise-de-site" },
    { icon: Newspaper, title: "Content Autopilot", desc: "A IA pesquisa palavras-chave do seu mercado, escreve artigos de blog otimizados pra SEO e publica sozinha, todo dia — sem você abrir uma tela de redação.", cta: "Ver o Content Autopilot", slug: "content-autopilot" },
    { icon: LayoutTemplate, title: "50 landing pages por mercado", desc: "Cada um dos 50 perfis verticais do VendorAI tem sua própria LP, com estrutura de venda SPIN Selling pronta — não é um template genérico reaproveitado.", cta: "Ver as LPs por segmento", slug: "lps-por-vertical" },
    { icon: CalendarRange, title: "Plano de Mídia com IA", desc: "Diagnóstico, canais priorizados com % de orçamento, concorrentes e keywords reais — tudo virando calendário de conteúdo pronto pra publicar.", cta: "Gerar meu plano de mídia", slug: "plano-de-midia" },
  ],
  marketingManagerTitle: "Seu marketing sabe qual anúncio realmente vendeu?",
  marketingManagerDescription: "O VendorAI acompanha a cadeia da campanha até a oportunidade, proposta, venda e receita. A prioridade deixa de ser o clique mais barato e passa a ser o resultado comercial.",
  modes: ["Observador", "Assistido", "Autônomo"],
  level: "Nível",
  campaignComparison: "Comparação de campanhas",
  decisionExample: "Exemplo ilustrativo de decisão",
  campaignA: "Campanha A",
  lowerCpl: "CPL menor",
  campaignADesc: "Gera volume de leads, mas baixa progressão comercial.",
  campaignB: "Campanha B",
  moreRevenue: "Mais receita",
  campaignBDesc: "CPL maior, porém melhor qualificação, mais vendas e maior valor comercial.",
  aiRecommendation: "Recomendação da IA",
  aiRecommendationDesc: "Priorizar a Campanha B e ampliar o teste dentro dos limites definidos, porque a métrica principal é receita — não apenas CPL.",
  selfSellingKicker: "VendorAI vende o VendorAI",
  selfSellingTitle: "A operação comercial deste próprio site roda no VendorAI.",
  selfSellingDesc: "Nenhum número fictício: os totais abaixo vêm direto da nossa própria instância, ao vivo, acompanhando todo lead que chega por este site.",
  leadsTracked: "Leads acompanhados pela IA",
  activeOpportunities: "Oportunidades ativas no pipeline",
  newLeads30: "Novos leads (últimos 30 dias)",
  scoutTitle: "A venda não termina quando o cliente compra.",
  scoutExamples: [
    ["Distribuidora", "Cliente compra A, mas não compra B."],
    ["Seguros", "Possui Auto, mas ainda não possui outra proteção compatível."],
    ["Marcenaria", "Cozinha concluída; outro ambiente pode surgir como próxima oportunidade."],
    ["Concessionária", "Histórico de compra pode indicar futura troca, revisão ou expansão."],
  ],
  calculatorKicker: "Calculadora de Leads Perdidos",
  calculatorTitle: "Quanto da demanda que você já pagou recebe acompanhamento estruturado?",
  calculatorDesc: "A calculadora não promete recuperação. Ela mostra o tamanho da demanda adquirida e quanto dela pode estar passando pelo processo sem follow-up estruturado.",
  fieldLeads: "Leads por mês",
  fieldCpl: "Custo médio por lead (R$)",
  fieldTicket: "Ticket médio (R$)",
  fieldClose: "Taxa atual de fechamento (%)",
  fieldFollowup: "Leads com follow-up estruturado (%)",
  diagnosis: "Diagnóstico",
  acquisitionInvestment: "Investimento de aquisição/mês",
  leadsWithoutFollowup: "Leads sem follow-up estruturado",
  acquisitionAssociated: "Aquisição associada a esses leads",
  currentRevenue: "Receita média atual do funil*",
  calculatorDisclaimer: "*Estimativa matemática com base nos valores informados, não previsão de resultado ou receita recuperável.",
  calculatorCta: "Ver como o VendorAI acompanha essa demanda",
  agentsKicker: "Agentes dentro da jornada",
  agentsTitle: "A IA não aparece como um menu. Ela aparece quando precisa agir.",
  agentsDesc: "Cada agente recebe contexto da etapa anterior e deixa a próxima ação pronta, evitando que atendimento, vendas e pós-venda funcionem como ilhas.",
  stage: "Etapa",
  viewAgent: "Ver agente",
  verticalsKicker: "6 macrosegmentos · 50 mercados",
  verticalsTitle: "Não é “serve para vários segmentos”. É inteligência vertical pronta para começar.",
  verticalsDesc: "Cada mercado recebe linguagem, jornada, pipeline, agentes, LP, Google intents e Revenue Scout próprios — todos conectados à mesma inteligência central.",
  marketsCount: "mercados",
  trialKicker: "5 dias para chegar ao primeiro valor",
  trialTitle: "O trial não é um sistema vazio.",
  trialDesc: "A experiência começa contextualizada para o mercado escolhido e mostra a IA trabalhando antes de pedir uma decisão de compra.",
  trialItems: OFFICIAL_TRIAL_5_DAYS,
  finalKicker: "VendorAI deve vender o VendorAI",
  finalTitle: "Seu próximo lead já pode entrar em uma operação que sabe o que fazer depois.",
  finalDesc: "Campanha, LP, atendimento, qualificação, follow-up, venda, pós-venda, Revenue Scout e aprendizado contínuo na mesma jornada.",
  finalCta: "Simular um cliente",
  plansCta: "Ver planos e condições",
} as const;

const HOME_ES = {
  ...HOME_PT,
  heroBadge: "TAD + agentes especializados + CRM + ejecución",
  heroTitle: "Tu operación comercial",
  heroAccent: "trabajando con IA.",
  heroDescription: "Prospección, atención, ventas, marketing, propuestas, seguimiento, cobranza y posventa operando en un solo sistema. Los agentes comparten contexto, registran todo en el CRM y ejecutan la próxima acción.",
  trialCta: "Probar 5 días gratis",
  howCta: "Ver cómo funciona",
  heroBenefits: ["Equipo de IA coordinado por TAD", "CRM y canales en la misma operación", "5 días para probar con tu contexto"],
  timelineTitle: "Timeline comercial",
  timelineSubtitle: "Demostración de la jornada de VendorAI",
  operating: "En operación",
  timelineRows: [
    ["14:02", "El lead llegó desde Meta", "Nuevo lead"],
    ["14:02:03", "La IA respondió", "Atención"],
    ["14:04", "Necesidad identificada", "Contexto"],
    ["14:06", "Lead calificado", "Calificado"],
    ["14:08", "Oportunidad creada", "Pipeline"],
    ["14:45", "El cliente dejó de responder", "Lead cooling"],
    ["Día siguiente", "La IA ejecutó follow-up", "Recuperación"],
    ["09:27", "El cliente respondió", "Retomado"],
    ["09:32", "Próxima acción agendada", "NBA"],
  ],
  opportunityAlive: "La oportunidad sigue viva",
  sellerMemory: "Sin depender de la memoria del vendedor.",
  spinKicker: "La misma metodología que usa nuestro SDR para calificar tu lead",
  spinTitle: "Antes de hablar del sistema, hablemos de tu operación actual.",
  spinCards: [
    { letter: "S", label: "Situación", color: "text-blue-600 bg-blue-50", title: "Cómo funciona hoy", desc: "El WhatsApp de la empresa suele ser el personal de alguien. Los contactos quedan en planillas, agendas o en la cabeza del vendedor. Cada canal — sitio, Instagram, recomendación — llega a una pantalla diferente." },
    { letter: "P", label: "Problema", color: "text-amber-600 bg-amber-50", title: "Qué se rompe", desc: "Un lead que llega a las 19 h puede recibir respuesta recién al día siguiente, si alguien lo recuerda. El seguimiento depende de la memoria de quien está ocupado vendiendo a otro cliente." },
    { letter: "I", label: "Implicación", color: "text-red-600 bg-red-50", title: "Cuál es el costo real", desc: "Cada lead sin respuesta rápida es inversión en anuncios desperdiciada. Cada seguimiento olvidado es una venta que podía cerrar y se enfrió. Al final del mes, nadie sabe qué campaña realmente generó ingresos." },
    { letter: "N", label: "Necesidad", color: "text-emerald-600 bg-emerald-50", title: "Qué debe cambiar", desc: "No se trata de abrir otra app. Atención, seguimiento, propuesta y datos de campaña deben operar en el mismo lugar, con IA ejecutando lo que una persona puede olvidar, 24 horas al día." },
  ],
  spinCta: "Resolver esto en mi operación",
  marketsKicker: "Elige cómo vende tu empresa",
  marketsTitle: "El sitio cambia porque la operación cambia.",
  marketsDescription: "VendorAI utiliza los mismos 50 perfiles verticales del producto para explicar una jornada diferente para cada mercado.",
  vendorFor: "VendorAI para",
  realJourney: "Jornada real de este mercado",
  priorityAgents: "Agentes prioritarios",
  scoutLooksFor: "Revenue Scout busca",
  openExperience: "Abrir experiencia completa",
  simulateCustomer: "Simular un cliente",
  growthKicker: "No es una lista de funcionalidades",
  growthTitle: "Mira toda la operación trabajando.",
  growthDescription: "La tecnología aparece dentro de la jornada: cada etapa genera contexto para la siguiente, hasta la venta, la posventa y la próxima oportunidad.",
  marketingKicker: "Marketing operando con IA real",
  marketingTitle: "Mientras la operación vende, la IA construye presencia digital automáticamente.",
  marketingDescription: "No es un checklist de funcionalidades. Son herramientas que hacen el trabajo de una agencia completa dentro del mismo sistema que ya conoce tu negocio.",
  marketingTools: [
    { icon: Globe, title: "Generador de Sitios con IA", desc: "Describe tu empresa y la IA crea el sitio completo — textos, estructura, SEO e identidad visual — listo para publicar en minutos, no después de semanas de agencia.", cta: "Ver el generador de sitios", slug: "gerador-de-sites" },
    { icon: FileSearch, title: "Análisis de tu sitio actual", desc: "Pega la URL del sitio que ya tienes. La IA audita estructura, contenido y SEO, e identifica qué puede estar reduciendo visitas y conversiones.", cta: "Ver cómo funciona el análisis", slug: "analise-de-site" },
    { icon: Newspaper, title: "Content Autopilot", desc: "La IA investiga palabras clave de tu mercado, escribe artículos optimizados para SEO y publica automáticamente todos los días.", cta: "Ver Content Autopilot", slug: "content-autopilot" },
    { icon: LayoutTemplate, title: "50 landing pages por mercado", desc: "Cada uno de los 50 perfiles verticales de VendorAI tiene su propia LP con estructura comercial SPIN Selling; no es un template genérico reutilizado.", cta: "Ver las LPs por segmento", slug: "lps-por-vertical" },
    { icon: CalendarRange, title: "Plan de Medios con IA", desc: "Diagnóstico, canales priorizados con porcentaje de presupuesto, competidores y keywords reales, convirtiéndose en un calendario de contenido listo para publicar.", cta: "Generar mi plan de medios", slug: "plano-de-midia" },
  ],
  marketingManagerTitle: "¿Tu marketing sabe qué anuncio realmente vendió?",
  marketingManagerDescription: "VendorAI acompaña la cadena desde la campaña hasta la oportunidad, propuesta, venta e ingresos. La prioridad deja de ser el clic más barato y pasa a ser el resultado comercial.",
  modes: ["Observador", "Asistido", "Autónomo"],
  level: "Nivel",
  campaignComparison: "Comparación de campañas",
  decisionExample: "Ejemplo ilustrativo de decisión",
  campaignA: "Campaña A",
  lowerCpl: "CPL menor",
  campaignADesc: "Genera volumen de leads, pero baja progresión comercial.",
  campaignB: "Campaña B",
  moreRevenue: "Más ingresos",
  campaignBDesc: "CPL mayor, pero mejor calificación, más ventas y mayor valor comercial.",
  aiRecommendation: "Recomendación de la IA",
  aiRecommendationDesc: "Priorizar la Campaña B y ampliar la prueba dentro de los límites definidos, porque la métrica principal es ingreso, no solamente CPL.",
  selfSellingKicker: "VendorAI vende VendorAI",
  selfSellingTitle: "La operación comercial de este sitio funciona dentro de VendorAI.",
  selfSellingDesc: "Sin números ficticios: los totales de abajo vienen directamente de nuestra propia instancia, en vivo, acompañando cada lead que llega por este sitio.",
  leadsTracked: "Leads acompañados por la IA",
  activeOpportunities: "Oportunidades activas en el pipeline",
  newLeads30: "Nuevos leads (últimos 30 días)",
  scoutTitle: "La venta no termina cuando el cliente compra.",
  scoutExamples: [
    ["Distribuidora", "El cliente compra A, pero no compra B."],
    ["Seguros", "Tiene Auto, pero aún no cuenta con otra protección compatible."],
    ["Carpintería", "Cocina concluida; otro ambiente puede convertirse en la próxima oportunidad."],
    ["Concesionaria", "El historial de compra puede indicar futura renovación, revisión o expansión."],
  ],
  calculatorKicker: "Calculadora de Leads Perdidos",
  calculatorTitle: "¿Cuánta demanda que ya pagaste recibe seguimiento estructurado?",
  calculatorDesc: "La calculadora no promete recuperación. Muestra el tamaño de la demanda adquirida y cuánto puede estar atravesando el proceso sin seguimiento estructurado.",
  fieldLeads: "Leads por mes",
  fieldCpl: "Costo medio por lead (BRL)",
  fieldTicket: "Ticket medio (BRL)",
  fieldClose: "Tasa actual de cierre (%)",
  fieldFollowup: "Leads con seguimiento estructurado (%)",
  diagnosis: "Diagnóstico",
  acquisitionInvestment: "Inversión de adquisición/mes",
  leadsWithoutFollowup: "Leads sin seguimiento estructurado",
  acquisitionAssociated: "Adquisición asociada a esos leads",
  currentRevenue: "Ingreso medio actual del embudo*",
  calculatorDisclaimer: "*Estimación matemática basada en los valores informados; no es una previsión de resultados ni de ingresos recuperables.",
  calculatorCta: "Ver cómo VendorAI acompaña esta demanda",
  agentsKicker: "Agentes dentro de la jornada",
  agentsTitle: "La IA no aparece como un menú. Aparece cuando necesita actuar.",
  agentsDesc: "Cada agente recibe el contexto de la etapa anterior y deja preparada la próxima acción, evitando que atención, ventas y posventa funcionen como islas.",
  stage: "Etapa",
  viewAgent: "Ver agente",
  verticalsKicker: "6 macrosegmentos · 50 mercados",
  verticalsTitle: "No es “sirve para varios segmentos”. Es inteligencia vertical lista para empezar.",
  verticalsDesc: "Cada mercado recibe lenguaje, jornada, pipeline, agentes, LP, Google intents y Revenue Scout propios, todos conectados a la misma inteligencia central.",
  marketsCount: "mercados",
  trialKicker: "5 días para llegar al primer valor",
  trialTitle: "La prueba no es un sistema vacío.",
  trialDesc: "La experiencia comienza contextualizada para el mercado elegido y muestra la IA trabajando antes de pedir una decisión de compra.",
  trialItems: [
    { day: 1, label: "Ver la IA trabajar", description: "Recibir o simular un lead usando la jornada del mercado." },
    { day: 2, label: "Automatizar", description: "Atención, calificación, seguimiento y agenda según el mercado." },
    { day: 3, label: "Organizar la venta", description: "Pipeline vertical, lead cooling y Next Best Action." },
    { day: 4, label: "Encontrar ingresos", description: "Revenue Recovered by AI y oportunidades de Revenue Scout." },
    { day: 5, label: "Mostrar resultado", description: "Resumen de leads, acciones, oportunidades e ingresos potenciales." },
  ],
  finalKicker: "VendorAI debe vender VendorAI",
  finalTitle: "Tu próximo lead ya puede entrar en una operación que sabe qué hacer después.",
  finalDesc: "Campaña, LP, atención, calificación, seguimiento, venta, posventa, Revenue Scout y aprendizaje continuo en una misma jornada.",
  finalCta: "Simular un cliente",
  plansCta: "Ver planes y condiciones",
} as const;

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function pickDefaultProfile(): MarketingVerticalProfile {
  return MARKETING_VERTICALS.find((profile) => profile.name.toLowerCase().includes("marcenaria")) ?? MARKETING_VERTICALS[0];
}

export default function Home() {
  const { country, isSpanish } = usePublicCountry();
  const copy = isSpanish ? HOME_ES : HOME_PT;
  const macrosegments = isSpanish ? MACROSEGMENTS_ES : MACROSEGMENTS_PT;
  const growthCycle = isSpanish ? GROWTH_CYCLE_ES : GROWTH_CYCLE_PT;
  const agentFlow = isSpanish ? AGENT_FLOW_ES : AGENT_FLOW_PT;
  const aiTeam = isSpanish ? AI_TEAM_ES : AI_TEAM_PT;
  const defaultProfile = pickDefaultProfile();
  const [macrosegment, setMacrosegment] = useState<MarketingMacrosegmentKey>(defaultProfile.macrosegment);
  const [selectedSlug, setSelectedSlug] = useState(defaultProfile.slug);
  const [leadsPerMonth, setLeadsPerMonth] = useState(300);
  const [cpl, setCpl] = useState(35);
  const [ticket, setTicket] = useState(4000);
  const [closeRate, setCloseRate] = useState(5);
  const [structuredFollowup, setStructuredFollowup] = useState(40);
  const [liveMetrics, setLiveMetrics] = useState<{ leadsAcompanhados: number; oportunidadesAtivas: number; leadsUltimos30dias: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/vendorai-live-metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setLiveMetrics(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const profilesInMacro = useMemo(
    () => MARKETING_VERTICALS.filter((profile) => profile.macrosegment === macrosegment),
    [macrosegment],
  );

  const selectedProfile = MARKETING_VERTICALS.find((profile) => profile.slug === selectedSlug) ?? defaultProfile;
  const withoutStructuredFollowup = Math.max(0, Math.round(leadsPerMonth * (1 - structuredFollowup / 100)));
  const acquisitionInvestment = leadsPerMonth * cpl;
  const acquisitionInvestmentWithoutFollowup = withoutStructuredFollowup * cpl;
  const currentSalesEstimate = Math.max(0, leadsPerMonth * (closeRate / 100));
  const currentRevenueEstimate = currentSalesEstimate * ticket;

  function chooseMacrosegment(key: MarketingMacrosegmentKey) {
    setMacrosegment(key);
    const first = MARKETING_VERTICALS.find((profile) => profile.macrosegment === key);
    if (first) setSelectedSlug(first.slug);
  }

  return (
    <div className="bg-white text-slate-950" lang={country.locale}>
      <section className="relative overflow-hidden border-b border-white/10 bg-[#070b14] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(249,115,22,0.22),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(251,146,60,0.15),transparent_30%),linear-gradient(180deg,#0a1020_0%,#070b14_76%)]" />
        <div className="container relative mx-auto grid min-h-[760px] items-center gap-14 px-4 py-20 lg:grid-cols-[1.03fr_.97fr] lg:py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-200">
              <Sparkles className="h-4 w-4" /> {copy.heroBadge}
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[80px]">
              {copy.heroTitle}
              <span className="block bg-gradient-to-r from-orange-300 via-orange-400 to-amber-300 bg-clip-text text-transparent">{copy.heroAccent}</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">{copy.heroDescription}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-xl bg-orange-500 px-7 text-base font-semibold text-white shadow-[0_16px_55px_rgba(249,115,22,0.28)] hover:bg-orange-400">
                <Link href="/demo">{copy.trialCta} <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-xl border-white/15 bg-white/[0.04] px-7 text-base text-white hover:bg-white/[0.09] hover:text-white">
                <Link href="/funcionalidades">{copy.howCta}</Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              {copy.heroBenefits.map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> {item}</span>)}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.08 }} className="relative">
            <div className="absolute -inset-10 rounded-[48px] bg-blue-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div><p className="text-sm font-semibold">{copy.timelineTitle}</p><p className="text-xs text-slate-500">{copy.timelineSubtitle}</p></div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> {copy.operating}</div>
              </div>
              <div className="space-y-1 p-5">
                {copy.timelineRows.map(([time, text, status], index) => (
                  <motion.div key={`${time}-${text}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + index * 0.06 }} className="grid grid-cols-[82px_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-3 py-3 hover:border-white/[0.07] hover:bg-white/[0.03]">
                    <span className="text-xs font-semibold text-blue-300">{time}</span><span className="text-sm text-slate-200">{text}</span><span className="hidden rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400 sm:block">{status}</span>
                  </motion.div>
                ))}
              </div>
              <div className="border-t border-white/10 bg-emerald-400/[0.06] px-5 py-4"><div className="flex items-center gap-3"><RefreshCcw className="h-5 w-5 text-emerald-300" /><div><p className="text-sm font-medium text-emerald-100">{copy.opportunityAlive}</p><p className="text-xs text-slate-500">{copy.sellerMemory}</p></div></div></div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-[#fffaf5] py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">{isSpanish ? "UNA EQUIPO, NO AGENTES AISLADOS" : "UMA EQUIPE, NÃO AGENTES ISOLADOS"}</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
              {isSpanish ? "Conoce al equipo que opera tu ciclo comercial." : "Conheça a equipe que opera seu ciclo comercial."}
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              {isSpanish
                ? "TAD coordina especialistas que comparten contexto, trabajan dentro del mismo CRM y pasan la oportunidad de una etapa a la siguiente."
                : "O TAD coordena especialistas que compartilham contexto, trabalham dentro do mesmo CRM e passam a oportunidade de uma etapa para a seguinte."}
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {aiTeam.map(([name, role], index) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: index * 0.035 }}
                className="rounded-[22px] border border-orange-100 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.05)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Bot className="h-5 w-5" /></div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{role}</p>
              </motion.div>
            ))}
          </div>

          <div className="mx-auto mt-12 max-w-6xl overflow-hidden rounded-[30px] border border-slate-200 bg-slate-950 p-6 text-white md:p-8">
            <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
                  <Sparkles className="h-4 w-4" /> TAD
                </div>
                <h3 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
                  {isSpanish ? "El cerebro que coordina toda la operación." : "O cérebro que coordena toda a operação."}
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  {isSpanish
                    ? "El cliente no necesita elegir qué IA usar. TAD entiende la intención, activa al especialista correcto y mantiene el historial dentro de Vendor CRM."
                    : "O cliente não precisa escolher qual IA usar. O TAD entende a intenção, aciona o especialista certo e mantém o histórico dentro do Vendor CRM."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [isSpanish ? "Inteligencia" : "Inteligência", "Prospector · Revenue Scout · CIH · Observador"],
                  ["Comercial", "SDR · Closer · Follow-up · Agenda · Propostas"],
                  [isSpanish ? "Relación" : "Relacionamento", isSpanish ? "Soporte · Posventa · Finanzas · Cobranza" : "Suporte · Pós-venda · Financeiro · Cobrança"],
                  [isSpanish ? "Canales" : "Canais", "WhatsApp · Instagram · Facebook · E-mail · Google · Web"],
                ].map(([title, items]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-300">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{items}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 border-t border-white/10 pt-5 text-sm text-slate-400">
              {isSpanish
                ? "Señal → Prospector → CRM → SDR → Closer → Propuesta → Venta → Finanzas → Posventa → Nueva oportunidad"
                : "Sinal → Prospector → CRM → SDR → Closer → Proposta → Venda → Financeiro → Pós-venda → Nova oportunidade"}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.spinKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">{copy.spinTitle}</h2></div>
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2 xl:grid-cols-4">
            {copy.spinCards.map((item) => <div key={item.letter} className="rounded-[24px] border border-slate-200 bg-white p-6"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold ${item.color}`}>{item.letter}</div><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</p><h3 className="mt-2 text-lg font-semibold text-slate-950">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p></div>)}
          </div>
          <div className="mt-10 text-center"><Button asChild size="lg" className="h-14 rounded-xl px-8"><Link href="/demo">{copy.spinCta} <ArrowRight className="ml-2 h-5 w-5" /></Link></Button></div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50 py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.marketsKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.marketsTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{copy.marketsDescription}</p></div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {(Object.keys(macrosegments) as MarketingMacrosegmentKey[]).map((key) => <button key={key} type="button" onClick={() => chooseMacrosegment(key)} className={`rounded-full border px-4 py-2 text-sm font-medium transition ${macrosegment === key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"}`}>{macrosegments[key].short}</button>)}
          </div>
          <div className="mx-auto mt-8 grid max-w-6xl gap-5 lg:grid-cols-[.78fr_1.22fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{macrosegments[macrosegment].label}</p><p className="mt-2 text-sm text-slate-500">{macrosegments[macrosegment].description}</p>
              <div className="mt-5 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {profilesInMacro.map((profile) => <button key={profile.id} type="button" onClick={() => setSelectedSlug(profile.slug)} className={`w-full rounded-xl border p-3 text-left transition ${selectedProfile.slug === profile.slug ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}><p className="text-sm font-semibold text-slate-900">{profile.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{profile.corePain}</p></button>)}
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{copy.vendorFor} {selectedProfile.name}</p><h3 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{selectedProfile.lp.headline}</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{selectedProfile.lp.subheadline}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedProfile.audience}</span></div>
              <div className="mt-7"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><Route className="h-4 w-4 text-blue-600" /> {copy.realJourney}</div><div className="flex flex-wrap gap-2">{selectedProfile.journey.map((step, index) => <div key={`${step}-${index}`} className="flex items-center gap-2"><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{step}</span>{index < selectedProfile.journey.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}</div>)}</div></div>
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-blue-600" /> {copy.priorityAgents}</div><div className="mt-3 flex flex-wrap gap-2">{selectedProfile.priorityAgents.map((agent) => <span key={agent} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">{agent}</span>)}</div></div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-950"><Radar className="h-4 w-4 text-emerald-600" /> {copy.scoutLooksFor}</div><div className="mt-3 space-y-2">{selectedProfile.revenueScout.signals.slice(0, 4).map((signal) => <div key={signal} className="flex items-start gap-2 text-xs leading-5 text-emerald-900/75"><Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {signal}</div>)}</div></div>
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button asChild className="rounded-xl"><Link href={`/lp/${selectedProfile.slug}`}>{copy.openExperience} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline" className="rounded-xl"><Link href="/demo">{copy.simulateCustomer}</Link></Button></div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28"><div className="container mx-auto px-4"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.growthKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.growthTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{copy.growthDescription}</p></div><div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">{growthCycle.map(([title, description], index) => <motion.div key={title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ delay: index * 0.05 }} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{String(index + 1).padStart(2, "0")}</div><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></motion.div>)}</div></div></section>

      <section className="bg-slate-950 py-20 text-white md:py-28"><div className="container mx-auto px-4"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{copy.marketingKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.marketingTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-400">{copy.marketingDescription}</p></div><div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">{copy.marketingTools.map((item) => <motion.div key={item.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} className="rounded-[26px] border border-white/10 bg-white/[0.04] p-7"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300"><item.icon className="h-5 w-5" /></div><h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{item.title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{item.desc}</p><Link href={`/funcionalidades/${item.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 hover:text-blue-200">{item.cta} <ArrowRight className="h-3.5 w-3.5" /></Link></motion.div>)}</div></div></section>

      <section className="bg-[#090f1b] py-20 text-white md:py-28"><div className="container mx-auto px-4"><div className="grid items-center gap-12 lg:grid-cols-2"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">AI Marketing Manager</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.marketingManagerTitle}</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{copy.marketingManagerDescription}</p><div className="mt-8 grid gap-3 sm:grid-cols-3">{copy.modes.map((mode, index) => <div key={mode} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{copy.level} {index + 1}</p><p className="mt-1 font-semibold">{mode}</p></div>)}</div></div><div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-sm font-semibold">{copy.campaignComparison}</p><p className="text-xs text-slate-500">{copy.decisionExample}</p></div><Gauge className="h-5 w-5 text-blue-300" /></div><div className="mt-5 space-y-4"><div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5"><div className="flex items-center justify-between"><span className="font-semibold">{copy.campaignA}</span><span className="text-xs text-slate-500">{copy.lowerCpl}</span></div><p className="mt-2 text-sm text-slate-400">{copy.campaignADesc}</p></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-5"><div className="flex items-center justify-between"><span className="font-semibold text-emerald-100">{copy.campaignB}</span><span className="text-xs text-emerald-300">{copy.moreRevenue}</span></div><p className="mt-2 text-sm text-slate-300">{copy.campaignBDesc}</p></div><div className="rounded-2xl border border-blue-400/20 bg-blue-400/[0.08] p-5"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" /><div><p className="text-sm font-semibold text-blue-100">{copy.aiRecommendation}</p><p className="mt-1 text-sm leading-6 text-slate-300">{copy.aiRecommendationDesc}</p></div></div></div></div></div></div></div></section>

      <section className="py-20 md:py-28"><div className="container mx-auto px-4"><div className="grid gap-8 lg:grid-cols-2"><div className="rounded-[30px] border border-slate-200 bg-slate-50 p-7 md:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100"><CircleDollarSign className="h-6 w-6 text-blue-700" /></div><p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-blue-600">{copy.selfSellingKicker}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">{copy.selfSellingTitle}</h2><p className="mt-4 text-sm leading-7 text-slate-600">{copy.selfSellingDesc}</p><div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{copy.leadsTracked}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.leadsAcompanhados : "—"}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{copy.activeOpportunities}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.oportunidadesAtivas : "—"}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{copy.newLeads30}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.leadsUltimos30dias : "—"}</p></div></div></div><div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 md:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100"><Radar className="h-6 w-6 text-emerald-700" /></div><p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Revenue Scout</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">{copy.scoutTitle}</h2><div className="mt-6 space-y-3">{copy.scoutExamples.map(([market, example]) => <div key={market} className="rounded-2xl border border-emerald-200 bg-white/70 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{market}</p><p className="mt-1 text-sm text-slate-700">{example}</p></div>)}</div></div></div></div></section>

      <section className="border-y border-slate-200 bg-slate-50 py-20 md:py-28"><div className="container mx-auto px-4"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.calculatorKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.calculatorTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{copy.calculatorDesc}</p></div><div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[1fr_.9fr]"><div className="rounded-[26px] border border-slate-200 bg-white p-6 md:p-8"><div className="grid gap-5 sm:grid-cols-2">{[[copy.fieldLeads, leadsPerMonth, setLeadsPerMonth, "300"],[copy.fieldCpl, cpl, setCpl, "35"],[copy.fieldTicket, ticket, setTicket, "4000"],[copy.fieldClose, closeRate, setCloseRate, "5"],[copy.fieldFollowup, structuredFollowup, setStructuredFollowup, "40"]].map(([label, value, setter, placeholder]) => <label key={String(label)} className="space-y-2"><span className="text-sm font-medium text-slate-700">{String(label)}</span><Input type="number" min="0" value={Number(value)} placeholder={String(placeholder)} onChange={(event) => (setter as (value: number) => void)(Math.max(0, Number(event.target.value) || 0))} /></label>)}</div></div><div className="rounded-[26px] bg-[#0b1220] p-6 text-white md:p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">{copy.diagnosis}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{copy.acquisitionInvestment}</p><p className="mt-2 text-2xl font-semibold">{money(acquisitionInvestment, country.locale)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{copy.leadsWithoutFollowup}</p><p className="mt-2 text-2xl font-semibold">{withoutStructuredFollowup}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{copy.acquisitionAssociated}</p><p className="mt-2 text-2xl font-semibold">{money(acquisitionInvestmentWithoutFollowup, country.locale)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">{copy.currentRevenue}</p><p className="mt-2 text-2xl font-semibold">{money(currentRevenueEstimate, country.locale)}</p></div></div><p className="mt-4 text-[11px] leading-5 text-slate-500">{copy.calculatorDisclaimer}</p><Button asChild className="mt-6 w-full rounded-xl bg-blue-500 hover:bg-blue-400"><Link href="/demo">{copy.calculatorCta}</Link></Button></div></div></div></section>

      <section className="py-20 md:py-28"><div className="container mx-auto px-4"><div className="grid items-start gap-12 lg:grid-cols-[.82fr_1.18fr]"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.agentsKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.agentsTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{copy.agentsDesc}</p></div><div className="grid gap-3 sm:grid-cols-2">{agentFlow.map(([agent, role, slug], index) => <Link key={agent} href={`/agentes/${slug}`} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:border-blue-300"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Bot className="h-4 w-4" /></div><div><p className="text-xs text-slate-400">{copy.stage} {index + 1}</p><p className="font-semibold">{agent}</p></div></div><p className="mt-3 text-sm leading-6 text-slate-500">{role}</p><p className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-600">{copy.viewAgent} <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" /></p></Link>)}</div></div></div></section>

      <section className="bg-slate-950 py-20 text-white md:py-28"><div className="container mx-auto px-4"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{copy.verticalsKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.verticalsTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-400">{copy.verticalsDesc}</p></div><div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">{(Object.keys(macrosegments) as MarketingMacrosegmentKey[]).map((key) => { const profiles = MARKETING_VERTICALS.filter((profile) => profile.macrosegment === key); return <Link key={key} href={`/segmentos/${key}`} className="group rounded-[24px] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-blue-400/30 hover:bg-white/[0.06]"><div className="flex items-center justify-between"><div><p className="text-lg font-semibold">{macrosegments[key].label}</p><p className="mt-1 text-sm text-slate-500">{profiles.length} {copy.marketsCount}</p></div><ArrowRight className="h-5 w-5 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-300" /></div><div className="mt-5 flex flex-wrap gap-2">{profiles.slice(0, 5).map((profile) => <span key={profile.id} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">{profile.name}</span>)}{profiles.length > 5 && <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-500">+{profiles.length - 5}</span>}</div></Link>; })}</div></div></section>

      <section className="py-20 md:py-28"><div className="container mx-auto px-4"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.trialKicker}</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.trialTitle}</h2><p className="mt-5 text-lg leading-8 text-slate-600">{copy.trialDesc}</p></div><div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-5">{copy.trialItems.map((item) => <div key={item.day} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{item.day}</div><p className="mt-5 font-semibold">{item.label}</p><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p></div>)}</div><div className="mt-10 text-center"><Button asChild size="lg" className="h-14 rounded-xl px-8"><Link href="/demo">{copy.trialCta} <ArrowRight className="ml-2 h-5 w-5" /></Link></Button></div></div></section>

      <section className="px-4 pb-20 md:pb-28"><div className="container mx-auto overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 py-14 text-white shadow-[0_35px_100px_rgba(37,99,235,0.28)] md:px-12 md:py-16"><div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">{copy.finalKicker}</p><h2 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{copy.finalTitle}</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-blue-100">{copy.finalDesc}</p></div><div className="flex flex-col gap-3"><Button asChild size="lg" className="h-14 rounded-xl bg-white px-7 text-blue-700 hover:bg-blue-50"><Link href="/demo">{copy.finalCta} <ArrowRight className="ml-2 h-5 w-5" /></Link></Button><Link href="/precos" className="text-center text-sm text-blue-100 hover:text-white">{copy.plansCta}</Link></div></div></div></section>
    </div>
  );
}
