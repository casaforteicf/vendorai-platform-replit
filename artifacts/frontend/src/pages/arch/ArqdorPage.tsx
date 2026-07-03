import { useState, useCallback } from 'react'
import type {
  ArchProject, ArchObject, ObjectCategory, FonteVerdade, RiskLevel,
  ObjectStatus, AIPermissions, ProjectDNA, LibraryItem, LibraryCategory,
  StructuredPrompt,
} from './arqdor-types'
import { DEFAULT_PERMISSIONS, LOCKED_PERMISSIONS, EMPTY_MATERIAL } from './arqdor-types'

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg:      '#0d0b1e',
  surface: '#13102b',
  card:    'rgba(255,255,255,0.04)',
  border:  'rgba(255,255,255,0.08)',
  borderM: 'rgba(255,255,255,0.14)',
  purple:  '#7c3aed',
  purpleL: '#a78bfa',
  text:    'rgba(255,255,255,0.88)',
  dim:     'rgba(255,255,255,0.44)',
  dimL:    'rgba(255,255,255,0.22)',
} as const

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<ObjectCategory, { icon: string; color: string; label: string }> = {
  AMBIENTE:     { icon: '🏠', color: '#60a5fa', label: 'Ambiente'     },
  ESTRUTURA:    { icon: '🏗️', color: '#94a3b8', label: 'Estrutura'    },
  PISO:         { icon: '⬛', color: '#a78bfa', label: 'Piso'         },
  PAREDE:       { icon: '🧱', color: '#94a3b8', label: 'Parede'       },
  FORRO:        { icon: '⬜', color: '#64748b', label: 'Forro'        },
  MARCENARIA:   { icon: '🪵', color: '#c8a87a', label: 'Marcenaria'   },
  PORTA:        { icon: '🚪', color: '#d4956a', label: 'Porta'        },
  GAVETA:       { icon: '📦', color: '#c8a87a', label: 'Gaveta'       },
  PUXADOR:      { icon: '🔩', color: '#e2c97e', label: 'Puxador'      },
  FERRAGEM:     { icon: '🔧', color: '#e2c97e', label: 'Ferragem'     },
  BANCADA:      { icon: '🔲', color: '#a1887f', label: 'Bancada'      },
  PEDRA:        { icon: '🪨', color: '#78909c', label: 'Pedra'        },
  METAL:        { icon: '⚙️', color: '#b0bec5', label: 'Metal'        },
  ESQUADRIA:    { icon: '🪟', color: '#81d4fa', label: 'Esquadria'    },
  VIDRO:        { icon: '💎', color: '#80deea', label: 'Vidro'        },
  ILUMINACAO:   { icon: '💡', color: '#fff176', label: 'Iluminação'   },
  MOBILIARIO:   { icon: '🛋️', color: '#ce93d8', label: 'Mobiliário'  },
  PAISAGISMO:   { icon: '🌿', color: '#81c784', label: 'Paisagismo'   },
  DECORACAO:    { icon: '🎨', color: '#f48fb1', label: 'Decoração'    },
  EQUIPAMENTOS: { icon: '🔌', color: '#80cbc4', label: 'Equipamentos' },
  PERSONALIZADO:{ icon: '✳️', color: '#e0e0e0', label: 'Personalizado'},
}

const RISK_META: Record<RiskLevel, { color: string; bg: string; label: string }> = {
  MUITO_BAIXO: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  label: 'Muito Baixo' },
  BAIXO:       { color: '#86efac', bg: 'rgba(134,239,172,0.10)', label: 'Baixo'       },
  MEDIO:       { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Médio'       },
  ALTO:        { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  label: 'Alto'        },
  MUITO_ALTO:  { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Muito Alto'  },
}

const STATUS_META: Record<ObjectStatus, { color: string; bg: string }> = {
  ATIVO:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'   },
  APROVADO:  { color: '#4ade80', bg: 'rgba(74,222,128,0.12)'   },
  BLOQUEADO: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)'  },
  RASCUNHO:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'   },
}

const FONTE_META: Record<FonteVerdade, { label: string; color: string; p: number }> = {
  MEMORIAL:           { label: 'Memorial',        color: '#a78bfa', p: 1 },
  MATERIAL_REFERENCE: { label: 'Referência',       color: '#60a5fa', p: 2 },
  USER_INPUT:         { label: 'Usuário',          color: '#34d399', p: 3 },
  MATERIAL_LIBRARY:   { label: 'Biblioteca',       color: '#fbbf24', p: 4 },
  AI_DETECTION:       { label: 'Detecção IA',      color: '#fb923c', p: 5 },
  ORIGINAL_IMAGE:     { label: 'Imagem Original',  color: '#94a3b8', p: 6 },
}

const ALL_FONTES = Object.keys(FONTE_META) as FonteVerdade[]
const ALL_RISKS  = Object.keys(RISK_META)  as RiskLevel[]
const ALL_CATS   = Object.keys(CAT_META)   as ObjectCategory[]
const ALL_STATUS = Object.keys(STATUS_META) as ObjectStatus[]

const PERM_LABELS: Record<keyof AIPermissions, string> = {
  alterarGeometria:  'Alterar Geometria',
  alterarMaterial:   'Alterar Material',
  alterarAcabamento: 'Alterar Acabamento',
  alterarCor:        'Alterar Cor',
  alterarIluminacao: 'Alterar Iluminação',
  alterarDecoracao:  'Alterar Decoração',
  moverObjeto:       'Mover Objeto',
  substituir:        'Substituir',
}

// ─── Mock project ─────────────────────────────────────────────────────────────

const NOW = new Date().toISOString()

function mkObj(
  id: string, parentId: string | null,
  nome: string, categoria: ObjectCategory,
  opts: Partial<ArchObject> = {}
): ArchObject {
  return {
    id, parentId, nome, categoria,
    tipo: CAT_META[categoria].label,
    descricao: '', status: 'ATIVO', confianca: 85,
    fonteVerdade: 'AI_DETECTION', observacoes: '',
    material: { ...EMPTY_MATERIAL },
    riscoIA: { nivel: 'BAIXO', descricao: '' },
    permissoesIA: { ...DEFAULT_PERMISSIONS },
    criadoEm: NOW, atualizadoEm: NOW,
    ...opts,
  }
}

const MOCK_PROJECT: ArchProject = {
  id: 'proj-alpha', nome: 'Apartamento Alpha', cliente: 'Família Oliveira',
  versaoAtual: 'v1',
  criadoEm: NOW,
  versoes: [
    { id: 'v1', label: 'V1', criadaEm: NOW, descricao: 'Versão inicial — leitura técnica', atual: true },
    { id: 'v2', label: 'V2', criadaEm: NOW, descricao: 'Revisão de materiais', atual: false },
  ],
  dna: {
    estiloArquitetonico: 'Contemporâneo',
    linguagem: 'Minimalismo funcional com toques orgânicos',
    paletaCromatica: ['#E8E0D5', '#C8A87A', '#2D2D2D', '#F5F0EB'],
    materiaisPredominantes: ['Carvalho natural', 'Mármore Calacatta', 'Concreto aparente'],
    ferragensPredominantes: ['Inox escovado', 'Preto fosco'],
    nivelDetalhamento: 'ALTO',
    atmosfera: 'Aconchegante, sofisticado e bem iluminado',
    objetivoRender: 'Apresentação ao cliente final',
    tipofotografia: 'Perspectiva 45° — câmera baixa',
    nivelRealismo: 9,
  },
  objetos: [
    // ── SALA DE ESTAR ──
    mkObj('sala', null, 'Sala de Estar', 'AMBIENTE', { confianca: 98, fonteVerdade: 'ORIGINAL_IMAGE' }),
    mkObj('sala-piso',   'sala', 'Piso',             'PISO',      { confianca: 95, fonteVerdade: 'MATERIAL_LIBRARY', status: 'APROVADO', material: { ...EMPTY_MATERIAL, nome: 'Porcelanato Bege', cor: '#C8B49A', fabricante: 'Portobello' }, permissoesIA: { ...DEFAULT_PERMISSIONS, alterarMaterial: false } }),
    mkObj('sala-parede', 'sala', 'Parede Principal', 'PAREDE',    { confianca: 97, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Reboco Texturizado', cor: '#E8E0D5' }, riscoIA: { nivel: 'BAIXO', descricao: 'Material bem definido, baixo risco de reinterpretação' } }),
    mkObj('sala-teto',   'sala', 'Teto',             'FORRO',     { confianca: 88, fonteVerdade: 'ORIGINAL_IMAGE', permissoesIA: { ...LOCKED_PERMISSIONS }, status: 'BLOQUEADO', riscoIA: { nivel: 'MUITO_BAIXO', descricao: '' } }),
    mkObj('sala-sofa',   'sala', 'Sofá',             'MOBILIARIO',{ confianca: 82, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Veludo Verde Musgo', cor: '#4A7856' }, permissoesIA: { ...DEFAULT_PERMISSIONS, substituir: true }, riscoIA: { nivel: 'ALTO', descricao: 'REPLACE com 82% de confiança — risco de distorção da geometria da sala' } }),
    mkObj('sala-mesa',   'sala', 'Mesa de Centro',   'MOBILIARIO',{ confianca: 78, fonteVerdade: 'AI_DETECTION', riscoIA: { nivel: 'MEDIO', descricao: 'Elemento com baixa confiança pode ser reinterpretado' } }),
    mkObj('sala-janela', 'sala', 'Janela',           'ESQUADRIA', { confianca: 94, fonteVerdade: 'ORIGINAL_IMAGE', permissoesIA: { ...LOCKED_PERMISSIONS }, status: 'BLOQUEADO' }),
    mkObj('sala-lum',    'sala', 'Luminária Pendente','ILUMINACAO',{ confianca: 70, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Metal Dourado Escovado', cor: '#D4A843' }, riscoIA: { nivel: 'MEDIO', descricao: 'Modificação de iluminação pode afetar temperatura de cor da cena' } }),

    // ── COZINHA ──
    mkObj('coz', null, 'Cozinha', 'AMBIENTE', { confianca: 96, fonteVerdade: 'ORIGINAL_IMAGE' }),
    mkObj('coz-piso',  'coz', 'Piso',  'PISO',  { confianca: 93, fonteVerdade: 'MATERIAL_LIBRARY', material: { ...EMPTY_MATERIAL, nome: 'Carvalho Claro 90×180', cor: '#C8A87A', fabricante: 'Durafloor' } }),
    mkObj('coz-forro', 'coz', 'Forro', 'FORRO', { confianca: 89, fonteVerdade: 'ORIGINAL_IMAGE', permissoesIA: { ...LOCKED_PERMISSIONS }, status: 'BLOQUEADO' }),
    // Marcenaria
    mkObj('coz-marc',     'coz',      'Marcenaria',      'MARCENARIA', { confianca: 91, fonteVerdade: 'MEMORIAL'   }),
    mkObj('coz-marc-sup', 'coz-marc', 'Armário Superior','MARCENARIA', { confianca: 88, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'MDF Branco TX', cor: '#F5F5F5', acabamento: 'Texturizado', fabricante: 'Duratex' } }),
    mkObj('coz-marc-inf', 'coz-marc', 'Armário Inferior','MARCENARIA', { confianca: 88, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'MDF Carvalho', cor: '#C8A87A', acabamento: 'Amadeirado', fabricante: 'Duratex' } }),
    mkObj('coz-marc-ilha','coz-marc', 'Ilha',            'MARCENARIA', { confianca: 85, fonteVerdade: 'MEMORIAL', material: { ...EMPTY_MATERIAL, nome: 'Carvalho Freijó', cor: '#9B6C3C' }, riscoIA: { nivel: 'ALTO', descricao: 'Ilha central — IA tende a simplificar forma e detalhes' } }),
    // Porta do armário superior
    mkObj('coz-porta01', 'coz-marc-sup', 'Porta 01',  'PORTA',   { confianca: 90, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'MDF Branco TX', cor: '#F5F5F5' } }),
    mkObj('coz-pux01',   'coz-porta01',  'Puxador',   'PUXADOR', { confianca: 88, fonteVerdade: 'MATERIAL_LIBRARY', material: { ...EMPTY_MATERIAL, nome: 'Puxador Inox Escovado 128mm', fabricante: 'Hafele', codigo: 'HF-3021' }, riscoIA: { nivel: 'ALTO', descricao: 'A IA normalmente troca puxador por cava' } }),
    mkObj('coz-dob01',   'coz-porta01',  'Dobradiça', 'FERRAGEM',{ confianca: 75, fonteVerdade: 'ORIGINAL_IMAGE', permissoesIA: { ...LOCKED_PERMISSIONS }, status: 'BLOQUEADO' }),
    // Bancada
    mkObj('coz-banc', 'coz', 'Bancada', 'BANCADA', { confianca: 92, fonteVerdade: 'MATERIAL_REFERENCE', material: { ...EMPTY_MATERIAL, nome: 'Mármore Calacatta', cor: '#F5F0EB', fabricante: 'Colormix', espessura: '20mm' }, riscoIA: { nivel: 'MEDIO', descricao: 'Veio do mármore raramente preservado pela IA' } }),
    // Metais
    mkObj('coz-metal', 'coz', 'Metais',      'METAL',     { confianca: 80, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Inox Escovado', acabamento: 'Escovado' } }),
    mkObj('coz-esq',   'coz', 'Esquadrias',  'ESQUADRIA', { confianca: 91, fonteVerdade: 'ORIGINAL_IMAGE', permissoesIA: { ...LOCKED_PERMISSIONS }, status: 'BLOQUEADO' }),
    mkObj('coz-lum',   'coz', 'Iluminação',  'ILUMINACAO',{ confianca: 74, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Trilho Linear 4000K', cor: '#FFFFFF' } }),

    // ── SUÍTE ──
    mkObj('suite', null, 'Suíte Master', 'AMBIENTE', { confianca: 94, fonteVerdade: 'ORIGINAL_IMAGE' }),
    mkObj('suite-piso',  'suite', 'Piso',   'PISO',    { confianca: 90, fonteVerdade: 'MATERIAL_LIBRARY', material: { ...EMPTY_MATERIAL, nome: 'Carvalho Escuro', cor: '#6B4226' } }),
    mkObj('suite-parede','suite', 'Parede', 'PAREDE',  { confianca: 85, fonteVerdade: 'USER_INPUT', material: { ...EMPTY_MATERIAL, nome: 'Stucco Veneziano', cor: '#EDE8DF' } }),
    mkObj('suite-cama',  'suite', 'Cama',   'MOBILIARIO',{ confianca: 79, fonteVerdade: 'USER_INPUT', riscoIA: { nivel: 'MEDIO', descricao: '' } }),

    // ── CLOSET ──
    mkObj('closet', null, 'Closet', 'AMBIENTE', { confianca: 88, fonteVerdade: 'ORIGINAL_IMAGE' }),
    mkObj('closet-marc', 'closet', 'Marcenaria', 'MARCENARIA', { confianca: 86, fonteVerdade: 'MEMORIAL', material: { ...EMPTY_MATERIAL, nome: 'MDF Freijó', cor: '#9B6C3C' } }),
  ],
}

// Mock library
const MOCK_LIBRARY: LibraryItem[] = [
  { id:'lib-1', nome:'Porcelanato Bege 90×90', categoria:'Materiais', fabricante:'Portobello', linha:'Naturale', codigo:'PBE-90', descricao:'Porcelanato retificado efeito cimento', acabamento:'Mate', cor:'#C8B49A', tags:['piso','neutro','grande formato'] },
  { id:'lib-2', nome:'Mármore Calacatta Extra', categoria:'Pedras', fabricante:'Colormix', linha:'Premium', codigo:'MCE-20', descricao:'Bloco A com veio dourado', acabamento:'Polido', cor:'#F5F0EB', tags:['pedra','mármore','luxo','bancada'] },
  { id:'lib-3', nome:'Puxador Inox Escovado 128mm', categoria:'Puxadores', fabricante:'Häfele', linha:'Studio', codigo:'HF-3021', descricao:'Puxador tubular ø10mm', acabamento:'Escovado', cor:'#C0C0C0', tags:['puxador','inox','moderno'] },
  { id:'lib-4', nome:'MDF Carvalho Freijó 15mm', categoria:'Materiais', fabricante:'Duratex', linha:'Premium', codigo:'DRX-KF15', descricao:'Painel decorativo com veio real', acabamento:'Amadeirado', cor:'#9B6C3C', tags:['marcenaria','madeira','freijó'] },
  { id:'lib-5', nome:'Trilho Linear 4000K', categoria:'Iluminação', fabricante:'Blumenau', linha:'Slim', codigo:'BL-TL4K', descricao:'Trilho embutido CCT 4000K CRI>90', acabamento:'Branco Fosco', cor:'#FFFFFF', tags:['iluminação','trilho','cozinha'] },
  { id:'lib-6', nome:'Veludo Verde Musgo', categoria:'Tecidos', fabricante:'Teciflex', linha:'Veludo Premium', codigo:'VPM-VM', descricao:'Veludo dupla face anti-pilling', acabamento:'Veludo', cor:'#4A7856', tags:['tecido','sofá','veludo'] },
  { id:'lib-7', nome:'Inox Escovado 304', categoria:'Ferragens', fabricante:'Aço Premium', linha:'Inox', codigo:'INX-304EB', descricao:'Inox acabamento escovado espessura 1.5mm', acabamento:'Escovado', cor:'#B0B0B0', tags:['metal','inox','cozinha'] },
  { id:'lib-8', nome:'Porcelanato Carvalho 20×120', categoria:'Materiais', fabricante:'Durafloor', linha:'Wood', codigo:'DFL-CK20', descricao:'Porcelanato madeira retificado', acabamento:'Mate', cor:'#C8A87A', tags:['piso','madeira','porcelanato'] },
]

const LIBRARY_CATS: LibraryCategory[] = ['Materiais','Puxadores','Pedras','Tecidos','Tintas','Esquadrias','Ferragens','Vegetação','Iluminação','Mobiliário','Decoração']

// ─── Prompt generation ────────────────────────────────────────────────────────

function buildPrompt(project: ArchProject): StructuredPrompt {
  const objs = project.objetos
  const dna  = project.dna

  const locked  = objs.filter(o => !o.permissoesIA.alterarMaterial && !o.permissoesIA.alterarGeometria && o.categoria !== 'AMBIENTE')
  const matObs  = objs.filter(o => o.permissoesIA.alterarMaterial && o.material.nome && o.categoria !== 'AMBIENTE')
  const replObs = objs.filter(o => o.permissoesIA.substituir)

  const core = `Photorealistic architectural ${dna.tipofotografia.toLowerCase()} of a ${dna.estiloArquitetonico.toLowerCase()} interior. Professional architectural photography, 8K resolution, physically-based rendering with ultra-high fidelity. ${dna.atmosfera}.`

  const parts: string[] = []
  if (locked.length)  parts.push(`PRESERVE exactly: ${locked.map(o=>o.nome).join(', ')}.`)
  if (matObs.length)  parts.push(`APPLY specified materials: ${matObs.map(o=>`${o.nome} → ${o.material.nome}${o.material.cor ? ` (${o.material.cor})` : ''}`).join('; ')}.`)
  if (replObs.length) parts.push(`REPLACE completely: ${replObs.map(o=>`${o.nome}${o.material.nome ? ` → ${o.material.nome}` : ''}`).join(', ')}.`)

  const style = `Lighting: warm, ${dna.nivelRealismo >= 8 ? 'hyper-realistic PBR, depth of field' : 'realistic'}. Style language: ${dna.linguagem}. Predominant materials: ${dna.materiaisPredominantes.join(', ')}. Detail level: ${dna.nivelDetalhamento}. Camera: ${dna.tipofotografia}.`

  const negative = `Do not modify preserved/LOCKED elements. No distorted proportions. No unrealistic reflections or light leaks. No rendering artifacts. No watermarks. No people or animals. No cartoon style. No low-res textures. No floating objects. No overexposed areas. No inconsistent shadows.`

  const final = [core, parts.join('\n'), style].filter(Boolean).join('\n\n')

  return { core, project: parts.join('\n'), style, negative, final, geradoEm: new Date().toISOString() }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties  = { background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'14px 16px' }
const lbl: React.CSSProperties   = { fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:T.dim, textTransform:'uppercase' as const, margin:0 }
const inp: React.CSSProperties   = { background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:12, padding:'6px 10px', outline:'none', width:'100%', boxSizing:'border-box' as const }
const btnP: React.CSSProperties  = { padding:'7px 16px', borderRadius:7, border:'none', background:T.purple, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }
const btnS: React.CSSProperties  = { padding:'7px 14px', borderRadius:7, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, fontSize:12, fontWeight:500, cursor:'pointer' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function CatBadge({ cat, size = 'sm' }: { cat: ObjectCategory; size?: 'xs'|'sm' }) {
  const m = CAT_META[cat]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding: size==='xs' ? '1px 5px' : '2px 7px',
      borderRadius:4, fontSize: size==='xs' ? 9 : 10, fontWeight:700,
      background:`${m.color}18`, border:`1px solid ${m.color}35`, color:m.color, whiteSpace:'nowrap' as const,
    }}>{m.icon} {m.label}</span>
  )
}

function RiskBadge({ nivel }: { nivel: RiskLevel }) {
  const m = RISK_META[nivel]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 7px',
      borderRadius:4, fontSize:10, fontWeight:700,
      background:m.bg, color:m.color,
    }}>{m.label}</span>
  )
}

function FonteTag({ f }: { f: FonteVerdade }) {
  const m = FONTE_META[f]
  return <span style={{ fontSize:9, fontWeight:700, color:m.color }}>{m.p}. {m.label}</span>
}

function PermToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontSize:12, color:T.text }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{
        width:42, height:22, borderRadius:11, border:'none', cursor:'pointer',
        background: value ? T.purple : 'rgba(255,255,255,0.1)', transition:'background 0.2s',
        position:'relative',
      }}>
        <div style={{
          position:'absolute', top:3, left: value ? 22 : 3, width:16, height:16,
          borderRadius:50, background:'#fff', transition:'left 0.2s',
        }} />
      </button>
    </div>
  )
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

function TreeNode({
  obj, depth, allObjs, selectedId, onSelect, expandedIds, onToggle,
}: {
  obj: ArchObject; depth: number; allObjs: ArchObject[];
  selectedId: string | null; onSelect: (id: string) => void;
  expandedIds: Set<string>; onToggle: (id: string) => void;
}) {
  const children  = allObjs.filter(o => o.parentId === obj.id)
  const hasChildren = children.length > 0
  const expanded  = expandedIds.has(obj.id)
  const selected  = selectedId === obj.id
  const m         = CAT_META[obj.categoria]
  const rm        = RISK_META[obj.riscoIA.nivel]

  return (
    <div>
      <div
        onClick={() => { onSelect(obj.id); if (hasChildren) onToggle(obj.id) }}
        style={{
          display:'flex', alignItems:'center', gap:4, paddingLeft: 12 + depth * 14,
          paddingRight:10, paddingTop:5, paddingBottom:5, cursor:'pointer', borderRadius:6,
          background: selected ? 'rgba(124,58,237,0.15)' : 'transparent',
          border: selected ? `1px solid rgba(124,58,237,0.3)` : '1px solid transparent',
          transition:'background 0.15s',
          marginBottom:1,
        }}
      >
        {/* Expand arrow */}
        <span style={{ width:12, fontSize:8, color:T.dim, textAlign:'center', flexShrink:0 }}>
          {hasChildren ? (expanded ? '▾' : '▸') : ''}
        </span>
        {/* Icon */}
        <span style={{ fontSize:12, flexShrink:0 }}>{m.icon}</span>
        {/* Name */}
        <span style={{ fontSize:12, fontWeight: selected ? 700 : 500, color: selected ? '#fff' : T.text, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
          {obj.nome}
        </span>
        {/* Risk dot */}
        <div style={{ width:6, height:6, borderRadius:50, background:rm.color, flexShrink:0, opacity:obj.riscoIA.nivel === 'MUITO_BAIXO' ? 0.3 : 1 }} />
        {/* Locked */}
        {obj.status === 'BLOQUEADO' && <span style={{ fontSize:9, opacity:0.5 }}>🔒</span>}
      </div>
      {hasChildren && expanded && (
        <div>
          {children.map(c => (
            <TreeNode key={c.id} obj={c} depth={depth+1} allObjs={allObjs} selectedId={selectedId}
              onSelect={onSelect} expandedIds={expandedIds} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Inspector Tabs ───────────────────────────────────────────────────────────

type InspTab = 'geral'|'materiais'|'referencias'|'permissoes'|'risco'|'prompt'|'historico'
const INSP_TABS: { id: InspTab; label: string }[] = [
  { id:'geral',      label:'Geral'      },
  { id:'materiais',  label:'Materiais'  },
  { id:'referencias',label:'Referências'},
  { id:'permissoes', label:'Permissões' },
  { id:'risco',      label:'Risco IA'   },
  { id:'prompt',     label:'Prompt'     },
  { id:'historico',  label:'Histórico'  },
]

function Inspector({
  obj, onUpdate, allObjs,
}: {
  obj: ArchObject
  onUpdate: (patch: Partial<ArchObject>) => void
  allObjs: ArchObject[]
}) {
  const [tab, setTab] = useState<InspTab>('geral')
  const m = CAT_META[obj.categoria]
  const rm = RISK_META[obj.riscoIA.nivel]

  const updateMat = (patch: Partial<typeof obj.material>) =>
    onUpdate({ material: { ...obj.material, ...patch } })
  const updatePerm = (patch: Partial<AIPermissions>) =>
    onUpdate({ permissoesIA: { ...obj.permissoesIA, ...patch } })

  // Object-level prompt fragment
  const pFrag = (() => {
    const p = obj.permissoesIA
    if (!p.alterarMaterial && !p.alterarGeometria) return `PRESERVE ${obj.nome} exactly — do not modify.`
    if (p.substituir && obj.material.nome) return `REPLACE ${obj.nome} with ${obj.material.nome}${obj.material.cor ? ` (${obj.material.cor})` : ''}.`
    if (obj.material.nome) return `APPLY ${obj.material.nome}${obj.material.acabamento ? `, ${obj.material.acabamento}` : ''} to ${obj.nome}.`
    return `${obj.nome}: allow AI to interpret within project style.`
  })()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Inspector header */}
      <div style={{ padding:'14px 16px 0', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <span style={{ fontSize:20 }}>{m.icon}</span>
          <input
            value={obj.nome}
            onChange={e => onUpdate({ nome: e.target.value })}
            style={{ ...inp, fontSize:14, fontWeight:700, padding:'4px 8px', background:'transparent', border:'none' }}
          />
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const, marginBottom:10 }}>
          <CatBadge cat={obj.categoria} size="xs" />
          <span style={{ padding:'1px 6px', borderRadius:3, fontSize:9, fontWeight:700, background:STATUS_META[obj.status].bg, color:STATUS_META[obj.status].color }}>{obj.status}</span>
          <RiskBadge nivel={obj.riscoIA.nivel} />
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:2, overflowX:'auto' as const }}>
          {INSP_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'5px 10px', borderRadius:'6px 6px 0 0', border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
              background: tab===t.id ? T.surface : 'transparent',
              color: tab===t.id ? T.purpleL : T.dim, letterSpacing:'0.04em', whiteSpace:'nowrap' as const,
              borderBottom: tab===t.id ? `2px solid ${T.purpleL}` : '2px solid transparent',
            }}>{t.label.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'14px 16px' }}>

        {tab === 'geral' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Categoria */}
            <div>
              <p style={lbl}>Categoria</p>
              <select value={obj.categoria}
                onChange={e => onUpdate({ categoria: e.target.value as ObjectCategory, tipo: CAT_META[e.target.value as ObjectCategory].label })}
                style={{ ...inp, marginTop:4 }}>
                {ALL_CATS.map(c => <option key={c} value={c}>{CAT_META[c].icon} {CAT_META[c].label}</option>)}
              </select>
            </div>
            {/* Status */}
            <div>
              <p style={lbl}>Status</p>
              <select value={obj.status} onChange={e => onUpdate({ status: e.target.value as ObjectStatus })} style={{ ...inp, marginTop:4 }}>
                {ALL_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Confiança */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <p style={lbl}>Confiança IA</p>
                <span style={{ fontSize:12, fontWeight:700, color: obj.confianca>=90 ? '#4ade80' : obj.confianca>=70 ? '#fbbf24' : '#f87171' }}>
                  {obj.confianca}%
                </span>
              </div>
              <input type="range" min={0} max={100} value={obj.confianca}
                onChange={e => onUpdate({ confianca: Number(e.target.value) })}
                style={{ width:'100%', accentColor:T.purple }} />
            </div>
            {/* Fonte da Verdade */}
            <div>
              <p style={lbl}>Fonte da Verdade</p>
              <select value={obj.fonteVerdade}
                onChange={e => onUpdate({ fonteVerdade: e.target.value as FonteVerdade })}
                style={{ ...inp, marginTop:4 }}>
                {ALL_FONTES.map(f => <option key={f} value={f}>{FONTE_META[f].p}. {FONTE_META[f].label}</option>)}
              </select>
            </div>
            {/* Descrição */}
            <div>
              <p style={lbl}>Descrição</p>
              <textarea value={obj.descricao} onChange={e => onUpdate({ descricao: e.target.value })}
                rows={3} placeholder="Descrição técnica do objeto…"
                style={{ ...inp, marginTop:4, resize:'vertical' as const, lineHeight:1.5 }} />
            </div>
            {/* Observações */}
            <div>
              <p style={lbl}>Observações</p>
              <textarea value={obj.observacoes} onChange={e => onUpdate({ observacoes: e.target.value })}
                rows={2} placeholder="Notas para o render…"
                style={{ ...inp, marginTop:4, resize:'vertical' as const, lineHeight:1.5 }} />
            </div>
            {/* Dimensões */}
            <div>
              <p style={{ ...lbl, marginBottom:6 }}>Dimensões</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                {(['largura','altura','profundidade'] as const).map(dim => (
                  <div key={dim}>
                    <p style={{ ...lbl, fontSize:8, marginBottom:3 }}>{dim}</p>
                    <input value={obj.dimensoes?.[dim] ?? ''} placeholder="—"
                      onChange={e => onUpdate({ dimensoes: { largura:'', altura:'', profundidade:'', ...obj.dimensoes, [dim]:e.target.value } })}
                      style={{ ...inp, fontSize:11 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'materiais' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div><p style={lbl}>Nome do Material</p><input value={obj.material.nome} onChange={e=>updateMat({nome:e.target.value})} placeholder="Ex: Mármore Calacatta, MDF Freijó…" style={{...inp,marginTop:4}}/></div>
            <div><p style={lbl}>Acabamento</p><input value={obj.material.acabamento} onChange={e=>updateMat({acabamento:e.target.value})} placeholder="Polido, Mate, Escovado…" style={{...inp,marginTop:4}}/></div>
            <div><p style={lbl}>Fabricante</p><input value={obj.material.fabricante} onChange={e=>updateMat({fabricante:e.target.value})} placeholder="Portobello, Häfele…" style={{...inp,marginTop:4}}/></div>
            <div><p style={lbl}>Código</p><input value={obj.material.codigo} onChange={e=>updateMat({codigo:e.target.value})} placeholder="REF-001" style={{...inp,marginTop:4}}/></div>
            <div>
              <p style={lbl}>Cor base</p>
              <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center' }}>
                <input type="color" value={obj.material.cor || '#c8a87a'} onChange={e=>updateMat({cor:e.target.value})}
                  style={{ width:36, height:30, border:'none', borderRadius:5, cursor:'pointer' }}/>
                <input value={obj.material.cor} onChange={e=>updateMat({cor:e.target.value})}
                  placeholder="#ffffff" style={{...inp, width:'auto', flex:1, fontFamily:'monospace'}}/>
              </div>
            </div>
            <div><p style={lbl}>Textura</p><input value={obj.material.textura} onChange={e=>updateMat({textura:e.target.value})} placeholder="Lisa, Rugosa, Escovada…" style={{...inp,marginTop:4}}/></div>
            <div><p style={lbl}>Espessura</p><input value={obj.material.espessura} onChange={e=>updateMat({espessura:e.target.value})} placeholder="20mm" style={{...inp,marginTop:4}}/></div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:12, color:T.text }}>Possui veio</span>
              <button onClick={()=>updateMat({veio:!obj.material.veio})} style={{
                width:42,height:22,borderRadius:11,border:'none',cursor:'pointer',
                background:obj.material.veio?T.purple:'rgba(255,255,255,0.1)', position:'relative',transition:'background 0.2s',
              }}>
                <div style={{ position:'absolute',top:3,left:obj.material.veio?22:3,width:16,height:16,borderRadius:50,background:'#fff',transition:'left 0.2s' }}/>
              </button>
            </div>
          </div>
        )}

        {tab === 'referencias' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <p style={lbl}>Imagem de Referência</p>
              {obj.imagemReferencia ? (
                <div style={{ marginTop:8 }}>
                  <img src={obj.imagemReferencia} alt="ref" style={{ width:'100%', borderRadius:8, objectFit:'cover', maxHeight:160 }}/>
                  <button onClick={()=>onUpdate({imagemReferencia:undefined})} style={{...btnS, marginTop:8, fontSize:11, width:'100%'}}>Remover imagem</button>
                </div>
              ) : (
                <label style={{
                  display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center',
                  gap:8, padding:'28px 16px', marginTop:8, borderRadius:8, cursor:'pointer',
                  border:`1.5px dashed ${T.border}`, background:'rgba(255,255,255,0.02)',
                }}>
                  <span style={{ fontSize:28 }}>📎</span>
                  <span style={{ fontSize:12, color:T.dim }}>Arraste ou clique para fazer upload</span>
                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{
                    const f = e.target.files?.[0]
                    if(f) onUpdate({ imagemReferencia: URL.createObjectURL(f) })
                  }}/>
                </label>
              )}
            </div>
            <div style={{ ...card, background:'rgba(167,139,250,0.06)', borderColor:'rgba(167,139,250,0.2)' }}>
              <p style={{ ...lbl, marginBottom:6 }}>Fonte da Verdade</p>
              <FonteTag f={obj.fonteVerdade} />
              <p style={{ fontSize:11, color:T.dim, margin:'6px 0 0', lineHeight:1.5 }}>
                {obj.fonteVerdade === 'MATERIAL_REFERENCE' ? 'A IA usará esta imagem como referência principal para o material.' :
                 obj.fonteVerdade === 'MEMORIAL' ? 'Especificação vem do memorial descritivo.' :
                 obj.fonteVerdade === 'USER_INPUT' ? 'Informação fornecida manualmente pelo usuário.' :
                 'A IA inferiu este dado a partir da imagem original.'}
              </p>
            </div>
          </div>
        )}

        {tab === 'permissoes' && (
          <div>
            <div style={{ ...card, marginBottom:12, background:'rgba(96,165,250,0.06)', borderColor:'rgba(96,165,250,0.2)' }}>
              <p style={{ fontSize:11, color:T.dim, lineHeight:1.5 }}>
                Substitui o conceito de LOCK. Controle individual sobre o que a IA pode ou não modificar neste objeto.
              </p>
            </div>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              <button onClick={()=>onUpdate({ permissoesIA: { ...LOCKED_PERMISSIONS } })} style={{ ...btnS, fontSize:11 }}>🔒 Bloquear tudo</button>
              <button onClick={()=>onUpdate({ permissoesIA: { ...DEFAULT_PERMISSIONS } })} style={{ ...btnS, fontSize:11 }}>🔓 Padrão</button>
              <button onClick={()=>onUpdate({ permissoesIA: { alterarGeometria:true, alterarMaterial:true, alterarAcabamento:true, alterarCor:true, alterarIluminacao:true, alterarDecoracao:true, moverObjeto:true, substituir:true } })} style={{ ...btnS, fontSize:11 }}>⚡ Livre</button>
            </div>
            {(Object.keys(PERM_LABELS) as (keyof AIPermissions)[]).map(k => (
              <PermToggle key={k} label={PERM_LABELS[k]}
                value={obj.permissoesIA[k]}
                onChange={v => updatePerm({ [k]: v })} />
            ))}
          </div>
        )}

        {tab === 'risco' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <p style={lbl}>Nível de Risco</p>
              <div style={{ display:'flex', flexDirection:'column' as const, gap:6, marginTop:8 }}>
                {ALL_RISKS.map(r => {
                  const m = RISK_META[r]
                  return (
                    <button key={r} onClick={()=>onUpdate({ riscoIA: { ...obj.riscoIA, nivel:r } })} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      borderRadius:8, border: obj.riscoIA.nivel===r ? `2px solid ${m.color}` : `1px solid ${T.border}`,
                      background: obj.riscoIA.nivel===r ? m.bg : 'transparent',
                      cursor:'pointer', textAlign:'left' as const,
                    }}>
                      <div style={{ width:10, height:10, borderRadius:50, background:m.color, flexShrink:0 }}/>
                      <span style={{ fontSize:13, fontWeight:700, color:m.color }}>{m.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p style={lbl}>Descrição do Risco</p>
              <textarea value={obj.riscoIA.descricao}
                onChange={e=>onUpdate({ riscoIA: { ...obj.riscoIA, descricao:e.target.value } })}
                rows={4} placeholder='Ex: "A IA normalmente troca puxador por cava."'
                style={{ ...inp, marginTop:4, resize:'vertical' as const, lineHeight:1.5 }} />
            </div>
            {/* Tip box */}
            {obj.riscoIA.nivel !== 'MUITO_BAIXO' && obj.riscoIA.nivel !== 'BAIXO' && (
              <div style={{ ...card, background:`${RISK_META[obj.riscoIA.nivel].bg}`, borderColor:`${RISK_META[obj.riscoIA.nivel].color}30` }}>
                <p style={{ fontSize:11, color:RISK_META[obj.riscoIA.nivel].color, fontWeight:700, margin:'0 0 4px' }}>
                  ⚠️ Recomendação
                </p>
                <p style={{ fontSize:11, color:T.text, margin:0, lineHeight:1.5 }}>
                  {obj.riscoIA.nivel === 'MUITO_ALTO'
                    ? 'Bloqueie geometria e material, forneça imagem de referência.'
                    : 'Forneça material confirmado ou imagem de referência para reduzir este risco.'}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'prompt' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ ...card, background:'rgba(124,58,237,0.07)', borderColor:'rgba(124,58,237,0.25)' }}>
              <p style={{ ...lbl, marginBottom:6 }}>Fragmento gerado para este objeto</p>
              <p style={{ fontSize:12, color:T.text, lineHeight:1.65, fontFamily:'ui-monospace,monospace', margin:0 }}>{pFrag}</p>
              <button onClick={()=>void navigator.clipboard.writeText(pFrag)}
                style={{ ...btnS, marginTop:10, fontSize:11 }}>📋 Copiar fragmento</button>
            </div>
            <div>
              <p style={lbl}>Lógica aplicada</p>
              <div style={{ display:'flex', flexDirection:'column' as const, gap:6, marginTop:8 }}>
                {[
                  { k:'Geometria bloqueada', v:!obj.permissoesIA.alterarGeometria },
                  { k:'Material bloqueado',  v:!obj.permissoesIA.alterarMaterial  },
                  { k:'Pode substituir',     v:obj.permissoesIA.substituir         },
                  { k:'Material definido',   v:!!obj.material.nome                 },
                  { k:'Referência anexada',  v:!!obj.imagemReferencia              },
                ].map(({k,v}) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0', borderBottom:`1px solid ${T.border}` }}>
                    <span style={{ color:T.dim }}>{k}</span>
                    <span style={{ color:v?'#4ade80':'#f87171', fontWeight:700 }}>{v?'✓ Sim':'✗ Não'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'historico' && (
          <div>
            <div style={{ ...card, background:'rgba(255,255,255,0.02)', textAlign:'center' as const, padding:'32px' }}>
              <p style={{ fontSize:24, marginBottom:8 }}>📋</p>
              <p style={{ fontSize:12, color:T.dim, lineHeight:1.5 }}>
                Histórico de alterações disponível na integração com backend.<br/>
                Esta funcionalidade será ativada na Fase 4.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Library Modal ────────────────────────────────────────────────────────────

function LibraryModal({ items, onClose, onApply }: {
  items: LibraryItem[]
  onClose: () => void
  onApply: (item: LibraryItem) => void
}) {
  const [cat, setCat] = useState<LibraryCategory | 'Todos'>('Todos')
  const [q, setQ]     = useState('')
  const filtered = items.filter(i =>
    (cat === 'Todos' || i.categoria === cat) &&
    (q === '' || i.nome.toLowerCase().includes(q.toLowerCase()) || i.tags.some(t=>t.includes(q.toLowerCase())))
  )
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
        width:760, maxHeight:'82vh', display:'flex', flexDirection:'column' as const, overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, margin:'0 0 2px', color:'#fff' }}>📚 Biblioteca Global</h2>
            <p style={{ fontSize:11, color:T.dim, margin:0 }}>{items.length} itens · materiais, puxadores, pedras e mais</p>
          </div>
          <button onClick={onClose} style={{ ...btnS, fontSize:16, padding:'4px 10px' }}>×</button>
        </div>
        {/* Filters */}
        <div style={{ padding:'12px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nome ou tag…"
            style={{ ...inp, marginBottom:10, fontSize:13 }} />
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
            {(['Todos',...LIBRARY_CATS] as const).map(c => (
              <button key={c} onClick={()=>setCat(c as typeof cat)} style={{
                padding:'3px 10px', borderRadius:5, border:`1px solid ${cat===c ? T.purple : T.border}`,
                background: cat===c ? 'rgba(124,58,237,0.18)' : 'transparent',
                color: cat===c ? T.purpleL : T.dim, fontSize:11, fontWeight:cat===c?700:400, cursor:'pointer',
              }}>{c}</button>
            ))}
          </div>
        </div>
        {/* Items */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'12px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ ...card, cursor:'pointer', transition:'border-color 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor=T.purple)}
              onMouseLeave={e=>(e.currentTarget.style.borderColor=T.border)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:'0 0 2px' }}>{item.nome}</p>
                  <p style={{ fontSize:10, color:T.dim, margin:0 }}>{item.fabricante} · {item.linha}</p>
                </div>
                {item.cor && <div style={{ width:20, height:20, borderRadius:4, background:item.cor, border:`1px solid ${T.border}`, flexShrink:0 }}/>}
              </div>
              <p style={{ fontSize:11, color:T.dim, margin:'0 0 8px', lineHeight:1.4 }}>{item.descricao}</p>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                  {item.tags.slice(0,3).map(t=>(
                    <span key={t} style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'rgba(255,255,255,0.07)', color:T.dim }}>{t}</span>
                  ))}
                </div>
                <button onClick={()=>{ onApply(item); onClose() }} style={{ ...btnP, fontSize:11, padding:'4px 10px' }}>Aplicar</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center' as const, padding:'40px', color:T.dim }}>
              Nenhum item encontrado para "{q}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── DNA Modal ────────────────────────────────────────────────────────────────

function DNAModal({ dna, onClose, onChange }: {
  dna: ProjectDNA; onClose: () => void; onChange: (d: ProjectDNA) => void
}) {
  const upd = (patch: Partial<ProjectDNA>) => onChange({ ...dna, ...patch })
  const detLevels: ProjectDNA['nivelDetalhamento'][] = ['BAIXO','MÉDIO','ALTO','ULTRA']

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
        width:640, maxHeight:'85vh', display:'flex', flexDirection:'column' as const, overflow:'hidden',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, margin:'0 0 2px', color:'#fff' }}>🧬 ArqDNA™</h2>
            <p style={{ fontSize:11, color:T.dim, margin:0 }}>Identidade arquitetônica do projeto — usada na geração do prompt</p>
          </div>
          <button onClick={onClose} style={{ ...btnS, fontSize:16, padding:'4px 10px' }}>×</button>
        </div>
        <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px', display:'flex', flexDirection:'column' as const, gap:14 }}>
          <div><p style={lbl}>Estilo Arquitetônico</p><input value={dna.estiloArquitetonico} onChange={e=>upd({estiloArquitetonico:e.target.value})} style={{...inp,marginTop:4}} placeholder="Contemporâneo, Clássico…"/></div>
          <div><p style={lbl}>Linguagem do Projeto</p><input value={dna.linguagem} onChange={e=>upd({linguagem:e.target.value})} style={{...inp,marginTop:4}} placeholder="Minimalismo funcional…"/></div>
          <div><p style={lbl}>Atmosfera</p><input value={dna.atmosfera} onChange={e=>upd({atmosfera:e.target.value})} style={{...inp,marginTop:4}} placeholder="Aconchegante, sofisticado…"/></div>
          <div><p style={lbl}>Objetivo do Render</p><input value={dna.objetivoRender} onChange={e=>upd({objetivoRender:e.target.value})} style={{...inp,marginTop:4}} placeholder="Apresentação ao cliente…"/></div>
          <div><p style={lbl}>Tipo de Fotografia</p><input value={dna.tipofotografia} onChange={e=>upd({tipofotografia:e.target.value})} style={{...inp,marginTop:4}} placeholder="Perspectiva 45° — câmera baixa…"/></div>
          <div>
            <p style={lbl}>Nível de Detalhamento</p>
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              {detLevels.map(d=>(
                <button key={d} onClick={()=>upd({nivelDetalhamento:d})} style={{
                  flex:1, padding:'7px 0', borderRadius:7, border:`1.5px solid ${dna.nivelDetalhamento===d ? T.purple : T.border}`,
                  background: dna.nivelDetalhamento===d ? 'rgba(124,58,237,0.2)' : 'transparent',
                  color: dna.nivelDetalhamento===d ? T.purpleL : T.dim, fontSize:11, fontWeight:700, cursor:'pointer',
                }}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <p style={lbl}>Nível de Realismo</p>
              <span style={{ fontSize:13, fontWeight:800, color:T.purpleL }}>{dna.nivelRealismo} / 10</span>
            </div>
            <input type="range" min={1} max={10} value={dna.nivelRealismo} onChange={e=>upd({nivelRealismo:Number(e.target.value)})} style={{ width:'100%', accentColor:T.purple }}/>
          </div>
          <div>
            <p style={lbl}>Paleta Cromática</p>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              {dna.paletaCromatica.map((c,i)=>(
                <div key={i} style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:4 }}>
                  <input type="color" value={c} onChange={e=>upd({ paletaCromatica: dna.paletaCromatica.map((x,j)=>j===i?e.target.value:x) })}
                    style={{ width:36, height:36, border:`1px solid ${T.border}`, borderRadius:6, cursor:'pointer' }}/>
                  <span style={{ fontSize:9, color:T.dim, fontFamily:'monospace' }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, flexShrink:0, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={btnP}>Salvar ArqDNA™</button>
        </div>
      </div>
    </div>
  )
}

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({ prompt, onClose }: { prompt: StructuredPrompt; onClose: () => void }) {
  const sections = [
    { tag:'01', title:'Core Prompt',    accent:'124,58,237',  val:prompt.core    },
    { tag:'02', title:'Project Prompt', accent:'96,165,250',  val:prompt.project },
    { tag:'03', title:'Style Prompt',   accent:'167,139,250', val:prompt.style   },
    { tag:'04', title:'Negative Prompt',accent:'248,113,113', val:prompt.negative},
  ]
  const [copied, setCopied] = useState<string|null>(null)
  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text); setCopied(key); setTimeout(()=>setCopied(null), 1800)
  }
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.surface, border:`1px solid ${T.border}`, borderRadius:14,
        width:760, maxHeight:'88vh', display:'flex', flexDirection:'column' as const, overflow:'hidden',
      }}>
        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, margin:'0 0 2px', color:'#fff' }}>⚡ Prompt Estruturado</h2>
            <p style={{ fontSize:11, color:T.dim, margin:0 }}>Gerado automaticamente a partir dos objetos arquitetônicos</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>copy('all',prompt.final)} style={{ ...btnP, fontSize:11 }}>
              {copied==='all'?'✓ Copiado':'Copiar tudo'}
            </button>
            <button onClick={onClose} style={{ ...btnS, fontSize:16, padding:'4px 10px' }}>×</button>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px', display:'flex', flexDirection:'column' as const, gap:12 }}>
          {sections.map(s => (
            <div key={s.tag} style={{ borderRadius:8, overflow:'hidden', border:`1px solid rgba(${s.accent},0.2)` }}>
              <div style={{
                display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'9px 14px', background:`rgba(${s.accent},0.08)`,
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{
                    padding:'2px 7px', borderRadius:3, fontSize:9, fontWeight:800,
                    background:`rgba(${s.accent},0.2)`, color:`rgb(${s.accent})`,
                  }}>{s.tag}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{s.title}</span>
                </div>
                <button onClick={()=>copy(s.tag,s.val)} style={{
                  padding:'3px 10px', borderRadius:5, border:`1px solid rgba(${s.accent},0.3)`,
                  background:copied===s.tag?`rgba(${s.accent},0.15)`:'transparent',
                  color:`rgb(${s.accent})`, fontSize:11, cursor:'pointer',
                }}>{copied===s.tag?'✓':'Copiar'}</button>
              </div>
              <div style={{ padding:'12px 14px', background:'rgba(255,255,255,0.02)' }}>
                <p style={{ margin:0, fontSize:12, color:T.text, lineHeight:1.65, fontFamily:'ui-monospace,monospace', whiteSpace:'pre-wrap' as const }}>{s.val || '(vazio)'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArqdorPage() {
  const [project, setProject]         = useState<ArchProject>(MOCK_PROJECT)
  const [selectedId, setSelectedId]   = useState<string | null>('sala')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['sala','coz','coz-marc','coz-porta01']))
  const [libOpen, setLibOpen]         = useState(false)
  const [dnaOpen, setDnaOpen]         = useState(false)
  const [promptOpen, setPromptOpen]   = useState(false)
  const [searchQ, setSearchQ]         = useState('')
  const [versionOpen, setVersionOpen] = useState(false)

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const updateObject = useCallback((id: string, patch: Partial<ArchObject>) => {
    setProject(p => ({ ...p, objetos: p.objetos.map(o => o.id === id ? { ...o, ...patch, atualizadoEm: new Date().toISOString() } : o) }))
  }, [])

  const addObject = (parentId: string | null, cat: ObjectCategory) => {
    const newObj: ArchObject = {
      id: `obj-${Date.now()}`, parentId, nome: CAT_META[cat].label, categoria: cat,
      tipo: CAT_META[cat].label, descricao: '', status: 'RASCUNHO', confianca: 70,
      fonteVerdade: 'USER_INPUT', observacoes: '', material: { ...EMPTY_MATERIAL },
      riscoIA: { nivel: 'BAIXO', descricao: '' }, permissoesIA: { ...DEFAULT_PERMISSIONS },
      criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
    }
    setProject(p => ({ ...p, objetos: [...p.objetos, newObj] }))
    setSelectedId(newObj.id)
    if (parentId) setExpandedIds(prev => new Set([...prev, parentId]))
  }

  const removeObject = (id: string) => {
    setProject(p => ({ ...p, objetos: p.objetos.filter(o => o.id !== id && o.parentId !== id) }))
    setSelectedId(null)
  }

  const selectedObj  = project.objetos.find(o => o.id === selectedId) ?? null
  const roots        = project.objetos.filter(o => o.parentId === null)
  const envRoots     = roots.filter(o => o.categoria === 'AMBIENTE')
  const currentVersion = project.versoes.find(v => v.id === project.versaoAtual)

  // Counts
  const totalObjs = project.objetos.filter(o => o.categoria !== 'AMBIENTE').length
  const highRisk  = project.objetos.filter(o => o.riscoIA.nivel === 'ALTO' || o.riscoIA.nivel === 'MUITO_ALTO').length
  const locked    = project.objetos.filter(o => o.status === 'BLOQUEADO').length
  const approved  = project.objetos.filter(o => o.status === 'APROVADO').length

  const prompt    = buildPrompt(project)

  // Apply library item to selected object
  const applyLibItem = (item: LibraryItem) => {
    if (!selectedId) return
    updateObject(selectedId, {
      material: { ...EMPTY_MATERIAL, nome:item.nome, acabamento:item.acabamento, fabricante:item.fabricante, codigo:item.codigo, cor:item.cor??'' },
      fonteVerdade: 'MATERIAL_LIBRARY',
    })
  }

  // ─── Search filter for center panel
  const centerObjs = selectedId
    ? project.objetos.filter(o => o.parentId === selectedId)
    : envRoots

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column' as const, background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif', overflow:'hidden' }}>

      {/* ══ HEADER ══ */}
      <div style={{
        height:52, flexShrink:0,
        background:'rgba(13,11,30,0.96)', backdropFilter:'blur(14px)',
        borderBottom:`1px solid ${T.border}`,
        display:'flex', alignItems:'center', padding:'0 16px', gap:12, zIndex:100,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{
            width:26, height:26, borderRadius:6,
            background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff',
          }}>A</div>
          <span style={{ fontWeight:800, fontSize:14, color:'#fff' }}>
            arqdor<span style={{ color:T.purpleL }}>.ai</span>
          </span>
        </div>

        <div style={{ width:1, height:20, background:T.border }}/>

        {/* Project name */}
        <input
          value={project.nome}
          onChange={e => setProject(p => ({ ...p, nome:e.target.value }))}
          style={{ background:'transparent', border:'none', outline:'none', color:'#fff', fontSize:14, fontWeight:700, minWidth:0, maxWidth:220 }}
        />

        {/* Version badge */}
        <div style={{ position:'relative' }}>
          <button onClick={()=>setVersionOpen(v=>!v)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'3px 10px',
            borderRadius:5, border:`1px solid ${T.border}`, background:'rgba(255,255,255,0.04)',
            color:T.purpleL, fontSize:11, fontWeight:700, cursor:'pointer',
          }}>🔖 {currentVersion?.label ?? 'V1'} ▾</button>
          {versionOpen && (
            <div style={{
              position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:150,
              background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden', minWidth:200,
            }}>
              {project.versoes.map(v => (
                <button key={v.id} onClick={()=>{ setProject(p=>({...p,versaoAtual:v.id})); setVersionOpen(false) }} style={{
                  display:'block', width:'100%', padding:'10px 14px', border:'none', cursor:'pointer', textAlign:'left' as const,
                  background: v.id===project.versaoAtual ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: v.id===project.versaoAtual ? T.purpleL : T.text, fontSize:12,
                }}>
                  <span style={{ fontWeight:700 }}>{v.label}</span>
                  <span style={{ marginLeft:8, color:T.dim, fontSize:11 }}>{v.descricao}</span>
                </button>
              ))}
              <div style={{ borderTop:`1px solid ${T.border}`, padding:'8px 14px' }}>
                <button onClick={()=>{
                  const newV: typeof project.versoes[0] = { id:`v${project.versoes.length+1}`, label:`V${project.versoes.length+1}`, criadaEm:new Date().toISOString(), descricao:'Nova versão', atual:true }
                  setProject(p=>({ ...p, versoes:[...p.versoes.map(x=>({...x,atual:false})), newV], versaoAtual:newV.id }))
                  setVersionOpen(false)
                }} style={{ ...btnP, fontSize:11, width:'100%' }}>+ Nova Versão</button>
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex:1 }}/>

        {/* Stats */}
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          {[
            { n:totalObjs, l:'objetos',  c:T.dim   },
            { n:approved,  l:'aprovados',c:'#4ade80'},
            { n:highRisk,  l:'alto risco',c:'#f87171'},
            { n:locked,    l:'bloqueados',c:'#94a3b8'},
          ].map(({n,l,c})=>(
            <div key={l} style={{ textAlign:'center' as const, display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:14, fontWeight:800, color:c }}>{n}</span>
              <span style={{ fontSize:10, color:T.dim }}>{l}</span>
            </div>
          ))}
        </div>

        <div style={{ width:1, height:20, background:T.border }}/>

        {/* Actions */}
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={()=>setLibOpen(true)}    style={{ ...btnS, fontSize:11 }}>📚 Biblioteca</button>
          <button onClick={()=>setDnaOpen(true)}    style={{ ...btnS, fontSize:11 }}>🧬 ArqDNA™</button>
          <button onClick={()=>setPromptOpen(true)} style={{ ...btnP, fontSize:11 }}>⚡ Prompt</button>
        </div>
      </div>

      {/* ══ BODY (3 columns) ══ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── LEFT: Project Tree ── */}
        <div style={{
          width:256, flexShrink:0,
          background:T.surface, borderRight:`1px solid ${T.border}`,
          display:'flex', flexDirection:'column' as const, overflow:'hidden',
        }}>
          {/* Tree header */}
          <div style={{ padding:'10px 12px 8px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:T.dim }}>ÁRVORE DO PROJETO</span>
              <button onClick={()=>addObject(null,'AMBIENTE')} title="Novo ambiente" style={{
                width:22, height:22, borderRadius:5, border:`1px solid ${T.border}`, background:'rgba(124,58,237,0.15)',
                color:T.purpleL, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center',
              }}>+</button>
            </div>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
              placeholder="Filtrar objetos…"
              style={{ ...inp, fontSize:11, padding:'5px 8px' }} />
          </div>

          {/* Tree body */}
          <div style={{ flex:1, overflowY:'auto' as const, padding:'8px 6px' }}>
            {envRoots
              .filter(o => !searchQ || o.nome.toLowerCase().includes(searchQ.toLowerCase()))
              .map(env => (
                <TreeNode key={env.id} obj={env} depth={0}
                  allObjs={searchQ
                    ? project.objetos.filter(o=>o.nome.toLowerCase().includes(searchQ.toLowerCase()))
                    : project.objetos}
                  selectedId={selectedId} onSelect={id=>{setSelectedId(id)}}
                  expandedIds={expandedIds} onToggle={toggleExpanded} />
              ))}
          </div>

          {/* Add object to selected */}
          {selectedObj && selectedObj.categoria !== 'AMBIENTE' && (
            <div style={{ padding:'8px 12px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <button onClick={()=>addObject(selectedId, 'PERSONALIZADO')} style={{ ...btnS, fontSize:11, width:'100%' }}>
                + Sub-objeto em {selectedObj.nome}
              </button>
            </div>
          )}
        </div>

        {/* ── CENTER: Object List ── */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 18px', minWidth:0 }}>
          {/* Breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:16 }}>
            <button onClick={()=>setSelectedId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:T.dim, fontSize:12, padding:0 }}>
              {project.nome}
            </button>
            {selectedId && (() => {
              const chain: ArchObject[] = []
              let cur = project.objetos.find(o=>o.id===selectedId)
              while(cur) { chain.unshift(cur); cur = cur.parentId ? project.objetos.find(o=>o.id===cur!.parentId) : undefined }
              return chain.map((o,i)=>(
                <span key={o.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ color:T.dimL, fontSize:12 }}>/</span>
                  <button onClick={()=>setSelectedId(o.id)} style={{
                    background:'none', border:'none', cursor:'pointer', fontSize:12,
                    color: i===chain.length-1 ? '#fff' : T.dim, fontWeight: i===chain.length-1 ? 700 : 400, padding:0,
                  }}>{o.nome}</button>
                </span>
              ))
            })()}
          </div>

          {/* Selected object header */}
          {selectedObj && (
            <div style={{ ...card, marginBottom:16, display:'flex', gap:16, alignItems:'center' }}>
              <div style={{
                width:44, height:44, borderRadius:10, flexShrink:0,
                background:`${CAT_META[selectedObj.categoria].color}18`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
              }}>{CAT_META[selectedObj.categoria].icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <h2 style={{ fontSize:17, fontWeight:800, color:'#fff', margin:0 }}>{selectedObj.nome}</h2>
                  <CatBadge cat={selectedObj.categoria} size="xs" />
                  <RiskBadge nivel={selectedObj.riscoIA.nivel} />
                </div>
                <div style={{ display:'flex', gap:12, fontSize:11, color:T.dim }}>
                  <span>Confiança: <strong style={{ color:T.text }}>{selectedObj.confianca}%</strong></span>
                  <span>Fonte: <FonteTag f={selectedObj.fonteVerdade} /></span>
                  {selectedObj.material.nome && <span>Material: <strong style={{ color:T.text }}>{selectedObj.material.nome}</strong></span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={()=>addObject(selectedId, 'PERSONALIZADO')} style={{ ...btnS, fontSize:11 }}>+ Sub-objeto</button>
                <button onClick={()=>selectedId && removeObject(selectedId)} style={{ ...btnS, fontSize:11, color:'#f87171', borderColor:'rgba(248,113,113,0.3)' }}>
                  Remover
                </button>
              </div>
            </div>
          )}

          {/* Children objects */}
          {centerObjs.length > 0 ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:T.dim }}>
                  {selectedObj ? `OBJETOS EM "${selectedObj.nome.toUpperCase()}"` : 'AMBIENTES'} · {centerObjs.length}
                </span>
                {selectedId && (
                  <div style={{ display:'flex', gap:6 }}>
                    {(['PISO','PAREDE','FORRO','MARCENARIA','MOBILIARIO','ILUMINACAO'] as ObjectCategory[]).map(c=>(
                      <button key={c} onClick={()=>addObject(selectedId,c)} title={`+ ${CAT_META[c].label}`} style={{
                        padding:'3px 8px', borderRadius:5, border:`1px solid ${T.border}`,
                        background:'rgba(255,255,255,0.03)', color:T.dim, fontSize:10, cursor:'pointer',
                      }}>{CAT_META[c].icon}</button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10 }}>
                {centerObjs.map(o => {
                  const m  = CAT_META[o.categoria]
                  const rm = RISK_META[o.riscoIA.nivel]
                  const children = project.objetos.filter(c=>c.parentId===o.id)
                  return (
                    <div key={o.id}
                      onClick={()=>setSelectedId(o.id)}
                      style={{
                        ...card, cursor:'pointer', transition:'all 0.15s',
                        borderColor: selectedId===o.id ? T.purple : T.border,
                        background: selectedId===o.id ? 'rgba(124,58,237,0.1)' : T.card,
                      }}
                    >
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:18 }}>{m.icon}</span>
                          <div>
                            <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:'0 0 2px' }}>{o.nome}</p>
                            <CatBadge cat={o.categoria} size="xs" />
                          </div>
                        </div>
                        <div style={{ width:8, height:8, borderRadius:50, background:rm.color, marginTop:4 }}/>
                      </div>
                      {o.material.nome && (
                        <p style={{ fontSize:11, color:T.dim, margin:'0 0 6px' }}>
                          {o.material.nome}{o.material.fabricante ? ` · ${o.material.fabricante}` : ''}
                        </p>
                      )}
                      {o.riscoIA.descricao && (
                        <p style={{ fontSize:10, color:rm.color, margin:'0 0 6px', lineHeight:1.4 }}>⚠️ {o.riscoIA.descricao.slice(0,60)}{o.riscoIA.descricao.length>60?'…':''}</p>
                      )}
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                        <div style={{ display:'flex', gap:4 }}>
                          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:STATUS_META[o.status].bg, color:STATUS_META[o.status].color }}>{o.status}</span>
                          <span style={{ fontSize:9, color:T.dim }}>{o.confianca}%</span>
                        </div>
                        {children.length > 0 && (
                          <span style={{ fontSize:10, color:T.dim }}>{children.length} sub-obj.</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : !selectedId ? (
            /* No selection — project overview */
            <div style={{ display:'flex', flexDirection:'column' as const, gap:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                {[
                  { l:'Ambientes',  v:envRoots.length,  c:'#60a5fa' },
                  { l:'Objetos',    v:totalObjs,         c:T.purpleL },
                  { l:'Alto Risco', v:highRisk,          c:'#f87171' },
                  { l:'Aprovados',  v:approved,          c:'#4ade80' },
                ].map(({l,v,c})=>(
                  <div key={l} style={{ ...card, textAlign:'center' as const, padding:'18px' }}>
                    <div style={{ fontSize:26, fontWeight:900, color:c, marginBottom:4 }}>{v}</div>
                    <p style={{ fontSize:11, color:T.dim, margin:0 }}>{l}</p>
                  </div>
                ))}
              </div>
              <div style={{ ...card, background:'rgba(124,58,237,0.07)', borderColor:'rgba(124,58,237,0.25)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <span style={{ fontSize:24 }}>🧬</span>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:'0 0 2px' }}>ArqDNA™ — {project.dna.estiloArquitetonico}</p>
                    <p style={{ fontSize:11, color:T.dim, margin:0 }}>{project.dna.linguagem}</p>
                  </div>
                  <button onClick={()=>setDnaOpen(true)} style={{ ...btnS, fontSize:11, marginLeft:'auto' }}>Editar</button>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {project.dna.paletaCromatica.map((c,i)=>(
                    <div key={i} title={c} style={{ width:28, height:28, borderRadius:6, background:c, border:`1px solid ${T.border}` }}/>
                  ))}
                  <div style={{ marginLeft:8 }}>
                    <p style={{ fontSize:11, color:T.dim, margin:'0 0 2px' }}>Materiais: {project.dna.materiaisPredominantes.join(', ')}</p>
                    <p style={{ fontSize:11, color:T.dim, margin:0 }}>Realismo: {project.dna.nivelRealismo}/10 · {project.dna.nivelDetalhamento}</p>
                  </div>
                </div>
              </div>
              <p style={{ fontSize:12, color:T.dim, textAlign:'center' as const }}>Selecione um ambiente na árvore à esquerda para explorar seus objetos.</p>
            </div>
          ) : (
            <div style={{ ...card, textAlign:'center' as const, padding:'40px' }}>
              <p style={{ fontSize:22, marginBottom:8 }}>📦</p>
              <p style={{ fontSize:13, color:T.dim, marginBottom:14 }}>Nenhum sub-objeto neste elemento.</p>
              <button onClick={()=>selectedId && addObject(selectedId,'PERSONALIZADO')} style={btnP}>+ Adicionar Objeto</button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Inspector ── */}
        {selectedObj && (
          <div style={{
            width:340, flexShrink:0,
            background:T.surface, borderLeft:`1px solid ${T.border}`,
            display:'flex', flexDirection:'column' as const, overflow:'hidden',
          }}>
            <Inspector obj={selectedObj}
              onUpdate={patch => updateObject(selectedObj.id, patch)}
              allObjs={project.objetos} />
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}
      {libOpen    && <LibraryModal items={MOCK_LIBRARY} onClose={()=>setLibOpen(false)} onApply={applyLibItem} />}
      {dnaOpen    && <DNAModal dna={project.dna} onClose={()=>setDnaOpen(false)} onChange={dna=>setProject(p=>({...p,dna}))} />}
      {promptOpen && <PromptModal prompt={prompt} onClose={()=>setPromptOpen(false)} />}
    </div>
  )
}
