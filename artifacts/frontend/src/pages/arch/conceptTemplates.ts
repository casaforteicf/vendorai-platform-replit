export type ConceptTypology =
  | "terrea_2q"
  | "terrea_estreita"
  | "terrea_3q"
  | "terrea_lazer"
  | "terrea_suites"
  | "sobrado_estreito"
  | "sobrado_3q"
  | "sobrado_master";

export type LayoutPreferenceKey =
  | "garageFront"
  | "masterRear"
  | "kitchenNearGourmet"
  | "gourmetNearPool"
  | "privateAwaySocial"
  | "livingIntegratedKitchen";

export type LayoutPreferences = Record<LayoutPreferenceKey, boolean>;

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  garageFront: true,
  masterRear: true,
  kitchenNearGourmet: true,
  gourmetNearPool: true,
  privateAwaySocial: true,
  livingIntegratedKitchen: true,
};

export type TemplateRoom = {
  kind:
    | "sala"
    | "cozinha"
    | "suite"
    | "quarto"
    | "banheiro"
    | "lavanderia"
    | "garagem"
    | "gourmet"
    | "piscina"
    | "circulacao"
    | "escada"
    | "outro";
  label: string;
  width: number;
  depth: number;
  floor: number;
  /** Posição fixa no projeto do modelo (metros, frente em y = 0). */
  x?: number;
  y?: number;
};

// Modelos desenhados à mão, com posições exatas: paredes compartilhadas, circulação lógica
// (suíte com banho, lavabo, closet) e validados sem sobreposição, sem cômodo sem acesso e
// sem pavimento superior em balanço. A frente do modelo é y = 0.
export const CONCEPT_TYPOLOGIES: Array<{
  id: ConceptTypology;
  title: string;
  subtitle: string;
  floors: number;
  suggestedArea: number;
  minLotWidth: number;
  imageUrl?: string;
  imageAlt?: string;
  rooms: TemplateRoom[];
}> = [
  {
    id: "terrea_2q",
    title: "Térrea compacta",
    subtitle: "2 quartos · social integrada · 1 vaga",
    floors: 1,
    suggestedArea: 100,
    minLotWidth: 10,
    rooms: [
      { kind: "garagem", label: "Garagem 1 vaga", x: 0, y: 0, width: 3, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", x: 3, y: 0, width: 5, depth: 5.5, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 2.8, depth: 2, floor: 0 },
      { kind: "circulacao", label: "Circulação", x: 2.8, y: 5.5, width: 1.2, depth: 7.2, floor: 0 },
      { kind: "cozinha", label: "Cozinha", x: 4, y: 5.5, width: 4, depth: 3.2, floor: 0 },
      { kind: "banheiro", label: "Banheiro", x: 0, y: 7.5, width: 2.8, depth: 2, floor: 0 },
      { kind: "quarto", label: "Quarto 1", x: 0, y: 9.5, width: 2.8, depth: 3.2, floor: 0 },
      { kind: "quarto", label: "Quarto 2", x: 4, y: 8.7, width: 4, depth: 4, floor: 0 },
    ],
  },
  {
    id: "terrea_estreita",
    title: "Térrea lote estreito",
    subtitle: "suíte + 1 quarto · para lotes de 8 a 10 m",
    floors: 1,
    suggestedArea: 100,
    minLotWidth: 8,
    rooms: [
      { kind: "garagem", label: "Garagem 1 vaga", x: 0, y: 0, width: 3, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", x: 3, y: 0, width: 4, depth: 5.5, floor: 0 },
      { kind: "circulacao", label: "Circulação", x: 3, y: 5.5, width: 1.2, depth: 8.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha", x: 4.2, y: 5.5, width: 2.8, depth: 3.4, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 3, depth: 2.2, floor: 0 },
      { kind: "banheiro", label: "Banheiro social", x: 0, y: 7.7, width: 3, depth: 2, floor: 0 },
      { kind: "quarto", label: "Quarto", x: 0, y: 9.7, width: 3, depth: 4.4, floor: 0 },
      { kind: "suite", label: "Suíte", x: 4.2, y: 8.9, width: 2.8, depth: 3.6, floor: 0 },
      { kind: "banheiro", label: "Banho suíte", x: 4.2, y: 12.5, width: 2.8, depth: 1.6, floor: 0 },
    ],
  },
  {
    id: "terrea_3q",
    title: "Térrea familiar",
    subtitle: "suíte com closet + 2 quartos · garagem dupla",
    floors: 1,
    suggestedArea: 135,
    minLotWidth: 12,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", x: 0, y: 0, width: 5, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", x: 5, y: 0, width: 4.8, depth: 5.5, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 2.4, depth: 2.2, floor: 0 },
      { kind: "banheiro", label: "Banheiro social", x: 2.4, y: 5.5, width: 2.6, depth: 2.2, floor: 0 },
      { kind: "circulacao", label: "Hall íntimo", x: 5, y: 5.5, width: 1.2, depth: 8.2, floor: 0 },
      { kind: "cozinha", label: "Cozinha", x: 6.2, y: 5.5, width: 3.6, depth: 3, floor: 0 },
      { kind: "quarto", label: "Quarto 1", x: 6.2, y: 8.5, width: 3.6, depth: 2.6, floor: 0 },
      { kind: "quarto", label: "Quarto 2", x: 6.2, y: 11.1, width: 3.6, depth: 2.6, floor: 0 },
      { kind: "suite", label: "Suíte", x: 0, y: 7.7, width: 5, depth: 3.8, floor: 0 },
      { kind: "banheiro", label: "Banho suíte", x: 0, y: 11.5, width: 2.6, depth: 2.2, floor: 0 },
      { kind: "outro", label: "Closet", x: 2.6, y: 11.5, width: 2.4, depth: 2.2, floor: 0 },
    ],
  },
  {
    id: "terrea_lazer",
    title: "Térrea com lazer",
    subtitle: "3 suítes · gourmet + piscina · lavabo",
    floors: 1,
    suggestedArea: 230,
    minLotWidth: 15,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", x: 0, y: 0, width: 5.4, depth: 5.5, floor: 0 },
      { kind: "circulacao", label: "Hall + circulação", x: 5.4, y: 0, width: 1.2, depth: 20.3, floor: 0 },
      { kind: "sala", label: "Sala de estar + jantar", x: 6.6, y: 0, width: 6.4, depth: 5.5, floor: 0 },
      { kind: "cozinha", label: "Cozinha com ilha", x: 6.6, y: 5.5, width: 6.4, depth: 3.4, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", x: 6.6, y: 8.9, width: 6.4, depth: 4, floor: 0 },
      { kind: "piscina", label: "Piscina", x: 7.4, y: 14, width: 5, depth: 2.8, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 2.6, depth: 2, floor: 0 },
      { kind: "banheiro", label: "Lavabo", x: 2.6, y: 5.5, width: 2.8, depth: 2, floor: 0 },
      { kind: "suite", label: "Suíte 2", x: 0, y: 7.5, width: 5.4, depth: 3.2, floor: 0 },
      { kind: "banheiro", label: "Banho suíte 2", x: 0, y: 10.7, width: 2.6, depth: 2.2, floor: 0 },
      { kind: "banheiro", label: "Banho suíte 3", x: 2.6, y: 10.7, width: 2.8, depth: 2.2, floor: 0 },
      { kind: "suite", label: "Suíte 3", x: 0, y: 12.9, width: 5.4, depth: 3.2, floor: 0 },
      { kind: "suite", label: "Suíte master", x: 0, y: 16.1, width: 5.4, depth: 4.2, floor: 0 },
      { kind: "banheiro", label: "Banho suíte master", x: 0, y: 20.3, width: 2.9, depth: 2.5, floor: 0 },
      { kind: "outro", label: "Closet master", x: 2.9, y: 20.3, width: 2.5, depth: 2.5, floor: 0 },
    ],
  },
  {
    id: "terrea_suites",
    title: "Térrea 3 suítes",
    subtitle: "3 suítes · varanda · cozinha integrada",
    floors: 1,
    suggestedArea: 190,
    minLotWidth: 14,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", x: 0, y: 0, width: 5.2, depth: 5.5, floor: 0 },
      { kind: "outro", label: "Varanda", x: 5.2, y: 0, width: 6.8, depth: 1.8, floor: 0 },
      { kind: "sala", label: "Sala + jantar", x: 5.2, y: 1.8, width: 6.8, depth: 4.6, floor: 0 },
      { kind: "circulacao", label: "Circulação", x: 5.2, y: 6.4, width: 1.2, depth: 9.5, floor: 0 },
      { kind: "cozinha", label: "Cozinha + copa", x: 6.4, y: 6.4, width: 5.6, depth: 4, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 3.6, depth: 2, floor: 0 },
      { kind: "banheiro", label: "Lavabo", x: 3.6, y: 5.5, width: 1.6, depth: 2, floor: 0 },
      { kind: "suite", label: "Suíte 1", x: 0, y: 7.5, width: 5.2, depth: 3.2, floor: 0 },
      { kind: "banheiro", label: "Banho suíte 1", x: 0, y: 10.7, width: 2.6, depth: 2, floor: 0 },
      { kind: "banheiro", label: "Banho suíte 2", x: 2.6, y: 10.7, width: 2.6, depth: 2, floor: 0 },
      { kind: "suite", label: "Suíte 2", x: 0, y: 12.7, width: 5.2, depth: 3.2, floor: 0 },
      { kind: "suite", label: "Suíte master", x: 6.4, y: 10.4, width: 5.6, depth: 3.6, floor: 0 },
      { kind: "outro", label: "Closet", x: 6.4, y: 14, width: 2.8, depth: 1.6, floor: 0 },
      { kind: "banheiro", label: "Banho suíte master", x: 9.2, y: 14, width: 2.8, depth: 1.6, floor: 0 },
    ],
  },
  {
    id: "sobrado_estreito",
    title: "Sobrado lote estreito",
    subtitle: "suíte com closet + 1 quarto · lotes de 8 a 9 m",
    floors: 2,
    suggestedArea: 135,
    minLotWidth: 8,
    rooms: [
      { kind: "garagem", label: "Garagem 1 vaga", x: 0, y: 0, width: 3, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala de estar", x: 3, y: 0, width: 4, depth: 5.5, floor: 0 },
      { kind: "escada", label: "Escada", x: 0, y: 5.5, width: 3, depth: 3.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha + jantar", x: 3, y: 5.5, width: 4, depth: 3.5, floor: 0 },
      { kind: "banheiro", label: "Lavabo", x: 0, y: 9.1, width: 1.6, depth: 1.8, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 3, y: 9, width: 4, depth: 2, floor: 0 },
      { kind: "escada", label: "Escada", x: 0, y: 5.5, width: 3, depth: 3.6, floor: 1 },
      { kind: "circulacao", label: "Hall íntimo", x: 3, y: 4, width: 1.2, depth: 5, floor: 1 },
      { kind: "suite", label: "Suíte", x: 2.4, y: 0, width: 4.6, depth: 4, floor: 1 },
      { kind: "banheiro", label: "Banho suíte", x: 0, y: 0, width: 2.4, depth: 2.6, floor: 1 },
      { kind: "outro", label: "Closet", x: 0, y: 2.6, width: 2.4, depth: 2.9, floor: 1 },
      { kind: "quarto", label: "Quarto", x: 4.2, y: 4, width: 2.8, depth: 3.2, floor: 1 },
      { kind: "banheiro", label: "Banheiro social", x: 4.2, y: 7.2, width: 2.8, depth: 1.8, floor: 1 },
    ],
  },
  {
    id: "sobrado_3q",
    title: "Sobrado familiar",
    subtitle: "social no térreo · suíte + 2 quartos no superior",
    floors: 2,
    suggestedArea: 180,
    minLotWidth: 11,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", x: 0, y: 0, width: 5, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala de estar + jantar", x: 5, y: 0, width: 5, depth: 5.5, floor: 0 },
      { kind: "escada", label: "Escada", x: 5, y: 5.5, width: 2.4, depth: 3.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha", x: 7.4, y: 5.5, width: 2.6, depth: 3.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 2.8, depth: 2, floor: 0 },
      { kind: "banheiro", label: "Lavabo", x: 2.8, y: 5.5, width: 2.2, depth: 2, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", x: 5, y: 9.1, width: 5, depth: 3.6, floor: 0 },
      { kind: "escada", label: "Escada", x: 5, y: 5.5, width: 2.4, depth: 3.6, floor: 1 },
      { kind: "circulacao", label: "Hall íntimo", x: 3.8, y: 1.2, width: 1.2, depth: 6.3, floor: 1 },
      { kind: "quarto", label: "Quarto 1", x: 0, y: 0, width: 3.8, depth: 3.5, floor: 1 },
      { kind: "quarto", label: "Quarto 2", x: 0, y: 3.5, width: 3.8, depth: 4, floor: 1 },
      { kind: "suite", label: "Suíte", x: 5, y: 0, width: 5, depth: 4, floor: 1 },
      { kind: "outro", label: "Closet", x: 5, y: 4, width: 2.4, depth: 1.5, floor: 1 },
      { kind: "banheiro", label: "Banho suíte", x: 7.4, y: 4, width: 2.6, depth: 2.2, floor: 1 },
      { kind: "banheiro", label: "Banheiro social", x: 7.4, y: 6.2, width: 2.6, depth: 2.2, floor: 1 },
    ],
  },
  {
    id: "sobrado_master",
    title: "Sobrado com suíte master",
    subtitle: "3 suítes · master com closet · gourmet + piscina",
    floors: 2,
    suggestedArea: 230,
    minLotWidth: 14,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", x: 0, y: 0, width: 5.2, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala de estar + jantar", x: 5.2, y: 0, width: 6.8, depth: 5.5, floor: 0 },
      { kind: "escada", label: "Escada", x: 5.2, y: 5.5, width: 2.4, depth: 3.8, floor: 0 },
      { kind: "banheiro", label: "Lavabo", x: 3.6, y: 5.5, width: 1.6, depth: 2, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", x: 0, y: 5.5, width: 3.6, depth: 2, floor: 0 },
      { kind: "cozinha", label: "Cozinha", x: 7.6, y: 5.5, width: 4.4, depth: 3.8, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", x: 5.2, y: 9.3, width: 6.8, depth: 4, floor: 0 },
      { kind: "piscina", label: "Piscina", x: 6, y: 14.3, width: 5, depth: 3, floor: 0 },
      { kind: "escada", label: "Escada", x: 5.2, y: 5.5, width: 2.4, depth: 3.8, floor: 1 },
      { kind: "circulacao", label: "Hall + mezanino", x: 5.2, y: 0, width: 2.4, depth: 5.5, floor: 1 },
      { kind: "suite", label: "Suíte master", x: 7.6, y: 0, width: 4.4, depth: 4.6, floor: 1 },
      { kind: "outro", label: "Closet master", x: 7.6, y: 4.6, width: 2.2, depth: 2.8, floor: 1 },
      { kind: "banheiro", label: "Banho suíte master", x: 9.8, y: 4.6, width: 2.2, depth: 2.8, floor: 1 },
      { kind: "suite", label: "Suíte 2", x: 0, y: 0, width: 5.2, depth: 4, floor: 1 },
      { kind: "banheiro", label: "Banho suíte 2", x: 2.6, y: 4, width: 2.6, depth: 2.2, floor: 1 },
      { kind: "suite", label: "Suíte 3", x: 5.2, y: 9.3, width: 4, depth: 3.6, floor: 1 },
      { kind: "banheiro", label: "Banho suíte 3", x: 9.2, y: 9.3, width: 2.8, depth: 2.2, floor: 1 },
    ],
  },
];

export function buildTypologyRooms(id: ConceptTypology) {
  const template = CONCEPT_TYPOLOGIES.find((item) => item.id === id) ?? CONCEPT_TYPOLOGIES[2];
  return template.rooms.map(({ x: _x, y: _y, ...room }, index) => ({
    ...room,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${id}-${index}-${Date.now()}`,
    x: 0,
    y: 0,
  }));
}

type SetbackBox = { top: number; bottom: number; left: number; right: number };
type FrontSide = "top" | "bottom" | "left" | "right";

/**
 * Posiciona o modelo desenhado no lote, girando para a frente escolhida e respeitando os recuos.
 * Retorna null quando o modelo não cabe no lote (o editor volta ao encaixe automático).
 */
export function buildTypologyPlan(
  id: ConceptTypology,
  lotWidth: number,
  lotDepth: number,
  frontSide: FrontSide,
  setbacks: SetbackBox,
) {
  const template = CONCEPT_TYPOLOGIES.find((item) => item.id === id);
  if (!template || template.rooms.some((room) => typeof room.x !== "number" || typeof room.y !== "number")) return null;

  const built = template.rooms.filter((room) => room.kind !== "piscina");
  const tw = Math.max(...template.rooms.map((room) => (room.x ?? 0) + room.width));
  const td = Math.max(...template.rooms.map((room) => (room.y ?? 0) + room.depth));
  void built;

  const transform = (room: TemplateRoom) => {
    const x = room.x ?? 0;
    const y = room.y ?? 0;
    if (frontSide === "bottom") return { x: tw - x - room.width, y: td - y - room.depth, width: room.width, depth: room.depth };
    if (frontSide === "left") return { x: y, y: tw - x - room.width, width: room.depth, depth: room.width };
    if (frontSide === "right") return { x: td - y - room.depth, y: x, width: room.depth, depth: room.width };
    return { x, y, width: room.width, depth: room.depth };
  };

  const footW = frontSide === "left" || frontSide === "right" ? td : tw;
  const footD = frontSide === "left" || frontSide === "right" ? tw : td;
  if (footW > lotWidth - 0.4 || footD > lotDepth - 0.4) return null;

  const fit = (size: number, lot: number, before: number, after: number) => {
    const free = lot - before - after - size;
    if (free >= 0) return before + free / 2;
    return Math.max(0.2, Math.min(before, lot - size - 0.2));
  };
  const alongFront = (size: number, lot: number, before: number, after: number, frontFirst: boolean) => {
    if (lot - before - after - size >= 0) return frontFirst ? before : lot - after - size;
    return frontFirst ? Math.max(0.2, Math.min(before, lot - size - 0.2)) : Math.max(0.2, lot - Math.min(after, lot - size - 0.2) - size);
  };

  const originX = frontSide === "left" || frontSide === "right"
    ? alongFront(footW, lotWidth, setbacks.left, setbacks.right, frontSide === "left")
    : fit(footW, lotWidth, setbacks.left, setbacks.right);
  const originY = frontSide === "top" || frontSide === "bottom"
    ? alongFront(footD, lotDepth, setbacks.top, setbacks.bottom, frontSide === "top")
    : fit(footD, lotDepth, setbacks.top, setbacks.bottom);

  const round = (value: number) => Math.round(value * 100) / 100;
  return template.rooms.map((room, index) => {
    const placed = transform(room);
    const { x: _x, y: _y, ...rest } = room;
    return {
      ...rest,
      width: placed.width,
      depth: placed.depth,
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${id}-${index}-${Date.now()}`,
      x: round(originX + placed.x),
      y: round(originY + placed.y),
    };
  });
}
