export type DeliverableStatus = "ready" | "partial" | "pending" | "blocked";

export type ConceptDeliverable = {
  id:
    | "brief"
    | "site"
    | "floorplan"
    | "dimensions"
    | "areas"
    | "solar"
    | "roof"
    | "facades"
    | "sections"
    | "model3d"
    | "renders"
    | "decisions"
    | "feasibility";
  title: string;
  audience: "client" | "architect" | "both";
  status: DeliverableStatus;
  helper: string;
  reason?: string;
};

export type ConceptReadiness = {
  presentation: {
    status: "ready" | "warning" | "blocked";
    score: number;
    blockers: string[];
    warnings: string[];
  };
  professional: {
    status: "ready" | "warning" | "blocked";
    score: number;
    blockers: string[];
    warnings: string[];
  };
  deliverables: ConceptDeliverable[];
};

export function buildConceptReadiness(input: {
  roomCount: number;
  floors: number;
  hasBrief: boolean;
  hasSitePlacement: boolean;
  hasNorth: boolean;
  hasWallModel: boolean;
  hasDimensions: boolean;
  hasFacade: boolean;
  has3d: boolean;
  hasRender: boolean;
  renderFidelityApproved?: boolean | null;
  regulatoryStatus?: "nao_informado" | "preliminar" | "verificado";
  hasRegulatoryChecks?: boolean;
  hasArchitectureDNA?: boolean;
  roofConfigured?: boolean;
}) : ConceptReadiness {
  const hasRooms = input.roomCount > 0;
  const deliverables: ConceptDeliverable[] = [
    {
      id: "brief",
      title: "Briefing + DNA do cliente",
      audience: "both",
      status: input.hasBrief ? "ready" : "pending",
      helper: "Necessidades, rotina, preferências, Taste DNA e prioridades.",
    },
    {
      id: "site",
      title: "Implantação no terreno",
      audience: "both",
      status: input.hasSitePlacement ? "ready" : "pending",
      helper: "Lote, frente, recuos informados e posição conceitual da casa.",
    },
    {
      id: "floorplan",
      title: "Planta humanizada",
      audience: "both",
      status: hasRooms && input.hasWallModel ? "ready" : hasRooms ? "partial" : "pending",
      helper: "Ambientes, mobiliário/uso e leitura espacial do projeto.",
      reason: !input.hasWallModel && hasRooms ? "Planta ainda depende parcialmente do modelo legado de ambientes." : undefined,
    },
    {
      id: "dimensions",
      title: "Planta cotada",
      audience: "architect",
      status: input.hasDimensions && input.hasWallModel ? "ready" : input.hasDimensions ? "partial" : "pending",
      helper: "Dimensões gerais, ambientes e referências de paredes.",
    },
    {
      id: "areas",
      title: "Quadro de áreas",
      audience: "both",
      status: hasRooms ? "ready" : "pending",
      helper: "Área por ambiente, pavimento e área construída conceitual.",
    },
    {
      id: "solar",
      title: "Diagrama solar e ventilação",
      audience: "architect",
      status: input.hasNorth ? "ready" : "pending",
      helper: "Orientação, fachadas expostas, oportunidades de insolação e ventilação.",
      reason: !input.hasNorth ? "Informe o norte do lote para liberar a leitura climática completa." : undefined,
    },
    {
      id: "roof",
      title: "Cobertura conceitual",
      audience: "architect",
      status: input.roofConfigured ? "ready" : input.hasFacade ? "partial" : "pending",
      helper: "Estratégia de cobertura coerente com volumetria e drenagem futura.",
    },
    {
      id: "facades",
      title: "Fachadas",
      audience: "both",
      status: input.hasFacade ? "ready" : "pending",
      helper: "Elevação derivada do modelo + direção arquitetônica aprovada.",
    },
    {
      id: "sections",
      title: "Cortes preliminares",
      audience: "architect",
      status: input.has3d && input.hasWallModel ? "partial" : "pending",
      helper: "Leitura vertical preliminar; ainda requer definição técnica antes do projeto legal/executivo.",
      reason: "Corte preliminar não substitui detalhamento técnico do profissional responsável.",
    },
    {
      id: "model3d",
      title: "Modelo 3D",
      audience: "both",
      status: input.has3d ? "ready" : "pending",
      helper: "Volumetria e espaços derivados da mesma fonte do 2D.",
    },
    {
      id: "renders",
      title: "Renders fotorealistas",
      audience: "client",
      status: !input.hasRender
        ? "pending"
        : input.renderFidelityApproved === false
          ? "blocked"
          : input.renderFidelityApproved === true
            ? "ready"
            : "partial",
      helper: "Visualização realista auditada contra a geometria aprovada.",
      reason: input.renderFidelityApproved === false ? "Render reprovado pelo Fidelity Gate." : undefined,
    },
    {
      id: "decisions",
      title: "Relatório de decisões",
      audience: "both",
      status: input.hasArchitectureDNA ? "ready" : "partial",
      helper: "Partido, implantação, clima, custo, flexibilidade e linguagem arquitetônica.",
    },
    {
      id: "feasibility",
      title: "Viabilidade urbanística",
      audience: "architect",
      status: input.regulatoryStatus === "verificado" && input.hasRegulatoryChecks
        ? "ready"
        : input.regulatoryStatus === "preliminar"
          ? "partial"
          : "pending",
      helper: "Recuos, pavimentos, ocupação e aproveitamento conforme dados cadastrados.",
      reason: input.regulatoryStatus !== "verificado"
        ? "Conformidade legal permanece preliminar até haver fonte verificada."
        : undefined,
    },
  ];

  const scoreFor = (items: ConceptDeliverable[]) => {
    if (!items.length) return 0;
    const points: Record<DeliverableStatus, number> = { ready: 100, partial: 65, pending: 20, blocked: 0 };
    return Math.round(items.reduce((sum, item) => sum + points[item.status], 0) / items.length);
  };

  const clientItems = deliverables.filter((item) => item.audience === "client" || item.audience === "both");
  const professionalItems = deliverables.filter((item) => item.audience === "architect" || item.audience === "both");

  const clientBlockers = clientItems.filter((item) => item.status === "blocked").map((item) => item.title);
  const professionalBlockers = professionalItems.filter((item) => item.status === "blocked").map((item) => item.title);
  const clientWarnings = clientItems.filter((item) => item.status === "partial" || item.status === "pending").map((item) => item.title);
  const professionalWarnings = professionalItems.filter((item) => item.status === "partial" || item.status === "pending").map((item) => item.title);

  const clientScore = scoreFor(clientItems);
  const professionalScore = scoreFor(professionalItems);

  return {
    presentation: {
      status: clientBlockers.length ? "blocked" : clientScore >= 78 ? "ready" : "warning",
      score: clientScore,
      blockers: clientBlockers,
      warnings: clientWarnings,
    },
    professional: {
      status: professionalBlockers.length ? "blocked" : professionalScore >= 82 ? "ready" : "warning",
      score: professionalScore,
      blockers: professionalBlockers,
      warnings: professionalWarnings,
    },
    deliverables,
  };
}

export function deliverableStatusLabel(status: DeliverableStatus) {
  if (status === "ready") return "Pronto";
  if (status === "partial") return "Parcial";
  if (status === "blocked") return "Bloqueado";
  return "Pendente";
}
