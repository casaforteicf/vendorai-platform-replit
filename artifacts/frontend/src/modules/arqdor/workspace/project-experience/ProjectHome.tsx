// ─── Project Home — FASE 17 Project Experience (PX) ─────────────────────────
// Dashboard centrado no projeto. Exibido por padrão ao abrir o workspace.
// Não altera engines, AQM, AQL, Providers. Apenas reorganiza a experiência.
//
// Layout:
//   [Header]
//   [SummaryCards] [WorkflowTimeline]   [SmartPanel]
//   [Checklist]    [Health+Readiness]   [SmartPanel cont.]

import { useState, useMemo } from 'react'
import type { ArqProjectState } from '../../hooks/useArqProject'
import { T } from '../../shared/arqdor-theme'

// ─── Workflow stages ──────────────────────────────────────────────────────────

interface Stage {
  id:     string
  icon:   string
  label:  string
  module: string
}

const STAGES: Stage[] = [
  { id:'briefing',    icon:'📋', label:'Briefing',         module:'projeto'    },
  { id:'moodboard',   icon:'🖼️', label:'Moodboard',        module:'biblioteca' },
  { id:'inteligente', icon:'🏗️', label:'Proj. Inteligente',module:'projeto'    },
  { id:'biblioteca',  icon:'📚', label:'Biblioteca',        module:'biblioteca' },
  { id:'componentes', icon:'🔩', label:'Componentes',       module:'biblioteca' },
  { id:'prompt',      icon:'⚡', label:'Prompt',            module:'prompt'    },
  { id:'render',      icon:'🎬', label:'Render',            module:'renders'   },
  { id:'review',      icon:'🔍', label:'Review',            module:'ai-review' },
  { id:'memorial',    icon:'📄', label:'Memorial',          module:'prompt'    },
  { id:'entrega',     icon:'🚀', label:'Entrega',           module:'cliente'   },
]

// ─── Checklist items ──────────────────────────────────────────────────────────

interface CheckItem {
  id:    string
  label: string
  done:  boolean
}

// ─── SmartPanel tabs ──────────────────────────────────────────────────────────

type SmartTab = 'workflow' | 'pendencias' | 'sugestoes' | 'alertas'

// ─── Helper — badge row ───────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding:'2px 7px', borderRadius:T.r.full, fontSize:T.fs.xs, fontWeight:700,
      background:`${color}18`, color, border:`1px solid ${color}30`,
    }}>{label}</span>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sub, accent, onClick,
}: {
  icon: string; label: string; value: string | number; sub?: string
  accent?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex:1, minWidth:90, padding:'12px 14px', borderRadius:T.r.lg,
        background:T.surface, border:`1px solid ${T.border}`,
        cursor: onClick ? 'pointer' : 'default',
        transition:'border-color 0.15s',
      }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.borderColor = accent ?? T.purpleL)}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.borderColor = T.border)}
    >
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:T.fs.xs, color:T.dim, fontWeight:700, letterSpacing:'0.05em' }}>{label.toUpperCase()}</span>
      </div>
      <p style={{ margin:0, fontSize:22, fontWeight:900, color: accent ?? '#fff', lineHeight:1 }}>{value}</p>
      {sub && <p style={{ margin:'3px 0 0', fontSize:T.fs.xs, color:T.dim }}>{sub}</p>}
    </div>
  )
}

// ─── Project Header ───────────────────────────────────────────────────────────

function ProjectHeader({
  arqState, readiness, healthLabel, healthColor,
}: {
  arqState: ArqProjectState; readiness: number; healthLabel: string; healthColor: string
}) {
  const meta = arqState.projectMeta
  if (!meta) return null

  const updatedAt = meta.updatedAt
    ? new Date(meta.updatedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
    : '—'

  return (
    <div style={{
      padding:'16px 20px', borderBottom:`1px solid ${T.border}`,
      background:'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, transparent 60%)',
      flexShrink:0,
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' as const }}>
        {/* Left — title + meta */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const, marginBottom:4 }}>
            <h2 style={{ margin:0, fontSize:T.fs.xxl, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
              {meta.titulo}
            </h2>
            <Badge label={meta.status ?? 'Ativo'} color={T.green} />
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
            {meta.clienteNome && (
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>
                👤 <span style={{ color:'#fff' }}>{meta.clienteNome}</span>
              </span>
            )}
            {meta.tipoObra && (
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>
                🏠 <span style={{ color:T.text }}>{meta.tipoObra}</span>
              </span>
            )}
            {meta.areaM2 && (
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>
                📐 <span style={{ color:T.text }}>{meta.areaM2} m²</span>
              </span>
            )}
            <span style={{ fontSize:T.fs.xs, color:T.dim }}>
              🕐 {updatedAt}
            </span>
          </div>
        </div>

        {/* Right — scores */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' as const }}>
          {/* Render Readiness */}
          <div style={{
            textAlign:'center' as const, padding:'8px 16px', borderRadius:T.r.md,
            background:'rgba(96,165,250,0.08)', border:`1px solid rgba(96,165,250,0.2)`,
          }}>
            <p style={{ margin:0, fontSize:20, fontWeight:900, color:T.blue }}>
              {readiness}%
            </p>
            <p style={{ margin:0, fontSize:T.fs.xs, color:T.dim }}>Render Readiness</p>
          </div>

          {/* AI Score / Project Health */}
          <div style={{
            textAlign:'center' as const, padding:'8px 16px', borderRadius:T.r.md,
            background:`${healthColor}12`, border:`1px solid ${healthColor}30`,
          }}>
            <p style={{ margin:0, fontSize:20, fontWeight:900, color:healthColor }}>
              {healthLabel}
            </p>
            <p style={{ margin:0, fontSize:T.fs.xs, color:T.dim }}>Project Health</p>
          </div>

          {/* Projeto Inteligente badge */}
          {arqState.objects.length > 0 && (
            <div style={{
              textAlign:'center' as const, padding:'8px 16px', borderRadius:T.r.md,
              background:'rgba(167,139,250,0.08)', border:`1px solid rgba(167,139,250,0.2)`,
            }}>
              <p style={{ margin:0, fontSize:T.fs.xxl, color:T.purpleL }}>✦</p>
              <p style={{ margin:0, fontSize:T.fs.xs, color:T.dim }}>Proj. Inteligente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Workflow Timeline ────────────────────────────────────────────────────────

function WorkflowTimeline({
  currentStage, onNavigate,
}: {
  currentStage: number; onNavigate: (module: string) => void
}) {
  return (
    <div style={{
      padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
      border:`1px solid ${T.border}`, flex:1, minWidth:0,
    }}>
      <p style={{ margin:'0 0 12px', fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>
        WORKFLOW DO PROJETO
      </p>
      <div style={{ position:'relative' }}>
        {/* Connecting line */}
        <div style={{
          position:'absolute', top:12, left:12, right:12, height:2,
          background:`linear-gradient(to right, ${T.purple} ${currentStage * 10}%, ${T.border} ${currentStage * 10}%)`,
          zIndex:0,
        }}/>
        <div style={{ display:'flex', gap:0, justifyContent:'space-between', position:'relative', zIndex:1 }}>
          {STAGES.map((stage, i) => {
            const done    = i < currentStage
            const current = i === currentStage
            const future  = i > currentStage
            return (
              <div
                key={stage.id}
                onClick={() => onNavigate(stage.module)}
                title={stage.label}
                style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:4, cursor:'pointer', flex:1 }}
              >
                <div style={{
                  width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:11, fontWeight:700, transition:'all 0.2s',
                  background: done    ? T.purple
                             : current ? 'rgba(124,58,237,0.4)'
                             : T.bg,
                  border: done    ? `2px solid ${T.purple}`
                        : current ? `2px solid ${T.purpleL}`
                        : `2px solid ${T.border}`,
                  color: done ? '#fff' : current ? T.purpleL : T.dim,
                  boxShadow: current ? `0 0 12px rgba(124,58,237,0.5)` : 'none',
                }}>
                  {done ? '✓' : <span style={{ fontSize:9 }}>{i + 1}</span>}
                </div>
                <p style={{
                  margin:0, fontSize:8, color: done ? T.purpleL : current ? '#fff' : T.dim,
                  fontWeight: current ? 700 : 400, textAlign:'center' as const, lineHeight:1.2,
                  maxWidth:44, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const,
                }}>{stage.label}</p>
              </div>
            )
          })}
        </div>
      </div>
      {/* Current stage label */}
      <div style={{ marginTop:10, padding:'6px 10px', borderRadius:T.r.sm, background:'rgba(124,58,237,0.08)', display:'inline-block' }}>
        <span style={{ fontSize:T.fs.xs, color:T.purpleL }}>
          Etapa atual: <strong>{STAGES[currentStage]?.label ?? 'Concluído'}</strong>
          {currentStage < STAGES.length - 1 && (
            <> · Próxima: <span style={{ color:T.dim }}>{STAGES[currentStage + 1]?.label}</span></>
          )}
        </span>
      </div>
    </div>
  )
}

// ─── Project Checklist ────────────────────────────────────────────────────────

function ProjectChecklist({ items }: { items: CheckItem[] }) {
  const done = items.filter(i => i.done).length
  const pct  = Math.round((done / items.length) * 100)

  return (
    <div style={{
      padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
      border:`1px solid ${T.border}`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <p style={{ margin:0, fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>CHECKLIST DO PROJETO</p>
        <span style={{ fontSize:T.fs.xs, color: pct >= 80 ? T.green : pct >= 50 ? T.amber : T.red, fontWeight:700 }}>
          {done}/{items.length} · {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:T.border, borderRadius:T.r.full, marginBottom:10, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: pct>=80?T.green:pct>=50?T.amber:T.red, borderRadius:T.r.full, transition:'width 0.4s' }}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 12px' }}>
        {items.map(item => (
          <div key={item.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 0' }}>
            <div style={{
              width:14, height:14, borderRadius:T.r.sm, flexShrink:0, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:9, fontWeight:700,
              background: item.done ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${item.done ? T.green : T.border}`,
              color: item.done ? T.green : T.dim,
            }}>
              {item.done ? '✓' : ''}
            </div>
            <span style={{ fontSize:T.fs.xs, color: item.done ? T.text : T.dim }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Project Health ───────────────────────────────────────────────────────────

function ProjectHealthPanel({
  label, color, reasons,
}: {
  label: string; color: string; reasons: string[]
}) {
  const LEVELS = ['Crítico','Atenção','Bom','Excelente']
  const idx    = LEVELS.indexOf(label)

  return (
    <div style={{
      padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
      border:`1px solid ${T.border}`,
    }}>
      <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>PROJECT HEALTH</p>

      {/* Level bar */}
      <div style={{ display:'flex', gap:3, marginBottom:10 }}>
        {LEVELS.map((lv, i) => (
          <div key={lv} style={{ flex:1, height:4, borderRadius:T.r.full, background: i <= idx ? color : T.border, transition:'background 0.3s' }}/>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:reasons.length ? 8 : 0 }}>
        <span style={{ fontSize:T.fs.xxl, fontWeight:900, color }}>{label}</span>
      </div>

      {reasons.length > 0 && (
        <div>
          <p style={{ margin:'0 0 4px', fontSize:T.fs.xs, color:T.dim }}>Motivos:</p>
          {reasons.map((r, i) => (
            <div key={i} style={{ display:'flex', gap:6, alignItems:'flex-start', padding:'2px 0' }}>
              <span style={{ color:T.amber, fontSize:9, marginTop:1, flexShrink:0 }}>⚠</span>
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Render Readiness Panel ───────────────────────────────────────────────────

function RenderReadinessPanel({
  readiness, missing,
}: {
  readiness: number; missing: string[]
}) {
  const color = readiness >= 85 ? T.green : readiness >= 65 ? T.blue : readiness >= 40 ? T.amber : T.red

  return (
    <div style={{
      padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
      border:`1px solid ${color}30`,
    }}>
      <p style={{ margin:'0 0 8px', fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>RENDER READINESS</p>

      {/* Circular indicator (CSS-only) */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
        <div style={{
          width:52, height:52, borderRadius:'50%', flexShrink:0, display:'flex',
          alignItems:'center', justifyContent:'center',
          background:`conic-gradient(${color} ${readiness * 3.6}deg, ${T.border} 0deg)`,
          boxShadow:`0 0 0 4px ${T.surface}`,
        }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:T.surface, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:T.fs.md, fontWeight:900, color }}>{readiness}%</span>
          </div>
        </div>
        <div>
          <p style={{ margin:0, fontSize:T.fs.sm, fontWeight:700, color }}>
            {readiness >= 85 ? 'Pronto para renderizar' : readiness >= 65 ? 'Quase pronto' : readiness >= 40 ? 'Em preparação' : 'Dados insuficientes'}
          </p>
          {missing.length > 0 && (
            <p style={{ margin:'2px 0 0', fontSize:T.fs.xs, color:T.dim }}>Faltam {missing.length} item(ns)</p>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div>
          <p style={{ margin:'0 0 4px', fontSize:T.fs.xs, color:T.dim }}>Pendente:</p>
          {missing.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display:'flex', gap:6, padding:'2px 0', alignItems:'flex-start' }}>
              <span style={{ color:T.amber, fontSize:9, marginTop:2, flexShrink:0 }}>›</span>
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>{m}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Smart Panel ─────────────────────────────────────────────────────────────

function SmartPanel({
  arqState, currentStage, missing, healthReasons, onNavigate,
}: {
  arqState: ArqProjectState; currentStage: number; missing: string[]
  healthReasons: string[]; onNavigate: (module: string) => void
}) {
  const [tab, setTab] = useState<SmartTab>('workflow')

  const TABS: { id: SmartTab; icon: string; label: string; badge?: number }[] = [
    { id:'workflow',   icon:'🔄', label:'Fluxo'      },
    { id:'pendencias', icon:'📌', label:'Pendências', badge: missing.length   },
    { id:'sugestoes',  icon:'💡', label:'Sugestões'  },
    { id:'alertas',    icon:'⚠️', label:'Alertas',    badge: healthReasons.length },
  ]

  const suggestions = useMemo(() => {
    const s: string[] = []
    if (arqState.objects.length === 0)     s.push('Adicione objetos para ativar o AI Intelligence')
    if (arqState.materials.length === 0)   s.push('Cadastre materiais para calcular o Render Readiness')
    if (!arqState.projectMeta?.clienteNome) s.push('Vincule um cliente para habilitar o CRM')
    if (arqState.objects.length > 0 && arqState.materials.length === 0)
      s.push('Projetos com objetos e materiais têm 3× mais precisão de render')
    if (arqState.materials.length >= 3 && currentStage < 6)
      s.push('Você tem materiais suficientes para iniciar o Prompt Playground')
    if (currentStage >= 6)
      s.push('Projeto pronto para render — abra o módulo Renders para gerar')
    if (s.length === 0) s.push('Continue adicionando dados para receber sugestões personalizadas')
    return s
  }, [arqState.objects.length, arqState.materials.length, arqState.projectMeta?.clienteNome, currentStage])

  return (
    <div style={{
      width:240, flexShrink:0, display:'flex', flexDirection:'column' as const,
      background:T.sidebar, borderLeft:`1px solid ${T.border}`, overflow:'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:1, padding:'8px 4px', border:'none', cursor:'pointer',
              background: tab === t.id ? 'rgba(124,58,237,0.15)' : 'transparent',
              borderBottom: `2px solid ${tab === t.id ? T.purple : 'transparent'}`,
              color: tab === t.id ? T.purpleL : T.dim,
              fontSize:9, fontWeight:700, position:'relative' as const, transition:'all 0.15s',
            }}
          >
            <div style={{ fontSize:12, marginBottom:2 }}>{t.icon}</div>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <div style={{
                position:'absolute' as const, top:4, right:4, width:14, height:14,
                borderRadius:'50%', background:T.amber, color:'#000',
                fontSize:8, fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center',
              }}>{t.badge > 9 ? '9+' : t.badge}</div>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:12 }}>

        {tab === 'workflow' && (
          <div>
            <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, color:T.dim, fontWeight:700 }}>ETAPAS DO PROJETO</p>
            {STAGES.map((stage, i) => {
              const done    = i < currentStage
              const current = i === currentStage
              return (
                <div
                  key={stage.id}
                  onClick={() => onNavigate(stage.module)}
                  style={{
                    display:'flex', gap:8, alignItems:'center', padding:'6px 8px',
                    borderRadius:T.r.sm, marginBottom:2, cursor:'pointer',
                    background: current ? 'rgba(124,58,237,0.12)' : 'transparent',
                    border: `1px solid ${current ? T.purple : 'transparent'}`,
                  }}
                >
                  <div style={{
                    width:18, height:18, borderRadius:'50%', display:'flex', alignItems:'center',
                    justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0,
                    background: done ? T.purple : current ? 'rgba(124,58,237,0.3)' : T.border,
                    color: done ? '#fff' : current ? T.purpleL : T.dim,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0, fontSize:T.fs.xs, color: done ? T.textSub : current ? '#fff' : T.dim, fontWeight: current ? 700 : 400 }}>
                      {stage.label}
                    </p>
                  </div>
                  {current && <span style={{ fontSize:8, color:T.purpleL }}>atual</span>}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'pendencias' && (
          <div>
            <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, color:T.dim, fontWeight:700 }}>PENDÊNCIAS</p>
            {missing.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'20px 0', color:T.green }}>
                <div style={{ fontSize:24, marginBottom:6 }}>✓</div>
                <p style={{ margin:0, fontSize:T.fs.xs }}>Nenhuma pendência</p>
              </div>
            ) : missing.map((m, i) => (
              <div key={i} style={{
                display:'flex', gap:6, padding:'8px 10px', borderRadius:T.r.sm, marginBottom:4,
                background:'rgba(251,191,36,0.06)', border:`1px solid rgba(251,191,36,0.15)`,
              }}>
                <span style={{ color:T.amber, fontSize:10, flexShrink:0, marginTop:1 }}>!</span>
                <span style={{ fontSize:T.fs.xs, color:T.text }}>{m}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'sugestoes' && (
          <div>
            <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, color:T.dim, fontWeight:700 }}>SUGESTÕES DA IA</p>
            {suggestions.map((s, i) => (
              <div key={i} style={{
                display:'flex', gap:6, padding:'8px 10px', borderRadius:T.r.sm, marginBottom:4,
                background:'rgba(167,139,250,0.06)', border:`1px solid rgba(167,139,250,0.15)`,
              }}>
                <span style={{ color:T.purpleL, fontSize:10, flexShrink:0, marginTop:1 }}>✦</span>
                <span style={{ fontSize:T.fs.xs, color:T.text }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'alertas' && (
          <div>
            <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, color:T.dim, fontWeight:700 }}>ALERTAS</p>
            {healthReasons.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'20px 0', color:T.green }}>
                <div style={{ fontSize:24, marginBottom:6 }}>✓</div>
                <p style={{ margin:0, fontSize:T.fs.xs }}>Projeto sem alertas</p>
              </div>
            ) : healthReasons.map((r, i) => (
              <div key={i} style={{
                display:'flex', gap:6, padding:'8px 10px', borderRadius:T.r.sm, marginBottom:4,
                background:'rgba(248,113,113,0.06)', border:`1px solid rgba(248,113,113,0.15)`,
              }}>
                <span style={{ color:T.red, fontSize:10, flexShrink:0, marginTop:1 }}>⚠</span>
                <span style={{ fontSize:T.fs.xs, color:T.text }}>{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Empty state / Welcome screen ────────────────────────────────────────────

function EmptyHome({ onNavigate }: { onNavigate: (module: string) => void }) {
  const features = [
    { icon:'🎬', label:'Renders com IA',    desc:'Gere renders fotorrealistas em minutos' },
    { icon:'🤖', label:'Copilot de Obra',   desc:'Assistente especializado em arquitetura' },
    { icon:'📚', label:'Biblioteca',         desc:'Materiais, componentes e fabricantes' },
    { icon:'⚡', label:'Prompt Engine',      desc:'Prompts otimizados para qualquer IA' },
    { icon:'🔍', label:'AI Review',          desc:'Análise inteligente do projeto' },
    { icon:'👤', label:'Portal do Cliente',  desc:'Entregas profissionais e aprovações' },
  ]

  return (
    <div style={{
      flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center',
      justifyContent:'center', gap:28, padding:'40px 24px', background:T.bg, overflowY:'auto' as const,
    }}>
      {/* Branding */}
      <div style={{ textAlign:'center' as const }}>
        <div style={{ fontSize:52, marginBottom:10 }}>🏛️</div>
        <h1 style={{ margin:'0 0 6px', fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
          arqdor<span style={{ color:T.purpleL }}>.ai</span>
        </h1>
        <p style={{ margin:0, fontSize:13, color:T.textSub }}>
          AI Workspace para Arquitetos de Interiores
        </p>
      </div>

      {/* Feature grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, maxWidth:540, width:'100%' }}>
        {features.map(f => (
          <div key={f.label} style={{
            padding:'12px 14px', borderRadius:10, background:T.surface,
            border:`1px solid ${T.border}`, textAlign:'center' as const,
          }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{f.icon}</div>
            <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color:'#fff' }}>{f.label}</p>
            <p style={{ margin:0, fontSize:9, color:T.dim, lineHeight:1.3 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Journey steps */}
      <div style={{
        display:'flex', gap:6, alignItems:'center', maxWidth:480, width:'100%',
        padding:'10px 16px', borderRadius:10, background:'rgba(124,58,237,0.06)',
        border:`1px solid rgba(124,58,237,0.2)`,
      }}>
        {['📋 Briefing', '🏗️ Projeto', '⚡ Prompt', '🎬 Render', '👤 Entrega'].map((s, i, arr) => (
          <span key={s} style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
            <span style={{ fontSize:9, color: i === 0 ? T.purpleL : T.dim, fontWeight: i === 0 ? 700 : 400, whiteSpace:'nowrap' as const }}>{s}</span>
            {i < arr.length - 1 && <span style={{ color:T.border, fontSize:10, flexShrink:0 }}>›</span>}
          </span>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, justifyContent:'center' }}>
        <button
          onClick={() => onNavigate('projeto')}
          style={{
            padding:'12px 32px', borderRadius:T.r.md, border:'none',
            background:`linear-gradient(135deg, ${T.purple} 0%, #5b21b6 100%)`,
            color:'#fff', cursor:'pointer', fontSize:14, fontWeight:800,
            boxShadow:'0 4px 20px rgba(124,58,237,0.35)',
          }}
        >
          ✨ Criar Projeto
        </button>
        <button
          onClick={() => onNavigate('arqhub')}
          style={{
            padding:'12px 24px', borderRadius:T.r.md, border:`1px solid ${T.border}`,
            background:'rgba(255,255,255,0.04)', color:T.text, cursor:'pointer',
            fontSize:13, fontWeight:600,
          }}
        >
          🏛️ Explorar ARQ HUB
        </button>
      </div>
    </div>
  )
}

// ─── ProjectHome ──────────────────────────────────────────────────────────────

export function ProjectHome({
  arqState, onNavigate,
}: {
  arqState: ArqProjectState
  onNavigate: (module: string) => void
}) {
  const meta      = arqState.projectMeta
  const objects   = arqState.objects
  const materials = arqState.materials

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalObj   = objects.length
  const objWithMat = objects.filter(o => o.material).length
  const totalMat   = materials.length
  const matWithMfg = materials.filter(m => m.manufacturer && m.manufacturer.trim().length > 0).length

  const objScore  = totalObj   > 0 ? (objWithMat / totalObj)   * 50 : 0
  const matScore  = totalMat   > 0 ? (matWithMfg / totalMat)   * 50 : 0
  const readiness = totalObj + totalMat === 0 ? 0 : Math.round(objScore + matScore)

  // Health
  const { healthLabel, healthColor } = (() => {
    if (readiness >= 85) return { healthLabel:'Excelente', healthColor: T.green }
    if (readiness >= 65) return { healthLabel:'Bom',       healthColor: T.blue  }
    if (readiness >= 40) return { healthLabel:'Atenção',   healthColor: T.amber }
    return                      { healthLabel:'Crítico',   healthColor: T.red   }
  })()

  // Health reasons
  const healthReasons: string[] = []
  if (totalObj === 0)                          healthReasons.push('Nenhum objeto cadastrado no projeto')
  if (totalMat === 0)                          healthReasons.push('Nenhum material definido')
  if (totalObj > 0 && objWithMat < totalObj)   healthReasons.push(`${totalObj - objWithMat} objeto(s) sem material`)
  if (totalMat > 0 && matWithMfg < totalMat)   healthReasons.push(`${totalMat - matWithMfg} material(is) sem fabricante`)
  if (!meta?.clienteNome)                      healthReasons.push('Cliente não vinculado ao projeto')

  // Missing items for render
  const missing: string[] = []
  if (totalObj === 0)                          missing.push('Adicionar objetos ao projeto')
  if (totalObj > 0 && objWithMat < totalObj)   missing.push(`Definir material de ${totalObj - objWithMat} objeto(s)`)
  if (totalMat > 0 && matWithMfg < totalMat)   missing.push(`Confirmar fabricante de ${totalMat - matWithMfg} material(is)`)
  if (totalMat === 0)                          missing.push('Cadastrar materiais e fabricantes')

  // Current workflow stage
  const currentStage = (() => {
    if (totalObj > 0 && totalMat > 0 && matWithMfg === totalMat && objWithMat === totalObj) return 6 // Render
    if (totalObj > 0 && totalMat > 0) return 5  // Prompt
    if (totalMat > 0)                 return 4  // Componentes
    if (totalObj > 0)                 return 3  // Biblioteca
    if (meta?.tipoObra)               return 1  // Moodboard
    return 0                                     // Briefing
  })()

  // Checklist
  const checkItems: CheckItem[] = [
    { id:'cliente',      label:'Cliente',          done: !!meta?.clienteNome },
    { id:'briefing',     label:'Briefing',         done: !!meta?.tipoObra    },
    { id:'moodboard',    label:'Moodboard',        done: false               },
    { id:'projeto',      label:'Projeto',          done: totalObj > 0        },
    { id:'aqm',          label:'AQM',              done: totalObj >= 3       },
    { id:'materiais',    label:'Materiais',        done: totalMat > 0        },
    { id:'componentes',  label:'Componentes',      done: objects.some(o => !!o.componentId) },
    { id:'render',       label:'Render',           done: false               },
    { id:'review',       label:'Review',           done: false               },
    { id:'memorial',     label:'Memorial',         done: false               },
    { id:'compras',      label:'Lista de Compras', done: false               },
    { id:'entrega',      label:'Entrega',          done: false               },
  ]

  // Environments derived from objects categories
  const envCategories = [...new Set(objects.map(o => o.category))].filter(Boolean)

  // ── No project ────────────────────────────────────────────────────────────────
  if (!meta) {
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>
        <EmptyHome onNavigate={onNavigate} />
      </div>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, overflow:'hidden', background:T.bg }}>

      {/* Header */}
      <ProjectHeader
        arqState={arqState}
        readiness={readiness}
        healthLabel={healthLabel}
        healthColor={healthColor}
      />

      {/* ── Próxima Ação / Journey bar ── */}
      <div style={{
        padding:'8px 16px', borderBottom:`1px solid ${T.border}`,
        background:'rgba(124,58,237,0.04)', flexShrink:0,
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' as const,
      }}>
        <span style={{ fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.08em', whiteSpace:'nowrap' as const }}>PRÓXIMA AÇÃO</span>
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:140 }}>
          <span style={{ fontSize:13 }}>{STAGES[Math.min(currentStage, STAGES.length-1)]?.icon}</span>
          <span style={{ fontSize:11, color:'#fff', fontWeight:600 }}>
            {STAGES[Math.min(currentStage, STAGES.length-1)]?.label ?? 'Projeto concluído'}
          </span>
          <button
            onClick={() => onNavigate(STAGES[Math.min(currentStage, STAGES.length-1)]?.module ?? 'projeto')}
            style={{
              padding:'3px 12px', borderRadius:6, border:'none',
              background:T.purple, color:'#fff', cursor:'pointer', fontSize:10, fontWeight:700, marginLeft:4,
            }}
          >
            Ir →
          </button>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button
            onClick={() => onNavigate('renders')}
            style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.text, cursor:'pointer', fontSize:10, fontWeight:600 }}
          >
            🎬 Render
          </button>
          <button
            onClick={() => onNavigate('cliente')}
            style={{ padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.text, cursor:'pointer', fontSize:10, fontWeight:600 }}
          >
            👤 Portal
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Main area ── */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 16px 16px 16px' }}>

          {/* Summary cards row */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:12 }}>
            <SummaryCard icon="🏗️" label="Projeto"    value={1}              sub={meta.tipoObra ?? 'indefinido'}                 onClick={() => onNavigate('projeto')} />
            <SummaryCard icon="🏠" label="Ambientes"  value={envCategories.length || '—'}  sub="categorias de objetos"           onClick={() => onNavigate('projeto')} />
            <SummaryCard icon="📦" label="Objetos"    value={totalObj}        sub={`${objWithMat} com material`}   accent={T.blue}  onClick={() => onNavigate('projeto')} />
            <SummaryCard icon="🪵" label="Materiais"  value={totalMat}        sub={`${matWithMfg} com fabricante`} accent={T.purpleL} onClick={() => onNavigate('biblioteca')} />
            <SummaryCard icon="🔩" label="Componentes" value={objects.filter(o=>o.componentId).length} sub="vinculados" onClick={() => onNavigate('biblioteca')} />
            <SummaryCard icon="🎬" label="Renders"    value="→"               sub="Ver histórico"                   onClick={() => onNavigate('renders')} />
            <SummaryCard icon="📌" label="Pendências" value={missing.length}  sub="itens em aberto" accent={missing.length>0?T.amber:T.green} />
          </div>

          {/* Workflow Timeline */}
          <div style={{ marginBottom:12 }}>
            <WorkflowTimeline currentStage={currentStage} onNavigate={onNavigate} />
          </div>

          {/* Bottom row: Checklist + Health + Readiness */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 200px 200px', gap:10 }}>
            <ProjectChecklist items={checkItems} />
            <ProjectHealthPanel label={healthLabel} color={healthColor} reasons={healthReasons} />
            <RenderReadinessPanel readiness={readiness} missing={missing} />
          </div>
        </div>

        {/* ── Smart Panel ── */}
        <SmartPanel
          arqState={arqState}
          currentStage={currentStage}
          missing={missing}
          healthReasons={healthReasons}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  )
}
