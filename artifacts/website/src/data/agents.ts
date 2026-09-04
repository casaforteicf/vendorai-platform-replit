import type { LucideIcon } from "lucide-react";
import { UserRoundCheck, Target, Handshake, RefreshCcw, CalendarDays, LifeBuoy, HeartHandshake, Radar } from "lucide-react";

export type AgentDetail = {
  slug: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  howItWorks: { title: string; desc: string }[];
  learning: { title: string; desc: string };
  ctaLabel: string;
};

export const AGENTS: AgentDetail[] = [
  {
    slug: "recepcao",
    icon: UserRoundCheck,
    eyebrow: "O primeiro contato de todo lead novo",
    title: "Agente de Recepção",
    subtitle:
      "Toda pessoa que chega — WhatsApp, Instagram, site — fala primeiro com o Agente de Recepção. Ele acolhe, entende o que a pessoa precisa e encaminha pro próximo passo certo, sem qualificar de cara e sem parecer um robô de menu.",
    howItWorks: [
      { title: "Responde na hora", desc: "Nenhum lead espera minutos por uma primeira resposta, em qualquer canal conectado." },
      { title: "Entende a intenção real", desc: "Diferencia quem quer comprar, quem quer suporte e quem só está pesquisando." },
      { title: "Encaminha certo", desc: "Passa o contexto já coletado pro próximo agente — SDR, Suporte ou Financeiro — sem repetir pergunta." },
    ],
    learning: {
      title: "Aprende o que priorizar",
      desc: "Cada troca de contexto alimenta o histórico do lead — o próximo agente nunca começa do zero.",
    },
    ctaLabel: "Ver o Agente de Recepção em ação",
  },
  {
    slug: "sdr",
    icon: Target,
    eyebrow: "Qualificação sem perder o timing",
    title: "Agente SDR",
    subtitle:
      "Faz as perguntas certas pra entender se o lead tem perfil, dor e momento de compra — seguindo metodologia SPIN Selling adaptada ao seu mercado, não um script genérico.",
    howItWorks: [
      { title: "Perguntas específicas do seu nicho", desc: "Situação, problema, implicação e necessidade — geradas pra realidade do setor do lead, não texto fixo." },
      { title: "Qualifica em tempo real", desc: "Identifica prioridade e contexto conforme a conversa acontece, sem formulário longo." },
      { title: "Cria a oportunidade certa", desc: "Lead qualificado vira negócio no pipeline automaticamente, com o briefing já preenchido." },
    ],
    learning: {
      title: "Aprende com cada conversa registrada",
      desc: "A base de conhecimento e as regras comerciais da empresa alimentam o agente — ele qualifica melhor com o tempo de uso.",
    },
    ctaLabel: "Ver o Agente SDR",
  },
  {
    slug: "closer",
    icon: Handshake,
    eyebrow: "Apoio na hora de decidir",
    title: "Agente Closer",
    subtitle:
      "Ajuda a montar a proposta, contornar objeções com argumentos reais (não genéricos) e conduzir a negociação até a decisão — sem substituir o vendedor, potencializando ele.",
    howItWorks: [
      { title: "Resumo executivo do cliente", desc: "Dores principais, pontos de força e como contornar cada objeção já registrada, prontos antes da conversa de fechamento." },
      { title: "Apoio na proposta", desc: "Conecta direto com catálogo, tabelas de preço e templates de orçamento." },
      { title: "Sinaliza risco de perda", desc: "Alerta quando algo no histórico indica que a negociação está esfriando." },
    ],
    learning: {
      title: "Aprende com objeções reais, não hipotéticas",
      desc: "Cada objeção registrada e sua resposta viram parte do contexto pro próximo fechamento parecido.",
    },
    ctaLabel: "Ver o Agente Closer",
  },
  {
    slug: "follow-up",
    icon: RefreshCcw,
    eyebrow: "Nenhuma oportunidade esfria sozinha",
    title: "Agente de Follow-up e Reativação",
    subtitle:
      "Detecta quando um lead parou de responder e retoma o contato no momento certo — sem depender da memória (ou disposição) de um vendedor pra lembrar de retomar.",
    howItWorks: [
      { title: "Detecta o esfriamento", desc: "Identifica quando um lead ativo parou de interagir, sem alguém precisar perceber manualmente." },
      { title: "Retoma com contexto", desc: "A mensagem de reativação lembra exatamente onde a conversa parou, não um 'oi, tudo bem?' genérico." },
      { title: "Só dispara em horário comercial", desc: "Respeitando fuso e regras de cada empresa — nunca manda mensagem espontânea de madrugada." },
    ],
    learning: {
      title: "Aprende o timing certo de retomar",
      desc: "Cadência configurável por empresa — quantas mensagens, com que intervalo, antes de considerar o lead esfriado de verdade.",
    },
    ctaLabel: "Ver o Agente de Follow-up",
  },
  {
    slug: "agendamento",
    icon: CalendarDays,
    eyebrow: "Reunião marcada sem ida e volta",
    title: "Agente de Agendamento",
    subtitle:
      "Marca reuniões e compromissos direto na conversa, já verificando disponibilidade real na agenda conectada — sem o clássico 'que tal terça às 14h? Ah, não posso, e quinta?'.",
    howItWorks: [
      { title: "Consulta a agenda de verdade", desc: "Google Calendar conectado — nunca oferece um horário que já está ocupado." },
      { title: "Confirma e cria o link", desc: "Gera o link de reunião automaticamente quando aplicável." },
      { title: "Lembra antes da hora", desc: "Reduz falta em reunião com lembretes automáticos pro lead." },
    ],
    learning: {
      title: "Roteiro de reunião pronto antes de você entrar",
      desc: "Quando o Briefing SPIN já foi preenchido, o agente prepara um roteiro de condução da reunião com base no que já se sabe do cliente.",
    },
    ctaLabel: "Ver o Agente de Agendamento",
  },
  {
    slug: "suporte",
    icon: LifeBuoy,
    eyebrow: "Atendimento pós-venda que resolve",
    title: "Agente de Suporte",
    subtitle:
      "Responde dúvidas de clientes já ativos usando a base de conhecimento da própria empresa, e abre chamado formal automaticamente quando o problema exige atenção humana.",
    howItWorks: [
      { title: "Responde com a base da empresa", desc: "Usa os documentos e regras que você mesmo cadastrou — não inventa política que não existe." },
      { title: "Sabe quando escalar", desc: "Abre um chamado técnico formal quando a questão exige um humano, em vez de insistir em responder." },
      { title: "Registra tudo", desc: "Toda interação vira histórico consultável, mesmo quando não gera um chamado formal." },
    ],
    learning: {
      title: "Aprende com cada base de conhecimento que você atualiza",
      desc: "Cada agente escolhe quais documentos usar — atualizar a base de conhecimento já muda o comportamento na próxima resposta.",
    },
    ctaLabel: "Ver o Agente de Suporte",
  },
  {
    slug: "pos-venda",
    icon: HeartHandshake,
    eyebrow: "A relação não acaba na venda",
    title: "Agente de Pós-venda",
    subtitle:
      "Continua a jornada depois do fechamento — aniversários, datas comemorativas, check-ins de satisfação — mantendo o relacionamento vivo sem depender de alguém lembrar manualmente.",
    howItWorks: [
      { title: "Datas que importam", desc: "Aniversário do lead, aniversário do negócio fechado, datas comerciais relevantes pro setor do cliente." },
      { title: "Check-in de inatividade", desc: "Detecta cliente que sumiu e inicia contato antes que a relação esfrie de vez." },
      { title: "Prepara a próxima oportunidade", desc: "Entrega o contexto pro Revenue Scout identificar o que vender depois." },
    ],
    learning: {
      title: "Alimenta o Revenue Scout continuamente",
      desc: "Cada interação de pós-venda é sinal de dado pra próxima oportunidade — a venda não é o fim da jornada, é o meio dela.",
    },
    ctaLabel: "Ver o Agente de Pós-venda",
  },
  {
    slug: "revenue-scout",
    icon: Radar,
    eyebrow: "A venda não termina quando o cliente compra",
    title: "Revenue Scout",
    subtitle:
      "Vasculha sua base de clientes ativos procurando a próxima oportunidade real — quem comprou A mas não B, quem está perto de precisar trocar, quem tem um orçamento parado esperando retomada.",
    howItWorks: [
      { title: "Motores específicos por mercado", desc: "Distribuidora, seguros, varejo, construção — cada setor tem sinais diferentes de oportunidade, e o Scout sabe procurar cada um." },
      { title: "Aprovação antes de agir", desc: "Oportunidades encontradas passam por aprovação do gestor antes de qualquer mensagem sair — nada dispara sozinho sem controle." },
      { title: "Vira negócio real no pipeline", desc: "Toda oportunidade aprovada entra no funil como um negócio de verdade, acompanhável do início ao fim." },
    ],
    learning: {
      title: "Base de dados de aprendizado real",
      desc: "Cada oportunidade encontrada — ganha ou perdida — vira um registro que alimenta a evolução futura do motor de recomendação, sem depender de suposição.",
    },
    ctaLabel: "Ver o Revenue Scout",
  },
];

const AGENTS_ES: Record<string, Omit<AgentDetail, "slug" | "icon">> = {
  recepcao: {
    eyebrow: "El primer contacto de cada lead nuevo",
    title: "Agente de Recepción",
    subtitle: "Toda persona que llega por WhatsApp, Instagram o el sitio habla primero con el Agente de Recepción. Recibe, entiende qué necesita y la dirige al siguiente paso correcto sin parecer un robot de menú.",
    howItWorks: [
      { title: "Responde al instante", desc: "Ningún lead tiene que esperar minutos por una primera respuesta en los canales conectados." },
      { title: "Entiende la intención real", desc: "Diferencia quién quiere comprar, quién necesita soporte y quién todavía está investigando." },
      { title: "Deriva con contexto", desc: "Entrega al siguiente agente — SDR, Soporte o Finanzas — el contexto ya recopilado, sin repetir preguntas." },
    ],
    learning: { title: "Aprende qué priorizar", desc: "Cada cambio de contexto alimenta el historial del lead para que el siguiente agente nunca empiece desde cero." },
    ctaLabel: "Ver el Agente de Recepción en acción",
  },
  sdr: {
    eyebrow: "Calificación sin perder el momento",
    title: "Agente SDR",
    subtitle: "Hace las preguntas adecuadas para entender perfil, necesidad y momento de compra siguiendo SPIN Selling adaptado a tu mercado, no un guion genérico.",
    howItWorks: [
      { title: "Preguntas específicas de tu nicho", desc: "Situación, problema, implicación y necesidad adaptadas a la realidad del sector del lead." },
      { title: "Califica en tiempo real", desc: "Identifica prioridad y contexto mientras la conversación avanza, sin formularios largos." },
      { title: "Crea la oportunidad correcta", desc: "El lead calificado se convierte automáticamente en una oportunidad del pipeline con el briefing ya completo." },
    ],
    learning: { title: "Aprende de cada conversación registrada", desc: "La base de conocimiento y las reglas comerciales alimentan al agente para mejorar su calificación con el uso." },
    ctaLabel: "Ver el Agente SDR",
  },
  closer: {
    eyebrow: "Apoyo en el momento de decidir",
    title: "Agente Closer",
    subtitle: "Ayuda a preparar la propuesta, responder objeciones con argumentos reales y conducir la negociación hasta una decisión, potenciando al vendedor en lugar de reemplazarlo.",
    howItWorks: [
      { title: "Resumen ejecutivo del cliente", desc: "Necesidades principales, puntos de valor y objeciones registradas listos antes de la conversación de cierre." },
      { title: "Apoyo en la propuesta", desc: "Se conecta con catálogo, tablas de precios y plantillas de cotización." },
      { title: "Señala riesgo de pérdida", desc: "Alerta cuando el historial indica que la negociación está perdiendo impulso." },
    ],
    learning: { title: "Aprende de objeciones reales", desc: "Cada objeción registrada y su respuesta pasan a formar parte del contexto para cierres similares." },
    ctaLabel: "Ver el Agente Closer",
  },
  "follow-up": {
    eyebrow: "Ninguna oportunidad se enfría sola",
    title: "Agente de Follow-up y Reactivación",
    subtitle: "Detecta cuando un lead deja de responder y retoma el contacto en el momento adecuado, sin depender de que un vendedor recuerde hacerlo.",
    howItWorks: [
      { title: "Detecta el enfriamiento", desc: "Identifica automáticamente cuándo un lead activo dejó de interactuar." },
      { title: "Retoma con contexto", desc: "La reactivación recuerda exactamente dónde quedó la conversación, no envía un saludo genérico." },
      { title: "Respeta horarios comerciales", desc: "Sigue el huso horario y las reglas de cada empresa para evitar mensajes fuera de hora." },
    ],
    learning: { title: "Aprende el momento correcto para retomar", desc: "La cadencia se configura por empresa: cantidad de mensajes, intervalos y reglas para considerar realmente frío a un lead." },
    ctaLabel: "Ver el Agente de Follow-up",
  },
  agendamento: {
    eyebrow: "Reuniones agendadas sin ida y vuelta",
    title: "Agente de Agenda",
    subtitle: "Agenda reuniones y compromisos directamente en la conversación verificando disponibilidad real en el calendario conectado.",
    howItWorks: [
      { title: "Consulta la agenda real", desc: "Con Google Calendar conectado, nunca ofrece un horario que ya está ocupado." },
      { title: "Confirma y crea el enlace", desc: "Genera automáticamente el enlace de reunión cuando corresponde." },
      { title: "Recuerda antes de la reunión", desc: "Reduce ausencias con recordatorios automáticos para el lead." },
    ],
    learning: { title: "Guion de reunión listo antes de entrar", desc: "Cuando el Briefing SPIN ya está completo, prepara una guía de reunión con base en lo que ya se conoce del cliente." },
    ctaLabel: "Ver el Agente de Agenda",
  },
  suporte: {
    eyebrow: "Soporte posventa que resuelve",
    title: "Agente de Soporte",
    subtitle: "Responde dudas de clientes activos usando la base de conocimiento de la empresa y abre un caso formal cuando la situación necesita atención humana.",
    howItWorks: [
      { title: "Responde con la base de la empresa", desc: "Usa documentos y reglas que la propia empresa registró; no inventa políticas inexistentes." },
      { title: "Sabe cuándo escalar", desc: "Abre un caso técnico formal cuando la cuestión necesita intervención humana." },
      { title: "Registra todo", desc: "Cada interacción queda en el historial consultable aunque no genere un caso formal." },
    ],
    learning: { title: "Aprende con cada actualización de conocimiento", desc: "Cada agente usa documentos definidos para su función; actualizar la base cambia el contexto disponible en la siguiente respuesta." },
    ctaLabel: "Ver el Agente de Soporte",
  },
  "pos-venda": {
    eyebrow: "La relación no termina con la venta",
    title: "Agente de Posventa",
    subtitle: "Continúa la jornada después del cierre con fechas relevantes y controles de satisfacción, manteniendo la relación activa sin depender de recordatorios manuales.",
    howItWorks: [
      { title: "Fechas que importan", desc: "Aniversarios, fecha del negocio cerrado y momentos comerciales relevantes para el sector del cliente." },
      { title: "Control de inactividad", desc: "Detecta clientes que dejaron de interactuar e inicia contacto antes de que la relación se enfríe." },
      { title: "Prepara la próxima oportunidad", desc: "Entrega contexto a Revenue Scout para identificar qué oportunidad puede venir después." },
    ],
    learning: { title: "Alimenta continuamente a Revenue Scout", desc: "Cada interacción posventa se convierte en una señal de datos para la próxima oportunidad; la venta forma parte de una jornada continua." },
    ctaLabel: "Ver el Agente de Posventa",
  },
  "revenue-scout": {
    eyebrow: "La venta no termina cuando el cliente compra",
    title: "Revenue Scout",
    subtitle: "Analiza la base de clientes activos buscando la próxima oportunidad real: quién compró A pero no B, quién se acerca a una renovación o quién tiene una cotización detenida esperando seguimiento.",
    howItWorks: [
      { title: "Motores específicos por mercado", desc: "Distribución, seguros, retail, construcción y otros sectores tienen señales distintas de oportunidad, y Revenue Scout busca las adecuadas para cada uno." },
      { title: "Aprobación antes de actuar", desc: "Las oportunidades encontradas pasan por aprobación del responsable antes de cualquier mensaje; nada se dispara sin control." },
      { title: "Se convierte en oportunidad real", desc: "Cada oportunidad aprobada entra al pipeline como un negocio real, con seguimiento de principio a fin." },
    ],
    learning: { title: "Aprendizaje basado en resultados reales", desc: "Cada oportunidad encontrada, ganada o perdida, genera un registro que ayuda a evolucionar el motor de recomendación con datos reales." },
    ctaLabel: "Ver Revenue Scout",
  },
};

export function localizeAgentDetail(agent: AgentDetail, isSpanish: boolean): AgentDetail {
  if (!isSpanish) return agent;
  const localized = AGENTS_ES[agent.slug];
  return localized ? { ...agent, ...localized } : agent;
}
