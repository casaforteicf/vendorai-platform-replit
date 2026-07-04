// ─── Project Home — Sprint 3: Project Experience ──────────────────────────────
// Centro do Projeto + Jornada Inteligente + Project Score + Copilot next action.
// Nenhum backend novo. Todos os dados derivados de arqState + renders API.

import { useState, useMemo, useEffect } from 'react'
import type { ArqProjectState } from '../../hooks/useArqProject'
import { T } from '../../shared/arqdor-theme'

// ─── Global CSS animations ────────────────────────────────────────────────────

const CSS = `
  @keyframes px-fadeIn {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes px-scaleIn {
    from { opacity:0; transform:scale(0.97); }
    to   { opacity:1; transform:scale(1); }
  }
  @keyframes px-pulse-ring {
    0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.55); }
    70%  { box-shadow: 0 0 0 6px rgba(124,58,237,0); }
    100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
  }
  @keyframes px-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes px-countUp {
    from { opacity:0; transform:translateY(4px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .px-fade   { animation: px-fadeIn  0.4s ease both; }
  .px-scale  { animation: px-scaleIn 0.35s ease both; }
  .px-current-step {
    animation: px-pulse-ring 2.2s ease infinite !important;
  }
  .px-journey-step {
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease !important;
  }
  .px-journey-step:hover {
    transform: translateX(2px) !important;
  }
  .px-stat-card {
    transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease !important;
    animation: px-scaleIn 0.3s ease both;
  }
  .px-stat-card:hover {
    transform: translateY(-2px) !important;
    border-color: rgba(167,139,250,0.4) !important;
    box-shadow: 0 6px 24px rgba(124,58,237,0.15) !important;
  }
  .px-shimmer {
    background: linear-gradient(90deg,
      rgba(255,255,255,0.04) 0px,
      rgba(255,255,255,0.09) 80px,
      rgba(255,255,255,0.04) 160px);
    background-size: 600px 100%;
    animation: px-shimmer 1.5s ease infinite;
  }
  .px-btn-primary {
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
  }
  .px-btn-primary:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 24px rgba(124,58,237,0.45) !important;
  }
  .px-activity-card {
    transition: border-color 0.15s ease, background 0.15s ease !important;
  }
  .px-activity-card:hover {
    background: rgba(255,255,255,0.05) !important;
  }
`

// ─── Auth helper ──────────────────────────────────────────────────────────────

function authHeaders() {
  const tok = localStorage.getItem('vendorai_token')
  return {
    'Content-Type': 'application/json',
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface JourneyStep {
  id:     string
  icon:   string
  label:  string
  module: string
  desc:   string
  done:   boolean
}

interface DimScore {
  id:       string
  label:    string
  score:    number
  maxScore: number
  color:    string
}

interface ProjectScoreResult {
  total:      number
  label:      string
  color:      string
  dimensions: DimScore[]
}

interface LastRenderInfo {
  imageUrl:  string | null
  cenaNome:  string | null
  createdAt: string | null
  count:     number
}

interface SavedVariation {
  name:    string
  savedAt: number
}

// ─── Project Score algorithm ──────────────────────────────────────────────────
//
//  Dimensão    Peso   Critério de pontuação
//  ──────────────────────────────────────────────────────────────────────
//  Projeto     20 pts  +10 se projeto criado, +5 tipoObra, +5 areaM2
//  Ambientes   10 pts  +10 se ≥1 categoria de ambiente definida
//  Biblioteca  20 pts  +10 materials>0, +5 matWithMfg>0, +5 components>0
//  Prompt      15 pts  +15 se variação salva existe, +5 apenas objects>0
//  Render      20 pts  +10 primeiro render, +5 ≥3 renders, +5 ≥5 renders
//  Portal      10 pts  +10 se clienteNome preenchido
//  Cliente      5 pts  +5 se clienteNome + tipoObra ambos preenchidos

export function computeProjectScore(params: {
  hasMeta:          boolean
  hasTipoObra:      boolean
  hasAreaM2:        boolean
  hasClienteNome:   boolean
  totalObj:         number
  totalMat:         number
  matWithMfg:       number
  componentsLinked: number
  envCategories:    number
  hasSavedVariation:boolean
  renderCount:      number
}): ProjectScoreResult {
  const {
    hasMeta, hasTipoObra, hasAreaM2, hasClienteNome,
    totalMat, matWithMfg, componentsLinked,
    envCategories, hasSavedVariation, renderCount, totalObj,
  } = params

  const projetoScore    = (hasMeta ? 10 : 0) + (hasTipoObra ? 5 : 0) + (hasAreaM2 ? 5 : 0)
  const ambientesScore  = Math.min(10, envCategories >= 1 ? 10 : 0)
  const bibliotecaScore = (totalMat > 0 ? 10 : 0) + (matWithMfg > 0 ? 5 : 0) + (componentsLinked > 0 ? 5 : 0)
  const promptScore     = hasSavedVariation ? 15 : (totalObj > 0 ? 5 : 0)
  const renderScore     = (renderCount > 0 ? 10 : 0) + (renderCount >= 3 ? 5 : 0) + (renderCount >= 5 ? 5 : 0)
  const portalScore     = hasClienteNome ? 10 : 0
  const clienteScore    = (hasClienteNome && hasTipoObra) ? 5 : 0

  const total = projetoScore + ambientesScore + bibliotecaScore + promptScore + renderScore + portalScore + clienteScore

  const label = total >= 80 ? 'Excelente' : total >= 60 ? 'Bom' : total >= 40 ? 'Atenção' : 'Inicial'
  const color = total >= 80 ? T.green    : total >= 60 ? T.blue  : total >= 40 ? T.amber   : T.red

  return {
    total, label, color,
    dimensions: [
      { id:'projeto',   label:'Projeto',   score: projetoScore,    maxScore: 20, color: '#60a5fa' },
      { id:'ambientes', label:'Ambientes', score: ambientesScore,  maxScore: 10, color: '#34d399' },
      { id:'biblioteca',label:'Biblioteca',score: bibliotecaScore, maxScore: 20, color: '#a78bfa' },
      { id:'prompt',    label:'Prompt',    score: promptScore,     maxScore: 15, color: '#f59e0b' },
      { id:'render',    label:'Render',    score: renderScore,     maxScore: 20, color: '#f87171' },
      { id:'portal',    label:'Portal',    score: portalScore,     maxScore: 10, color: '#4ade80' },
    ],
  }
}

// ─── Hook: last render from API ───────────────────────────────────────────────

function useLastRender(): LastRenderInfo {
  const [info, setInfo] = useState<LastRenderInfo>({ imageUrl:null, cenaNome:null, createdAt:null, count:0 })

  useEffect(() => {
    const tok = localStorage.getItem('vendorai_token')
    if (!tok) return
    fetch('/api/arch/renders/gallery?limit=5', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ imageUrl?: string; cenaNome?: string; createdAt?: string }>) => {
        if (!Array.isArray(data)) return
        setInfo({
          imageUrl:  data[0]?.imageUrl  ?? null,
          cenaNome:  data[0]?.cenaNome  ?? null,
          createdAt: data[0]?.createdAt ?? null,
          count:     data.length,
        })
      })
      .catch(() => {})
  }, [])

  return info
}

// ─── Helper: last saved variation from localStorage ───────────────────────────

function getLastSavedVariation(): SavedVariation | null {
  try {
    const raw = localStorage.getItem('arqdor_saved_variations')
    if (!raw) return null
    const arr = JSON.parse(raw) as SavedVariation[]
    if (!Array.isArray(arr) || arr.length === 0) return null
    return arr.sort((a, b) => b.savedAt - a.savedAt)[0]
  } catch { return null }
}

// ─── Helper: format relative time ─────────────────────────────────────────────

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600)  return `há ${Math.round(diff / 60)} min`
  if (diff < 86400) return `há ${Math.round(diff / 3600)} h`
  return `há ${Math.round(diff / 86400)} d`
}

// ─── SmartTab ─────────────────────────────────────────────────────────────────

type SmartTab = 'workflow' | 'pendencias' | 'sugestoes' | 'alertas'

// ─── Project Center ───────────────────────────────────────────────────────────
// Rich header: Nome, Cliente, Status, Project Score, Last Render, Last Prompt,
//              Last AI, Próxima Ação.

function ProjectCenter({
  arqState, score, lastRender, lastPrompt, nextStepLabel, nextStepModule, onNavigate,
}: {
  arqState:       ArqProjectState
  score:          ProjectScoreResult
  lastRender:     LastRenderInfo
  lastPrompt:     SavedVariation | null
  nextStepLabel:  string
  nextStepModule: string
  onNavigate:     (m: string) => void
}) {
  const meta = arqState.projectMeta!

  const updatedAt = meta.updatedAt ? fmtRelative(meta.updatedAt) : '—'

  return (
    <div style={{
      padding:'14px 20px', borderBottom:`1px solid ${T.border}`, flexShrink:0,
      background:'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, transparent 60%)',
    }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' as const }}>

        {/* ── Identity + Activity ── */}
        <div style={{ flex:1, minWidth:220 }}>
          {/* Title */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' as const }}>
            <h2 style={{ margin:0, fontSize:T.fs.xxl, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>
              {meta.titulo}
            </h2>
            <span style={{
              padding:'2px 8px', borderRadius:T.r.full, fontSize:T.fs.xs, fontWeight:700,
              background:'rgba(74,222,128,0.12)', color:T.green, border:`1px solid rgba(74,222,128,0.25)`,
            }}>{meta.status ?? 'Ativo'}</span>
          </div>

          {/* Meta row */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, marginBottom:10 }}>
            {meta.clienteNome && (
              <span style={{ fontSize:T.fs.xs, color:T.textSub }}>
                👤 <span style={{ color:'#fff' }}>{meta.clienteNome}</span>
              </span>
            )}
            {!meta.clienteNome && (
              <span
                onClick={() => onNavigate('cliente')}
                style={{ fontSize:T.fs.xs, color:T.amber, cursor:'pointer', textDecoration:'underline dotted' }}
              >
                + Vincular cliente
              </span>
            )}
            {meta.tipoObra && <span style={{ fontSize:T.fs.xs, color:T.textSub }}>🏠 {meta.tipoObra}</span>}
            {meta.areaM2   && <span style={{ fontSize:T.fs.xs, color:T.textSub }}>📐 {meta.areaM2} m²</span>}
            <span style={{ fontSize:T.fs.xs, color:T.dim }}>🕐 {updatedAt}</span>
          </div>

          {/* Activity cards: Last Render | Last Prompt | Last AI */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>

            {/* Last Render */}
            <div
              onClick={() => onNavigate('renders')}
              style={{
                display:'flex', gap:7, alignItems:'center', cursor:'pointer',
                padding:'6px 10px', borderRadius:T.r.sm,
                background:T.surface, border:`1px solid ${T.border}`,
                transition:'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = T.purpleL}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.border}
            >
              {lastRender.imageUrl ? (
                <img
                  src={lastRender.imageUrl}
                  alt="último render"
                  style={{ width:32, height:24, objectFit:'cover', borderRadius:3, flexShrink:0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div style={{
                  width:32, height:24, background:'rgba(255,255,255,0.06)', borderRadius:3,
                  flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <span style={{ fontSize:12 }}>🎬</span>
                </div>
              )}
              <div>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>ÚLTIMO RENDER</p>
                <p style={{ margin:0, fontSize:10, color: lastRender.count > 0 ? T.text : T.dim }}>
                  {lastRender.count > 0
                    ? (lastRender.createdAt ? fmtRelative(lastRender.createdAt) : lastRender.cenaNome ?? 'Ver')
                    : 'Nenhum ainda'}
                </p>
              </div>
            </div>

            {/* Last Prompt */}
            <div
              onClick={() => onNavigate('prompt')}
              style={{
                display:'flex', gap:7, alignItems:'center', cursor:'pointer',
                padding:'6px 10px', borderRadius:T.r.sm,
                background:T.surface, border:`1px solid ${T.border}`,
                transition:'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = T.border}
            >
              <span style={{ fontSize:18, flexShrink:0 }}>⚡</span>
              <div>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>ÚLTIMO PROMPT</p>
                <p style={{
                  margin:0, fontSize:10,
                  color: lastPrompt ? T.text : T.dim,
                  maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const,
                }}>
                  {lastPrompt
                    ? lastPrompt.name.slice(0, 14) + (lastPrompt.name.length > 14 ? '…' : '')
                    : 'Nenhum salvo'}
                </p>
              </div>
            </div>

            {/* Last AI */}
            <div style={{
              display:'flex', gap:7, alignItems:'center',
              padding:'6px 10px', borderRadius:T.r.sm,
              background:T.surface, border:`1px solid ${T.border}`,
            }}>
              <span style={{ fontSize:18, flexShrink:0 }}>🤖</span>
              <div>
                <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.06em' }}>ÚLTIMA IA</p>
                <p style={{ margin:0, fontSize:10, color:'rgba(167,139,250,0.8)' }}>Copilot ativo</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Project Score ── */}
        <div style={{ display:'flex', gap:12, alignItems:'center', flexShrink:0, flexWrap:'wrap' as const }}>

          {/* Score gauge */}
          <div style={{
            display:'flex', flexDirection:'column' as const, alignItems:'center', gap:5,
            padding:'10px 16px', borderRadius:T.r.md,
            background:`${score.color}10`, border:`1px solid ${score.color}30`,
          }}>
            <div style={{
              width:60, height:60, borderRadius:'50%',
              background:`conic-gradient(${score.color} ${score.total * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <div style={{
                width:44, height:44, borderRadius:'50%', background:T.sidebar,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <span style={{ fontSize:14, fontWeight:900, color:score.color }}>{score.total}</span>
              </div>
            </div>
            <p style={{ margin:0, fontSize:T.fs.xs, color:score.color, fontWeight:700 }}>{score.label}</p>
            <p style={{ margin:0, fontSize:8, color:T.dim }}>Project Score</p>
          </div>

          {/* Dimension bars */}
          <div style={{ display:'flex', flexDirection:'column' as const, gap:4, minWidth:130 }}>
            {score.dimensions.map(d => (
              <div key={d.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:8, color:T.dim, width:46, flexShrink:0, textAlign:'right' as const }}>{d.label}</span>
                <div style={{ flex:1, height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:3, transition:'width 0.6s ease',
                    width:`${(d.score / d.maxScore) * 100}%`,
                    background:d.color,
                  }}/>
                </div>
                <span style={{ fontSize:8, color:d.color, fontWeight:700, width:22, flexShrink:0 }}>
                  {d.score}/{d.maxScore}
                </span>
              </div>
            ))}
          </div>

          {/* Next action quick CTA */}
          <div style={{
            display:'flex', flexDirection:'column' as const, gap:6,
            padding:'10px 14px', borderRadius:T.r.md,
            background:'rgba(124,58,237,0.08)', border:`1px solid rgba(124,58,237,0.2)`,
            maxWidth:140,
          }}>
            <p style={{ margin:0, fontSize:8, color:T.dim, fontWeight:700, letterSpacing:'0.07em' }}>PRÓXIMA AÇÃO</p>
            <p style={{ margin:0, fontSize:10, color:'#fff', fontWeight:700, lineHeight:1.3 }}>{nextStepLabel}</p>
            <button
              onClick={() => onNavigate(nextStepModule)}
              style={{
                padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer',
                background:T.purple, color:'#fff', fontSize:10, fontWeight:800,
                alignSelf:'flex-start' as const,
              }}
            >
              Ir agora →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Intelligent Journey ──────────────────────────────────────────────────────
// 10-step checklist: auto-detected + click to navigate.

function IntelligentJourney({
  steps, onNavigate,
}: {
  steps:      JourneyStep[]
  onNavigate: (m: string) => void
}) {
  const doneCount  = steps.filter(s => s.done).length
  const currentIdx = steps.findIndex(s => !s.done)
  const pct        = Math.round((doneCount / steps.length) * 100)

  return (
    <div style={{
      padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
      border:`1px solid ${T.border}`, marginBottom:12,
    }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div>
          <p style={{ margin:'0 0 2px', fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>
            JORNADA INTELIGENTE
          </p>
          <p style={{ margin:0, fontSize:T.fs.xs, color:T.purpleL, fontWeight:700 }}>
            {doneCount}/{steps.length} etapas · {pct}% concluído
          </p>
        </div>
        {/* Mini gauge */}
        <div style={{
          width:42, height:42, borderRadius:'50%', flexShrink:0,
          background:`conic-gradient(${T.purple} ${pct * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            width:30, height:30, borderRadius:'50%', background:T.surface,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{ fontSize:9, fontWeight:900, color:T.purpleL }}>{pct}%</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:T.border, borderRadius:T.r.full, marginBottom:12, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${pct}%`, background:T.purple,
          borderRadius:T.r.full, transition:'width 0.5s ease',
        }}/>
      </div>

      {/* Steps — 2-column grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 8px' }}>
        {steps.map((step, i) => {
          const isCurrent = i === currentIdx
          const isDone    = step.done
          return (
            <div
              key={step.id}
              className={isCurrent ? 'px-journey-step px-current-step' : 'px-journey-step'}
              onClick={() => onNavigate(step.module)}
              style={{
                display:'flex', gap:8, alignItems:'center', padding:'7px 9px',
                borderRadius:T.r.sm, cursor:'pointer',
                background: isCurrent ? 'rgba(124,58,237,0.14)' : isDone ? 'rgba(74,222,128,0.04)' : 'transparent',
                border:`1px solid ${isCurrent ? T.purple : isDone ? 'rgba(74,222,128,0.2)' : 'transparent'}`,
              }}
            >
              {/* Status circle */}
              <div style={{
                width:20, height:20, borderRadius:'50%', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10, fontWeight:700,
                background: isDone    ? 'rgba(74,222,128,0.18)'  : isCurrent ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.04)',
                border:     `1px solid ${isDone ? T.green : isCurrent ? T.purple : T.border}`,
                color:      isDone    ? T.green  : isCurrent ? T.purpleL : T.dim,
              }}>
                {isDone ? '✓' : <span style={{ fontSize:8 }}>{i + 1}</span>}
              </div>

              {/* Label */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:11 }}>{step.icon}</span>
                  <p style={{
                    margin:0, fontSize:10,
                    fontWeight: isCurrent ? 700 : isDone ? 500 : 400,
                    color: isDone ? T.textSub : isCurrent ? '#fff' : T.dim,
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const,
                  }}>{step.label}</p>
                </div>
                {isCurrent && (
                  <p style={{ margin:'1px 0 0', fontSize:8, color:T.purpleL }}>▶ etapa atual</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Smart Panel ──────────────────────────────────────────────────────────────

function SmartPanel({
  arqState, journey, missing, healthReasons, onNavigate,
}: {
  arqState:     ArqProjectState
  journey:      JourneyStep[]
  missing:      string[]
  healthReasons:string[]
  onNavigate:   (m: string) => void
}) {
  const [tab, setTab] = useState<SmartTab>('workflow')

  const TABS: { id: SmartTab; icon: string; label: string; badge?: number }[] = [
    { id:'workflow',   icon:'🔄', label:'Fluxo'      },
    { id:'pendencias', icon:'📌', label:'Pendências', badge: missing.length     },
    { id:'sugestoes',  icon:'💡', label:'Sugestões'  },
    { id:'alertas',    icon:'⚠️', label:'Alertas',    badge: healthReasons.length },
  ]

  const suggestions = useMemo(() => {
    const s: string[] = []
    if (arqState.objects.length === 0)       s.push('Adicione objetos para ativar o AI Intelligence')
    if (arqState.materials.length === 0)     s.push('Cadastre materiais para calcular o Render Readiness')
    if (!arqState.projectMeta?.clienteNome)  s.push('Vincule um cliente para habilitar o CRM')
    if (arqState.objects.length > 0 && arqState.materials.length === 0)
      s.push('Projetos com objetos e materiais têm 3× mais precisão de render')
    if (arqState.materials.length >= 3)
      s.push('Você tem materiais suficientes para iniciar o Prompt Playground')
    if (s.length === 0) s.push('Continue adicionando dados para sugestões personalizadas')
    return s
  }, [arqState.objects.length, arqState.materials.length, arqState.projectMeta?.clienteNome])

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
            <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, color:T.dim, fontWeight:700 }}>JORNADA DO PROJETO</p>
            {journey.map((step, i) => {
              const doneCount  = journey.filter(s => s.done).length
              const currentIdx = journey.findIndex(s => !s.done)
              const current    = i === currentIdx
              const done       = step.done
              return (
                <div
                  key={step.id}
                  onClick={() => onNavigate(step.module)}
                  style={{
                    display:'flex', gap:8, alignItems:'center', padding:'6px 8px',
                    borderRadius:T.r.sm, marginBottom:2, cursor:'pointer',
                    background: current ? 'rgba(124,58,237,0.12)' : 'transparent',
                    border: `1px solid ${current ? T.purple : 'transparent'}`,
                  }}
                >
                  <div style={{
                    width:18, height:18, borderRadius:'50%', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:9, fontWeight:700,
                    background: done ? T.purple : current ? 'rgba(124,58,237,0.3)' : T.border,
                    color: done ? '#fff' : current ? T.purpleL : T.dim,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{
                      margin:0, fontSize:T.fs.xs,
                      color: done ? T.textSub : current ? '#fff' : T.dim,
                      fontWeight: current ? 700 : 400,
                    }}>
                      {step.icon} {step.label}
                    </p>
                    {current && <p style={{ margin:0, fontSize:8, color:T.purpleL }}>{step.desc}</p>}
                  </div>
                  {current && <span style={{ fontSize:8, color:T.purpleL }}>atual</span>}
                </div>
              )
              void doneCount
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

// ─── Empty Home ───────────────────────────────────────────────────────────────

function EmptyHome({ onNavigate }: { onNavigate: (m: string) => void }) {
  const features = [
    { icon:'🎬', label:'Renders com IA',    desc:'Gere renders fotorrealistas em minutos'        },
    { icon:'🤖', label:'Copilot de Obra',   desc:'Assistente especializado em arquitetura'       },
    { icon:'📚', label:'Biblioteca',         desc:'Materiais, componentes e fabricantes'          },
    { icon:'📊', label:'Project Score',      desc:'6 dimensões de saúde do projeto'               },
    { icon:'👤', label:'Portal do Cliente',  desc:'Compartilhe renders e aprove etapas'           },
    { icon:'📄', label:'Memorial e Orçamento', desc:'Geração automática com IA'                  },
  ]

  const journey = [
    { icon:'📋', label:'Briefing' }, { icon:'🏗️', label:'Projeto' }, { icon:'📚', label:'Biblioteca' },
    { icon:'⚡', label:'Prompt'   }, { icon:'🎬', label:'Render'  }, { icon:'🚀', label:'Entrega'    },
  ]

  return (
    <div style={{
      flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center',
      padding:'40px 24px', gap:32,
      background:'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 70%)',
    }}>
      {/* Branding */}
      <div style={{ textAlign:'center' as const }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🏛️</div>
        <h2 style={{ margin:'0 0 6px', fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-0.03em' }}>
          arqdor<span style={{ color:T.purpleL }}>.ai</span>
        </h2>
        <p style={{ margin:0, fontSize:14, color:T.textSub }}>
          Workspace de Arquitetura com Inteligência Artificial
        </p>
      </div>

      {/* Feature grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:540, width:'100%' }}>
        {features.map(f => (
          <div key={f.label} style={{
            padding:'14px', borderRadius:T.r.md, textAlign:'center' as const,
            background:T.surface, border:`1px solid ${T.border}`,
          }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{f.icon}</div>
            <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:700, color:'#fff' }}>{f.label}</p>
            <p style={{ margin:0, fontSize:10, color:T.dim, lineHeight:1.4 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Journey strip */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' as const, justifyContent:'center' }}>
        {journey.map((s, i, arr) => (
          <span key={s.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:9, color: i === 0 ? T.purpleL : T.dim, fontWeight: i === 0 ? 700 : 400 }}>
              {s.icon} {s.label}
            </span>
            {i < arr.length - 1 && <span style={{ color:T.border, fontSize:10 }}>›</span>}
          </span>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, justifyContent:'center' }}>
        <button
          onClick={() => onNavigate('projeto')}
          style={{
            padding:'12px 32px', borderRadius:T.r.md, border:'none', cursor:'pointer',
            background:`linear-gradient(135deg, ${T.purple} 0%, #5b21b6 100%)`,
            color:'#fff', fontSize:14, fontWeight:800,
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
  arqState:   ArqProjectState
  onNavigate: (module: string) => void
}) {
  const meta      = arqState.projectMeta
  const objects   = arqState.objects
  const materials = arqState.materials

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const lastRender = useLastRender()
  const lastPrompt = useMemo(() => getLastSavedVariation(), [])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const totalObj         = objects.length
  const totalMat         = materials.length
  const objWithMat       = objects.filter(o => o.material).length
  const matWithMfg       = materials.filter(m => m.manufacturer && m.manufacturer.trim().length > 0).length
  const componentsLinked = objects.filter(o => o.componentId).length
  const envCategories    = [...new Set(objects.map(o => o.category))].filter(Boolean).length

  // ── Project Score ──────────────────────────────────────────────────────────
  const score = useMemo(() => computeProjectScore({
    hasMeta:           !!meta,
    hasTipoObra:       !!meta?.tipoObra,
    hasAreaM2:         !!meta?.areaM2,
    hasClienteNome:    !!meta?.clienteNome,
    totalObj,
    totalMat,
    matWithMfg,
    componentsLinked,
    envCategories,
    hasSavedVariation: !!lastPrompt,
    renderCount:       lastRender.count,
  }), [meta, totalObj, totalMat, matWithMfg, componentsLinked, envCategories, lastPrompt, lastRender.count])

  // ── Health analysis ────────────────────────────────────────────────────────
  const healthReasons: string[] = []
  if (totalObj === 0)                        healthReasons.push('Nenhum objeto no projeto')
  if (totalMat === 0)                        healthReasons.push('Nenhum material definido')
  if (totalObj > 0 && objWithMat < totalObj) healthReasons.push(`${totalObj - objWithMat} objeto(s) sem material`)
  if (totalMat > 0 && matWithMfg < totalMat) healthReasons.push(`${totalMat - matWithMfg} material(is) sem fabricante`)
  if (!meta?.clienteNome)                    healthReasons.push('Cliente não vinculado')

  // ── Missing items for render ───────────────────────────────────────────────
  const missing: string[] = []
  if (totalObj === 0)                        missing.push('Adicionar objetos ao projeto')
  if (totalObj > 0 && objWithMat < totalObj) missing.push(`Definir material de ${totalObj - objWithMat} objeto(s)`)
  if (totalMat > 0 && matWithMfg < totalMat) missing.push(`Confirmar fabricante de ${totalMat - matWithMfg} material(is)`)
  if (totalMat === 0)                        missing.push('Cadastrar materiais e fabricantes')

  // ── Journey steps — 10-step auto-checklist ─────────────────────────────────
  const journeySteps: JourneyStep[] = [
    { id:'criar-projeto', icon:'🏗️', label:'Criar Projeto', module:'projeto',    desc:'Briefing + tipo de obra',   done: !!meta             },
    { id:'ambientes',     icon:'🏠', label:'Ambientes',      module:'projeto',    desc:'Tipos de espaço',           done: !!meta?.tipoObra   },
    { id:'biblioteca',    icon:'📚', label:'Biblioteca',     module:'biblioteca', desc:'Materiais e acabamentos',   done: totalMat > 0        },
    { id:'componentes',   icon:'🔩', label:'Componentes',    module:'biblioteca', desc:'Componentes vinculados',    done: componentsLinked > 0},
    { id:'prompt',        icon:'⚡', label:'Prompt',          module:'prompt',     desc:'Variação de prompt salva', done: !!lastPrompt        },
    { id:'render',        icon:'🎬', label:'Render',          module:'renders',    desc:'Primeiro render gerado',   done: lastRender.count > 0},
    { id:'revisao',       icon:'🔍', label:'Revisão',         module:'ai-review',  desc:'AI Review do render',      done: false               },
    { id:'portal',        icon:'👤', label:'Portal',          module:'cliente',    desc:'Portal do Cliente ativo',  done: !!meta?.clienteNome },
    { id:'memorial',      icon:'📄', label:'Memorial',        module:'prompt',     desc:'Memorial descritivo',      done: false               },
    { id:'entrega',       icon:'🚀', label:'Entrega',         module:'cliente',    desc:'Projeto entregue',         done: false               },
  ]

  // ── Next step ─────────────────────────────────────────────────────────────
  const nextStep = journeySteps.find(s => !s.done) ?? journeySteps[journeySteps.length - 1]

  // ── No project ─────────────────────────────────────────────────────────────
  if (!meta) {
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>
        <EmptyHome onNavigate={onNavigate} />
      </div>
    )
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="px-fade" style={{ height:'100%', display:'flex', flexDirection:'column' as const, overflow:'hidden', background:T.bg }}>
      <style>{CSS}</style>

      {/* Centro do Projeto */}
      <ProjectCenter
        arqState={arqState}
        score={score}
        lastRender={lastRender}
        lastPrompt={lastPrompt}
        nextStepLabel={nextStep.label}
        nextStepModule={nextStep.module}
        onNavigate={onNavigate}
      />

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Main area ── */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'14px 16px' }}>

          {/* Jornada Inteligente */}
          <IntelligentJourney steps={journeySteps} onNavigate={onNavigate} />

          {/* Quick stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
            {[
              { icon:'📦', label:'Objetos',    value: totalObj,   sub:`${objWithMat} c/ material`,   onClick: () => onNavigate('projeto')    },
              { icon:'🪵', label:'Materiais',  value: totalMat,   sub:`${matWithMfg} c/ fabricante`, onClick: () => onNavigate('biblioteca') },
              { icon:'🔩', label:'Componentes',value: componentsLinked, sub:'vinculados',            onClick: () => onNavigate('biblioteca') },
              { icon:'🎬', label:'Renders',    value: lastRender.count, sub:'gerados',              onClick: () => onNavigate('renders')    },
            ].map(card => (
              <div
                key={card.label}
                className="px-stat-card"
                onClick={card.onClick}
                style={{
                  padding:'12px 14px', borderRadius:T.r.lg,
                  background:T.surface, border:`1px solid ${T.border}`,
                  cursor:'pointer',
                }}
              >
                <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:14 }}>{card.icon}</span>
                  <span style={{ fontSize:T.fs.xs, color:T.dim, fontWeight:700, letterSpacing:'0.05em' }}>{card.label.toUpperCase()}</span>
                </div>
                <p style={{ margin:0, fontSize:22, fontWeight:900, color:'#fff', lineHeight:1 }}>{card.value}</p>
                <p style={{ margin:'3px 0 0', fontSize:T.fs.xs, color:T.dim }}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Score breakdown + Render Readiness */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 200px', gap:10 }}>
            {/* Score breakdown */}
            <div style={{
              padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
              border:`1px solid ${T.border}`,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <p style={{ margin:0, fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>
                  PROJECT SCORE — CRITÉRIOS
                </p>
                <span style={{ fontSize:T.fs.xs, color:score.color, fontWeight:700 }}>
                  {score.total}/100 · {score.label}
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px' }}>
                {score.dimensions.map(d => (
                  <div key={d.id}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:T.fs.xs, color:T.textSub }}>{d.label}</span>
                      <span style={{ fontSize:T.fs.xs, color:d.color, fontWeight:700 }}>{d.score}/{d.maxScore}</span>
                    </div>
                    <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:3, background:d.color, transition:'width 0.6s',
                        width:`${(d.score / d.maxScore) * 100}%`,
                      }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Render readiness gauge */}
            <div style={{
              padding:'14px 16px', background:T.surface, borderRadius:T.r.lg,
              border:`1px solid ${score.color}30`,
            }}>
              <p style={{ margin:'0 0 10px', fontSize:T.fs.xs, fontWeight:700, color:T.dim, letterSpacing:'0.07em' }}>
                RENDER READINESS
              </p>
              {(() => {
                const readiness = totalObj + totalMat === 0 ? 0
                  : Math.round(
                      (totalObj > 0 ? (objWithMat / totalObj) * 50 : 0) +
                      (totalMat > 0 ? (matWithMfg / totalMat) * 50 : 0)
                    )
                const rColor = readiness >= 85 ? T.green : readiness >= 65 ? T.blue : readiness >= 40 ? T.amber : T.red
                return (
                  <>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{
                        width:52, height:52, borderRadius:'50%', flexShrink:0,
                        background:`conic-gradient(${rColor} ${readiness * 3.6}deg, ${T.border} 0deg)`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        <div style={{
                          width:36, height:36, borderRadius:'50%', background:T.surface,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <span style={{ fontSize:11, fontWeight:900, color:rColor }}>{readiness}%</span>
                        </div>
                      </div>
                      <p style={{ margin:0, fontSize:T.fs.sm, fontWeight:700, color:rColor }}>
                        {readiness >= 85 ? 'Pronto' : readiness >= 65 ? 'Quase pronto' : readiness >= 40 ? 'Em prep.' : 'Insuficiente'}
                      </p>
                    </div>
                    {missing.length > 0 && (
                      <div style={{ marginTop:10 }}>
                        {missing.slice(0, 3).map((m, i) => (
                          <div key={i} style={{ display:'flex', gap:5, padding:'2px 0' }}>
                            <span style={{ color:T.amber, fontSize:9 }}>›</span>
                            <span style={{ fontSize:T.fs.xs, color:T.textSub }}>{m}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        </div>

        {/* ── Smart Panel ── */}
        <SmartPanel
          arqState={arqState}
          journey={journeySteps}
          missing={missing}
          healthReasons={healthReasons}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  )
}

// ─── Export nextAction helper (used by ArqWorkspace → ArqCopilot) ─────────────

export function computeNextAction(arqState: ArqProjectState, renderCount: number): string {
  if (!arqState.projectId || !arqState.projectMeta) return 'Criar um projeto para começar'
  if (!arqState.projectMeta.tipoObra)               return 'Definir o tipo de obra no Briefing'
  if (arqState.objects.length === 0)                return 'Adicionar objetos ao Projeto Inteligente'
  if (arqState.materials.length === 0)              return 'Cadastrar materiais na Biblioteca'
  if (!getLastSavedVariation())                     return 'Criar o primeiro prompt no Prompt Playground'
  if (renderCount === 0)                            return 'Gerar o primeiro render com IA'
  if (!arqState.projectMeta.clienteNome)            return 'Vincular o cliente e ativar o Portal'
  return 'Revisar com IA e compartilhar no Portal'
}
