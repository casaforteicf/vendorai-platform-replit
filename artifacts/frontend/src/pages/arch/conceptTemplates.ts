export type ConceptTypology =
  | "terrea_2q"
  | "terrea_3q"
  | "terrea_lazer"
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
};

export const CONCEPT_TYPOLOGIES: Array<{
  id: ConceptTypology;
  title: string;
  subtitle: string;
  floors: number;
  suggestedArea: number;
  imageUrl?: string;
  imageAlt?: string;
  rooms: TemplateRoom[];
}> = [
  {
    id: "terrea_2q",
    title: "Térrea compacta",
    subtitle: "2 quartos · 1 banheiro · social integrada",
    floors: 1,
    suggestedArea: 105,
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=88",
    imageAlt: "Referência fotográfica de residência térrea contemporânea",
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 5.4, depth: 4.2, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.4, depth: 3.2, floor: 0 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "banheiro", label: "Banheiro", width: 2.2, depth: 1.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.4, depth: 2.0, floor: 0 },
      { kind: "circulacao", label: "Circulação", width: 1.2, depth: 4.8, floor: 0 },
    ],
  },
  {
    id: "terrea_3q",
    title: "Térrea familiar",
    subtitle: "1 suíte + 2 quartos · garagem dupla",
    floors: 1,
    suggestedArea: 145,
    imageUrl: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1400&q=88",
    imageAlt: "Referência fotográfica de casa térrea familiar contemporânea",
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 5.8, depth: 4.4, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.6, depth: 3.4, floor: 0 },
      { kind: "suite", label: "Suíte", width: 4.0, depth: 3.5, floor: 0 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "banheiro", label: "Banheiro social", width: 2.4, depth: 1.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "circulacao", label: "Hall íntimo", width: 1.2, depth: 5.5, floor: 0 },
    ],
  },
  {
    id: "terrea_lazer",
    title: "Térrea com lazer",
    subtitle: "1 suíte + 2 quartos · gourmet + piscina",
    floors: 1,
    suggestedArea: 175,
    imageUrl: "https://images.unsplash.com/photo-1572331165267-854da2b10ccc?auto=format&fit=crop&w=1400&q=88",
    imageAlt: "Referência fotográfica de residência térrea com área de lazer e piscina",
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 6.0, depth: 4.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.8, depth: 3.5, floor: 0 },
      { kind: "suite", label: "Suíte", width: 4.2, depth: 3.6, floor: 0 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "banheiro", label: "Banheiro social", width: 2.4, depth: 1.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", width: 4.8, depth: 3.8, floor: 0 },
      { kind: "circulacao", label: "Hall íntimo", width: 1.2, depth: 5.8, floor: 0 },
      { kind: "piscina", label: "Piscina", width: 6.0, depth: 3.0, floor: 0 },
    ],
  },
  {
    id: "sobrado_3q",
    title: "Sobrado familiar",
    subtitle: "social no térreo · 3 dormitórios no superior",
    floors: 2,
    suggestedArea: 190,
    imageUrl: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=88",
    imageAlt: "Referência fotográfica de sobrado residencial contemporâneo",
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 6.0, depth: 4.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.8, depth: 3.5, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", width: 4.5, depth: 3.6, floor: 0 },
      { kind: "escada", label: "Escada", width: 2.2, depth: 3.8, floor: 0 },
      { kind: "circulacao", label: "Hall social", width: 1.2, depth: 4.2, floor: 0 },
      { kind: "escada", label: "Escada", width: 2.2, depth: 3.8, floor: 1 },
      { kind: "circulacao", label: "Hall íntimo", width: 1.2, depth: 5.5, floor: 1 },
      { kind: "suite", label: "Suíte", width: 4.2, depth: 3.6, floor: 1 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 1 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 1 },
      { kind: "banheiro", label: "Banheiro social", width: 2.4, depth: 1.6, floor: 1 },
    ],
  },
  {
    id: "sobrado_master",
    title: "Sobrado com suíte master",
    subtitle: "master reservada · social ampla · lazer",
    floors: 2,
    suggestedArea: 235,
    imageUrl: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=88",
    imageAlt: "Referência fotográfica de sobrado contemporâneo de alto padrão",
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 6.4, depth: 4.8, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 4.0, depth: 3.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", width: 5.0, depth: 4.0, floor: 0 },
      { kind: "piscina", label: "Piscina", width: 6.0, depth: 3.0, floor: 0 },
      { kind: "escada", label: "Escada", width: 2.3, depth: 4.0, floor: 0 },
      { kind: "circulacao", label: "Hall social", width: 1.2, depth: 4.5, floor: 0 },
      { kind: "escada", label: "Escada", width: 2.3, depth: 4.0, floor: 1 },
      { kind: "circulacao", label: "Hall íntimo", width: 1.2, depth: 6.0, floor: 1 },
      { kind: "suite", label: "Suíte master", width: 4.8, depth: 4.0, floor: 1 },
      { kind: "quarto", label: "Quarto 1", width: 3.3, depth: 3.1, floor: 1 },
      { kind: "quarto", label: "Quarto 2", width: 3.3, depth: 3.1, floor: 1 },
      { kind: "banheiro", label: "Banheiro social", width: 2.4, depth: 1.6, floor: 1 },
    ],
  },
];

export function buildTypologyRooms(id: ConceptTypology) {
  const template = CONCEPT_TYPOLOGIES.find((item) => item.id === id) ?? CONCEPT_TYPOLOGIES[1];
  return template.rooms.map((room, index) => ({
    ...room,
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${id}-${index}-${Date.now()}`,
    x: 0,
    y: 0,
  }));
}
