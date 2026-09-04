import { randomInt, randomUUID } from "crypto";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { editVendorAiImageReference } from "./vendorai-ai-image-tools.js";
import {
  createProcessingMediaProject,
  registerGeneratedMediaOutput,
} from "./media-library.js";

const objectStorage = new ObjectStorageService();

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export type MercosulMarketCode = "BR" | "PY" | "AR" | "UY" | "BO";

export type DubleStyleSelection = {
  market: MercosulMarketCode;
  scenario: string;
  outfit: string;
  framing: string;
  pose: string;
  lighting: string;
};

export type DubleStyleSelectionInput = Partial<DubleStyleSelection> & {
  antiRepeat?: boolean;
  useFavorite?: boolean;
};

type CatalogItem = {
  id: string;
  label: string;
  prompt: string;
};

type MarketDefinition = {
  code: MercosulMarketCode;
  name: string;
  locale: string;
  language: "pt" | "es";
  currency: string;
  region: "MERCOSUL";
  culturalPrompt: string;
};

export class DubleStyleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DubleStyleValidationError";
  }
}

export class DubleStyleConsentError extends Error {
  constructor(public readonly missingScopes: string[]) {
    super(`Consentimentos ausentes: ${missingScopes.join(", ")}`);
    this.name = "DubleStyleConsentError";
  }
}

export const MERCOSUL_MARKETS: Record<MercosulMarketCode, MarketDefinition> = {
  BR: {
    code: "BR",
    name: "Brasil",
    locale: "pt-BR",
    language: "pt",
    currency: "BRL",
    region: "MERCOSUL",
    culturalPrompt: "Contemporary Brazilian commercial and professional context, with subtle locally plausible architecture, materials, daylight and business atmosphere. Avoid flags, tourist clichés, carnival imagery, football symbolism or stereotyped regional costumes unless explicitly requested.",
  },
  PY: {
    code: "PY",
    name: "Paraguai",
    locale: "es-PY",
    language: "es",
    currency: "PYG",
    region: "MERCOSUL",
    culturalPrompt: "Contemporary Paraguayan commercial and professional context, plausible for Asunción or other urban business areas, with warm-climate daylight and understated local architectural cues. Do not add text, flags, folkloric costumes or border-shopping clichés unless explicitly requested.",
  },
  AR: {
    code: "AR",
    name: "Argentina",
    locale: "es-AR",
    language: "es",
    currency: "ARS",
    region: "MERCOSUL",
    culturalPrompt: "Contemporary Argentine commercial and professional context, with subtle Southern Cone urban design cues and realistic office, retail or industrial environments. Avoid flags, tango imagery, football symbolism, gaucho stereotypes or tourist landmarks unless explicitly requested.",
  },
  UY: {
    code: "UY",
    name: "Uruguai",
    locale: "es-UY",
    language: "es",
    currency: "UYU",
    region: "MERCOSUL",
    culturalPrompt: "Contemporary Uruguayan commercial and professional context, understated and modern, with plausible Montevideo or regional urban/coastal design cues when relevant. Avoid flags, football symbolism, mate clichés or tourist landmarks unless explicitly requested.",
  },
  BO: {
    code: "BO",
    name: "Bolívia",
    locale: "es-BO",
    language: "es",
    currency: "BOB",
    region: "MERCOSUL",
    culturalPrompt: "Contemporary Bolivian commercial and professional context, adapted to a plausible modern urban environment and local climate without caricature. Avoid flags, folkloric costumes, indigenous stereotypes, mountain-tourism clichés or political symbols unless explicitly requested.",
  },
};

const SCENARIOS: CatalogItem[] = [
  { id: "escritorio-contemporaneo", label: "Escritório contemporâneo", prompt: "a contemporary professional office with clean furniture, realistic work surfaces and subtle depth" },
  { id: "sala-reuniao", label: "Sala de reunião", prompt: "a modern meeting room with a professional table, chairs and understated business atmosphere" },
  { id: "showroom", label: "Showroom", prompt: "a premium product showroom with realistic display areas and uncluttered commercial design" },
  { id: "loja-varejo", label: "Loja de varejo", prompt: "a contemporary retail store interior with organized shelving and realistic customer-facing ambience" },
  { id: "obra-construcao", label: "Obra / construção", prompt: "a clean active construction-site context with realistic unfinished surfaces and safe working environment, without fabricated company logos" },
  { id: "fabrica", label: "Fábrica", prompt: "a modern factory floor with realistic machinery in the background, orderly and safe, with depth of field" },
  { id: "distribuidora", label: "Distribuidora", prompt: "a professional distribution warehouse with organized racks, cartons and logistics context" },
  { id: "home-office", label: "Home office", prompt: "a polished but believable home office with desk, neutral décor and natural daylight" },
  { id: "recepcao", label: "Recepção", prompt: "a contemporary business reception area with clean counter, seating and professional ambience" },
  { id: "estudio-clean", label: "Estúdio clean", prompt: "a clean neutral studio with subtle gradient background and realistic floor contact, suitable for commercial spokesperson video" },
  { id: "area-urbana", label: "Área urbana", prompt: "a contemporary urban business district background with realistic architecture and shallow depth of field" },
  { id: "cafeteria", label: "Cafeteria", prompt: "a tasteful contemporary café interior, warm but professional, with realistic furniture and natural activity in soft focus" },
  { id: "loja-materiais-construcao", label: "Loja de materiais de construção", prompt: "a modern building-materials store with organized displays of construction products, no invented brand text" },
  { id: "corretora-seguros", label: "Corretora de seguros", prompt: "a trustworthy insurance brokerage office with calm professional design and discreet meeting area" },
  { id: "showroom-piscinas", label: "Showroom de piscinas", prompt: "a premium pool and outdoor-living showroom with water, stone and landscape samples in a realistic commercial setting" },
  { id: "fabrica-esquadrias", label: "Fábrica de esquadrias", prompt: "a modern window and door manufacturing environment with profiles, frames and machinery arranged realistically" },
  { id: "distribuidora-autopecas", label: "Distribuidora de autopeças", prompt: "an organized automotive-parts distribution environment with shelves and generic parts, no fabricated trademarks" },
  { id: "farmacia", label: "Farmácia", prompt: "a contemporary pharmacy retail environment with organized generic shelves and clean customer-service ambience, no medication claims or invented brand text" },
  { id: "imobiliaria", label: "Imobiliária", prompt: "a contemporary real-estate office with professional desk, architectural imagery without readable text and calm client-facing ambience" },
  { id: "evento-corporativo", label: "Evento corporativo", prompt: "a modern corporate event environment with subtle stage or networking ambience, no fabricated logos or readable signage" },
];

const OUTFITS: CatalogItem[] = [
  { id: "blazer-neutro", label: "Blazer neutro", prompt: "a well-fitted neutral blazer with understated professional styling" },
  { id: "camisa-social-clara", label: "Camisa social clara", prompt: "a clean light-colored business shirt with realistic fabric" },
  { id: "camisa-social-escura", label: "Camisa social escura", prompt: "a clean dark business shirt with understated professional styling" },
  { id: "polo-premium", label: "Polo premium", prompt: "a premium solid-color polo shirt without logos" },
  { id: "camiseta-premium", label: "Camiseta premium", prompt: "a high-quality solid-color premium T-shirt with refined fit and no logos" },
  { id: "tricot-smart-casual", label: "Tricô smart casual", prompt: "a refined lightweight knit top suitable for smart-casual business use" },
  { id: "terno-azul", label: "Terno azul-marinho", prompt: "a contemporary navy business suit with understated tailoring" },
  { id: "terno-grafite", label: "Terno grafite", prompt: "a contemporary charcoal business suit with understated tailoring" },
  { id: "blazer-camiseta", label: "Blazer + camiseta", prompt: "a modern blazer over a premium plain T-shirt, polished smart-casual styling" },
  { id: "blazer-camisa", label: "Blazer + camisa", prompt: "a modern blazer over a clean business shirt, professional and approachable" },
  { id: "colete-social", label: "Colete social", prompt: "a refined business waistcoat layered over a plain shirt, no logos" },
  { id: "jaqueta-corporativa", label: "Jaqueta corporativa neutra", prompt: "a clean lightweight corporate-style jacket with no brand marks" },
  { id: "varejo-profissional", label: "Varejo profissional", prompt: "a neat customer-service retail outfit, contemporary and brand-neutral" },
  { id: "atendimento-premium", label: "Atendimento premium", prompt: "a polished customer-facing outfit with refined neutral pieces and no logos" },
  { id: "showroom-profissional", label: "Showroom profissional", prompt: "a stylish professional showroom outfit balancing authority and approachability" },
  { id: "seguros-consultivo", label: "Seguros / consultivo", prompt: "a trustworthy consultative business outfit with understated formal styling" },
  { id: "imobiliario", label: "Imobiliário", prompt: "a polished real-estate professional outfit, contemporary and approachable" },
  { id: "tecnologia", label: "Tecnologia", prompt: "a modern technology-company smart-casual outfit with clean neutral pieces" },
  { id: "marketing", label: "Marketing / criativo", prompt: "a contemporary creative-professional outfit with restrained modern styling" },
  { id: "consultoria", label: "Consultoria", prompt: "a refined consulting outfit with business-casual tailoring and neutral palette" },
  { id: "engenharia-casual", label: "Engenharia / obra casual", prompt: "a practical clean engineering-site outfit suitable for an office-to-site context, without fake credentials" },
  { id: "obra-epi", label: "Obra com EPI genérico", prompt: "a clean professional construction outfit with generic safety vest and helmet, no company logos, certifications or readable labels" },
  { id: "fabrica-operacional", label: "Fábrica operacional", prompt: "a clean generic industrial work outfit appropriate for a safe factory environment, no logos" },
  { id: "logistica", label: "Logística", prompt: "a practical professional logistics outfit suitable for warehouse operations, brand-neutral" },
  { id: "distribuidora", label: "Distribuidora", prompt: "a clean practical distribution-business outfit balancing operational and commercial roles" },
  { id: "autopecas", label: "Autopeças", prompt: "a clean automotive-parts commercial outfit, durable and professional, with no brand marks" },
  { id: "materiais-construcao", label: "Materiais de construção", prompt: "a practical customer-facing building-materials store outfit, neat and brand-neutral" },
  { id: "piscinas", label: "Piscinas / área externa", prompt: "a refined warm-weather professional outfit suitable for pool and outdoor-living sales" },
  { id: "farmacia-varejo", label: "Farmácia / varejo", prompt: "a clean pharmacy retail customer-service outfit without medical credentials, lab coat, logos or professional-title implications" },
  { id: "saude-administrativo", label: "Saúde administrativo", prompt: "a clean administrative healthcare-business outfit without clinical uniforms, credentials or medical claims" },
  { id: "gastronomia-smart", label: "Gastronomia smart casual", prompt: "a polished hospitality smart-casual outfit suitable for a customer-facing business setting" },
  { id: "cafe-casual", label: "Café casual", prompt: "a neat contemporary casual outfit suitable for a café business environment" },
  { id: "evento-corporativo", label: "Evento corporativo", prompt: "a polished corporate-event outfit suitable for networking and presentations" },
  { id: "palestra", label: "Palestra", prompt: "a confident presenter outfit with clean silhouette and no distracting patterns" },
  { id: "entrevista", label: "Entrevista", prompt: "a camera-ready professional interview outfit with simple textures and balanced contrast" },
  { id: "home-office", label: "Home office", prompt: "a refined comfortable business-casual outfit suitable for professional remote work" },
  { id: "criativo-contemporaneo", label: "Criativo contemporâneo", prompt: "a modern creative-professional outfit with subtle design character and no logos" },
  { id: "verao-profissional", label: "Verão profissional", prompt: "a lightweight warm-climate professional outfit with breathable-looking fabrics and polished fit" },
  { id: "inverno-profissional", label: "Inverno profissional", prompt: "a layered cool-weather professional outfit with refined knitwear or jacket" },
  { id: "casual-local-neutro", label: "Casual local neutro", prompt: "a contemporary locally plausible casual-professional outfit using neutral colors, without costume, stereotype or national symbols" },
];

const FRAMINGS: CatalogItem[] = [
  { id: "close-up", label: "Close-up", prompt: "close-up portrait framing focused on face and upper shoulders" },
  { id: "cabeca-ombros", label: "Cabeça e ombros", prompt: "head-and-shoulders portrait framing" },
  { id: "peito", label: "Até o peito", prompt: "chest-up framing suitable for a spokesperson" },
  { id: "plano-medio", label: "Plano médio", prompt: "medium shot with upper torso clearly visible" },
  { id: "cintura", label: "Até a cintura", prompt: "waist-up framing with natural room for hand gestures" },
  { id: "joelhos", label: "Até os joelhos", prompt: "three-quarter body framing down to the knees" },
  { id: "corpo-inteiro", label: "Corpo inteiro", prompt: "full-body framing with realistic floor contact and proportions" },
  { id: "sentado-medio", label: "Sentado — plano médio", prompt: "seated medium shot with natural posture and visible upper body" },
  { id: "em-pe-tres-quartos", label: "Em pé — 3/4", prompt: "standing three-quarter body composition with comfortable negative space" },
  { id: "aberto-leve", label: "Plano aberto leve", prompt: "slightly wide environmental portrait showing relevant context without making the person too small" },
  { id: "balcao-medio", label: "Balcão — plano médio", prompt: "medium framing behind or beside a realistic counter, hands naturally positioned" },
  { id: "mesa-medio", label: "Mesa — plano médio", prompt: "medium framing at a desk or meeting table with natural professional posture" },
];

const POSES: CatalogItem[] = [
  { id: "frente-neutro", label: "Frente neutra", prompt: "facing the camera naturally with relaxed neutral posture" },
  { id: "frente-sorriso", label: "Frente com sorriso", prompt: "facing the camera with a subtle genuine professional smile" },
  { id: "leve-esquerda", label: "Leve 3/4 esquerda", prompt: "body turned slightly to the left while eyes remain naturally engaged with camera" },
  { id: "leve-direita", label: "Leve 3/4 direita", prompt: "body turned slightly to the right while eyes remain naturally engaged with camera" },
  { id: "sentado-neutro", label: "Sentado neutro", prompt: "seated with upright relaxed posture and natural hands" },
  { id: "em-pe-maos-relaxadas", label: "Em pé — mãos relaxadas", prompt: "standing with relaxed hands and balanced natural posture" },
  { id: "gesto-uma-mao", label: "Gesto com uma mão", prompt: "one subtle conversational hand gesture, anatomically realistic fingers" },
  { id: "maos-juntas", label: "Mãos juntas", prompt: "hands lightly together in a calm professional posture, anatomically realistic" },
  { id: "apoio-natural", label: "Apoio natural", prompt: "one arm resting naturally on a desk, counter or chair depending on scene" },
  { id: "apresentacao-produto", label: "Apresentação de produto", prompt: "open presenter posture with one hand indicating contextual space for a product, without inventing a specific branded product" },
];

const LIGHTING: CatalogItem[] = [
  { id: "janela-natural", label: "Luz natural de janela", prompt: "soft natural window light with realistic skin tones and gentle contrast" },
  { id: "estudio-suave", label: "Estúdio suave", prompt: "soft studio key light with subtle fill and realistic commercial portrait contrast" },
  { id: "corporativa", label: "Corporativa", prompt: "clean corporate lighting with neutral white balance and flattering but realistic skin detail" },
  { id: "interior-quente", label: "Interior quente", prompt: "warm interior practical lighting balanced with soft key light, natural skin color preserved" },
  { id: "diurna-neutra", label: "Diurna neutra", prompt: "neutral daytime lighting with soft shadows and accurate colors" },
  { id: "showroom", label: "Showroom", prompt: "polished showroom lighting with controlled highlights and realistic reflective surfaces" },
  { id: "industrial-clean", label: "Industrial clean", prompt: "clean industrial ambient light with soft face key, avoiding harsh green or blue casts" },
  { id: "golden-hour-suave", label: "Golden hour suave", prompt: "subtle late-afternoon warm light with restrained golden tone and realistic skin color" },
];

const CATALOGS = {
  scenarios: SCENARIOS,
  outfits: OUTFITS,
  framings: FRAMINGS,
  poses: POSES,
  lighting: LIGHTING,
};

function isMarketCode(value: unknown): value is MercosulMarketCode {
  return typeof value === "string" && value in MERCOSUL_MARKETS;
}

function findItem(items: CatalogItem[], id: string | undefined): CatalogItem | null {
  if (!id || id === "auto") return null;
  return items.find((item) => item.id === id) ?? null;
}

function historySelections(metadata: JsonRecord): DubleStyleSelection[] {
  const style = asRecord(metadata["dubleStyle"]);
  const history = Array.isArray(style["history"]) ? style["history"] : [];
  return history
    .map((entry) => asRecord(entry)["selection"])
    .map(asRecord)
    .filter((entry) => isMarketCode(entry["market"]))
    .map((entry) => ({
      market: entry["market"] as MercosulMarketCode,
      scenario: String(entry["scenario"] ?? ""),
      outfit: String(entry["outfit"] ?? ""),
      framing: String(entry["framing"] ?? ""),
      pose: String(entry["pose"] ?? ""),
      lighting: String(entry["lighting"] ?? ""),
    }))
    .filter((entry) => entry.scenario && entry.outfit && entry.framing && entry.pose && entry.lighting);
}

function favoriteSelection(metadata: JsonRecord): DubleStyleSelection | null {
  const favorite = asRecord(asRecord(metadata["dubleStyle"])["favorite"]);
  if (!isMarketCode(favorite["market"])) return null;
  const selection: DubleStyleSelection = {
    market: favorite["market"] as MercosulMarketCode,
    scenario: String(favorite["scenario"] ?? ""),
    outfit: String(favorite["outfit"] ?? ""),
    framing: String(favorite["framing"] ?? ""),
    pose: String(favorite["pose"] ?? ""),
    lighting: String(favorite["lighting"] ?? ""),
  };
  return selection.scenario && selection.outfit && selection.framing && selection.pose && selection.lighting ? selection : null;
}

function chooseItem(items: CatalogItem[], requested: string | undefined, recentIds: string[], antiRepeat: boolean): CatalogItem {
  const explicit = findItem(items, requested);
  if (requested && requested !== "auto" && !explicit) throw new DubleStyleValidationError(`Opção de estilo inválida: ${requested}`);
  if (explicit) return explicit;

  const recent = new Set(recentIds.slice(0, 6));
  const candidates = antiRepeat ? items.filter((item) => !recent.has(item.id)) : items;
  const poolItems = candidates.length ? candidates : items;
  return poolItems[randomInt(0, poolItems.length)]!;
}

async function loadIdentity(tenantId: string, identityId: string) {
  const result = await pool.query(
    `SELECT id, display_name, status, face_reference_asset_id, metadata
       FROM media_identities
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [tenantId, identityId],
  );
  const identity = result.rows[0] as Record<string, unknown> | undefined;
  if (!identity) throw new DubleStyleValidationError("Identidade audiovisual não encontrada");
  if (identity["status"] !== "active") throw new DubleStyleValidationError("A identidade precisa estar ativa");
  if (!identity["face_reference_asset_id"]) throw new DubleStyleValidationError("A identidade precisa de uma foto de referência");
  return identity;
}

async function assertStyleConsent(tenantId: string, identityId: string) {
  const scopes = ["face_use", "ai_generation"];
  const checks = await Promise.all(scopes.map(async (scope) => {
    const result = await pool.query(
      `SELECT media_identity_has_active_consent($1, $2, $3) AS authorized`,
      [tenantId, identityId, scope],
    );
    return { scope, authorized: result.rows[0]?.authorized === true };
  }));
  const missing = checks.filter((item) => !item.authorized).map((item) => item.scope);
  if (missing.length) throw new DubleStyleConsentError(missing);
}

function validateFullSelection(selection: DubleStyleSelection) {
  if (!isMarketCode(selection.market)) throw new DubleStyleValidationError("Mercado inválido");
  if (!findItem(SCENARIOS, selection.scenario)) throw new DubleStyleValidationError("Cenário inválido");
  if (!findItem(OUTFITS, selection.outfit)) throw new DubleStyleValidationError("Vestimenta inválida");
  if (!findItem(FRAMINGS, selection.framing)) throw new DubleStyleValidationError("Enquadramento inválido");
  if (!findItem(POSES, selection.pose)) throw new DubleStyleValidationError("Pose inválida");
  if (!findItem(LIGHTING, selection.lighting)) throw new DubleStyleValidationError("Iluminação inválida");
}

function buildStylePrompt(selection: DubleStyleSelection) {
  const market = MERCOSUL_MARKETS[selection.market];
  const scenario = findItem(SCENARIOS, selection.scenario)!;
  const outfit = findItem(OUTFITS, selection.outfit)!;
  const framing = findItem(FRAMINGS, selection.framing)!;
  const pose = findItem(POSES, selection.pose)!;
  const lighting = findItem(LIGHTING, selection.lighting)!;

  return [
    "Create a photorealistic commercial spokesperson reference from the supplied authorized person's image.",
    "IDENTITY PRESERVATION IS THE HIGHEST PRIORITY: preserve the same person's facial identity, facial geometry, skin tone, age range, hairline, hairstyle, eye color and distinctive facial features. Do not beautify into a different person. Do not change ethnicity or apparent age. Keep realistic skin texture.",
    `Market context: ${market.culturalPrompt}`,
    `Scene: ${scenario.prompt}.`,
    `Wardrobe: change clothing only to ${outfit.prompt}. Keep clothing physically plausible and culturally neutral.`,
    `Framing: ${framing.prompt}.`,
    `Pose: ${pose.prompt}.`,
    `Lighting: ${lighting.prompt}.`,
    "Keep anatomy realistic, especially hands, teeth, eyes and ears. Maintain believable body proportions and camera perspective.",
    "Do not add readable text, watermarks, flags, political symbols, brand logos, professional credentials, name badges or claims that were not in the source.",
    "The final image must look like a real photograph captured in the selected professional context and must remain immediately recognizable as the same authorized person.",
  ].join(" ");
}

function resolveSelection(input: DubleStyleSelectionInput, metadata: JsonRecord): DubleStyleSelection {
  const favorite = input.useFavorite ? favoriteSelection(metadata) : null;
  const history = historySelections(metadata);
  const identityCountry = String(metadata["country"] ?? "").toUpperCase();
  const requestedMarket = input.market ?? favorite?.market ?? (isMarketCode(identityCountry) ? identityCountry : "BR");
  if (!isMarketCode(requestedMarket)) throw new DubleStyleValidationError("Mercado do Mercosul não suportado nesta configuração");
  const antiRepeat = input.antiRepeat !== false;

  return {
    market: requestedMarket,
    scenario: chooseItem(SCENARIOS, input.scenario ?? favorite?.scenario, history.map((item) => item.scenario), antiRepeat).id,
    outfit: chooseItem(OUTFITS, input.outfit ?? favorite?.outfit, history.map((item) => item.outfit), antiRepeat).id,
    framing: chooseItem(FRAMINGS, input.framing ?? favorite?.framing, history.map((item) => item.framing), antiRepeat).id,
    pose: chooseItem(POSES, input.pose ?? favorite?.pose, history.map((item) => item.pose), antiRepeat).id,
    lighting: chooseItem(LIGHTING, input.lighting ?? favorite?.lighting, history.map((item) => item.lighting), antiRepeat).id,
  };
}

function selectionLabels(selection: DubleStyleSelection) {
  return {
    market: MERCOSUL_MARKETS[selection.market].name,
    scenario: findItem(SCENARIOS, selection.scenario)?.label ?? selection.scenario,
    outfit: findItem(OUTFITS, selection.outfit)?.label ?? selection.outfit,
    framing: findItem(FRAMINGS, selection.framing)?.label ?? selection.framing,
    pose: findItem(POSES, selection.pose)?.label ?? selection.pose,
    lighting: findItem(LIGHTING, selection.lighting)?.label ?? selection.lighting,
  };
}

async function persistHistory(params: {
  tenantId: string;
  identityId: string;
  metadata: JsonRecord;
  selection: DubleStyleSelection;
  assetId: string;
}) {
  const { tenantId, identityId, metadata, selection, assetId } = params;
  const currentStyle = asRecord(metadata["dubleStyle"]);
  const existingHistory = Array.isArray(currentStyle["history"]) ? currentStyle["history"] : [];
  const market = MERCOSUL_MARKETS[selection.market];
  const historyItem = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    assetId,
    selection,
  };
  const nextMetadata = {
    ...metadata,
    country: market.code,
    locale: market.locale,
    marketRegion: market.region,
    dubleStyle: {
      ...currentStyle,
      market: market.code,
      antiRepeat: true,
      lastSelection: selection,
      history: [historyItem, ...existingHistory].slice(0, 30),
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, identityId, JSON.stringify(nextMetadata)],
  );
}

export function getDubleStyleCatalog(marketInput?: unknown) {
  const marketCode = isMarketCode(marketInput) ? marketInput : "BR";
  return {
    region: "MERCOSUL" as const,
    market: MERCOSUL_MARKETS[marketCode],
    markets: Object.values(MERCOSUL_MARKETS).map(({ culturalPrompt: _culturalPrompt, ...market }) => market),
    scenarios: SCENARIOS.map(({ prompt: _prompt, ...item }) => item),
    outfits: OUTFITS.map(({ prompt: _prompt, ...item }) => item),
    framings: FRAMINGS.map(({ prompt: _prompt, ...item }) => item),
    poses: POSES.map(({ prompt: _prompt, ...item }) => item),
    lighting: LIGHTING.map(({ prompt: _prompt, ...item }) => item),
    defaults: {
      antiRepeat: true,
      scenario: "auto",
      outfit: "auto",
      framing: "auto",
      pose: "auto",
      lighting: "auto",
    },
  };
}

export async function getVendorAiDubleStyleProfile(params: { tenantId: string; identityId: string }) {
  const identity = await loadIdentity(params.tenantId, params.identityId);
  const metadata = asRecord(identity["metadata"]);
  const identityCountry = String(metadata["country"] ?? "").toUpperCase();
  const marketCode: MercosulMarketCode = isMarketCode(identityCountry) ? identityCountry : "BR";
  return {
    market: MERCOSUL_MARKETS[marketCode],
    favorite: favoriteSelection(metadata),
    lastSelection: asRecord(asRecord(metadata["dubleStyle"])["lastSelection"]),
    recent: historySelections(metadata).slice(0, 8),
    antiRepeat: asRecord(metadata["dubleStyle"])["antiRepeat"] !== false,
  };
}

export async function saveVendorAiDubleFavorite(params: {
  tenantId: string;
  identityId: string;
  selection: DubleStyleSelection;
}) {
  validateFullSelection(params.selection);
  const identity = await loadIdentity(params.tenantId, params.identityId);
  const metadata = asRecord(identity["metadata"]);
  const currentStyle = asRecord(metadata["dubleStyle"]);
  const market = MERCOSUL_MARKETS[params.selection.market];
  const nextMetadata = {
    ...metadata,
    country: market.code,
    locale: market.locale,
    marketRegion: market.region,
    dubleStyle: {
      ...currentStyle,
      market: market.code,
      favorite: params.selection,
      favoriteUpdatedAt: new Date().toISOString(),
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.identityId, JSON.stringify(nextMetadata)],
  );
  return { selection: params.selection, labels: selectionLabels(params.selection), market };
}

export async function createVendorAiDubleStyleReference(params: {
  tenantId: string;
  userId?: string | null;
  identityId: string;
  style?: DubleStyleSelectionInput;
  title?: string;
}) {
  await assertStyleConsent(params.tenantId, params.identityId);
  const identity = await loadIdentity(params.tenantId, params.identityId);
  const metadata = asRecord(identity["metadata"]);
  const selection = resolveSelection(params.style ?? {}, metadata);
  validateFullSelection(selection);
  const market = MERCOSUL_MARKETS[selection.market];
  const prompt = buildStylePrompt(selection);
  const sourceAssetId = String(identity["face_reference_asset_id"]);

  const projectId = await createProcessingMediaProject({
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    title: params.title ?? `Estilo do Dublê — ${String(identity["display_name"] ?? "Pessoa")}`,
    kind: "mixed",
    operation: "duble_style_reference",
    context: {
      engine: "vendorai",
      identityId: params.identityId,
      sourceAssetId,
      selection,
      market,
      generatedByAi: true,
      antiRepeat: params.style?.antiRepeat !== false,
    },
  });

  const generated = await editVendorAiImageReference({
    tenantId: params.tenantId,
    assetId: sourceAssetId,
    prompt,
    size: "1024x1536",
  });
  const filename = `duble-style-${params.identityId}-${Date.now()}.png`;
  const storageUrl = await objectStorage.savePrivateBuffer(generated.buffer, "image/png", filename);
  const registered = await registerGeneratedMediaOutput({
    tenantId: params.tenantId,
    projectId,
    userId: params.userId ?? null,
    storageUrl,
    mimeType: "image/png",
    type: "image",
    originalFilename: filename,
    operation: "duble_style_reference",
    label: `${String(identity["display_name"] ?? "Pessoa")} — ${market.name}`,
    metadata: {
      identityId: params.identityId,
      sourceAssetId,
      model: generated.model,
      selection,
      labels: selectionLabels(selection),
      market,
      generatedByAi: true,
      authorizedIdentity: true,
      purpose: "duble_lipsync_reference",
    },
  });

  await persistHistory({
    tenantId: params.tenantId,
    identityId: params.identityId,
    metadata,
    selection,
    assetId: registered.assetId,
  });

  return {
    projectId,
    assetId: registered.assetId,
    versionId: registered.versionId,
    imageUrl: storageUrl,
    model: generated.model,
    selection,
    labels: selectionLabels(selection),
    market,
  };
}
