import { useState } from 'react'
import { MOCK_SPACE_TEMPLATES } from '../arqhub-mock-data'
import type { SpaceTemplate, SpaceType } from '../arqhub-types'
import { SPACE_TYPE_LABELS, SPACE_TYPE_ICONS } from '../arqhub-types'
import { T } from '../../shared/arqdor-theme'


const ALL_TYPES = [...new Set(MOCK_SPACE_TEMPLATES.map(s=>s.type))]

function SpaceCard({ s, selected, onSelect }: { s: SpaceTemplate; selected: boolean; onSelect: ()=>void }) {
  return (
    <div onClick={onSelect} style={{ cursor:'pointer', borderRadius:10, border:`1px solid ${selected?'rgba(124,58,237,0.5)':T.border}`, background:selected?'rgba(124,58,237,0.07)':T.surface, overflow:'hidden', transition:'border 0.15s' }}>
      <div style={{ height:72, background:'rgba(255,255,255,0.03)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, borderBottom:`1px solid ${T.border}` }}>
        {SPACE_TYPE_ICONS[s.type]}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <p style={{ margin:'0 0 2px', fontSize:11, fontWeight:700, color:'#fff', lineHeight:1.3 }}>{s.name}</p>
        <p style={{ margin:'0 0 6px', fontSize:9, color:T.dim }}>{SPACE_TYPE_LABELS[s.type]} · {s.style}</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.tags.slice(0,2).map(t=><span key={t} style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(124,58,237,0.1)', color:T.purpleL }}>#{t}</span>)}
          <span style={{ fontSize:8, padding:'2px 6px', borderRadius:5, background:'rgba(255,255,255,0.05)', color:T.dim }}>{s.visibility}</span>
        </div>
      </div>
    </div>
  )
}

function SpaceDetail({ s }: { s: SpaceTemplate }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(s.prompt); setCopied(true); setTimeout(()=>setCopied(false),2000) }

  return (
    <div style={{ height:'100%', overflowY:'auto' as const, padding:16 }}>
      <div style={{ height:80, borderRadius:8, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, marginBottom:14 }}>
        {SPACE_TYPE_ICONS[s.type]}
      </div>
      <p style={{ margin:'0 0 2px', fontSize:14, fontWeight:800, color:'#fff' }}>{s.name}</p>
      <p style={{ margin:'0 0 12px', fontSize:10, color:T.dim }}>{SPACE_TYPE_LABELS[s.type]} · {s.style} · por {s.author}</p>
      <p style={{ margin:'0 0 14px', fontSize:11, color:T.text, lineHeight:1.65 }}>{s.description}</p>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>OBJETOS</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.objects.map(o=><span key={o} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:T.text }}>{o}</span>)}
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>MATERIAIS</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.materials.map(m=><span key={m} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(124,58,237,0.08)', color:T.purpleL }}>{m}</span>)}
        </div>
      </div>

      <div style={{ marginBottom:12 }}>
        <p style={{ margin:'0 0 5px', fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>DESIGN INTENT</p>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
          {s.designIntent.map(d=><span key={d} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(167,139,250,0.1)', color:T.purpleL }}>{d}</span>)}
        </div>
      </div>

      <div style={{ padding:'10px 12px', borderRadius:7, background:'rgba(124,58,237,0.06)', border:'1px solid rgba(124,58,237,0.2)', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <p style={{ margin:0, fontSize:9, fontWeight:700, color:T.dim, letterSpacing:'0.06em' }}>PROMPT BASE</p>
          <button onClick={copy} style={{ padding:'2px 8px', borderRadius:5, border:`1px solid ${T.border}`, background:'transparent', color:copied?'#4ade80':T.dim, cursor:'pointer', fontSize:9 }}>{copied?'✓ Copiado':'📋'}</button>
        </div>
        <p style={{ margin:0, fontSize:10, color:T.text, lineHeight:1.6, fontFamily:'monospace' }}>{s.prompt}</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:12 }}>
        <div style={{ padding:'7px 9px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700 }}>PESO VISUAL</p>
          <p style={{ margin:0, fontSize:12, fontWeight:800, color:T.purpleL }}>{s.visualWeight}</p>
        </div>
        <div style={{ padding:'7px 9px', borderRadius:6, background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}` }}>
          <p style={{ margin:'0 0 2px', fontSize:8, color:T.dim, fontWeight:700 }}>VISIBILIDADE</p>
          <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#4ade80' }}>{s.visibility}</p>
        </div>
      </div>

      <button style={{ width:'100%', padding:'10px', borderRadius:8, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
        🏠 Usar como Template
      </button>
    </div>
  )
}

export function SpaceHubView() {
  const [type, setType] = useState<SpaceType|''>('')
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<SpaceTemplate|null>(MOCK_SPACE_TEMPLATES[0])

  const filtered = MOCK_SPACE_TEMPLATES.filter(s => {
    if (type && s.type !== type) return false
    if (query) { const q=query.toLowerCase(); return s.name.toLowerCase().includes(q)||s.tags.some(t=>t.includes(q)) }
    return true
  })

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', gap:8, alignItems:'center' }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ambiente…"
          style={{ flex:1, background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:T.text, fontSize:11, padding:'5px 10px', outline:'none' }}/>
        <select value={type} onChange={e=>setType(e.target.value as SpaceType|'')}
          style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${T.border}`, borderRadius:6, color:type?T.text:T.dim, fontSize:10, padding:'5px 8px', cursor:'pointer' }}>
          <option value=''>Todos os tipos</option>
          {ALL_TYPES.map(t=><option key={t} value={t}>{SPACE_TYPE_ICONS[t]} {SPACE_TYPE_LABELS[t]}</option>)}
        </select>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>+ Novo</button>
        <span style={{ fontSize:10, color:T.dim }}>{filtered.length} templates</span>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' as const, padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
            {filtered.map(s=><SpaceCard key={s.id} s={s} selected={sel?.id===s.id} onSelect={()=>setSel(s)}/>)}
            {filtered.length===0 && <p style={{ gridColumn:'1/-1', textAlign:'center' as const, color:T.dim, padding:40, fontSize:12 }}>Nenhum template encontrado.</p>}
          </div>
        </div>
        {sel && <div style={{ width:300, flexShrink:0, borderLeft:`1px solid ${T.border}` }}><SpaceDetail s={sel}/></div>}
      </div>
    </div>
  )
}
