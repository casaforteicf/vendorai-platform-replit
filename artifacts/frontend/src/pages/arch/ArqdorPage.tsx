import { useState, useRef, useCallback } from 'react'
import type { Region, TechReading, RiskItem, ArqdorPrompt, RegionState } from './arqdor-types'

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Upload'       },
  { n: 2, label: 'Leitura'      },
  { n: 3, label: 'Regiões'      },
  { n: 4, label: 'Materiais'    },
  { n: 5, label: 'Aprovação'    },
  { n: 6, label: 'Riscos'       },
  { n: 7, label: 'Prompt'       },
]

const STATE_META: Record<RegionState, { color: string; bg: string; border: string; desc: string }> = {
  LOCK:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.4)',  desc: 'Preservar exatamente' },
  MATERIAL:  { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.4)', desc: 'Alterar material / cor / textura' },
  REFERENCE: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.4)',  desc: 'Usar imagem de referência' },
  MODIFY:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.4)',  desc: 'Pequenos ajustes' },
  REPLACE:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.4)', desc: 'Substituir elemento' },
  ADD:       { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.4)',  desc: 'Adicionar elemento' },
  REMOVE:    { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.4)',  desc: 'Remover elemento' },
  AUTO:      { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.4)', desc: 'Interpretação controlada pela IA' },
}

const ALL_STATES: RegionState[] = ['LOCK','MATERIAL','REFERENCE','MODIFY','REPLACE','ADD','REMOVE','AUTO']

const RISK_META: Record<string, { color: string; bg: string }> = {
  BAIXO:   { color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  MÉDIO:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  ALTO:    { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  CRÍTICO: { color: '#ef4444', bg: 'rgba(239,68,68,0.18)'   },
}

const SOURCE_LABEL: Record<RegionState, string> = {
  LOCK:      'Original',
  MATERIAL:  'IA + Seleção',
  REFERENCE: 'Referência',
  MODIFY:    'IA + Original',
  REPLACE:   'IA Gerada',
  ADD:       'IA Gerada',
  REMOVE:    'IA Inpainting',
  AUTO:      'IA Autônoma',
}

// ─── Mock data generators ─────────────────────────────────────────────────────

const MOCK_TECH: TechReading = {
  ambiente: 'Sala de Estar',
  estilo: 'Contemporâneo',
  iluminacao: 'Natural + Artificial (mista)',
  complexidade: 'Média',
  angulo: 'Perspectiva 45°',
  dimensaoEstimada: '28 m²',
  elementos: [
    { nome: 'Parede Principal', tipo: 'Estrutural',   confianca: 97, observacao: 'Superfície lisa, sem textura aparente' },
    { nome: 'Parede Lateral',   tipo: 'Estrutural',   confianca: 91, observacao: 'Parede de apoio com pintura branca' },
    { nome: 'Piso',             tipo: 'Revestimento', confianca: 95, observacao: 'Porcelanato bege 90×90 cm' },
    { nome: 'Teto',             tipo: 'Estrutural',   confianca: 88, observacao: 'Liso com sanca embutida' },
    { nome: 'Sofá',             tipo: 'Mobiliário',   confianca: 82, observacao: 'Sofá 3 lugares, tecido cinza médio' },
    { nome: 'Mesa de Centro',   tipo: 'Mobiliário',   confianca: 78, observacao: 'Mesa baixa retangular, madeira escura' },
    { nome: 'Janela',           tipo: 'Abertura',     confianca: 94, observacao: 'Janela de correr com persiana horizontal' },
    { nome: 'Luminária',        tipo: 'Iluminação',   confianca: 70, observacao: 'Ponto de luz suspenso, pendente simples' },
  ],
}

const MOCK_REGIONS: Region[] = [
  { id:'r1', name:'Parede Principal', element:'Estrutural',   state:'MATERIAL', confidence:97, notes:'', materialColor:'#E8E0D5', materialName:'Reboco texturizado' },
  { id:'r2', name:'Parede Lateral',   element:'Estrutural',   state:'LOCK',     confidence:91, notes:'' },
  { id:'r3', name:'Piso',             element:'Revestimento', state:'MATERIAL', confidence:95, notes:'', materialColor:'#C8A87A', materialName:'Carvalho claro' },
  { id:'r4', name:'Teto',             element:'Estrutural',   state:'LOCK',     confidence:88, notes:'' },
  { id:'r5', name:'Sofá',             element:'Mobiliário',   state:'REPLACE',  confidence:82, notes:'Substituir por sofá em veludo verde musgo' },
  { id:'r6', name:'Mesa de Centro',   element:'Mobiliário',   state:'AUTO',     confidence:78, notes:'' },
  { id:'r7', name:'Janela',           element:'Abertura',     state:'LOCK',     confidence:94, notes:'' },
  { id:'r8', name:'Luminária',        element:'Iluminação',   state:'MODIFY',   confidence:70, notes:'Ajustar para pendente dourado' },
]

const MOCK_RISKS: RiskItem[] = [
  { regionId:'r5', regionName:'Sofá',           risco:'REPLACE em elemento com confiança 82% — risco de distorção da geometria da sala',       severidade:'ALTO',  recomendacao:'Forneça imagem de referência do novo sofá para resultado mais fiel' },
  { regionId:'r6', regionName:'Mesa de Centro', risco:'Estado AUTO sem referência — IA pode ignorar ou reinterpretar o elemento livremente',    severidade:'MÉDIO', recomendacao:'Defina como LOCK ou MATERIAL para maior controle sobre o resultado' },
  { regionId:'r8', regionName:'Luminária',      risco:'Modificação de iluminação artificial pode afetar temperatura de cor de toda a cena',     severidade:'MÉDIO', recomendacao:'Adicione nota com tipo de luminária e temperatura (ex: 3000K dourado)' },
  { regionId:'r1', regionName:'Parede Principal',risco:'Mudança de material sem referência de textura pode gerar resultado genérico',           severidade:'BAIXO', recomendacao:'Faça upload de referência de material para resultado mais preciso' },
]

function buildPrompt(tech: TechReading, regions: Region[]): ArqdorPrompt {
  const byState = (s: RegionState) => regions.filter(r => r.state === s)
  const names   = (rs: Region[])   => rs.map(r => r.name).join(', ')

  const locked  = byState('LOCK')
  const mats    = byState('MATERIAL')
  const refs    = byState('REFERENCE')
  const mods    = byState('MODIFY')
  const repls   = byState('REPLACE')
  const adds    = byState('ADD')
  const rems    = byState('REMOVE')

  const core = `Photorealistic architectural interior render of a ${tech.ambiente.toLowerCase()}, ${tech.angulo.toLowerCase()} view. Professional architectural photography, 8K resolution, physically-based rendering, ultra-high fidelity to the original project geometry and spatial relationships.`

  const projectParts: string[] = []
  if (locked.length)  projectParts.push(`PRESERVE exactly without any modification: ${names(locked)}.`)
  if (mats.length)    projectParts.push(`APPLY new materials/textures to: ${mats.map(r => `${r.name}${r.materialName ? ` → ${r.materialName}` : ''}`).join(', ')}.`)
  if (refs.length)    projectParts.push(`USE uploaded reference images for: ${names(refs)}.`)
  if (mods.length)    projectParts.push(`APPLY subtle refinements to: ${names(mods)}.`)
  if (repls.length)   projectParts.push(`REPLACE completely: ${repls.map(r => `${r.name}${r.notes ? ` (${r.notes})` : ''}`).join(', ')}.`)
  if (adds.length)    projectParts.push(`ADD new elements: ${names(adds)}.`)
  if (rems.length)    projectParts.push(`REMOVE cleanly with realistic inpainting: ${names(rems)}.`)

  const style = `Lighting: ${tech.iluminacao}. Architectural style: ${tech.estilo}. Estimated area: ${tech.dimensaoEstimada}. Maintain structural proportions, spatial coherence and perspective accuracy. Shallow depth of field, warm color grading, professional interior design photography.`

  const negative = `Do not modify any LOCK-state regions. No distorted proportions. No unrealistic reflections or light leaks. No visible rendering artifacts or seams. No watermarks. No people or animals. No cartoon or illustration style. No low-resolution textures. No floating or disconnected objects. No structural deformations. No overexposed areas. No inconsistent shadow direction.`

  return { core, project: projectParts.join('\n'), style, negative }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateBadge({ state }: { state: RegionState }) {
  const m = STATE_META[state]
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', padding:'2px 8px',
      borderRadius:4, fontSize:10, fontWeight:700, letterSpacing:'0.06em',
      color: m.color, background: m.bg, border:`1px solid ${m.border}`,
    }}>{state}</span>
  )
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 90 ? '#4ade80' : value >= 75 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.1)', borderRadius:2 }}>
        <div style={{ width:`${value}%`, height:'100%', background:color, borderRadius:2, transition:'width 0.3s' }} />
      </div>
      <span style={{ fontSize:11, color, minWidth:28, textAlign:'right' }}>{value}%</span>
    </div>
  )
}

function StateSelect({ value, onChange }: { value: RegionState; onChange: (s: RegionState) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as RegionState)}
      style={{
        background:'rgba(255,255,255,0.06)', border:`1px solid ${STATE_META[value].border}`,
        borderRadius:5, color: STATE_META[value].color, fontSize:11, fontWeight:700,
        padding:'4px 8px', outline:'none', cursor:'pointer', letterSpacing:'0.05em',
      }}
    >
      {ALL_STATES.map(s => (
        <option key={s} value={s} style={{ background:'#1a1830', color: STATE_META[s].color }}>{s}</option>
      ))}
    </select>
  )
}

function PromptBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)', letterSpacing:'0.08em' }}>{label}</span>
        <button
          onClick={() => { void navigator.clipboard.writeText(value) }}
          style={{ fontSize:10, color:'rgba(167,139,250,0.7)', background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}
        >Copiar</button>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={5}
        style={{
          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
          borderRadius:8, color:'rgba(255,255,255,0.85)', fontSize:12, lineHeight:1.6,
          padding:'10px 12px', resize:'vertical', outline:'none', fontFamily:'inherit',
        }}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArqdorPage() {
  const [step,       setStep]       = useState(1)
  const [imageFile,  setImageFile]  = useState<File | null>(null)
  const [imagePrev,  setImagePrev]  = useState<string | null>(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [techRead,   setTechRead]   = useState<TechReading | null>(null)
  const [regions,    setRegions]    = useState<Region[]>(MOCK_REGIONS)
  const [approved,   setApproved]   = useState(false)
  const [prompt,     setPrompt]     = useState<ArqdorPrompt | null>(null)
  const [promptTab,  setPromptTab]  = useState<keyof ArqdorPrompt>('core')
  const [dragging,   setDragging]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── helpers ──────────────────────────────────────────────────────────────

  const loadImage = useCallback((file: File) => {
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePrev(url)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) loadImage(file)
  }, [loadImage])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadImage(file)
  }

  const goNext = () => {
    if (step === 2 && !techRead) {
      setAnalyzing(true)
      setTimeout(() => { setAnalyzing(false); setTechRead(MOCK_TECH); setStep(3) }, 2200)
      return
    }
    if (step === 6) {
      setPrompt(buildPrompt(techRead ?? MOCK_TECH, regions))
    }
    setStep(s => Math.min(s + 1, 7))
  }

  const goBack = () => setStep(s => Math.max(s - 1, 1))

  const updateRegion = (id: string, patch: Partial<Region>) => {
    setRegions(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const exportTXT = () => {
    if (!prompt) return
    const txt = [
      '=== CORE PROMPT ===', prompt.core, '',
      '=== PROJECT PROMPT ===', prompt.project, '',
      '=== STYLE PROMPT ===', prompt.style, '',
      '=== NEGATIVE PROMPT ===', prompt.negative,
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type:'text/plain' }))
    a.download = 'arqdor-prompt.txt'; a.click()
  }

  const exportJSON = () => {
    if (!prompt) return
    const data = { meta: { ambiente: techRead?.ambiente, estilo: techRead?.estilo, gerado: new Date().toISOString() }, regions, prompt }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }))
    a.download = 'arqdor-session.json'; a.click()
  }

  // ── styles ───────────────────────────────────────────────────────────────

  const BG     = '#0d0b1e'
  const CARD   = 'rgba(255,255,255,0.04)'
  const BORDER = '1px solid rgba(255,255,255,0.08)'
  const PURPLE = '#7c3aed'
  const TEXT   = 'rgba(255,255,255,0.85)'
  const DIM    = 'rgba(255,255,255,0.4)'

  const cardStyle: React.CSSProperties = {
    background: CARD, border: BORDER, borderRadius:12, padding:'16px 20px',
  }

  const labelStyle: React.CSSProperties = {
    fontSize:10, fontWeight:700, letterSpacing:'0.08em', color: DIM, textTransform:'uppercase' as const,
  }

  const btnPrimary: React.CSSProperties = {
    padding:'10px 24px', borderRadius:8, border:'none', background: PURPLE,
    color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding:'10px 24px', borderRadius:8,
    border:'1px solid rgba(255,255,255,0.15)',
    background:'transparent', color: DIM, fontSize:13, fontWeight:500, cursor:'pointer',
  }

  const canNext =
    (step === 1 && !!imagePrev) ||
    (step === 2) ||
    (step === 3 && regions.length > 0) ||
    (step === 4) ||
    (step === 5 && approved) ||
    (step === 6) ||
    false

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:'100vh', background: BG, color: TEXT, fontFamily:'system-ui,sans-serif' }}>

      {/* ── Header ── */}
      <div style={{
        position:'sticky', top:0, zIndex:50,
        background:'rgba(13,11,30,0.92)', backdropFilter:'blur(12px)',
        borderBottom:'1px solid rgba(255,255,255,0.07)',
        padding:'0 24px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:28, height:28, borderRadius:7,
            background:'linear-gradient(135deg,#7c3aed,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:13, fontWeight:900, color:'#fff',
          }}>A</div>
          <span style={{ fontWeight:800, fontSize:16, letterSpacing:'-0.02em', color:'#fff' }}>
            arqdor<span style={{ color:'#a78bfa' }}>.ai</span>
          </span>
          <span style={{
            marginLeft:8, fontSize:9, fontWeight:700, letterSpacing:'0.1em',
            color:DIM, textTransform:'uppercase', paddingTop:2,
          }}>Renderização com Fidelidade Arquitetônica</span>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {STEPS.map(s => {
            const done    = step > s.n
            const current = step === s.n
            return (
              <div key={s.n} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div
                  title={s.label}
                  style={{
                    width:28, height:28, borderRadius:50,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700, cursor:'pointer',
                    background: done ? PURPLE : current ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
                    border: current ? `2px solid ${PURPLE}` : done ? 'none' : '1.5px solid rgba(255,255,255,0.12)',
                    color: done || current ? '#fff' : DIM,
                    transition:'all 0.2s',
                  }}
                  onClick={() => { if (done || current) setStep(s.n) }}
                >
                  {done ? '✓' : s.n}
                </div>
                {s.n < 7 && <div style={{ width:16, height:1, background: done ? PURPLE : 'rgba(255,255,255,0.1)' }} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 24px' }}>

        {/* ─── STEP 1: Upload ─── */}
        {step === 1 && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, alignItems:'start' }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>
                Upload do Projeto
              </h1>
              <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
                Envie a foto ou planta do ambiente para iniciar a leitura técnica arquitetônica.
              </p>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:`2px dashed ${dragging ? PURPLE : 'rgba(255,255,255,0.15)'}`,
                  borderRadius:12, padding:'40px 24px', textAlign:'center', cursor:'pointer',
                  background: dragging ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
                  transition:'all 0.2s',
                }}
              >
                <div style={{ fontSize:36, marginBottom:12 }}>🏛️</div>
                <p style={{ color:'#fff', fontWeight:600, fontSize:14, margin:'0 0 6px' }}>
                  Arraste sua imagem aqui
                </p>
                <p style={{ color: DIM, fontSize:12, margin:'0 0 16px' }}>
                  Fotos de interiores, fachadas, renders existentes ou plantas
                </p>
                <span style={{
                  padding:'8px 18px', borderRadius:7, background: PURPLE,
                  color:'#fff', fontSize:12, fontWeight:600,
                }}>Selecionar arquivo</span>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display:'none' }} />
              </div>

              <div style={{ ...cardStyle, marginTop:20 }}>
                <p style={labelStyle}>Formatos suportados</p>
                <p style={{ fontSize:12, color: DIM, margin:'6px 0 0' }}>
                  JPG, PNG, WEBP — Resolução recomendada: mínimo 1024×768 px
                </p>
              </div>
            </div>

            {/* Preview */}
            <div style={{ ...cardStyle, minHeight:320, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:0 }}>
              {imagePrev
                ? <img src={imagePrev} alt="Preview" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:12, minHeight:320 }} />
                : (
                  <div style={{ textAlign:'center', color: DIM }}>
                    <div style={{ fontSize:48, marginBottom:12 }}>📐</div>
                    <p style={{ fontSize:13 }}>Prévia da imagem</p>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* ─── STEP 2: Leitura Técnica ─── */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Leitura Técnica do Ambiente</h1>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
              A IA analisa o projeto e identifica todos os elementos arquitetônicos com nível de confiança.
            </p>

            {analyzing ? (
              <div style={{ ...cardStyle, textAlign:'center', padding:'60px 24px' }}>
                <div style={{ marginBottom:20 }}>
                  <div style={{
                    width:48, height:48, borderRadius:50, border:`3px solid ${PURPLE}`,
                    borderTopColor:'transparent', animation:'spin 0.8s linear infinite',
                    margin:'0 auto',
                  }} />
                </div>
                <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 8px' }}>Analisando projeto…</p>
                <p style={{ color: DIM, fontSize:12 }}>Detectando elementos, materiais e configuração espacial</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) }}`}</style>
              </div>
            ) : techRead ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                {/* Metadata cards */}
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[
                    { k:'Ambiente',          v: techRead.ambiente        },
                    { k:'Estilo Detectado',  v: techRead.estilo          },
                    { k:'Iluminação',        v: techRead.iluminacao       },
                    { k:'Complexidade',      v: techRead.complexidade     },
                    { k:'Ângulo',            v: techRead.angulo           },
                    { k:'Dimensão Estimada', v: techRead.dimensaoEstimada },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ ...cardStyle, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ ...labelStyle, textTransform:'none', fontSize:12, color: DIM }}>{k}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Elements table */}
                <div style={cardStyle}>
                  <p style={{ ...labelStyle, marginBottom:12 }}>Elementos Identificados</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {techRead.elementos.map(el => (
                      <div key={el.nome}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <div>
                            <span style={{ fontSize:13, fontWeight:600, color:'#fff' }}>{el.nome}</span>
                            <span style={{
                              marginLeft:8, fontSize:9, color: DIM,
                              background:'rgba(255,255,255,0.07)', padding:'1px 6px', borderRadius:3,
                            }}>{el.tipo}</span>
                          </div>
                        </div>
                        <ConfidenceBar value={el.confianca} />
                        <p style={{ fontSize:10, color: DIM, margin:'3px 0 0' }}>{el.observacao}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ ...cardStyle, textAlign:'center', padding:'60px 24px' }}>
                <p style={{ color: DIM }}>Clique em "Iniciar Análise" para começar.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 3: Regiões ─── */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Regiões Editáveis</h1>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 6px' }}>
              Defina o estado de cada região detectada. O estado determina como a IA tratará cada elemento.
            </p>

            {/* State legend */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:20 }}>
              {ALL_STATES.map(s => {
                const m = STATE_META[s]
                return (
                  <div key={s} title={m.desc} style={{
                    display:'flex', alignItems:'center', gap:5, padding:'3px 8px',
                    borderRadius:4, background: m.bg, border:`1px solid ${m.border}`,
                    fontSize:10, fontWeight:700, color: m.color,
                  }}>{s} <span style={{ fontWeight:400, color:'rgba(255,255,255,0.4)', fontSize:9 }}>— {m.desc}</span></div>
                )
              })}
            </div>

            {/* Region table */}
            <div style={{ ...cardStyle, padding:0, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                    {['#','Região','Elemento','Estado','Confiança','Notas'].map(col => (
                      <th key={col} style={{ padding:'12px 14px', textAlign:'left', ...labelStyle }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding:'10px 14px', color: DIM, fontSize:11 }}>{i+1}</td>
                      <td style={{ padding:'10px 14px', fontWeight:600, fontSize:13 }}>{r.name}</td>
                      <td style={{ padding:'10px 14px', color: DIM, fontSize:12 }}>{r.element}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <StateSelect value={r.state} onChange={state => updateRegion(r.id, { state })} />
                      </td>
                      <td style={{ padding:'10px 14px', minWidth:100 }}>
                        <ConfidenceBar value={r.confidence} />
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <input
                          value={r.notes}
                          onChange={e => updateRegion(r.id, { notes: e.target.value })}
                          placeholder="Instrução livre…"
                          style={{
                            background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
                            borderRadius:5, color: TEXT, fontSize:11, padding:'5px 8px',
                            outline:'none', width:'100%', minWidth:140,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setRegions(rs => [...rs, {
                id: `r${Date.now()}`, name:'Nova Região', element:'Mobiliário',
                state:'AUTO', confidence:60, notes:'',
              }])}
              style={{ ...btnSecondary, marginTop:12, fontSize:12 }}
            >+ Adicionar Região</button>
          </div>
        )}

        {/* ─── STEP 4: Materiais ─── */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Materiais por Região</h1>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
              Configure material, cor ou referência de imagem para regiões que serão modificadas.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {regions
                .filter(r => ['MATERIAL','REFERENCE','REPLACE','MODIFY','ADD'].includes(r.state))
                .map(r => {
                  const m = STATE_META[r.state]
                  return (
                    <div key={r.id} style={{ ...cardStyle, display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:20, alignItems:'center' }}>
                      {/* Region info */}
                      <div>
                        <StateBadge state={r.state} />
                        <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:'6px 0 2px' }}>{r.name}</p>
                        <p style={{ fontSize:11, color: DIM, margin:0 }}>{m.desc}</p>
                      </div>

                      {/* Material name + color */}
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <div>
                          <p style={labelStyle}>Nome do material</p>
                          <input
                            value={r.materialName ?? ''}
                            onChange={e => updateRegion(r.id, { materialName: e.target.value })}
                            placeholder="Ex: Mármore Calacatta, Carvalho…"
                            style={{
                              width:'100%', background:'rgba(255,255,255,0.06)',
                              border:'1px solid rgba(255,255,255,0.12)',
                              borderRadius:6, color: TEXT, fontSize:12, padding:'7px 10px',
                              outline:'none', marginTop:4,
                            }}
                          />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <p style={{ ...labelStyle, margin:0 }}>Cor base:</p>
                          <input
                            type="color"
                            value={r.materialColor ?? '#c8a87a'}
                            onChange={e => updateRegion(r.id, { materialColor: e.target.value })}
                            style={{ width:32, height:24, border:'none', borderRadius:4, cursor:'pointer', background:'none' }}
                          />
                          <span style={{ fontSize:11, color: DIM }}>{r.materialColor ?? '#c8a87a'}</span>
                        </div>
                      </div>

                      {/* Reference image */}
                      {(r.state === 'REFERENCE' || r.state === 'REPLACE') && (
                        <div>
                          <p style={labelStyle}>Imagem de referência</p>
                          {r.referenceImageUrl
                            ? (
                              <div style={{ position:'relative', display:'inline-block' }}>
                                <img src={r.referenceImageUrl} alt="ref" style={{ width:80, height:60, objectFit:'cover', borderRadius:6 }} />
                                <button
                                  onClick={() => updateRegion(r.id, { referenceImageUrl: undefined })}
                                  style={{
                                    position:'absolute', top:-6, right:-6, width:18, height:18, borderRadius:50,
                                    background:'#ef4444', border:'none', color:'#fff', fontSize:10, cursor:'pointer',
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                  }}
                                >×</button>
                              </div>
                            )
                            : (
                              <label style={{
                                display:'inline-flex', alignItems:'center', gap:6,
                                padding:'7px 14px', borderRadius:6, cursor:'pointer',
                                border:'1px dashed rgba(255,255,255,0.2)',
                                background:'rgba(255,255,255,0.03)', color: DIM, fontSize:11,
                                marginTop:4,
                              }}>
                                📎 Upload referência
                                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) updateRegion(r.id, { referenceImageUrl: URL.createObjectURL(f) })
                                }} />
                              </label>
                            )}
                        </div>
                      )}

                      {/* Prompt fragment preview */}
                      {!['REFERENCE','REPLACE'].includes(r.state) && (
                        <div>
                          <p style={labelStyle}>Instrução adicional</p>
                          <input
                            value={r.notes}
                            onChange={e => updateRegion(r.id, { notes: e.target.value })}
                            placeholder="Detalhe técnico opcional…"
                            style={{
                              width:'100%', background:'rgba(255,255,255,0.06)',
                              border:'1px solid rgba(255,255,255,0.12)',
                              borderRadius:6, color: TEXT, fontSize:12, padding:'7px 10px',
                              outline:'none', marginTop:4,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}

              {regions.filter(r => ['MATERIAL','REFERENCE','REPLACE','MODIFY','ADD'].includes(r.state)).length === 0 && (
                <div style={{ ...cardStyle, textAlign:'center', padding:'40px 24px' }}>
                  <p style={{ color: DIM, fontSize:13 }}>
                    Nenhuma região com estado que requer configuração de material.<br />
                    Volte ao passo anterior e ajuste os estados das regiões.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 5: Aprovação ─── */}
        {step === 5 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Aprovação Técnica</h1>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
              Revise todas as regiões antes de gerar o prompt. Verifique a fonte da verdade e o nível de confiança.
            </p>

            <div style={{ ...cardStyle, padding:0, overflow:'hidden', marginBottom:20 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                    {['Região','Estado','Fonte da Verdade','Confiança','Material / Instrução'].map(col => (
                      <th key={col} style={{ padding:'12px 14px', textAlign:'left', ...labelStyle }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {regions.map(r => (
                    <tr key={r.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding:'10px 14px', fontWeight:600, fontSize:13 }}>{r.name}</td>
                      <td style={{ padding:'10px 14px' }}><StateBadge state={r.state} /></td>
                      <td style={{ padding:'10px 14px', fontSize:12, color: DIM }}>{SOURCE_LABEL[r.state]}</td>
                      <td style={{ padding:'10px 14px', minWidth:110 }}><ConfidenceBar value={r.confidence} /></td>
                      <td style={{ padding:'10px 14px', fontSize:12, color: DIM, maxWidth:220 }}>
                        {r.materialName
                          ? <><span style={{ background: r.materialColor, width:10, height:10, borderRadius:2, display:'inline-block', marginRight:6, verticalAlign:'middle' }} />{r.materialName}</>
                          : r.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Image preview + approve */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:20, alignItems:'center' }}>
              {imagePrev && (
                <div style={{ ...cardStyle, padding:0, overflow:'hidden' }}>
                  <img src={imagePrev} alt="project" style={{ width:'100%', maxHeight:200, objectFit:'cover', borderRadius:12 }} />
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:12, minWidth:220 }}>
                <div style={{
                  ...cardStyle, padding:'16px 20px', textAlign:'center',
                  border: approved ? '1px solid rgba(74,222,128,0.4)' : BORDER,
                  background: approved ? 'rgba(74,222,128,0.06)' : CARD,
                }}>
                  <div style={{ fontSize:28, marginBottom:6 }}>{approved ? '✅' : '🔍'}</div>
                  <p style={{ fontSize:13, color: approved ? '#4ade80' : '#fff', fontWeight:700, margin:'0 0 12px' }}>
                    {approved ? 'Configuração Aprovada' : 'Aprovar Configuração'}
                  </p>
                  <button
                    onClick={() => setApproved(v => !v)}
                    style={{
                      ...approved ? btnSecondary : btnPrimary,
                      width:'100%', fontSize:12,
                    }}
                  >{approved ? 'Cancelar aprovação' : 'Aprovar e continuar'}</button>
                </div>
                <p style={{ fontSize:10, color: DIM, textAlign:'center' }}>
                  Ao aprovar, você confirma que as regiões e estados estão corretos para gerar o prompt.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 6: Mapa de Riscos ─── */}
        {step === 6 && (
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, margin:'0 0 4px', color:'#fff' }}>Mapa de Riscos da IA</h1>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
              Pontos de atenção identificados que podem afetar a fidelidade arquitetônica do render.
            </p>

            {/* Global score */}
            <div style={{ ...cardStyle, display:'flex', alignItems:'center', gap:20, marginBottom:20, padding:'16px 24px' }}>
              <div>
                <div style={{ fontSize:36, fontWeight:900, color:'#fbbf24' }}>
                  {Math.round(100 - MOCK_RISKS.reduce((acc, r) =>
                    acc + (r.severidade === 'CRÍTICO' ? 20 : r.severidade === 'ALTO' ? 12 : r.severidade === 'MÉDIO' ? 6 : 2), 0)
                  )}
                  <span style={{ fontSize:16, color: DIM }}>/ 100</span>
                </div>
                <p style={{ fontSize:11, color: DIM, margin:'2px 0 0' }}>Pontuação de Fidelidade</p>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  {(['CRÍTICO','ALTO','MÉDIO','BAIXO'] as const).map(sev => {
                    const cnt = MOCK_RISKS.filter(r => r.severidade === sev).length
                    const m = RISK_META[sev]
                    return (
                      <div key={sev} style={{
                        padding:'4px 10px', borderRadius:4, fontSize:11, fontWeight:700,
                        color: m.color, background: m.bg, border:`1px solid ${m.color}40`,
                      }}>{cnt} {sev}</div>
                    )
                  })}
                </div>
                <p style={{ fontSize:12, color: DIM, margin:0 }}>
                  Revise as recomendações antes de gerar o prompt para maximizar a fidelidade.
                </p>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {MOCK_RISKS.map((risk, i) => {
                const m = RISK_META[risk.severidade]
                return (
                  <div key={i} style={{
                    ...cardStyle, display:'grid', gridTemplateColumns:'120px 1fr auto', gap:16, alignItems:'start',
                    borderLeft:`3px solid ${m.color}`,
                  }}>
                    <div>
                      <span style={{
                        display:'inline-block', padding:'3px 8px', borderRadius:4, fontSize:10, fontWeight:800,
                        color: m.color, background: m.bg, letterSpacing:'0.05em',
                      }}>{risk.severidade}</span>
                      <p style={{ fontSize:12, fontWeight:700, color:'#fff', margin:'6px 0 0' }}>{risk.regionName}</p>
                    </div>
                    <div>
                      <p style={{ fontSize:12, color: TEXT, margin:'0 0 6px' }}>{risk.risco}</p>
                      <p style={{ fontSize:11, color:'#fbbf24', margin:0 }}>
                        💡 {risk.recomendacao}
                      </p>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        onClick={() => {
                          const reg = regions.find(r => r.id === risk.regionId)
                          if (reg) setStep(3)
                        }}
                        style={{ ...btnSecondary, padding:'5px 12px', fontSize:11 }}
                      >Ajustar</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── STEP 7: Prompt Final ─── */}
        {step === 7 && prompt && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
              <h1 style={{ fontSize:22, fontWeight:800, margin:0, color:'#fff' }}>Prompt Final</h1>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={exportTXT} style={{ ...btnSecondary, padding:'7px 16px', fontSize:12 }}>Exportar TXT</button>
                <button onClick={exportJSON} style={{ ...btnSecondary, padding:'7px 16px', fontSize:12 }}>Exportar JSON</button>
                <button
                  onClick={() => {
                    const full = `${prompt.core}\n\n${prompt.project}\n\n${prompt.style}`
                    void navigator.clipboard.writeText(full)
                  }}
                  style={{ ...btnPrimary, padding:'7px 18px', fontSize:12 }}
                >Copiar Tudo</button>
              </div>
            </div>
            <p style={{ fontSize:13, color: DIM, margin:'0 0 24px' }}>
              Prompt profissional gerado com fidelidade arquitetônica. Edite os campos antes de usar no Nano Banana.
            </p>

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              {([
                { k:'core',     label:'Core Prompt',     desc:'Cena geral e qualidade' },
                { k:'project',  label:'Project Prompt',  desc:'Instruções por região' },
                { k:'style',    label:'Style Prompt',    desc:'Iluminação e estética' },
                { k:'negative', label:'Negative Prompt', desc:'O que evitar' },
              ] as { k: keyof ArqdorPrompt; label: string; desc: string }[]).map(tab => (
                <button
                  key={tab.k}
                  onClick={() => setPromptTab(tab.k)}
                  style={{
                    padding:'10px 18px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                    background:'transparent', borderBottom: promptTab === tab.k ? `2px solid ${PURPLE}` : '2px solid transparent',
                    color: promptTab === tab.k ? '#fff' : DIM, transition:'all 0.15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>

            {/* Active prompt */}
            <div style={cardStyle}>
              {promptTab === 'core'     && <PromptBox label="CORE PROMPT"     value={prompt.core}     onChange={v => setPrompt(p => p ? { ...p, core:     v } : p)} />}
              {promptTab === 'project'  && <PromptBox label="PROJECT PROMPT"  value={prompt.project}  onChange={v => setPrompt(p => p ? { ...p, project:  v } : p)} />}
              {promptTab === 'style'    && <PromptBox label="STYLE PROMPT"    value={prompt.style}    onChange={v => setPrompt(p => p ? { ...p, style:    v } : p)} />}
              {promptTab === 'negative' && <PromptBox label="NEGATIVE PROMPT" value={prompt.negative} onChange={v => setPrompt(p => p ? { ...p, negative: v } : p)} />}
            </div>

            {/* Summary */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:16 }}>
              {[
                { label:'Ambiente',    value: techRead?.ambiente ?? MOCK_TECH.ambiente     },
                { label:'Regiões',     value: `${regions.length} configuradas`             },
                { label:'Bloqueadas',  value: `${regions.filter(r=>r.state==='LOCK').length} regiões LOCK` },
                { label:'Fidelidade',  value: '74 / 100'                                  },
              ].map(({ label, value }) => (
                <div key={label} style={{ ...cardStyle, padding:'12px 16px', textAlign:'center' }}>
                  <p style={labelStyle}>{label}</p>
                  <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:'4px 0 0' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ ...cardStyle, marginTop:16, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px' }}>
              <div>
                <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:'0 0 2px' }}>Pronto para renderizar</p>
                <p style={{ fontSize:12, color: DIM, margin:0 }}>
                  Copie o prompt e use no Nano Banana para gerar o render com fidelidade arquitetônica.
                </p>
              </div>
              <button
                onClick={() => {
                  const full = `${prompt.core}\n\n${prompt.project}\n\n${prompt.style}`
                  void navigator.clipboard.writeText(full)
                }}
                style={{ ...btnPrimary, padding:'11px 28px', fontSize:14 }}
              >🚀 Preparar Render</button>
            </div>
          </div>
        )}

        {step === 7 && !prompt && (
          <div style={{ ...cardStyle, textAlign:'center', padding:'40px' }}>
            <p style={{ color: DIM }}>Prompt ainda não gerado. Volte ao passo anterior.</p>
          </div>
        )}

        {/* ── Navigation ── */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:32, paddingTop:24, borderTop:'1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            {step > 1 && (
              <button onClick={goBack} style={btnSecondary}>← Voltar</button>
            )}
          </div>
          <div style={{ textAlign:'center' }}>
            <p style={{ fontSize:11, color: DIM, margin:0 }}>
              {STEPS[step - 1].label} — Passo {step} de {STEPS.length}
            </p>
          </div>
          <div>
            {step < 7 && (
              <button
                onClick={goNext}
                disabled={step === 1 && !imagePrev}
                style={{
                  ...btnPrimary,
                  opacity: step === 1 && !imagePrev ? 0.4 : 1,
                  cursor:  step === 1 && !imagePrev ? 'not-allowed' : 'pointer',
                }}
              >
                {step === 2 && !techRead ? 'Iniciar Análise →' :
                 step === 5 && !approved ? 'Aprovar para continuar →' :
                 step === 6             ? 'Gerar Prompt Final →'    :
                                         'Próximo →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
