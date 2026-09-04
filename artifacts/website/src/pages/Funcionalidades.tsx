import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart3, Bot, Boxes, BrainCircuit, CalendarDays, CheckCircle2,
  CreditCard, FileText, Megaphone, MessageSquare, PackageSearch,
  Target, UsersRound, Workflow,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const modulesBase = [
  { id: "crm", title: "CRM e Pipeline Comercial", icon: Target, desc: "Organize leads, contatos, negócios, atividades, propostas e todo o histórico comercial em funis visuais adaptados à sua operação.", features: ["Leads e contatos", "Pipeline Kanban", "Tarefas e follow-ups", "Propostas e histórico"] },
  { id: "agentes", title: "Equipe de Agentes de IA", icon: Bot, desc: "Agentes especializados atuam em diferentes momentos da jornada, preservando contexto e seguindo as regras comerciais da empresa.", features: ["SDR e qualificação", "Closer e negociação", "Follow-up e reativação", "Suporte e pós-venda"] },
  { id: "omnichannel", title: "Conversas Omnichannel", icon: MessageSquare, desc: "Centralize conversas e dados dos canais conectados para que pessoas e agentes de IA trabalhem sobre o mesmo histórico.", features: ["WhatsApp oficial", "Instagram profissional", "Facebook Messenger", "Caixa de entrada unificada"] },
  { id: "intelligence", title: "Inteligência do Cliente", icon: BrainCircuit, desc: "Transforme comportamento, intenção e histórico em prioridades claras para a equipe comercial agir no momento certo.", features: ["Lead scoring", "Risco de churn", "Próxima melhor ação", "Segmentação inteligente"] },
  { id: "prospeccao", title: "Prospecção e Revenue Scout", icon: PackageSearch, desc: "Encontre oportunidades, organize aprovações e aplique regras comerciais para direcionar a prospecção com mais precisão.", features: ["Prospector inteligente", "Aprovação de contatos", "Regras por operação", "Relatórios de oportunidades"] },
  { id: "conteudo", title: "Conteúdo e Redes Sociais", icon: FileText, desc: "Crie conteúdo com IA, organize variações em uma biblioteca e publique nos canais conectados sem perder o vínculo com a estratégia comercial.", features: ["Feed, Stories e Reels", "Biblioteca de conteúdo", "Publicação no Instagram", "Textos e imagens com IA"] },
  { id: "campanhas", title: "Campanhas e Anúncios", icon: Megaphone, desc: "Planeje campanhas, reutilize conteúdos aprovados e acompanhe ações de divulgação dentro da mesma operação comercial.", features: ["Campanhas segmentadas", "Conteúdo patrocinável", "Integração Meta Ads", "Histórico das ações"] },
  { id: "agenda", title: "Agenda Inteligente", icon: CalendarDays, desc: "Conecte tarefas, compromissos, retornos comerciais e agendamentos aos leads e negócios correspondentes.", features: ["Compromissos e tarefas", "Lembretes comerciais", "Agendamento por agentes", "Visão da equipe"] },
  { id: "catalogo", title: "Catálogo, Estoque e Propostas", icon: Boxes, desc: "Cadastre produtos, categorias, fornecedores, insumos e regras de preço para criar propostas coerentes com a realidade do negócio.", features: ["Catálogo de produtos", "Estoque e fornecedores", "Composição de preços", "Propostas comerciais"] },
  { id: "financeiro", title: "Financeiro e Cobrança", icon: CreditCard, desc: "Acompanhe faturamento, cobranças, comissões e conciliação, com meios de pagamento integrados conforme a configuração da empresa.", features: ["PIX e cartão", "Faturas e cobrança", "Comissões", "Conciliação financeira"] },
  { id: "gestao", title: "Analytics e Gestão Executiva", icon: BarChart3, desc: "Acompanhe o desempenho da operação com painéis, relatórios e indicadores comerciais, financeiros e de uso da IA.", features: ["Dashboards", "Relatórios gerenciais", "Indicadores comerciais", "Consumo de IA"] },
  { id: "conhecimento", title: "Base de Conhecimento", icon: Workflow, desc: "Centralize informações, documentos e regras para orientar agentes de IA e manter respostas alinhadas ao negócio.", features: ["Documentos e informações", "Regras da empresa", "Contexto para agentes", "Integrações e webhooks"] },
  { id: "equipe", title: "Equipes, Parceiros e Comissões", icon: UsersRound, desc: "Gerencie usuários, vendedores, parceiros e influenciadores, vinculando indicações, cupons e comissões à origem correta.", features: ["Usuários e permissões", "Parceiros e indicados", "Cupons de desconto", "Comissões variáveis"] },
  { id: "sites", title: "Sites, Landing Pages e E-commerce", icon: Workflow, desc: "Crie presença digital conectada à operação, capturando oportunidades diretamente para o CRM e acompanhando toda a conversão.", features: ["Sites e páginas", "Formulários e captação", "E-commerce", "Integração com o CRM"] },
  { id: "projetos", title: "Projetos, Obras e Arqdor.ai", icon: Boxes, desc: "Gerencie projetos, ambientes, orçamentos, clientes e execução, com recursos de arquitetura, renderização e portal do cliente.", features: ["Gestão de projetos", "Orçamentos e etapas", "Renders com IA", "Portal do cliente"] },
  { id: "automacoes", title: "Automações e Integrações", icon: Workflow, desc: "Conecte eventos, sistemas e rotinas para reduzir digitação, atrasos e tarefas repetitivas em toda a empresa.", features: ["Fluxos automáticos", "Webhooks e APIs", "N8N e Typebot", "Alertas e notificações"] },
  { id: "governanca", title: "Administração e Segurança", icon: BrainCircuit, desc: "Controle empresas, usuários, acessos, permissões, licenças, auditoria e isolamento das informações entre operações.", features: ["Multiempresa", "Papéis e permissões", "Auditoria e proteção", "Gestão de licenças"] },
  { id: "verticais", title: "Operações Especializadas", icon: PackageSearch, desc: "Adapte processos, painéis, agentes e regras para construção, arquitetura, distribuição, varejo, serviços e outros segmentos.", features: ["Regras por segmento", "Módulos configuráveis", "Agentes especializados", "Visões operacionais"] },
];

const MODULES_ES: Record<string, { title: string; desc: string; features: string[] }> = {
  crm: { title: "CRM y Pipeline Comercial", desc: "Organiza leads, contactos, negocios, actividades, propuestas y todo el historial comercial en embudos visuales adaptados a tu operación.", features: ["Leads y contactos", "Pipeline Kanban", "Tareas y follow-ups", "Propuestas e historial"] },
  agentes: { title: "Equipo de Agentes de IA", desc: "Agentes especializados actúan en diferentes momentos de la jornada, preservando contexto y siguiendo las reglas comerciales de la empresa.", features: ["SDR y calificación", "Closer y negociación", "Follow-up y reactivación", "Soporte y posventa"] },
  omnichannel: { title: "Conversaciones Omnichannel", desc: "Centraliza conversaciones y datos de los canales conectados para que personas y agentes de IA trabajen sobre el mismo historial.", features: ["WhatsApp oficial", "Instagram profesional", "Facebook Messenger", "Bandeja de entrada unificada"] },
  intelligence: { title: "Inteligencia del Cliente", desc: "Convierte comportamiento, intención e historial en prioridades claras para que el equipo comercial actúe en el momento adecuado.", features: ["Lead scoring", "Riesgo de churn", "Próxima mejor acción", "Segmentación inteligente"] },
  prospeccao: { title: "Prospección y Revenue Scout", desc: "Encuentra oportunidades, organiza aprobaciones y aplica reglas comerciales para orientar la prospección con mayor precisión.", features: ["Prospector inteligente", "Aprobación de contactos", "Reglas por operación", "Informes de oportunidades"] },
  conteudo: { title: "Contenido y Redes Sociales", desc: "Crea contenido con IA, organiza variaciones en una biblioteca y publica en los canales conectados sin perder el vínculo con la estrategia comercial.", features: ["Feed, Stories y Reels", "Biblioteca de contenido", "Publicación en Instagram", "Textos e imágenes con IA"] },
  campanhas: { title: "Campañas y Anuncios", desc: "Planifica campañas, reutiliza contenidos aprobados y acompaña acciones de difusión dentro de la misma operación comercial.", features: ["Campañas segmentadas", "Contenido promocionable", "Integración Meta Ads", "Historial de acciones"] },
  agenda: { title: "Agenda Inteligente", desc: "Conecta tareas, compromisos, retornos comerciales y citas con los leads y negocios correspondientes.", features: ["Compromisos y tareas", "Recordatorios comerciales", "Agenda por agentes", "Vista del equipo"] },
  catalogo: { title: "Catálogo, Inventario y Propuestas", desc: "Registra productos, categorías, proveedores, insumos y reglas de precio para crear propuestas coherentes con la realidad del negocio.", features: ["Catálogo de productos", "Inventario y proveedores", "Composición de precios", "Propuestas comerciales"] },
  financeiro: { title: "Finanzas y Cobranza", desc: "Acompaña facturación, cobros, comisiones y conciliación con medios de pago integrados según la configuración de la empresa.", features: ["PIX y tarjeta", "Facturas y cobranza", "Comisiones", "Conciliación financiera"] },
  gestao: { title: "Analytics y Gestión Ejecutiva", desc: "Acompaña el desempeño de la operación con paneles, informes e indicadores comerciales, financieros y de uso de IA.", features: ["Dashboards", "Informes gerenciales", "Indicadores comerciales", "Consumo de IA"] },
  conhecimento: { title: "Base de Conocimiento", desc: "Centraliza información, documentos y reglas para orientar a los agentes de IA y mantener respuestas alineadas al negocio.", features: ["Documentos e información", "Reglas de la empresa", "Contexto para agentes", "Integraciones y webhooks"] },
  equipe: { title: "Equipos, Socios y Comisiones", desc: "Gestiona usuarios, vendedores, socios e influencers vinculando referidos, cupones y comisiones con el origen correcto.", features: ["Usuarios y permisos", "Socios y referidos", "Cupones de descuento", "Comisiones variables"] },
  sites: { title: "Sitios, Landing Pages y E-commerce", desc: "Crea presencia digital conectada a la operación, captando oportunidades directamente en el CRM y acompañando toda la conversión.", features: ["Sitios y páginas", "Formularios y captación", "E-commerce", "Integración con CRM"] },
  projetos: { title: "Proyectos, Obras y Arqdor.ai", desc: "Gestiona proyectos, ambientes, presupuestos, clientes y ejecución con recursos de arquitectura, renderizado y portal del cliente.", features: ["Gestión de proyectos", "Presupuestos y etapas", "Renders con IA", "Portal del cliente"] },
  automacoes: { title: "Automatizaciones e Integraciones", desc: "Conecta eventos, sistemas y rutinas para reducir digitación, atrasos y tareas repetitivas en toda la empresa.", features: ["Flujos automáticos", "Webhooks y APIs", "N8N y Typebot", "Alertas y notificaciones"] },
  governanca: { title: "Administración y Seguridad", desc: "Controla empresas, usuarios, accesos, permisos, licencias, auditoría y aislamiento de información entre operaciones.", features: ["Multiempresa", "Roles y permisos", "Auditoría y protección", "Gestión de licencias"] },
  verticais: { title: "Operaciones Especializadas", desc: "Adapta procesos, paneles, agentes y reglas para construcción, arquitectura, distribución, retail, servicios y otros segmentos.", features: ["Reglas por segmento", "Módulos configurables", "Agentes especializados", "Vistas operativas"] },
};

const benefitsBase = [
  ["Mais vendas", "Oportunidades priorizadas, atendidas e acompanhadas até o fechamento."],
  ["Resposta mais rápida", "Canais e agentes trabalhando com o mesmo contexto do cliente."],
  ["Menos trabalho manual", "Rotinas, alertas, follow-ups e tarefas executados automaticamente."],
  ["Decisões melhores", "Dados comerciais, financeiros e operacionais transformados em indicadores."],
  ["Menos perdas", "Histórico centralizado, controle de churn, duplicidades e oportunidades esquecidas."],
  ["Mais produtividade", "Equipe concentrada em decisões e relacionamento, não em tarefas repetitivas."],
  ["Gestão centralizada", "Clientes, produtos, projetos, campanhas, finanças e equipes no mesmo ambiente."],
  ["Crescimento organizado", "Processos padronizados, permissões, regras e automações que acompanham a escala."],
];

const BENEFITS_ES = [
  ["Más ventas", "Oportunidades priorizadas, atendidas y acompañadas hasta el cierre."],
  ["Respuesta más rápida", "Canales y agentes trabajando con el mismo contexto del cliente."],
  ["Menos trabajo manual", "Rutinas, alertas, follow-ups y tareas ejecutados automáticamente."],
  ["Mejores decisiones", "Datos comerciales, financieros y operativos transformados en indicadores."],
  ["Menos pérdidas", "Historial centralizado, control de churn, duplicidades y oportunidades olvidadas."],
  ["Más productividad", "El equipo se concentra en decisiones y relaciones, no en tareas repetitivas."],
  ["Gestión centralizada", "Clientes, productos, proyectos, campañas, finanzas y equipos en el mismo entorno."],
  ["Crecimiento organizado", "Procesos estandarizados, permisos, reglas y automatizaciones que acompañan la escala."],
];

const capabilityGroupsBase = [
  { title: "Vendas e relacionamento", items: ["CRM completo", "Leads e contatos", "Negócios e pipeline", "Atividades e follow-ups", "Propostas e contratos", "Briefings", "Histórico 360°", "Lead scoring", "Próxima melhor ação", "Risco de churn"] },
  { title: "Agentes e inteligência artificial", items: ["SDR", "Closer", "Follow-up", "Prospecção", "Atendimento", "Suporte", "Agendamento", "Financeiro", "Cobrança", "Pós-venda", "Copilotos", "Memória e contexto"] },
  { title: "Atendimento omnichannel", items: ["WhatsApp oficial", "Instagram profissional", "Facebook Messenger", "Caixa de entrada unificada", "Distribuição de conversas", "Histórico por cliente", "Respostas assistidas", "Transferência para equipe"] },
  { title: "Prospecção e oportunidades", items: ["Revenue Scout", "Prospector inteligente", "Busca de empresas e contatos", "Qualificação", "Regras comerciais", "Aprovação pelo gestor", "Listas e segmentações", "Reativação de base"] },
  { title: "Marketing, conteúdo e anúncios", items: ["Planejamento de conteúdo", "Textos e imagens com IA", "Feed, Stories e Reels", "Biblioteca de conteúdo", "Publicação social", "Campanhas", "Meta Ads", "Patrocínio de conteúdo", "Segmentação", "Histórico e métricas"] },
  { title: "Produtos, preços e propostas", items: ["Catálogo", "Categorias", "Variações", "Fornecedores", "Estoque", "Insumos", "Composição de custos", "Margens e regras", "Tabelas de preço", "Propostas e orçamentos"] },
  { title: "Financeiro e monetização", items: ["Faturamento", "Contas a receber", "Cobrança", "PIX e cartão", "Conciliação", "Comissões", "Cupons", "Parceiros", "Influenciadores", "Indicadores financeiros"] },
  { title: "Agenda, tarefas e operação", items: ["Agenda inteligente", "Compromissos", "Tarefas", "Lembretes", "Agendamentos automáticos", "Visão por equipe", "Rotinas operacionais", "Alertas e notificações"] },
  { title: "Sites e presença digital", items: ["Sites", "Landing pages", "Formulários", "Captação de leads", "E-commerce", "Páginas de produtos", "Integração com CRM", "Jornadas digitais", "Vídeos e mídia"] },
  { title: "Projetos, construção e Arqdor.ai", items: ["Projetos e ambientes", "Clientes e portal", "Orçamentos por etapa", "Cronogramas", "Materiais e componentes", "Renders com IA", "Revisões e correções", "Memória de projeto", "Marketplace", "Gestão de obras"] },
  { title: "Dados, analytics e conhecimento", items: ["Dashboards", "Relatórios executivos", "Indicadores comerciais", "Indicadores operacionais", "Consumo de IA", "Base de conhecimento", "Documentos", "Regras da empresa", "Jornada do cliente", "Inteligência comportamental"] },
  { title: "Gestão, segurança e ecossistema", items: ["Multiempresa e multitenant", "Usuários e equipes", "Papéis e permissões", "Auditoria", "Proteção de dados", "Vendor Shield", "Licenças e acessos", "Administração central", "APIs e webhooks", "N8N e Typebot"] },
];

const CAPABILITY_ES: Record<string, { title: string; items: string[] }> = {
  "Vendas e relacionamento": { title: "Ventas y relación", items: ["CRM completo", "Leads y contactos", "Negocios y pipeline", "Actividades y follow-ups", "Propuestas y contratos", "Briefings", "Historial 360°", "Lead scoring", "Próxima mejor acción", "Riesgo de churn"] },
  "Agentes e inteligência artificial": { title: "Agentes e inteligencia artificial", items: ["SDR", "Closer", "Follow-up", "Prospección", "Atención", "Soporte", "Agenda", "Finanzas", "Cobranza", "Posventa", "Copilotos", "Memoria y contexto"] },
  "Atendimento omnichannel": { title: "Atención omnichannel", items: ["WhatsApp oficial", "Instagram profesional", "Facebook Messenger", "Bandeja de entrada unificada", "Distribución de conversaciones", "Historial por cliente", "Respuestas asistidas", "Transferencia al equipo"] },
  "Prospecção e oportunidades": { title: "Prospección y oportunidades", items: ["Revenue Scout", "Prospector inteligente", "Búsqueda de empresas y contactos", "Calificación", "Reglas comerciales", "Aprobación del responsable", "Listas y segmentaciones", "Reactivación de base"] },
  "Marketing, conteúdo e anúncios": { title: "Marketing, contenido y anuncios", items: ["Planificación de contenido", "Textos e imágenes con IA", "Feed, Stories y Reels", "Biblioteca de contenido", "Publicación social", "Campañas", "Meta Ads", "Promoción de contenido", "Segmentación", "Historial y métricas"] },
  "Produtos, preços e propostas": { title: "Productos, precios y propuestas", items: ["Catálogo", "Categorías", "Variaciones", "Proveedores", "Inventario", "Insumos", "Composición de costos", "Márgenes y reglas", "Listas de precios", "Propuestas y presupuestos"] },
  "Financeiro e monetização": { title: "Finanzas y monetización", items: ["Facturación", "Cuentas por cobrar", "Cobranza", "PIX y tarjeta", "Conciliación", "Comisiones", "Cupones", "Socios", "Influencers", "Indicadores financieros"] },
  "Agenda, tarefas e operação": { title: "Agenda, tareas y operación", items: ["Agenda inteligente", "Compromisos", "Tareas", "Recordatorios", "Agendamientos automáticos", "Vista por equipo", "Rutinas operativas", "Alertas y notificaciones"] },
  "Sites e presença digital": { title: "Sitios y presencia digital", items: ["Sitios", "Landing pages", "Formularios", "Captación de leads", "E-commerce", "Páginas de productos", "Integración con CRM", "Jornadas digitales", "Videos y medios"] },
  "Projetos, construção e Arqdor.ai": { title: "Proyectos, construcción y Arqdor.ai", items: ["Proyectos y ambientes", "Clientes y portal", "Presupuestos por etapa", "Cronogramas", "Materiales y componentes", "Renders con IA", "Revisiones y correcciones", "Memoria de proyecto", "Marketplace", "Gestión de obras"] },
  "Dados, analytics e conhecimento": { title: "Datos, analytics y conocimiento", items: ["Dashboards", "Informes ejecutivos", "Indicadores comerciales", "Indicadores operativos", "Consumo de IA", "Base de conocimiento", "Documentos", "Reglas de la empresa", "Jornada del cliente", "Inteligencia comportamental"] },
  "Gestão, segurança e ecossistema": { title: "Gestión, seguridad y ecosistema", items: ["Multiempresa y multitenant", "Usuarios y equipos", "Roles y permisos", "Auditoría", "Protección de datos", "Vendor Shield", "Licencias y accesos", "Administración central", "APIs y webhooks", "N8N y Typebot"] },
};

const UI_PT = {
  heroKicker: "Uma licença. Experiência completa.",
  heroTitle: "O sistema inteligente que conecta toda a empresa.",
  heroDesc: "Vendor.ai reúne tecnologia, automação e dados numa única operação — captar, atender, vender, executar, gerir e acompanhar toda a empresa.",
  modulesTitle: "Tudo o que o Vendor.ai entrega",
  modulesDesc: "Uma experiência completa, sem planos reduzidos. Os módulos trabalham conectados e o formato de contratação altera apenas o período de uso.",
  mapKicker: "Mapa completo do sistema",
  mapTitle: "As principais funções, sem esconder nenhuma área",
  mapDesc: "O Vendor.ai reúne recursos comerciais, operacionais, administrativos e especializados. Cada empresa utiliza a mesma plataforma completa, configurada para sua realidade.",
  benefitsKicker: "Benefícios gerados pelo Vendor.ai",
  benefitsTitle: "Funções conectadas para gerar resultado real",
  finalTitle: "Veja o Vendor.ai completo na sua operação",
  finalDesc: "Ative seus 5 dias gratuitos, mantenha todas as informações organizadas e escolha depois entre um bloco avulso de 5 dias ou a assinatura contínua.",
  finalCta: "Começar meus 5 dias gratuitos",
} as const;

const UI_ES = {
  heroKicker: "Una licencia. Experiencia completa.",
  heroTitle: "El sistema inteligente que conecta toda la empresa.",
  heroDesc: "VendorAI reúne tecnología, automatización y datos en una sola operación para captar, atender, vender, ejecutar, gestionar y acompañar toda la empresa.",
  modulesTitle: "Todo lo que entrega VendorAI",
  modulesDesc: "Una experiencia completa, sin planes reducidos. Los módulos trabajan conectados y la modalidad de contratación cambia solamente el período de uso.",
  mapKicker: "Mapa completo del sistema",
  mapTitle: "Las principales funciones, sin ocultar ninguna área",
  mapDesc: "VendorAI reúne recursos comerciales, operativos, administrativos y especializados. Cada empresa utiliza la misma plataforma completa, configurada para su realidad.",
  benefitsKicker: "Beneficios generados por VendorAI",
  benefitsTitle: "Funciones conectadas para generar resultados reales",
  finalTitle: "Mira VendorAI completo dentro de tu operación",
  finalDesc: "Activa tus 5 días gratuitos, mantén la información organizada y después elige entre un bloque adicional de 5 días o la suscripción continua.",
  finalCta: "Comenzar mis 5 días gratuitos",
} as const;

export default function Funcionalidades() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? UI_ES : UI_PT;
  const modules = isSpanish
    ? modulesBase.map((mod) => ({ ...mod, ...(MODULES_ES[mod.id] ?? {}) }))
    : modulesBase;
  const benefits = isSpanish ? BENEFITS_ES : benefitsBase;
  const capabilityGroups = isSpanish
    ? capabilityGroupsBase.map((group) => CAPABILITY_ES[group.title] ?? group)
    : capabilityGroupsBase;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-white md:py-28">
        <div className="container mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{copy.heroKicker}</p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">{copy.heroTitle}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">{copy.heroDesc}</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">{copy.modulesTitle}</h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">{copy.modulesDesc}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((mod, idx) => {
            const Icon = mod.icon;
            return (
              <motion.article key={mod.id} id={mod.id} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ delay: Math.min(idx * 0.04, 0.24) }} className="scroll-mt-24 rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon className="h-6 w-6" /></div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{mod.title}</h3>
                <p className="mt-3 min-h-[84px] leading-7 text-slate-600">{mod.desc}</p>
                <ul className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                  {mod.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm font-medium text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>

        <section className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.mapKicker}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">{copy.mapTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">{copy.mapDesc}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {capabilityGroups.map((group) => (
              <article key={group.title} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-950">{group.title}</h3>
                <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[28px] bg-blue-50 p-8 md:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{copy.benefitsKicker}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">{copy.benefitsTitle}</h2>
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
          <h2 className="text-3xl font-semibold tracking-[-0.035em]">{copy.finalTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-300">{copy.finalDesc}</p>
          <Button size="lg" className="mt-8 h-14 rounded-xl px-8" asChild>
            <Link href="/demo">{copy.finalCta}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
