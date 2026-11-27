/**
 * Direção visual para criativos gerados por IA no Marketing.
 *
 * O problema que este contrato resolve: o gerador recebia o texto inteiro do
 * planejamento como "subject" e aplicava conceitos de fotografia de produto
 * (hero, macro, flat-lay) a qualquer negócio — um hotel virava "produto" e as
 * imagens saíam desconexas. Aqui a direção é derivada do tipo de negócio e do
 * briefing da campanha, com cenas coerentes e regras negativas explícitas.
 *
 * Puro: sem IO, sem React. Usado pelo backend (prompt) e pelo frontend
 * (escolha de referência), garantindo a mesma direção nos dois lados.
 */

export type VisualKind = "hospitality" | "food" | "realestate" | "retail" | "service";

export interface ImageDirectionInput {
  tenantName?: string | null;
  brandName?: string | null;
  productName?: string | null;
  theme?: string | null;
  vertical?: string | null;
  audience?: string | null;
  region?: string | null;
  offer?: string | null;
  message?: string | null;
  campaignName?: string | null;
}

export interface ImageScene {
  id: string;
  prompt: string;
}

export interface ImageDirection {
  kind: VisualKind;
  brand: string;
  /** Assunto curto e concreto (não o texto inteiro do planejamento). */
  subject: string;
  style: string;
  avoid: string;
  scenes: ImageScene[];
}

const HOSPITALITY = /\b(hotel|pousada|resort|termas|hospedagem|hospedar|turismo|viagem|pacote|diaria|diarias|ferias|feriado|temporada|spa)\b/;
const FOOD = /\b(restaurante|lanchonete|cafe|cafeteria|padaria|confeitaria|pizza|hamburguer|prato|cardapio|gastronomia|comida|bebida)\b/;
const REALESTATE = /\b(imovel|imoveis|apartamento|casa|terreno|lote|casa a venda|aluguel|incorporadora|construtora)\b/;
const RETAIL = /\b(moda|roupa|loja|varejo|colecao|calcado|acessorio|perfume|cosmetico|eletronico|movel|decoracao)\b/;

function text(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectVisualKind(input: ImageDirectionInput): VisualKind {
  const haystack = text([
    input.tenantName,
    input.productName,
    input.theme,
    input.message,
    input.campaignName,
    input.vertical,
  ].filter(Boolean).join(" "));
  if (HOSPITALITY.test(haystack)) return "hospitality";
  if (RESTAURANT_OR_FOOD(haystack)) return "food";
  if (REALESTATE.test(haystack)) return "realestate";
  if (RETAIL.test(haystack)) return "retail";
  return "service";
}

// Função separada para manter a ordem de detecção explícita e testável.
function RESTAURANT_OR_FOOD(haystack: string): boolean {
  return FOOD.test(haystack);
}

function firstLine(value: string | null | undefined, max = 140): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function buildImageSubject(input: ImageDirectionInput): string {
  const product = firstLine(input.productName, 80);
  const region = firstLine(input.region, 60);
  const theme = firstLine(input.theme, 100);
  const regionAdds = region && !product.toLowerCase().includes(region.toLowerCase());
  const themeAdds = theme && !product.includes(theme) && !theme.includes(product);
  const parts = [product, regionAdds ? region : "", themeAdds ? theme : ""].filter(Boolean);
  return parts.join(" — ") || firstLine(input.message, 120) || "experiência real do negócio";
}

const SCENES: Record<VisualKind, ImageScene[]> = {
  hospitality: [
    { id: "venue-wide", prompt: "wide editorial photograph of a real hospitality venue (suite, thermal pool or lounge) with natural light, inviting atmosphere" },
    { id: "comfort-detail", prompt: "close, warm detail of real comfort (bed linen, towels, breakfast table) in the actual venue, shallow depth of field" },
    { id: "guest-experience", prompt: "candid moment of real guests enjoying the space, natural expressions, no stock-photo posing" },
    { id: "surroundings", prompt: "view of the destination surroundings at golden hour, calm and restful mood, travel editorial" },
    { id: "arrival", prompt: "arrival experience detail (reception, keys, welcome drink) in the real venue, warm hospitality atmosphere" },
  ],
  food: [
    { id: "dish-hero", prompt: "real dish plated at the venue, natural light, appetizing texture, editorial food photography" },
    { id: "preparation", prompt: "hands preparing real food in the kitchen, authentic movement, warm ambience" },
    { id: "table-moment", prompt: "people sharing a meal at the real venue, candid and welcoming" },
    { id: "ingredient-detail", prompt: "fresh ingredient detail on a rustic surface, natural light" },
    { id: "ambience", prompt: "wide view of the dining room ambience at service time" },
  ],
  realestate: [
    { id: "exterior", prompt: "real property exterior with natural light, architectural editorial photography" },
    { id: "interior", prompt: "bright real interior, functional layout, lifestyle details" },
    { id: "detail", prompt: "quality finish detail (materials, joinery, light)" },
    { id: "neighborhood", prompt: "street and neighborhood context at a pleasant time of day" },
    { id: "living", prompt: "candid family living moment in the real space" },
  ],
  retail: [
    { id: "product-hero", prompt: "hero product photograph on a clean, elegant surface, premium lighting" },
    { id: "in-use", prompt: "product being used in a real context by a real person" },
    { id: "detail", prompt: "macro detail of material, finish and craftsmanship" },
    { id: "lifestyle", prompt: "aspirational lifestyle scene where the product naturally belongs" },
    { id: "flat-lay", prompt: "tasteful overhead composition with complementary props" },
  ],
  service: [
    { id: "environment", prompt: "real work environment of the business, natural light, authentic atmosphere" },
    { id: "team", prompt: "real team member helping a customer, candid and professional" },
    { id: "result", prompt: "visible result/outcome of the service in a real setting" },
    { id: "detail", prompt: "detail that shows care and quality in the service delivery" },
    { id: "context", prompt: "wide context shot of the business location and its surroundings" },
  ],
};

export function buildImageDirection(input: ImageDirectionInput): ImageDirection {
  const kind = detectVisualKind(input);
  const brand = firstLine(input.brandName || input.tenantName || "", 80) || "a marca";
  const subject = buildImageSubject(input);
  const palette = [input.offer, input.audience].filter(Boolean).join(", ");
  return {
    kind,
    brand,
    subject,
    style: [
      "photorealistic editorial photography, natural light, realistic colors, shallow depth of field when appropriate",
      palette ? `context: ${palette}` : "",
      "do not invent amenities, rooms or products that the business does not have",
    ].filter(Boolean).join("; "),
    avoid: "no text, no watermark, no logo overlay, no collage, no split screen, no distorted faces or hands, no stock-photo posing",
    scenes: SCENES[kind],
  };
}

/** Prompt final de uma cena, já com marca, assunto, estilo e restrições. */
export function buildScenePrompt(direction: ImageDirection, index: number, formatLabel: string): string {
  const scene = direction.scenes[index % direction.scenes.length]!;
  return [
    `Realistic editorial image for "${direction.brand}" — ${direction.subject}.`,
    `${formatLabel}. Scene: ${scene.prompt}.`,
    `Style: ${direction.style}.`,
    direction.avoid ? `Avoid: ${direction.avoid}.` : "",
  ].filter(Boolean).join(" ");
}
