import { useState } from 'react'
import { MOCK_HUB_STYLES } from '../arqhub-mock-data'
import type { HubStyle } from '../arqhub-types'

const T = {
  surface:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  purple:'#7c3aed', purpleL:'#a78bfa', text:'rgba(255,255,255,0.88)', dim:'rgba(255,255,255,0.44)',
} as const

function StyleCard({ s, selected, onSelect }: { s: HubStyle; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, overflow:'hidden', transition:'border 0.15s' }}>
      <div style={{ height:60, display:'flex' }}>
        {s.palette.map((c,i)=><div key={i} style={{ flex:1, background:c }}/>)}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:800, color:'#fff' }}>{s.label}</p>
        <p style={{ margin:'0 0 8px', fontSize:9, color:T.dim, lineHeight:1.5 }}>{s.atmosphere.substring(0,50)}…</p>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,0.08)' }}>
            <div style={{ height:'100%', width:`${s.visualWeight}%`, borderRadius:2, background:T.purpleL }}/>
          </div>
          <span style={{ fontSize:9, color:T.dim }}>VW {s.visualWeight}</span>
        </div>
      </div>
    </div>
  )
}

function StyleDetail({ s }: { s: HubStyle }) {
  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      {/* Palette */}
      <div style={{ height:80, display:'flex', borderRadius:8, overflow:'hidden', marginBottom:14, border:`1px solid ${T.border}` }}>
        {s.palette.map((c,i)=><div key={i} style={{ flex:1, background:c, position:'relative' as const }}>
          <span style={{ position:'absolute' as const, bottom:4, left:'50%', transform:'translateX(-50%)', fontSize:7, color:'rgba(255,255,255,0.6)', fontFamily:'monospace' }}>{c}</span>
        </div>)}
      </div>

      <p style={{ margin:'0 0 3px', fontSize:15, fontWeight:900, color:'#fff' }}>{s.label}</p>
      <p style={{ margin:'0 0 12px', fontSize:11, color:T.text, lineHeight:1.65 }}>{s.description}</p>

      {[
        ['💡 Iluminação', s.lighting],
        ['📷 Fotografia', s.photography],
        ['🌀 Atmosfera', s.atmosphere],
      ].map(([k,v])=>(
        <div key={k} style={{ padding:'8px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, marginBottom:8 }}>
          <p style={{ margin:'0 0 3px', fontSize:9, fontWeight:700, color:T.dim }}>{k}</p>
          <p style={{ margin:0, fontSize:10, color:T.text, lineHeight:1.6 }}>{v}</p>
        </div>
      ))}

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>MATERIAIS</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.materials.map(m=><span key={m} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(124,58,237,0.08)', color:T.purpleL }}>{m}</span>)}
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DECORAÇÃO</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.decoration.map(d=><span key={d} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(255,255,255,0.04)', color:T.text }}>{d}</span>)}
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESIGN INTENT</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.designIntent.map(d=><span key={d} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(167,139,250,0.1)', color:T.purpleL }}>{d}</span>)}
        </div>
      </div>

      <div style={{ marginBottom:14 }}>
        <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:'#f87171', letterSpacing:'0.06em' }}>RESTRIÇÕES</p>
        {s.restrictions.map(r=><p key={r} style={{ margin:'0 0 4px', fontSize:10, color:'#f87171' }}>✗ {r}</p>)}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <p style={{ margin:0, fontSize:9, color:T.dim }}>PESO VISUAL</p>
        <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)' }}>
          <div style={{ height:'100%', width:`${s.visualWeight}%`, borderRadius:3, background:T.purpleL }}/>
        </div>
        <span style={{ fontSize:11, fontWeight:800, color:T.purpleL }}>{s.visualWeight}</span>
      </div>

      <button style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
        🎨 Aplicar ao Projeto
      </button>
    </div>
  )
}

export function StyleHubView() {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<HubStyle|null>(MOCK_HUB_STYLES[0])

  const filtered = MOCK_HUB_STYLES.filter(s =>
    !query || s.label.toLowerCase().includes(query.toLowerCase()) ||
    s.designIntent.some(d=>d.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8 }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar estilo…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>+ Novo</button>
        <span style={{ fontSize:10, color:T.dim, alignSelf:'center' }}>{filtered.length} estilos</span>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map(s=><StyleCard key={s.id} s={s} selected={sel?.id===s.id} onSelect={()=>setSel(s)}/>)}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><StyleDetail s={sel}/></div>}
      </div>
    </div>
  )
}
