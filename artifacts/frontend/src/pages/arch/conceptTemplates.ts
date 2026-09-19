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
  rooms: TemplateRoom[];
}> = [
  {
    id: "terrea_2q",
    title: "Térrea compacta",
    subtitle: "2 quartos · 1 banheiro · social integrada",
    floors: 1,
    suggestedArea: 105,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 5.4, depth: 4.2, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.4, depth: 3.2, floor: 0 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "banheiro", label: "Banheiro", width: 2.2, depth: 1.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.4, depth: 2.0, floor: 0 },
    ],
  },
  {
    id: "terrea_3q",
    title: "Térrea familiar",
    subtitle: "1 suíte + 2 quartos · garagem dupla",
    floors: 1,
    suggestedArea: 145,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 5.8, depth: 4.4, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.6, depth: 3.4, floor: 0 },
      { kind: "suite", label: "Suíte", width: 4.0, depth: 3.5, floor: 0 },
      { kind: "quarto", label: "Quarto 1", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "quarto", label: "Quarto 2", width: 3.2, depth: 3.0, floor: 0 },
      { kind: "banheiro", label: "Banheiro social", width: 2.4, depth: 1.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
    ],
  },
  {
    id: "terrea_lazer",
    title: "Térrea com lazer",
    subtitle: "1 suíte + 2 quartos · gourmet + piscina",
    floors: 1,
    suggestedArea: 175,
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
      { kind: "piscina", label: "Piscina", width: 6.0, depth: 3.0, floor: 0 },
    ],
  },
  {
    id: "sobrado_3q",
    title: "Sobrado familiar",
    subtitle: "social no térreo · 3 dormitórios no superior",
    floors: 2,
    suggestedArea: 190,
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 6.0, depth: 4.6, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 3.8, depth: 3.5, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", width: 4.5, depth: 3.6, floor: 0 },
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
    rooms: [
      { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5, floor: 0 },
      { kind: "sala", label: "Sala + jantar", width: 6.4, depth: 4.8, floor: 0 },
      { kind: "cozinha", label: "Cozinha", width: 4.0, depth: 3.6, floor: 0 },
      { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2.0, floor: 0 },
      { kind: "gourmet", label: "Espaço gourmet", width: 5.0, depth: 4.0, floor: 0 },
      { kind: "piscina", label: "Piscina", width: 6.0, depth: 3.0, floor: 0 },
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
