import { useState } from 'react'
import type { AIMemory, MemoryPreference } from '../../shared/platform-types'
import { T } from '../../shared/arqdor-theme'


const CAT_META: Record<string, { color: string; icon: string }> = {
  MATERIAL: { color:'168,85,247',  icon:'🎨' },
  HARDWARE: { color:'59,130,246',  icon:'🔩' },
  STYLE:    { color:'16,185,129',  icon:'✨' },
  LIGHTING: { color:'245,158,11',  icon:'💡' },
  CAMERA:   { color:'99,102,241',  icon:'📷' },
  OTHER:    { color:'156,163,175', icon:'📌' },
}

const MOCK_MEMORIES: AIMemory[] = [
  {
    id:'mem-001', ownerId:'studio-001', ownerType:'STUDIO', ownerName:'Estúdio Arq. Fontana',
    createdAt:'2026-01-15T00:00:00Z', updatedAt:'2026-07-01T00:00:00Z',
    preferences: [
      { id:'p1', category:'MATERIAL', key:'Madeira preferida',     value:'Freijó 15mm Duratex', confidence:0.97, usageCount:12 },
      { id:'p2', category:'HARDWARE', key:'Puxador padrão',         value:'Cava fresada 10mm — sem puxador aparente', confidence:0.99, usageCount:18 },
      { id:'p3', category:'LIGHTING', key:'Temperatura de cor',     value:'3000K — tom quente', confidence:0.95, usageCount:15 },
      { id:'p4', category:'STYLE',    key:'Estilo predominante',     value:'Contemporâneo Minimalista', confidence:0.92, usageCount:10 },
      { id:'p5', category:'CAMERA',   key:'Tipo de fotografia',      value:'Editorial — grandes angulares 24mm', confidence:0.88, usageCount:7 },
    ],
  },
  {
    id:'mem-002', ownerId:'client-001', ownerType:'CLIENT', ownerName:'Roberto Faria',
    createdAt:'2026-03-01T00:00:00Z', updatedAt:'2026-06-20T00:00:00Z',
    preferences: [
      { id:'p6', category:'STYLE',    key:'Estilo preferido',   value:'Luxo Contemporâneo', confidence:0.91, usageCount:5 },
      { id:'p7', category:'MATERIAL', key:'Pedra favorita',     value:'Silestone Calacatta Gold', confidence:0.89, usageCount:4 },
      { id:'p8', category:'OTHER',    key:'Restrição',          value:'Sem cores frias — apenas tons quentes e neutros', confidence:0.85, usageCount:3 },
    ],
  },
  {
    id:'mem-003', ownerId:'client-002', ownerType:'CLIENT', ownerName:'Marina Queiroz',
    createdAt:'2026-05-10T00:00:00Z', updatedAt:'2026-06-30T00:00:00Z',
    preferences: [
      { id:'p9',  category:'STYLE',    key:'Estilo',             value:'Japandi — fusão minimalista', confidence:0.93, usageCount:6 },
      { id:'p10', category:'MATERIAL', key:'Textura preferida',  value:'Linho e veludo em tons terrosos', confidence:0.87, usageCount:4 },
      { id:'p11', category:'LIGHTING', key:'Luz',                value:'Difusa — sem sombras duras', confidence:0.90, usageCount:5 },
    ],
  },
]

function ConfidenceBar({ value }: { value: number }) {
  const pct = value * 100
  const color = pct>=90 ? '#4ade80' : pct>=70 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, height:3, borderRadius:2, background:'rgba(255,255,255,0.08)' }}>
        <div style={{ height:'100%', width:`${pct}%`, borderRadius:2, background:color }}/>
      </div>
      <span style={{ fontSize:9, color, width:28, textAlign:'right' as const }}>{Math.round(pct)}%</span>
    </div>
  )
}

function PrefChip({ pref }: { pref: MemoryPreference }) {
  const meta = CAT_META[pref.category]
  return (
    <div style={{ borderRadius:8, border:`1px solid rgba(${meta.color},0.2)`, background:`rgba(${meta.color},0.05)`, padding:'8px 10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:9, fontWeight:700, color:`rgb(${meta.color})`, letterSpacing:'0.05em' }}>
          {meta.icon} {pref.category}
        </span>
        <span style={{ fontSize:9, color:T.dim }}>{pref.usageCount}×</span>
      </div>
      <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.75)' }}>{pref.key}</p>
      <p style={{ margin:'0 0 5px', fontSize:11, color:'#fff', fontStyle:'italic' }}>"{pref.value}"</p>
      <ConfidenceBar value={pref.confidence}/>
    </div>
  )
}

export function AIMemoryModule() {
  const [memories] = useState<AIMemory[]>(MOCK_MEMORIES)
  const [sel, setSel] = useState<string>(MOCK_MEMORIES[0].id)

  const selMem = memories.find(m => m.id===sel)!
  const typeColor = selMem.ownerType==='STUDIO' ? '#a78bfa' : '#4ade80'

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' as const, background:T.bg }}>
      <div style={{ padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ margin:'0 0 2px', fontSize:16, fontWeight:800, color:'#fff' }}>🧠 Memória IA</h2>
          <p style={{ margin:0, fontSize:11, color:T.dim }}>O sistema aprende preferências por estúdio e cliente</p>
        </div>
        <button style={{ padding:'5px 12px', borderRadius:6, border:'none', background:T.purple, color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700 }}>
          + Nova Memória
        </button>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Owner list */}
        <div style={{ width:240, flexShrink:0, borderRight:`1px solid ${T.border}`, overflowY:'auto' as const, padding:'10px 12px' }}>
          {memories.map(m => (
            <div key={m.id} onClick={()=>setSel(m.id)} style={{
              borderRadius:8, padding:'10px 12px', marginBottom:8, cursor:'pointer',
              background: sel===m.id ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sel===m.id ? 'rgba(124,58,237,0.35)' : T.border}`,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:18 }}>{m.ownerType==='STUDIO'?'🏢':'👤'}</span>
                <div>
                  <p style={{ margin:0, fontSize:11, fontWeight:700, color:'#fff' }}>{m.ownerName}</p>
                  <span style={{ fontSize:9, padding:'1px 6px', borderRadius:8,
                    background: m.ownerType==='STUDIO' ? 'rgba(167,139,250,0.15)' : 'rgba(74,222,128,0.1)',
                    color: m.ownerType==='STUDIO' ? '#a78bfa' : '#4ade80',
                  }}>{m.ownerType==='STUDIO'?'Estúdio':'Cliente'}</span>
                </div>
              </div>
              <p style={{ margin:0, fontSize:10, color:T.dim }}>{m.preferences.length} preferências · atualizado {new Date(m.updatedAt).toLocaleDateString('pt-BR')}</p>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex:1, overflowY:'auto' as const, padding:'16px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <span style={{ fontSize:28 }}>{selMem.ownerType==='STUDIO'?'🏢':'👤'}</span>
            <div>
              <h3 style={{ margin:'0 0 2px', fontSize:15, fontWeight:800, color:'#fff' }}>{selMem.ownerName}</h3>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10,
                  background: selMem.ownerType==='STUDIO' ? 'rgba(167,139,250,0.15)' : 'rgba(74,222,128,0.1)',
                  color: typeColor,
                }}>{selMem.ownerType==='STUDIO'?'Estúdio':'Cliente'}</span>
                <span style={{ fontSize:10, color:T.dim }}>{selMem.preferences.length} preferências aprendidas</span>
                <span style={{ fontSize:10, color:T.dim }}>· Atualizado {new Date(selMem.updatedAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
            {selMem.preferences.map(p => <PrefChip key={p.id} pref={p}/>)}
          </div>

          <div style={{ marginTop:20, padding:'12px 16px', borderRadius:8, background:'rgba(124,58,237,0.07)', border:`1px solid rgba(124,58,237,0.2)` }}>
            <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:T.purpleL, letterSpacing:'0.06em' }}>💡 COMO A MEMÓRIA FUNCIONA</p>
            <p style={{ margin:0, fontSize:11, color:T.dim, lineHeight:1.6 }}>
              A cada projeto finalizado, o sistema registra as preferências utilizadas e aumenta a confiança nos padrões repetidos.
              Na próxima vez que um projeto for criado para este {selMem.ownerType==='STUDIO'?'estúdio':'cliente'}, o DNA do projeto será pré-configurado automaticamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
