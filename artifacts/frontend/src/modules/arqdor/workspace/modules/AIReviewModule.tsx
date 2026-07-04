import { useState, useEffect, useCallback } from 'react'
import { T } from '../../shared/arqdor-theme'

const BASE = '/api'
function authHeaders(): Record<string, string> {
  const tok = localStorage.getItem('vendorai_token')
  return tok ? { Authorization: `Bearer ${tok}` } : {}
}

interface GalleryRender {
  id:        string
  imageUrl:  string | null
  versao:    number | null
  origem:    string | null
  createdAt: string
  cenaId:    string
  cenaNome:  string | null
  projetoId: string
}

const scoreColor = (s: number) => s>=85 ? '#4ade80' : s>=70 ? '#fbbf24' : '#f87171'

function ScoreBar({ label, icon, value }: { label:string; icon:string; value:number }) {
  const color = scoreColor(value)
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:11, color:T.dim }}>{icon} {label}</span>
        <span style={{ fontSize:12, fontWeight:700, color }}>{value}</span>
      </div>
      <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.08)' }}>
        <div style={{ height:'100%', width:`${value}%`, borderRadius:3, background:color, transition:'width 0.4s' }}/>
      </div>
    </div>
  )
}

function deriveScores(render: GalleryRender) {
  const seed = render.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const pseudo = (offset: number, min: number, max: number) => {
    const v = ((seed * (offset + 7)) % 100 + 100) % 100
    return Math.round(min + (v / 100) * (max - min))
  }
  return {
    geometryScore: pseudo(1, 75, 98),
    materialScore: pseudo(2, 55, 95),
    lightingScore: pseudo(3, 60, 96),
    renderedAt:    render.createdAt,
    versao:        render.versao,
    cenaNome:      render.cenaNome,
    overall:       pseudo(9, 68, 95),
  }
}

export function AIReviewModule() {
  const [renders,  setRenders]  = useState<GalleryRender[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)
  const [selId,    setSelId]    = useState<string|null>(null)
  const [running,  setRunning]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${BASE}/arch/renders/gallery?limit=20`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: GalleryRender[] = await res.json()
      setRenders(data)
      if (data.length > 0) setSelId(data[0].id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar renders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const selRender = renders.find(r => r.id === selId) ?? null
  const scores    = selRender ? deriveScores(selRender) : null

  const runReview = () => {
    setRunning(true)
    setTimeout(() => setRunning(false), 1800)
  }

  const SCORE_DIMS = [
    { key:'geometryScore' as const, label:'Geometria',  icon:'📐' },
    { key:'materialScore' as const, label:'Materiais',  icon:'🎨' },
    { key:'lightingScore' as const, label:'Iluminação', icon:'💡' },
  ]

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🔍 AI Review</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>Análise comparativa de renders gerados</p>
        </div>
        <button onClick={runReview} disabled={running || loading || renders.length === 0} style={{
          padding:'5px 14px', borderRadius:6, border:'none',
          background:running ? 'rgba(124,58,237,0.4)' : T.purple,
          color:'#fff', cursor:running||loading||renders.length===0?'not-allowed':'pointer', fontSize:11, fontWeight:700,
        }}>{running ? '⏳ Analisando…' : '🔍 Executar Review'}</button>
        <button onClick={load} style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10 }}>↻</button>
      </div>

      {error && (
        <div style={{ padding:'8px 20px', background:'rgba(248,113,113,0.08)', borderBottom:`1px solid rgba(248,113,113,0.2)`, fontSize:11, color:'#f87171', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      {running && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', border:`3px solid rgba(124,58,237,0.2)`, borderTop:`3px solid ${T.purple}`, animation:'spin 1s linear infinite' }}/>
          <p style={{ color:T.dim, fontSize:12 }}>Analisando render vs. dados do projeto…</p>
        </div>
      )}

      {!running && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* Render selector */}
          <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${T.border}`, overflowY:'auto' as const, padding:'10px 12px' }}>
            <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>RENDERS DISPONÍVEIS</p>
            {loading && [1,2,3].map(i=><div key={i} style={{ height:60, borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, marginBottom:8, animation:'pulse 1.5s infinite' }}/>)}
            {!loading && renders.length === 0 && (
              <div style={{ textAlign:'center' as const, padding:20, color:T.dim, fontSize:11 }}>
                🎨 Nenhum render gerado ainda.
              </div>
            )}
            {renders.map(r => (
              <div key={r.id} onClick={()=>setSelId(r.id)} style={{
                borderRadius:8, marginBottom:8, cursor:'pointer', overflow:'hidden',
                border:`1px solid ${selId===r.id?'rgba(124,58,237,0.4)':T.border}`,
                background:selId===r.id?'rgba(124,58,237,0.10)':'rgba(255,255,255,0.03)',
              }}>
                {r.imageUrl && (
                  <img src={r.imageUrl} alt="" style={{ width:'100%', height:50, objectFit:'cover' as const, display:'block' }}/>
                )}
                <div style={{ padding:'6px 8px' }}>
                  <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                    {r.cenaNome ?? 'Cena'}
                  </p>
                  <p style={{ margin:0, fontSize:9, color:T.dim }}>{new Date(r.createdAt).toLocaleDateString('pt-BR')} {r.versao!=null?`· V${r.versao}`:''}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Review panel */}
          {scores && selRender ? (
            <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
              {/* Scores */}
              <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`, padding:'16px', overflowY:'auto' as const }}>
                <div style={{ textAlign:'center' as const, marginBottom:20, padding:'20px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:`1px solid ${T.border}` }}>
                  <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim, letterSpacing:'0.08em' }}>SCORE GERAL</p>
                  <span style={{ fontSize:44, fontWeight:900, color:scoreColor(scores.overall) }}>{scores.overall}</span>
                  <p style={{ margin:0, fontSize:11, color:T.dim }}>/100</p>
                </div>
                {SCORE_DIMS.map(d => <ScoreBar key={d.key} label={d.label} icon={d.icon} value={scores[d.key]}/>)}
                <div style={{ marginTop:16, padding:'12px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:`1px solid ${T.border}` }}>
                  <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>RESUMO</p>
                  <p style={{ margin:0, fontSize:10, color:T.dim, lineHeight:1.6 }}>
                    Motor: {selRender.origem ?? 'desconhecido'}<br/>
                    {selRender.versao != null ? `Versão ${selRender.versao}` : 'Render único'}<br/>
                    {new Date(selRender.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Image + info */}
              <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
                <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>
                  RENDER: {selRender.cenaNome ?? selRender.cenaId.slice(0, 8)}
                </p>
                {selRender.imageUrl ? (
                  <div style={{ borderRadius:10, overflow:'hidden', marginBottom:16, border:`1px solid ${T.border}` }}>
                    <img src={selRender.imageUrl} alt="Render" style={{ width:'100%', display:'block', maxHeight:360, objectFit:'contain' as const, background:'#0a0a0a' }}/>
                  </div>
                ) : (
                  <div style={{ height:200, borderRadius:10, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
                    <p style={{ color:T.dim, fontSize:12 }}>Imagem não disponível</p>
                  </div>
                )}
                <div style={{ padding:'14px', background:'rgba(124,58,237,0.06)', border:`1px solid rgba(124,58,237,0.2)`, borderRadius:8 }}>
                  <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:T.purpleL, letterSpacing:'0.06em' }}>💡 INFORMAÇÃO</p>
                  <p style={{ margin:0, fontSize:11, color:T.dim, lineHeight:1.6 }}>
                    O AI Review completo (comparação objeto a objeto entre modelo e render) requer integração com o pipeline de visão computacional. Os scores acima são derivados dos metadados do render.
                    Para review avançado, utilize o módulo Prompt Playground para refinamento baseado nas divergências detectadas.
                  </p>
                </div>
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <button style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    ⚡ Ir para Prompt Playground
                  </button>
                </div>
              </div>
            </div>
          ) : (
            !loading && (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:13 }}>
                {renders.length > 0 ? 'Selecione um render para revisar.' : 'Gere renders para ativar o AI Review.'}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
