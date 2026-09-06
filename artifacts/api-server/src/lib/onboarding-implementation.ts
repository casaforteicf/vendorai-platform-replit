export type ImplementationMode = "guided" | "assisted" | "automatic";
export type FollowupDay = "1" | "3" | "7" | "15" | "30";

export type ImplementationTimelineEvent = {
  id: string;
  type: string;
  label: string;
  at: string;
  metadata?: Record<string, unknown>;
};

export type OnboardingImplementationState = {
  version: 1;
  mode: ImplementationMode;
  manual: Record<string, boolean>;
  timeline: ImplementationTimelineEvent[];
  goLiveAt: string | null;
  followupsCompleted: Partial<Record<FollowupDay, string>>;
  safeActionsLastRunAt: string | null;
  handoffs: {
    customerSuccessAt: string | null;
    devAt: string | null;
    devTicketId: string | null;
  };
};

export type ImplementationFacts = {
  onboardingComplete: boolean;
  profileConfigured: boolean;
  activeUsers: number;
  whatsappConnected: boolean;
  instagramConnected: boolean;
  calendarConnected: boolean;
  leadCount: number;
  catalogCount: number;
  agentsConfigured: boolean;
  autonomyEnabled: boolean;
};

export type ImplementationStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  hardBlocker: boolean;
  canAcknowledge: boolean;
  source: "system" | "manual";
};

export type ImplementationFollowup = {
  day: FollowupDay;
  label: string;
  dueAt: string;
  status: "upcoming" | "due" | "completed";
  completedAt: string | null;
};

const PRODUCT_SEGMENT_HINTS = [
  "varejo", "loja", "distrib", "material", "constru", "farm", "supermerc", "autope", "peça",
  "industr", "fábrica", "fabrica", "esquadr", "piscina", "móveis", "moveis", "atacado", "comércio", "comercio",
];

const APPOINTMENT_SEGMENT_HINTS = [
  "clínica", "clinica", "beleza", "salão", "salao", "consult", "arquitet", "serviço", "servico", "advoc",
];

function hasHint(segment: string, hints: string[]) {
  const normalized = segment.trim().toLocaleLowerCase("pt-BR");
  return hints.some((hint) => normalized.includes(hint));
}

export function normalizeImplementationState(raw: unknown): OnboardingImplementationState {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const mode = value.mode === "assisted" || value.mode === "automatic" ? value.mode : "guided";
  const handoffsRaw = value.handoffs && typeof value.handoffs === "object" ? value.handoffs as Record<string, unknown> : {};
  const followupsRaw = value.followupsCompleted && typeof value.followupsCompleted === "object"
    ? value.followupsCompleted as Record<string, unknown>
    : {};

  const followupsCompleted: Partial<Record<FollowupDay, string>> = {};
  for (const day of ["1", "3", "7", "15", "30"] as FollowupDay[]) {
    if (typeof followupsRaw[day] === "string") followupsCompleted[day] = followupsRaw[day] as string;
  }

  return {
    version: 1,
    mode,
    manual: value.manual && typeof value.manual === "object"
      ? Object.fromEntries(Object.entries(value.manual as Record<string, unknown>).map(([key, done]) => [key, done === true]))
      : {},
    timeline: Array.isArray(value.timeline)
      ? value.timeline.filter((item): item is ImplementationTimelineEvent => !!item && typeof item === "object" && typeof (item as ImplementationTimelineEvent).at === "string").slice(-100)
      : [],
    goLiveAt: typeof value.goLiveAt === "string" ? value.goLiveAt : null,
    followupsCompleted,
    safeActionsLastRunAt: typeof value.safeActionsLastRunAt === "string" ? value.safeActionsLastRunAt : null,
    handoffs: {
      customerSuccessAt: typeof handoffsRaw.customerSuccessAt === "string" ? handoffsRaw.customerSuccessAt : null,
      devAt: typeof handoffsRaw.devAt === "string" ? handoffsRaw.devAt : null,
      devTicketId: typeof handoffsRaw.devTicketId === "string" ? handoffsRaw.devTicketId : null,
    },
  };
}

export function buildImplementationPlan(
  segment: string | null | undefined,
  facts: ImplementationFacts,
  state: OnboardingImplementationState,
): ImplementationStep[] {
  const segmentName = segment ?? "";
  const productHeavy = hasHint(segmentName, PRODUCT_SEGMENT_HINTS);
  const appointmentHeavy = hasHint(segmentName, APPOINTMENT_SEGMENT_HINTS);
  const anyChannel = facts.whatsappConnected || facts.instagramConnected || facts.calendarConnected;

  // Fonte única: readiness de produtos/serviços depende apenas do Catálogo
  // oficial ativo. Nenhum campo legado do perfil participa deste cálculo.
  const catalogReady = facts.catalogCount > 0;

  return [
    {
      id: "profile",
      title: "Empresa e perfil",
      description: "Concluir os dados essenciais da empresa e do segmento.",
      href: "/onboarding",
      done: facts.onboardingComplete && facts.profileConfigured,
      hardBlocker: true,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "team",
      title: "Equipe pronta",
      description: "Confirmar ao menos um usuário ativo para operar a plataforma.",
      href: "/usuarios",
      done: facts.activeUsers > 0,
      hardBlocker: true,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "channel",
      title: appointmentHeavy ? "Canal ou agenda conectada" : "Canal comercial conectado",
      description: appointmentHeavy
        ? "Conectar WhatsApp, Instagram ou Google Calendar para iniciar a operação."
        : "Conectar ao menos um canal real de atendimento e vendas.",
      href: "/onboarding/integracoes",
      done: anyChannel,
      hardBlocker: true,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "data",
      title: "Clientes e leads",
      description: "Importar a base atual ou cadastrar os primeiros contatos reais.",
      href: "/leads/import-config",
      done: facts.leadCount > 0,
      hardBlocker: false,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "catalog",
      title: productHeavy ? "Catálogo mínimo" : "Produtos ou serviços",
      description: productHeavy
        ? "Cadastrar os itens essenciais que a equipe e os agentes precisam vender no Catálogo oficial."
        : "Cadastrar no Catálogo oficial os produtos ou serviços que fizerem parte do fluxo comercial.",
      href: "/catalogo",
      done: catalogReady,
      hardBlocker: productHeavy,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "agents",
      title: "Agentes com contexto",
      description: "Deixar os agentes configurados com o contexto real do negócio.",
      href: "/agentes",
      done: facts.agentsConfigured,
      hardBlocker: true,
      canAcknowledge: false,
      source: "system",
    },
    {
      id: "test",
      title: "Teste operacional",
      description: "Executar um fluxo simples ponta a ponta e confirmar que o resultado está correto.",
      href: "/leads",
      done: state.manual.test === true,
      hardBlocker: true,
      canAcknowledge: true,
      source: "manual",
    },
    {
      id: "autonomy",
      title: "Autonomia dos agentes",
      description: "Liberar autonomia somente quando a equipe estiver confortável com o fluxo.",
      href: "/agentes",
      done: facts.autonomyEnabled,
      hardBlocker: false,
      canAcknowledge: false,
      source: "system",
    },
  ];
}

export function buildImplementationReadiness(plan: ImplementationStep[]) {
  const blockers = plan.filter((step) => step.hardBlocker && !step.done);
  const hardSteps = plan.filter((step) => step.hardBlocker);
  const completedHard = hardSteps.filter((step) => step.done).length;
  const completed = plan.filter((step) => step.done).length;
  const score = plan.length === 0 ? 100 : Math.round((completed / plan.length) * 100);
  const hardScore = hardSteps.length === 0 ? 100 : Math.round((completedHard / hardSteps.length) * 100);
  return {
    ready: blockers.length === 0,
    score,
    hardScore,
    blockers: blockers.map((step) => ({ id: step.id, title: step.title, href: step.href })),
  };
}

export function buildImplementationFollowups(
  goLiveAt: string | null,
  completed: Partial<Record<FollowupDay, string>>,
  now = new Date(),
): ImplementationFollowup[] {
  if (!goLiveAt) return [];
  const base = new Date(goLiveAt);
  if (Number.isNaN(base.getTime())) return [];

  return ([1, 3, 7, 15, 30] as const).map((dayNumber) => {
    const day = String(dayNumber) as FollowupDay;
    const due = new Date(base);
    due.setUTCDate(due.getUTCDate() + dayNumber);
    const completedAt = completed[day] ?? null;
    return {
      day,
      label: `D+${day}`,
      dueAt: due.toISOString(),
      completedAt,
      status: completedAt ? "completed" : now.getTime() >= due.getTime() ? "due" : "upcoming",
    };
  });
}

export function appendImplementationTimeline(
  state: OnboardingImplementationState,
  event: Omit<ImplementationTimelineEvent, "id">,
): OnboardingImplementationState {
  return {
    ...state,
    timeline: [
      ...state.timeline,
      { ...event, id: `${event.type}:${event.at}:${Math.random().toString(36).slice(2, 8)}` },
    ].slice(-100),
  };
}
