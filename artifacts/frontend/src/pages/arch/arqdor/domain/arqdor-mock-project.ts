import type { Project, ArchitecturalObject } from './arqdor-domain-types'
import {
  DEFAULT_PERMISSIONS, LOCKED_PERMISSIONS, FREE_PERMISSIONS, CIRCULATION_PERMISSIONS,
  DEFAULT_DNA, DEFAULT_RENDER_CONFIG,
  LOW_RISK, MED_RISK, HIGH_RISK, VHIGH_RISK,
  EMPTY_MATERIAL, createObject, createEnvironment,
} from './arqdor-defaults'
import { createRelationship } from './arqdor-relationships'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COZINHA_ENV = 'env-coz'
const SALA_ENV    = 'env-sala'
const LAV_ENV     = 'env-lav'

function co(
  id: string, parentId: string | null, name: string,
  category: ArchitecturalObject['category'],
  overrides: Partial<ArchitecturalObject> = {}
): ArchitecturalObject {
  return createObject(id, parentId, COZINHA_ENV, name, category, overrides)
}

// ─── COZINHA objects ──────────────────────────────────────────────────────────

const piso = co('coz-piso', null, 'Piso', 'PISO', {
  description: 'Porcelanato 60×60 carvalho claro',
  status: 'APPROVED',
  confidence: 95,
  sourceOfTruth: 'MATERIAL_REFERENCE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeLighting: true },
  aiRisk: LOW_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Porcelanato Carvalho 60×60', finish: 'Mate', color: '#C8A87A', manufacturer: 'Durafloor' },
  promptNotes: 'Piso em porcelanato carvalho 60×60 mate — assentamento convencional com junta 2mm.',
})

const parede = co('coz-parede', null, 'Parede', 'PAREDE', {
  description: 'Reboco + massa corrida + tinta branco gelo',
  status: 'APPROVED',
  confidence: 90,
  sourceOfTruth: 'USER_INPUT',
  aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeGeometry: false, canReplaceObject: false },
  aiRisk: LOW_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Tinta Branco Gelo', finish: 'Fosco', color: '#F5F0EB' },
})

const forro = co('coz-forro', null, 'Forro', 'FORRO', {
  description: 'Gesso liso com sanca embutida',
  status: 'APPROVED',
  confidence: 85,
  sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: LOCKED_PERMISSIONS,
  aiRisk: MED_RISK,
  promptNotes: 'PRESERVE ceiling height and sanca profile — do not alter.',
})

// Marcenaria tree
const marc = co('coz-marc', null, 'Marcenaria', 'MARCENARIA', {
  description: 'Marcenaria sob medida em MDF',
  status: 'ACTIVE',
  confidence: 88,
  sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true, canChangeFinish: true, canChangeColor: true },
  aiRisk: HIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'MDF Carvalho Freijó 15mm', finish: 'Amadeirado', color: '#9B6C3C', manufacturer: 'Duratex', code: 'DRX-KF15' },
  promptNotes: 'Marcenaria em MDF com textura carvalho freijó — veio vertical nas portas.',
})

const marcInf = co('coz-marc-inf', 'coz-marc', 'Inferior', 'MARCENARIA', {
  status: 'ACTIVE', confidence: 88, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true },
  aiRisk: HIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'MDF Carvalho Freijó 15mm', finish: 'Amadeirado', color: '#9B6C3C' },
})
const marcInfPortas = co('coz-marc-inf-portas', 'coz-marc-inf', 'Portas Inferior', 'PORTA', {
  status: 'ACTIVE', confidence: 82, sourceOfTruth: 'AI_DETECTION',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true, canChangeFinish: true },
  aiRisk: HIGH_RISK,
})
const marcInfGavetas = co('coz-marc-inf-gavetas', 'coz-marc-inf', 'Gavetas', 'GAVETA', {
  status: 'ACTIVE', confidence: 80, sourceOfTruth: 'AI_DETECTION',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true },
  aiRisk: MED_RISK,
})
const marcInfPux = co('coz-marc-inf-pux', 'coz-marc-inf', 'Puxador Cava', 'PUXADOR', {
  description: 'Cava fresada em MDF — sem puxador aparente',
  status: 'LOCKED',
  confidence: 95,
  sourceOfTruth: 'USER_INPUT',
  aiPermissions: LOCKED_PERMISSIONS,
  aiRisk: VHIGH_RISK,
  promptNotes: 'NO hardware visible — use only routed cava (groove). Do NOT add any handle.',
  relationships: [
    createRelationship('coz-marc-inf-pux', 'coz-marc-inf-portas', 'PART_OF', 'Cava é parte das portas do inferior'),
    createRelationship('coz-marc-inf-pux', 'coz-marc-sup-pux',   'SAME_HARDWARE_AS', 'Mesmo sistema de cava que o superior'),
  ],
})

const marcSup = co('coz-marc-sup', 'coz-marc', 'Superior', 'MARCENARIA', {
  status: 'ACTIVE', confidence: 85, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true },
  aiRisk: HIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'MDF Carvalho Freijó 15mm', finish: 'Amadeirado', color: '#9B6C3C' },
  relationships: [
    createRelationship('coz-marc-sup', 'coz-marc-inf', 'SAME_MATERIAL_AS', 'Mesmo material do inferior'),
    createRelationship('coz-marc-sup', 'coz-banc',     'ABOVE',            'Superior acima da bancada'),
  ],
})
const marcSupPortas = co('coz-marc-sup-portas', 'coz-marc-sup', 'Portas Superior', 'PORTA', {
  status: 'ACTIVE', confidence: 80, sourceOfTruth: 'AI_DETECTION',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true, canChangeFinish: true },
  aiRisk: HIGH_RISK,
})
const marcSupPux = co('coz-marc-sup-pux', 'coz-marc-sup', 'Puxador Botão', 'PUXADOR', {
  description: 'Puxador botão inox escovado ø32mm',
  status: 'LOCKED', confidence: 95, sourceOfTruth: 'USER_INPUT',
  aiPermissions: LOCKED_PERMISSIONS,
  aiRisk: VHIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Puxador Inox Escovado', finish: 'Escovado', color: '#C0C0C0' },
  promptNotes: 'KEEP exactly as specified: brushed stainless steel round knob ø32mm — no substitution.',
  relationships: [
    createRelationship('coz-marc-sup-pux', 'coz-marc-sup-portas', 'PART_OF', 'Parte das portas do superior'),
  ],
})

const marcTorre = co('coz-marc-torre', 'coz-marc', 'Torre Quente', 'MARCENARIA', {
  description: 'Torre de embutir forno e microondas',
  status: 'ACTIVE', confidence: 78, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true },
  aiRisk: MED_RISK,
  material: { ...EMPTY_MATERIAL, name: 'MDF Carvalho Freijó 15mm', finish: 'Amadeirado', color: '#9B6C3C' },
})

// Bancada tree
const banc = co('coz-banc', null, 'Bancada', 'BANCADA', {
  description: 'Bancada em Silestone Calacatta',
  status: 'APPROVED', confidence: 92, sourceOfTruth: 'MATERIAL_REFERENCE',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeColor: false },
  aiRisk: { level: 'HIGH', reason: 'Material de alto custo com espessura precisa', restrictions: ['Não alterar espessura 2cm'] },
  material: { ...EMPTY_MATERIAL, name: 'Silestone Calacatta Gold', finish: 'Polido', color: '#E8E0D5', manufacturer: 'Cosentino', code: 'SIL-CG20' },
  promptNotes: 'Bancada Silestone Calacatta Gold polido 2cm — PRESERVE thickness and dimensions.',
  relationships: [
    createRelationship('coz-banc', 'coz-marc-inf', 'ABOVE', 'Bancada sobre o inferior'),
  ],
})
const bancTampo = co('coz-banc-tampo', 'coz-banc', 'Tampo', 'BANCADA', {
  status: 'APPROVED', confidence: 95, sourceOfTruth: 'MATERIAL_REFERENCE',
  aiPermissions: LOCKED_PERMISSIONS,
  aiRisk: HIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Silestone Calacatta Gold', finish: 'Polido', color: '#E8E0D5' },
})
const bancFrontao = co('coz-banc-frontao', 'coz-banc', 'Frontão', 'BANCADA', {
  status: 'ACTIVE', confidence: 80, sourceOfTruth: 'AI_DETECTION',
  aiPermissions: { ...LOCKED_PERMISSIONS, canChangeMaterial: true },
  aiRisk: MED_RISK,
  relationships: [
    createRelationship('coz-banc-frontao', 'coz-banc-tampo', 'SAME_MATERIAL_AS', 'Mesmo material do tampo'),
  ],
})
const bancCuba = co('coz-banc-cuba', 'coz-banc', 'Cuba', 'METAL', {
  description: 'Cuba inox de embutir 50×40cm',
  status: 'APPROVED', confidence: 90, sourceOfTruth: 'USER_INPUT',
  aiPermissions: { ...LOCKED_PERMISSIONS },
  aiRisk: MED_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Cuba Inox 304 Escovado', finish: 'Escovado', color: '#C0C0C0' },
  promptNotes: 'PRESERVE undermount stainless sink — do not modify.',
  relationships: [
    createRelationship('coz-banc-cuba', 'coz-banc', 'PART_OF', 'Cuba embutida na bancada'),
    createRelationship('coz-banc-cuba', 'coz-banc-torneira', 'RELATED_TO', 'Cuba relacionada com torneira'),
  ],
})
const bancTorneira = co('coz-banc-torneira', 'coz-banc', 'Torneira', 'METAL', {
  description: 'Torneira monocomando inox escovado',
  status: 'LOCKED', confidence: 95, sourceOfTruth: 'USER_INPUT',
  aiPermissions: LOCKED_PERMISSIONS,
  aiRisk: VHIGH_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Torneira Deca Monocomando', finish: 'Escovado', color: '#C0C0C0', manufacturer: 'Deca', code: 'DCK-DH900' },
  promptNotes: 'KEEP Deca monocomando faucet — brushed stainless. No substitution.',
  relationships: [
    createRelationship('coz-banc-torneira', 'coz-banc', 'ATTACHED_TO', 'Fixada na bancada'),
  ],
})

// Equipamentos
const geladeira = co('coz-geladeira', null, 'Geladeira', 'EQUIPAMENTOS', {
  description: 'Geladeira French Door 600L inox',
  status: 'ACTIVE', confidence: 75, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeGeometry: false, canChangeMaterial: false },
  aiRisk: MED_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Inox Escovado', finish: 'Escovado', color: '#C0C0C0' },
  relationships: [
    createRelationship('coz-geladeira', 'coz-marc-torre', 'NEXT_TO', 'Geladeira ao lado da torre'),
  ],
})
const forno = co('coz-forno', 'coz-marc-torre', 'Forno', 'EQUIPAMENTOS', {
  description: 'Forno elétrico de embutir 60cm',
  status: 'ACTIVE', confidence: 82, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS },
  aiRisk: LOW_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Inox / Vidro temperado', finish: 'Escovado', color: '#2D2D2D' },
})
const microondas = co('coz-microondas', 'coz-marc-torre', 'Microondas', 'EQUIPAMENTOS', {
  description: 'Microondas de embutir 30L',
  status: 'ACTIVE', confidence: 80, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS },
  aiRisk: LOW_RISK,
  material: { ...EMPTY_MATERIAL, name: 'Inox / Vidro', finish: 'Escovado', color: '#2D2D2D' },
  relationships: [
    createRelationship('coz-microondas', 'coz-forno', 'ABOVE', 'Microondas acima do forno'),
  ],
})
const lavaSeca = co('coz-lavaseca', null, 'Lava e Seca', 'EQUIPAMENTOS', {
  description: 'Lava e seca embutida na marcenaria inferior',
  status: 'ACTIVE', confidence: 70, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS },
  aiRisk: MED_RISK,
  relationships: [
    createRelationship('coz-lavaseca', 'coz-marc-inf', 'PART_OF', 'Embutida no inferior'),
  ],
})

// Esquadria
const esq = co('coz-esq', null, 'Esquadria', 'ESQUADRIA', {
  description: 'Janela alumínio cor branca — vidro laminado 6mm',
  status: 'LOCKED', confidence: 92, sourceOfTruth: 'ORIGINAL_IMAGE',
  aiPermissions: { ...LOCKED_PERMISSIONS },
  aiRisk: { level: 'HIGH', reason: 'Perfil e abertura são técnicos', restrictions: ['Não engrossar perfil','Não alterar abertura'] },
  material: { ...EMPTY_MATERIAL, name: 'Alumínio Branco + Vidro Laminado 6mm', finish: 'Pintado', color: '#FFFFFF' },
  promptNotes: 'PRESERVE window profile exactly — white aluminum frame, 6mm laminated glass.',
})

// Iluminação
const ilum = co('coz-ilum', null, 'Iluminação', 'ILUMINACAO', {
  description: 'Trilho linear embutido 4000K + pendentes sobre bancada',
  status: 'ACTIVE', confidence: 85, sourceOfTruth: 'USER_INPUT',
  aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeLighting: true, canAddRelatedObjects: true },
  aiRisk: LOW_RISK,
  promptNotes: 'Linear track lighting 4000K CRI>90 + pendant lights over counter. Warm-cool balance.',
})

// Decoração
const dec = co('coz-dec', null, 'Decoração', 'DECORACAO', {
  description: 'Objetos decorativos sobre bancada e prateleiras',
  status: 'DRAFT', confidence: 60, sourceOfTruth: 'AI_DETECTION',
  aiPermissions: FREE_PERMISSIONS,
  aiRisk: LOW_RISK,
  promptNotes: 'Add tasteful kitchen decoration: cutting boards, herb plants, ceramic bowls.',
})

// Circulação
const circ = co('coz-circ', null, 'Circulação', 'CIRCULACAO', {
  description: 'Área de circulação central da cozinha — 120cm livre mínimo',
  status: 'LOCKED', confidence: 99, sourceOfTruth: 'MEMORIAL',
  aiPermissions: CIRCULATION_PERMISSIONS,
  aiRisk: { level: 'VERY_HIGH', reason: 'Área de circulação técnica — NÃO bloquear', restrictions: ['Não adicionar mobiliário','Não decorar','Manter fluxo livre'] },
  promptNotes: 'KEEP central circulation area 100% clear — no furniture, no decor, no objects blocking flow.',
})

// ─── SALA (minimal) ───────────────────────────────────────────────────────────

function so(id: string, parentId: string | null, name: string, category: ArchitecturalObject['category'], overrides: Partial<ArchitecturalObject> = {}): ArchitecturalObject {
  return createObject(id, parentId, SALA_ENV, name, category, overrides)
}

const salaPiso   = so('sala-piso',  null, 'Piso',    'PISO',      { status: 'APPROVED', confidence: 90, sourceOfTruth: 'MATERIAL_REFERENCE', aiPermissions: LOCKED_PERMISSIONS, aiRisk: LOW_RISK, material: { ...EMPTY_MATERIAL, name: 'Piso Vinílico Carvalho', finish: 'Mate', color: '#C8A87A' } })
const salaParede = so('sala-parede',null, 'Parede',  'PAREDE',    { status: 'APPROVED', confidence: 88, sourceOfTruth: 'USER_INPUT', aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeGeometry: false }, aiRisk: LOW_RISK })
const salaForro  = so('sala-forro', null, 'Forro',   'FORRO',     { status: 'APPROVED', confidence: 90, sourceOfTruth: 'ORIGINAL_IMAGE', aiPermissions: LOCKED_PERMISSIONS, aiRisk: MED_RISK })
const salaSofa   = so('sala-sofa',  null, 'Sofá',    'MOBILIARIO',{ status: 'ACTIVE', confidence: 75, sourceOfTruth: 'AI_DETECTION', aiPermissions: { ...DEFAULT_PERMISSIONS, canReplaceObject: true }, aiRisk: MED_RISK, material: { ...EMPTY_MATERIAL, name: 'Veludo Verde Musgo', finish: 'Veludo', color: '#4A7856' }, promptNotes: 'Sofa in moss green velvet — 3-seater with wooden legs.' })
const salaMesa   = so('sala-mesa',  null, 'Mesa de Centro', 'MOBILIARIO', { status: 'ACTIVE', confidence: 70, sourceOfTruth: 'AI_DETECTION', aiPermissions: FREE_PERMISSIONS, aiRisk: LOW_RISK })
const salaIlum   = so('sala-ilum',  null, 'Iluminação', 'ILUMINACAO', { status: 'ACTIVE', confidence: 80, sourceOfTruth: 'USER_INPUT', aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeLighting: true, canAddRelatedObjects: true }, aiRisk: LOW_RISK })

// ─── LAVANDERIA (minimal) ─────────────────────────────────────────────────────

function lo(id: string, parentId: string | null, name: string, category: ArchitecturalObject['category'], overrides: Partial<ArchitecturalObject> = {}): ArchitecturalObject {
  return createObject(id, parentId, LAV_ENV, name, category, overrides)
}

const lavPiso  = lo('lav-piso',  null, 'Piso',  'PISO',  { status: 'APPROVED', confidence: 88, sourceOfTruth: 'MATERIAL_REFERENCE', aiPermissions: LOCKED_PERMISSIONS, aiRisk: LOW_RISK, material: { ...EMPTY_MATERIAL, name: 'Porcelanato Técnico Antiderrapante', finish: 'Texturizado', color: '#A0A0A0' } })
const lavMarc  = lo('lav-marc',  null, 'Bancada Lavanderia', 'BANCADA', { status: 'ACTIVE', confidence: 75, sourceOfTruth: 'AI_DETECTION', aiPermissions: { ...DEFAULT_PERMISSIONS, canChangeGeometry: false }, aiRisk: MED_RISK })
const lavMaq   = lo('lav-maq',   null, 'Máquina de Lavar', 'EQUIPAMENTOS', { status: 'ACTIVE', confidence: 70, sourceOfTruth: 'AI_DETECTION', aiPermissions: LOCKED_PERMISSIONS, aiRisk: LOW_RISK })

// ─── Assemble project ─────────────────────────────────────────────────────────

const cozEnv  = createEnvironment(COZINHA_ENV, 'Cozinha', 'INTERIOR', 'Cozinha aberta integrada com sala', [
  piso, parede, forro,
  marc, marcInf, marcInfPortas, marcInfGavetas, marcInfPux,
  marcSup, marcSupPortas, marcSupPux, marcTorre,
  banc, bancTampo, bancFrontao, bancCuba, bancTorneira,
  geladeira, forno, microondas, lavaSeca,
  esq, ilum, dec, circ,
])

const salaEnv = createEnvironment(SALA_ENV, 'Sala de Estar', 'INTERIOR', 'Sala integrada com cozinha aberta', [
  salaPiso, salaParede, salaForro, salaSofa, salaMesa, salaIlum,
])

const lavEnv  = createEnvironment(LAV_ENV, 'Lavanderia', 'SERVICO', 'Área de serviço', [
  lavPiso, lavMarc, lavMaq,
])

export const MOCK_PROJECT: Project = {
  id:          'proj-apartamento-alpha',
  name:        'Apartamento Alpha',
  description: 'Apartamento contemporâneo 80m² — integração sala/cozinha com volumetria em marcenaria MDF carvalho e bancada Silestone.',
  createdAt:   '2026-06-01T10:00:00Z',
  updatedAt:   '2026-07-03T09:00:00Z',
  version:     'V2',
  environments: [cozEnv, salaEnv, lavEnv],
  dna: {
    ...DEFAULT_DNA,
    architecturalStyle:   'Contemporâneo Minimalista',
    designLanguage:       'Linhas retas, volumes limpos, ausência de ornamentos',
    colorPalette:         ['#E8E0D5','#C8A87A','#2D2D2D','#F5F0EB','#4A7856'],
    predominantMaterials: ['MDF Carvalho Freijó','Silestone Calacatta Gold','Porcelanato 60×60'],
    predominantHardware:  ['Cava fresada','Puxador botão inox escovado','Torneira monocomando'],
    atmosphere:           'Aconchegante com sofisticação discreta',
    renderObjective:      'Alta fidelidade ao projeto executivo para apresentação ao cliente',
  },
  renderConfig: {
    ...DEFAULT_RENDER_CONFIG,
    lens:        '28mm',
    cameraHeight:'0.85m (câmera baixa, perspectiva imersiva)',
    lightingMood:'Warm natural (3200K) + accent LED 4000K',
  },
  versions: [
    { id: 'v1', label: 'V1 — Estudo Preliminar', description: 'Versão inicial para aprovação do cliente', createdAt: '2026-06-01T10:00:00Z', current: false },
    { id: 'v2', label: 'V2 — Projeto Executivo',  description: 'Versão final com detalhamento completo',  createdAt: '2026-07-01T09:00:00Z', current: true  },
  ],
}
