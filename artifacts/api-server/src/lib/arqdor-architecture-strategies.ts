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
    "CONSTRUCTABILITY:",
    ...CONSTRUCTABILITY_STRATEGIES.map((item) => `- ${item}`),
    "",
    "ANTI-GENERIC RULE: do not add a patio, L-shape, portal, slats, pergola, double-height space, large glass panel or shifted volume merely because it looks contemporary. Every move must have a stated reason tied to the client, site, climate, circulation, privacy, view or construction.",
  ].join("\n");
}
