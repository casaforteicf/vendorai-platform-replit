import { useState } from 'react'
import type { RenderJob } from '../../shared/platform-types'

const T = {
  bg:'#0d0b1e', surface:'#13102b', card:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', purple:'#7c3aed', purpleL:'#a78bfa',
  text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

const MOCK_RENDERS: (RenderJob & { versionLabel: string; prompt: string })[] = [
  { id:'r-001', projectId:'proj-alpha', promptId:'p-001', status:'COMPLETED', score:91, createdAt:'2026-07-03T09:00:00Z', completedAt:'2026-07-03T09:04:22Z', corrections:[], version:2, versionLabel:'V2', prompt:'Photorealistic architectural render — cozinha contemporânea...' },
  { id:'r-002', projectId:'proj-alpha', promptId:'p-002', status:'COMPLETED', score:78, createdAt:'2026-07-02T14:30:00Z', completedAt:'2026-07-02T14:35:01Z', corrections:[{ id:'c1', area:'Puxador', issue:'Puxador substituído por cava', severity:'CRITICAL', originalPromptFragment:'puxador cava', correctedPromptFragment:'NO hardware — groove only', applied:false }], version:1, versionLabel:'V1', prompt:'Kitchen interior with oak cabinetry...' },
  { id:'r-003', projectId:'proj-alpha', promptId:'p-003', status:'GENERATING', createdAt:'2026-07-03T11:10:00Z', corrections:[], version:2, versionLabel:'V2', prompt:'[Aguardando envio para provedor...]' },
  { id:'r-004', projectId:'proj-alpha', promptId:'p-004', status:'FAILED',    createdAt:'2026-07-01T16:00:00Z', corrections:[], version:1, versionLabel:'V1', prompt:'Cozinha minimalista...' },
  { id:'r-005', projectId:'proj-alpha', promptId:'p-005', status:'COMPLETED', score:85, createdAt:'2026-06-30T10:00:00Z', completedAt:'2026-06-30T10:05:44Z', corrections:[], version:1, versionLabel:'V1', prompt:'Photorealistic contemporary kitchen...' },
]

const STATUS_META = {
  COMPLETED:  { color:'#4ade80', bg:'rgba(74,222,128,0.1)',  label:'Concluído'  },
  GENERATING: { color:'#fbbf24', bg:'rgba(251,191,36,0.1)', label:'Gerando…'   },
  PENDING:    { color:'#60a5fa', bg:'rgba(96,165,250,0.1)', label:'Pendente'   },
  REVIEWING:  { color:'#a78bfa', bg:'rgba(167,139,250,0.1)',label:'Revisando'  },
  FAILED:     { color:'#f87171', bg:'rgba(248,113,113,0.1)',label:'Falhou'     },
}

export function RenderHistoryModule() {
  const [filter, setFilter] = useState<'TODOS'|'COMPLETED'|'GENERATING'|'FAILED'>('TODOS')
  const [sel, setSel] = useState<string|null>('r-001')

  const filtered = MOCK_RENDERS.filter(r => filter==='TODOS' || r.status===filter)
  const selRender = MOCK_RENDERS.find(r => r.id===sel) ?? null

  const scoreColor = (s?: number) => !s ? T.dim : s>=85 ? '#4ade80' : s>=70 ? '#fbbf24' : '#f87171'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🎬 Histórico de Renders</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>{MOCK_RENDERS.length} renders · projeto Apartamento Alpha</p>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {(['TODOS','COMPLETED','GENERATING','FAILED'] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{
              padding:'4px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:10, fontWeight:700,
              background: filter===f ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
              color: filter===f ? T.purpleL : T.dim,
            }}>{f==='TODOS'?'Todos':STATUS_META[f].label}</button>
          ))}
        </div>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
          🎬 Novo Render
        </button>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* List */}
        <div style={{ width:340, flexShrink:0, borderRight:`1px solid ${T.border}`, overflowY:'auto' as const, padding:'10px 12px' }}>
          {filtered.map(r => {
            const sm = STATUS_META[r.status]
            const isSel = sel===r.id
            return (
              <div key={r.id} onClick={()=>setSel(r.id)} style={{
                borderRadius:8, padding:'12px', marginBottom:8, cursor:'pointer',
                background: isSel ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSel ? 'rgba(124,58,237,0.35)' : T.border}`,
              }}>
                {/* Thumbnail placeholder */}
                <div style={{ height:80, borderRadius:6, background:'rgba(255,255,255,0.04)', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${T.border}` }}>
                  {r.status==='GENERATING' ? (
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>⏳ Gerando…</p>
                  ) : r.status==='FAILED' ? (
                    <p style={{ margin:0, fontSize:10, color:'#f87171' }}>✗ Falhou</p>
                  ) : (
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>🎨 Imagem do render</p>
                  )}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <span style={{ fontSize:10, fontFamily:'ui-monospace,monospace', color:T.dim }}>{r.id}</span>
                  <span style={{ padding:'2px 7px', borderRadius:10, fontSize:9, fontWeight:700, background:sm.bg, color:sm.color }}>{sm.label}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, color:T.dim }}>{new Date(r.createdAt).toLocaleDateString('pt-BR')} · {r.versionLabel}</span>
                  {r.score && <span style={{ fontSize:13, fontWeight:800, color:scoreColor(r.score) }}>{r.score}/100</span>}
                </div>
                {r.corrections.length>0 && (
                  <div style={{ marginTop:6 }}>
                    <span style={{ fontSize:9, padding:'2px 6px', borderRadius:8, background:'rgba(248,113,113,0.1)', color:'#f87171' }}>
                      {r.corrections.length} correção(ões) pendente(s)
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Detail */}
        {selRender ? (
          <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <h3 style={{ margin:'0 0 4px', fontSize:15, fontWeight:800, color:'#fff' }}>Render {selRender.id}</h3>
                <p style={{ margin:0, fontSize:11, color:T.dim }}>{selRender.versionLabel} · {new Date(selRender.createdAt).toLocaleString('pt-BR')}</p>
              </div>
              {selRender.score && (
                <div style={{ textAlign:'center' as const }}>
                  <span style={{ fontSize:32, fontWeight:900, color:scoreColor(selRender.score) }}>{selRender.score}</span>
                  <p style={{ margin:0, fontSize:10, color:T.dim }}>/100</p>
                </div>
              )}
            </div>
            <div style={{ borderRadius:10, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, height:240, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
              <p style={{ color:T.dim, fontSize:12 }}>🎨 Thumbnail do render — disponível após geração real</p>
            </div>
            <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:8, padding:'12px' }}>
              <p style={{ margin:'0 0 6px', fontSize:10, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PROMPT UTILIZADO</p>
              <p style={{ margin:0, fontSize:11, color:T.text, lineHeight:1.6, fontFamily:'ui-monospace,monospace' }}>{selRender.prompt}</p>
            </div>
            {selRender.corrections.length>0 && (
              <div style={{ marginTop:16 }}>
                <p style={{ fontSize:10, fontWeight:700, color:'#f87171', letterSpacing:'0.06em', margin:'0 0 10px' }}>CORREÇÕES PENDENTES</p>
                {selRender.corrections.map(c => (
                  <div key={c.id} style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                    <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:'#f87171' }}>🔴 {c.area} — {c.issue}</p>
                    <p style={{ margin:0, fontSize:10, color:T.dim }}>Prompt corrigido: {c.correctedPromptFragment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:T.dim, fontSize:13 }}>
            Selecione um render para ver os detalhes.
          </div>
        )}
      </div>
    </div>
  )
}
