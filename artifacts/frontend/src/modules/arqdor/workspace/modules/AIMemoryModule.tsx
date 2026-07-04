import { useState, useEffect } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface AieSnapshot {
  projetoId:       string
  overallScore:    number | null
  createdAt:       string
  projectSnapshot: Record<string, unknown> | null
}

interface LearningData {
  snapshots: AieSnapshot[]
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 85 ? '#4ade80' : value >= 70 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:4, borderRadius:2, background:'rgba(255,255,255,0.08)' }}>
        <div style={{ height:'100%', width:`${Math.min(value,100)}%`, borderRadius:2, background:color, transition:'width 0.4s' }}/>
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, width:32, textAlign:'right' as const }}>{Math.round(value)}</span>
    </div>
  )
}

function extractInsights(snap: AieSnapshot): { key: string; value: string; icon: string }[] {
  const ps = snap.projectSnapshot as Record<string, unknown> | null
  if (!ps) return []
  const insights: { key: string; value: string; icon: string }[] = []
  if (ps.dna) {
    const dna = ps.dna as Record<string, unknown>
    if (dna.estilo)     insights.push({ key:'Estilo',      value:String(dna.estilo),     icon:'✨' })
    if (dna.iluminacao) insights.push({ key:'Iluminação',  value:String(dna.iluminacao), icon:'💡' })
    if (dna.materiais)  insights.push({ key:'Materiais',   value:String(dna.materiais),  icon:'🎨' })
  }
  if (ps.renderGoal)    insights.push({ key:'Objetivo',    value:String(ps.renderGoal),  icon:'🎯' })
  if (ps.cameraAngle)   insights.push({ key:'Câmera',      value:String(ps.cameraAngle), icon:'📷' })
  return insights.slice(0, 5)
}

export function AIMemoryModule() {
  const [data,    setData]    = useState<LearningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [selIdx,  setSelIdx]  = useState(0)

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`${BASE}/arq/learning`, { headers: authHeaders() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: LearningData = await res.json()
        setData(json)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar memória IA')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const snapshots = data?.snapshots ?? []
  const grouped = snapshots.reduce<Record<string, AieSnapshot[]>>((acc, s) => {
    if (!acc[s.projetoId]) acc[s.projetoId] = []
    acc[s.projetoId].push(s)
    return acc
  }, {})
  const projectIds = Object.keys(grouped)
  const selProject = projectIds[selIdx] ?? null
  const selSnaps   = selProject ? grouped[selProject] ?? [] : []
  const lastSnap   = selSnaps[0] ?? null
  const avgScore   = selSnaps.length > 0
    ? selSnaps.reduce((acc, s) => acc + (s.overallScore ?? 0), 0) / selSnaps.length
    : 0

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🧠 Memória IA</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>Histórico de aprendizado por projeto — snapshots do AIE</p>
        </div>
        {!loading && snapshots.length > 0 && (
          <span style={{ padding:'3px 10px', borderRadius:8, fontSize:10, background:'rgba(74,222,128,0.1)', color:'#4ade80', fontWeight:700 }}>
            {snapshots.length} snapshot(s)
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding:'8px 20px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      {loading && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' as const, gap:12, color:T.dim }}>
          <div style={{ width:36, height:36, borderRadius:'50%', border:`3px solid rgba(124,58,237,0.2)`, borderTop:`3px solid ${T.purple}`, animation:'spin 1s linear infinite' }}/>
          <span style={{ fontSize:12 }}>Carregando memória IA…</span>
        </div>
      )}

      {!loading && snapshots.length === 0 && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', color:T.dim, gap:12 }}>
          <p style={{ fontSize:32, margin:0 }}>🧠</p>
          <p style={{ fontSize:13, fontWeight:700, color:T.text, margin:0 }}>Nenhum dado de aprendizado ainda</p>
          <p style={{ fontSize:11, margin:0, textAlign:'center' as const, maxWidth:340 }}>
            A memória IA é alimentada pelos snapshots do AIE Dashboard.
            Abra um projeto, rode o AIE e salve um snapshot para iniciar o aprendizado.
          </p>
        </div>
      )}

      {!loading && projectIds.length > 0 && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* Project list */}
          <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${T.border}`, overflowY:'auto' as const, padding:'10px 12px' }}>
            <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PROJETOS COM DADOS</p>
            {projectIds.map((pid, idx) => {
              const snaps = grouped[pid] ?? []
              const avg   = snaps.length > 0 ? snaps.reduce((a,s)=>a+(s.overallScore??0),0)/snaps.length : 0
              const color = avg>=85?'#4ade80':avg>=70?'#fbbf24':'#f87171'
              return (
                <div key={pid} onClick={()=>setSelIdx(idx)} style={{
                  borderRadius:8, padding:'10px 12px', marginBottom:8, cursor:'pointer',
                  background:selIdx===idx?'rgba(124,58,237,0.12)':'rgba(255,255,255,0.03)',
                  border:`1px solid ${selIdx===idx?'rgba(124,58,237,0.35)':T.border}`,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:18 }}>🏗️</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:10, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                        {pid.slice(0, 16)}…
                      </p>
                    </div>
                    {avg > 0 && (
                      <span style={{ fontSize:11, fontWeight:800, color }}>{Math.round(avg)}</span>
                    )}
                  </div>
                  <p style={{ margin:0, fontSize:9, color:T.dim }}>{snaps.length} snapshot(s)</p>
                </div>
              )
            })}
          </div>

          {/* Detail */}
          <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
            {lastSnap && (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>🏗️</span>
                  <div>
                    <h3 style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>
                      {selProject?.slice(0, 24)}…
                    </h3>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, background:'rgba(167,139,250,0.15)', color:'#a78bfa' }}>
                        {selSnaps.length} snapshot(s)
                      </span>
                      <span style={{ fontSize:10, color:T.dim }}>Último: {new Date(lastSnap.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                {/* Score trend */}
                <div style={{ padding:'16px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:16 }}>
                  <p style={{ margin:'0 0 10px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>SCORE MÉDIO AIE</p>
                  <ScoreBar value={avgScore}/>
                  <p style={{ margin:'8px 0 0', fontSize:10, color:T.dim }}>Baseado em {selSnaps.length} snapshot(s)</p>
                </div>

                {/* Score history */}
                {selSnaps.length > 1 && (
                  <div style={{ marginBottom:16 }}>
                    <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>EVOLUÇÃO</p>
                    {selSnaps.slice(0, 5).map((s, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:9, color:T.dim, width:80, flexShrink:0 }}>
                          {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <div style={{ flex:1 }}>
                          <ScoreBar value={s.overallScore ?? 0}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Insights from last snapshot */}
                {(() => {
                  const insights = extractInsights(lastSnap)
                  if (insights.length === 0) return null
                  return (
                    <div style={{ marginBottom:16 }}>
                      <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PREFERÊNCIAS DETECTADAS</p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8 }}>
                        {insights.map(ins => (
                          <div key={ins.key} style={{ borderRadius:8, border:'1px solid rgba(167,139,250,0.2)', background:'rgba(167,139,250,0.05)', padding:'8px 10px' }}>
                            <p style={{ margin:'0 0 2px', fontSize:9, fontWeight:700, color:'#a78bfa', letterSpacing:'0.05em' }}>{ins.icon} {ins.key}</p>
                            <p style={{ margin:0, fontSize:11, color:'#fff', fontStyle:'italic' }}>"{ins.value}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(124,58,237,0.07)', border:`1px solid rgba(124,58,237,0.2)` }}>
                  <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:T.purpleL, letterSpacing:'0.06em' }}>💡 COMO A MEMÓRIA FUNCIONA</p>
                  <p style={{ margin:0, fontSize:11, color:T.dim, lineHeight:1.6 }}>
                    A cada snapshot salvo no AIE Dashboard, o sistema registra o estado completo do projeto — estilo, DNA, materiais, scores.
                    Use esses dados para entender a evolução do projeto e pré-configurar futuros projetos similares.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
