// ─── KnowledgeModule — Sprint 7: Knowledge Engine ─────────────────────────────
// Base de conhecimento viva: dashboard, padrões, ranking e sugestões automáticas.

import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'
import { useArqProjectContext } from '../ArqWorkspace'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardData {
  totalProjects:  number
  totalRenders:   number
  approvalRate:   number
  avgRevisoes:    number
  avgAreaM2:      number
  topTipos:       { tipo: string; count: number }[]
  topTags:        { tag: string; tipo: string; count: number; score: number }[]
  topFabricantes: { name: string; count: number }[]
  topMateriais:   { nome: string; count: number; categoria: string }[]
}

interface Pattern {
  id: string; tipo: string; categoria: string | null; fabricante: string | null
  tipoPattern: string; count: number; approvalRate: number; tags: string[]
}

interface Ranking {
  key: string; kind: string; tipo: string; combo: string
  count: number; approvalRate: number; score: number
}

interface Suggestions {
  basedOnProjects: number; tipo: string
  materiais:       { nome: string; count: number; categoria: string }[]
  fabricantes:     { nome: string; count: number }[]
  prompts:         string[]
  tags:            { tag: string; count: number }[]
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes ke-fadeIn  { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
  @keyframes ke-pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .ke-card { animation: ke-fadeIn 0.3s ease both; transition: border-color 0.15s, transform 0.15s !important; }
  .ke-card:hover { border-color: rgba(124,58,237,0.3) !important; transform: translateY(-1px) !important; }
  .ke-tab { transition: all 0.15s !important; cursor: pointer; }
  .ke-bar { transition: width 0.5s ease !important; }
  .ke-tag { transition: background 0.13s !important; cursor: default; }
  .ke-extract { transition: background 0.15s !important; cursor: pointer; }
  .ke-extract:hover { background: rgba(124,58,237,0.25) !important; }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TIPO_TAG_COLORS: Record<string, string> = {
  tipo_obra:  '#60a5fa',
  material:   '#34d399',
  fabricante: '#fbbf24',
  padrao:     '#a78bfa',
  porte:      '#f472b6',
  status:     '#4ade80',
  geral:      '#6b7280',
}

function tagColor(tipo: string) { return TIPO_TAG_COLORS[tipo] ?? '#6b7280' }

function MetricCard({ icon, label, value, sub, color = T.purple }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface, flex:1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
        <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.08em' }}>{label}</p>
      </div>
      <p style={{ margin:0, fontSize:28, fontWeight:900, color }}>{value}</p>
      {sub && <p style={{ margin:'2px 0 0', fontSize:10, color:T.dim }}>{sub}</p>}
    </div>
  )
}

function HBar({ label, value, max, color = T.purple }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom:7 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
        <span style={{ fontSize:10, color:T.text }}>{label}</span>
        <span style={{ fontSize:9, fontWeight:700, color }}>{value}×</span>
      </div>
      <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
        <div className="ke-bar" style={{ height:'100%', width:`${pct}%`, borderRadius:3, background:color }} />
      </div>
    </div>
  )
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ data, onExtract, extracting }: { data: DashboardData | null; onExtract: () => void; extracting: boolean }) {
  if (!data) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
        <span style={{ fontSize:36, animation:'ke-pulse 1.5s infinite' }}>🧠</span>
        <p style={{ margin:0, fontSize:13, color:T.dim }}>Carregando base de conhecimento…</p>
      </div>
    )
  }

  const maxTipo = Math.max(...data.topTipos.map(t => t.count), 1)
  const maxFab  = Math.max(...data.topFabricantes.map(f => f.count), 1)
  const maxMat  = Math.max(...data.topMateriais.map(m => m.count), 1)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:14 }}>

      {/* Metric cards row */}
      <div style={{ display:'flex', gap:10 }}>
        <MetricCard icon="📁" label="PROJETOS ANALISADOS" value={data.totalProjects} color={T.purpleL} />
        <MetricCard icon="🎨" label="RENDERS GERADOS"     value={data.totalRenders}  color={T.blue}    sub={`${data.approvalRate}% aprovados`} />
        <MetricCard icon="✅" label="TAXA DE APROVAÇÃO"   value={`${data.approvalRate}%`} color={T.green}   sub={`${data.avgRevisoes} revisões/projeto`} />
        <MetricCard icon="📐" label="ÁREA MÉDIA"          value={`${data.avgAreaM2}m²`}  color={T.amber} />
      </div>

      {/* Main 3-column grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>

        {/* Tipos de obra */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.08em' }}>🏗️ TIPOS DE OBRA</p>
          {data.topTipos.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum projeto com tipo definido</p>
            : data.topTipos.map(t => <HBar key={t.tipo} label={t.tipo ?? ''} value={t.count} max={maxTipo} color={T.blue} />)
          }
        </div>

        {/* Top fabricantes */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.08em' }}>🏭 TOP FABRICANTES</p>
          {data.topFabricantes.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum fabricante cadastrado</p>
            : data.topFabricantes.slice(0, 8).map(f => <HBar key={f.name} label={f.name} value={f.count} max={maxFab} color={T.amber} />)
          }
        </div>

        {/* Top materiais */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.08em' }}>🪨 TOP MATERIAIS</p>
          {data.topMateriais.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum material no catálogo</p>
            : data.topMateriais.slice(0, 8).map(m => <HBar key={m.nome} label={m.nome} value={m.count} max={maxMat} color={T.green} />)
          }
        </div>
      </div>

      {/* Tag Cloud */}
      <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <p style={{ margin:0, fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.08em' }}>🏷️ PADRÕES IDENTIFICADOS AUTOMATICAMENTE</p>
          <button onClick={onExtract} className="ke-extract" disabled={extracting} style={{
            marginLeft:'auto', padding:'4px 12px', borderRadius:7, border:`1px solid ${T.border}`,
            background:'rgba(124,58,237,0.12)', color:T.purpleL, fontSize:9, fontWeight:700, cursor:'pointer',
          }}>
            {extracting ? '⚙ Extraindo…' : '↻ Atualizar Base'}
          </button>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap' as const, gap:5 }}>
          {data.topTags.map(t => {
            const c = tagColor(t.tipo)
            const fontSize = 8 + Math.min(t.count * 1.5, 5)
            return (
              <span key={t.tag} className="ke-tag" style={{
                padding:`${t.count > 2 ? 4 : 3}px ${t.count > 2 ? 10 : 8}px`,
                borderRadius:10, fontSize, fontWeight:t.count > 2 ? 700 : 500,
                background:`${c}14`, color:c, border:`1px solid ${c}25`,
              }}>
                {t.tag} <span style={{ opacity:0.6 }}>×{t.count}</span>
              </span>
            )
          })}
          {data.topTags.length === 0 && <p style={{ fontSize:11, color:T.dim, margin:0 }}>Extraia o conhecimento para ver os padrões</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Padrões Tab ──────────────────────────────────────────────────────────────
function PadroesTab({ patterns }: { patterns: Pattern[] }) {
  const [filter, setFilter] = useState('todos')

  const filtered = filter === 'todos' ? patterns : patterns.filter(p => p.tipoPattern === filter)

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
      {/* Filter */}
      <div style={{ display:'flex', gap:6, marginBottom:12 }}>
        {[{id:'todos',label:'Todos'},{id:'material',label:'Material'},{id:'fabricante',label:'Fabricante'}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding:'4px 12px', borderRadius:8, border:`1px solid ${filter===f.id?T.purple:T.border}`,
            background:filter===f.id?'rgba(124,58,237,0.18)':'transparent',
            color:filter===f.id?T.purpleL:T.dim, fontSize:10, fontWeight:700, cursor:'pointer',
          }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length} padrões</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center' as const, padding:'32px 16px' }}>
          <span style={{ fontSize:32, opacity:0.3 }}>🔍</span>
          <p style={{ margin:'8px 0 0', fontSize:12, color:T.dim }}>Nenhum padrão encontrado. Extraia o conhecimento no Dashboard.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8 }}>
          {filtered.map(p => {
            const approvalColor = p.approvalRate >= 70 ? T.green : p.approvalRate >= 40 ? T.amber : T.red
            return (
              <div key={p.id} className="ke-card" style={{ padding:'12px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <span style={{ fontSize:8, fontWeight:800, padding:'2px 7px', borderRadius:8, background:'rgba(124,58,237,0.12)', color:T.purpleL }}>
                    {p.tipo}
                  </span>
                  <span style={{ fontSize:8, fontWeight:800, padding:'2px 7px', borderRadius:8, background:`${approvalColor}12`, color:approvalColor }}>
                    {p.approvalRate}% ✅
                  </span>
                </div>
                <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:800, color:'#fff' }}>
                  {p.categoria ?? p.fabricante ?? 'Padrão'}
                </p>
                <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{p.count}× em projetos · {p.tipoPattern === 'fabricante' ? '🏭 Fabricante' : '🪨 Material'}</p>
                {p.tags.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap' as const, gap:3 }}>
                    {p.tags.slice(0,4).map(t => (
                      <span key={t} style={{ fontSize:7, padding:'1px 5px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.dim }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Ranking Tab ──────────────────────────────────────────────────────────────
function RankingTab({ ranking }: { ranking: Ranking[] }) {
  const medals: Record<number, string> = { 0:'🥇', 1:'🥈', 2:'🥉' }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
      <p style={{ margin:'0 0 12px', fontSize:10, color:T.dim }}>
        Combinações de tipo de obra × fabricante/material ranqueadas por <strong style={{ color:T.purpleL }}>taxa de aprovação (70%) + frequência (30%)</strong>.
      </p>
      {ranking.length === 0 ? (
        <div style={{ textAlign:'center' as const, padding:'32px 16px' }}>
          <span style={{ fontSize:32, opacity:0.3 }}>🏆</span>
          <p style={{ margin:'8px 0 0', fontSize:12, color:T.dim }}>Extraia o conhecimento para ver o ranking.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {ranking.map((r, idx) => {
            const approvalColor = r.approvalRate >= 70 ? T.green : r.approvalRate >= 40 ? T.amber : T.red
            const scoreBar = Math.min(r.score, 100)
            return (
              <div key={r.key} className="ke-card" style={{ padding:'12px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:idx < 3 ? 22 : 14, width:28, textAlign:'center' as const, flexShrink:0 }}>
                  {medals[idx] ?? `#${idx+1}`}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:9, padding:'2px 7px', borderRadius:7, background:'rgba(124,58,237,0.1)', color:T.purpleL, fontWeight:700 }}>{r.tipo}</span>
                    <span style={{ fontSize:9, color:T.dim }}>·</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                      {r.kind === 'fab' ? '🏭 ' : '🪨 '}{r.combo}
                    </span>
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
                    <div className="ke-bar" style={{ height:'100%', width:`${scoreBar}%`, background:`linear-gradient(90deg, ${T.purple}, ${T.purpleL})`, borderRadius:2 }} />
                  </div>
                </div>
                <div style={{ textAlign:'right' as const, flexShrink:0 }}>
                  <p style={{ margin:0, fontSize:14, fontWeight:900, color:approvalColor }}>{r.approvalRate}%</p>
                  <p style={{ margin:0, fontSize:8, color:T.dim }}>{r.count}× · score {r.score}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Sugestões Tab ────────────────────────────────────────────────────────────
function SugestoesTab({ suggestions }: { suggestions: Suggestions | null }) {
  if (!suggestions) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <p style={{ fontSize:12, color:T.dim }}>Carregando sugestões…</p>
      </div>
    )
  }

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* Context banner */}
      <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(124,58,237,0.08)', border:`1px solid rgba(124,58,237,0.2)` }}>
        <p style={{ margin:0, fontSize:11, color:T.textSub }}>
          🧠 Baseado em <strong style={{ color:'#fff' }}>{suggestions.basedOnProjects}</strong> projeto(s) similar(es)
          {suggestions.tipo !== 'geral' && <> do tipo <strong style={{ color:T.purpleL }}>{suggestions.tipo}</strong></>}.
          O conhecimento gerado automaticamente melhora sugestões para novos projetos.
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* Materiais sugeridos */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.07em' }}>🪨 MATERIAIS RECOMENDADOS</p>
          {suggestions.materiais.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum padrão identificado ainda</p>
            : suggestions.materiais.map((m, i) => (
              <div key={m.nome} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'6px 8px', borderRadius:7, background:'rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize:11, color:T.green, fontWeight:700, width:16, textAlign:'center' as const }}>{i+1}</span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#fff' }}>{m.nome}</p>
                  <p style={{ margin:0, fontSize:9, color:T.dim }}>{m.categoria} · {m.count}× usado</p>
                </div>
              </div>
            ))
          }
        </div>

        {/* Fabricantes sugeridos */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.07em' }}>🏭 FABRICANTES RECOMENDADOS</p>
          {suggestions.fabricantes.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum fabricante identificado ainda</p>
            : suggestions.fabricantes.map((f, i) => (
              <div key={f.nome} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'6px 8px', borderRadius:7, background:'rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize:11, color:T.amber, fontWeight:700, width:16, textAlign:'center' as const }}>{i+1}</span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#fff' }}>{f.nome}</p>
                  <p style={{ margin:0, fontSize:9, color:T.dim }}>{f.count}× em projetos similares</p>
                </div>
              </div>
            ))
          }
        </div>

        {/* Tags sugeridas */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.07em' }}>🏷️ TAGS RELEVANTES</p>
          <div style={{ display:'flex', flexWrap:'wrap' as const, gap:5 }}>
            {suggestions.tags.length === 0
              ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhuma tag disponível</p>
              : suggestions.tags.map(t => (
                <span key={t.tag} style={{ padding:'3px 9px', borderRadius:9, fontSize:10, fontWeight:600, background:'rgba(167,139,250,0.1)', color:T.purpleL, border:`1px solid rgba(167,139,250,0.15)` }}>
                  {t.tag} <span style={{ opacity:0.6 }}>×{t.count}</span>
                </span>
              ))
            }
          </div>
        </div>

        {/* Prompts sugeridos */}
        <div className="ke-card" style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:'0 0 10px', fontSize:10, fontWeight:800, color:T.dim, letterSpacing:'0.07em' }}>✨ PROMPTS UTILIZADOS</p>
          {suggestions.prompts.length === 0
            ? <p style={{ fontSize:11, color:T.dim, margin:0 }}>Nenhum prompt registrado ainda</p>
            : suggestions.prompts.map((p, i) => (
              <div key={i} style={{ marginBottom:6, padding:'6px 9px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
                <p style={{ margin:0, fontSize:10, color:T.textSub, lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', WebkitLineClamp:2, display:'-webkit-box', WebkitBoxOrient:'vertical' as const }}>
                  "{p}"
                </p>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ─── Main Module ──────────────────────────────────────────────────────────────
export function KnowledgeModule() {
  const arqState  = useArqProjectContext()
  const projectId = arqState?.projectId ?? undefined

  const [tab,         setTab]         = useState<'dashboard'|'padroes'|'ranking'|'sugestoes'>('dashboard')
  const [dashboard,   setDashboard]   = useState<DashboardData | null>(null)
  const [patterns,    setPatterns]    = useState<Pattern[]>([])
  const [ranking,     setRanking]     = useState<Ranking[]>([])
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [extracting,  setExtracting]  = useState(false)

  const fetchDashboard = useCallback(async () => {
    const res = await fetch(`${BASE}/arch/knowledge/dashboard`, { headers: authHeaders() })
    if (res.ok) setDashboard(await res.json())
  }, [])

  const fetchPatterns = useCallback(async () => {
    const res = await fetch(`${BASE}/arch/knowledge/patterns`, { headers: authHeaders() })
    if (res.ok) setPatterns(await res.json())
  }, [])

  const fetchRanking = useCallback(async () => {
    const res = await fetch(`${BASE}/arch/knowledge/ranking`, { headers: authHeaders() })
    if (res.ok) setRanking(await res.json())
  }, [])

  const fetchSuggestions = useCallback(async () => {
    const url = projectId
      ? `${BASE}/arch/knowledge/suggestions?projectId=${projectId}`
      : `${BASE}/arch/knowledge/suggestions`
    const res = await fetch(url, { headers: authHeaders() })
    if (res.ok) setSuggestions(await res.json())
  }, [projectId])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchDashboard(), fetchPatterns(), fetchRanking(), fetchSuggestions()])
    setLoading(false)
  }, [fetchDashboard, fetchPatterns, fetchRanking, fetchSuggestions])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleExtract() {
    setExtracting(true)
    await fetch(`${BASE}/arch/knowledge/extract`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' } })
    await fetchAll()
    setExtracting(false)
  }

  const TABS = [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'padroes',   icon:'🧩', label:'Padrões'   },
    { id:'ranking',   icon:'🏆', label:'Ranking'   },
    { id:'sugestoes', icon:'💡', label:'Sugestões' },
  ] as const

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', background:T.bg }}>
      <style>{CSS}</style>

      {/* ── TOP BAR ── */}
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, background:T.sidebar }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div>
            <p style={{ margin:0, fontSize:15, fontWeight:900, color:'#fff' }}>🧠 Knowledge Engine</p>
            <p style={{ margin:0, fontSize:10, color:T.dim }}>Base de conhecimento viva — aprende com cada projeto</p>
          </div>
          <div style={{ flex:1 }} />
          {projectId && (
            <span style={{ fontSize:9, padding:'3px 8px', borderRadius:7, background:'rgba(74,222,128,0.1)', color:T.green, border:`1px solid rgba(74,222,128,0.2)` }}>
              📁 Projeto ativo
            </span>
          )}
          {/* Tabs */}
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="ke-tab" style={{
              padding:'5px 12px', borderRadius:7, border:`1px solid ${tab===t.id?T.purple:T.border}`,
              background:tab===t.id?'rgba(124,58,237,0.18)':'transparent',
              color:tab===t.id?T.purpleL:T.dim, fontSize:10, fontWeight:700, cursor:'pointer',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
          <button onClick={handleExtract} disabled={extracting} className="ke-extract" style={{
            padding:'5px 14px', borderRadius:7, border:`1px solid rgba(124,58,237,0.35)`,
            background:'rgba(124,58,237,0.12)', color:T.purpleL, fontSize:10, fontWeight:700, cursor:'pointer', opacity:extracting?0.6:1,
          }}>
            {extracting ? '⚙ Extraindo…' : '↻ Extrair'}
          </button>
        </div>
      </div>

      {/* ── CONTENT ── */}
      {loading ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
          <span style={{ fontSize:36, animation:'ke-pulse 1.5s infinite' }}>🧠</span>
          <p style={{ margin:0, fontSize:12, color:T.dim }}>Analisando projetos…</p>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {tab === 'dashboard' && <DashboardTab data={dashboard} onExtract={handleExtract} extracting={extracting} />}
          {tab === 'padroes'   && <PadroesTab   patterns={patterns} />}
          {tab === 'ranking'   && <RankingTab    ranking={ranking} />}
          {tab === 'sugestoes' && <SugestoesTab  suggestions={suggestions} />}
        </div>
      )}
    </div>
  )
}
