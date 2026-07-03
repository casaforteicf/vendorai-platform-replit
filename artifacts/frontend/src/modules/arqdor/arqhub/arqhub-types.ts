// ─── ARQ HUB — Core Types ────────────────────────────────────────────────────
// Domain types for the Architectural Intelligence Ecosystem.
// Prepared for future DDD / Clean Architecture integration.

// ─── Visibility & Status ─────────────────────────────────────────────────────

export type AssetVisibility   = 'PRIVATE' | 'COMPANY' | 'COMMUNITY' | 'MARKETPLACE'
export type ManufacturerStatus = 'OFFICIAL' | 'COMMUNITY' | 'PRIVATE'
export type AssetLicense       = 'FREE' | 'PREMIUM' | 'COMMERCIAL' | 'OPEN'

// ─── Material Hub ─────────────────────────────────────────────────────────────

export type MaterialCategory =
  | 'MADEIRAS'    | 'PEDRAS'      | 'PORCELANATOS' | 'CERAMICAS'
  | 'TINTAS'      | 'METAIS'      | 'TECIDOS'      | 'VIDROS'
  | 'PAPEIS_PAREDE' | 'CONCRETOS' | 'PERSONALIZADOS'

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  MADEIRAS:'Madeiras', PEDRAS:'Pedras', PORCELANATOS:'Porcelanatos',
  CERAMICAS:'Cerâmicas', TINTAS:'Tintas', METAIS:'Metais',
  TECIDOS:'Tecidos', VIDROS:'Vidros', PAPEIS_PAREDE:'Papéis de parede',
  CONCRETOS:'Concretos', PERSONALIZADOS:'Personalizados',
}

export const MATERIAL_CATEGORY_ICONS: Record<MaterialCategory, string> = {
  MADEIRAS:'🪵', PEDRAS:'🪨', PORCELANATOS:'🔲', CERAMICAS:'🔷',
  TINTAS:'🎨', METAIS:'⚙️', TECIDOS:'🧵', VIDROS:'🔳',
  PAPEIS_PAREDE:'📋', CONCRETOS:'🏗️', PERSONALIZADOS:'✨',
}

export interface PBRMaps {
  albedo?:    string
  normal?:    string
  roughness?: string
  metallic?:  string
  ao?:        string
}

export interface HubMaterial {
  id:                  string
  name:                string
  category:            MaterialCategory
  manufacturer:        string
  brand:               string
  line:                string
  collection?:         string
  code:                string
  description:         string
  finish:              string
  texture:             string
  grain:               boolean
  gloss:               number      // 0–100
  pbrMaps:             PBRMaps
  images:              string[]
  tags:                string[]
  palette:             string[]
  relatedColors:       string[]
  projectsUsing:       number
  relatedComponents:   string[]
  visualWeight:        number      // 0–100
  designIntent:        string[]
  visibility:          AssetVisibility
}

// ─── Component DNA ────────────────────────────────────────────────────────────

export interface ComponentDNA {
  category:               string
  manufacturer:           string
  line:                   string
  model:                  string
  materials:              string[]
  finishes:               string[]
  photographyRecommended: string
  visualWeight:           number   // 0–100
  designIntent:           string[]
  relationships:          string[]
  promptOwn:              string
}

// ─── Component Hub ────────────────────────────────────────────────────────────

export interface HubComponent {
  id:                  string
  name:                string
  category:            string
  subcategory?:        string
  manufacturer:        string
  brand:               string
  line?:               string
  model?:              string
  code?:               string
  dimensions:          { width: string; height: string; depth: string; unit: 'mm'|'cm'|'m' }
  materials:           string[]
  finishes:            string[]
  colors:              string[]
  images:              string[]
  technicalFiles:      string[]
  compatibility:       string[]
  replacementBehavior: string
  dna:                 ComponentDNA
  visualWeight:        number
  designIntent:        string[]
  visibility:          AssetVisibility
}

// ─── Space Hub ────────────────────────────────────────────────────────────────

export type SpaceType =
  | 'SALA' | 'COZINHA' | 'BANHEIRO' | 'LAVANDERIA' | 'CLOSET'
  | 'HOME_OFFICE' | 'QUARTO' | 'AREA_GOURMET' | 'FACHADA' | 'PISCINA'

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  SALA:'Sala', COZINHA:'Cozinha', BANHEIRO:'Banheiro', LAVANDERIA:'Lavanderia',
  CLOSET:'Closet', HOME_OFFICE:'Home Office', QUARTO:'Quarto',
  AREA_GOURMET:'Área Gourmet', FACHADA:'Fachada', PISCINA:'Piscina',
}

export const SPACE_TYPE_ICONS: Record<SpaceType, string> = {
  SALA:'🛋️', COZINHA:'🍳', BANHEIRO:'🚿', LAVANDERIA:'🫧', CLOSET:'👗',
  HOME_OFFICE:'💻', QUARTO:'🛏️', AREA_GOURMET:'🍷', FACHADA:'🏛️', PISCINA:'🏊',
}

export interface SpaceTemplate {
  id:           string
  name:         string
  type:         SpaceType
  description:  string
  objects:      string[]
  materials:    string[]
  dna:          string
  cameraConfig: Record<string, unknown>
  renderConfig: Record<string, unknown>
  style:        string
  prompt:       string
  tags:         string[]
  author:       string
  visibility:   AssetVisibility
  visualWeight: number
  designIntent: string[]
  createdAt:    string
}

// ─── Style Hub ────────────────────────────────────────────────────────────────

export type StyleName =
  | 'MINIMALISTA' | 'CONTEMPORANEO' | 'ESCANDINAVO' | 'INDUSTRIAL'
  | 'JAPANDI'     | 'BOHO'          | 'LUXO'        | 'MEDITERRANEO'
  | 'ORGANICO'    | 'CLASSICO'

export const STYLE_LABELS: Record<StyleName, string> = {
  MINIMALISTA:'Minimalista', CONTEMPORANEO:'Contemporâneo', ESCANDINAVO:'Escandinavo',
  INDUSTRIAL:'Industrial', JAPANDI:'Japandi', BOHO:'Boho',
  LUXO:'Luxo', MEDITERRANEO:'Mediterrâneo', ORGANICO:'Orgânico', CLASSICO:'Clássico',
}

export interface HubStyle {
  id:           string
  name:         StyleName
  label:        string
  description:  string
  palette:      string[]
  materials:    string[]
  lighting:     string
  photography:  string
  decoration:   string[]
  atmosphere:   string
  restrictions: string[]
  designIntent: string[]
  visualWeight: number
}

// ─── Manufacturer Hub ─────────────────────────────────────────────────────────

export interface HubManufacturer {
  id:          string
  name:        string
  site:        string
  categories:  string[]
  products:    string[]
  collections: string[]
  finishes:    string[]
  materials:   string[]
  dna:         string
  status:      ManufacturerStatus
  description: string
  origin:      string
}

// ─── AI Hub ───────────────────────────────────────────────────────────────────

export type AITranslatorType =
  | 'IMAGE_GEN' | 'TEXT_GEN' | 'REVIEW' | 'CORRECTION' | 'MEMORY' | 'PROMPT'

export type AITranslatorStatus = 'ACTIVE' | 'PLANNED' | 'DISABLED'

export interface AITranslator {
  id:           string
  name:         string
  provider:     string
  type:         AITranslatorType
  description:  string
  capabilities: string[]
  status:       AITranslatorStatus
  configKeys:   string[]
  icon:         string
}

// ─── Asset Library ────────────────────────────────────────────────────────────

export type AssetType =
  | 'MATERIAL'          | 'COMPONENT'          | 'TEMPLATE'
  | 'PROJECT'           | 'PROMPT'             | 'DNA'
  | 'RENDER_CONFIG'     | 'PHOTOGRAPHY_PROFILE'| 'LIGHTING_PROFILE'
  | 'PROMPT_PACK'       | 'STYLE_PACK'

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  MATERIAL:'Material', COMPONENT:'Componente', TEMPLATE:'Template',
  PROJECT:'Projeto', PROMPT:'Prompt', DNA:'DNA',
  RENDER_CONFIG:'Config Render', PHOTOGRAPHY_PROFILE:'Perfil Fotografia',
  LIGHTING_PROFILE:'Perfil Iluminação', PROMPT_PACK:'Pack de Prompts', STYLE_PACK:'Pack de Estilo',
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  MATERIAL:'🪵', COMPONENT:'🧩', TEMPLATE:'🏠', PROJECT:'📁',
  PROMPT:'⚡', DNA:'🧬', RENDER_CONFIG:'🎛️', PHOTOGRAPHY_PROFILE:'📷',
  LIGHTING_PROFILE:'💡', PROMPT_PACK:'📦', STYLE_PACK:'🎨',
}

export interface AssetVersion {
  version:     string
  description: string
  createdAt:   string
}

export interface Asset {
  id:           string
  type:         AssetType
  name:         string
  description:  string
  author:       string
  version:      string
  tags:         string[]
  category:     string
  license:      AssetLicense
  visibility:   AssetVisibility
  visualWeight: number
  designIntent: string[]
  createdAt:    string
  updatedAt:    string
  versions:     AssetVersion[]
}

// ─── Marketplace ──────────────────────────────────────────────────────────────

export interface MarketplaceItem extends Asset {
  price:    number | null   // null = free
  currency: 'BRL' | 'USD'
  downloads: number
  rating:    number
  reviews:   number
  featured:  boolean
}

// ─── Hub Nav ──────────────────────────────────────────────────────────────────

export type HubSectionId =
  | 'materiais' | 'componentes' | 'ambientes' | 'estilos'
  | 'fabricantes' | 'assets' | 'marketplace' | 'ia'

export interface HubSection {
  id:    HubSectionId
  icon:  string
  label: string
  desc:  string
  badge?: string
}
