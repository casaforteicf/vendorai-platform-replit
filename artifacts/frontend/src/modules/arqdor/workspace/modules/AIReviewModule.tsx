import { useState } from 'react'
import type { RenderReview, DifferenceItem } from '../../shared/platform-types'
import { T } from '../../shared/arqdor-theme'


const MOCK_REVIEW: RenderReview = {
  id:'rev-001', renderJobId:'r-001', projectId:'proj-alpha',
  geometryScore:95, materialScore:72, lightingScore:84,
  furnitureScore:91, cameraScore:100, overallScore:88,
  reviewedAt:'2026-07-03T09:10:00Z',
  differences: [
    { objectId:'coz-marc-inf-pux', objectName:'Puxador Cava', area:'Marcenaria', expected:'Cava fresada 10mm sem puxador aparente', rendered:'Puxador linear prateado aparente', matchPct:15 },
    { objectId:'coz-banc-torneira', objectName:'Torneira Deca', area:'Bancada', expected:'Deca Monocomando Escovado', rendered:'Torneira cromada genérica', matchPct:42 },
    { objectId:'coz-silestone', objectName:'Silestone Calacatta', area:'Bancada', expected:'Veios dourados discretos', rendered:'Mármore branco sem veios', matchPct:61 },
    { objectId:'coz-marc-port',  objectName:'Portas Superiores', area:'Marcenaria', expected:'Freijó tom médio amadeirado', rendered:'MDF branco liso', matchPct:10 },
  ],
}

const SCORE_DIMS = [
  { key:'geometryScore' as const,  label:'Geometria',  icon:'📐' },
  { key:'materialScore' as const,  label:'Materiais',  icon:'🎨' },
  { key:'lightingScore' as const,  label:'Iluminação', icon:'💡' },
  { key:'furnitureScore' as const, label:'Mobiliário',  icon:'🛋️' },
  { key:'cameraScore' as const,    label:'Câmera',     icon:'📷' },
]

const matchColor = (pct: number) => pct>=70 ? '#4ade80' : pct>=40 ? '#fbbf24' : '#f87171'
const scoreColor = (s: number)   => s>=85   ? '#4ade80' : s>=70   ? '#fbbf24' : '#f87171'

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

function DiffRow({ d }: { d: DifferenceItem }) {
  const c = matchColor(d.matchPct)
  return (
    <div style={{ borderRadius:8, border:`1px solid rgba(255,255,255,0.06)`, background:'rgba(255,255,255,0.02)', padding:'10px 14px', marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>{d.objectName}</span>
          <span style={{ fontSize:10, color:T.dim, marginLeft:8 }}>{d.area}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, fontWeight:800, color:c }}>{d.matchPct}%</span>
          <div style={{ width:48, height:5, borderRadius:2, background:'rgba(255,255,255,0.08)' }}>
            <div style={{ height:'100%', width:`${d.matchPct}%`, borderRadius:2, background:c }}/>
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <div style={{ background:'rgba(74,222,128,0.05)', border:'1px solid rgba(74,222,128,0.15)', borderRadius:6, padding:'6px 8px' }}>
          <p style={{ margin:'0 0 2px', fontSize:8, fontWeight:700, color:'#4ade80', letterSpacing:'0.06em' }}>ESPERADO</p>
          <p style={{ margin:0, fontSize:10, color:T.text }}>{d.expected}</p>
        </div>
        <div style={{ background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:6, padding:'6px 8px' }}>
          <p style={{ margin:'0 0 2px', fontSize:8, fontWeight:700, color:'#f87171', letterSpacing:'0.06em' }}>RENDERIZADO</p>
          <p style={{ margin:0, fontSize:10, color:T.text }}>{d.rendered}</p>
        </div>
      </div>
    </div>
  )
}

export function AIReviewModule() {
  const [running, setRunning] = useState(false)
  const [review, setReview]  = useState<RenderReview|null>(MOCK_REVIEW)

  const runReview = () => {
    setRunning(true); setReview(null)
    setTimeout(()=>{ setRunning(false); setReview(MOCK_REVIEW) }, 2200)
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🔍 AI Review</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>Comparação entre modelo do projeto e resultado renderizado</p>
        </div>
        <button onClick={runReview} disabled={running} style={{
          padding:'5px 14px', borderRadius:6, border:'none', background: running ? 'rgba(124,58,237,0.4)' : T.purple,
          color:'#fff', cursor: running ? 'not-allowed' : 'pointer', fontSize:11, fontWeight:700,
        }}>{running ? '⏳ Analisando…' : '🔍 Executar Review'}</button>
      </div>

      {running && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:'50%', border:`3px solid rgba(124,58,237,0.2)`, borderTop:`3px solid ${T.purple}`,
            animation:'spin 1s linear infinite' }}/>
          <p style={{ color:T.dim, fontSize:12 }}>Analisando render vs. modelo do projeto…</p>
        </div>
      )}

      {!running && review && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* Left: Score panel */}
          <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${T.border}`, padding:'16px', overflowY:'auto' as const }}>
            <div style={{ textAlign:'center' as const, marginBottom:20, padding:'20px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:`1px solid ${T.border}` }}>
              <p style={{ margin:'0 0 4px', fontSize:10, color:T.dim, letterSpacing:'0.08em' }}>SCORE GERAL</p>
              <span style={{ fontSize:44, fontWeight:900, color:scoreColor(review.overallScore) }}>{review.overallScore}</span>
              <p style={{ margin:0, fontSize:11, color:T.dim }}>/100</p>
            </div>
            {SCORE_DIMS.map(d => <ScoreBar key={d.key} label={d.label} icon={d.icon} value={review[d.key]}/>)}
            <div style={{ marginTop:16, padding:'12px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:`1px solid ${T.border}` }}>
              <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>RESUMO</p>
              <p style={{ margin:0, fontSize:10, color:T.dim, lineHeight:1.6 }}>
                {review.differences.length} divergências detectadas.<br/>
                {review.differences.filter(d=>d.matchPct<40).length} críticas precisam de correção imediata.
              </p>
            </div>
          </div>

          {/* Right: Differences */}
          <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
            <p style={{ margin:'0 0 12px', fontSize:10, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>
              {review.differences.length} DIVERGÊNCIAS DETECTADAS
            </p>
            {review.differences.map(d => <DiffRow key={d.objectId} d={d}/>)}
            <div style={{ marginTop:16, display:'flex', gap:8 }}>
              <button style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                ⚡ Gerar Prompts de Correção
              </button>
              <button style={{ padding:'10px 16px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:12 }}>
                💾 Salvar Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
