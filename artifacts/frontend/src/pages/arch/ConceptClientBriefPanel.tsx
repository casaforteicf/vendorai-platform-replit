import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BedDouble,
  CarFront,
  ChefHat,
  Check,
  ChevronDown,
  Home,
  Laptop,
  Layers3,
  Minus,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  assessProjectBriefCompleteness,
  buildClientBriefAlternatives,
  buildClientBriefPlan,
  buildProjectBriefSnapshot,
  buildDefaultRoomProgram,
  buildRecommendedAccessRules,
  buildRecommendedAdjacencyRules,
  countBriefAlternativeErrors,
  rebalanceClientRoomProgramToDesiredArea,
  validateClientRoomProgram,
  type BrazilianResidentialContext,
  type ClientAdjacencyRule,
  type ClientBrief,
  type ClientRoomRequest,
  type ClientBriefAlternative,
  type ClientVision,
  type HouseholdContext,
  type ProjectBriefSnapshot,
  type ProjectSiteContext,
  type RegulatoryContext,
} from "./conceptClientBrief";

type Props = {
  lotWidth: number;
  lotDepth: number;
  initialProjectBrief?: ProjectBriefSnapshot | null;
  onGenerate: (alternative: ClientBriefAlternative) => void;
  onImproveCurrent?: (projectBrief: ProjectBriefSnapshot) => Promise<void>;
  /** Frente e recuos da implantação, para as opções já nascerem dentro do terreno. */
  placement?: {
    frontSide: "top" | "bottom" | "left" | "right";
    setbacks: { top: number; bottom: number; left: number; right: number };
  };
};

const DEFAULT_BRIEF_BASE: ClientBrief = {
  bedrooms: 3,
  suites: 1,
  floors: 1,
  garageSpaces: 2,
  gourmet: true,
  pool: false,
  office: false,
  integratedKitchen: true,
  privateAwaySocial: true,
  desiredAreaTotal: 180,
};

const DEFAULT_ROOM_PROGRAM = buildDefaultRoomProgram(DEFAULT_BRIEF_BASE);
const DEFAULT_BRIEF_WITH_PROGRAM: ClientBrief = {
  ...DEFAULT_BRIEF_BASE,
  roomProgram: DEFAULT_ROOM_PROGRAM,
};
const DEFAULT_BRIEF: ClientBrief = {
  ...DEFAULT_BRIEF_WITH_PROGRAM,
  adjacencyRules: buildRecommendedAdjacencyRules(DEFAULT_BRIEF_WITH_PROGRAM),
  accessRules: buildRecommendedAccessRules(DEFAULT_BRIEF_WITH_PROGRAM),
};

const DEFAULT_VISION: ClientVision = {
  lifestyle: "misto",
  protagonist: "social",
  priorities: ["luz_natural", "privacidade", "integracao"],
  budgetStrategy: "equilibrar",
  futureNeeds: "",
  mustHave: "",
  avoid: "",
  aestheticReferences: "",
  preferredMaterials: "",
  maintenancePreference: "equilibrada",
  constructionMethod: "nao_definido",
};

const DEFAULT_HOUSEHOLD: HouseholdContext = {
  residents: 3,
  children: 0,
  elderly: 0,
  pets: false,
  accessibilityNeeds: false,
  workFromHome: "ocasional",
  hostingFrequency: "media",
  cookingProfile: "cotidiano",
  routineNotes: "",
};

const DEFAULT_BRAZILIAN_CONTEXT: BrazilianResidentialContext = {
  region: "nao_informada",
  lotContext: "nao_informado",
  lifeCycle: "atual",
  expansionPriority: "prever",
  outdoorLiving: "medio",
  serviceRoutine: "tradicional",
  privacySecurity: "equilibrada",
  vehicleProfile: "misto",
  evReady: false,
  solarReady: false,
  rainwaterReady: false,
};

const DEFAULT_REGULATORY_CONTEXT: RegulatoryContext = {
  status: "nao_informado",
};

const DEFAULT_SITE_CONTEXT: ProjectSiteContext = {
  northSide: "nao_informado",
  topography: "nao_informado",
  desiredViews: "",
  avoidViews: "",
  privacyNotes: "",
  existingElements: "",
  climateNotes: "",
};
const STANDARD_PROGRAM_KEYS = new Set([
  "sala","cozinha","suite","quarto","suite-bath","social-bath","lavabo","lavanderia","garagem","gourmet","office","pool",
]);

function roomRequestKey(item: ClientRoomRequest) {
  const label = item.label.toLowerCase();
  if (item.kind === "banheiro" && /su[ií]te|master/.test(label)) return "suite-bath";
  if (item.kind === "banheiro" && /lavabo/.test(label)) return "lavabo";
  if (item.kind === "banheiro") return "social-bath";
  if (item.kind === "outro" && /escrit|office/.test(label)) return "office";
  if (item.kind === "piscina") return "pool";
  return item.kind;
}

function reconcileRoomProgram(currentProgram: ClientRoomRequest[], nextBrief: ClientBrief) {
  const defaults = buildDefaultRoomProgram(nextBrief);
  const currentByKey = new Map(currentProgram.map((item) => [roomRequestKey(item), item]));
  const merged = defaults.map((item) => {
    const previous = currentByKey.get(roomRequestKey(item));
    if (!previous) return item;
    return {
      ...item,
      id: previous.id,
      targetArea: previous.targetArea,
      preferredWidth: previous.preferredWidth,
      preferredDepth: previous.preferredDepth,
      required: previous.required,
      notes: previous.notes,
      floorPreference: nextBrief.floors === 1 ? "terreo" as const : previous.floorPreference ?? item.floorPreference,
    };
  });
  const custom = currentProgram.filter((item) => !STANDARD_PROGRAM_KEYS.has(roomRequestKey(item)));
  return [...merged, ...custom];
}

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "rounded-xl border-2 border-orange-500 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800"
        : "rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
    >
      {children}
    </button>
  );
}

function ToggleCard({
  active,
  icon: Icon,
  title,
  helper,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "flex w-full items-start gap-3 rounded-xl border-2 border-orange-500 bg-orange-50 p-3 text-left"
        : "flex w-full items-start gap-3 rounded-xl border bg-white p-3 text-left hover:border-slate-300"}
    >
      <span className={active
        ? "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500 text-white"
        : "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{helper}</span>
      </span>
      <span className={active
        ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-orange-500 text-white"
        : "h-5 w-5 shrink-0 rounded-full border bg-white"}
      >
        {active && <Check className="h-3 w-3" />}
      </span>
    </button>
  );
}

function roomFill(kind: string) {
  if (kind === "sala") return "#fde68a";
  if (kind === "cozinha") return "#fdba74";
  if (kind === "suite") return "#ddd6fe";
  if (kind === "quarto") return "#e0e7ff";
  if (kind === "banheiro") return "#bae6fd";
  if (kind === "garagem") return "#cbd5e1";
  if (kind === "gourmet") return "#fed7aa";
  if (kind === "piscina") return "#7dd3fc";
  if (kind === "lavanderia") return "#bfdbfe";
  if (kind === "escada") return "#d6d3d1";
  return "#e2e8f0";
}

function roomShortLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("garagem")) return "GAR";
  if (normalized.includes("sala")) return "SALA";
  if (normalized.includes("cozinha")) return "COZ";
  if (normalized.includes("suíte") || normalized.includes("suite")) return "SUÍTE";
  if (normalized.includes("quarto")) return "QTO";
  if (normalized.includes("banheiro")) return "BWC";
  if (normalized.includes("gourmet")) return "GOUR";
  if (normalized.includes("piscina")) return "PISC";
  if (normalized.includes("lavanderia")) return "LAV";
  if (normalized.includes("escritório")) return "ESC";
  if (normalized.includes("escada")) return "ESCADA";
  return label.slice(0, 5).toUpperCase();
}

function PlanMiniPreview({
  alternative,
  lotWidth,
  lotDepth,
}: {
  alternative: ClientBriefAlternative;
  lotWidth: number;
  lotDepth: number;
}) {
  const floor = 0;
  const rooms = alternative.rooms.filter((room) => room.floor === floor);
  const padding = 0.35;

  return (
    <div className="overflow-hidden rounded-xl border bg-[#f8fafc]">
      <svg
        viewBox={`${-padding} ${-padding} ${lotWidth + padding * 2} ${lotDepth + padding * 2}`}
        className="h-40 w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Prévia da ${alternative.title}`}
      >
        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="#ffffff" stroke="#94a3b8" strokeWidth="0.08" strokeDasharray="0.25 0.2" />
        {rooms.map((room) => (
          <g key={room.id}>
            <rect
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.depth}
              rx="0.08"
              fill={roomFill(room.kind)}
              stroke="#334155"
              strokeWidth="0.08"
            />
            {room.width >= 2.3 && room.depth >= 1.8 && (
              <text
                x={room.x + room.width / 2}
                y={room.y + room.depth / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="0.38"
                fontWeight="700"
                fill="#334155"
              >
                {roomShortLabel(room.label)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function ConceptClientBriefPanel({
  lotWidth,
  lotDepth,
  initialProjectBrief,
  onGenerate,
  onImproveCurrent,
  placement,
}: Props) {
  const [brief, setBrief] = useState<ClientBrief>(() => {
    const initial = initialProjectBrief?.brief ?? DEFAULT_BRIEF;
    const roomProgram = Array.isArray(initial.roomProgram) && initial.roomProgram.length
      ? initial.roomProgram
      : buildDefaultRoomProgram(initial);
    const withProgram: ClientBrief = {
      ...initial,
      desiredAreaTotal: initial.desiredAreaTotal ?? DEFAULT_BRIEF.desiredAreaTotal,
      roomProgram,
    };
    return {
      ...withProgram,
      adjacencyRules: Array.isArray(initial.adjacencyRules) && initial.adjacencyRules.length
        ? initial.adjacencyRules
        : buildRecommendedAdjacencyRules(withProgram),
      accessRules: Array.isArray(initial.accessRules) && initial.accessRules.length
        ? initial.accessRules
        : buildRecommendedAccessRules(withProgram),
    };
  });
  const [vision, setVision] = useState<ClientVision>(() => ({ ...DEFAULT_VISION, ...(initialProjectBrief?.vision ?? {}) }));
  const [household, setHousehold] = useState<HouseholdContext>(() => ({ ...DEFAULT_HOUSEHOLD, ...(initialProjectBrief?.household ?? {}) }));
  const [siteContext, setSiteContext] = useState<ProjectSiteContext>(() => ({
    ...DEFAULT_SITE_CONTEXT,
    ...(initialProjectBrief?.siteContext ?? {}),
    frontSide: initialProjectBrief?.siteContext?.frontSide ?? placement?.frontSide,
  }));
  const [brazilianContext, setBrazilianContext] = useState<BrazilianResidentialContext>(() => ({
    ...DEFAULT_BRAZILIAN_CONTEXT,
    ...(initialProjectBrief?.brazilianContext ?? {}),
  }));
  const [regulatoryContext, setRegulatoryContext] = useState<RegulatoryContext>(() => ({
    ...DEFAULT_REGULATORY_CONTEXT,
    setbacks: placement?.setbacks,
    ...(initialProjectBrief?.regulatoryContext ?? {}),
  }));
  const [dreamStep, setDreamStep] = useState(0);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<ClientBriefAlternative[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [intervention, setIntervention] = useState<"preservar" | "otimizar" | "valorizar" | "assinatura">(
    () => initialProjectBrief?.intervention ?? "valorizar",
  );

  const roomProgram = brief.roomProgram ?? [];
  const adjacencyRules = brief.adjacencyRules ?? [];
  const accessRules = brief.accessRules ?? [];

  const updateBriefStructure = (recipe: (current: ClientBrief) => ClientBrief) => {
    setBrief((current) => {
      const next = recipe(current);
      const nextProgram = reconcileRoomProgram(current.roomProgram ?? [], next);
      const validIds = new Set(nextProgram.map((item) => item.id));
      return {
        ...next,
        roomProgram: nextProgram,
        adjacencyRules: (current.adjacencyRules ?? []).filter(
          (rule) => validIds.has(rule.fromRequestId) && validIds.has(rule.toRequestId),
        ),
        accessRules: (current.accessRules ?? []).filter(
          (rule) => validIds.has(rule.fromRequestId) && validIds.has(rule.toRequestId),
        ),
      };
    });
  };

  const updateRoomRequest = (id: string, patch: Partial<ClientRoomRequest>) => {
    setBrief((current) => ({
      ...current,
      roomProgram: (current.roomProgram ?? []).map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const removeRoomRequest = (id: string) => {
    setBrief((current) => ({
      ...current,
      roomProgram: (current.roomProgram ?? []).filter((item) => item.id !== id),
      adjacencyRules: (current.adjacencyRules ?? []).filter(
        (rule) => rule.fromRequestId !== id && rule.toRequestId !== id,
      ),
      accessRules: (current.accessRules ?? []).filter(
        (rule) => rule.fromRequestId !== id && rule.toRequestId !== id,
      ),
    }));
  };

  const addRoomRequest = () => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `custom-room-${Date.now()}`;
    setBrief((current) => ({
      ...current,
      roomProgram: [
        ...(current.roomProgram ?? []),
        {
          id,
          kind: "outro",
          label: "Novo ambiente",
          quantity: 1,
          targetArea: 10,
          floorPreference: current.floors === 2 ? "qualquer" : "terreo",
          required: true,
        },
      ],
    }));
  };

  const addAdjacencyRule = () => {
    if (roomProgram.length < 2) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `adjacency-${Date.now()}`;
    const first = roomProgram[0];
    const second = roomProgram.find((item) => item.id !== first.id);
    if (!second) return;
    setBrief((current) => ({
      ...current,
      adjacencyRules: [
        ...(current.adjacencyRules ?? []),
        {
          id,
          fromRequestId: first.id,
          toRequestId: second.id,
          relation: "near",
          required: true,
        },
      ],
    }));
  };

  const updateAdjacencyRule = (id: string, patch: Partial<ClientAdjacencyRule>) => {
    setBrief((current) => ({
      ...current,
      adjacencyRules: (current.adjacencyRules ?? []).map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule
      ),
    }));
  };

  const removeAdjacencyRule = (id: string) => {
    setBrief((current) => ({
      ...current,
      adjacencyRules: (current.adjacencyRules ?? []).filter((rule) => rule.id !== id),
    }));
  };

  const requestedProgramArea = useMemo(
    () => roomProgram.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.targetArea), 0),
    [roomProgram],
  );

  const programValidation = useMemo(
    () => validateClientRoomProgram(brief, {
      width: lotWidth,
      depth: lotDepth,
      setbacks: placement?.setbacks,
    }),
    [brief, lotWidth, lotDepth, placement?.setbacks],
  );

  const summary = useMemo(() => {
    const items = [
      `${brief.bedrooms} dormitórios`,
      `${brief.suites} ${brief.suites === 1 ? "suíte" : "suítes"}`,
      `${brief.garageSpaces} ${brief.garageSpaces === 1 ? "vaga" : "vagas"}`,
      brief.floors === 2 ? "sobrado" : "casa térrea",
      brief.gourmet ? "gourmet" : null,
      brief.pool ? "piscina" : null,
      brief.office ? "escritório" : null,
      brief.desiredAreaTotal ? `meta ${Math.round(brief.desiredAreaTotal)} m²` : null,
    ].filter(Boolean);
    return items.join(" · ");
  }, [brief]);

  const improveCurrentModel = async () => {
    if (!initialProjectBrief || !onImproveCurrent) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      await onImproveCurrent(buildProjectBriefSnapshot({
        brief,
        vision,
        household,
        siteContext: { ...siteContext, frontSide: placement?.frontSide ?? siteContext.frontSide },
        brazilianContext,
        regulatoryContext,
        intervention,
        previous: initialProjectBrief,
      }));
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Não foi possível melhorar o modelo atual com o briefing.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const generateSpecialistAlternatives = async () => {
    if (programValidation.status === "blocked") {
      setGenerationError(programValidation.errors[0] ?? "Revise o programa de necessidades antes de gerar.");
      return;
    }
    setGenerating(true);
    setGenerationError(null);
    try {
      const base = buildClientBriefPlan(brief);
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch("/api/arch/concept-plan-specialist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          lotWidth,
          lotDepth,
          brief,
          vision,
          household,
          siteContext: { ...siteContext, frontSide: placement?.frontSide ?? siteContext.frontSide },
          brazilianContext,
          regulatoryContext,
          intervention,
          rooms: base.rooms,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const item = payload?.solution ?? (Array.isArray(payload?.alternatives) ? payload.alternatives[0] : null);
      if (!response.ok || !item || !Array.isArray(item.rooms)) {
        throw new Error(payload?.error ?? "Não foi possível desenvolver o projeto principal com a IA arquiteta.");
      }

      const primary = {
        ...base,
        id: "primary" as const,
        title: item.title || "Projeto principal",
        description: item.description || "Solução arquitetônica refinada a partir do seu briefing.",
        variant: 0 as const,
        suggestedArea: Number(item.suggestedArea ?? base.suggestedArea),
        rooms: item.rooms,
        architectureScore: Number.isFinite(Number(item.architectureScore)) ? Number(item.architectureScore) : undefined,
        qualityGateVersion: item.quality?.version === 2 ? 2 : undefined,
        qualityDimensions: item.quality?.dimensions && typeof item.quality.dimensions === "object" ? item.quality.dimensions : undefined,
        hardBlockers: Array.isArray(item.quality?.hardBlockers) ? item.quality.hardBlockers.map(String) : undefined,
        wallFirstModel: item.wallFirstModel && typeof item.wallFirstModel === "object" ? item.wallFirstModel : undefined,
        criticReview: item.criticReview && typeof item.criticReview === "object" ? item.criticReview : undefined,
        designRationale: typeof item.designRationale === "string" ? item.designRationale : undefined,
        qualityIssues: Array.isArray(item.quality?.issues) ? item.quality.issues.map(String) : undefined,
        qualityStrengths: Array.isArray(item.quality?.strengths) ? item.quality.strengths.map(String) : undefined,
        clientFitSummary: typeof item.clientFitSummary === "string" ? item.clientFitSummary : undefined,
        intervention,
        architectureDNA: item.architectureDNA && typeof item.architectureDNA === "object" ? item.architectureDNA : undefined,
        experienceStrategy: Array.isArray(item.experienceStrategy) ? item.experienceStrategy.map(String) : undefined,
        daylightStrategy: Array.isArray(item.daylightStrategy) ? item.daylightStrategy.map(String) : undefined,
        facadeDirection: Array.isArray(item.facadeDirection) ? item.facadeDirection.map(String) : undefined,
        selfCritique: Array.isArray(item.selfCritique) ? item.selfCritique.map(String) : undefined,
        programCompliance: item.programCompliance && typeof item.programCompliance === "object" ? item.programCompliance : undefined,
        projectBrief: buildProjectBriefSnapshot({
          brief,
          vision,
          household,
          siteContext: { ...siteContext, frontSide: placement?.frontSide ?? siteContext.frontSide },
          brazilianContext,
          regulatoryContext,
          intervention,
          patch: {
            selectedAlternativeId: "primary" as const,
            selectedAlternativeTitle: item.title || "Projeto principal",
            clientFitSummary: typeof item.clientFitSummary === "string" ? item.clientFitSummary : undefined,
            designRationale: typeof item.designRationale === "string" ? item.designRationale : undefined,
            architectureDNA: item.architectureDNA && typeof item.architectureDNA === "object" ? item.architectureDNA : undefined,
            experienceStrategy: Array.isArray(item.experienceStrategy) ? item.experienceStrategy.map(String) : undefined,
            daylightStrategy: Array.isArray(item.daylightStrategy) ? item.daylightStrategy.map(String) : undefined,
            facadeDirection: Array.isArray(item.facadeDirection) ? item.facadeDirection.map(String) : undefined,
            selfCritique: Array.isArray(item.selfCritique) ? item.selfCritique.map(String) : undefined,
          },
        }),
      } satisfies ClientBriefAlternative;

      const valid =
        countBriefAlternativeErrors(primary.rooms, primary.floors, lotWidth, lotDepth) === 0
        && (primary.rooms as Array<{ x: number; y: number; width: number; depth: number }>).every(
          (room) => room.x >= 0 && room.y >= 0 && room.x + room.width <= lotWidth + 0.01 && room.y + room.depth <= lotDepth + 0.01,
        );

      if (!valid) {
        throw new Error("O projeto principal retornou inconsistências geométricas e não foi aplicado.");
      }

      setAlternatives([primary]);
      setShowAlternatives(true);
    } catch (error) {
      const fallback = buildClientBriefAlternatives(brief, lotWidth, lotDepth, placement)[0];
      setAlternatives(fallback ? [fallback] : []);
      setGenerationError(
        error instanceof Error
          ? `${error.message} Exibindo uma base local de contingência para você continuar.`
          : "IA especialista indisponível. Exibindo uma base local de contingência.",
      );
      setShowAlternatives(true);
    } finally {
      setGenerating(false);
    }
  };

  if (showAlternatives) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-900">Projeto principal desenvolvido</div>
              <p className="mt-1 text-[11px] leading-5 text-slate-600">
                A IA arquiteta desenvolve uma solução principal, critica o próprio projeto e refina partido, circulação, luz natural, integração e coerência com a futura fachada antes de apresentar.
              </p>
              {!generationError && (
                <div className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  IA especialista em planta residencial
                </div>
              )}
            </div>
          </div>
        </div>

        {generationError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
            {generationError}
          </div>
        )}

        <div className="rounded-xl border bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Seu briefing</div>
          <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-700">{summary}</div>
        </div>

        <div className="space-y-3">
          {alternatives.map((alternative) => (
            <div key={alternative.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">{alternative.title}</div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{alternative.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                      ≈ {alternative.suggestedArea} m²
                    </span>
                    {typeof alternative.architectureScore === "number" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        Qualidade {alternative.architectureScore}/100
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <PlanMiniPreview
                    alternative={alternative}
                    lotWidth={lotWidth}
                    lotDepth={lotDepth}
                  />
                </div>

                {alternative.floors > 1 && (
                  <div className="mt-2 text-[10px] font-semibold text-slate-500">
                    Prévia mostra o térreo · projeto com {alternative.floors} pavimentos
                  </div>
                )}

                {alternative.wallFirstModel && (
                  <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-indigo-900">Modelo Architecture-First</span>
                      <span className="font-bold text-indigo-700">
                        Paredes {alternative.wallFirstModel.metrics.wallContinuityScore}/100
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[9px]">
                      <div className="rounded-md bg-white/80 px-2 py-1.5">
                        <b>{alternative.wallFirstModel.zones.length}</b><br />zonas
                      </div>
                      <div className="rounded-md bg-white/80 px-2 py-1.5">
                        <b>{alternative.wallFirstModel.metrics.wallCount}</b><br />paredes
                      </div>
                      <div className="rounded-md bg-white/80 px-2 py-1.5">
                        <b>{alternative.wallFirstModel.metrics.portalCount}</b><br />conexões
                      </div>
                    </div>
                    <div className="mt-2 text-[9px] leading-4 text-indigo-800">
                      O Arqdor registrou setorização, limites e conexões como modelo arquitetônico próprio; os ambientes continuam em formato compatível com o editor atual.
                    </div>
                  </div>
                )}

                {alternative.qualityDimensions && (
                  <div className="mt-2 rounded-lg border bg-white px-2.5 py-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-800">Architecture Quality Gate 2.0</span>
                      <span className={(alternative.hardBlockers?.length ?? 0) === 0 ? "font-bold text-emerald-700" : "font-bold text-red-600"}>
                        {(alternative.hardBlockers?.length ?? 0) === 0 ? "Sem bloqueios críticos" : `${alternative.hardBlockers?.length} bloqueio(s)`}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {([
                        ["program", "Programa"],
                        ["circulation", "Circulação"],
                        ["privacy", "Privacidade"],
                        ["ergonomics", "Ergonomia"],
                        ["geometry", "Geometria"],
                        ["constructability", "Construção"],
                        ["furnitureFit", "Mobiliário"],
                        ["siteClimate", "Terreno/clima"],
                        ["roofVolumetry", "Cobertura/volume"],
                        ["costValue", "Custo/valor"],
                        ["brazilianFit", "Contexto BR"],
                        ["architecturalCoherence", "Coerência"],
                      ] as const).map(([key, label]) => {
                        const dimension = alternative.qualityDimensions?.[key];
                        if (!dimension) return null;
                        return (
                          <div key={key} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[9px]">
                            <span className="font-semibold text-slate-600">{label}</span>
                            <span className={dimension.status === "blocked"
                              ? "font-bold text-red-600"
                              : dimension.status === "warning"
                                ? "font-bold text-amber-600"
                                : "font-bold text-emerald-700"}
                            >
                              {dimension.score}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {alternative.criticReview && (
                  <div className="mt-2 rounded-lg border border-cyan-100 bg-cyan-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-cyan-900">Crítico arquitetônico independente</span>
                      <span className={alternative.criticReview.unavailable
                        ? "font-bold text-amber-600"
                        : alternative.criticReview.approved
                          ? "font-bold text-emerald-700"
                          : "font-bold text-red-600"}
                      >
                        {alternative.criticReview.unavailable
                          ? "Indisponível"
                          : `${alternative.criticReview.score}/100`}
                      </span>
                    </div>
                    {alternative.criticReview.summary && (
                      <p className="mt-1 text-[9px] leading-4 text-cyan-900">{alternative.criticReview.summary}</p>
                    )}
                    {alternative.criticReview.improvements?.length ? (
                      <div className="mt-1 text-[9px] leading-4 text-slate-600">
                        {alternative.criticReview.improvements.slice(0, 3).map((item, index) => (
                          <div key={index}>• {item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {alternative.designRationale && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[10px] leading-4 text-emerald-900">
                    <span className="font-bold">Lógica da planta: </span>{alternative.designRationale}
                  </div>
                )}

                {alternative.clientFitSummary && (
                  <div className="mt-2 rounded-lg bg-orange-50 px-2.5 py-2 text-[10px] leading-4 text-orange-900">
                    <span className="font-bold">Por que combina com vocês: </span>{alternative.clientFitSummary}
                  </div>
                )}

                {alternative.programCompliance?.rooms?.length ? (
                  <div className="mt-2 rounded-lg border bg-slate-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-slate-700">Metragens solicitadas × projeto</span>
                      <span className={alternative.programCompliance.outsideTargetCount
                        ? "font-bold text-amber-700"
                        : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.outsideTargetCount
                          ? `${alternative.programCompliance.outsideTargetCount} fora da meta`
                          : "Dentro da meta"}
                      </span>
                    </div>
                    <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1">
                      {alternative.programCompliance.rooms.map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-2 text-[9px] text-slate-600">
                          <span className="truncate">{room.label}</span>
                          <span className={room.status === "outside_target"
                            ? "shrink-0 font-bold text-red-600"
                            : room.status === "warning"
                              ? "shrink-0 font-bold text-amber-600"
                              : "shrink-0 font-semibold text-emerald-700"}
                          >
                            {room.actualArea.toFixed(1)} / {room.targetArea.toFixed(1)} m²
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {alternative.programCompliance?.adjacency?.length ? (
                  <div className="mt-2 rounded-lg border bg-slate-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-slate-700">Relações entre ambientes</span>
                      <span className={(alternative.programCompliance.adjacencySatisfiedCount ?? 0)
                        === (alternative.programCompliance.adjacencyTotalCount ?? 0)
                          ? "font-bold text-emerald-700"
                          : "font-bold text-amber-700"}
                      >
                        {alternative.programCompliance.adjacencySatisfiedCount ?? 0}/{alternative.programCompliance.adjacencyTotalCount ?? 0} atendidas
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {alternative.programCompliance.adjacency.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between gap-2 text-[9px]">
                          <span className="min-w-0 truncate text-slate-600">
                            {rule.fromLabel} · {rule.relation === "direct" ? "conectado a" : rule.relation === "near" ? "próximo de" : "afastado de"} · {rule.toLabel}
                          </span>
                          <span className={rule.satisfied
                            ? "shrink-0 font-bold text-emerald-700"
                            : rule.required
                              ? "shrink-0 font-bold text-red-600"
                              : "shrink-0 font-bold text-amber-600"}
                          >
                            {rule.satisfied ? "OK" : rule.required ? "Corrigir" : "Preferência"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {alternative.programCompliance?.brazilianFit ? (
                  <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-teal-900">Brazilian Residential Fit</span>
                      <span className={alternative.programCompliance.brazilianFit.status === "blocked"
                        ? "font-bold text-red-600"
                        : alternative.programCompliance.brazilianFit.status === "warning"
                          ? "font-bold text-amber-600"
                          : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.brazilianFit.score}/100
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-teal-900">
                      {alternative.programCompliance.brazilianFit.context.region && alternative.programCompliance.brazilianFit.context.region !== "nao_informada"
                        ? `Região: ${alternative.programCompliance.brazilianFit.context.region} · `
                        : ""}
                      ciclo: {alternative.programCompliance.brazilianFit.context.lifeCycle ?? "atual"} ·
                      privacidade: {alternative.programCompliance.brazilianFit.context.privacySecurity ?? "equilibrada"}
                    </div>
                    {alternative.programCompliance.brazilianFit.recommendations?.length ? (
                      <div className="mt-2 space-y-1 text-[9px] leading-4 text-slate-600">
                        {alternative.programCompliance.brazilianFit.recommendations.slice(0, 4).map((item, index) => (
                          <div key={index}>• {item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {alternative.programCompliance?.costValue ? (
                  <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-emerald-900">Cost & Value Engineering</span>
                      <span className={alternative.programCompliance.costValue.status === "blocked"
                        ? "font-bold text-red-600"
                        : alternative.programCompliance.costValue.status === "warning"
                          ? "font-bold text-amber-600"
                          : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.costValue.score}/100
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-emerald-900">
                      Complexidade: {alternative.programCompliance.costValue.metrics.complexityIndex}/100 ·
                      perímetro/área: {alternative.programCompliance.costValue.metrics.perimeterAreaRatio}
                      {alternative.programCompliance.costValue.metrics.budgetPerSqmTarget
                        ? ` · orçamento-alvo ≈ R$ ${alternative.programCompliance.costValue.metrics.budgetPerSqmTarget.toLocaleString("pt-BR")}/m²`
                        : ""}
                    </div>
                    {alternative.programCompliance.costValue.valueEngineering?.length ? (
                      <div className="mt-2 space-y-1 text-[9px] leading-4 text-slate-600">
                        {alternative.programCompliance.costValue.valueEngineering.slice(0, 4).map((item, index) => (
                          <div key={index}>• {item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {alternative.programCompliance?.roofVolumetry ? (
                  <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-amber-900">Cobertura + volumetria + construtibilidade</span>
                      <span className={alternative.programCompliance.roofVolumetry.status === "blocked"
                        ? "font-bold text-red-600"
                        : alternative.programCompliance.roofVolumetry.status === "warning"
                          ? "font-bold text-amber-700"
                          : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.roofVolumetry.score}/100
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-amber-900">
                      Pavimentos superiores: {alternative.programCompliance.roofVolumetry.metrics.upperFloorCount} ·
                      áreas molhadas: {alternative.programCompliance.roofVolumetry.metrics.wetRoomCount} ·
                      complexidade: {alternative.programCompliance.roofVolumetry.metrics.wallComplexityRatio}
                    </div>
                    {alternative.programCompliance.roofVolumetry.recommendations?.length ? (
                      <div className="mt-2 space-y-1 text-[9px] leading-4 text-slate-600">
                        {alternative.programCompliance.roofVolumetry.recommendations.slice(0, 3).map((item, index) => (
                          <div key={index}>• {item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {alternative.programCompliance?.siteClimate ? (
                  <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-sky-900">Terreno + clima + implantação</span>
                      <span className={alternative.programCompliance.siteClimate.status === "blocked"
                        ? "font-bold text-red-600"
                        : alternative.programCompliance.siteClimate.status === "warning"
                          ? "font-bold text-amber-600"
                          : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.siteClimate.score}/100
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] leading-4 text-sky-900">
                      Norte: {alternative.programCompliance.siteClimate.northSide} · frente: {alternative.programCompliance.siteClimate.frontSide} · topografia: {alternative.programCompliance.siteClimate.topography}
                    </div>
                    {alternative.programCompliance.siteClimate.recommendations?.length ? (
                      <div className="mt-2 space-y-1 text-[9px] leading-4 text-slate-600">
                        {alternative.programCompliance.siteClimate.recommendations.slice(0, 3).map((item, index) => (
                          <div key={index}>• {item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {alternative.programCompliance?.furnitureFit ? (
                  <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-violet-900">Furniture Fit Engine</span>
                      <span className={alternative.programCompliance.furnitureFit.status === "blocked"
                        ? "font-bold text-red-600"
                        : alternative.programCompliance.furnitureFit.status === "warning"
                          ? "font-bold text-amber-600"
                          : "font-bold text-emerald-700"}
                      >
                        {alternative.programCompliance.furnitureFit.score}/100
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {alternative.programCompliance.furnitureFit.items.slice(0, 8).map((item) => (
                        <div key={item.roomId} className="rounded-md bg-white/80 px-2 py-1.5 text-[9px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-700">{item.label}</span>
                            <span className={item.status === "blocked"
                              ? "font-bold text-red-600"
                              : item.status === "warning"
                                ? "font-bold text-amber-600"
                                : "font-bold text-emerald-700"}
                            >
                              {item.status === "blocked" ? "Não cabe" : item.status === "warning" ? "Apertado" : "Funcional"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-slate-500">
                            {item.furniture.join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {alternative.programCompliance?.access?.length ? (
                  <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-blue-900">Circulação e portas</span>
                      <span className={(alternative.programCompliance.accessSatisfiedCount ?? 0)
                        === (alternative.programCompliance.accessTotalCount ?? 0)
                          && alternative.programCompliance.circulation?.connected !== false
                          ? "font-bold text-emerald-700"
                          : "font-bold text-red-600"}
                      >
                        {alternative.programCompliance.circulation?.connected === false
                          ? "Fluxo interrompido"
                          : `${alternative.programCompliance.accessSatisfiedCount ?? 0}/${alternative.programCompliance.accessTotalCount ?? 0} regras OK`}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {alternative.programCompliance.access.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between gap-2 text-[9px]">
                          <span className="min-w-0 truncate text-slate-600">
                            {rule.fromLabel} · {rule.mode === "required_direct" ? "porta obrigatória" : "acesso direto proibido"} · {rule.toLabel}
                          </span>
                          <span className={rule.satisfied ? "shrink-0 font-bold text-emerald-700" : "shrink-0 font-bold text-red-600"}>
                            {rule.satisfied ? "OK" : "Corrigir"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {alternative.programCompliance.circulation?.unreachableRooms?.length ? (
                      <div className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-[9px] font-semibold text-red-700">
                        Sem percurso válido: {alternative.programCompliance.circulation.unreachableRooms.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => onGenerate(alternative)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <Check className="h-4 w-4" />
                  Usar esta opção
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAlternatives(false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Alterar necessidades
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {initialProjectBrief ? "DNA do projeto" : "O que sua casa precisa?"}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              {initialProjectBrief
                ? "Este briefing continua orientando a IA durante todo o desenvolvimento. Você pode revisar as preferências sem perder as edições feitas na planta."
                : "Escolha as necessidades principais. O Arqdor desenvolve um projeto principal e o refina com crítica arquitetônica automática."}
            </p>
            {initialProjectBrief?.selectedAlternativeTitle && (
              <div className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[10px] font-bold text-orange-700 shadow-sm">
                Base atual: {initialProjectBrief.selectedAlternativeTitle}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
            <Home className="h-4 w-4" />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-900">Contexto residencial brasileiro</div>
            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              O Arqdor usa região, ciclo de vida e rotina para adaptar implantação, privacidade, serviço, expansão futura e relação com áreas externas. Isso orienta o projeto sem impor um “estilo brasileiro” genérico.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Região
            <select
              value={brazilianContext.region ?? "nao_informada"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, region: event.target.value as BrazilianResidentialContext["region"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700"
            >
              <option value="nao_informada">Não informada</option>
              <option value="norte">Norte</option>
              <option value="nordeste">Nordeste</option>
              <option value="centro_oeste">Centro-Oeste</option>
              <option value="sudeste">Sudeste</option>
              <option value="sul">Sul</option>
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Contexto do lote
            <select
              value={brazilianContext.lotContext ?? "nao_informado"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, lotContext: event.target.value as BrazilianResidentialContext["lotContext"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700"
            >
              <option value="nao_informado">Não informado</option>
              <option value="urbano">Urbano</option>
              <option value="condominio">Condomínio</option>
              <option value="rural">Rural</option>
              <option value="litoral">Litoral</option>
              <option value="serra">Serra</option>
            </select>
          </label>
          <input
            value={brazilianContext.state ?? ""}
            onChange={(event) => setBrazilianContext((current) => ({ ...current, state: event.target.value.slice(0, 40) }))}
            placeholder="Estado (ex.: SC)"
            className="h-9 rounded-lg border bg-white px-2.5 text-[10px] text-slate-700"
          />
          <input
            value={brazilianContext.city ?? ""}
            onChange={(event) => setBrazilianContext((current) => ({ ...current, city: event.target.value.slice(0, 120) }))}
            placeholder="Cidade"
            className="h-9 rounded-lg border bg-white px-2.5 text-[10px] text-slate-700"
          />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">Ciclo de vida da casa</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ["atual","Atender o momento atual"],
              ["familia_crescendo","Família crescendo"],
              ["multigeracional","Multigeracional"],
              ["envelhecer_na_casa","Envelhecer na casa"],
              ["investimento","Investimento / flexível"],
            ] as const).map(([value,label]) => (
              <ChoiceButton key={value} active={brazilianContext.lifeCycle === value}
                onClick={() => setBrazilianContext((current) => ({ ...current, lifeCycle: value }))}>{label}</ChoiceButton>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Expansão futura
            <select value={brazilianContext.expansionPriority ?? "prever"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, expansionPriority: event.target.value as BrazilianResidentialContext["expansionPriority"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">
              <option value="nao">Não é prioridade</option>
              <option value="prever">Deixar preparada</option>
              <option value="alta">É prioridade alta</option>
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Privacidade / rua
            <select value={brazilianContext.privacySecurity ?? "equilibrada"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, privacySecurity: event.target.value as BrazilianResidentialContext["privacySecurity"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">
              <option value="aberta">Mais aberta</option>
              <option value="equilibrada">Equilibrada</option>
              <option value="protegida">Mais protegida</option>
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Vida externa
            <select value={brazilianContext.outdoorLiving ?? "medio"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, outdoorLiving: event.target.value as BrazilianResidentialContext["outdoorLiving"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">
              <option value="baixo">Baixa</option>
              <option value="medio">Média</option>
              <option value="alto">Alta</option>
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Rotina de serviço
            <select value={brazilianContext.serviceRoutine ?? "tradicional"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, serviceRoutine: event.target.value as BrazilianResidentialContext["serviceRoutine"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">
              <option value="compacta">Compacta</option>
              <option value="tradicional">Tradicional</option>
              <option value="intensa">Intensa</option>
            </select>
          </label>
          <label className="col-span-2 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Perfil de veículo
            <select value={brazilianContext.vehicleProfile ?? "misto"}
              onChange={(event) => setBrazilianContext((current) => ({ ...current, vehicleProfile: event.target.value as BrazilianResidentialContext["vehicleProfile"] }))}
              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold normal-case tracking-normal text-slate-700">
              <option value="compacto">Compacto</option>
              <option value="sedan">Sedan</option>
              <option value="suv">SUV</option>
              <option value="pickup">Pickup</option>
              <option value="misto">Misto / não definido</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {([
            ["evReady","Preparar EV"],
            ["solarReady","Preparar solar"],
            ["rainwaterReady","Água de chuva"],
          ] as const).map(([key,label]) => (
            <ChoiceButton key={key} active={Boolean(brazilianContext[key])}
              onClick={() => setBrazilianContext((current) => ({ ...current, [key]: !current[key] }))}>{label}</ChoiceButton>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <BedDouble className="h-4 w-4 text-slate-500" />
          Dormitórios
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([2, 3, 4] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.bedrooms === value}
              onClick={() => updateBriefStructure((current) => ({
                ...current,
                bedrooms: value,
                suites: Math.min(current.suites, value) as ClientBrief["suites"],
              }))}
            >
              {value} quartos
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-bold text-slate-800">Suítes</div>
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.suites === value}
              onClick={() => updateBriefStructure((current) => ({ ...current, suites: value }))}
            >
              {value === 0 ? "Sem suíte" : value === 1 ? "1 suíte" : "2 suítes"}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <Layers3 className="h-4 w-4 text-slate-500" />
          Pavimentos
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton
            active={brief.floors === 1}
            onClick={() => updateBriefStructure((current) => ({ ...current, floors: 1 }))}
          >
            Casa térrea
          </ChoiceButton>
          <ChoiceButton
            active={brief.floors === 2}
            onClick={() => updateBriefStructure((current) => ({ ...current, floors: 2 }))}
          >
            Sobrado
          </ChoiceButton>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <CarFront className="h-4 w-4 text-slate-500" />
          Garagem
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as const).map((value) => (
            <ChoiceButton
              key={value}
              active={brief.garageSpaces === value}
              onClick={() => updateBriefStructure((current) => ({ ...current, garageSpaces: value }))}
            >
              {value} {value === 1 ? "vaga" : "vagas"}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-bold text-slate-800">Opcionais</div>
        <ToggleCard
          active={brief.gourmet}
          icon={ChefHat}
          title="Área gourmet"
          helper="Mantém cozinha e lazer próximos."
          onClick={() => updateBriefStructure((current) => ({ ...current, gourmet: !current.gourmet }))}
        />
        <ToggleCard
          active={brief.pool}
          icon={Waves}
          title="Piscina"
          helper="Reserva a área de lazer no fundo do lote."
          onClick={() => updateBriefStructure((current) => ({ ...current, pool: !current.pool }))}
        />
        <ToggleCard
          active={brief.office}
          icon={Laptop}
          title="Escritório"
          helper="Adiciona um ambiente dedicado para trabalho."
          onClick={() => updateBriefStructure((current) => ({ ...current, office: !current.office }))}
        />
      </section>

      <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
            <Ruler className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900">Programa de necessidades e metragens</div>
            <p className="mt-1 text-[10px] leading-4 text-slate-600">
              Informe os ambientes, m² e, quando quiser, largura × profundidade. A IA usa mobiliário, circulação e relações funcionais para transformar essas metas em espaços utilizáveis.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Área construída desejada
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={40}
              max={1200}
              step={5}
              value={brief.desiredAreaTotal ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                setBrief((current) => ({
                  ...current,
                  desiredAreaTotal: Number.isFinite(value) ? Math.max(40, Math.min(1200, value)) : undefined,
                }));
              }}
              className="w-28 rounded-lg border px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-orange-400"
            />
            <span className="text-xs font-semibold text-slate-500">m²</span>
            <span className="ml-auto text-[10px] text-slate-500">
              Úteis ≈ {Math.round(requestedProgramArea)} m² · estimado ≈ {programValidation.estimatedBuiltArea} m²
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBrief((current) => ({
              ...current,
              roomProgram: rebalanceClientRoomProgramToDesiredArea(current),
            }))}
            className="mt-2 w-full rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700 hover:bg-orange-100"
          >
            Ajustar automaticamente as metragens à área total
          </button>
          {programValidation.status !== "ok" && (
            <div className={programValidation.status === "blocked"
              ? "mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[10px] leading-4 text-red-700"
              : "mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-4 text-amber-700"}
            >
              <div className="font-bold">
                {programValidation.status === "blocked" ? "Ajuste necessário antes de gerar" : "Atenção ao programa"}
              </div>
              {[...programValidation.errors, ...programValidation.warnings].slice(0, 3).map((message) => (
                <div key={message} className="mt-1">• {message}</div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {roomProgram.map((item) => {
            const expanded = expandedRoomId === item.id;
            return (
              <div key={item.id} className="rounded-xl border bg-white p-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedRoomId(expanded ? null : item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[11px] font-bold text-slate-800">{item.label}</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">
                      {item.quantity}× · {item.targetArea.toFixed(1)} m² cada
                      {item.preferredWidth && item.preferredDepth
                        ? ` · ${item.preferredWidth.toFixed(1)} × ${item.preferredDepth.toFixed(1)} m`
                        : ""}
                      {item.required === false ? " · desejável" : " · obrigatório"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedRoomId(expanded ? null : item.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-slate-500"
                    aria-label={expanded ? `Fechar detalhes de ${item.label}` : `Editar ${item.label}`}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoomRequest(item.id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover ${item.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 border-t pt-3">
                    <div>
                      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Nome do ambiente</div>
                      <input
                        value={item.label}
                        onChange={(event) => updateRoomRequest(item.id, { label: event.target.value.slice(0, 120) })}
                        className="h-9 w-full rounded-lg border px-2.5 text-[11px] font-bold text-slate-800 outline-none focus:border-orange-400"
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                      <div>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Tipo de ambiente</div>
                        <select
                          value={item.kind}
                          onChange={(event) => updateRoomRequest(item.id, { kind: event.target.value as ClientRoomRequest["kind"] })}
                          className="h-9 w-full rounded-lg border bg-white px-2 text-[10px] font-semibold text-slate-700 outline-none focus:border-orange-400"
                        >
                          <option value="sala">Sala / estar / jantar</option>
                          <option value="cozinha">Cozinha</option>
                          <option value="suite">Suíte</option>
                          <option value="quarto">Quarto</option>
                          <option value="banheiro">Banheiro / lavabo</option>
                          <option value="lavanderia">Lavanderia</option>
                          <option value="garagem">Garagem</option>
                          <option value="gourmet">Gourmet</option>
                          <option value="piscina">Piscina</option>
                          <option value="outro">Outro / closet / despensa</option>
                        </select>
                      </div>
                      <label className="flex min-w-20 flex-col justify-end">
                        <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Prioridade</span>
                        <button
                          type="button"
                          onClick={() => updateRoomRequest(item.id, { required: item.required === false })}
                          className={item.required === false
                            ? "h-9 rounded-lg border bg-white px-2 text-[9px] font-semibold text-slate-500"
                            : "h-9 rounded-lg border border-orange-300 bg-orange-50 px-2 text-[9px] font-bold text-orange-700"}
                        >
                          {item.required === false ? "Desejável" : "Obrigatório"}
                        </button>
                      </label>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Quantidade</div>
                        <div className="flex h-9 items-center overflow-hidden rounded-lg border">
                          <button
                            type="button"
                            onClick={() => updateRoomRequest(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                            className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex-1 text-center text-xs font-bold text-slate-800">{item.quantity}</div>
                          <button
                            type="button"
                            onClick={() => updateRoomRequest(item.id, { quantity: Math.min(8, item.quantity + 1) })}
                            className="grid h-full w-9 place-items-center text-slate-500 hover:bg-slate-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">m² por ambiente</div>
                        <div className="flex h-9 items-center rounded-lg border px-2">
                          <input
                            type="number"
                            min={2.4}
                            max={120}
                            step={0.5}
                            value={item.targetArea}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value)) updateRoomRequest(item.id, { targetArea: Math.max(2.4, Math.min(120, value)) });
                            }}
                            className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-slate-800 outline-none"
                          />
                          <span className="ml-1 text-[10px] text-slate-400">m²</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Largura desejada</div>
                        <div className="flex h-9 items-center rounded-lg border px-2">
                          <input
                            type="number"
                            min={1.2}
                            max={30}
                            step={0.1}
                            value={item.preferredWidth ?? ""}
                            placeholder="IA"
                            onChange={(event) => {
                              const raw = event.target.value;
                              updateRoomRequest(item.id, {
                                preferredWidth: raw === "" ? undefined : Math.max(1.2, Math.min(30, Number(raw))),
                              });
                            }}
                            className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-slate-800 outline-none"
                          />
                          <span className="ml-1 text-[10px] text-slate-400">m</span>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Profundidade</div>
                        <div className="flex h-9 items-center rounded-lg border px-2">
                          <input
                            type="number"
                            min={1.2}
                            max={30}
                            step={0.1}
                            value={item.preferredDepth ?? ""}
                            placeholder="IA"
                            onChange={(event) => {
                              const raw = event.target.value;
                              updateRoomRequest(item.id, {
                                preferredDepth: raw === "" ? undefined : Math.max(1.2, Math.min(30, Number(raw))),
                              });
                            }}
                            className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold text-slate-800 outline-none"
                          />
                          <span className="ml-1 text-[10px] text-slate-400">m</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2">
                      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">O que este ambiente precisa ter?</div>
                      <input
                        value={item.notes ?? ""}
                        onChange={(event) => updateRoomRequest(item.id, { notes: event.target.value.slice(0, 300) })}
                        placeholder="Ex.: cama king + TV, ilha para 4 lugares, janela para o jardim..."
                        className="h-9 w-full rounded-lg border px-2.5 text-[10px] text-slate-700 outline-none focus:border-orange-400"
                      />
                    </div>

                    {brief.floors > 1 && (
                      <div className="mt-2">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">Pavimento preferido</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            ["terreo", "Térreo"],
                            ["superior", "Superior"],
                            ["qualquer", "IA decide"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateRoomRequest(item.id, { floorPreference: value })}
                              className={item.floorPreference === value
                                ? "rounded-lg border border-orange-400 bg-orange-50 px-2 py-1.5 text-[9px] font-bold text-orange-700"
                                : "rounded-lg border bg-white px-2 py-1.5 text-[9px] font-semibold text-slate-500"}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRoomRequest}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-orange-300 bg-white px-3 py-2.5 text-[11px] font-bold text-orange-700 hover:bg-orange-50"
        >
          <Plus className="h-4 w-4" />
          Adicionar outro ambiente
        </button>

        <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] leading-4 text-white">
          <span className="font-bold">Regra da IA:</span> este programa é a base do projeto. Ela deve respeitar área, dimensões preferidas e uso real do ambiente; circulação e escada podem ser criadas quando necessárias.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
            <Layers3 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900">Relações entre ambientes</div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              Diga quais espaços precisam ficar conectados, próximos ou afastados. Regras obrigatórias serão validadas na planta antes da aprovação.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {adjacencyRules.map((rule) => (
            <div key={rule.id} className="rounded-xl border bg-slate-50 p-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <select
                  value={rule.fromRequestId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    updateAdjacencyRule(rule.id, {
                      fromRequestId: nextId,
                      toRequestId: nextId === rule.toRequestId
                        ? roomProgram.find((item) => item.id !== nextId)?.id ?? rule.toRequestId
                        : rule.toRequestId,
                    });
                  }}
                  className="h-9 min-w-0 rounded-lg border bg-white px-2 text-[10px] font-semibold text-slate-700"
                >
                  {roomProgram.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>

                <select
                  value={rule.relation}
                  onChange={(event) => updateAdjacencyRule(rule.id, {
                    relation: event.target.value as ClientAdjacencyRule["relation"],
                  })}
                  className="h-9 rounded-lg border bg-white px-2 text-[9px] font-bold text-slate-700"
                  aria-label="Tipo de relação"
                >
                  <option value="direct">↔ Conectado</option>
                  <option value="near">≈ Próximo</option>
                  <option value="away">⇥ Afastado</option>
                </select>

                <select
                  value={rule.toRequestId}
                  onChange={(event) => updateAdjacencyRule(rule.id, { toRequestId: event.target.value })}
                  className="h-9 min-w-0 rounded-lg border bg-white px-2 text-[10px] font-semibold text-slate-700"
                >
                  {roomProgram
                    .filter((item) => item.id !== rule.fromRequestId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                </select>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => updateAdjacencyRule(rule.id, { required: !rule.required })}
                  className={rule.required
                    ? "rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[9px] font-bold text-orange-700"
                    : "rounded-lg border bg-white px-2.5 py-1.5 text-[9px] font-semibold text-slate-500"}
                >
                  {rule.required ? "Regra obrigatória" : "Preferência"}
                </button>
                <button
                  type="button"
                  onClick={() => removeAdjacencyRule(rule.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg border bg-white text-slate-400 hover:text-red-600"
                  aria-label="Remover relação"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={roomProgram.length < 2}
            onClick={() => setBrief((current) => ({
              ...current,
              adjacencyRules: buildRecommendedAdjacencyRules(current),
              accessRules: buildRecommendedAccessRules(current),
            }))}
            className="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-[10px] font-bold text-orange-700 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            Aplicar relações recomendadas
          </button>
          <button
            type="button"
            disabled={roomProgram.length < 2}
            onClick={addAdjacencyRule}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-[10px] font-bold text-slate-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Adicionar relação
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[9px] text-slate-500">
          <div className="rounded-lg bg-slate-50 p-2"><b>Conectado</b><br />parede/porta em comum</div>
          <div className="rounded-lg bg-slate-50 p-2"><b>Próximo</b><br />mesmo setor e curta distância</div>
          <div className="rounded-lg bg-slate-50 p-2"><b>Afastado</b><br />protege privacidade/ruído</div>
        </div>

        {accessRules.length > 0 && (
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="text-[10px] font-bold text-blue-900">Grafo de circulação e portas</div>
            <p className="mt-1 text-[9px] leading-4 text-blue-700">
              Estas regras não medem apenas proximidade: definem acessos que precisam existir ou que são proibidos no projeto.
            </p>
            <div className="mt-2 space-y-1">
              {accessRules.map((rule) => {
                const from = roomProgram.find((item) => item.id === rule.fromRequestId)?.label ?? "Ambiente";
                const to = roomProgram.find((item) => item.id === rule.toRequestId)?.label ?? "Ambiente";
                return (
                  <div key={rule.id} className="flex items-start gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-[9px] text-slate-700">
                    <span className={rule.mode === "required_direct" ? "font-bold text-emerald-700" : "font-bold text-red-600"}>
                      {rule.mode === "required_direct" ? "PORTA OBRIGATÓRIA" : "ACESSO DIRETO PROIBIDO"}
                    </span>
                    <span className="min-w-0 flex-1">{from} ↔ {to}{rule.reason ? " · " + rule.reason : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-bold text-slate-800">Preferências de organização</div>
        <ToggleCard
          active={brief.integratedKitchen}
          icon={Home}
          title="Sala e cozinha integradas"
          helper="Prioriza a área social aberta e conectada."
          onClick={() => setBrief((current) => ({ ...current, integratedKitchen: !current.integratedKitchen }))}
        />
        <ToggleCard
          active={brief.privateAwaySocial}
          icon={BedDouble}
          title="Área íntima reservada"
          helper="Afasta quartos da entrada e do convívio social."
          onClick={() => setBrief((current) => ({ ...current, privateAwaySocial: !current.privateAwaySocial }))}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="text-xs font-bold text-slate-900">Entrevista do projeto dos sonhos</div>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              A IA não vai perguntar só quantos quartos. Ela entende como vocês vivem, o que valorizam e o que querem evitar.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Pergunta {dreamStep + 1} de 6
            </span>
            <span className="text-[10px] font-semibold text-slate-500">IA arquiteta</span>
          </div>

          {dreamStep === 0 && (
            <div>
              <div className="text-xs font-bold text-slate-900">Como vocês querem viver a casa no dia a dia?</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  ["familia", "Vida em família"],
                  ["receber", "Receber amigos"],
                  ["tranquilidade", "Privacidade e calma"],
                  ["praticidade", "Praticidade"],
                  ["misto", "Um pouco de tudo"],
                ] as const).map(([value, label]) => (
                  <ChoiceButton key={value} active={vision.lifestyle === value} onClick={() => setVision((current) => ({ ...current, lifestyle: value }))}>
                    {label}
                  </ChoiceButton>
                ))}
              </div>
            </div>
          )}

          {dreamStep === 1 && (
            <div>
              <div className="text-xs font-bold text-slate-900">Qual espaço deve ser o coração da casa?</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  ["social", "Sala / convivência"],
                  ["cozinha", "Cozinha"],
                  ["gourmet", "Gourmet"],
                  ["suite", "Suíte principal"],
                  ["jardim", "Jardim / lazer"],
                ] as const).map(([value, label]) => (
                  <ChoiceButton key={value} active={vision.protagonist === value} onClick={() => setVision((current) => ({ ...current, protagonist: value }))}>
                    {label}
                  </ChoiceButton>
                ))}
              </div>
            </div>
          )}

          {dreamStep === 2 && (
            <div>
              <div className="text-xs font-bold text-slate-900">O que mais importa no projeto?</div>
              <p className="mt-1 text-[10px] text-slate-500">Escolha quantos itens fizerem sentido.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  ["luz_natural", "Muita luz natural"],
                  ["privacidade", "Privacidade"],
                  ["integracao", "Ambientes integrados"],
                  ["natureza", "Contato com natureza"],
                  ["armazenamento", "Muito armazenamento"],
                  ["flexibilidade", "Ambientes flexíveis"],
                ] as const).map(([value, label]) => {
                  const active = vision.priorities.includes(value);
                  return (
                    <ChoiceButton
                      key={value}
                      active={active}
                      onClick={() => setVision((current) => ({
                        ...current,
                        priorities: active
                          ? current.priorities.filter((item) => item !== value)
                          : [...current.priorities, value],
                      }))}
                    >
                      {label}
                    </ChoiceButton>
                  );
                })}
              </div>
            </div>
          )}

          {dreamStep === 3 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-900">Quem vai morar e como a casa precisa funcionar?</div>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Isso ajuda a IA a dimensionar convivência, privacidade, home office, acessibilidade e uso diário.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-[10px] font-semibold text-slate-600">
                  Moradores
                  <input type="number" min={1} max={12} value={household.residents ?? 1}
                    onChange={(event) => setHousehold((current) => ({ ...current, residents: Math.max(1, Math.min(12, Number(event.target.value) || 1)) }))}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-xs" />
                </label>
                <label className="text-[10px] font-semibold text-slate-600">
                  Crianças
                  <input type="number" min={0} max={8} value={household.children ?? 0}
                    onChange={(event) => setHousehold((current) => ({ ...current, children: Math.max(0, Math.min(8, Number(event.target.value) || 0)) }))}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-xs" />
                </label>
                <label className="text-[10px] font-semibold text-slate-600">
                  Idosos
                  <input type="number" min={0} max={6} value={household.elderly ?? 0}
                    onChange={(event) => setHousehold((current) => ({ ...current, elderly: Math.max(0, Math.min(6, Number(event.target.value) || 0)) }))}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-xs" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton active={household.pets === true} onClick={() => setHousehold((current) => ({ ...current, pets: !current.pets }))}>Tem animais</ChoiceButton>
                <ChoiceButton active={household.accessibilityNeeds === true} onClick={() => setHousehold((current) => ({ ...current, accessibilityNeeds: !current.accessibilityNeeds }))}>Precisa acessibilidade</ChoiceButton>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Home office</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["nao","Não"],["ocasional","Ocasional"],["frequente","Frequente"]] as const).map(([value,label]) => (
                    <ChoiceButton key={value} active={household.workFromHome === value} onClick={() => setHousehold((current) => ({ ...current, workFromHome: value }))}>{label}</ChoiceButton>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Receber amigos e família</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["baixa","Pouco"],["media","Às vezes"],["alta","Frequentemente"]] as const).map(([value,label]) => (
                    <ChoiceButton key={value} active={household.hostingFrequency === value} onClick={() => setHousehold((current) => ({ ...current, hostingFrequency: value }))}>{label}</ChoiceButton>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Uso da cozinha</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["pratico","Prático"],["cotidiano","Cozinho no dia a dia"],["intenso","Cozinha é protagonista"]] as const).map(([value,label]) => (
                    <ChoiceButton key={value} active={household.cookingProfile === value} onClick={() => setHousehold((current) => ({ ...current, cookingProfile: value }))}>{label}</ChoiceButton>
                  ))}
                </div>
              </div>
              <textarea value={household.routineNotes ?? ""}
                onChange={(event) => setHousehold((current) => ({ ...current, routineNotes: event.target.value.slice(0, 700) }))}
                placeholder="Conte algo importante da rotina: horários, receber pessoas, cozinhar, crianças, hobbies..."
                className="min-h-20 w-full rounded-xl border px-3 py-2 text-xs outline-none" />
            </div>
          )}

          {dreamStep === 4 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-900">Como é o terreno e o que devemos aproveitar ou proteger?</div>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Mesmo quando alguns dados ainda não são conhecidos, registre o que você sabe. A implantação usará isso como diretriz.
                </p>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Norte do terreno</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["nao_informado","Não sei"],["top","Superior"],["bottom","Inferior"],["left","Esquerda"],["right","Direita"]] as const).map(([value,label]) => (
                    <ChoiceButton key={value} active={siteContext.northSide === value} onClick={() => setSiteContext((current) => ({ ...current, northSide: value }))}>{label}</ChoiceButton>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Topografia</div>
                <div className="grid grid-cols-3 gap-2">
                  {([["nao_informado","Não sei"],["plano","Plano"],["declive","Declive"],["aclive","Aclive"],["irregular","Irregular"]] as const).map(([value,label]) => (
                    <ChoiceButton key={value} active={siteContext.topography === value} onClick={() => setSiteContext((current) => ({ ...current, topography: value }))}>{label}</ChoiceButton>
                  ))}
                </div>
              </div>
              <textarea value={siteContext.desiredViews ?? ""}
                onChange={(event) => setSiteContext((current) => ({ ...current, desiredViews: event.target.value.slice(0, 500) }))}
                placeholder="Vistas que gostaria de valorizar: jardim, piscina, pôr do sol, paisagem..."
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none" />
              <textarea value={siteContext.privacyNotes ?? ""}
                onChange={(event) => setSiteContext((current) => ({ ...current, privacyNotes: event.target.value.slice(0, 500) }))}
                placeholder="Privacidade, vizinhos, rua ou pontos que devem ficar protegidos"
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none" />
            </div>
          )}

          {dreamStep === 5 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-900">Agora me conte o que faria essa casa ser realmente de vocês.</div>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  Pode escrever de forma natural. Ex.: “quero ver a piscina da cozinha”, “não quero corredor comprido”, “preciso pensar em filhos no futuro”.
                </p>
              </div>
              <textarea
                value={vision.mustHave}
                onChange={(event) => setVision((current) => ({ ...current, mustHave: event.target.value.slice(0, 700) }))}
                placeholder="O que não pode faltar?"
                className="min-h-20 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              />
              <textarea
                value={vision.avoid}
                onChange={(event) => setVision((current) => ({ ...current, avoid: event.target.value.slice(0, 500) }))}
                placeholder="O que você não quer no projeto?"
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              />
              <textarea
                value={vision.futureNeeds}
                onChange={(event) => setVision((current) => ({ ...current, futureNeeds: event.target.value.slice(0, 500) }))}
                placeholder="Como sua família ou rotina pode mudar nos próximos anos?"
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              />
              <textarea
                value={vision.aestheticReferences ?? ""}
                onChange={(event) => setVision((current) => ({ ...current, aestheticReferences: event.target.value.slice(0, 700) }))}
                placeholder="Referências estéticas: estilos, casas, arquitetos, sensações ou imagens que representam o que vocês gostam"
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              />
              <textarea
                value={vision.preferredMaterials ?? ""}
                onChange={(event) => setVision((current) => ({ ...current, preferredMaterials: event.target.value.slice(0, 500) }))}
                placeholder="Materiais que gostam ou querem evitar"
                className="min-h-16 w-full rounded-xl border px-3 py-2 text-xs outline-none"
              />
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Método construtivo</div>
                <select
                  value={vision.constructionMethod ?? "nao_definido"}
                  onChange={(event) => setVision((current) => ({ ...current, constructionMethod: event.target.value as ClientVision["constructionMethod"] }))}
                  className="w-full rounded-xl border bg-white px-3 py-2 text-xs"
                >
                  <option value="nao_definido">Ainda não definido</option>
                  <option value="icf">ICF</option>
                  <option value="alvenaria">Alvenaria convencional</option>
                  <option value="alvenaria_estrutural">Alvenaria estrutural</option>
                  <option value="steel_frame">Steel frame</option>
                  <option value="wood_frame">Wood frame</option>
                  <option value="concreto">Concreto</option>
                  <option value="pre_fabricado">Pré-fabricado</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </div>
              <label className="block text-[10px] font-bold text-slate-700">
                Orçamento-alvo da obra (opcional)
                <input
                  type="number"
                  min={0}
                  step={10000}
                  value={vision.budgetTarget ?? ""}
                  onChange={(event) => setVision((current) => ({ ...current, budgetTarget: Number(event.target.value) > 0 ? Number(event.target.value) : undefined }))}
                  placeholder="Ex.: 750000"
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                />
              </label>
              <div>
                <div className="mb-2 text-[10px] font-bold text-slate-700">Na hora de decidir, a prioridade é:</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["otimizar", "Otimizar custo"],
                    ["equilibrar", "Equilibrar"],
                    ["priorizar_experiencia", "Priorizar experiência"],
                  ] as const).map(([value, label]) => (
                    <ChoiceButton key={value} active={vision.budgetStrategy === value} onClick={() => setVision((current) => ({ ...current, budgetStrategy: value }))}>
                      {label}
                    </ChoiceButton>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDreamStep((current) => Math.max(0, current - 1))}
              disabled={dreamStep === 0}
              className="rounded-lg border bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-35"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => setDreamStep((current) => Math.min(5, current + 1))}
              disabled={dreamStep === 5}
              className="rounded-lg bg-slate-950 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-35"
            >
              Próxima pergunta
            </button>
          </div>
        </div>
      </section>

      <div className="rounded-xl border bg-slate-50 p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Resumo</div>
        <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-700">{summary}</div>
        <div className="mt-2 text-[10px] leading-4 text-slate-500">
          Estilo de vida: {vision.lifestyle} · coração da casa: {vision.protagonist} · prioridades: {vision.priorities.length} · briefing {assessProjectBriefCompleteness({
            brief,
            vision,
            household,
            siteContext: { ...siteContext, frontSide: placement?.frontSide ?? siteContext.frontSide },
            brazilianContext,
          })}% completo
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-800">Como a IA deve evoluir o projeto?</div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            O modo muda a liberdade arquitetônica, mas nunca libera a IA para ignorar o briefing ou a funcionalidade.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([
              ["preservar", "Preservar"],
              ["otimizar", "Otimizar"],
              ["valorizar", "Valorizar"],
              ["assinatura", "Assinatura"],
            ] as const).map(([value, label]) => (
              <ChoiceButton
                key={value}
                active={intervention === value}
                onClick={() => setIntervention(value)}
              >
                {label}
              </ChoiceButton>
            ))}
          </div>
          <div className="mt-2 text-[10px] leading-4 text-slate-500">
            {intervention === "preservar" && "Corrige problemas mantendo quase toda a organização atual."}
            {intervention === "otimizar" && "Melhora circulação, ergonomia, adjacências e eficiência."}
            {intervention === "valorizar" && "Fortalece partido, luz, integração e identidade arquitetônica."}
            {intervention === "assinatura" && "Busca uma solução mais autoral e marcante, sem perder construtibilidade."}
          </div>
        </section>

      <button
        type="button"
        onClick={initialProjectBrief ? improveCurrentModel : generateSpecialistAlternatives}
        disabled={generating || (!initialProjectBrief && programValidation.status === "blocked")}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" />
        {generating
          ? initialProjectBrief
            ? "IA arquiteta melhorando o modelo atual..."
            : "IA arquiteta estudando o projeto..."
          : initialProjectBrief
            ? "Melhorar este modelo com o briefing"
            : "Desenvolver meu projeto com IA arquiteta"}
      </button>

      <p className="text-center text-[10px] leading-4 text-slate-400">
        {initialProjectBrief
          ? "A IA trabalha sobre o modelo atual. Ela não cria três plantas novas e preserva as edições já feitas sempre que forem compatíveis com o briefing."
          : programValidation.status === "blocked"
            ? "Revise os avisos do programa de necessidades. A IA só será liberada quando área, cômodos e metragens forem compatíveis."
            : "A IA cria uma base principal coerente; depois você pode editar medidas, portas, janelas, cobertura, fachada e materiais sem perder o DNA do projeto."}
      </p>
    </div>
  );
}
