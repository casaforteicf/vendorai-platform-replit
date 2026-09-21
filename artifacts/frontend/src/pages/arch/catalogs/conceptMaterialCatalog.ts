export type ConceptPBRMaterialDefinition = {
  id: string;
  label: string;
  family: "floor" | "wall" | "roof" | "furniture";
  baseColorMap?: string;
  normalMap?: string;
  roughnessMap?: string;
  aoMap?: string;
  color?: number;
  roughness: number;
  metalness: number;
  repeat: [number, number];
  normalScale?: number;
  license: string;
  source: string;
};

const PH = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k";

export const CONCEPT_PBR_MATERIALS: Record<string, ConceptPBRMaterialDefinition> = {
  "madeira-carvalho": {
    id: "madeira-carvalho",
    label: "Madeira Carvalho Natural",
    family: "floor",
    baseColorMap: `${PH}/wooden_floor_02/wooden_floor_02_diff_1k.jpg`,
    normalMap: `${PH}/wooden_floor_02/wooden_floor_02_nor_gl_1k.jpg`,
    roughnessMap: `${PH}/wooden_floor_02/wooden_floor_02_rough_1k.jpg`,
    aoMap: `${PH}/wooden_floor_02/wooden_floor_02_ao_1k.jpg`,
    roughness: 0.58,
    metalness: 0,
    repeat: [2.4, 2.4],
    normalScale: 0.7,
    license: "CC0",
    source: "Poly Haven",
  },
  "cimento-aparente": {
    id: "cimento-aparente",
    label: "Concreto Aparente",
    family: "wall",
    baseColorMap: `${PH}/concrete/concrete_diff_1k.jpg`,
    normalMap: `${PH}/concrete/concrete_nor_gl_1k.jpg`,
    roughnessMap: `${PH}/concrete/concrete_rough_1k.jpg`,
    aoMap: `${PH}/concrete/concrete_ao_1k.jpg`,
    roughness: 0.82,
    metalness: 0,
    repeat: [1.5, 1.5],
    normalScale: 0.8,
    license: "CC0",
    source: "Poly Haven",
  },
  "pedra-cinza": {
    id: "pedra-cinza",
    label: "Pedra Natural Cinza",
    family: "wall",
    baseColorMap: `${PH}/stone_wall_05/stone_wall_05_diff_1k.jpg`,
    normalMap: `${PH}/stone_wall_05/stone_wall_05_nor_gl_1k.jpg`,
    roughnessMap: `${PH}/stone_wall_05/stone_wall_05_rough_1k.jpg`,
    aoMap: `${PH}/stone_wall_05/stone_wall_05_ao_1k.jpg`,
    roughness: 0.9,
    metalness: 0,
    repeat: [1.8, 1.8],
    normalScale: 1.05,
    license: "CC0",
    source: "Poly Haven",
  },
  "cimento-queimado": {
    id: "cimento-queimado",
    label: "Concreto Polido",
    family: "floor",
    baseColorMap: `${PH}/smooth_concrete_floor/smooth_concrete_floor_diff_1k.jpg`,
    normalMap: `${PH}/smooth_concrete_floor/smooth_concrete_floor_nor_gl_1k.jpg`,
    roughnessMap: `${PH}/smooth_concrete_floor/smooth_concrete_floor_rough_1k.jpg`,
    aoMap: `${PH}/smooth_concrete_floor/smooth_concrete_floor_ao_1k.jpg`,
    roughness: 0.62,
    metalness: 0,
    repeat: [2.0, 2.0],
    normalScale: 0.55,
    license: "CC0",
    source: "Poly Haven",
  },
  "pintura-branca": {
    id: "pintura-branca",
    label: "Pintura Branca Fosca",
    family: "wall",
    color: 0xf7f7f4,
    roughness: 0.94,
    metalness: 0,
    repeat: [1, 1],
    license: "Arqdor",
    source: "Arqdor",
  },
  "tecido-bege": {
    id: "tecido-bege",
    label: "Tecido Bege",
    family: "furniture",
    color: 0xd9cbb8,
    roughness: 0.86,
    metalness: 0,
    repeat: [1, 1],
    license: "Arqdor",
    source: "Arqdor",
  },
  "preto-fosco": {
    id: "preto-fosco",
    label: "Preto Fosco",
    family: "furniture",
    color: 0x20242a,
    roughness: 0.78,
    metalness: 0.05,
    repeat: [1, 1],
    license: "Arqdor",
    source: "Arqdor",
  },
};

export function getConceptPBRMaterial(id?: string) {
  return id ? CONCEPT_PBR_MATERIALS[id] ?? null : null;
}
