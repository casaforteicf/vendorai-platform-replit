import { useState, useRef, useCallback } from 'react'
import type { Region, TechReading, RiskItem, ArqdorPrompt, RegionState, FonteVerdade } from './arqdor-types'

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg:      '#0d0b1e',
  card:    'rgba(255,255,255,0.04)',
  cardHov: 'rgba(255,255,255,0.07)',
  border:  'rgba(255,255,255,0.08)',
  purple:  '#7c3aed',
  purpleL: '#a78bfa',
  text:    'rgba(255,255,255,0.88)',
  dim:     'rgba(255,255,255,0.42)',
  dimL:    'rgba(255,255,255,0.22)',
} as const

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { n:1, label:'Upload',    done:'Upload feito'           },
  { n:2, label:'Leitura',   done:'Leitura concluída'      },
  { n:3, label:'Regiões',   done:'Regiões configuradas'   },
  { n:4, label:'Materiais', done:'Materiais definidos'    },
  { n:5, label:'Aprovação', done:'Aprovação concluída'    },
  { n:6, label:'Riscos',    done:'Riscos avaliados'       },
  { n:7, label:'Prompt',    done:'Prompt gerado'          },
]

// ─── State colours (corrected) ────────────────────────────────────────────────

const STATE_META: Record<RegionState, { color:string; bg:string; border:string; desc:string; icon:string }> = {
  LOCK:      { color:'#94a3b8', bg:'rgba(148,163,184,0.12)', border:'rgba(148,163,184,0.35)', desc:'Preservar exatamente',              icon:'🔒' },
  MATERIAL:  { color:'#60a5fa', bg:'rgba(96,165,250,0.12)',  border:'rgba(96,165,250,0.35)',  desc:'Alterar material / cor / textura',  icon:'🎨' },
  REFERENCE: { color:'#a78bfa', bg:'rgba(167,139,250,0.12)', border:'rgba(167,139,250,0.35)', desc:'Usar imagem de referência',         icon:'🖼️' },
  MODIFY:    { color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  border:'rgba(251,191,36,0.35)',  desc:'Pequenos ajustes',                  icon:'✏️' },
  REPLACE:   { color:'#fb923c', bg:'rgba(251,146,60,0.12)',  border:'rgba(251,146,60,0.35)',  desc:'Substituir elemento completamente', icon:'🔄' },
  ADD:       { color:'#4ade80', bg:'rgba(74,222,128,0.12)',  border:'rgba(74,222,128,0.35)',  desc:'Adicionar novo elemento',           icon:'➕' },
  REMOVE:    { color:'#f87171', bg:'rgba(248,113,113,0.12)', border:'rgba(248,113,113,0.35)', desc:'Remover elemento',                  icon:'🗑️' },
  AUTO:      { color:'#64748b', bg:'rgba(100,116,139,0.12)', border:'rgba(100,116,139,0.35)', desc:'Interpretação controlada pela IA', icon:'🤖' },
}

const ALL_STATES: RegionState[] = ['LOCK','MATERIAL','REFERENCE','MODIFY','REPLACE','ADD','REMOVE','AUTO']

// ─── Fonte da Verdade ─────────────────────────────────────────────────────────

const FONTE_META: Record<FonteVerdade, { label:string; color:string; priority:number; desc:string }> = {
  MEMORIAL:           { label:'Memorial',        color:'#a78bfa', priority:1, desc:'Especificação técnica do projeto' },
  MATERIAL_REFERENCE: { label:'Ref. de Imagem',  color:'#60a5fa', priority:2, desc:'Imagem de referência do material' },
  USER_INPUT:         { label:'Nome Técnico',    color:'#34d399', priority:3, desc:'Nome informado pelo usuário' },
  MATERIAL_LIBRARY:   { label:'Biblioteca',      color:'#fbbf24', priority:4, desc:'Material da biblioteca interna' },
  AI_DETECTION:       { label:'Leitura Visual',  color:'#fb923c', priority:5, desc:'Detectado pela IA na imagem' },
  ORIGINAL_IMAGE:     { label:'Imagem Original', color:'#94a3b8', priority:6, desc:'Preservado da imagem original' },
}

const ALL_FONTES: FonteVerdade[] = ['MEMORIAL','MATERIAL_REFERENCE','USER_INPUT','MATERIAL_LIBRARY','AI_DETECTION','ORIGINAL_IMAGE']

// ─── Risk ────────────────────────────────────────────────────────────────────

const RISK_META: Record<string, { color:string; bg:string; border:string }> = {
  BAIXO:   { color:'#4ade80', bg:'rgba(74,222,128,0.10)',  border:'rgba(74,222,128,0.3)'  },
  MÉDIO:   { color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'rgba(251,191,36,0.3)'  },
  ALTO:    { color:'#fb923c', bg:'rgba(251,146,60,0.10)',  border:'rgba(251,146,60,0.3)'  },
  CRÍTICO: { color:'#f87171', bg:'rgba(248,113,113,0.10)', border:'rgba(248,113,113,0.3)' },
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TECH: TechReading = {
  ambiente:'Sala de Estar', estilo:'Contemporâneo',
  iluminacao:'Natural + Artificial (mista)', complexidade:'Média',
  angulo:'Perspectiva 45°', dimensaoEstimada:'28 m²',
  elementos:[
    { nome:'Parede Principal', tipo:'Estrutural',   confianca:97, observacao:'Superfície lisa, sem textura aparente',       materialDetectado:'Reboco liso branco'          },
    { nome:'Parede Lateral',   tipo:'Estrutural',   confianca:91, observacao:'Parede de apoio com pintura branca',          materialDetectado:'Pintura branca fosca'         },
    { nome:'Piso',             tipo:'Revestimento', confianca:95, observacao:'Porcelanato bege 90×90 cm',                  materialDetectado:'Porcelanato bege'             },
    { nome:'Teto',             tipo:'Estrutural',   confianca:88, observacao:'Liso com sanca embutida',                    materialDetectado:'Gesso liso branco'            },
    { nome:'Sofá',             tipo:'Mobiliário',   confianca:82, observacao:'Sofá 3 lugares, tecido cinza médio',         materialDetectado:'Tecido cinza'                 },
    { nome:'Mesa de Centro',   tipo:'Mobiliário',   confianca:78, observacao:'Mesa baixa retangular, madeira escura',      materialDetectado:'Madeira escura'               },
    { nome:'Janela',           tipo:'Abertura',     confianca:94, observacao:'Janela de correr com persiana horizontal',   materialDetectado:'Alumínio + vidro'             },
    { nome:'Luminária',        tipo:'Iluminação',   confianca:70, observacao:'Ponto de luz suspenso, pendente simples',    materialDetectado:'Metal fosco'                  },
  ],
}

const MOCK_REGIONS: Region[] = [
  { id:'r1', name:'Parede Principal', element:'Estrutural',   state:'MATERIAL', confidence:97, notes:'',
    fonteVerdade:'USER_INPUT',         materialDetectado:'Reboco liso branco',   materialConfirmado:'Reboco texturizado',
    materialColor:'#E8E0D5', materialName:'Reboco texturizado', aprovado:false },
  { id:'r2', name:'Parede Lateral',   element:'Estrutural',   state:'LOCK',     confidence:91, notes:'',
    fonteVerdade:'ORIGINAL_IMAGE',     materialDetectado:'Pintura branca fosca', materialConfirmado:'',
    aprovado:false },
  { id:'r3', name:'Piso',             element:'Revestimento', state:'MATERIAL', confidence:95, notes:'',
    fonteVerdade:'MATERIAL_LIBRARY',   materialDetectado:'Porcelanato bege',     materialConfirmado:'Carvalho claro',
    materialColor:'#C8A87A', materialName:'Carvalho claro', aprovado:false },
  { id:'r4', name:'Teto',             element:'Estrutural',   state:'LOCK',     confidence:88, notes:'',
    fonteVerdade:'ORIGINAL_IMAGE',     materialDetectado:'Gesso liso branco',    materialConfirmado:'',
    aprovado:false },
  { id:'r5', name:'Sofá',             element:'Mobiliário',   state:'REPLACE',  confidence:82,
    notes:'Substituir por sofá em veludo verde musgo',
    fonteVerdade:'USER_INPUT',         materialDetectado:'Tecido cinza',         materialConfirmado:'Veludo verde musgo',
    aprovado:false },
  { id:'r6', name:'Mesa de Centro',   element:'Mobiliário',   state:'AUTO',     confidence:78, notes:'',
    fonteVerdade:'AI_DETECTION',       materialDetectado:'Madeira escura',       materialConfirmado:'',
    aprovado:false },
  { id:'r7', name:'Janela',           element:'Abertura',     state:'LOCK',     confidence:94, notes:'',
    fonteVerdade:'ORIGINAL_IMAGE',     materialDetectado:'Alumínio + vidro',     materialConfirmado:'',
    aprovado:false },
  { id:'r8', name:'Luminária',        element:'Iluminação',   state:'MODIFY',   confidence:70,
    notes:'Ajustar para pendente dourado',
    fonteVerdade:'USER_INPUT',         materialDetectado:'Metal fosco',          materialConfirmado:'Metal dourado escovado',
    aprovado:false },
]

const MOCK_RISKS: RiskItem[] = [
  { regionId:'r5', regionName:'Sofá',            risco:'REPLACE em elemento com confiança 82% — risco de distorção da geometria da sala',     severidade:'ALTO',  recomendacao:'Forneça imagem de referência do novo sofá para resultado mais fiel' },
  { regionId:'r6', regionName:'Mesa de Centro',  risco:'Estado AUTO sem referência — IA pode ignorar ou reinterpretar o elemento livremente', severidade:'MÉDIO', recomendacao:'Defina como LOCK ou MATERIAL para maior controle sobre o resultado' },
  { regionId:'r8', regionName:'Luminária',       risco:'Modificação de iluminação artificial pode afetar temperatura de cor de toda a cena',  severidade:'MÉDIO', recomendacao:'Adicione nota com tipo e temperatura da luminária (ex: 3000K)' },
  { regionId:'r1', regionName:'Parede Principal',risco:'Mudança de material sem referência de textura pode gerar resultado genérico',          severidade:'BAIXO', recomendacao:'Faça upload de referência de material para resultado mais preciso' },
]

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(tech: TechReading, regions: Region[]): ArqdorPrompt {
  const byState = (s: RegionState) => regions.filter(r => r.state === s)
  const names   = (rs: Region[])   => rs.map(r => r.name).join(', ')
  const locked  = byState('LOCK'), mats = byState('MATERIAL'), refs = byState('REFERENCE')
  const mods    = byState('MODIFY'), repls = byState('REPLACE'), adds = byState('ADD'), rems = byState('REMOVE')

  const core = `Photorealistic architectural interior render of a ${tech.ambiente.toLowerCase()}, ${tech.angulo.toLowerCase()} view. Professional architectural photography, 8K resolution, physically-based rendering, ultra-high fidelity to the original project geometry and spatial relationships.`

  const parts: string[] = []
  if (locked.length) parts.push(`PRESERVE exactly without any modification: ${names(locked)}.`)
  if (mats.length)   parts.push(`APPLY new materials/textures to: ${mats.map(r => `${r.name}${r.materialConfirmado ? ` → ${r.materialConfirmado}` : r.materialName ? ` → ${r.materialName}` : ''}`).join(', ')}.`)
  if (refs.length)   parts.push(`USE uploaded reference images for: ${names(refs)}.`)
  if (mods.length)   parts.push(`APPLY subtle refinements to: ${mods.map(r => `${r.name}${r.notes ? ` (${r.notes})` : ''}`).join(', ')}.`)
  if (repls.length)  parts.push(`REPLACE completely: ${repls.map(r => `${r.name}${r.materialConfirmado ? ` → ${r.materialConfirmado}` : r.notes ? ` (${r.notes})` : ''}`).join(', ')}.`)
  if (adds.length)   parts.push(`ADD new elements: ${names(adds)}.`)
  if (rems.length)   parts.push(`REMOVE cleanly with realistic inpainting: ${names(rems)}.`)

  const style = `Lighting: ${tech.iluminacao}. Architectural style: ${tech.estilo}. Estimated area: ${tech.dimensaoEstimada}. Maintain structural proportions, spatial coherence and perspective accuracy. Shallow depth of field, warm color grading, professional interior design photography.`

  const negative = `Do not modify any LOCK-state regions. No distorted proportions. No unrealistic reflections or light leaks. No visible rendering artifacts or seams. No watermarks. No people or animals. No cartoon or illustration style. No low-resolution textures. No floating or disconnected objects. No structural deformations. No overexposed areas. No inconsistent shadow direction.`

  return { core, project: parts.join('\n'), style, negative }
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties  = { background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'16px 20px' }
const label: React.CSSProperties = { fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:T.dim, textTransform:'uppercase' as const, margin:0 }
const btnP: React.CSSProperties  = { padding:'9px 22px', borderRadius:8, border:'none', background:T.purple, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }
const btnS: React.CSSProperties  = { padding:'9px 22px', borderRadius:8, border:`1px solid rgba(255,255,255,0.15)`, background:'transparent', color:T.dim, fontSize:13, fontWeight:500, cursor:'pointer' }
const inp: React.CSSProperties   = { background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:12, padding:'7px 10px', outline:'none', width:'100%' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateBadge({ state, size = 'sm' }: { state: RegionState; size?: 'xs'|'sm' }) {
  const m = STATE_META[state]
  const fs = size === 'xs' ? 9 : 10
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding: size === 'xs' ? '1px 6px' : '3px 8px',
      borderRadius:4, fontSize:fs, fontWeight:700, letterSpacing:'0.05em',
      color:m.color, background:m.bg, border:`1px solid ${m.border}`, whiteSpace:'nowrap',
    }}>
      {m.icon} {state}
    </span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 90 ? '#4ade80' : value >= 75 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:90 }}>
      <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
        <div style={{ width:`${value}%`, height:'100%', background:color, borderRadius:2 }} />
      </div>
      <span style={{ fontSize:11, color, minWidth:28, textAlign:'right', fontWeight:700 }}>{value}%</span>
    </div>
  )
}

function StateSelect({ value, onChange }: { value: RegionState; onChange: (s: RegionState) => void }) {
  const m = STATE_META[value]
  return (
    <select value={value} onChange={e => onChange(e.target.value as RegionState)} style={{
      background:'rgba(255,255,255,0.05)', border:`1.5px solid ${m.border}`,
      borderRadius:6, color:m.color, fontSize:11, fontWeight:700, padding:'5px 8px',
      outline:'none', cursor:'pointer',
    }}>
      {ALL_STATES.map(s => (
        <option key={s} value={s} style={{ background:'#1a1830', color:STATE_META[s].color }}>{STATE_META[s].icon} {s}</option>
      ))}
    </select>
  )
}

function FonteSelect({ value, onChange }: { value: FonteVerdade; onChange: (f: FonteVerdade) => void }) {
  const m = FONTE_META[value]
  return (
    <select value={value} onChange={e => onChange(e.target.value as FonteVerdade)} style={{
      background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`,
      borderRadius:6, color:m.color, fontSize:10, fontWeight:600,
      padding:'4px 6px', outline:'none', cursor:'pointer', maxWidth:130,
    }}>
      {ALL_FONTES.map(f => (
        <option key={f} value={f} style={{ background:'#1a1830', color:FONTE_META[f].color }}>
          {FONTE_META[f].priority}. {FONTE_META[f].label}
        </option>
      ))}
    </select>
  )
}

function PromptSection({
  tag, title, subtitle, value, accent, onChange,
}: { tag: string; title: string; subtitle: string; value: string; accent: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value)
    setCopied(true); setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0, borderRadius:10, overflow:'hidden', border:`1px solid ${T.border}` }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', background:`rgba(${accent},0.08)`,
        borderBottom:`1px solid rgba(${accent},0.18)`,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{
            padding:'2px 8px', borderRadius:3, fontSize:9, fontWeight:800, letterSpacing:'0.1em',
            background:`rgba(${accent},0.2)`, color:`rgb(${accent})`, border:`1px solid rgba(${accent},0.4)`,
          }}>{tag}</span>
          <div>
            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{title}</span>
            <span style={{ fontSize:11, color:T.dim, marginLeft:8 }}>{subtitle}</span>
          </div>
        </div>
        <button onClick={copy} style={{
          padding:'4px 12px', borderRadius:6, border:`1px solid rgba(${accent},0.35)`,
          background: copied ? `rgba(${accent},0.2)` : 'transparent',
          color: copied ? `rgb(${accent})` : T.dim, fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.2s',
        }}>{copied ? '✓ Copiado' : 'Copiar'}</button>
      </div>
      {/* Body */}
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={5} style={{
        background:'rgba(255,255,255,0.02)', border:'none', color:T.text,
        fontSize:12, lineHeight:1.65, padding:'12px 14px', resize:'vertical',
        outline:'none', fontFamily:'ui-monospace,monospace',
      }} />
      <div style={{ padding:'6px 14px', background:'rgba(255,255,255,0.02)', borderTop:`1px solid ${T.border}` }}>
        <span style={{ fontSize:10, color:T.dimL }}>{value.trim().split(' ').filter(Boolean).length} palavras · {value.length} caracteres</span>
      </div>
    </div>
  )
}

function ApproveToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width:22, height:22, borderRadius:4, border:`2px solid ${checked ? '#4ade80' : T.border}`,
      background: checked ? 'rgba(74,222,128,0.15)' : 'transparent',
      cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
      color: checked ? '#4ade80' : 'transparent', fontSize:12, fontWeight:900,
      transition:'all 0.2s', flexShrink:0,
    }}>✓</button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArqdorPage() {
  const [step,        setStep]        = useState(1)
  const [maxStep,     setMaxStep]     = useState(1)
  const [imageFile,   setImageFile]   = useState<File | null>(null)
  const [imagePrev,   setImagePrev]   = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [analyzing,   setAnalyzing]   = useState(false)
  const [analyzePhase,setAnalyzePhase]= useState(0)
  const [techRead,    setTechRead]    = useState<TechReading | null>(null)
  const [regions,     setRegions]     = useState<Region[]>(MOCK_REGIONS)
  const [prompt,      setPrompt]      = useState<ArqdorPrompt | null>(null)
  const [dragging,    setDragging]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const ANALYZE_PHASES = [
    'Detectando ambiente e ângulo…',
    'Identificando elementos estruturais…',
    'Analisando materiais e texturas…',
    'Estimando confiança por região…',
    'Finalizando leitura técnica…',
  ]

  const loadImage = useCallback((file: File) => {
    setImageFile(file)
    setImagePrev(URL.createObjectURL(file))
    if (!projectName) setProjectName(file.name.replace(/\.[^.]+$/, ''))
  }, [projectName])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('image/')) loadImage(f)
  }, [loadImage])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) loadImage(f)
  }

  const goTo = (n: number) => { setStep(n); setMaxStep(m => Math.max(m, n)) }

  const goNext = () => {
    if (step === 2 && !techRead) {
      setAnalyzing(true); setAnalyzePhase(0)
      const cycle = (i: number) => {
        if (i >= ANALYZE_PHASES.length) {
          setAnalyzing(false); setTechRead(MOCK_TECH); goTo(3)
        } else {
          setAnalyzePhase(i); setTimeout(() => cycle(i + 1), 600)
        }
      }
      setTimeout(() => cycle(0), 200)
      return
    }
    if (step === 6) setPrompt(buildPrompt(techRead ?? MOCK_TECH, regions))
    goTo(Math.min(step + 1, 7))
  }

  const goBack = () => goTo(Math.max(step - 1, 1))

  const updateRegion = (id: string, patch: Partial<Region>) =>
    setRegions(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))

  const allApproved = regions.every(r => r.aprovado)

  // ── exports ────────────────────────────────────────────────────────────────

  const exportTXT = () => {
    if (!prompt) return
    const txt = [
      '=== arqdor.ai — PROMPT EXPORTADO ===',
      `Projeto: ${projectName || 'sem nome'}`,
      `Data: ${new Date().toLocaleString('pt-BR')}`, '',
      '─── CORE PROMPT ───', prompt.core, '',
      '─── PROJECT PROMPT ───', prompt.project, '',
      '─── STYLE PROMPT ───', prompt.style, '',
      '─── NEGATIVE PROMPT ───', prompt.negative,
    ].join('\n')
    dl(new Blob([txt], { type:'text/plain' }), 'arqdor-prompt.txt')
  }

  const exportJSON = () => {
    if (!prompt) return
    const tr = techRead ?? MOCK_TECH
    const payload = {
      version: 'arqdor.ai-v1',
      projectName: projectName || 'sem nome',
      imageName: imageFile?.name ?? null,
      createdAt: new Date().toISOString(),
      environmentType: tr.ambiente,
      style: tr.estilo,
      complexity: tr.complexidade,
      angle: tr.angulo,
      lighting: tr.iluminacao,
      regions: regions.map(r => ({
        id: r.id, name: r.name, element: r.element, state: r.state,
        confidence: r.confidence, fonteVerdade: r.fonteVerdade,
        materialDetectado: r.materialDetectado, materialConfirmado: r.materialConfirmado,
        materialName: r.materialName ?? null, notes: r.notes, aprovado: r.aprovado,
      })),
      risks: MOCK_RISKS,
      prompt,
    }
    dl(new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' }), 'arqdor-session.json')
  }

  const dl = (blob: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = name; a.click()
  }

  // ── step gate ──────────────────────────────────────────────────────────────

  const nextLabel =
    step === 2 && !techRead ? '🔍 Iniciar Análise' :
    step === 5 && !allApproved ? `Aprovação (${regions.filter(r=>r.aprovado).length}/${regions.length}) →` :
    step === 6 ? '⚡ Gerar Prompt Final →' :
    step === 7 ? null : 'Próximo →'

  const nextDisabled = step === 1 && !imagePrev

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'system-ui,sans-serif' }}>

      {/* ─── HEADER ─── */}
      <div style={{
        position:'sticky', top:0, zIndex:50, height:54,
        background:'rgba(13,11,30,0.94)', backdropFilter:'blur(14px)',
        borderBottom:`1px solid ${T.border}`,
        padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <div style={{
            width:28, height:28, borderRadius:7,
            background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:12, fontWeight:900, color:'#fff', flexShrink:0,
          }}>A</div>
          <div>
            <span style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.02em', color:'#fff' }}>
              arqdor<span style={{ color:T.purpleL }}>.ai</span>
            </span>
            <span style={{ marginLeft:10, fontSize:9, color:T.dim, letterSpacing:'0.09em', textTransform:'uppercase' }}>
              Fidelidade Arquitetônica
            </span>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          {STEPS.map(s => {
            const done = maxStep > s.n, curr = step === s.n
            return (
              <div key={s.n} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div
                  title={done ? s.done : s.label}
                  onClick={() => { if (done) goTo(s.n) }}
                  style={{
                    display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                    cursor: done ? 'pointer' : 'default', opacity: done || curr ? 1 : 0.45,
                  }}
                >
                  <div style={{
                    width:26, height:26, borderRadius:50,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, fontWeight:800,
                    background: done ? T.purple : curr ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
                    border: curr ? `2px solid ${T.purple}` : done ? 'none' : `1.5px solid ${T.border}`,
                    color: done || curr ? '#fff' : T.dim, transition:'all 0.25s',
                    boxShadow: curr ? `0 0 0 4px rgba(124,58,237,0.18)` : 'none',
                  }}>{done ? '✓' : s.n}</div>
                  <span style={{ fontSize:8, color: curr ? T.purpleL : T.dimL, fontWeight: curr ? 700 : 400, letterSpacing:'0.04em' }}>
                    {s.label.toUpperCase()}
                  </span>
                </div>
                {s.n < 7 && (
                  <div style={{ width:20, height:1.5, borderRadius:1,
                    background: maxStep > s.n ? T.purple : T.border, margin:'0 2px',
                    transition:'background 0.3s',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Status pill */}
        {maxStep > 1 && (
          <div style={{ display:'flex', gap:6 }}>
            {STEPS.slice(0, maxStep - 1).map(s => (
              <span key={s.n} style={{
                fontSize:9, padding:'2px 8px', borderRadius:10, fontWeight:700,
                background:'rgba(124,58,237,0.12)', color:T.purpleL,
                border:'1px solid rgba(124,58,237,0.25)',
              }}>✓ {s.done}</span>
            ))}
          </div>
        )}
      </div>

      {/* ─── CONTENT ─── */}
      <div style={{ maxWidth:1140, margin:'0 auto', padding:'28px 24px 80px' }}>

        {/* ─── S1: UPLOAD ─── */}
        {step === 1 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, alignItems:'start' }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Upload do Projeto</h1>
              <p style={{ fontSize:13, color:T.dim, margin:'0 0 20px' }}>Envie a foto ou imagem do ambiente para iniciar a leitura técnica arquitetônica.</p>

              {/* Project name */}
              <div style={{ marginBottom:16 }}>
                <p style={{ ...label, marginBottom:6 }}>Nome do projeto</p>
                <input value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder="Ex: Apartamento Jardins — Sala" style={inp} />
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:`2px dashed ${dragging ? T.purple : 'rgba(255,255,255,0.15)'}`,
                  borderRadius:12, padding:'36px 24px', textAlign:'center', cursor:'pointer',
                  background: dragging ? 'rgba(124,58,237,0.07)' : imagePrev ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
                  transition:'all 0.2s',
                }}
              >
                <div style={{ fontSize:36, marginBottom:10 }}>{imagePrev ? '✅' : '🏛️'}</div>
                <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:'0 0 4px' }}>
                  {imagePrev ? (imageFile?.name ?? 'Imagem carregada') : 'Arraste sua imagem aqui'}
                </p>
                <p style={{ color:T.dim, fontSize:12, margin:'0 0 14px' }}>
                  {imagePrev ? 'Clique para substituir' : 'Fotos, renders ou plantas — JPG, PNG, WEBP'}
                </p>
                {!imagePrev && (
                  <span style={{ padding:'7px 18px', borderRadius:7, background:T.purple, color:'#fff', fontSize:12, fontWeight:600 }}>
                    Selecionar arquivo
                  </span>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display:'none' }} />
              </div>

              {/* Info */}
              <div style={{ ...card, marginTop:14, padding:'12px 16px', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ fontSize:18 }}>📐</div>
                <div>
                  <p style={{ ...label, marginBottom:2 }}>Qualidade recomendada</p>
                  <p style={{ fontSize:11, color:T.dim, margin:0 }}>Mínimo 1024×768 px · maior resolução = maior precisão na leitura</p>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div style={{
              ...card, minHeight:340, padding:0, overflow:'hidden',
              display:'flex', alignItems:'center', justifyContent:'center',
              position:'relative',
            }}>
              {imagePrev
                ? <img src={imagePrev} alt="preview" style={{ width:'100%', height:'100%', minHeight:340, objectFit:'cover' }} />
                : <div style={{ textAlign:'center', color:T.dim, padding:40 }}>
                    <div style={{ fontSize:52, marginBottom:12, opacity:0.4 }}>📷</div>
                    <p style={{ fontSize:13 }}>Prévia da imagem aparece aqui</p>
                  </div>
              }
              {imagePrev && projectName && (
                <div style={{
                  position:'absolute', bottom:12, left:12,
                  background:'rgba(13,11,30,0.82)', backdropFilter:'blur(6px)',
                  borderRadius:6, padding:'5px 12px', fontSize:11, color:'#fff', fontWeight:600,
                }}>{projectName}</div>
              )}
            </div>
          </div>
        )}

        {/* ─── S2: LEITURA TÉCNICA ─── */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Leitura Técnica do Ambiente</h1>
            <p style={{ fontSize:13, color:T.dim, margin:'0 0 24px' }}>
              A IA analisa a imagem e identifica elementos arquitetônicos com confiança estatística.
            </p>

            {analyzing ? (
              <div style={{ ...card, padding:'64px 24px', textAlign:'center' }}>
                <div style={{
                  width:52, height:52, borderRadius:50, border:`3px solid ${T.purple}`,
                  borderTopColor:'transparent', animation:'aqSpin 0.75s linear infinite',
                  margin:'0 auto 20px',
                }} />
                <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 8px' }}>Analisando projeto…</p>
                <p style={{ color:T.purpleL, fontSize:12, margin:'0 0 20px', minHeight:18 }}>{ANALYZE_PHASES[analyzePhase]}</p>
                <div style={{ width:260, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, margin:'0 auto' }}>
                  <div style={{
                    width:`${((analyzePhase + 1) / ANALYZE_PHASES.length) * 100}%`, height:'100%',
                    background:`linear-gradient(90deg,${T.purple},${T.purpleL})`, borderRadius:2, transition:'width 0.5s',
                  }} />
                </div>
                <style>{`@keyframes aqSpin { to { transform:rotate(360deg) }}`}</style>
              </div>
            ) : techRead ? (
              <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20 }}>
                {/* Meta */}
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { k:'Ambiente',          v:techRead.ambiente,         icon:'🏠' },
                    { k:'Estilo',            v:techRead.estilo,           icon:'🎨' },
                    { k:'Iluminação',        v:techRead.iluminacao,       icon:'💡' },
                    { k:'Complexidade',      v:techRead.complexidade,     icon:'⚡' },
                    { k:'Ângulo',            v:techRead.angulo,           icon:'📐' },
                    { k:'Área Estimada',     v:techRead.dimensaoEstimada, icon:'📏' },
                  ].map(({ k, v, icon }) => (
                    <div key={k} style={{ ...card, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:T.dim }}>{icon} {k}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Elements */}
                <div style={card}>
                  <p style={{ ...label, marginBottom:14 }}>Elementos Identificados — {techRead.elementos.length} detectados</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {techRead.elementos.map(el => (
                      <div key={el.nome} style={{ borderBottom:`1px solid ${T.border}`, paddingBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{el.nome}</span>
                            <span style={{
                              fontSize:9, color:T.dim, background:'rgba(255,255,255,0.06)',
                              padding:'1px 6px', borderRadius:3, letterSpacing:'0.05em',
                            }}>{el.tipo}</span>
                          </div>
                          <span style={{ fontSize:10, color:T.dim }}>Mat: <span style={{ color:T.text }}>{el.materialDetectado}</span></span>
                        </div>
                        <ConfidenceBar value={el.confianca} />
                        <p style={{ fontSize:10, color:T.dim, margin:'4px 0 0' }}>{el.observacao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...card, textAlign:'center', padding:'52px' }}>
                <p style={{ fontSize:14, color:T.dim, marginBottom:16 }}>Clique em "Iniciar Análise" para processar a imagem.</p>
                <button onClick={goNext} style={btnP}>🔍 Iniciar Análise</button>
              </div>
            )}
          </div>
        )}

        {/* ─── S3: REGIÕES ─── */}
        {step === 3 && (
          <div>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, gap:20 }}>
              <div>
                <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Regiões Editáveis</h1>
                <p style={{ fontSize:13, color:T.dim, margin:0 }}>Configure o estado e a fonte de cada região detectada.</p>
              </div>
              <button onClick={() => setRegions(rs => [...rs, {
                id:`r${Date.now()}`, name:'Nova Região', element:'Mobiliário',
                state:'AUTO', confidence:60, notes:'',
                fonteVerdade:'AI_DETECTION', materialDetectado:'—', materialConfirmado:'', aprovado:false,
              }])} style={{ ...btnS, fontSize:12, whiteSpace:'nowrap' as const, flexShrink:0 }}>+ Adicionar Região</button>
            </div>

            {/* State legend */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:16 }}>
              {ALL_STATES.map(s => {
                const m = STATE_META[s]
                return (
                  <div key={s} style={{
                    display:'flex', alignItems:'center', gap:5, padding:'3px 9px',
                    borderRadius:4, background:m.bg, border:`1px solid ${m.border}`,
                    fontSize:10, fontWeight:700, color:m.color,
                  }}>
                    {m.icon} {s}
                    <span style={{ fontWeight:400, color:T.dimL, fontSize:9 }}>— {m.desc}</span>
                  </div>
                )
              })}
            </div>

            {/* Table — horizontally scrollable */}
            <div style={{ ...card, padding:0, overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:960 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.02)' }}>
                    {['#','Região','Elemento','Estado','Confiança','Fonte da Verdade','Mat. Detectado','Mat. Confirmado','Observações','OK'].map(col => (
                      <th key={col} style={{ padding:'10px 12px', textAlign:'left', ...label }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r, i) => (
                    <tr key={r.id} style={{
                      borderBottom:`1px solid ${T.border}`,
                      background: r.aprovado ? 'rgba(74,222,128,0.04)' : 'transparent',
                      transition:'background 0.2s',
                    }}>
                      <td style={{ padding:'8px 12px', color:T.dim, fontSize:11 }}>{i+1}</td>
                      <td style={{ padding:'8px 12px' }}>
                        <input value={r.name} onChange={e => updateRegion(r.id, { name:e.target.value })}
                          style={{ ...inp, fontSize:12, fontWeight:700, padding:'4px 8px' }} />
                      </td>
                      <td style={{ padding:'8px 12px', color:T.dim, fontSize:11, whiteSpace:'nowrap' as const }}>{r.element}</td>
                      <td style={{ padding:'8px 12px' }}>
                        <StateSelect value={r.state} onChange={state => updateRegion(r.id, { state })} />
                      </td>
                      <td style={{ padding:'8px 12px', minWidth:100 }}>
                        <ConfidenceBar value={r.confidence} />
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <FonteSelect value={r.fonteVerdade} onChange={fonteVerdade => updateRegion(r.id, { fonteVerdade })} />
                      </td>
                      <td style={{ padding:'8px 12px', fontSize:11, color:T.dim, whiteSpace:'nowrap' as const }}>{r.materialDetectado || '—'}</td>
                      <td style={{ padding:'8px 12px' }}>
                        <input value={r.materialConfirmado} onChange={e => updateRegion(r.id, { materialConfirmado:e.target.value })}
                          placeholder="Confirmar…" style={{ ...inp, fontSize:11, padding:'4px 8px', minWidth:130 }} />
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <input value={r.notes} onChange={e => updateRegion(r.id, { notes:e.target.value })}
                          placeholder="Observação livre…" style={{ ...inp, fontSize:11, padding:'4px 8px', minWidth:150 }} />
                      </td>
                      <td style={{ padding:'8px 12px' }}>
                        <ApproveToggle checked={r.aprovado} onChange={v => updateRegion(r.id, { aprovado:v })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Progress */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12 }}>
              <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2 }}>
                <div style={{
                  width:`${regions.length ? (regions.filter(r=>r.aprovado).length / regions.length) * 100 : 0}%`,
                  height:'100%', background:'#4ade80', borderRadius:2, transition:'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize:11, color:T.dim }}>
                {regions.filter(r=>r.aprovado).length}/{regions.length} aprovadas
              </span>
            </div>
          </div>
        )}

        {/* ─── S4: MATERIAIS ─── */}
        {step === 4 && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20, alignItems:'start' }}>
              <div>
                <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Materiais por Região</h1>
                <p style={{ fontSize:13, color:T.dim, margin:'0 0 20px' }}>Configure material, cor e referência para regiões que serão modificadas.</p>

                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {regions.filter(r => ['MATERIAL','REFERENCE','REPLACE','MODIFY','ADD'].includes(r.state)).map(r => {
                    const m = STATE_META[r.state]
                    return (
                      <div key={r.id} style={{ ...card, borderLeft:`3px solid ${m.color}` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                          <StateBadge state={r.state} />
                          <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{r.name}</span>
                          <span style={{ fontSize:11, color:T.dim }}>{m.desc}</span>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:14, alignItems:'start' }}>
                          {/* Material confirmado */}
                          <div>
                            <p style={{ ...label, marginBottom:5 }}>Material confirmado</p>
                            <input value={r.materialConfirmado} onChange={e => updateRegion(r.id, { materialConfirmado:e.target.value })}
                              placeholder="Ex: Mármore Calacatta, Carvalho…" style={inp} />
                            <p style={{ fontSize:10, color:T.dim, margin:'4px 0 0' }}>
                              Detectado: <em>{r.materialDetectado || '—'}</em>
                            </p>
                          </div>
                          {/* Color */}
                          <div>
                            <p style={{ ...label, marginBottom:5 }}>Cor base</p>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <input type="color" value={r.materialColor ?? '#c8a87a'}
                                onChange={e => updateRegion(r.id, { materialColor:e.target.value })}
                                style={{ width:36, height:30, border:'none', borderRadius:5, cursor:'pointer', background:'none' }} />
                              <input value={r.materialColor ?? '#c8a87a'}
                                onChange={e => updateRegion(r.id, { materialColor:e.target.value })}
                                style={{ ...inp, width:90, fontFamily:'monospace' }} />
                            </div>
                          </div>
                          {/* Reference image */}
                          {['REFERENCE','REPLACE'].includes(r.state) && (
                            <div>
                              <p style={{ ...label, marginBottom:5 }}>Imagem de referência</p>
                              {r.referenceImageUrl ? (
                                <div style={{ position:'relative', display:'inline-block' }}>
                                  <img src={r.referenceImageUrl} alt="ref"
                                    style={{ width:72, height:54, objectFit:'cover', borderRadius:6, display:'block' }} />
                                  <button onClick={() => updateRegion(r.id, { referenceImageUrl:undefined })} style={{
                                    position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:50,
                                    background:'#ef4444', border:'none', color:'#fff', fontSize:11,
                                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                                  }}>×</button>
                                </div>
                              ) : (
                                <label style={{
                                  display:'inline-flex', alignItems:'center', gap:5, padding:'7px 12px',
                                  borderRadius:6, cursor:'pointer', border:`1px dashed ${T.border}`,
                                  background:'rgba(255,255,255,0.02)', color:T.dim, fontSize:11,
                                }}>
                                  📎 Upload
                                  <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                                    const f = e.target.files?.[0]
                                    if (f) updateRegion(r.id, { referenceImageUrl:URL.createObjectURL(f) })
                                  }} />
                                </label>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Notes */}
                        <div style={{ marginTop:10 }}>
                          <p style={{ ...label, marginBottom:5 }}>Instrução técnica</p>
                          <input value={r.notes} onChange={e => updateRegion(r.id, { notes:e.target.value })}
                            placeholder="Detalhe adicional para o render…" style={inp} />
                        </div>
                      </div>
                    )
                  })}
                  {regions.filter(r => ['MATERIAL','REFERENCE','REPLACE','MODIFY','ADD'].includes(r.state)).length === 0 && (
                    <div style={{ ...card, textAlign:'center', padding:'40px' }}>
                      <p style={{ color:T.dim }}>Nenhuma região com estado que requer material.<br/>Volte e ajuste os estados no passo anterior.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Priority hierarchy panel */}
              <div>
                <div style={{ ...card, position:'sticky', top:70 }}>
                  <p style={{ ...label, marginBottom:12 }}>Hierarquia de Prioridade</p>
                  <p style={{ fontSize:11, color:T.dim, marginBottom:16, lineHeight:1.5 }}>
                    Quando há conflito entre fontes, a IA obedece esta ordem:
                  </p>
                  {[
                    { n:1, icon:'📋', label:'Memorial Descritivo',       color:'#a78bfa', desc:'Especificação técnica do projeto' },
                    { n:2, icon:'🖼️', label:'Imagem de Referência',      color:'#60a5fa', desc:'Foto ou recorte de material' },
                    { n:3, icon:'✍️', label:'Nome Técnico Informado',    color:'#34d399', desc:'Texto digitado pelo usuário' },
                    { n:4, icon:'📚', label:'Biblioteca de Materiais',   color:'#fbbf24', desc:'Biblioteca interna arqdor.ai' },
                    { n:5, icon:'👁️', label:'Leitura Visual da Imagem',  color:'#fb923c', desc:'Detectado pela IA na foto' },
                  ].map(item => (
                    <div key={item.n} style={{
                      display:'flex', alignItems:'flex-start', gap:10, marginBottom:12,
                      paddingBottom:12, borderBottom: item.n < 5 ? `1px solid ${T.border}` : 'none',
                    }}>
                      <div style={{
                        width:22, height:22, borderRadius:50, flexShrink:0, marginTop:1,
                        background:`rgba(${item.color === '#a78bfa' ? '167,139,250' : item.color === '#60a5fa' ? '96,165,250' : item.color === '#34d399' ? '52,211,153' : item.color === '#fbbf24' ? '251,191,36' : '251,146,60'},0.15)`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:10,
                        border:`1px solid ${item.color}40`,
                      }}>{item.n}</div>
                      <div>
                        <p style={{ fontSize:12, fontWeight:700, color:item.color, margin:'0 0 1px' }}>{item.icon} {item.label}</p>
                        <p style={{ fontSize:10, color:T.dim, margin:0 }}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── S5: APROVAÇÃO ─── */}
        {step === 5 && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Aprovação Técnica</h1>
                <p style={{ fontSize:13, color:T.dim, margin:0 }}>Revise e aprove cada região antes de avaliar os riscos.</p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setRegions(rs => rs.map(r => ({ ...r, aprovado:true })))}
                  style={{ ...btnS, fontSize:12 }}>Aprovar todas</button>
                <button onClick={() => setRegions(rs => rs.map(r => ({ ...r, aprovado:false })))}
                  style={{ ...btnS, fontSize:12 }}>Limpar</button>
              </div>
            </div>

            {/* Summary row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              {[
                { label:'Total de Regiões', value:regions.length, color:'#fff'     },
                { label:'Aprovadas',         value:regions.filter(r=>r.aprovado).length, color:'#4ade80' },
                { label:'Pendentes',         value:regions.filter(r=>!r.aprovado).length, color:'#fbbf24' },
                { label:'Com Referência',    value:regions.filter(r=>r.referenceImageUrl).length, color:T.purpleL },
              ].map(({ label: lbl, value, color }) => (
                <div key={lbl} style={{ ...card, padding:'14px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:24, fontWeight:800, color, marginBottom:2 }}>{value}</div>
                  <p style={{ ...label, textTransform:'none', fontSize:11, color:T.dim, margin:0 }}>{lbl}</p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ ...card, padding:0, overflow:'auto', marginBottom:20 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
                <thead>
                  <tr style={{ borderBottom:`1px solid ${T.border}`, background:'rgba(255,255,255,0.02)' }}>
                    {['Região','Estado','Fonte da Verdade','Confiança','Mat. Detectado','Mat. Confirmado','Instrução','Aprovado'].map(col => (
                      <th key={col} style={{ padding:'10px 12px', textAlign:'left', ...label }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => {
                    const fm = FONTE_META[r.fonteVerdade]
                    return (
                      <tr key={r.id} style={{
                        borderBottom:`1px solid ${T.border}`,
                        background: r.aprovado ? 'rgba(74,222,128,0.04)' : 'transparent',
                      }}>
                        <td style={{ padding:'10px 12px', fontWeight:700, fontSize:13 }}>{r.name}</td>
                        <td style={{ padding:'10px 12px' }}><StateBadge state={r.state} /></td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ fontSize:10, fontWeight:700, color:fm.color }}>
                            {fm.priority}. {fm.label}
                          </span>
                        </td>
                        <td style={{ padding:'10px 12px', minWidth:100 }}><ConfidenceBar value={r.confidence} /></td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:T.dim }}>{r.materialDetectado || '—'}</td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:r.materialConfirmado ? T.text : T.dim }}>
                          {r.materialConfirmado || '—'}
                        </td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:T.dim, maxWidth:180 }}>{r.notes || '—'}</td>
                        <td style={{ padding:'10px 12px' }}>
                          <ApproveToggle checked={r.aprovado} onChange={v => updateRegion(r.id, { aprovado:v })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Progress bar */}
            <div style={{ ...card, padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:allApproved ? '#4ade80' : '#fff' }}>
                    {allApproved ? '✅ Todas as regiões aprovadas — pronto para avançar' : `Aprovação: ${regions.filter(r=>r.aprovado).length} de ${regions.length}`}
                  </span>
                  <span style={{ fontSize:12, color:T.dim }}>
                    {Math.round((regions.filter(r=>r.aprovado).length / Math.max(regions.length,1)) * 100)}%
                  </span>
                </div>
                <div style={{ height:6, background:'rgba(255,255,255,0.08)', borderRadius:3 }}>
                  <div style={{
                    width:`${(regions.filter(r=>r.aprovado).length / Math.max(regions.length,1)) * 100}%`,
                    height:'100%', background: allApproved ? '#4ade80' : T.purple,
                    borderRadius:3, transition:'width 0.3s, background 0.3s',
                  }} />
                </div>
              </div>
              {!allApproved && (
                <button onClick={() => setRegions(rs => rs.map(r => ({ ...r, aprovado:true })))} style={btnP}>
                  Aprovar todas
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── S6: RISCOS ─── */}
        {step === 6 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Mapa de Riscos da IA</h1>
            <p style={{ fontSize:13, color:T.dim, margin:'0 0 20px' }}>
              Pontos de atenção que podem comprometer a fidelidade arquitetônica do render.
            </p>

            {/* Score card */}
            <div style={{ ...card, display:'grid', gridTemplateColumns:'160px 1fr', gap:24, marginBottom:20, padding:'20px 24px' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{
                  fontSize:48, fontWeight:900, lineHeight:1,
                  background:'linear-gradient(135deg,#fbbf24,#fb923c)',
                  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
                }}>74</div>
                <div style={{ fontSize:12, color:T.dim, marginTop:4 }}>/ 100 — Fidelidade</div>
                <div style={{ display:'flex', justifyContent:'center', gap:3, marginTop:10 }}>
                  {[...Array(5)].map((_,i) => (
                    <div key={i} style={{ width:8, height:8, borderRadius:50, background: i < 4 ? '#fbbf24' : T.border }} />
                  ))}
                </div>
              </div>
              <div>
                <p style={{ ...label, marginBottom:10 }}>Distribuição de riscos</p>
                {(['CRÍTICO','ALTO','MÉDIO','BAIXO'] as const).map(sev => {
                  const cnt = MOCK_RISKS.filter(r => r.severidade === sev).length
                  const m   = RISK_META[sev]
                  return (
                    <div key={sev} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{
                        width:56, fontSize:10, fontWeight:800, letterSpacing:'0.04em',
                        color:m.color, padding:'2px 6px', borderRadius:3,
                        background:m.bg, border:`1px solid ${m.border}`, textAlign:'center',
                      }}>{sev}</span>
                      <div style={{ flex:1, height:5, background:'rgba(255,255,255,0.07)', borderRadius:3 }}>
                        <div style={{ width:`${(cnt / Math.max(MOCK_RISKS.length, 1)) * 100}%`, height:'100%', background:m.color, borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:12, color:m.color, fontWeight:700, minWidth:16, textAlign:'right' }}>{cnt}</span>
                    </div>
                  )
                })}
                <p style={{ fontSize:11, color:T.dim, marginTop:10, lineHeight:1.5 }}>
                  Revise as recomendações para maximizar a fidelidade antes de gerar o prompt.
                </p>
              </div>
            </div>

            {/* Risk list */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {MOCK_RISKS.map((risk, i) => {
                const m = RISK_META[risk.severidade]
                return (
                  <div key={i} style={{
                    ...card, display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'start',
                    borderLeft:`3px solid ${m.color}`, padding:'14px 18px',
                  }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{
                          fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:3, letterSpacing:'0.06em',
                          color:m.color, background:m.bg, border:`1px solid ${m.border}`,
                        }}>{risk.severidade}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{risk.regionName}</span>
                      </div>
                      <p style={{ fontSize:12, color:T.text, margin:'0 0 6px', lineHeight:1.5 }}>{risk.risco}</p>
                      <p style={{ fontSize:11, color:'#fbbf24', margin:0, lineHeight:1.5 }}>
                        💡 {risk.recomendacao}
                      </p>
                    </div>
                    <button onClick={() => goTo(3)} style={{ ...btnS, fontSize:11, padding:'6px 14px', whiteSpace:'nowrap' as const }}>
                      Ajustar região
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── S7: PROMPT ─── */}
        {step === 7 && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
              <div>
                <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Prompt Final</h1>
                <p style={{ fontSize:13, color:T.dim, margin:0 }}>
                  Gerado com fidelidade arquitetônica. Edite antes de usar no Nano Banana.
                </p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={exportTXT} style={{ ...btnS, fontSize:12 }}>↓ TXT</button>
                <button onClick={exportJSON} style={{ ...btnS, fontSize:12 }}>↓ JSON</button>
                <button onClick={() => {
                  if (!prompt) return
                  void navigator.clipboard.writeText([prompt.core, prompt.project, prompt.style].filter(Boolean).join('\n\n'))
                }} style={{ ...btnP, fontSize:12 }}>Copiar tudo</button>
              </div>
            </div>

            {prompt ? (
              <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:20 }}>
                <PromptSection
                  tag="01" title="Core Prompt" subtitle="Cena geral e qualidade técnica"
                  accent="124,58,237" value={prompt.core}
                  onChange={v => setPrompt(p => p ? { ...p, core:v } : p)} />
                <PromptSection
                  tag="02" title="Project Prompt" subtitle="Instruções por região"
                  accent="96,165,250" value={prompt.project}
                  onChange={v => setPrompt(p => p ? { ...p, project:v } : p)} />
                <PromptSection
                  tag="03" title="Style Prompt" subtitle="Iluminação, estética e câmera"
                  accent="167,139,250" value={prompt.style}
                  onChange={v => setPrompt(p => p ? { ...p, style:v } : p)} />
                <PromptSection
                  tag="04" title="Negative Prompt" subtitle="O que a IA deve evitar"
                  accent="248,113,113" value={prompt.negative}
                  onChange={v => setPrompt(p => p ? { ...p, negative:v } : p)} />

                {/* Session summary */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:4 }}>
                  {[
                    { k:'Ambiente',   v: (techRead ?? MOCK_TECH).ambiente },
                    { k:'Regiões',    v:`${regions.length} configuradas` },
                    { k:'LOCK',       v:`${regions.filter(r=>r.state==='LOCK').length} preservadas` },
                    { k:'Fidelidade', v:'74 / 100' },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ ...card, padding:'12px 16px', textAlign:'center' }}>
                      <p style={{ ...label, marginBottom:4 }}>{k}</p>
                      <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:0 }}>{v}</p>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div style={{
                  ...card, display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'16px 20px', borderColor:'rgba(124,58,237,0.3)',
                  background:'rgba(124,58,237,0.06)',
                }}>
                  <div>
                    <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:'0 0 2px' }}>Pronto para renderizar</p>
                    <p style={{ fontSize:12, color:T.dim, margin:0 }}>
                      Copie o prompt completo e use no Nano Banana para gerar o render com fidelidade arquitetônica.
                    </p>
                  </div>
                  <button onClick={() => {
                    if (!prompt) return
                    void navigator.clipboard.writeText([prompt.core, prompt.project, prompt.style].join('\n\n'))
                  }} style={{ ...btnP, fontSize:14, padding:'11px 28px', flexShrink:0 }}>
                    🚀 Copiar e Preparar Render
                  </button>
                </div>

                {/* ─── PRÓXIMA ETAPA: INTEGRAÇÃO IA ─── */}
                <div style={{
                  border:`1px dashed rgba(167,139,250,0.3)`,
                  borderRadius:12, padding:'20px 24px',
                  background:'rgba(167,139,250,0.04)',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <div style={{
                      padding:'4px 10px', borderRadius:4, fontSize:10, fontWeight:800,
                      background:'rgba(167,139,250,0.15)', color:T.purpleL,
                      border:'1px solid rgba(167,139,250,0.3)', letterSpacing:'0.07em',
                    }}>ROADMAP</div>
                    <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Próxima etapa: Integração com IA</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    {[
                      { icon:'🔍', title:'Análise Real (Passo 2)', desc:'API de visão computacional analisará a imagem automaticamente, sem dados mockados.' },
                      { icon:'🚀', title:'Envio para Nano Banana', desc:'Passo 7 enviará o prompt estruturado diretamente para o Nano Banana via API.' },
                      { icon:'🏛️', title:'Renderizador preservado', desc:'O renderizador anterior segue preservado no backend — nenhum arquivo foi removido.' },
                    ].map(({ icon, title, desc }) => (
                      <div key={title} style={{
                        padding:'14px 16px', borderRadius:8,
                        background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`,
                      }}>
                        <p style={{ fontSize:18, margin:'0 0 6px' }}>{icon}</p>
                        <p style={{ fontSize:12, fontWeight:700, color:T.purpleL, margin:'0 0 4px' }}>{title}</p>
                        <p style={{ fontSize:11, color:T.dim, margin:0, lineHeight:1.5 }}>{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...card, textAlign:'center', padding:'40px' }}>
                <p style={{ color:T.dim, marginBottom:16 }}>Prompt ainda não gerado.</p>
                <button onClick={() => { setPrompt(buildPrompt(techRead ?? MOCK_TECH, regions)); }} style={btnP}>
                  ⚡ Gerar agora
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── NAVIGATION ─── */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:32, paddingTop:20, borderTop:`1px solid ${T.border}`,
        }}>
          {/* Back */}
          <div>
            {step > 1 && (
              <button onClick={goBack} style={btnS}>← Voltar</button>
            )}
          </div>

          {/* Step label */}
          <div style={{ textAlign:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              {step > 1 && (
                <span style={{ fontSize:10, color:'#4ade80' }}>✓ {STEPS[step-2].done}</span>
              )}
              {step > 1 && step < 7 && <span style={{ color:T.dimL, fontSize:10 }}>→</span>}
              <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>
                {STEPS[step-1].label}
              </span>
              {step < 7 && <span style={{ color:T.dimL, fontSize:10 }}>→</span>}
              {step < 7 && (
                <span style={{ fontSize:10, color:T.dim }}>{STEPS[step].label}</span>
              )}
            </div>
            <p style={{ fontSize:10, color:T.dimL, margin:'4px 0 0' }}>Passo {step} de {STEPS.length}</p>
          </div>

          {/* Next */}
          <div>
            {nextLabel && (
              <button
                onClick={goNext}
                disabled={nextDisabled}
                style={{ ...btnP, opacity: nextDisabled ? 0.4 : 1, cursor: nextDisabled ? 'not-allowed' : 'pointer' }}
              >{nextLabel}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
