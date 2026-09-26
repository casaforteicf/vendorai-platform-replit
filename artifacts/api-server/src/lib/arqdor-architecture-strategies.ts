export type ArchitecturalInterventionMode = "preservar" | "otimizar" | "valorizar" | "assinatura";

type StrategyContext = {
  intervention: ArchitecturalInterventionMode;
  vision?: {
    lifestyle?: string;
    protagonist?: string;
    priorities?: string[];
    budgetStrategy?: string;
    futureNeeds?: string;
    mustHave?: string;
    avoid?: string;
    constructionMethod?: string;
    tasteDNA?: {
      massing?: string;
      roofExpression?: string;
      openness?: string;
      symmetry?: string;
      warmth?: string;
      materialDensity?: string;
      landscaping?: string;
      streetExpression?: string;
      preferredMoves?: string[];
      dislikedMoves?: string[];
      learnedSignals?: Array<{ signal?: string; weight?: number }>;
    };
  } | null;
  brazilianContext?: {
    region?: string;
    lotContext?: string;
    lifeCycle?: string;
    expansionPriority?: string;
    outdoorLiving?: string;
    serviceRoutine?: string;
    privacySecurity?: string;
    vehicleProfile?: string;
    evReady?: boolean;
    solarReady?: boolean;
    rainwaterReady?: boolean;
  } | null;
};

const PARTY_STRATEGIES = [
  "linear spine: organize the house around a clear circulation/service spine with rooms opening to light and landscape",
  "L-shaped courtyard: use two wings to define a protected garden/leisure court and strengthen indoor-outdoor continuity",
  "central patio: use a real patio/light court as an environmental and spatial organizer, never as decorative leftover space",
  "social core: make living/dining/kitchen the spatial heart while keeping private and service sectors legible",
  "paired wings: separate social/service and private wings with a clear hinge such as hall, patio or stair",
  "shifted volumes: use controlled offsets only when they improve shade, privacy, views, entrance hierarchy or outdoor rooms",
  "visual axis: establish one or two meaningful sightlines from entrance/social spaces toward garden, pool or landscape",
] as const;

const EXPERIENCE_STRATEGIES = [
  "compression and release: a protected/contained arrival that opens into a brighter, wider social space",
  "framed view: align important rooms and openings to frame garden, pool or a deliberate focal point",
  "graduated privacy: transition from public to semi-private to private spaces without abrupt exposure",
  "threshold rooms: use veranda, covered terrace, patio or canopy as true transition spaces between inside and outside",
  "ceiling/volume hierarchy: reserve stronger spatial height or volume expression for the protagonist space instead of applying it everywhere",
  "continuous social edge: allow living, dining, kitchen and gourmet to share a coherent relationship with the outdoor leisure area",
] as const;

const CLIMATE_STRATEGIES = [
  "prioritize useful daylight from perimeter walls and patios while avoiding unnecessarily deep dark rooms",
  "use shading logic appropriate to openings: eaves, canopies, fins, recessed glazing or vegetation only when architecturally justified",
  "promote cross-ventilation opportunities through opposite or adjacent openings where the geometry allows",
  "avoid large unprotected glazed areas as a purely visual gesture",
  "keep wet areas reasonably grouped to improve constructibility and future maintenance",
] as const;

const FACADE_STRATEGIES = [
  "derive facade hierarchy from the plan: entrance, garage, social openings and private openings must read differently for a reason",
  "use a dominant composition plus one or two supporting moves; avoid stacking unrelated decorative gestures",
  "use depth, reveals, canopies, portals and material transitions to express real spatial/solar functions",
  "coordinate opening rhythm with internal rooms instead of forcing symmetry that contradicts the plan",
  "let roof/parapet geometry reinforce the massing rather than act as an independent decorative cap",
  "keep material palette restrained and use accent material at architectural moments, not scattered patches",
] as const;

const CONSTRUCTABILITY_STRATEGIES = [
  "prefer aligned structural/wet zones and rational spans over gratuitous zig-zags",
  "control perimeter-to-area ratio unless an offset creates measurable spatial, climatic or privacy value",
  "avoid tiny residual rooms, unusable corners and circulation disguised as oversized halls",
  "keep stairs stacked and landings plausible; reserve enough clear dimension around doors and furniture",
] as const;

function prioritize<T extends string>(items: readonly T[], preferred: T[]) {
  return [...preferred, ...items.filter((item) => !preferred.includes(item))];
}

export function buildArchitecturalStrategyRepertoire(ctx: StrategyContext): string {
  const vision = ctx.vision ?? {};
  const priorities = new Set(vision.priorities ?? []);
  const protagonist = vision.protagonist ?? "social";
  const lifestyle = vision.lifestyle ?? "misto";
  const budget = vision.budgetStrategy ?? "equilibrar";
  const constructionMethod = vision.constructionMethod ?? "nao_definido";
  const constructionGuidance: string[] = [];
  if (constructionMethod === "icf") {
    constructionGuidance.push("ICF: prioritize continuous/aligned wall logic, repetitive openings, grouped wet zones and low fragmentation.");
  } else if (constructionMethod === "alvenaria_estrutural") {
    constructionGuidance.push("Structural masonry: prioritize modular dimensions, vertical wall alignment, restrained openings and minimal cantilevers.");
  } else if (constructionMethod === "steel_frame") {
    constructionGuidance.push("Light Steel Frame: prioritize panel/grid repetition, aligned walls, coordinated openings and low geometric fragmentation.");
  } else if (constructionMethod === "wood_frame") {
    constructionGuidance.push("Wood Frame: prioritize panel/grid repetition, protected wet interfaces and compact installation paths.");
  } else if (constructionMethod === "concreto") {
    constructionGuidance.push("Reinforced concrete: organize a plausible column/beam grid, concentrate large spans and align vertical cores.");
  } else if (constructionMethod === "pre_fabricado") {
    constructionGuidance.push("Prefabricated: prioritize repeated bays/components, simple transportable geometry and few exceptional interfaces.");
  } else if (constructionMethod === "hibrido") {
    constructionGuidance.push("Hybrid: make system transitions explicit and concentrated instead of scattering interfaces throughout the plan.");
  } else if (constructionMethod === "alvenaria") {
    constructionGuidance.push("Conventional masonry: keep spans and wall geometry rational while preserving flexibility for an independent structural frame.");
  } else {
    constructionGuidance.push("Construction system undefined: keep geometry structurally conservative and avoid decisions that force one expensive system.");
  }
  const taste = vision.tasteDNA ?? {};
  const tasteGuidance: string[] = [];
  if (taste.massing && taste.massing !== "neutro") tasteGuidance.push(`Massing preference: ${taste.massing}.`);
  if (taste.roofExpression && taste.roofExpression !== "neutro") tasteGuidance.push(`Roof expression preference: ${taste.roofExpression}.`);
  if (taste.openness) tasteGuidance.push(`Openness preference: ${taste.openness}.`);
  if (taste.symmetry) tasteGuidance.push(`Composition preference: ${taste.symmetry}.`);
  if (taste.warmth) tasteGuidance.push(`Visual warmth: ${taste.warmth}.`);
  if (taste.materialDensity) tasteGuidance.push(`Material density: ${taste.materialDensity}.`);
  if (taste.landscaping) tasteGuidance.push(`Landscaping intensity: ${taste.landscaping}.`);
  if (taste.streetExpression) tasteGuidance.push(`Street expression: ${taste.streetExpression}.`);
  for (const move of taste.preferredMoves ?? []) tasteGuidance.push(`Prefer when justified: ${move}`);
  for (const move of taste.dislikedMoves ?? []) tasteGuidance.push(`Avoid unless functionally necessary: ${move}`);
  const positiveSignals = (taste.learnedSignals ?? []).filter((item) => Number(item.weight) > 0.35).slice(-5);
  const negativeSignals = (taste.learnedSignals ?? []).filter((item) => Number(item.weight) < -0.35).slice(-5);
  for (const item of positiveSignals) if (item.signal) tasteGuidance.push(`Learned positive signal: ${item.signal}`);
  for (const item of negativeSignals) if (item.signal) tasteGuidance.push(`Learned negative signal: ${item.signal}`);
  const brazil = ctx.brazilianContext ?? {};
  const regional: string[] = [];
  if (brazil.region && brazil.region !== "nao_informada") {
    regional.push(`Regional context: ${brazil.region}. Use this only as climate/culture context; never stereotype the house.`);
  }
  if (brazil.lotContext && brazil.lotContext !== "nao_informado") {
    regional.push(`Lot context: ${brazil.lotContext}. Adapt street relationship, privacy, outdoor space and access accordingly.`);
  }
  if (brazil.lifeCycle === "familia_crescendo") {
    regional.push("Life-cycle: growing family — favor adaptable rooms, expansion logic and durable circulation.");
  } else if (brazil.lifeCycle === "multigeracional") {
    regional.push("Life-cycle: multigenerational — provide autonomy, privacy and preferably a ground-floor sleeping/bathroom strategy when compatible with the brief.");
  } else if (brazil.lifeCycle === "envelhecer_na_casa") {
    regional.push("Life-cycle: ageing in place — reduce level changes, anticipate accessible circulation and make a future ground-floor full bathroom/sleeping option possible.");
  } else if (brazil.lifeCycle === "investimento") {
    regional.push("Life-cycle: investment — prioritize rational construction, flexible rooms, robust maintenance and broad future usability.");
  }
  if (brazil.expansionPriority === "alta" || brazil.expansionPriority === "prever") {
    regional.push("Evolution strategy: reserve a plausible future expansion path without damaging current daylight, circulation or leisure space.");
  }
  if (brazil.outdoorLiving === "alto") {
    regional.push("Outdoor living is important: strengthen shaded transition spaces and real social connection to yard/gourmet/pool.");
  }
  if (brazil.serviceRoutine === "tradicional" || brazil.serviceRoutine === "intensa") {
    regional.push("Service routine matters: treat laundry, drying, pantry/utility and discreet service access as real program, not residual space.");
  }
  if (brazil.privacySecurity === "protegida") {
    regional.push("Street privacy/security priority: control direct views into private/social interiors, distinguish pedestrian/vehicle access and avoid exposed bedroom openings.");
  }
  if (brazil.vehicleProfile === "suv" || brazil.vehicleProfile === "pickup" || brazil.vehicleProfile === "misto") {
    regional.push(`Vehicle profile: ${brazil.vehicleProfile}. Check realistic parking envelope, door opening and maneuvering rather than generic parking dimensions.`);
  }
  if (brazil.evReady) regional.push("Prepare garage/electrical strategy for future EV charging without making it a decorative feature.");
  if (brazil.solarReady) regional.push("Keep roof orientation/obstructions compatible with future photovoltaic installation where site geometry allows.");
  if (brazil.rainwaterReady) regional.push("Keep roof drainage and technical area compatible with future rainwater harvesting where appropriate.");

  let party = [...PARTY_STRATEGIES];
  if (protagonist === "jardim") {
    party = prioritize(party, [PARTY_STRATEGIES[1], PARTY_STRATEGIES[2], PARTY_STRATEGIES[6]]);
  } else if (protagonist === "gourmet" || protagonist === "social" || protagonist === "cozinha") {
    party = prioritize(party, [PARTY_STRATEGIES[3], PARTY_STRATEGIES[1], PARTY_STRATEGIES[6]]);
  } else if (protagonist === "suite") {
    party = prioritize(party, [PARTY_STRATEGIES[4], PARTY_STRATEGIES[6], PARTY_STRATEGIES[0]]);
  }

  let experience = [...EXPERIENCE_STRATEGIES];
  if (priorities.has("privacidade")) {
    experience = prioritize(experience, [EXPERIENCE_STRATEGIES[2], EXPERIENCE_STRATEGIES[1]]);
  }
  if (priorities.has("integracao") || lifestyle === "receber") {
    experience = prioritize(experience, [EXPERIENCE_STRATEGIES[5], EXPERIENCE_STRATEGIES[3], EXPERIENCE_STRATEGIES[1]]);
  }
  if (priorities.has("natureza")) {
    experience = prioritize(experience, [EXPERIENCE_STRATEGIES[1], EXPERIENCE_STRATEGIES[3]]);
  }

  const freedom = ctx.intervention === "assinatura"
    ? "You may use a stronger architectural move, but it must solve a real functional, climatic, privacy or experiential objective."
    : ctx.intervention === "valorizar"
      ? "Use one clear architectural idea and a small number of supporting moves. Avoid gratuitous complexity."
      : ctx.intervention === "otimizar"
        ? "Prefer subtle spatial improvements over major formal gestures."
        : "Use this repertoire only to diagnose/correct; preserve the existing organization whenever possible.";

  const cost = budget === "otimizar"
    ? "Cost strategy: favor compact massing, grouped wet areas, simple spans and fewer facade/roof breaks."
    : budget === "priorizar_experiencia"
      ? "Cost strategy: allow selective investment in the protagonist space, threshold, facade depth or landscape connection; keep the rest rational."
      : "Cost strategy: balance spatial quality with rational geometry and construction.";

  return [
    "ARQDOR ARCHITECTURAL REPERTOIRE — use as strategies, NEVER as templates to copy:",
    freedom,
    cost,
    "",
    "CLIENT TASTE DNA (preference layer; never override function/site/cost):",
    ...(tasteGuidance.length ? tasteGuidance.map((item) => `- ${item}`) : ["- No detailed Taste DNA supplied; infer cautiously from explicit references only."]),
    "",
    "BRAZILIAN RESIDENTIAL CONTEXT (principles, never stereotypes):",
    ...(regional.length ? regional.map((item) => `- ${item}`) : ["- No regional/life-cycle context supplied; do not invent one."]),
    "",
    "PARTY / MASSING OPTIONS (select only what truly fits the brief):",
    ...party.slice(0, ctx.intervention === "assinatura" ? 7 : 5).map((item) => `- ${item}`),
    "",
    "SPATIAL EXPERIENCE:",
    ...experience.slice(0, 5).map((item) => `- ${item}`),
    "",
    "CLIMATE / DAYLIGHT:",
    ...CLIMATE_STRATEGIES.map((item) => `- ${item}`),
    "",
    "FACADE LOGIC:",
    ...FACADE_STRATEGIES.map((item) => `- ${item}`),
    "",
    "CONSTRUCTION SYSTEM:",
    ...constructionGuidance.map((item) => `- ${item}`),
    "",
    "CONSTRUCTABILITY:",
    ...CONSTRUCTABILITY_STRATEGIES.map((item) => `- ${item}`),
    "",
    "ANTI-GENERIC RULE: do not add a patio, L-shape, portal, slats, pergola, double-height space, large glass panel or shifted volume merely because it looks contemporary. Every move must have a stated reason tied to the client, site, climate, circulation, privacy, view or construction.",
  ].join("\n");
}
