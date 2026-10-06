// ─── ProjectHomePhoenix — Project Phoenix UX Redesign ─────────────────────────
// Nova home premium: upload central, fluxo de 5 etapas, espaço em branco,
// linguagem humana. Referências: Figma, Notion, Linear, Canva.
// Sem novas APIs — usa apenas arqState existente.

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ArqProjectState } from '../../hooks/useArqProject'
import { PHX } from '../../shared/arqdor-theme'
import { validateArqdorImport, type ArqdorImportKind } from '../../shared/import-guard'

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes phx-in   { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
  @keyframes phx-up   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes phx-glow { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}50%{box-shadow:0 0 0 6px rgba(124,58,237,0.15)} }
  @keyframes phx-spin { to{transform:rotate(360deg)} }
  @keyframes phx-pulse{ 0%,100%{opacity:1}50%{opacity:.4} }
  @keyframes phx-float{ 0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)} }

  .phx-card {
    background: ${PHX.surface};
    border: 1px solid ${PHX.border};
    border-radius: 14px;
    transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease !important;
  }
  .phx-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
    border-color: rgba(124,58,237,0.2) !important;
    transform: translateY(-1px) !important;
  }
  .phx-step-card {
    transition: all 0.2s ease !important;
    cursor: pointer;
  }
  .phx-step-card:hover { transform: translateY(-2px) !important; }
  .phx-upload-btn {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .phx-upload-btn:hover {
    background: rgba(124,58,237,0.08) !important;
    border-color: rgba(124,58,237,0.3) !important;
    color: ${PHX.purple} !important;
    transform: translateY(-1px) !important;
  }
  .phx-render-btn {
    transition: all 0.18s ease !important;
  }
  .phx-render-btn:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 24px rgba(124,58,237,0.35) !important;
  }
  .phx-style-chip {
    transition: all 0.15s ease !important;
    cursor: pointer;
  }
  .phx-style-chip:hover { border-color: ${PHX.purple} !important; }
  .phx-proj-item {
    transition: background 0.13s ease !important;
    cursor: pointer;
  }
  .phx-proj-item:hover { background: ${PHX.muted} !important; }
  .phx-section { animation: phx-in 0.35s ease both; }
  .phx-input:focus { outline: none; border-color: ${PHX.purple} !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.12) !important; }
`

// ─── Types ─────────────────────────────────────────────────────────────────────
type NavFn = (m: string) => void
type Step = { id: string; n: number; icon: string; label: string; desc: string; module: string; color: string }

const STEPS: Step[] = [
  { id:'projeto',  n:1, icon:'🏗️', label:'Criar Projeto',  desc:'Nome, tipo, área',         module:'projeto',    color: PHX.purple },
  { id:'upload',   n:2, icon:'📂', label:'Enviar material', desc:'Planta, foto ou referência',module:'renders',    color: PHX.blue   },
  { id:'objetivo', n:3, icon:'🎯', label:'Definir objetivo',desc:'O que você quer criar?',   module:'home',       color: PHX.amber  },
  { id:'estilo',   n:4, icon:'🎨', label:'Escolher estilo', desc:'Referência visual',         module:'biblioteca', color: PHX.cyan   },
  { id:'render',   n:5, icon:'✨', label:'Gerar Render',    desc:'IA cria a visualização',    module:'renders',    color: PHX.green  },
]

const STYLES = [
  { id:'minimalista', label:'Minimalista', emoji:'◻️', desc:'Clean, lines, white' },
  { id:'moderno',     label:'Moderno',     emoji:'🔷', desc:'Bold, geometric'     },
  { id:'classico',    label:'Clássico',    emoji:'🏛️', desc:'Ornate, timeless'   },
  { id:'industrial',  label:'Industrial',  emoji:'⚙️', desc:'Raw, metal, wood'   },
  { id:'japones',     label:'Japonês',     emoji:'⛩️', desc:'Zen, natural'       },
  { id:'escandinavo', label:'Escandinavo', emoji:'🌿', desc:'Natural, cozy'       },
]

const UPLOAD_OPTS = [
  { id:'foto',      icon:'📷', label:'Tirar foto',    accept:'image/*',                  hint:'câmera' },
  { id:'arquivo',   icon:'📁', label:'Arquivo',       accept:'image/*,.pdf,.webp,.png',  hint:'PNG, JPG, WEBP' },
  { id:'pdf',       icon:'📄', label:'PDF',           accept:'application/pdf',          hint:'PDF' },
  { id:'planta',    icon:'🏠', label:'Planta',        accept:'image/*,.pdf',             hint:'PDF, IMG' },
]

// ─── Micro components ──────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg, ${PHX.purple}, ${PHX.purpleL})`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:12, flexShrink:0 }}>
      {initial}
    </div>
  )
}

function StepCard({ step, active, completed, onClick }: { step:Step; active:boolean; completed:boolean; onClick:()=>void }) {
  return (
    <div className="phx-step-card" onClick={onClick} style={{
      flex:1, minWidth:0, padding:'14px 16px', borderRadius:14, textAlign:'center',
      border:`2px solid ${active ? step.color : completed ? `${step.color}30` : PHX.border}`,
      background: active ? `${step.color}08` : completed ? `${step.color}04` : PHX.surface,
    }}>
      <div style={{ fontSize:22, marginBottom:4 }}>
        {completed ? <span style={{ color: PHX.green }}>✓</span> : step.icon}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:800, color: active ? step.color : completed ? step.color : PHX.dim, letterSpacing:'.04em' }}>
        {step.n}. {step.label}
      </p>
      <p style={{ margin:0, fontSize:9, color:PHX.dim, lineHeight:1.3 }}>{step.desc}</p>
    </div>
  )
}

// ─── Upload zone ───────────────────────────────────────────────────────────────
function UploadZone({
  onNavigate,
  onFile,
}: {
  onNavigate: NavFn
  onFile: (file: File, kind: ArqdorImportKind) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeKind, setActiveKind] = useState<ArqdorImportKind>('reference')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [acceptStr, setAcceptStr] = useState('image/*,.pdf')

  const acceptFile = useCallback((file: File, kind: ArqdorImportKind) => {
    const result = validateArqdorImport(file, kind)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    onFile(file, result.kind)
    onNavigate('renders')
  }, [onFile, onNavigate])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) acceptFile(file, activeKind)
  }, [acceptFile, activeKind])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) acceptFile(file, activeKind)
    e.currentTarget.value = ''
  }

  function handleUploadClick(opt: typeof UPLOAD_OPTS[0]) {
    setAcceptStr(opt.accept)
    setActiveKind(opt.id === 'planta' ? 'floorplan' : opt.id === 'foto' ? 'photo' : opt.id === 'pdf' ? 'pdf' : 'reference')
    setError(null)
    setTimeout(() => fileInputRef.current?.click(), 50)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        margin:'0 0 20px',
        border:`2px dashed ${dragging ? PHX.purple : PHX.border}`,
        borderRadius:20,
        background: dragging ? `${PHX.purple}06` : PHX.muted,
        padding:'36px 32px',
        textAlign:'center',
        transition:'all 0.2s ease',
        cursor:'default',
        animation: dragging ? 'phx-glow 1s ease infinite' : 'none',
      }}
    >
      <input ref={fileInputRef} type="file" accept={acceptStr} style={{ display:'none' }} onChange={handleFileChange} />

      {dragging ? (
        <div style={{ animation:'phx-float 1s ease infinite' }}>
          <div style={{ fontSize:48, marginBottom:8 }}>📂</div>
          <p style={{ margin:0, fontSize:16, fontWeight:700, color:PHX.purple }}>Solte para importar</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize:40, marginBottom:10, animation:'phx-float 3s ease infinite' }}>📂</div>
          <h2 style={{ margin:'0 0 6px', fontSize:18, fontWeight:800, color:PHX.text }}>
            Arraste uma planta, imagem ou referência aqui
          </h2>
          <p style={{ margin:'0 0 24px', fontSize:13, color:PHX.textSub }}>
            ou escolha como importar:
          </p>

          {/* Upload buttons */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginBottom:20 }}>
            {UPLOAD_OPTS.map(opt => (
              <button
                key={opt.id}
                className="phx-upload-btn"
                onClick={() => handleUploadClick(opt)}
                style={{
                  padding:'10px 18px', borderRadius:10, border:`1px solid ${PHX.border}`,
                  background:PHX.surface, color:PHX.text, fontSize:12, fontWeight:600,
                  display:'flex', alignItems:'center', gap:7, cursor:'pointer',
                  boxShadow: PHX.shadow,
                }}
              >
                <span style={{ fontSize:15 }}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          <p style={{ margin:0, fontSize:10, color:PHX.dim }}>
            PNG · JPG · WEBP · PDF
          </p>
          {error && (
            <div style={{ margin:'12px auto 0', maxWidth:520, padding:'9px 12px', borderRadius:9, border:'1px solid #fecaca', background:'#fff1f2', color:'#be123c', fontSize:11, fontWeight:600 }}>
              {error}
            </div>
          )}
          {activeKind === 'floorplan' && !error && (
            <div style={{ margin:'12px auto 0', maxWidth:560, padding:'10px 12px', borderRadius:9, border:'1px solid #fde68a', background:'#fffbeb', color:'#92400e', fontSize:11, lineHeight:1.45 }}>
              Planta: o arquivo será tratado como referência arquitetônica. A geometria não deve ser alterada automaticamente sem conferência e, quando a escala não for segura, será necessária calibração por uma medida real.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Project selector panel ────────────────────────────────────────────────────
function ProjectPanel({ arqState, onClose }: { arqState:ArqProjectState; onClose:()=>void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position:'absolute', top:'100%', left:0, marginTop:8, width:280, zIndex:800,
      background:PHX.surface, borderRadius:14, border:`1px solid ${PHX.border}`,
      boxShadow:PHX.shadowXL, overflow:'hidden', animation:'phx-in 0.18s ease',
    }}>
      <div style={{ padding:'10px 12px', borderBottom:`1px solid ${PHX.border}` }}>
        <p style={{ margin:0, fontSize:10, fontWeight:800, color:PHX.dim, letterSpacing:'.06em' }}>PROJETOS</p>
      </div>
      <div style={{ maxHeight:200, overflowY:'auto' }}>
        {arqState.projects.map(p => (
          <div key={p.id} className="phx-proj-item" onClick={() => { arqState.selectProject(p.id); onClose() }} style={{
            padding:'9px 14px', borderBottom:`1px solid ${PHX.border}`,
          }}>
            <p style={{ margin:'0 0 1px', fontSize:12, fontWeight:600, color: p.id === arqState.projectId ? PHX.purple : PHX.text }}>{p.titulo}</p>
            <p style={{ margin:0, fontSize:10, color:PHX.dim }}>{p.tipoObra ?? p.status ?? 'Sem tipo'}</p>
          </div>
        ))}
        {arqState.projects.length === 0 && (
          <div style={{ padding:'16px 14px', textAlign:'center' as const }}>
            <p style={{ margin:0, fontSize:11, color:PHX.dim }}>Nenhum projeto ainda</p>
            <p style={{ margin:'4px 0 0', fontSize:10, color:PHX.dim }}>Cadastre cliente e projeto no fluxo completo</p>
          </div>
        )}
      </div>
      <div style={{ padding:'10px 12px' }}>
        <button
          onClick={() => window.location.assign('/arch/projetos/novo')}
          style={{
            width:'100%', padding:'9px 12px', borderRadius:8, border:'none',
            background:PHX.purple, color:'#fff', fontWeight:800, fontSize:11, cursor:'pointer',
          }}
        >
          ＋ Novo projeto com cliente
        </button>
      </div>
    </div>
  )
}

// ─── Render progress modal ─────────────────────────────────────────────────────
export function RenderProgressModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const steps = [
    '✔ Interpretando projeto',
    '✔ Entendendo ambiente',
    '✔ Preparando IA',
    '✔ Gerando render',
    '✔ Refinando detalhes',
    '✔ Finalizando',
  ]

  useEffect(() => {
    if (step >= steps.length) return
    const t = setTimeout(() => setStep(s => s + 1), 900 + Math.random() * 400)
    return () => clearTimeout(t)
  }, [step, steps.length])

  const done = step >= steps.length

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center',
      background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)',
    }}>
      <div className="phx-card" style={{ width:380, padding:'32px', boxShadow:PHX.shadowXL, animation:'phx-in 0.25s ease' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36, marginBottom:10, animation: done ? 'none' : 'phx-spin 2s linear infinite', display:'inline-block' }}>
            {done ? '✨' : '⚙️'}
          </div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:900, color:PHX.text }}>
            {done ? 'Render concluído!' : 'Gerando render…'}
          </h2>
          {!done && <p style={{ margin:'4px 0 0', fontSize:12, color:PHX.textSub }}>A IA está trabalhando no seu projeto</p>}
        </div>

        {/* Progress steps */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{
                width:20, height:20, borderRadius:'50%', flexShrink:0,
                background: i < step ? PHX.green : i === step ? PHX.purple : PHX.border,
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.3s ease',
              }}>
                {i < step ? <span style={{ fontSize:9, color:'#fff' }}>✓</span> :
                  i === step ? <span style={{ fontSize:8, color:'#fff', animation:'phx-pulse 1s infinite' }}>●</span> :
                  null}
              </div>
              <p style={{
                margin:0, fontSize:12, fontWeight: i < step ? 700 : 500,
                color: i < step ? PHX.text : i === step ? PHX.purple : PHX.dim,
                transition:'color 0.3s ease',
              }}>
                {i < step ? s : i === step ? s.replace('✔ ', '') + '…' : s.replace('✔ ', '')}
              </p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ height:4, borderRadius:2, background:PHX.muted, marginBottom:20, overflow:'hidden' }}>
          <div style={{
            height:'100%', borderRadius:2, background:`linear-gradient(90deg, ${PHX.purple}, ${PHX.purpleL})`,
            width:`${Math.round((step / steps.length) * 100)}%`, transition:'width 0.4s ease',
          }} />
        </div>

        {done ? (
          <button onClick={onClose} className="phx-render-btn" style={{
            width:'100%', padding:'12px', borderRadius:10, border:'none',
            background:`linear-gradient(135deg, ${PHX.purple}, ${PHX.purpleL})`,
            color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer',
            boxShadow:'0 4px 14px rgba(124,58,237,0.35)',
          }}>
            Ver resultado ✨
          </button>
        ) : (
          <button onClick={onClose} style={{
            width:'100%', padding:'10px', borderRadius:10, border:`1px solid ${PHX.border}`,
            background:PHX.surface, color:PHX.textSub, fontSize:12, cursor:'pointer',
          }}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Home component ───────────────────────────────────────────────────────
export function ProjectHomePhoenix({
  arqState,
  onNavigate,
}: {
  arqState: ArqProjectState
  onNavigate: (m: string) => void
}) {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [showProjects, setShowProjects] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [droppedKind, setDroppedKind] = useState<ArqdorImportKind | null>(null)

  const handleImportedFile = useCallback((file: File, kind: ArqdorImportKind) => {
    setDroppedFile(file)
    setDroppedKind(kind)
  }, [])

  const hasProject  = !!arqState.projectId && !arqState.loading
  const projectName = arqState.projectMeta?.titulo ?? null

  // Compute which steps are "done" based on arqState
  const hasMeta  = !!arqState.projectMeta?.tipoObra
  const hasMats  = (arqState.materials?.length ?? 0) > 0
  const hasObjs  = (arqState.objects?.length ?? 0) > 0

  const stepsDone = {
    projeto:  hasProject,
    upload:   hasObjs || hasMats,
    objetivo: hasMeta,
    estilo:   selectedStyle !== null || hasMats,
    render:   false,
  }

  const currentStepIndex = STEPS.findIndex(s => !stepsDone[s.id as keyof typeof stepsDone])
  const greetingHour = new Date().getHours()
  const greeting = greetingHour < 12 ? 'Bom dia' : greetingHour < 18 ? 'Boa tarde' : 'Boa noite'

  return (
    <div style={{
      height:'100%', overflowY:'auto', overflowX:'hidden',
      background:PHX.bg, fontFamily:'system-ui, -apple-system, sans-serif',
    }}>
      <style>{CSS}</style>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="phx-section" style={{ padding:'36px 48px 24px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
        <div>
          <h1 style={{ margin:'0 0 4px', fontSize:28, fontWeight:900, color:PHX.text, letterSpacing:'-0.02em', lineHeight:1.2 }}>
            {greeting}! Vamos criar algo incrível?
          </h1>
          <p style={{ margin:0, fontSize:14, color:PHX.textSub }}>
            {hasProject ? (
              <>Trabalhando em <strong style={{ color:PHX.purple }}>{projectName}</strong> — envie uma planta ou imagem para começar.</>
            ) : (
              'Crie seu primeiro projeto e envie uma planta ou referência de estilo.'
            )}
          </p>
        </div>

        {/* Project selector */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <button onClick={() => setShowProjects(p => !p)} style={{
            display:'flex', alignItems:'center', gap:8, padding:'9px 16px',
            borderRadius:10, border:`1px solid ${PHX.border}`, background:PHX.surface,
            cursor:'pointer', boxShadow:PHX.shadow, color:PHX.text, fontSize:12, fontWeight:600,
          }}>
            {hasProject && <Avatar name={projectName ?? 'P'} />}
            <span style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {arqState.loading ? 'Carregando…' : (projectName ?? '＋ Novo projeto')}
            </span>
            <span style={{ color:PHX.dim, fontSize:9 }}>{showProjects ? '▲' : '▼'}</span>
          </button>
          {showProjects && <ProjectPanel arqState={arqState} onClose={() => setShowProjects(false)} />}
        </div>
      </div>

      {/* ── 5-STEP FLOW ─────────────────────────────────────────────── */}
      <div className="phx-section" style={{ padding:'0 48px 20px', animationDelay:'.05s' }}>
        <div style={{ display:'flex', gap:8, alignItems:'stretch' }}>
          {STEPS.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              active={i === currentStepIndex}
              completed={!!stepsDone[step.id as keyof typeof stepsDone]}
              onClick={() => onNavigate(step.module)}
            />
          ))}
          {/* Connector dots */}
        </div>
        <div style={{ display:'flex', marginTop:10, gap:0 }}>
          {STEPS.map((step, i) => (
            <div key={i} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {i < STEPS.length - 1 && (
                <div style={{ height:2, width:'60%', background: stepsDone[step.id as keyof typeof stepsDone] ? PHX.green : PHX.border, borderRadius:1, transition:'background 0.3s ease' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── UPLOAD ZONE ──────────────────────────────────────────────── */}
      <div className="phx-section" style={{ padding:'0 48px 20px', animationDelay:'.1s' }}>
        <UploadZone onNavigate={onNavigate} onFile={handleImportedFile} />
        {droppedFile && (
          <div style={{ marginTop:8, padding:'8px 14px', borderRadius:8, background:`${PHX.green}10`, border:`1px solid ${PHX.green}25`, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:PHX.green }}>✓</span>
            <span style={{ fontSize:11, color:PHX.text }}>
              Arquivo <strong>{droppedFile.name}</strong> carregado
              {droppedKind === 'floorplan'
                ? ' como planta de referência — revisar escala/geometria antes de aplicar'
                : ' como referência visual — indo para o módulo de renders'}
            </span>
          </div>
        )}
      </div>

      {/* ── STYLE + ACTIONS ────────────────────────────────────────── */}
      <div className="phx-section" style={{ padding:'0 48px 32px', animationDelay:'.15s', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Style picker */}
        <div style={{ background:PHX.surface, border:`1px solid ${PHX.border}`, borderRadius:16, padding:'20px 24px', boxShadow:PHX.shadow }}>
          <p style={{ margin:'0 0 14px', fontSize:12, fontWeight:800, color:PHX.dim, letterSpacing:'.06em' }}>④ ESCOLHER ESTILO</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
            {STYLES.map(s => (
              <div
                key={s.id}
                className="phx-style-chip"
                onClick={() => setSelectedStyle(s.id)}
                style={{
                  padding:'10px 8px', borderRadius:10, textAlign:'center',
                  border:`2px solid ${selectedStyle === s.id ? PHX.purple : PHX.border}`,
                  background: selectedStyle === s.id ? `${PHX.purple}08` : PHX.muted,
                }}
              >
                <div style={{ fontSize:18, marginBottom:4 }}>{s.emoji}</div>
                <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color: selectedStyle === s.id ? PHX.purple : PHX.text }}>{s.label}</p>
                <p style={{ margin:0, fontSize:9, color:PHX.dim }}>{s.desc}</p>
              </div>
            ))}
          </div>
          {selectedStyle && (
            <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, background:`${PHX.purple}08`, border:`1px solid ${PHX.purple}20` }}>
              <p style={{ margin:0, fontSize:11, color:PHX.purple, fontWeight:600 }}>
                Estilo <strong>{STYLES.find(s => s.id === selectedStyle)?.label}</strong> selecionado
              </p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ background:PHX.surface, border:`1px solid ${PHX.border}`, borderRadius:16, padding:'20px 24px', boxShadow:PHX.shadow, display:'flex', flexDirection:'column', gap:12 }}>
          <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:800, color:PHX.dim, letterSpacing:'.06em' }}>⑤ GERAR RENDER</p>
          <p style={{ margin:0, fontSize:13, color:PHX.textSub, lineHeight:1.5 }}>
            A IA vai interpretar sua planta, aplicar o estilo escolhido e gerar uma visualização fotorrealista.
          </p>

          <button
            className="phx-render-btn"
            onClick={() => { setShowProgress(true); setTimeout(() => { setShowProgress(false); onNavigate('renders') }, 6000) }}
            style={{
              padding:'14px 24px', borderRadius:12, border:'none',
              background:`linear-gradient(135deg, ${PHX.purple} 0%, ${PHX.purpleL} 100%)`,
              color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer',
              boxShadow:'0 4px 16px rgba(124,58,237,0.35)',
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            }}
          >
            <span style={{ fontSize:18 }}>✨</span>
            Gerar Render
          </button>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => onNavigate('renders')} style={{
              flex:1, padding:'9px', borderRadius:10, border:`1px solid ${PHX.border}`,
              background:PHX.muted, color:PHX.textSub, fontSize:11, fontWeight:600, cursor:'pointer',
            }}>
              🎬 Ver renders
            </button>
            <button onClick={() => onNavigate('prompt')} style={{
              flex:1, padding:'9px', borderRadius:10, border:`1px solid ${PHX.border}`,
              background:PHX.muted, color:PHX.textSub, fontSize:11, fontWeight:600, cursor:'pointer',
            }}>
              ⚡ Prompt manual
            </button>
          </div>

          <div style={{ marginTop:'auto', padding:'10px 12px', borderRadius:8, background:PHX.muted, display:'flex', gap:8, alignItems:'flex-start' }}>
            <span style={{ fontSize:16 }}>🤖</span>
            <div>
              <p style={{ margin:0, fontSize:11, fontWeight:600, color:PHX.text }}>Copilot</p>
              <p style={{ margin:'2px 0 0', fontSize:10, color:PHX.textSub, lineHeight:1.4 }}>
                {hasProject
                  ? 'Posso sugerir materiais e melhorar seu render — clique no botão do assistente.'
                  : 'Vamos criar algo incrível hoje? Comece criando seu projeto.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── PROJECT LIST (if exists) ────────────────────────────────── */}
      {!hasProject && arqState.projects.length > 0 && (
        <div className="phx-section" style={{ padding:'0 48px 32px', animationDelay:'.2s' }}>
          <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:PHX.dim, letterSpacing:'.06em' }}>PROJETOS RECENTES</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8 }}>
            {arqState.projects.slice(0, 6).map(p => (
              <div key={p.id} className="phx-card" onClick={() => arqState.selectProject(p.id)} style={{ padding:'14px 16px', cursor:'pointer' }}>
                <p style={{ margin:'0 0 3px', fontSize:12, fontWeight:700, color:PHX.text }}>{p.titulo}</p>
                <p style={{ margin:0, fontSize:10, color:PHX.dim }}>{p.tipoObra ?? p.status ?? 'Sem tipo'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ────────────────────────────────────────────── */}
      {!hasProject && arqState.projects.length === 0 && !arqState.loading && (
        <div className="phx-section" style={{ padding:'0 48px 40px', animationDelay:'.2s', textAlign:'center' }}>
          <div style={{ maxWidth:400, margin:'0 auto', padding:'32px', background:PHX.surface, borderRadius:20, border:`1px solid ${PHX.border}`, boxShadow:PHX.shadow }}>
            <span style={{ fontSize:48 }}>🏛️</span>
            <h3 style={{ margin:'12px 0 6px', fontSize:16, fontWeight:800, color:PHX.text }}>Vamos criar seu primeiro projeto</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:PHX.textSub, lineHeight:1.6 }}>
              Envie uma planta ou imagem de referência. A IA cuida do restante.
            </p>
            <button onClick={() => setShowProjects(true)} style={{
              padding:'10px 24px', borderRadius:10, border:'none',
              background:PHX.purple, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            }}>
              Criar projeto
            </button>
          </div>
        </div>
      )}

      {/* ── RENDER PROGRESS MODAL ────────────────────────────────── */}
      {showProgress && <RenderProgressModal onClose={() => { setShowProgress(false); onNavigate('renders') }} />}
    </div>
  )
}
