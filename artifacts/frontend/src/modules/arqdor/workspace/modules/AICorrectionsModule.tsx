import { useState } from 'react'
import type { CorrectionItem } from '../../shared/platform-types'

const T = {
  bg:'#0d0b1e', border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

const SEVERITY_META = {
  CRITICAL: { color:'#f87171', bg:'rgba(248,113,113,0.1)', icon:'🔴' },
  HIGH:     { color:'#fb923c', bg:'rgba(251,146,60,0.1)',  icon:'🟠' },
  MEDIUM:   { color:'#fbbf24', bg:'rgba(251,191,36,0.1)', icon:'🟡' },
  LOW:      { color:'#4ade80', bg:'rgba(74,222,128,0.1)', icon:'🟢' },
}

const MOCK_CORRECTIONS: CorrectionItem[] = [
  { id:'c1', area:'Marcenaria / Puxador', issue:'Puxador aparente em lugar de cava fresada', severity:'CRITICAL',
    originalPromptFragment:'hardware handles on cabinetry doors',
    correctedPromptFragment:'NO hardware — recessed groove pull (cava 10mm), completely flush and handleless, invisible integrated grip',
    applied:false },
  { id:'c2', area:'Bancada / Torneira', issue:'Torneira cromada genérica substituiu Deca Monocomando', severity:'HIGH',
    originalPromptFragment:'kitchen faucet chrome',
    correctedPromptFragment:'Deca single-lever mixer faucet in brushed stainless steel (escovado), high-arc spout, minimalist design',
    applied:false },
  { id:'c3', area:'Marcenaria / Portas', issue:'MDF branco em vez de Freijó amadeirado', severity:'CRITICAL',
    originalPromptFragment:'cabinetry white mdf',
    correctedPromptFragment:'Freijó wood-grain finish MDF, warm medium-brown natural wood texture, vertical grain pattern, satin finish',
    applied:false },
  { id:'c4', area:'Bancada / Silestone', issue:'Bancada sem veios dourados do Calacatta Gold', severity:'MEDIUM',
    originalPromptFragment:'white marble countertop',
    correctedPromptFragment:'Silestone Calacatta Gold — polished white stone with subtle golden veining, warm undertones, quartz surface',
    applied:false },
]

export function AICorrectionsModule() {
  const [corrections, setCorrections] = useState<CorrectionItem[]>(MOCK_CORRECTIONS)
  const [copied, setCopied] = useState<string|null>(null)
  const [generating, setGenerating] = useState(false)

  const apply  = (id: string) => setCorrections(prev => prev.map(c => c.id===id ? { ...c, applied:true } : c))
  const unapply = (id: string) => setCorrections(prev => prev.map(c => c.id===id ? { ...c, applied:false } : c))
  const copy   = (id: string, text: string) => { void navigator.clipboard.writeText(text); setCopied(id); setTimeout(()=>setCopied(null),1800) }

  const allApplied = corrections.every(c => c.applied)
  const critCount  = corrections.filter(c => c.severity==='CRITICAL' && !c.applied).length

  const buildCorrectionPrompt = () => {
    return corrections.filter(c => !c.applied).map(c => `// ${c.area} — ${c.issue}\n${c.correctedPromptFragment}`).join('\n\n')
  }

  const generateAll = () => {
    setGenerating(true); setTimeout(()=>setGenerating(false), 1400)
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      {/* Header */}
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🔄 AI Corrections</h2>
            <p style={{ margin:0, fontSize:11, color:T.dim }}>Prompts de correção gerados a partir do AI Review</p>
          </div>
          <button onClick={generateAll} disabled={generating} style={{
            padding:'5px 12px', borderRadius:6, border:'none', background:generating?'rgba(124,58,237,0.4)':T.purple,
            color:'#fff', cursor:generating?'not-allowed':'pointer', fontSize:11, fontWeight:700,
          }}>{generating?'⏳ Gerando…':'⚡ Gerar Correções'}</button>
          <button onClick={()=>copy('all',buildCorrectionPrompt())} style={{
            padding:'5px 12px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent',
            color:T.dim, cursor:'pointer', fontSize:11,
          }}>{copied==='all'?'✓ Copiado':'📋 Copiar Tudo'}</button>
        </div>
        {/* Status bar */}
        <div style={{ display:'flex', gap:12 }}>
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(248,113,113,0.1)', color:'#f87171' }}>
            🔴 {critCount} crítica(s)
          </span>
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background:'rgba(74,222,128,0.1)', color:'#4ade80' }}>
            ✓ {corrections.filter(c=>c.applied).length} aplicada(s)
          </span>
          <span style={{ fontSize:10, color:T.dim }}>{corrections.length} correções no total</span>
        </div>
      </div>

      {/* Corrections list */}
      <div style={{ flex:1, overflowY:'auto' as const, padding:'14px 20px', display:'flex', flexDirection:'column' as const, gap:10 }}>
        {corrections.map(c => {
          const sm = SEVERITY_META[c.severity]
          return (
            <div key={c.id} style={{
              borderRadius:10, border:`1px solid ${c.applied ? 'rgba(74,222,128,0.2)' : `rgba(255,255,255,0.07)`}`,
              background: c.applied ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
              overflow:'hidden',
            }}>
              {/* Item header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                <span style={{ padding:'2px 8px', borderRadius:4, fontSize:9, fontWeight:800, background:sm.bg, color:sm.color }}>
                  {sm.icon} {c.severity}
                </span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:c.applied?'rgba(255,255,255,0.4)':'#fff', textDecoration:c.applied?'line-through':'none' }}>
                    {c.area}
                  </p>
                  <p style={{ margin:0, fontSize:10, color:T.dim }}>{c.issue}</p>
                </div>
                {c.applied
                  ? <button onClick={()=>unapply(c.id)} style={{ padding:'3px 10px', borderRadius:6, border:`1px solid rgba(74,222,128,0.3)`, background:'transparent', color:'#4ade80', cursor:'pointer', fontSize:10 }}>Desfazer</button>
                  : <button onClick={()=>apply(c.id)}  style={{ padding:'3px 10px', borderRadius:6, border:'none', background:'rgba(74,222,128,0.15)', color:'#4ade80', cursor:'pointer', fontSize:10, fontWeight:700 }}>Aplicar</button>
                }
                <button onClick={()=>copy(c.id, c.correctedPromptFragment)} style={{
                  padding:'3px 10px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.dim, cursor:'pointer', fontSize:10,
                }}>{copied===c.id?'✓':'Copiar'}</button>
              </div>

              {/* Diff */}
              {!c.applied && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                  <div style={{ padding:'8px 14px', borderRight:`1px solid rgba(255,255,255,0.05)` }}>
                    <p style={{ margin:'0 0 3px', fontSize:8, fontWeight:700, color:'#f87171', letterSpacing:'0.06em' }}>ORIGINAL</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim, fontFamily:'ui-monospace,monospace', lineHeight:1.5 }}>{c.originalPromptFragment}</p>
                  </div>
                  <div style={{ padding:'8px 14px' }}>
                    <p style={{ margin:'0 0 3px', fontSize:8, fontWeight:700, color:'#4ade80', letterSpacing:'0.06em' }}>CORRIGIDO</p>
                    <p style={{ margin:0, fontSize:10, color:T.text, fontFamily:'ui-monospace,monospace', lineHeight:1.5 }}>{c.correctedPromptFragment}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {allApplied && (
          <div style={{ textAlign:'center' as const, padding:'40px 20px', color:'#4ade80' }}>
            <p style={{ margin:'0 0 6px', fontSize:24 }}>✅</p>
            <p style={{ margin:0, fontSize:14, fontWeight:700 }}>Todas as correções aplicadas</p>
            <p style={{ margin:'4px 0 0', fontSize:11, color:T.dim }}>Pronto para re-renderizar com os prompts corrigidos</p>
          </div>
        )}
      </div>
    </div>
  )
}
