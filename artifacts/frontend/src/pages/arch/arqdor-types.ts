// ─── Object Categories ────────────────────────────────────────────────────────

export type ObjectCategory =
  | 'AMBIENTE'
  | 'ESTRUTURA'
  | 'PISO'
  | 'PAREDE'
  | 'FORRO'
  | 'MARCENARIA'
  | 'PORTA'
  | 'GAVETA'
  | 'PUXADOR'
  | 'FERRAGEM'
  | 'BANCADA'
  | 'PEDRA'
  | 'METAL'
  | 'ESQUADRIA'
  | 'VIDRO'
  | 'ILUMINACAO'
  | 'MOBILIARIO'
  | 'PAISAGISMO'
  | 'DECORACAO'
  | 'EQUIPAMENTOS'
  | 'PERSONALIZADO'

// ─── Core enums ───────────────────────────────────────────────────────────────

export type FonteVerdade =
  | 'ORIGINAL_IMAGE'
  | 'USER_INPUT'
  | 'MATERIAL_REFERENCE'
  | 'MATERIAL_LIBRARY'
  | 'MEMORIAL'
  | 'AI_DETECTION'

export type RiskLevel = 'MUITO_BAIXO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO'

export type ObjectStatus = 'ATIVO' | 'APROVADO' | 'BLOQUEADO' | 'RASCUNHO'

// ─── AI subsystems ────────────────────────────────────────────────────────────

export interface AIPermissions {
  alterarGeometria:  boolean
  alterarMaterial:   boolean
  alterarAcabamento: boolean
  alterarCor:        boolean
  alterarIluminacao: boolean
  alterarDecoracao:  boolean
  moverObjeto:       boolean
  substituir:        boolean
}

export const DEFAULT_PERMISSIONS: AIPermissions = {
  alterarGeometria: false, alterarMaterial: true, alterarAcabamento: true,
  alterarCor: true, alterarIluminacao: true, alterarDecoracao: true,
  moverObjeto: false, substituir: false,
}

export const LOCKED_PERMISSIONS: AIPermissions = {
  alterarGeometria: false, alterarMaterial: false, alterarAcabamento: false,
  alterarCor: false, alterarIluminacao: false, alterarDecoracao: false,
  moverObjeto: false, substituir: false,
}

export interface AIRisk {
  nivel: RiskLevel
  descricao: string
}

// ─── Material ─────────────────────────────────────────────────────────────────

export interface MaterialSpec {
  nome:       string
  acabamento: string
  fabricante: string
  cor:        string
  textura:    string
  veio:       boolean
  espessura:  string
  codigo:     string
}

export const EMPTY_MATERIAL: MaterialSpec = {
  nome: '', acabamento: '', fabricante: '', cor: '', textura: '', veio: false, espessura: '', codigo: '',
}

// ─── Spatial ─────────────────────────────────────────────────────────────────

export interface Dimensoes { largura: string; altura: string; profundidade: string }
export interface Posicao    { x: string; y: string; z: string }

// ─── Architectural Object ─────────────────────────────────────────────────────

export interface ArchObject {
  id:              string
  parentId:        string | null
  nome:            string
  categoria:       ObjectCategory
  tipo:            string
  descricao:       string
  status:          ObjectStatus
  confianca:       number
  fonteVerdade:    FonteVerdade
  observacoes:     string
  imagemReferencia?: string
  material:        MaterialSpec
  dimensoes?:      Dimensoes
  posicao?:        Posicao
  riscoIA:         AIRisk
  permissoesIA:    AIPermissions
  criadoEm:        string
  atualizadoEm:    string
}

// ─── Versioning ───────────────────────────────────────────────────────────────

export interface ProjectVersion {
  id:        string
  label:     string
  criadaEm:  string
  descricao: string
  atual:     boolean
}

// ─── ArqDNA™ ─────────────────────────────────────────────────────────────────

export interface ProjectDNA {
  estiloArquitetonico:    string
  linguagem:              string
  paletaCromatica:        string[]
  materiaisPredominantes: string[]
  ferragensPredominantes: string[]
  nivelDetalhamento:      'BAIXO' | 'MÉDIO' | 'ALTO' | 'ULTRA'
  atmosfera:              string
  objetivoRender:         string
  tipofotografia:         string
  nivelRealismo:          number
}

// ─── Library ─────────────────────────────────────────────────────────────────

export type LibraryCategory =
  | 'Materiais' | 'Puxadores' | 'Pedras' | 'Tecidos' | 'Tintas'
  | 'Esquadrias' | 'Ferragens' | 'Vegetação' | 'Iluminação' | 'Mobiliário' | 'Decoração'

export interface LibraryItem {
  id:        string
  nome:      string
  categoria: LibraryCategory
  fabricante: string
  linha:     string
  codigo:    string
  descricao: string
  acabamento: string
  cor?:      string
  tags:      string[]
}

// ─── Structured Prompt ────────────────────────────────────────────────────────

export interface StructuredPrompt {
  core:      string
  project:   string
  style:     string
  negative:  string
  final:     string
  geradoEm:  string
}

// ─── Top-level Project ────────────────────────────────────────────────────────

export interface ArchProject {
  id:          string
  nome:        string
  cliente:     string
  versoes:     ProjectVersion[]
  versaoAtual: string
  dna:         ProjectDNA
  objetos:     ArchObject[]
  criadoEm:    string
}

// ─── Object history entry ─────────────────────────────────────────────────────

export interface HistoryEntry {
  id:        string
  objetoId:  string
  campo:     string
  anterior:  string
  novo:      string
  autor:     string
  em:        string
}
