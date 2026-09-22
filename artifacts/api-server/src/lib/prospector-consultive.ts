export type ProspectorDiagnosticQuestion = {
  fieldKey: string;
  label: string;
  question: string;
  type: "situacao" | "problema" | "implicacao" | "necessidade";
};

export type ProspectorObjection = {
  objection: string;
  response: string;
};

export type ProspectorPlaybook = {
  version: 1;
  identity: {
    businessName: string;
    sector: string;
    offer: string;
    finalCustomer: string;
  };
  signal: {
    observable: string[];
    sources: string[];
    indication: string;
  };
  persona: {
    profiles: string[];
    decisionPower: string;
    values: string[];
    problemLanguage: string[];
  };
  anchor: {
    opening: string;
    permission: string;
    forbiddenBeforeConfirmation: string[];
  };
  diagnosis: ProspectorDiagnosticQuestion[];
  qualification: {
    terrainDefined: boolean;
    projectOrClearIntent: boolean;
    estimatedTimeline: boolean;
    declaredPain: boolean;
    acceptsNextStep: boolean;
  };
  nextStep: {
    offer: string;
    format: string;
    duration: string;
    conductedBy: string;
  };
  objections: ProspectorObjection[];
  metrics: {
    signalsPerWeek?: number;
    approachesPerDay?: number;
    responseRateTarget?: number;
    diagnosticsPerWeek?: number;
    meetingsPerWeek?: number;
    opportunityConversionTarget?: number;
  };
  limits: {
    neverPromise: string[];
    neverMention: string[];
    compliance?: string;
  };
};

export const COLD_PROSPECT_SOURCES = new Set([
  "prospector",
  "prospector_auto",
  "cnpj",
  "recem_aberta",
  "ad_library",
  "construction_radar",
  "obra_radar",
]);

const GENERIC_PLAYBOOK: ProspectorPlaybook = {
  version: 1,
  identity: {
    businessName: "Empresa",
    sector: "B2B",
    offer: "solução da empresa",
    finalCustomer: "cliente ideal definido pelo tenant",
  },
  signal: {
    observable: ["sinal público verificável relacionado ao momento do prospect"],
    sources: ["fontes públicas e dados autorizados do tenant"],
    indication: "há um contexto que merece ser entendido antes de qualquer oferta",
  },
  persona: {
    profiles: ["decisor ou influenciador do processo"],
    decisionPower: "a confirmar",
    values: ["clareza", "segurança", "resultado"],
    problemLanguage: ["estou avaliando", "ainda estamos definindo", "preciso entender melhor"],
  },
  anchor: {
    opening: "Posso entender em que estágio está esse projeto ou decisão?",
    permission: "Sem compromisso, só para eu compreender o contexto.",
    forbiddenBeforeConfirmation: ["produto", "preço", "prazo", "proposta"],
  },
  diagnosis: [
    { fieldKey: "prospector_stage", label: "Estágio atual", type: "situacao", question: "Em que estágio está hoje?" },
    { fieldKey: "prospector_context", label: "Contexto definido", type: "situacao", question: "O que já está definido até aqui?" },
    { fieldKey: "prospector_timeline", label: "Prazo", type: "situacao", question: "Qual é o prazo estimado para avançar?" },
    { fieldKey: "prospector_challenge", label: "Maior desafio", type: "problema", question: "Qual é o maior desafio hoje?" },
    { fieldKey: "prospector_decision", label: "Condução/decisão", type: "situacao", question: "Quem está conduzindo essa decisão?" },
    { fieldKey: "prospector_alternatives", label: "Alternativas avaliadas", type: "necessidade", question: "Vocês já estão avaliando alguma alternativa ou parceiro?" },
  ],
  qualification: {
    terrainDefined: false,
    projectOrClearIntent: true,
    estimatedTimeline: true,
    declaredPain: true,
    acceptsNextStep: true,
  },
  nextStep: {
    offer: "conversa técnica com um especialista",
    format: "online ou presencial",
    duration: "20 min",
    conductedBy: "especialista + comercial",
  },
  objections: [
    { objection: "Não tenho interesse", response: "Entendo. Só para eu não incomodar novamente: isso está pausado ou ainda não começou?" },
    { objection: "Já tenho fornecedor/parceiro", response: "Perfeito. Posso entender como está sendo conduzido, só para referência de mercado?" },
    { objection: "Estou só pesquisando", response: "Ótimo, é exatamente o momento ideal para entender o estágio. Posso fazer 2 perguntas rápidas?" },
    { objection: "Não é o momento", response: "Sem problema. Posso entender qual seria o momento ideal para retomarmos?" },
    { objection: "Está caro", response: "Entendo. Posso entender o que você está comparando, para ver se faz sentido?" },
  ],
  metrics: {},
  limits: {
    neverPromise: ["preço", "prazo", "escopo sem validação humana"],
    neverMention: [],
  },
};

const CONSTRUCTION_PLAYBOOK: ProspectorPlaybook = {
  version: 1,
  identity: {
    businessName: "Construtora",
    sector: "Construção civil residencial",
    offer: "Construção de casas de alto padrão",
    finalCustomer: "Famílias de alta renda",
  },
  signal: {
    observable: ["Alvará emitido", "Tapume", "Movimentação de terra"],
    sources: ["Prefeitura", "Registros públicos", "Redes sociais", "Visitas"],
    indication: "Projeto em fase de desenvolvimento",
  },
  persona: {
    profiles: ["Arquiteto", "Proprietário do terreno", "Investidor"],
    decisionPower: "Alto",
    values: ["Prazo", "Qualidade técnica", "Parceria"],
    problemLanguage: ["estou viabilizando", "falta definir construtora"],
  },
  anchor: {
    opening: "Posso entender em que estágio está o desenvolvimento do projeto deste terreno?",
    permission: "Sem compromisso, só para eu compreender o contexto.",
    forbiddenBeforeConfirmation: ["preço", "prazo de obra", "proposta", "escopo fechado"],
  },
  diagnosis: [
    { fieldKey: "project_stage", label: "Estágio do projeto", type: "situacao", question: "Em que estágio está o projeto?" },
    { fieldKey: "project_or_permit", label: "Projeto/alvará", type: "situacao", question: "Já existe projeto aprovado ou alvará?" },
    { fieldKey: "start_timeline", label: "Prazo para início", type: "situacao", question: "Qual o prazo previsto para início da obra?" },
    { fieldKey: "main_challenge", label: "Maior desafio", type: "problema", question: "Qual o maior desafio hoje?" },
    { fieldKey: "project_lead", label: "Quem conduz", type: "situacao", question: "Quem conduz o projeto?" },
    { fieldKey: "construction_firm_status", label: "Construtora avaliada", type: "necessidade", question: "Já avaliou construtora?" },
  ],
  qualification: {
    terrainDefined: true,
    projectOrClearIntent: true,
    estimatedTimeline: true,
    declaredPain: true,
    acceptsNextStep: true,
  },
  nextStep: {
    offer: "Reunião técnica com especialista",
    format: "20 min, online ou presencial",
    duration: "20 min",
    conductedBy: "Engenheiro + comercial",
  },
  objections: [
    { objection: "Já tenho construtora", response: "Perfeito. Posso entender como está sendo conduzido, só para referência de mercado?" },
    { objection: "Estou só pesquisando", response: "Ótimo, é o momento ideal para entender o estágio. Posso fazer 2 perguntas rápidas?" },
    { objection: "Não é o momento", response: "Sem problema. Qual seria o momento ideal?" },
  ],
  metrics: {
    signalsPerWeek: 20,
    approachesPerDay: 15,
    responseRateTarget: 20,
    meetingsPerWeek: 5,
  },
  limits: {
    neverPromise: ["preço de obra", "prazo de obra sem vistoria", "escopo sem validação humana"],
    neverMention: ["concorrentes"],
  },
};

function stringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isConstructionContext(segment?: string | null, metadata?: Record<string, unknown> | null): boolean {
  const text = [
    segment ?? "",
    String(metadata?.["setor"] ?? ""),
    String(metadata?.["categoria"] ?? ""),
    String(metadata?.["source_family"] ?? ""),
    String(metadata?.["source"] ?? ""),
    String(metadata?.["lead_source"] ?? ""),
    String(metadata?.["origem"] ?? ""),
    String(metadata?.["obra"] ?? ""),
  ].join(" ").toLocaleLowerCase("pt-BR");
  return /constru|obra|residenc|arquitet|engenhar|terreno|incorpora/.test(text);
}

export function defaultProspectorPlaybook(
  segment?: string | null,
  metadata?: Record<string, unknown> | null,
): ProspectorPlaybook {
  return structuredClone(isConstructionContext(segment, metadata) ? CONSTRUCTION_PLAYBOOK : GENERIC_PLAYBOOK);
}

export function resolveProspectorPlaybook(
  raw: unknown,
  segment?: string | null,
  metadata?: Record<string, unknown> | null,
): ProspectorPlaybook {
  const fallback = defaultProspectorPlaybook(segment, metadata);
  const obj = objectValue(raw);
  const identity = objectValue(obj["identity"]);
  const signal = objectValue(obj["signal"]);
  const persona = objectValue(obj["persona"]);
  const anchor = objectValue(obj["anchor"]);
  const qualification = objectValue(obj["qualification"]);
  const nextStep = objectValue(obj["nextStep"]);
  const metrics = objectValue(obj["metrics"]);
  const limits = objectValue(obj["limits"]);

  const diagnosisRaw = Array.isArray(obj["diagnosis"]) ? obj["diagnosis"] as unknown[] : [];
  const diagnosis = diagnosisRaw
    .map((item, index): ProspectorDiagnosticQuestion | null => {
      const q = objectValue(item);
      const fieldKey = stringValue(q["fieldKey"], "");
      const question = stringValue(q["question"], "");
      if (!fieldKey || !question) return null;
      const rawType = stringValue(q["type"], "situacao");
      const type: ProspectorDiagnosticQuestion["type"] =
        ["situacao", "problema", "implicacao", "necessidade"].includes(rawType)
          ? rawType as ProspectorDiagnosticQuestion["type"]
          : "situacao";
      return {
        fieldKey: fieldKey.replace(/[^a-z0-9_]/gi, "_").slice(0, 40) || `prospector_q_${index + 1}`,
        label: stringValue(q["label"], `Pergunta ${index + 1}`),
        question,
        type,
      };
    })
    .filter((item): item is ProspectorDiagnosticQuestion => Boolean(item));

  const objectionsRaw = Array.isArray(obj["objections"]) ? obj["objections"] as unknown[] : [];
  const objections = objectionsRaw
    .map((item): ProspectorObjection | null => {
      const row = objectValue(item);
      const objection = stringValue(row["objection"], "");
      const response = stringValue(row["response"], "");
      return objection && response ? { objection, response } : null;
    })
    .filter((item): item is ProspectorObjection => Boolean(item));

  return {
    version: 1,
    identity: {
      businessName: stringValue(identity["businessName"], fallback.identity.businessName),
      sector: stringValue(identity["sector"], fallback.identity.sector),
      offer: stringValue(identity["offer"], fallback.identity.offer),
      finalCustomer: stringValue(identity["finalCustomer"], fallback.identity.finalCustomer),
    },
    signal: {
      observable: stringList(signal["observable"], fallback.signal.observable),
      sources: stringList(signal["sources"], fallback.signal.sources),
      indication: stringValue(signal["indication"], fallback.signal.indication),
    },
    persona: {
      profiles: stringList(persona["profiles"], fallback.persona.profiles),
      decisionPower: stringValue(persona["decisionPower"], fallback.persona.decisionPower),
      values: stringList(persona["values"], fallback.persona.values),
      problemLanguage: stringList(persona["problemLanguage"], fallback.persona.problemLanguage),
    },
    anchor: {
      opening: stringValue(anchor["opening"], fallback.anchor.opening),
      permission: stringValue(anchor["permission"], fallback.anchor.permission),
      forbiddenBeforeConfirmation: stringList(anchor["forbiddenBeforeConfirmation"], fallback.anchor.forbiddenBeforeConfirmation),
    },
    diagnosis: diagnosis.length > 0 ? diagnosis.slice(0, 10) : fallback.diagnosis,
    qualification: {
      terrainDefined: typeof qualification["terrainDefined"] === "boolean"
        ? qualification["terrainDefined"] as boolean
        : fallback.qualification.terrainDefined,
      projectOrClearIntent: typeof qualification["projectOrClearIntent"] === "boolean"
        ? qualification["projectOrClearIntent"] as boolean
        : fallback.qualification.projectOrClearIntent,
      estimatedTimeline: typeof qualification["estimatedTimeline"] === "boolean"
        ? qualification["estimatedTimeline"] as boolean
        : fallback.qualification.estimatedTimeline,
      declaredPain: typeof qualification["declaredPain"] === "boolean"
        ? qualification["declaredPain"] as boolean
        : fallback.qualification.declaredPain,
      acceptsNextStep: typeof qualification["acceptsNextStep"] === "boolean"
        ? qualification["acceptsNextStep"] as boolean
        : fallback.qualification.acceptsNextStep,
    },
    nextStep: {
      offer: stringValue(nextStep["offer"], fallback.nextStep.offer),
      format: stringValue(nextStep["format"], fallback.nextStep.format),
      duration: stringValue(nextStep["duration"], fallback.nextStep.duration),
      conductedBy: stringValue(nextStep["conductedBy"], fallback.nextStep.conductedBy),
    },
    objections: objections.length > 0 ? objections.slice(0, 12) : fallback.objections,
    metrics: {
      signalsPerWeek: Number(metrics["signalsPerWeek"] ?? fallback.metrics.signalsPerWeek) || undefined,
      approachesPerDay: Number(metrics["approachesPerDay"] ?? fallback.metrics.approachesPerDay) || undefined,
      responseRateTarget: Number(metrics["responseRateTarget"] ?? fallback.metrics.responseRateTarget) || undefined,
      diagnosticsPerWeek: Number(metrics["diagnosticsPerWeek"] ?? fallback.metrics.diagnosticsPerWeek) || undefined,
      meetingsPerWeek: Number(metrics["meetingsPerWeek"] ?? fallback.metrics.meetingsPerWeek) || undefined,
      opportunityConversionTarget: Number(metrics["opportunityConversionTarget"] ?? fallback.metrics.opportunityConversionTarget) || undefined,
    },
    limits: {
      neverPromise: stringList(limits["neverPromise"], fallback.limits.neverPromise),
      neverMention: stringList(limits["neverMention"], fallback.limits.neverMention),
      compliance: stringValue(limits["compliance"], fallback.limits.compliance ?? ""),
    },
  };
}

export function isColdProspectSource(source?: string | null): boolean {
  return COLD_PROSPECT_SOURCES.has(source ?? "");
}

export function prospectorQuestionsForExtraction(playbook: ProspectorPlaybook) {
  return playbook.diagnosis.map((q) => ({
    fieldKey: q.fieldKey,
    label: q.label,
    tipo: q.type,
    pergunta: q.question,
  }));
}

function evidenceLabels(metadata?: Record<string, unknown> | null): string[] {
  const dossier = objectValue(metadata?.["coldProspectDossier"]);
  const evidence = Array.isArray(dossier["evidence"]) ? dossier["evidence"] as unknown[] : [];
  const dossierLabels = evidence
    .map((item) => objectValue(item))
    .map((item) => {
      const label = stringValue(item["label"], "");
      const value = stringValue(item["value"], "");
      return label && value && value !== "true" ? `${label}: ${value}` : (label || value);
    })
    .filter(Boolean);

  const explicitSignalCandidates = [
    metadata?.["evidencia"],
    metadata?.["evidence"],
    metadata?.["signal"],
    metadata?.["sinal"],
    metadata?.["obra_signal"],
    metadata?.["construction_signal"],
    metadata?.["source_title"],
  ]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  return [...new Set([...explicitSignalCandidates, ...dossierLabels])].slice(0, 5);
}

export function buildProspectorOpening(params: {
  playbook: ProspectorPlaybook;
  leadName?: string | null;
  companyName?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const { playbook, leadName, companyName, metadata } = params;
  const firstName = (leadName ?? "").trim().split(/\s+/)[0] || "";
  const observed = evidenceLabels(metadata)[0] ?? "";
  const contextPrefix = observed
    ? `Encontrei uma referência pública relacionada a ${observed}${companyName ? ` em ${companyName}` : ""}. `
    : "";
  const greeting = firstName ? `Olá, ${firstName}. ` : "Olá. ";
  return `${greeting}${contextPrefix}${playbook.anchor.opening} ${playbook.anchor.permission}`
    .replace(/\s+/g, " ")
    .trim();
}

function formatKnownAnswers(playbook: ProspectorPlaybook, discoveryData: Record<string, unknown>): string {
  const lines = playbook.diagnosis.map((q) => {
    const value = discoveryData[q.fieldKey];
    return value ? `- ✓ ${q.label}: ${String(value)}` : `- ◻ ${q.label}: ainda não confirmado`;
  });
  return lines.join("\n");
}

export function buildProspectorConsultivePrompt(params: {
  playbook: ProspectorPlaybook;
  discoveryData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  customSystemPrompt?: string | null;
  state?: Record<string, unknown> | null;
}): string {
  const { playbook } = params;
  const discoveryData = params.discoveryData ?? {};
  const state = params.state ?? {};
  const evidence = evidenceLabels(params.metadata);
  const objections = playbook.objections.map((item) => `- "${item.objection}" → "${item.response}"`).join("\n");
  const questions = playbook.diagnosis.map((q, index) => `${index + 1}. ${q.question} [campo: ${q.fieldKey}]`).join("\n");
  const limits = [
    ...playbook.limits.neverPromise.map((item) => `- Nunca prometer: ${item}`),
    ...playbook.limits.neverMention.map((item) => `- Nunca mencionar: ${item}`),
    playbook.limits.compliance ? `- Compliance: ${playbook.limits.compliance}` : "",
  ].filter(Boolean).join("\n");

  return [
    params.customSystemPrompt?.trim() ? `## ORIENTAÇÕES ESPECÍFICAS DO TENANT\n${params.customSystemPrompt.trim()}` : "",
    "## MODO PROSPECCTOR — PESQUISA CONSULTIVA POR SINAIS",
    "Você está atuando como Prospecctor, antes do SDR/Closer. Seu papel NÃO é vender nesta fase. Seu papel é pesquisar, entender e qualificar o contexto real.",
    "PRINCÍPIO CENTRAL: Pesquisar → Entender → Confirmar → Só então propor o próximo passo.",
    "REGRAS ABSOLUTAS:",
    "- Trate sinais públicos como evidências externas, nunca como prova de dor interna.",
    "- Na abertura, use linguagem de pesquisa e peça permissão para entender.",
    "- Faça UMA pergunta por mensagem. Não transforme a conversa em formulário.",
    "- Não mencione produto, preço, prazo comercial, proposta ou solução antes de compreender estágio, prazo e desafio e o lead confirmar o resumo.",
    "- Antes de avançar, resuma com as palavras do lead e pergunte exatamente: \"É isso mesmo?\"",
    "- Só depois da confirmação conecte a necessidade ao próximo passo permitido. Nunca gere preço, prazo ou escopo fechado sem validação humana.",
    "- Se o lead não estiver pronto, registre o momento adequado e mantenha em nutrição. Zero pressão.",
    "- Nunca invente fatos sobre proprietário, projeto, alvará, orçamento, fornecedor, decisor ou estágio. Use somente evidências verificadas e o que o lead declarou.",
    "",
    `NEGÓCIO: ${playbook.identity.businessName} | ${playbook.identity.sector}\nO que vende: ${playbook.identity.offer}\nCliente final: ${playbook.identity.finalCustomer}`,
    `SINAIS CONFIGURADOS: ${playbook.signal.observable.join("; ")}\nFontes permitidas: ${playbook.signal.sources.join("; ")}\nO sinal sugere apenas: ${playbook.signal.indication}`,
    evidence.length ? `EVIDÊNCIAS VERIFICADAS DESTE LEAD:\n${evidence.map((item) => `- ${item}`).join("\n")}` : "EVIDÊNCIAS DESTE LEAD: use somente os dados presentes no contexto; se não houver sinal verificável, não invente um.",
    `PERSONA: ${playbook.persona.profiles.join(", ")}\nPoder de decisão esperado: ${playbook.persona.decisionPower} (confirme; não presuma)\nValoriza: ${playbook.persona.values.join(", ")}\nLinguagem comum: ${playbook.persona.problemLanguage.join(" / ")}`,
    `ABERTURA-ÂNCORA: ${playbook.anchor.opening}\nPermissão: ${playbook.anchor.permission}\nNão mencionar antes da confirmação: ${playbook.anchor.forbiddenBeforeConfirmation.join(", ")}`,
    `DIAGNÓSTICO OBRIGATÓRIO — pergunte só o próximo campo ainda vazio:\n${questions}`,
    `ESTADO JÁ REGISTRADO NO CRM:\n${formatKnownAnswers(playbook, discoveryData)}`,
    `ESTADO DE CONFIRMAÇÃO:\n- Contexto confirmado pelo lead: ${state["contextConfirmed"] === true || discoveryData["prospector_context_confirmed"] === true ? "SIM" : "NÃO"}\n- Próximo passo aceito: ${state["nextStepAccepted"] === true || discoveryData["prospector_next_step_accepted"] === true ? "SIM" : "NÃO"}`,
    `PRÓXIMO PASSO PERMITIDO APÓS CONFIRMAÇÃO:\n- ${playbook.nextStep.offer}\n- Formato: ${playbook.nextStep.format}\n- Duração: ${playbook.nextStep.duration}\n- Condução: ${playbook.nextStep.conductedBy}`,
    `OBJEÇÕES ESPECÍFICAS:\n${objections}`,
    `LIMITES DO NEGÓCIO:\n${limits || "- Não ultrapassar políticas do tenant."}`,
    "CRITÉRIO DE SAÍDA: o Prospecctor encerra sua fase quando o diagnóstico necessário foi registrado, o lead confirmou o entendimento e aceitou o próximo passo. A partir daí, faça handoff para a etapa comercial/técnica sem repetir perguntas.",
  ].filter(Boolean).join("\n\n");
}

function isPositive(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase("pt-BR");
  return /^(sim|isso|isso mesmo|correto|exato|perfeito|certo|ok|pode|pode ser|vamos|vamos sim|claro|confirmo|combinado|fechado|aceito|quero)([!. ,].*)?$/.test(normalized);
}

export function detectProspectorStateFromReply(params: {
  incomingMessage: string;
  previousAgentMessage?: string | null;
  existingDiscoveryData?: Record<string, unknown> | null;
}): { contextConfirmed: boolean; nextStepAccepted: boolean } {
  const previous = (params.previousAgentMessage ?? "").toLocaleLowerCase("pt-BR");
  const existing = params.existingDiscoveryData ?? {};
  const positive = isPositive(params.incomingMessage);
  const asksConfirmation = /é isso mesmo\?|e isso mesmo\?|confere\?|correto\?/.test(previous);
  const offersNextStep = /(reunião|reuniao|conversa técnica|conversa tecnica|avaliação técnica|avaliacao tecnica|visita técnica|visita tecnica|20 min|especialista)/.test(previous);

  return {
    contextConfirmed: existing["prospector_context_confirmed"] === true || (positive && asksConfirmation),
    nextStepAccepted: existing["prospector_next_step_accepted"] === true || (positive && offersNextStep),
  };
}

export function evaluateProspectorQualification(params: {
  playbook: ProspectorPlaybook;
  discoveryData?: Record<string, unknown> | null;
  hasTerrainSignal?: boolean;
}) {
  const dd = params.discoveryData ?? {};
  // Todas as perguntas configuradas como diagnóstico são obrigatórias. O SQL gate
  // não fecha só porque os quatro campos mínimos comerciais apareceram: primeiro
  // o Prospecctor precisa concluir o entendimento definido pelo tenant.
  const diagnosticsComplete =
    params.playbook.diagnosis.length > 0 &&
    params.playbook.diagnosis.every((q) => Boolean(dd[q.fieldKey]));

  const hasTimeline = Boolean(dd["start_timeline"] ?? dd["prospector_timeline"] ?? dd["urgencia"]);
  const hasPain = Boolean(dd["main_challenge"] ?? dd["prospector_challenge"] ?? dd["dor_principal"]);
  const hasProject = Boolean(dd["project_stage"] ?? dd["project_or_permit"] ?? dd["prospector_stage"] ?? dd["prospector_context"]);
  const contextConfirmed = dd["prospector_context_confirmed"] === true;
  const nextStepAccepted = dd["prospector_next_step_accepted"] === true;
  const terrainDefined = params.hasTerrainSignal === true || Boolean(dd["terrain_defined"] ?? dd["endereco_obra"]);

  const checks = {
    terrainDefined: !params.playbook.qualification.terrainDefined || terrainDefined,
    projectOrClearIntent: !params.playbook.qualification.projectOrClearIntent || hasProject,
    estimatedTimeline: !params.playbook.qualification.estimatedTimeline || hasTimeline,
    declaredPain: !params.playbook.qualification.declaredPain || hasPain,
    contextConfirmed,
    acceptsNextStep: !params.playbook.qualification.acceptsNextStep || nextStepAccepted,
  };

  return {
    diagnosticsComplete,
    checks,
    qualified: diagnosticsComplete && Object.values(checks).every(Boolean),
  };
}
